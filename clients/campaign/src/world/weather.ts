/**
 * Weather system — Markov weather with gameplay effects.
 *
 * Weather states transition on a timer (clear ↔ overcast ↔ rain ↔
 * storm, fog as a morning visitor). The game reads multipliers, not
 * particles: visibility (crime witness radius, cop sight range),
 * driving grip (bike + car), and whether the sky goes overcast
 * (fed back into the day/night cycle). The adapter owns the actual
 * rain particles and wet-road look.
 */
import type { Rng } from "../turf/borderGrowth.js";

export type WeatherKind = "clear" | "overcast" | "rain" | "storm" | "fog";

export interface WeatherState {
  kind: WeatherKind;
  /** 0..1 within the kind (drizzle → downpour). */
  intensity: number;
}

/** Transition targets with weights: [kind, weight]. */
const TRANSITIONS: Record<WeatherKind, Array<[WeatherKind, number]>> = {
  clear: [["clear", 5], ["overcast", 3], ["fog", 1]],
  overcast: [["overcast", 4], ["clear", 3], ["rain", 3]],
  rain: [["rain", 4], ["overcast", 3], ["storm", 1]],
  storm: [["storm", 2], ["rain", 4], ["overcast", 2]],
  fog: [["fog", 2], ["clear", 4], ["overcast", 2]],
};

export const WEATHER_CONFIG = {
  /** Game seconds between weather rolls. */
  rollInterval: 900, // 15 game-minutes
  /** Seconds (game) to blend intensity between rolls. */
  blendTime: 300,
} as const;

export class WeatherSystem {
  private state: WeatherState;
  private target: WeatherState;
  private timer = 0;
  private blendT = 1;

  constructor(
    private readonly rng: Rng = { next: () => Math.random() },
    initial: WeatherKind = "clear",
  ) {
    this.state = { kind: initial, intensity: initial === "clear" ? 0 : 0.5 };
    this.target = { ...this.state };
  }

  /** Advance with game seconds (already scaled by the clock). */
  tick(gameDt: number): void {
    this.timer += gameDt;
    if (this.timer >= WEATHER_CONFIG.rollInterval) {
      this.timer = 0;
      this.target = this.rollNext();
      this.blendT = 0;
    }
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + gameDt / WEATHER_CONFIG.blendTime);
      const a = this.state;
      const b = this.target;
      if (a.kind !== b.kind && this.blendT >= 0.5) {
        this.state = { kind: b.kind, intensity: b.intensity * (this.blendT - 0.5) * 2 };
      } else if (a.kind === b.kind) {
        this.state = { kind: a.kind, intensity: a.intensity + (b.intensity - a.intensity) * this.blendT };
      }
    }
  }

  get current(): WeatherState {
    return { ...this.state };
  }

  /** Forces the overcast sky in the day/night cycle. */
  get forcesOvercast(): boolean {
    return this.state.kind === "overcast" || this.state.kind === "rain" || this.state.kind === "storm";
  }

  /** 0..1 sight multiplier (witness radius, cop vision range). */
  visibility(): number {
    const i = this.state.intensity;
    switch (this.state.kind) {
      case "clear":
        return 1;
      case "overcast":
        return 0.9;
      case "fog":
        return 0.45 + 0.2 * (1 - i);
      case "rain":
        return 0.8 - 0.2 * i;
      case "storm":
        return 0.6 - 0.2 * i;
    }
  }

  /** Driving grip multiplier (bike + car). */
  gripFactor(): number {
    const i = this.state.intensity;
    switch (this.state.kind) {
      case "clear":
        return 1;
      case "overcast":
        return 0.98;
      case "fog":
        return 0.95;
      case "rain":
        return 0.85 - 0.1 * i;
      case "storm":
        return 0.75 - 0.1 * i;
    }
  }

  /** Crime witness radius multiplier — rain keeps people inside. */
  witnessFactor(): number {
    const i = this.state.intensity;
    switch (this.state.kind) {
      case "rain":
        return 0.8 - 0.15 * i;
      case "storm":
        return 0.65 - 0.15 * i;
      case "fog":
        return 0.7;
      default:
        return 1;
    }
  }

  private rollNext(): WeatherState {
    const options = TRANSITIONS[this.state.kind]!;
    const total = options.reduce((s, [, w]) => s + w, 0);
    let r = this.rng.next() * total;
    for (const [kind, weight] of options) {
      r -= weight;
      if (r <= 0) return { kind, intensity: kind === "clear" ? 0 : 0.3 + this.rng.next() * 0.7 };
    }
    return { kind: "clear", intensity: 0 };
  }
}
