/**
 * New trip — modal-presented form.
 *
 * Reached via "+ New trip" button on the Plans tab.
 *
 * Fields:
 *   - Name (required)
 *   - Destination/location (optional)
 *   - Start date — chip selector across the next 30 days
 *   - End date — duration chips relative to start (1–14 days)
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, addDays, isSameDay, isToday, isTomorrow, differenceInDays, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, Plane } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { setTripLocationRange } from '@/lib/tripBusy';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { FriendSearchSelect } from '@/components/new-trip/FriendSearchSelect';
import { TimeWheelPicker } from '@/components/primitives/TimeWheelPicker';
import { hourToTimeString, parseTimeToHour } from '@/lib/planSlotCoverage';
import { formatHour12 } from '@/lib/tripTimes';
import { rankFriendsByPlanHistory } from '@/lib/friendSuggestions';
import { TC } from '@/lib/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const START_DATE_CHIPS = 30;     // next 30 days for start
const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 10, 14] as const;

function dateLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

function Chip({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl px-3 py-2.5 border active:opacity-70 ${
        selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
      }`}
    >
      <View className="flex-row items-center gap-1.5">{children}</View>
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function NewTripScreen() {
  const { user } = useAuth();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const isEditing = !!tripId;
  const queryClient     = useQueryClient();
  const setUserId       = usePlannerStore((s) => s.setUserId);
  const friends         = usePlannerStore((s) => s.friends);
  const plans           = usePlannerStore((s) => s.plans);

  // Ensure planner store has userId for the block-availability writes
  useMemo(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  const connectedFriends = useMemo(
    () => friends.filter((f) => f.status === 'connected' && f.friendUserId),
    [friends],
  );

  // Recent / frequently-seen friends — suggested shortlist shown (when the
  // search box is empty) for both "Traveling with" and "Friends to see".
  const friendShortlist = useMemo(
    () => rankFriendsByPlanHistory(plans, connectedFriends, 5),
    [plans, connectedFriends],
  );

  const [name,     setName]     = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [duration,  setDuration]  = useState<number>(3);
  // Optional arrival/departure times (fractional hours). null = all day —
  // trips stay all-day unless the user opts into specific times (XPE-285).
  const [arrivalHour,   setArrivalHour]   = useState<number | null>(null);
  const [departureHour, setDepartureHour] = useState<number | null>(null);
  const [timeOpen, setTimeOpen] = useState<null | 'arrival' | 'departure'>(null);
  // Travel companions → trip_participants; people to visit → priority_friend_ids
  const [companionIds, setCompanionIds] = useState<Set<string>>(new Set());
  const [visitIds,     setVisitIds]     = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  // When editing, remember the original away-range so a date change can clear it
  const [loadingTrip, setLoadingTrip] = useState(isEditing);
  const [originalRange, setOriginalRange] = useState<{ start: Date; end: Date } | null>(null);
  // Companions present before this edit — so we only notify the newly added ones
  const [originalCompanionIds, setOriginalCompanionIds] = useState<Set<string>>(new Set());

  const toggleId = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
      (friendUserId: string) =>
        setter((prev) => {
          const next = new Set(prev);
          if (next.has(friendUserId)) next.delete(friendUserId);
          else next.add(friendUserId);
          return next;
        }),
    [],
  );

  // Load the existing trip when editing
  useEffect(() => {
    if (!isEditing || !user?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data, error: loadErr }, { data: participants }] = await Promise.all([
        supabase
          .from('trips')
          .select('name, location, start_date, end_date, arrival_time, departure_time, priority_friend_ids')
          .eq('id', tripId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('trip_participants')
          .select('friend_user_id')
          .eq('trip_id', tripId),
      ]);
      if (cancelled) return;
      if (loadErr || !data) {
        Alert.alert('Could not load trip', 'Please try again.');
        router.back();
        return;
      }
      const start = parseISO(data.start_date);
      const end = parseISO(data.end_date);
      setName(data.name ?? '');
      setLocation(data.location ?? '');
      setStartDate(start);
      setDuration(Math.max(1, differenceInDays(end, start) + 1));
      setArrivalHour(parseTimeToHour((data as any).arrival_time));
      setDepartureHour(parseTimeToHour((data as any).departure_time));
      setVisitIds(new Set((data.priority_friend_ids ?? []) as string[]));
      const companionSet = new Set<string>((participants ?? []).map((p: any) => p.friend_user_id));
      setCompanionIds(companionSet);
      setOriginalCompanionIds(new Set(companionSet));
      setOriginalRange({ start, end });
      setLoadingTrip(false);
    })();
    return () => { cancelled = true; };
  }, [isEditing, tripId, user?.id]);

  // Start-date options: next 30 days
  const startDateOptions = useMemo(
    () => Array.from({ length: START_DATE_CHIPS }, (_, i) => addDays(new Date(), i)),
    [],
  );

  const endDate = useMemo(
    () => addDays(startDate, Math.max(0, duration - 1)),
    [startDate, duration],
  );

  // Fire-and-forget push/email to companions just added to this trip. Reuses
  // the shared on-plan-created edge function (type: 'trip'), same as the PWA.
  const notifyNewCompanions = useCallback(
    async (participantIds: string[], locationLabel: string | null, datesLabel: string) => {
      if (!user?.id || participantIds.length === 0) return;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const projectId = process.env.EXPO_PUBLIC_SUPABASE_PROJECT_ID;
        if (!token || !projectId) return;
        await fetch(`https://${projectId}.supabase.co/functions/v1/on-plan-created`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'trip',
            creator_id: user.id,
            participant_ids: participantIds,
            trip_location: locationLabel ?? undefined,
            trip_dates: datesLabel,
          }),
        });
      } catch {
        // Best-effort — never block the save on a notification failure.
      }
    },
    [user?.id],
  );

  const handleSubmit = useCallback(async () => {
    if (!user?.id) return;
    if (!name.trim()) {
      setError('Trip name is required');
      return;
    }
    // Same-day trip: being there requires arriving before you leave.
    if (duration === 1 && arrivalHour != null && departureHour != null && departureHour <= arrivalHour) {
      setError('Departure must be after arrival for a one-day trip');
      return;
    }
    setError(null);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const loc = location.trim() || null;
      const visitArr = [...visitIds];
      const companionArr = [...companionIds];
      // Companions added in this session (all of them for a brand-new trip)
      const newCompanionIds = companionArr.filter((id) => !originalCompanionIds.has(id));
      let resolvedTripId: string | null = tripId ?? null;
      if (isEditing && tripId) {
        const { error: updateErr } = await supabase
          .from('trips')
          .update({
            name:       name.trim(),
            location:   loc,
            start_date: format(startDate, 'yyyy-MM-dd'),
            end_date:   format(endDate, 'yyyy-MM-dd'),
            priority_friend_ids: visitArr,
          } as any)
          .eq('id', tripId)
          .eq('user_id', user.id);
        if (updateErr) throw updateErr;

        // Sync travel companions: clear then re-insert the current selection.
        await supabase.from('trip_participants').delete().eq('trip_id', tripId);
        if (companionArr.length > 0) {
          await supabase.from('trip_participants').insert(
            companionArr.map((fid) => ({ trip_id: tripId, friend_user_id: fid })) as any,
          );
        }

        // If the dates moved, clear the old away-range first so stale days
        // don't stay marked "away", then stamp the new range.
        if (originalRange) {
          await setTripLocationRange(user.id, originalRange.start, originalRange.end, null, false, tripId);
        }
        await setTripLocationRange(user.id, startDate, endDate, loc, true, tripId);
      } else {
        const { data: created, error: insertErr } = await supabase
          .from('trips')
          .insert({
            user_id:    user.id,
            name:       name.trim(),
            location:   loc,
            start_date: format(startDate, 'yyyy-MM-dd'),
            end_date:   format(endDate, 'yyyy-MM-dd'),
            needs_return_date: false,
            priority_friend_ids: visitArr,
          } as any)
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        resolvedTripId = created?.id ?? null;

        // Add travel companions on the new trip.
        if (created?.id && companionArr.length > 0) {
          await supabase.from('trip_participants').insert(
            companionArr.map((fid) => ({ trip_id: created.id, friend_user_id: fid })) as any,
          );
        }

        // Mark the trip days as a location change ("away" + destination) —
        // availability slots stay untouched so the trip never blocks plans
        await setTripLocationRange(user.id, startDate, endDate, loc, true, resolvedTripId);
      }

      // Notify companions who were just added (skips ones already on the trip).
      if (resolvedTripId && newCompanionIds.length > 0) {
        const datesLabel = `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d')}`;
        void notifyNewCompanions(newCompanionIds, loc, datesLabel);
      }

      // Refresh anything that lists trips
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      if (isEditing) await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error(isEditing ? 'Update trip failed' : 'Create trip failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(isEditing ? 'Could not update trip' : 'Could not create trip', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user?.id, isEditing, tripId, name, location, startDate, endDate, originalRange, companionIds, visitIds, originalCompanionIds, notifyNewCompanions, queryClient]);

  const canSubmit = name.trim().length > 0 && !saving && !loadingTrip;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">{isEditing ? 'Edit trip' : 'New trip'}</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              canSubmit ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {saving ? 'Saving…' : isEditing ? 'Save' : 'Create'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-5 gap-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Intro */}
          <View className="bg-primary/8 rounded-2xl px-4 py-3 flex-row items-center gap-2.5">
            <Plane size={16} color="#23744D" strokeWidth={2} />
            <Text className="font-sans text-xs text-primary flex-1 leading-relaxed">
              Trips block your availability for the dates you're away.
              Friends will see you're traveling.
            </Text>
          </View>

          {/* Switch to proposal flow — not offered while editing */}
          {!isEditing && (
          <Pressable
            onPress={() => router.replace('/(app)/new-trip-proposal')}
            className="flex-row items-center justify-between bg-card border border-border/30 rounded-xl px-4 py-3 active:opacity-80 shadow-sm"
          >
            <View className="flex-1 gap-0.5">
              <Text className="font-sans text-sm font-semibold text-foreground">
                Going with friends?
              </Text>
              <Text className="font-sans text-[11px] text-muted-foreground">
                Propose dates and let them vote on the timing.
              </Text>
            </View>
            <Text className="font-sans text-xs font-semibold text-primary">
              Propose →
            </Text>
          </Pressable>
          )}

          {/* Name */}
          <View>
            <FieldLabel>Trip name</FieldLabel>
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); setError(null); }}
              placeholder="e.g. Lisbon for a week"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
              maxLength={80}
              autoFocus
            />
            {error && (
              <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                {error}
              </Text>
            )}
          </View>

          {/* Destination */}
          <View>
            <FieldLabel>Destination (optional)</FieldLabel>
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              placeholder="City, country, or region"
              types="(cities)"
            />
          </View>

          {/* Start date */}
          <View>
            <FieldLabel>Leaving</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-0.5 pb-1"
            >
              {startDateOptions.map((d) => {
                const selected = isSameDay(d, startDate);
                return (
                  <Chip
                    key={d.toISOString()}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setStartDate(d); }}
                  >
                    <View className="items-center">
                      <Text
                        className={`font-sans text-[10px] font-semibold uppercase tracking-wider ${
                          selected ? 'text-white/80' : 'text-muted-foreground'
                        }`}
                      >
                        {dateLabel(d)}
                      </Text>
                      <Text
                        className={`font-display text-base ${
                          selected ? 'text-white' : 'text-foreground'
                        }`}
                      >
                        {format(d, 'MMM d')}
                      </Text>
                    </View>
                  </Chip>
                );
              })}
            </ScrollView>
          </View>

          {/* Duration */}
          <View>
            <FieldLabel>How long</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {DURATION_OPTIONS.map((days) => {
                const selected = duration === days;
                return (
                  <Chip
                    key={days}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setDuration(days); }}
                  >
                    <Text
                      className={`font-sans text-xs font-semibold ${
                        selected ? 'text-white' : 'text-foreground'
                      }`}
                    >
                      {days} {days === 1 ? 'day' : 'days'}
                    </Text>
                  </Chip>
                );
              })}
            </View>
          </View>

          {/* Traveling with — companions on the trip (search + suggestions) */}
          <FriendSearchSelect
            title="Traveling with"
            hint="Search to add friends coming along on this trip."
            connectedFriends={connectedFriends}
            selectedIds={companionIds}
            suggestedFriends={friendShortlist}
            onToggle={toggleId(setCompanionIds)}
          />

          {/* Friends to see — who you're visiting / hope to meet up with */}
          <FriendSearchSelect
            title="Friends to see"
            hint="Search to add friends you're visiting or hope to catch up with there."
            connectedFriends={connectedFriends}
            selectedIds={visitIds}
            suggestedFriends={friendShortlist}
            onToggle={toggleId(setVisitIds)}
          />

          {/* Summary preview */}
          <View className="bg-card rounded-2xl border border-border/30 p-4 gap-1 shadow-sm">
            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Trip will be
            </Text>
            <Text className="font-display text-base text-foreground mt-1">
              {format(startDate, 'EEE, MMM d')} – {format(endDate, 'EEE, MMM d')}
            </Text>
            <Text className="font-sans text-xs text-muted-foreground">
              {duration} {duration === 1 ? 'day' : 'days'} away
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
