/**
 * Where a weapon is carried.
 *
 * Tasks 647 and 648: the same weapon is in a different place depending on what
 * the character is doing. Idle, it is slung across the back; in combat, it is in
 * both hands. Nothing about the weapon changes -- only the attach point it is
 * parented to and the orientation it is given -- so this module is a registry of
 * carry poses plus the rule for choosing between them.
 *
 * The rule matters as much as the poses. Two failure modes are immediately
 * visible on screen:
 *
 * - A weapon that pops between the back and the hands every time the stance
 *   flickers. So the transition is not instantaneous: {@link CarryState} blends
 *   the pose over {@link CARRY_BLEND_S} and reports whether it is still moving,
 *   which is what lets a scene keep drawing the old pose until the new one is
 *   worth showing.
 * - A slung weapon whose muzzle points through the character's own skull. The
 *   back pose therefore carries an explicit muzzle direction, checked in the
 *   test against the head's position.
 *
 * The poses are in the character's local space -- right hand, left hand, upper
 * back -- because a weapon's transform is applied under a bone, not in world
 * space.
 */

import type { Vec3 } from './IkSolver.js';

/** Which bone a weapon is attached to. */
export type CarryAnchor = 'right-hand' | 'left-hand' | 'back' | 'hip' | 'none';

/** Where a weapon sits, in the anchor bone's local space. */
export interface CarryPose {
  anchor: CarryAnchor;
  /** Offset from the anchor, metres. */
  offset: Vec3;
  /** Rotation in radians, applied after the offset. */
  rotation: { x: number; y: number; z: number };
  /**
   * Direction the muzzle points, in the anchor's space, unit length.
   *
   * Spelled out rather than derived from `rotation`, because whether a positive
   * pitch tilts a muzzle up or down depends on the engine's handedness and the
   * bone's own orientation -- and a slung rifle whose muzzle points through the
   * character's skull is the failure this field exists to make impossible.
   */
  muzzleDir: Vec3;
  /** True when the trigger hand is the right hand. */
  rightHanded: boolean;
}

/**
 * Task 648: a rifle held in both hands, muzzle forward.
 *
 * The muzzle points along the anchor's +Z, which is forward for a character
 * authored facing +Z -- the convention the staged operator GLBs use.
 */
export const HANDS_READY: CarryPose = {
  anchor: 'left-hand',
  offset: { x: 0.04, y: -0.02, z: 0.18 },
  rotation: { x: 0, y: 0, z: 0 },
  muzzleDir: { x: 0, y: 0, z: 1 },
  rightHanded: true,
};

/** Task 648: a pistol, one hand, muzzle forward and slightly down. */
export const PISTOL_READY: CarryPose = {
  anchor: 'right-hand',
  offset: { x: 0.02, y: -0.04, z: 0.12 },
  rotation: { x: -0.12, y: 0, z: 0 },
  muzzleDir: { x: 0, y: -0.12, z: 0.99 },
  rightHanded: true,
};

/**
 * Task 647: slung across the back.
 *
 * The muzzle points up and to the character's left, over the shoulder and clear
 * of the head, which is how a rifle is actually carried: the business end is up
 * and behind, not through the neck.
 */
export const BACK_SLUNG: CarryPose = {
  anchor: 'back',
  offset: { x: -0.14, y: 0.02, z: -0.2 },
  rotation: { x: -0.45, y: 1.35, z: 0.25 },
  // Up, back and over the character's left shoulder, which is where a rifle
  // actually goes when it is not in your hands.
  muzzleDir: { x: -0.35, y: 0.82, z: -0.46 },
  rightHanded: false,
};

/** A weapon carried low, muzzle down, for a long walk. */
export const LOW_READY: CarryPose = {
  anchor: 'hip',
  offset: { x: 0.12, y: -0.08, z: 0.04 },
  rotation: { x: 0.55, y: 0, z: 0 },
  muzzleDir: { x: 0, y: -0.52, z: 0.85 },
  rightHanded: true,
};

/** The pose a weapon is in when it is holstered out of sight. */
export const STOWED: CarryPose = {
  anchor: 'none',
  offset: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  muzzleDir: { x: 0, y: 0, z: 1 },
  rightHanded: true,
};

/** What the character is doing. */
export type Stance = 'idle' | 'moving' | 'combat' | 'downed';

/** Seconds a carry change takes. Long enough to hide a swap, short enough to read. */
export const CARRY_BLEND_S = 0.25;

/** The pose per stance. Combat takes a weapon out of both hands. */
export const POSE_BY_STANCE: Readonly<Record<Stance, CarryPose>> = {
  idle: BACK_SLUNG,
  moving: LOW_READY,
  combat: HANDS_READY,
  downed: STOWED,
};

/** Where a weapon is and how far it has got there. */
export interface CarryState {
  stance: Stance;
  pose: CarryPose;
  /** 0..1 progress of the blend into this pose; 1 when settled. */
  blend: number;
  /** True while the weapon is still moving to this pose. */
  moving: boolean;
}

/**
 * Task 647 and 648: which pose a stance means, and how far the move into it has
 * got.
 *
 * The blend runs on wall-clock time like every other blend in this layer, so a
 * stance that flickers for one frame does not throw the weapon across the
 * character's back.
 */
export class CarryStateTracker {
  private current: Stance = 'idle';
  private elapsedS = CARRY_BLEND_S;

  constructor(initialStance: Stance = 'idle', private readonly blendS: number = CARRY_BLEND_S) {
    this.current = initialStance;
  }

  /** Sets the stance and starts the blend. */
  setStance(stance: Stance): void {
    if (stance === this.current) return;
    this.current = stance;
    this.elapsedS = 0;
  }

  /** Advances the blend. */
  update(deltaS: number): CarryState {
    const step = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
    const duration = Number.isFinite(this.blendS) && this.blendS > 0 ? this.blendS : CARRY_BLEND_S;
    this.elapsedS = Math.min(duration, this.elapsedS + step);
    const blend = duration > 0 ? this.elapsedS / duration : 1;
    return {
      stance: this.current,
      pose: POSE_BY_STANCE[this.current],
      blend,
      moving: blend < 1,
    };
  }

  /** The state without advancing it. */
  get state(): CarryState {
    const duration = Number.isFinite(this.blendS) && this.blendS > 0 ? this.blendS : CARRY_BLEND_S;
    const blend = Math.min(1, this.elapsedS / duration);
    return { stance: this.current, pose: POSE_BY_STANCE[this.current], blend, moving: blend < 1 };
  }
}

/** One weapon class and how it is carried. */
export interface WeaponCarry {
  /** The weapon's id, as the manifest knows it. */
  id: string;
  /** Pose used in combat, overriding the stance default. */
  combatPose?: CarryPose;
  /** Pose used when idle, overriding the stance default. */
  idlePose?: CarryPose;
  /** How long its own carry change takes, seconds. */
  blendS?: number;
}

/** The pose a weapon uses in a stance, honouring its own overrides. */
export function poseFor(weapon: WeaponCarry, stance: Stance): CarryPose {
  if (stance === 'combat') return weapon.combatPose ?? POSE_BY_STANCE.combat;
  if (stance === 'idle') return weapon.idlePose ?? POSE_BY_STANCE.idle;
  return POSE_BY_STANCE[stance];
}

/**
 * Where a carried weapon's muzzle ends up, in the anchor bone's space.
 *
 * The muzzle is the far end of the weapon along its own length, so this needs the
 * weapon's length to be worth anything -- which is why the back-slung pose can
 * be checked against a head instead of being asserted.
 */
export function muzzlePoint(pose: CarryPose, weaponLengthM: number): Vec3 {
  const length = Number.isFinite(weaponLengthM) && weaponLengthM > 0 ? weaponLengthM : 0;
  const dir = muzzleDirection(pose);
  return {
    x: pose.offset.x + dir.x * length,
    y: pose.offset.y + dir.y * length,
    z: pose.offset.z + dir.z * length,
  };
}

/** The muzzle direction of a pose, normalised; +Z when it is unusable. */
export function muzzleDirection(pose: CarryPose): Vec3 {
  const dir = pose.muzzleDir;
  const length = Math.hypot(dir.x, dir.y, dir.z);
  if (!Number.isFinite(length) || length <= 0) return { x: 0, y: 0, z: 1 };
  return { x: dir.x / length, y: dir.y / length, z: dir.z / length };
}