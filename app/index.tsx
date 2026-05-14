import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

/**
 * Root entry point — reads auth state and routes to the correct group.
 * Shows a chalk-background spinner while auth initialises (< 5 s).
 */
export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-chalk">
        <ActivityIndicator size="large" color="#DDA73A" />
      </View>
    );
  }

  return <Redirect href={user ? '/(app)/(tabs)' : '/(auth)/login'} />;
}
