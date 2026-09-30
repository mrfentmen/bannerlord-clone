/**
 * In-page benchmark runner.
 *
 * Reports measured values only. Where a number is not available on this hardware (GPU timer
 * queries are not exposed in every browser) it is reported as null rather than estimated, because
 * CONSTITUTION.md section 7.3 does not allow a logged number that was not measured.
 */

import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CrowdScene, FrameStats } from "./crowd-scene";

export interface BenchResult {
  units: number;
  /** Wall-clock frames per second, measured over the sample window. */
  fps: number;
  frames: number;
  seconds: number;
  /** Real draw calls, from Babylon's own per-frame counter. */
  drawCalls: number;
  activeMeshes: number;
  instances: number;
  triangles: number;
  /** CPU ms spent in this repo's per-frame instance and LOD repartition. */
  cpuUpdateMs: number;
  /** Babylon's own CPU-side render submission time, ms per frame. */
  babylonRenderMs: number;
  /** GPU time per frame from a timer query, or null if this browser exposes none. */
  gpuFrameMs: number | null;
  /** Whether a GPU timer query was available at all. */
  gpuTimerAvailable: boolean;
  /** Wall-clock frame time from rAF deltas, ms. Includes everything. */
  frameMs: number;
  perTier: FrameStats["perTier"];
  closeMaxM: number;
  midMaxM: number;
  camRadius: number;
  camPos: [number, number, number];
  distMin: number;
  distMax: number;
}

export interface BenchOptions {
  scene: Scene;
  crowd: CrowdScene;
  /** Frames to discard, so shader compilation and first uploads are not counted. */
  warmupFrames?: number;
  /** Frames to measure. */
  sampleFrames?: number;
  /** Camera distance from the crowd centre, metres. Fixed so runs are comparable. */
  cameraDistance?: number;
}

export async function runBenchmark(opts: BenchOptions): Promise<BenchResult> {
  const { scene, crowd } = opts;
  const warmup = opts.warmupFrames ?? 120;
  const sample = opts.sampleFrames ?? 300;
  const camDist = opts.cameraDistance ?? 90;

  const instr = new SceneInstrumentation(scene as never);
  instr.captureFrameTime = true;
  instr.captureRenderTime = true;
  instr.captureInterFrameTime = true;
  instr.captureActiveMeshesEvaluationTime = true;
  const engineInstr = new EngineInstrumentation(scene.getEngine());
  // GPU timer queries are not universally available, and Babylon 8's Engine no longer exposes
  // captureGPUFrameTime at all. Enable it only if the engine and the driver both support it, and
  // otherwise report null, which is the honest answer rather than a number derived from the CPU.
  const engineAny = scene.getEngine() as unknown as Record<string, unknown>;
  const gl = (engineAny as unknown as { _gl?: WebGL2RenderingContext })._gl;
  const timerExt = !!gl?.getExtension("EXT_disjoint_timer_query_webgl2");
  if (typeof engineAny.captureGPUFrameTime === "function" && timerExt) {
    engineInstr.captureGPUFrameTime = true;
  }

  // Position the camera with the ArcRotateCamera's own controls rather than writing
  // globalPosition, so the view the benchmark measures is the view the app would actually draw.
  const cam = scene.activeCamera as unknown as {
    radius: number;
    alpha: number;
    beta: number;
    setTarget(v: Vector3): void;
    globalPosition: Vector3;
    position: Vector3;
  };
  const n = crowd.units.length;
  let cx = 0;
  let cz = 0;
  for (const u of crowd.units) {
    cx += u.x;
    cz += u.z;
  }
  const midX = n ? cx / n : 0;
  const midZ = n ? cz / n : 0;
  // Order matters: ArcRotateCamera.setTarget() recomputes alpha/beta/radius from the current world
  // position, so setting the radius first and the target second silently moves the camera. Target
  // first, then the angles, so the camera ends up exactly where it was asked to be.
  cam.setTarget(new Vector3(midX, 1.0, midZ));
  cam.alpha = -Math.PI / 2;
  cam.beta = 1.15;
  cam.radius = camDist;
  // Read the camera position inside the frame callback, not once up front. ArcRotateCamera
  // derives its position from alpha/beta/radius/target during the view-matrix update, so a value
  // captured before the first render is stale and every LOD distance would be measured from it.

  let total = 0;
  let tStart = 0;
  let tEnd = 0;
  let lastT = 0;
  let frameMsSum = 0;
  let cpuMsSum = 0;
  let measured = 0;
  let last: FrameStats = crowd.stats();

  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  const observer = scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    crowd.advance(1 / 60);
    const s = crowd.update(cam.position);
    last = s;
    if (lastT) frameMsSum += now - lastT;
    lastT = now;
    total++;

    if (total === warmup) {
      // Reset the accumulators after warm-up so compilation and first uploads are excluded.
      frameMsSum = 0;
      cpuMsSum = 0;
      lastT = 0;
      measured = 0;
      tStart = now;
    } else if (total > warmup) {
      cpuMsSum += s.cpuMs;
      measured++;
      if (measured >= sample) {
        tEnd = now;
        resolveDone();
      }
    }
  });

  // Resolved by the observer itself. An earlier version polled with addOnce from a wait loop, and
  // those one-shot observers were never removed: a stale one fired on the first frame of the NEXT
  // run and resolved the wait before a single frame had been counted, which reported 0 fps and the
  // previous run's instance counts.
  await done;
  scene.onAfterRenderObservable.remove(observer);
  // Read every counter before disposing the instrumentation that owns them.
  const drawCalls = instr.drawCallsCounter?.current ?? 0;
  const babylonRenderMs = instr.renderTimeCounter.lastSecAverage * 1000;
  instr.dispose();
  engineInstr.dispose();

  const seconds = (tEnd - tStart) / 1000;
  let gpuFrameMs: number | null = null;
  if (typeof engineAny.captureGPUFrameTime === "function" && timerExt) {
    const gpuCounter = engineInstr.gpuFrameTimeCounter;
    if (gpuCounter && gpuCounter.count > 0) gpuFrameMs = gpuCounter.current;
  }

  return {
    units: crowd.units.length,
    fps: seconds > 0 ? measured / seconds : 0,
    frames: measured,
    seconds,
    drawCalls,
    activeMeshes: last.activeMeshes,
    instances: last.totalInstances,
    triangles: last.triangles,
    cpuUpdateMs: cpuMsSum / Math.max(1, measured),
    babylonRenderMs,
    gpuFrameMs,
    gpuTimerAvailable: typeof engineAny.captureGPUFrameTime === "function" && timerExt,
    frameMs: frameMsSum / Math.max(1, measured),
    perTier: last.perTier,
    closeMaxM: crowd.closeMaxM,
    midMaxM: crowd.midMaxM,
    camRadius: cam.radius,
    camPos: [cam.position.x, cam.position.y, cam.position.z],
    distMin: Math.min(...crowd.units.map((u) => Math.hypot(u.x - cam.position.x, u.z - cam.position.z))),
    distMax: Math.max(...crowd.units.map((u) => Math.hypot(u.x - cam.position.x, u.z - cam.position.z))),
  };
}
