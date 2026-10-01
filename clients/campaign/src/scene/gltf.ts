/**
 * glTF loader registration for the campaign client.
 *
 * Babylon v8 ships the glTF decoder in `@babylonjs/loaders`, a separate package
 * from `@babylonjs/core`. Nothing decodes a GLB until a plugin is registered with
 * `SceneLoader`, and `hasGlbLoader()` in `units/glb.ts` is the honest runtime check
 * for exactly that.
 *
 * The import is a deep path to the single loader class — never the
 * `@babylonjs/loaders` barrel — so the bundle-diet pass (b1) keeps what it earned:
 * one class plus its glTF 2.0 machinery, not the whole loaders surface. Registration
 * happens inside `registerGltfLoader()`, not at module top level, so importing this
 * file has no side effects and a test can assert the before/after.
 *
 * Added 2026-10-01: see CHANGELOG.md Decisions. The 26 staged GLBs under
 * `public/models/` and the unit/building manifests are undecodable without this.
 */

import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { GLTFFileLoader } from "@babylonjs/loaders/glTF/glTFFileLoader.js";
import { hasGlbLoader } from "./units/glb.js";

/**
 * Register the glTF 2.0 loader plugin, once.
 *
 * Idempotent: a second call is a no-op when `.glb` already resolves to a real
 * plugin. Returns true when a `.glb` can now be decoded, which is the same
 * question `hasGlbLoader()` answers and the only claim this function makes.
 */
export function registerGltfLoader(): boolean {
  if (hasGlbLoader()) return true;
  SceneLoader.RegisterPlugin(new GLTFFileLoader());
  return hasGlbLoader();
}
