import { View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { TimeWheelPicker } from '@/components/primitives/TimeWheelPicker';

export const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Full lowercase day names match what the planner store / availability
// defaults expect (see createDefaultAvailability in mapAvailability.ts).
// Using 3-letter abbrevs here silently broke the work-day mask and made
// every slot default to "free" → which collided with calendar sync data
// and caused the Home dashboard to show no overlap.
export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

// ─── Hour stepper (Work Schedule) — tap to open scroll wheel ────────────────

function formatHourLabel(h: number): string {
  const wholeHour = Math.floor(h);
  const minutes   = Math.round((h - wholeHour) * 60);
  const period    = wholeHour < 12 || wholeHour === 24 ? 'AM' : 'PM';
  const hour12    = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  const mmPadded  = minutes.toString().padStart(2, '0');
  return `${hour12}:${mmPadded} ${period}`;
}

function HourStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 23.5,
}: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  min?:     number;
  max?:     number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <View className="flex-1 flex-row items-center justify-between">
      <Text className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setPickerOpen(true);
        }}
        className="bg-primary/10 rounded-xl px-3 py-1.5 active:opacity-70"
        hitSlop={6}
      >
        <Text className="font-display text-sm text-primary font-semibold">
          {formatHourLabel(value)}
        </Text>
      </Pressable>
      <TimeWheelPicker
        visible={pickerOpen}
        value={value}
        min={min}
        max={max}
        title={`${label} time`}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(v) => {
          setPickerOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}

// ─── Work schedule block (rendered inside the Social Preferences card) ──────

export function WorkScheduleSection({
  workDays,
  workStart,
  workEnd,
  onToggleWorkDay,
  onWorkStartChange,
  onWorkEndChange,
}: {
  workDays:          string[];
  workStart:         number;
  workEnd:           number;
  onToggleWorkDay:   (key: string) => void;
  onWorkStartChange: (v: number) => void;
  onWorkEndChange:   (v: number) => void;
}) {
  return (
    <View className="px-4 py-3 border-b border-border/20">
      <Text className="font-sans text-sm font-medium text-foreground">
        Work schedule
      </Text>
      <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
        We'll block these times as busy by default.
      </Text>

      {/* Work days row */}
      <View className="flex-row gap-1.5 mt-2.5">
        {DAY_KEYS.map((key, i) => {
          const selected = workDays.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => onToggleWorkDay(key)}
              className={`flex-1 h-9 rounded-xl border items-center justify-center active:opacity-70 ${
                selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
              }`}
            >
              <Text
                className={`font-sans text-xs font-semibold ${
                  selected ? 'text-white' : 'text-foreground'
                }`}
              >
                {DAY_LABELS[i]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Hours row */}
      <View className="flex-row items-center justify-between mt-3 gap-3">
        <HourStepper
          label="Start"
          value={workStart}
          onChange={onWorkStartChange}
          max={workEnd - 1}
        />
        <View className="w-px h-8 bg-border/30" />
        <HourStepper
          label="End"
          value={workEnd}
          onChange={onWorkEndChange}
          min={workStart + 1}
        />
      </View>
    </View>
  );
}
