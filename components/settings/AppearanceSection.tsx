/**
 * Appearance — auto shift toggle for the scheduled theme.
 *
 * Device-local (MMKV-backed via lib/theme), so it applies immediately
 * instead of going through the page's dirty-tracking Save flow.
 */
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Moon } from 'lucide-react-native';
import { SectionCard, SectionHeader, ToggleRow } from '@/components/settings/SettingsPrimitives';
import { autoShiftEnabled, setAutoShiftEnabled } from '@/lib/theme';

export function AppearanceSection() {
  const [autoShift, setAutoShift] = useState(autoShiftEnabled());

  const onToggle = (v: boolean) => {
    Haptics.selectionAsync();
    setAutoShift(v);
    setAutoShiftEnabled(v);
  };

  return (
    <SectionCard>
      <SectionHeader
        icon={<Moon size={14} color="#23744D" strokeWidth={2} />}
        label="Appearance"
      />
      <ToggleRow
        title="Auto Night Mode"
        subtitle="Switch to dark at 9pm and light at 7am, even after a manual toggle"
        value={autoShift}
        onValueChange={onToggle}
        isLast
      />
    </SectionCard>
  );
}
