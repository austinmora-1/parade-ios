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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, parseISO, isToday, isTomorrow, isSameDay } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, Check } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import type { TimeSlot } from '@/types/planner';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITIES = [
  { id: 'drinks',      label: 'Drinks',     emoji: '🍹' },
  { id: 'dinner',      label: 'Dinner',     emoji: '🍝' },
  { id: 'brunch',      label: 'Brunch',     emoji: '🥞' },
  { id: 'coffee',      label: 'Coffee',     emoji: '☕' },
  { id: 'happy-hour',  label: 'Happy hour', emoji: '🍻' },
  { id: 'hike',        label: 'Hike',       emoji: '🥾' },
  { id: 'run',         label: 'Run',        emoji: '🏃' },
  { id: 'gym',         label: 'Gym',        emoji: '🏋️' },
  { id: 'movie',       label: 'Movie',      emoji: '🎬' },
  { id: 'concert',     label: 'Concert',    emoji: '🎵' },
  { id: 'sports',      label: 'Sports',     emoji: '⚽' },
  { id: 'park',        label: 'Park',       emoji: '🌳' },
  { id: 'beach',       label: 'Beach',      emoji: '🏖️' },
  { id: 'meetup',      label: 'Meetup',     emoji: '👋' },
  { id: 'travel',      label: 'Travel',     emoji: '✈️' },
  { id: 'other',       label: 'Other',      emoji: '✨' },
];

const SLOTS: { id: TimeSlot; label: string; range: string }[] = [
  { id: 'early-morning',   label: 'Early',     range: '6–9am' },
  { id: 'late-morning',    label: 'Morning',   range: '9am–12pm' },
  { id: 'early-afternoon', label: 'Afternoon', range: '12–3pm' },
  { id: 'late-afternoon',  label: 'Late PM',   range: '3–6pm' },
  { id: 'evening',         label: 'Evening',   range: '6–10pm' },
  { id: 'late-night',      label: 'Late',      range: '10pm+' },
];

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
        selected
          ? 'bg-primary border-primary'
          : 'bg-white border-border/40'
      }`}
    >
      <View className="flex-row items-center gap-1.5">{children}</View>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NewPlanScreen() {
  const {
    date: dateParam,
    slot: slotParam,
    planId: planIdParam,
  } = useLocalSearchParams<{
    date?:   string;
    slot?:   string;
    planId?: string;
  }>();
  const { user } = useAuth();
  const addPlan    = usePlannerStore((s) => s.addPlan);
  const updatePlan = usePlannerStore((s) => s.updatePlan);
  const friends    = usePlannerStore((s) => s.friends);
  const setUserId  = usePlannerStore((s) => s.setUserId);

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
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

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
        participants,
        status:   participants.length > 0 ? 'proposed' : 'confirmed',
        feedVisibility: 'private',
        blocksAvailability: true,
      };

      if (isEditMode && planIdParam) {
        await updatePlan(planIdParam, payload);
      } else {
        await addPlan(payload);
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
          <X size={20} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">
          {isEditMode ? 'Edit plan' : 'New plan'}
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
          {/* ── Title ─────────────────────────────────────────────────── */}
          <View>
            <FieldLabel>What's the plan?</FieldLabel>
            <TextInput
              value={title}
              onChangeText={(t) => { setTitle(t); setError(null); }}
              placeholder="e.g. Drinks at Sway Bar"
              placeholderTextColor="#929298"
              className="bg-white rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
              maxLength={100}
              autoFocus
            />
            {error && (
              <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                {error}
              </Text>
            )}
          </View>

          {/* ── Activity ───────────────────────────────────────────────── */}
          <View>
            <FieldLabel>Activity</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-0.5 pb-1"
            >
              {ACTIVITIES.map((a) => {
                const selected = activity === a.id;
                return (
                  <Chip
                    key={a.id}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setActivity(a.id); }}
                  >
                    <Text style={{ fontSize: 14 }}>{a.emoji}</Text>
                    <Text
                      className={`font-sans text-xs font-medium ${
                        selected ? 'text-white' : 'text-foreground'
                      }`}
                    >
                      {a.label}
                    </Text>
                  </Chip>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Date ──────────────────────────────────────────────────── */}
          <View>
            <FieldLabel>When</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-0.5 pb-1"
            >
              {dateOptions.map((d) => {
                const selected = isSameDay(d, date);
                return (
                  <Chip
                    key={d.toISOString()}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setDate(d); }}
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

          {/* ── Time slot ─────────────────────────────────────────────── */}
          <View>
            <FieldLabel>Time</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {SLOTS.map((s) => {
                const selected = timeSlot === s.id;
                return (
                  <Chip
                    key={s.id}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setTimeSlot(s.id); }}
                  >
                    <View>
                      <Text
                        className={`font-sans text-xs font-semibold ${
                          selected ? 'text-white' : 'text-foreground'
                        }`}
                      >
                        {s.label}
                      </Text>
                      <Text
                        className={`font-sans text-[10px] ${
                          selected ? 'text-white/70' : 'text-muted-foreground'
                        }`}
                      >
                        {s.range}
                      </Text>
                    </View>
                  </Chip>
                );
              })}
            </View>
          </View>

          {/* ── Location ─────────────────────────────────────────────── */}
          <View>
            <FieldLabel>Where (optional)</FieldLabel>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Address, place name, or neighborhood"
              placeholderTextColor="#929298"
              className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
              maxLength={200}
            />
          </View>

          {/* ── Notes ────────────────────────────────────────────────── */}
          <View>
            <FieldLabel>Notes (optional)</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Any extra details…"
              placeholderTextColor="#929298"
              className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
              maxLength={500}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>

          {/* ── Invite friends ────────────────────────────────────────── */}
          {connectedFriends.length > 0 && (
            <View>
              <View className="flex-row items-center justify-between mb-2 px-0.5">
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Invite friends
                </Text>
                {invitedIds.size > 0 && (
                  <Text className="font-sans text-[11px] font-semibold text-primary">
                    {invitedIds.size} selected
                  </Text>
                )}
              </View>
              <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                {connectedFriends.map((f, i) => {
                  const checked = invitedIds.has(f.friendUserId!);
                  return (
                    <View key={f.id}>
                      <Pressable
                        onPress={() => toggleInvite(f.friendUserId!)}
                        className="flex-row items-center px-4 py-3 gap-3 active:bg-muted/30"
                      >
                        <Avatar
                          url={f.avatar}
                          displayName={f.name}
                          size="sm"
                        />
                        <Text
                          className="flex-1 font-sans text-sm font-medium text-foreground"
                          numberOfLines={1}
                        >
                          {f.name}
                        </Text>
                        <View
                          style={{
                            width: 22, height: 22, borderRadius: 6,
                            borderWidth: 1.5,
                            borderColor: checked ? '#23744D' : 'rgba(146,146,152,0.4)',
                            backgroundColor: checked ? '#23744D' : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {checked && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                        </View>
                      </Pressable>
                      {i < connectedFriends.length - 1 && (
                        <View className="h-px bg-border/30 mx-4" />
                      )}
                    </View>
                  );
                })}
              </View>
              {invitedIds.size > 0 && (
                <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                  Plan will be sent as a proposal — they'll see it in their feed
                  and can RSVP.
                </Text>
              )}
            </View>
          )}
        </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
