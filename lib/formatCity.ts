/**
 * Display-only city normalization.
 *
 * Wraps the lower-case canonical normalization from `locationMatch.ts`
 * with a curated alias map for the user-facing label.
 *
 * NOTE: This does NOT mutate stored data. It only transforms the string
 * we render. Storage and matching logic remain untouched.
 */

import { normalizeCity } from './locationMatch';

/**
 * Maps the canonical (lowercase) city key produced by `normalizeCity`
 * to the preferred display label.
 *
 * Anything not in this map falls back to title-casing the canonical key.
 */
const DISPLAY_OVERRIDES: Record<string, string> = {
  'new york city': 'New York',
  'new york': 'New York',
  'washington dc': 'Washington, D.C.',
  'st. louis': 'St. Louis',
  'são paulo': 'São Paulo',
  'mexico city': 'Mexico City',
  'cancún': 'Cancún',
  'kuala lumpur': 'Kuala Lumpur',
  'hong kong': 'Hong Kong',
  'tel aviv': 'Tel Aviv',
  'fort lauderdale': 'Fort Lauderdale',
  'fort worth': 'Fort Worth',
  'salt lake city': 'Salt Lake City',
  'kansas city': 'Kansas City',
  'san francisco': 'San Francisco',
  'san diego': 'San Diego',
  'san jose': 'San Jose',
  'san antonio': 'San Antonio',
  'los angeles': 'Los Angeles',
  'las vegas': 'Las Vegas',
  'new orleans': 'New Orleans',
};

const SMALL_WORDS = new Set([
  'of', 'the', 'and', 'in', 'on', 'at', 'by', 'de', 'la', 'le', 'las', 'los', 'el',
]);

function titleCase(input: string): string {
  return input
    .split(' ')
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && SMALL_WORDS.has(lower)) return lower;
      // Preserve apostrophes (e.g., O'Hare) and hyphens
      return lower
        .split(/(['-])/)
        .map((part) => (part === "'" || part === '-' ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
    })
    .join(' ');
}

/**
 * Returns the preferred display label for a raw location string.
 *
 * Examples:
 *   "New York City"       → "New York"
 *   "NYC"                 → "New York"
 *   "Brooklyn, NY"        → "New York"
 *   "Austin, TX, USA"     → "Austin"
 *   "san francisco"       → "San Francisco"
 *   ""                    → ""
 */
export function formatCityForDisplay(loc: string | null | undefined): string {
  if (!loc) return '';
  const trimmed = loc.trim();
  if (!trimmed) return '';

  const canonical = normalizeCity(trimmed);
  if (!canonical) return trimmed;

  const override = DISPLAY_OVERRIDES[canonical];
  if (override) return override;

  return titleCase(canonical);
}
