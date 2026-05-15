/**
 * Resolves the photo array to show for a field. Prefers field-level photos
 * when migration 011 has been applied and the field has its own gallery;
 * otherwise falls back to the venue's photos.
 *
 * Always returns an array — callers don't need null-guards.
 */

export function resolveFieldPhotos(
  fieldPhotos: string[] | null | undefined,
  venuePhotos: string[]
): string[] {
  if (fieldPhotos && fieldPhotos.length > 0) return fieldPhotos;
  return venuePhotos;
}
