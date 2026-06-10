/**
 * Set Location — modal-presented sheet for setting current city.
 *
 * Reached via the city row on the Home tab greeting.
 *
 * Saves to:
 *   - profiles.home_address (always)
 *   - Optionally also today's availability.trip_location (when "Also use as
 *     today's location" is toggled on)
 */
import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { X, MapPin, Check, Plane } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { format } from 'date-fns';
import { TC } from '@/lib/theme';
import { TINT } from '@/lib/colors';

// ─── Data ────────────────────────────────────────────────────────────────────

function useCurrentLocation(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile-location', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('home_address, neighborhood, location_status')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as any;
    },
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function SetLocationScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: current, isLoading } = useCurrentLocation(user?.id);

  const [location, setLocation] = useState('');
  const [saveAsHome, setSaveAsHome] = useState(true);
  const [markAway,   setMarkAway]   = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (current?.home_address) setLocation(current.home_address);
  }, [current?.home_address]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    const trimmed = location.trim();
    if (!trimmed) {
      Alert.alert('Pick a city', 'Search and choose a location first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);

    try {
      // Update profiles.home_address when toggle is on
      if (saveAsHome) {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ home_address: trimmed } as any)
          .eq('user_id', user.id);
        if (profileErr) throw profileErr;
      }

      // Update today's availability row to reflect away-status if requested
      if (markAway) {
        const today = format(new Date(), 'yyyy-MM-dd');
        await supabase
          .from('availability')
          .upsert(
            {
              user_id: user.id,
              date: today,
              location_status: 'away',
              trip_location: trimmed,
            } as any,
            { onConflict: 'user_id,date' },
          );
      }

      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await queryClient.invalidateQueries({ queryKey: ['profile-location'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('Save location failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user?.id, location, saveAsHome, markAway, queryClient]);

  const canSave = location.trim().length > 0 && !saving;

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
        <Text className="font-display text-base text-foreground">Where are you?</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSave ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              canSave ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="px-5 py-5 gap-5">
          {isLoading ? (
            <ActivityIndicator className="mt-8" color="#23744D" />
          ) : (
            <>
              {/* Intro */}
              <View className="flex-row items-start gap-2.5 bg-primary/8 rounded-2xl px-4 py-3">
                <MapPin size={16} color="#23744D" strokeWidth={2} />
                <Text className="font-sans text-xs text-primary flex-1 leading-relaxed">
                  Friends see your current city so they know whether you're
                  around for plans this week.
                </Text>
              </View>

              {/* Autocomplete */}
              <View>
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
                  City
                </Text>
                <LocationAutocomplete
                  value={location}
                  onChange={setLocation}
                  placeholder="Search for a city…"
                  types="(cities)"
                />
              </View>

              {/* Toggle row 1: save as home */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setSaveAsHome((v) => !v);
                }}
                className="flex-row items-center bg-card rounded-2xl border border-border/30 px-4 py-3.5 gap-3 shadow-sm active:opacity-80"
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: saveAsHome ? '#23744D' : TINT.grayStrong,
                    backgroundColor: saveAsHome ? '#23744D' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {saveAsHome && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                </View>
                <View className="flex-1">
                  <Text className="font-sans text-sm font-medium text-foreground">
                    Save as my home location
                  </Text>
                  <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                    Where you usually are. Used on your profile.
                  </Text>
                </View>
              </Pressable>

              {/* Toggle row 2: mark away today */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setMarkAway((v) => !v);
                }}
                className="flex-row items-center bg-card rounded-2xl border border-border/30 px-4 py-3.5 gap-3 shadow-sm active:opacity-80"
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: markAway ? '#D46549' : TINT.grayStrong,
                    backgroundColor: markAway ? '#D46549' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {markAway && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Plane size={11} color="#D46549" strokeWidth={2} />
                    <Text className="font-sans text-sm font-medium text-foreground">
                      I'm here just for today
                    </Text>
                  </View>
                  <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                    Marks you "away" today so friends know.
                  </Text>
                </View>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
