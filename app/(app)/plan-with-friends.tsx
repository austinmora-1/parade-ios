/**
 * Plan with friends — multi-select friend staging modal.
 *
 * Reached via "Plan with friends" CTA on the Friends tab. User picks
 * multiple friends then taps "Plan together" → routes to new-plan with the
 * friends pre-selected as invitees (via ?preInvite=id1,id2 URL param).
 *
 * Also supports "Plan a trip together" which routes to new-trip (trips
 * don't currently support invitees, but the action stays for parity with
 * the PWA's GroupScheduler).
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { X, Check, CalendarCheck, Plane, Users } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { Avatar } from '@/components/primitives/Avatar';
import { TC } from '@/lib/theme';

import { TINT } from '@/lib/colors';
export default function PlanWithFriendsScreen() {
  const friends = usePlannerStore((s) => s.friends);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const connectedFriends = friends.filter(
    (f) => f.status === 'connected' && f.friendUserId,
  );

  const toggle = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const continueToPlanning = useCallback((mode: 'plan' | 'trip') => {
    if (selected.size === 0) {
      Alert.alert('Pick at least one friend', 'Stage friends you want to plan with.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const preInvite = [...selected].join(',');
    if (mode === 'plan') {
      router.replace(`/(app)/new-plan?preInvite=${preInvite}` as any);
    } else {
      // Trips don't have invitees yet in our schema; route there anyway and
      // let user add invitees later (Phase 8+ may add).
      router.replace('/(app)/new-trip' as any);
    }
  }, [selected]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">Plan with friends</Text>
        <View className="w-9" />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-4 gap-4 pb-32"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="flex-row items-start gap-2 bg-primary/8 rounded-2xl px-4 py-3">
            <Users size={15} color="#23744D" strokeWidth={2} />
            <Text className="font-sans text-xs text-primary flex-1 leading-relaxed">
              Stage everyone you want included. Once you continue, we'll pre-fill
              them as invitees on the plan form.
            </Text>
          </View>

          {connectedFriends.length === 0 ? (
            <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-8 items-center gap-2">
              <Text className="font-sans text-sm text-muted-foreground">No friends yet</Text>
              <Text className="font-sans text-xs text-muted-foreground/60 text-center">
                Add friends first — then come back to plan with them.
              </Text>
            </View>
          ) : (
            <View>
              <View className="flex-row items-center justify-between mb-2 px-0.5">
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Friends
                </Text>
                {selected.size > 0 && (
                  <Text className="font-sans text-[11px] font-semibold text-primary">
                    {selected.size} selected
                  </Text>
                )}
              </View>
              <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                {connectedFriends.map((f, i) => {
                  const checked = selected.has(f.friendUserId!);
                  return (
                    <View key={f.id}>
                      <Pressable
                        onPress={() => toggle(f.friendUserId!)}
                        className="flex-row items-center px-4 py-3 gap-3 active:bg-muted/30"
                      >
                        <Avatar url={f.avatar} displayName={f.name} size="sm" />
                        <Text
                          className="flex-1 font-sans text-sm font-medium text-foreground"
                          numberOfLines={1}
                        >
                          {f.name}
                        </Text>
                        <View
                          style={{
                            width: 22, height: 22, borderRadius: 6,
                            borderWidth: 1.5,
                            borderColor: checked ? '#23744D' : TINT.grayStrong,
                            backgroundColor: checked ? '#23744D' : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {checked && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                        </View>
                      </Pressable>
                      {i < connectedFriends.length - 1 && (
                        <View className="h-px bg-border/30 mx-4" />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom action bar */}
        {selected.size > 0 && (
          <View className="absolute left-0 right-0 bottom-0 bg-chalk border-t border-border/30 px-5 pt-3 pb-6 gap-2">
            <Pressable
              onPress={() => continueToPlanning('plan')}
              className="flex-row items-center justify-center gap-1.5 bg-primary rounded-2xl py-3.5 active:opacity-80"
            >
              <CalendarCheck size={15} color="#FFFFFF" strokeWidth={2.5} />
              <Text className="font-sans text-sm font-semibold text-white">
                Plan together
              </Text>
            </Pressable>
            <Pressable
              onPress={() => continueToPlanning('trip')}
              className="flex-row items-center justify-center gap-1.5 bg-card border border-border/40 rounded-2xl py-3 active:opacity-70"
            >
              <Plane size={14} color="#23744D" strokeWidth={2.2} />
              <Text className="font-sans text-sm font-semibold text-primary">
                Plan a trip together
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
