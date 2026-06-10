/**
 * PlanHistorySection — collapsible list of past plans on the Profile tab.
 *
 * Default collapsed; tap header to expand. Shows up to 50 most-recent past
 * plans with title + date + activity-color accent. Pulls from plannerStore
 * (no extra query).
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState, useMemo } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { CalendarCheck, ChevronDown, ChevronRight, MapPin, Clock } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { TimeSlot } from '@/types/planner';
import { activityAccent } from '@/lib/activityColors';

import { TINT } from '@/lib/colors';
const DEFAULT_ACCENT = '#929298'; // gray for past plans

function dayLabel(d: Date): string {
  if (isToday(d))     return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, MMM d');
}

export function PlanHistorySection() {
  const plans = usePlannerStore((s) => s.plans);
  const [expanded, setExpanded] = useState(false);

  const pastPlans = useMemo(() => {
    const now = new Date();
    return plans
      .filter((p) => {
        const d = p.date instanceof Date ? p.date : new Date(p.date);
        return d < now;
      })
      .sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date);
        const db = b.date instanceof Date ? b.date : new Date(b.date);
        return db.getTime() - da.getTime(); // most recent first
      })
      .slice(0, 50);
  }, [plans]);

  if (pastPlans.length === 0) return null;

  return (
    <View className="gap-2">
      {/* Header — tap to toggle */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between bg-card border border-border/30 rounded-2xl px-4 py-3 shadow-sm active:opacity-80"
      >
        <View className="flex-row items-center gap-2">
          <CalendarCheck size={14} color="#23744D" strokeWidth={2} />
          <Text className="font-display text-sm text-foreground">
            Plan history
          </Text>
          <View className="bg-muted rounded-full px-2 py-0.5">
            <Text className="font-sans text-xs text-muted-foreground font-medium">
              {pastPlans.length}
            </Text>
          </View>
        </View>
        <ChevronDown
          size={16}
          color="#929298"
          strokeWidth={2}
          style={{
            transform: [{ rotate: expanded ? '180deg' : '0deg' }],
          }}
        />
      </Pressable>

      {/* List */}
      {expanded && (
        <View className="gap-2">
          {pastPlans.map((plan) => {
            const d = plan.date instanceof Date ? plan.date : new Date(plan.date);
            const accent = activityAccent(plan.activity as string | undefined, DEFAULT_ACCENT);
            const slotLabel = TIME_SLOT_LABELS[plan.timeSlot as TimeSlot]?.time ?? '';
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
                <View style={{ width: 4, backgroundColor: accent }} />
                <View className="flex-1 px-4 py-3 gap-1">
                  <View className="flex-row items-start justify-between gap-2">
                    <Text
                      className="font-display text-sm text-foreground flex-1"
                      numberOfLines={1}
                    >
                      {plan.title || 'Untitled plan'}
                    </Text>
                    <Text className="font-sans text-xs text-muted-foreground">
                      {dayLabel(d)}
                    </Text>
                  </View>
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
                <View className="items-center justify-center pr-3">
                  <ChevronRight size={14} color={TINT.graySolid} strokeWidth={2} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
