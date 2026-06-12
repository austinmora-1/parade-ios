/**
 * Theme — scheme state + time-based scheduling + manual override.
 *
 * Parade defaults to a time-driven scheme: DARK from 9pm local time,
 * back to LIGHT at 7am. The root layout calls applyScheme() on launch,
 * on app foreground, and on a timer armed for the next boundary.
 *
 * A manual override (the profile-header toggle) is persisted in MMKV.
 * The "auto shift" setting (Settings → Appearance, default ON) controls
 * how long it lasts: with auto shift ON, the override only holds until
 * the next 9pm/7am boundary, then the schedule takes back over; with it
 * OFF, the override is permanent until the user toggles again.
 *
 * Styling layers:
 *   • className tokens (bg-card, text-foreground, …) flip automatically
 *     via the `.dark:root` CSS variables in global.css (NativeWind
 *     class-based dark mode — colorScheme.set toggles the class).
 *   • Imperative colors (lucide `color=` props, style objects) read the
 *     TC getters below. They re-evaluate on the root re-render that the
 *     scheme flip triggers.
 */
import { useSyncExternalStore } from 'react';
import { colorScheme } from 'nativewind';
import { createMMKV } from 'react-native-mmkv';

export type Scheme = 'light' | 'dark';

const store = createMMKV({ id: 'parade-theme' });
const OVERRIDE_KEY = 'scheme-override';
const OVERRIDE_AT_KEY = 'scheme-override-at';
const AUTO_SHIFT_KEY = 'auto-shift';

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
const listeners = new Set<() => void>();

export function applyScheme(s: Scheme) {
  if (s === current) {
    colorScheme.set(s);
    return;
  }
  current = s;
  colorScheme.set(s);
  listeners.forEach((fn) => fn());
}

export function currentScheme(): Scheme {
  return current;
}

/** Persisted manual override; null means "follow the schedule". */
export function schemeOverride(): Scheme | null {
  const v = store.getString(OVERRIDE_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function setSchemeOverride(s: Scheme | null) {
  if (s === null) {
    store.remove(OVERRIDE_KEY);
    store.remove(OVERRIDE_AT_KEY);
  } else {
    store.set(OVERRIDE_KEY, s);
    store.set(OVERRIDE_AT_KEY, Date.now());
  }
  applyScheme(resolvedScheme());
}

/** Auto shift (Settings → Appearance): schedule reclaims control at each
 *  9pm/7am boundary, expiring any manual override. Default ON. */
export function autoShiftEnabled(): boolean {
  return store.getBoolean(AUTO_SHIFT_KEY) ?? true;
}

export function setAutoShiftEnabled(on: boolean) {
  store.set(AUTO_SHIFT_KEY, on);
  applyScheme(resolvedScheme());
}

/**
 * Scheme to show right now. A manual override wins, except when auto
 * shift is on and a schedule boundary has passed since the toggle —
 * then the override expires and the schedule takes back over.
 */
export function resolvedScheme(now: Date = new Date()): Scheme {
  const override = schemeOverride();
  if (!override) return scheduledScheme(now);
  if (autoShiftEnabled()) {
    const at = store.getNumber(OVERRIDE_AT_KEY) ?? 0;
    const atDate = new Date(at);
    const boundaryAfterToggle = at + msUntilNextBoundary(atDate);
    if (now.getTime() >= boundaryAfterToggle) {
      store.remove(OVERRIDE_KEY);
      store.remove(OVERRIDE_AT_KEY);
      return scheduledScheme(now);
    }
  }
  return override;
}

export function subscribeScheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Current scheme as React state — re-renders on every flip. */
export function useScheme(): Scheme {
  return useSyncExternalStore(subscribeScheme, currentScheme);
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
