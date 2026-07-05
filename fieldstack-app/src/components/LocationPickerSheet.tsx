import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { Coords, PermissionStatus } from "../lib/location";
import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import { SearchInput } from "./SearchInput";
import { Text } from "./Text";

type LocationOption = {
  id: string;
  label: string;
  coords: Coords;
};

const PRESETS: LocationOption[] = [
  { id: "hamilton", label: "Hamilton", coords: { lat: 43.2557, lng: -79.8711 } },
  { id: "burlington", label: "Burlington", coords: { lat: 43.3255, lng: -79.799 } },
  { id: "oakville", label: "Oakville", coords: { lat: 43.4675, lng: -79.6877 } },
  { id: "milton", label: "Milton", coords: { lat: 43.5183, lng: -79.8774 } },
  { id: "mississauga", label: "Mississauga", coords: { lat: 43.589, lng: -79.6441 } },
  { id: "brampton", label: "Brampton", coords: { lat: 43.7315, lng: -79.7624 } },
  { id: "toronto", label: "Toronto", coords: { lat: 43.6532, lng: -79.3832 } },
  { id: "vaughan", label: "Vaughan", coords: { lat: 43.8361, lng: -79.498 } },
  { id: "richmond-hill", label: "Richmond Hill", coords: { lat: 43.8828, lng: -79.4403 } },
  { id: "markham", label: "Markham", coords: { lat: 43.8561, lng: -79.337 } },
];

type Props = {
  permissionStatus: PermissionStatus;
  onSelect: (coords: Coords, label: string) => void;
  onUseMyLocation: () => void;
  onRequestPermission: () => void;
  /**
   * Free-text geocode input rendered above the presets. Optional — a caller
   * that doesn't pass `searchValue` gets the sheet exactly as before (presets
   * + "use my location" only).
   */
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  onSearchSubmit?: () => void;
};

/**
 * Bottom sheet for changing the active "browse from" location. Caller
 * presents/dismisses it via the forwarded ref.
 */
export const LocationPickerSheet = forwardRef<BottomSheetModal, Props>(
  function LocationPickerSheet(
    {
      permissionStatus,
      onSelect,
      onUseMyLocation,
      onRequestPermission,
      searchValue,
      onSearchChange,
      onSearchSubmit,
    },
    ref
  ) {
    const colors = useTheme();
    const snapPoints = useMemo(() => ["75%"], []);

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

          {onSearchChange ? (
            <View style={styles.search}>
              <SearchInput
                value={searchValue ?? ""}
                onChangeText={onSearchChange}
                onSubmit={onSearchSubmit}
                placeholder="Search by city, neighbourhood, or postal code"
                accessibilityLabel="Search location"
                accessibilityHint="Type a city, neighbourhood, or postal code, then search"
              />
            </View>
          ) : null}

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
  search: {
    marginBottom: spacing.md,
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
