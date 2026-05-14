import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { ActivityIndicator, View } from 'react-native';

/**
 * Auth group layout — if the user is already signed in, bounce them to the app.
 */
export default function AuthLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-evergreen">
        <ActivityIndicator color="#DDA73A" />
      </View>
    );
  }

  if (user) return <Redirect href="/(app)/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
