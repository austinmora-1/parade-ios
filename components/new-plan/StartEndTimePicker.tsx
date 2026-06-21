/**
 * StartEndTimePicker — pick a plan's start and end clock time (30-min
 * granularity) instead of a coarse time slot. The chosen start determines
 * which time slot the plan files into, and the start→end span determines
 * which slots it marks busy. Both are surfaced as live feedback.
 */
import { View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { FieldLabel } from '@/components/primitives/FieldLabel';
import { TimeWheelPicker } from '@/components/primitives/TimeWheelPicker';
import {
  SLOT_BOUNDS,
  slotForHour,
  hourToTimeString,
  getPlanSlotCoverage,
} from '@/lib/planSlotCoverage';
import { SLOT_LABEL } from '@/lib/socialSlots';
import { Clock } from 'lucide-react-native';
import { TC } from '@/lib/theme';
import type { TimeSlot } from '@/types/planner';

/** Default start/end (fractional hours) for a slot — slot start, +2h capped. */
export function defaultTimesForSlot(slot: TimeSlot): { start: number; end: number } {
  const { startHr, endHr } = SLOT_BOUNDS[slot];
  const start = Math.min(startHr, 23.5);
  const end = Math.min(start + 2, Math.min(endHr, 23.5));
  return { start, end: end > start ? end : Math.min(start + 1, 23.5) };
}

function fmt(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  const period = whole < 12 || whole === 24 ? 'AM' : 'PM';
  const h12 = whole % 12 === 0 ? 12 : whole % 12;
  return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function StartEndTimePicker({
  startHour,
  endHour,
  onChange,
}: {
  startHour: number;
  endHour: number;
  onChange: (startHour: number, endHour: number) => void;
}) {
  const [open, setOpen] = useState<null | 'start' | 'end'>(null);

  // End at/before start reads as crossing midnight (e.g. 11pm → 1am).
  const wrapsNextDay = endHour <= startHour;
  const slot = slotForHour(startHour);
  const coverage = getPlanSlotCoverage({
    timeSlot: slot,
    startTime: hourToTimeString(startHour),
    endTime: hourToTimeString(endHour),
  });
  const busySlots = coverage.map((c) => SLOT_LABEL[c.slot]);

  return (
    <View>
      <FieldLabel>Time</FieldLabel>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setOpen('start'); }}
          className="flex-1 rounded-xl border border-border/40 bg-card px-3.5 py-3 active:opacity-70"
        >
          <Text className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
            Starts
          </Text>
          <Text className="font-sans text-base font-semibold text-foreground mt-0.5">
            {fmt(startHour)}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setOpen('end'); }}
          className="flex-1 rounded-xl border border-border/40 bg-card px-3.5 py-3 active:opacity-70"
        >
          <Text className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
            Ends{wrapsNextDay ? ' (next day)' : ''}
          </Text>
          <Text className="font-sans text-base font-semibold text-foreground mt-0.5">
            {fmt(endHour)}
          </Text>
        </Pressable>
      </View>

      {/* Live feedback: which slot it files into / shows busy in */}
      <View className="flex-row items-center gap-1.5 mt-2">
        <Clock size={12} color={TC.icon} strokeWidth={2} />
        <Text className="font-sans text-[11px] text-muted-foreground">
          {busySlots.length > 1
            ? `Marks you busy across ${busySlots.join(', ')}`
            : `Files into ${SLOT_LABEL[slot]} · marks you busy there`}
        </Text>
      </View>

      <TimeWheelPicker
        visible={open === 'start'}
        value={startHour}
        title="Start time"
        onCancel={() => setOpen(null)}
        onConfirm={(v) => {
          // Keep end after start within the same day; preserve an explicit
          // overnight span only when the user set one.
          let end = endHour;
          if (endHour <= startHour) {
            // was overnight — shift to preserve the same duration
            const dur = endHour + 24 - startHour;
            end = (v + dur) % 24;
          } else if (v >= endHour) {
            end = Math.min(v + 1, 23.5);
          }
          onChange(v, end);
          setOpen(null);
        }}
      />
      <TimeWheelPicker
        visible={open === 'end'}
        value={endHour}
        title="End time"
        onCancel={() => setOpen(null)}
        onConfirm={(v) => {
          onChange(startHour, v);
          setOpen(null);
        }}
      />
    </View>
  );
}
