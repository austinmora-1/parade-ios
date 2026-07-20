// confirm-account-claim — step 2 of the account-linking / legacy-account
// reclaim flow.
//
// The signed-in account (B, proven by JWT) submits the 6-digit code that was
// emailed to the legacy account (A) in request-account-claim. If the code
// matches the stored challenge, A is merged INTO B via merge_account(A, B) and
// the returned counts summary is passed back so the client can say
// "restored N friends and M plans".
//
// Security properties:
//   • A (the account being merged/deleted) is taken ONLY from the stored
//     challenge row — never from client input. The client can't point the
//     merge at an arbitrary account.
//   • The code is compared as sha-256(`${code}:${A}`) against the stored hash
//     using a constant-time comparison.
//   • Challenges expire after 10 min and allow at most 5 attempts.
//   • The challenge is consumed before the merge runs, so a code can never be
//     replayed.
//
// Auth: caller JWT required -> user B (401 if absent).
// Body: { email: string, code: string }
// Env — auto-injected in the Supabase edge runtime:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deno runtime. Not type-checked by the app's tsconfig (see exclude).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_ATTEMPTS = 5;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Lowercase hex sha-256 of a string (Web Crypto). */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string comparison (both inputs are fixed-length hex hashes). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

interface RequestBody {
  email?: string;
  code?: string;
}

interface Challenge {
  id: string;
  target_user_id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Supabase env not configured' }, 500);
  }

  // Identify the caller (B) from their JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const code = (payload.code ?? '').trim();
  if (!email) return json({ error: 'email is required' }, 400);
  if (!code) return json({ error: 'code is required' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // Load B's latest unconsumed challenge for this email.
  const { data: challenge, error: loadErr } = await admin
    .from('account_claim_challenges')
    .select('id, target_user_id, code_hash, expires_at, attempts')
    .eq('requester_id', user.id)
    .eq('target_email', email)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Challenge>();

  if (loadErr) {
    console.error('challenge load failed:', loadErr.message);
    return json({ error: 'Failed to load challenge' }, 500);
  }
  if (!challenge) return json({ ok: false, error: 'no_challenge' });

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: 'expired' });
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    return json({ ok: false, error: 'too_many_attempts' });
  }

  // Constant-time verify. A comes only from the stored challenge row.
  const expectedHash = await sha256Hex(`${code}:${challenge.target_user_id}`);
  if (!timingSafeEqual(expectedHash, challenge.code_hash)) {
    const newAttempts = challenge.attempts + 1;
    const { error: attErr } = await admin
      .from('account_claim_challenges')
      .update({ attempts: newAttempts })
      .eq('id', challenge.id);
    if (attErr) console.error('attempts increment failed:', attErr.message);
    return json({
      ok: false,
      error: 'invalid_code',
      attempts_left: Math.max(0, MAX_ATTEMPTS - newAttempts),
    });
  }

  // Match. Re-verify — at confirm time — that the target is still a claimable
  // DORMANT legacy account (not merely that it exists). An account that became
  // active during the 10-min window must never be merged/deleted. This returns
  // the id only for a dormant legacy email account matching this email that is
  // not B; anything else (null / mismatch) blocks the merge. Defense in depth:
  // the id still comes only from the stored challenge, never client input.
  const { data: claimable, error: claimErr } = await admin.rpc(
    'find_claimable_account',
    { p_email: email, p_requester: user.id },
  );
  if (claimErr || claimable !== challenge.target_user_id) {
    console.error(
      'claim target no longer claimable:',
      claimErr?.message ?? `resolved=${claimable ?? 'null'}`,
    );
    return json({ ok: false, error: 'invalid_target' });
  }

  // Consume the challenge before merging so the code can't be replayed. The
  // conditional (consumed_at IS NULL) + row-count check makes this atomic: two
  // concurrent valid submissions cannot both proceed to the merge.
  const { data: consumed, error: consumeErr } = await admin
    .from('account_claim_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challenge.id)
    .is('consumed_at', null)
    .select('id');
  if (consumeErr) {
    console.error('challenge consume failed:', consumeErr.message);
    return json({ error: 'Failed to consume challenge' }, 500);
  }
  if (!consumed || consumed.length === 0) {
    // A concurrent request already consumed this challenge.
    return json({ ok: false, error: 'already_consumed' });
  }

  // Merge A -> B atomically via the SECURITY DEFINER function (service-role
  // only). It logs the merge and returns a jsonb counts summary.
  const { data: merged, error: mergeErr } = await admin.rpc('merge_account', {
    merge_from: challenge.target_user_id,
    merge_into: user.id,
  });
  if (mergeErr) {
    console.error('merge_account failed:', mergeErr.message);
    return json({ ok: false, error: 'merge_failed' }, 500);
  }

  // The legacy account (and its email) is now deleted, so the proven email is
  // free. Attach it to B — that was the original intent (the user hit "email
  // already registered" trying to add it) and they've now proven ownership via
  // the OTP. Best-effort: the merge already succeeded, so a failure here is
  // non-fatal and the email can still be added manually in Settings.
  const { error: emailErr } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
  });
  if (emailErr) {
    console.error('attach email to B failed (non-fatal):', emailErr.message);
  }

  return json({ ok: true, merged, email_attached: !emailErr });
});
