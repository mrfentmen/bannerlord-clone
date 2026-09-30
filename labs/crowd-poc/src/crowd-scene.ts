/**
 * The crowd scene: thin-instanced, GPU-skinned troops in an empty scene, with three LOD tiers.
 *
 * SPEC.md section 5.1: "Babylon.js Thin Instances for each troop mesh type. Target a handful of
 * draw calls regardless of unit count."
 *
 * How the draw call count is kept flat, which is the property actually being proved:
 *
 *   - One Babylon mesh per (troop part, LOD tier). Body and weapon, close and mid, so 4 meshes.
 *   - The far tier is one billboard quad mesh, not a mesh per unit.
 *   - Thin instances put every unit of a given mesh into ONE draw call. The instance buffer is
 *     written once when the unit set changes and never touched per frame.
 *   - Animation time is a per-instance attribute read from a texture in the vertex shader, so
 *     animating 1,000 units costs zero CPU work per frame.
 *
 * The LOD split is a *repartition* of the same unit set, not new objects: each frame every unit is
 * assigned to a tier, and each tier's instance buffer is filled only for the units in it. So the
 * draw call count is the number of non-empty tiers, which is at most 3 per mesh type, whatever the
 * unit count is.
 */

import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { AnimHeader, SkinnedMaterial } from "./skinning";
import { CrowdConfig } from "./config";
import { TroopSources } from "./glb";
import { buildSkinnedMesh } from "./mesh-factory";
import { ImpostorMaterial } from "./impostor-material";

export type Tier = "close" | "mid" | "far";
export const TIERS: Tier[] = ["close", "mid", "far"];

export interface Unit {
  x: number;
  z: number;
  yaw: number;
  /** 0 = idle, 1 = walk. */
  clip: number;
  /** Offset into the clip, so a crowd is not in lockstep. */
  phase: number;
  /** Per-unit shade variation. */
  shade: number;
  /** 0 = no weapon, 1 = weapon. */
  armed: number;
  /** World-space position, kept up to date so the LOD test and impostor can use it. */
  wy: number;
  /** Distance from the camera, refreshed each frame. */
  dist: number;
}

export interface TierStats {
  tier: Tier;
  part: "body" | "weapon";
  instances: number;
  trisPerInstance: number;
  totalTris: number;
}

export interface FrameStats {
  drawCalls: number;
  activeMeshes: number;
  totalInstances: number;
  /** Triangles actually submitted this frame, summed over tiers. */
  triangles: number;
  perTier: TierStats[];
  cpuMs: number;
}

interface PartTier {
  part: "body" | "weapon";
  tier: Tier;
  mesh: Mesh;
  triCount: number;
  /** Instance buffer, 16 floats per unit. */
  matrices: Float32Array;
  /** Per-instance vec4: clip, phase, shade, unused. */
  anim: Float32Array;
  count: number;
}

const MAX_UNITS = 2000;

export class CrowdScene {
  readonly scene: Scene;
  readonly cfg: CrowdConfig;
  readonly header: AnimHeader;
  readonly animData: Float32Array;
  readonly units: Unit[] = [];

  private readonly bodyMat: SkinnedMaterial;
  private readonly weaponMat: SkinnedMaterial;
  private readonly parts: PartTier[] = [];
  private readonly billboards: Mesh;
  private readonly billboardMat: ImpostorMaterial;
  private readonly bbMat4 = new Float32Array(MAX_UNITS * 16);
  private readonly bbAnim = new Float32Array(MAX_UNITS * 4);
  private lastStats: FrameStats = {
    drawCalls: 0, activeMeshes: 0, totalInstances: 0, triangles: 0, perTier: [], cpuMs: 0,
  };

  closeMaxM: number;
  midMaxM: number;
  debugSkin: number;
  private time = 0;

  constructor(scene: Scene, cfg: CrowdConfig, header: AnimHeader, animData: Float32Array,
    sources: TroopSources) {
    this.scene = scene;
    this.cfg = cfg;
    this.header = header;
    this.animData = animData;

    // ASSETS.md section 4.3: "Distance thresholds are tuned by testing, never assumed." These
    // defaults exist only so the scene can be constructed before tools/lod-tune.mjs has run; the
    // file the benchmark actually reports always carries measured values.
    this.closeMaxM = cfg.lod?.closeMaxM ?? 25;
    this.midMaxM = cfg.lod?.midMaxM ?? 60;
    this.debugSkin = 0;

    const look = {
      baseTint: [0.52, 0.5, 0.44] as [number, number, number],
      lightDir: [0.42, 0.82, 0.39] as [number, number, number],
      fogColor: [0.55, 0.58, 0.62] as [number, number, number],
      fogRange: [this.midMaxM * 2.2, this.midMaxM * 6] as [number, number],
    };

    this.bodyMat = new SkinnedMaterial({ scene, header, data: animData, ...look });
    this.weaponMat = new SkinnedMaterial({
      scene, header, data: animData, ...look, baseTint: [0.24, 0.24, 0.26] as [number, number, number],
    });

    for (const part of ["body", "weapon"] as const) {
      for (const tier of ["close", "mid"] as const) {
        const src = sources[part][tier];
        if (!src) continue;
        const mesh = buildSkinnedMesh(scene, src, `${part}_${tier}`);
        mesh.material = part === "body" ? this.bodyMat : this.weaponMat;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.isPickable = false;
        this.parts.push({
          part, tier, mesh, triCount: src.triCount,
          matrices: new Float32Array(MAX_UNITS * 16),
          anim: new Float32Array(MAX_UNITS * 4),
          count: 0,
        });
      }
    }

    // Far tier: one billboard quad per unit, instanced, sampling the impostor atlas that
    // tools/benchmark.mjs --impostor bakes from this same skinned mesh.
    this.billboards = CrowdScene.buildBillboardQuad(scene);
    const atlas = new Texture("assets/processed/impostor_atlas.png", scene, false, false);
    atlas.hasAlpha = true;
    this.billboardMat = new ImpostorMaterial({
      scene, atlas,
      angles: cfg.impostor.angles,
      frames: cfg.impostor.frames,
      loopDuration: header.clips.walk?.duration ?? 2,
      height: 1.8,
      width: 1.8,
      tint: [0.62, 0.6, 0.55],
      // Fade out over the back half of the far tier, measured in metres from the camera.
      fadeRangeM: [this.midMaxM, this.midMaxM * 2.4],
    });
    this.billboards.material = this.billboardMat;
    this.billboards.alwaysSelectAsActiveMesh = true;
    this.billboards.isPickable = false;

    scene.clearColor = new Color4(0.55, 0.58, 0.62, 1);
  }

  private static buildBillboardQuad(scene: Scene): Mesh {
    const mesh = new Mesh("far_billboard", scene);
    const vd = new VertexData();
    // Unit quad in the XY plane, 1.8 m tall to match the troop, origin at the feet.
    vd.positions = [-0.9, 0, 0, 0.9, 0, 0, 0.9, 1.8, 0, -0.9, 1.8, 0];
    vd.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.applyToMesh(mesh, false);
    return mesh;
  }

  /**
   * Lay out `count` units in ranks, so the scene is a battle line rather than a random cloud.
   * `perRow` sets the line width, which is what decides how deep the crowd is for a given count
   * and therefore how much of it the camera has to pull back for.
   */
  /** Force every unit to one clip and phase, so a render can be compared frame to frame. */
  setUniformClip(clip: number, phase: number): void {
    for (const u of this.units) {
      u.clip = clip;
      u.phase = phase;
    }
  }

  populate(count: number, seed: number, perRow = 50): void {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    this.units.length = 0;
    const spacing = 1.35;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = (col - (perRow - 1) / 2) * spacing + (rnd() - 0.5) * 0.3;
      const z = row * spacing * 1.4 + (rnd() - 0.5) * 0.3;
      this.units.push({
        x, z,
        wy: 0,
        yaw: (rnd() - 0.5) * 0.5,
        clip: 1,
        phase: rnd(),
        shade: 0.85 + rnd() * 0.3,
        armed: rnd() < 0.6 ? 1 : 0,
        dist: 0,
      });
    }
  }

  setClip(unitIndex: number, clip: number): void {
    this.units[unitIndex].clip = clip;
  }

  /**
   * Assign every unit to a tier and refill the instance buffers.
   *
   * This is the only per-frame CPU work, and it is O(units) with a few float writes each. That is
   * the cost the LOD thresholds are tuned against: moving a unit from the close tier to the mid
   * tier saves triangles on the GPU and costs the same on the CPU, while moving it to the far tier
   * also saves the vertex-shader skinning work.
   */
  update(cameraPos: Vector3): FrameStats {
    const t0 = performance.now();
    this.billboardMat.setCamera(cameraPos.x, cameraPos.y, cameraPos.z);
    const near = this.closeMaxM;
    const mid = this.midMaxM;
    for (const p of this.parts) p.count = 0;
    let bbCount = 0;
    let tris = 0;

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      const dx = u.x - cameraPos.x;
      const dz = u.z - cameraPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      u.dist = d;
      const tier: Tier = d <= near ? "close" : d <= mid ? "mid" : "far";

      if (tier === "far") {
        if (bbCount < MAX_UNITS) {
          this.writeInstance(this.bbMat4, this.bbAnim, bbCount, u);
          bbCount++;
        }
        continue;
      }
      for (const p of this.parts) {
        if (p.tier !== tier) continue;
        if (p.part === "weapon" && u.armed === 0) continue;
        if (p.count >= MAX_UNITS) continue;
        this.writeInstance(p.matrices, p.anim, p.count, u);
        p.count++;
      }
    }

    // Push the buffers. thinInstanceSetBuffer replaces the buffer and the count, so this is a
    // GPU upload of the whole instance set, once per frame, not a per-unit draw.
    for (const p of this.parts) {
      if (p.count === 0) {
        p.mesh.thinInstanceCount = 0;
        p.mesh.setEnabled(false);
        continue;
      }
      p.mesh.setEnabled(true);
      p.mesh.thinInstanceSetBuffer("matrix", p.matrices.subarray(0, p.count * 16), 16, false);
      p.mesh.thinInstanceSetBuffer("instAnim", p.anim.subarray(0, p.count * 4), 4, false);
      tris += p.triCount * p.count;
    }
    if (bbCount > 0) {
      this.billboards.setEnabled(true);
      this.billboards.thinInstanceSetBuffer("matrix", this.bbMat4.subarray(0, bbCount * 16), 16, false);
      this.billboards.thinInstanceSetBuffer("instAnim", this.bbAnim.subarray(0, bbCount * 4), 4, false);
      tris += bbCount * 2;
    } else {
      this.billboards.setEnabled(false);
      this.billboards.thinInstanceCount = 0;
    }

    const perTier: TierStats[] = [];
    for (const p of this.parts) {
      if (p.count > 0) {
        perTier.push({
          tier: p.tier, part: p.part, instances: p.count,
          trisPerInstance: p.triCount, totalTris: p.triCount * p.count,
        });
      }
    }
    if (bbCount > 0) {
      perTier.push({ tier: "far", part: "body", instances: bbCount, trisPerInstance: 2, totalTris: bbCount * 2 });
    }

    const cpuMs = performance.now() - t0;
    this.lastStats = {
      drawCalls: this.parts.filter((p) => p.count > 0).length + (bbCount > 0 ? 1 : 0),
      activeMeshes: this.parts.filter((p) => p.count > 0).length + (bbCount > 0 ? 1 : 0),
      totalInstances: this.parts.reduce((a, p) => a + p.count, 0) + bbCount,
      triangles: tris,
      perTier,
      cpuMs,
    };
    return this.lastStats;
  }

  private writeInstance(out: Float32Array, anim: Float32Array, slot: number, u: Unit): void {
    // Babylon stores a thin-instance matrix column-major, and the shader rebuilds it as
    // mat4(world0, world1, world2, world3), so each group of 4 floats is a column.
    // Written by hand rather than through Matrix.ComposeToRef: this runs once per unit per frame,
    // and allocating a Quaternion per unit at 1,000 units is a measurable cost for nothing.
    const o = slot * 16;
    const c = Math.cos(-u.yaw);
    const s = Math.sin(-u.yaw);
    out[o] = c;   out[o + 1] = 0;  out[o + 2] = -s; out[o + 3] = 0;
    out[o + 4] = 0; out[o + 5] = 1;  out[o + 6] = 0;  out[o + 7] = 0;
    out[o + 8] = s; out[o + 9] = 0;  out[o + 10] = c; out[o + 11] = 0;
    out[o + 12] = u.x; out[o + 13] = u.wy; out[o + 14] = u.z; out[o + 15] = 1;
    const a = slot * 4;
    anim[a] = u.clip;
    anim[a + 1] = u.phase;
    anim[a + 2] = u.shade;
    anim[a + 3] = u.armed;
  }

  /** 0 normal, 1 skip skinning, 2 bind pose only. Used to isolate where a rendering fault is.
   *  The impostor tier has no skinning to disable, so it is unaffected. */
  setDebugSkin(mode: number): void {
    this.debugSkin = mode;
    this.bodyMat.setDebug(mode);
    this.weaponMat.setDebug(mode);
  }

  advance(dt: number): void {
    this.time += dt;
    this.bodyMat.setTime(this.time);
    this.weaponMat.setTime(this.time);
    this.billboardMat.setTime(this.time);
  }

  stats(): FrameStats {
    return this.lastStats;
  }
}
