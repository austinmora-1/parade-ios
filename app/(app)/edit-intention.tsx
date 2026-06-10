/**
 * Edit Weekly Intention — modal that lets the user set their social
 * energy, target hangout count, vibes, and free-form notes for this week.
 *
 * Reached via the WeeklyIntentionCard on the Profile tab.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import {
  useWeeklyIntention,
  useUpsertIntention,
  type SocialEnergy,
} from '@/hooks/useWeeklyIntention';
import { TC } from '@/lib/theme';

const ENERGY_OPTIONS: { id: SocialEnergy; label: string; emoji: string }[] = [
  { id: 'low',    label: 'Low',    emoji: '🛋️' },
  { id: 'medium', label: 'Medium', emoji: '☕' },
  { id: 'high',   label: 'High',   emoji: '🎉' },
];

const VIBE_OPTIONS = [
  'Social', 'Chill', 'Athletic', 'Productive', 'Curious',
  'Outdoorsy', 'Creative', 'Cozy', 'Adventurous',
];

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

export default function EditIntentionScreen() {
  const { data: intention, isLoading } = useWeeklyIntention();
  const upsertMut = useUpsertIntention();

  const [energy, setEnergy] = useState<SocialEnergy | null>(null);
  const [target, setTarget] = useState<number>(2);
  const [vibes,  setVibes]  = useState<string[]>([]);
  const [notes,  setNotes]  = useState('');

  useEffect(() => {
    if (!intention) return;
    setEnergy(intention.socialEnergy);
    setTarget(intention.targetHangouts ?? 2);
    setVibes(intention.vibes);
    setNotes(intention.notes ?? '');
  }, [intention]);

  const toggleVibe = useCallback((v: string) => {
    Haptics.selectionAsync();
    setVibes((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }, []);

  const handleSave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await upsertMut.mutateAsync({
        socialEnergy:   energy,
        targetHangouts: target,
        vibes,
        notes:          notes.trim() || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('Save intention failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    }
  }, [energy, target, vibes, notes, upsertMut]);

  const saving = upsertMut.isPending;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">This week</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          hitSlop={6}
          className="bg-primary rounded-xl px-3 py-1.5 active:opacity-80"
        >
          <Text className="font-sans text-sm font-semibold text-white">
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {isLoading ? (
          <ActivityIndicator className="mt-12" color="#23744D" />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 py-5 gap-5"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Intro */}
            <View className="bg-primary/8 rounded-2xl px-4 py-3">
              <Text className="font-sans text-xs text-primary leading-relaxed">
                Set your social energy for the week and how many hangouts
                you're hoping for. We'll help you track progress.
              </Text>
            </View>

            {/* Social energy */}
            <View>
              <FieldLabel>Social energy</FieldLabel>
              <View className="flex-row gap-2">
                {ENERGY_OPTIONS.map((opt) => {
                  const selected = energy === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => { Haptics.selectionAsync(); setEnergy(opt.id); }}
                      className={`flex-1 rounded-xl px-3 py-3 border items-center gap-1.5 active:opacity-70 ${
                        selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                      }`}
                    >
                      <Text style={{ fontSize: 24 }}>{opt.emoji}</Text>
                      <Text
                        className={`font-sans text-sm font-semibold ${
                          selected ? 'text-white' : 'text-foreground'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Target hangouts */}
            <View>
              <FieldLabel>How many hangouts this week?</FieldLabel>
              <View className="bg-card rounded-2xl border border-border/30 px-4 py-4 flex-row items-center justify-between shadow-sm">
                <Text className="font-sans text-sm text-muted-foreground">
                  Target
                </Text>
                <View className="flex-row items-center gap-3">
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTarget(Math.max(0, target - 1));
                    }}
                    hitSlop={6}
                    className="w-9 h-9 rounded-full bg-muted items-center justify-center active:opacity-70"
                  >
                    <Text className="font-sans text-base font-semibold text-foreground">−</Text>
                  </Pressable>
                  <Text className="font-display text-2xl text-foreground w-10 text-center">
                    {target}
                  </Text>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTarget(Math.min(14, target + 1));
                    }}
                    hitSlop={6}
                    className="w-9 h-9 rounded-full bg-primary items-center justify-center active:opacity-80"
                  >
                    <Text className="font-sans text-base font-semibold text-white">+</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Vibes */}
            <View>
              <FieldLabel>This week I'm feeling</FieldLabel>
              <View className="flex-row flex-wrap gap-1.5">
                {VIBE_OPTIONS.map((v) => {
                  const selected = vibes.includes(v);
                  return (
                    <Pressable
                      key={v}
                      onPress={() => toggleVibe(v)}
                      className={`rounded-full px-3 py-1.5 border active:opacity-70 ${
                        selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                      }`}
                    >
                      <Text
                        className={`font-sans text-xs font-medium ${
                          selected ? 'text-white' : 'text-foreground'
                        }`}
                      >
                        {v}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Notes */}
            <View>
              <FieldLabel>Notes (optional)</FieldLabel>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Open to anything · Want to see Alex · Try a new spot…"
                placeholderTextColor="#929298"
                className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                maxLength={500}
                multiline
                style={{ minHeight: 96, textAlignVertical: 'top' }}
              />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
