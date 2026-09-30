#!/usr/bin/env node
// Writes src/design/tokens.css from src/design/tokens.ts.
//
// The stylesheet is generated rather than hand-written so a token change cannot
// leave the CSS behind (CONSTITUTION.md section 3.4). The build-tokens test fails if
// this file's output differs from what is committed, so running it is optional; not
// running it is not.

import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const bundled = await build({
  entryPoints: [join(ROOT, "src/design/index.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});
const code = bundled.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const css = mod.tokensCss();
await writeFile(join(ROOT, "src/design/tokens.css"), css, "utf8");
console.log(`wrote src/design/tokens.css (${css.length} bytes)`);
