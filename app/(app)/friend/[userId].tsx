import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, CalendarDays } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';

function useFriendProfile(userId: string) {
  return useQuery({
    queryKey: ['friend-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, display_name, first_name, last_name, avatar_url, bio, ' +
          'current_vibe, location_status, neighborhood, show_availability'
        )
        .eq('user_id', userId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

function useFriendAvailability(userId: string) {
  return useQuery({
    queryKey: ['friend-availability', userId],
    queryFn: async () => {
      const today = new Date();
      const start = format(today, 'yyyy-MM-dd');
      const end = format(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14),
        'yyyy-MM-dd'
      );
      const { data } = await supabase
        .from('availability')
        .select('date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });
      return data ?? [];
    },
  });
}

const SLOTS = [
  'early_morning', 'late_morning', 'early_afternoon',
  'late_afternoon', 'evening', 'late_night',
] as const;
const SLOT_SHORT: Record<string, string> = {
  early_morning: 'AM', late_morning: 'Mid', early_afternoon: 'PM',
  late_afternoon: 'Aft', evening: 'Eve', late_night: 'Late',
};

export default function FriendProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data: profile, isLoading } = useFriendProfile(userId);
  const { data: availability } = useFriendAvailability(userId);

  const name = profile
    ? formatDisplayName({
        firstName: profile.first_name,
        lastName: profile.last_name,
        displayName: profile.display_name,
      })
    : '';

  // Days that have at least one free slot
  const freeDays = (availability ?? []).filter((row: any) =>
    SLOTS.some((s) => row[s] === 'free')
  );

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-2">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center"
          hitSlop={8}
        >
          <ChevronLeft size={24} color="#2F4A3E" strokeWidth={1.75} />
        </Pressable>
        <Text className="font-sans font-semibold text-evergreen text-xl flex-1" numberOfLines={1}>
          {name || 'Friend'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#DDA73A" />
      ) : (
        <ScrollView contentContainerClassName="pb-10 gap-6 pt-2">
          {/* Profile hero */}
          <View className="items-center px-5 py-6 gap-3">
            <Avatar
              url={profile?.avatar_url}
              firstName={profile?.first_name}
              lastName={profile?.last_name}
              displayName={profile?.display_name}
              size="xl"
            />
            <View className="items-center gap-0.5">
              <Text className="font-sans font-semibold text-evergreen text-2xl">{name}</Text>
              {profile?.display_name && (
                <Text className="font-sans text-sm text-foreground/50">@{profile.display_name}</Text>
              )}
            </View>
            {profile?.bio ? (
              <Text className="font-sans text-sm text-foreground/70 text-center px-6 leading-relaxed">
                {profile.bio}
              </Text>
            ) : null}
            {profile?.current_vibe ? (
              <View className="bg-butter/50 rounded-full px-4 py-1.5">
                <Text className="font-sans text-sm text-evergreen">{profile.current_vibe}</Text>
              </View>
            ) : null}
          </View>

          {/* Availability preview */}
          {profile?.show_availability !== false && freeDays.length > 0 && (
            <View className="px-5 gap-3">
              <View className="flex-row items-center gap-2">
                <CalendarDays size={15} color="#9CB094" strokeWidth={1.75} />
                <Text className="font-sans text-xs text-foreground/50 uppercase tracking-widest">
                  Free windows
                </Text>
              </View>
              <View className="gap-2">
                {freeDays.slice(0, 5).map((row: any) => {
                  const day = new Date(row.date + 'T00:00:00');
                  const freeSlots = SLOTS.filter((s) => row[s] === 'free');
                  return (
                    <View
                      key={row.date}
                      className="bg-white rounded-2xl border border-border/30 px-4 py-3 flex-row items-center gap-3"
                    >
                      <View className="w-12 gap-0.5">
                        <Text className="font-sans text-xs text-foreground/40">{format(day, 'EEE')}</Text>
                        <Text className={`font-sans font-semibold text-lg ${isToday(day) ? 'text-marigold' : 'text-evergreen'}`}>
                          {format(day, 'd')}
                        </Text>
                      </View>
                      <View className="flex-row flex-wrap gap-1.5 flex-1">
                        {freeSlots.map((s) => (
                          <View key={s} className="bg-sage/20 rounded-lg px-2 py-1">
                            <Text className="font-sans text-xs text-evergreen">
                              {SLOT_SHORT[s]}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
