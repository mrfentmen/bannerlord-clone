/**
 * Choose the LOD distance thresholds from measurement, not assumption.
 *
 * ASSETS.md section 4.3 and SPEC.md section 5.1 both say the thresholds are tuned by testing.
 * This measures a candidate grid at 1,000 units, which is the harder of the two Phase 3 targets,
 * and writes the winner into config/crowd.json together with the numbers that chose it.
 *
 * Methodology, and why each part is here:
 *
 *  - One browser per sample, closed before the next. Two live WebGL pages split the GPU between
 *    them and roughly halve the frame rate, so repeats must never overlap. It also stops a
 *    long-lived page from accumulating buffers across dozens of samples.
 *  - Many samples per candidate, reported as a median AND a minimum. An earlier version judged on
 *    a median of 5, which certified a close tier of 22 m on a tight 34.3-34.5 spread -- and then a
 *    later run of the same build dipped to 27.8 fps, below the target. The spread from five
 *    samples did not describe this machine's tail.
 *  - The rule is therefore tail-robust: a candidate must clear the target by a margin on the
 *    median AND its worst single sample must still clear the bare target. The second clause is
 *    what catches the dip; the first keeps the choice from being dominated by one lucky run.
 *
 * The grid varies closeMaxM along midMaxM = 35, then probes two midMaxM values to confirm the mid
 * threshold is not doing the work.
 *
 * Run: node tools/lod-tune.mjs [--repeats 7]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { server, PORT } from "./serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = path.join(ROOT, "config", "crowd.json");
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const CANDIDATES = [
  { closeMaxM: 18, midMaxM: 35 },
  { closeMaxM: 20, midMaxM: 35 },
  { closeMaxM: 22, midMaxM: 35 },
  { closeMaxM: 24, midMaxM: 35 },
  { closeMaxM: 26, midMaxM: 35 },
  { closeMaxM: 20, midMaxM: 30 },
  { closeMaxM: 24, midMaxM: 42 },
];
const UNITS = 1000;
const CAM = 30;
const REPS = Math.max(3, parseInt(flag("--repeats", "7"), 10) || 7);
/** Phase 3 exit criterion for this unit count, on the hardware measured. */
const TARGET_FPS = 30;
/** Margin the median must hold, so the choice is not riding on the 30 fps line. */
const HEADROOM = 1.10;
/** The close tier has to actually be used, or the thresholds are not doing their job. */
const MIN_CLOSE_UNITS = 25;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * One sample in its own browser. The caller closes nothing: this function owns the browser it
 * opens, so no two WebGL contexts are ever live at the same time.
 */
async function sample(candidate) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    let pageError = null;
    page.on("pageerror", (e) => {
      pageError ??= e.message.slice(0, 200);
    });
    await page.goto(
      `http://127.0.0.1:${PORT}/?mode=bench&counts=${UNITS}&cam=${CAM}` +
      `&close=${candidate.closeMaxM}&mid=${candidate.midMaxM}`,
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForFunction(
      () => window.POC_RESULT !== undefined || window.POC_ERROR !== undefined,
      null, { timeout: 600000 }
    );
    const r = await page.evaluate(
      () => ({ result: window.POC_RESULT, error: window.POC_ERROR })
    );
    if (pageError) throw new Error(`page error: ${pageError}`);
    if (r.error) throw new Error(`POC_ERROR: ${JSON.stringify(r.error)}`);
    const b = r.result.results[0];
    return {
      fps: b.fps,
      triangles: b.triangles,
      drawCalls: b.drawCalls,
      cpuMs: b.cpuUpdateMs,
      tiers: b.perTier.map((t) => `${t.part}/${t.tier}:${t.instances}`).join(" "),
    };
  } finally {
    await browser.close();
  }
}

const rows = [];
for (const c of CANDIDATES) {
  const samples = [];
  for (let i = 0; i < REPS; i++) samples.push(await sample(c));
  const fps = samples.map((s) => s.fps);
  const last = samples[samples.length - 1];
  const closeUnits = Number((last.tiers.match(/body\/close:(\d+)/) ?? [0, 0])[1]);
  const med = median(fps);
  const row = {
    ...c,
    median: med,
    min: Math.min(...fps),
    max: Math.max(...fps),
    samples: fps,
    tris: last.triangles,
    draws: last.drawCalls,
    cpuMs: last.cpuMs,
    closeUnits,
    tiers: last.tiers,
    atCap: med >= 59.5,
    passesMedian: med >= TARGET_FPS * HEADROOM,
    passesTail: Math.min(...fps) >= TARGET_FPS,
  };
  row.viable = row.passesMedian && row.passesTail && closeUnits >= MIN_CLOSE_UNITS;
  rows.push(row);
  const cap = row.atCap ? " (at 60 Hz cap)" : "";
  console.log(
    `close ${String(c.closeMaxM).padStart(2)} m  mid ${String(c.midMaxM).padStart(2)} m  ` +
    `median ${med.toFixed(1).padStart(6)} fps  worst ${row.min.toFixed(1).padStart(5)}  ` +
    `[${row.min.toFixed(1)}-${row.max.toFixed(1)}]${cap}  ` +
    `${last.triangles.toLocaleString().padStart(11)} tris  ${last.drawCalls} draws  ` +
    `close units ${String(closeUnits).padStart(3)}  ` +
    `median ${row.passesMedian ? "ok " : "no "} tail ${row.passesTail ? "ok" : "no"}` +
    `${row.viable ? "  VIABLE" : ""}`
  );
}

const viable = rows.filter((r) => r.viable);
if (viable.length === 0) {
  console.error(
    `\nNo candidate survived the rule at ${UNITS} units: the median must reach ` +
    `${(TARGET_FPS * HEADROOM).toFixed(0)} fps, every sample must reach ${TARGET_FPS} fps, and at ` +
    `least ${MIN_CLOSE_UNITS} units must sit in the close tier. Thresholds left unchanged.`
  );
  server.close();
  process.exit(1);
}

// Of the viable candidates, rank by visual fidelity first, then by margin.
//
// Primary: most units in the close tier, because a threshold that never shows the close tier is
// not a LOD system.
// Tiebreak: LARGEST midMaxM. At equal closeMaxM, holding the skinned mid mesh visible further out
// beats a higher frame rate -- both candidates show the same close geometry, and the one with the
// bigger mid radius keeps more units out of the billboard. Ranking on margin here instead picked
// mid 30 m over mid 35 m for +9 fps, which is margin this build does not need at 35.6 fps.
viable.sort((a, b) =>
  b.closeUnits - a.closeUnits || b.midMaxM - a.midMaxM || b.median - a.median);
const pick = viable[0];
console.log(
  `\nchosen: close ${pick.closeMaxM} m, mid ${pick.midMaxM} m  ` +
  `(median ${pick.median.toFixed(1)} fps, worst ${pick.min.toFixed(1)} fps over ${REPS} samples, ` +
  `${pick.closeUnits} units in the close tier)`
);
const held = viable.filter((r) => r !== pick && r.closeUnits === pick.closeUnits);
if (held.length) {
  console.log("held back for a smaller mid radius at the same close-tier count (more impostors):");
  for (const r of held) {
    console.log(`  close ${r.closeMaxM} m / mid ${r.midMaxM} m: median ${r.median.toFixed(1)} fps, ` +
      `worst ${r.min.toFixed(1)} fps, ${r.triangles.toLocaleString()} tris`);
  }
}
console.log(`rejected by the rule:`);
for (const r of rows.filter((x) => !x.viable)) {
  const why = [
    r.passesMedian ? null : `median ${r.median.toFixed(1)} < ${(TARGET_FPS * HEADROOM).toFixed(0)}`,
    r.passesTail ? null : `worst ${r.min.toFixed(1)} < ${TARGET_FPS}`,
    r.closeUnits < MIN_CLOSE_UNITS ? `only ${r.closeUnits} close units` : null,
  ].filter(Boolean);
  console.log(`  close ${r.closeMaxM} m / mid ${r.midMaxM} m: ${why.join(", ")}`);
}

const cfg = JSON.parse(fs.readFileSync(CFG, "utf8"));
cfg.lod = {
  closeMaxM: pick.closeMaxM,
  midMaxM: pick.midMaxM,
  _comment:
    "Tuned by measurement, not assumption (ASSETS.md 4.3, SPEC.md 5.1). Produced by " +
    "tools/lod-tune.mjs from the grid below. Distances are horizontal distance from the camera to " +
    "the unit, in metres, in an empty scene with no terrain occlusion, so a real battle scene with " +
    "cover will need these re-measured. This grid was produced on a machine BELOW the mid-range " +
    "spec, so real mid-range hardware should hold a larger close tier than the one chosen here. " +
    "Re-run this tool on the target hardware before shipping.",
  evidence: {
    measuredOn:
      "MacBookPro12,1, Intel Core i5-5257U @ 2.70GHz, Intel Iris Graphics 6100, 8 GB RAM, macOS 12.7.6",
    measuredBy: `node tools/lod-tune.mjs --repeats ${REPS}`,
    units: UNITS,
    cameraDistanceM: CAM,
    repeatsPerCandidate: REPS,
    repeatIsolation:
      "one browser per sample, closed before the next; two live WebGL pages split the GPU and halve " +
      "the frame rate",
    statistic: "median and minimum over the repeats, both reported",
    targetFps: TARGET_FPS,
    requiredMedianHeadroom: HEADROOM,
    minCloseTierUnits: MIN_CLOSE_UNITS,
    selectionRule:
      "Largest closeMaxM whose MEDIAN clears the target with at least " +
      `${(HEADROOM * 100 - 100).toFixed(0)}% headroom AND whose WORST single sample still clears the bare target, with at least ` +
      `${MIN_CLOSE_UNITS} units in the close tier. Judging on the median alone once certified a 22 m ` +
      "close tier on a tight 34.3-34.5 spread, and a later run of the same build then dipped to " +
      "27.8 fps, below target. The worst-sample clause exists because of that.",
    vsyncNote:
      "Frame rate is VSYNC-capped at 60. A reading of 60.0 means the renderer sustained the " +
      "display refresh rate, not that 60.0 was measured as a throughput figure.",
    chosenReason:
      `closeMaxM=${pick.closeMaxM} m is the largest close tier satisfying the rule: median ` +
      `${pick.median.toFixed(1)} fps (${(pick.median / TARGET_FPS).toFixed(2)}x the target), worst ` +
      `sample ${pick.min.toFixed(1)} fps, ${pick.closeUnits} units in the close tier at ${UNITS} units.`,
    grid: rows.map((r) => ({
      closeMaxM: r.closeMaxM,
      midMaxM: r.midMaxM,
      medianFps: +r.median.toFixed(1),
      worstFps: +r.min.toFixed(1),
      bestFps: +r.max.toFixed(1),
      samples: r.samples.map((x) => +x.toFixed(1)),
      passesMedian: r.passesMedian,
      passesTail: r.passesTail,
      viable: r.viable,
      triangles: r.tris,
      drawCalls: r.draws,
      closeTierUnits: r.closeUnits,
      mainThreadMs: +r.cpuMs.toFixed(2),
      atVsyncCap: r.atCap,
      tiers: r.tiers,
    })),
  },
};
fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + "\n");
console.log(`written to config/crowd.json`);
server.close();
