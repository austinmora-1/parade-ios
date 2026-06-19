/**
 * SecureStore-backed storage adapter for the Supabase auth session.
 *
 * Moves the long-lived refresh token out of plaintext AsyncStorage into the
 * iOS Keychain (hardware-backed, encrypted at rest). SecureStore caps values at
 * 2048 bytes and a Supabase session blob is larger, so values are chunked across
 * numbered Keychain entries. Existing AsyncStorage sessions are migrated on first
 * read, so the upgrade does not log anyone out.
 *
 * Wired into integrations/supabase/client.ts as the auth `storage`.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AFTER_FIRST_UNLOCK so autoRefreshToken can read/write the session during a
// background refresh while the device is locked (WHEN_UNLOCKED would fail then).
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const CHUNK_BYTES = 1800; // headroom under SecureStore's 2048-byte limit

const countKey = (key: string) => `${key}.__n`;
const chunkKey = (key: string, i: number) => `${key}.__${i}`;

/** UTF-8 byte length without TextEncoder (not guaranteed in the RN runtime). */
const utf8Bytes = (s: string): number =>
  encodeURIComponent(s).replace(/%[0-9A-Fa-f]{2}/g, 'x').length;

/** Split by code point (never mid-character) into <= CHUNK_BYTES pieces. */
function splitChunks(value: string): string[] {
  const chunks: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of value) {
    const b = utf8Bytes(ch);
    if (curBytes + b > CHUNK_BYTES && cur.length > 0) {
      chunks.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  if (cur.length > 0 || chunks.length === 0) chunks.push(cur);
  return chunks;
}

async function readChunked(key: string): Promise<string | null> {
  const countStr = await SecureStore.getItemAsync(countKey(key), OPTS);
  if (countStr == null) return null;
  const n = parseInt(countStr, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  let out = '';
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i), OPTS);
    if (part == null) return null; // partial/corrupt write — treat as no session
    out += part;
  }
  return out;
}

async function clearChunked(key: string): Promise<void> {
  const countStr = await SecureStore.getItemAsync(countKey(key), OPTS);
  const n = countStr ? parseInt(countStr, 10) : 0;
  const deletes = [SecureStore.deleteItemAsync(countKey(key), OPTS)];
  for (let i = 0; i < n; i++) deletes.push(SecureStore.deleteItemAsync(chunkKey(key, i), OPTS));
  await Promise.all(deletes);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const existing = await readChunked(key);
    if (existing != null) return existing;
    // One-time migration from the previous AsyncStorage adapter.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      await secureSessionStorage.setItem(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const chunks = splitChunks(value);
    // Drop any stale chunks from a previously longer value, then write fresh.
    // Count is written last so an interrupted write reads back as "no session"
    // (a re-login) rather than a corrupt one.
    await clearChunked(key);
    await Promise.all(
      chunks.map((c, i) => SecureStore.setItemAsync(chunkKey(key, i), c, OPTS)),
    );
    await SecureStore.setItemAsync(countKey(key), String(chunks.length), OPTS);
  },

  async removeItem(key: string): Promise<void> {
    await clearChunked(key);
    await AsyncStorage.removeItem(key); // also clear any legacy copy
  },
};
