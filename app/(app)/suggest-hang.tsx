/**
 * Suggest times to hang — modal slot picker (PWA FriendPill popover parity).
 *
 * Reached from the "Who's around this week" pill with ?friendId=xxx.
 * Shows the friend's top prioritized mutual slots (≤5, preferred social
 * times first, computed in useFriendDashboardData), lets the user
 * multi-select one or more and optionally suggest an activity, then sends
 * one hang request per selected slot. The friend can accept one or several
 * of the suggestions independently from their Hang Requests widget.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, Check, CalendarPlus, Sparkles, Send } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData, type OverlapSlot } from '@/hooks/useFriendDashboardData';
import { useSendHangRequest } from '@/hooks/useHangRequests';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
import { TIME_SLOT_LABELS, ACTIVITY_CONFIG, type ActivityType } from '@/types/planner';
import { TC } from '@/lib/theme';
import { TINT, PARADE_GREEN, ELEPHANT, EMBER } from '@/lib/colors';

/** Curated quick-suggestion activities (matches PWA quick list). */
const QUICK_ACTIVITIES: ActivityType[] = [
  'drinks', 'get-food', 'coffee', 'hanging-out', 'movies', 'gym', 'park',
];

function slotDayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

const slotKey = (s: OverlapSlot) => `${s.date}|${s.slot}`;

function useMyDisplayName(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['my-display-name', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, first_name, last_name')
        .eq('user_id', userId!)
        .maybeSingle();
      const p = data as any;
      return formatDisplayName({
        firstName:   p?.first_name,
        lastName:    p?.last_name,
        displayName: p?.display_name,
      }) || 'A friend';
    },
  });
}

export default function SuggestHangScreen() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const { data: friendData, isLoading } = useFriendDashboardData();
  const { data: myName } = useMyDisplayName(user?.id);
  const sendRequest = useSendHangRequest();

  const friend = friends.find((f) => f.friendUserId === friendId);
  const vibe = (friendData ?? []).find((v) => v.userId === friendId);
  const slots = vibe?.topSlots ?? [];
  const firstName = (vibe
    ? formatDisplayName({
        firstName: vibe.firstName,
        lastName: vibe.lastName,
        displayName: vibe.displayName ?? friend?.name ?? '',
      })
    : friend?.name ?? 'your friend'
  ).split(' ')[0];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<string>('tbd'); // ActivityType, 'tbd', or 'custom'
  const [customActivity, setCustomActivity] = useState('');
  const [sending, setSending] = useState(false);

  // Top picks: up to 3 slots from distinct days, preferred-time slots first
  // (PWA topPickKeys parity).
  const topPickKeys = useMemo(() => {
    const picks: OverlapSlot[] = [];
    const usedDays = new Set<string>();
    const take = (pool: OverlapSlot[]) => {
      for (const s of pool) {
        if (picks.length >= 3) break;
        if (usedDays.has(s.date)) continue;
        picks.push(s);
        usedDays.add(s.date);
      }
    };
    take(slots.filter((s) => s.preferred));
    if (picks.length < 3) take(slots.filter((s) => !s.preferred));
    return new Set(picks.map(slotKey));
  }, [slots]);

  // Top picks listed first, then chronological (PWA sort parity)
  const sortedSlots = useMemo(
    () =>
      [...slots].sort((a, b) => {
        const ap = topPickKeys.has(slotKey(a)) ? 0 : 1;
        const bp = topPickKeys.has(slotKey(b)) ? 0 : 1;
        return ap - bp || a.date.localeCompare(b.date);
      }),
    [slots, topPickKeys],
  );

  const toggleSlot = useCallback((s: OverlapSlot) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      const k = slotKey(s);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }, []);

  const customInvalid = activity === 'custom' && customActivity.trim().length === 0;
  const canSend = selected.size > 0 && !sending && !customInvalid && !!friendId;

  const handleSend = useCallback(async () => {
    if (!canSend || !friendId) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Optional activity suggestion rides along in the message (PWA parity)
      let activityMessage: string | undefined;
      if (activity === 'custom') {
        const trimmed = customActivity.trim();
        if (trimmed) activityMessage = `Suggested activity: ${trimmed}`;
      } else if (activity !== 'tbd') {
        const cfg = ACTIVITY_CONFIG[activity as ActivityType];
        if (cfg) activityMessage = `Suggested activity: ${cfg.icon} ${cfg.label}`;
      }

      const slotsToSend = slots.filter((s) => selected.has(slotKey(s)));
      for (const s of slotsToSend) {
        await sendRequest.mutateAsync({
          recipientUserId: friendId,
          requesterName:   myName ?? 'A friend',
          selectedDay:     s.date,
          selectedSlot:    s.slot,
          message:         activityMessage,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('suggest-hang send failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not send', err?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [canSend, friendId, activity, customActivity, slots, selected, myName, sendRequest]);

  const sendLabel = sending
    ? 'Sending…'
    : selected.size <= 1
      ? `Send to ${firstName}`
      : `Send ${selected.size} options to ${firstName}`;

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
        <Text className="font-display text-base text-foreground">Suggest a time</Text>
        <View className="w-9 h-9" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 py-5 gap-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {/* Friend card */}
        {friend && (
          <Pressable
            onPress={() => router.push(`/(app)/friend/${friendId}`)}
            className="flex-row items-center bg-card rounded-2xl border border-border/30 px-4 py-3 gap-3 shadow-sm active:opacity-80"
          >
            <Avatar url={vibe?.avatarUrl ?? friend.avatar} displayName={friend.name} size="md" />
            <View className="flex-1">
              <Text className="font-display text-base text-evergreen" numberOfLines={1}>
                {firstName}
              </Text>
              <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                Mutually free with you this week
              </Text>
            </View>
            <View className="bg-primary/10 rounded-full px-2 py-0.5">
              <Text className="font-sans text-[11px] font-semibold text-primary">
                {slots.length} slot{slots.length === 1 ? '' : 's'}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Slot multi-select */}
        <View>
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-1">
            Pick one or more times
          </Text>
          <Text className="font-sans text-xs text-muted-foreground/70 px-0.5 mb-2">
            {selected.size === 0
              ? `${firstName} can accept any of the times you send`
              : `${selected.size} selected — add more or send`}
          </Text>

          {isLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator color={PARADE_GREEN} />
            </View>
          ) : sortedSlots.length === 0 ? (
            <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-6 items-center gap-1">
              <Text className="font-sans text-sm text-muted-foreground">
                No mutual free times this week
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {sortedSlots.map((s) => {
                const k = slotKey(s);
                const isSelected = selected.has(k);
                const recommended = topPickKeys.has(k);
                const meta = TIME_SLOT_LABELS[s.slot];
                return (
                  <Pressable
                    key={k}
                    onPress={() => toggleSlot(s)}
                    className={`flex-row items-center justify-between rounded-2xl border px-4 py-3 active:opacity-80 ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50'
                        : 'bg-card border-border/30'
                    }`}
                  >
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-1.5">
                        <Text
                          className={`font-sans text-sm font-semibold ${
                            isToday(parseISO(s.date)) ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {slotDayLabel(s.date)}
                        </Text>
                        {recommended && (
                          <View
                            className="flex-row items-center gap-0.5 rounded-full px-1.5 py-px"
                            style={{ backgroundColor: TINT.secondarySubtle }}
                          >
                            <Sparkles size={9} color={EMBER} strokeWidth={2} />
                            <Text
                              className="font-sans text-[9px] font-semibold uppercase tracking-wide"
                              style={{ color: EMBER }}
                            >
                              Pick
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                        {meta.label} · {meta.time}
                      </Text>
                    </View>
                    {isSelected ? (
                      <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                        <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                      </View>
                    ) : (
                      <CalendarPlus size={16} color={ELEPHANT} strokeWidth={1.75} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Optional activity suggestion */}
        <View>
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
            Suggest an activity (optional)
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setActivity('tbd'); setCustomActivity(''); }}
              className={`rounded-full border px-3 py-1.5 active:opacity-70 ${
                activity === 'tbd' ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40'
              }`}
            >
              <Text className="font-sans text-xs font-medium text-foreground">
                🤷 Let them choose
              </Text>
            </Pressable>
            {QUICK_ACTIVITIES.map((id) => {
              const cfg = ACTIVITY_CONFIG[id];
              if (!cfg) return null;
              const isSel = activity === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActivity(isSel ? 'tbd' : id);
                    setCustomActivity('');
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
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setActivity('custom'); }}
              className={`rounded-full border px-3 py-1.5 active:opacity-70 ${
                activity === 'custom' ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40'
              }`}
            >
              <Text className="font-sans text-xs font-medium text-foreground">✏️ Custom…</Text>
            </Pressable>
          </View>
          {activity === 'custom' && (
            <TextInput
              autoFocus
              value={customActivity}
              onChangeText={setCustomActivity}
              placeholder="e.g. Pottery class, picnic at the park"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm mt-2"
              maxLength={100}
            />
          )}
        </View>
      </ScrollView>

      {/* Send bar */}
      <View className="px-5 pb-4 pt-2 border-t border-border/20 bg-chalk">
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          className={`flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${
            canSend ? 'bg-primary active:opacity-90' : 'bg-muted'
          }`}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Send size={15} color={canSend ? '#FFFFFF' : ELEPHANT} strokeWidth={2} />
          )}
          <Text
            className={`font-sans text-sm font-semibold ${
              canSend ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {sendLabel}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
