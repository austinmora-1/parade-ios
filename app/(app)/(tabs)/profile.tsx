import { ScrollView, View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings, LogOut } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';

function useProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, display_name, first_name, last_name, avatar_url, bio, ' +
          'onboarding_completed, created_at'
        )
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export default function ProfileTab() {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile(user?.id);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  const name = profile
    ? formatDisplayName({
        firstName: profile.first_name,
        lastName: profile.last_name,
        displayName: profile.display_name,
      })
    : '';

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView className="flex-1" contentContainerClassName="pb-10">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <Text className="font-sans font-semibold text-evergreen text-2xl">Profile</Text>
          <Pressable
            className="w-10 h-10 rounded-full bg-evergreen/8 items-center justify-center"
            hitSlop={8}
          >
            <Settings size={20} color="#2F4A3E" strokeWidth={1.75} />
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator className="mt-16" color="#DDA73A" />
        ) : (
          <>
            {/* Avatar + name hero */}
            <View className="items-center px-5 pt-6 pb-8 gap-3">
              <Avatar
                url={profile?.avatar_url}
                firstName={profile?.first_name}
                lastName={profile?.last_name}
                displayName={profile?.display_name}
                size="xl"
              />
              <View className="items-center gap-0.5">
                <Text className="font-sans font-semibold text-evergreen text-2xl">{name}</Text>
                {profile?.display_name ? (
                  <Text className="font-sans text-sm text-foreground/50">
                    @{profile.display_name}
                  </Text>
                ) : null}
              </View>
              {profile?.bio ? (
                <Text className="font-sans text-sm text-foreground/70 text-center px-6 leading-relaxed">
                  {profile.bio}
                </Text>
              ) : null}
            </View>

            {/* Info rows */}
            <View className="px-5 gap-3">
              <InfoRow label="Email" value={user?.email ?? '—'} />
              <InfoRow
                label="Member since"
                value={
                  profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'
                }
              />
            </View>

            {/* Sign out */}
            <View className="px-5 mt-8">
              <Pressable
                onPress={handleSignOut}
                className="flex-row items-center gap-3 bg-white border border-border/40 rounded-2xl px-4 py-4"
              >
                <LogOut size={18} color="#D46549" strokeWidth={1.75} />
                <Text className="font-sans text-ember font-medium text-base">Sign out</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="bg-white rounded-2xl px-4 py-3 border border-border/30 flex-row justify-between items-center">
      <Text className="font-sans text-sm text-foreground/50">{label}</Text>
      <Text className="font-sans text-sm text-evergreen font-medium">{value}</Text>
    </View>
  );
}
