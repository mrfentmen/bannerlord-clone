import { chromium } from "playwright";
const t0 = Date.now();
const browser = await chromium.launch({
  channel: "chrome", headless: true, timeout: 900000,
  args: ["--enable-gpu", "--ignore-gpu-blocklist"],
});
console.log(`launched in ${((Date.now()-t0)/1000).toFixed(1)}s, version ${browser.version()}`);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const gl = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const ctx = c.getContext("webgl2");
  if (!ctx) return { error: "no webgl2" };
  const d = ctx.getExtension("WEBGL_debug_renderer_info");
  return { renderer: ctx.getParameter(d.UNMASKED_RENDERER_WEBGL), version: ctx.VERSION };
});
console.log("gl:", JSON.stringify(gl));
await browser.close();
console.log("OK");
