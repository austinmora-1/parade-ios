/**
 * AvatarStack — a row of slightly-overlapping avatars with a "+N" overflow
 * bubble. Used by the collapsed Pending/Pods rows on the Friends tab and by
 * the pod member summaries.
 */
import { View, Text } from 'react-native';
import { Avatar } from '@/components/primitives/Avatar';

type Size = 'xs' | 'sm' | 'md';

export interface StackPerson {
  avatar?: string | null;
  name?: string | null;
}

const PX: Record<Size, number> = { xs: 28, sm: 36, md: 48 };

export function AvatarStack({
  people,
  max = 5,
  size = 'sm',
  overlap = 12,
}: {
  people: StackPerson[];
  /** Max avatars to render before collapsing into a "+N" bubble. */
  max?: number;
  size?: Size;
  /** Pixels each avatar overlaps the previous one. */
  overlap?: number;
}) {
  const px = PX[size];
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <View
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            backgroundColor: '#FFFFFF',
            zIndex: shown.length - i,
          }}
        >
          <Avatar url={p.avatar} displayName={p.name} size={size} />
        </View>
      ))}

      {overflow > 0 && (
        <View
          style={{
            marginLeft: -overlap,
            width: px,
            height: px,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            backgroundColor: '#E6ECE7',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            className="font-sans font-semibold text-evergreen"
            style={{ fontSize: size === 'xs' ? 10 : 12 }}
          >
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
}
