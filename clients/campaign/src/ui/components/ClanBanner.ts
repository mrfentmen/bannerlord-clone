/**
 * Clan banner renderer (del order 2026-10-04).
 * Renders a clan banner as HTML: shape with symbol overlaid, tinted by clan colors.
 */

import type { ClanBanner } from "../../data/clanBanners.js";
import { shapeAssetUrl, symbolAssetUrl } from "../../data/clanBanners.js";

/**
 * Render a clan banner as an HTML string.
 * The shape provides the cloth; the symbol is overlaid with the secondary color.
 */
export function renderClanBanner(banner: ClanBanner, sizePx = 96): string {
  const shapeUrl = shapeAssetUrl(banner.shape);
  const symbolUrl = symbolAssetUrl(banner.symbol);
  return `
<div class="clan-banner" style="position:relative;width:${sizePx}px;height:${sizePx * 1.4}px;">
  <img src="${shapeUrl}" alt="banner shape"
    style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;
           filter:sepia(1) saturate(3) hue-rotate(${hueForColor(banner.primaryColor)}deg);" />
  <img src="${symbolUrl}" alt="banner symbol"
    style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
           width:55%;height:auto;object-fit:contain;mix-blend-mode:multiply;
           filter:brightness(0) saturate(100%);" />
</div>`.trim();
}

/** Approximate hue rotation for a hex color (for tinting the grayscale shape). */
function hueForColor(hex: string): number {
  // Simple mapping: extract hue from hex and return rotation from a gray base
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}
