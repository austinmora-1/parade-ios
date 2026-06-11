import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FieldLabel } from '@/components/primitives/FieldLabel';
import { Chip } from '@/components/primitives/Chip';
import { SLOT_OPTIONS } from '@/lib/socialSlots';
import type { TimeSlot } from '@/types/planner';

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
        {SLOT_OPTIONS.map((s) => {
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
