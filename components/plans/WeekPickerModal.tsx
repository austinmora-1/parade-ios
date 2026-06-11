/**
 * WeekPickerModal — month calendar for jumping the Plans page to a
 * specific week. Tapping any day selects the whole Mon–Sun week it
 * belongs to; the currently displayed week is highlighted.
 */
import { Modal, View, Text, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isSameWeek,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { PARADE_GREEN, ELEPHANT, TINT } from '@/lib/colors';
import { TC } from '@/lib/theme';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WeekPickerModal({
  visible,
  onClose,
  selectedWeekStart,
  onSelectWeek,
}: {
  visible: boolean;
  onClose: () => void;
  /** Monday of the week currently shown on the Plans page */
  selectedWeekStart: Date;
  onSelectWeek: (weekStart: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(selectedWeekStart));

  // Re-center on the displayed week each time the picker opens
  useEffect(() => {
    if (visible) setViewMonth(startOfMonth(selectedWeekStart));
  }, [visible]);

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );

  const pickWeek = (day: Date) => {
    Haptics.selectionAsync();
    onSelectWeek(startOfWeek(day, { weekStartsOn: 1 }));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-center px-6" onPress={onClose}>
        {/* Card — swallow taps so the backdrop close doesn't fire */}
        <Pressable className="bg-card rounded-2xl p-4 gap-3" onPress={() => {}}>
          {/* Month header */}
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => setViewMonth((m) => addMonths(m, -1))}
              hitSlop={8}
              className="w-9 h-9 items-center justify-center rounded-full active:opacity-60"
            >
              <ChevronLeft size={18} color={TC.icon} strokeWidth={2} />
            </Pressable>
            <Text className="font-display text-base text-foreground">
              {format(viewMonth, 'MMMM yyyy')}
            </Text>
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={() => setViewMonth((m) => addMonths(m, 1))}
                hitSlop={8}
                className="w-9 h-9 items-center justify-center rounded-full active:opacity-60"
              >
                <ChevronRight size={18} color={TC.icon} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                className="w-9 h-9 items-center justify-center rounded-full active:opacity-60"
              >
                <X size={18} color={ELEPHANT} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          {/* Weekday initials */}
          <View className="flex-row">
            {WEEKDAY_INITIALS.map((d, i) => (
              <View key={i} className="flex-1 items-center">
                <Text className="font-sans text-[11px] font-semibold text-muted-foreground">
                  {d}
                </Text>
              </View>
            ))}
          </View>

          {/* Week rows — tapping anywhere in a row selects that week */}
          <View className="gap-1">
            {weeks.map((week, wi) => {
              const selected = isSameWeek(week[0], selectedWeekStart, { weekStartsOn: 1 });
              return (
                <Pressable
                  key={wi}
                  onPress={() => pickWeek(week[0])}
                  className="flex-row rounded-xl active:opacity-70"
                  style={
                    selected
                      ? {
                          backgroundColor: TINT.primarySubtle,
                          borderWidth: 1,
                          borderColor: TINT.primaryBorder,
                        }
                      : { borderWidth: 1, borderColor: 'transparent' }
                  }
                >
                  {week.map((day) => {
                    const inMonth = isSameMonth(day, viewMonth);
                    const today = isToday(day);
                    return (
                      <View key={day.toISOString()} className="flex-1 items-center py-2">
                        <View
                          className="w-7 h-7 rounded-full items-center justify-center"
                          style={today ? { backgroundColor: PARADE_GREEN } : undefined}
                        >
                          <Text
                            className="font-sans text-sm"
                            style={{
                              color: today
                                ? '#FFFFFF'
                                : inMonth
                                  ? TC.icon
                                  : TINT.graySolid,
                              fontFamily: today ? 'Inter_600SemiBold' : 'Inter_400Regular',
                            }}
                          >
                            {format(day, 'd')}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </Pressable>
              );
            })}
          </View>

          {/* Jump back to the current week */}
          <Pressable
            onPress={() => pickWeek(new Date())}
            className="rounded-xl items-center py-2.5 active:opacity-70"
            style={{ backgroundColor: TINT.primarySubtle }}
          >
            <Text className="font-sans text-sm font-semibold" style={{ color: PARADE_GREEN }}>
              Jump to this week
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
