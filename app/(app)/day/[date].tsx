import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SLOT_LABELS: Record<string, string> = {
  early_morning: 'Early morning',
  late_morning: 'Late morning',
  early_afternoon: 'Afternoon',
  late_afternoon: 'Late afternoon',
  evening: 'Evening',
  late_night: 'Late night',
};

const STATUS_STYLES: Record<string, string> = {
  free: 'bg-sage/20 text-evergreen',
  busy: 'bg-ember/15 text-ember',
  maybe: 'bg-butter/40 text-evergreen',
};

function useDayData(userId: string | undefined, date: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['day', userId, date],
    queryFn: async () => {
      const [{ data: avail }, { data: plans }] = await Promise.all([
        supabase
          .from('availability')
          .select('*')
          .eq('user_id', userId!)
          .eq('date', date)
          .maybeSingle(),
        supabase
          .from('plans')
          .select('id, title, time_slot, location')
          .eq('user_id', userId!)
          .eq('date', date),
      ]);
      return { avail, plans: plans ?? [] };
    },
  });
}

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { user } = useAuth();
  const { data, isLoading } = useDayData(user?.id, date);
  const avail = data?.avail;
  const plans = data?.plans ?? [];

  const parsedDate = date ? parseISO(date) : new Date();
  const slots = Object.entries(SLOT_LABELS);

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
        <View className="flex-1">
          <Text className="font-sans font-semibold text-evergreen text-xl">
            {format(parsedDate, 'EEEE')}
          </Text>
          <Text className="font-sans text-sm text-foreground/50">
            {format(parsedDate, 'MMMM d, yyyy')}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#DDA73A" />
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-10 gap-5 pt-2">
          {/* Availability */}
          <View className="gap-3">
            <Text className="font-sans text-xs text-foreground/40 uppercase tracking-widest">
              Availability
            </Text>
            <View className="bg-white rounded-3xl border border-border/30 divide-y divide-border/20">
              {slots.map(([slot, label]) => {
                const status = avail?.[slot as keyof typeof avail] as string | null;
                return (
                  <View key={slot} className="flex-row items-center px-5 py-3 gap-3">
                    <Text className="font-sans text-sm text-foreground flex-1">{label}</Text>
                    {status ? (
                      <View
                        className={`rounded-full px-3 py-1 ${STATUS_STYLES[status] ?? 'bg-border text-foreground/50'}`}
                      >
                        <Text className="font-sans text-xs capitalize">{status}</Text>
                      </View>
                    ) : (
                      <Text className="font-sans text-xs text-foreground/30">—</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Plans */}
          {plans.length > 0 && (
            <View className="gap-3">
              <Text className="font-sans text-xs text-foreground/40 uppercase tracking-widest">
                Plans
              </Text>
              {plans.map((plan: any) => (
                <Pressable
                  key={plan.id}
                  onPress={() => router.push(`/(app)/plan/${plan.id}`)}
                  className="bg-white rounded-2xl border border-border/30 px-5 py-4 gap-1"
                >
                  <Text className="font-sans font-medium text-evergreen text-base" numberOfLines={1}>
                    {plan.title || 'Untitled plan'}
                  </Text>
                  <Text className="font-sans text-sm text-foreground/50">
                    {plan.time_slot ? SLOT_LABELS[plan.time_slot] ?? plan.time_slot : ''}
                    {plan.location ? ` · ${plan.location}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Empty state */}
          {!avail && plans.length === 0 && (
            <View className="items-center py-12">
              <Text className="font-sans text-foreground/30 text-sm">
                Nothing logged for this day yet.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
