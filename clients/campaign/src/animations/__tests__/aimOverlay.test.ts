/**
 * Task 655: aiming is an upper-body overlay, not a state the whole body takes.
 *
 * The mask is the substance: the Quaternius rigs have both "LeftUpLeg" and
 * "LeftUpperArm", so a mask matching on "upper" alone takes the thigh with it and
 * the character stops walking while aiming. The tests pin the leg exclusion, the
 * fade in and out, and that the layer reports itself as moving while it does.
 */

import { describe, expect, it } from "vitest";
import { AIM_FADE_S, AimLayer, boneInAimMask } from "../Locomotion.js";

const OPERATOR_BONES = [
  'mixamorig:Hips',
  'mixamorig:Spine',
  'mixamorig:Spine2',
  'mixamorig:Neck',
  'mixamorig:Head',
  'mixamorig:LeftShoulder',
  'mixamorig:LeftUpLeg',
  'mixamorig:LeftLeg',
  'mixamorig:LeftFoot',
  'mixamorig:RightShoulder',
  'mixamorig:RightUpLeg',
  'mixamorig:RightLeg',
  'mixamorig:RightFoot',
];

describe("the aim mask (task 655)", () => {
  it("takes the spine, neck, head and arms", () => {
    for (const bone of ['Spine', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightHand']) {
      expect(boneInAimMask(`mixamorig:${bone}`), bone).toBe(true);
    }
    expect(boneInAimMask('mixamorig:LeftArm')).toBe(true);
    expect(boneInAimMask('mixamorig:LeftForeArm')).toBe(true);
    expect(boneInAimMask('mixamorig:LeftHand')).toBe(true);
  });

  it("never takes a leg bone, even one whose name contains 'upper'", () => {
    for (const bone of ['Hips', 'LeftUpLeg', 'RightLeg', 'LeftFoot', 'LeftToeBase']) {
      expect(boneInAimMask(`mixamorig:${bone}`), bone).toBe(false);
    }
    // The case this exists for: "UpLeg" contains "up", and a naive substring
    // mask takes the thigh.
    expect(boneInAimMask('mixamorig:LeftUpLeg')).toBe(false);
  });

  it("is case insensitive, because rigs are not consistent about it", () => {
    expect(boneInAimMask('SPINE')).toBe(true);
    expect(boneInAimMask('leftupleg')).toBe(false);
  });
});

describe("AimLayer (task 655)", () => {
  it("starts off and stays off while the character is not aiming", () => {
    const layer = new AimLayer();
    const first = layer.update(1 / 60, OPERATOR_BONES);
    expect(first.weight).toBe(0);
    expect(first.bones).toEqual([]);
    expect(first.moving).toBe(false);
  });

  it("fades in over AIM_FADE_S and settles", () => {
    const layer = new AimLayer();
    layer.aiming = true;
    const half = layer.update(AIM_FADE_S / 2, OPERATOR_BONES);
    expect(half.weight).toBeCloseTo(0.5, 2);
    expect(half.moving).toBe(true);
    expect(half.bones).toContain('mixamorig:Head');
    expect(half.bones).toContain('mixamorig:Spine');

    const done = layer.update(AIM_FADE_S, OPERATOR_BONES);
    expect(done.weight).toBe(1);
    // The frame the overlay arrives on reports itself settled: a caller polling
    // `moving` to decide whether to keep writing should stop here.
    expect(done.moving).toBe(false);
  });

  it("fades out when the character stops aiming", () => {
    const layer = new AimLayer();
    layer.aiming = true;
    layer.update(AIM_FADE_S);
    expect(layer.currentWeight).toBe(1);
    layer.aiming = false;
    layer.update(AIM_FADE_S / 2);
    expect(layer.currentWeight).toBeCloseTo(0.5, 2);
    layer.update(AIM_FADE_S / 2);
    expect(layer.currentWeight).toBe(0);
  });

  it("only ever offers the upper body to the overlay", () => {
    const layer = new AimLayer();
    layer.aiming = true;
    const { bones } = layer.update(AIM_FADE_S, OPERATOR_BONES);
    expect(bones.length).toBeGreaterThan(4);
    expect(bones.every((b) => boneInAimMask(b))).toBe(true);
    expect(bones.some((b) => b.includes('Leg'))).toBe(false);
    expect(bones.some((b) => b.includes('Foot'))).toBe(false);
  });

  it("keeps its weight inside 0..1 however it is driven", () => {
    const layer = new AimLayer(Number.NaN);
    layer.aiming = true;
    for (const delta of [0.1, 1, 100, -1, Number.NaN, 0]) {
      const frame = layer.update(delta, OPERATOR_BONES);
      expect(frame.weight).toBeGreaterThanOrEqual(0);
      expect(frame.weight).toBeLessThanOrEqual(1);
    }
  });

  it("reaches the target immediately when a frame is longer than the fade", () => {
    const layer = new AimLayer(0.2);
    layer.aiming = true;
    expect(layer.update(0.5).weight).toBe(1);
  });

  it("works with no bone list at all", () => {
    const layer = new AimLayer();
    layer.aiming = true;
    const frame = layer.update(1);
    expect(frame.weight).toBe(1);
    expect(frame.bones).toEqual([]);
  });
});
