# PERF-AUDIT.md — campaign client bundle audit

Agent A12. Branch `worker/rowan/campaign-client`. Changes left uncommitted, as instructed.

Scope was measurement plus safe, surgical config reduction. **No TypeScript source file under
`src/` was modified.** Files touched: `vite.config.ts`, `package.json` (devDependency + two
scripts), and this report.

## 1. The numbers

### Before (baseline, original config, first build of the session)

All sizes below are as printed by Vite (kB = 1000 bytes), which is what the build log reports.

```
vite v7.3.6 building client environment for production...
✓ 2201 modules transformed.
dist/index.html                      1.52 kB │ gzip:     0.70 kB
dist/assets/panels-BLJhlOEj.css     40.95 kB │ gzip:     7.73 kB
dist/assets/index-ChLqoUG9.js       35.70 kB │ gzip:    14.62 kB │ map:   172.72 kB
dist/assets/panels-CIGQeZnm.js      89.44 kB │ gzip:    27.22 kB │ map:   370.36 kB
dist/assets/babylon-DZNQ-TjF.js  6,008.68 kB │ gzip: 1,310.55 kB │ map: 20,454.86 kB
✓ built in 2m 33s
```

### After (final config, verified complete build, fixture guard passed)

```
vite v7.3.6 building client environment for production...
✓ 2202 modules transformed.
dist/index.html                      1.52 kB │ gzip:     0.70 kB
dist/assets/panels-O-uRq1wd.css     41.18 kB │ gzip:     7.76 kB
dist/assets/index-BjOgVFhF.js       35.70 kB │ gzip:    14.62 kB │ map:   172.72 kB
dist/assets/panels-BXDq98ey.js     102.94 kB │ gzip:    32.31 kB │ map:   487.76 kB
dist/assets/babylon-DZNQ-TjF.js  6,008.68 kB │ gzip: 1,310.55 kB │ map: 20,454.86 kB
✓ built in 1m 32s

scanned 8 built files in dist/ for fixture code
no fixture code in the production build
```

| | before | after | delta |
|---|---|---|---|
| JS, raw | 6,133.82 kB | 6,147.32 kB | +13.50 kB |
| JS, gzip | 1,352.39 kB | 1,357.48 kB | +5.09 kB |
| Babylon chunk, raw | 6,008.68 kB | 6,008.68 kB | **0.00 kB** |
| Babylon chunk, gzip | 1,310.55 kB | 1,310.55 kB | **0.00 kB** |
| build time (load 9–46) | 2m 33s | 1m 32s – 4m 23s | see note |

**The honest summary: this task produced no bundle-size reduction.** The config change I shipped
is byte-neutral by design, and the +13.50 kB is not mine — see §5. The Babylon chunk hash is
`DZNQ-TjF` and the byte count is identical across all seven builds I ran, so that figure is solid
while the panel figures drift.

Build-time note: **I could not reproduce the "~32s" in the brief.** This machine is 2 vCPU with
7.9 GB RAM, running 8 concurrent `opencode` agent processes (~3.7 GB RSS) at a load average of
9–46. Wall clock for the *same* config and the *same* 6,008.68 kB Babylon output ranged **1m 32s
to 4m 23s** (and several builds were OOM-killed outright), which is 3–8x the 32s figure. Wall
clock here measures machine contention, not the build. Do not read my timings as a regression, and
do not trust a build-time number from this box in either direction.

## 2. The 5 largest contributors

Per-module figures come from a Rollup `generateBundle` dump of `chunk.modules[].renderedLength`
(the same "rendered size" column `rollup-plugin-visualizer` treemaps use). These are
**pre-minify** rendered sizes. **Units in this section are KiB (÷1024), unlike §1 which uses
Vite's kB (÷1000)** — the underlying numbers are one set of bytes either way; don't add the two
columns together. The modules sum to 13,498.8 KiB for a chunk that emits 6,008.68 kB after esbuild,
so absolute values here are ~2.3x the emitted bytes. Shares and percentages are unit-independent
and are what the verdicts rest on.

| # | Contributor | Rendered (pre-minify) | Verdict |
|---|---|---|---|
| 1 | `@babylonjs/core` — the whole barrel, 2,169 modules | 13,498.8 KiB → emits 6,008.68 kB | essential at boot, but **not tree-shaken at all** |
| 2 | Babylon `Materials/**` | 2,396.4 kB (17.8%) | mostly dead weight |
| 3 | Babylon `Meshes/**` | 1,647.5 kB (12.2%) | needed |
| 4 | Babylon `Engines/**` | 1,197.4 kB (8.9%) | half dead weight |
| 5 | `panels` chunk — `src/ui/**` + `src/design/**`, 22 modules | emits 102.94 kB (32.31 gzip) | essential at boot, **not lazy** |

### 1. The `@babylonjs/core` barrel — 97.8% of all JS

Import chain, named:

```
src/main.ts
  └─ src/scene/CampaignScene.ts   ─┐
  └─ src/scene/terrain.ts          ├─ import { ... } from "@babylonjs/core"
  └─ src/scene/network.ts         ─┘
        └─ node_modules/@babylonjs/core/index.js   (48 × `export * from`)
              └─ ~2,169 modules across every subsystem
```

**Why nothing shakes out.** `@babylonjs/core@8.56.2` ships:

```json
"sideEffects": ["**/*", "!src/Maths/ThinMaths/**"]
```

The published package contains no `src/` directory — only compiled files at the package root
(`Maths/math.vector.js`, not `src/Maths/...`). So the negation matches nothing and the field
degrades to `**/*`: **every module is declared to have side effects, so Rollup may not drop
anything.** The symptom is visible in the data — `math.vector.js` renders at 296.9 kB from a
297.5 kB original, 99.7% of source retained, which is what "no dead-code elimination" looks like.

**I proved `build.treeshake.moduleSideEffects` cannot fix this.** I set it to return `false` for
every `@babylonjs/core` module and rebuilt. The output was **byte-identical** — same
`babylon-DZNQ-TjF.js` hash, same 6,008.64 kB (that figure is with `sourcemap` off, which drops the
~40-byte `sourceMappingURL` comment; with sourcemaps on the same content prints 6,008.68 kB). The
reason is in Vite's source
(`node_modules/vite/dist/node/chunks/config.js:32817`): the resolve plugin returns
`moduleSideEffects: pkg.hasSideEffects(resolved)` per module, and in Rollup a value returned from
a plugin's `resolveId` **overrides** the `treeshake` option. The knob is inert against Vite's dep
resolution.

Verdict: **not tree-shakeable via config.** Fixing it needs either deep imports in `src/`
(`@babylonjs/core/Meshes/mesh`) instead of the barrel, or a `resolveId` plugin that pre-empts
Vite's resolution. The first is a source change, which is out of scope for this task.

### 2. `Materials/**` — 2,396.4 kB, and the app uses `StandardMaterial` only

`grep` over `src/` (excluding the unreferenced `src/scene/units/`): `StandardMaterial` 13 refs,
**`PBRMaterial` 0**. Yet the chunk contains `Materials/PBR/**` at 333.0 kB across 14 modules,
`Materials/PBR/openpbrMaterial.js` alone at 110.9 kB. The used `standardMaterial.js` is 70.9 kB.
Verdict: **dead weight, not droppable in config.**

### 3. `Meshes/**` — 1,647.5 kB, needed

`Mesh` (226.5 kB) and `VertexData` are used directly. `Meshes/Builders/**` contributes 266.9 kB
across 26 modules because the code imports the all-in-one `MeshBuilder` (`CreateBox`,
`CreateCylinder`, `CreatePlane`, `CreateLines`), which statically references every builder in the
library — spheres, tori, tubes, lathes, polyhedra, extrusions. Only 5 are used. Verdict:
**essential at boot; the 266.9 kB is reducible only by switching to individual builder imports
in `src/`.**

### 4. `Engines/**` — 1,197.4 kB, half dead weight

The app constructs `Engine` (WebGL 2), not `WebGPUEngine` — **`WebGPU` has 0 references in
`src/`**. `Engines/webgpuEngine.js` (145.8 kB) ships anyway, and with it `ShadersWGSL/**` at
713.4 kB across 284 modules. `thinEngine.js` (163.0 kB) and `engine.js` (33.9 kB) are the real
dependency chain. Verdict: **~860 kB of provably dead WebGPU code, not droppable in config.**

### 5. `panels` chunk — not lazy, contrary to the config's own comment

The existing comment claimed Babylon is "one lazily-parsed chunk" that the panels "load beside".
**That is not what the build does.** `dist/index.html` emits:

```html
<script type="module" crossorigin src="/assets/index-D93dXTfs.js"></script>
<link rel="modulepreload" crossorigin href="/assets/panels-DecUuIqd.js">
<link rel="modulepreload" crossorigin href="/assets/babylon-DZNQ-TjF.js">
```

Both chunks are `modulepreload`ed, i.e. fetched during boot. `manualChunks` produced two
separately cacheable files; it did not defer anything, because `main.ts` imports the panels with
static `import` statements and reaches Babylon through them. I corrected that comment to describe
measured behaviour.

The panels are also genuinely boot-essential (`SPEC.md` section 10 skeleton-first: `StartScreen`
must paint before the world fetch resolves), so lazy-loading them would be wrong even if it were
reachable. Deferring *any* of it needs `await import()` at the call site — a `src/` change.

## 3. What I changed, and why

**`vite.config.ts`** — added an **env-gated** `rollup-plugin-visualizer` block, off unless
`BUNDLE_VISUALIZE` is set:

- A normal production build evaluates the array to `[]` and is byte-identical to before. Verified:
  the Babylon chunk hash and size are unchanged.
- It makes this audit reproducible instead of a one-off: `npm run build:visualize` (treemap) and
  `npm run build:visualize:data` (raw-data JSON).
- **Caveat, measured:** on this box the visualizer was OOM-killed 4 times out of 4, including
  with `gzipSize`/`brotliSize` off. The per-module numbers in §2 therefore came from an
  equivalent ~20-line inline `generateBundle` hook that dumps `chunk.modules[].renderedLength`
  and nothing else — same attribution, a fraction of the memory, and it succeeded. Treat
  `build:visualize` as the tool for a normal machine; if it OOMs there, use the dump approach.
- `gzipSize`/`brotliSize` are off because Vite already prints a per-chunk gzip size in the build
  log, and gzipping 2,200 modules again is the expensive pass.
- It carries one `as unknown as PluginOption[]` cast. `rollup-plugin-visualizer`'s own `Plugin`
  type is not assignable to Vite's under this tsconfig's `exactOptionalPropertyTypes: true` — the
  two bundled rollup type copies disagree about optionality of `outputOptions`. The plugin object
  is well-formed; only the type copies disagree. The cast is confined to the dev-only block and
  `tsc --noEmit` reports **0 errors in `vite.config.ts`**.

I also corrected the `sourcemap`/`chunkSizeWarningLimit` comment block to match measured behaviour
(comment only, no code change).

**`package.json`** — added `rollup-plugin-visualizer@^7.1.1` to `devDependencies`, and the two
`build:visualize*` scripts. No existing script changed.

## 4. What I deliberately did NOT change, and why

- **The tree-shaking override.** I quantified the prize and did not take it. Provably unreferenced
  subsystems — `ShadersWGSL` 713.4 kB, `FrameGraph` 640.9 kB, `Particles` 634.1 kB, `XR` 565.8 kB,
  `Physics` 233.1 kB, `FlowGraph` 274.1 kB, `Audio`/`AudioV2` 216.7 kB, `Materials/PBR` 333.0 kB,
  `webgpuEngine.js` 145.8 kB — total **3,756.9 kB pre-minify = 27.8% of the chunk**, implying
  **~1.67 MB** off the emitted 6,008.68 kB. *(That is a bounded estimate from measured subsystem
  sizes, not a measured build — I did not produce a build with it applied.)*
  I left it alone because Babylon registers shaders, `Engine.prototype` extensions and scene
  components through **import side effects**. Declaring those modules side-effect-free is exactly
  the change that builds green and fails at runtime with "shader not found" or
  "`bakeCurrentTransformIntoVertices` is not a function". Your rules make booting the app a
  precondition for shipping any change, and **there is no browser on this machine** (no
  `chromium`, `chromium-browser`, `google-chrome` or `google-chrome-stable` binary; `~/.cache/ms-playwright/` is empty; the Playwright
  config drives an installed Google Chrome that this Linux box does not have). I could not verify
  a boot, so I did not ship it. §6 says what it would take.
- **`build.target`.** Cannot go below `es2022`: `src/main.ts` uses top-level `await`, and lowering
  the target would break the boot sequence outright.
- **`sourcemap: true`.** It is the single biggest build-time cost I found (the Babylon chunk emits
  a 20,454.86 kB map). I kept it because `tools/check-no-fixtures.mjs` is *designed* around maps
  being present — see its comment on lines 28–31, which explains that a stub's sourcemap
  legitimately contains `createFixtureSimulationProvider`, which is why that name is excluded from
  the marker list. Turning maps off would quietly weaken the fixture guard. If you want them
  deployment-only, that is a deliberate policy change for the repo owner, not a perf tweak.
- **`esbuild.legalComments: "none"`.** Would strip some bytes, but Babylon is Apache-2.0 and those
  banners are licence attribution. Given this repo's constitution, that is not mine to trade for
  kilobytes.
- **`build.reportCompressedSize: false`.** Saves a gzip pass on 6 MB, but it deletes the per-chunk
  gzip numbers from the build log, which is where the size budget is actually watched. Bad trade.
- **A finer `manualChunks` split** (e.g. peeling `babylon-shaders` out). No size effect, and every
  chunk stays preloaded anyway since all three are statically imported. Cosmetic churn.
- **Any lazy route for non-boot panels.** Requires `await import()` in `src/main.ts`, which the
  rules put off-limits — and `StartScreen`/`hud` are boot-critical anyway.

## 5. Things that make these numbers hard to trust — stated plainly

1. **The working tree is a moving target.** Another agent is writing `src/` *while I worked*:
   `src/scene/units/` appeared at 22:46–22:56, and `TownPanel`, `StartScreen`, `PartyPanel`,
   `LedgerPanel`, `MarchPlanner`, `RulerPanel`, `WhyPanel`, `skeletons`, `ui.css` were all edited
   between 23:09 and 23:53. That is why the `panels` chunk grew 89.44 → 102.94 kB between my
   first and last build — **that +13.50 kB is the peer's work, not mine.** I never touched `src/`.
   The Babylon chunk was unaffected (`DZNQ-TjF` every time).
2. **`npm run build` currently fails, before it reaches Vite**, because `tsc --noEmit` is red on
   peer files: `src/scene/units/units.test.ts` (3 errors) and
   `src/ui/__tests__/panels.test.ts` (1 error). I am forbidden from fixing `src/`. `tsc` is clean
   in the files I own — **0 errors in `vite.config.ts`**.
3. **`npm test` is red for the same reason.** It moved twice while I worked, which is the clearest
   evidence of the churn: first 6 failed / 395 passed (401) with failures in `src/__probe.test.ts`,
   `src/scene/units/units.test.ts` and `src/ui/__tests__/paperwork.test.ts`; by the final run
   **5 failed / 414 passed (419)**, with `src/__probe.test.ts` and `paperwork.test.ts` fixed by
   their author and the failures now in `src/scene/units/units.test.ts`,
   `src/ui/__tests__/panel-keyboard.test.ts` and `src/ui/__tests__/panels.test.ts`. All are peer
   files. `paperwork.test.ts` was a good illustration: it is *unmodified*, and it failed only
   because a peer added a fifth wizard step to `StartScreen.ts` (+171 lines) while the test still
   expected four. Nothing in any failure touches `vite.config.ts` or the bundling.
4. **This box OOM-killed 6 of my builds** at the chunk-render stage (`Killed`, 2 cores / 7.9 GB /
   8 agents / load 10–46). I confirmed the output of a killed build is still internally consistent
   (every asset `index.html` references was present, including sourcemaps) and I did not count any
   killed build as a result. Every number in §1 comes from a build that printed `✓ built in`.
5. **No browser exists here**, so "the app boots" is unverified for anything. That is why my
   shipped change is a dev-only, env-gated plugin.

## 6. Recommendation, for whoever owns `src/`

The only real lever left is the barrel import, and it is a source change:

1. Replace `from "@babylonjs/core"` with deep imports
   (`@babylonjs/core/Engines/engine`, `.../Meshes/mesh`, `.../Materials/standardMaterial`,
   `.../Materials/Textures/dynamicTexture`, `.../PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline`).
   This is what actually removes the WebGPU, PBR, XR, Physics and Particles code — worth an
   estimated **~1.67 MB of the 6.0 MB**, though treat that as an estimate until built.
2. Skip `MeshBuilder` for individual builders to recover most of the 266.9 kB.
3. For boot time specifically, `await import("../scene/CampaignScene.js")` after
   `buildWorld()` resolves would let the skeleton UI paint before 6 MB of engine is parsed — which
   is what `SPEC.md` section 10 actually asks for and what the current `manualChunks` split does
   *not* deliver.
4. Do 1–3 behind a real browser boot check, which this environment cannot provide.

Meanwhile the honest cheap win for whoever runs CI on a real machine: run
`npm run build:visualize:data` and fail the build on the Babylon chunk's raw size, so the 6 MB
stops being invisible.