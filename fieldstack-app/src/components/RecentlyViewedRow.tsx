import { StyleSheet, View } from "react-native";

import { spacing } from "../theme/tokens";
import type { Venue } from "../types/api";

import { VenueScrollRow } from "./VenueScrollRow";

type Props = {
  /** Most-recent first list of venue IDs from the persistence layer. */
  recentIds: readonly string[];
  /** Current visible venues — used to hydrate IDs into renderable cards. */
  allVenues: readonly Venue[];
  onPressVenue: (venueId: string) => void;
};

/**
 * Recently viewed row used at the top of VenueList. Thin wrapper over
 * `VenueScrollRow` that negates the parent FlatList's contentContainerStyle
 * padding so the row can bleed to the screen edges.
 */
export function RecentlyViewedRow({
  recentIds,
  allVenues,
  onPressVenue,
}: Props) {
  return (
    <View style={styles.bleed}>
      <VenueScrollRow
        title="Recently viewed"
        venueIds={recentIds}
        allVenues={allVenues}
        onPressVenue={onPressVenue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    // VenueList's FlatList has `paddingHorizontal: spacing.lg` on its
    // contentContainerStyle; this margin negates that so VenueScrollRow's
    // own padding controls the gutters.
    marginHorizontal: -spacing.lg,
  },
});
