/**
 * Module-level cache of the last visible map region. Survives navigation
 * (you can leave the Map View screen and return), but resets when the JS
 * runtime restarts — i.e. on a fresh app launch — exactly what F5.7 asks
 * for without dragging in a state library.
 */

import type { Region } from "react-native-maps";

let lastRegion: Region | null = null;

export function getLastRegion(): Region | null {
  return lastRegion;
}

export function setLastRegion(region: Region): void {
  lastRegion = region;
}
