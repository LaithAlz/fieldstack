import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { Coords, PermissionStatus } from "../lib/location";
import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { Text } from "./Text";

type LocationOption = {
  id: string;
  label: string;
  coords: Coords;
};

const PRESETS: LocationOption[] = [
  { id: "toronto", label: "Toronto", coords: { lat: 43.6532, lng: -79.3832 } },
  { id: "north-york", label: "North York", coords: { lat: 43.7615, lng: -79.4111 } },
  { id: "scarborough", label: "Scarborough", coords: { lat: 43.7764, lng: -79.2318 } },
  { id: "etobicoke", label: "Etobicoke", coords: { lat: 43.6205, lng: -79.5132 } },
  { id: "mississauga", label: "Mississauga", coords: { lat: 43.589, lng: -79.6441 } },
  { id: "brampton", label: "Brampton", coords: { lat: 43.7315, lng: -79.7624 } },
];

type Props = {
  permissionStatus: PermissionStatus;
  onSelect: (coords: Coords, label: string) => void;
  onUseMyLocation: () => void;
  onRequestPermission: () => void;
};

/**
 * Bottom sheet for changing the active "browse from" location. Caller
 * presents/dismisses it via the forwarded ref.
 */
export const LocationPickerSheet = forwardRef<BottomSheetModal, Props>(
  function LocationPickerSheet(
    { permissionStatus, onSelect, onUseMyLocation, onRequestPermission },
    ref
  ) {
    const colors = useTheme();
    const snapPoints = useMemo(() => ["55%"], []);

    const handlePresetPress = useCallback(
      (option: LocationOption) => {
        onSelect(option.coords, option.label);
      },
      [onSelect]
    );

    const myLocationLabel =
      permissionStatus === "granted"
        ? "Use my current location"
        : permissionStatus === "denied"
          ? "Enable location in Settings"
          : "Use my current location";

    const myLocationAction =
      permissionStatus === "granted" ? onUseMyLocation : onRequestPermission;

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={styles.content}>
          <Text size="xl" weight="bold" accessibilityRole="header" style={styles.heading}>
            Browse another area
          </Text>

          <Pressable
            onPress={myLocationAction}
            accessibilityRole="button"
            accessibilityLabel={myLocationLabel}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.brand + "1F" }]}>
              <Ionicons name="navigate" size={18} color={colors.brand} />
            </View>
            <Text size="md" weight="medium">
              {myLocationLabel}
            </Text>
          </Pressable>

          {PRESETS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => handlePresetPress(opt)}
              accessibilityRole="button"
              accessibilityLabel={`Browse ${opt.label}`}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
              </View>
              <Text size="md">{opt.label}</Text>
            </Pressable>
          ))}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heading: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
});
