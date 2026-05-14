/**
 * UpcomingPlansWidget — shows the user's own upcoming plans within the next 7
 * days, plus friend plans visible via feed. Read-only for Phase 1.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  format,
  addDays,
  isToday,
  isTomorrow,
} from 'date-fns';
import { CalendarCheck, MapPin, Clock, ChevronRight } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { ACTIVITY_CONFIG, TIME_SLOT_LABELS } from '@/types/planner';
import { Skeleton } from '@/components/primitives/Skeleton';
import type { Plan } from '@/types/planner';

const ACTIVITY_EMOJI: Record<string, string> = {
  drinks: '🍹', food: '🍽️', coffee: '☕', brunch: '🥞',
  'happy-hour': '🍻', hike: '🥾', run: '🏃', gym: '🏋️',
  movie: '🎬', concert: '🎵', sports: '⚽', game: '🎮',
  travel: '✈️', beach: '🏖️', park: '🌳', meetup: '👋',
};

function planDayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

export function UpcomingPlansWidget() {
  const plans = usePlannerStore((s) => s.plans);
  const isLoading = usePlannerStore((s) => s.isLoading);

  const { upcoming, totalCount } = useMemo(() => {
    const now = new Date();
    const cutoff = addDays(now, 7);
    const sorted = plans
      .filter((p) => {
        const d = p.date instanceof Date ? p.date : new Date(p.date);
        return d >= now && d <= cutoff;
      })
      .sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date);
        const db = b.date instanceof Date ? b.date : new Date(b.date);
        return da.getTime() - db.getTime();
      });
    return { upcoming: sorted.slice(0, 5) as Plan[], totalCount: sorted.length };
  }, [plans]);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5 px-0.5">
        <CalendarCheck size={13} color="#2F4A3E" strokeWidth={2} />
        <Text className="font-sans text-xs text-foreground/40 uppercase tracking-widest">
          Upcoming
        </Text>
        {!isLoading && totalCount > 0 && (
          <View className="ml-auto bg-evergreen/10 rounded-full px-2 py-0.5">
            <Text className="font-sans text-xs text-evergreen font-medium">
              {totalCount}
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View className="gap-2">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="bg-white rounded-2xl border border-border/30 px-4 py-3.5 flex-row items-center gap-3"
            >
              <Skeleton width={36} height={36} rounded="rounded-xl" />
              <View className="flex-1 gap-1.5">
                <Skeleton width="60%" height={12} />
                <Skeleton width="40%" height={10} />
              </View>
            </View>
          ))}
        </View>
      ) : upcoming.length === 0 ? (
        <View className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-6 items-center gap-1">
          <Text className="text-3xl">📅</Text>
          <Text className="font-sans text-sm text-foreground/40 mt-1">
            No plans this week
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {upcoming.map((plan) => {
            const planDate = plan.date instanceof Date ? plan.date : new Date(plan.date);
            const activityCfg = ACTIVITY_CONFIG[plan.activity as string] ?? null;
            const emoji = ACTIVITY_EMOJI[plan.activity as string] ?? activityCfg?.icon ?? '✨';
            const slotLabel = TIME_SLOT_LABELS[plan.timeSlot]?.time ?? '';
            const isLive = isToday(planDate);

            return (
              <Pressable
                key={plan.id}
                onPress={() => router.push(`/(app)/plan/${plan.id}`)}
                className="bg-white rounded-2xl border border-border/30 px-4 py-3.5 flex-row items-center gap-3"
              >
                {/* Activity emoji */}
                <View className="w-9 h-9 rounded-xl bg-chalk items-center justify-center">
                  <Text style={{ fontSize: 18 }}>{emoji}</Text>
                </View>

                {/* Details */}
                <View className="flex-1 gap-0.5">
                  <Text
                    className="font-sans font-medium text-evergreen text-sm"
                    numberOfLines={1}
                  >
                    {plan.title || 'Untitled plan'}
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row items-center gap-1">
                      <Clock size={11} color="#9CB094" strokeWidth={1.75} />
                      <Text className="font-sans text-xs text-foreground/50">
                        {planDayLabel(planDate)}
                        {slotLabel ? ` · ${slotLabel}` : ''}
                      </Text>
                    </View>
                    {plan.location ? (
                      <View className="flex-row items-center gap-1">
                        <MapPin size={11} color="#9CB094" strokeWidth={1.75} />
                        <Text
                          className="font-sans text-xs text-foreground/50"
                          numberOfLines={1}
                        >
                          {typeof plan.location === 'string'
                            ? plan.location
                            : (plan.location as any)?.name ?? ''}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Live badge */}
                {isLive && (
                  <View className="bg-marigold/20 rounded-full px-2 py-0.5">
                    <Text className="font-sans text-xs text-marigold font-semibold">
                      Today
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          {/* See all link when there are more than shown */}
          {totalCount > 5 && (
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/plans')}
              className="flex-row items-center justify-center gap-1 py-2"
            >
              <Text className="font-sans text-xs text-evergreen/60 font-medium">
                See all {totalCount} plans
              </Text>
              <ChevronRight size={12} color="#2F4A3E" strokeWidth={2} style={{ opacity: 0.6 }} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
