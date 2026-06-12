import { create } from 'zustand';
import { Plan, Friend, DayAvailability, Vibe, TimeSlot, LocationStatus, ActivityType, VibeType } from '@/types/planner';
import { getCachedDashboard } from '@/lib/dashboardCache';
import { queryClient } from '@/lib/queryClient';
import { fetchDashboard } from '@/lib/dashboardQuery';

import type { DefaultAvailabilitySettings } from './helpers/types';
import { transformDashboardData } from './helpers/transformDashboard';

import { usePlansStore } from './plansStore';
import { useFriendsStore } from './friendsStore';
import { useAvailabilityStore } from './availabilityStore';
import { useVibeStore } from './vibeStore';

// Re-export for existing callers; the implementation lives in helpers to
// avoid a plannerStore ↔ plansStore import cycle.
export { transformDashboardData } from './helpers/transformDashboard';

/** Push a transformed dashboard payload into the domain stores. The facade
 * mirrors domain-store changes via its subscriptions, so this is the single
 * write path for dashboard state regardless of where the fetch originated. */
function pushDashboardToStores(transformed: ReturnType<typeof transformDashboardData>, userId: string) {
  usePlansStore.setState({ plans: transformed.plans, hasMorePlans: transformed.hasMorePlans });
  useFriendsStore.setState({ friends: transformed.friends });
  useAvailabilityStore.setState({
    availability: transformed.availability,
    availabilityMap: transformed.availabilityMap,
    locationStatus: transformed.locationStatus,
    defaultSettings: transformed.defaultSettings,
    homeAddress: transformed.homeAddress,
  });
  useVibeStore.setState({ userTimezone: transformed.userTimezone });
  useVibeStore.getState().bootstrapVibe(transformed.currentVibe, userId);
}

// ── Facade interface (unchanged from before) ─────────────────────────────────
interface PlannerState {
  plans: Plan[];
  friends: Friend[];
  availability: DayAvailability[];
  availabilityMap: Record<string, DayAvailability>;
  currentVibe: Vibe | null;
  locationStatus: LocationStatus;
  isLoading: boolean;
  loadError: string | null;
  initialLoadDone: boolean;
  userId: string | null;
  lastFetchedAt: number | null;
  defaultSettings: DefaultAvailabilitySettings | null;
  homeAddress: string | null;
  userTimezone: string;
  hasMorePlans: boolean;
  isLoadingMore: boolean;
  
  setUserId: (userId: string | null) => void;
  loadAllData: (force?: boolean) => Promise<void>;
  forceRefresh: () => Promise<void>;
  loadFriends: () => Promise<void>;
  loadPlans: () => Promise<void>;
  loadProfileAndAvailability: () => Promise<void>;
  loadMorePlans: () => Promise<void>;
  
  addPlan: (plan: Omit<Plan, 'id' | 'createdAt'>) => Promise<void>;
  updatePlan: (id: string, updates: Partial<Plan>) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  proposePlan: (proposal: {
    recipientFriendId: string;
    activity: ActivityType | string;
    date: Date;
    timeSlot: TimeSlot;
    title?: string;
    location?: string;
    note?: string;
  }) => Promise<void>;
  respondToProposal: (planId: string, participantRowId: string, response: 'accepted' | 'declined') => Promise<void>;
  
  addFriend: (friend: Omit<Friend, 'id'>) => Promise<void>;
  updateFriend: (id: string, updates: Partial<Friend>) => Promise<void>;
  acceptFriendRequest: (friendshipId: string, requesterUserId: string) => Promise<void>;
  removeFriend: (id: string) => Promise<void>;
  
  setAvailability: (date: Date, slot: TimeSlot, available: boolean) => Promise<void>;
  setLocationStatus: (status: LocationStatus, date?: Date) => Promise<void>;
  getLocationStatusForDate: (date: Date) => LocationStatus;
  setVibeForDate: (date: Date, vibe: VibeType | null) => Promise<void>;
  getVibeForDate: (date: Date) => VibeType | null;
  setVibe: (vibe: Vibe | null) => Promise<void>;
  addCustomVibe: (tag: string) => Promise<void>;
  removeCustomVibe: (tag: string) => Promise<void>;
  
  loadAvailabilityForRange: (startDate: Date, endDate: Date) => Promise<void>;
  initializeWeekAvailability: () => Promise<void>;
}

// ── Helper: sync domain stores → facade ──────────────────────────────────────
function syncFromDomainStores(set: (partial: Partial<PlannerState>) => void) {
  const plans = usePlansStore.getState();
  const friends = useFriendsStore.getState();
  const avail = useAvailabilityStore.getState();
  const vibe = useVibeStore.getState();
  set({
    plans: plans.plans,
    hasMorePlans: plans.hasMorePlans,
    isLoadingMore: plans.isLoadingMore,
    friends: friends.friends,
    availability: avail.availability,
    availabilityMap: avail.availabilityMap,
    locationStatus: avail.locationStatus,
    defaultSettings: avail.defaultSettings,
    homeAddress: avail.homeAddress,
    currentVibe: vibe.currentVibe,
    userTimezone: vibe.userTimezone,
  });
}

// ── Facade store ─────────────────────────────────────────────────────────────
export const usePlannerStore = create<PlannerState>((set, get) => {
  // Subscribe to domain store changes and mirror into facade
  usePlansStore.subscribe(() => syncFromDomainStores(set));
  useFriendsStore.subscribe(() => syncFromDomainStores(set));
  useAvailabilityStore.subscribe(() => syncFromDomainStores(set));
  useVibeStore.subscribe(() => syncFromDomainStores(set));

  // Mirror every successful ['dashboard', userId] fetch into the domain
  // stores — whether triggered by loadAllData or by any React Query hook
  // invalidating the dashboard (see lib/dashboardQuery.invalidatePlanData).
  // This is what keeps the Zustand facade and React Query screens in sync.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action?.type !== 'success') return;
    const { queryKey, state } = event.query;
    const userId = get().userId;
    if (!userId || queryKey[0] !== 'dashboard' || queryKey[1] !== userId) return;
    if (!state.data) return;
    pushDashboardToStores(transformDashboardData(state.data, userId), userId);
    set({ lastFetchedAt: state.dataUpdatedAt, loadError: null });
  });

  return {
    // ── State (initial values) ──────────────────────────────────────────────
    plans: [],
    friends: [],
    availability: [],
    availabilityMap: {},
    currentVibe: null,
    locationStatus: 'home',
    isLoading: true,
    loadError: null,
    initialLoadDone: false,
    userId: null,
    lastFetchedAt: null,
    defaultSettings: null,
    homeAddress: null,
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hasMorePlans: false,
    isLoadingMore: false,

    // ── Cross-cutting ───────────────────────────────────────────────────────
    setUserId: (userId) => set({ userId }),

    loadAllData: async (force) => {
      const { userId, lastFetchedAt, initialLoadDone } = get();
      if (!userId) {
        set({ isLoading: false, initialLoadDone: true });
        return;
      }

      if (!force && lastFetchedAt && Date.now() - lastFetchedAt < 120_000) {
        return;
      }

      set({ isLoading: true, loadError: null });

      // Cold-start stale-while-revalidate: serve the MMKV snapshot instantly,
      // then let the React Query fetch below revalidate in the foreground.
      if (!initialLoadDone) {
        try {
          const cached = await getCachedDashboard(userId);
          if (cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
            pushDashboardToStores(transformDashboardData(cached.data, userId), userId);
            set({ isLoading: false, lastFetchedAt: cached.cachedAt, initialLoadDone: true });
            if (!force && Date.now() - cached.cachedAt < 120_000) {
              return;
            }
          }
        } catch {
          // Cache miss
        }
      }

      try {
        // Single fetch path through the React Query cache. The query-cache
        // subscriber (above) transforms and pushes the result into the
        // domain stores, so there is no separate push here.
        await fetchDashboard(userId, { force });
        set({ isLoading: false, lastFetchedAt: Date.now(), loadError: null, initialLoadDone: true });
      } catch (error) {
        console.error('get_dashboard_data failed after retries:', error);
        let fallbackOk = true;
        try {
          await Promise.all([
            get().loadFriends(),
            get().loadPlans(),
            get().loadProfileAndAvailability(),
          ]);
        } catch (fallbackErr) {
          console.error('Fallback loaders also failed:', fallbackErr);
          fallbackOk = false;
        }
        set({
          isLoading: false,
          lastFetchedAt: Date.now(),
          loadError: fallbackOk ? null : 'We couldn’t load your dashboard. Please try again.',
          initialLoadDone: true,
        });
      }
    },

    forceRefresh: async () => {
      await get().loadAllData(true);
    },

    // ── Delegated to domain stores ──────────────────────────────────────────
    loadMorePlans: async () => {
      const { userId } = get();
      if (!userId) return;
      await usePlansStore.getState().loadMorePlans(userId);
    },

    addPlan: async (plan) => {
      const { userId, userTimezone } = get();
      if (!userId) return;
      await usePlansStore.getState().addPlan(plan, userId, userTimezone, () => ({
        availability: useAvailabilityStore.getState().availability,
        availabilityMap: useAvailabilityStore.getState().availabilityMap,
        defaultSettings: useAvailabilityStore.getState().defaultSettings,
      }));
    },

    updatePlan: async (id, updates) => {
      const { userId } = get();
      if (!userId) return;
      await usePlansStore.getState().updatePlan(id, updates, userId);
    },

    deletePlan: async (id) => {
      const { userId } = get();
      if (!userId) return;
      await usePlansStore.getState().deletePlan(id, userId, () => ({
        availability: useAvailabilityStore.getState().availability,
        availabilityMap: useAvailabilityStore.getState().availabilityMap,
      }));
    },

    proposePlan: async (proposal) => {
      const { userId, userTimezone } = get();
      if (!userId) return;
      await usePlansStore.getState().proposePlan(proposal, userId, userTimezone, () => get().loadAllData());
    },

    respondToProposal: async (planId, participantRowId, response) => {
      await usePlansStore.getState().respondToProposal(planId, participantRowId, response, () => get().loadAllData());
    },

    addFriend: async (friend) => {
      const { userId } = get();
      if (!userId) return;
      await useFriendsStore.getState().addFriend(friend, userId);
    },

    updateFriend: async (id, updates) => {
      const { userId } = get();
      if (!userId) return;
      await useFriendsStore.getState().updateFriend(id, updates, userId);
    },

    acceptFriendRequest: async (friendshipId, requesterUserId) => {
      const { userId } = get();
      if (!userId) return;
      await useFriendsStore.getState().acceptFriendRequest(friendshipId, requesterUserId, userId);
    },

    removeFriend: async (id) => {
      await useFriendsStore.getState().removeFriend(id);
    },

    setAvailability: async (date, slot, available) => {
      const { userId } = get();
      if (!userId) return;
      await useAvailabilityStore.getState().setAvailability(date, slot, available, userId);
    },

    setLocationStatus: async (status, date) => {
      const { userId } = get();
      if (!userId) return;
      await useAvailabilityStore.getState().setLocationStatus(status, userId, date);
    },

    getLocationStatusForDate: (date) => {
      return useAvailabilityStore.getState().getLocationStatusForDate(date);
    },

    setVibeForDate: async (date, vibe) => {
      const { userId } = get();
      if (!userId) return;
      await useAvailabilityStore.getState().setVibeForDate(date, vibe, userId, (v) => {
        useVibeStore.setState({ currentVibe: v });
      });
    },

    getVibeForDate: (date) => {
      return useAvailabilityStore.getState().getVibeForDate(date);
    },

    setVibe: async (vibe) => {
      const { userId } = get();
      if (!userId) return;
      await useVibeStore.getState().setVibe(vibe, userId);
    },

    addCustomVibe: async (tag) => {
      const { userId } = get();
      if (!userId) return;
      await useVibeStore.getState().addCustomVibe(tag, userId);
    },

    removeCustomVibe: async (tag) => {
      const { userId } = get();
      if (!userId) return;
      await useVibeStore.getState().removeCustomVibe(tag, userId);
    },

    loadAvailabilityForRange: async (startDate, endDate) => {
      const { userId } = get();
      if (!userId) return;
      await useAvailabilityStore.getState().loadAvailabilityForRange(startDate, endDate, userId);
    },

    initializeWeekAvailability: async () => {
      const { userId } = get();
      await useAvailabilityStore.getState().initializeWeekAvailability(userId, async () => {
        if (userId) await useAvailabilityStore.getState().loadProfileAndAvailability(userId);
      });
    },

    loadFriends: async () => {
      const { userId } = get();
      if (!userId) return;
      await useFriendsStore.getState().loadFriends(userId);
    },

    loadPlans: async () => {
      const { userId, userTimezone } = get();
      if (!userId) return;
      await usePlansStore.getState().loadPlans(userId, userTimezone);
    },

    loadProfileAndAvailability: async () => {
      const { userId } = get();
      if (!userId) return;
      await useAvailabilityStore.getState().loadProfileAndAvailability(userId);
    },
  };
});
