// One-time storage migration: uploads every file from Lovable's exported
// zip + manifest to the new self-managed Supabase project.
//
// Inputs (defaults work if files are in ~/Downloads):
//   storage_buckets.zip — zip with storage/<bucket>/<path...> structure
//   _manifest.json      — { buckets: [...], objects: [{bucket, path, mime, size, ...}] }
//
// Usage:
//   export TARGET_SERVICE_ROLE='...'
//   node scripts/migrate-storage.mjs
//
// Optional env:
//   ZIP_PATH=/path/to/storage_buckets.zip
//   MANIFEST_PATH=/path/to/_manifest.json
//
// Safe to re-run: uses upsert on the target side.

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TARGET_URL = 'https://elpdnxvtulbqgnsrbstx.supabase.co';
const TARGET_KEY = process.env.TARGET_SERVICE_ROLE;
const ZIP_PATH = process.env.ZIP_PATH ?? '/Users/austinmora/Downloads/storage_buckets.zip';
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? '/Users/austinmora/Downloads/_manifest.json';

if (!TARGET_KEY) {
  console.error('Missing TARGET_SERVICE_ROLE env var');
  process.exit(1);
}
for (const p of [ZIP_PATH, MANIFEST_PATH]) {
  if (!existsSync(p)) {
    console.error(`Missing input file: ${p}`);
    process.exit(1);
  }
}

const target = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } });
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

console.log(`Manifest: ${manifest.buckets.length} bucket(s), ${manifest.objects.length} object(s)`);

// Extract zip to a temp dir
const extractDir = mkdtempSync(path.join(tmpdir(), 'parade-storage-'));
console.log(`Extracting zip to ${extractDir}...`);
execSync(`unzip -q -o "${ZIP_PATH}" -d "${extractDir}"`);

// Ensure each bucket exists on target
for (const b of manifest.buckets) {
  const { data } = await target.storage.getBucket(b.id);
  if (data) continue;
  const { error } = await target.storage.createBucket(b.id, {
    public: b.public,
    fileSizeLimit: b.file_size_limit ?? undefined,
    allowedMimeTypes: b.allowed_mime_types ?? undefined,
  });
  if (error) {
    console.error(`createBucket ${b.id}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Created missing bucket on target: ${b.id}`);
}

// Group objects by bucket for clean output
const byBucket = new Map();
for (const o of manifest.objects) {
  if (!byBucket.has(o.bucket)) byBucket.set(o.bucket, []);
  byBucket.get(o.bucket).push(o);
}

const summary = [];

for (const [bucket, objects] of byBucket) {
  console.log(`\n=== ${bucket} (${objects.length} files) ===`);
  let ok = 0;
  let fail = 0;
  let bytes = 0;
  const failures = [];

  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    const localPath = path.join(extractDir, 'storage', o.bucket, o.path);
    try {
      const buf = readFileSync(localPath);
      const { error } = await target.storage
        .from(o.bucket)
        .upload(o.path, buf, { upsert: true, contentType: o.mime || 'application/octet-stream' });
      if (error) {
        fail++;
        failures.push({ path: o.path, reason: error.message });
        console.log(`  FAIL ${o.path}: ${error.message}`);
      } else {
        ok++;
        bytes += buf.length;
        if ((i + 1) % 10 === 0 || i + 1 === objects.length) {
          console.log(`  ${i + 1}/${objects.length} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      }
    } catch (e) {
      fail++;
      failures.push({ path: o.path, reason: `local read: ${e.message}` });
      console.log(`  FAIL ${o.path}: local read — ${e.message}`);
    }
  }

  summary.push({ bucket, total: objects.length, ok, fail, bytes, failures });
}

// Cleanup
rmSync(extractDir, { recursive: true, force: true });

console.log('\n========== SUMMARY ==========');
let grandOk = 0;
let grandFail = 0;
let grandBytes = 0;
for (const s of summary) {
  console.log(
    `${s.bucket.padEnd(15)} ${s.ok}/${s.total} uploaded, ${s.fail} failed, ${(s.bytes / 1024 / 1024).toFixed(1)} MB`,
  );
  grandOk += s.ok;
  grandFail += s.fail;
  grandBytes += s.bytes;
}
console.log('---');
console.log(`Total: ${grandOk} uploaded, ${grandFail} failed, ${(grandBytes / 1024 / 1024).toFixed(1)} MB`);

if (grandFail > 0) {
  console.log('\nFailures:');
  for (const s of summary) {
    for (const f of s.failures) {
      console.log(`  ${s.bucket}/${f.path}: ${f.reason}`);
    }
  }
  process.exit(1);
}
