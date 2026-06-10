/**
 * TimeWheelPicker — bottom-sheet wheel selector for picking a time-of-day
 * with 30-minute granularity. Pure JS implementation (no native modules)
 * built on a snapping ScrollView. Looks and feels like the iOS UIPicker.
 *
 * Usage:
 *   <TimeWheelPicker
 *     visible={open}
 *     value={9.5}           // fractional hour (9.5 == 9:30 AM)
 *     onConfirm={(v) => …}
 *     onCancel={() => …}
 *     title="Start time"
 *     min={0}               // optional bounds — values outside disabled
 *     max={23.5}
 *   />
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;            // odd number so middle row is centered
const PICKER_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

interface Props {
  visible:   boolean;
  value:     number;               // fractional hour (e.g. 8.5)
  onConfirm: (value: number) => void;
  onCancel:  () => void;
  title?:    string;
  min?:      number;               // inclusive
  max?:      number;               // inclusive
  /** Step in hours. 0.5 = half-hour increments (default). */
  step?:     number;
}

function formatLabel(h: number): string {
  const wholeHour = Math.floor(h);
  const minutes   = Math.round((h - wholeHour) * 60);
  const period    = wholeHour < 12 || wholeHour === 24 ? 'AM' : 'PM';
  const hour12    = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  const mmPadded  = minutes.toString().padStart(2, '0');
  return `${hour12}:${mmPadded} ${period}`;
}

export function TimeWheelPicker({
  visible,
  value,
  onConfirm,
  onCancel,
  title = 'Select time',
  min   = 0,
  max   = 23.5,
  step  = 0.5,
}: Props) {
  // Build the list of selectable values
  const values: number[] = [];
  for (let v = 0; v <= 23.999; v += step) {
    values.push(Math.round(v * 10) / 10);
  }

  const initialIndex = Math.max(
    0,
    values.findIndex((v) => Math.abs(v - value) < 1e-3),
  );

  const scrollRef       = useRef<ScrollView>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const lastHapticIdx   = useRef(initialIndex);

  // Snap to the current value whenever the sheet opens
  useEffect(() => {
    if (visible) {
      setSelectedIndex(initialIndex);
      lastHapticIdx.current = initialIndex;
      // Defer scrollTo until layout is ready
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          y: initialIndex * ROW_HEIGHT,
          animated: false,
        });
      });
    }
  }, [visible, initialIndex]);

  const handleScroll = (e: any) => {
    const y   = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ROW_HEIGHT);
    if (idx !== lastHapticIdx.current) {
      lastHapticIdx.current = idx;
      Haptics.selectionAsync().catch(() => {});
    }
    setSelectedIndex(idx);
  };

  const handleMomentumEnd = (e: any) => {
    const y       = e.nativeEvent.contentOffset.y;
    const rawIdx  = Math.round(y / ROW_HEIGHT);
    const clamped = Math.max(
      0,
      Math.min(values.length - 1, rawIdx),
    );
    // Skip-over disabled rows by snapping to nearest enabled
    let finalIdx = clamped;
    while (
      finalIdx < values.length &&
      (values[finalIdx] < min || values[finalIdx] > max)
    ) {
      finalIdx += 1;
    }
    setSelectedIndex(finalIdx);
    scrollRef.current?.scrollTo({
      y: finalIdx * ROW_HEIGHT,
      animated: true,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-end">
        {/* Backdrop — absolute behind the sheet so it only receives taps
            outside the sheet. The sheet itself is a plain View so the
            ScrollView inside it keeps the touch responder. */}
        <Pressable
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
        />
        <View
          className="w-full bg-card rounded-t-3xl pb-6"
          style={{
            shadowColor: '#040A2A',
            shadowOpacity: 0.18,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -4 },
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2 border-b border-border/20">
            <Pressable onPress={onCancel} hitSlop={6}>
              <Text className="font-sans text-sm text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
            <Text className="font-display text-base text-foreground">
              {title}
            </Text>
            <Pressable
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                onConfirm(values[selectedIndex]);
              }}
              hitSlop={6}
            >
              <Text className="font-sans text-sm font-semibold text-primary">
                Done
              </Text>
            </Pressable>
          </View>

          {/* Wheel */}
          <View
            style={{
              height: PICKER_HEIGHT,
              position: 'relative',
              paddingTop: 8,
            }}
          >
            {/* Selection highlight band */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top:    8 + ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
                left:   24,
                right:  24,
                height: ROW_HEIGHT,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: 'rgba(35,116,77,0.2)',
                backgroundColor: 'rgba(35,116,77,0.05)',
                borderRadius: 10,
              }}
            />

            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_HEIGHT}
              decelerationRate="fast"
              onScroll={handleScroll}
              onMomentumScrollEnd={handleMomentumEnd}
              scrollEventThrottle={16}
              contentContainerStyle={{
                paddingTop:    ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
                paddingBottom: ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
              }}
            >
              {values.map((v, i) => {
                const disabled = v < min || v > max;
                const isSelected = i === selectedIndex;
                return (
                  <View
                    key={i}
                    style={{
                      height: ROW_HEIGHT,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Fraunces_700Bold',
                        fontSize: isSelected ? 22 : 18,
                        color: disabled
                          ? 'rgba(146,146,152,0.35)'
                          : isSelected
                            ? '#23744D'
                            : 'rgba(20,20,25,0.55)',
                      }}
                    >
                      {formatLabel(v)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}
