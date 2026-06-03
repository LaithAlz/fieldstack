import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Linking, Pressable, Text as RNText, StyleSheet, View } from "react-native";

import { borderRadius, fontFamily, fontSize, fontWeight, spacing } from "../theme/tokens";

type Props = {
  children: ReactNode;
  /**
   * Override the contact destination. Defaults to a mailto: that pre-fills
   * the error details so users can report consistently.
   */
  contactEmail?: string;
};

type State = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** Number of consecutive resets that ended in another crash. */
  resetCount: number;
  /** Latest user-visible status under the buttons (e.g. clipboard fallback). */
  feedback: string | null;
};

const DEFAULT_CONTACT = "support@onside.app";
// After this many failed reloads we stop offering a plain reload and route
// the user to a wipe path — the underlying state is almost certainly broken.
const STUCK_THRESHOLD = 2;

/**
 * Top-level crash guard. Without this, a thrown render error white-screens
 * the entire app — every other screen unreachable. Catching at the root
 * keeps the user one tap away from a reload and gives us a paper trail.
 *
 * The fallback deliberately avoids every themed / context-aware component
 * (Text, Button, useTheme) — if the boundary fires from a theme-layer crash,
 * those would re-throw and produce the white screen we tried to prevent.
 * Inline styles + raw RN Text/Pressable only.
 *
 * After STUCK_THRESHOLD consecutive resets that immediately re-crash, the
 * Reload button switches to a "Clear app data" path that wipes AsyncStorage —
 * the realistic recovery when a corrupted persisted blob is feeding the crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null, resetCount: 0, feedback: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Replace with a real crash reporter (Sentry, Expo Updates' Crashlytics
    // bridge, etc.) when one lands. Log the structured error for now so it
    // shows up in Metro and in dev-tooling.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
    this.setState((prev) => ({
      errorInfo,
      // If we're entering an error state again right after a reset, treat it
      // as a stuck loop. We can't tell precisely "did reset just happen?" but
      // any catch while resetCount > 0 implies the prior reset didn't help.
      resetCount: prev.resetCount,
    }));
  }

  private reset = () => {
    this.setState((prev) => ({
      error: null,
      errorInfo: null,
      resetCount: prev.resetCount + 1,
      feedback: null,
    }));
  };

  private wipeAndReset = async () => {
    try {
      await AsyncStorage.clear();
    } catch {
      // Best-effort; even partial wipe should unstick most cases.
    }
    this.setState({ error: null, errorInfo: null, resetCount: 0, feedback: null });
  };

  private contact = async () => {
    const { error, errorInfo } = this.state;
    const subject = "Onside crash report";
    const body = [
      "Hi,",
      "",
      "I hit a crash in the app. Details below.",
      "",
      `Error: ${error?.message ?? "(unknown)"}`,
      "",
      "Stack:",
      error?.stack ?? "(no stack)",
      "",
      "Component stack:",
      errorInfo?.componentStack ?? "(none)",
    ].join("\n");
    const email = this.props.contactEmail ?? DEFAULT_CONTACT;
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      this.setState({ feedback: null });
    } catch {
      // No mail client — copy the error to the clipboard so the user has
      // something they can paste somewhere, with explicit feedback.
      await Clipboard.setStringAsync(body).catch(() => undefined);
      this.setState({ feedback: "Error copied to clipboard." });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    const stuck = this.state.resetCount >= STUCK_THRESHOLD;

    return (
      <View style={styles.root}>
        <View style={styles.container}>
          <RNText style={styles.title}>Something went wrong</RNText>
          <RNText style={styles.body}>
            {stuck
              ? "The app is stuck on a crash. Clearing local data usually fixes it — you'll need to set your area + preferences again."
              : "The app hit an unexpected error. Try reloading; if it keeps happening, let us know."}
          </RNText>
          {__DEV__ ? (
            <RNText style={styles.errorDev} numberOfLines={6}>
              {this.state.error.message}
            </RNText>
          ) : null}
          <View style={styles.actions}>
            {stuck ? (
              <FallbackButton
                label="Clear app data"
                onPress={this.wipeAndReset}
                primary
              />
            ) : (
              <FallbackButton label="Reload" onPress={this.reset} primary />
            )}
            <FallbackButton label="Email us" onPress={this.contact} />
          </View>
          {this.state.feedback ? (
            <RNText style={styles.feedback}>{this.state.feedback}</RNText>
          ) : null}
        </View>
      </View>
    );
  }
}

// Theme-free button — Pressable + RN Text only. The themed Button calls
// useTheme(), which would re-throw if the crash root is in the theme layer.
function FallbackButton({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        primary ? styles.btnPrimary : styles.btnSecondary,
        pressed && { opacity: 0.85 },
      ]}
    >
      <RNText
        style={[
          styles.btnLabel,
          { color: primary ? "#FFFFFF" : "#18181B" },
        ]}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  container: {
    width: "100%",
    maxWidth: 360,
    gap: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: "#18181B",
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: "#52525B",
    lineHeight: fontSize.md * 1.5,
  },
  errorDev: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: "#A1A1AA",
    padding: spacing.md,
    backgroundColor: "#F4F4F5",
    borderRadius: borderRadius.md,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: "#15803D", // green-700, matches brand light
  },
  btnSecondary: {
    backgroundColor: "#F4F4F5", // zinc-100
  },
  btnLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  feedback: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: "#52525B",
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
