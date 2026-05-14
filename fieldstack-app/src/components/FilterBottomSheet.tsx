import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { selection as selectionHaptic } from "../lib/haptics";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { Text } from "./Text";

export type FilterOption<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  /** When null, the sheet is closed. Set to a config object to open. */
  config: FilterSheetConfig<T> | null;
  onClose: () => void;
};

export type FilterSheetConfig<T extends string> = {
  title: string;
  options: FilterOption<T>[];
} & (
  | {
      mode: "multi";
      selected: T[];
      onApply: (next: T[]) => void;
    }
  | {
      mode: "single";
      selected: T | null;
      onApply: (next: T | null) => void;
    }
);

/**
 * Single shared filter picker. Uses the non-modal `BottomSheet` because the
 * modal variant's portal silently no-op'd `present()` in this app. The
 * sheet is mounted at the screen root with absolute positioning, so an
 * `index={0|-1}` toggle gives equivalent behavior to a modal.
 */
export function FilterBottomSheet<T extends string>({ config, onClose }: Props<T>) {
  const colors = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["55%"], []);

  // Staged selection for multi mode. Reset every time the config switches
  // (which only happens when the user opens a different picker).
  const [staged, setStaged] = useState<T[]>(
    config?.mode === "multi" ? config.selected : []
  );

  // Re-seed staged whenever a new multi config arrives. useEffect would also
  // work, but a memo-style derivation avoids an extra render pass.
  const lastConfigRef = useRef<typeof config>(null);
  if (config !== lastConfigRef.current) {
    lastConfigRef.current = config;
    if (config?.mode === "multi") {
      // Defer to avoid setState during render — schedule for next tick.
      queueMicrotask(() => setStaged(config.selected));
    }
  }

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    []
  );

  const isSelected = (id: T): boolean => {
    if (!config) return false;
    if (config.mode === "single") return config.selected === id;
    return staged.includes(id);
  };

  const handleRowPress = (id: T) => {
    if (!config) return;
    selectionHaptic();
    if (config.mode === "single") {
      config.onApply(id);
      onClose();
      return;
    }
    setStaged((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleClear = () => {
    if (!config) return;
    selectionHaptic();
    if (config.mode === "single") {
      config.onApply(null);
      onClose();
      return;
    }
    setStaged([]);
  };

  const handleApply = () => {
    if (config?.mode === "multi") config.onApply(staged);
    onClose();
  };

  // Open state controlled declaratively via index. Non-modal BottomSheet
  // renders inline — it sits in the screen's view tree at the position we
  // mount it. Pointer-events on the wrapper let map/list gestures through
  // when the sheet is closed.
  return (
    <View
      pointerEvents={config ? "auto" : "box-none"}
      style={StyleSheet.absoluteFill}
    >
      <BottomSheet
        ref={sheetRef}
        index={config ? 0 : -1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {config ? (
            <>
              <View style={styles.header}>
                <Text size="lg" weight="bold" accessibilityRole="header">
                  {config.title}
                </Text>
                <Pressable
                  onPress={handleClear}
                  accessibilityRole="button"
                  accessibilityLabel={`Clear ${config.title.toLowerCase()}`}
                  hitSlop={spacing.sm}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text
                    style={{
                      color: colors.brand,
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.medium,
                    }}
                  >
                    Clear
                  </Text>
                </Pressable>
              </View>

              {config.options.map((option) => {
                const active = isSelected(option.id);
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => handleRowPress(option.id)}
                    accessibilityRole={config.mode === "multi" ? "checkbox" : "radio"}
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        borderBottomColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text size="md" style={styles.rowLabel}>
                      {option.label}
                    </Text>
                    <Checkmark active={active} />
                  </Pressable>
                );
              })}

              {config.mode === "multi" ? (
                <View style={styles.cta}>
                  <Button label="Apply" onPress={handleApply} />
                </View>
              ) : null}
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

function Checkmark({ active }: { active: boolean }) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.checkmark,
        {
          backgroundColor: active ? colors.brand : "transparent",
          borderColor: active ? colors.brand : colors.border,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {active ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  rowLabel: {
    flex: 1,
    flexShrink: 1,
  },
  checkmark: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    paddingTop: spacing.md,
  },
});
