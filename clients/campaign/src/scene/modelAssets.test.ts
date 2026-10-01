/**
 * Staged model assets, with no GPU and no network.
 *
 * Worth testing because this is the file that turns Milo's 26 staged GLBs into
 * scene-graph nodes: the manifest must validate strictly (a corrupt manifest is a
 * content problem, not a guess), a model must land scaled to its target length and
 * grounded at y = 0, and every failure mode must report rather than throw.
 */

import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import {
  fetchModelManifest,
  loadModelAsset,
  modelAssetUrl,
  parseModelManifest,
  type ModelManifest,
  type ModelMeshLoader,
} from "./modelAssets.js";

function testScene(): Scene {
  return new Scene(new NullEngine());
}

const MANIFEST: ModelManifest = {
  version: 1,
  baseUrl: "./models/",
  models: {
    humvee: { file: "humvee.glb", category: "vehicles", targetLength: 6 },
    "troop-officer": {
      file: "troop-officer.glb",
      category: "troops",
      targetLength: 1.8,
      rotateX: -Math.PI / 2,
      notes: "geometry lies flat along Z",
    },
  },
};

/** A 2m x 4m x 6m box: longest axis 6, lowest point at y = -2. */
function boxLoader(): ModelMeshLoader {
  return async (_url, scene) => {
    const mesh = CreateBox("box", { width: 2, height: 4, depth: 6 }, scene);
    return [mesh as AbstractMesh];
  };
}

describe("modelAssetUrl", () => {
  it("resolves a manifest entry against baseUrl", () => {
    expect(modelAssetUrl(MANIFEST, "humvee")).toBe("./models/humvee.glb");
  });

  it("returns null for an unknown asset", () => {
    expect(modelAssetUrl(MANIFEST, "blimp")).toBeNull();
  });
});

describe("parseModelManifest", () => {
  it("accepts the shipped models.manifest.json shape", () => {
    const parsed = parseModelManifest(
      {
        version: 1,
        baseUrl: "./models/",
        models: {
          humvee: { file: "humvee.glb", category: "vehicles", targetLength: 6 },
        },
        credits: ["staged by milo's lane"],
      },
      "models.manifest.json",
    );
    expect(parsed.models["humvee"]?.targetLength).toBe(6);
    expect(parsed.credits).toEqual(["staged by milo's lane"]);
  });

  it("rejects a wrong version", () => {
    expect(() => parseModelManifest({ version: 2, models: {} }, "m")).toThrow(/unsupported version/);
  });

  it("rejects an entry with no positive targetLength", () => {
    expect(() =>
      parseModelManifest(
        { version: 1, models: { humvee: { file: "humvee.glb", category: "vehicles" } } },
        "m",
      ),
    ).toThrow(/targetLength/);
  });

  it("rejects an unknown category", () => {
    expect(() =>
      parseModelManifest(
        {
          version: 1,
          models: { humvee: { file: "humvee.glb", category: "aircraft", targetLength: 6 } },
        },
        "m",
      ),
    ).toThrow(/unknown category/);
  });
});

describe("loadModelAsset", () => {
  it("scales the model to the target length and grounds it", async () => {
    const scene = testScene();
    const onError = vi.fn();
    // Inject the loader so the no-glb-loader check for the default path is skipped.
    const loaded = await loadModelAsset("humvee", {
      scene,
      manifest: MANIFEST,
      loadMeshes: boxLoader(),
      onError,
    });

    expect(loaded).not.toBeNull();
    // The box's longest axis is 6m and the target is 6m: scale is 1.
    expect(loaded?.scale).toBeCloseTo(1, 6);
    expect(loaded?.authoredLength).toBeCloseTo(6, 6);
    // The box was 4m tall centred at y = 0; after grounding the root sits at y = 2
    // and the model's lowest point is at y = 0.
    expect(loaded?.root.position.y).toBeCloseTo(2, 6);
    for (const mesh of loaded?.root.getChildMeshes(false) ?? []) {
      expect(mesh.isPickable).toBe(false);
    }
    expect(onError).not.toHaveBeenCalled();
    scene.dispose();
  });

  it("applies the rotateX fix before measuring", async () => {
    const scene = testScene();
    const loaded = await loadModelAsset("troop-officer", {
      scene,
      manifest: MANIFEST,
      loadMeshes: boxLoader(),
    });

    expect(loaded).not.toBeNull();
    expect(loaded?.root.rotation.x).toBeCloseTo(-Math.PI / 2, 6);
    scene.dispose();
  });

  it("reports an unknown asset and resolves null", async () => {
    const scene = testScene();
    const onError = vi.fn();
    const loaded = await loadModelAsset("blimp", { scene, manifest: MANIFEST, onError });

    expect(loaded).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ failure: "no-manifest-entry", url: null });
    scene.dispose();
  });

  it("reports a loader that throws and resolves null", async () => {
    const scene = testScene();
    const onError = vi.fn();
    const loaded = await loadModelAsset("humvee", {
      scene,
      manifest: MANIFEST,
      loadMeshes: async () => {
        throw new Error("network down");
      },
      onError,
    });

    expect(loaded).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ failure: "load-failed", url: "./models/humvee.glb" });
    scene.dispose();
  });

  it("reports an empty model and resolves null", async () => {
    const scene = testScene();
    const onError = vi.fn();
    const loaded = await loadModelAsset("humvee", {
      scene,
      manifest: MANIFEST,
      loadMeshes: async () => [],
      onError,
    });

    expect(loaded).toBeNull();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ failure: "empty-model" });
    scene.dispose();
  });
});

describe("fetchModelManifest", () => {
  it("throws a descriptive error on a non-JSON body", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchModelManifest("models.manifest.json")).rejects.toThrow(/not JSON/);
    vi.unstubAllGlobals();
  });

  it("throws on an HTTP error", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchModelManifest("models.manifest.json")).rejects.toThrow(/HTTP 404/);
    vi.unstubAllGlobals();
  });
});
