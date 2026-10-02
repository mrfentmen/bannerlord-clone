/**
 * Battle weather effects (Rowan solo task 30).
 *
 * Weather modifies the battle: rain weakens archers, fog shortens sight
 * lines, snow slows everyone, heat saps stamina. The weather for a battle
 * is deterministic from the encounter id (same battle, same sky). The
 * pre-battle screen lists the active modifiers.
 */

export type WeatherKind = "clear" | "rain" | "fog" | "snow" | "heat";

export const WEATHER_KINDS: WeatherKind[] = ["clear", "rain", "fog", "snow", "heat"];

export interface WeatherModifier {
  /** What it affects, e.g. "archers". */
  target: string;
  /** Human-readable effect, e.g. "-25% archer damage". */
  effect: string;
  /** Multiplier applied by the sim (1 = no change). */
  multiplier: number;
}

export interface BattleWeather {
  kind: WeatherKind;
  label: string;
  description: string;
  modifiers: WeatherModifier[];
}

const WEATHER_TABLE: Record<WeatherKind, Omit<BattleWeather, "kind">> = {
  clear: {
    label: "Clear skies",
    description: "A fair day for war. No modifiers.",
    modifiers: [],
  },
  rain: {
    label: "Rain",
    description: "Wet bowstrings and mud underfoot.",
    modifiers: [
      { target: "archers", effect: "-25% archer damage", multiplier: 0.75 },
      { target: "cavalry", effect: "-15% cavalry speed", multiplier: 0.85 },
    ],
  },
  fog: {
    label: "Fog",
    description: "The field is shrouded; friend and foe alike fight half-blind.",
    modifiers: [
      { target: "archers", effect: "-40% archer range", multiplier: 0.6 },
      { target: "all", effect: "-20% accuracy for everyone", multiplier: 0.8 },
    ],
  },
  snow: {
    label: "Snow",
    description: "Deep snow slows every foot on the field.",
    modifiers: [
      { target: "infantry", effect: "-20% infantry speed", multiplier: 0.8 },
      { target: "cavalry", effect: "-30% cavalry charge", multiplier: 0.7 },
    ],
  },
  heat: {
    label: "Heat",
    description: "A brutal sun saps stamina.",
    modifiers: [
      { target: "all", effect: "-15% stamina regeneration", multiplier: 0.85 },
      { target: "heavy", effect: "-20% heavy unit effectiveness", multiplier: 0.8 },
    ],
  },
};

/**
 * Deterministic weather for a battle: FNV-1a hash of the encounter id
 * picks from the table. Clear is most common (40%).
 */
export function weatherFor(encounterId: string): BattleWeather {
  let h = 0x811c9dc5;
  for (let i = 0; i < encounterId.length; i++) {
    h ^= encounterId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const roll = (h % 100) / 100;
  const kind: WeatherKind =
    roll < 0.4 ? "clear" : roll < 0.6 ? "rain" : roll < 0.75 ? "fog" : roll < 0.9 ? "snow" : "heat";
  return { kind, ...WEATHER_TABLE[kind] };
}

/** Modifier lookup for the sim: multiplier for a target, 1 when unaffected. */
export function weatherMultiplier(weather: BattleWeather, target: string): number {
  let m = 1;
  for (const mod of weather.modifiers) {
    if (mod.target === target || mod.target === "all") m *= mod.multiplier;
  }
  return m;
}
