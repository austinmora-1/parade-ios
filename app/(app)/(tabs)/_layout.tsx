import { Tabs } from 'expo-router';
import { Home, CalendarDays, Users, User } from 'lucide-react-native';
import { Platform } from 'react-native';

const EVERGREEN = '#2F4A3E';
const SAGE = '#9CB094';
const CHALK = '#F7F2EA';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: CHALK,
          borderTopColor: '#E8E1D6',
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          height: Platform.OS === 'ios' ? 84 : 64,
        },
        tabBarActiveTintColor: EVERGREEN,
        tabBarInactiveTintColor: SAGE,
        tabBarLabelStyle: {
          fontFamily: 'Poppins_400Regular',
          fontSize: 11,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={1.75} />,
        }}
      />
    </Tabs>
  );
}
