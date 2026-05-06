import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../../components/Text";
import type { MainStackParamList } from "../../navigation/MainNavigator";
import { spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<MainStackParamList, "VenueDetail">;

/**
 * Placeholder until F3 lands. Receives the venue id from navigation params so
 * we can verify routing works end-to-end from the Venue List card tap.
 */
export function VenueDetailScreen({ route }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, paddingTop: insets.top + spacing.lg }]}>
      <Text size="xxl" weight="bold" accessibilityRole="header">
        Venue
      </Text>
      <Text size="md" variant="secondary" style={{ marginTop: spacing.sm }}>
        Loading details for {route.params.venueId}…
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
