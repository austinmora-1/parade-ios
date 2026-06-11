import { View, type ViewStyle } from 'react-native';
import { Check } from 'lucide-react-native';
import { PARADE_GREEN, TINT } from '@/lib/colors';

/**
 * Green check indicator used in selection lists/grids (find-time WhoStep &
 * WhenStep, new-plan FriendSelector). Filled green with a white check when
 * checked; outlined and empty otherwise.
 */
export function CheckCircle({
  checked,
  size = 20,
  radius,
  borderWidth = 1.5,
  borderColor,
  checkSize = 13,
  checkStrokeWidth = 2.5,
  style,
}: {
  checked: boolean;
  size?: number;
  /** Corner radius — defaults to a full circle. */
  radius?: number;
  borderWidth?: number;
  /** Border override — defaults to green when checked, gray when not. */
  borderColor?: string;
  checkSize?: number;
  checkStrokeWidth?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius ?? size / 2,
          borderWidth,
          borderColor: borderColor ?? (checked ? PARADE_GREEN : TINT.grayStrong),
          backgroundColor: checked ? PARADE_GREEN : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {checked && <Check size={checkSize} color="#FFFFFF" strokeWidth={checkStrokeWidth} />}
    </View>
  );
}
