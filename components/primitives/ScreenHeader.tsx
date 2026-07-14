/**
 * ScreenHeader — shared back-button + title header for detail screens.
 * Replaces the hand-rolled header repeated across plan/trip/friend/day/
 * notifications/settings/trip-proposal screens.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { TC } from '@/lib/theme';
import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  /** Omit (or pass '') to leave the bar title-less, e.g. when a hero card below repeats it. */
  title?: string;
  /** Second line under the title (e.g. date, helper text). */
  subtitle?: string;
  /** Rendered at the right edge (action button, menu, badge). */
  rightAction?: ReactNode;
  /** Overrides the default router.back() (e.g. unsaved-changes guard). */
  onBack?: () => void;
}

export function ScreenHeader({ title, subtitle, rightAction, onBack }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center px-3 py-2 gap-1">
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={8}
        className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
      >
        <ChevronLeft size={22} color={TC.icon} strokeWidth={2} />
      </Pressable>
      {!title ? (
        <View className="flex-1" />
      ) : subtitle ? (
        <View className="flex-1">
          <Text className="font-display text-base text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <Text className="font-sans text-[11px] text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      ) : (
        <Text className="font-display text-base text-foreground flex-1" numberOfLines={1}>
          {title}
        </Text>
      )}
      {rightAction}
    </View>
  );
}
