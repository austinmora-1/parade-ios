/**
 * Tab bar — matches the PWA bottom nav exactly:
 *   Background:    #FAF3E6  (sidebar-chalk custard)
 *   Active tint:   #23744D  (parade green)
 *   Inactive tint: #929298  (elephant gray)
 *   Border:        #DED4C3
 *   Active stroke:   2.2  |  Inactive stroke: 1.8
 *   Label font:    Inter 10px medium
 */
import { Tabs } from 'expo-router';
import { Home, CalendarDays, Users, User } from 'lucide-react-native';
import { Platform, View, Image } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

import { TINT } from '@/lib/colors';
const LIGHT = {
  active:   '#23744D',  // parade green
  inactive: '#929298',  // elephant gray
  surface:  '#FAF3E6',  // sidebar chalk
  border:   '#DED4C3',
};
const DARK = {
  active:   '#3B9B68',  // brighter parade green
  inactive: '#7F8983',
  surface:  '#141916',  // deep forest surface
  border:   '#2A322D',
};
const PARADE_GREEN = LIGHT.active;

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

function ProfileTabIcon({ color, focused, avatarUrl }: { color: string; focused: boolean; avatarUrl: string | null }) {
  if (!avatarUrl) {
    return <User color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />;
  }
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
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
  const { colorScheme } = useColorScheme();
  const c = colorScheme === 'dark' ? DARK : LIGHT;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          height: Platform.OS === 'ios' ? 84 : 64,
        },
        tabBarActiveTintColor:   c.active,
        tabBarInactiveTintColor: c.inactive,
        tabBarLabelStyle: {
          fontFamily: 'Inter_400Regular',
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: ({ color, focused }) => (
            <CalendarDays color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, focused }) => (
            <Users color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <ProfileTabIcon color={color} focused={focused} avatarUrl={avatarUrl} />
          ),
        }}
      />
    </Tabs>
  );
}
