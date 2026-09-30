/**
 * Entry point. Modes are selected by the query string so the same bundle serves the interactive
 * view, the benchmark, the LOD sweep and the impostor bake.
 *
 *   ?mode=view              draw the crowd with a fixed camera, for a screenshot
 *   ?mode=bench             run the benchmark at a list of unit counts
 *   ?mode=lod-sweep         run the benchmark across candidate LOD thresholds
 *   ?mode=impostor          render the far-tier billboard atlas and write it out
 *   ?mode=cpu-baseline      measure CPU skinning against GPU skinning at the same unit counts
 */

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { runBenchmark, BenchResult } from "./bench";
import { CrowdScene } from "./crowd-scene";
import { loadAnimHeader, loadConfig } from "./config";
import { loadGlb, TroopSources } from "./glb";
import { bakeImpostorAtlas } from "./impostor";
import { runCpuBaseline } from "./cpu-baseline";

declare global {
  interface Window {
    POC_RESULT?: unknown;
    POC_ERROR?: string;
  }
}

const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "view";

async function loadAll() {
  const cfg = await loadConfig();
  const header = await loadAnimHeader();
  const bin = await fetch("assets/processed/anim_matrices.bin");
  if (!bin.ok) throw new Error("assets/processed/anim_matrices.bin missing. Run tools/build-assets.mjs.");
  const animData = new Float32Array(await bin.arrayBuffer());

  const tier = (t: string) => `assets/processed/${cfg.troop.id}_${t}.glb`;
  const [bodyClose, bodyMid, weaponClose, weaponMid] = await Promise.all([
    loadGlb(tier("body_close")), loadGlb(tier("body_mid")),
    loadGlb(tier("weapon_close")), loadGlb(tier("weapon_mid")),
  ]);
  const sources: TroopSources = {
    body: { close: bodyClose, mid: bodyMid },
    weapon: { close: weaponClose, mid: weaponMid },
  };
  return { cfg, header, animData, sources };
}

function makeCamera(scene: Scene, dist: number): ArcRotateCamera {
  const cam = new ArcRotateCamera("cam", -Math.PI / 2, 1.15, dist, new Vector3(0, 1, 0), scene);
  cam.lowerRadiusLimit = 2;
  cam.upperRadiusLimit = 600;
  cam.maxZ = 2000;
  cam.minZ = 0.1;
  cam.fov = 0.9;
  cam.attachControl(canvas, true);
  return cam;
}

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const hud = document.getElementById("hud")!;

function report(r: unknown): void {
  window.POC_RESULT = r;
  hud.textContent = JSON.stringify(r, null, 2);
  hud.classList.add("ready");
}

async function boot(): Promise<void> {
  const engine = new Engine(canvas, true, {
    // Needed for EXT_color_buffer_float and a 32-bit depth buffer, both verified present on the
    // benchmark machine by tools/probe-gpu.mjs.
    preserveDrawingBuffer: true,
    stencil: false,
    powerPreference: "high-performance",
  }, true);
  const scene = new Scene(engine);
  const { cfg, header, animData, sources } = await loadAll();
  const crowd = new CrowdScene(scene, cfg, header, animData, sources);
  // A battle camera: far enough back to see the line, near enough that the near ranks are not
  // already billboards. 55 m puts the front of a 1,000-unit line at ~40 m and the back at ~70 m,
  // which is the range the LOD thresholds actually have to divide.
  const cam = makeCamera(scene, Number(q.get("cam") ?? 55));

  window.addEventListener("resize", () => engine.resize());
  // The render loop has to be running for onAfterRenderObservable to fire, so every mode that
  // measures anything needs it. Bench mode drives its per-frame work from the same observable the
  // view mode does, so the measured frame is the same frame that gets drawn.
  engine.runRenderLoop(() => scene.render());

  if (mode === "impostor") {
    report(await bakeImpostorAtlas(cfg, header, animData, sources));
    return;
  }

  if (mode === "cpu-baseline") {
    const counts = (q.get("counts") ?? "32,64,128,256").split(",").map(Number);
    report(await runCpuBaseline({ engine, scene, header, animData, sources, counts }));
    return;
  }

  if (mode === "repeat") {
    // Same configuration, measured repeatedly in one page. Exposes drift: thermal throttling, GPU
    // process degradation, or buffer churn. A benchmark that only ever measures a cold GPU is not
    // measuring what a player sees.
    const n = Number(q.get("units") ?? 1000);
    const reps = Number(q.get("reps") ?? 8);
    const perRow = Number(q.get("perRow") ?? 50);
    crowd.populate(n, 1234, perRow);
    if (q.has("close")) crowd.closeMaxM = Number(q.get("close"));
    if (q.has("mid")) crowd.midMaxM = Number(q.get("mid"));
    if (q.has("debug")) crowd.setDebugSkin(Number(q.get("debug")));
    const runs: BenchResult[] = [];
    for (let i = 0; i < reps; i++) {
      const r = await runBenchmark({
        scene, crowd, warmupFrames: 90, sampleFrames: 240,
        cameraDistance: Number(q.get("cam") ?? 55),
      });
      runs.push(r);
    }
    report({ mode, hardware: hardwareInfo(engine), runs: runs.map((r) => ({
      rep: runs.indexOf(r), fps: r.fps, frameMs: r.frameMs, triangles: r.triangles,
      drawCalls: r.drawCalls, cpuUpdateMs: r.cpuUpdateMs,
      tiers: r.perTier.map((t) => `${t.part}/${t.tier}:${t.instances}`).join(" "),
    })) });
    return;
  }

  if (mode === "bench") {
    const counts = (q.get("counts") ?? "100,300,600,1000,1500").split(",").map(Number);
    const perRow = Number(q.get("perRow") ?? 50);
    // Honour the LOD overrides here too, the way repeat and lod-sweep do. Without this a
    // --query "close=20&mid=35" was silently ignored, so a threshold comparison measured the
    // configured thresholds five times over and produced an identical tier breakdown each run.
    if (q.has("close")) crowd.closeMaxM = Number(q.get("close"));
    if (q.has("mid")) crowd.midMaxM = Number(q.get("mid"));
    const results: BenchResult[] = [];
    for (const n of counts) {
      crowd.populate(n, 1234, perRow);
      const r = await runBenchmark({ scene, crowd, warmupFrames: 90, sampleFrames: 240,
        cameraDistance: Number(q.get("cam") ?? 55) });
      results.push(r);
    }
    report({ mode, hardware: hardwareInfo(engine), results });
    return;
  }

  if (mode === "lod-sweep") {
    const close = (q.get("close") ?? "10,20,30,45,60").split(",").map(Number);
    const mid = (q.get("mid") ?? "40,80,120,200").split(",").map(Number);
    const n = Number(q.get("units") ?? 1000);
    const out: unknown[] = [];
    for (const c of close) {
      for (const m of mid) {
        if (m <= c) continue;
        crowd.populate(n, 1234, Number(q.get("perRow") ?? 50));
        crowd.closeMaxM = c;
        crowd.midMaxM = m;
        const r = await runBenchmark({ scene, crowd, warmupFrames: 60, sampleFrames: 180,
          cameraDistance: Number(q.get("cam") ?? 55) });
        out.push({ closeMaxM: c, midMaxM: m, fps: r.fps, drawCalls: r.drawCalls, triangles: r.triangles,
          cpuUpdateMs: r.cpuUpdateMs, frames: r.frames, seconds: r.seconds, frameMs: r.frameMs,
          appliedClose: r.closeMaxM, appliedMid: r.midMaxM, camRadius: r.camRadius,
          distMin: r.distMin, distMax: r.distMax,
          perTier: r.perTier.map((t) => `${t.part}/${t.tier}:${t.instances}`) });
      }
    }
    report({ mode, units: n, hardware: hardwareInfo(engine), sweep: out });
    return;
  }

  // view
  (window as unknown as { POC_CROWD?: unknown }).POC_CROWD = { crowd, scene, engine, cam };
  crowd.populate(Number(q.get("units") ?? 1000), 1234, Number(q.get("perRow") ?? 50));
  // Query overrides so a single tier, or a single camera distance, can be inspected on its own.
  if (q.has("close")) crowd.closeMaxM = Number(q.get("close"));
  if (q.has("mid")) crowd.midMaxM = Number(q.get("mid"));
  if (q.has("debug")) crowd.setDebugSkin(Number(q.get("debug")));
  if (q.has("phase")) crowd.setUniformClip(Number(q.get("clip") ?? 1), Number(q.get("phase")));
  let frames = 0;
  // Point the camera at the middle of the formation, the same place the benchmark aims it, so a
  // screenshot and a benchmark row describe the same view.
  const nUnits = crowd.units.length;
  let cx = 0;
  let cz = 0;
  for (const u of crowd.units) {
    cx += u.x;
    cz += u.z;
  }
  // Target first, then the angles and the radius: ArcRotateCamera.setTarget recomputes
  // alpha/beta/radius from the current world position, so setting the radius before the target
  // silently moves the camera.
  cam.setTarget(new Vector3(nUnits ? cx / nUnits : 0, 1.0, nUnits ? cz / nUnits : 0));
  cam.alpha = -Math.PI / 2;
  cam.beta = 1.15;
  cam.radius = Number(q.get("cam") ?? 55);

  scene.onAfterRenderObservable.add(() => {
    crowd.advance(1 / 60);
    // cam.position, not cam.globalPosition: ArcRotateCamera derives its position during the
    // view-matrix update, so globalPosition is stale on the first frames and every LOD distance
    // measured from it is wrong.
    crowd.update(cam.position);
    if (++frames % 30 === 0) {
      const s = crowd.stats();
      hud.textContent =
        `units ${crowd.units.length}  fps ${engine.getFps().toFixed(1)}  ` +
        `draws ${s.drawCalls}  tris ${s.triangles.toLocaleString()}  ` +
        `instances ${s.totalInstances}\n` +
        s.perTier.map((t) => `  ${(t.part + "/" + t.tier).padEnd(14)} ${String(t.instances).padStart(5)} x ${String(t.trisPerInstance).padStart(5)} tris`).join("\n");
    }
  });
  report({
    mode: "view",
    units: crowd.units.length,
    hardware: hardwareInfo(engine),
    canvas: (() => {
      const c = document.getElementById("stage") as HTMLCanvasElement;
      return { width: c.width, height: c.height };
    })(),
  });
}

/**
 * The renderer string is captured and returned with every result, so a number measured on a
 * software rasteriser can never be reported as a GPU result. tools/probe-gpu.mjs checks the same
 * thing before a benchmark run is accepted.
 */
export function hardwareInfo(engine: Engine): Record<string, unknown> {
  const gl = engine._gl as WebGL2RenderingContext;
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
    maxVertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    colorBufferFloat: !!gl.getExtension("EXT_color_buffer_float"),
    hardwareScalingLevel: engine.getHardwareScalingLevel(),
    renderWidth: engine.getRenderWidth(),
    renderHeight: engine.getRenderHeight(),
  };
}

boot().catch((e) => {
  window.POC_ERROR = String(e?.stack ?? e);
  hud.textContent = `ERROR\n${e?.stack ?? e}`;
  hud.classList.add("error");
});
