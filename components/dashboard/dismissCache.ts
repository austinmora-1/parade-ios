/**
 * dismissCache — per-user MMKV-backed dismiss tracking for dashboard cards.
 *
 * Each dismissable card calls `useDismissed(key, userId)` to read state and
 * `dismiss(key, userId)` to persist the dismissal. Scoped per-user so two
 * accounts on the same device don't share dismissals.
 */
import { useEffect, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';

const store = createMMKV({ id: 'parade-dashboard-dismissals' });

function fullKey(key: string, userId: string | undefined): string {
  return `${userId ?? 'anon'}:${key}`;
}

export function isDismissed(key: string, userId: string | undefined): boolean {
  return store.getBoolean(fullKey(key, userId)) === true;
}

export function dismiss(key: string, userId: string | undefined): void {
  store.set(fullKey(key, userId), true);
}

/** Reactively read dismissed state. Updates when `dismiss()` is called. */
export function useDismissed(key: string, userId: string | undefined): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => isDismissed(key, userId));

  useEffect(() => {
    setDismissed(isDismissed(key, userId));
  }, [key, userId]);

  const doDismiss = () => {
    dismiss(key, userId);
    setDismissed(true);
  };

  return [dismissed, doDismiss];
}
