import { Linking, Platform } from "react-native";

/**
 * Open the platform maps app with directions to a destination. Prefers
 * coordinates (unambiguous) and falls back to an address query. The label
 * names the dropped pin on iOS.
 *
 * Best-effort: returns false when no URL could be opened so callers can
 * toast instead of failing silently.
 */
export async function openDirections(dest: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string;
}): Promise<boolean> {
  const { lat, lng, address, label } = dest;
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  if (!hasCoords && !address) return false;

  const q = hasCoords ? `${lat},${lng}` : encodeURIComponent(address ?? "");
  const name = encodeURIComponent(label ?? address ?? "Destination");

  const url = Platform.select({
    ios: `https://maps.apple.com/?daddr=${q}&q=${name}`,
    default: hasCoords
      ? `geo:${q}?q=${q}(${name})`
      : `geo:0,0?q=${q}`,
  });

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    // geo: handler missing (rare) — fall back to Google Maps web.
    try {
      await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`);
      return true;
    } catch {
      return false;
    }
  }
}
