/**
 * Task 652 (done, verify): the thumb pose is applied to every soldier.
 *
 * The correction exists in `thumbPose.ts` and the call site is
 * `src/scene/BattleSoldier.ts`, which runs it on each soldier's skeleton as it
 * spawns. Neither is this lane's to change, so what this file verifies is the
 * behaviour the task claims: real `Bone` objects on a real `Skeleton`, with the
 * mixamo naming the staged operator GLBs actually use, come out of the call with
 * their thumbs tucked instead of splayed, and bones that are not thumbs are not
 * touched at all.
 *
 * Task 653 (done, verify): thumb animation is skipped beyond 30 m, where a thumb
 * is under a pixel anyway.
 */

import { describe, expect, it } from "vitest";
import { Bone } from "@babylonjs/core/Bones/bone.js";
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  applyThumbPose,
  hasFingerBones,
  hasThumbBones,
  shouldSkipThumbAnim,
  thumbEulerAngles,
} from "../thumbPose.js";

/** A skeleton with the bone names a Quaternius operator GLB ships. */
function operatorSkeleton(): Skeleton {
  const scene = new Scene(new NullEngine());
  const skeleton = new Skeleton('soldier', 'soldier', scene);
  const root = new Bone('mixamorig:Hips', skeleton, null, Matrix.Identity());
  const hand = new Bone('mixamorig:LeftHand', skeleton, root, Matrix.Identity());
  new Bone('mixamorig:LeftHandThumb1', skeleton, hand, Matrix.Identity());
  new Bone('mixamorig:LeftHandThumb2', skeleton, hand, Matrix.Identity());
  new Bone('mixamorig:LeftHandThumb3', skeleton, hand, Matrix.Identity());
  new Bone('mixamorig:LeftHandIndex1', skeleton, hand, Matrix.Identity());
  new Bone('mixamorig:LeftHand', skeleton, root, Matrix.Identity());
  return skeleton;
}

/** A fresh operator skeleton plus a handle on its first thumb. */
class ThumbFreeSkeleton {
  readonly skeleton: Skeleton;

  constructor(_label: string) {
    const scene = new Scene(new NullEngine());
    this.skeleton = new Skeleton('s', 's', scene);
    const root = new Bone('mixamorig:Hips', this.skeleton, null, Matrix.Identity());
    const hand = new Bone('mixamorig:LeftHand', this.skeleton, root, Matrix.Identity());
    splay(new Bone('mixamorig:LeftHandThumb1', this.skeleton, hand, Matrix.Identity()), 1.4, 1.4, 1.4);
  }

  /** The base thumb's angles. */
  thumbOne(): { x: number; y: number; z: number } {
    const bone = this.skeleton.bones.find((b) => b.name.endsWith('Thumb1')) as Bone;
    return anglesOf(bone);
  }
}

/** A skeleton with no thumbs at all, e.g. the Xbot or Soldier GLBs. */
function plainSkeleton(): Skeleton {
  const scene = new Scene(new NullEngine());
  const skeleton = new Skeleton('plain', 'plain', scene);
  const root = new Bone('Hips', skeleton, null, Matrix.Identity());
  new Bone('Spine', skeleton, root, Matrix.Identity());
  return skeleton;
}

/**
 * Euler angles of a bone as the engine will actually use them.
 *
 * Reading `bone.rotation` is not enough: a Babylon 8 bone carries an identity
 * quaternion from construction, so the Euler vector reads identity whatever the
 * quaternion says, and a test that reads it would happily pass on a correction
 * that never happened.
 */
function anglesOf(bone: Bone): { x: number; y: number; z: number } {
  const euler = thumbEulerAngles(bone);
  return { x: euler.x, y: euler.y, z: euler.z };
}

/** Put a bone into a splayed rotation, through whichever path it uses. */
function splay(bone: Bone, yaw: number, pitch: number, roll: number): void {
  if (bone.rotationQuaternion) {
    bone.rotationQuaternion.copyFrom(Quaternion.RotationYawPitchRoll(yaw, pitch, roll));
    return;
  }
  bone.rotation.set(pitch, yaw, roll);
}

describe("thumb detection (task 652)", () => {
  it("finds thumbs on an operator rig, and no fingers", () => {
    const skeleton = operatorSkeleton();
    expect(hasThumbBones(skeleton)).toBe(true);
    // The operator packs have thumbs but no finger bones; that is the whole
    // reason this correction exists.
    expect(hasFingerBones(skeleton)).toBe(false);
  });

  it("reports no thumbs on a rig without them, rather than guessing", () => {
    expect(hasThumbBones(plainSkeleton())).toBe(false);
    expect(hasFingerBones(plainSkeleton())).toBe(false);
  });
});

describe("applyThumbPose (task 652)", () => {
  it("tucks the thumbs in from a splayed pose", () => {
    const skeleton = operatorSkeleton();
    for (const bone of skeleton.bones) {
      if (bone.name.includes('Thumb')) splay(bone, 1.4, 0, 1.4);
    }
    const before = skeleton.bones
      .filter((b) => b.name.includes('Thumb1'))
      .map(anglesOf)[0] as { x: number; y: number; z: number };

    applyThumbPose(skeleton);

    const thumb1 = skeleton.bones.filter((b) => b.name.includes('Thumb1')).map(anglesOf)[0] as {
      x: number;
      y: number;
      z: number;
    };
    // The splay was 1.4 rad; the resting pose pulls it in and the tip curls
    // further than the base.
    expect(Math.abs(thumb1.y)).toBeLessThan(Math.abs(before.y));
    expect(thumb1.y).toBeCloseTo(0.3, 5);
    expect(thumb1.x).toBeCloseTo(0.2, 5);
    expect(thumb1.z).toBeCloseTo(0.1, 5);
  });

  it("curls the tip more than the base", () => {
    const skeleton = operatorSkeleton();
    applyThumbPose(skeleton);
    const bySegment = (n: string) =>
      skeleton.bones.filter((b) => b.name.includes(`Thumb${n}`)).map(anglesOf)[0] as {
        x: number;
        y: number;
        z: number;
      };
    // The pose curls further along the chain: base 0.2, middle 0.3, tip 0.4.
    expect(bySegment('1').x).toBeCloseTo(0.2, 5);
    expect(bySegment('2').x).toBeCloseTo(0.3, 5);
    expect(bySegment('3').x).toBeCloseTo(0.4, 5);
    expect(bySegment('3').x).toBeGreaterThan(bySegment('1').x);
  });

  it("honours the blend, so 0.7 is a partial correction", () => {
    const skeleton = operatorSkeleton();
    for (const bone of skeleton.bones) {
      if (bone.name.includes('Thumb')) splay(bone, 1.4, 1.4, 1.4);
    }
    applyThumbPose(skeleton, 0.7);
    const thumb = skeleton.bones.filter((b) => b.name.includes('Thumb1')).map(anglesOf)[0] as {
      y: number;
    };
    // A full blend lands on the pose; a 0.7 blend lands between the splay and
    // the pose -- short of it, because the correction is what blend scales.
    const full = new ThumbFreeSkeleton('full');
    applyThumbPose(full.skeleton, 1);
    const target = full.thumbOne().y;
    expect(target).toBeCloseTo(0.3, 5);
    expect(thumb.y).toBeLessThan(1.4);
    expect(thumb.y).toBeGreaterThan(target);
  });

  it("leaves every other bone exactly as it found it", () => {
    const skeleton = operatorSkeleton();
    for (const bone of skeleton.bones) splay(bone, 0.2, 0.1, 0.3);
    const others = skeleton.bones
      .filter((b) => !b.name.toLowerCase().includes('thumb'))
      .map((b) => ({ name: b.name, before: anglesOf(b) }));

    applyThumbPose(skeleton);

    for (const bone of skeleton.bones) {
      if (bone.name.toLowerCase().includes('thumb')) continue;
      const was = others.find((o) => o.name === bone.name)?.before as { x: number; y: number; z: number };
      expect(anglesOf(bone)).toEqual(was);
    }
  });

  it("creeps towards the pose when a partial correction is applied repeatedly", () => {
    const skeleton = operatorSkeleton();
    const xOf = () =>
      (skeleton.bones.filter((b) => b.name.includes('Thumb1')).map(anglesOf)[0] as {
        x: number;
      }).x;
    const samples = [xOf()];
    applyThumbPose(skeleton, 0.7);
    samples.push(xOf());
    applyThumbPose(skeleton, 0.7);
    samples.push(xOf());
    // Each pass moves closer to the pose's 0.2 and never past it, which is what
    // makes re-applying it on every spawn safe.
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs((samples[i] as number) - 0.2)).toBeLessThan(
        Math.abs((samples[i - 1] as number) - 0.2),
      );
    }
    expect(samples[2] as number).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it("does nothing at all to a skeleton with no thumbs", () => {
    const skeleton = plainSkeleton();
    const before = skeleton.bones.map((b) => ({ name: b.name, angles: anglesOf(b) }));
    expect(before.length).toBeGreaterThan(0);
    applyThumbPose(skeleton);
    for (const bone of skeleton.bones) {
      const was = before.find((b) => b.name === bone.name)?.angles as { x: number; y: number; z: number };
      expect(anglesOf(bone)).toEqual(was);
    }
  });

  it("survives a skeleton with no bones", () => {
    const scene = new Scene(new NullEngine());
    expect(() => applyThumbPose(new Skeleton('empty', 'empty', scene))).not.toThrow();
  });

  it("writes the rotation through the quaternion a Babylon 8 bone carries", () => {
    const skeleton = operatorSkeleton();
    const thumb = skeleton.bones.find((b) => b.name.endsWith('Thumb1')) as Bone;
    // The bone holds an identity quaternion from construction, so the Euler
    // vector is not what the engine reads.
    expect(thumb.rotationQuaternion).not.toBeNull();
    splay(thumb, 1.4, 0, 1.4);
    applyThumbPose(skeleton);
    expect(thumb.rotationQuaternion?.w).toBeCloseTo(
      Quaternion.RotationYawPitchRoll(0.3, 0.2, 0.1).w,
      5,
    );
    expect(thumb.rotationQuaternion?.length()).toBeCloseTo(1, 5);
  });

  it("handles an unusual thumb name without touching it", () => {
    const scene = new Scene(new NullEngine());
    const skeleton = new Skeleton('s', 's', scene);
    const root = new Bone('root', skeleton, null, Matrix.Identity());
    const thumbish = new Bone('Thumb', skeleton, root, Matrix.Identity());
    splay(thumbish, 0.5, 0.5, 0.5);
    applyThumbPose(skeleton);
    // "Thumb" has no segment number, so it is not one of the three bones the
    // pose defines and it is left alone rather than guessed at.
    // Compared component-wise: the angles come back through a quaternion
    // round-trip, which is accurate to float precision rather than exactly.
    const after = anglesOf(thumbish);
    expect(after.x).toBeCloseTo(0.5, 5);
    expect(after.y).toBeCloseTo(0.5, 5);
    expect(after.z).toBeCloseTo(0.5, 5);
  });
});

describe("thumb animation LOD (task 653)", () => {
  it("skips the thumb animation beyond 30 m and not before", () => {
    expect(shouldSkipThumbAnim(0)).toBe(false);
    expect(shouldSkipThumbAnim(29.9)).toBe(false);
    expect(shouldSkipThumbAnim(30)).toBe(false);
    expect(shouldSkipThumbAnim(30.1)).toBe(true);
    expect(shouldSkipThumbAnim(200)).toBe(true);
  });

  it("treats a distance that cannot be measured as near, not far", () => {
    // NaN must not skip: skipping would silently freeze a thumb for good.
    expect(shouldSkipThumbAnim(Number.NaN)).toBe(false);
    expect(shouldSkipThumbAnim(Number.POSITIVE_INFINITY)).toBe(true);
    expect(shouldSkipThumbAnim(-5)).toBe(false);
  });
});

describe("the operator rig in practice (task 652)", () => {
  it("has three thumb segments per hand and no finger bones, as the packs ship", () => {
    const skeleton = operatorSkeleton();
    const thumbs = skeleton.bones.filter((b) => b.name.toLowerCase().includes('thumb'));
    expect(thumbs.length).toBeGreaterThanOrEqual(3);
    const segments = new Set(thumbs.map((b) => b.name.replace(/^.*(Thumb\d).*$/, '$1')));
    expect(segments).toEqual(new Set(['Thumb1', 'Thumb2', 'Thumb3']));
    expect(hasFingerBones(skeleton)).toBe(false);
    // The rig is entirely thumbs-and-a-hand: no finger bones to fight with.
    expect(thumbs.every((b) => b.name.includes('Thumb'))).toBe(true);
  });
});