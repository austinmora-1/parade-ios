/**
 * DateDial — circular availability indicator around the day name/number.
 * Port of the PWA's DateDial: a gray track ring with a colored arc whose
 * length is the fraction of free slots (freeCount / 6), starting at 12
 * o'clock. Arc color follows day status (open → green, some → marigold,
 * busy → ember); fully-unavailable days show a dashed track instead.
 */
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { PARADE_GREEN, MINT, EMBER, MARIGOLD, ELEPHANT, tint, TINT } from '@/lib/colors';
import { TC } from '@/lib/theme';
import { TIME_SLOT_HOURS } from '@/stores/helpers/mapAvailability';
import { getPlanSlotCoverage } from '@/lib/planSlotCoverage';
import type { DefaultAvailabilitySettings } from '@/stores/helpers/types';
import type { DayAvailability, TimeSlot } from '@/types/planner';

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
  // Strict three-color wheel: green (open) / yellow (filling) / coral
  // (away only) — no separate amber tier (XPE-288).
  busy: MARIGOLD,
  unavailable: tint(ELEPHANT, 0.35),
  unknown: 'transparent',
};

export function dayStatusColor(status: DayDialStatus): string {
  return STATUS_COLOR[status];
}

// ─── Standardized day wheel ───────────────────────────────────────────────────

const ALL_SLOTS: TimeSlot[] = [
  'early-morning', 'late-morning', 'early-afternoon',
  'late-afternoon', 'evening', 'late-night',
];

/** Pill palettes for each wheel state */
const PILL = {
  open:   { bg: TINT.primaryBorder,   text: '#1A5C3A' },
  mostly: { bg: tint(MINT, 0.2),      text: '#2F7D57' },
  some:   { bg: TINT.amberSubtle,     text: '#92400E' },
  /** Coral — reserved exclusively for the away override (XPE-288) */
  tight:  { bg: TINT.secondarySubtle, text: '#D46549' },
  gray:   { bg: TINT.grayFaint,       text: '#6E6E74' },
} as const;

export interface DayWheel {
  status: DayDialStatus;            // 'open' | 'some' | 'unavailable'
  fill: number;                     // arc fraction = FREE share of capacity
  /** Arc color escalates as the day fills: green → yellow → red */
  arcColor: string;
  label: string;                    // pill copy
  pill: { bg: string; text: string };
  free: number;                     // free social slots
  total: number;                    // social slot capacity for the day
}

/**
 * Standardized wheel semantics, consistent across weeks:
 *  - Social days come from settings (profiles.preferred_social_days). No
 *    preference set = every day is socially available.
 *  - A non-social day with no explicit availability → gray dotted
 *    "Not available". Explicitly setting availability on it overrides.
 *  - A social day is judged on its SOCIAL slots (all six, minus work-hour
 *    slots on work days): all free = full green; some busy = partial
 *    yellow arc sized by slots taken; all busy = gray dotted "Booked".
 *  - Trip days → traveling but available: trips are a location change only
 *    and never block slots; only the work schedule, social preferences,
 *    explicit toggles, and actual plans mark slots busy.
 */
export interface DayWheelInput {
  date: Date;
  dayAvail?: DayAvailability;
  settings?: DefaultAvailabilitySettings | null;
  /** Plans on this date. timeSlot is kebab-case; startTime/endTime are
   *  optional "HH:mm" clock times that expand the busy span across slots. */
  dayPlans: Array<{ timeSlot?: string | null; startTime?: string | null; endTime?: string | null }>;
  /** @deprecated Trips no longer block availability; ignored. */
  onTrip?: boolean;
  /** True when the user is away from their home city this day — recolors
   *  free time coral instead of parade green. */
  away?: boolean;
}

export interface DaySlotAvailability {
  /** Day is gated off — non-social day with no explicit availability */
  notAvailable: boolean;
  /** The day's social capacity (all 6 slots minus work-hour slots) */
  socialSlots: TimeSlot[];
  /** Social slots currently free, in chronological order */
  freeSlots: TimeSlot[];
}

/** Plan statuses that actually take a slot — mirrors plansStore's
 *  BLOCKING_STATUSES. Cancelled plans and invites you declined don't
 *  count against the wheel. */
const BLOCKING_PLAN_STATUSES = new Set(['confirmed', 'tentative', 'proposed']);

export function planBlocksAvailability(p: {
  status?: string | null;
  myRsvpStatus?: string | null;
}): boolean {
  if (p.status && !BLOCKING_PLAN_STATUSES.has(p.status)) return false;
  if (p.myRsvpStatus === 'declined') return false;
  return true;
}

/**
 * Per-slot resolution behind the day wheel — also drives the Plans tab
 * CTA so "free window" and the wheel can never disagree.
 */
export function getDaySlotAvailability({
  date,
  dayAvail,
  settings,
  dayPlans,
}: DayWheelInput): DaySlotAvailability {
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  const isWorkDay = settings?.workDays?.includes(dayName) ?? false;

  const workBlocked = new Set<TimeSlot>();
  if (isWorkDay && settings) {
    for (const [slot, hours] of Object.entries(TIME_SLOT_HOURS)) {
      if (hours.start < settings.workEndHour && hours.end > settings.workStartHour) {
        workBlocked.add(slot as TimeSlot);
      }
    }
  }
  const socialSlots = isWorkDay
    ? ALL_SLOTS.filter((s) => !workBlocked.has(s))
    : [...ALL_SLOTS];

  // Social days from settings — empty preference = all days social
  const socialDays = settings?.socialDays ?? [];
  const isSocialDay = socialDays.length === 0 || socialDays.includes(dayName);
  const isExplicit = !!dayAvail && dayAvail.isDefault === false;

  // Non-social day (and the user hasn't explicitly set availability on it,
  // which overrides the preference) → not available. Same when work hours
  // swallow every slot.
  if ((!isSocialDay && !isExplicit) || socialSlots.length === 0) {
    return { notAvailable: true, socialSlots, freeSlots: [] };
  }

  // A plan blocks every slot its start→end span covers (falling back to its
  // stored time_slot when it has no explicit clock times) — same coverage the
  // store uses to mark availability busy, so the wheel can't disagree.
  const planBusy = new Set<string>();
  for (const p of dayPlans) {
    const slot = (p.timeSlot ?? '').replace(/_/g, '-') as TimeSlot;
    for (const c of getPlanSlotCoverage({ timeSlot: slot, startTime: p.startTime, endTime: p.endTime })) {
      planBusy.add(c.slot);
    }
  }
  const slotFree = (s: TimeSlot): boolean => {
    if (planBusy.has(s)) return false;
    return dayAvail ? !!dayAvail.slots[s] : true;
  };

  return {
    notAvailable: false,
    socialSlots,
    freeSlots: socialSlots.filter(slotFree),
  };
}

export function computeDayWheel(input: DayWheelInput): DayWheel {
  const { notAvailable, socialSlots, freeSlots } = getDaySlotAvailability(input);
  const total = socialSlots.length;
  const free = freeSlots.length;

  if (notAvailable) {
    return {
      status: 'unavailable', fill: 0, arcColor: 'transparent',
      label: 'Not available', pill: PILL.gray,
      free: 0, total,
    };
  }

  // Arc always shows the FREE share of capacity (gray track = taken).
  // Strict three-color scheme (XPE-288): green = open/mostly open,
  // yellow = some time/almost booked, gray = fully booked ("Booked"
  // renders as the bare gray track). Coral is reserved for the away
  // override below.
  const taken = total - free;
  const fill = total > 0 ? free / total : 0;

  if (free === 0) {
    return {
      status: 'unavailable', fill: 0, arcColor: 'transparent',
      label: 'Booked', pill: PILL.gray, free, total,
    };
  }
  // Base color/label by how full the day is.
  let result: DayWheel;
  if (taken === 0) {
    result = { status: 'open', fill: 1, arcColor: PARADE_GREEN, label: 'Open', pill: PILL.open, free, total };
  } else if (free === 1) {
    result = { status: 'some', fill, arcColor: MARIGOLD, label: 'Almost booked', pill: PILL.some, free, total };
  } else if (taken < total / 2) {
    result = { status: 'some', fill, arcColor: PARADE_GREEN, label: 'Mostly open', pill: PILL.mostly, free, total };
  } else {
    result = { status: 'some', fill, arcColor: MARIGOLD, label: 'Some time', pill: PILL.some, free, total };
  }

  // Away override: free time while out of town reads coral, not green, and
  // the label calls out that you're away.
  if (input.away) {
    result = {
      ...result,
      arcColor: EMBER,
      pill: PILL.tight,
      label: result.label === 'Almost booked' ? 'Almost booked · away' : `${result.label} · away`,
    };
  }

  return result;
}

export function DateDial({
  status,
  fill,
  dayName,
  dayNum,
  isToday = false,
  size = 56,
  arcColor,
}: {
  status: DayDialStatus;
  fill: number; // 0–1 fraction of free slots
  dayName: string;
  dayNum: string;
  isToday?: boolean;
  size?: number;
  /** Overrides the status-derived arc color (green/yellow/red escalation) */
  arcColor?: string;
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
            stroke={arcColor ?? STATUS_COLOR[status]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>

      {/* Day label inside the ring — compact sizes drop the day name */}
      <View className="absolute inset-0 items-center justify-center">
        {size >= 44 && dayName ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              fontFamily: 'Fraunces_900Black',
              fontSize: size >= 60 ? 10 : 9,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: isToday ? PARADE_GREEN : ELEPHANT,
              maxWidth: size - stroke * 2 - 6,
            }}
          >
            {dayName}
          </Text>
        ) : null}
        <Text
          style={{
            fontFamily: 'Fraunces_900Black',
            fontSize: size < 44 ? 12 : size >= 60 ? 24 : 20,
            lineHeight: size < 44 ? 14 : size >= 60 ? 28 : 24,
            marginTop: size < 44 ? 0 : 1,
            color: isToday ? PARADE_GREEN : TC.icon,
          }}
        >
          {dayNum}
        </Text>
      </View>
    </View>
  );
}
