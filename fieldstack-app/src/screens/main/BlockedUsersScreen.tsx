import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { Text } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { useBlockedUsers } from "../../lib/blockedUsers";
import type { MeStackParamList } from "../../navigation/MainNavigator";
import { borderRadius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Nav = NativeStackNavigationProp<MeStackParamList, "BlockedUsers">;

/**
 * Settings -> Blocked users. Fulfils the promise made in a review's block
 * confirmation ("You can unblock anytime from Settings" — see
 * ReviewSection's handleBlock) by listing every id in the on-device block
 * list (src/lib/blockedUsers.tsx) with an Unblock action per row.
 *
 * Reviews never surface an author name anywhere in the app — ReviewRow
 * renders a star rating, a date, and a body, nothing identifying the
 * reviewer — so there's no display name to look up here either. Rows use
 * the same anonymous treatment: a short id tag rather than a name we don't
 * have.
 */
export function BlockedUsersScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const { hydrated, blocked, unblock } = useBlockedUsers();

  const ids = Array.from(blocked);

  const confirmUnblock = (userId: string) => {
    Alert.alert(
      "Unblock this user?",
      "You'll see their reviews again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            await unblock(userId);
            toast.show("User unblocked.", { type: "success" });
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
          Blocked users
        </Text>

        {!hydrated ? null : ids.length === 0 ? (
          <EmptyState
            icon="ban-outline"
            title="No blocked users"
            description="Block someone from a review's options menu and they'll show up here."
          />
        ) : (
          <View style={styles.list}>
            {ids.map((id) => (
              <BlockedRow key={id} userId={id} onUnblock={() => confirmUnblock(id)} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------

function BlockedRow({ userId, onUnblock }: { userId: string; onUnblock: () => void }) {
  const colors = useTheme();
  // No display name is ever fetched client-side (reviews render fully
  // anonymous — see ReviewRow), so identify the row by a short id tag.
  const shortId = userId.slice(0, 8);
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Ionicons
        name="person-circle-outline"
        size={20}
        color={colors.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text size="md" weight="medium" style={styles.rowLabel} numberOfLines={1}>
        {`Blocked reviewer · ${shortId}`}
      </Text>
      <Pressable
        onPress={onUnblock}
        accessibilityRole="button"
        accessibilityLabel={`Unblock reviewer ${shortId}`}
        hitSlop={spacing.sm}
        style={({ pressed }) => [
          styles.unblockBtn,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text size="sm" weight="medium" style={{ color: colors.brand }}>
          Unblock
        </Text>
      </Pressable>
    </View>
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
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    flex: 1,
  },
  unblockBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
