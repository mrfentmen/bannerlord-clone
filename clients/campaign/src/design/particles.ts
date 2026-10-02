/**
 * Particle density control (MASTER_PLAN task 148): blood/dust/snow scale.
 *
 * One 0..1 density scales every registered particle emitter: the effective
 * emission rate is `baseRate * density`, and 0 disables emission entirely.
 * This module is the pure policy — clamping and rate math — so it
 * unit-tests without Babylon. The scene owns the actual ParticleSystems
 * (see scene/particles.ts) and applies the density live.
 *
 * Blood emitters belong to the battle scene (not this module's to build);
 * they register with the same manager when the battle layer creates them,
 * so the slider governs them too.
 */

/** Full emission. The settings slider maps 0-100% onto 0..1. */
export const PARTICLE_DENSITY_DEFAULT = 1;

/** Clamp any input to the 0..1 density range (non-numbers become default). */
export function clampParticleDensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return PARTICLE_DENSITY_DEFAULT;
  return Math.min(1, Math.max(0, value));
}

/**
 * Effective emission rate for an emitter with the given base rate.
 * Density 0 always yields 0 (disabled), never a negative rate.
 */
export function scaledEmitRate(baseRate: number, density: number): number {
  const base = Number.isFinite(baseRate) && baseRate > 0 ? baseRate : 0;
  const d = clampParticleDensity(density);
  return base * d;
}

/** True when the density disables emission. */
export function particlesDisabled(density: number): boolean {
  return clampParticleDensity(density) <= 0;
}
