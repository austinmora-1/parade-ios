/**
 * "What are you planning?" sheet — the multi-path FAB drawer.
 *
 * Replaces the previous direct FAB → new-plan route. Four paths surface
 * different planning intents:
 *
 *   - Find time with friends   → /(app)/new-plan (standard guided flow)
 *   - Find friends to join     → /(app)/find-people (open-invite broadcast
 *                                wizard writing to open_invites)
 *   - Go somewhere             → /(app)/new-trip
 *   - Invite friends to Parade → /(app)/add-friend
 *
 * Reached via the Home tab FAB.
 */
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
  X,
  CalendarCheck,
  Sparkles,
  Plane,
  UserPlus,
  ChevronRight,
} from 'lucide-react-native';
import { TC } from '@/lib/theme';

import { TINT } from '@/lib/colors';
interface PathProps {
  icon: React.ReactNode;
  /** Background color for the icon tile */
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function PathRow({ icon, iconBg, title, subtitle, onPress }: PathProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-card rounded-2xl border border-border/30 px-4 py-4 gap-3 shadow-sm active:opacity-80"
    >
      <View
        className="w-11 h-11 rounded-xl items-center justify-center"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-display text-base text-foreground">{title}</Text>
        <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={16} color={TINT.graySolid} strokeWidth={2} />
    </Pressable>
  );
}

export default function WhatPlanningScreen() {
  const go = useCallback((path: string) => {
    Haptics.selectionAsync();
    // Replace this modal so the back stack doesn't include it
    router.replace(path as any);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2">
        <View className="w-9 h-9" />
        <Text className="font-display text-base text-foreground">
          What are you planning?
        </Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
      </View>

      <View className="px-5 pt-4 pb-6 gap-3">
        <Text className="font-sans text-sm text-muted-foreground px-1 pb-1">
          Pick a starting point — each opens a focused flow.
        </Text>

        <PathRow
          icon={<CalendarCheck size={20} color="#23744D" strokeWidth={2} />}
          iconBg={TINT.primarySubtle}
          title="Find time with friends"
          subtitle="Pick friends, see when everyone's free, and lock in a plan."
          onPress={() => go('/(app)/find-time')}
        />

        <PathRow
          icon={<Sparkles size={20} color="#DFA53A" strokeWidth={2} />}
          iconBg={TINT.marigoldSubtle}
          title="Find friends to join"
          subtitle="Open call: 'I'm getting drinks Friday — who's in?' No invitee list needed."
          onPress={() => go('/(app)/find-people')}
        />

        <PathRow
          icon={<Plane size={20} color="#23744D" strokeWidth={2} />}
          iconBg={TINT.primarySubtle}
          title="Go somewhere"
          subtitle="Mark a trip on your calendar so friends know you're traveling."
          onPress={() => go('/(app)/new-trip')}
        />

        <View className="h-px bg-border/30 my-1 mx-2" />

        <PathRow
          icon={<UserPlus size={20} color="#D46549" strokeWidth={2} />}
          iconBg={TINT.secondarySubtle}
          title="Invite friends to Parade"
          subtitle="Share a link or find people already on the app."
          onPress={() => go('/(app)/add-friend')}
        />
      </View>
    </SafeAreaView>
  );
}
