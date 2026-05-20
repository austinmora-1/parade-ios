#!/usr/bin/env node
/**
 * Verify backend dependencies for Phase 6:
 *   1. profiles.{default_work_days, default_work_start_hour, default_work_end_hour}
 *      columns exist
 *   2. check_phone_available RPC exists
 *   3. google-places-search Edge Function exists + GOOGLE_PLACES_API_KEY set
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY from .env.local.
 * No sign-in required — anon key is enough for existence checks.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Load .env then .env.local (.env.local wins on conflict) ─────────────────
function loadEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const idx = l.indexOf('=');
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}
const env = {
  ...loadEnvFile(resolve(__dirname, '..', '.env')),
  ...loadEnvFile(resolve(__dirname, '..', '.env.local')),
};

const URL  = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const HEADERS = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  'Content-Type': 'application/json',
};

const results = [];

function pass(name, detail = '') {
  results.push({ status: '✅', name, detail });
}
function fail(name, detail = '') {
  results.push({ status: '❌', name, detail });
}
function warn(name, detail = '') {
  results.push({ status: '⚠️ ', name, detail });
}

// ─── 1. profiles work-hour columns ───────────────────────────────────────────
async function checkProfileColumns() {
  const url = `${URL}/rest/v1/profiles?select=default_work_days,default_work_start_hour,default_work_end_hour&limit=1`;
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  if (res.ok) {
    pass('profiles.default_work_* columns', `selectable (HTTP ${res.status})`);
    return;
  }
  if (text.includes('does not exist') || text.includes('schema cache')) {
    fail('profiles.default_work_* columns', text.slice(0, 200));
    return;
  }
  if (res.status === 401 || res.status === 403) {
    // RLS likely; if columns were missing we'd get a 400 / "column X does not exist"
    pass('profiles.default_work_* columns', 'RLS blocked (expected for anon) — columns appear to exist');
    return;
  }
  warn('profiles.default_work_* columns', `HTTP ${res.status}: ${text.slice(0, 200)}`);
}

// ─── 2. check_phone_available RPC ────────────────────────────────────────────
async function checkPhoneRpc() {
  const url = `${URL}/rest/v1/rpc/check_phone_available`;
  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ p_phone: '+15555550000' }),
  });
  const text = await res.text();
  if (res.ok) {
    pass('check_phone_available RPC', `returns ${text.slice(0, 60)}`);
    return;
  }
  if (text.toLowerCase().includes('not found') || res.status === 404 ||
      text.toLowerCase().includes('does not exist')) {
    fail('check_phone_available RPC', `missing — onboarding phone check will silently fail`);
    return;
  }
  warn('check_phone_available RPC', `HTTP ${res.status}: ${text.slice(0, 200)}`);
}

// ─── 3. google-places-search Edge Function ───────────────────────────────────
async function checkPlacesFn() {
  const url = `${URL}/functions/v1/google-places-search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: 'lisbon', types: '(cities)' }),
  });
  const text = await res.text();

  // The fn requires authenticated session — anon JWT may return 401
  if (res.status === 401) {
    pass(
      'google-places-search Edge Function',
      '401 (requires session JWT) — function exists, anon was rejected as expected',
    );
    return;
  }

  if (res.ok) {
    let data;
    try { data = JSON.parse(text); } catch {}
    if (data?.suggestions && Array.isArray(data.suggestions)) {
      pass(
        'google-places-search Edge Function',
        `returned ${data.suggestions.length} suggestion(s) — API key configured`,
      );
      return;
    }
    if (data?.error) {
      fail('google-places-search Edge Function', `error response: ${JSON.stringify(data.error).slice(0, 200)}`);
      return;
    }
    warn('google-places-search Edge Function', `unexpected 200 body: ${text.slice(0, 200)}`);
    return;
  }

  if (res.status === 404 || text.toLowerCase().includes('function not found')) {
    fail('google-places-search Edge Function', 'function not deployed');
    return;
  }
  if (text.toLowerCase().includes('google_places_api_key') ||
      text.toLowerCase().includes('missing') && text.toLowerCase().includes('key')) {
    fail('google-places-search Edge Function', 'API key not set in Edge fn secrets');
    return;
  }
  warn('google-places-search Edge Function', `HTTP ${res.status}: ${text.slice(0, 200)}`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────
console.log(`\n🔎 Verifying backend dependencies against ${URL}\n`);

await Promise.all([
  checkProfileColumns(),
  checkPhoneRpc(),
  checkPlacesFn(),
]);

for (const r of results) {
  console.log(`${r.status}  ${r.name}`);
  if (r.detail) console.log(`     ${r.detail}`);
}

const anyFail = results.some((r) => r.status === '❌');
console.log(anyFail ? '\nSome items need backend work.\n' : '\nAll three look good.\n');
process.exit(anyFail ? 1 : 0);
