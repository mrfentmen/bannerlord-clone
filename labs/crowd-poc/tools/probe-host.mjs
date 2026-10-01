/**
 * Host probe for the crowd PoC.
 *
 * The Phase 3 exit criterion is a frame rate on mid-range hardware. This script answers the only
 * question that matters before anyone reads a number: *can this machine produce a GPU measurement
 * at all?* It records the machine, the browser's WebGL renderer string, and applies the same
 * software-rasteriser test `tools/benchmark.mjs` applies, so the verdict is the harness's own and
 * not a judgement call.
 *
 * With `--counts`, it additionally measures the hardware-independent counters the renderer computes
 * on the CPU — draw calls, triangles, thin instances, per-tier split — for each unit count. Those
 * are facts about the scene and the LOD partition, not about the rasteriser, so they are valid on
 * any machine. It deliberately reports NO frame rate: on a software rasteriser a frame rate is a
 * measurement of the CPU, and printing one next to real counters invites it to be read as a
 * result.
 *
 * Run:
 *   node tools/probe-host.mjs
 *   node tools/probe-host.mjs --counts 100,300,1000,2000 --seconds 60
 */
import { chromium } from "playwright";
import fs from "node:fs";
import osModule from "node:os";
import { server, PORT } from "./serve.mjs";

const argv = process.argv.slice(2);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
// Copied verbatim from tools/benchmark.mjs so this probe and the harness cannot disagree.
const SOFT_RENDERERS = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

function hostFacts() {
  const facts = [];
  const add = (k, v) => facts.push([k, String(v)]);
  add("platform", `${osModule.platform} ${osModule.release()}`);
  add("arch", osModule.arch());
  const cpus = osModule.cpus();
  add("cpu model", cpus[0]?.model?.trim() ?? "?");
  add("logical cpus", cpus.length);
  add("total RAM GB", (osModule.totalmem() / 2 ** 30).toFixed(1));
  for (const [node, path] of [
    ["/dev/dri", "/dev/dri"],
    ["/dev/nvidia0", "/dev/nvidia0"],
  ]) {
    add(node, fs.existsSync(path) ? "present" : "ABSENT");
  }
  for (const bin of ["nvidia-smi", "glxinfo", "vulkaninfo", "blender"]) {
    const dirs = (process.env.PATH ?? "").split(":");
    const hit = dirs.some((d) => d && fs.existsSync(`${d}/${bin}`));
    add(bin, hit ? "on PATH" : "not on PATH");
  }
  return facts;
}

function launchOptions() {
  // Identical to tools/benchmark.mjs: real Chrome, hardware acceleration requested, vsync left on.
  return {
    channel: "chrome",
    headless: true,
    args: ["--enable-gpu", "--ignore-gpu-blocklist"],
  };
}

let exitCode = 0;
try {
  console.log("=== HOST ===");
  for (const [k, v] of hostFacts()) console.log(`  ${k.padEnd(16)}: ${v}`);

  let browser;
  try {
    browser = await chromium.launch(launchOptions());
  } catch (e) {
    console.log(`\n=== BROWSER ===\n  launch failed: ${e.message}`);
    console.log("\nVERDICT: NO BROWSER — the benchmark cannot run at all on this machine.");
    exitCode = 1;
    throw new Error("browser launch failed");
  }

  const probe = await browser.newPage();
  const gl = await probe.evaluate(() => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("webgl2") || c.getContext("webgl");
    if (!ctx) return { error: "no WebGL context at all" };
    const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
    return {
      version: ctx.getParameter(ctx.VERSION),
      vendor: dbg ? ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : ctx.getParameter(ctx.VENDOR),
      renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
      maxTextureSize: ctx.getParameter(ctx.MAX_TEXTURE_SIZE),
      maxVertexTextureUnits: ctx.getParameter(ctx.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
      colorBufferFloat: !!ctx.getExtension("EXT_color_buffer_float"),
    };
  });

  console.log("\n=== BROWSER / WEBGL ===");
  if (gl.error) {
    console.log(`  ${gl.error}`);
  } else {
    console.log(`  chrome          : ${browser.version()}`);
    console.log(`  gl version      : ${gl.version}`);
    console.log(`  gl vendor       : ${gl.vendor}`);
    console.log(`  gl renderer     : ${gl.renderer}`);
    console.log(`  max tex size    : ${gl.maxTextureSize}`);
    console.log(`  vtx texture units: ${gl.maxVertexTextureUnits}`);
    console.log(`  EXT_color_buffer_float: ${gl.colorBufferFloat}`);
  }

  const renderer = String(gl.renderer ?? gl.error ?? "");
  const soft = SOFT_RENDERERS.test(renderer);
  console.log("\n=== HARNESS VERDICT (the test in tools/benchmark.mjs) ===");
  if (soft) {
    console.log(`  renderer matches /${SOFT_RENDERERS.source}/`);
    console.log("  VERDICT: REFUSED. tools/benchmark.mjs throws before printing any number.");
    console.log("  Reason: a software rasteriser's frame rate measures the CPU, not a GPU.");
  } else {
    console.log("  VERDICT: ACCEPTED as a real GPU. The frame-rate targets are measurable here.");
  }
  exitCode = soft ? 2 : 0;

  const counts = val("--counts", "");
  if (counts) {
    const seconds = Number(val("--seconds", "20"));
    console.log(`\n=== HARDWARE-INDEPENDENT COUNTERS (${seconds}s sampling window each) ===`);
    console.log("  These are CPU-side counters over the LOD partition: draw calls, triangles and");
    console.log("  thin instances the renderer submits. They do not depend on the rasteriser, so");
    console.log("  they are valid on any machine. NO frame rate is reported, on purpose: on a");
    console.log("  software rasteriser a frame rate measures the CPU, and printing one next to real");
    console.log("  counters invites it to be read as a result.\n");
    console.log(`  ${"units".padEnd(6)} ${"frames".padEnd(8)} ${"draws".padEnd(7)} ${"triangles".padEnd(12)} ` +
      `${"inst".padEnd(7)} cpuMs  tiers`);
    for (const n of counts.split(",").map(Number)) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${PORT}/?mode=view&units=${n}&cam=30`,
        { waitUntil: "domcontentloaded", timeout: 120000 });
      try {
        await page.waitForFunction(() => window.POC_RESULT !== undefined || window.POC_ERROR !== undefined,
          null, { timeout: 300000 });
      } catch {
        console.log(`  ${String(n).padEnd(6)} page never finished booting within 300s`);
        await page.close();
        continue;
      }
      const err = await page.evaluate(() => window.POC_ERROR ?? null);
      if (err) {
        console.log(`  ${String(n).padEnd(6)} page error: ${err.split("\n")[0]}`);
        await page.close();
        continue;
      }
      // Count real rAF frames and read the renderer's own counters. No wall-clock-derived fps is
      // reported: that number would be the CPU's, not a GPU's.
      const stats = await page.evaluate(async (secs) => {
        const h = window.POC_CROWD;
        let frames = 0;
        const obs = h.scene.onAfterRenderObservable.add(() => { frames++; });
        const t0 = performance.now();
        await new Promise((res) => setTimeout(res, secs * 1000));
        const elapsed = (performance.now() - t0) / 1000;
        h.scene.onAfterRenderObservable.remove(obs);
        const s = h.crowd.stats();
        return {
          frames, elapsed,
          drawCalls: s.drawCalls,
          triangles: s.triangles,
          instances: s.totalInstances,
          activeMeshes: h.scene.getActiveMeshes().length,
          perTier: s.perTier.map((t) => `${t.part}/${t.tier}:${t.instances}`).join(" "),
          units: h.crowd.units.length,
        };
      }, seconds);
      console.log(`  ${String(stats.units).padEnd(6)} ${String(stats.frames).padEnd(8)} ` +
        `${String(stats.drawCalls).padEnd(7)} ${stats.triangles.toLocaleString().padEnd(12)} ` +
        `${String(stats.instances).padEnd(7)} ${"-".padEnd(5)} ${stats.perTier}`);
      await page.close();
    }
  }

  await browser.close();
} catch (e) {
  if (!/browser launch failed/.test(e.message)) {
    console.error(`\nPROBE FAILED: ${e.stack ?? e.message}`);
    exitCode = 1;
  }
} finally {
  server.close();
}
process.exit(exitCode);