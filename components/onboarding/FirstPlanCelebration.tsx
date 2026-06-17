/**
 * FirstPlanCelebration — global overlay that congratulates a user on creating
 * their first plan during onboarding, then sends them to Home.
 *
 * Mounted once in app/(app)/_layout.tsx so it floats above every authed
 * screen. It watches the planner store: when the celebration is armed (set by
 * onboarding's final step) and the plan count rises past the recorded
 * baseline, it plays confetti + a spring-in card, then router.replace's to the
 * Home tab. Renders nothing the rest of the time.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFirstPlanCelebration } from '@/stores/onboardingCelebration';

const { width } = Dimensions.get('window');
const CONFETTI_COLORS = ['#23744D', '#DFA53A', '#D46549', '#67B28E', '#29538B'];
const HOLD_MS = 2600; // time on screen before auto-navigating Home

export function FirstPlanCelebration() {
  const pending  = useFirstPlanCelebration((s) => s.pending);
  const baseline = useFirstPlanCelebration((s) => s.baseline);
  const clear    = useFirstPlanCelebration((s) => s.clear);
  const planCount = usePlannerStore((s) => s.plans.length);

  const [visible, setVisible] = useState(false);
  const firedRef = useRef(false);

  // Trigger once the first plan lands.
  useEffect(() => {
    if (firedRef.current) return;
    if (!pending) return;
    if (planCount <= baseline) return;
    firedRef.current = true;
    setVisible(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t = setTimeout(() => {
      clear();
      setVisible(false);
      router.replace('/(app)/(tabs)');
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [pending, planCount, baseline, clear]);

  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15,26,20,0.72)', // dark forest scrim
      }}
    >
      <ConfettiCannon
        count={180}
        origin={{ x: width / 2, y: -20 }}
        autoStart
        fadeOut
        explosionSpeed={360}
        fallSpeed={2800}
        colors={CONFETTI_COLORS}
      />

      <MotiView
        from={{ opacity: 0, scale: 0.6, translateY: 12 }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 14, stiffness: 180 }}
        style={{ alignItems: 'center', paddingHorizontal: 32 }}
      >
        <Text style={{ fontSize: 64, marginBottom: 8 }}>🎉</Text>
        <Text className="font-display text-3xl text-white text-center">
          Your first plan!
        </Text>
        <Text className="font-sans text-base text-white/80 text-center mt-3 leading-relaxed">
          Nice — it's on your calendar. This is what Parade is all about.
          Taking you home…
        </Text>
      </MotiView>
    </View>
  );
}
