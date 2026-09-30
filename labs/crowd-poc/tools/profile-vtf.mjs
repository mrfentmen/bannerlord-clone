/**
 * Where does the frame actually go?
 *
 * Runs the same scene twice: once with GPU vertex-texture skinning, once with the skin matrix
 * left at identity so the vertex shader does the identical rasterisation work but performs no
 * texture fetch. The difference is the cost of the animation texture reads.
 *
 * Run: node tools/profile-vtf.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { server, PORT } from "./serve.mjs";

const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("ERR", e.message.slice(0, 300)));

async function run(units, close, mid, cam, debug, reps = 5) {
  await p.goto(
    `http://127.0.0.1:${PORT}/?mode=repeat&units=${units}&reps=${reps}&cam=${cam}` +
    `&close=${close}&mid=${mid}&debug=${debug}`,
    { waitUntil: "domcontentloaded" }
  );
  await p.waitForFunction(() => window.POC_RESULT !== undefined || window.POC_ERROR !== undefined,
    null, { timeout: 600000 });
  const r = await p.evaluate(() => window.POC_RESULT);
  const f = r.runs.map((x) => x.fps);
  f.sort((a, b) => a - b);
  return { median: f[Math.floor(f.length / 2)], min: f[0], max: f[f.length - 1],
    tris: r.runs[0].triangles, tiers: r.runs[0].tiers, draws: r.runs[0].drawCalls,
    cpu: r.runs[0].cpuUpdateMs, renderer: r.hardware.renderer };
}

console.log("=== GPU vertex-texture skinning cost, measured by difference ===\n");
// The first case profiles the shipped configuration, read from config/crowd.json rather than
// hardcoded, so the quoted bottleneck cost belongs to the thresholds that actually ship. The
// others bracket it: an all-mid config, and a 300-unit run.
const cfg = JSON.parse(fs.readFileSync(new URL("../config/crowd.json", import.meta.url), "utf8"));
const cases = [
  [1000, cfg.lod.closeMaxM, cfg.lod.midMaxM, 30],
  [1000, 8, 25, 30],
  [300, cfg.lod.closeMaxM, cfg.lod.midMaxM, 30],
];
for (const [units, close, mid, cam] of cases) {
  const on = await run(units, close, mid, cam, 0);
  const off = await run(units, close, mid, cam, 1);
  const cost = off.median - on.median;
  const pct = (cost / off.median) * 100;
  console.log(`${units} units, close ${close} m, mid ${mid} m, camera ${cam} m`);
  console.log(`  tiers              ${on.tiers}`);
  console.log(`  triangles          ${on.tris.toLocaleString()}   draw calls ${on.draws}`);
  console.log(`  with skinning      ${on.median.toFixed(1)} fps  (${on.min.toFixed(1)}-${on.max.toFixed(1)})  frame ${(1000 / on.median).toFixed(2)} ms`);
  console.log(`  skin matrix = I    ${off.median.toFixed(1)} fps  (${off.min.toFixed(1)}-${off.max.toFixed(1)})  frame ${(1000 / off.median).toFixed(2)} ms`);
  console.log(`  cost of the fetches ${cost.toFixed(1)} fps  = ${(1000 / on.median - 1000 / off.median).toFixed(2)} ms/frame  (${pct.toFixed(0)}% of the no-fetch frame)\n`);
}
await b.close();
server.close();
