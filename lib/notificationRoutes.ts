/**
 * notificationRoutes — single source of truth for turning a notification's
 * `url` (PWA-style path, stored on the notifications row and in push `data`)
 * into an Expo Router route.
 *
 * Used by both the in-app notifications screen (tap on a row) and the native
 * push tap handler (usePushToken), so the two can never drift.
 */

/** Map a PWA-style url path to an iOS route. Returns null if unresolvable. */
export function notificationUrlToRoute(url: unknown): string | null {
  if (!url || typeof url !== 'string') return null;

  // Entity detail routes (id required). trip-proposal must precede trip.
  let m = url.match(/^\/trip-proposals?\/([^/?#]+)/);
  if (m) return `/(app)/trip-proposal/${m[1]}`;
  m = url.match(/^\/plans?\/([^/?#]+)/);
  if (m) return `/(app)/plan/${m[1]}`;
  m = url.match(/^\/friends?\/([^/?#]+)/);
  if (m) return `/(app)/friend/${m[1]}`;
  m = url.match(/^\/day\/([^/?#]+)/);
  if (m) return `/(app)/day/${m[1]}`;
  m = url.match(/^\/trips?\/([^/?#]+)/);
  if (m) return `/(app)/trip/${m[1]}`;

  // List / screen routes (no id).
  if (/^\/pending-requests(?:[/?#]|$)/.test(url)) return '/(app)/pending-requests';
  if (/^\/trips(?:[/?#]|$)/.test(url)) return '/(app)/trips';
  if (/^\/plans(?:[/?#]|$)/.test(url)) return '/(app)/(tabs)/plans';
  if (/^\/friends(?:[/?#]|$)/.test(url)) return '/(app)/(tabs)/friends';
  if (/^\/(home)?(?:[?#]|$)/.test(url)) return '/(app)/(tabs)';
  if (url.startsWith('/notifications')) return '/(app)/notifications';

  return null;
}

/**
 * Fallback for notifications whose url is missing or points nowhere useful
 * (e.g. legacy rows with url '/notifications'): infer a destination from the
 * notification type.
 */
export function notificationTypeToRoute(type: unknown): string | null {
  const t = typeof type === 'string' ? type.toLowerCase() : '';
  if (!t) return null;
  if (t.includes('friend')) return '/(app)/pending-requests';
  // Vibe checks are answered via the dashboard widget on the home tab.
  if (t.includes('vibe') || t.includes('hang')) return '/(app)/(tabs)';
  if (t.includes('availability')) return '/(app)/(tabs)/friends';
  if (t.includes('trip') || t.includes('visit')) return '/(app)/trips';
  if (t.includes('plan') || t.includes('rsvp') || t.includes('invite'))
    return '/(app)/(tabs)/plans';
  return null;
}

/**
 * Resolve a notification (row or push payload) to a route: url first, then
 * type fallback. `selfRoute` is the route the user is already on (e.g. the
 * notifications screen) — a url resolving there returns the type fallback
 * instead, so legacy '/notifications' rows still deep-link somewhere useful.
 */
export function resolveNotificationRoute(input: {
  url?: unknown;
  type?: unknown;
  selfRoute?: string;
}): string | null {
  const fromUrl = notificationUrlToRoute(input.url);
  if (fromUrl && fromUrl !== input.selfRoute) return fromUrl;
  return notificationTypeToRoute(input.type) ?? fromUrl;
}
