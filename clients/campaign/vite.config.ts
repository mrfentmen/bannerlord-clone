import { defineConfig, type PluginOption } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * The client is a static bundle: no server, no SSR, no proxy. Everything the map
 * needs is either a fetched world file or the simulation provider.
 */
export default defineConfig(({ mode }) => {
  // In any build that is not a dev build, the fixture module resolves to a module
  // that throws. The fixture code is then absent from the bundle entirely rather
  // than present and unreachable, which is what agents/README.md section 4 asks for.
  // tools/check-no-fixtures.mjs then proves it by scanning dist/.
  const isDev = mode === "development" || mode === "fixtures";
  // Root-relative, because Vite reads a leading slash in an alias replacement as
  // "relative to the project root" rather than as an absolute filesystem path.
  const FIXTURE_STUB = "/src/data/fixture/forbiddenInProduction.ts";

  return {
    // `npm run dev:fixtures` uses mode "fixtures" and must keep the fixture. Every
    // other mode, including the default "production", gets the stub.
    resolve: isDev
      ? {}
      : {
          alias: [
            {
              find: /[\\/]fixture[\\/]index\.js$/,
              replacement: FIXTURE_STUB,
            },
          ],
        },
    server: { port: 5178, strictPort: true },
    preview: { port: 5178, strictPort: true },
    build: {
      target: "es2022",
      sourcemap: true,
      // Babylon.js is 6 MB minified and there is no smaller honest way to get a
      // WebGL engine. Measured, not assumed: dist/index.html emits a
      // <link rel="modulepreload"> for the babylon chunk as well as the panels one,
      // so this split buys a separate cacheable file and a smaller critical path for
      // the UI, but it does NOT defer Babylon. Deferring it needs a dynamic import()
      // at the call site in src/, which is a source change, not a config change.
      // See PERF-AUDIT.md.
      chunkSizeWarningLimit: 7000,
      // Babylon is large. Splitting it keeps the panel UI interactive while the
      // renderer parses, which matters because SPEC.md section 10 asks for skeleton
      // UI on the very first frame.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("@babylonjs")) return "babylon";
            if (id.includes("/src/ui/") || id.includes("/src/design/")) return "panels";
            return undefined;
          },
        },
      },
    },
    // The world data is 16 MB of JSON and PNG tiles. It must never be inlined into
    // the bundle; it is fetched at runtime, with a visible skeleton meanwhile.
    assetsInclude: ["**/*.woff2"],
    // Bundle accounting for PERF-AUDIT.md. Off unless BUNDLE_VISUALIZE is set, so a
    // normal production build does no extra work and writes no report. The report is
    // the evidence for every size claim in the audit and is regenerated with
    // `npm run build:visualize` (treemap) or `npm run build:visualize:data`
    // (raw-data JSON, which is what the audit's per-module numbers come from).
    // BUNDLE_VISUALIZE_OUT moves the report out of dist/ when the fixture scanner
    // must see dist/ untouched.
    //
    // The cast is because rollup-plugin-visualizer's own Plugin type is not
    // assignable to Vite's under this tsconfig's exactOptionalPropertyTypes: the
    // two rollup type copies disagree about whether output options are optional.
    // The plugin object is well-formed; only the two type copies disagree.
    plugins: process.env.BUNDLE_VISUALIZE
      ? ([
          visualizer({
            filename: process.env.BUNDLE_VISUALIZE_OUT ?? "dist/bundle-report.html",
            template:
              process.env.BUNDLE_VISUALIZE_TEMPLATE === "raw-data" ? "raw-data" : "treemap",
            // Vite already prints a gzip size per chunk in the build log. Gzipping
            // every module again here is a second full pass over 2200 modules for
            // numbers the log already has, and it is the expensive part.
            gzipSize: false,
            brotliSize: false,
            open: false,
          }),
        ] as unknown as PluginOption[])
      : [],
  };
});
