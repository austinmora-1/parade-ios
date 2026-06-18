/**
 * "What are you planning?" — compact floating dropdown from the Home FAB.
 *
 * Presented as a transparentModal (see _layout): a dim backdrop plus a
 * floating menu anchored top-right under the FAB. Paths are grouped under
 * Make a plan / Reach out / Grow Parade and shown as compact one-line
 * buttons. Tap the backdrop to dismiss.
 */
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
  CalendarCheck,
  Megaphone,
  Zap,
  Plane,
  UserPlus,
  CalendarRange,
  Hand,
} from 'lucide-react-native';
import { TINT } from '@/lib/colors';

const GREEN = '#23744D';
const MARIGOLD = '#DFA53A';
const EMBER = '#D46549';

interface PathProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  onPress: () => void;
}

/** Compact one-line menu item — icon tile + title, no subtitle. */
function PathButton({ icon, iconBg, title, onPress }: PathProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-2 py-2.5 rounded-2xl active:bg-muted/60"
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </View>
      <Text className="font-sans text-[15px] font-medium text-foreground flex-1">{title}</Text>
    </Pressable>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 pt-2 pb-0.5">
      {children}
    </Text>
  );
}

export default function WhatPlanningScreen() {
  const insets = useSafeAreaInsets();

  const go = useCallback((path: string) => {
    Haptics.selectionAsync();
    router.replace(path as any);
  }, []);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)');
  }, []);

  return (
    <View className="flex-1">
      {/* Dim backdrop — tap to dismiss */}
      <Pressable className="absolute inset-0 bg-black/30" onPress={close} />

      {/* Floating menu, anchored top-right under the FAB */}
      <View
        pointerEvents="box-none"
        style={{ paddingTop: insets.top + 52 }}
        className="items-end px-3"
      >
        <View className="bg-card rounded-3xl border border-border/20 p-2 w-[280px] shadow-xl">
          {/* ── Make a plan ── */}
          <GroupLabel>Make a plan</GroupLabel>
          <PathButton
            icon={<CalendarCheck size={18} color={GREEN} strokeWidth={2} />}
            iconBg={TINT.primarySubtle}
            title="Find time with friends"
            onPress={() => go('/(app)/find-time')}
          />
          <PathButton
            icon={<Zap size={18} color={GREEN} strokeWidth={2} />}
            iconBg={TINT.primarySubtle}
            title="Quick plan"
            onPress={() => go('/(app)/quick-plan?mode=log')}
          />
          <PathButton
            icon={<Plane size={18} color={GREEN} strokeWidth={2} />}
            iconBg={TINT.primarySubtle}
            title="Go somewhere"
            onPress={() => go('/(app)/go-somewhere')}
          />

          {/* ── Reach out ── */}
          <GroupLabel>Reach out</GroupLabel>
          <PathButton
            icon={<Hand size={18} color={MARIGOLD} strokeWidth={2} />}
            iconBg={TINT.marigoldSubtle}
            title="Quick ping"
            onPress={() => go('/(app)/new-hang-request')}
          />
          <PathButton
            icon={<Megaphone size={18} color={MARIGOLD} strokeWidth={2} />}
            iconBg={TINT.marigoldSubtle}
            title="Ask friends to join"
            onPress={() => go('/(app)/find-people')}
          />
          <PathButton
            icon={<CalendarRange size={18} color={MARIGOLD} strokeWidth={2} />}
            iconBg={TINT.marigoldSubtle}
            title="Share availability"
            onPress={() => go('/(app)/share-availability')}
          />

          {/* ── Grow Parade ── */}
          <GroupLabel>Grow Parade</GroupLabel>
          <PathButton
            icon={<UserPlus size={18} color={EMBER} strokeWidth={2} />}
            iconBg={TINT.secondarySubtle}
            title="Invite friends to Parade"
            onPress={() => go('/(app)/add-friend')}
          />
        </View>
      </View>
    </View>
  );
}
