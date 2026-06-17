/**
 * First-plan celebration flag.
 *
 * Onboarding's final step "arms" this when the user heads off to create their
 * first plan (recording the plan count at that moment as a baseline). A global
 * watcher (components/onboarding/FirstPlanCelebration.tsx) fires the confetti
 * the moment the user's plan count exceeds the baseline — i.e. a real plan was
 * created via ANY path — then navigates them to Home.
 *
 * Persisted in MMKV so it survives the multi-screen plan-creation flow (and an
 * app kill mid-flow); cleared once the celebration plays.
 */
import { create } from 'zustand';
import { createMMKV } from 'react-native-mmkv';

const store = createMMKV({ id: 'parade-onboarding-celebration' });
const K_PENDING = 'pending';
const K_BASELINE = 'baseline';

interface CelebrationState {
  pending: boolean;
  /** Plan count when the celebration was armed; we fire once it's exceeded. */
  baseline: number;
  arm: (baseline: number) => void;
  clear: () => void;
}

export const useFirstPlanCelebration = create<CelebrationState>((set) => ({
  pending: store.getBoolean(K_PENDING) ?? false,
  baseline: store.getNumber(K_BASELINE) ?? 0,
  arm: (baseline) => {
    store.set(K_PENDING, true);
    store.set(K_BASELINE, baseline);
    set({ pending: true, baseline });
  },
  clear: () => {
    store.set(K_PENDING, false);
    set({ pending: false });
  },
}));
