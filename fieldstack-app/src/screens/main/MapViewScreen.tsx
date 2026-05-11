import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../../components/Text";
import { spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

/**
 * Placeholder until F5.7 lands. The Field Search Screen's floating
 * "Map view" button targets this route so navigation is wired now.
 */
export function MapViewScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.surface, paddingTop: insets.top + spacing.lg },
      ]}
    >
      <Text size="xxl" weight="bold" accessibilityRole="header">
        Map view
      </Text>
      <Text size="md" variant="secondary" style={{ marginTop: spacing.sm }}>
        Coming in F5.7.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
