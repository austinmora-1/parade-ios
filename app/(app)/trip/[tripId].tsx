import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Plane, Calendar, MapPin } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

function useTrip(tripId: string) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('id, name, location, start_date, end_date, available_slots')
        .eq('id', tripId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export default function TripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { data: trip, isLoading, error } = useTrip(tripId);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-2">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center"
          hitSlop={8}
        >
          <ChevronLeft size={24} color="#2F4A3E" strokeWidth={1.75} />
        </Pressable>
        <Text className="font-sans font-semibold text-evergreen text-xl flex-1" numberOfLines={1}>
          {trip?.name ?? 'Trip'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#DDA73A" />
      ) : error || !trip ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-foreground/40 text-center">
            {error ? 'Could not load this trip.' : 'Trip not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-10 gap-5 pt-2">
          {/* Hero */}
          <View className="bg-evergreen rounded-3xl p-6 gap-2">
            <Plane size={24} color="#DDA73A" strokeWidth={1.5} />
            <Text style={{ fontFamily: 'CormorantGaramond_500Medium' }} className="text-3xl text-chalk mt-1">
              {trip.name || 'Untitled trip'}
            </Text>
          </View>

          {/* Details */}
          <View className="bg-white rounded-3xl border border-border/30 divide-y divide-border/20">
            {trip.location ? (
              <DetailRow icon={<MapPin size={16} color="#9CB094" />} label="Location">
                {trip.location}
              </DetailRow>
            ) : null}
            {(trip.start_date || trip.end_date) ? (
              <DetailRow icon={<Calendar size={16} color="#9CB094" />} label="Dates">
                {[
                  trip.start_date ? format(new Date(trip.start_date), 'MMM d') : null,
                  trip.end_date ? format(new Date(trip.end_date), 'MMM d, yyyy') : null,
                ]
                  .filter(Boolean)
                  .join(' – ')}
              </DetailRow>
            ) : null}
            {trip.available_slots?.length ? (
              <DetailRow icon={<Calendar size={16} color="#9CB094" />} label="Slots">
                {trip.available_slots.join(', ')}
              </DetailRow>
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

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
    <View className="flex-row items-center px-5 py-4 gap-3">
      {icon}
      <Text className="font-sans text-sm text-foreground/50 w-20">{label}</Text>
      <Text className="font-sans text-sm text-evergreen font-medium flex-1">{children as string}</Text>
    </View>
  );
}
