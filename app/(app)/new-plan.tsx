/**
 * New plan creation — modal-presented screen.
 *
 * Reached via the "+" buttons across the app (Plans tab WeekdayRow,
 * WeekendHero day cells, Day detail screen, eventually a Home FAB).
 *
 * Form fields:
 *   - Title (required)
 *   - Activity chip (curated list)
 *   - Date chip (Today / Tomorrow / next 7 days)
 *   - Time slot pill (6 options)
 *   - Location (optional)
 *   - Notes (optional)
 *   - Invite friends (multi-select from connected list)
 *
 * Submit calls plannerStore.addPlan() which inserts into plans table,
 * inserts plan_participants for invitees, and blocks availability slots.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, TriangleAlert } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { usePods } from '@/hooks/usePods';
import { FieldLabel, OpenInviteBanner, TitleField, NotesField } from '@/components/new-plan/FormBits';
import { ActivityPicker } from '@/components/new-plan/ActivityPicker';
import { DateGrid } from '@/components/new-plan/DateGrid';
import { StartEndTimePicker, defaultTimesForSlot } from '@/components/new-plan/StartEndTimePicker';
import { ExtraOptionsSection } from '@/components/new-plan/ExtraOptionsSection';
import { VisibilityPicker } from '@/components/new-plan/VisibilityPicker';
import { FrequencyPicker } from '@/components/new-plan/FrequencyPicker';
import { FriendSelector } from '@/components/new-plan/FriendSelector';
import type { TimeSlot } from '@/types/planner';
import { TIME_SLOT_LABELS } from '@/types/planner';
import { slotForHour, hourToTimeString, parseTimeToHour } from '@/lib/planSlotCoverage';
import { findOverlappingPlans, freeSlotsOnDate, slotWindowTimes, planWindowLabel } from '@/lib/planOverlap';
import { isCalendarSourced } from '@/lib/planSource';
import { TC } from '@/lib/theme';
import { EMBER } from '@/lib/colors';

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NewPlanScreen() {
  const {
    date: dateParam,
    slot: slotParam,
    planId: planIdParam,
    openInvite: openInviteParam,
    preInvite: preInviteParam,
  } = useLocalSearchParams<{
    date?:       string;
    slot?:       string;
    planId?:     string;
    openInvite?: string;
    preInvite?:  string;
  }>();
  const isOpenInvite = openInviteParam === 'true';
  const { user } = useAuth();
  const addPlan    = usePlannerStore((s) => s.addPlan);
  const updatePlan = usePlannerStore((s) => s.updatePlan);
  const friends    = usePlannerStore((s) => s.friends);
  const plans      = usePlannerStore((s) => s.plans);
  const setUserId  = usePlannerStore((s) => s.setUserId);
  const { data: pods } = usePods();

  const isEditMode = !!planIdParam;

  // Ensure planner store is bootstrapped
  useMemo(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  // ── Load existing plan in edit mode ────────────────────────────────────────
  const { data: existingPlan, isLoading: planLoading } = useQuery({
    enabled: isEditMode,
    queryKey: ['plan', planIdParam, 'edit-load'],
    queryFn: async () => {
      const [{ data: plan, error }, { data: participants }] = await Promise.all([
        supabase.from('plans').select('*').eq('id', planIdParam!).single(),
        supabase
          .from('plan_participants')
          .select('friend_id')
          .eq('plan_id', planIdParam!),
      ]);
      if (error) throw error;
      return { plan, participants: participants ?? [] };
    },
  });

  // ── Form state ─────────────────────────────────────────────────────────────
  const initialDate = dateParam ? parseISO(dateParam) : new Date();
  const initialSlot = (slotParam as TimeSlot) || 'evening';
  const initialTimes = defaultTimesForSlot(initialSlot);

  const [title,    setTitle]    = useState('');
  const [activity, setActivity] = useState<string>('drinks');
  const [date,     setDate]     = useState<Date>(initialDate);
  // Clock-time selection (fractional hours). The chosen start determines the
  // plan's time slot; the start→end span determines which slots show busy.
  const [startHour, setStartHour] = useState<number>(initialTimes.start);
  const [endHour,   setEndHour]   = useState<number>(initialTimes.end);
  const [location, setLocation] = useState('');
  const [notes,    setNotes]    = useState('');
  /** 'private' | 'friends' | `pod:<id>` */
  const [visibility, setVisibility] = useState<string>(
    isOpenInvite ? 'friends' : 'private',
  );
  /** 'once' | 'weekly' | 'biweekly' | 'monthly' */
  const [frequency, setFrequency] = useState<'once' | 'weekly' | 'biweekly' | 'monthly'>('once');
  /** Additional proposal options beyond the primary date/slot above */
  const [extraOptions, setExtraOptions] = useState<Array<{ date: Date; slot: TimeSlot }>>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() => {
    // Seed from ?preInvite=id1,id2 (passed from plan-with-friends sheet)
    if (preInviteParam) {
      return new Set(preInviteParam.split(',').filter(Boolean));
    }
    return new Set();
  });

  // Derived from the clock-time selection
  const timeSlot: TimeSlot = slotForHour(startHour);
  const startTimeStr = hourToTimeString(startHour);
  const endTimeStr = hourToTimeString(endHour);
  const durationMin = Math.round(
    ((endHour <= startHour ? endHour + 24 : endHour) - startHour) * 60,
  );

  // Hydrate form state when editing existing plan
  useEffect(() => {
    if (!existingPlan?.plan) return;
    const p: any = existingPlan.plan;
    setTitle(p.title ?? '');
    setActivity(p.activity ?? 'drinks');
    if (p.date) setDate(new Date(p.date));
    // Prefer explicit clock times; fall back to the slot's default window.
    const startH = parseTimeToHour(p.start_time);
    const endH = parseTimeToHour(p.end_time);
    if (startH != null && endH != null) {
      setStartHour(startH);
      setEndHour(endH);
    } else if (p.time_slot) {
      const t = defaultTimesForSlot(p.time_slot as TimeSlot);
      setStartHour(t.start);
      setEndHour(t.end);
    }
    setLocation(typeof p.location === 'string' ? p.location : p.location?.name ?? '');
    setNotes(p.notes ?? '');
    const friendIds = new Set(
      (existingPlan.participants ?? []).map((row: any) => row.friend_id).filter(Boolean),
    );
    setInvitedIds(friendIds);
  }, [existingPlan]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const connectedFriends = friends.filter(
    (f) => f.status === 'connected' && f.friendUserId,
  );

  // Date chip options: today through +7
  const dateOptions = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)),
    [],
  );

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  const toggleInvite = useCallback((friendUserId: string) => {
    Haptics.selectionAsync();
    setInvitedIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendUserId)) next.delete(friendUserId);
      else next.add(friendUserId);
      return next;
    });
  }, []);

  const addExtraOption = useCallback(() => {
    Haptics.selectionAsync();
    // Add a new option defaulting to next day + same slot
    const lastDate =
      extraOptions.length > 0
        ? extraOptions[extraOptions.length - 1].date
        : date;
    setExtraOptions([
      ...extraOptions,
      { date: addDays(lastDate, 1), slot: timeSlot },
    ]);
  }, [extraOptions, date, timeSlot]);

  // ── Overlap detection (XPE-252/253) ─────────────────────────────────────────
  // Soft warning when this plan's window collides with an existing active plan
  // on the same day; if the clashing plan is yours, offer to move it to a free
  // slot. Reactive — clears itself once the time changes or the plan is moved.
  const overlappingPlans = useMemo(
    () =>
      findOverlappingPlans(
        { date, timeSlot, startTime: startTimeStr, endTime: endTimeStr },
        plans,
        isEditMode ? planIdParam : undefined,
      ),
    [date, timeSlot, startTimeStr, endTimeStr, plans, isEditMode, planIdParam],
  );

  // First free slot to suggest moving a conflicting plan into (never the slot
  // this new plan is taking).
  const suggestedSlot = useMemo(() => {
    const exclude = isEditMode && planIdParam ? [planIdParam] : [];
    return freeSlotsOnDate(date, plans, exclude).find((s) => s !== timeSlot) ?? null;
  }, [date, plans, timeSlot, isEditMode, planIdParam]);

  const handleMovePlan = useCallback(
    (plan: { id: string; title: string }, toSlot: TimeSlot) => {
      const label = TIME_SLOT_LABELS[toSlot]?.label ?? toSlot;
      Alert.alert(
        'Move this plan?',
        `Move “${plan.title || 'this plan'}” to ${label} so the two don’t overlap?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Move',
            onPress: async () => {
              try {
                const { startTime, endTime } = slotWindowTimes(toSlot);
                await updatePlan(plan.id, { timeSlot: toSlot, startTime, endTime });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Could not move the plan', 'Please try again.');
              }
            },
          },
        ],
      );
    },
    [updatePlan],
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError('Plan name is required');
      return;
    }
    setError(null);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const participants = connectedFriends
        .filter((f) => invitedIds.has(f.friendUserId!))
        .map((f) => ({
          id: f.id,
          friendUserId: f.friendUserId,
          name: f.name,
          avatar: f.avatar,
          status: 'connected',
          role: 'participant',
        }));

      // If extras are provided AND we have invitees, force status=proposed
      // so participants can vote on a time
      const hasMultipleOptions = extraOptions.length > 0 && !isOpenInvite && !isEditMode;

      const payload: any = {
        title:    title.trim(),
        activity: activity as any,
        date,
        timeSlot,
        startTime: startTimeStr,
        endTime:   endTimeStr,
        duration:  durationMin > 0 ? durationMin : 60,
        location: location.trim()
          ? { id: '', name: location.trim(), address: '' }
          : undefined,
        notes:    notes.trim() || undefined,
        participants: isOpenInvite ? [] : participants,
        status:   isOpenInvite
          ? 'confirmed'
          : (participants.length > 0 || hasMultipleOptions)
            ? 'proposed'
            : 'confirmed',
        // Open invites force friends-visibility; otherwise user-picked
        feedVisibility: isOpenInvite ? 'friends' : visibility,
        blocksAvailability: true,
      };

      if (isEditMode && planIdParam) {
        await updatePlan(planIdParam, payload);
      } else {
        await addPlan(payload);

        // Multi-option proposal: after the plan is created, insert
        // plan_proposal_options for the primary + each extra option.
        if (hasMultipleOptions && user?.id) {
          try {
            const { data: latestPlan } = await (supabase as any)
              .from('plans')
              .select('id, created_at')
              .eq('user_id', user.id)
              .eq('time_slot', timeSlot)
              .gte('created_at', new Date(Date.now() - 30_000).toISOString())
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            if (latestPlan) {
              const allOptions = [
                { date, slot: timeSlot },
                ...extraOptions,
              ];
              const rows = allOptions.map((opt, i) => ({
                plan_id:    latestPlan.id,
                date:       format(opt.date, 'yyyy-MM-dd'),
                time_slot:  opt.slot,
                sort_order: i,
              }));
              await (supabase as any).from('plan_proposal_options').insert(rows);
            }
          } catch (err) {
            console.warn('plan_proposal_options insert failed', err);
          }
        }

        // Recurring: insert recurring_plans row + link the just-created
        // plan to it via recurring_plan_id (so future occurrences spawn
        // off the parent series via the server-side cron).
        if (frequency !== 'once' && user?.id) {
          try {
            const { data: rec, error: recErr } = await (supabase as any)
              .from('recurring_plans')
              .insert({
                user_id:         user.id,
                title:           title.trim(),
                activity:        activity as any,
                frequency,
                day_of_week:     date.getDay(),
                starts_on:       format(date, 'yyyy-MM-dd'),
                time_slot:       timeSlot,
                start_time:      startTimeStr,
                end_time:        endTimeStr,
                duration:        durationMin > 0 ? durationMin : 60,
                location:        location.trim() || null,
                notes:           notes.trim() || null,
                feed_visibility: isOpenInvite ? 'friends' : visibility,
                status:          participants.length > 0 ? 'proposed' : 'confirmed',
                is_active:       true,
              })
              .select('id')
              .single();
            if (!recErr && rec) {
              // Link the just-created plan to this series. We don't have the
              // new plan's id locally — match by user_id + date + time_slot +
              // most-recent created_at.
              await (supabase as any)
                .from('plans')
                .update({ recurring_plan_id: rec.id })
                .eq('user_id', user.id)
                .eq('time_slot', timeSlot)
                .gte('created_at', new Date(Date.now() - 30_000).toISOString());
            }
          } catch (err) {
            // Recurring is a follow-up convenience — if it fails, the
            // single plan still exists. Log + continue.
            console.warn('recurring_plans insert failed', err);
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error(isEditMode ? 'updatePlan failed:' : 'addPlan failed:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        isEditMode ? 'Could not save changes' : 'Could not create plan',
        err?.message ?? 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    title, activity, date, timeSlot, startHour, endHour, startTimeStr, endTimeStr,
    durationMin, location, notes, invitedIds,
    connectedFriends, addPlan, updatePlan, isEditMode, planIdParam,
    isOpenInvite, visibility, frequency, extraOptions, user?.id,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const canSubmit = title.trim().length > 0 && !saving;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">
          {isEditMode
            ? 'Edit plan'
            : isOpenInvite
              ? 'Find friends to join'
              : 'New plan'}
        </Text>
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
            {saving ? 'Saving…' : isEditMode ? 'Save' : 'Create'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {isEditMode && planLoading ? (
          <ActivityIndicator className="mt-16" color="#23744D" />
        ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-5 gap-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Open invite banner */}
          {isOpenInvite && <OpenInviteBanner />}

          {/* ── Title ─────────────────────────────────────────────────── */}
          <TitleField
            value={title}
            onChangeText={(t) => { setTitle(t); setError(null); }}
            error={error}
          />

          {/* ── Activity ───────────────────────────────────────────────── */}
          <ActivityPicker activity={activity} onSelect={setActivity} />

          {/* ── Date ──────────────────────────────────────────────────── */}
          <DateGrid dateOptions={dateOptions} date={date} onSelect={setDate} />

          {/* ── Time (start → end) ────────────────────────────────────── */}
          <StartEndTimePicker
            startHour={startHour}
            endHour={endHour}
            onChange={(s, e) => { setStartHour(s); setEndHour(e); }}
          />

          {/* ── Overlap warning (XPE-252/272/253) ─────────────────────── */}
          {overlappingPlans.length > 0 && (
            <View
              className="rounded-2xl border bg-card p-4 gap-2.5 shadow-sm"
              style={{ borderColor: EMBER }}
            >
              <View className="flex-row items-center gap-2">
                <TriangleAlert size={16} color={EMBER} strokeWidth={2} />
                <Text className="font-sans text-sm font-semibold" style={{ color: EMBER }}>
                  Already planned then
                </Text>
              </View>
              {overlappingPlans.map((p) => {
                // Only offer to move native Parade plans you own — a calendar
                // import (flight, holiday…) isn't reschedulable from here.
                const canMove =
                  !!user?.id &&
                  p.userId === user.id &&
                  !isCalendarSourced(p) &&
                  !!suggestedSlot;
                return (
                  <View key={p.id} className="gap-1.5">
                    <Text className="font-sans text-sm text-foreground">
                      You’ve already got “{p.title || 'Untitled plan'}” ({planWindowLabel(p)}).
                    </Text>
                    {canMove && suggestedSlot && (
                      <Pressable
                        onPress={() => handleMovePlan(p, suggestedSlot)}
                        className="self-start rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 active:opacity-70"
                      >
                        <Text className="font-sans text-[13px] font-semibold text-primary">
                          Move it to {TIME_SLOT_LABELS[suggestedSlot]?.label ?? suggestedSlot} ({TIME_SLOT_LABELS[suggestedSlot]?.time})
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Location ─────────────────────────────────────────────── */}
          <View>
            <FieldLabel>Where (optional)</FieldLabel>
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              placeholder="Bar, restaurant, neighborhood…"
              types="establishment"
            />
          </View>

          {/* ── Notes ────────────────────────────────────────────────── */}
          <NotesField value={notes} onChangeText={setNotes} />

          {/* ── Multi-option proposal (create mode, with invitees) ─── */}
          {!isEditMode && !isOpenInvite && (
            <ExtraOptionsSection
              extraOptions={extraOptions}
              onAdd={addExtraOption}
              onRemove={(i) => setExtraOptions(extraOptions.filter((_, idx) => idx !== i))}
            />
          )}

          {/* ── Visibility ───────────────────────────────────────────── */}
          {!isOpenInvite && (
            <VisibilityPicker
              visibility={visibility}
              onChange={setVisibility}
              pods={pods ?? []}
            />
          )}

          {/* ── Repeats (recurring) — create mode only ─────────────────── */}
          {!isEditMode && (
            <FrequencyPicker frequency={frequency} onChange={setFrequency} date={date} />
          )}

          {/* ── Invite friends ────────────────────────────────────────── */}
          {!isOpenInvite && connectedFriends.length > 0 && (
            <FriendSelector
              connectedFriends={connectedFriends}
              invitedIds={invitedIds}
              onToggle={toggleInvite}
            />
          )}
        </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
