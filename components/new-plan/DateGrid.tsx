import { ScrollView, View, Text } from 'react-native';
import { format, isToday, isTomorrow, isSameDay } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { FieldLabel } from '@/components/primitives/FieldLabel';
import { Chip } from '@/components/primitives/Chip';

function dateLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}

export function DateGrid({
  dateOptions,
  date,
  onSelect,
}: {
  dateOptions: Date[];
  date: Date;
  onSelect: (d: Date) => void;
}) {
  return (
    <View>
      <FieldLabel>When</FieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-0.5 pb-1"
      >
        {dateOptions.map((d) => {
          const selected = isSameDay(d, date);
          return (
            <Chip
              key={d.toISOString()}
              selected={selected}
              onPress={() => { Haptics.selectionAsync(); onSelect(d); }}
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
  );
}
