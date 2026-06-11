/**
 * DatePickerModal — month calendar pop-up for picking a single day.
 * Same visual language as WeekPickerModal (which selects whole weeks);
 * this one selects one date. Selected day fills parade green; today is
 * ring-outlined when not selected.
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
  isSameDay,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { PARADE_GREEN, ELEPHANT, TINT } from '@/lib/colors';
import { TC } from '@/lib/theme';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DatePickerModal({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: Date;
  /** Called with the picked day; caller closes the modal. */
  onSelect: (day: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(selected));

  // Re-center on the selected day each time the picker opens
  useEffect(() => {
    if (visible) setViewMonth(startOfMonth(selected));
  }, [visible]);

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );

  const pick = (day: Date) => {
    Haptics.selectionAsync();
    onSelect(day);
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

          {/* Day grid */}
          <View className="gap-1">
            {weeks.map((week, wi) => (
              <View key={wi} className="flex-row">
                {week.map((day) => {
                  const inMonth = isSameMonth(day, viewMonth);
                  const isSel = isSameDay(day, selected);
                  const today = isToday(day);
                  return (
                    <Pressable
                      key={day.toISOString()}
                      onPress={() => pick(day)}
                      className="flex-1 items-center py-1.5 active:opacity-70"
                    >
                      <View
                        className="w-8 h-8 rounded-full items-center justify-center"
                        style={
                          isSel
                            ? { backgroundColor: PARADE_GREEN }
                            : today
                              ? { borderWidth: 1.5, borderColor: PARADE_GREEN }
                              : undefined
                        }
                      >
                        <Text
                          className="font-sans text-sm"
                          style={{
                            color: isSel
                              ? '#FFFFFF'
                              : today
                                ? PARADE_GREEN
                                : inMonth
                                  ? TC.icon
                                  : TINT.graySolid,
                            fontFamily:
                              isSel || today ? 'Inter_600SemiBold' : 'Inter_400Regular',
                          }}
                        >
                          {format(day, 'd')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Jump back to today */}
          <Pressable
            onPress={() => pick(new Date())}
            className="rounded-xl items-center py-2.5 active:opacity-70"
            style={{ backgroundColor: TINT.primarySubtle }}
          >
            <Text className="font-sans text-sm font-semibold" style={{ color: PARADE_GREEN }}>
              Today
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
