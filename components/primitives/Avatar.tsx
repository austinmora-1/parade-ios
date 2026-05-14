import { View, Text, Image } from 'react-native';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  url?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  size?: Size;
  className?: string;
}

const sizeMap: Record<Size, { container: string; text: string; px: number }> = {
  xs: { container: 'w-7 h-7', text: 'text-xs', px: 28 },
  sm: { container: 'w-9 h-9', text: 'text-sm', px: 36 },
  md: { container: 'w-12 h-12', text: 'text-base', px: 48 },
  lg: { container: 'w-16 h-16', text: 'text-xl', px: 64 },
  xl: { container: 'w-24 h-24', text: 'text-3xl', px: 96 },
};

export function Avatar({
  url,
  firstName,
  lastName,
  displayName,
  size = 'md',
  className,
}: AvatarProps) {
  const { container, text, px } = sizeMap[size];
  const initials = getInitials({ firstName, lastName, displayName });

  return (
    <View
      className={cn(
        'rounded-full overflow-hidden items-center justify-center bg-sage/30',
        container,
        className
      )}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: px, height: px }}
          resizeMode="cover"
        />
      ) : (
        <Text className={cn('font-sans font-medium text-evergreen', text)}>
          {initials}
        </Text>
      )}
    </View>
  );
}
