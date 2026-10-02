/**
 * troop-animator.ts — procedural animation for unrigged troop models.
 *
 * Our troop GLBs come out of the Forge/TRELLIS pipeline as single static
 * meshes: no skeleton, no skins, no animation clips. Rigging them by hand is
 * not on the table, so this module animates the whole-model transform
 * instead: bob, sway, lean, lunge, flinch, fall. At crowd scale (hundreds of
 * units) that is exactly what the eye reads as "alive".
 *
 * Framework-agnostic: no Babylon.js import. The client owns the scene node
 * and the unit's base position/heading; each frame it feeds this animator
 * the sim state and applies the returned offsets on top of the base
 * transform. If rigged assets ever arrive, the clip names and the
 * input/output contract stay the same and only the internals change.
 *
 * Units: meters, radians, seconds. Y is up.
 */

export type UnitStatus =
  | "fighting"
  | "broken"
  | "routed"
  | "surrendered"
  | "destroyed"
  | (string & {}); // forward-compatible with future sim statuses

/** Everything the animator needs for one unit on one frame. */
export interface UnitAnimInput {
  /** Stable unit id. Used for the per-unit phase offset (crowds must not march in sync). */
  id: number;
  /** World-space position, owned by the client. The animator only adds offsets. */
  x: number;
  y: number;
  /** Facing, radians. */
  heading: number;
  /** Speed in m/s, computed by the client from battlefeed frame deltas. */
  speed: number;
  /** battlefeed FrameUnit.status string. */
  status: UnitStatus;
  /** 0..1 remaining. */
  hpFrac: number;
  /** 0..1. Drives crouch while fighting. */
  suppression: number;
  /** True while the unit is firing this frame (client maps aimed-fire events). */
  firing: boolean;
}

/** Offsets applied on top of the client's base transform. */
export interface UnitAnimOutput {
  dx: number;
  dy: number;
  dz: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Resolved clip name, useful for debug overlays and FX hooks. */
  clip: string;
}

interface UnitState {
  /** Stride phase accumulator, advanced by distance traveled. */
  stride: number;
  /** Per-unit phase offset so crowds desynchronize. */
  offset: number;
  /** Death fall progress 0..1. Sticky: once dead, stays dead. */
  deadT: number;
  /** Fall direction, picked once (+1 / -1 roll). */
  fallDir: number;
  /** Hit flinch impulse 0..1, decays fast. */
  flinch: number;
  /** Attack recoil cycle phase. */
  recoil: number;
}

const TAU = Math.PI * 2;

/** Deterministic 0..1 hash from a unit id. */
function hash01(id: number): number {
  let h = (id | 0) * 2654435761;
  h ^= h >>> 15;
  h = (h * 2246822519) | 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class TroopAnimator {
  private units = new Map<number, UnitState>();

  private stateFor(id: number): UnitState {
    let s = this.units.get(id);
    if (!s) {
      const offset = hash01(id) * TAU;
      s = {
        stride: offset,
        offset,
        deadT: 0,
        fallDir: hash01(id ^ 0x9e3779b9) < 0.5 ? -1 : 1,
        flinch: 0,
        recoil: offset,
      };
      this.units.set(id, s);
    }
    return s;
  }

  /** Call when a hit event lands on a unit: plays a quick flinch. */
  flinch(id: number, strength = 1): void {
    const s = this.stateFor(id);
    s.flinch = Math.min(1, s.flinch + strength);
  }

  /** Forget a unit (despawn). Omit the id to clear everything. */
  reset(id?: number): void {
    if (id === undefined) this.units.clear();
    else this.units.delete(id);
  }

  update(inputs: UnitAnimInput[], dt: number, time: number): UnitAnimOutput[] {
    const dtc = Math.min(Math.max(dt, 0), 0.1); // clamp runaway steps
    return inputs.map((u) => this.pose(u, dtc, time));
  }

  private pose(u: UnitAnimInput, dt: number, time: number): UnitAnimOutput {
    const s = this.stateFor(u.id);
    const out: UnitAnimOutput = {
      dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0, roll: 0, clip: "idle",
    };

    // Death is terminal in the sim, so the feed is authoritative: while it
    // reports destroyed (or hp 0), play the fall once and hold the pose.
    // deadT persists across frames, so the fall never replays.
    if (u.status === "destroyed" || u.hpFrac <= 0) {
      s.deadT = Math.min(1, s.deadT + dt / 0.6);
      const e = 1 - Math.pow(1 - s.deadT, 3); // ease-out cubic
      out.roll = s.fallDir * e * (Math.PI / 2) * 0.94;
      out.dy = -0.12 * e;
      out.pitch = 0.08 * e;
      out.clip = "death";
      return out;
    }

    // Advance the stride phase by distance actually traveled, so footstep
    // frequency always matches ground speed. ~1.9 strides/sec at 1.4 m/s.
    s.stride += dt * (u.speed / 1.4) * 1.9 * TAU * 0.5;
    s.flinch = Math.max(0, s.flinch - dt / 0.28);

    const strideS = Math.sin(s.stride);
    const strideC = Math.cos(s.stride);
    const breathe = Math.sin(time * 1.7 + s.offset);

    switch (u.status) {
      case "surrendered": {
        // Kneel, hands-up read: drop low, tip the torso back slightly, still.
        out.dy = -0.28;
        out.pitch = -0.12;
        out.dy += breathe * 0.008;
        out.clip = "surrender";
        break;
      }
      case "routed": {
        // Panicked run: fast short bob, hard forward lean, lateral weave.
        const f = 2.6;
        out.dy = Math.abs(Math.sin(s.stride * f)) * 0.07;
        out.pitch = 0.34;
        out.yaw = Math.sin(time * 3.1 + s.offset) * 0.12;
        out.roll = Math.sin(s.stride * f) * 0.06;
        out.clip = "rout";
        break;
      }
      case "broken": {
        // Cower: crouched, hunched, trembling.
        out.dy = -0.18 + Math.sin(time * 13 + s.offset) * 0.008;
        out.pitch = 0.3;
        out.roll = Math.sin(time * 11 + s.offset * 2) * 0.02;
        out.clip = "cower";
        break;
      }
      default: {
        // fighting (or any unknown status): locomotion + suppression + firing.
        const moving = u.speed > 0.4;
        if (moving) {
          const gait = clamp01(u.speed / 3.5); // 0 walk .. 1 run
          out.dy = Math.abs(strideS) * (0.035 + gait * 0.035);
          out.pitch = 0.06 + gait * 0.16; // lean into the run
          out.roll = strideC * 0.045; // hip sway
          out.yaw = Math.sin(s.stride * 0.5) * 0.03;
          out.clip = u.speed > 2.6 ? "run" : "advance";
        } else {
          out.dy = breathe * 0.014; // idle breathing
          out.roll = breathe * 0.008;
          out.clip = "idle";
        }
        // Suppression crouch, scaled 0..1.
        const sup = clamp01(u.suppression);
        out.dy -= sup * 0.16;
        out.pitch += sup * 0.22;
        // Firing recoil: rhythmic shoulder kick while the trigger is down.
        if (u.firing) {
          s.recoil += dt * 9;
          const kick = Math.max(0, Math.sin(s.recoil));
          out.pitch -= kick * 0.06;
          out.dy -= kick * 0.012;
          if (!moving) out.clip = "attack";
        }
        break;
      }
    }

    // Hit flinch rides on top of whatever the clip is doing.
    if (s.flinch > 0) {
      const f = s.flinch * s.flinch;
      out.pitch -= f * 0.22;
      out.dy -= f * 0.05;
      out.yaw += f * 0.1 * s.fallDir;
    }

    return out;
  }
}
