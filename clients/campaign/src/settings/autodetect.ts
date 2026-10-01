/**
 * First-launch quality auto-detect (MASTER_PLAN task 13).
 *
 * A short render-loop benchmark at first launch picks a graphics preset:
 * weak hardware lands on Low, strong hardware on High or Ultra. The fps ->
 * preset mapping is a pure function so the acceptance ("picks Low on weak
 * hardware, High+ on strong") is unit-testable; the sampler collects frames
 * against an injectable clock.
 */

import type { GraphicsQuality } from "./schema.js";

/** Minimum sample before the benchmark trusts its reading. */
export const BENCHMARK_MIN_FRAMES = 90;
export const BENCHMARK_MIN_MS = 1500;

/**
 * Pick a preset from measured mean fps. Thresholds are deliberately coarse:
 * this is a first guess, and the player can change it (or re-run detection)
 * in the settings panel afterwards.
 */
export function presetForFps(fps: number): GraphicsQuality {
  if (!Number.isFinite(fps) || fps <= 0) return "low";
  if (fps < 25) return "low";
  if (fps < 45) return "medium";
  if (fps < 55) return "high";
  return "ultra";
}

/** Counts rendered frames until the sample window is complete. */
export class FpsBenchmark {
  #frames = 0;
  #startMs: number | null = null;
  #lastMs: number | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Call once per rendered frame. Returns true once the sample is complete. */
  frame(): boolean {
    const t = this.now();
    if (this.#startMs === null) this.#startMs = t;
    this.#lastMs = t;
    this.#frames += 1;
    return this.done();
  }

  done(): boolean {
    if (this.#startMs === null || this.#lastMs === null) return false;
    return this.#frames >= BENCHMARK_MIN_FRAMES && this.#lastMs - this.#startMs >= BENCHMARK_MIN_MS;
  }

  /** Mean fps over the sampled frames. Null until done(). */
  result(): number | null {
    if (!this.done() || this.#startMs === null || this.#lastMs === null) return null;
    const dt = (this.#lastMs - this.#startMs) / 1000;
    return dt > 0 ? this.#frames / dt : null;
  }
}
