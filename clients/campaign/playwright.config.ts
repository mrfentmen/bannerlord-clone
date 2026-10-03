import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production-shaped build, not the dev server, so the
 * fixture-exclusion alias in vite.config.ts is exercised by the same build the tests
 * see. Mode "fixtures" keeps the test double reachable, which is the only reason it
 * is not in that build.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  // Must exceed the READY_TIMEOUT (120 s) the e2e specs wait for first paint: the
  // boot loads ~16 MB of world files plus the elevation boot tiles, and a global
  // timeout shorter than that wait fails the test before the app can become ready.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4178",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // See the note below on why this is the installed Chrome rather than the bundled
    // Chromium.
    channel: "chrome",
  },
  webServer: {
    // --host 127.0.0.1, because vite preview otherwise binds `localhost`, which resolves
    // to [::1] on this machine and leaves 127.0.0.1 refusing connections.
    command: "npm run build:e2e && npx vite preview --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178/",
    reuseExistingServer: false,
    // The bundle is 6 MB of Babylon, so the build itself takes a few minutes.
    timeout: 600_000,
    // The suite runs against test fixtures (the specs assert the fixture banner).
    // The fixtures build keeps the fixture module, but the client only reads it when
    // VITE_SIMULATION_SOURCE=fixture; without this the boot tries the HTTP
    // simulation and dies at "The map did not load".
    env: { VITE_SIMULATION_SOURCE: "fixture" },
  },
  // Playwright's bundled Chromium does not support macOS 12, which is what this machine
  // runs, so the tests drive the installed Google Chrome instead. `npx playwright
  // install chromium` fails here with "Playwright does not support chromium on mac12".
  // Recorded in clients/campaign/CHANGELOG.md under Unresolved.
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
    // The width CONSTITUTION.md section 3.4 requires small-screen layout to be checked
    // at, and an iPhone-class viewport.
    {
      name: "small-screen",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 390, height: 844 } },
    },
  ],
});
