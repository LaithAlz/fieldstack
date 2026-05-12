import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { StepDots } from "./StepDots";

type Props = {
  step: number;
  totalSteps: number;
  /** Called when the user taps the top-right Skip link. Omit to hide it. */
  onSkip?: () => void;
  /** Hero block — typically an icon disc or illustration. */
  hero: ReactNode;
  title: string;
  body: string;
  /** Additional content rendered between the body copy and the footer. */
  children?: ReactNode;
  /** Persistent footer — primary CTA + optional secondary action. */
  footer: ReactNode;
};

const TOP_BAR_HEIGHT = 56;

/**
 * Common shell for every onboarding screen. Keeps spacing, hierarchy, and
 * accessibility consistent so each screen's file only owns its content.
 */
export function OnboardingScaffold({
  step,
  totalSteps,
  onSkip,
  hero,
  title,
  body,
  children,
  footer,
}: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Top bar — step dots left, optional Skip right. */}
      <View style={[styles.topBar, { paddingHorizontal: spacing.lg }]}>
        {totalSteps > 1 ? (
          <StepDots total={totalSteps} current={step} />
        ) : (
          <View />
        )}
        {onSkip ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            hitSlop={spacing.md}
          >
            <Text style={[styles.skipLabel, { color: colors.textSecondary }]}>Skip</Text>
          </Pressable>
        ) : (
          // Reserve space so step dots stay left-aligned and titles stay centered.
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.heroWrap}>{hero}</View>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
        {children ? <View style={styles.extra}>{children}</View> : null}
      </View>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.lg), paddingHorizontal: spacing.lg },
        ]}
      >
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  heroWrap: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    textAlign: "center",
    marginBottom: spacing.md,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: fontSize.lg,
    lineHeight: fontSize.lg * 1.4,
    textAlign: "center",
    maxWidth: 320,
  },
  extra: {
    marginTop: spacing.xl,
    width: "100%",
  },
  footer: {
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  skipLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
});
