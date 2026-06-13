import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { useAuth, type AuthContact } from "../../lib/auth";
import {
  isAppleAuthAvailable,
  signInWithApple,
  signInWithGoogle,
} from "../../lib/socialAuth";
import type { MeStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, fontFamily, fontSize, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Nav = NativeStackNavigationProp<MeStackParamList, "SignIn">;
type Mode = "signin" | "signup";
type ContactMethod = "email" | "phone";

const MIN_PASSWORD = 6;
const PHONE_DIGITS_REQUIRED = 10;
const PHONE_COUNTRY_CODE = "+1"; // GTA-focused — North American numbers only for v1

const TERMS_URL = "https://onside.app/terms";
const PRIVACY_URL = "https://onside.app/privacy";

/**
 * Combined sign-in / sign-up screen. Defaults to sign-in; the user switches
 * modes via a text link in the footer ("New to Onside? Sign up"). Inside
 * the form, an Email/Phone segmented control picks contact method, and
 * sign-up additionally collects a name + a confirm-password field.
 *
 * After a successful auth, AuthProvider's onAuthStateChange propagates the
 * new session and downstream screens (Profile, Settings) re-render.
 *
 * Phone path requires Supabase's SMS provider to be configured — when it
 * isn't, the server-side error is surfaced as a friendly "use email instead"
 * message via presentAuthError.
 */
export function SignInScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const { signIn, signUp, busy } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("email");
  // Phone sign-in is wired end-to-end in this file, but the Supabase phone
  // provider isn't enabled on the project yet — every attempt would error
  // with "Phone sign-up isn't enabled". Don't offer a tab whose happy path
  // is an apology; flip this when the provider goes live.
  const PHONE_AUTH_ENABLED = false;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which social provider has a request in flight, if any — keeps the email
  // submit button independent of the social buttons' spinners.
  const [socialBusy, setSocialBusy] = useState<null | "google" | "apple">(null);
  // Apple's native button only shows on a capable iOS build (module +
  // entitlement present); hidden everywhere else.
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isAppleAuthAvailable().then((ok) => {
      if (!cancelled) setAppleAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSocial = async (provider: "google" | "apple") => {
    if (socialBusy || busy) return;
    setError(null);
    setSocialBusy(provider);
    const result =
      provider === "google" ? await signInWithGoogle() : await signInWithApple();
    setSocialBusy(null);
    if (result.cancelled) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show("Signed in.", { type: "success" });
    leaveSignIn();
  };

  /**
   * Exit the SignIn screen. If we were pushed onto an existing stack (the
   * normal "tap Sign in banner on Profile" flow), pop back. If we were
   * dispatched here cross-tab without Profile underneath (the Reviews-tab
   * sign-in CTA path), `goBack` would no-op and leave the MeTab stuck on
   * SignIn forever. Detect that and reset the stack to Profile instead.
   */
  const leaveSignIn = () => {
    // The cross-tab review CTA reaches us via
    // navigate("MeTab", { screen: "SignIn" }), which React Navigation stores
    // as `params.screen = "SignIn"` on the MeTab route. That param sticks:
    // every later tap of the Me tab re-applies it and reopens SignIn even
    // after the user is signed in. Clear it on the way out so Me always
    // resolves to Profile. (No-op on the in-stack banner path, which never
    // set the param.)
    nav.getParent()?.setParams({ screen: undefined });

    if (nav.canGoBack()) {
      nav.goBack();
      return;
    }
    nav.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Profile" }],
      })
    );
  };

  const handleSubmit = async () => {
    setError(null);

    const trimmedName = fullName.trim();
    if (mode === "signup" && trimmedName.length < 2) {
      setError("Enter your name.");
      return;
    }

    const contact = buildContact(contactMethod, email, phone);
    if (!contact) {
      setError(
        contactMethod === "email"
          ? "Enter a valid email address."
          : `Enter a ${PHONE_DIGITS_REQUIRED}-digit phone number.`
      );
      return;
    }

    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    if (mode === "signup") {
      if (confirmPassword.length === 0) {
        setError("Confirm your password.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
    }

    const result =
      mode === "signin"
        ? await signIn(contact, password)
        : await signUp(contact, password, trimmedName);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (mode === "signup") {
      const verifyHint =
        contactMethod === "email"
          ? "Check your inbox if email confirmation is required."
          : "Check your texts if phone confirmation is required.";
      toast.show(`Account created. ${verifyHint}`, { type: "success" });
    } else {
      toast.show("Signed in.", { type: "success" });
    }
    leaveSignIn();
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    // Clear confirm so a stale value can't silently match a freshly-typed
    // password on the next attempt.
    setConfirmPassword("");
  };

  const switchContactMethod = (next: ContactMethod) => {
    if (next === contactMethod) return;
    setContactMethod(next);
    setError(null);
    // Drop the inactive field's value so toggling back doesn't resurrect a
    // half-typed contact the user already abandoned.
    if (next === "email") setPhone("");
    else setEmail("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.root, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => leaveSignIn()}
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
        <Text size="xxl" weight="bold" font="display" accessibilityRole="header" style={styles.title}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </Text>
        <Text size="sm" variant="secondary" style={styles.subtitle}>
          {mode === "signin"
            ? "Sign in to sync your saved venues, preferred time, and history across devices."
            : "Create an account so your saves and preferences travel with you."}
        </Text>

        {mode === "signup" ? (
          <View style={styles.field}>
            <Text size="sm" variant="secondary" weight="medium" style={styles.fieldLabel}>
              Name
            </Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Alex Rivera"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              autoComplete="name"
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
        ) : null}

        {/* Email / Phone — hidden until the phone provider is enabled. */}
        {PHONE_AUTH_ENABLED ? (
          <SegmentedToggle
            style={styles.contactToggle}
            left={{
              label: "Email",
              active: contactMethod === "email",
              onPress: () => switchContactMethod("email"),
            }}
            right={{
              label: "Phone",
              active: contactMethod === "phone",
              onPress: () => switchContactMethod("phone"),
            }}
          />
        ) : null}

        {contactMethod === "email" ? (
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
              autoComplete="email"
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
        ) : (
          <View style={styles.field}>
            <Text size="sm" variant="secondary" weight="medium" style={styles.fieldLabel}>
              Phone
            </Text>
            <View
              style={[
                styles.input,
                styles.phoneWrap,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text size="md" style={{ color: colors.textSecondary }}>
                {PHONE_COUNTRY_CODE}
              </Text>
              <TextInput
                value={phone}
                onChangeText={(v) => setPhone(stripNonDigits(v))}
                placeholder="416 555 0123"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                maxLength={PHONE_DIGITS_REQUIRED}
                style={[styles.phoneInput, { color: colors.textPrimary }]}
              />
            </View>
          </View>
        )}

        <View style={styles.field}>
          <Text size="sm" variant="secondary" weight="medium" style={styles.fieldLabel}>
            Password
          </Text>
          <View
            style={[
              styles.input,
              styles.passwordWrap,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={mode === "signin" ? "password" : "newPassword"}
              autoComplete={mode === "signin" ? "password" : "password-new"}
              style={[styles.passwordInput, { color: colors.textPrimary }]}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              hitSlop={spacing.xs}
              style={({ pressed }) => [
                styles.passwordToggle,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
        </View>

        {mode === "signup" ? (
          <View style={styles.field}>
            <Text size="sm" variant="secondary" weight="medium" style={styles.fieldLabel}>
              Confirm password
            </Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter your password"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
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
        ) : null}

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
                ? `Sign in with your ${contactMethod} and password`
                : "Create a new account"
            }
          />
        </View>

        {/* Social sign-in. Google always shows (web flow, all platforms);
            Apple only on a capable iOS build. Each no-ops with a clear
            message until the provider is enabled in Supabase. */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text size="xs" variant="tertiary" style={styles.dividerText}>
            OR
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <SocialButton
          icon="logo-google"
          label="Continue with Google"
          loading={socialBusy === "google"}
          disabled={socialBusy !== null || busy}
          onPress={() => void handleSocial("google")}
        />
        {appleAvailable ? (
          <SocialButton
            icon="logo-apple"
            label="Continue with Apple"
            loading={socialBusy === "apple"}
            disabled={socialBusy !== null || busy}
            onPress={() => void handleSocial("apple")}
          />
        ) : null}

        <View style={styles.modeSwitchRow}>
          <Text size="sm" variant="secondary">
            {mode === "signin"
              ? "New to Onside?"
              : "Already have an account?"}
          </Text>
          <Pressable
            onPress={() => switchMode(mode === "signin" ? "signup" : "signin")}
            accessibilityRole="link"
            accessibilityLabel={
              mode === "signin" ? "Switch to sign up" : "Switch to sign in"
            }
            hitSlop={spacing.md}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text size="sm" weight="bold" style={{ color: colors.brand }}>
              {mode === "signin" ? "Sign up" : "Sign in"}
            </Text>
          </Pressable>
        </View>

        <Text size="xs" variant="tertiary" style={styles.legal}>
          By {mode === "signin" ? "signing in" : "creating an account"} you agree to
          our{" "}
          <Text
            size="xs"
            variant="tertiary"
            style={styles.legalLink}
            onPress={() => void Linking.openURL(TERMS_URL)}
            accessibilityRole="link"
          >
            Terms
          </Text>
          {" "}and{" "}
          <Text
            size="xs"
            variant="tertiary"
            style={styles.legalLink}
            onPress={() => void Linking.openURL(PRIVACY_URL)}
            accessibilityRole="link"
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

function SocialButton({
  icon,
  label,
  loading,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.socialBtn,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: disabled && !loading ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <>
          <Ionicons name={icon} size={20} color={colors.textPrimary} />
          <Text size="md" weight="medium">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type SegmentSide = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function SegmentedToggle({
  left,
  right,
  style,
}: {
  left: SegmentSide;
  right: SegmentSide;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.tabs,
        { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        style,
      ]}
    >
      <Segment label={left.label} active={left.active} onPress={left.onPress} />
      <Segment label={right.label} active={right.active} onPress={right.onPress} />
    </View>
  );
}

function Segment({
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
      accessibilityRole="radio"
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

function stripNonDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function buildContact(
  method: ContactMethod,
  email: string,
  phone: string
): AuthContact | null {
  if (method === "email") {
    const trimmed = email.trim();
    if (!isLikelyEmail(trimmed)) return null;
    return { email: trimmed };
  }
  // Phone path. We ship the country code on submit so AuthProvider hands
  // Supabase an E.164 number even though the user only typed digits.
  const digits = stripNonDigits(phone);
  if (digits.length !== PHONE_DIGITS_REQUIRED) return null;
  return { phone: `${PHONE_COUNTRY_CODE}${digits}` };
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
    letterSpacing: 0.3,
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
  contactToggle: {
    marginBottom: spacing.md,
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
  phoneWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    gap: spacing.sm,
  },
  phoneInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm + 4,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    paddingRight: spacing.xs,
  },
  passwordInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm + 4,
  },
  passwordToggle: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginBottom: spacing.sm,
  },
  cta: {
    marginTop: spacing.sm,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    letterSpacing: 1,
  },
  socialBtn: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  modeSwitchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  legal: {
    textAlign: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  legalLink: {
    textDecorationLine: "underline",
  },
});
