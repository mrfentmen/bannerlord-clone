/**
 * glTF loader registration, with no GPU.
 *
 * Worth testing because the whole staged-asset pipeline (26 models, unit GLBs,
 * buildings) is dead weight until a `.glb` plugin is registered: the test proves
 * registration is what flips `hasGlbLoader()`, and that calling it twice does not
 * stack plugins.
 */

import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { hasGlbLoader } from "./units/glb.js";
import { registerGltfLoader } from "./gltf.js";

describe("registerGltfLoader", () => {
  it("registers a .glb plugin exactly once", () => {
    // A Scene must exist for the plugin registry to behave, but registration is
    // scene-independent; the NullEngine scene is just the harness.
    const scene = new Scene(new NullEngine());
    expect(scene).toBeDefined();

    const first = registerGltfLoader();
    const plugin = SceneLoader.GetPluginForExtension(".glb");
    const second = registerGltfLoader();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(hasGlbLoader()).toBe(true);
    // Idempotent: the second call did not swap in another plugin instance.
    expect(SceneLoader.GetPluginForExtension(".glb")).toBe(plugin);
    scene.dispose();
  });
});
