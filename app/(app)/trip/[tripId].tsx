/**
 * Trip detail — PWA-aligned with edit/delete menu for the owner.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  Plane,
  Home,
  Calendar,
  MapPin,
  Clock,
  Users,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { format, differenceInDays, isAfter, eachDayOfInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { setTripLocationRange, toLocalDate } from '@/lib/tripBusy';
import { resetCalendarSyncCache, syncCalendarBusyTimes } from '@/lib/calendarSync';
import * as ExpoCalendar from 'expo-calendar';
import { TripActivitiesSection } from '@/components/trip/TripActivitiesSection';
import { UnifiedShareSheet } from '@/components/share/UnifiedShareSheet';
import { TC } from '@/lib/theme';
import { PARADE_GREEN, EMBER } from '@/lib/colors';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Avatar } from '@/components/primitives/Avatar';
import { TIME_SLOT_LABELS, TimeSlot } from '@/types/planner';
import { getTravelKind } from '@/lib/visitVsTrip';
import { formatCityForDisplay } from '@/lib/formatCity';
import { formatTripTime, tripDayTravelLabel, tripTimesSummary } from '@/lib/tripTimes';

// ─── Data ─────────────────────────────────────────────────────────────────────

// Canonical slot order (early-morning → late-night) for the per-day view.
const ALL_TIME_SLOTS = Object.keys(TIME_SLOT_LABELS) as TimeSlot[];

interface TripPerson {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

function useTrip(tripId: string) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: async () => {
      const { data: trip, error } = await supabase
        .from('trips')
        .select(
          'id, user_id, name, location, start_date, end_date, arrival_time, departure_time, priority_friend_ids, proposal_id',
        )
        .eq('id', tripId)
        .maybeSingle();
      if (error) throw error;
      // Trip was deleted / never existed (or is hidden by RLS) — surface the
      // screen's "Trip not found" state instead of throwing a PGRST116 that
      // gets logged as a crash.
      if (!trip) return { trip: null, companions: [], friendsToSee: [], going: [] };

      // Travel companions live in trip_participants; friends to see are the
      // trip's priority_friend_ids. Resolve both to display names + avatars.
      const { data: participants } = await supabase
        .from('trip_participants')
        .select('friend_user_id')
        .eq('trip_id', tripId);
      const companionIds = (participants ?? []).map((p: any) => p.friend_user_id);
      const friendIds = (trip as any).priority_friend_ids ?? [];

      // Accepted RSVPs for proposal-backed trips (owner always going).
      // Statuses actually written (go-somewhere.tsx): creator = 'voted',
      // invited friends = 'pending' (invited but hasn't accepted — votes land
      // in trip_proposal_votes without flipping this). 'accepted' kept for
      // forward-compat with the PWA-aligned model.
      let goingIds: string[] = [];
      if ((trip as any).proposal_id) {
        const { data: rsvps } = await supabase
          .from('trip_proposal_participants')
          .select('user_id, status')
          .eq('proposal_id', (trip as any).proposal_id)
          .in('status', ['accepted', 'voted']);
        const acceptedIds = (rsvps ?? []).map((r: any) => r.user_id);
        goingIds = [...new Set([(trip as any).user_id, ...acceptedIds])] as string[];
      }

      const allIds = [...new Set([...companionIds, ...friendIds, ...goingIds])] as string[];
      let profileMap = new Map<string, TripPerson>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase.rpc('get_display_names_for_users', {
          p_user_ids: allIds,
        });
        for (const p of (profiles ?? []) as TripPerson[]) {
          profileMap.set(p.user_id, p);
        }
      }

      const toPeople = (ids: string[]) =>
        ids.map((id) => profileMap.get(id)).filter(Boolean) as TripPerson[];

      return {
        trip,
        companions: toPeople(companionIds),
        friendsToSee: toPeople(friendIds),
        going: toPeople(goingIds),
      };
    },
  });
}

// People row for the "Who's in" list (companions + friends to see)
function PersonRow({
  person,
  badge,
}: {
  person: TripPerson;
  badge?: React.ReactNode;
}) {
  const name = person.display_name || [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Friend';
  return (
    <Pressable
      onPress={() => router.push(`/(app)/friend/${person.user_id}`)}
      className="flex-row items-center gap-2.5 rounded-xl border border-border/30 bg-card p-2.5 active:opacity-70"
    >
      <Avatar
        url={person.avatar_url}
        firstName={person.first_name}
        lastName={person.last_name}
        displayName={person.display_name}
        size="sm"
      />
      <Text className="font-sans text-sm text-foreground font-medium flex-1" numberOfLines={1}>
        {name}
      </Text>
      {badge}
    </Pressable>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <View className="rounded-xl border border-border/30 bg-card p-4">
      <Text className="font-sans text-xs text-muted-foreground text-center">{text}</Text>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center px-4 py-3.5 gap-3">
      {icon}
      <Text className="font-sans text-xs text-muted-foreground w-20 uppercase tracking-wide">
        {label}
      </Text>
      <Text className="font-sans text-sm text-foreground font-medium flex-1">
        {children as string}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useTrip(tripId);
  const trip = data?.trip as any;
  const companions = data?.companions ?? [];
  const friendsToSee = data?.friendsToSee ?? [];
  const going = data?.going ?? [];
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const availabilityMap = useAvailabilityStore((s) => s.availabilityMap);
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const isOwner = trip?.user_id === user?.id;

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete trip?',
      'This will remove the trip permanently. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              // 1. Clear the location change FIRST — if this fails, the trip
              //    row survives and the user can simply retry the delete.
              //    (Trips are a location change only; slots are untouched.)
              if (user?.id && trip?.start_date && trip?.end_date) {
                await setTripLocationRange(
                  user.id,
                  trip.start_date,
                  trip.end_date,
                  null,
                  false, // back home
                );
              }

              // 2. Delete the trip row; on failure restore the location so it
              //    stays consistent with the surviving trip.
              const { error: delErr } = await supabase
                .from('trips')
                .delete()
                .eq('id', tripId);
              if (delErr) {
                if (user?.id && trip?.start_date && trip?.end_date) {
                  try {
                    await setTripLocationRange(user.id, trip.start_date, trip.end_date, trip.location ?? null, true, tripId);
                  } catch { /* best-effort restore */ }
                }
                throw delErr;
              }

              // 3. Re-mark any underlying calendar event slots as busy. Reset
              //    the sync cache so reconciliation re-discovers every event.
              try {
                const { status } = await ExpoCalendar.getCalendarPermissionsAsync();
                if (status === 'granted') {
                  resetCalendarSyncCache();
                  await syncCalendarBusyTimes(setAvailability);
                }
              } catch {
                /* best-effort */
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err: any) {
              console.error('Delete trip failed', err);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Could not delete trip', err?.message ?? 'Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
    // NOTE: `trip` must be a dep — with only [tripId] this closure captured
    // trip=undefined from the loading render forever, so the away-range clear
    // was silently skipped and every deleted trip stranded its days as "away"
    // (trip_id nulled by the FK, location_status left behind).
  }, [tripId, trip, user?.id, setAvailability]);

  // ── Computed display values ────────────────────────────────────────────────
  let dateLabel = '';
  let durationLabel = '';
  if (trip?.start_date && trip?.end_date) {
    // Parse as LOCAL midnight — raw `new Date('yyyy-MM-dd')` is UTC midnight,
    // which renders a day early in negative-offset zones (XPE-264). Matches the
    // per-day availability + the share sheet so displayed dates agree everywhere.
    const start = toLocalDate(trip.start_date);
    const end = toLocalDate(trip.end_date);
    const sameMonth = format(start, 'MMM') === format(end, 'MMM');
    dateLabel = sameMonth
      ? `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`
      : `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    const days = differenceInDays(end, start) + 1;
    durationLabel = `${days} ${days === 1 ? 'day' : 'days'}`;
  }

  const isUpcoming = trip?.start_date
    ? isAfter(toLocalDate(trip.start_date), new Date())
    : false;

  // Visit (hosting at home → green/Home) vs trip (away → ember/Plane)
  const isVisit = trip ? getTravelKind(trip.location, [homeAddress]) === 'visit' : false;
  const accentColor = isVisit ? PARADE_GREEN : EMBER;
  const HeroIcon = isVisit ? Home : Plane;
  const cityLabel = trip?.location
    ? formatCityForDisplay(trip.location) || trip.location
    : null;

  // "Arrives 3:00 PM · Departs 11:00 AM" — null for all-day trips (XPE-285)
  const timesLabel = trip ? tripTimesSummary(trip as any) : null;

  const tripDays =
    trip?.start_date && trip?.end_date
      ? eachDayOfInterval({
          start: toLocalDate(trip.start_date),
          end: toLocalDate(trip.end_date),
        })
      : [];

  // XPE-283 — one "Who's in" list: companions + friends-to-see deduped by
  // user_id. Companions sort first and win the badge when someone is in both.
  const companionIdSet = new Set(companions.map((p) => p.user_id));
  const whosIn: { person: TripPerson; role: 'companion' | 'seeing' }[] = [
    ...companions.map((p) => ({ person: p, role: 'companion' as const })),
    ...friendsToSee
      .filter((p) => !companionIdSet.has(p.user_id))
      .map((p) => ({ person: p, role: 'seeing' as const })),
  ];

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        rightAction={
          isOwner && !isLoading && !error ? (
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push(`/(app)/new-trip?tripId=${tripId}`);
                }}
                accessibilityLabel="Edit trip"
                className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
              >
                <Pencil size={20} color={TC.icon} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShareOpen(true);
                }}
                accessibilityLabel="Share trip"
                className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
              >
                <Share2 size={20} color={TC.icon} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                accessibilityLabel="Delete trip"
                className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
              >
                <Trash2 size={20} color={EMBER} strokeWidth={2} />
              </Pressable>
            </View>
          ) : undefined
        }
      />

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : error || !trip ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            {error ? 'Could not load this trip.' : 'Trip not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pb-10 gap-4 pt-2"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#23744D" />
          }
        >
          {/* Hero card — accent + icon reflect visit (home) vs trip (away) */}
          <View className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm">
            <View style={{ width: 4, backgroundColor: accentColor }} />
            <View className="flex-1 px-5 py-4 gap-1.5">
              <View className="flex-row items-center gap-1.5">
                <HeroIcon size={14} color={accentColor} strokeWidth={2} />
                <Text
                  className="font-sans text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: accentColor }}
                >
                  {isVisit ? 'Visit' : 'Trip'}
                </Text>
                {isUpcoming && (
                  <View className="ml-auto bg-primary/10 rounded-full px-2 py-0.5">
                    <Text className="font-sans text-[10px] font-semibold text-primary">
                      Upcoming
                    </Text>
                  </View>
                )}
              </View>
              <Text className="font-display text-2xl text-foreground leading-tight">
                {trip.name || (cityLabel ? `${isVisit ? 'Visit' : 'Trip'} to ${cityLabel}` : 'Untitled trip')}
              </Text>
              {cityLabel && (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MapPin size={12} color="#929298" strokeWidth={1.75} />
                  <Text className="font-sans text-sm text-muted-foreground">
                    {cityLabel}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Details card */}
          <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
            <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Dates">
              {dateLabel || '—'}
            </DetailRow>
            {durationLabel && (
              <>
                <View className="h-px bg-border/30 mx-4" />
                <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Length">
                  {durationLabel}
                </DetailRow>
              </>
            )}
            {timesLabel && (
              <>
                <View className="h-px bg-border/30 mx-4" />
                <DetailRow icon={<Clock size={15} color="#929298" strokeWidth={1.75} />} label="Times">
                  {timesLabel}
                </DetailRow>
              </>
            )}
          </View>

          {/* Per-day availability (XPE-284) — each trip day's free slots from
              the owner's availabilityMap (slot free when !== false, missing day
              = fully free — same semantics as computeOpenWeekends). Owner-only:
              other viewers have no availability data. */}
          {isOwner && tripDays.length > 0 && (
            <View className="gap-2">
              <View className="flex-row items-center gap-1.5">
                <Clock size={15} color="#929298" strokeWidth={1.75} />
                <Text className="font-display text-sm font-semibold text-foreground">
                  Availability
                </Text>
              </View>
              <View className="gap-1.5">
                {tripDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const daySlots = availabilityMap[dateStr]?.slots;
                  const freeSlots = ALL_TIME_SLOTS.filter(
                    (slot) => daySlots?.[slot] !== false,
                  );
                  // Travel-day annotation — "Arriving ~3:00 PM" on the first
                  // day / "Leaving ~11:00 AM" on the last, when times are set
                  const travelLabel = trip ? tripDayTravelLabel(trip as any, dateStr) : null;
                  return (
                    <View
                      key={dateStr}
                      className="flex-row items-center gap-2.5 rounded-xl border border-border/30 bg-card p-2.5"
                    >
                      <View
                        className="items-center rounded-lg bg-away/10 px-2.5 py-1.5"
                        style={{ minWidth: 44 }}
                      >
                        <Text className="font-sans text-[10px] text-muted-foreground">
                          {format(day, 'EEE')}
                        </Text>
                        <Text className="font-sans text-sm font-medium text-foreground">
                          {format(day, 'd')}
                        </Text>
                      </View>
                      <View className="flex-1 gap-1">
                        {travelLabel && (
                          <View className="flex-row items-center gap-1">
                            <Plane size={11} color={EMBER} strokeWidth={2} />
                            <Text className="font-sans text-[11px] font-medium" style={{ color: EMBER }}>
                              {travelLabel}
                            </Text>
                          </View>
                        )}
                        {freeSlots.length === 0 ? (
                          <Text className="font-sans text-xs text-muted-foreground">
                            Busy
                          </Text>
                        ) : freeSlots.length === ALL_TIME_SLOTS.length ? (
                          <Text className="font-sans text-xs font-medium text-primary">
                            Available all day
                          </Text>
                        ) : (
                          <View className="flex-row flex-wrap gap-1.5">
                            {freeSlots.map((slot) => (
                              <View
                                key={slot}
                                className="rounded-full bg-primary/10 px-2 py-0.5"
                              >
                                <Text className="font-sans text-[10px] font-medium text-primary">
                                  {TIME_SLOT_LABELS[slot].label}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Going — accepted RSVPs on proposal-backed trips (XPE-282) */}
          {trip.proposal_id && going.length > 0 && (
            <View className="gap-2">
              <View className="flex-row items-center gap-1.5">
                <Users size={15} color="#929298" strokeWidth={1.75} />
                <Text className="font-display text-sm font-semibold text-foreground">
                  Going ({going.length})
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {going.map((p) => (
                  <Pressable
                    key={p.user_id}
                    onPress={() => router.push(`/(app)/friend/${p.user_id}`)}
                    accessibilityLabel={`View ${p.display_name || 'friend'}`}
                    className="active:opacity-70"
                  >
                    <Avatar
                      url={p.avatar_url}
                      firstName={p.first_name}
                      lastName={p.last_name}
                      displayName={p.display_name}
                      size="md"
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Who's in — companions + friends to see, deduped (XPE-283) */}
          <View className="gap-2">
            <View className="flex-row items-center gap-1.5">
              <Users size={15} color="#929298" strokeWidth={1.75} />
              <Text className="font-display text-sm font-semibold text-foreground">
                Who’s in ({whosIn.length})
              </Text>
            </View>
            {whosIn.length > 0 ? (
              <View className="gap-1.5">
                {whosIn.map(({ person, role }) => (
                  <PersonRow
                    key={person.user_id}
                    person={person}
                    badge={
                      role === 'companion' ? (
                        <View className="flex-row items-center gap-0.5">
                          <Plane size={10} color={EMBER} strokeWidth={2} />
                          <Text className="font-sans text-[10px] font-medium" style={{ color: EMBER }}>
                            Companion
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-0.5">
                          <Users size={10} color={PARADE_GREEN} strokeWidth={2} />
                          <Text className="font-sans text-[10px] font-medium" style={{ color: PARADE_GREEN }}>
                            Seeing
                          </Text>
                        </View>
                      )
                    }
                  />
                ))}
              </View>
            ) : (
              <SectionEmpty text="Going solo on this one — bring someone along?" />
            )}
          </View>

          {/* Activity suggestions — carries over from a finalized proposal */}
          {trip.proposal_id && (
            <TripActivitiesSection proposalId={trip.proposal_id} />
          )}
        </ScrollView>
      )}

      {trip && user && (
        <UnifiedShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          heading="Share trip"
          subheading={
            trip.proposal_id
              ? 'Anyone with the link can ask to join'
              : `Let friends know you’ll be ${cityLabel ? `in ${cityLabel}` : 'away'}`
          }
          emailSubject={`Join me${trip.name ? `: ${trip.name}` : ' on Parade'}`}
          shareTitle={trip.name || 'Parade trip'}
          resolve={async () => {
            const city = trip.location
              ? formatCityForDisplay(trip.location) || trip.location
              : null;
            const title = trip.name || (city ? `Trip to ${city}` : 'my trip');
            // Solo trip: no join flow — share a descriptive note + app link.
            if (!trip.proposal_id) {
              const dateRange = `${format(toLocalDate(trip.start_date), 'MMM d')} – ${format(
                toLocalDate(trip.end_date),
                'MMM d',
              )}`;
              // Share the ETA when one is set (XPE-275)
              const eta = formatTripTime((trip as any).arrival_time);
              return {
                link: 'https://helloparade.app',
                message: `I’ll be away for "${title}" (${dateRange}${eta ? `, arriving ~${eta}` : ''}). Find me on Parade`,
              };
            }
            const { data, error } = await supabase
              .from('trip_proposal_invites')
              .insert({ proposal_id: trip.proposal_id, trip_id: trip.id, invited_by: user.id } as any)
              .select('invite_token')
              .single();
            if (error || !data) return null;
            return {
              link: `https://helloparade.app/invite.html?tt=${(data as any).invite_token}&src=ios`,
              message: `Join me for "${title}" on Parade`,
            };
          }}
        />
      )}
    </SafeAreaView>
  );
}
