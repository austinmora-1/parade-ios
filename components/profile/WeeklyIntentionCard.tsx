/**
 * WeeklyIntentionCard — shows current vibe + this week's intention + a
 * progress bar against the user's targetHangouts. Tap to edit.
 *
 * Empty state CTA when no intention is set yet.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import { isToday, isThisWeek } from 'date-fns';
import { useWeeklyIntention } from '@/hooks/useWeeklyIntention';
import { usePlannerStore } from '@/stores/plannerStore';

import { TINT } from '@/lib/colors';
const ENERGY_EMOJI: Record<string, string> = {
  low: '🛋️', medium: '☕', high: '🎉',
};

const VIBE_EMOJI: Record<string, string> = {
  social: '🎉', chill: '🛋️', athletic: '🏃', productive: '💼',
  custom: '✨', curious: '🔍', outdoorsy: '🥾', creative: '🎨',
  cozy: '🕯️', adventurous: '🧗',
};

export function WeeklyIntentionCard({
  currentVibe,
}: {
  currentVibe: string | null;
}) {
  const { data: intention } = useWeeklyIntention();
  const plans = usePlannerStore((s) => s.plans);

  // Count plans this week (status confirmed OR proposed, mine or accepted)
  const thisWeekCount = useMemo(() => {
    return plans.filter((p) => {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      return isThisWeek(d, { weekStartsOn: 1 });
    }).length;
  }, [plans]);

  const hasIntention =
    intention &&
    (intention.socialEnergy !== null ||
      intention.targetHangouts !== null ||
      intention.vibes.length > 0 ||
      intention.notes);

  return (
    <Pressable
      onPress={() => router.push('/(app)/edit-intention')}
      className={`rounded-2xl border px-4 py-4 gap-2.5 shadow-sm active:opacity-80 ${
        hasIntention ? 'bg-card border-border/30' : 'bg-primary/5 border-primary/30'
      }`}
    >
      <View className="flex-row items-center gap-1.5">
        <Sparkles size={12} color="#DFA53A" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          This week
        </Text>
        <ChevronRight size={14} color={TINT.graySolid} strokeWidth={2} className="ml-auto" />
      </View>

      {hasIntention ? (
        <>
          {/* Energy + target row */}
          <View className="flex-row items-center gap-3">
            {intention!.socialEnergy && (
              <View className="flex-row items-center gap-1 bg-primary/10 rounded-full px-2.5 py-1">
                <Text style={{ fontSize: 12 }}>
                  {ENERGY_EMOJI[intention!.socialEnergy] ?? '✨'}
                </Text>
                <Text className="font-sans text-xs font-semibold text-primary capitalize">
                  {intention!.socialEnergy} energy
                </Text>
              </View>
            )}
            {currentVibe && (
              <View className="flex-row items-center gap-1 bg-marigold/10 rounded-full px-2.5 py-1">
                <Text style={{ fontSize: 12 }}>
                  {VIBE_EMOJI[currentVibe.toLowerCase()] ?? '✨'}
                </Text>
                <Text className="font-sans text-xs font-semibold text-marigold capitalize">
                  {currentVibe}
                </Text>
              </View>
            )}
          </View>

          {/* Vibe tags */}
          {intention!.vibes.length > 0 && (
            <Text
              className="font-sans text-xs text-muted-foreground"
              numberOfLines={1}
            >
              {intention!.vibes.map((v) => `#${v.toLowerCase()}`).join(' · ')}
            </Text>
          )}

          {/* Progress bar */}
          {intention!.targetHangouts !== null && intention!.targetHangouts > 0 && (
            <View className="gap-1 mt-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans text-xs text-muted-foreground">
                  {Math.min(thisWeekCount, intention!.targetHangouts)} of{' '}
                  {intention!.targetHangouts} hangouts planned
                </Text>
                <Text className="font-sans text-xs font-semibold text-primary">
                  {Math.round((Math.min(thisWeekCount, intention!.targetHangouts) /
                    intention!.targetHangouts) * 100)}%
                </Text>
              </View>
              <View className="h-1.5 bg-muted rounded-full overflow-hidden">
                <View
                  style={{
                    width: `${Math.min(100, Math.round(
                      (thisWeekCount / intention!.targetHangouts) * 100,
                    ))}%`,
                    height: '100%',
                    backgroundColor: '#23744D',
                  }}
                />
              </View>
            </View>
          )}

          {/* Notes */}
          {intention!.notes && (
            <Text
              className="font-sans text-xs text-foreground/70 leading-relaxed mt-1"
              numberOfLines={2}
            >
              "{intention!.notes}"
            </Text>
          )}
        </>
      ) : (
        <View className="py-1 gap-2">
          <Text className="font-display text-lg text-foreground">
            Set your intention
          </Text>
          <Text className="font-sans text-[13px] text-muted-foreground leading-relaxed">
            Social energy · target hangouts · vibes. We'll help you track it.
          </Text>
          <View className="flex-row items-center gap-1.5 self-start bg-primary rounded-full px-3.5 py-2 mt-1">
            <Sparkles size={13} color="#FFFFFF" strokeWidth={2.5} />
            <Text className="font-sans text-sm font-semibold text-white">Set intention</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
