/**
 * Pending requests — secondary page off the Friends tab.
 *
 * Lists every pending friend request:
 *  • Incoming  → Accept / Decline buttons
 *  • Outgoing  → "Sent" status + Resend button (re-pings the recipient)
 */
import { ScrollView, View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Check, X, Send } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { usePlannerStore } from '@/stores/plannerStore';
import { Avatar } from '@/components/primitives/Avatar';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { TINT } from '@/lib/colors';

function PendingRow({
  friend,
  onAccept,
  onDecline,
  onResend,
  onPress,
}: {
  friend: any;
  onAccept?: () => void;
  onDecline?: () => void;
  onResend?: () => void;
  onPress: () => void;
}) {
  const isIncoming = friend.isIncoming === true;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-card rounded-xl px-3 py-3 border border-border/20 gap-3 active:opacity-80 shadow-sm"
    >
      <Avatar url={friend.avatar} displayName={friend.name} size="md" />

      <View className="flex-1 min-w-0">
        <Text
          className="font-sans font-medium text-foreground text-sm"
          numberOfLines={1}
        >
          {friend.name}
        </Text>
        <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
          {isIncoming ? 'Wants to connect' : 'Request sent'}
        </Text>
      </View>

      {isIncoming ? (
        <View className="flex-row items-center gap-1.5">
          <Pressable
            onPress={onDecline}
            hitSlop={6}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: TINT.secondarySubtle }}
          >
            <X size={17} color="#D46549" strokeWidth={2.5} />
          </Pressable>
          <Pressable
            onPress={onAccept}
            hitSlop={6}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-80 bg-primary"
          >
            <Check size={17} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onResend}
          hitSlop={6}
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-full active:opacity-70"
          style={{ backgroundColor: TINT.primarySubtle }}
        >
          <Send size={13} color="#23744D" strokeWidth={2.2} />
          <Text className="font-sans text-[12px] font-semibold text-primary">
            Resend
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export default function PendingRequestsScreen() {
  const friends = usePlannerStore((s) => s.friends);
  const acceptFriendRequest = usePlannerStore((s) => s.acceptFriendRequest);
  const removeFriend = usePlannerStore((s) => s.removeFriend);
  const resendFriendRequest = usePlannerStore((s) => s.resendFriendRequest);

  const [resending, setResending] = useState<Set<string>>(new Set());

  const pending = friends.filter((f) => f.status === 'pending');
  const incoming = pending.filter((f) => (f as any).isIncoming === true);
  const outgoing = pending.filter((f) => (f as any).isIncoming !== true);

  const handleAccept = useCallback(
    async (friend: any) => {
      if (!friend.friendUserId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await acceptFriendRequest(friend.id, friend.friendUserId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('Accept failed', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [acceptFriendRequest],
  );

  const handleDecline = useCallback(
    (friend: any) => {
      Alert.alert('Decline request?', `${friend.name} won't be notified.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            try {
              await removeFriend(friend.id);
            } catch (err) {
              console.error('Decline failed', err);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]);
    },
    [removeFriend],
  );

  const handleResend = useCallback(
    async (friend: any) => {
      if (resending.has(friend.id)) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setResending((prev) => new Set(prev).add(friend.id));
      try {
        await resendFriendRequest(friend);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Request resent', `We reminded ${friend.name} about your request.`);
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not resend', 'Please try again in a moment.');
      } finally {
        setResending((prev) => {
          const next = new Set(prev);
          next.delete(friend.id);
          return next;
        });
      }
    },
    [resendFriendRequest, resending],
  );

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader title="Pending requests" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {pending.length === 0 ? (
          <View className="items-center py-20 px-8 gap-3">
            <Text style={{ fontSize: 32 }}>✅</Text>
            <Text className="font-sans text-sm font-semibold text-foreground text-center">
              No pending requests
            </Text>
            <Text className="font-sans text-xs text-muted-foreground text-center">
              When you send or receive a friend request, it'll show up here.
            </Text>
          </View>
        ) : (
          <View className="px-5 pt-2 gap-5">
            {incoming.length > 0 && (
              <View className="gap-2">
                <Text className="font-sans text-sm font-semibold text-foreground px-1">
                  Received ({incoming.length})
                </Text>
                {incoming.map((friend) => (
                  <PendingRow
                    key={friend.id}
                    friend={friend}
                    onAccept={() => handleAccept(friend)}
                    onDecline={() => handleDecline(friend)}
                    onPress={() =>
                      router.push(`/(app)/friend/${friend.friendUserId ?? friend.id}`)
                    }
                  />
                ))}
              </View>
            )}

            {outgoing.length > 0 && (
              <View className="gap-2">
                <Text className="font-sans text-sm font-semibold text-foreground px-1">
                  Sent ({outgoing.length})
                </Text>
                {outgoing.map((friend) => (
                  <PendingRow
                    key={friend.id}
                    friend={friend}
                    onResend={() => handleResend(friend)}
                    onPress={() =>
                      router.push(`/(app)/friend/${friend.friendUserId ?? friend.id}`)
                    }
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
