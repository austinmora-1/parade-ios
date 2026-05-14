import { create } from 'zustand';
import { Plan, Friend, DayAvailability, Vibe, TimeSlot, LocationStatus, ActivityType, VibeType, PlanStatus } from '@/types/planner';
import { addDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getUserTimezone } from '@/lib/timezone';
import { getCachedDashboard, setCachedDashboard } from '@/lib/dashboardCache';

import type { DashboardData, DefaultAvailabilitySettings } from './helpers/types';
import { createDefaultAvailability, mapAvailabilityRow, buildAvailabilityMap } from './helpers/mapAvailability';
import { buildParticipantsMap, deduplicatePlanRows, mapRawPlanToModel } from './helpers/mapPlans';
import { mapOutgoingFriendships, mapIncomingFriendships, dedupeFriends } from './helpers/mapFriends';

import { usePlansStore } from './plansStore';
import { useFriendsStore } from './friendsStore';
import { useAvailabilityStore } from './availabilityStore';
import { useVibeStore } from './vibeStore';

// ── Transform raw RPC data into store state (exported for loadMorePlans) ─────
export function transformDashboardData(rpcData: unknown, userId: string) {
  const d = rpcData as unknown as DashboardData;

  const participantsMap = buildParticipantsMap(d.plan_participants || []);
  const profilesMap: Record<string, string> = {};
  const profileAvatarsMap: Record<string, string | null> = {};
  for (const p of (d.participant_profiles || [])) {
    if (p.user_id) {
      profilesMap[p.user_id] = p.display_name || 'Friend';
      profileAvatarsMap[p.user_id] = p.avatar_url;
    }
  }

  const profile = d.profile;
  const homeAddr = profile?.home_address || null;
  const explicitTz = profile?.timezone || null;

  const availData = d.availability || [];
  const todayStrForTz = format(new Date(), 'yyyy-MM-dd');
  const todayAvailRaw = availData.find(a => a.date === todayStrForTz);
  const todayLocStatus = (todayAvailRaw?.location_status as LocationStatus) || 'home';
  const todayTripLoc = todayAvailRaw?.trip_location || undefined;
  const viewerTimezone = getUserTimezone(todayLocStatus, homeAddr, todayTripLoc, explicitTz);

  const plansData = deduplicatePlanRows(d.own_plans || [], d.participated_plans || []);
  const plans: Plan[] = plansData.map((p: any) =>
    mapRawPlanToModel(p, userId, participantsMap, profilesMap, profileAvatarsMap, viewerTimezone)
  );

  const outgoingAvatarMap = new Map<string, string | null>(
    (d.outgoing_friend_profiles || []).map(p => [p.user_id, p.avatar_url])
  );
  const incomingProfilesMap = new Map(
    (d.incoming_friend_profiles || []).map(p => [p.user_id, p])
  );
  const outgoingFriends = mapOutgoingFriendships(d.outgoing_friendships || [], outgoingAvatarMap);
  const incomingFriends = mapIncomingFriendships(d.incoming_friendships || [], incomingProfilesMap);
  const friends = dedupeFriends(outgoingFriends, incomingFriends);

  const customTags = profile?.custom_vibe_tags || [];
  const vibeGifUrl = profile?.vibe_gif_url || undefined;
  const currentVibe = profile?.current_vibe
    ? {
        type: profile.current_vibe as VibeType,
        customTags: customTags.length > 0 ? customTags : undefined,
        gifUrl: vibeGifUrl,
      }
    : null;

  const defaultSettings: DefaultAvailabilitySettings = {
    workDays: profile?.default_work_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    workStartHour: profile?.default_work_start_hour ?? 9,
    workEndHour: profile?.default_work_end_hour ?? 17,
    defaultStatus: (profile?.default_availability_status as 'free' | 'unavailable') || 'free',
    defaultVibes: profile?.default_vibes || [],
  };

  const availDataMap = new Map<string, typeof availData[0]>();
  for (const a of availData) {
    availDataMap.set(a.date, a);
  }

  const start = addDays(new Date(), -7);
  const windowDays = 42;
  const allDates = Array.from({ length: windowDays }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
  const availabilityWithDefaults: DayAvailability[] = allDates.map((dateStr, i) => {
    const existing = availDataMap.get(dateStr);
    const date = addDays(start, i);
    if (existing) return mapAvailabilityRow(existing, date);
    return createDefaultAvailability(date, defaultSettings);
  });

  const availabilityMap = buildAvailabilityMap(availabilityWithDefaults);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayAvail = availabilityMap[todayStr];
  const todayLocationStatus = todayAvail?.locationStatus || 'home';

  return {
    plans,
    friends,
    availability: availabilityWithDefaults,
    availabilityMap,
    currentVibe,
    locationStatus: todayLocationStatus,
    defaultSettings,
    homeAddress: homeAddr,
    userTimezone: viewerTimezone,
    hasMorePlans: !!(d as any).has_more_plans,
  };
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

// ── Facade store ─────────────────────────────────────────────────────────────
export const usePlannerStore = create<PlannerState>((set, get) => {
  // Subscribe to domain store changes and mirror into facade
  usePlansStore.subscribe(() => syncFromDomainStores(set));
  useFriendsStore.subscribe(() => syncFromDomainStores(set));
  useAvailabilityStore.subscribe(() => syncFromDomainStores(set));
  useVibeStore.subscribe(() => syncFromDomainStores(set));

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
      const { userId, lastFetchedAt } = get();
      if (!userId) {
        set({ isLoading: false, initialLoadDone: true });
        return;
      }

      if (!force && lastFetchedAt && Date.now() - lastFetchedAt < 120_000) {
        return;
      }

      set({ isLoading: true, loadError: null });

      // Stale-while-revalidate
      try {
        const cached = await getCachedDashboard(userId);
        if (cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
          const stale = transformDashboardData(cached.data, userId);
          // Push to domain stores
          usePlansStore.setState({ plans: stale.plans, hasMorePlans: stale.hasMorePlans });
          useFriendsStore.setState({ friends: stale.friends });
          useAvailabilityStore.setState({
            availability: stale.availability,
            availabilityMap: stale.availabilityMap,
            locationStatus: stale.locationStatus,
            defaultSettings: stale.defaultSettings,
            homeAddress: stale.homeAddress,
          });
          useVibeStore.setState({ userTimezone: stale.userTimezone });
          useVibeStore.getState().bootstrapVibe(stale.currentVibe, userId);
          set({ isLoading: false, lastFetchedAt: cached.cachedAt, initialLoadDone: true });
          if (!force && Date.now() - cached.cachedAt < 120_000) {
            return;
          }
        }
      } catch {
        // Cache miss
      }

      try {
        let rpcData: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await withTimeout(
            Promise.resolve(supabase.rpc('get_dashboard_data' as any, {
              p_user_id: userId,
              p_plan_cursor: null,
            })),
            8000,
            'Dashboard data request'
          );
          const { data, error } = response as { data: any; error: any };
          if (!error) {
            rpcData = data;
            break;
          }
          lastError = error;
          console.warn(`get_dashboard_data attempt ${attempt + 1} failed:`, error.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }

        if (!rpcData) {
          console.error('get_dashboard_data failed after retries:', lastError);
          let fallbackOk = true;
          try {
            await withTimeout(
              Promise.all([
                get().loadFriends(),
                get().loadPlans(),
                get().loadProfileAndAvailability(),
              ]),
              10000,
              'Fallback dashboard loaders'
            );
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
          return;
        }

        const transformed = transformDashboardData(rpcData, userId);
        // Push to domain stores
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
        set({ isLoading: false, lastFetchedAt: Date.now(), loadError: null, initialLoadDone: true });

        setCachedDashboard(userId, rpcData).catch(() => {});
      } catch (error) {
        console.error('loadAllData error:', error);
        set({
          isLoading: false,
          loadError: (error as Error)?.message || 'We couldn’t load your dashboard. Please try again.',
          initialLoadDone: true,
        });
      }
    },

    forceRefresh: async () => {
      set({ lastFetchedAt: null });
      await get().loadAllData();
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
