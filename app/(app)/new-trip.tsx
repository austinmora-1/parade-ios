/**
 * New trip — modal-presented form.
 *
 * Reached via "+ New trip" button on the Plans tab.
 *
 * Fields:
 *   - Name (required)
 *   - Destination/location (optional)
 *   - Start date — chip selector across the next 30 days
 *   - End date — duration chips relative to start (1–14 days)
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, addDays, isSameDay, isToday, isTomorrow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, Plane } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { setTripAvailability } from '@/lib/tripBusy';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { TC } from '@/lib/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const START_DATE_CHIPS = 30;     // next 30 days for start
const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 10, 14] as const;

function dateLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

function Chip({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl px-3 py-2.5 border active:opacity-70 ${
        selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
      }`}
    >
      <View className="flex-row items-center gap-1.5">{children}</View>
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function NewTripScreen() {
  const { user } = useAuth();
  const queryClient     = useQueryClient();
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const setUserId       = usePlannerStore((s) => s.setUserId);

  // Ensure planner store has userId for the block-availability writes
  useMemo(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  const [name,     setName]     = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [duration,  setDuration]  = useState<number>(3);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Start-date options: next 30 days
  const startDateOptions = useMemo(
    () => Array.from({ length: START_DATE_CHIPS }, (_, i) => addDays(new Date(), i)),
    [],
  );

  const endDate = useMemo(
    () => addDays(startDate, Math.max(0, duration - 1)),
    [startDate, duration],
  );

  const handleSubmit = useCallback(async () => {
    if (!user?.id) return;
    if (!name.trim()) {
      setError('Trip name is required');
      return;
    }
    setError(null);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error: insertErr } = await supabase.from('trips').insert({
        user_id:    user.id,
        name:       name.trim(),
        location:   location.trim() || null,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date:   format(endDate, 'yyyy-MM-dd'),
        needs_return_date: false,
      } as any);
      if (insertErr) throw insertErr;

      // Block all 6 slots on every day of the trip so friends see "away"
      await setTripAvailability(setAvailability, startDate, endDate, false);

      // Refresh anything that lists trips
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('Create trip failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not create trip', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user?.id, name, location, startDate, endDate, queryClient]);

  const canSubmit = name.trim().length > 0 && !saving;

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
        <Text className="font-display text-base text-foreground">New trip</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              canSubmit ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {saving ? 'Saving…' : 'Create'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-5 gap-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Intro */}
          <View className="bg-primary/8 rounded-2xl px-4 py-3 flex-row items-center gap-2.5">
            <Plane size={16} color="#23744D" strokeWidth={2} />
            <Text className="font-sans text-xs text-primary flex-1 leading-relaxed">
              Trips block your availability for the dates you're away.
              Friends will see you're traveling.
            </Text>
          </View>

          {/* Switch to proposal flow */}
          <Pressable
            onPress={() => router.replace('/(app)/new-trip-proposal')}
            className="flex-row items-center justify-between bg-card border border-border/30 rounded-xl px-4 py-3 active:opacity-80 shadow-sm"
          >
            <View className="flex-1 gap-0.5">
              <Text className="font-sans text-sm font-semibold text-foreground">
                Going with friends?
              </Text>
              <Text className="font-sans text-[11px] text-muted-foreground">
                Propose dates and let them vote on the timing.
              </Text>
            </View>
            <Text className="font-sans text-xs font-semibold text-primary">
              Propose →
            </Text>
          </Pressable>

          {/* Name */}
          <View>
            <FieldLabel>Trip name</FieldLabel>
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); setError(null); }}
              placeholder="e.g. Lisbon for a week"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
              maxLength={80}
              autoFocus
            />
            {error && (
              <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                {error}
              </Text>
            )}
          </View>

          {/* Destination */}
          <View>
            <FieldLabel>Destination (optional)</FieldLabel>
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              placeholder="City, country, or region"
              types="(cities)"
            />
          </View>

          {/* Start date */}
          <View>
            <FieldLabel>Leaving</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-0.5 pb-1"
            >
              {startDateOptions.map((d) => {
                const selected = isSameDay(d, startDate);
                return (
                  <Chip
                    key={d.toISOString()}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setStartDate(d); }}
                  >
                    <View className="items-center">
                      <Text
                        className={`font-sans text-[10px] font-semibold uppercase tracking-wider ${
                          selected ? 'text-white/80' : 'text-muted-foreground'
                        }`}
                      >
                        {dateLabel(d)}
                      </Text>
                      <Text
                        className={`font-display text-base ${
                          selected ? 'text-white' : 'text-foreground'
                        }`}
                      >
                        {format(d, 'MMM d')}
                      </Text>
                    </View>
                  </Chip>
                );
              })}
            </ScrollView>
          </View>

          {/* Duration */}
          <View>
            <FieldLabel>How long</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {DURATION_OPTIONS.map((days) => {
                const selected = duration === days;
                return (
                  <Chip
                    key={days}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setDuration(days); }}
                  >
                    <Text
                      className={`font-sans text-xs font-semibold ${
                        selected ? 'text-white' : 'text-foreground'
                      }`}
                    >
                      {days} {days === 1 ? 'day' : 'days'}
                    </Text>
                  </Chip>
                );
              })}
            </View>
          </View>

          {/* Summary preview */}
          <View className="bg-card rounded-2xl border border-border/30 p-4 gap-1 shadow-sm">
            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Trip will be
            </Text>
            <Text className="font-display text-base text-foreground mt-1">
              {format(startDate, 'EEE, MMM d')} – {format(endDate, 'EEE, MMM d')}
            </Text>
            <Text className="font-sans text-xs text-muted-foreground">
              {duration} {duration === 1 ? 'day' : 'days'} away
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
