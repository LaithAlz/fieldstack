import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { borderRadius, fontFamily, fontSize, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

const DEFAULT_PLACEHOLDER = "Search by city, neighbourhood, or postal code";
const DEFAULT_A11Y_LABEL = "Search location";
const DEFAULT_A11Y_HINT = "Type a city, neighbourhood, or postal code to filter fields";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  /** Inline error hint shown below the input. Does not clear input text. */
  error?: string | null;
  placeholder?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * Pure presentational search bar. Debouncing, geocoding, and any downstream
 * side effects belong to the parent. Defaults read as a location search; pass
 * `accessibilityLabel`/`accessibilityHint` to re-purpose for other queries
 * (e.g. venue name search on the home list).
 */
export function SearchInput({
  value,
  onChangeText,
  onSubmit,
  error,
  placeholder = DEFAULT_PLACEHOLDER,
  accessibilityLabel = DEFAULT_A11Y_LABEL,
  accessibilityHint = DEFAULT_A11Y_HINT,
}: Props) {
  const colors = useTheme();
  const hasText = value.length > 0;

  return (
    <View>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: error ? colors.danger : "transparent",
          },
        ]}
      >
        <Ionicons
          name="search"
          size={18}
          color={colors.textSecondary}
          style={styles.leadingIcon}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          clearButtonMode="never"
          style={[styles.input, { color: colors.textPrimary }]}
        />
        {hasText ? (
          <Pressable
            onPress={() => onChangeText("")}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.clear,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text size="sm" variant="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  leadingIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    paddingVertical: 0,
  },
  clear: {
    marginLeft: spacing.sm,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
