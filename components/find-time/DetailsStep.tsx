/**
 * Step 3 of the find-time wizard — title / activity / location / notes +
 * summary card. Presentational only; form state lives in
 * app/(app)/find-time.tsx.
 */
import { ScrollView, View, Text, TextInput } from 'react-native';
import { format } from 'date-fns';
import { Users as UsersIcon } from 'lucide-react-native';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { slotRangeLabel } from '@/lib/socialSlots';
import { ActivityPicker, type ActivityOption } from '@/components/primitives/ActivityPicker';
import { FieldLabel } from '@/components/primitives/FieldLabel';
import type { TimeSlot } from '@/types/planner';

const ACTIVITIES: ActivityOption[] = [
  { id: 'drinks', label: 'Drinks', emoji: '🍹' },
  { id: 'dinner', label: 'Dinner', emoji: '🍝' },
  { id: 'brunch', label: 'Brunch', emoji: '🥞' },
  { id: 'coffee', label: 'Coffee', emoji: '☕' },
  { id: 'happy-hour', label: 'Happy hour', emoji: '🍻' },
  { id: 'hike', label: 'Hike', emoji: '🥾' },
  { id: 'movie', label: 'Movie', emoji: '🎬' },
  { id: 'concert', label: 'Concert', emoji: '🎵' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'meetup', label: 'Meetup', emoji: '👋' },
  { id: 'other', label: 'Other', emoji: '✨' },
];

interface DetailsStepProps {
  title: string;
  onTitleChange: (text: string) => void;
  activity: string;
  onActivityChange: (id: string) => void;
  location: string;
  onLocationChange: (text: string) => void;
  notes: string;
  onNotesChange: (text: string) => void;
  participantCount: number;
  guestCount: number;
  selectedSlots: { date: string; slot: TimeSlot }[];
}

export function DetailsStep({
  title,
  onTitleChange,
  activity,
  onActivityChange,
  location,
  onLocationChange,
  notes,
  onNotesChange,
  participantCount,
  guestCount,
  selectedSlots,
}: DetailsStepProps) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-5" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View>
        <FieldLabel>What's the plan?</FieldLabel>
        <TextInput
          value={title}
          onChangeText={onTitleChange}
          placeholder="e.g. Drinks at Sway Bar"
          placeholderTextColor="#929298"
          className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
          maxLength={100}
          autoFocus
        />
      </View>

      <ActivityPicker activities={ACTIVITIES} activity={activity} onSelect={onActivityChange} />

      <View>
        <FieldLabel>Where (optional)</FieldLabel>
        <LocationAutocomplete value={location} onChange={onLocationChange} placeholder="Bar, restaurant, neighborhood…" types="establishment" />
      </View>

      <View>
        <FieldLabel>Notes (optional)</FieldLabel>
        <TextInput
          value={notes}
          onChangeText={onNotesChange}
          placeholder="Any extra details…"
          placeholderTextColor="#929298"
          className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
          maxLength={500}
          multiline
          style={{ minHeight: 72, textAlignVertical: 'top' }}
        />
      </View>

      {/* Summary */}
      <View className="bg-card rounded-2xl border border-border/30 shadow-sm p-4 gap-2">
        <View className="flex-row items-center gap-2">
          <UsersIcon size={14} color="#23744D" strokeWidth={2} />
          <Text className="font-sans text-xs text-foreground">
            {participantCount === 0 ? 'Just you' :
              `${participantCount} ${participantCount === 1 ? 'person' : 'people'}`}
            {guestCount > 0 ? ` · ${guestCount} guest${guestCount === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        <Text className="font-sans text-xs text-muted-foreground">
          {selectedSlots.length === 1
            ? `${format(new Date(`${selectedSlots[0].date}T12:00:00`), 'EEE, MMM d')} · ${slotRangeLabel(selectedSlots[0].slot)}`
            : `${selectedSlots.length} time options — participants vote`}
        </Text>
      </View>
    </ScrollView>
  );
}
