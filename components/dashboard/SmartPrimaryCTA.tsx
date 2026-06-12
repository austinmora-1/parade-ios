/**
 * SmartPrimaryCTA — "Today" section on the dashboard. Lists every confirmed
 * plan happening today (own or accepted invite), sorted by start time:
 *   - upcoming      → "Happening in X hours / minutes"
 *   - in its window → "Happening now" (start ≤ now < end)
 *   - already over  → grayed-out card, "Earlier today"
 * Tap a card → plan detail.
 *
 * Returns null when there's nothing to surface.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { isToday, differenceInMinutes } from 'date-fns';
import { ArrowRight, CalendarCheck } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { SLOT_START_HOUR, SLOT_END_HOUR } from '@/lib/socialSlots';
import type { Plan } from '@/types/planner';
import { PARADE_GREEN, ELEPHANT, TINT } from '@/lib/colors';

/** Plan start as a Date — exact startTime when set, else slot start hour. */
function planStart(plan: Plan): Date {
  const start = plan.date instanceof Date ? new Date(plan.date) : new Date(plan.date);
  if (plan.startTime) {
    const [h, m] = plan.startTime.split(':').map(Number);
    start.setHours(h || 0, m || 0, 0, 0);
  } else {
    start.setHours(SLOT_START_HOUR[plan.timeSlot] ?? 0, 0, 0, 0);
  }
  return start;
}

/**
 * Plan end as a Date — exact endTime when set (rolls past midnight when it
 * precedes the start), else startTime + duration, else the slot's end hour.
 */
function planEnd(plan: Plan, start: Date): Date {
  const end = plan.date instanceof Date ? new Date(plan.date) : new Date(plan.date);
  if (plan.endTime) {
    const [h, m] = plan.endTime.split(':').map(Number);
    end.setHours(h || 0, m || 0, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1); // e.g. 10pm–1am
    return end;
  }
  if (plan.startTime) {
    return new Date(start.getTime() + (plan.duration || 60) * 60_000);
  }
  end.setHours(SLOT_END_HOUR[plan.timeSlot] ?? 24, 0, 0, 0); // 26 rolls to 2am
  return end;
}

type TodayStatus = 'upcoming' | 'now' | 'past';

function statusFor(start: Date, end: Date): TodayStatus {
  const now = new Date();
  if (now >= end) return 'past';
  if (now >= start) return 'now';
  return 'upcoming';
}

function subtitleFor(status: TodayStatus, start: Date): string {
  if (status === 'past') return 'Earlier today';
  if (status === 'now') return 'Happening now';
  const minsUntil = differenceInMinutes(start, new Date());
  if (minsUntil < 60) return `Happening in ${minsUntil} minute${minsUntil === 1 ? '' : 's'}`;
  const hours = Math.round(minsUntil / 60);
  return `Happening in ${hours} hour${hours === 1 ? '' : 's'}`;
}

export function SmartPrimaryCTA() {
  const plans = usePlannerStore((s) => s.plans);

  const todayPlans = useMemo<Plan[]>(() => {
    return plans
      .filter((p) => {
        const d = p.date instanceof Date ? p.date : new Date(p.date);
        if (!isToday(d)) return false;
        const status = (p as any).status;
        if (status && status !== 'confirmed') return false;
        const myRsvp = (p as any).myRsvpStatus;
        // Own plan (no myRsvp) or accepted invite
        return myRsvp === undefined || myRsvp === 'accepted';
      })
      .sort((a, b) => planStart(a).getTime() - planStart(b).getTime());
  }, [plans]);

  if (todayPlans.length === 0) return null;

  return (
    <View className="gap-3">
      {/* Section eyebrow */}
      <View className="flex-row items-center gap-1.5 px-0.5">
        <CalendarCheck size={12} color={PARADE_GREEN} strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Today
        </Text>
        {todayPlans.length > 1 && (
          <View className="ml-auto bg-primary/10 rounded-full px-2 py-0.5">
            <Text className="font-sans text-xs text-primary font-semibold">
              {todayPlans.length}
            </Text>
          </View>
        )}
      </View>

      <View className="gap-2">
        {todayPlans.map((plan) => {
          const start = planStart(plan);
          const end = planEnd(plan, start);
          const status = statusFor(start, end);
          const isPast = status === 'past';

          return (
            <Pressable
              key={plan.id}
              onPress={() => router.push(`/(app)/plan/${plan.id}`)}
              className={`flex-row items-center bg-card rounded-2xl border px-4 py-3.5 gap-3 shadow-sm active:opacity-80 ${
                isPast ? 'border-border/30 opacity-55' : 'border-primary/30'
              }`}
              style={
                isPast
                  ? undefined
                  : {
                      shadowColor: '#23744D',
                      shadowOpacity: 0.08,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                    }
              }
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: isPast ? TINT.grayFaint : TINT.primarySubtle }}
              >
                <CalendarCheck
                  size={18}
                  color={isPast ? ELEPHANT : PARADE_GREEN}
                  strokeWidth={2}
                />
              </View>
              <View className="flex-1 gap-0.5">
                <Text
                  className={`font-display text-[17px] ${
                    isPast ? 'text-muted-foreground' : 'text-foreground'
                  }`}
                  numberOfLines={1}
                >
                  {plan.title || 'Untitled plan'}
                </Text>
                <Text
                  className={`font-sans text-xs ${
                    status === 'now'
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {subtitleFor(status, start)}
                </Text>
              </View>
              <ArrowRight
                size={16}
                color={isPast ? ELEPHANT : PARADE_GREEN}
                strokeWidth={2.2}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
