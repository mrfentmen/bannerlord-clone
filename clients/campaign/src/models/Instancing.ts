/**
 * Thin instancing for repeated props.
 *
 * Task 611: a palisade line, a row of crates or a field of sandbags is the
 * same mesh drawn many times. Cloning the mesh per placement costs one draw
 * call each; Babylon's thin instances put every placement's matrix in one
 * buffer, so the whole row is one draw call and one copy of the geometry in
 * memory. That is the difference between a fence that costs 40 draw calls and
 * one that costs 1.
 *
 * The buffer layout is Babylon's: 16 floats per placement, column-major, which
 * is what `Matrix.Compose` produces. This module builds that buffer without an
 * engine so the arithmetic is testable on its own, and
 * {@link PropInstancer} applies it to a real mesh.
 *
 * Two fallbacks matter. A mesh with no thin-instance support (an old engine, a
 * mesh type that opts out) falls back to `createInstance`, which still shares
 * the geometry. And a caller can pass a hard cap, because "draw 200 000
 * crates" is a content bug that should be reported once rather than freezing
 * the tab.
 */

import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
// Side-effect import: adds `thinInstanceSetBuffer` to Mesh. Without it the
// engine has the class but not the thin-instance extension, and every batch
// would silently fall back to clones.
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/** Floats in one 4x4 matrix, the stride of Babylon's instance buffer. */
export const MATRIX_FLOATS = 16;

/**
 * One copy of a prop. Rotation is yaw-only: props on a field are placed, not
 * oriented, and a full quaternion per placement costs more than it is worth.
 */
export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Radians around Y, default 0. */
  yaw?: number;
  /** Uniform scale, default 1. */
  scale?: number;
}

/** True when a placement has three usable finite coordinates. */
export function isUsablePlacement(p: Placement): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/**
 * Builds the instance matrix buffer: {@link MATRIX_FLOATS} floats per
 * placement, in the order the placements were given.
 *
 * Unusable placements are skipped rather than turned into `NaN` geometry,
 * which is what would happen if they were written through -- a single bad
 * entry silently kills the whole buffer on the GPU side.
 */
export function buildInstanceMatrices(placements: readonly Placement[]): Float32Array {
  const usable = placements.filter(isUsablePlacement);
  const out = new Float32Array(usable.length * MATRIX_FLOATS);
  const rotation = new Quaternion();
  const scale = new Vector3();
  const matrix = new Matrix();
  for (let i = 0; i < usable.length; i++) {
    const p = usable[i] as Placement;
    const s = Number.isFinite(p.scale) && (p.scale as number) > 0 ? (p.scale as number) : 1;
    Quaternion.RotationYawPitchRollToRef(p.yaw ?? 0, 0, 0, rotation);
    scale.set(s, s, s);
    Matrix.ComposeToRef(scale, rotation, new Vector3(p.x, p.y, p.z), matrix);
    matrix.copyToArray(out, i * MATRIX_FLOATS);
  }
  return out;
}

/** How many placements were dropped as unusable. */
export function countUnusablePlacements(placements: readonly Placement[]): number {
  return placements.filter((p) => !isUsablePlacement(p)).length;
}

/** How thin instancing was carried out. */
export type InstancingStrategy = 'thin' | 'clone-fallback' | 'none';

/** What {@link PropInstancer.apply} actually did. */
export interface InstancingReport {
  /** The path taken. */
  strategy: InstancingStrategy;
  /** Placements drawn. */
  drawn: number;
  /** Placements skipped because the cap was hit. */
  dropped: number;
  /** Placements skipped because their coordinates were not finite. */
  unusable: number;
}

/** Options for {@link PropInstancer}. */
export interface PropInstancerOptions {
  /**
   * Hard cap on drawn placements. Anything past it is dropped and reported,
   * so a runaway content number cannot stall the frame. 0 means no cap.
   */
  maxPlacements?: number;
  /**
   * Force the per-instance fallback even when the mesh supports thin
   * instances. Tests use it to prove the fallback path really works.
   */
  forceInstanceFallback?: boolean;
  /** Reports a dropped overflow once per apply; defaults to a console warn. */
  onOverflow?: (dropped: number, cap: number) => void;
}

/** The part of a mesh this module needs; a real Babylon Mesh satisfies it. */
export interface InstancingTarget {
  name: string;
  thinInstanceSetBuffer?: (kind: string, buffer: Float32Array, stride: number, staticBuffer?: boolean) => void;
  thinInstanceRefreshBoundingInfo?: (refreshChildren?: boolean) => void;
  createInstance?: (name: string) => unknown;
}

/**
 * Puts a batch of identical props on a template mesh.
 *
 * The template itself stays undrawn ({@link InstancingTarget} callers normally
 * do that themselves); only the placements are rendered, so the prop's cost is
 * one draw call no matter how many copies the field has.
 */
export class PropInstancer {
  private strategy: InstancingStrategy = 'none';
  private lastDrawn = 0;

  constructor(private readonly options: PropInstancerOptions = {}) {}

  /**
   * Applies `placements` to `mesh`. Re-applying replaces the previous batch,
   * which is what a moving formation needs: one buffer, rewritten per frame
   * with `staticBuffer: false`.
   */
  apply(mesh: InstancingTarget, placements: readonly Placement[]): InstancingReport {
    const cap = this.options.maxPlacements ?? 0;
    const capped = cap > 0 ? placements.slice(0, cap) : placements;
    const droppedByCap = placements.length - capped.length;
    const unusable = countUnusablePlacements(capped);
    if (droppedByCap > 0) {
      const report = this.options.onOverflow;
      if (report) report(droppedByCap, cap);
      else console.warn(`PropInstancer: dropped ${droppedByCap} placements over cap ${cap}`);
    }

    const canThin = !this.options.forceInstanceFallback && typeof mesh.thinInstanceSetBuffer === 'function';
    if (canThin) {
      const buffer = buildInstanceMatrices(capped);
      mesh.thinInstanceSetBuffer?.('matrix', buffer, MATRIX_FLOATS, false);
      mesh.thinInstanceRefreshBoundingInfo?.(true);
      this.strategy = 'thin';
      this.lastDrawn = capped.length - unusable;
      return { strategy: 'thin', drawn: this.lastDrawn, dropped: droppedByCap, unusable };
    }

    if (typeof mesh.createInstance === 'function') {
      for (let i = 0; i < capped.length; i++) {
        const p = capped[i] as Placement;
        if (!isUsablePlacement(p)) continue;
        mesh.createInstance(`${mesh.name}_${i}`);
      }
      this.strategy = 'clone-fallback';
      this.lastDrawn = capped.length - unusable;
      return {
        strategy: 'clone-fallback',
        drawn: this.lastDrawn,
        dropped: droppedByCap,
        unusable,
      };
    }

    // The mesh can draw neither way: every capped placement is lost, and
    // `unusable` is reported separately so the two causes stay distinct.
    this.strategy = 'none';
    this.lastDrawn = 0;
    return {
      strategy: 'none',
      drawn: 0,
      dropped: droppedByCap + (capped.length - unusable),
      unusable,
    };
  }

  /** How the last {@link apply} was carried out. */
  lastStrategy(): InstancingStrategy {
    return this.strategy;
  }

  /** How many placements the last {@link apply} drew. */
  lastDrawnCount(): number {
    return this.lastDrawn;
  }
}

/**
 * Convenience for the common case: a real Babylon mesh, one batch, the
 * reported outcome. Everything interesting lives in {@link PropInstancer}.
 */
export function instanceProp(
  mesh: Mesh,
  placements: readonly Placement[],
  options: PropInstancerOptions = {},
): InstancingReport {
  return new PropInstancer(options).apply(mesh, placements);
}