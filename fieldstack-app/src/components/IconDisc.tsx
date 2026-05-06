import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { useTheme } from "../theme/useTheme";

type Props = {
  /** Ionicons glyph name. */
  icon: React.ComponentProps<typeof Ionicons>["name"];
  size?: number;
};

/**
 * Brand-tinted disc with a centered icon. Used as the hero illustration on
 * onboarding screens — feels purposeful without needing custom artwork.
 */
export function IconDisc({ icon, size = 112 }: Props) {
  const colors = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.brand + "1F", // ~12% opacity tint
        },
      ]}
    >
      <Ionicons name={icon} size={size * 0.45} color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: "center",
    justifyContent: "center",
  },
});
