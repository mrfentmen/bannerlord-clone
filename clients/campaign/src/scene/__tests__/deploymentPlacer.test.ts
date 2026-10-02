/**
 * Deployment ghost preview, placement, and camera framing
 * (Buffy tasks 3-5, 10, 11, 18).
 *
 * The placer owns the battlefield side of the deployment phase: a translucent
 * soldier ghost that tracks the cursor, solid markers dropped by clicks
 * inside the player's deployment zone, a right-click that cancels the
 * preview, a red flash for clicks that miss the zone, and an optional 2 m
 * grid snap. `BattleScene` adds the deployment camera pose. These tests run
 * the real classes on a NullEngine — real meshes and cameras, no GPU — and
 * cover show/hide, position updates, observer hygiene, teardown, placement
 * validation, cancel, the flash, snapping, and the camera framing. The GLB
 * upgrade cannot run headless (no network to /models/), which is exactly the
 * case the proxy fallback has to survive.
 */

import { describe, expect, it, vi } from "vitest";
import {
  Color3,
  PBRMaterial,
  PickingInfo,
  PointerEventTypes,
  PointerInfo,
  Scene,
  Vector3,
  type IPointerEvent,
  type Mesh,
  type StandardMaterial,
} from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { BattleScene, deploymentCameraPose } from "../BattleScene.js";
import type { DeploymentZone } from "../BattleUI.js";
import {
  DeploymentPlacer,
  pointInDeploymentZone,
  snapToGrid,
  type DeploymentPlacement,
} from "../DeploymentPlacer.js";

function newEngine(): NullEngine {
  return new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
}

function newScene(): Scene {
  return new Scene(newEngine());
}

/** Deliver a pointer event to the scene observable — a NullEngine has no DOM to click. */
function tapPointer(scene: Scene, type: number, button: number): void {
  const event = { button } as unknown as IPointerEvent;
  scene.onPointerObservable.notifyObservers(new PointerInfo(type, event, new PickingInfo()));
}

describe("DeploymentPlacer ghost preview", () => {
  it("keeps the proxy ghost hidden until start() and hidden again after stop()", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);
    const ghost = scene.getTransformNodeByName("deployGhost");

    expect(ghost).not.toBeNull();
    expect(ghost!.isEnabled()).toBe(false);

    placer.start();
    expect(ghost!.isEnabled()).toBe(true);

    placer.stop();
    expect(ghost!.isEnabled()).toBe(false);

    placer.dispose();
  });

  it("stands the ghost at a battlefield point, on the ground", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);

    placer.moveGhostTo(new Vector3(12, 7, -7));
    const ghost = scene.getTransformNodeByName("deployGhost")!;
    expect(ghost.position.x).toBeCloseTo(12);
    expect(ghost.position.y).toBeCloseTo(0); // y is ground level, not the pick height
    expect(ghost.position.z).toBeCloseTo(-7);

    const point = placer.getPreviewPoint();
    expect(point).not.toBeNull();
    expect(point!.x).toBeCloseTo(12);
    expect(point!.z).toBeCloseTo(-7);

    placer.dispose();
  });

  it("subscribes to pointer moves only while started", async () => {
    const scene = newScene();
    const before = scene.onPointerObservable.observers.length;
    const placer = new DeploymentPlacer(scene);

    expect(scene.onPointerObservable.observers.length).toBe(before);

    placer.start();
    expect(scene.onPointerObservable.observers.length).toBe(before + 1);

    placer.start(); // idempotent — no observer stacking
    expect(scene.onPointerObservable.observers.length).toBe(before + 1);

    placer.stop();
    // Babylon 8 unregisters observers on the next tick (`Observable.observers`
    // documents that recently deleted observers linger in the list), so flush
    // a macrotask before counting again.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.onPointerObservable.observers.length).toBe(before);

    placer.dispose();
  });

  it("disposes the ghost meshes and the subscription", async () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);
    placer.start();

    expect(scene.getMeshByName("deployGhostBody")).not.toBeNull();
    expect(scene.getMeshByName("deployGhostHead")).not.toBeNull();

    placer.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scene.getMeshByName("deployGhostBody")).toBeNull();
    expect(scene.getMeshByName("deployGhostHead")).toBeNull();
    expect(scene.getTransformNodeByName("deployGhost")).toBeNull();
    expect(scene.onPointerObservable.observers.length).toBe(0);
  });

  it("renders the proxy semi-transparent", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);

    const body = scene.getMeshByName("deployGhostBody") as Mesh;
    const material = body.material as StandardMaterial;
    expect(material.alpha).toBeGreaterThan(0);
    expect(material.alpha).toBeLessThan(1);

    placer.dispose();
  });

  it("keeps the proxy when the soldier GLB cannot load (headless fallback)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);

    // Let the failed import settle; the proxy must still be there.
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    expect(scene.getMeshByName("deployGhostBody")).not.toBeNull();
    expect(scene.getMeshByName("deployGhostHead")).not.toBeNull();

    warn.mockRestore();
    placer.dispose();
  });
});

describe("DeploymentPlacer placement clicks", () => {
  const playerZone: DeploymentZone = { x: 0, z: 0, width: 20, depth: 10, faction: "player" };
  const enemyZone: DeploymentZone = { x: 50, z: 0, width: 20, depth: 10, faction: "enemy" };

  it("places a solid marker inside the player zone", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });

    expect(placer.placeAt(new Vector3(5, 0, 3))).toBe(true);
    expect(placer.getPlacements()).toEqual([{ x: 5, z: 3 }]);

    const body = scene.getMeshByName("deployPlaced0Body") as Mesh;
    const head = scene.getMeshByName("deployPlaced0Head") as Mesh;
    expect(body).not.toBeNull();
    expect(head).not.toBeNull();
    expect(body.position.x).toBeCloseTo(5);
    expect(body.position.z).toBeCloseTo(3);
    // Solid, unlike the translucent ghost.
    expect((body.material as StandardMaterial).alpha).toBe(1);

    placer.dispose();
  });

  it("rejects clicks outside the player zone, including the enemy zone", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone, enemyZone] });

    expect(placer.placeAt(new Vector3(11, 0, 0))).toBe(false); // past the east edge
    expect(placer.placeAt(new Vector3(0, 0, 6))).toBe(false); // past the south edge
    expect(placer.placeAt(new Vector3(50, 0, 0))).toBe(false); // enemy zone is not placeable

    expect(placer.getPlacements()).toEqual([]);
    expect(scene.getMeshByName("deployPlaced0Body")).toBeNull();

    placer.dispose();
  });

  it("accepts points exactly on the zone edge", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });

    expect(placer.placeAt(new Vector3(10, 0, 0))).toBe(true); // x edge
    expect(placer.placeAt(new Vector3(-10, 0, 5))).toBe(true); // x and z edge
    expect(placer.getPlacements()).toHaveLength(2);

    placer.dispose();
  });

  it("reports every placement through onPlace, in order", () => {
    const scene = newScene();
    const seen: DeploymentPlacement[] = [];
    const placer = new DeploymentPlacer(scene, {
      zones: [playerZone],
      onPlace: (p) => seen.push(p),
    });

    placer.placeAt(new Vector3(1, 0, 1));
    placer.placeAt(new Vector3(2, 0, 2));

    expect(seen).toEqual([{ x: 1, z: 1 }, { x: 2, z: 2 }]);

    placer.dispose();
  });

  it("returns copies from getPlacements so callers cannot mutate the list", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    placer.placeAt(new Vector3(1, 0, 1));

    const list = placer.getPlacements();
    list[0]!.x = 999;

    expect(placer.getPlacements()).toEqual([{ x: 1, z: 1 }]);

    placer.dispose();
  });

  it("removes markers and placements on dispose", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    placer.placeAt(new Vector3(0, 0, 0));

    placer.dispose();

    expect(scene.getMeshByName("deployPlaced0Body")).toBeNull();
    expect(placer.getPlacements()).toEqual([]);
  });
});

describe("DeploymentPlacer right-click cancel", () => {
  it("cancels the preview: hides the ghost, unsubscribes, fires onCancel once", async () => {
    const scene = newScene();
    let cancels = 0;
    const placer = new DeploymentPlacer(scene, { onCancel: () => cancels++ });
    placer.start();
    const ghost = scene.getTransformNodeByName("deployGhost")!;
    expect(ghost.isEnabled()).toBe(true);

    expect(placer.cancelPreview()).toBe(true);

    expect(ghost.isEnabled()).toBe(false);
    expect(cancels).toBe(1);
    // The subscription is gone. Babylon drops observers on the next tick.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.onPointerObservable.observers.length).toBe(0);

    placer.dispose();
  });

  it("cancels on a secondary-button tap", () => {
    const scene = newScene();
    let cancels = 0;
    const placer = new DeploymentPlacer(scene, { onCancel: () => cancels++ });
    placer.start();

    tapPointer(scene, PointerEventTypes.POINTERTAP, 2);

    expect(cancels).toBe(1);
    expect(scene.getTransformNodeByName("deployGhost")!.isEnabled()).toBe(false);

    placer.dispose();
  });

  it("keeps the preview on a primary-button tap", () => {
    const scene = newScene();
    let cancels = 0;
    const placer = new DeploymentPlacer(scene, { onCancel: () => cancels++ });
    placer.start();

    tapPointer(scene, PointerEventTypes.POINTERTAP, 0);
    tapPointer(scene, PointerEventTypes.POINTERTAP, 1); // middle button

    expect(cancels).toBe(0);
    expect(scene.getTransformNodeByName("deployGhost")!.isEnabled()).toBe(true);

    placer.dispose();
  });

  it("reports nothing to cancel before start() and after a cancel", () => {
    const scene = newScene();
    let cancels = 0;
    const placer = new DeploymentPlacer(scene, { onCancel: () => cancels++ });

    expect(placer.cancelPreview()).toBe(false);
    expect(cancels).toBe(0);

    placer.start();
    expect(placer.cancelPreview()).toBe(true);
    expect(placer.cancelPreview()).toBe(false);
    expect(cancels).toBe(1);

    placer.dispose();
  });

  it("leaves already-placed markers alone when cancelling", () => {
    const scene = newScene();
    const zone: DeploymentZone = { x: 0, z: 0, width: 20, depth: 10, faction: "player" };
    const placer = new DeploymentPlacer(scene, { zones: [zone] });
    placer.placeAt(new Vector3(1, 0, 1));
    placer.start();

    expect(placer.cancelPreview()).toBe(true);

    expect(placer.getPlacements()).toEqual([{ x: 1, z: 1 }]);
    expect(scene.getMeshByName("deployPlaced0Body")).not.toBeNull();

    placer.dispose();
  });

  it("can be restarted after a cancel", () => {
    const scene = newScene();
    let cancels = 0;
    const placer = new DeploymentPlacer(scene, { onCancel: () => cancels++ });

    placer.start();
    placer.cancelPreview();
    placer.start();

    expect(scene.getTransformNodeByName("deployGhost")!.isEnabled()).toBe(true);
    tapPointer(scene, PointerEventTypes.POINTERTAP, 2);
    expect(cancels).toBe(2);

    placer.dispose();
  });
});

describe("DeploymentPlacer invalid-placement flash", () => {
  const playerZone: DeploymentZone = { x: 0, z: 0, width: 20, depth: 10, faction: "player" };
  const FLASH_MS = 300;

  /** The proxy ghost's shared material and its pre-flash emissive colour. */
  function ghostMaterial(scene: Scene): StandardMaterial {
    return (scene.getMeshByName("deployGhostBody") as Mesh).material as StandardMaterial;
  }

  it("flashes the ghost red on an invalid click and restores the colour after ~300 ms", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    const material = ghostMaterial(scene);
    const normal = material.emissiveColor.clone();

    vi.useFakeTimers();
    try {
      expect(placer.placeAt(new Vector3(40, 0, 0))).toBe(false); // outside the zone
      expect(material.emissiveColor.r).toBeGreaterThan(normal.r);
      expect(material.emissiveColor.g).toBeLessThan(normal.g); // red, not just brighter

      vi.advanceTimersByTime(FLASH_MS - 1);
      expect(material.emissiveColor.r).toBeGreaterThan(normal.r); // still flashing

      vi.advanceTimersByTime(1);
      expect(material.emissiveColor.r).toBeCloseTo(normal.r);
      expect(material.emissiveColor.g).toBeCloseTo(normal.g);
      expect(material.emissiveColor.b).toBeCloseTo(normal.b);
    } finally {
      vi.useRealTimers();
    }

    placer.dispose();
  });

  it("does not flash on a valid placement", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    const material = ghostMaterial(scene);
    const normal = material.emissiveColor.clone();

    placer.placeAt(new Vector3(1, 0, 1));

    expect(material.emissiveColor.r).toBeCloseTo(normal.r);
    expect(material.emissiveColor.g).toBeCloseTo(normal.g);

    placer.dispose();
  });

  it("flashes every ghost material, so a GLB clone with PBR materials works", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);
    const proxyMat = ghostMaterial(scene);

    // Stand in for the loaded soldier clone: a second, independently coloured
    // PBR material on the other ghost mesh, exactly what upgradeToModel leaves.
    const cloneMat = new PBRMaterial("deployGhostCloneMat", scene);
    cloneMat.emissiveColor = new Color3(0.02, 0.03, 0.04);
    (scene.getMeshByName("deployGhostHead") as Mesh).material = cloneMat;

    const proxyNormal = proxyMat.emissiveColor.clone();
    const cloneNormal = cloneMat.emissiveColor.clone();

    vi.useFakeTimers();
    try {
      placer.flashInvalid();
      expect(proxyMat.emissiveColor.r).toBeGreaterThan(proxyNormal.r);
      expect(cloneMat.emissiveColor.r).toBeGreaterThan(cloneNormal.r);

      vi.advanceTimersByTime(FLASH_MS);
      expect(proxyMat.emissiveColor.r).toBeCloseTo(proxyNormal.r);
      expect(cloneMat.emissiveColor.r).toBeCloseTo(cloneNormal.r);
      expect(cloneMat.emissiveColor.g).toBeCloseTo(cloneNormal.g);
      expect(cloneMat.emissiveColor.b).toBeCloseTo(cloneNormal.b);
    } finally {
      vi.useRealTimers();
    }

    placer.dispose();
  });

  it("restores a second invalid click's flash to the original colour, not the red", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    const material = ghostMaterial(scene);
    const normal = material.emissiveColor.clone();

    vi.useFakeTimers();
    try {
      placer.flashInvalid();
      vi.advanceTimersByTime(FLASH_MS - 50);
      placer.flashInvalid(); // restarts the window
      vi.advanceTimersByTime(FLASH_MS - 50);
      expect(material.emissiveColor.r).toBeGreaterThan(normal.r); // would have ended by now

      vi.advanceTimersByTime(50);
      expect(material.emissiveColor.r).toBeCloseTo(normal.r);
    } finally {
      vi.useRealTimers();
    }

    placer.dispose();
  });

  it("restores the colour and drops the timer on stop()", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    const material = ghostMaterial(scene);
    const normal = material.emissiveColor.clone();

    vi.useFakeTimers();
    try {
      placer.flashInvalid();
      const pending = vi.getTimerCount();
      expect(pending).toBeGreaterThan(0);

      placer.stop();

      expect(vi.getTimerCount()).toBe(0);
      expect(material.emissiveColor.r).toBeCloseTo(normal.r);
    } finally {
      vi.useRealTimers();
    }

    placer.dispose();
  });

  it("clears the pending timer on dispose()", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    const material = ghostMaterial(scene);
    const normal = material.emissiveColor.clone();

    vi.useFakeTimers();
    try {
      placer.flashInvalid();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      // Meshes and materials schedule teardown of their own, so assert that the
      // flash timer was cleared rather than that nothing is left pending.
      const clear = vi.spyOn(globalThis, "clearTimeout");

      placer.dispose();

      expect(clear).toHaveBeenCalled();
      expect(material.emissiveColor.r).toBeCloseTo(normal.r);
      clear.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("DeploymentPlacer grid snap", () => {
  const playerZone: DeploymentZone = { x: 0, z: 0, width: 20, depth: 10, faction: "player" };

  it("is off by default and free-moves the ghost", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);

    expect(placer.getGridSnap()).toBe(false);

    placer.moveGhostTo(new Vector3(3.7, 0, -1.3));
    const ghost = scene.getTransformNodeByName("deployGhost")!;
    expect(ghost.position.x).toBeCloseTo(3.7);
    expect(ghost.position.z).toBeCloseTo(-1.3);

    placer.dispose();
  });

  it("places at the exact cursor point when off", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });

    expect(placer.placeAt(new Vector3(3.7, 0, -1.3))).toBe(true);

    expect(placer.getPlacements()).toHaveLength(1);
    const [placement] = placer.getPlacements();
    expect(placement!.x).toBeCloseTo(3.7);
    expect(placement!.z).toBeCloseTo(-1.3);

    placer.dispose();
  });

  it("snaps the ghost and the markers onto the 2 m grid when on", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone] });
    placer.setGridSnap(true);

    placer.moveGhostTo(new Vector3(3.7, 0, -1.3));
    const ghost = scene.getTransformNodeByName("deployGhost")!;
    expect(ghost.position.x).toBeCloseTo(4); // nearest even metre
    expect(ghost.position.z).toBeCloseTo(-2);
    expect(placer.getPreviewPoint()!.x).toBeCloseTo(4);

    expect(placer.placeAt(new Vector3(3.7, 0, -1.3))).toBe(true);
    const [placement] = placer.getPlacements();
    expect(placement!.x).toBeCloseTo(4);
    expect(placement!.z).toBeCloseTo(-2);

    // The marker mesh stands where the ghost promised.
    const body = scene.getMeshByName("deployPlaced0Body") as Mesh;
    expect(body.position.x).toBeCloseTo(4);
    expect(body.position.z).toBeCloseTo(-2);

    placer.dispose();
  });

  it("can be started snapped from the constructor option", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { zones: [playerZone], gridSnap: true });

    expect(placer.getGridSnap()).toBe(true);
    expect(placer.placeAt(new Vector3(0.9, 0, 4.4))).toBe(true);
    const [placement] = placer.getPlacements();
    expect(placement!.x).toBeCloseTo(0);
    expect(placement!.z).toBeCloseTo(4); // 4.4 is nearer 4 than 6

    placer.dispose();
  });

  it("snaps the ghost where it stands when snapping is switched on", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene);
    placer.moveGhostTo(new Vector3(3.7, 0, -1.3));

    placer.setGridSnap(true);

    const ghost = scene.getTransformNodeByName("deployGhost")!;
    expect(ghost.position.x).toBeCloseTo(4);
    expect(ghost.position.z).toBeCloseTo(-2);

    placer.dispose();
  });

  it("leaves an already-snapped ghost alone when snapping is switched off", () => {
    const scene = newScene();
    const placer = new DeploymentPlacer(scene, { gridSnap: true });
    placer.moveGhostTo(new Vector3(3.7, 0, -1.3));

    placer.setGridSnap(false);
    placer.moveGhostTo(new Vector3(3.7, 0, -1.3));

    const ghost = scene.getTransformNodeByName("deployGhost")!;
    expect(placer.getGridSnap()).toBe(false);
    expect(ghost.position.x).toBeCloseTo(3.7);
    expect(ghost.position.z).toBeCloseTo(-1.3);

    placer.dispose();
  });

  it("validates the snapped point, so a click past the edge can snap back in", () => {
    const scene = newScene();
    // A zone 8 m wide reaches to x = 4: 4.2 m is outside it free, but snaps
    // to 4 m, which is the edge and legal.
    const narrowZone: DeploymentZone = { x: 0, z: 0, width: 8, depth: 20, faction: "player" };
    const free = new DeploymentPlacer(scene, { zones: [narrowZone] });
    expect(free.placeAt(new Vector3(4.2, 0, 0))).toBe(false);
    free.dispose();

    const snapped = new DeploymentPlacer(scene, { zones: [narrowZone], gridSnap: true });
    expect(snapped.placeAt(new Vector3(4.2, 0, 0))).toBe(true);
    expect(snapped.getPlacements()[0]!.x).toBeCloseTo(4);
    snapped.dispose();
  });

  it("rejects a click that snaps past the zone edge", () => {
    const scene = newScene();
    // The zone reaches x = 3 and a click exactly there is legal free, but
    // rounds up to 4 m — outside. Where the unit stands decides, not the cursor.
    const zone: DeploymentZone = { x: 0, z: 0, width: 6, depth: 20, faction: "player" };
    const free = new DeploymentPlacer(scene, { zones: [zone] });
    expect(free.placeAt(new Vector3(3, 0, 0))).toBe(true);
    free.dispose();

    const snapped = new DeploymentPlacer(scene, { zones: [zone], gridSnap: true });
    expect(snapped.placeAt(new Vector3(3, 0, 0))).toBe(false);
    expect(snapped.getPlacements()).toEqual([]);
    snapped.dispose();
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest multiple of the step", () => {
    expect(snapToGrid({ x: 3.7, z: -1.3 }, 2)).toEqual({ x: 4, z: -2 });
    expect(snapToGrid({ x: 3.1, z: 3.9 }, 2)).toEqual({ x: 4, z: 4 });
    expect(snapToGrid({ x: 0, z: 0 }, 2)).toEqual({ x: 0, z: 0 });
  });

  it("covers negative coordinates like positive ones", () => {
    expect(snapToGrid({ x: -5.4, z: -7.9 }, 2)).toEqual({ x: -6, z: -8 });
    expect(snapToGrid({ x: -3.1, z: -3.9 }, 2)).toEqual({ x: -4, z: -4 });
  });

  it("takes any step, not just the 2 m default", () => {
    expect(snapToGrid({ x: 7.4, z: 12.2 }, 5)).toEqual({ x: 5, z: 10 });
    expect(snapToGrid({ x: 7.6, z: 12.6 }, 5)).toEqual({ x: 10, z: 15 });
    expect(snapToGrid({ x: 7.4, z: 12.2 }, 1)).toEqual({ x: 7, z: 12 });
  });
});

describe("deployment camera preset", () => {
  /** A 200 m battlefield, no Havok — enough to inspect the camera headless. */
  async function newBattle(size = 200): Promise<BattleScene> {
    return BattleScene.create(newEngine(), { biome: "plains", size, physics: false });
  }

  it("frames the field from a steep angle, scaled to the battlefield", () => {
    const pose = deploymentCameraPose(200);

    // Well above the horizon: Babylon measures beta from straight up, so the
    // deployment view sits well under the PI/2 (flat) default.
    expect(pose.beta).toBeLessThan(Math.PI / 2);
    expect(pose.beta).toBeLessThan(Math.PI / 3);
    expect(pose.radius).toBeCloseTo(160);
    expect(pose.target.x).toBeCloseTo(0);
    expect(pose.target.y).toBeCloseTo(0);
    expect(pose.target.z).toBeCloseTo(0);
  });

  it("keeps the radius inside the camera's limit for any battlefield size", () => {
    for (const size of [60, 200, 400, 1000]) {
      const pose = deploymentCameraPose(size);
      // create() caps the radius at the field size; the preset has to fit.
      expect(pose.radius).toBeLessThanOrEqual(size);
      expect(pose.radius).toBeGreaterThan(size / 2); // far enough back to see it
    }
  });

  it("is pure: each call returns its own pose", () => {
    const first = deploymentCameraPose(200);
    const second = deploymentCameraPose(400);
    first.radius = 1;

    expect(second.radius).toBeCloseTo(320);
    expect(second.target).not.toBe(first.target);
  });

  it("moves the battle camera onto the deployment pose", async () => {
    const battle = await newBattle(200);
    const cam = battle.getCamera()!;
    expect(cam).not.toBeNull();

    battle.setDeploymentCamera();

    const pose = deploymentCameraPose(200);
    expect(cam.alpha).toBeCloseTo(pose.alpha);
    expect(cam.beta).toBeCloseTo(pose.beta);
    expect(cam.radius).toBeCloseTo(pose.radius);
    expect(cam.target.x).toBeCloseTo(0);
    expect(cam.target.y).toBeCloseTo(0);
    expect(cam.target.z).toBeCloseTo(0);
    // The preset survives the camera's own radius limits.
    const limit = cam.upperRadiusLimit ?? Infinity;
    expect(cam.radius).toBeLessThanOrEqual(limit);

    battle.dispose();
  });

  it("is a no-op when the scene has no battle camera", async () => {
    const battle = await newBattle();
    battle.getCamera()!.dispose();
    expect(battle.getCamera()).toBeNull();

    battle.setDeploymentCamera(); // must not throw

    battle.dispose();
  });
});

describe("pointInDeploymentZone", () => {
  it("treats the zone as a centred rectangle", () => {
    const zone: DeploymentZone = { x: 10, z: -4, width: 6, depth: 8, faction: "player" };

    expect(pointInDeploymentZone({ x: 10, z: -4 }, zone)).toBe(true); // centre
    expect(pointInDeploymentZone({ x: 13, z: 0 }, zone)).toBe(true); // corner
    expect(pointInDeploymentZone({ x: 13.1, z: 0 }, zone)).toBe(false); // just past x
    expect(pointInDeploymentZone({ x: 10, z: 0.1 }, zone)).toBe(false); // just past z
  });
});
