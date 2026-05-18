/**
 * Day detail — read-only Phase 1.
 * Shows your availability for the day + any plans on that date.
 * Matches PWA visual treatment: Fraunces day heading, colored availability
 * pills, left-border-accent plan cards.
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
import { ChevronLeft, Clock, MapPin } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ─── Constants ────────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  early_morning:    'Early morning',
  late_morning:     'Late morning',
  early_afternoon:  'Afternoon',
  late_afternoon:   'Late afternoon',
  evening:          'Evening',
  late_night:       'Late night',
};

const SLOT_TIME: Record<string, string> = {
  early_morning:    '6–9am',
  late_morning:     '9am–12pm',
  early_afternoon:  '12–3pm',
  late_afternoon:   '3–6pm',
  evening:          '6–10pm',
  late_night:       '10pm+',
};

/** Activity → left-border accent color (matches dashboard + plans tab) */
const ACTIVITY_COLOR: Record<string, string> = {
  drinks: '#D46549', food: '#D46549', coffee: '#C47030', brunch: '#D46549',
  'happy-hour': '#D46549', hike: '#9CB094', run: '#9CB094', gym: '#9CB094',
  sports: '#9CB094', movie: '#7744BB', concert: '#6E9BC2', game: '#7744BB',
  travel: '#23744D', beach: '#23744D', park: '#23744D', meetup: '#23744D',
};
function activityAccent(activity?: string): string {
  return ACTIVITY_COLOR[activity ?? ''] ?? '#23744D';
}

/** Status → pill styling for free / busy / maybe */
function statusPillStyle(status: string | null | undefined) {
  switch (status) {
    case 'free':
      return { bg: 'rgba(35,116,77,0.12)', fg: '#23744D', label: 'Free' };
    case 'busy':
      return { bg: 'rgba(212,101,73,0.12)', fg: '#D46549', label: 'Busy' };
    case 'maybe':
      return { bg: 'rgba(180,83,9,0.12)', fg: '#92400E', label: 'Maybe' };
    default:
      return null;
  }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

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
          .select('id, title, time_slot, location, activity')
          .eq('user_id', userId!)
          .eq('date', date),
      ]);
      return { avail, plans: plans ?? [] };
    },
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { user } = useAuth();
  const { data, isLoading } = useDayData(user?.id, date);
  const avail: any = data?.avail;
  const plans = (data?.plans ?? []) as any[];

  const parsedDate = date ? parseISO(date) : new Date();
  const today = isToday(parsedDate);
  const slots = Object.entries(SLOT_LABELS);

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
        <View className="flex-1">
          <Text className="font-display text-base text-foreground">
            {today ? 'Today' : format(parsedDate, 'EEEE')}
          </Text>
          <Text className="font-sans text-[11px] text-muted-foreground">
            {format(parsedDate, 'MMMM d, yyyy')}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-10 gap-5 pt-2">
          {/* ── Availability ─────────────────────────────────────────── */}
          <View className="gap-2">
            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
              Availability
            </Text>

            <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
              {slots.map(([slot, label], i) => {
                const status = avail?.[slot] as string | null;
                const pill = statusPillStyle(status);
                return (
                  <View key={slot}>
                    <View className="flex-row items-center px-4 py-3 gap-3">
                      <View className="flex-1">
                        <Text className="font-sans text-sm text-foreground font-medium">
                          {label}
                        </Text>
                        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                          {SLOT_TIME[slot]}
                        </Text>
                      </View>
                      {pill ? (
                        <View
                          style={{
                            backgroundColor: pill.bg,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Inter_600SemiBold',
                              fontSize: 11,
                              color: pill.fg,
                            }}
                          >
                            {pill.label}
                          </Text>
                        </View>
                      ) : (
                        <Text className="font-sans text-xs text-muted-foreground/40">
                          —
                        </Text>
                      )}
                    </View>
                    {i < slots.length - 1 && (
                      <View className="h-px bg-border/30 mx-4" />
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Plans on this day ─────────────────────────────────────── */}
          {plans.length > 0 && (
            <View className="gap-2">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                Plans
              </Text>

              {plans.map((plan) => (
                <Pressable
                  key={plan.id}
                  onPress={() => router.push(`/(app)/plan/${plan.id}`)}
                  className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
                >
                  <View style={{ width: 4, backgroundColor: activityAccent(plan.activity) }} />
                  <View className="flex-1 px-4 py-3 gap-1">
                    <Text
                      className="font-display text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {plan.title || 'Untitled plan'}
                    </Text>

                    <View className="flex-row items-center gap-3">
                      {plan.time_slot && (
                        <View className="flex-row items-center gap-1">
                          <Clock size={11} color="#929298" strokeWidth={1.75} />
                          <Text className="font-sans text-xs text-muted-foreground">
                            {SLOT_LABELS[plan.time_slot] ?? plan.time_slot}
                          </Text>
                        </View>
                      )}
                      {plan.location && (
                        <View className="flex-row items-center gap-1 flex-1">
                          <MapPin size={11} color="#929298" strokeWidth={1.75} />
                          <Text
                            className="font-sans text-xs text-muted-foreground"
                            numberOfLines={1}
                          >
                            {plan.location}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Empty state ──────────────────────────────────────────── */}
          {!avail && plans.length === 0 && (
            <View className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-8 items-center gap-2">
              <Text style={{ fontSize: 28 }}>📅</Text>
              <Text className="font-sans text-sm text-muted-foreground">
                Nothing logged for this day
              </Text>
              <Text className="font-sans text-xs text-muted-foreground/60">
                Mark your availability or add a plan
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
