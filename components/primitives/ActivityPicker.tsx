import { ScrollView, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FieldLabel } from '@/components/primitives/FieldLabel';
import { Chip } from '@/components/primitives/Chip';

export interface ActivityOption {
  id: string;
  label: string;
  emoji: string;
}

export function ActivityPicker({
  activities,
  activity,
  onSelect,
}: {
  activities: ActivityOption[];
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
        {activities.map((a) => {
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
