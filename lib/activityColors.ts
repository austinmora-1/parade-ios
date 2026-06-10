/**
 * Activity → accent color (matches PWA activity palette).
 * Single source of truth — do not redeclare this dict in screens/widgets.
 */
export const ACTIVITY_COLOR: Record<string, string> = {
  drinks: '#D46549', food: '#D46549', coffee: '#C47030', brunch: '#D46549',
  'happy-hour': '#D46549', hike: '#9CB094', run: '#9CB094', gym: '#9CB094',
  sports: '#9CB094', movie: '#7744BB', concert: '#6E9BC2', game: '#7744BB',
  travel: '#23744D', beach: '#23744D', park: '#23744D', meetup: '#23744D',
};

export const DEFAULT_ACTIVITY_ACCENT = '#23744D';

/**
 * Accent color for an activity. Callers with a context-specific default
 * (e.g. marigold for discovery, gray for history) pass a fallback.
 */
export function activityAccent(
  activity?: string,
  fallback: string = DEFAULT_ACTIVITY_ACCENT,
): string {
  return ACTIVITY_COLOR[activity ?? ''] ?? fallback;
}
