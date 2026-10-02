/**
 * Task 601: ModelLoader retries a failed model load.
 *
 * The loader takes an injected `load`, so these tests observe the real retry
 * path without a Babylon scene: fail twice and succeed on the third attempt,
 * fail three times and report null, and never retry a model that is already
 * cached or in flight. Two models load concurrently without sharing attempts.
 *
 * Task 602: each attempt is bounded by a timeout, the timer is cleared when
 * the attempt settles, and a hung load is retried rather than left pending.
 *
 * Task 603: the byte counts the loader reports are forwarded with the model id,
 * on every attempt, and never for a model served from the cache.
 *
 * Task 605: preloadBattle loads the battlefield categories in one pass and
 * reports which ids arrived and which failed, without rejecting.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
  ModelLoader,
  type LoadProgress,
  type ModelInfo,
} from "../ModelLoader.js";

const MODELS: ModelInfo[] = [
  { id: "troop-gunner", path: "models/troop-gunner.glb", category: "troop" },
  { id: "humvee", path: "models/humvee.glb", category: "vehicle" },
];

/** What the stubbed manifest fetch returns; a test may replace it. */
let manifestModels: ModelInfo[] = MODELS;

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
  manifestModels = MODELS;
  vi.stubGlobal("fetch", async () => ({
    json: async () => ({ models: manifestModels }),
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

describe("ModelLoader preloadBattle (task 605)", () => {
  const FIELD_MANIFEST: ModelInfo[] = [
    { id: "troop-gunner", path: "models/troop-gunner.glb", category: "troop" },
    { id: "troop-rifleman", path: "models/troop-rifleman.glb", category: "troop" },
    { id: "humvee", path: "models/humvee.glb", category: "vehicle" },
    { id: "farmhouse", path: "models/farmhouse.glb", category: "structure" },
    { id: "crate", path: "models/crate.glb", category: "prop" },
    { id: "taxi", path: "models/taxi.glb", category: "nyc" },
  ];

  it("loads the battlefield categories and leaves the map dressing alone", async () => {
    manifestModels = FIELD_MANIFEST;
    const asked: string[] = [];
    const load = async (info: ModelInfo): Promise<unknown> => {
      asked.push(info.id);
      return { name: info.id };
    };
    const loader = await readyLoader({ load });

    const report = await loader.preloadBattle();
    expect(report.loaded.sort()).toEqual(["humvee", "troop-gunner", "troop-rifleman"]);
    expect(report.failed).toEqual([]);
    expect(asked.sort()).toEqual(["humvee", "troop-gunner", "troop-rifleman"]);
    loader.dispose();
  });

  it("names the models that failed instead of rejecting the whole pass", async () => {
    manifestModels = FIELD_MANIFEST;
    const load = async (info: ModelInfo): Promise<unknown> => {
      if (info.category === "vehicle") throw new Error("wrecked");
      return { name: info.id };
    };
    const loader = await readyLoader({ load, attempts: 1 });

    const report = await loader.preloadBattle();
    expect(report.failed).toEqual(["humvee"]);
    expect(report.loaded.sort()).toEqual(["troop-gunner", "troop-rifleman"]);
    loader.dispose();
  });

  it("is a quiet no-op when the manifest has no battlefield models", async () => {
    manifestModels = FIELD_MANIFEST.filter((m) => m.category === "prop");
    const load = async (): Promise<unknown> => {
      throw new Error("should not be called");
    };
    const loader = await readyLoader({ load });

    await expect(loader.preloadBattle()).resolves.toEqual({ loaded: [], failed: [] });
    loader.dispose();
  });

  it("reuses an already loaded model instead of fetching it twice", async () => {
    manifestModels = FIELD_MANIFEST;
    let calls = 0;
    const load = async (info: ModelInfo): Promise<unknown> => {
      calls++;
      return { name: info.id };
    };
    const loader = await readyLoader({ load });

    await loader.load("humvee");
    const report = await loader.preloadBattle();
    expect(report.loaded).toContain("humvee");
    expect(calls).toBe(3); // three battlefield models, one fetch each
    loader.dispose();
  });
});

describe("ModelLoader progress (task 603)", () => {
  it("forwards the loader's byte counts, tagged with the model id", async () => {
    const seen: LoadProgress[] = [];
    const load = async (_info: ModelInfo, report: (loaded: number, total: number) => void) => {
      report(4, 10);
      report(10, 10);
      return { name: "gunner" };
    };
    const loader = await readyLoader({ load, onProgress: (p) => seen.push(p) });

    await loader.load("troop-gunner");
    expect(seen).toEqual([
      { id: "troop-gunner", loaded: 4, total: 10 },
      { id: "troop-gunner", loaded: 10, total: 10 },
    ]);
    loader.dispose();
  });

  it("keeps reporting while an attempt is retried", async () => {
    const seen: LoadProgress[] = [];
    let calls = 0;
    const load = async (_info: ModelInfo, report: (loaded: number, total: number) => void) => {
      calls++;
      report(1, 2);
      if (calls === 1) throw new Error("blip");
      report(2, 2);
      return { name: "gunner" };
    };
    const loader = await readyLoader({ load, onProgress: (p) => seen.push(p), retryDelayMs: 0 });

    await loader.load("troop-gunner");
    expect(seen.map((p) => p.loaded)).toEqual([1, 1, 2]);
    loader.dispose();
  });

  it("stays silent for a model that comes from the cache", async () => {
    const seen: LoadProgress[] = [];
    const flaky = flakyLoader(0, "gunner");
    const loader = await readyLoader({ load: flaky.load, onProgress: (p) => seen.push(p) });

    await loader.load("troop-gunner");
    await loader.load("troop-gunner");
    expect(seen).toEqual([]); // the injected loader never reported, and neither load refetched
    expect(flaky.calls()).toBe(1);
    loader.dispose();
  });

  it("needs no callback: a loader that reports into the void still resolves", async () => {
    const load = async (_info: ModelInfo, report: (loaded: number, total: number) => void) => {
      report(3, 3);
      return { name: "gunner" };
    };
    const loader = await readyLoader({ load });

    await expect(loader.load("troop-gunner")).resolves.toEqual({ name: "gunner" });
    loader.dispose();
  });
});

describe("ModelLoader timeout (task 602)", () => {
  it("defaults to a 30 s budget per attempt", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it("gives up on an attempt that never settles and reports null", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const load = () => {
        calls++;
        return new Promise<unknown>(() => {}); // never settles
      };
      const loader = await readyLoader({ load, timeoutMs: 5_000, retryDelayMs: 0, attempts: 1 });

      const pending = loader.load("troop-gunner");
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toBeNull();
      expect(calls).toBe(1);
      loader.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a hung attempt until the attempts run out", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const load = () => {
        calls++;
        return new Promise<unknown>(() => {});
      };
      const loader = await readyLoader({ load, timeoutMs: 1_000, retryDelayMs: 0, attempts: 3 });

      const pending = loader.load("humvee");
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(pending).resolves.toBeNull();
      expect(calls).toBe(3);
      loader.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the budget timer when the load finishes in time", async () => {
    vi.useFakeTimers();
    try {
      const flaky = flakyLoader(0, "gunner");
      const loader = await readyLoader({ load: flaky.load, timeoutMs: 30_000 });

      const pending = loader.load("troop-gunner");
      await vi.advanceTimersByTimeAsync(10);
      await expect(pending).resolves.toEqual({ name: "gunner" });
      expect(vi.getTimerCount()).toBe(0);
      loader.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("can be switched off with timeoutMs 0, leaving no timer armed", async () => {
    vi.useFakeTimers();
    try {
      const flaky = flakyLoader(0, "gunner");
      const loader = await readyLoader({ load: flaky.load, timeoutMs: 0 });

      const pending = loader.load("troop-gunner");
      await vi.advanceTimersByTimeAsync(0);
      await expect(pending).resolves.toEqual({ name: "gunner" });
      expect(vi.getTimerCount()).toBe(0);
      loader.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
