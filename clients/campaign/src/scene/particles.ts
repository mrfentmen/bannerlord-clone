/**
 * Ambient particles + density manager (MASTER_PLAN task 148).
 *
 * The campaign map gets two ambient emitters — wind-blown dust and falling
 * snow — owned by `AmbientParticles`. Every emitter (ambient or battle,
 * e.g. blood when the battle scene registers it) goes through
 * `ParticleDensityManager`, which scales emission by the player's
 * particle-density setting: effective rate = base * density, 0 disables.
 *
 * Sizes track the camera radius so motes stay visible at any zoom on the
 * metre-scale map. Numbers are conservative first guesses, clearly marked —
 * tune against the live scene if they read wrong.
 */

import { Color4, DynamicTexture, ParticleSystem, Vector3, type Scene } from "@babylonjs/core";
import { PARTICLE_DENSITY_DEFAULT, clampParticleDensity } from "../design/particles.js";

/** Minimal emitter surface the density manager needs (unit-testable). */
export interface DensityEmitter {
  setEmitRate(rate: number): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

/** Adapt a Babylon ParticleSystem to the manager's emitter surface. */
export function asDensityEmitter(ps: ParticleSystem): DensityEmitter {
  return {
    setEmitRate: (rate: number) => {
      ps.emitRate = rate;
    },
    start: () => ps.start(),
    stop: () => ps.stop(),
    dispose: () => ps.dispose(),
  };
}

/**
 * Owns every particle emitter and scales them by one density. Battle
 * emitters (blood, impacts) register here when the battle scene creates
 * them, so the slider governs them too.
 */
export class ParticleDensityManager {
  private readonly emitters = new Map<string, { emitter: DensityEmitter; baseRate: number }>();
  private density = PARTICLE_DENSITY_DEFAULT;

  /** Register an emitter with its full-density emission rate. */
  register(id: string, emitter: DensityEmitter, baseEmitRate: number): void {
    this.emitters.set(id, { emitter, baseRate: Math.max(0, baseEmitRate) });
    this.applyTo(id);
  }

  unregister(id: string): void {
    this.emitters.delete(id);
  }

  /** Set the density (0..1); 0 stops every emitter. */
  setDensity(density: number): void {
    this.density = clampParticleDensity(density);
    for (const id of this.emitters.keys()) this.applyTo(id);
  }

  getDensity(): number {
    return this.density;
  }

  registeredIds(): string[] {
    return [...this.emitters.keys()];
  }

  dispose(): void {
    for (const { emitter } of this.emitters.values()) emitter.dispose();
    this.emitters.clear();
  }

  private applyTo(id: string): void {
    const entry = this.emitters.get(id);
    if (!entry) return;
    const rate = entry.baseRate * this.density;
    if (rate <= 0) {
      entry.emitter.stop();
    } else {
      entry.emitter.setEmitRate(rate);
      entry.emitter.start();
    }
  }
}

function softCircleTexture(scene: Scene, name: string): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export interface AmbientParticleOptions {
  /** Full-density emission rates (particles/second). */
  dustRate?: number;
  snowRate?: number;
}

interface CameraLike {
  target: Vector3;
  radius: number;
}

/**
 * Dust + snow over the campaign map. `update()` re-anchors the emitters to
 * the camera target and scales particle size with zoom; call it once per
 * frame. Both systems start stopped — the density manager starts them when
 * density > 0.
 */
export class AmbientParticles {
  private readonly dust: ParticleSystem;
  private readonly snow: ParticleSystem;
  private readonly camera: CameraLike;
  readonly dustBaseRate: number;
  readonly snowBaseRate: number;

  constructor(scene: Scene, camera: CameraLike, options: AmbientParticleOptions = {}) {
    this.camera = camera;
    // Conservative first guesses; tune against the live scene.
    this.dustBaseRate = options.dustRate ?? 14;
    this.snowBaseRate = options.snowRate ?? 36;

    const puff = softCircleTexture(scene, "particle-soft");

    this.dust = new ParticleSystem("ambient-dust", 240, scene);
    this.dust.particleTexture = puff;
    this.dust.emitter = new Vector3(0, 0, 0);
    // Faint wind-blown grit.
    this.dust.color1 = new Color4(0.82, 0.74, 0.6, 0.32);
    this.dust.color2 = new Color4(0.78, 0.7, 0.56, 0.16);
    this.dust.colorDead = new Color4(0.78, 0.7, 0.56, 0);
    this.dust.minLifeTime = 4;
    this.dust.maxLifeTime = 8;
    this.dust.direction1 = new Vector3(-30, 4, -12);
    this.dust.direction2 = new Vector3(30, 10, 12);
    this.dust.minEmitPower = 6;
    this.dust.maxEmitPower = 18;

    this.snow = new ParticleSystem("ambient-snow", 480, scene);
    this.snow.particleTexture = puff;
    this.snow.emitter = new Vector3(0, 0, 0);
    this.snow.color1 = new Color4(0.95, 0.96, 1, 0.5);
    this.snow.color2 = new Color4(0.93, 0.94, 1, 0.28);
    this.snow.colorDead = new Color4(0.93, 0.94, 1, 0);
    this.snow.minLifeTime = 6;
    this.snow.maxLifeTime = 11;
    this.snow.direction1 = new Vector3(-14, -60, -8);
    this.snow.direction2 = new Vector3(14, -35, 8);
    this.snow.minEmitPower = 8;
    this.snow.maxEmitPower = 20;
  }

  /** DensityEmitter views for the manager. */
  dustEmitter(): DensityEmitter {
    return asDensityEmitter(this.dust);
  }

  snowEmitter(): DensityEmitter {
    return asDensityEmitter(this.snow);
  }

  /** Re-anchor to the camera and scale sizes with zoom. Call per frame. */
  update(): void {
    const { target, radius } = this.camera;
    const spread = Math.max(1, radius * 0.55);
    for (const [ps, size] of [
      [this.dust, radius * 0.016],
      [this.snow, radius * 0.02],
    ] as const) {
      const e = ps.emitter as Vector3;
      e.copyFrom(target);
      ps.minEmitBox = new Vector3(-spread, radius * 0.05, -spread);
      ps.maxEmitBox = new Vector3(spread, radius * 0.35, spread);
      ps.minSize = size * 0.7;
      ps.maxSize = size * 1.3;
    }
  }

  dispose(): void {
    this.dust.dispose();
    this.snow.dispose();
  }
}
