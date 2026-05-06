import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

const ASPECT_RATIO = 16 / 9;

type Props = {
  photos: string[];
};

/**
 * Full-width 16:9 photo carousel for the Venue Detail header. Dots only
 * render with 2+ photos. A failed photo or an empty `photos` array falls
 * back to a tinted "soccer field" illustration so the slot never appears
 * blank.
 */
export function PhotoGallery({ photos }: Props) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  const itemWidth = width;
  const itemHeight = width / ASPECT_RATIO;

  if (photos.length === 0) {
    return (
      <Fallback
        width={itemWidth}
        height={itemHeight}
        tint={colors.brand + "14"}
        iconColor={colors.brand}
        accessibilityLabel="Default venue illustration"
      />
    );
  }

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / itemWidth));
  };

  return (
    <View>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={onMomentumScrollEnd}
        renderItem={({ item, index }) => (
          <GalleryItem
            source={item}
            width={itemWidth}
            height={itemHeight}
            tint={colors.brand + "14"}
            iconColor={colors.brand}
            accessibilityLabel={`Venue photo ${index + 1} of ${photos.length}`}
          />
        )}
      />
      {photos.length >= 2 ? (
        <Dots count={photos.length} active={page} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Internal: per-photo cell with onError fallback
// ---------------------------------------------------------------------------

type GalleryItemProps = {
  source: string;
  width: number;
  height: number;
  tint: string;
  iconColor: string;
  accessibilityLabel: string;
};

function GalleryItem({
  source,
  width,
  height,
  tint,
  iconColor,
  accessibilityLabel,
}: GalleryItemProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Fallback
        width={width}
        height={height}
        tint={tint}
        iconColor={iconColor}
        accessibilityLabel="Photo unavailable"
      />
    );
  }

  return (
    <View accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Image
        source={source}
        style={{ width, height }}
        contentFit="cover"
        transition={150}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Internal: fallback illustration
// ---------------------------------------------------------------------------

type FallbackProps = {
  width: number;
  height: number;
  tint: string;
  iconColor: string;
  accessibilityLabel: string;
};

function Fallback({ width, height, tint, iconColor, accessibilityLabel }: FallbackProps) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.fallback, { width, height, backgroundColor: tint }]}
    >
      <Ionicons name="football" size={64} color={iconColor} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Internal: page indicator dots
// ---------------------------------------------------------------------------

function Dots({ count, active }: { count: number; active: number }) {
  const colors = useTheme();
  return (
    <View
      style={styles.dotsRow}
      // Decorative — the gallery's "Photo X of Y" labels carry the position.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor:
                i === active ? "#FFFFFF" : "rgba(255, 255, 255, 0.5)",
              borderColor: i === active ? colors.brand : "rgba(0, 0, 0, 0.25)",
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    position: "absolute",
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs + 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
