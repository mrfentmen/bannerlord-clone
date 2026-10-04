/**
 * Clan banner system (del order 2026-10-04).
 *
 * Bannerlord-style clan banners: pick a shape, a symbol, and colors.
 * Shapes and symbols are AI-generated assets in public/banners/.
 * The builder composes them into a clan banner config.
 */

/** Banner cloth shapes. */
export const BANNER_SHAPES = [
  "rectangle",
  "swallowtail",
  "pennant",
  "heater",
  "triple-point",
  "war-flag",
] as const;
export type BannerShape = (typeof BANNER_SHAPES)[number];

/** Banner symbols/emblems. */
export const BANNER_SYMBOLS = [
  "wolf", "bear", "eagle", "lion", "dragon", "crossed-swords", "shield", "star",
  "sun", "crescent", "lightning", "skull", "crown", "horse", "arrow", "axe",
  "spear", "mountain", "wave", "oak", "flame", "raven", "serpent", "fist",
  // Batch 2: more beasts, tools, and concepts
  "bull", "stag", "boar", "falcon", "owl", "scorpion", "castle", "key",
  "hammer", "anchor", "compass", "dagger", "bow", "diamond", "eye", "wings",
  // Letters A-Z and numbers 0-9
  ...("abcdefghijklmnopqrstuvwxyz0123456789".split("").map((c) => `letter-${c}`)),
] as const;
export type BannerSymbol = (typeof BANNER_SYMBOLS)[number];

/** Banner color palettes (primary, secondary). */
export const BANNER_PALETTES: Record<string, { primary: string; secondary: string; name: string }> = {
  crimsonGold: { primary: "#8B0000", secondary: "#FFD700", name: "Crimson & Gold" },
  midnightSilver: { primary: "#191970", secondary: "#C0C0C0", name: "Midnight & Silver" },
  forestBronze: { primary: "#228B22", secondary: "#CD7F32", name: "Forest & Bronze" },
  royalPurple: { primary: "#4B0082", secondary: "#FFD700", name: "Royal Purple & Gold" },
  oceanWhite: { primary: "#006994", secondary: "#FFFFFF", name: "Ocean & White" },
  charcoalEmber: { primary: "#36454F", secondary: "#FF6B35", name: "Charcoal & Ember" },
  desertSand: { primary: "#C2B280", secondary: "#8B4513", name: "Desert Sand & Saddle" },
  bloodOnyx: { primary: "#660000", secondary: "#0A0A0A", name: "Blood & Onyx" },
};

/** A complete clan banner configuration. */
export interface ClanBanner {
  shape: BannerShape;
  symbol: BannerSymbol;
  primaryColor: string;
  secondaryColor: string;
}

/**
 * Build a clan banner from components.
 * @param shape Banner cloth shape
 * @param symbol Emblem symbol
 * @param paletteKey Color palette key
 */
export function buildClanBanner(
  shape: BannerShape,
  symbol: BannerSymbol,
  paletteKey: keyof typeof BANNER_PALETTES
): ClanBanner {
  const palette = BANNER_PALETTES[paletteKey];
  if (!palette) throw new Error(`Unknown palette: ${paletteKey}`);
  return {
    shape,
    symbol,
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
  };
}

/** Get the asset URL for a banner shape. */
export function shapeAssetUrl(shape: BannerShape): string {
  return `/banners/shapes/shape-${shape}.webp`;
}

/** Get the asset URL for a pre-colored banner. */
export function coloredBannerUrl(shape: BannerShape, colorName: string): string {
  return `/banners/colored/banner-${shape}-${colorName}.webp`;
}

/** Get the asset URL for a banner symbol. */
export function symbolAssetUrl(symbol: BannerSymbol): string {
  return `/banners/symbols/symbol-${symbol}.webp`;
}

/** Default banner for an ethnicity (used when a clan has no custom banner). */
export const ETHNICITY_BANNERS: Record<string, ClanBanner> = {
  italian: buildClanBanner("heater", "eagle", "crimsonGold"),
  irish: buildClanBanner("swallowtail", "oak", "forestBronze"),
  chinese: buildClanBanner("rectangle", "dragon", "crimsonGold"),
  korean: buildClanBanner("rectangle", "sun", "oceanWhite"),
  african: buildClanBanner("war-flag", "lion", "charcoalEmber"),
  jamaican: buildClanBanner("pennant", "wave", "forestBronze"),
  mexican: buildClanBanner("swallowtail", "eagle", "forestBronze"),
  german: buildClanBanner("heater", "bear", "midnightSilver"),
  russian: buildClanBanner("triple-point", "bear", "bloodOnyx"),
};

/** Get the default banner for an ethnicity, falling back to a generic. */
export function bannerForEthnicity(ethnicityId: string): ClanBanner {
  return (
    ETHNICITY_BANNERS[ethnicityId] ??
    buildClanBanner("rectangle", "shield", "midnightSilver")
  );
}
