import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Calendar, Clock, MapPin, Users } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

const SLOT_LABELS: Record<string, string> = {
  early_morning: 'Early morning',
  late_morning: 'Late morning',
  early_afternoon: 'Afternoon',
  late_afternoon: 'Late afternoon',
  evening: 'Evening',
  late_night: 'Late night',
};

function usePlan(planId: string) {
  return useQuery({
    queryKey: ['plan', planId],
    queryFn: async () => {
      const [{ data: plan, error }, { data: participants }] = await Promise.all([
        supabase.from('plans').select('*').eq('id', planId).single(),
        supabase
          .from('plan_participants')
          .select('friend_id, status, role')
          .eq('plan_id', planId),
      ]);
      if (error) throw error;
      return { plan, participants: participants ?? [] };
    },
  });
}

export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { data, isLoading, error } = usePlan(planId);
  const plan = data?.plan;
  const participants = data?.participants ?? [];

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
          {plan?.title ?? 'Plan'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#DDA73A" />
      ) : error || !plan ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-foreground/40 text-center">
            {error ? 'Could not load this plan.' : 'Plan not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-10 gap-5 pt-2">
          {/* Hero card */}
          <View className="bg-evergreen rounded-3xl p-6 gap-2">
            <Text style={{ fontFamily: 'CormorantGaramond_500Medium' }} className="text-3xl text-chalk">
              {plan.title || 'Untitled plan'}
            </Text>
            {(plan as any).description ? (
              <Text className="font-sans text-sage text-sm leading-relaxed">{(plan as any).description}</Text>
            ) : null}
          </View>

          {/* Details */}
          <View className="bg-white rounded-3xl border border-border/30 divide-y divide-border/20">
            <DetailRow icon={<Calendar size={16} color="#9CB094" />} label="Date">
              {format(new Date(plan.date), 'EEEE, MMMM d, yyyy')}
            </DetailRow>
            {plan.time_slot && (
              <DetailRow icon={<Clock size={16} color="#9CB094" />} label="Time">
                {SLOT_LABELS[plan.time_slot] ?? plan.time_slot}
              </DetailRow>
            )}
            {plan.location && (
              <DetailRow icon={<MapPin size={16} color="#9CB094" />} label="Location">
                {plan.location}
              </DetailRow>
            )}
            <DetailRow icon={<Users size={16} color="#9CB094" />} label="People">
              {participants.length + 1} going
            </DetailRow>
          </View>

          {/* Notes */}
          {plan.notes ? (
            <View className="bg-white rounded-3xl border border-border/30 p-5 gap-2">
              <Text className="font-sans text-xs text-foreground/40 uppercase tracking-widest">Notes</Text>
              <Text className="font-sans text-sm text-foreground leading-relaxed">{plan.notes}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center px-5 py-4 gap-3">
      {icon}
      <Text className="font-sans text-sm text-foreground/50 w-16">{label}</Text>
      <Text className="font-sans text-sm text-evergreen font-medium flex-1">{children as string}</Text>
    </View>
  );
}
