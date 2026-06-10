/**
 * Theme — scheme state + time-based scheduling.
 *
 * Parade defaults to a time-driven scheme: DARK from 9pm local time,
 * back to LIGHT at 7am. The root layout calls applyScheme() on launch,
 * on app foreground, and on a timer armed for the next boundary.
 *
 * Styling layers:
 *   • className tokens (bg-card, text-foreground, …) flip automatically
 *     via the `.dark:root` CSS variables in global.css (NativeWind
 *     class-based dark mode — colorScheme.set toggles the class).
 *   • Imperative colors (lucide `color=` props, style objects) read the
 *     TC getters below. They re-evaluate on the root re-render that the
 *     scheme flip triggers.
 */
import { colorScheme } from 'nativewind';

export type Scheme = 'light' | 'dark';

export const DARK_START_HOUR = 21; // 9pm
export const DARK_END_HOUR = 7;    // 7am

/** Scheme the schedule dictates for a given local time. */
export function scheduledScheme(now: Date = new Date()): Scheme {
  const h = now.getHours();
  return h >= DARK_START_HOUR || h < DARK_END_HOUR ? 'dark' : 'light';
}

/** Milliseconds until the next 9pm/7am boundary. */
export function msUntilNextBoundary(now: Date = new Date()): number {
  const next = new Date(now);
  const h = now.getHours();
  if (h >= DARK_START_HOUR) {
    next.setDate(next.getDate() + 1);
    next.setHours(DARK_END_HOUR, 0, 0, 0);
  } else if (h < DARK_END_HOUR) {
    next.setHours(DARK_END_HOUR, 0, 0, 0);
  } else {
    next.setHours(DARK_START_HOUR, 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - now.getTime());
}

let current: Scheme = 'light';

export function applyScheme(s: Scheme) {
  current = s;
  colorScheme.set(s);
}

export function currentScheme(): Scheme {
  return current;
}

/**
 * Theme-aware imperative colors. Use for icon `color=` props and style
 * objects that can't use className tokens.
 */
export const TC = {
  /** Header/back-button icons — evergreen on light, soft sage on dark. */
  get icon() {
    return current === 'dark' ? '#C2D4C8' : '#2F4F3F';
  },
  /** Brand green, brightened for contrast on dark surfaces. */
  get primary() {
    return current === 'dark' ? '#3B9B68' : '#23744D';
  },
  /** Muted gray — readable on both schemes. */
  get muted() {
    return '#929298';
  },
};
