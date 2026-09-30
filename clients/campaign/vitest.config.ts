import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node everywhere. UI tests that need a DOM opt in with a
    // `@vitest-environment jsdom` docblock, so there is no global jsdom cost and
    // no hidden per-glob behaviour.
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
