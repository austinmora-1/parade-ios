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
import { X } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { usePods } from '@/hooks/usePods';
import { FieldLabel, OpenInviteBanner, TitleField, NotesField } from '@/components/new-plan/FormBits';
import { ActivityPicker } from '@/components/new-plan/ActivityPicker';
import { DateGrid } from '@/components/new-plan/DateGrid';
import { TimeSlotPicker } from '@/components/new-plan/TimeSlotPicker';
import { ExtraOptionsSection } from '@/components/new-plan/ExtraOptionsSection';
import { VisibilityPicker } from '@/components/new-plan/VisibilityPicker';
import { FrequencyPicker } from '@/components/new-plan/FrequencyPicker';
import { FriendSelector } from '@/components/new-plan/FriendSelector';
import type { TimeSlot } from '@/types/planner';
import { TC } from '@/lib/theme';

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

  const [title,    setTitle]    = useState('');
  const [activity, setActivity] = useState<string>('drinks');
  const [date,     setDate]     = useState<Date>(initialDate);
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(initialSlot);
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

  // Hydrate form state when editing existing plan
  useEffect(() => {
    if (!existingPlan?.plan) return;
    const p: any = existingPlan.plan;
    setTitle(p.title ?? '');
    setActivity(p.activity ?? 'drinks');
    if (p.date) setDate(new Date(p.date));
    if (p.time_slot) setTimeSlot(p.time_slot as TimeSlot);
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
        duration: 60,
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
                duration:        60,
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
    title, activity, date, timeSlot, location, notes, invitedIds,
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

          {/* ── Time slot ─────────────────────────────────────────────── */}
          <TimeSlotPicker timeSlot={timeSlot} onSelect={setTimeSlot} />

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
