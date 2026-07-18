/**
 * PlanDetailsCard — Date / Time / Where / People rows for the plan detail
 * screen. Pure presentation; receives the loaded plan row.
 */
import { View, Text } from 'react-native';
import { Calendar, Clock, MapPin, Users } from 'lucide-react-native';
import { format } from 'date-fns';

const SLOT_LABELS: Record<string, string> = {
  early_morning:    'Early morning',
  late_morning:     'Late morning',
  early_afternoon:  'Afternoon',
  late_afternoon:   'Late afternoon',
  evening:          'Evening',
  late_night:       'Late night',
};

/** Format a stored "HH:mm[:ss]" clock string as "3:40 PM". Null if invalid. */
function formatClockTime(value?: string | null): string | null {
  if (!value) return null;
  const [h, m] = value.split(':');
  const hour = Number(h);
  const minute = Number(m ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return format(d, 'h:mm a');
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center px-4 py-3.5 gap-3">
      {icon}
      <Text className="font-sans text-xs text-muted-foreground w-16 uppercase tracking-wide">
        {label}
      </Text>
      <Text className="font-sans text-sm text-foreground font-medium flex-1">
        {children as string}
      </Text>
    </View>
  );
}

export function PlanDetailsCard({
  plan,
  participantCount,
}: {
  plan: any;
  participantCount: number;
}) {
  const startTime = formatClockTime(plan.start_time);
  const endTime = formatClockTime(plan.end_time);

  return (
    <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
      <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Date">
        {format(new Date(plan.date), 'EEE, MMM d, yyyy')}
      </DetailRow>
      <View className="h-px bg-border/30 mx-4" />

      {/* One Time row: exact clock times win over the coarse slot label (XPE-308) */}
      {(startTime && endTime) || plan.time_slot ? (
        <>
          <DetailRow icon={<Clock size={15} color="#929298" strokeWidth={1.75} />} label="Time">
            {startTime && endTime
              ? `${startTime} – ${endTime}`
              : SLOT_LABELS[plan.time_slot] ?? plan.time_slot}
          </DetailRow>
          <View className="h-px bg-border/30 mx-4" />
        </>
      ) : null}

      {plan.location && (
        <>
          <DetailRow icon={<MapPin size={15} color="#929298" strokeWidth={1.75} />} label="Where">
            {plan.location}
          </DetailRow>
          <View className="h-px bg-border/30 mx-4" />
        </>
      )}

      <DetailRow icon={<Users size={15} color="#929298" strokeWidth={1.75} />} label="People">
        {participantCount + 1} going
      </DetailRow>
    </View>
  );
}
