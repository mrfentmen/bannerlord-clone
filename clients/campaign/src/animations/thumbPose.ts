/**
 * Thumb pose correction for operator models.
 *
 * The Quaternius operator GLBs have thumb bones but NO finger bones
 * (see .agent-specs/finger-analysis.md). The thumbs often end up in
 * unnatural splayed positions from the animation clips.
 *
 * This module provides a natural resting thumb pose that can be applied
 * at runtime to make the hands look less broken.
 *
 * This is a mitigation, not a fix — the real fix is higher-fidelity
 * models with full finger rigs.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";

/**
 * Natural thumb resting rotations (local space, radians).
 * Thumbs tucked slightly inward, not splayed outward.
 */
const THUMB_POSE: Record<string, { x: number; y: number; z: number }> = {
  "Thumb1": { x: 0.2, y: 0.3, z: 0.1 },   // base: slight inward
  "Thumb2": { x: 0.3, y: 0.2, z: 0.0 },   // middle: slight curl
  "Thumb3": { x: 0.4, y: 0.1, z: 0.0 },   // tip: more curl
};

/**
 * Apply natural thumb pose to a skeleton.
 * Finds thumb bones by name (handles mixamorig: prefix) and sets
 * their local rotation to the resting pose.
 *
 * Task 652: which representation the rotation is written through depends on the
 * bone. A Babylon 8 bone carries a `rotationQuaternion` -- an identity quaternion
 * is present from construction -- so writing `bone.rotation` is silently ignored
 * and every thumb stayed exactly where the animation left it. A bone with no
 * quaternion, on the other hand, needs the Euler path. Both are handled here,
 * and the quaternion is slerped rather than lerped component-wise, because a
 * component-wise lerp of two quaternions is not on the unit sphere and the bone
 * ends up in a pose neither author intended.
 *
 * @param skeleton The model's skeleton
 * @param blend 0-1, how strongly to apply (1 = full override)
 */
export function applyThumbPose(skeleton: Skeleton, blend = 1): void {
  const amount = Number.isFinite(blend) ? Math.min(1, Math.max(0, blend)) : 1;
  for (const bone of skeleton.bones as Bone[]) {
    const name = bone.name;
    if (!name.toLowerCase().includes("thumb")) continue;

    // Determine which segment (1, 2, or 3)
    const match = name.match(/Thumb([123])/i);
    if (!match) continue;
    const pose = THUMB_POSE[`Thumb${match[1]}`];
    if (!pose) continue;

    if (bone.rotationQuaternion) {
      const target = Quaternion.RotationYawPitchRoll(pose.y, pose.x, pose.z);
      // A fresh instance every time, never written through in place: Babylon
      // bones can share one default rotationQuaternion, and mutating it moves
      // every bone that happens to point at it -- including the hands that were
      // left alone on purpose.
      bone.rotationQuaternion =
        amount >= 1
          ? target
          : Quaternion.Slerp(bone.rotationQuaternion.clone(), target, amount);
      continue;
    }

    // Blend current rotation toward target pose
    // (simple lerp on euler angles; good enough for small corrections)
    bone.rotation.x += (pose.x - bone.rotation.x) * amount;
    bone.rotation.y += (pose.y - bone.rotation.y) * amount;
    bone.rotation.z += (pose.z - bone.rotation.z) * amount;
  }
}

/**
 * The Euler angles a bone is actually going to use, whichever representation it
 * holds them in. A caller that reads `bone.rotation` on a quaternion-backed bone
 * gets an identity and concludes the correction did nothing.
 */
export function thumbEulerAngles(bone: Bone): Vector3 {
  return bone.rotationQuaternion
    ? bone.rotationQuaternion.toEulerAngles()
    : new Vector3(bone.rotation.x, bone.rotation.y, bone.rotation.z);
}

/**
 * Check if a skeleton has thumb bones (vs full finger rig).
 */
export function hasThumbBones(skeleton: Skeleton): boolean {
  return skeleton.bones.some(b => b.name.toLowerCase().includes("thumb"));
}

/**
 * Check if a skeleton has full finger bones (not just thumbs).
 */
export function hasFingerBones(skeleton: Skeleton): boolean {
  return skeleton.bones.some(b => {
    const n = b.name.toLowerCase();
    return n.includes("finger") && !n.includes("thumb");
  });
}

/**
 * Animation LOD: disable thumb bone animation at distance (Pax task 37).
 * Thumbs are small; skipping their animation beyond 30m saves CPU
 * with no visible difference.
 *
 * @param skeleton The model's skeleton
 * @param distanceToCamera Distance in meters
 * @returns True if thumb animation should be skipped
 */
export function shouldSkipThumbAnim(distanceToCamera: number): boolean {
  return distanceToCamera > 30;
}
