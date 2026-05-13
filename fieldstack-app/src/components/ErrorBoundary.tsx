import * as Clipboard from "expo-clipboard";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Linking, Text as RNText, StyleSheet, View } from "react-native";

import { borderRadius, fontFamily, fontSize, fontWeight, spacing } from "../theme/tokens";

import { Button } from "./Button";

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
};

const DEFAULT_CONTACT = "support@fieldstack.app";

/**
 * Top-level crash guard. Without this, a thrown render error white-screens
 * the entire app — every other screen unreachable. Catching at the root
 * keeps the user one tap away from a reload and gives us a paper trail to
 * triage from.
 *
 * React Native's recovery story for class-based ErrorBoundary is the same
 * as web: setState back to a non-error tree to "reload" the subtree. A full
 * native re-launch needs DevSettings/Updates which aren't worth the dep
 * here — the reset button is enough for the typical transient render bug.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Replace with a real crash reporter (Sentry, Expo Updates' Crashlytics
    // bridge, etc.) when one lands. Log the structured error for now so it
    // shows up in Metro and in dev-tooling.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  private reset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  private contact = async () => {
    const { error, errorInfo } = this.state;
    const subject = "FieldStack crash report";
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
    } catch {
      // Fallback: copy to clipboard so the user can paste it somewhere.
      await Clipboard.setStringAsync(body).catch(() => undefined);
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    // Intentionally not using the themed Text/View components — those are
    // the most likely culprits of a render crash, and the fallback has to
    // work without them. Inline styles only, no theme context.
    return (
      <View style={styles.root}>
        <View style={styles.container}>
          <RNText style={styles.title}>Something went wrong</RNText>
          <RNText style={styles.body}>
            The app hit an unexpected error. Try reloading; if it keeps
            happening, let us know.
          </RNText>
          {__DEV__ ? (
            <RNText style={styles.errorDev} numberOfLines={6}>
              {this.state.error.message}
            </RNText>
          ) : null}
          <View style={styles.actions}>
            <Button label="Reload" onPress={this.reset} />
            <Button label="Email us" variant="secondary" onPress={this.contact} />
          </View>
        </View>
      </View>
    );
  }
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
});
