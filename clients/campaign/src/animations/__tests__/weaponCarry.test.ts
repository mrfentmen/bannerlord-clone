/**
 * Task 647: an idle character carries its weapon slung across its back.
 *
 * The pose is checked, not just stored: the muzzle of a slung weapon has to end
 * up above and behind the shoulder rather than through the character's own head,
 * which is what {@link muzzlePoint} exists to make testable against a real weapon
 * length -- the AK-74's 0.9 m from the manifest.
 *
 * Task 648: the same weapon comes into both hands in combat.
 */

import { describe, expect, it } from "vitest";
import {
  BACK_SLUNG,
  CARRY_BLEND_S,
  CarryStateTracker,
  LOW_READY,
  POSE_BY_STANCE,
  STOWED,
  muzzleDirection,
  muzzlePoint,
  poseFor,
  type Stance,
  type WeaponCarry,
} from "../WeaponCarry.js";

// The staged AK-74's target length, from models.manifest.json.
const AK74_LENGTH = 0.9;

describe("carry poses (task 647)", () => {
  it("slings the weapon across the back when idle", () => {
    expect(POSE_BY_STANCE.idle).toBe(BACK_SLUNG);
    expect(BACK_SLUNG.anchor).toBe('back');
    expect(BACK_SLUNG.rightHanded).toBe(false);
    // Sling goes behind the body and over the shoulder, not through it.
    expect(BACK_SLUNG.offset.z).toBeLessThan(0);
    expect(BACK_SLUNG.offset.x).toBeLessThan(0);
    expect(BACK_SLUNG.rotation.y).toBeGreaterThan(1);
  });

  it("puts the muzzle above and behind the shoulder, clear of the head", () => {
    // The head sits roughly 0.1 m forward of the spine and 0.25 m up, so the
    // muzzle of a 0.9 m rifle has to end up above that and behind it.
    const muzzle = muzzlePoint(BACK_SLUNG, AK74_LENGTH);
    expect(muzzle.y).toBeGreaterThan(0.25);
    expect(muzzle.z).toBeLessThan(0);
    expect(muzzle.x).toBeLessThan(0);
    // The direction itself is a unit vector, so the length means what it says.
    const dir = muzzleDirection(BACK_SLUNG);
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1);
  });

  it("honours a weapon's own idle override", () => {
    const pistol: WeaponCarry = { id: 'weapon-m1911', idlePose: LOW_READY };
    expect(poseFor(pistol, 'idle')).toBe(LOW_READY);
    expect(poseFor({ id: 'weapon-ak74' }, 'idle')).toBe(BACK_SLUNG);
  });

  it("stows the weapon when the character is down", () => {
    const stances: Stance[] = ['idle', 'moving', 'downed'];
    for (const stance of stances) {
      expect(poseFor({ id: 'weapon-ak74' }, stance)).toBe(POSE_BY_STANCE[stance]);
    }
    expect(poseFor({ id: 'weapon-ak74' }, 'downed')).toBe(STOWED);
    expect(STOWED.anchor).toBe('none');
  });

  it("survives a weapon length that cannot be measured", () => {
    for (const bad of [0, -1, Number.NaN]) {
      const muzzle = muzzlePoint(BACK_SLUNG, bad);
      expect(Number.isFinite(muzzle.z)).toBe(true);
    }
  });
});

describe("CarryStateTracker (task 647)", () => {
  it("starts in the pose the character was authored in", () => {
    const tracker = new CarryStateTracker('moving');
    const state = tracker.update(1 / 60);
    expect(state.stance).toBe('moving');
    expect(state.pose).toBe(LOW_READY);
    expect(state.moving).toBe(false);
    expect(state.blend).toBe(1);
  });

  it("takes the weapon to a new stance over a quarter of a second", () => {
    const tracker = new CarryStateTracker('idle');
    tracker.update(1 / 60);
    expect(tracker.state.pose).toBe(BACK_SLUNG);

    tracker.setStance('moving');
    const first = tracker.update(CARRY_BLEND_S / 2);
    expect(first.pose).toBe(LOW_READY);
    expect(first.moving).toBe(true);
    expect(first.blend).toBeCloseTo(0.5, 1);

    const done = tracker.update(CARRY_BLEND_S / 2);
    expect(done.moving).toBe(false);
    expect(done.blend).toBe(1);
  });

  it("does not restart the swap when the same stance is set again", () => {
    const tracker = new CarryStateTracker('idle');
    tracker.setStance('combat');
    tracker.update(CARRY_BLEND_S / 2);
    const before = tracker.state.blend;
    tracker.setStance('combat');
    expect(tracker.state.blend).toBe(before);
  });

  it("ends on the last stance when it flickers", () => {
    const tracker = new CarryStateTracker('idle');
    tracker.setStance('moving');
    tracker.update(1 / 60);
    // A one-frame flicker back to idle and forward again restarts the blend --
    // it does not leave the weapon parked mid-swap in neither pose.
    tracker.setStance('idle');
    tracker.setStance('moving');
    expect(tracker.state.pose).toBe(LOW_READY);
    expect(tracker.state.blend).toBe(0);
    expect(tracker.state.moving).toBe(true);
    expect(tracker.update(CARRY_BLEND_S).moving).toBe(false);
    expect(tracker.state.stance).toBe('moving');
  });

  it("ignores a broken frame time and a broken blend length", () => {
    const tracker = new CarryStateTracker('idle', Number.NaN);
    tracker.setStance('moving');
    const frozen = tracker.update(Number.NaN);
    expect(frozen.blend).toBe(0);
    expect(frozen.moving).toBe(true);
    expect(tracker.update(-1).blend).toBe(0);
    const done = tracker.update(1);
    expect(done.blend).toBe(1);
  });
});
