import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { useAppReset } from "../../lib/appReset";
import { useAuth } from "../../lib/auth";
import type { MeStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Nav = NativeStackNavigationProp<MeStackParamList, "Settings">;

// Hosted destinations. Swap to real URLs once the marketing site exists.
const PRIVACY_URL = "https://onside.app/privacy";
const TERMS_URL = "https://onside.app/terms";
const SUPPORT_EMAIL = "support@onside.app";

export function SettingsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const resetApp = useAppReset();
  const { user, signOut, deleteAccount } = useAuth();

  const version = Constants.expoConfig?.version ?? "1.0.0";

  const confirmSignOut = () => {
    Alert.alert(
      "Sign out?",
      "Your saves, preferred time, and history are restored when you sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            toast.show("Signed out.", { type: "success" });
          },
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account and all your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "All your saves, reviews, and history will be permanently deleted.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, delete",
                  style: "destructive",
                  onPress: async () => {
                    const result = await deleteAccount();
                    if (!result.ok) {
                      toast.show(result.error ?? "Couldn't delete account.", { type: "error" });
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  // Deep-link to the OS notification settings for Onside. Lets the user
  // toggle booking reminders without us needing in-app notification toggles
  // (we'd just be reflecting OS state anyway).
  const openNotificationSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      toast.show("Couldn't open notification settings.", { type: "error" });
    }
  };

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.show("Couldn't open that link.", { type: "error" });
    }
  };

  const emailSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Onside feedback")}`;
    try {
      await Linking.openURL(url);
    } catch {
      // No mail client — at least give the user the address so they can
      // send from somewhere else.
      await Clipboard.setStringAsync(SUPPORT_EMAIL).catch(() => undefined);
      toast.show(`Email copied: ${SUPPORT_EMAIL}`, { type: "info" });
    }
  };

  const confirmClearData = () => {
    Alert.alert(
      "Clear app data?",
      "This wipes your saved venues, preferred time, booking history, and recently viewed. The app will return to a fresh state.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              // useAppReset coordinates the four provider clear()s — this
              // updates both AsyncStorage and the in-memory state so the
              // user sees the wipe land immediately, no relaunch needed.
              await resetApp();
              toast.show("Cleared.", { type: "success" });
            } catch {
              toast.show("Couldn't clear data.", { type: "error" });
            }
          },
        },
      ]
    );
  };

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top }]}
    >
      {/* Floating back */}
      <View style={[styles.topBar, { paddingTop: spacing.sm }]}>
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
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text size="xxxl" weight="bold" font="display" accessibilityRole="header" style={styles.title}>
          Settings
        </Text>

        <SectionHeader>Account</SectionHeader>
        {user ? (
          <>
            <View style={styles.accountStatic}>
              <Text size="md" weight="medium" numberOfLines={1}>
                {user.email ?? "Signed in"}
              </Text>
              <Text size="sm" variant="secondary">
                Signed in
              </Text>
            </View>
            <Row
              icon="log-out-outline"
              label="Sign out"
              destructive
              onPress={confirmSignOut}
            />
            <Row
              icon="person-remove-outline"
              label="Delete account"
              destructive
              onPress={confirmDeleteAccount}
            />
          </>
        ) : (
          <Row
            icon="log-in-outline"
            label="Sign in"
            onPress={() => nav.navigate("SignIn")}
          />
        )}

        <SectionHeader>Preferences</SectionHeader>
        <Row
          icon="notifications-outline"
          label="Notifications"
          onPress={openNotificationSettings}
        />

        <SectionHeader>Support</SectionHeader>
        <Row icon="mail-outline" label="Contact us" onPress={emailSupport} />

        <SectionHeader>Legal</SectionHeader>
        <Row
          icon="lock-closed-outline"
          label="Privacy policy"
          onPress={() => open(PRIVACY_URL)}
        />
        <Row
          icon="document-text-outline"
          label="Terms of service"
          onPress={() => open(TERMS_URL)}
        />

        <SectionHeader>Data</SectionHeader>
        <Row
          icon="trash-outline"
          label="Clear app data"
          destructive
          onPress={confirmClearData}
        />

        <View style={styles.versionWrap}>
          <Text size="xs" variant="tertiary">
            Onside · v{version}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      size="sm"
      variant="secondary"
      weight="medium"
      accessibilityRole="header"
      style={styles.sectionHeader}
    >
      {children}
    </Text>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? colors.danger : colors.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        size="md"
        weight="medium"
        style={[
          styles.rowLabel,
          destructive ? { color: colors.danger } : undefined,
        ]}
      >
        {label}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textTertiary}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
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
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  accountStatic: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    gap: 2,
  },
  rowLabel: {
    flex: 1,
  },
  versionWrap: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
});
