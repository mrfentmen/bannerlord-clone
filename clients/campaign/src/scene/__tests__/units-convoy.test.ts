/**
 * The party convoy, with no GPU and no assets.
 *
 * Worth testing because the convoy is the first thing the GLB factory feeds in
 * production: the scene must get a usable root back immediately, vehicles must
 * land on it without intercepting pointer events, and a factory that throws must
 * not take the scene down with it.
 */

import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { buildPartyConvoy } from "../units/convoy.js";
import { unitPalettes } from "../units/types.js";
import type { UnitFactory } from "../units/types.js";

function testScene(): Scene {
  return new Scene(new NullEngine());
}

function stubFactory(node: () => TransformNode): UnitFactory {
  return { create: async () => node() };
}

describe("buildPartyConvoy", () => {
  it("returns an attached root immediately and lands both vehicles", async () => {
    const scene = testScene();
    const factory = stubFactory(() => new TransformNode("stub", scene));
    const convoy = buildPartyConvoy(scene, factory, unitPalettes.player);

    expect(convoy.root.name).toBe("party");
    expect(convoy.root.parent).toBeNull();
    expect(convoy.landed).toEqual([]);

    await convoy.ready;

    expect(convoy.landed).toEqual(["party-lead", "party-second"]);
    const lead = scene.getTransformNodeByName("party-lead");
    const second = scene.getTransformNodeByName("party-second");
    expect(lead?.parent).toBe(convoy.root);
    expect(second?.parent).toBe(convoy.root);
    expect(second?.position.z).toBe(-14);
    scene.dispose();
  });

  it("survives a factory that throws, reporting the slot", async () => {
    const scene = testScene();
    const onError = vi.fn();
    const factory: UnitFactory = {
      create: async () => {
        throw new Error("network down");
      },
    };
    const convoy = buildPartyConvoy(scene, factory, unitPalettes.player, { onError });

    await convoy.ready;

    expect(convoy.landed).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0]?.[1]).toBe("party-lead");
    expect(onError.mock.calls[1]?.[1]).toBe("party-second");
    scene.dispose();
  });
});
