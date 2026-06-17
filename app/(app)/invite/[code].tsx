/**
 * /invite/{share_code} — auto-connect handler for the "Invite friends to
 * Parade" bubble sent from the iMessage extension (and any invite link keyed
 * by a sender's share_code).
 *
 * Resolves the share_code to the sender's profile, sends a friend request from
 * the recipient back to the sender (reusing friendsStore.addFriend, which
 * de-dupes existing friendships and fires the request push), then drops the
 * recipient on the sender's profile. Keeps the ?src=imessage attribution.
 *
 * Auth is enforced by (app)/_layout; a signed-out recipient is sent to login
 * first and returned here afterward (lib/pendingDeepLink).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useFriendsStore } from '@/stores/friendsStore';
import { supabase } from '@/integrations/supabase/client';

type Phase = 'working' | 'self' | 'error';

export default function InviteScreen() {
  const { code, src } = useLocalSearchParams<{ code: string; src?: string }>();
  const { user } = useAuth();
  const addFriend = useFriendsStore((s) => s.addFriend);
  const [phase, setPhase] = useState<Phase>('working');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !code) return;
      try {
        const { data, error } = await (supabase as any).rpc('get_profile_by_share_code', {
          p_share_code: code,
        });
        if (error) throw error;
        const profile = Array.isArray(data) ? data[0] : data;
        const inviterId: string | undefined = profile?.user_id;
        if (!inviterId) {
          if (!cancelled) setPhase('error');
          return;
        }
        // Opening your own invite link — nothing to connect.
        if (inviterId === user.id) {
          if (!cancelled) setPhase('self');
          return;
        }

        await addFriend(
          {
            name: profile.display_name || 'Friend',
            friendUserId: inviterId,
            status: 'pending',
          },
          user.id,
        );

        if (!cancelled) {
          const srcQuery = src ? `?src=${encodeURIComponent(src)}` : '';
          router.replace(`/(app)/friend/${inviterId}${srcQuery}`);
        }
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, code, src, addFriend]);

  if (phase === 'working') {
    return (
      <View className="flex-1 items-center justify-center bg-chalk">
        <ActivityIndicator size="large" color="#23744D" />
      </View>
    );
  }

  const message =
    phase === 'self'
      ? "This is your own invite link — share it with a friend to connect."
      : "We couldn't open that invite link. It may have expired.";

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-chalk px-8">
      <Text className="text-center font-sans text-base text-foreground">{message}</Text>
      <Pressable
        onPress={() => router.replace('/(app)/(tabs)')}
        className="rounded-full bg-evergreen px-6 py-3"
      >
        <Text className="font-sans font-semibold text-white">Go to Parade</Text>
      </Pressable>
    </View>
  );
}
