/**
 * Thin wrapper around expo-haptics that honors the system Reduce Motion
 * setting per REQ-F0.4. Caches the setting once at import time and listens
 * for changes so the hot path is a single boolean check.
 */

import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

let reduceMotionEnabled = false;

AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotionEnabled = v;
  })
  .catch(() => undefined);

AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
  reduceMotionEnabled = v;
});

/** Tap-style feedback for selection / chip toggle / list item tap. */
export function selection(): void {
  if (reduceMotionEnabled) return;
  void Haptics.selectionAsync().catch(() => undefined);
}

/** Light impact, e.g. for a successful booking redirect confirmation. */
export function lightImpact(): void {
  if (reduceMotionEnabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
