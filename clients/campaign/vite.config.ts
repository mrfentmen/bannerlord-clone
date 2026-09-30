import { defineConfig } from "vite";

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
      // WebGL engine. It is one lazily-parsed chunk, the panels chunk loads beside
      // it, and the skeleton UI does not wait for either (SPEC.md section 10).
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
  };
});
