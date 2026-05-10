import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { selection as selectionHaptic } from "../lib/haptics";
import { borderRadius, fontSize, fontWeight, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Button } from "./Button";
import { Text } from "./Text";

export type FilterOption<T extends string> = {
  id: T;
  label: string;
};

type CommonProps<T extends string> = {
  visible: boolean;
  title: string;
  options: FilterOption<T>[];
  /** Called whenever the sheet closes (Apply, gesture pull-down, backdrop tap). */
  onDismiss: () => void;
};

type SingleProps<T extends string> = CommonProps<T> & {
  mode: "single";
  selected: T | null;
  /**
   * Fires immediately on row tap (auto-apply) and on Clear. Receives `null`
   * if the user clears the selection.
   */
  onSelect: (next: T | null) => void;
};

type MultiProps<T extends string> = CommonProps<T> & {
  mode: "multi";
  selected: T[];
  /**
   * Fires only when the user taps Apply (or Clear → Apply). Receives the
   * full new selection list. Discards staged changes on gesture/backdrop
   * dismiss so the user can back out without committing.
   */
  onSelect: (next: T[]) => void;
};

type Props<T extends string> = SingleProps<T> | MultiProps<T>;

/**
 * Generic single- or multi-select picker rendered as a bottom sheet.
 *
 * - `single`: tapping a row commits and closes; Clear commits `null` and closes.
 * - `multi`: taps stage locally; Apply commits, Clear resets the staged list,
 *   gesture/backdrop dismiss discards staged changes.
 */
export function FilterBottomSheet<T extends string>(props: Props<T>) {
  const { visible, title, options, mode, onSelect, onDismiss } = props;
  const colors = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["55%"], []);

  // Staged selection for multi mode. Reset every time the sheet opens so a
  // cancelled session doesn't leak into the next open.
  const [staged, setStaged] = useState<T[]>(
    mode === "multi" ? props.selected : []
  );

  useEffect(() => {
    if (visible) {
      if (mode === "multi") setStaged(props.selected);
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
    // The staging snapshot only matters at open time — re-running on every
    // `selected` mutation would clobber in-flight taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onDismiss();
    },
    [onDismiss]
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
    if (mode === "single") return props.selected === id;
    return staged.includes(id);
  };

  const handleRowPress = (id: T) => {
    selectionHaptic();
    if (mode === "single") {
      onSelect(id);
      sheetRef.current?.dismiss();
      return;
    }
    setStaged((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleClear = () => {
    selectionHaptic();
    if (mode === "single") {
      onSelect(null);
      sheetRef.current?.dismiss();
      return;
    }
    setStaged([]);
  };

  const handleApply = () => {
    if (mode === "multi") onSelect(staged);
    sheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <Text size="lg" weight="bold" accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${title.toLowerCase()}`}
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

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {options.map((option) => {
            const active = isSelected(option.id);
            return (
              <Pressable
                key={option.id}
                onPress={() => handleRowPress(option.id)}
                accessibilityRole={mode === "multi" ? "checkbox" : "radio"}
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
        </ScrollView>

        {mode === "multi" ? (
          <View style={styles.cta}>
            <Button label="Apply" onPress={handleApply} />
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
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
    flex: 1,
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
  list: {
    flex: 1,
  },
  listContent: {
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
