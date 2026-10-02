/**
 * Photo mode filters (Rowan solo task 95).
 *
 * Six filters applicable to photo-mode captures. Captures are data URLs;
 * each filter is a CSS filter chain the capture view applies, so the
 * model stays pure and testable without a canvas.
 */

export type PhotoFilter =
  | "none"
  | "noir"
  | "sepia"
  | "vivid"
  | "cold"
  | "warm";

export const PHOTO_FILTERS: PhotoFilter[] = ["none", "noir", "sepia", "vivid", "cold", "warm"];

export const PHOTO_FILTER_LABELS: Record<PhotoFilter, string> = {
  none: "None",
  noir: "Noir",
  sepia: "Sepia",
  vivid: "Vivid",
  cold: "Cold dawn",
  warm: "Ember dusk",
};

/** CSS filter chain for a filter. */
export function photoFilterCss(filter: PhotoFilter): string {
  switch (filter) {
    case "none":
      return "none";
    case "noir":
      return "grayscale(1) contrast(1.25) brightness(0.95)";
    case "sepia":
      return "sepia(0.8) contrast(1.05)";
    case "vivid":
      return "saturate(1.6) contrast(1.15)";
    case "cold":
      return "saturate(0.85) hue-rotate(-15deg) brightness(1.05)";
    case "warm":
      return "saturate(1.2) hue-rotate(15deg) sepia(0.25)";
  }
}

export interface FilteredCapture {
  dataUrl: string;
  filter: PhotoFilter;
  /** CSS to apply when rendering the capture. */
  css: string;
  line: string;
}

/** Apply a filter to a capture (metadata; rendering applies the CSS). */
export function applyPhotoFilter(dataUrl: string, filter: PhotoFilter): FilteredCapture {
  if (!(PHOTO_FILTERS as readonly string[]).includes(filter)) {
    throw new Error(`unknown photo filter: ${filter}`);
  }
  if (!dataUrl.startsWith("data:image/")) throw new Error("capture must be an image data URL");
  return {
    dataUrl,
    filter,
    css: photoFilterCss(filter),
    line: filter === "none" ? "Capture kept unfiltered." : `Capture filtered: ${PHOTO_FILTER_LABELS[filter]}.`,
  };
}
