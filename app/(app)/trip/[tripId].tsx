/**
 * Trip detail — PWA-aligned with edit/delete menu for the owner.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  ChevronLeft,
  Plane,
  Calendar,
  MapPin,
  MoreHorizontal,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useActionSheet } from '@expo/react-native-action-sheet';
import * as Haptics from 'expo-haptics';
import { format, differenceInDays, isAfter } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ─── Data ─────────────────────────────────────────────────────────────────────

function useTrip(tripId: string) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('id, user_id, name, location, start_date, end_date, available_slots')
        .eq('id', tripId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center px-4 py-3.5 gap-3">
      {icon}
      <Text className="font-sans text-xs text-muted-foreground w-20 uppercase tracking-wide">
        {label}
      </Text>
      <Text className="font-sans text-sm text-foreground font-medium flex-1">
        {children as string}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { user } = useAuth();
  const { data: trip, isLoading, error, refetch } = useTrip(tripId);
  const { showActionSheetWithOptions } = useActionSheet();
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const isOwner = trip?.user_id === user?.id;

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete trip?',
      'This will remove the trip permanently. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              const { error: delErr } = await supabase
                .from('trips')
                .delete()
                .eq('id', tripId);
              if (delErr) throw delErr;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err: any) {
              console.error('Delete trip failed', err);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Could not delete trip', err?.message ?? 'Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [tripId]);

  const openOwnerMenu = useCallback(() => {
    Haptics.selectionAsync();
    showActionSheetWithOptions(
      {
        options: ['Delete trip', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (i) => {
        if (i === 0) handleDelete();
      },
    );
  }, [showActionSheetWithOptions, handleDelete]);

  // ── Computed display values ────────────────────────────────────────────────
  let dateLabel = '';
  let durationLabel = '';
  if (trip?.start_date && trip?.end_date) {
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    const sameMonth = format(start, 'MMM') === format(end, 'MMM');
    dateLabel = sameMonth
      ? `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`
      : `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    const days = differenceInDays(end, start) + 1;
    durationLabel = `${days} ${days === 1 ? 'day' : 'days'}`;
  }

  const isUpcoming = trip?.start_date
    ? isAfter(new Date(trip.start_date), new Date())
    : false;

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
          {trip?.name ?? 'Trip'}
        </Text>
        {isOwner && !isLoading && !error && (
          <Pressable
            onPress={openOwnerMenu}
            disabled={deleting}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
          >
            <MoreHorizontal size={20} color="#2F4F3F" strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : error || !trip ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            {error ? 'Could not load this trip.' : 'Trip not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pb-10 gap-4 pt-2"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#23744D" />
          }
        >
          {/* Hero card — white with parade-green accent + Plane icon */}
          <View className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm">
            <View style={{ width: 4, backgroundColor: '#23744D' }} />
            <View className="flex-1 px-5 py-4 gap-1.5">
              <View className="flex-row items-center gap-1.5">
                <Plane size={14} color="#23744D" strokeWidth={2} />
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-primary">
                  Trip
                </Text>
                {isUpcoming && (
                  <View className="ml-auto bg-primary/10 rounded-full px-2 py-0.5">
                    <Text className="font-sans text-[10px] font-semibold text-primary">
                      Upcoming
                    </Text>
                  </View>
                )}
              </View>
              <Text className="font-display text-2xl text-foreground leading-tight">
                {trip.name || 'Untitled trip'}
              </Text>
              {trip.location && (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MapPin size={12} color="#929298" strokeWidth={1.75} />
                  <Text className="font-sans text-sm text-muted-foreground">
                    {trip.location}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Details card */}
          <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
            <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Dates">
              {dateLabel || '—'}
            </DetailRow>
            {durationLabel && (
              <>
                <View className="h-px bg-border/30 mx-4" />
                <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Length">
                  {durationLabel}
                </DetailRow>
              </>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
