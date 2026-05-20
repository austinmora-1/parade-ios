import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Root entry point — reads auth state + onboarding status and routes to the
 * correct group. Shows a chalk-background spinner while either resolves.
 */

function useOnboardingStatus(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['onboarding-status', userId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      // Default to "completed" if row missing — safer than infinite redirect
      return (data?.onboarding_completed as boolean | undefined) ?? true;
    },
  });
}

export default function Index() {
  const { user, loading } = useAuth();
  const { data: onboardingDone, isLoading: profileLoading } =
    useOnboardingStatus(user?.id);

  if (loading || (user && profileLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-chalk">
        <ActivityIndicator size="large" color="#23744D" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;
  if (!onboardingDone) return <Redirect href="/(app)/onboarding" />;
  return <Redirect href="/(app)/(tabs)" />;
}
