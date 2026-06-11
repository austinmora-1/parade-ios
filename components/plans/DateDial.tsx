/**
 * DateDial — circular availability indicator around the day name/number.
 * Port of the PWA's DateDial: a gray track ring with a colored arc whose
 * length is the fraction of free slots (freeCount / 6), starting at 12
 * o'clock. Arc color follows day status (open → green, some → marigold,
 * busy → ember); fully-unavailable days show a dashed track instead.
 */
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { PARADE_GREEN, EMBER, MARIGOLD, ELEPHANT, tint } from '@/lib/colors';
import { TC } from '@/lib/theme';

export type DayDialStatus =
  | 'open'
  | 'mostly-open'
  | 'some'
  | 'busy'
  | 'unavailable'
  | 'unknown';

export const TOTAL_SLOTS = 6;

/** PWA dayStatus.ts logic: bucket a day by how many of its 6 slots are busy */
export function getDayStatus(
  freeCount: number,
  hasData: boolean,
): { status: DayDialStatus; fill: number } {
  if (!hasData) return { status: 'unknown', fill: 0 };
  if (freeCount === 0) return { status: 'unavailable', fill: 0 };
  const busy = TOTAL_SLOTS - freeCount;
  const fill = freeCount / TOTAL_SLOTS;
  if (busy === 0) return { status: 'open', fill };
  if (busy >= 4) return { status: 'busy', fill };
  if (busy <= 1) return { status: 'mostly-open', fill };
  return { status: 'some', fill };
}

export const DAY_STATUS_LABEL: Record<DayDialStatus, string> = {
  open: 'Open',
  'mostly-open': 'Mostly open',
  some: 'Some time',
  busy: 'Tight day',
  unavailable: 'Booked',
  unknown: 'No info',
};

const STATUS_COLOR: Record<DayDialStatus, string> = {
  open: PARADE_GREEN,
  'mostly-open': PARADE_GREEN,
  some: MARIGOLD,
  busy: EMBER,
  unavailable: tint(ELEPHANT, 0.35),
  unknown: 'transparent',
};

export function dayStatusColor(status: DayDialStatus): string {
  return STATUS_COLOR[status];
}

export function DateDial({
  status,
  fill,
  dayName,
  dayNum,
  isToday = false,
  size = 56,
}: {
  status: DayDialStatus;
  fill: number; // 0–1 fraction of free slots
  dayName: string;
  dayNum: string;
  isToday?: boolean;
  size?: number;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, fill)) * c;
  const showArc = status !== 'unavailable' && status !== 'unknown' && fill > 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tint(ELEPHANT, 0.18)}
          strokeWidth={stroke}
          strokeDasharray={status === 'unavailable' ? '2 4' : undefined}
        />
        {/* Availability arc — starts at 12 o'clock */}
        {showArc && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={STATUS_COLOR[status]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>

      {/* Day label inside the ring */}
      <View className="absolute inset-0 items-center justify-center">
        <Text
          style={{
            fontFamily: 'Fraunces_900Black',
            fontSize: size >= 60 ? 10 : 9,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: isToday ? PARADE_GREEN : ELEPHANT,
          }}
        >
          {dayName}
        </Text>
        <Text
          style={{
            fontFamily: 'Fraunces_900Black',
            fontSize: size >= 60 ? 24 : 20,
            lineHeight: size >= 60 ? 28 : 24,
            marginTop: 1,
            color: isToday ? PARADE_GREEN : TC.icon,
          }}
        >
          {dayNum}
        </Text>
      </View>
    </View>
  );
}
