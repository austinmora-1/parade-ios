import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isToday, isSameDay } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';

const SLOT_LABELS: Record<string, string> = {
  early_morning: 'Early AM',
  late_morning: 'Late AM',
  early_afternoon: 'Afternoon',
  late_afternoon: 'Late PM',
  evening: 'Evening',
  late_night: 'Late night',
};

export default function PlansTab() {
  const { user } = useAuth();
  const setUserId = usePlannerStore((s) => s.setUserId);
  const loadAllData = usePlannerStore((s) => s.loadAllData);
  const plans = usePlannerStore((s) => s.plans);
  const loading = usePlannerStore((s) => s.isLoading);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
      loadAllData();
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData(true);
    setRefreshing(false);
  }, [loadAllData]);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekend = days.filter((d) => [0, 6].includes(d.getDay()));
  const weekdays = days.filter((d) => ![0, 6].includes(d.getDay()));

  const upcomingPlans = plans
    .filter((p) => new Date(p.date) >= today)
    .slice(0, 10);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DDA73A" />
        }
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="font-sans font-semibold text-evergreen text-2xl">Plans</Text>
          <Text className="font-sans text-sm text-foreground/50 mt-0.5">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </Text>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator className="mt-12" color="#DDA73A" />
        ) : (
          <View className="px-5 gap-5 mt-3">
            {/* Weekend hero */}
            <View className="bg-evergreen rounded-3xl p-5 gap-3">
              <Text className="font-sans text-sage text-xs uppercase tracking-widest">Weekend</Text>
              <View className="flex-row gap-3">
                {weekend.map((day) => (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => router.push(`/(app)/day/${format(day, 'yyyy-MM-dd')}`)}
                    className="flex-1 bg-chalk/10 rounded-2xl p-4 gap-1"
                  >
                    <Text className="font-sans text-sage text-xs">{format(day, 'EEE')}</Text>
                    <Text className="font-sans font-semibold text-chalk text-lg">{format(day, 'd')}</Text>
                    {isToday(day) && <View className="w-1.5 h-1.5 rounded-full bg-marigold mt-1" />}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Weekday rows */}
            <View className="gap-2">
              <Text className="font-sans text-foreground/50 text-xs uppercase tracking-widest px-1">
                This week
              </Text>
              {weekdays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayPlans = upcomingPlans.filter((p) => isSameDay(new Date(p.date), day));
                return (
                  <Pressable
                    key={dateStr}
                    onPress={() => router.push(`/(app)/day/${dateStr}`)}
                    className={`flex-row items-center bg-white rounded-2xl px-4 py-3 border gap-3 ${
                      isToday(day) ? 'border-marigold' : 'border-border/30'
                    }`}
                  >
                    <View className="w-10 gap-0.5">
                      <Text className="font-sans text-foreground/50 text-xs">{format(day, 'EEE')}</Text>
                      <Text className={`font-sans font-semibold text-lg ${isToday(day) ? 'text-marigold' : 'text-evergreen'}`}>
                        {format(day, 'd')}
                      </Text>
                    </View>
                    <View className="flex-1">
                      {dayPlans.length > 0 ? (
                        dayPlans.slice(0, 2).map((p) => (
                          <Text key={p.id} className="font-sans text-sm text-foreground" numberOfLines={1}>
                            {p.title || 'Untitled plan'}
                          </Text>
                        ))
                      ) : (
                        <Text className="font-sans text-sm text-foreground/30">Free</Text>
                      )}
                    </View>
                    {dayPlans.length > 0 && (
                      <View className="w-2 h-2 rounded-full bg-marigold" />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Upcoming plans */}
            {upcomingPlans.length > 0 && (
              <View className="gap-2">
                <Text className="font-sans text-foreground/50 text-xs uppercase tracking-widest px-1">
                  Upcoming
                </Text>
                {upcomingPlans.map((plan) => (
                  <Pressable
                    key={plan.id}
                    onPress={() => router.push(`/(app)/plan/${plan.id}`)}
                    className="bg-white rounded-2xl px-4 py-4 border border-border/30 gap-1"
                  >
                    <Text className="font-sans font-medium text-evergreen text-base" numberOfLines={1}>
                      {plan.title || 'Untitled plan'}
                    </Text>
                    <Text className="font-sans text-sm text-foreground/50">
                      {format(new Date(plan.date), 'EEE, MMM d')}
                      {plan.timeSlot ? ` · ${SLOT_LABELS[plan.timeSlot] ?? plan.timeSlot}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
