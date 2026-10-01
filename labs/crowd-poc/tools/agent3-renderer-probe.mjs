/**
 * agent3: does this machine have a GPU renderer available at all?
 *
 * `tools/benchmark.mjs` reports frame rates only when the WebGL renderer string is not a software
 * rasteriser, and `labs/crowd-poc/MIDRANGE_HARDWARE.md` section 2 says the same. The Phase 3 exit
 * criterion is a frame rate on mid-range consumer hardware. This probe answers the prior question
 * only: which renderer strings can be obtained here, and are any of them hardware?
 *
 * It tries Playwright's bundled Chromium (the `channel: "chrome"` distribution the harness asks for
 * is not installed) across the flag combinations that could plausibly reach a real driver, plus
 * Xvfb so the X11 path is available rather than merely assumed broken. It reports what it finds and
 * nothing else: no frame rate, no extrapolation.
 *
 * Run:
 *   node tools/agent3-renderer-probe.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { spawn } from "node:child_process";

// Copied verbatim from tools/benchmark.mjs so this probe and the harness cannot disagree.
const SOFT_RENDERERS = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

function host() {
  const out = [];
  out.push(["/dev/dri", fs.existsSync("/dev/dri") ? "present" : "ABSENT"]);
  out.push(["/dev/nvidia0", fs.existsSync("/dev/nvidia0") ? "present" : "ABSENT"]);
  out.push(["/dev/nvidiactl", fs.existsSync("/dev/nvidiactl") ? "present" : "ABSENT"]);
  const accel = [];
  for (const d of fs.readdirSync("/sys/bus/pci/devices", { withFileTypes: true }).filter((e) => e.isDirectory())) {
    try {
      const cls = fs.readFileSync(`/sys/bus/pci/devices/${d.name}/class`, "utf8").trim();
      // 0x03xxxx = display controller, 0x0300 = VGA, 0x0380 = other display
      if (cls.startsWith("0x03")) accel.push(`${d.name} class=${cls}`);
    } catch {
      /* sysfs entry vanished mid-scan; not a result */
    }
  }
  out.push(["PCI display devices", accel.length ? accel.join(", ") : "NONE"]);
  return out;
}

const CASES = [
  { name: "bundled chromium, headless, default", channel: undefined, env: {}, args: [] },
  { name: "bundled chromium, headless, --enable-gpu --ignore-gpu-blocklist", channel: undefined, env: {}, args: ["--enable-gpu", "--ignore-gpu-blocklist"] },
  { name: "bundled chromium, headless, --enable-unsafe-swiftshader", channel: undefined, env: {}, args: ["--enable-unsafe-swiftshader", "--enable-gpu"] },
  { name: "bundled chromium, headless, --use-angle=gl (X11/GL path)", channel: undefined, env: {}, args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] },
  { name: "bundled chromium, headless, --use-angle=vulkan", channel: undefined, env: {}, args: ["--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist"] },
];

let xvfb = null;
async function withXvfb(fn) {
  try {
    // spawn, not execFileSync: Xvfb runs in the foreground and never exits, so a synchronous
    // spawn would block here forever.
    xvfb = spawn("Xvfb", [":99", "-screen", "0", "1280x720x24", "-nolisten", "tcp"], {
      stdio: "ignore",
      detached: true,
    });
    xvfb.on("error", () => {});
  } catch {
    console.log("\nXvfb could not be started; skipping X11 cases.");
    return;
  }
  // Wait for the X socket to appear rather than guessing a sleep duration.
  const socket = "/tmp/.X11-unix/X99";
  let up = false;
  for (let i = 0; i < 60; i++) {
    if (fs.existsSync(socket)) { up = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\nXvfb socket ${socket}: ${up ? "up" : "never appeared"}`);
  if (up) await fn();
  try {
    if (xvfb) process.kill(-xvfb.pid);
  } catch {
    /* already gone */
  }
  xvfb = null;
}

async function probe(c) {
  const line = { name: c.name, launched: false, error: null, info: null };
  try {
    const browser = await chromium.launch({
      ...(c.channel ? { channel: c.channel } : {}),
      headless: true,
      timeout: 60000,
      args: [...c.args, "--no-sandbox"],
      env: { ...process.env, ...c.env },
    });
    line.launched = true;
    line.version = browser.version();
    const page = await browser.newPage();
    line.info = await page.evaluate(() => {
      const cv = document.createElement("canvas");
      const gl = cv.getContext("webgl2") || cv.getContext("webgl");
      if (!gl) return { error: "no WebGL context at all" };
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        version: gl.getParameter(gl.VERSION),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxVertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
      };
    });
    await browser.close();
  } catch (e) {
    line.error = String(e.message).split("\n")[0];
  }
  return line;
}

function print(r) {
  console.log(`\n--- ${r.name} ---`);
  if (!r.launched) {
    console.log(`  launch FAILED: ${r.error}`);
    return;
  }
  console.log(`  browser: ${r.version}`);
  if (r.info?.error) {
    console.log(`  ${r.info.error}`);
    return;
  }
  const renderer = String(r.info.renderer);
  console.log(`  gl version: ${r.info.version}`);
  console.log(`  gl vendor : ${r.info.vendor}`);
  console.log(`  gl renderer: ${renderer}`);
  console.log(`  software rasteriser per the harness regex: ${SOFT_RENDERERS.test(renderer) ? "YES" : "no"}`);
}

console.log("=== HOST GRAPHICS FACTS ===");
for (const [k, v] of host()) console.log(`  ${k.padEnd(22)}: ${v}`);

console.log("\n=== HEADLESS CASES (no X server) ===");
for (const c of CASES) print(await probe(c));

console.log("\n=== XVFB CASES (X11 server on :99) ===");
await withXvfb(async () => {
  print(await probe({ name: "bundled chromium under Xvfb, default", channel: undefined, env: { DISPLAY: ":99" }, args: ["--enable-gpu", "--ignore-gpu-blocklist"] }));
  print(await probe({ name: "bundled chromium under Xvfb, --use-gl=desktop (llvmpipe/mesa)", channel: undefined, env: { DISPLAY: ":99" }, args: ["--use-gl=desktop", "--enable-gpu", "--ignore-gpu-blocklist"] }));
});

console.log("\n=== CHANNEL chrome (what tools/benchmark.mjs requests) ===");
print(await probe({ name: 'chromium.launch({ channel: "chrome" })', channel: "chrome", env: {}, args: ["--enable-gpu", "--ignore-gpu-blocklist"] }));

console.log("\nNo frame rate is reported by this script, on purpose. See tools/probe-host.mjs.");
process.exit(0);
