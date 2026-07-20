/**
 * DatePickerModal — month calendar pop-up for picking a single day (default),
 * or a start→end date RANGE in one calendar (mode="range").
 *
 * Single mode: pass `selected` + `onSelect`; the caller closes the modal.
 * Range mode: pass `rangeStart`/`rangeEnd` + `onRangeChange`. Tap a first day
 * to set the start, then a second day to set the end — the range highlights
 * between them and `onRangeChange(start, end)` fires (the caller closes).
 * Tapping a day before the current start restarts the selection; "Done"
 * applies the pending selection (a lone start becomes a single day).
 *
 * Same visual language as WeekPickerModal. Selected/endpoint days fill parade
 * green; today is ring-outlined when not selected; in-range days get a tint.
 */
import { Modal, View, Text, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  startOfWeek,
  startOfDay,
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
  mode = 'single',
  rangeStart,
  rangeEnd,
  onRangeChange,
}: {
  visible: boolean;
  onClose: () => void;
  /** Single mode: the currently selected day. */
  selected?: Date;
  /** Single mode: called with the picked day; caller closes the modal. */
  onSelect?: (day: Date) => void;
  /** 'single' (default) picks one date; 'range' picks a start→end span. */
  mode?: 'single' | 'range';
  /** Range mode: current start of the range (seeds the pending selection). */
  rangeStart?: Date;
  /** Range mode: current end of the range. */
  rangeEnd?: Date;
  /** Range mode: called with (start, end) once both are chosen; caller closes. */
  onRangeChange?: (start: Date, end: Date) => void;
}) {
  const isRange = mode === 'range';
  const anchor = (isRange ? rangeStart : selected) ?? new Date();

  const [viewMonth, setViewMonth] = useState(startOfMonth(anchor));
  // Pending range selection (range mode only). null end = mid-selection.
  const [pendingStart, setPendingStart] = useState<Date | null>(rangeStart ?? null);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(rangeEnd ?? null);

  // Re-center + reseed the pending range each time the picker opens.
  useEffect(() => {
    if (!visible) return;
    setViewMonth(startOfMonth(anchor));
    if (isRange) {
      setPendingStart(rangeStart ?? null);
      setPendingEnd(rangeEnd ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );

  const pick = (rawDay: Date) => {
    Haptics.selectionAsync();
    const day = startOfDay(rawDay);

    if (!isRange) {
      onSelect?.(day);
      return;
    }

    // Range mode: first tap (or tap after a complete range) starts fresh;
    // a second tap sets the end (or restarts if it's before the start).
    if (!pendingStart || (pendingStart && pendingEnd)) {
      setPendingStart(day);
      setPendingEnd(null);
      return;
    }
    if (+day < +pendingStart) {
      setPendingStart(day);
      setPendingEnd(null);
      return;
    }
    setPendingEnd(day);
    onRangeChange?.(pendingStart, day);
  };

  const applyPending = () => {
    if (!pendingStart) return;
    Haptics.selectionAsync();
    onRangeChange?.(pendingStart, pendingEnd ?? pendingStart);
  };

  /** Range highlight state for a given grid day. */
  const rangeState = (day: Date) => {
    if (!isRange || !pendingStart) return { isStart: false, isEnd: false, inRange: false };
    const isStart = isSameDay(day, pendingStart);
    const isEnd = !!pendingEnd && isSameDay(day, pendingEnd);
    const inRange =
      !!pendingEnd && +day > +startOfDay(pendingStart) && +day < +startOfDay(pendingEnd);
    return { isStart, isEnd, inRange };
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
                  const today = isToday(day);
                  const { isStart, isEnd, inRange } = rangeState(day);
                  const isSel = isRange ? isStart || isEnd : isSameDay(day, selected ?? anchor);
                  const filled = isSel;
                  return (
                    <View
                      key={day.toISOString()}
                      className="flex-1 items-center"
                      // Continuous band behind in-range days (endpoints tinted too)
                      style={
                        isRange && (inRange || isStart || isEnd)
                          ? { backgroundColor: TINT.primarySubtle }
                          : undefined
                      }
                    >
                      <Pressable
                        onPress={() => pick(day)}
                        className="w-full items-center py-1.5 active:opacity-70"
                      >
                        <View
                          className="w-8 h-8 rounded-full items-center justify-center"
                          style={
                            filled
                              ? { backgroundColor: PARADE_GREEN }
                              : today
                                ? { borderWidth: 1.5, borderColor: PARADE_GREEN }
                                : undefined
                          }
                        >
                          <Text
                            className="font-sans text-sm"
                            style={{
                              color: filled
                                ? '#FFFFFF'
                                : today
                                  ? PARADE_GREEN
                                  : inMonth
                                    ? TC.icon
                                    : TINT.graySolid,
                              fontFamily:
                                filled || today ? 'Inter_600SemiBold' : 'Inter_400Regular',
                            }}
                          >
                            {format(day, 'd')}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {isRange ? (
            <View className="gap-2">
              {/* Live selection summary / next-step hint */}
              <Text className="font-sans text-[13px] text-center text-muted-foreground">
                {pendingStart && pendingEnd
                  ? `${format(pendingStart, 'MMM d')} – ${format(pendingEnd, 'MMM d')}`
                  : pendingStart
                    ? 'Select an end date'
                    : 'Select a start date'}
              </Text>
              <Pressable
                onPress={applyPending}
                disabled={!pendingStart}
                className="rounded-xl items-center py-2.5 active:opacity-70"
                style={{ backgroundColor: pendingStart ? PARADE_GREEN : TINT.grayFaint }}
              >
                <Text
                  className="font-sans text-sm font-semibold"
                  style={{ color: pendingStart ? '#FFFFFF' : ELEPHANT }}
                >
                  Done
                </Text>
              </Pressable>
            </View>
          ) : (
            /* Jump back to today */
            <Pressable
              onPress={() => pick(new Date())}
              className="rounded-xl items-center py-2.5 active:opacity-70"
              style={{ backgroundColor: TINT.primarySubtle }}
            >
              <Text className="font-sans text-sm font-semibold" style={{ color: PARADE_GREEN }}>
                Today
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
