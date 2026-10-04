/**
 * Day/night cycle — wires the campaign clock to the pulled HDRI skies.
 *
 * The art was already in the repo (`public/textures/vendor/hdris/`,
 * 12 CC0 skies); this is the missing time-of-day system from §17 of
 * the pull list. The cycle picks the sky for the current hour and
 * notifies the adapter, which crossfades the IBL environment + skybox.
 * PBR materials (`vendor/pbr/`) respond to the IBL automatically.
 * Streetlights at night are a follow-up (noted in the pull list).
 */
import { GameClock } from "./clock.js";

export type SkyPeriod = "dawn" | "day" | "sunset" | "night" | "overcast";

export interface SkyDef {
  period: SkyPeriod;
  /** HDRI file under `textures/vendor/hdris/`. */
  hdr: string;
  /** Directional "sun" intensity multiplier. */
  sunIntensity: number;
  /** Sun color tint [r, g, b]. */
  sunColor: [number, number, number];
  /** Ambient/IBL intensity multiplier. */
  ambient: number;
}

const HDR = "textures/vendor/hdris/";

export const SKIES: Record<SkyPeriod, SkyDef> = {
  dawn: {
    period: "dawn",
    hdr: `${HDR}kiara_1_dawn_1k.hdr`,
    sunIntensity: 0.7,
    sunColor: [1.0, 0.75, 0.55],
    ambient: 0.55,
  },
  day: {
    period: "day",
    hdr: `${HDR}kloofendal_43d_clear_puresky_1k.hdr`,
    sunIntensity: 1.2,
    sunColor: [1.0, 0.97, 0.9],
    ambient: 1.0,
  },
  sunset: {
    period: "sunset",
    hdr: `${HDR}bambanani_sunset_1k.hdr`,
    sunIntensity: 0.6,
    sunColor: [1.0, 0.6, 0.35],
    ambient: 0.5,
  },
  night: {
    period: "night",
    hdr: `${HDR}qwantani_night_puresky_1k.hdr`,
    sunIntensity: 0.08,
    sunColor: [0.5, 0.65, 1.0],
    ambient: 0.12,
  },
  overcast: {
    period: "overcast",
    hdr: `${HDR}kloofendal_overcast_puresky_1k.hdr`,
    sunIntensity: 0.4,
    sunColor: [0.85, 0.88, 0.92],
    ambient: 0.6,
  },
};

/** Storms and heavy rain force the overcast sky regardless of hour. */
export function skyForHour(hour: number, overcast: boolean): SkyPeriod {
  if (overcast) return "overcast";
  if (hour < 5 || hour >= 21) return "night";
  if (hour < 8) return "dawn";
  if (hour < 17.5) return "day";
  if (hour < 20) return "sunset";
  return "night";
}

export class DayNightCycle {
  private period: SkyPeriod;
  /** 0..1 blend from the previous sky to the current one. */
  private blend = 1;

  constructor(
    private readonly clock: GameClock,
    private readonly onSkyChange: (sky: SkyDef, previous: SkyDef | null) => void,
    private overcast = false,
  ) {
    this.period = skyForHour(this.clock.hourOfDay, this.overcast);
    this.onSkyChange(SKIES[this.period]!, null);
  }

  setOvercast(overcast: boolean): void {
    this.overcast = overcast;
  }

  tick(realDt: number): void {
    this.clock.tick(realDt);
    const next = skyForHour(this.clock.hourOfDay, this.overcast);
    if (next !== this.period) {
      const prev = SKIES[this.period]!;
      this.period = next;
      this.blend = 0;
      this.onSkyChange(SKIES[this.period]!, prev);
    }
    // Blend over ~10 game-minutes so dawn doesn't pop.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + (realDt * this.clock.timeScale) / 600);
    }
  }

  current(): SkyDef {
    return SKIES[this.period]!;
  }

  get blendFactor(): number {
    return this.blend;
  }

  get currentPeriod(): SkyPeriod {
    return this.period;
  }
}
