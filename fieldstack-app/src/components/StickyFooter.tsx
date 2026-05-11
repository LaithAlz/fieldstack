import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

type Props = {
  children: ReactNode;
  /** Extra style applied to the inner content row — useful for layout overrides. */
  style?: ViewStyle;
};

/**
 * Bottom-pinned container for primary actions that should stay visible while
 * scrolling. Sits above the home-indicator gesture bar by adding the bottom
 * safe-area inset to the inner padding, with a hairline top border so the
 * footer reads as a distinct surface against scrolling content.
 *
 * Place once per screen at the root level (sibling of the scroll view),
 * not inside the scroll view itself.
 */
export function StickyFooter({ children, style }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}
    >
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  content: {
    width: "100%",
  },
});
