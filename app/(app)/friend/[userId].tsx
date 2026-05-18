/**
 * Friend profile — read-only Phase 1.
 * Matches PWA profile hero layout: cover banner + overlapping left-aligned
 * avatar + Fraunces name + bio + vibe pill, followed by "Free windows" list
 * styled to match the Plans tab WeekdayRow pattern.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, CalendarDays, MapPin } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIBE_EMOJI: Record<string, string> = {
  social: '🎉', chill: '🛋️', athletic: '🏃', productive: '💼', custom: '✨',
};

const SLOTS = [
  'early_morning', 'late_morning', 'early_afternoon',
  'late_afternoon', 'evening', 'late_night',
] as const;
const SLOT_SHORT: Record<string, string> = {
  early_morning:    'AM',
  late_morning:     'Mid',
  early_afternoon:  '12pm',
  late_afternoon:   '3pm',
  evening:          '6pm',
  late_night:       'Late',
};

// ─── Data ─────────────────────────────────────────────────────────────────────

function useFriendProfile(userId: string) {
  return useQuery({
    queryKey: ['friend-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, display_name, first_name, last_name, avatar_url, bio, ' +
          'current_vibe, location_status, neighborhood, show_availability',
        )
        .eq('user_id', userId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

function useFriendAvailability(userId: string) {
  return useQuery({
    queryKey: ['friend-availability', userId],
    queryFn: async () => {
      const today = new Date();
      const start = format(today, 'yyyy-MM-dd');
      const end = format(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14),
        'yyyy-MM-dd',
      );
      const { data } = await supabase
        .from('availability')
        .select(
          'date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night',
        )
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });
      return data ?? [];
    },
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FriendProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data: profile, isLoading } = useFriendProfile(userId);
  const { data: availability } = useFriendAvailability(userId);
  const p: any = profile;

  const name = p
    ? formatDisplayName({
        firstName:   p.first_name,
        lastName:    p.last_name,
        displayName: p.display_name,
      })
    : '';

  const freeDays = (availability ?? []).filter((row: any) =>
    SLOTS.some((s) => row[s] === 'free'),
  );

  const vibe = p?.current_vibe as string | null;
  const showAvail = p?.show_availability !== false;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 gap-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <Text
          className="font-display text-base text-foreground flex-1"
          numberOfLines={1}
        >
          {name || 'Friend'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : (
        <ScrollView contentContainerClassName="pb-10 gap-5">
          {/* ── Profile hero (banner + overlapping avatar, matches Profile tab) ── */}
          <View className="mx-5 bg-white rounded-2xl border border-border/30 overflow-hidden shadow-sm">
            {/* Cover banner */}
            <View
              style={{ height: 96, backgroundColor: 'rgba(35,116,77,0.12)' }}
            />

            <View className="px-4 pb-4">
              {/* Avatar overlapping banner — white ring */}
              <View
                style={{
                  marginTop: -36, marginBottom: 12, alignSelf: 'flex-start',
                }}
              >
                <View
                  style={{
                    borderWidth: 4, borderColor: '#FFFFFF', borderRadius: 999,
                    shadowColor: '#040A2A',
                    shadowOpacity: 0.08, shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Avatar
                    url={p?.avatar_url}
                    firstName={p?.first_name}
                    lastName={p?.last_name}
                    displayName={p?.display_name}
                    size="xl"
                  />
                </View>
              </View>

              {/* Name */}
              <Text className="font-display text-xl text-foreground" numberOfLines={1}>
                {name}
              </Text>

              {/* Handle */}
              {p?.display_name && (
                <Text className="font-sans text-sm text-muted-foreground mt-0.5">
                  @{p.display_name}
                </Text>
              )}

              {/* Neighborhood */}
              {p?.neighborhood && (
                <View className="flex-row items-center gap-1 mt-1.5">
                  <MapPin size={12} color="#929298" strokeWidth={1.75} />
                  <Text className="font-sans text-xs text-muted-foreground">
                    {p.neighborhood}
                  </Text>
                </View>
              )}

              {/* Bio */}
              {p?.bio && (
                <Text className="font-sans text-sm text-foreground/70 mt-2 leading-relaxed">
                  {p.bio}
                </Text>
              )}

              {/* Vibe pill */}
              {vibe && (
                <View className="flex-row mt-3">
                  <View className="flex-row items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1.5">
                    <Text style={{ fontSize: 13 }}>{VIBE_EMOJI[vibe] ?? '✨'}</Text>
                    <Text className="font-sans text-xs font-semibold text-primary">
                      {vibe}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ── Availability preview ──────────────────────────────────── */}
          {showAvail && freeDays.length > 0 && (
            <View className="px-5 gap-2.5">
              <View className="flex-row items-center gap-1.5 px-0.5">
                <CalendarDays size={12} color="#929298" strokeWidth={2} />
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Free Windows
                </Text>
              </View>

              {freeDays.slice(0, 7).map((row: any) => {
                const day = new Date(row.date + 'T00:00:00');
                const freeSlots = SLOTS.filter((s) => row[s] === 'free');
                const today = isToday(day);
                return (
                  <View
                    key={row.date}
                    className="bg-white rounded-2xl px-3 py-3 flex-row items-center gap-3 shadow-sm"
                    style={
                      today
                        ? { borderWidth: 2, borderColor: '#23744D' }
                        : { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }
                    }
                  >
                    {/* DateDial */}
                    <View className="w-11 items-center">
                      <Text
                        style={{
                          fontFamily: 'Fraunces_900Black', fontSize: 9,
                          letterSpacing: 0.8, textTransform: 'uppercase',
                          color: today ? '#23744D' : '#929298',
                        }}
                      >
                        {format(day, 'EEE')}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Fraunces_900Black', fontSize: 22,
                          lineHeight: 26,
                          color: today ? '#23744D' : '#2F4F3F',
                        }}
                      >
                        {format(day, 'd')}
                      </Text>
                    </View>

                    {/* Free slot chips */}
                    <View className="flex-1 flex-row flex-wrap gap-1.5">
                      {freeSlots.map((s) => (
                        <View
                          key={s}
                          className="bg-primary/10 rounded-lg px-2 py-1"
                        >
                          <Text className="font-sans text-xs font-medium text-primary">
                            {SLOT_SHORT[s]}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Empty state for availability */}
          {showAvail && freeDays.length === 0 && !isLoading && (
            <View className="mx-5 bg-white rounded-2xl border border-dashed border-border/40 px-4 py-6 items-center gap-1">
              <Text className="font-sans text-sm text-muted-foreground">
                No free windows shared
              </Text>
              <Text className="font-sans text-xs text-muted-foreground/60">
                {name.split(' ')[0]} hasn't marked availability for the next 2 weeks
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
