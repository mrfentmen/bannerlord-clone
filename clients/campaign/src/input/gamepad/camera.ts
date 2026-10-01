/**
 * Twin-stick gamepad camera for 3D scenes (MASTER_PLAN task 2).
 *
 * Left stick pans the camera target, right stick orbits (azimuth + polar),
 * LT/RT zoom. The driver only computes deltas; the scene applies them through
 * `SceneHandle.cameraControl`, which owns the camera limits. Runs its own rAF
 * loop, decoupled from the button-polling loop in the gamepad manager.
 */

import type { GamepadManager } from "./manager.js";
import type { CameraDelta } from "../../scene/CampaignScene.js";

export interface StickCameraOptions {
  manager: GamepadManager;
  /** Applies one frame of camera deltas (SceneHandle.cameraControl). */
  control: (delta: CameraDelta) => void;
  /** False while gamepad input is off or suspended. Defaults to always. */
  isEnabled?: () => boolean;
  /** False while a panel/menu owns the sticks (menus navigate instead). */
  isActive?: () => boolean;
  /** Live multiplier, e.g. the cameraSpeed setting. Defaults to 1. */
  speedScale?: () => number;
  /** Task 8 plugs the invert-axis setting in here. Defaults to false. */
  invertOrbitY?: () => boolean;
  /** World units per second at full left-stick deflection. Default 20000. */
  panSpeed?: number;
  /** Radians per second at full right-stick X. Default 1.4. */
  orbitSpeed?: number;
  /** Radians per second at full right-stick Y. Default 0.9. */
  pitchSpeed?: number;
  /** Exponential zoom per second at full trigger. Default 0.8. */
  zoomSpeed?: number;
}

export interface StickCamera {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** One frame. The rAF loop calls this; tests call it with fake timestamps. */
  update(nowMs?: number): void;
}

/** dt is clamped so a backgrounded tab can't teleport the camera. */
export const MAX_FRAME_DT_S = 0.1;

export function createStickCamera(opts: StickCameraOptions): StickCamera {
  const isEnabled = opts.isEnabled ?? (() => true);
  const isActive = opts.isActive ?? (() => true);
  const speedScale = opts.speedScale ?? (() => 1);
  const invertOrbitY = opts.invertOrbitY ?? (() => false);
  const panSpeed = opts.panSpeed ?? 20_000;
  const orbitSpeed = opts.orbitSpeed ?? 1.4;
  const pitchSpeed = opts.pitchSpeed ?? 0.9;
  const zoomSpeed = opts.zoomSpeed ?? 0.8;

  let rafId: number | null = null;
  let lastMs: number | null = null;

  function update(nowMs?: number): void {
    const now = nowMs ?? performance.now();
    const dt = lastMs === null ? 0 : Math.min(MAX_FRAME_DT_S, Math.max(0, (now - lastMs) / 1000));
    lastMs = now;
    if (!isEnabled() || !isActive() || dt <= 0) return;

    const [lx, ly, rx, ry] = opts.manager.axes();
    const [lt, rt] = opts.manager.triggers();
    const scale = speedScale();
    const delta: CameraDelta = {};
    if (lx !== 0 || ly !== 0) {
      delta.panX = lx * panSpeed * scale * dt;
      delta.panZ = ly * panSpeed * scale * dt;
    }
    if (rx !== 0) delta.dAlpha = -rx * orbitSpeed * dt;
    if (ry !== 0) delta.dBeta = ry * pitchSpeed * dt * (invertOrbitY() ? -1 : 1);
    const zoomRate = lt - rt;
    if (zoomRate !== 0) delta.zoomFactor = Math.exp(zoomRate * zoomSpeed * dt);
    if (Object.keys(delta).length > 0) opts.control(delta);
  }

  function tick(): void {
    update();
    rafId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (rafId !== null) return;
      lastMs = null;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    },
    get running() {
      return rafId !== null;
    },
    update,
  };
}
