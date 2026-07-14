/**
 * Brand color constants + translucent tint scale for imperative styles
 * (style objects, icon `color=` props, config dicts) that can't use
 * className tokens. Keep base values in sync with global.css.
 *
 * Prefer Tailwind classes (bg-primary/10, border-border, …) where the
 * styling is a static className; reach for TINT only in style objects.
 */
export const PARADE_GREEN = '#23744D';
export const MINT         = '#67B28E'; // faded mint (PWA --go-mint) — "mostly open"
export const EMBER        = '#D46549'; // "away" / travel accent
export const PLAN_BLUE    = '#3F86D6'; // Parade social plans ("planned") — kept distinct from EMBER "away" (XPE-288)
export const MARIGOLD     = '#DFA53A';
export const ELEPHANT     = '#929298'; // muted-foreground gray
export const AMBER        = '#B45309'; // "some time" availability accent
export const EVERGREEN    = '#2F4F3F';

/** hex (#RRGGBB) + alpha → rgba() string */
export function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Standard tint scale. One value per semantic step — don't add one-off
 * alphas; pick the nearest step.
 *   faint  → washes / large fills
 *   subtle → chip & badge backgrounds
 *   border → tinted borders, step dots
 *   strong → emphasized borders / fills
 */
export const TINT = {
  primaryFaint:    tint(PARADE_GREEN, 0.05),
  primarySubtle:   tint(PARADE_GREEN, 0.12),
  primaryBorder:   tint(PARADE_GREEN, 0.2),
  primaryStrong:   tint(PARADE_GREEN, 0.3),
  primaryRing:     tint(PARADE_GREEN, 0.4),

  secondarySubtle: tint(EMBER, 0.12),
  secondaryBorder: tint(EMBER, 0.2),

  marigoldSubtle:  tint(MARIGOLD, 0.15),

  amberSubtle:     tint(AMBER, 0.12),
  amberStrong:     tint(AMBER, 0.3),

  grayFaint:       tint(ELEPHANT, 0.12),
  grayBorder:      tint(ELEPHANT, 0.3),
  grayStrong:      tint(ELEPHANT, 0.4),
  graySolid:       tint(ELEPHANT, 0.5),
} as const;
