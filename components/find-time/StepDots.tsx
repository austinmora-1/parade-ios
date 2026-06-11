import { View } from 'react-native';
import { TINT } from '@/lib/colors';

export function StepDots({ step }: { step: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: i === step ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === step ? '#23744D' : TINT.grayBorder,
          }}
        />
      ))}
    </View>
  );
}
