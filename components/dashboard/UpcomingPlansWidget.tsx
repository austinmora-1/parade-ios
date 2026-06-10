/**
 * UpcomingPlansWidget — "Upcoming Plans"
 * Vertical list of plan cards with left-border activity accent (matches PWA).
 * Plan title uses Fraunces (font-display) for the key headline.
 * Read-only Phase 1; tap → plan detail.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { CalendarCheck, MapPin, Clock, ChevronRight } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { TIME_SLOT_LABELS } from '@/types/planner';
import { Skeleton } from '@/components/primitives/Skeleton';
import type { Plan } from '@/types/planner';
import { activityAccent } from '@/lib/activityColors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planDayLabel(date: Date): string {
  if (isToday(date))    return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UpcomingPlansWidget() {
  const plans    = usePlannerStore((s) => s.plans);
  const isLoading = usePlannerStore((s) => s.isLoading);

  const { upcoming, totalCount } = useMemo(() => {
    const now    = new Date();
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
      {/* Section eyebrow */}
      <View className="flex-row items-center gap-1.5 px-0.5">
        <CalendarCheck size={12} color="#929298" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Upcoming Plans
        </Text>
        {!isLoading && totalCount > 0 && (
          <View className="ml-auto bg-muted rounded-full px-2 py-0.5">
            <Text className="font-sans text-xs text-muted-foreground font-medium">
              {totalCount}
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        /* Skeleton — left-border strip shape */
        <View className="gap-2">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm"
            >
              <View style={{ width: 4, backgroundColor: '#DDD8CE' }} />
              <View className="flex-1 px-4 py-3.5 gap-1.5">
                <Skeleton width="55%" height={13} />
                <Skeleton width="35%" height={10} />
              </View>
            </View>
          ))}
        </View>
      ) : upcoming.length === 0 ? (
        <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-6 items-center gap-1">
          <Text className="text-2xl">📅</Text>
          <Text className="font-sans text-sm text-muted-foreground mt-1">
            No plans this week
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {upcoming.map((plan) => {
            const planDate   = plan.date instanceof Date ? plan.date : new Date(plan.date);
            const accentColor = activityAccent(plan.activity as string | undefined);
            const slotLabel  = TIME_SLOT_LABELS[plan.timeSlot]?.time ?? '';
            const locationStr =
              typeof plan.location === 'string'
                ? plan.location
                : (plan.location as any)?.name ?? '';

            return (
              <Pressable
                key={plan.id}
                onPress={() => router.push(`/(app)/plan/${plan.id}`)}
                className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
              >
                {/* Activity left-border accent (matches PWA border-l-[3px]) */}
                <View style={{ width: 4, backgroundColor: accentColor }} />

                {/* Card content */}
                <View className="flex-1 px-4 py-3 gap-1">
                  {/* Title row + date badge */}
                  <View className="flex-row items-start justify-between gap-2">
                    <Text
                      className="font-display text-sm text-evergreen flex-1"
                      numberOfLines={1}
                    >
                      {plan.title || 'Untitled plan'}
                    </Text>
                    <Text className="font-sans text-xs text-muted-foreground whitespace-nowrap">
                      {planDayLabel(planDate)}
                    </Text>
                  </View>

                  {/* Time + location row */}
                  {(slotLabel || locationStr) ? (
                    <View className="flex-row items-center gap-3">
                      {slotLabel ? (
                        <View className="flex-row items-center gap-1">
                          <Clock size={11} color="#929298" strokeWidth={1.75} />
                          <Text className="font-sans text-xs text-muted-foreground">
                            {slotLabel}
                          </Text>
                        </View>
                      ) : null}
                      {locationStr ? (
                        <View className="flex-row items-center gap-1 flex-1">
                          <MapPin size={11} color="#929298" strokeWidth={1.75} />
                          <Text
                            className="font-sans text-xs text-muted-foreground"
                            numberOfLines={1}
                          >
                            {locationStr}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          {/* See all — only when more than 5 */}
          {totalCount > 5 && (
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/plans')}
              className="flex-row items-center justify-center gap-1 py-2"
            >
              <Text className="font-sans text-xs text-muted-foreground font-medium">
                See all {totalCount} plans
              </Text>
              <ChevronRight size={12} color="#929298" strokeWidth={2} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
