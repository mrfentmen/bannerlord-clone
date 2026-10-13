/**
 * Damage decals on a struck model.
 *
 * Task 629: a shot that lands leaves a mark. Babylon projects a decal by
 * building a small cube mesh and pushing it through the target's geometry, so
 * this module's job is the placement arithmetic and the bookkeeping around it:
 * where the mark sits, how it is oriented, how big it is, how many a surface may
 * carry, and when it fades.
 *
 * Two details do the real work.
 *
 * The decal cube is grown along the surface normal before projection. Without
 * that, a mark on a surface at a grazing angle is culled by the projection and
 * simply does not appear -- which reads as the game dropping hits, not as a
 * cosmetic limitation.
 *
 * Marks fade and are disposed rather than accumulating. A firefight can put
 * hundreds of marks on one wall, and an unbounded decal list is a memory leak
 * with a visible symptom: the frame rate falls for the rest of the battle.
 */

/** A hit's position and the surface it struck. */
export interface HitPoint {
  /** World position of the impact. */
  position: { x: number; y: number; z: number };
  /** Surface normal at the impact, unit length. */
  normal: { x: number; y: number; z: number };
}

/** Everything needed to build one decal. */
export interface DecalPlacement {
  /** Stable name, `<targetId>#<slot>`, so an expired mark can be identified. */
  id: string;
  /** Position, pushed out along the normal so the projection cannot cull it. */
  position: { x: number; y: number; z: number };
  /** Normal the decal was placed against. */
  normal: { x: number; y: number; z: number };
  /** Cube edge length in metres -- this is the decal's size. */
  size: number;
  /** Radians around the normal, so two hits do not look stamped from one mould. */
  angle: number;
  /** Index within the target's decal budget; -1 once the budget is spent. */
  slot: number;
  /** Seconds until the mark has faded and can be disposed. */
  lifetimeS: number;
}

/** Tuning for decals. */
export interface DecalPolicy {
  /**
   * Metres the placement is pushed out along the normal. Must be more than the
   * target's tessellation error or grazing hits vanish; 0.02 m is 2 cm, which
   * is inside the tolerance for the staged models' triangle sizes.
   */
  surfaceOffsetM: number;
  /** Cube edge for a bullet mark, metres. */
  bulletSizeM: number;
  /** Cube edge for an explosion, metres. */
  explosionSizeM: number;
  /** Most marks one target may carry at once. */
  maxPerTarget: number;
  /** Seconds a bullet mark stays before it fades out. */
  bulletLifetimeS: number;
  /** Seconds an explosion mark stays. */
  explosionLifetimeS: number;
  /** How much of the budget may be spent by one incoming burst, 0..1. */
  burstShare: number;
}

/** Marks small, short-lived and plentiful; explosions few, large and slow. */
export const DEFAULT_DECAL_POLICY: DecalPolicy = {
  surfaceOffsetM: 0.02,
  bulletSizeM: 0.12,
  explosionSizeM: 0.9,
  maxPerTarget: 24,
  bulletLifetimeS: 12,
  explosionLifetimeS: 30,
  burstShare: 0.5,
};

/**
 * Largest share of a decal's own size its surface offset may be. Below 0.5 the
 * decal cube still straddles the surface it is projected onto; at or above it,
 * the cube stops intersecting the target and the mark disappears.
 */
export const SURFACE_OFFSET_MAX_FRACTION = 0.4;

/** What kind of impact left the mark. */
export type DecalKind = 'bullet' | 'explosion';

/** Unit length of a vector, 0 for a degenerate one. */
function lengthOf(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Normalises a normal, falling back to straight up.
 *
 * A zero normal would put every mark on the same spot with an undefined
 * orientation; a mark on the ground is a better guess than a broken transform.
 */
export function safeNormal(normal: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const length = lengthOf(normal);
  if (!Number.isFinite(length) || length <= 0) return { x: 0, y: 1, z: 0 };
  return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
}

/** A deterministic angle in 0..2π, derived from the impact position. */
function angleFor(position: { x: number; y: number; z: number }): number {
  const hash = Math.abs(position.x * 73856093 + position.y * 19349663 + position.z * 83492791);
  return (hash % 6283) / 1000;
}

/** Budget for one target: how many decals, and how many are live. */
export interface DecalBudget {
  targetId: string;
  /** How many marks the policy allows. */
  max: number;
  /** How many are currently live. */
  live: number;
  /** Marks released so far, for a log line. */
  released: number;
}

/** A live mark, as the scene tracks it. */
export interface LiveDecal {
  targetId: string;
  placement: DecalPlacement;
  kind: DecalKind;
  /** Seconds left before it may be disposed. */
  ageS: number;
}

/**
 * Task 629: the placement for one impact.
 *
 * Returns null when the target's budget is spent, which is the honest answer:
 * a firefight puts far more rounds into a wall than a wall should hold marks
 * for, and dropping the surplus keeps the frame cost flat.
 */
export function placeDecal(
  targetId: string,
  hit: HitPoint,
  slot: number,
  kind: DecalKind = 'bullet',
  policy: DecalPolicy = DEFAULT_DECAL_POLICY,
): DecalPlacement | null {
  if (!Number.isFinite(slot) || slot < 0 || slot >= policy.maxPerTarget) return null;
  const normal = safeNormal(hit.normal);
  const size = kind === 'explosion' ? policy.explosionSizeM : policy.bulletSizeM;
  // The offset has to be *smaller than half the decal*: Babylon projects by
  // clipping the decal cube against the target, so a cube pushed clear of the
  // surface has nothing left to clip and the mark silently does not appear.
  const offset = Math.min(policy.surfaceOffsetM, size * SURFACE_OFFSET_MAX_FRACTION);
  return {
    id: `${targetId}#${slot}`,
    position: {
      x: hit.position.x + normal.x * offset,
      y: hit.position.y + normal.y * offset,
      z: hit.position.z + normal.z * offset,
    },
    normal,
    size,
    angle: angleFor(hit.position),
    slot,
    lifetimeS: kind === 'explosion' ? policy.explosionLifetimeS : policy.bulletLifetimeS,
  };
}

/** The budget tracker for every struck target in a scene. */
export class DecalBudgets {
  private readonly budgets = new Map<string, DecalBudget>();

  constructor(private readonly policy: DecalPolicy = DEFAULT_DECAL_POLICY) {}

  /**
   * How many marks a target may still take. Reading does not create a budget:
   * asking about a target nobody has hit must not add it to the debug overlay.
   */
  remaining(targetId: string): number {
    const budget = this.budgets.get(targetId);
    if (!budget) return this.policy.maxPerTarget;
    return Math.max(0, budget.max - budget.live);
  }

  /** Adds a mark, or returns null when the target is full. */
  admit(targetId: string): number | null {
    const budget = this.budgetFor(targetId);
    if (budget.live >= budget.max) return null;
    const slot = budget.live;
    budget.live++;
    return slot;
  }

  /** Releases one slot, e.g. when a mark has faded. */
  release(targetId: string): boolean {
    const budget = this.budgets.get(targetId);
    if (!budget || budget.live <= 0) return false;
    budget.live--;
    budget.released++;
    return true;
  }

  /** How many of a burst the budget will take, at most. */
  admitBurst(targetId: string, shots: number): number[] {
    const budget = this.budgetFor(targetId);
    const share = Math.max(1, Math.floor(budget.max * Math.min(1, Math.max(0, this.policy.burstShare))));
    const wanted = Math.max(0, Math.floor(shots));
    const take = Math.min(wanted, share, Math.max(0, budget.max - budget.live));
    const slots: number[] = [];
    for (let i = 0; i < take; i++) {
      const slot = budget.live;
      budget.live++;
      slots.push(slot);
    }
    return slots;
  }

  /** Drops every target's bookkeeping, e.g. when the battle ends. */
  clear(): void {
    this.budgets.clear();
  }

  /** A snapshot of every budget, for a debug overlay. */
  snapshot(): DecalBudget[] {
    return [...this.budgets.values()].map((b) => ({ ...b }));
  }

  private budgetFor(targetId: string): DecalBudget {
    let budget = this.budgets.get(targetId);
    if (!budget) {
      budget = { targetId, max: this.policy.maxPerTarget, live: 0, released: 0 };
      this.budgets.set(targetId, budget);
    }
    return budget;
  }
}

/** One frame of decal ageing. */
export interface DecalFadeResult {
  /** Marks that have run out of lifetime and must be disposed. */
  expired: string[];
  /** Marks still alive, with their new ages. */
  live: LiveDecal[];
}

/**
 * Task 629: age the live marks and report the ones that have expired.
 *
 * A scene calls this once a frame and disposes whatever comes back in
 * `expired`, which is what keeps the decal list bounded no matter how long the
 * firefight runs.
 */
export function ageDecals(
  decals: readonly LiveDecal[],
  deltaS: number,
): DecalFadeResult {
  const step = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
  const expired: string[] = [];
  const live: LiveDecal[] = [];
  for (const decal of decals) {
    const age = (Number.isFinite(decal.ageS) ? Math.max(0, decal.ageS) : 0) + step;
    if (age >= decal.placement.lifetimeS) {
      expired.push(decal.placement.id);
      continue;
    }
    live.push({ ...decal, ageS: age });
  }
  return { expired, live };
}

/**
 * Fade factor for a mark at a given age, 1 while fresh and 0 at the end of its
 * life. An explosion holds full strength for most of its life and drops off at
 * the end, which is what a scorch mark does; a bullet mark fades throughout.
 */
export function decalOpacityAt(
  decal: LiveDecal,
  kind: DecalKind = 'bullet',
): number {
  const lifetime = decal.placement.lifetimeS;
  if (!(lifetime > 0)) return 0;
  const progress = Math.min(1, Math.max(0, decal.ageS / lifetime));
  return kind === 'explosion' ? Math.min(1, (1 - progress) * 2.5) : 1 - progress;
}