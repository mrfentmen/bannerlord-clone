/**
 * CPU skinning baseline.
 *
 * SPEC.md section 5.1: "No per-instance CPU bone skinning past a few dozen units." That is a claim
 * about hardware, so it gets measured rather than asserted.
 *
 * What this measures: for N units, transform every vertex of the close-tier mesh by its 4 weighted
 * bone matrices on one CPU core, for one frame, which is what a non-instanced CPU-skinned renderer
 * would have to do per frame.
 *
 * Two details make the number real rather than flattering:
 *
 *  - The joint matrices are sampled ONCE per frame into a flat buffer, not per vertex. Sampling per
 *    vertex would be a strawman: no renderer does that, and it would inflate the result.
 *  - The output is folded into a checksum that is reported. Without a consumer, V8 deletes the
 *    whole loop as dead code and reports a fraction of a millisecond for 2.9 million transforms,
 *    which is what the first version of this file did.
 *
 * The measured column is single-threaded and excludes rendering, the LOD repartition and the
 * simulation, so it is a floor on the cost, not the whole cost.
 */

import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { AnimHeader } from "./config";
import type { ProcessedMesh, TroopSources } from "./glb";

export interface CpuRow {
  units: number;
  vertsPerUnit: number;
  /** Vertex transforms performed in one frame. */
  vertexTransforms: number;
  /** Measured milliseconds for one frame of CPU skinning, median of the repeats. */
  msPerFrame: number;
  msPerFrameRange: [number, number];
  /** Upper bound on the frame rate the skinning alone permits. */
  impliedMaxFps: number;
  /** Milliseconds to skin every unit once, which is what one second of animation costs at fps. */
  msPerSecondOfAnim: number;
  /** Fraction of a 60 fps budget that the skinning alone consumes. */
  shareOfBudget60: number;
}

export interface CpuBaselineResult {
  mesh: string;
  vertsPerUnit: number;
  jointCount: number;
  rows: CpuRow[];
  /** Checksum of the last frame's output, so the work provably happened. */
  checksum: number;
  conclusion: string;
  gpuComparison: string;
}

const REPEATS = 5;
const WARMUP = 2;

export function runCpuBaselineSync(
  header: AnimHeader,
  data: Float32Array,
  body: ProcessedMesh,
  counts: number[]
): CpuBaselineResult {
  const nVerts = body.vertexCount;
  const jc = Math.min(header.joints.length, body.jointCount);
  const positions = body.position;
  const joints = body.joints;
  const weights = body.weights;
  const clip = Object.values(header.clips)[0];
  const rowCount = Math.max(1, clip.rowCount);
  const w = header.width * 4; // floats per row of the RGBA32F texture

  // 25 joints x 16 floats, sampled once per frame.
  const bones = new Float64Array(jc * 16);
  const out = new Float64Array(nVerts * 3);
  let checksum = 0;

  function sampleFrame(t: number): void {
    const u = t - Math.floor(t);
    const rowF = u * (rowCount - 1);
    const r0 = Math.floor(rowF);
    const r1 = Math.min(r0 + 1, header.height - 1);
    const f = rowF - r0;
    const a = r0 * w;
    const b = r1 * w;
    for (let j = 0; j < jc; j++) {
      const src = j * 16;
      const dst = j * 16;
      for (let i = 0; i < 16; i++) {
        const va = data[a + src + i];
        bones[dst + i] = va + (data[b + src + i] - va) * f;
      }
    }
  }

  /** One unit's worth of linear blend skinning, matching the vertex shader's arithmetic. */
  function skinOneUnit(unitOffset: number): void {
    for (let v = 0; v < nVerts; v++) {
      const x = positions[v * 3] + unitOffset;
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (let k = 0; k < 4; k++) {
        const wt = weights[v * 4 + k];
        if (wt === 0) continue;
        const m = joints[v * 4 + k] * 16;
        ax += wt * (bones[m] * x + bones[m + 1] * y + bones[m + 2] * z + bones[m + 3]);
        ay += wt * (bones[m + 4] * x + bones[m + 5] * y + bones[m + 6] * z + bones[m + 7]);
        az += wt * (bones[m + 8] * x + bones[m + 9] * y + bones[m + 10] * z + bones[m + 11]);
      }
      out[v * 3] = ax;
      out[v * 3 + 1] = ay;
      out[v * 3 + 2] = az;
    }
  }

  function consume(): number {
    let s = 0;
    for (let i = 0; i < out.length; i += 97) s += out[i];
    return s;
  }

  const rows: CpuRow[] = [];
  for (const units of counts) {
    for (let wu = 0; wu < WARMUP; wu++) {
      sampleFrame(wu / WARMUP);
      for (let u = 0; u < units; u++) skinOneUnit(u * 1.35);
    }
    const samples: number[] = [];
    for (let r = 0; r < REPEATS; r++) {
      sampleFrame((r + 1) / (REPEATS + 1));
      const t0 = performance.now();
      for (let u = 0; u < units; u++) skinOneUnit(u * 1.35);
      samples.push(performance.now() - t0);
      checksum = consume();
    }
    samples.sort((a, b) => a - b);
    const ms = samples[Math.floor(samples.length / 2)];
    rows.push({
      units,
      vertsPerUnit: nVerts,
      vertexTransforms: nVerts * units,
      msPerFrame: ms,
      msPerFrameRange: [samples[0], samples[samples.length - 1]],
      impliedMaxFps: ms > 0 ? 1000 / ms : Infinity,
      msPerSecondOfAnim: ms * header.fps,
      shareOfBudget60: (ms * header.fps) / 16.67,
    });
  }

  const r300 = rows.find((r) => r.units >= 300) ?? rows[rows.length - 1];
  const conclusion =
    `One CPU core spends ${r300.msPerFrame.toFixed(1)} ms per frame skinning ${r300.units} units ` +
    `of the close-tier mesh (${r300.vertexTransforms.toLocaleString()} vertex transforms), which is ` +
    `${(r300.shareOfBudget60 * 100).toFixed(0)}% of a 16.67 ms frame at the baked ${header.fps} fps. ` +
    `That excludes rendering, the LOD repartition and the simulation, and it is a single core: ` +
    `the crowd renderer is drawing the same ${r300.vertexTransforms.toLocaleString()} transforms on ` +
    `the GPU with no per-unit CPU cost at all.`;

  return {
    mesh: body.name,
    vertsPerUnit: nVerts,
    jointCount: jc,
    rows,
    checksum,
    conclusion,
    gpuComparison:
      `GPU path: 25 joints x 16 floats = one 100x135 RGBA32F texture (216,000 bytes) uploaded once, ` +
      `then 4 texel fetches per influence per vertex. No per-frame CPU cost scales with unit count.`,
  };
}

export async function runCpuBaseline(opts: {
  engine: Engine;
  scene: Scene;
  header: AnimHeader;
  animData: Float32Array;
  sources: TroopSources;
  counts: number[];
}): Promise<CpuBaselineResult> {
  await new Promise((r) => setTimeout(r, 0));
  return runCpuBaselineSync(opts.header, opts.animData, opts.sources.body.close, opts.counts);
}
