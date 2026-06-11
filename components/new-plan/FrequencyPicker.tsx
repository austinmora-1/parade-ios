import { View, Text } from 'react-native';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { FieldLabel, Chip } from '@/components/new-plan/FormBits';

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'monthly';

export function FrequencyPicker({
  frequency,
  onChange,
  date,
}: {
  frequency: Frequency;
  onChange: (f: Frequency) => void;
  date: Date;
}) {
  return (
    <View>
      <FieldLabel>Repeats</FieldLabel>
      <View className="flex-row flex-wrap gap-2">
        {(['once', 'weekly', 'biweekly', 'monthly'] as const).map((f) => {
          const selected = frequency === f;
          const label =
            f === 'once' ? 'Once'
            : f === 'weekly' ? 'Weekly'
            : f === 'biweekly' ? 'Every 2 weeks'
            : 'Monthly';
          return (
            <Chip
              key={f}
              selected={selected}
              onPress={() => { Haptics.selectionAsync(); onChange(f); }}
            >
              <Text className={`font-sans text-xs font-semibold ${
                selected ? 'text-white' : 'text-foreground'
              }`}>
                {label}
              </Text>
            </Chip>
          );
        })}
      </View>
      {frequency !== 'once' && (
        <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
          Repeats {frequency === 'biweekly' ? 'every other ' : ''}
          {format(date, 'EEEE')}
          {frequency === 'monthly' ? ' each month' : ''}.
        </Text>
      )}
    </View>
  );
}
