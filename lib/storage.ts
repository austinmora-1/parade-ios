import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const SIGNED_URL_EXPIRY = 3600; // 1 hour
const PRIVATE_BUCKETS = ['plan-photos'];

const urlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Detect which storage bucket a URL belongs to, or null if external.
 */
export function detectBucket(pathOrUrl: string): string | null {
  if (!pathOrUrl) return null;

  // If it doesn't start with http, it's a file path — caller must specify bucket
  if (!pathOrUrl.startsWith('http')) return null;

  // Check if it's a Supabase storage URL
  if (!pathOrUrl.includes(SUPABASE_URL)) return null;

  for (const bucket of PRIVATE_BUCKETS) {
    if (pathOrUrl.includes(`/storage/v1/object/public/${bucket}/`)) {
      return bucket;
    }
  }
  return null;
}

/**
 * Extract the file path from a Supabase storage URL.
 * Returns the original string if it's already a path or an external URL.
 */
export function extractStoragePath(bucket: string, pathOrUrl: string): string {
  if (!pathOrUrl.startsWith('http')) return pathOrUrl;

  const publicPrefix = `/storage/v1/object/public/${bucket}/`;
  try {
    const url = new URL(pathOrUrl);
    const idx = url.pathname.indexOf(publicPrefix);
    if (idx !== -1) {
      return decodeURIComponent(url.pathname.substring(idx + publicPrefix.length));
    }
  } catch {
    // Not a valid URL
  }
  return pathOrUrl;
}

/**
 * Get a signed URL for a private bucket file.
 * If the input is an external URL (e.g., Giphy), returns it as-is.
 * Caches signed URLs to avoid redundant API calls.
 */
export async function getSignedUrl(bucket: string, pathOrUrl: string): Promise<string> {
  const path = extractStoragePath(bucket, pathOrUrl);
  const cacheKey = `${bucket}/${path}`;

  const cached = urlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) {
    console.error('Failed to create signed URL:', error);
    return pathOrUrl; // Fallback to original
  }

  urlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + (SIGNED_URL_EXPIRY - 60) * 1000,
  });

  return data.signedUrl;
}

/**
 * Resolve a media URL that could be:
 * - An external URL (Giphy, etc.) → returned as-is
 * - A Supabase storage public URL → converted to signed URL
 * - A file path → requires bucket param, converted to signed URL
 */
export async function resolveMediaUrl(
  pathOrUrl: string,
  bucketHint?: string
): Promise<string> {
  // Handle storage:bucket:path format (new uploads)
  if (pathOrUrl.startsWith('storage:')) {
    const parts = pathOrUrl.split(':');
    if (parts.length >= 3) {
      const bucket = parts[1];
      const path = parts.slice(2).join(':');
      return getSignedUrl(bucket, path);
    }
  }

  const bucket = bucketHint || detectBucket(pathOrUrl);
  if (!bucket) return pathOrUrl; // External URL
  return getSignedUrl(bucket, pathOrUrl);
}

/**
 * Batch-resolve multiple storage paths to signed URLs.
 */
export async function getSignedUrls(
  bucket: string,
  paths: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uncached: { path: string; originalKey: string }[] = [];

  for (const p of paths) {
    const path = extractStoragePath(bucket, p);
    const cacheKey = `${bucket}/${path}`;
    const cached = urlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      result.set(p, cached.url);
    } else {
      uncached.push({ path, originalKey: p });
    }
  }

  if (uncached.length > 0) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(
        uncached.map(u => u.path),
        SIGNED_URL_EXPIRY
      );

    if (!error && data) {
      for (let i = 0; i < data.length; i++) {
        const signed = data[i];
        if (signed.signedUrl) {
          const cacheKey = `${bucket}/${uncached[i].path}`;
          urlCache.set(cacheKey, {
            url: signed.signedUrl,
            expiresAt: Date.now() + (SIGNED_URL_EXPIRY - 60) * 1000,
          });
          result.set(uncached[i].originalKey, signed.signedUrl);
        } else {
          result.set(uncached[i].originalKey, uncached[i].path);
        }
      }
    }
  }

  return result;
}
