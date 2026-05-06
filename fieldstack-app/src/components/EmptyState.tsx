import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { Text } from "./Text";

type Props = {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Centered empty/error state used by every list-bearing screen. Icon is
 * decorative (hidden from screen readers); title becomes the accessible
 * heading.
 */
export function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  const colors = useTheme();
  return (
    <View style={styles.root}>
      {icon ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.iconWrap,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          <Ionicons name={icon} size={32} color={colors.textTertiary} />
        </View>
      ) : null}
      <Text size="xl" weight="bold" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text size="md" variant="secondary" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  description: {
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 22,
  },
  action: {
    marginTop: spacing.xl,
    minWidth: 180,
  },
});
