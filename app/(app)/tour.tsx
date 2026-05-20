/**
 * ParadeTour — feature-focused walkthrough.
 *
 * Distinct from /welcome (EllyWalkthrough) which is a brand intro for
 * truly-empty users. This tour highlights where specific UI lives so
 * users who already have friends/plans (e.g. via deep-link or shared
 * device) can learn the screen layout.
 *
 * Triggers:
 *   - Auto from Home tab: non-empty users with walkthrough_completed=false
 *   - Manual replay: "✨ Take the tour" link in Settings footer
 *
 * Both finishing and skipping write profiles.walkthrough_completed=true.
 */
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Plus, Users, Sparkles, CalendarDays, Settings as SettingsIcon } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Slide {
  icon: React.ReactNode;
  /** Tile background color */
  iconBg: string;
  eyebrow: string;
  title:   string;
  body:    string;
  /** Optional position hint, e.g. "Bottom-right" */
  where:   string;
}

const SLIDES: Slide[] = [
  {
    icon: <Plus size={36} color="#FFFFFF" strokeWidth={2.5} />,
    iconBg: '#23744D',
    eyebrow: 'The plus button',
    title:   'Three ways to plan something',
    body:    "Find time with friends, drop an open invite, or mark a trip. Tap + and pick your starting point.",
    where:   'Floating bottom-right on Home',
  },
  {
    icon: <Users size={28} color="#23744D" strokeWidth={2.2} />,
    iconBg: 'rgba(35,116,77,0.12)',
    eyebrow: "Who's around",
    title:   'Friend vibes at a glance',
    body:    "Connected friends show their current vibe and how many days they're free this week. Tap a pill to open their profile.",
    where:   'Top of the Home tab feed',
  },
  {
    icon: <Sparkles size={28} color="#DFA53A" strokeWidth={2.2} />,
    iconBg: 'rgba(223,165,58,0.15)',
    eyebrow: 'Recommended',
    title:   'Your free windows, sorted',
    body:    "Open time you've marked — sorted by friend overlap. Tap a chip to see the day in detail or plan something then.",
    where:   'Middle of the Home tab feed',
  },
  {
    icon: <CalendarDays size={28} color="#23744D" strokeWidth={2.2} />,
    iconBg: 'rgba(35,116,77,0.12)',
    eyebrow: 'Plans tab',
    title:   'Your week, weekend, and trips',
    body:    "Mark availability with a tap, see plans by day, navigate weeks, and add trips. Today is highlighted in parade green.",
    where:   'Second tab in the bottom bar',
  },
  {
    icon: <SettingsIcon size={28} color="#929298" strokeWidth={2.2} />,
    iconBg: 'rgba(146,146,152,0.12)',
    eyebrow: 'Settings',
    title:   'Make it yours',
    body:    "Sync your calendar, control notifications, choose what friends see. Tap the gear on your profile.",
    where:   'Profile tab → top-right gear',
  },
];

const { width: SCREEN_W } = Dimensions.get('window');

export default function TourScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback((e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SCREEN_W);
    if (next !== index) {
      Haptics.selectionAsync();
      setIndex(next);
    }
  }, [index]);

  const goNext = useCallback(() => {
    Haptics.selectionAsync();
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * SCREEN_W, animated: true });
    }
  }, [index]);

  const finish = useCallback(async () => {
    if (!user?.id) {
      router.back();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await supabase
        .from('profiles')
        .update({ walkthrough_completed: true } as any)
        .eq('user_id', user.id);
      await queryClient.invalidateQueries({ queryKey: ['walkthrough-status'] });
    } catch (err) {
      console.warn('walkthrough_completed update failed', err);
    }
    router.back();
  }, [user?.id, queryClient]);

  const isLast = index === SLIDES.length - 1;
  const slide  = SLIDES[index];

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top', 'bottom']}>
      {/* Top: progress dots + skip */}
      <View className="flex-row items-center justify-between px-5 pt-2">
        <View className="flex-row gap-1.5">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                width:  i === index ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? '#23744D' : 'rgba(146,146,152,0.3)',
              }}
            />
          ))}
        </View>
        <Pressable onPress={finish} hitSlop={6} className="active:opacity-60">
          <Text className="font-sans text-sm text-muted-foreground">Skip</Text>
        </Pressable>
      </View>

      {/* Horizontal pager */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {SLIDES.map((s, i) => (
          <View
            key={i}
            style={{ width: SCREEN_W }}
            className="items-center justify-center px-8 py-8"
          >
            {/* Icon tile */}
            <View
              className="w-24 h-24 rounded-3xl items-center justify-center"
              style={{
                backgroundColor: s.iconBg,
                shadowColor: '#040A2A',
                shadowOpacity: 0.10,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
              }}
            >
              {s.icon}
            </View>

            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-primary mt-8">
              {s.eyebrow}
            </Text>
            <Text
              className="font-display text-3xl text-foreground text-center mt-3"
              style={{ lineHeight: 36 }}
            >
              {s.title}
            </Text>
            <Text className="font-sans text-base text-muted-foreground text-center mt-4 leading-relaxed">
              {s.body}
            </Text>

            {/* Where it lives */}
            <View
              className="flex-row items-center gap-1.5 mt-6 rounded-full px-3 py-1.5"
              style={{ backgroundColor: 'rgba(146,146,152,0.10)' }}
            >
              <Text className="font-sans text-[11px] font-semibold text-muted-foreground">
                {s.where}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Next / Done */}
      <View className="px-5 pb-3 pt-4">
        <Pressable
          onPress={isLast ? finish : goNext}
          className="bg-primary rounded-2xl py-3.5 items-center justify-center active:opacity-80"
        >
          <Text className="font-sans text-sm font-semibold text-white">
            {isLast ? "Got it" : 'Next'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
