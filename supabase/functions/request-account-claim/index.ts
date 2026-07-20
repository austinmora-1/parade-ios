// request-account-claim — step 1 of the account-linking / legacy-account
// reclaim flow.
//
// The signed-in account (B, proven by JWT — a phone/apple account) asks to
// claim an OLD dormant legacy *email* account (A) so it can be merged into B.
// This function verifies that a claimable legacy account for the given email
// actually exists, and if so emails a 6-digit confirmation code to that
// account's address. The merge itself only happens in confirm-account-claim
// once the caller proves they control A's inbox by returning the code.
//
// Security / privacy properties:
//   • A is resolved ONLY server-side via find_claimable_account(email, B.id),
//     which returns a user id only for a dormant legacy email account (an
//     auth.users row with a matching email, id <> B, and NO auth.identities
//     row). An active phone/apple account can never be targeted.
//   • The response is ALWAYS { ok:true } whether or not a claimable account
//     existed — the caller (and any attacker) can't enumerate which emails map
//     to real dormant accounts.
//   • The 6-digit code is never stored; only sha-256(`${code}:${A}`) is.
//   • Requests are rate-limited to 5 / hour per requester via rate_limit_log.
//
// Auth: caller JWT required -> user B (401 if absent).
// Body: { email: string }
// Env — auto-injected in the Supabase edge runtime:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Secret: RESEND_API_KEY.
//
// Deno runtime. Not type-checked by the app's tsconfig (see exclude).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Verified transactional sender (Resend domain notify.helloparade.app —
// see the PWA auth-email-hook). OTP codes are transactional, so they go from
// the notify subdomain rather than the marketing hello@ address.
const CLAIM_FROM = 'Parade <noreply@notify.helloparade.app>';
const CLAIM_REPLY_TO = 'hello@helloparade.app';

// Rate limit: max 5 requests per hour per requester.
const RATE_ACTION = 'account_claim_request';
const RATE_MAX = 5;
const RATE_WINDOW_SECONDS = 3600;

// Per-target throttle (across ALL requesters), keyed on the legacy email. Caps
// how fast one inbox can be emailed and stops an attacker resetting the confirm
// attempt cap by minting fresh codes.
const TARGET_COOLDOWN_SECONDS = 60; // min gap between codes to one inbox
const TARGET_HOURLY_MAX = 5; // max codes to one inbox per hour

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

/** Cryptographically-random, zero-padded 6-digit code ("000000"–"999999"). */
function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

interface RequestBody {
  email?: string;
}

/**
 * Email the 6-digit code to the legacy account's address via Resend. Failures
 * are logged but never surfaced — the caller always gets { ok:true }.
 */
async function sendClaimCodeEmail(to: string, code: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured; cannot send claim code');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: CLAIM_FROM,
        reply_to: CLAIM_REPLY_TO,
        to: [to],
        subject: `${code} is your Parade verification code`,
        headers: {
          'X-Entity-Ref-ID': crypto.randomUUID(),
        },
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="color-scheme" content="light">
            <meta name="supported-color-schemes" content="light">
            <title>Your Parade verification code</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff; -webkit-font-smoothing: antialiased;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
                    <tr>
                      <td style="padding: 36px 32px 8px; background-color: #ffffff;">
                        <p style="margin: 0 0 16px; font-size: 16px; color: #18181b; line-height: 1.7;">
                          Someone is trying to restore access to your Parade account.
                        </p>
                        <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.7;">
                          Enter this code to confirm it's you:
                        </p>
                        <div style="text-align: center; padding: 8px 0 24px;">
                          <span style="display: inline-block; font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #111E16; background-color: #eafaf1; border-radius: 12px; padding: 16px 24px;">
                            ${code}
                          </span>
                        </div>
                        <p style="margin: 0 0 20px; font-size: 14px; color: #71717a; line-height: 1.6;">
                          This code expires in 10 minutes. If you didn't request this, you can safely ignore this email — no changes will be made to your account.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 20px 32px 28px; text-align: center; border-top: 1px solid #f4f4f5;">
                        <p style="margin: 0; font-size: 12px;">
                          <a href="https://helloparade.app" style="color: #a1a1aa; text-decoration: none;">helloparade.app</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
        text:
          `Someone is trying to restore access to your Parade account.\n\n` +
          `Enter this code to confirm it's you: ${code}\n\n` +
          `This code expires in 10 minutes. If you didn't request this, you can safely ignore this email — no changes will be made to your account.\n\n` +
          `helloparade.app`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend send failed:', res.status, detail);
    }
  } catch (e) {
    console.error('Resend request threw:', e);
  }
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
  if (!email) return json({ error: 'email is required' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // Resolve the claimable legacy account (A) server-side only. Returns a user
  // id for a dormant legacy email account, or null — never an active account.
  let targetUserId: string | null = null;
  const { data: claimable, error: rpcErr } = await admin.rpc(
    'find_claimable_account',
    { p_email: email, p_requester: user.id },
  );
  if (rpcErr) {
    console.error('find_claimable_account failed:', rpcErr.message);
  } else if (typeof claimable === 'string' && claimable) {
    targetUserId = claimable;
  }

  // Rate limit per requester (counts + bounds regardless of whether A existed,
  // so it also caps enumeration attempts). Over the limit -> 429.
  const windowStart = new Date(
    Date.now() - RATE_WINDOW_SECONDS * 1000,
  ).toISOString();
  const { count } = await admin
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('action', RATE_ACTION)
    .gte('created_at', windowStart);
  if ((count ?? 0) >= RATE_MAX) {
    return json({ ok: false, error: 'rate_limited' }, 429);
  }
  const { error: rlErr } = await admin
    .from('rate_limit_log')
    .insert({ user_id: user.id, action: RATE_ACTION });
  if (rlErr) console.error('rate_limit_log insert failed:', rlErr.message);

  // Only if a claimable legacy account exists do we mint + email a code.
  if (targetUserId) {
    // Per-target throttle: protect the legacy account's inbox from bombing and
    // stop an attacker from resetting the confirm attempt cap by minting fresh
    // codes. Keyed on the target email across ALL requesters. Stays
    // enumeration-safe (still returns ok:true) — we just don't send.
    const targetWindowStart = new Date(
      Date.now() - RATE_WINDOW_SECONDS * 1000,
    ).toISOString();
    const { data: recentToTarget } = await admin
      .from('account_claim_challenges')
      .select('created_at')
      .eq('target_email', email)
      .gte('created_at', targetWindowStart)
      .order('created_at', { ascending: false });
    const sentToTarget = recentToTarget?.length ?? 0;
    const lastSentAt = recentToTarget?.[0]?.created_at
      ? new Date(recentToTarget[0].created_at).getTime()
      : 0;
    const cooling =
      lastSentAt > 0 &&
      Date.now() - lastSentAt < TARGET_COOLDOWN_SECONDS * 1000;
    if (sentToTarget >= TARGET_HOURLY_MAX || cooling) {
      return json({ ok: true }); // silently throttled — inbox protection
    }

    // Canonical address for the target account (falls back to the input email).
    let toEmail = email;
    const { data: targetData, error: getErr } =
      await admin.auth.admin.getUserById(targetUserId);
    if (!getErr && targetData?.user?.email) toEmail = targetData.user.email;

    const code = generateCode();
    const codeHash = await sha256Hex(`${code}:${targetUserId}`);

    // Invalidate B's prior unconsumed challenges for this email.
    const nowIso = new Date().toISOString();
    await admin
      .from('account_claim_challenges')
      .update({ consumed_at: nowIso })
      .eq('requester_id', user.id)
      .eq('target_email', email)
      .is('consumed_at', null);

    const { error: insErr } = await admin
      .from('account_claim_challenges')
      .insert({
        requester_id: user.id,
        target_email: email,
        target_user_id: targetUserId,
        code_hash: codeHash,
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      });

    if (insErr) {
      console.error('challenge insert failed:', insErr.message);
    } else {
      await sendClaimCodeEmail(toEmail, code);
    }
  }

  // Enumeration-safe: always the same response shape whether or not A existed.
  return json({ ok: true });
});
