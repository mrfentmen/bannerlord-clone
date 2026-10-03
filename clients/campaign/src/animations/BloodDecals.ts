/**
 * Blood decals and pools, and the switch that turns them off.
 *
 * Task 649: a hit leaves a blood decal that fades over 30 seconds. Task 650: a
 * body that dies pools blood underneath it, which fades over 60 -- twice as
 * long, because a pool is bigger and the eye notices it more.
 *
 * The fading is the whole of these two tasks. Blood decals are the classic way to
 * turn a 200 MB scene into a 600 MB scene: every mark is a mesh, and a firefight
 * leaves hundreds. So both are bounded three ways at once -- a maximum number of
 * marks, a maximum total area, and a lifetime -- and the oldest mark is always
 * the one that goes, whatever the others are doing.
 *
 * Task 651: the toggle. That lives in `src/settings/**`, another lane's module,
 * so this side of it is a policy: {@link BloodSettings} reads a plain value from
 * an injected store and everything downstream asks it, rather than the emitter
 * and the decal tracker each having their own idea of whether blood is on.
 */

/** Blood mark lifetimes, seconds. */
export const BLOOD_DECAL_LIFETIME_S = 30;

/** Blood pool lifetime, seconds: twice the decal, for twice the size. */
export const BLOOD_POOL_LIFETIME_S = 60;

/** Marks one target may carry at once. */
export const MAX_BLOOD_MARKS = 16;

/** Largest total area of blood on one target, square metres. */
export const MAX_BLOOD_AREA_M2 = 3;

/** Area one hit's decal covers, square metres. A 35 cm splash. */
export const HIT_DECAL_AREA_M2 = 0.1;

/** Area a corpse's pool covers, square metres. */
export const POOL_AREA_M2 = 1.2;

/** One blood mark, wherever it is stuck. */
export interface BloodMark {
  id: string;
  /** Manifest id of whatever it is stuck to. */
  targetId: string;
  kind: 'decal' | 'pool';
  /** Seconds it has been alive. */
  ageS: number;
  /** Seconds it may live for. */
  lifetimeS: number;
  /** How much surface it covers, square metres. */
  areaM2: number;
  /** Position on the target, metres, in the target's local space. */
  position: { x: number; y: number; z: number };
}

/** What one frame of blood upkeep did. */
export interface BloodFrame {
  /** Marks to draw this frame, oldest first. */
  live: BloodMark[];
  /** Marks that have faded out and should be disposed. */
  expired: string[];
  /** Marks dropped this frame to stay inside the bounds. */
  evicted: string[];
  /** Total area currently on the field, per target. */
  areaByTarget: Readonly<Record<string, number>>;
}

/** Whether blood is enabled, and how much of it. */
export interface BloodSettings {
  /** False when the player has turned blood off. */
  enabled: boolean;
  /** 0..1 multiplier on every mark's lifetime, for a reduced-gore setting. */
  intensity: number;
}

/** Blood on, at full intensity. */
export const BLOOD_ON: BloodSettings = { enabled: true, intensity: 1 };

/** Blood off. */
export const BLOOD_OFF: BloodSettings = { enabled: false, intensity: 0 };

/**
 * Reads a blood setting out of an arbitrary store.
 *
 * The store is a lookup function rather than an import because the settings
 * module belongs to another lane; what this needs to know is the answer, not
 * where it came from. A store that is missing the key, or has nonsense in it,
 * yields blood on: turning blood off must be a deliberate act.
 */
export function readBloodSettings(store: (key: string) => unknown): BloodSettings {
  const enabled = store('blood');
  const intensity = store('bloodIntensity');
  return {
    enabled: enabled === false ? false : true,
    intensity:
      typeof intensity === 'number' && Number.isFinite(intensity)
        ? Math.min(1, Math.max(0, intensity))
        : 1,
  };
}

/**
 * Task 649, 650 and 651: every blood mark in the battle, aged and bounded.
 *
 * The bounds are enforced per target rather than globally, because a global cap
 * means one pile of corpses can starve every other target's blood on the field.
 * Within a target the oldest mark goes first: a fresh hit should always be
 * visible, and the oldest mark is the one nobody is looking at.
 */
export class BloodDecals {
  private marks: BloodMark[] = [];
  private settings: BloodSettings;
  private nextId = 1;

  constructor(
    settings: BloodSettings = BLOOD_ON,
    private readonly maxMarks = MAX_BLOOD_MARKS,
    private readonly maxAreaM2 = MAX_BLOOD_AREA_M2,
  ) {
    this.settings = settings;
  }

  /** Task 651: turn blood on or off, or change its intensity, live. */
  setSettings(settings: BloodSettings): void {
    this.settings = settings;
  }

  /** The current settings. */
  get currentSettings(): BloodSettings {
    return this.settings;
  }

  /** How many marks are live. */
  get count(): number {
    return this.marks.length;
  }

  /**
   * Task 649: a blood decal where a round hit.
   *
   * Returns null when blood is off, so a caller does not have to branch on the
   * setting before doing the work.
   */
  addHitDecal(
    targetId: string,
    position: { x: number; y: number; z: number },
    areaM2 = HIT_DECAL_AREA_M2,
  ): BloodMark | null {
    return this.add(targetId, 'decal', position, areaM2, BLOOD_DECAL_LIFETIME_S);
  }

  /**
   * Task 650: the pool a body leaves behind it.
   *
   * Wider and longer-lived than a hit mark, and centred on the ground rather
   * than on the wound.
   */
  addPool(
    targetId: string,
    position: { x: number; y: number; z: number },
    areaM2 = POOL_AREA_M2,
  ): BloodMark | null {
    return this.add(targetId, 'pool', position, areaM2, BLOOD_POOL_LIFETIME_S);
  }

  /**
   * Ages every mark and reports what to draw, what to dispose and what was
   * dropped to stay inside the bounds.
   */
  update(deltaS: number): BloodFrame {
    const step = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
    const expired: string[] = [];
    const evicted: string[] = [];

    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i] as BloodMark;
      mark.ageS += step;
      if (mark.ageS >= mark.lifetimeS) {
        expired.push(mark.id);
        this.marks.splice(i, 1);
      }
    }

    if (!this.settings.enabled) {
      // Task 651: turning blood off takes the marks off the field rather than
      // merely hiding them, so nothing is left holding memory.
      for (const mark of this.marks) evicted.push(mark.id);
      this.marks.length = 0;
    }

    // Per target, newest first, so the cap is reached at the *oldest* end and a
    // fresh hit is always the mark that survives.
    const byTarget = new Map<string, BloodMark[]>();
    for (const mark of this.marks) {
      const list = byTarget.get(mark.targetId) ?? [];
      list.push(mark);
      byTarget.set(mark.targetId, list);
    }
    for (const list of byTarget.values()) {
      list.sort((a, b) => a.ageS - b.ageS);
      let area = 0;
      for (let i = 0; i < list.length; i++) {
        const mark = list[i] as BloodMark;
        const overCount = i >= this.maxMarks;
        const overArea = area + mark.areaM2 > this.maxAreaM2;
        if (overCount || overArea) {
          evicted.push(mark.id);
          const at = this.marks.indexOf(mark);
          if (at >= 0) this.marks.splice(at, 1);
          continue;
        }
        area += mark.areaM2;
      }
    }

    // Measured after the eviction, so the report says what is actually on the
    // field rather than what was on it a moment ago.
    const areaByTarget: Record<string, number> = {};
    for (const mark of this.marks) {
      areaByTarget[mark.targetId] = (areaByTarget[mark.targetId] ?? 0) + mark.areaM2;
    }
    return {
      live: [...this.marks].sort((a, b) => a.ageS - b.ageS),
      expired,
      evicted,
      areaByTarget,
    };
  }

  /** Marks currently on a target, oldest first. */
  marksOn(targetId: string): BloodMark[] {
    return this.marks.filter((m) => m.targetId === targetId).sort((a, b) => a.ageS - b.ageS);
  }

  /** Removes every mark on a target, e.g. when it is recycled from the pool. */
  clearTarget(targetId: string): number {
    const before = this.marks.length;
    this.marks = this.marks.filter((m) => m.targetId !== targetId);
    return before - this.marks.length;
  }

  private add(
    targetId: string,
    kind: 'decal' | 'pool',
    position: { x: number; y: number; z: number },
    areaM2: number,
    lifetimeS: number,
  ): BloodMark | null {
    if (!this.settings.enabled) return null;
    const area = Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 : HIT_DECAL_AREA_M2;
    const intensity = Math.min(1, Math.max(0, this.settings.intensity));
    const mark: BloodMark = {
      id: `blood-${this.nextId++}`,
      targetId,
      kind,
      ageS: 0,
      // Reduced intensity means the marks fade sooner, not that they are smaller.
      lifetimeS: lifetimeS * Math.max(0.05, intensity),
      areaM2: area,
      position: { ...position },
    };
    this.marks.push(mark);
    return mark;
  }
}

/**
 * Fade factor for a mark, 0..1. A decal fades throughout its life; a pool holds
 * and then fades, the way a spreading stain does.
 */
export function bloodOpacityAt(mark: BloodMark): number {
  if (!(mark.lifetimeS > 0)) return 0;
  const progress = Math.min(1, Math.max(0, mark.ageS / mark.lifetimeS));
  return mark.kind === 'pool' ? Math.min(1, (1 - progress) * 3) : 1 - progress;
}