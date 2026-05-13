import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../lib/auth";
import type { MeStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, fontFamily, fontSize, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Nav = NativeStackNavigationProp<MeStackParamList, "SignIn">;
type Mode = "signin" | "signup";

const MIN_PASSWORD = 6;

/**
 * Combined sign-in / sign-up screen. Tab toggle at the top switches between
 * the two modes — same form fields, different submit handler. After a
 * successful sign-in, AuthProvider's onAuthStateChange will update the user
 * session and downstream screens (Profile, Settings) re-render to reflect it.
 *
 * Apple + Google OAuth land in follow-up PRs once the Supabase dashboard +
 * EAS build prerequisites are configured.
 */
export function SignInScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const { signIn, signUp, busy } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!isLikelyEmail(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    const result =
      mode === "signin"
        ? await signIn(trimmedEmail, password)
        : await signUp(trimmedEmail, password);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (mode === "signup") {
      // Supabase's default project setting is "email confirmation required" —
      // we don't know the project state here, so cover both cases with a
      // toast that's accurate either way.
      toast.show(
        "Account created. Check your inbox if email confirmation is required.",
        { type: "success" }
      );
    } else {
      toast.show("Signed in.", { type: "success" });
    }
    nav.goBack();
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => nav.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={spacing.sm}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text size="xxl" weight="bold" accessibilityRole="header" style={styles.title}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </Text>
        <Text size="sm" variant="secondary" style={styles.subtitle}>
          {mode === "signin"
            ? "Sign in to sync your saved venues, preferred time, and history across devices."
            : "Create an account so your saves and preferences travel with you."}
        </Text>

        {/* Mode toggle */}
        <View
          style={[
            styles.tabs,
            { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
          ]}
          accessibilityRole="tablist"
        >
          <Tab
            label="Sign in"
            active={mode === "signin"}
            onPress={() => switchMode("signin")}
          />
          <Tab
            label="Sign up"
            active={mode === "signup"}
            onPress={() => switchMode("signup")}
          />
        </View>

        {/* Fields */}
        <View style={styles.field}>
          <Text size="sm" variant="secondary" weight="medium" style={styles.fieldLabel}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabel="Email"
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceSecondary,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
          />
        </View>

        <View style={styles.field}>
          <Text size="sm" variant="secondary" weight="medium" style={styles.fieldLabel}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={`At least ${MIN_PASSWORD} characters`}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={mode === "signin" ? "password" : "newPassword"}
            accessibilityLabel="Password"
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceSecondary,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
          />
        </View>

        {error ? (
          <Text
            size="sm"
            variant="danger"
            style={styles.errorText}
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        ) : null}

        <View style={styles.cta}>
          <Button
            label={mode === "signin" ? "Sign in" : "Create account"}
            onPress={handleSubmit}
            loading={busy}
            accessibilityHint={
              mode === "signin"
                ? "Sign in with your email and password"
                : "Create a new account"
            }
          />
        </View>

        <Text size="xs" variant="tertiary" style={styles.legal}>
          By {mode === "signin" ? "signing in" : "creating an account"} you agree to
          our Terms and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.tab,
        {
          backgroundColor: active ? colors.surface : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        size="sm"
        weight={active ? "bold" : "medium"}
        style={active ? undefined : { color: colors.textSecondary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function isLikelyEmail(value: string): boolean {
  // Intentionally permissive — Supabase validates server-side. We only want
  // to catch obvious typos before the round-trip.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexGrow: 1,
  },
  title: {
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  tabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  errorText: {
    marginBottom: spacing.sm,
  },
  cta: {
    marginTop: spacing.sm,
  },
  legal: {
    textAlign: "center",
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
});
