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
import { Platform } from 'react-native';

const PARADE_GREEN  = '#23744D';
const ELEPHANT_GRAY = '#929298';
const SIDEBAR_CHALK = '#FAF3E6';
const BORDER        = '#DED4C3';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: SIDEBAR_CHALK,
          borderTopColor: BORDER,
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          height: Platform.OS === 'ios' ? 84 : 64,
        },
        tabBarActiveTintColor:   PARADE_GREEN,
        tabBarInactiveTintColor: ELEPHANT_GRAY,
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
            <User color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
