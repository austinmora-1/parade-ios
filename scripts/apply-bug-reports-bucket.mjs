#!/usr/bin/env node
// Applies supabase/migrations/20260625120000_bug_reports_bucket.sql to the
// linked project via the Management API (no Docker / DB password, and without
// touching the migration-history ordering). Idempotent — safe to re-run.
//
// Auth: SUPABASE_ACCESS_TOKEN, ~/.supabase/access-token, or the CLI keychain
// entry (same resolution as scripts/dump-schema.mjs).

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_REF = 'elpdnxvtulbqgnsrbstx';
const SQL_FILE = new URL(
  '../supabase/migrations/20260625120000_bug_reports_bucket.sql',
  import.meta.url,
).pathname;

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const f = join(homedir(), '.supabase', 'access-token');
  if (existsSync(f)) {
    const t = readFileSync(f, 'utf8').trim();
    if (t) return t;
  }
  const raw = execSync('security find-generic-password -s "Supabase CLI" -w', {
    encoding: 'utf8',
  }).trim();
  if (raw.startsWith('go-keyring-base64:')) {
    return Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8');
  }
  return raw;
}

async function sql(token, query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

const token = getToken();

// 1. Apply the bucket + policies.
console.log('Applying bug-reports bucket migration…');
await sql(token, readFileSync(SQL_FILE, 'utf8'));

// 2. Verify.
const buckets = await sql(
  token,
  `select id, public from storage.buckets where id = 'bug-reports'`,
);
const policies = await sql(
  token,
  `select policyname from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'bug-reports%' order by policyname`,
);

console.log('Bucket:', JSON.stringify(buckets));
console.log('Policies:', JSON.stringify(policies));
console.log('Done.');
