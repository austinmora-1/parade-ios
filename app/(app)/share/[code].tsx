/**
 * /share/{share_code} — in-app landing for availability share links.
 *
 * These links are primarily the PWA's availability page (helloparade.app/share/
 * {code}), but a universal link opens the installed app first. So for app users
 * we resolve the share_code to the sender and drop them on that person's
 * profile, which is the in-app equivalent of "see when I'm free". Falls back to
 * the home tabs if the code can't be resolved. Keeps ?src= attribution.
 */
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export default function ShareScreen() {
  const { code, src } = useLocalSearchParams<{ code: string; src?: string }>();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !code) return;
      try {
        const { data } = await (supabase as any).rpc('get_profile_by_share_code', {
          p_share_code: code,
        });
        const profile = Array.isArray(data) ? data[0] : data;
        const targetId: string | undefined = profile?.user_id;
        if (cancelled) return;
        if (targetId) {
          const srcQuery = src ? `?src=${encodeURIComponent(src)}` : '';
          router.replace(`/(app)/friend/${targetId}${srcQuery}`);
        } else {
          router.replace('/(app)/(tabs)');
        }
      } catch {
        if (!cancelled) router.replace('/(app)/(tabs)');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, code, src]);

  return (
    <View className="flex-1 items-center justify-center bg-chalk">
      <ActivityIndicator size="large" color="#23744D" />
    </View>
  );
}
