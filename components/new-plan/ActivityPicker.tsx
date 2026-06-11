import { ScrollView, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FieldLabel, Chip } from '@/components/new-plan/FormBits';

const ACTIVITIES = [
  { id: 'drinks',      label: 'Drinks',     emoji: '🍹' },
  { id: 'dinner',      label: 'Dinner',     emoji: '🍝' },
  { id: 'brunch',      label: 'Brunch',     emoji: '🥞' },
  { id: 'coffee',      label: 'Coffee',     emoji: '☕' },
  { id: 'happy-hour',  label: 'Happy hour', emoji: '🍻' },
  { id: 'hike',        label: 'Hike',       emoji: '🥾' },
  { id: 'run',         label: 'Run',        emoji: '🏃' },
  { id: 'gym',         label: 'Gym',        emoji: '🏋️' },
  { id: 'movie',       label: 'Movie',      emoji: '🎬' },
  { id: 'concert',     label: 'Concert',    emoji: '🎵' },
  { id: 'sports',      label: 'Sports',     emoji: '⚽' },
  { id: 'park',        label: 'Park',       emoji: '🌳' },
  { id: 'beach',       label: 'Beach',      emoji: '🏖️' },
  { id: 'meetup',      label: 'Meetup',     emoji: '👋' },
  { id: 'travel',      label: 'Travel',     emoji: '✈️' },
  { id: 'other',       label: 'Other',      emoji: '✨' },
];

export function ActivityPicker({
  activity,
  onSelect,
}: {
  activity: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View>
      <FieldLabel>Activity</FieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-0.5 pb-1"
      >
        {ACTIVITIES.map((a) => {
          const selected = activity === a.id;
          return (
            <Chip
              key={a.id}
              selected={selected}
              onPress={() => { Haptics.selectionAsync(); onSelect(a.id); }}
            >
              <Text style={{ fontSize: 14 }}>{a.emoji}</Text>
              <Text
                className={`font-sans text-xs font-medium ${
                  selected ? 'text-white' : 'text-foreground'
                }`}
              >
                {a.label}
              </Text>
            </Chip>
          );
        })}
      </ScrollView>
    </View>
  );
}
