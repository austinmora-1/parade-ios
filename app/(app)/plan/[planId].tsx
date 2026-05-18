/**
 * Plan detail — read-only Phase 1.
 * Matches PWA plan-card style: left-border activity accent, Fraunces title,
 * detail rows (Date / Time / Location / People), notes section.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Calendar, Clock, MapPin, Users } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  early_morning:    'Early morning',
  late_morning:     'Late morning',
  early_afternoon:  'Afternoon',
  late_afternoon:   'Late afternoon',
  evening:          'Evening',
  late_night:       'Late night',
};

const ACTIVITY_COLOR: Record<string, string> = {
  drinks: '#D46549', food: '#D46549', coffee: '#C47030', brunch: '#D46549',
  'happy-hour': '#D46549', hike: '#9CB094', run: '#9CB094', gym: '#9CB094',
  sports: '#9CB094', movie: '#7744BB', concert: '#6E9BC2', game: '#7744BB',
  travel: '#23744D', beach: '#23744D', park: '#23744D', meetup: '#23744D',
};
function activityAccent(activity?: string): string {
  return ACTIVITY_COLOR[activity ?? ''] ?? '#23744D';
}

// ─── Data ─────────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    <View className="flex-row items-center px-4 py-3.5 gap-3">
      {icon}
      <Text className="font-sans text-xs text-muted-foreground w-16 uppercase tracking-wide">
        {label}
      </Text>
      <Text className="font-sans text-sm text-foreground font-medium flex-1">
        {children as string}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { data, isLoading, error } = usePlan(planId);
  const plan = data?.plan as any;
  const participants = data?.participants ?? [];

  const accentColor = activityAccent(plan?.activity);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 gap-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <Text
          className="font-display text-base text-foreground flex-1"
          numberOfLines={1}
        >
          {plan?.title ?? 'Plan'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : error || !plan ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            {error ? 'Could not load this plan.' : 'Plan not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-10 gap-4 pt-2">
          {/* Hero card — white with activity left-border accent + Fraunces title */}
          <View className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm">
            <View style={{ width: 4, backgroundColor: accentColor }} />
            <View className="flex-1 px-5 py-4 gap-1.5">
              <Text className="font-display text-2xl text-foreground leading-tight">
                {plan.title || 'Untitled plan'}
              </Text>
              {plan.description ? (
                <Text className="font-sans text-sm text-foreground/70 leading-relaxed mt-1">
                  {plan.description}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Details card */}
          <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
            <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Date">
              {format(new Date(plan.date), 'EEE, MMM d, yyyy')}
            </DetailRow>
            <View className="h-px bg-border/30 mx-4" />

            {plan.time_slot && (
              <>
                <DetailRow icon={<Clock size={15} color="#929298" strokeWidth={1.75} />} label="Time">
                  {SLOT_LABELS[plan.time_slot] ?? plan.time_slot}
                </DetailRow>
                <View className="h-px bg-border/30 mx-4" />
              </>
            )}

            {plan.location && (
              <>
                <DetailRow icon={<MapPin size={15} color="#929298" strokeWidth={1.75} />} label="Where">
                  {plan.location}
                </DetailRow>
                <View className="h-px bg-border/30 mx-4" />
              </>
            )}

            <DetailRow icon={<Users size={15} color="#929298" strokeWidth={1.75} />} label="People">
              {participants.length + 1} going
            </DetailRow>
          </View>

          {/* Notes */}
          {plan.notes ? (
            <View className="bg-white rounded-2xl border border-border/30 p-5 gap-2 shadow-sm">
              <Text className="font-sans text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Notes
              </Text>
              <Text className="font-sans text-sm text-foreground leading-relaxed">
                {plan.notes}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
