import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FieldLabel, Chip } from '@/components/new-plan/FormBits';
import type { TimeSlot } from '@/types/planner';

export const SLOTS: { id: TimeSlot; label: string; range: string }[] = [
  { id: 'early-morning',   label: 'Early morning',   range: '7–9am' },
  { id: 'late-morning',    label: 'Late morning',    range: '9am–12pm' },
  { id: 'early-afternoon', label: 'Early afternoon', range: '12–3pm' },
  { id: 'late-afternoon',  label: 'Late afternoon',  range: '3–6pm' },
  { id: 'evening',         label: 'Evening',         range: '6–10pm' },
  { id: 'late-night',      label: 'Late night',      range: '10pm–2am' },
];

export function TimeSlotPicker({
  timeSlot,
  onSelect,
}: {
  timeSlot: TimeSlot;
  onSelect: (slot: TimeSlot) => void;
}) {
  return (
    <View>
      <FieldLabel>Time</FieldLabel>
      <View className="flex-row flex-wrap gap-2">
        {SLOTS.map((s) => {
          const selected = timeSlot === s.id;
          return (
            <Chip
              key={s.id}
              selected={selected}
              onPress={() => { Haptics.selectionAsync(); onSelect(s.id); }}
            >
              <View>
                <Text
                  className={`font-sans text-xs font-semibold ${
                    selected ? 'text-white' : 'text-foreground'
                  }`}
                >
                  {s.label}
                </Text>
                <Text
                  className={`font-sans text-[10px] ${
                    selected ? 'text-white/70' : 'text-muted-foreground'
                  }`}
                >
                  {s.range}
                </Text>
              </View>
            </Chip>
          );
        })}
      </View>
    </View>
  );
}
