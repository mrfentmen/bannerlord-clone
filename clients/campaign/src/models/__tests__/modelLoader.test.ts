/**
 * Task 601: ModelLoader retries a failed model load.
 *
 * The loader takes an injected `load`, so these tests observe the real retry
 * path without a Babylon scene: fail twice and succeed on the third attempt,
 * fail three times and report null, and never retry a model that is already
 * cached or in flight. Two models load concurrently without sharing attempts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ATTEMPTS,
  ModelLoader,
  type ModelInfo,
} from "../ModelLoader.js";

const MODELS: ModelInfo[] = [
  { id: "troop-gunner", path: "models/troop-gunner.glb", category: "troop" },
  { id: "humvee", path: "models/humvee.glb", category: "vehicle" },
];

/** A loader that fails `failures` times, then resolves with a token mesh. */
function flakyLoader(failures: number, token = "mesh") {
  let calls = 0;
  const load = async (): Promise<unknown> => {
    calls++;
    if (calls <= failures) throw new Error(`boom ${calls}`);
    return { name: token };
  };
  return { load, calls: () => calls };
}

async function readyLoader(options: Parameters<typeof buildLoader>[0]) {
  const loader = buildLoader(options);
  await loader.loadManifest("/models.json");
  return loader;
}

function buildLoader(options: ConstructorParameters<typeof ModelLoader>[1]) {
  return new ModelLoader({}, { retryDelayMs: 0, ...options });
}

beforeEach(() => {
  vi.stubGlobal("fetch", async () => ({
    json: async () => ({ models: MODELS }),
  }));
  // The module reports its own failures; the assertions do not need the noise.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ModelLoader retry (task 601)", () => {
  it("retries a failed load and returns the mesh once it succeeds", async () => {
    const flaky = flakyLoader(2, "gunner");
    const loader = await readyLoader({ load: flaky.load });

    await expect(loader.load("troop-gunner")).resolves.toEqual({ name: "gunner" });
    expect(flaky.calls()).toBe(3);
    expect(loader.getLoadedIds()).toEqual(["troop-gunner"]);
    loader.dispose();
  });

  it("gives up after the configured attempts and reports null", async () => {
    const flaky = flakyLoader(Number.POSITIVE_INFINITY);
    const loader = await readyLoader({ load: flaky.load, attempts: 2 });

    await expect(loader.load("humvee")).resolves.toBeNull();
    expect(flaky.calls()).toBe(2);
    expect(loader.getLoadedIds()).toEqual([]);
    loader.dispose();
  });

  it("defaults to three attempts", async () => {
    const flaky = flakyLoader(Number.POSITIVE_INFINITY);
    const loader = await readyLoader({ load: flaky.load });

    await loader.load("humvee");
    expect(flaky.calls()).toBe(DEFAULT_ATTEMPTS);
    loader.dispose();
  });

  it("does not retry a cached model, and reuses the in-flight promise", async () => {
    const flaky = flakyLoader(0, "gunner");
    const loader = await readyLoader({ load: flaky.load });

    const [first, second] = await Promise.all([
      loader.load("troop-gunner"),
      loader.load("troop-gunner"),
    ]);
    expect(first).toBe(second);
    expect(flaky.calls()).toBe(1);

    await loader.load("troop-gunner"); // now served from the cache
    expect(flaky.calls()).toBe(1);
    loader.dispose();
  });

  it("keeps each model's attempts to itself when two load together", async () => {
    const attempts: string[] = [];
    const load = async (model: ModelInfo): Promise<unknown> => {
      attempts.push(model.id);
      throw new Error("down");
    };
    const loader = await readyLoader({ load, attempts: 2 });

    const [a, b] = await Promise.all([loader.load("troop-gunner"), loader.load("humvee")]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(attempts.filter((id) => id === "troop-gunner")).toHaveLength(2);
    expect(attempts.filter((id) => id === "humvee")).toHaveLength(2);
    loader.dispose();
  });

  it("waits between attempts", async () => {
    vi.useFakeTimers();
    try {
      const flaky = flakyLoader(1, "gunner");
      const loader = await readyLoader({ load: flaky.load, retryDelayMs: 40 });

      const pending = loader.load("troop-gunner");
      await vi.advanceTimersByTimeAsync(0);
      expect(flaky.calls()).toBe(1);

      await vi.advanceTimersByTimeAsync(40);
      await expect(pending).resolves.toEqual({ name: "gunner" });
      expect(flaky.calls()).toBe(2);
      loader.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still returns null for a model that is not in the manifest, without calling the loader", async () => {
    const flaky = flakyLoader(0);
    const loader = await readyLoader({ load: flaky.load });

    await expect(loader.load("absent")).resolves.toBeNull();
    expect(flaky.calls()).toBe(0);
    loader.dispose();
  });
});
