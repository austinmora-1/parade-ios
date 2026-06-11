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
  return (
    <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
      <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Date">
        {format(new Date(plan.date), 'EEE, MMM d, yyyy')}
      </DetailRow>
      <View className="h-px bg-border/30 mx-4" />

      {plan.time_slot && (
        <>
          <DetailRow icon={<Clock size={15} color="#929298" strokeWidth={1.75} />} label="Time">
            {SLOT_LABELS[plan.time_slot] ?? plan.time_slot}
          </DetailRow>
          <View className="h-px bg-border/30 mx-4" />
        </>
      )}

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
