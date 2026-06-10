/**
 * QuickStatsCard — 4-tile snapshot on the Profile tab for the current week.
 *
 * Tiles:
 *   - Plans     (count of plans this week)
 *   - Hours     (sum of plan duration in hours, e.g. "4.5h")
 *   - Free      (count of free time slots in availability this week)
 *   - Vibe      (current_vibe emoji + text, or em-dash if not set)
 *
 * Pure computation from plannerStore — no extra queries.
 */
import { View, Text } from 'react-native';
import { useMemo } from 'react';
import { isThisWeek, startOfWeek, endOfWeek, format } from 'date-fns';
import { usePlannerStore } from '@/stores/plannerStore';

const VIBE_EMOJI: Record<string, string> = {
  social: '🎉', chill: '🛋️', athletic: '🏃', productive: '💼',
  custom: '✨', curious: '🔍', outdoorsy: '🥾', creative: '🎨',
  cozy: '🕯️', adventurous: '🧗',
};

interface StatTileProps {
  value:    string;
  label:    string;
  /** Optional emoji shown above the value (for the Vibe tile) */
  emoji?:   string;
}

function StatTile({ value, label, emoji }: StatTileProps) {
  return (
    <View className="flex-1 bg-chalk rounded-xl px-3 py-3 items-center">
      {emoji ? (
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      ) : (
        <Text
          className="font-display text-foreground"
          style={{ fontSize: 22, lineHeight: 26 }}
        >
          {value}
        </Text>
      )}
      <Text
        className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1 text-center"
        numberOfLines={1}
      >
        {emoji ? value : label}
      </Text>
    </View>
  );
}

export function QuickStatsCard({ currentVibe }: { currentVibe?: string | null }) {
  const plans        = usePlannerStore((s) => s.plans);
  const availability = usePlannerStore((s) => s.availability);

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });

    const weekPlans = plans.filter((p) => {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      return isThisWeek(d, { weekStartsOn: 1 });
    });

    const hoursPlanned = weekPlans.reduce((sum, p) => {
      const minutes = (p as any).duration ?? 60;
      return sum + minutes;
    }, 0) / 60;

    // Free slot count across all days this week
    const freeSlots = availability.reduce((sum, day) => {
      if (day.date < weekStart || day.date > weekEnd) return sum;
      const free = Object.values(day.slots).filter((v) => v === true).length;
      return sum + free;
    }, 0);

    return {
      planCount:  weekPlans.length,
      hours:      hoursPlanned,
      freeSlots,
    };
  }, [plans, availability]);

  const formatHours = (h: number): string => {
    if (h === 0) return '0h';
    if (h < 10 && h !== Math.floor(h)) return `${h.toFixed(1)}h`;
    return `${Math.round(h)}h`;
  };

  const vibeEmoji = currentVibe
    ? VIBE_EMOJI[currentVibe.toLowerCase()] ?? '✨'
    : '—';
  const vibeLabel = currentVibe ?? 'No vibe set';

  return (
    <View className="bg-card rounded-2xl border border-border/30 p-3 gap-2 shadow-sm">
      <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
        This week
      </Text>
      <View className="flex-row gap-2">
        <StatTile value={String(stats.planCount)}  label="Plans" />
        <StatTile value={formatHours(stats.hours)} label="Hours" />
        <StatTile value={String(stats.freeSlots)}  label="Free slots" />
        <StatTile value={vibeLabel}                label="Vibe" emoji={currentVibe ? vibeEmoji : undefined} />
      </View>
    </View>
  );
}
