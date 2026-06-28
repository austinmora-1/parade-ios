/**
 * PlanCreatedConfetti — one-shot confetti burst shown when a user lands on a
 * freshly-created plan (find-time navigates to /plan/[id]?celebrate=1). The
 * "statement" creation moment for XPE-243.
 *
 * Self-contained: plays once on mount when `active`, then renders nothing.
 * No scrim, no navigation; pointerEvents="none" so the plan stays interactive.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Dimensions } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const COLORS = ['#23744D', '#DFA53A', '#D46549', '#67B28E', '#29538B'];

export function PlanCreatedConfetti({ active }: { active: boolean }) {
  const [show, setShow] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current) return;
    firedRef.current = true;
    setShow(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(t);
  }, [active]);

  if (!show) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <ConfettiCannon
        count={140}
        origin={{ x: width / 2, y: -20 }}
        autoStart
        fadeOut
        explosionSpeed={350}
        fallSpeed={2800}
        colors={COLORS}
      />
    </View>
  );
}
