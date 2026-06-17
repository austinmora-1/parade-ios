/**
 * FloatingTabBar — Instagram-style floating bottom nav.
 *
 *   • Detached pill bar with fully rounded ends, side gaps + drop shadow.
 *   • A tinted "pill" indicator slides smoothly between tabs (spring).
 *   • Icon-only; active icon takes the parade-green tint, inactive is muted.
 *   • Light / dark aware, driven by the descriptor's tabBarIcon render.
 */
import { useState } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const LIGHT = {
  active:   '#23744D', // parade green
  inactive: '#929298', // elephant gray
  surface:  'hsl(45, 45%, 97%)', // --chalk screen background
  pill:     'rgba(35, 116, 77, 0.12)', // TINT.primarySubtle
  border:   'rgba(35, 116, 77, 0.12)', // matches the active pill
};
const DARK = {
  active:   '#3B9B68',
  inactive: '#8A8377',
  surface:  'hsl(30, 14%, 8%)', // --chalk screen background (warm espresso)
  pill:     'rgba(59, 155, 104, 0.18)',
  border:   'rgba(59, 155, 104, 0.18)', // matches the active pill
};

const BAR_HEIGHT = 60;
const SIDE_MARGIN = 20;
const INNER_PADDING = 6;
const BOTTOM_GAP = 12; // fallback bottom inset when the device has no home indicator
const CONTENT_GAP = 10; // breathing room between scrolled content and the bar
const SPRING = { damping: 18, stiffness: 200, mass: 0.6 };

/**
 * Total vertical space the floating bar occupies from the bottom of the screen.
 * Tab screens add this as `paddingBottom` to their scroll content so the last
 * items clear the overlay instead of hiding behind it.
 */
export function useFloatingTabBarHeight() {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? insets.bottom : BOTTOM_GAP;
  return BAR_HEIGHT + bottom + CONTENT_GAP;
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const c = colorScheme === 'dark' ? DARK : LIGHT;

  // Measured inner width of the bar (set once on layout), used to size + slide the pill.
  const [innerWidth, setInnerWidth] = useState(0);
  const tabCount = state.routes.length;
  const tabWidth = innerWidth > 0 ? innerWidth / tabCount : 0;

  const pillStyle = useAnimatedStyle(() => ({
    width: tabWidth,
    opacity: tabWidth > 0 ? withTiming(1, { duration: 120 }) : 0,
    transform: [{ translateX: withSpring(state.index * tabWidth, SPRING) }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: insets.bottom > 0 ? insets.bottom : BOTTOM_GAP }]}
    >
      <View
        style={[
          styles.bar,
          { backgroundColor: c.surface, borderColor: c.border, shadowColor: '#000' },
        ]}
      >
        <View
          style={styles.inner}
          onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}
        >
          {/* Sliding highlight pill */}
          <Animated.View
            pointerEvents="none"
            style={[styles.pill, { backgroundColor: c.pill }, pillStyle]}
          />

          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const color = focused ? c.active : c.inactive;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TabButton
                key={route.key}
                focused={focused}
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title}
              >
                {options.tabBarIcon?.({ focused, color, size: 24 })}
              </TabButton>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabButton({
  focused,
  onPress,
  onLongPress,
  accessibilityLabel,
  children,
}: {
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(focused ? 1.06 : 1, SPRING) }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tab}
      hitSlop={8}
    >
      <Animated.View style={iconStyle}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  bar: {
    height: BAR_HEIGHT,
    marginHorizontal: SIDE_MARGIN,
    paddingHorizontal: INNER_PADDING,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignSelf: 'stretch',
    // Floating drop shadow
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    borderRadius: 999,
  },
  tab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
