/**
 * Quick plan — modal fast-path from a "Recommended" free window
 * (PWA RecommendedPlanDialog parity).
 *
 * Reached with ?date=yyyy-MM-dd&slot=<TimeSlot>. The day + time are
 * pre-filled; the user multi-selects friends who are also free in that
 * window (optional) and an activity (optional), then sends. With friends
 * selected the plan is created as a proposal they can accept; solo it's
 * added as a confirmed plan.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, parseISO, isToday, isTomorrow, addDays } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, Calendar, Clock, Send, Search, Check } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDayAvailability } from '@/hooks/useFriendDayAvailability';
import { Avatar } from '@/components/primitives/Avatar';
import { DatePickerModal } from '@/components/primitives/DatePickerModal';
import { StartEndTimePicker, defaultTimesForSlot } from '@/components/new-plan/StartEndTimePicker';
import { hourToTimeString, slotForHour, fmtHour } from '@/lib/planSlotCoverage';
import { TIME_SLOT_LABELS, ACTIVITY_CONFIG, type ActivityType, type TimeSlot } from '@/types/planner';
import { TC } from '@/lib/theme';
import { PARADE_GREEN, ELEPHANT } from '@/lib/colors';

/** Curated quick activities (matches PWA RecommendedPlanDialog quick list). */
const QUICK_ACTIVITIES: ActivityType[] = [
  'drinks', 'get-food', 'coffee', 'hanging-out', 'movies', 'gym', 'park',
];

function dayLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEEE');
}

/** Time-slot pill selector, shared by log + suggest mode. Changing the slot
 *  re-filters the suggest-mode friend picker to whoever's free then (XPE-270). */
function TimeSlotPills({
  value,
  onChange,
}: {
  value: TimeSlot;
  onChange: (s: TimeSlot) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {(Object.entries(TIME_SLOT_LABELS) as [TimeSlot, { label: string; time: string }][]).map(([id, meta]) => {
        const selected = value === id;
        return (
          <Pressable
            key={id}
            onPress={() => { Haptics.selectionAsync(); onChange(id); }}
            className={`rounded-xl px-3 py-2 border active:opacity-70 ${selected ? 'bg-primary border-primary' : 'bg-card border-border/40'}`}
          >
            <Text className={`font-sans text-sm font-semibold ${selected ? 'text-white' : 'text-foreground'}`}>{meta.label}</Text>
            <Text className={`font-sans text-xs ${selected ? 'text-white/70' : 'text-muted-foreground'}`}>{meta.time}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function QuickPlanScreen() {
  const { date: dateParam, slot: slotParam, mode } = useLocalSearchParams<{
    date?: string;
    slot?: string;
    mode?: string;
  }>();
  // Log mode: record a plan you've ALREADY committed to outside Parade.
  // Hard-confirmed on create — friends are attached as accepted, no RSVP.
  const isLogMode = mode === 'log';
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const addPlan = usePlannerStore((s) => s.addPlan);
  const forceRefresh = usePlannerStore((s) => s.forceRefresh);
  const [pickedDate, setPickedDate] = useState<string>(
    dateParam ?? format(new Date(), 'yyyy-MM-dd'),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickedSlot, setPickedSlot] = useState<TimeSlot>(
    (slotParam ?? 'evening') as TimeSlot,
  );
  const slot = pickedSlot;
  const date = useMemo(() => parseISO(`${pickedDate}T12:00:00`), [pickedDate]);
  const slotMeta = TIME_SLOT_LABELS[slot];

  // Suggest-mode friend picker: who's mutually free on THIS exact date, per
  // slot. Date-accurate (not the 7-day dashboard window) so a weekend tapped
  // from the Open Weekends card resolves the same friends the card showed
  // (XPE-309). Log mode lists all friends, so it skips this fetch.
  const { data: friendsBySlot } = useFriendDayAvailability(isLogMode ? undefined : pickedDate);

  // Optional specific start/end time (fractional hours) — off by default,
  // the coarse slot covers most quick plans (XPE-302).
  const [specificTime, setSpecificTime] = useState(false);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(0);
  const enableSpecificTime = useCallback(() => {
    const t = defaultTimesForSlot(pickedSlot);
    setStartHour(t.start);
    setEndHour(t.end);
    setSpecificTime(true);
  }, [pickedSlot]);
  // Slot change while the picker is open re-anchors the times to the new slot
  // (matches new-hang-request).
  const handleSlotChange = useCallback((s: TimeSlot) => {
    setPickedSlot(s);
    setSpecificTime((on) => {
      if (on) {
        const t = defaultTimesForSlot(s);
        setStartHour(t.start);
        setEndHour(t.end);
      }
      return on;
    });
  }, []);

  const plans = usePlannerStore((s) => s.plans);

  // Shared-plan frequency per friend — ranks who you actually plan with.
  const planFrequency = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) {
      for (const part of p.participants ?? []) {
        if (part.friendUserId) {
          counts[part.friendUserId] = (counts[part.friendUserId] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [plans]);

  // Friend pool: log mode lists ALL connected friends (they already said
  // yes outside Parade); suggest mode lists friends mutually free in the
  // exact window. Sorted by how often you plan together.
  const freeFriends = useMemo(() => {
    const pool = isLogMode
      ? friends
          .filter((f) => f.status === 'connected' && f.friendUserId)
          .map((f) => ({ userId: f.friendUserId!, name: f.name, avatar: f.avatar ?? null }))
      : (friendsBySlot?.[slot] ?? []).map((f) => ({
          userId: f.userId,
          name: f.name,
          avatar: f.avatarUrl,
        }));
    return pool.sort(
      (a, b) =>
        (planFrequency[b.userId] ?? 0) - (planFrequency[a.userId] ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [isLogMode, friends, friendsBySlot, slot, planFrequency]);

  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [friendQuery, setFriendQuery] = useState('');

  // Log mode: top 5 most-planned-with by default, search opens the full
  // pool. Suggest mode: every friend free in the slot is shown.
  // Selected friends always stay visible so they can be untoggled.
  const displayedFriends = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    const base = q
      ? freeFriends.filter((f) => f.name.toLowerCase().includes(q))
      : isLogMode
        ? freeFriends.slice(0, 5)
        : freeFriends;
    const shown = new Set(base.map((f) => f.userId));
    const pinned = freeFriends.filter(
      (f) => selectedFriendIds.has(f.userId) && !shown.has(f.userId),
    );
    return [...pinned, ...base];
  }, [freeFriends, friendQuery, selectedFriendIds, isLogMode]);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [activity, setActivity] = useState<ActivityType | null>(null);
  const [customActivity, setCustomActivity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedFriends = freeFriends.filter((f) => selectedFriendIds.has(f.userId));
  const hasFriends = selectedFriends.length > 0;

  // Auto-generate title from activity + selection unless the user edited it
  // (PWA parity).
  useEffect(() => {
    if (titleEdited) return;
    const names = selectedFriends.slice(0, 2).map((f) => f.name.split(' ')[0]);
    const suffix = selectedFriends.length > 2 ? ` +${selectedFriends.length - 2}` : '';
    const friendsPart = names.length > 0 ? ` with ${names.join(', ')}${suffix}` : '';
    if (activity) {
      const label = ACTIVITY_CONFIG[activity]?.label ?? '';
      setTitle(`${label}${friendsPart || ` — ${dayLabel(date)}`}`);
    } else {
      setTitle(names.length > 0 ? `Hang${friendsPart}` : `Open hang — ${dayLabel(date)}`);
    }
  }, [activity, titleEdited, selectedFriendIds, freeFriends, date]);

  const toggleFriend = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSend = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Custom text rides directly in activity (Plan.activity is
      // ActivityType | string) — same as the PWA dialog.
      const effectiveActivity = customActivity.trim() || activity || 'hanging-out';
      const participants = friends
        .filter((f) => f.friendUserId && selectedFriendIds.has(f.friendUserId))
        .map((f) => ({
          id: f.id, friendUserId: f.friendUserId, name: f.name,
          avatar: f.avatar, status: 'connected', role: 'participant',
          // Already committed outside Parade — attach as accepted, no RSVP.
          ...(isLogMode ? { rsvpStatus: 'accepted' } : {}),
        }));

      await addPlan({
        title: title.trim() || `Open hang — ${dayLabel(date)}`,
        activity: effectiveActivity as any,
        date,
        // A specific start time re-files the plan into whichever slot the
        // clock time falls in (same rule as new-hang-request).
        timeSlot: specificTime ? slotForHour(startHour) : slot,
        startTime: specificTime ? hourToTimeString(startHour) : undefined,
        endTime: specificTime ? hourToTimeString(endHour) : undefined,
        duration: 60,
        notes: note.trim() || undefined,
        participants: participants as any,
        status: isLogMode ? 'confirmed' : hasFriends ? 'proposed' : 'confirmed',
        feedVisibility: 'private',
        blocksAvailability: true,
      } as any);

      // Look up the just-created plan so we can land on its detail screen
      // (same recent-created_at match as find-time).
      let planId: string | null = null;
      if (user?.id) {
        const { data } = await (supabase as any)
          .from('plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('time_slot', specificTime ? slotForHour(startHour) : slot)
          .gte('created_at', new Date(Date.now() - 30_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        planId = data?.id ?? null;
      }

      await forceRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Suggest-mode quick plans land on the plan with the share sheet open so
      // the creator can invite non-users too (XPE-268). Log mode already
      // happened — no share prompt.
      if (planId) router.replace(`/(app)/plan/${planId}${isLogMode ? '' : '?share=1'}`);
      else router.back();
    } catch (err: any) {
      console.error('quick-plan submit failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not create plan', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [saving, customActivity, activity, friends, selectedFriendIds, note, title,
      date, slot, specificTime, startHour, endHour, hasFriends, isLogMode,
      addPlan, forceRefresh, user?.id]);

  // Optional exact-time affordance shown under the slot pills in both modes.
  const specificTimeBlock = !specificTime ? (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); enableSpecificTime(); }}
      className="flex-row items-center gap-2 self-start rounded-xl border border-border/40 bg-card px-3.5 py-2.5 mt-2.5 active:opacity-70"
    >
      <Clock size={15} color={PARADE_GREEN} strokeWidth={2} />
      <Text className="font-sans text-[13px] font-semibold text-primary">
        Set a specific time
      </Text>
    </Pressable>
  ) : (
    <View className="gap-2 mt-2.5">
      <StartEndTimePicker
        startHour={startHour}
        endHour={endHour}
        onChange={(s, e) => { setStartHour(s); setEndHour(e); }}
      />
      <Pressable onPress={() => setSpecificTime(false)} hitSlop={6} className="self-start active:opacity-60">
        <Text className="font-sans text-xs font-medium text-muted-foreground">
          Use the time slot instead
        </Text>
      </Pressable>
    </View>
  );

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
        <Text className="font-display text-lg text-foreground">
          {isLogMode ? 'Quick plan' : hasFriends ? 'Suggest this plan' : 'Make this plan'}
        </Text>
        <View className="w-9 h-9" />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-5 gap-5 pb-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Log mode: editable when picker */}
          {isLogMode && (
            <View className="gap-4">
              <View>
                <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
                  When
                </Text>
                {/* Defaults to today; tap to pick any day from a calendar */}
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setCalendarOpen(true); }}
                  className="bg-card rounded-xl border border-border/40 px-4 py-3 flex-row items-center gap-3 shadow-sm active:opacity-70"
                >
                  <Calendar size={16} color={PARADE_GREEN} strokeWidth={2} />
                  <View className="flex-1">
                    <Text className="font-sans text-[15px] font-semibold text-foreground">
                      {dayLabel(date)}
                    </Text>
                    <Text className="font-sans text-sm text-muted-foreground mt-0.5">
                      {format(date, 'EEEE, MMM d')}
                    </Text>
                  </View>
                  <Text className="font-sans text-sm font-semibold text-primary">Change</Text>
                </Pressable>
                <DatePickerModal
                  visible={calendarOpen}
                  onClose={() => setCalendarOpen(false)}
                  selected={date}
                  onSelect={(day) => {
                    setPickedDate(format(day, 'yyyy-MM-dd'));
                    setCalendarOpen(false);
                  }}
                />
              </View>
              <View>
                <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
                  Time
                </Text>
                <TimeSlotPills value={pickedSlot} onChange={handleSlotChange} />
                {specificTimeBlock}
              </View>
            </View>
          )}

          {/* Pre-filled window summary (suggest mode) — editable title is the headline */}
          {!isLogMode && (
          <View className="bg-card rounded-2xl border border-border/30 p-4 gap-2.5 shadow-sm">
            <TextInput
              value={title}
              onChangeText={(t) => { setTitle(t); setTitleEdited(true); }}
              placeholder="What are we doing?"
              placeholderTextColor="#929298"
              className="font-display text-[22px] text-foreground p-0"
              maxLength={80}
            />
            <View className="flex-row items-center gap-2 flex-wrap">
              <View className="flex-row items-center gap-1.5">
                <Calendar size={14} color={PARADE_GREEN} strokeWidth={2} />
                <Text className="font-sans text-[14px] text-muted-foreground">
                  {dayLabel(date)} · {format(date, 'MMM d')}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Clock size={14} color={PARADE_GREEN} strokeWidth={2} />
                <Text className="font-sans text-[14px] text-muted-foreground">
                  {specificTime
                    ? `${fmtHour(startHour)} – ${fmtHour(endHour)}`
                    : `${slotMeta?.time} · ${slotMeta?.label}`}
                </Text>
              </View>
            </View>
          </View>
          )}

          {/* Time selector (suggest mode) — switch the window and the picker
              below re-filters to whoever's free then (XPE-270). */}
          {!isLogMode && (
            <View>
              <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
                Time
              </Text>
              <TimeSlotPills value={pickedSlot} onChange={handleSlotChange} />
              {specificTimeBlock}
            </View>
          )}

          {/* Friend multi-select */}
          {freeFriends.length > 0 && (
            <View>
              <View className="flex-row items-center justify-between px-0.5 mb-2">
                <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {isLogMode ? "Who's in (already confirmed)" : 'Invite friends'}
                </Text>
                <Text className="font-sans text-[13px] text-muted-foreground">
                  {isLogMode
                    ? `${selectedFriends.length} selected`
                    : `${freeFriends.length} free this slot`}
                </Text>
              </View>
              {freeFriends.length > 10 && (
                <View className="flex-row items-center gap-2 bg-card rounded-xl border border-border/40 px-3 mb-2.5 shadow-sm">
                  <Search size={14} color={ELEPHANT} strokeWidth={2} />
                  <TextInput
                    value={friendQuery}
                    onChangeText={setFriendQuery}
                    placeholder="Search friends"
                    placeholderTextColor={ELEPHANT}
                    className="flex-1 py-2 font-sans text-[15px] text-foreground"
                    autoCorrect={false}
                  />
                  {friendQuery.length > 0 && (
                    <Pressable onPress={() => setFriendQuery('')} hitSlop={6}>
                      <X size={13} color={ELEPHANT} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14, paddingHorizontal: 2, paddingVertical: 4 }}
              >
                {displayedFriends.map((f) => {
                  const isSel = selectedFriendIds.has(f.userId);
                  return (
                    <Pressable
                      key={f.userId}
                      onPress={() => toggleFriend(f.userId)}
                      className="items-center active:opacity-70"
                      style={{ width: 68 }}
                    >
                      <View
                        className="rounded-full"
                        style={{
                          padding: 2,
                          borderWidth: 2,
                          borderColor: isSel ? PARADE_GREEN : 'transparent',
                        }}
                      >
                        <Avatar url={f.avatar} displayName={f.name} size="lg" />
                        {isSel && (
                          <View className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary items-center justify-center border-2 border-card">
                            <Check size={11} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        className={`font-sans text-[13px] mt-1.5 ${
                          isSel ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {f.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Suggest mode: no one free in the chosen window */}
          {!isLogMode && freeFriends.length === 0 && (
            <View className="px-0.5">
              <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Invite friends
              </Text>
              <Text className="font-sans text-sm text-muted-foreground">
                No friends are free in this window — pick another time above, or just add it as an open plan.
              </Text>
            </View>
          )}

          {/* Title (log mode — suggest mode edits it in the summary card) */}
          {isLogMode && (
          <View>
            <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={(t) => { setTitle(t); setTitleEdited(true); }}
              placeholder="What are we doing?"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-[15px] text-foreground shadow-sm"
              maxLength={80}
            />
          </View>
          )}

          {/* Activity (optional) */}
          <View>
            <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
              Add activity (optional)
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {QUICK_ACTIVITIES.map((id) => {
                const cfg = ACTIVITY_CONFIG[id];
                if (!cfg) return null;
                const isSel = activity === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setActivity(isSel ? null : id);
                      if (!isSel) setCustomActivity('');
                    }}
                    className={`rounded-full border px-3 py-1.5 active:opacity-70 ${
                      isSel ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40'
                    }`}
                  >
                    <Text className="font-sans text-[15px] font-medium text-foreground">
                      {cfg.icon} {cfg.label}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Custom activity rides inline as a type-in chip */}
              <View
                className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                  customActivity.trim() ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40'
                }`}
              >
                <Text className="font-sans text-[15px]">✏️ </Text>
                <TextInput
                  value={customActivity}
                  onChangeText={(t) => {
                    setCustomActivity(t);
                    if (t.trim()) setActivity(null);
                  }}
                  placeholder="Custom"
                  placeholderTextColor="#929298"
                  className="font-sans text-[15px] font-medium text-foreground p-0"
                  style={{ minWidth: 60, maxWidth: 150, paddingVertical: 0 }}
                  maxLength={100}
                />
              </View>
            </View>
          </View>

          {/* Note (optional) */}
          <View>
            <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
              Note (optional)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a quick message…"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-[15px] text-foreground shadow-sm"
              maxLength={200}
              multiline
              numberOfLines={2}
              style={{ minHeight: 56, textAlignVertical: 'top' }}
            />
          </View>
        </ScrollView>

        {/* Send bar */}
        <View className="px-5 pb-4 pt-2 border-t border-border/20 bg-chalk">
          <Pressable
            onPress={handleSend}
            disabled={saving}
            className={`flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${
              saving ? 'bg-muted' : 'bg-primary active:opacity-90'
            }`}
          >
            {saving ? (
              <ActivityIndicator size="small" color={ELEPHANT} />
            ) : (
              <Send size={15} color="#FFFFFF" strokeWidth={2} />
            )}
            <Text className={`font-sans text-base font-semibold ${saving ? 'text-muted-foreground' : 'text-white'}`}>
              {saving ? 'Saving…' : isLogMode ? 'Make it happen!' : hasFriends ? 'Send suggestion' : 'Add plan'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
