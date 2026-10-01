/**
 * Task 81: clan banner designer. Colors, patterns, and sigils compose into
 * an SVG. The scene (units) and the map read the same SVG through the narrow
 * {@link BannerTarget} interface — this module never touches renderers.
 */

import type { BannerPattern, ClanBanner } from "./types.js";
import { BANNER_COLORS } from "./bannerPalette.js";

export { BANNER_COLORS };

export const BANNER_PATTERNS: BannerPattern[] = ["stripes", "cross", "chevron", "border", "halved"];

export const BANNER_SIGILS = ["boar", "tower", "star", "wave", "fist", "crown"] as const;
export type BannerSigil = (typeof BANNER_SIGILS)[number];

const SIGIL_PATHS: Record<BannerSigil, string> = {
  boar: "M50 30 L70 55 L60 80 L40 80 L30 55 Z",
  tower: "M40 80 L40 35 L45 35 L45 25 L55 25 L55 35 L60 35 L60 80 Z",
  star: "M50 25 L57 45 L78 45 L61 57 L67 78 L50 65 L33 78 L39 57 L22 45 L43 45 Z",
  wave: "M20 55 Q35 40 50 55 T80 55 L80 65 Q65 50 50 65 T20 65 Z",
  fist: "M35 80 L35 50 Q35 35 50 35 Q65 35 65 50 L65 80 Z",
  crown: "M30 65 L28 40 L42 52 L50 32 L58 52 L72 40 L70 65 Z",
};

function patternRects(b: ClanBanner): string {
  const s = b.secondary;
  switch (b.pattern) {
    case "stripes":
      return `<rect x="0" y="0" width="100" height="20" fill="${s}"/><rect x="0" y="40" width="100" height="20" fill="${s}"/><rect x="0" y="80" width="100" height="20" fill="${s}"/>`;
    case "cross":
      return `<rect x="40" y="0" width="20" height="100" fill="${s}"/><rect x="0" y="40" width="100" height="20" fill="${s}"/>`;
    case "chevron":
      return `<path d="M0 100 L50 40 L100 100 L100 80 L50 20 L0 80 Z" fill="${s}"/>`;
    case "border":
      return `<rect x="0" y="0" width="100" height="100" fill="none" stroke="${s}" stroke-width="14"/>`;
    case "halved":
      return `<rect x="50" y="0" width="50" height="100" fill="${s}"/>`;
  }
}

/** Render the banner as a standalone SVG string. */
export function bannerSvg(b: ClanBanner): string {
  const sigil = SIGIL_PATHS[b.sigil as BannerSigil] ?? SIGIL_PATHS.star;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect x="0" y="0" width="100" height="100" fill="${b.primary}"/>` +
    patternRects(b) +
    `<path d="${sigil}" fill="${b.secondary}" stroke="${b.primary}" stroke-width="3"/>` +
    `</svg>`
  );
}

/** Anything that can display a banner: a unit's pennant, a map marker, etc. */
export interface BannerTarget {
  setBanner(svg: string): void;
}

export function applyBanner(target: BannerTarget, banner: ClanBanner): void {
  target.setBanner(bannerSvg(banner));
}
