import { chromium } from "playwright";

const FLAG_SETS = {
  "default (new headless)": [],
  "angle=metal + gpu": ["--use-angle=metal", "--enable-gpu"],
  "angle=default + ignore blocklist": ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
  "angle=gl": ["--use-angle=gl"],
};

for (const [name, args] of Object.entries(FLAG_SETS)) {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args });
  const page = await browser.newPage();
  const info = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return { error: "no context" };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      version: gl.getParameter(gl.VERSION),
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "?",
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?",
      maxTexSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxVertTexUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
      maxVertUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      colorBufferFloat: !!gl.getExtension("EXT_color_buffer_float"),
      floatBlend: !!gl.getExtension("EXT_float_blend"),
      anisotropic: !!gl.getExtension("EXT_texture_filter_anisotropic"),
    };
  });
  console.log(`\n--- ${name} ---`);
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}
