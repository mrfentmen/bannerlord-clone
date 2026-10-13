/**
 * Reading the animation list out of a staged GLB.
 *
 * A clip registry is only honest if it is checked against the files, so the
 * tests read them rather than hard-coding what they expect to find. This lives in
 * a plain module rather than inside a test file so importing it does not pull a
 * whole suite along with it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** clients/campaign/public */
export const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public");

/** clients/campaign/public/models */
export const MODELS_DIR = join(PUBLIC_DIR, "models");

/** clients/campaign/public/anims */
export const ANIMS_DIR = join(PUBLIC_DIR, "anims");

/**
 * Clip names in a staged GLB, by file name.
 *
 * Looks in `public/models` first, then `public/anims`, so a test can say
 * `clipsOf('operator-viper.glb')` or `clipsOf('kaykit-rogue.glb')` without
 * knowing which directory a given pack was staged into.
 *
 * The glTF JSON chunk starts at byte 20 of a GLB: a 12-byte container header, an
 * 8-byte chunk header, then the payload.
 */
export function clipsOf(file: string): string[] {
  const directory = existsSync(join(MODELS_DIR, file)) ? MODELS_DIR : ANIMS_DIR;
  const bytes = readFileSync(join(directory, file));
  const chunkLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength)),
  ) as { animations?: Array<{ name?: string }> };
  return (json.animations ?? []).map((a) => a.name ?? '');
}
