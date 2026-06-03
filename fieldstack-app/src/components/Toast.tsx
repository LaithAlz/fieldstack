import { Ionicons } from "@expo/vector-icons";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, AccessibilityInfo, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderRadius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

type ToastType = "error" | "success" | "info";

type ShowOptions = {
  type?: ToastType;
  duration?: number;
};

type ToastContextValue = {
  show: (message: string, options?: ShowOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3000;
const ANIMATION_MS = 220;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>("info");
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useRef(false);

  // Refresh the cached setting at mount and on change. Using a ref so the
  // show/hide callbacks read the latest value without re-creating themselves.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotion.current = v;
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      reduceMotion.current = v;
    });
    return () => sub.remove();
  }, []);

  const hide = useCallback(() => {
    const duration = reduceMotion.current ? 0 : ANIMATION_MS;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 80, duration, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true }),
    ]).start(() => setMessage(null));
  }, [opacity, translateY]);

  const show = useCallback<ToastContextValue["show"]>(
    (text, options) => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      setMessage(text);
      setType(options?.type ?? "info");

      // Announce to screen readers — the visible toast might appear briefly.
      AccessibilityInfo.announceForAccessibility(text);

      const duration = reduceMotion.current ? 0 : ANIMATION_MS;
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
      ]).start();

      hideTimeout.current = setTimeout(hide, options?.duration ?? DEFAULT_DURATION_MS);
    },
    [hide, opacity, translateY]
  );

  useEffect(() => {
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      translateY.stopAnimation();
      opacity.stopAnimation();
    };
  }, [opacity, translateY]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message ? <ToastView message={message} type={type} translateY={translateY} opacity={opacity} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({
  message,
  type,
  translateY,
  opacity,
}: {
  message: string;
  type: ToastType;
  translateY: Animated.Value;
  opacity: Animated.Value;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const palette = {
    error: { bg: colors.danger, fg: "#FFFFFF", icon: "alert-circle" as const },
    success: { bg: colors.success, fg: "#FFFFFF", icon: "checkmark-circle" as const },
    info: { bg: colors.textPrimary, fg: colors.surface, icon: "information-circle" as const },
  }[type];

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      style={[
        styles.toast,
        {
          backgroundColor: palette.bg,
          bottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Ionicons name={palette.icon} size={20} color={palette.fg} />
      <Text style={{ color: palette.fg, marginLeft: spacing.sm }} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
