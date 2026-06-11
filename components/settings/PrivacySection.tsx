import { Sparkles } from 'lucide-react-native';
import { SectionCard, SectionHeader, ToggleRow } from '@/components/settings/SettingsPrimitives';

export function PrivacySection({
  showAvail,
  showLocation,
  showVibe,
  allowHang,
  onToggleShowAvail,
  onToggleShowLocation,
  onToggleShowVibe,
  onToggleAllowHang,
}: {
  showAvail:            boolean;
  showLocation:         boolean;
  showVibe:             boolean;
  allowHang:            boolean;
  onToggleShowAvail:    (v: boolean) => void;
  onToggleShowLocation: (v: boolean) => void;
  onToggleShowVibe:     (v: boolean) => void;
  onToggleAllowHang:    (v: boolean) => void;
}) {
  return (
    <SectionCard>
      <SectionHeader
        icon={<Sparkles size={14} color="#23744D" strokeWidth={2} />}
        label="Sharing & Privacy"
      />
      <ToggleRow
        title="Show Availability"
        subtitle="Friends can see your free slots"
        value={showAvail}
        onValueChange={onToggleShowAvail}
      />
      <ToggleRow
        title="Show Location"
        subtitle="Friends can see your home base + current city"
        value={showLocation}
        onValueChange={onToggleShowLocation}
      />
      <ToggleRow
        title="Show Vibe"
        subtitle="Friends can see your current vibe + weekly intentions"
        value={showVibe}
        onValueChange={onToggleShowVibe}
      />
      <ToggleRow
        title="Allow Pings From All Friends"
        subtitle="Off → only your close friends can ping you for hangouts"
        value={allowHang}
        onValueChange={onToggleAllowHang}
        isLast
      />
    </SectionCard>
  );
}
