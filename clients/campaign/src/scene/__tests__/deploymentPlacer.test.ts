/**
 * Deployment ghost preview (Buffy task 3).
 *
 * The placer owns the battlefield side of the deployment phase: a translucent
 * soldier ghost that tracks the cursor. These tests run the real class on a
 * NullEngine — real meshes, no GPU — and cover show/hide, position updates,
 * observer hygiene, and teardown. The GLB upgrade cannot run headless (no
 * network to /models/), which is exactly the case the proxy fallback has to
 * survive.
 */

import { describe, expect, it, vi } from "vitest";
import { Scene, Vector3, type Mesh, type StandardMaterial } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { DeploymentPlacer } from "../DeploymentPlacer.js";

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
