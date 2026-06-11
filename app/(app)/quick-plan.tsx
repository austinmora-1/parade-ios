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
import { X, Calendar, Clock, Users, Send } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
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
  const { data: friendData } = useFriendDashboardData();

  const [pickedDate, setPickedDate] = useState<string>(
    dateParam ?? format(new Date(), 'yyyy-MM-dd'),
  );
  const [pickedSlot, setPickedSlot] = useState<TimeSlot>(
    (slotParam ?? 'evening') as TimeSlot,
  );
  const slot = pickedSlot;
  const date = useMemo(() => parseISO(`${pickedDate}T12:00:00`), [pickedDate]);
  const slotMeta = TIME_SLOT_LABELS[slot];
  const dateOptions = useMemo(
    () => Array.from({ length: 14 }, (_, i) => format(addDays(new Date(), i), 'yyyy-MM-dd')),
    [],
  );

  // Friend pool: log mode lists ALL connected friends (they already said
  // yes outside Parade); suggest mode lists friends mutually free in the
  // exact window.
  const freeFriends = useMemo(() => {
    if (isLogMode) {
      return friends
        .filter((f) => f.status === 'connected' && f.friendUserId)
        .map((f) => ({ userId: f.friendUserId!, name: f.name, avatar: f.avatar ?? null }));
    }
    return (friendData ?? [])
      .filter((f) =>
        f.overlapSlots.some((o) => o.date === pickedDate && o.slot === slot),
      )
      .map((f) => ({
        userId: f.userId,
        name: formatDisplayName({
          firstName: f.firstName,
          lastName: f.lastName,
          displayName: f.displayName ?? '',
        }) || 'Friend',
        avatar: f.avatarUrl,
      }));
  }, [isLogMode, friends, friendData, pickedDate, slot]);

  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
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
        timeSlot: slot,
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
          .eq('time_slot', slot)
          .gte('created_at', new Date(Date.now() - 30_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        planId = data?.id ?? null;
      }

      await forceRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (planId) router.replace(`/(app)/plan/${planId}`);
      else router.back();
    } catch (err: any) {
      console.error('quick-plan submit failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not create plan', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [saving, customActivity, activity, friends, selectedFriendIds, note, title,
      date, slot, hasFriends, isLogMode, addPlan, forceRefresh, user?.id]);

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
        <Text className="font-display text-base text-foreground">
          {isLogMode ? 'Log a plan' : hasFriends ? 'Suggest this plan' : 'Make this plan'}
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
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
                  When
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                  {dateOptions.map((d) => {
                    const dObj = parseISO(`${d}T12:00:00`);
                    const selected = pickedDate === d;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => { Haptics.selectionAsync(); setPickedDate(d); }}
                        className={`rounded-xl px-3 py-2.5 border active:opacity-70 ${selected ? 'bg-primary border-primary' : 'bg-card border-border/40'}`}
                      >
                        <View className="items-center">
                          <Text className={`font-sans text-[10px] font-semibold uppercase tracking-wider ${selected ? 'text-white/80' : 'text-muted-foreground'}`}>
                            {dayLabel(dObj)}
                          </Text>
                          <Text className={`font-display text-base ${selected ? 'text-white' : 'text-foreground'}`}>
                            {format(dObj, 'MMM d')}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View>
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
                  Time
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {(Object.entries(TIME_SLOT_LABELS) as [TimeSlot, { label: string; time: string }][]).map(([id, meta]) => {
                    const selected = pickedSlot === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => { Haptics.selectionAsync(); setPickedSlot(id); }}
                        className={`rounded-xl px-3 py-2 border active:opacity-70 ${selected ? 'bg-primary border-primary' : 'bg-card border-border/40'}`}
                      >
                        <Text className={`font-sans text-xs font-semibold ${selected ? 'text-white' : 'text-foreground'}`}>{meta.label}</Text>
                        <Text className={`font-sans text-[10px] ${selected ? 'text-white/70' : 'text-muted-foreground'}`}>{meta.time}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* Pre-filled window summary (suggest mode) */}
          {!isLogMode && (
          <View className="bg-card rounded-2xl border border-border/30 p-4 gap-2.5 shadow-sm">
            <View className="flex-row items-center gap-2">
              <Calendar size={15} color={PARADE_GREEN} strokeWidth={2} />
              <Text className="font-sans text-sm font-semibold text-foreground">
                {dayLabel(date)}
              </Text>
              <Text className="font-sans text-sm text-muted-foreground">
                · {format(date, 'MMM d')}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Clock size={15} color={PARADE_GREEN} strokeWidth={2} />
              <Text className="font-sans text-sm font-semibold text-foreground">
                {slotMeta?.time}
              </Text>
              <Text className="font-sans text-sm text-muted-foreground">
                · {slotMeta?.label}
              </Text>
            </View>
            {freeFriends.length > 0 && (
              <View className="flex-row items-center gap-2">
                <Users size={15} color={PARADE_GREEN} strokeWidth={2} />
                <Text className="font-sans text-xs text-muted-foreground">
                  {freeFriends.length} {freeFriends.length === 1 ? 'friend' : 'friends'} free this slot
                </Text>
              </View>
            )}
          </View>
          )}

          {/* Friend multi-select */}
          {freeFriends.length > 0 && (
            <View>
              <View className="flex-row items-center justify-between px-0.5 mb-2">
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {isLogMode ? "Who's in (already confirmed)" : 'Invite friends'}
                </Text>
                <Text className="font-sans text-[11px] text-muted-foreground">
                  {selectedFriends.length} selected
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {freeFriends.map((f) => {
                  const isSel = selectedFriendIds.has(f.userId);
                  return (
                    <Pressable
                      key={f.userId}
                      onPress={() => toggleFriend(f.userId)}
                      className={`flex-row items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 active:opacity-70 ${
                        isSel ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40'
                      }`}
                    >
                      <Avatar url={f.avatar} displayName={f.name} size="xs" />
                      <Text className="font-sans text-xs font-medium text-foreground">
                        {f.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Title */}
          <View>
            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={(t) => { setTitle(t); setTitleEdited(true); }}
              placeholder="What are we doing?"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
              maxLength={80}
            />
          </View>

          {/* Activity (optional) */}
          <View>
            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
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
                    <Text className="font-sans text-xs font-medium text-foreground">
                      {cfg.icon} {cfg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={customActivity}
              onChangeText={(t) => {
                setCustomActivity(t);
                if (t.trim()) setActivity(null);
              }}
              placeholder="Or type a custom activity…"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm mt-2"
              maxLength={100}
            />
          </View>

          {/* Note (optional) */}
          <View>
            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
              Note (optional)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a quick message…"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
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
            <Text className={`font-sans text-sm font-semibold ${saving ? 'text-muted-foreground' : 'text-white'}`}>
              {saving ? 'Saving…' : isLogMode ? 'Log plan' : hasFriends ? 'Send suggestion' : 'Add plan'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
