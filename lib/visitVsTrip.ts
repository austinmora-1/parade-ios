/**
 * Visit vs Trip visual differentiation.
 *
 * Rule (single source of truth):
 *  - "Visit" (green / Home icon)  → the destination matches the viewer's
 *    home city. They're hosting at home.
 *  - "Trip"  (coral / Plane icon) → the destination is anywhere else.
 *
 * The previous data-driven `proposal_type === 'visit'` flag is no longer
 * used for color/icon — it's a pure location comparison so the visual
 * scheme is consistent for every viewer.
 */
import { citiesMatch, normalizeCity } from '@/lib/locationMatch';

export type TravelKind = 'visit' | 'trip';

export function getTravelKind(
  location: string | null | undefined,
  homeCandidates: Array<string | null | undefined>,
): TravelKind {
  const loc = normalizeCity(location || '');
  if (!loc) return 'trip';
  const homes = homeCandidates.map((h) => normalizeCity(h || '')).filter(Boolean);
  if (homes.some((h) => citiesMatch(h, loc))) return 'visit';
  return 'trip';
}

export const VISIT_ACCENT = 'hsl(var(--available))';
export const TRIP_ACCENT = 'hsl(var(--coral))';
