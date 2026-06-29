/**
 * OpenWeekendsList — renders WeekendSummary[] grouped by month with a per-month
 * "N of M weekends open" header. Lives inside the Plans tab's existing
 * ScrollView (no own scroll). Part of the "Open weekends" lens (XPE-274).
 */
import { View, Text, ActivityIndicator } from 'react-native';
import { WeekendCard } from '@/components/plans/WeekendCard';
import { PARADE_GREEN } from '@/lib/colors';
import type { WeekendSummary } from '@/lib/openWeekends';

const isOpen = (s: WeekendSummary) => s.state === 'open' || s.state === 'partial';

export function OpenWeekendsList({
  summaries,
  loading,
}: {
  summaries: WeekendSummary[];
  loading?: boolean;
}) {
  if (loading && summaries.length === 0) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color={PARADE_GREEN} />
      </View>
    );
  }

  if (summaries.length === 0) {
    return (
      <View className="items-center py-12 px-8">
        <Text className="font-sans text-sm text-muted-foreground text-center">
          No upcoming weekends to show.
        </Text>
      </View>
    );
  }

  // Group by month, preserving chronological order.
  const groups: { month: string; items: WeekendSummary[] }[] = [];
  for (const s of summaries) {
    let g = groups[groups.length - 1];
    if (!g || g.month !== s.monthLabel) {
      g = { month: s.monthLabel, items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }

  return (
    <View>
      {groups.map((g) => {
        const openCount = g.items.filter(isOpen).length;
        return (
          <View key={g.month} className="mb-2">
            <View className="flex-row items-baseline justify-between px-0.5 mt-3 mb-2.5">
              <Text className="font-display text-[15px] text-foreground">{g.month}</Text>
              <Text className="font-sans text-[12px] text-muted-foreground">
                {openCount} of {g.items.length} weekends open
              </Text>
            </View>
            {g.items.map((s) => (
              <WeekendCard key={s.key} summary={s} />
            ))}
          </View>
        );
      })}
    </View>
  );
}
