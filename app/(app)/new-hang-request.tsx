/**
 * Compose a Hang Request — modal-presented form.
 *
 * Reached via:
 *   - Friend profile "Send a ping" button (with ?friendId=xxx)
 *   - (Future) FAB sheet quick-action
 *
 * Form: friend picker → day chip → time slot → optional message → send.
 * On send: inserts a hang_requests row. Recipient sees it on their Home tab
 * via the Hang Requests widget and can accept (creates a plan) or decline.
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
import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, addDays, isToday, isTomorrow, isSameDay } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, Check, Search } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useSendHangRequest } from '@/hooks/useHangRequests';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
import type { TimeSlot } from '@/types/planner';
import { TC } from '@/lib/theme';

import { TINT } from '@/lib/colors';
import { Chip } from '@/components/primitives/Chip';
import { FieldLabel } from '@/components/primitives/FieldLabel';
import { SLOT_OPTIONS } from '@/lib/socialSlots';

function dateLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}

/** Quick query to look up the requester's own display name */
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

export default function NewHangRequestScreen() {
  // friendId/day/slot/message can be prefilled (e.g. from the iMessage
  // extension via /imsg — see app/(app)/imsg.tsx).
  const {
    friendId: friendIdParam,
    day: dayParam,
    slot: slotParam,
    message: messageParam,
  } = useLocalSearchParams<{
    friendId?: string;
    day?: string;
    slot?: string;
    message?: string;
  }>();
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const sendRequest = useSendHangRequest();
  const { data: myName } = useMyDisplayName(user?.id);

  const connectedFriends = friends.filter(
    (f) => f.status === 'connected' && f.friendUserId,
  );

  const [recipientId, setRecipientId] = useState<string | null>(
    friendIdParam ?? null,
  );
  const [day,     setDay]     = useState<Date>(() => {
    // Prefill day from a yyyy-MM-dd param if valid, else default to tomorrow.
    if (dayParam) {
      const parsed = new Date(`${dayParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return addDays(new Date(), 1);
  });
  const [slot,    setSlot]    = useState<TimeSlot>(
    (SLOT_OPTIONS.some((s) => s.id === slotParam) ? slotParam : 'evening') as TimeSlot,
  );
  const [message, setMessage] = useState(messageParam ?? '');
  const [friendQuery, setFriendQuery] = useState('');

  const filteredFriends = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    if (!q) return connectedFriends;
    return connectedFriends.filter((f) => f.name.toLowerCase().includes(q));
  }, [connectedFriends, friendQuery]);

  // If only one friend pre-selected and we came in with ?friendId, keep it
  useEffect(() => {
    if (friendIdParam && !recipientId) setRecipientId(friendIdParam);
  }, [friendIdParam, recipientId]);

  // 14 days so a date prefilled from a shared-availability pick (horizon 14d)
  // is always present in the chip row.
  const dayOptions = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)),
    [],
  );

  const handleSend = useCallback(async () => {
    if (!recipientId) {
      Alert.alert('Pick a friend', 'Choose who to send your ping to.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await sendRequest.mutateAsync({
        recipientUserId: recipientId,
        requesterName:   myName ?? 'A friend',
        selectedDay:     format(day, 'yyyy-MM-dd'),
        selectedSlot:    slot,
        message:         message.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('Send hang request failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not send', err?.message ?? 'Please try again.');
    }
  }, [recipientId, day, slot, message, myName, sendRequest]);

  const saving = sendRequest.isPending;
  const canSubmit = !!recipientId && !saving;

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
        <Text className="font-display text-base text-foreground">Send a ping</Text>
        <Pressable
          onPress={handleSend}
          disabled={!canSubmit}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text className={`font-sans text-sm font-semibold ${
            canSubmit ? 'text-white' : 'text-muted-foreground'
          }`}>
            {saving ? 'Sending…' : 'Send'}
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
          <View className="bg-primary/8 rounded-2xl px-4 py-3">
            <Text className="font-sans text-xs text-primary leading-relaxed">
              A ping is a lightweight "Hey, free then?" message. They can
              accept (turns into a plan) or pass — no pressure either way.
            </Text>
          </View>

          {/* Friend picker — horizontal avatar scroller (matches the rest of
              the app's selection UIs and the friend-profile ping aesthetic) */}
          {!friendIdParam && (
            <View>
              <FieldLabel>Send to</FieldLabel>
              {connectedFriends.length === 0 ? (
                <View className="bg-card rounded-2xl border border-border/30 px-4 py-5 items-center shadow-sm">
                  <Text className="font-sans text-sm text-muted-foreground">
                    No friends yet — add some first.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Search — surfaced once there are enough friends to scroll */}
                  {connectedFriends.length > 5 && (
                    <View className="flex-row items-center gap-2 bg-card rounded-xl border border-border/40 px-3 mb-2.5 shadow-sm">
                      <Search size={14} color="#929298" strokeWidth={2} />
                      <TextInput
                        value={friendQuery}
                        onChangeText={setFriendQuery}
                        placeholder="Search friends"
                        placeholderTextColor="#929298"
                        className="flex-1 py-2 font-sans text-[15px] text-foreground"
                        autoCorrect={false}
                      />
                      {friendQuery.length > 0 && (
                        <Pressable onPress={() => setFriendQuery('')} hitSlop={6}>
                          <X size={13} color="#929298" strokeWidth={2} />
                        </Pressable>
                      )}
                    </View>
                  )}

                  {filteredFriends.length === 0 ? (
                    <View className="bg-card rounded-2xl border border-border/30 px-4 py-4 items-center shadow-sm">
                      <Text className="font-sans text-sm text-muted-foreground">
                        No friends match “{friendQuery.trim()}”.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 14, paddingHorizontal: 2, paddingVertical: 4 }}
                    >
                      {filteredFriends.map((f) => {
                    const selected = recipientId === f.friendUserId;
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setRecipientId(f.friendUserId!);
                        }}
                        className="items-center active:opacity-70"
                        style={{ width: 68 }}
                      >
                        <View
                          className="rounded-full"
                          style={{
                            padding: 2,
                            borderWidth: 2,
                            borderColor: selected ? '#23744D' : 'transparent',
                          }}
                        >
                          <Avatar url={f.avatar} displayName={f.name} size="lg" />
                          {selected && (
                            <View className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary items-center justify-center border-2 border-card">
                              <Check size={11} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          )}
                        </View>
                        <Text
                          numberOfLines={1}
                          className={`font-sans text-[13px] mt-1.5 ${
                            selected ? 'font-semibold text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {f.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    );
                      })}
                    </ScrollView>
                  )}
                </>
              )}
            </View>
          )}

          {/* Pre-filled friend chip (when ?friendId was passed) */}
          {friendIdParam && (
            <View>
              <FieldLabel>Sending to</FieldLabel>
              {(() => {
                const f = connectedFriends.find((x) => x.friendUserId === friendIdParam);
                if (!f) return null;
                return (
                  <View className="flex-row items-center bg-card rounded-xl border border-border/30 px-3 py-2.5 gap-3 shadow-sm">
                    <Avatar url={f.avatar} displayName={f.name} size="sm" />
                    <Text className="flex-1 font-sans text-sm font-medium text-foreground">
                      {f.name}
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Day */}
          <View>
            <FieldLabel>When</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-0.5 pb-1"
            >
              {dayOptions.map((d) => {
                const selected = isSameDay(d, day);
                return (
                  <Chip
                    key={d.toISOString()}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setDay(d); }}
                  >
                    <View className="items-center">
                      <Text className={`font-sans text-[10px] font-semibold uppercase tracking-wider ${
                        selected ? 'text-white/80' : 'text-muted-foreground'
                      }`}>
                        {dateLabel(d)}
                      </Text>
                      <Text className={`font-display text-base ${
                        selected ? 'text-white' : 'text-foreground'
                      }`}>
                        {format(d, 'MMM d')}
                      </Text>
                    </View>
                  </Chip>
                );
              })}
            </ScrollView>
          </View>

          {/* Time slot */}
          <View>
            <FieldLabel>Time</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {SLOT_OPTIONS.map((s) => {
                const selected = slot === s.id;
                return (
                  <Chip
                    key={s.id}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setSlot(s.id); }}
                  >
                    <View>
                      <Text className={`font-sans text-xs font-semibold ${
                        selected ? 'text-white' : 'text-foreground'
                      }`}>
                        {s.label}
                      </Text>
                      <Text className={`font-sans text-[10px] ${
                        selected ? 'text-white/70' : 'text-muted-foreground'
                      }`}>
                        {s.range}
                      </Text>
                    </View>
                  </Chip>
                );
              })}
            </View>
          </View>

          {/* Message */}
          <View>
            <FieldLabel>Message (optional)</FieldLabel>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Drinks at that new place? ☕"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
              maxLength={200}
              multiline
              numberOfLines={3}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
