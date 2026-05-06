import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, type DimensionValue, StyleSheet } from "react-native";

import { borderRadius as radii } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

type Props = {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
};

const PULSE_DURATION_MS = 900;
const PULSE_LOW = 0.4;
const PULSE_HIGH = 1;

/**
 * Loading placeholder with a subtle opacity pulse. Honors the system's
 * Reduce Motion setting (REQ-F0.1) by rendering a static dim block instead.
 */
export function Skeleton({ width, height, borderRadius = radii.md }: Props) {
  const colors = useTheme();
  const opacity = useRef(new Animated.Value(PULSE_HIGH)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });

    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(PULSE_LOW + (PULSE_HIGH - PULSE_LOW) / 2);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: PULSE_LOW,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: PULSE_HIGH,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      // Decorative — screen readers should ignore.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surfaceSecondary,
          opacity,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
