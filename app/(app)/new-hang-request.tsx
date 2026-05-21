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
import { X } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useSendHangRequest } from '@/hooks/useHangRequests';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
import type { TimeSlot } from '@/types/planner';

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

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

function Chip({ selected, onPress, children }: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl px-3 py-2.5 border active:opacity-70 ${
        selected ? 'bg-primary border-primary' : 'bg-white border-border/40'
      }`}
    >
      <View className="flex-row items-center gap-1.5">{children}</View>
    </Pressable>
  );
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
  const { friendId: friendIdParam } = useLocalSearchParams<{ friendId?: string }>();
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
  const [day,     setDay]     = useState<Date>(addDays(new Date(), 1)); // default tomorrow
  const [slot,    setSlot]    = useState<TimeSlot>('evening');
  const [message, setMessage] = useState('');

  // If only one friend pre-selected and we came in with ?friendId, keep it
  useEffect(() => {
    if (friendIdParam && !recipientId) setRecipientId(friendIdParam);
  }, [friendIdParam, recipientId]);

  const dayOptions = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)),
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
          <X size={20} color="#2F4F3F" strokeWidth={2} />
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

          {/* Friend picker */}
          {!friendIdParam && (
            <View>
              <FieldLabel>Send to</FieldLabel>
              <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                {connectedFriends.length === 0 ? (
                  <View className="px-4 py-5 items-center">
                    <Text className="font-sans text-sm text-muted-foreground">
                      No friends yet — add some first.
                    </Text>
                  </View>
                ) : (
                  connectedFriends.map((f, i) => {
                    const selected = recipientId === f.friendUserId;
                    return (
                      <View key={f.id}>
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync();
                            setRecipientId(f.friendUserId!);
                          }}
                          className={`flex-row items-center px-4 py-3 gap-3 active:bg-muted/30 ${
                            selected ? 'bg-primary/8' : ''
                          }`}
                        >
                          <Avatar url={f.avatar} displayName={f.name} size="sm" />
                          <Text className="flex-1 font-sans text-sm font-medium text-foreground" numberOfLines={1}>
                            {f.name}
                          </Text>
                          <View
                            style={{
                              width: 20, height: 20, borderRadius: 999,
                              borderWidth: 2,
                              borderColor: selected ? '#23744D' : 'rgba(146,146,152,0.4)',
                              backgroundColor: selected ? '#23744D' : 'transparent',
                            }}
                          />
                        </Pressable>
                        {i < connectedFriends.length - 1 && (
                          <View className="h-px bg-border/30 mx-4" />
                        )}
                      </View>
                    );
                  })
                )}
              </View>
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
                  <View className="flex-row items-center bg-white rounded-xl border border-border/30 px-3 py-2.5 gap-3 shadow-sm">
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
              {SLOTS.map((s) => {
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
              className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
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
