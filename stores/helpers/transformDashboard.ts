import { Plan, Friend, DayAvailability, LocationStatus, VibeType } from '@/types/planner';
import { addDays, format } from 'date-fns';
import { getUserTimezone } from '@/lib/timezone';

import type { DashboardData, DefaultAvailabilitySettings } from './types';
import { createDefaultAvailability, mapAvailabilityRow, buildAvailabilityMap } from './mapAvailability';
import { buildParticipantsMap, deduplicatePlanRows, mapRawPlanToModel } from './mapPlans';
import { mapOutgoingFriendships, mapIncomingFriendships, dedupeFriends } from './mapFriends';

/**
 * Transform the raw get_dashboard_data RPC payload into store-shaped state.
 * Pure (modulo "today" lookups) — shared by plannerStore.loadAllData and
 * plansStore.loadMorePlans without coupling the two stores to each other.
 */
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
  const friends: Friend[] = dedupeFriends(outgoingFriends, incomingFriends);

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
    socialDays: profile?.preferred_social_days || [],
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
    if (existing) return mapAvailabilityRow(existing, date, defaultSettings);
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
