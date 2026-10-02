/**
 * Weather and biome dressing applied to model materials.
 *
 * Three of them live here because they are the same operation on the same
 * materials, and a scene that applies them through one pass cannot get the
 * order wrong:
 *
 * - Task 619: snow settles on up-facing surfaces -- a model's roofs, hoods and
 *   shoulders go white, its flanks barely change.
 * - Task 620: rain darkens everything and makes it glossier, because a wet
 *   surface reflects more of a grey sky than a dry one.
 *
 * The up-facing test is a dot product against the surface normal, so it needs a
 * normal per surface -- which means it is a shader-level change, not a material
 * colour. What this module owns is the *policy*: how strong the effect is at a
 * given normal and weather, and what the caller must set on the material. The
 * scene applies it.
 */

/** A surface normal in world space, or in the mesh's local space if consistent. */
export interface Normal {
  x: number;
  y: number;
  z: number;
}

/** Weather conditions the model layers respond to. */
export interface WeatherState {
  /** Metres of snow fallen, 0 for none. */
  snowM: number;
  /** True while it is raining. */
  raining: boolean;
  /** Biome the model stands in. */
  biome: string;
}

/** Nothing has fallen, nothing is falling, no dust. */
export const CLEAR_WEATHER: WeatherState = { snowM: 0, raining: false, biome: 'plains' };

/** How deep snow has to be before it is worth a shader change. */
export const SNOW_COVER_START_M = 0.02;

/** Metres of snow at which surfaces are fully covered. */
export const SNOW_COVER_FULL_M = 0.15;

/** One effect's contribution to a material. */
export interface WeatherLayer {
  /** 0 = no effect, 1 = fully applied. */
  strength: number;
  /** Multiplier on specular/gloss; wet surfaces get glossier. */
  gloss: number;
  /** Additive tint, RGB 0..1, added to the material's own colour. */
  tint: { r: number; g: number; b: number };
}

/** Snow white, a touch cool: shadowed snow against a grey sky reads as blue. */
const SNOW_TINT = { r: 0.86, g: 0.89, b: 0.94 } as const;

/** Unit length of a normal, or 0 for a degenerate one. */
function normalLength(n: Normal): number {
  return Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
}

/**
 * How much a normal faces the sky, 0 (straight down) to 1 (straight up).
 *
 * A surface gets snow when it can see the sky, so this is `normal.y`
 * normalised. `SNOW_HORIZONTAL_FLOOR` is where a *vertical* wall stops
 * collecting: at exactly 0.5 the split is even, and a wall that took snow would
 * look like it was painted rather than dusted.
 */
export function skyFacing(normal: Normal): number {
  const length = normalLength(normal);
  if (length <= 0 || !Number.isFinite(length)) return 0;
  return normal.y / length;
}

/** Sky-facing fraction above which snow sticks, 0..1. */
export const SNOW_HORIZONTAL_FLOOR = 0.35;

/**
 * Task 619: snow coverage on one surface, 0..1.
 *
 * Two factors multiply: how much snow has fallen, and how much sky the surface
 * can see. A roof at 60 cm of snow is fully white; the same roof at 1 cm is not
 * yet white at all, because 1 cm is thinner than the albedo blend can show.
 */
export function snowCoverOn(normal: Normal, snowM: number): number {
  if (!Number.isFinite(snowM) || snowM <= SNOW_COVER_START_M) return 0;
  const depth = Math.min(1, (snowM - SNOW_COVER_START_M) / (SNOW_COVER_FULL_M - SNOW_COVER_START_M));
  const facing = Math.max(0, skyFacing(normal) - SNOW_HORIZONTAL_FLOOR) / (1 - SNOW_HORIZONTAL_FLOOR);
  return Math.min(1, depth * facing);
}

/** Task 619: the layer a snow-covered surface gets. */
export function snowLayer(normal: Normal, snowM: number): WeatherLayer {
  const strength = snowCoverOn(normal, snowM);
  return { strength, gloss: 1 + strength * 0.3, tint: SNOW_TINT };
}

/**
 * Task 620: how glossy a wet surface is, as a multiplier on specular power.
 * 1 is dry. Water fills the micro-roughness that scatters light, so a wet road
 * reflects the sky instead of scattering it.
 */
export const WET_GLOSS = 2.2;

/** Task 620: rain layer. Everything is wet, so there is no normal term. */
export function wetLayer(raining: boolean): WeatherLayer {
  return {
    strength: raining ? 1 : 0,
    gloss: raining ? WET_GLOSS : 1,
    tint: { r: 0, g: 0, b: 0 },
  };
}

/**
 * Task 620: how much rain darkens a diffuse colour, 0..1.
 *
 * A wet surface loses about a fifth of its albedo -- the water fills the pores
 * that would otherwise scatter light back at the viewer. `wetDarkening` is that
 * factor, so a caller multiplies its diffuse colour by `1 - wetDarkening`.
 */
export const WET_DARKENING = 0.2;

/** The multiplier a rain-soaked diffuse colour needs. */
export function wetDiffuseScale(raining: boolean): number {
  return raining ? 1 - WET_DARKENING : 1;
}

/** What a scene owner has to set on a material for the weather to show. */
export interface WeatherMaterialWrite {
  /** Multiply the material's diffuse colour by this. */
  diffuseScale: number;
  /** Multiply its specular power by this. */
  specularScale: number;
  /** Add this to its emissive colour, as RGB 0..1. */
  emissiveAdd: { r: number; g: number; b: number };
  /** The combined 0..1 coverage, for a shader that blends albedo itself. */
  coverage: number;
}

/**
 * Combine the three layers into the numbers a material needs.
 *
 * Snow and dust both lighten and both want to hide the base colour, so they
 * compose by taking the stronger of the two rather than summing: a model in a
 * desert blizzard should not go brighter than snow alone would make it. Rain
 * darkens independently, because wet and snow-covered are the same surface in
 * two states, not two coats.
 */
export function weatherWriteFor(normal: Normal, weather: WeatherState): WeatherMaterialWrite {
  const snow = snowLayer(normal, weather.snowM);
  const wet = wetLayer(weather.raining);
  // Coverage stays what the snow measured; the wet darkening multiplies on top
  // of it. Folding the wetness into the coverage instead would make wet snow
  // *brighter* than dry snow, which is the opposite of what rain does.
  const cover = snow.strength;
  return {
    diffuseScale: (1 - cover * 0.85) * wetDiffuseScale(weather.raining),
    // Wet wins the gloss: ice is glossier, but nothing is glossier than wet.
    specularScale: wet.strength > 0 ? wet.gloss : snow.gloss,
    emissiveAdd: {
      r: snow.tint.r * cover,
      g: snow.tint.g * cover,
      b: snow.tint.b * cover,
    },
    coverage: cover,
  };
}