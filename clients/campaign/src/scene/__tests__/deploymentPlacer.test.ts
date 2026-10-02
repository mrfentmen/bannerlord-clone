/**
 * Deployment ghost preview and placement (Buffy tasks 3-5).
 *
 * The placer owns the battlefield side of the deployment phase: a translucent
 * soldier ghost that tracks the cursor, solid markers dropped by clicks
 * inside the player's deployment zone, and a right-click that cancels the
 * preview. These tests run the real class on a NullEngine — real meshes, no
 * GPU — and cover show/hide, position updates, observer hygiene, teardown,
 * placement validation, and cancel. The GLB upgrade cannot run headless (no
 * network to /models/), which is exactly the case the proxy fallback has to
 * survive.
 */

import { describe, expect, it, vi } from "vitest";
import {
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
import type { DeploymentZone } from "../BattleUI.js";
import {
  DeploymentPlacer,
  pointInDeploymentZone,
  type DeploymentPlacement,
} from "../DeploymentPlacer.js";

function newScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
  return new Scene(engine);
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

describe("pointInDeploymentZone", () => {
  it("treats the zone as a centred rectangle", () => {
    const zone: DeploymentZone = { x: 10, z: -4, width: 6, depth: 8, faction: "player" };

    expect(pointInDeploymentZone({ x: 10, z: -4 }, zone)).toBe(true); // centre
    expect(pointInDeploymentZone({ x: 13, z: 0 }, zone)).toBe(true); // corner
    expect(pointInDeploymentZone({ x: 13.1, z: 0 }, zone)).toBe(false); // just past x
    expect(pointInDeploymentZone({ x: 10, z: 0.1 }, zone)).toBe(false); // just past z
  });
});
