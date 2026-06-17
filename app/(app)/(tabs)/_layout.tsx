/**
 * Tab bar — Instagram-style floating pill nav.
 *   The visual treatment (rounded ends, sliding highlight, smooth tab
 *   transition) lives in FloatingTabBar; this file wires up the screens,
 *   icons, and the profile avatar.
 */
import { Tabs } from 'expo-router';
import { Home, CalendarDays, Users, User } from 'lucide-react-native';
import { View, Image } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';

import { TINT } from '@/lib/colors';
const PARADE_GREEN = '#23744D';

/** Tiny avatar fetch for the bottom-nav profile tab icon. */
function useTabAvatarUrl(): string | null {
  const { user } = useAuth();
  const { data } = useQuery({
    enabled: !!user?.id,
    queryKey: ['tab-avatar', user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data?.avatar_url as string | null | undefined) ?? null;
    },
  });
  return data ?? null;
}

function ProfileTabIcon({ color, focused, avatarUrl, size = 24 }: { color: string; focused: boolean; avatarUrl: string | null; size?: number }) {
  if (!avatarUrl) {
    return <User color={color} size={size} strokeWidth={focused ? 2.2 : 1.8} />;
  }
  return (
    <View
      style={{
        width: size + 4,
        height: size + 4,
        borderRadius: (size + 4) / 2,
        overflow: 'hidden',
        borderWidth: focused ? 2 : 1,
        borderColor: focused ? PARADE_GREEN : TINT.graySolid,
      }}
    >
      <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

export default function TabsLayout() {
  const avatarUrl = useTabAvatarUrl();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused, size }) => (
            <Home color={color} size={size} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: ({ color, focused, size }) => (
            <CalendarDays color={color} size={size} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, focused, size }) => (
            <Users color={color} size={size} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused, size }) => (
            <ProfileTabIcon color={color} focused={focused} avatarUrl={avatarUrl} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
