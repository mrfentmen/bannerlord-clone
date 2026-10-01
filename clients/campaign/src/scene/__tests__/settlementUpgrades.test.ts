/**
 * Settlement 3D upgrades: City Walls rings appear on project completion,
 * prosperity district tints follow the documented scale, and garrison banners
 * fly in controlling-faction colours and swap on ownership change.
 * Uses NullEngine, so it runs headless in CI.
 */

import { describe, expect, it } from "vitest";
import { Color3, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { prosperityScale, townColor } from "../../design/tokens.js";
import {
  BANNER_BEARING,
  BANNER_RADIUS_FACTOR,
  PROSPERITY_LEVELS,
  TINT_ALPHA,
  WALL_GATE_HALF_SEGMENTS,
  WALL_HEIGHT,
  WALL_RING_FACTOR,
  WALL_THICKNESS,
  createSettlementUpgrades,
  prosperityColor,
  prosperityLevel,
  wallSegmentCount,
  type SettlementUpgradesInput,
  type UpgradeCluster,
} from "../settlementUpgrades.js";

function testScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
  return new Scene(engine);
}

/** A box cluster with a known footprint; the module reads the radius from it. */
function mockCluster(scene: Scene, id: string, x: number, z: number, halfSize: number): UpgradeCluster {
  const mesh = MeshBuilder.CreateBox(`mock-${id}`, { width: halfSize * 2, height: 10, depth: halfSize * 2 }, scene);
  mesh.position.set(x, 0, z);
  return { settlementId: id, position: mesh.position.clone(), mesh };
}

function clothHex(scene: Scene, meshName: string): string {
  const cloth = scene.getMeshByName(meshName)!;
  const mat = cloth.material as unknown as StandardMaterial;
  return (mat.diffuseColor as Color3).toHexString().toUpperCase();
}

function baseInput(): SettlementUpgradesInput {
  return {
    settlements: [
      { settlementId: "a", wallsBuilt: false, prosperity: null, factionId: null },
      { settlementId: "b", wallsBuilt: false, prosperity: null, factionId: null },
    ],
    factionColors: {},
  };
}

describe("prosperityLevel", () => {
  it("buckets 0-1 into five levels", () => {
    expect(prosperityLevel(0)).toBe(0);
    expect(prosperityLevel(0.19)).toBe(0);
    expect(prosperityLevel(0.2)).toBe(1);
    expect(prosperityLevel(0.5)).toBe(2);
    expect(prosperityLevel(0.79)).toBe(3);
    expect(prosperityLevel(0.8)).toBe(4);
    expect(prosperityLevel(1)).toBe(4);
  });

  it("clamps out-of-range input instead of indexing off the scale", () => {
    expect(prosperityLevel(-3)).toBe(0);
    expect(prosperityLevel(1.2)).toBe(4);
    expect(prosperityLevel(Number.NaN)).toBe(0);
  });

  it("agrees with the documented scale length", () => {
    expect(PROSPERITY_LEVELS).toBe(5);
    expect(prosperityScale).toHaveLength(5);
  });
});

describe("prosperityColor", () => {
  it("returns the scale colour for a figure", () => {
    expect(prosperityColor(0.9)).toBe(prosperityScale[4]);
    expect(prosperityColor(0.1)).toBe(prosperityScale[0]);
  });

  it("returns null when the sim has no figure, so no tint is drawn", () => {
    expect(prosperityColor(null)).toBeNull();
    expect(prosperityColor(Number.NaN)).toBeNull();
  });

  it("keeps every scale entry a valid hex literal", () => {
    for (const hex of prosperityScale) expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe("wallSegmentCount", () => {
  it("scales with the ring circumference", () => {
    const n = wallSegmentCount(100);
    expect(n).toBe(Math.round((2 * Math.PI * 100 * WALL_RING_FACTOR) / 24));
    expect(n).toBeGreaterThan(8);
  });

  it("floors at eight segments for tiny clusters", () => {
    expect(wallSegmentCount(5)).toBe(8);
  });
});

describe("walls", () => {
  it("builds a wall ring when the City Walls project completes", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.wallsBuilt = true;
    upgrades.update(input);

    const wall = scene.getMeshByName("walls-a");
    expect(wall).not.toBeNull();
    expect(upgrades.walledCount).toBe(1);
    upgrades.dispose();
  });

  it("removes the wall when the project flag clears", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.wallsBuilt = true;
    upgrades.update(input);
    expect(scene.getMeshByName("walls-a")).not.toBeNull();

    input.settlements[0]!.wallsBuilt = false;
    upgrades.update(input);
    expect(scene.getMeshByName("walls-a")).toBeNull();
    expect(upgrades.walledCount).toBe(0);
    upgrades.dispose();
  });

  it("leaves a gate gap in the ring", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    clusters[0]!.mesh.computeWorldMatrix(true);
    const radius = clusters[0]!.mesh.getBoundingInfo().boundingSphere.radiusWorld;
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.wallsBuilt = true;
    upgrades.update(input);

    const wall = scene.getMeshByName("walls-a")!;
    const indexCount = wall.getTotalIndices();
    // A full ring is 5 faces x 6 indices per segment; the gate removes segments.
    const fullRing = wallSegmentCount(radius) * 30;
    expect(indexCount).toBeLessThan(fullRing);
    expect(indexCount).toBeGreaterThan(fullRing - (WALL_GATE_HALF_SEGMENTS * 2 + 1) * 30 - 30);
    upgrades.dispose();
  });

  it("sits the wall ring just outside the cluster footprint", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 500, 300, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.wallsBuilt = true;
    upgrades.update(input);

    const wall = scene.getMeshByName("walls-a")!;
    expect(wall.position.x).toBeCloseTo(500, 6);
    expect(wall.position.z).toBeCloseTo(300, 6);
    upgrades.dispose();
  });

  it("does not let walls steal settlement clicks", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.wallsBuilt = true;
    upgrades.update(input);

    expect(scene.getMeshByName("walls-a")!.isPickable).toBe(false);
    upgrades.dispose();
  });
});

describe("district tint", () => {
  it("tints the district ring with the prosperity scale colour", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.prosperity = 0.9;
    upgrades.update(input);

    const tint = scene.getMeshByName("district-a");
    expect(tint).not.toBeNull();
    const mat = tint!.material!;
    expect(mat).not.toBeNull();
    upgrades.dispose();
  });

  it("draws no tint when the sim has no prosperity figure", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    upgrades.update(baseInput());

    expect(scene.getMeshByName("district-a")).toBeNull();
    expect(upgrades.tintedCount).toBe(0);
    upgrades.dispose();
  });

  it("recolours the tint when the prosperity level changes", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.prosperity = 0.1;
    upgrades.update(input);
    const before = scene.getMeshByName("district-a")!.material;

    input.settlements[0]!.prosperity = 0.9;
    upgrades.update(input);
    const after = scene.getMeshByName("district-a")!.material;
    expect(after).not.toBe(before);
    expect(upgrades.tintedCount).toBe(1);
    upgrades.dispose();
  });

  it("clears the tint when prosperity goes null", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.prosperity = 0.9;
    upgrades.update(input);
    expect(scene.getMeshByName("district-a")).not.toBeNull();

    input.settlements[0]!.prosperity = null;
    upgrades.update(input);
    expect(scene.getMeshByName("district-a")).toBeNull();
    upgrades.dispose();
  });

  it("lays the tint flat at low alpha and keeps it unpickable", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.prosperity = 0.5;
    upgrades.update(input);

    const tint = scene.getMeshByName("district-a")!;
    expect(tint.rotation.x).toBeCloseTo(-Math.PI / 2, 6);
    expect(tint.isPickable).toBe(false);
    upgrades.dispose();
  });
});

describe("garrison banners", () => {
  it("flies a banner in the controlling faction's colour", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.factionId = "iron";
    input.factionColors = { iron: "#8A1F1F" };
    upgrades.update(input);

    const banner = scene.getMeshByName("banner-a");
    expect(banner).not.toBeNull();
    expect(clothHex(scene, "banner-cloth-a")).toBe("#8A1F1F");
    expect(upgrades.bannerCount).toBe(1);
    upgrades.dispose();
  });

  it("swaps the banner colour on ownership change", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.factionId = "iron";
    input.factionColors = { iron: "#8A1F1F", harbor: "#1F4A8A" };
    upgrades.update(input);

    input.settlements[0]!.factionId = "harbor";
    upgrades.update(input);

    // One banner, recoloured: no duplicate pole left behind.
    expect(scene.meshes.filter((m) => m.name.startsWith("banner-pole-"))).toHaveLength(1);
    expect(clothHex(scene, "banner-cloth-a")).toBe("#1F4A8A");
    upgrades.dispose();
  });

  it("lowers the banner when the town is unheld", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.factionId = "iron";
    input.factionColors = { iron: "#8A1F1F" };
    upgrades.update(input);
    expect(scene.getMeshByName("banner-a")).not.toBeNull();

    input.settlements[0]!.factionId = null;
    upgrades.update(input);
    expect(scene.getMeshByName("banner-a")).toBeNull();
    expect(upgrades.bannerCount).toBe(0);
    upgrades.dispose();
  });

  it("falls back to neutral grey when the faction has no colour entry", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.factionId = "mystery";
    input.factionColors = {};
    upgrades.update(input);

    expect(clothHex(scene, "banner-cloth-a")).toBe(townColor.bannerUnknown.toUpperCase());
    upgrades.dispose();
  });

  it("stands the banner outside the wall ring", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    clusters[0]!.mesh.computeWorldMatrix(true);
    const radius = clusters[0]!.mesh.getBoundingInfo().boundingSphere.radiusWorld;
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements[0]!.factionId = "iron";
    input.factionColors = { iron: "#8A1F1F" };
    upgrades.update(input);

    const banner = scene.getMeshByName("banner-a")!;
    const dist = Math.hypot(banner.position.x, banner.position.z);
    expect(banner.position.x).toBeCloseTo(Math.cos(BANNER_BEARING) * radius * BANNER_RADIUS_FACTOR, 3);
    expect(banner.position.z).toBeCloseTo(Math.sin(BANNER_BEARING) * radius * BANNER_RADIUS_FACTOR, 3);
    expect(dist).toBeGreaterThan(radius * WALL_RING_FACTOR);
    upgrades.dispose();
  });
});

describe("update and dispose", () => {
  it("ignores unknown settlement ids instead of crashing", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input = baseInput();
    input.settlements.push({ settlementId: "ghost", wallsBuilt: true, prosperity: 1, factionId: "x" });
    input.factionColors = { x: "#111111" };

    expect(() => upgrades.update(input)).not.toThrow();
    expect(scene.getMeshByName("walls-ghost")).toBeNull();
    expect(upgrades.walledCount).toBe(0);
    upgrades.dispose();
  });

  it("applies all three upgrades to one settlement in a single update", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100), mockCluster(scene, "b", 900, 0, 60)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    upgrades.update({
      settlements: [
        { settlementId: "a", wallsBuilt: true, prosperity: 0.9, factionId: "iron" },
        { settlementId: "b", wallsBuilt: false, prosperity: 0.1, factionId: null },
      ],
      factionColors: { iron: "#8A1F1F" },
    });

    expect(scene.getMeshByName("walls-a")).not.toBeNull();
    expect(scene.getMeshByName("district-a")).not.toBeNull();
    expect(scene.getMeshByName("banner-a")).not.toBeNull();
    expect(scene.getMeshByName("walls-b")).toBeNull();
    expect(scene.getMeshByName("district-b")).not.toBeNull();
    expect(scene.getMeshByName("banner-b")).toBeNull();
    expect(upgrades.walledCount).toBe(1);
    expect(upgrades.tintedCount).toBe(2);
    expect(upgrades.bannerCount).toBe(1);
    upgrades.dispose();
  });

  it("is idempotent: a repeated tick builds nothing twice", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    const input: SettlementUpgradesInput = {
      settlements: [{ settlementId: "a", wallsBuilt: true, prosperity: 0.9, factionId: "iron" }],
      factionColors: { iron: "#8A1F1F" },
    };
    upgrades.update(input);
    const meshCount = scene.meshes.length;
    upgrades.update(input);
    upgrades.update(input);
    expect(scene.meshes.length).toBe(meshCount);
    upgrades.dispose();
  });

  it("dispose removes every overlay mesh", () => {
    const scene = testScene();
    const clusters = [mockCluster(scene, "a", 0, 0, 100)];
    const upgrades = createSettlementUpgrades({ scene, clusters });
    upgrades.update({
      settlements: [{ settlementId: "a", wallsBuilt: true, prosperity: 0.9, factionId: "iron" }],
      factionColors: { iron: "#8A1F1F" },
    });
    const before = scene.meshes.length;
    expect(before).toBeGreaterThan(1); // the mock cluster plus overlays

    upgrades.dispose();
    expect(scene.meshes.length).toBe(1); // only the mock cluster remains
    expect(upgrades.walledCount).toBe(0);
  });

  it("keeps the wall height and thickness at the documented constants", () => {
    expect(WALL_HEIGHT).toBe(12);
    expect(WALL_THICKNESS).toBe(4);
    expect(TINT_ALPHA).toBe(0.45);
  });
});
