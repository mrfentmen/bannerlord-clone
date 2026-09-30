/** Bundle src/ into dist/ with esbuild. No framework, no dev server, no source maps in the output. */
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(ROOT, "dist");
fs.mkdirSync(out, { recursive: true });

const r = await esbuild.build({
  entryPoints: [path.join(ROOT, "src", "main.ts")],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  platform: "browser",
  outfile: path.join(out, "main.js"),
  sourcemap: true,
  minify: process.env.NODE_ENV === "production",
  logLevel: "info",
  // Babylon ships side-effectful registration for scene components; letting esbuild see the
  // explicit imports in src/ keeps the bundle honest about what it uses.
  treeShaking: true,
});
if (r.errors.length) process.exit(1);
const kb = (fs.statSync(path.join(out, "main.js")).size / 1024).toFixed(1);
console.log(`bundled dist/main.js ${kb} KB`);
