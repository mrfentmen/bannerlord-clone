/**
 * The benchmark driver: launches real Chrome with the real GPU, runs the in-page benchmark, and
 * prints what came back.
 *
 * It refuses to report numbers if the WebGL renderer string says SwiftShader, because a software
 * rasteriser's frame rate is not a measurement of anything this project cares about. That check is
 * the one that stops a benchmark on the wrong machine being reported as a mid-range result.
 *
 * Run:
 *   node tools/benchmark.mjs
 *   node tools/benchmark.mjs --lod-sweep
 *   node tools/benchmark.mjs --repeats 5 --counts 100,300,1000
 *   node tools/benchmark.mjs --cpu-baseline
 *   node tools/benchmark.mjs --screenshot out.png --units 1000
 */
import { chromium } from "playwright";
import fs from "node:fs";
import osModule from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { server, PORT } from "./serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const SOFT_RENDERERS = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

async function openPage(query) {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      // No --use-angle flag on purpose: on this machine forcing Metal makes Chrome fall back to
      // SwiftShader, and the default already gives the real Iris 6100.
      //
      // Frame rate is deliberately left VSYNC-capped. Disabling the cap does not measure
      // throughput, it measures how far requestAnimationFrame runs ahead of the GPU, which on this
      // machine ramps from 87 to 271 fps on a one-unit scene as work queues up. Capped, a reading
      // means the renderer sustained the display's refresh rate, which is what the 60 fps target
      // actually asks for. Readings at the cap are reported as "at cap", never as a frame rate.
      "--enable-gpu",
      "--ignore-gpu-blocklist",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || t.startsWith("POC")) console.log(`  [page:${m.type()}] ${t}`);
  });
  page.on("pageerror", (e) => console.log(`  [page:error] ${e.message}`));

  await page.goto(`http://127.0.0.1:${PORT}/?${query}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => window.POC_RESULT !== undefined || window.POC_ERROR !== undefined,
    null,
    { timeout: 900000 }
  );
  const err = await page.evaluate(() => window.POC_ERROR ?? null);
  if (err) throw new Error(`page error:\n${err}`);
  const result = await page.evaluate(() => window.POC_RESULT);
  return { browser, page, result };
}

function assertRealGpu(hw) {
  const r = String(hw?.renderer ?? "");
  if (SOFT_RENDERERS.test(r)) {
    throw new Error(
      `refusing to report numbers: WebGL renderer is "${r}", a software rasteriser.\n` +
      `A software frame rate is not a GPU measurement. Run on hardware, or accept that the result\n` +
      `is unverified for the mid-range target.`
    );
  }
  return r;
}

const os = {
  platform: `${osModule.platform} ${osModule.release()}`,
  cpus: osModule.cpus().length,
  cpuModel: osModule.cpus()[0]?.model?.trim(),
  totalMemGB: (osModule.totalmem() / 2 ** 30).toFixed(1),
};

function fmtRow(b) {
  const tierStr = b.perTier
    .map((t) => `${t.part[0]}/${t.tier[0]}:${t.instances}`)
    .join(" ");
  return [
    String(b.units).padStart(6),
    b.fps.toFixed(1).padStart(7),
    String(b.drawCalls).padStart(6),
    String(b.activeMeshes).padStart(6),
    b.triangles.toLocaleString().padStart(12),
    String(b.instances).padStart(7),
    b.frameMs.toFixed(2).padStart(7),
    b.cpuUpdateMs.toFixed(3).padStart(8),
    (b.gpuFrameMs === null ? "n/a" : b.gpuFrameMs.toFixed(2)).padStart(7),
    tierStr,
  ].join(" ");
}

const HEADER = ["units", "fps", "draws", "meshes", "triangles", "inst", "frameMs", "cpuMs", "gpuMs", "tiers"];
const row = (cells) => cells.join(" | ");

let exitCode = 0;
try {
  if (has("--cpu-baseline")) {
    const { browser, result } = await openPage(
      `mode=cpu-baseline&counts=${val("--counts", "32,64,128,256,512")}`);
    console.log("\n=== CPU SKINNING BASELINE (single thread, close-tier mesh) ===");
    console.log(`mesh ${result.mesh}: ${result.vertsPerUnit} verts, ${result.jointCount} joints`);
    console.log(row(["units", "msPerFrame", "range", "vertexXf", "impliedFps",
      "msPerSecAnim", "%of60fpsBudget"].map((h) => h.padEnd(12))));
    for (const r of result.rows) {
      console.log([
        String(r.units).padEnd(12),
        r.msPerFrame.toFixed(2).padEnd(12),
        `${r.msPerFrameRange[0].toFixed(2)}-${r.msPerFrameRange[1].toFixed(2)}`.padEnd(12),
        r.vertexTransforms.toLocaleString().padEnd(12),
        (Number.isFinite(r.impliedMaxFps) ? r.impliedMaxFps.toFixed(1) : "inf").padEnd(12),
        r.msPerSecondOfAnim.toFixed(0).padEnd(12),
        `${(r.shareOfBudget60 * 100).toFixed(0)}%`.padEnd(12),
      ].join(" | "));
    }
    console.log(`\nchecksum of last frame's output: ${result.checksum.toFixed(3)}  (a non-zero value ` +
      `proves the loop was not optimised away)`);
    console.log(`\n${result.conclusion}`);
    console.log(`\n${result.gpuComparison}`);
    await browser.close();
  } else if (has("--lod-sweep")) {
    const { browser, result } = await openPage(
      `mode=lod-sweep&units=${val("--units", 1000)}&close=${val("--close", "10,20,30,45,60")}` +
      `&mid=${val("--mid", "40,80,120,200")}${val("--query", "") ? "&" + val("--query") : ""}`
    );
    assertRealGpu(result.hardware);
    console.log(`\n=== LOD THRESHOLD SWEEP @ ${result.units} units ===`);
    console.log(`renderer: ${result.hardware.renderer}`);
    console.log(row(["closeM", "midM", "applC", "applM", "distMin", "distMax", "fps", "frames",
      "sec", "frameMs", "draws", "triangles", "cpuMs", "tiers"].map((h) => h.padEnd(9))));
    for (const s of result.sweep) {
      console.log([
        String(s.closeMaxM).padEnd(9), String(s.midMaxM).padEnd(9),
        String(s.appliedClose).padEnd(9), String(s.appliedMid).padEnd(9),
        s.distMin.toFixed(1).padEnd(9), s.distMax.toFixed(1).padEnd(9),
        s.fps.toFixed(1).padEnd(9), String(s.frames).padEnd(9),
        s.seconds.toFixed(2).padEnd(9), s.frameMs.toFixed(2).padEnd(9),
        String(s.drawCalls).padEnd(9), s.triangles.toLocaleString().padEnd(9),
        s.cpuUpdateMs.toFixed(2).padEnd(9), s.perTier.join(" "),
      ].join(" | "));
    }
    await browser.close();
  } else if (has("--screenshot")) {
    const out = val("--screenshot", "shot.png");
    const units = val("--units", "1000");
    const extra = val("--query", "");
    const { browser, page, result } = await openPage(`mode=view&units=${units}${extra ? "&" + extra : ""}`);
    assertRealGpu(result.hardware);
    await page.waitForTimeout(3000);
    // Read the canvas directly. page.screenshot() stalls against a continuous rAF loop.
    const dataUrl = await page.evaluate(() => {
      const c = document.getElementById("stage");
      return c.toDataURL("image/png");
    });
    fs.writeFileSync(path.join(ROOT, out), Buffer.from(dataUrl.split(",")[1], "base64"));
    const hud = await page.evaluate(() => document.getElementById("hud").textContent);
    console.log(`renderer: ${result.hardware.renderer}`);
    console.log(`canvas  : ${result.canvas.width}x${result.canvas.height}`);
    console.log(hud.trim());
    console.log(`wrote ${out} at ${units} units${extra ? ` (${extra})` : ""}`);
    await browser.close();
  } else if (has("--impostor")) {
    const { browser, result } = await openPage("mode=impostor");
    const b64 = result.atlas.split(",")[1];
    const dest = path.join(ROOT, "assets", "processed", "impostor_atlas.png");
    fs.writeFileSync(dest, Buffer.from(b64, "base64"));
    console.log(`\n=== IMPOSTOR ATLAS ===`);
    console.log(`  ${result.width}x${result.height}, ${result.angles} angles x ${result.frames} frames, ` +
      `${result.cellPx}px cells, clip "${result.clip}"`);
    console.log(`  non-empty cells: ${result.nonEmptyCells}/${result.cellsTotal}`);
    console.log(`  mean cell coverage: ${(result.meanCoverage * 100).toFixed(1)}%`);
    console.log(`  wrote ${path.relative(ROOT, dest)} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
    if (result.meanCoverage < 0.04) {
      console.error("  WARNING: cells are nearly empty, the far tier would be an invisible speck");
      exitCode = 1;
    }
    await browser.close();
  } else {
    const counts = val("--counts", "100,300,600,1000,1500");
    const repeats = Math.max(1, parseInt(val("--repeats", "1"), 10) || 1);
    const query = val("--query", "");
    const { browser, result } = await openPage(`mode=bench&counts=${counts}${query ? "&" + query : ""}`);
    const renderer = assertRealGpu(result.hardware);

    // A single sample cannot settle a borderline target. At 1000 units this machine measures
    // anywhere from 29.3 to 31.5 fps run to run, which straddles the 30 fps goal, so the verdict
    // flipped between PASS and FAIL depending on which run happened to be reported. With
    // --repeats each count is reported as a median with its full spread, the target is judged on
    // the median, and the worst repeat is printed next to it so a comfortable-looking median
    // cannot hide a bad run.
    const samples = new Map();
    const collect = (results) => {
      for (const b of results) {
        if (!samples.has(b.units)) samples.set(b.units, []);
        samples.get(b.units).push(b);
      }
    };
    collect(result.results);
    // Close this browser before starting the repeats. Two live WebGL pages split the GPU between
    // them, so an open first page made every repeat measure roughly half the real frame rate.
    await browser.close();
    for (let rep = 1; rep < repeats; rep++) {
      const r = await openPage(`mode=bench&counts=${counts}${query ? "&" + query : ""}`);
      collect(r.result.results);
      await r.browser.close();
    }

    const median = (xs) => {
      const s = [...xs].sort((a, c) => a - c);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    console.log("\n=== CROWD RENDERING BENCHMARK ===");
    console.log(`host        : ${os.cpuModel} x${os.cpus}, ${os.totalMemGB} GB RAM, ${os.platform}`);
    console.log(`renderer    : ${renderer}`);
    console.log(`gl          : ${result.hardware.version}`);
    console.log(`res         : ${result.hardware.renderWidth}x${result.hardware.renderHeight} ` +
      `scaling ${result.hardware.hardwareScalingLevel}`);
    console.log(`vtx tex units: ${result.hardware.maxVertexTextureUnits}, max tex ${result.hardware.maxTextureSize}, ` +
      `float colour buffer ${result.hardware.colorBufferFloat}`);
    console.log(repeats > 1
      ? `repeats     : ${repeats} per count, reporting the median with the full spread`
      : `repeats     : 1  (pass --repeats N for a median; one run cannot settle a borderline target)`);
    console.log("");
    console.log(row(HEADER.map((h) => h.padEnd(9))));
    const summary = [];
    for (const [units, runs] of samples) {
      const med = {};
      for (const k of Object.keys(runs[0])) {
        med[k] = typeof runs[0][k] === "number" ? median(runs.map((x) => x[k])) : runs[0][k];
      }
      med.fpsMin = Math.min(...runs.map((x) => x.fps));
      med.fpsMax = Math.max(...runs.map((x) => x.fps));
      summary.push(med);
      console.log(row(fmtRow(med).split("|").map((c) => c.trim().padEnd(9))));
    }
    if (repeats > 1) {
      console.log("\n--- spread across repeats (fps) ---");
      for (const s of summary) {
        const all = samples.get(s.units).map((x) => x.fps.toFixed(1)).join(", ");
        console.log(`  ${String(s.units).padEnd(5)} min ${s.fpsMin.toFixed(1)}  max ${s.fpsMax.toFixed(1)}   runs: [${all}]`);
      }
    }
    console.log("\n--- targets (PHASES.md Phase 3) ---");
    for (const [units, target] of [[300, 60], [1000, 30]]) {
      const b = summary.find((x) => x.units === units);
      if (!b) {
        console.log(`  ${units} units @ ${target} fps : NOT MEASURED (not in --counts)`);
        continue;
      }
      // Judge on the same number that gets printed. The raw mean can be 59.98, which prints as
      // "60.0 fps" but fails a >= 60 test, so a run at the refresh cap reported "60.0 fps FAIL
      // (1.00x short)" -- a verdict that contradicted its own printed figure.
      const shown = Number(b.fps.toFixed(1));
      const pass = shown >= target;
      const note = pass && target === 60 ? "  (at the 60 Hz cap, so this is the refresh ceiling)" : "";
      const worst = repeats > 1
        ? `  worst repeat ${b.fpsMin.toFixed(1)} fps${b.fpsMin >= target ? " (passes too)" : " (below target)"}`
        : "";
      console.log(`  ${units} units @ ${target} fps : ${shown.toFixed(1)} fps  ${pass ? "PASS" : "FAIL"}` +
        `  (${pass ? (shown / target).toFixed(2) + "x headroom" : (target / shown).toFixed(2) + "x short"})` +
        note + worst);
    }
    const last = summary[summary.length - 1];
    console.log(`\ndraw calls at ${last.units} units: ${last.drawCalls} ` +
      `(ASSETS.md 5.3: must not grow with unit count)`);
    console.log(`per-frame CPU instance/LOD update: ${last.cpuUpdateMs.toFixed(3)} ms`);
    if (last.gpuFrameMs === null) {
      console.log("GPU frame time: not available (this browser exposes no timer query); " +
        "wall-clock frame time is the measured figure");
    } else {
      console.log(`GPU frame time: ${last.gpuFrameMs.toFixed(2)} ms`);
    }
  }
} catch (e) {
  console.error(`\nBENCHMARK FAILED: ${e.message}`);
  exitCode = 1;
} finally {
  server.close();
}
process.exit(exitCode);
