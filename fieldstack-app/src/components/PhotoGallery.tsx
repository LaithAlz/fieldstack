import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import MapView from "react-native-maps";

import { spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

const ASPECT_RATIO = 16 / 9;

/**
 * Height of the gallery at the current device width. Exposed so skeleton
 * placeholders for the same hero can match this exactly — keeps the swap
 * from loading → loaded a pure pixel replacement instead of a reflow.
 */
export function useGalleryHeight(): number {
  const { width } = useWindowDimensions();
  return width / ASPECT_RATIO;
}

type Props = {
  photos: string[];
  /**
   * Venue location. With no photos but a location, the hero renders a
   * satellite view of the pitch instead of the flat illustration — an
   * honest, licence-free "photo" of the actual field (Apple Maps imagery,
   * so no API keys and no scraping-ToS exposure).
   */
  coords?: { lat: number; lng: number } | null;
};

/**
 * Full-width 16:9 photo carousel for the Venue Detail header. Dots only
 * render with 2+ photos. An empty `photos` array falls back to a satellite
 * view of the venue (when coords are known), then to a tinted "soccer
 * field" illustration so the slot never appears blank.
 */
export function PhotoGallery({ photos, coords }: Props) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  const itemWidth = width;
  const itemHeight = width / ASPECT_RATIO;

  if (photos.length === 0) {
    if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
      return (
        <SatelliteHero width={itemWidth} height={itemHeight} coords={coords} />
      );
    }
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
        cachePolicy="memory-disk"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Internal: satellite hero for photo-less venues
// ---------------------------------------------------------------------------

// Tight enough that a full-size pitch fills most of the frame; wide enough
// that the surrounding block gives context. ~0.0025° ≈ 275 m of latitude.
const SATELLITE_DELTA = 0.0025;

function SatelliteHero({
  width,
  height,
  coords,
}: {
  width: number;
  height: number;
  coords: { lat: number; lng: number };
}) {
  return (
    <View
      style={{ width, height }}
      // Static imagery, not a map to interact with: block all touches so the
      // ScrollView underneath keeps scrolling naturally over the hero.
      pointerEvents="none"
      accessibilityRole="image"
      accessibilityLabel="Satellite view of this venue"
    >
      <MapView
        style={StyleSheet.absoluteFill}
        mapType="satellite"
        initialRegion={{
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: SATELLITE_DELTA,
          longitudeDelta: SATELLITE_DELTA,
        }}
        // Every interaction off — this renders once and behaves like a photo.
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsPointsOfInterest={false}
        // iOS: rasterize to a static snapshot after load — a detail screen
        // hero shouldn't keep a live map surface alive.
        cacheEnabled
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

const DOT_DIAMETER = 6;
const DOT_ACTIVE_WIDTH = 20;

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <View
      style={styles.dotsRow}
      // Decorative — the gallery's "Photo X of Y" labels carry the position.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Dot key={i} isActive={i === active} />
      ))}
    </View>
  );
}

// Single dot — animates width + opacity when its active state flips. Active
// dot stretches into a small pill (Airbnb/Instagram pattern), inactive ones
// shrink back to a circle. Width animation isn't native-driver-eligible, so
// we run opacity separately on the native driver for a smoother feel.
function Dot({ isActive }: { isActive: boolean }) {
  const width = useRef(
    new Animated.Value(isActive ? DOT_ACTIVE_WIDTH : DOT_DIAMETER)
  ).current;
  const opacity = useRef(new Animated.Value(isActive ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(width, {
        toValue: isActive ? DOT_ACTIVE_WIDTH : DOT_DIAMETER,
        duration: 220,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: isActive ? 1 : 0.5,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, width, opacity]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width,
          opacity,
        },
      ]}
    />
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
    height: DOT_DIAMETER,
    borderRadius: DOT_DIAMETER / 2,
    backgroundColor: "#FFFFFF",
    // Hairline border guarantees contrast on bright photos cross-platform —
    // iOS shadow renders as a halo on the round dot / a rectangle drop under
    // the pill; Android ignores shadow*. Border works on both.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.25)",
  },
});
