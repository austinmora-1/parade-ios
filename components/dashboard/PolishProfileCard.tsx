/**
 * PolishProfileCard — dismissible nudge on Dashboard that surfaces when the
 * user has ≥3 of {interests, social_goals, social_cap, preferred_social_times}
 * empty.
 *
 * Routes to /(app)/edit-profile where Phase 9 will surface the preferences
 * fields. For now, this card primarily highlights that profile completion is
 * worth doing.
 *
 * Returns null when dismissed or profile is "full enough".
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ChevronRight, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDismissed } from './dismissCache';

import { TINT } from '@/lib/colors';
const DISMISS_KEY = 'polishProfile';

function useProfilePreferences(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile-preferences', userId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('interests, social_goals, social_cap, preferred_social_times')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as any;
    },
  });
}

export function PolishProfileCard() {
  const { user } = useAuth();
  const { data: prefs } = useProfilePreferences(user?.id);
  const [dismissed, doDismiss] = useDismissed(DISMISS_KEY, user?.id);

  if (dismissed || !prefs) return null;

  const isEmpty = (v: any) => {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    return false;
  };

  const emptyCount = [
    isEmpty(prefs.interests),
    isEmpty(prefs.social_goals),
    isEmpty(prefs.social_cap),
    isEmpty(prefs.preferred_social_times),
  ].filter(Boolean).length;

  if (emptyCount < 3) return null;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        router.push('/(app)/edit-profile');
      }}
      className="flex-row items-center bg-card rounded-2xl border border-marigold/30 px-4 py-3.5 gap-3 shadow-sm active:opacity-80"
    >
      <View
        className="w-10 h-10 rounded-xl items-center justify-center"
        style={{ backgroundColor: TINT.marigoldSubtle }}
      >
        <Sparkles size={18} color="#DFA53A" strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-sans text-[10px] font-semibold uppercase tracking-wider text-marigold">
          Polish your profile
        </Text>
        <Text className="font-display text-[17px] text-foreground">
          Help friends know you
        </Text>
        <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
          Add interests, social goals, and your weekly capacity.
        </Text>
      </View>
      <View className="items-center gap-2">
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            Haptics.selectionAsync();
            doDismiss();
          }}
          hitSlop={6}
          className="w-6 h-6 items-center justify-center active:opacity-60"
        >
          <X size={14} color="#929298" strokeWidth={2} />
        </Pressable>
        <ChevronRight size={16} color="#DFA53A" strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}
