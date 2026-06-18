import * as Sentry from '@sentry/react-native';
import { PostHog } from 'posthog-react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

export function initTelemetry() {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: __DEV__ ? 0 : 0.1,
      enabled: !__DEV__,
    });
  }

  if (POSTHOG_API_KEY) {
    posthog = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      enableSessionReplay: true,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: false,
      },
    });
  }
}

export function getPostHog(): PostHog | null {
  return posthog;
}

/**
 * Single error sink. Route every handled/caught error here instead of a bare
 * `console.error` so production failures are visible in Sentry. In dev it also
 * logs to the console (Sentry itself is disabled in __DEV__). `context` is
 * attached as Sentry "extra" data — keep it small and non-sensitive.
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) {
    console.error('[captureError]', error, context ?? '');
  }
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Tie crashes/replays to a user after sign-in. */
export function setTelemetryUser(userId: string) {
  Sentry.setUser({ id: userId });
  posthog?.identify(userId);
}

/** Clear identity on sign-out so the next session isn't attributed to it. */
export function clearTelemetryUser() {
  Sentry.setUser(null);
  posthog?.reset();
}
