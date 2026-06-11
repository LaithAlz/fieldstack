import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated } from "react-native";

type Props = {
  /** Stagger offset in ms — typically index * 50 for list entrances. */
  delay?: number;
  children: React.ReactNode;
};

/**
 * One-shot mount animation: fades in while drifting up 12pt. Used for
 * staggered list entrances. JS-driver Animated only — no Reanimated, so it's
 * safe anywhere (including screens that host MapView, where Reanimated's
 * native-thread commits crash the Fabric interop layer — see MapViewScreen).
 *
 * Respects Reduce Motion: when enabled, content renders immediately with no
 * drift or fade.
 */
export function FadeInUp({ delay = 0, children }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          opacity.setValue(1);
          translateY.setValue(0);
          return;
        }
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 280,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 280,
            delay,
            useNativeDriver: true,
          }),
        ]).start();
      })
      .catch(() => {
        // Can't read the setting — just show the content.
        opacity.setValue(1);
        translateY.setValue(0);
      });
    return () => {
      cancelled = true;
    };
  }, [opacity, translateY, delay]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
