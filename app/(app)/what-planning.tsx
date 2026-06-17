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
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
  X,
  CalendarCheck,
  Megaphone,
  Zap,
  Plane,
  UserPlus,
  CalendarRange,
  Hand,
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
      className="flex-row items-center bg-card rounded-2xl border border-border/30 px-4 py-3.5 gap-3 shadow-sm active:opacity-80"
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

/** Small uppercase group header that segments the path list. */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1 pt-2">
      {children}
    </Text>
  );
}

export default function WhatPlanningScreen() {
  const go = useCallback((path: string) => {
    Haptics.selectionAsync();
    // Replace this modal so the back stack doesn't include it
    router.replace(path as any);
  }, []);

  // Close → go back if possible, else fall back to Home. (Entering from
  // onboarding leaves no base screen, so a bare router.back() would dispatch
  // an unhandled GO_BACK.)
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)');
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
          onPress={close}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerClassName="px-5 pt-2 pb-10 gap-2.5"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Make a plan ─────────────────────────────────────────────── */}
        <SectionLabel>Make a plan</SectionLabel>

        <PathRow
          icon={<CalendarCheck size={20} color="#23744D" strokeWidth={2} />}
          iconBg={TINT.primarySubtle}
          title="Find time with friends"
          subtitle="Pick friends, see when everyone's free, and lock in a plan."
          onPress={() => go('/(app)/find-time')}
        />

        <PathRow
          icon={<Zap size={20} color="#23744D" strokeWidth={2} />}
          iconBg={TINT.primarySubtle}
          title="Quick plan"
          subtitle="Already made plans outside Parade? Log them in seconds — no RSVPs."
          onPress={() => go('/(app)/quick-plan?mode=log')}
        />

        <PathRow
          icon={<Plane size={20} color="#23744D" strokeWidth={2} />}
          iconBg={TINT.primarySubtle}
          title="Go somewhere"
          subtitle="Plan a trip or visit — find weekends that work for everyone."
          onPress={() => go('/(app)/go-somewhere')}
        />

        {/* ── Reach out ───────────────────────────────────────────────── */}
        <SectionLabel>Reach out</SectionLabel>

        <PathRow
          icon={<Hand size={20} color="#DFA53A" strokeWidth={2} />}
          iconBg={TINT.marigoldSubtle}
          title="Quick ping"
          subtitle="Nudge one friend: 'Free this week?' They can accept in a tap."
          onPress={() => go('/(app)/new-hang-request')}
        />

        <PathRow
          icon={<Megaphone size={20} color="#DFA53A" strokeWidth={2} />}
          iconBg={TINT.marigoldSubtle}
          title="Ask friends to join"
          subtitle="Open call: 'I'm getting drinks Friday — who's in?' No invitee list needed."
          onPress={() => go('/(app)/find-people')}
        />

        <PathRow
          icon={<CalendarRange size={20} color="#23744D" strokeWidth={2} />}
          iconBg={TINT.primarySubtle}
          title="Share availability"
          subtitle="Send friends a link to when you're free — next week, month, or quarter."
          onPress={() => go('/(app)/share-availability')}
        />

        {/* ── Grow Parade ─────────────────────────────────────────────── */}
        <SectionLabel>Grow Parade</SectionLabel>

        <PathRow
          icon={<UserPlus size={20} color="#D46549" strokeWidth={2} />}
          iconBg={TINT.secondarySubtle}
          title="Invite friends to Parade"
          subtitle="Share a link or find people already on the app."
          onPress={() => go('/(app)/add-friend')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
