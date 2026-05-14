/**
 * Skeleton — animated pulse placeholder for loading states.
 * Uses Reanimated so it works on both old and new architecture.
 */
import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  /** Tailwind border-radius class, e.g. "rounded-xl". Defaults to "rounded-lg". */
  rounded?: string;
  className?: string;
}

export function Skeleton({
  width,
  height = 16,
  rounded = 'rounded-lg',
  className = '',
}: SkeletonProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // Cleanup: cancel animation when unmounted
    return () => {
      opacity.value = 1;
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          backgroundColor: '#DDD8CE', // warm neutral, matches chalk palette
        },
        animStyle,
      ]}
      className={`${rounded} ${className}`}
    />
  );
}
