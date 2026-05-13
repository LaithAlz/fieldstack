import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../../components/Text";
import { spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

/**
 * Stub for the Me tab. The content (preferred slot card, saved row, recent
 * bookings, recently viewed) lands in PR 6C — this scaffold just claims the
 * tab slot so 6A can ship the nav structure independently.
 */
export function ProfileScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text size="xxl" weight="bold" accessibilityRole="header">
          Me
        </Text>
        <Text size="sm" variant="secondary">
          Preferences and history coming next.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
});
