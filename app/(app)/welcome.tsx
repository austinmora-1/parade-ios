/**
 * EllyWalkthrough — 4-slide welcome modal for brand-new users.
 *
 * Triggered from Home tab via useEffect when:
 *   - profile.walkthrough_completed is false
 *   - User has 0 connected friends
 *   - User has 0 plans
 *
 * Each slide is a full screen with illustration / emoji + title + body.
 * Swipeable horizontal pager. Bottom controls: skip + page dots + next/done.
 *
 * On dismissal (skip OR finish): writes profiles.walkthrough_completed=true.
 */
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Slide {
  emoji: string;
  eyebrow: string;
  title:   string;
  body:    string;
}

const SLIDES: Slide[] = [
  {
    emoji:   '🏠',
    eyebrow: 'Home base',
    title:   'See your week at a glance',
    body:    "Home shows you who's around, your free windows, and any plans coming up. We pull it together so you don't have to.",
  },
  {
    emoji:   '🎉',
    eyebrow: 'Making plans',
    title:   'Tap + to plan something',
    body:    "Pick friends and find time that works, drop an open invite, or just mark a trip. The plus button has three starting points.",
  },
  {
    emoji:   '✈️',
    eyebrow: 'Trips',
    title:   'Travel, marked',
    body:    "Add a trip and friends will see you're away — and you'll see who else is in that city.",
  },
  {
    emoji:   '💚',
    eyebrow: 'Social health',
    title:   'Stay close to the people who matter',
    body:    "We help you nudge plans into the calendar — not pile up unanswered invites. Plans worth keeping.",
  },
];

const { width: SCREEN_W } = Dimensions.get('window');

export default function WelcomeScreen() {
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

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top', 'bottom']}>
      {/* Skip top-right */}
      <View className="flex-row justify-end px-5 pt-2">
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
            <Text style={{ fontSize: 96 }}>{s.emoji}</Text>
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
          </View>
        ))}
      </ScrollView>

      {/* Page dots + next/done */}
      <View className="px-5 pb-3 pt-4 gap-4">
        <View className="flex-row justify-center gap-2">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                width:  i === index ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? '#23744D' : 'rgba(146,146,152,0.3)',
              }}
            />
          ))}
        </View>

        <Pressable
          onPress={isLast ? finish : goNext}
          className="bg-primary rounded-2xl py-3.5 items-center justify-center active:opacity-80"
        >
          <Text className="font-sans text-sm font-semibold text-white">
            {isLast ? "Let's go" : 'Next'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
