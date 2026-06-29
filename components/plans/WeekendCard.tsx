/**
 * WeekendCard — one Sat/Sun pair in the "Open weekends" view. Renders the
 * weekend's state (open / partial / away / booked), tappable open-slot chips,
 * and friends-free avatars. Tapping a chip (or an open card) routes into the
 * existing quick-plan composer with the date + slot prefilled — the same
 * non-FAB path FreeWindowCard / RecommendedCTA use. (Reframe of XPE-274.)
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Plane, CalendarCheck, Plus, Users } from 'lucide-react-native';
import { Avatar } from '@/components/primitives/Avatar';
import { PARADE_GREEN, EMBER } from '@/lib/colors';
import type { TimeSlot } from '@/types/planner';
import type { WeekendSummary, WeekendState, WeekendSlot } from '@/lib/openWeekends';

const AMBER = '#BA7517';
const GRAY = '#B4B2A9';

const ACCENT: Record<WeekendState, string> = {
  open: PARADE_GREEN,
  partial: AMBER,
  booked: GRAY,
  away: EMBER,
};

type Bucket = 'morning' | 'afternoon' | 'evening' | 'night';
const BUCKET: Record<TimeSlot, Bucket> = {
  'early-morning': 'morning',
  'late-morning': 'morning',
  'early-afternoon': 'afternoon',
  'late-afternoon': 'afternoon',
  'evening': 'evening',
  'late-night': 'night',
};

function parseLocal(d: string): Date {
  return new Date(`${d}T00:00:00`);
}

function dateRangeLabel(saturday: string, sunday: string): string {
  const sat = parseLocal(saturday);
  const sun = parseLocal(sunday);
  const sameMonth = sat.getMonth() === sun.getMonth();
  return `${format(sat, 'MMM d')} – ${sameMonth ? format(sun, 'd') : format(sun, 'MMM d')}`;
}

/** Collapse open slots into one chip per (day, day-part), keeping a concrete
 *  slot to prefill quick-plan — turns up to 12 raw slots into ≤8 tidy chips. */
function bucketChips(openSlots: WeekendSlot[]): { date: string; slot: TimeSlot; label: string }[] {
  const seen = new Set<string>();
  const out: { date: string; slot: TimeSlot; label: string }[] = [];
  for (const s of openSlots) {
    const key = `${s.date}|${BUCKET[s.slot]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const day = parseLocal(s.date).getDay() === 6 ? 'Sat' : 'Sun';
    out.push({ date: s.date, slot: s.slot, label: `${day} ${BUCKET[s.slot]}` });
  }
  return out;
}

function goToQuickPlan(date: string, slot: TimeSlot) {
  Haptics.selectionAsync();
  router.push(`/(app)/quick-plan?date=${date}&slot=${slot}`);
}

const MAX_CHIPS = 6;

export function WeekendCard({ summary }: { summary: WeekendSummary }) {
  const { state, openSlots, friends, bookedTitles, awayLocation } = summary;
  const accent = ACCENT[state];
  const interactive = state === 'open' || state === 'partial';

  const allChips = bucketChips(openSlots);
  const chips = allChips.slice(0, MAX_CHIPS);
  const extra = allChips.length - chips.length;

  const stateLine =
    state === 'open' ? 'Free all weekend'
    : state === 'partial' ? 'Some open time'
    : state === 'away' ? `Away${awayLocation ? ` · ${awayLocation}` : ''}`
    : `Booked${bookedTitles[0] ? ` · ${bookedTitles[0]}` : ''}`;

  const onCardPress = interactive
    ? () => goToQuickPlan(openSlots[0].date, openSlots[0].slot)
    : undefined;

  return (
    <Pressable
      onPress={onCardPress}
      disabled={!interactive}
      className="flex-row gap-3 bg-card rounded-2xl border border-border/20 p-3.5 mb-2.5 active:opacity-80"
      style={state === 'away' ? { backgroundColor: 'rgba(212,101,73,0.06)' } : undefined}
    >
      <View style={{ width: 4, borderRadius: 999, backgroundColor: accent }} />
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-display text-[17px] text-foreground">
            {dateRangeLabel(summary.saturday, summary.sunday)}
          </Text>
          <Text className="font-sans text-[11px] text-muted-foreground">Sat – Sun</Text>
        </View>

        <View className="flex-row items-center gap-1.5 mt-0.5">
          {state === 'away' && <Plane size={14} color={EMBER} strokeWidth={2} />}
          {state === 'booked' && <CalendarCheck size={14} color={GRAY} strokeWidth={2} />}
          <Text
            className="font-sans text-[13px] font-medium"
            style={{ color: accent === GRAY ? '#8A8579' : accent }}
            numberOfLines={1}
          >
            {stateLine}
          </Text>
        </View>

        {interactive && chips.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-2.5">
            {chips.map((c) => (
              <Pressable
                key={`${c.date}-${c.slot}`}
                onPress={() => goToQuickPlan(c.date, c.slot)}
                className="flex-row items-center gap-1 rounded-full px-2.5 py-1.5 active:opacity-70"
                style={{ backgroundColor: 'rgba(35,116,77,0.10)', borderWidth: 1, borderColor: 'rgba(35,116,77,0.20)' }}
              >
                <Plus size={12} color={PARADE_GREEN} strokeWidth={2.5} />
                <Text className="font-sans text-[12px] font-medium text-primary">{c.label}</Text>
              </Pressable>
            ))}
            {extra > 0 && (
              <View className="rounded-full px-2.5 py-1.5" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}>
                <Text className="font-sans text-[12px] text-muted-foreground">+{extra} more</Text>
              </View>
            )}
          </View>
        )}

        {state !== 'away' && friends.length > 0 && (
          <View className="flex-row items-center mt-2.5">
            <View className="flex-row">
              {friends.slice(0, 3).map((f, i) => (
                <View key={f.userId} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                  <Avatar url={f.avatarUrl} displayName={f.name} size="sm" />
                </View>
              ))}
            </View>
            <Text className="font-sans text-[12px] text-muted-foreground ml-2">
              {friends.length} {friends.length === 1 ? 'friend' : 'friends'} free
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
