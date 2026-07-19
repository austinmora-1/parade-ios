#!/usr/bin/env node
/**
 * test-seed.mjs — deterministic fixture setup/reset for E2E tests.
 *
 *   node scripts/test-seed.mjs reset [--go]
 *   node scripts/test-seed.mjs seed  [--go]
 *   node scripts/test-seed.mjs reset --go && node scripts/test-seed.mjs seed --go
 *
 * ⚠️  THIS SCRIPT TALKS TO THE **PRODUCTION** SUPABASE PROJECT.
 *     Parade has no staging project, so the ONLY thing standing between this
 *     script and real user data is the fixture-account allowlist below. Every
 *     destructive operation is scoped to UUIDs that were resolved from a phone
 *     number in TEST_PHONES *and re-verified* against that set. If a resolved
 *     account's phone is not a test phone, the script aborts.
 *
 *   Safety layers:
 *     1. Requires SUPABASE_SERVICE_ROLE_KEY (never commit it; export at runtime).
 *     2. Dry-run by DEFAULT — prints what it would touch. Pass --go to execute.
 *     3. Only operates on accounts whose phone ∈ TEST_PHONES.
 *     4. Never deletes auth accounts; only their app data rows.
 *
 * Prereqs (see docs/E2E_SETUP.md):
 *     - Register the 4 test phone numbers with static OTPs in Supabase Auth.
 *     - Sign each fixture account in once (via the app or admin API) so the
 *       auth user + profile row exist. Then this script can resolve them.
 *     - export SUPABASE_SERVICE_ROLE_KEY=...   (from Supabase dashboard → API)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── env (.env then .env.local, .env.local wins) ─────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}
const env = {
  ...loadEnvFile(resolve(__dirname, '..', '.env')),
  ...loadEnvFile(resolve(__dirname, '..', '.env.local')),
  ...process.env,
};

const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL) die('Missing EXPO_PUBLIC_SUPABASE_URL (.env).');
if (!SERVICE_KEY) {
  die(
    'Missing SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  This script needs the service-role key to bypass RLS for seed/reset.\n' +
      '  Get it from Supabase dashboard → Project Settings → API → service_role.\n' +
      '  Run:  export SUPABASE_SERVICE_ROLE_KEY=...   (do NOT commit it)',
  );
}

// ── fixture allowlist — the ONLY accounts this script may touch ──────────────
// Phones must match the static-OTP test numbers registered in Supabase Auth.
// (Supabase stores auth.users.phone without the leading '+', digits only.)
const TEST_PHONES = {
  '+15005550001': { key: 'olivia', name: 'Olivia', role: 'organizer' },
  '+15005550002': { key: 'ravi', name: 'Ravi', role: 'responder' },
  '+15005550003': { key: 'nora', name: 'Nora', role: 'new-user' },
  '+15005550004': { key: 'liam', name: 'Liam', role: 'lurker' },
};
const TEST_PHONE_DIGITS = new Set(Object.keys(TEST_PHONES).map((p) => p.replace(/\D/g, '')));

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GO = process.argv.includes('--go');
const CMD = process.argv[2];

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
function log(...a) {
  console.log(...a);
}

// ── resolve fixture UUIDs from phones (paginated admin listUsers) ────────────
async function resolveFixtures() {
  const byKey = {};
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) die(`admin.listUsers failed: ${error.message}`);
    for (const u of data.users) {
      const digits = (u.phone || '').replace(/\D/g, '');
      if (TEST_PHONE_DIGITS.has(digits)) {
        const meta = TEST_PHONES['+' + digits];
        byKey[meta.key] = { id: u.id, phone: '+' + digits, ...meta };
      }
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  // Defense-in-depth: re-verify every resolved id maps to a test phone.
  for (const f of Object.values(byKey)) {
    if (!TEST_PHONE_DIGITS.has(f.phone.replace(/\D/g, ''))) {
      die(`SAFETY ABORT: resolved account ${f.id} is not a test phone.`);
    }
  }
  return byKey;
}

// ── scoped delete helpers (respect dry-run) ─────────────────────────────────
async function countIn(table, col, ids) {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).in(col, ids);
  return count ?? 0;
}
async function delIn(table, col, ids) {
  if (!ids.length) return;
  const n = await countIn(table, col, ids).catch(() => '?');
  if (!GO) {
    log(`   [dry] would delete ${n} from ${table} where ${col} ∈ fixtures`);
    return;
  }
  const { error } = await supabase.from(table).delete().in(col, ids);
  log(error ? `   ⚠️  ${table}.${col}: ${error.message}` : `   ✓ deleted ${n} from ${table}.${col}`);
}
async function ownedIds(table, ownerCol, ownerIds, idCol = 'id') {
  const { data, error } = await supabase.from(table).select(idCol).in(ownerCol, ownerIds);
  if (error) {
    log(`   ⚠️  fetch ${table}.${ownerCol}: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => r[idCol]);
}

// ── RESET ───────────────────────────────────────────────────────────────────
async function reset(fx) {
  const ids = Object.values(fx).map((f) => f.id);
  log(`\n🧹 reset ${GO ? '(LIVE)' : '(dry-run — pass --go to execute)'} for: ${labels(fx)}\n`);

  // Plans owned by fixtures → delete children first, then plans.
  const planIds = await ownedIds('plans', 'user_id', ids);
  if (planIds.length) {
    for (const child of [
      ['plan_participants', 'plan_id'],
      ['plan_invites', 'plan_id'],
      ['plan_comments', 'plan_id'],
      ['plan_change_requests', 'plan_id'],
      ['plan_proposal_options', 'plan_id'],
      ['plan_proposal_votes', 'plan_id'],
      ['plan_photos', 'plan_id'],
      ['plan_participant_requests', 'plan_id'],
    ]) {
      await delIn(child[0], child[1], planIds);
    }
  }
  // Rows where a fixture is a participant/commenter on someone else's plan.
  await delIn('plan_participants', 'friend_id', ids);
  await delIn('plan_comments', 'user_id', ids);
  await delIn('plans', 'user_id', ids);

  // Trips owned by fixtures → children then trips.
  const tripIds = await ownedIds('trips', 'user_id', ids);
  if (tripIds.length) {
    await delIn('trip_participants', 'trip_id', tripIds);
    await delIn('trip_activity_suggestions', 'trip_id', tripIds);
    await delIn('trip_activity_votes', 'trip_id', tripIds);
  }
  await delIn('trip_participants', 'user_id', ids);
  await delIn('trips', 'user_id', ids);

  // Open invites owned by fixtures → responses then invites.
  const openIds = await ownedIds('open_invites', 'user_id', ids);
  if (openIds.length) await delIn('open_invite_responses', 'open_invite_id', openIds);
  await delIn('open_invite_responses', 'user_id', ids);
  await delIn('open_invites', 'user_id', ids);

  // Pods owned by fixtures → members then pods.
  const podIds = await ownedIds('pods', 'user_id', ids);
  if (podIds.length) await delIn('pod_members', 'pod_id', podIds);
  await delIn('pod_members', 'user_id', ids);
  await delIn('pods', 'user_id', ids);

  // Standalone social rows.
  await delIn('hang_requests', 'sender_id', ids);
  await delIn('hang_requests', 'user_id', ids);
  await delIn('friendships', 'user_id', ids);
  await delIn('friendships', 'friend_id', ids);
  await delIn('trip_proposal_participants', 'user_id', ids);
  await delIn('weekly_intentions', 'user_id', ids);
  await delIn('notifications', 'user_id', ids);

  // Availability → reset to all-free/home for a ±90d window (don't delete the
  // seeded rows; just neutralize any test mutations).
  await resetAvailability(ids);

  // Nora only: flip back to pre-onboarding.
  if (fx.nora) {
    if (!GO) log(`   [dry] would set profiles.onboarding_completed=false for Nora`);
    else {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: false })
        .eq('user_id', fx.nora.id);
      log(error ? `   ⚠️  nora onboarding reset: ${error.message}` : `   ✓ Nora onboarding_completed=false`);
    }
  }
  log(`\n${GO ? '✅ reset complete.' : 'ℹ️  dry-run only. Re-run with --go to apply.'}\n`);
}

async function resetAvailability(ids) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const from = new Date(today); from.setDate(from.getDate() - 90);
  const to = new Date(today); to.setDate(to.getDate() + 90);
  if (!GO) {
    log(`   [dry] would reset availability (all slots free, home) ${iso(from)}..${iso(to)} for fixtures`);
    return;
  }
  const { error } = await supabase
    .from('availability')
    .update({
      early_morning: true, late_morning: true, early_afternoon: true,
      late_afternoon: true, evening: true, late_night: true,
      location_status: 'home', trip_location: null, trip_id: null,
    })
    .in('user_id', ids)
    .gte('date', iso(from))
    .lte('date', iso(to));
  log(error ? `   ⚠️  availability reset: ${error.message}` : `   ✓ availability reset for fixtures`);
}

// ── SEED (standing fixture world) ───────────────────────────────────────────
async function seed(fx) {
  log(`\n🌱 seed ${GO ? '(LIVE)' : '(dry-run)'} for: ${labels(fx)}\n`);
  const need = ['olivia', 'ravi'];
  for (const k of need) if (!fx[k]) die(`seed needs fixture "${k}" to exist — create + sign in that account first.`);

  // Olivia ↔ Ravi friendship (connected, both directions).
  await upsert('friendships',
    [
      { user_id: fx.olivia.id, friend_id: fx.ravi.id, status: 'connected' },
      { user_id: fx.ravi.id, friend_id: fx.olivia.id, status: 'connected' },
    ],
    'user_id,friend_id',
  );

  // Ravi free next Saturday afternoon (known window for overlap tests).
  const sat = nextSaturdayISO();
  await upsert('availability',
    [{
      user_id: fx.ravi.id, date: sat,
      early_morning: false, late_morning: false, early_afternoon: true,
      late_afternoon: true, evening: true, late_night: false,
      location_status: 'home',
    }],
    'user_id,date',
  );

  // Liam → Olivia pending friend request (for the incoming-request flow).
  if (fx.liam) {
    await upsert('friendships',
      [{ user_id: fx.liam.id, friend_id: fx.olivia.id, status: 'pending' }],
      'user_id,friend_id',
    );
  }

  log(`\n${GO ? '✅ seed complete.' : 'ℹ️  dry-run only. Re-run with --go to apply.'}\n`);
  log('   NOTE: extend seed() with the plan/trip fixtures your journeys need.');
}

async function upsert(table, rows, onConflict) {
  if (!GO) {
    log(`   [dry] would upsert ${rows.length} into ${table} (onConflict: ${onConflict})`);
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  log(error ? `   ⚠️  ${table}: ${error.message}` : `   ✓ upserted ${rows.length} into ${table}`);
}

// ── helpers ─────────────────────────────────────────────────────────────────
function labels(fx) {
  return Object.values(fx).map((f) => `${f.name}(${f.id.slice(0, 8)})`).join(', ') || '(none found)';
}
function nextSaturdayISO() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

// ── main ────────────────────────────────────────────────────────────────────
if (!['reset', 'seed'].includes(CMD)) {
  die('Usage: node scripts/test-seed.mjs <reset|seed> [--go]');
}
const fx = await resolveFixtures();
if (!Object.keys(fx).length) {
  die(
    'No fixture accounts found. Create the test accounts first:\n' +
      '  1. Register test phone numbers (static OTP) in Supabase Auth.\n' +
      '  2. Sign in each fixture once so the auth user + profile exist.\n' +
      `  Expected phones: ${Object.keys(TEST_PHONES).join(', ')}`,
  );
}
log(`\n🔑 Target: ${URL}`);
log(`👥 Fixtures resolved: ${labels(fx)}`);
if (CMD === 'reset') await reset(fx);
else await seed(fx);
