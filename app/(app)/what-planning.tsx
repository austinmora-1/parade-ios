/**
 * "What are you planning?" — compact floating dropdown from the Home FAB,
 * styled after Instagram's "+" create menu: a dark, slightly-transparent
 * panel with light text, anchored top-right under the FAB.
 *
 * Presented as a transparentModal (see _layout): a dim backdrop plus the
 * floating menu. Paths are grouped under Make a plan / Reach out / Grow
 * Parade as compact one-line buttons. Tap the backdrop to dismiss.
 *
 * Note: deliberately avoids expo-blur's BlurView — the native module isn't
 * guaranteed in the dev build, and importing it would crash the screen. A
 * translucent dark fill gives the same read without a rebuild.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useFloatingTabBarHeight } from '@/components/navigation/FloatingTabBar';
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

const GREEN = '#3B9B68';     // brighter green reads better on the dark panel
const MARIGOLD = '#E6B24A';
const EMBER = '#E07A5F';

// Instagram-style dark translucent panel + light text.
const PANEL_BG = 'rgba(28, 26, 22, 0.86)';
const PANEL_BORDER = 'rgba(255, 255, 255, 0.12)';
const TILE_BG = 'rgba(255, 255, 255, 0.10)';
const LABEL_COLOR = 'rgba(255, 255, 255, 0.5)';

interface PathProps {
  icon: React.ReactNode;
  title: string;
  onPress: () => void;
}

/** Compact one-line menu item — icon tile + light title, no subtitle. */
function PathButton({ icon, title, onPress }: PathProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-2 py-2.5 rounded-2xl active:bg-white/10"
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: TILE_BG }}
      >
        {icon}
      </View>
      <Text className="font-sans text-[15px] font-medium text-white flex-1">{title}</Text>
    </Pressable>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text
      className="font-sans text-[10px] font-semibold uppercase tracking-widest px-2 pt-2 pb-0.5"
      style={{ color: LABEL_COLOR }}
    >
      {children}
    </Text>
  );
}

export default function WhatPlanningScreen() {
  const tabBarHeight = useFloatingTabBarHeight();

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
      <Pressable
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={close}
      />

      {/* Floating menu, popping up from the bottom-left nav FAB */}
      <View
        pointerEvents="box-none"
        style={{ paddingBottom: tabBarHeight + 28 }}
        className="flex-1 items-start justify-end px-4"
      >
        <View
          className="rounded-3xl p-2 w-[280px]"
          style={{
            backgroundColor: PANEL_BG,
            borderWidth: 1,
            borderColor: PANEL_BORDER,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {/* ── Make a plan ── */}
          <GroupLabel>Make a plan</GroupLabel>
          <PathButton
            icon={<CalendarCheck size={18} color={GREEN} strokeWidth={2} />}
            title="Find time with friends"
            onPress={() => go('/(app)/find-time')}
          />
          <PathButton
            icon={<Zap size={18} color={GREEN} strokeWidth={2} />}
            title="Quick plan"
            onPress={() => go('/(app)/quick-plan?mode=log')}
          />
          <PathButton
            icon={<Plane size={18} color={GREEN} strokeWidth={2} />}
            title="Visit somewhere"
            onPress={() => go('/(app)/go-somewhere')}
          />

          {/* ── Reach out ── */}
          <GroupLabel>Reach out</GroupLabel>
          <PathButton
            icon={<Hand size={18} color={MARIGOLD} strokeWidth={2} />}
            title="Quick ping"
            onPress={() => go('/(app)/new-hang-request')}
          />
          <PathButton
            icon={<Megaphone size={18} color={MARIGOLD} strokeWidth={2} />}
            title="Ask friends to join"
            onPress={() => go('/(app)/find-people')}
          />
          <PathButton
            icon={<CalendarRange size={18} color={MARIGOLD} strokeWidth={2} />}
            title="Share availability"
            onPress={() => go('/(app)/share-availability')}
          />

          {/* ── Invite ── */}
          <GroupLabel>Invite</GroupLabel>
          <PathButton
            icon={<UserPlus size={18} color={EMBER} strokeWidth={2} />}
            title="Add friends"
            onPress={() => go('/(app)/add-friend')}
          />
        </View>
      </View>
    </View>
  );
}
