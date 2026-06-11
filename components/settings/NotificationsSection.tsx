import { Bell } from 'lucide-react-native';
import { SectionCard, SectionHeader, ToggleRow } from '@/components/settings/SettingsPrimitives';

export function NotificationsSection({
  reminders,
  friendReq,
  planInvites,
  onTogglePlanReminders,
  onToggleFriendReq,
  onTogglePlanInvites,
}: {
  reminders:             boolean;
  friendReq:             boolean;
  planInvites:           boolean;
  onTogglePlanReminders: (v: boolean) => void;
  onToggleFriendReq:     (v: boolean) => void;
  onTogglePlanInvites:   (v: boolean) => void;
}) {
  return (
    <SectionCard>
      <SectionHeader
        icon={<Bell size={14} color="#23744D" strokeWidth={2} />}
        label="Notifications"
      />
      <ToggleRow
        title="Plan Reminders"
        subtitle="Get notified before your plans"
        value={reminders}
        onValueChange={onTogglePlanReminders}
      />
      <ToggleRow
        title="Friend Requests"
        subtitle="When someone connects with you"
        value={friendReq}
        onValueChange={onToggleFriendReq}
      />
      <ToggleRow
        title="Plan Invitations"
        subtitle="When you're invited to a plan"
        value={planInvites}
        onValueChange={onTogglePlanInvites}
        isLast
      />
    </SectionCard>
  );
}
