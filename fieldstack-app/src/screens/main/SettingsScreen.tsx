import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import type { MeStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Nav = NativeStackNavigationProp<MeStackParamList, "Settings">;

// Hosted destinations. Swap to real URLs once the marketing site exists.
const PRIVACY_URL = "https://fieldstack.app/privacy";
const TERMS_URL = "https://fieldstack.app/terms";
const SUPPORT_EMAIL = "support@fieldstack.app";

export function SettingsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();

  const version = Constants.expoConfig?.version ?? "1.0.0";

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.show("Couldn't open that link.", { type: "error" });
    }
  };

  const emailSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("FieldStack feedback")}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast.show("No mail app configured.", { type: "error" });
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
              await AsyncStorage.clear();
              toast.show("Cleared. Relaunch the app to start fresh.", {
                type: "success",
              });
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
        <Text size="xxl" weight="bold" accessibilityRole="header" style={styles.title}>
          Settings
        </Text>

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
            FieldStack · v{version}
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
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
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
    letterSpacing: -0.5,
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
  rowLabel: {
    flex: 1,
  },
  versionWrap: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
});
