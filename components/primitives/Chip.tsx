import { View, Pressable } from 'react-native';

export function Chip({
  selected,
  onPress,
  children,
  className = 'rounded-xl px-3 py-2.5',
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
  /** Shape override (radius + padding) — selected/unselected colors stay fixed. */
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`${className} border active:opacity-70 ${
        selected
          ? 'bg-primary border-primary'
          : 'bg-card border-border/40'
      }`}
    >
      <View className="flex-row items-center gap-1.5">{children}</View>
    </Pressable>
  );
}
