/**
 * Mouse-button remapping for camera actions (Rowan solo task 13).
 *
 * Which mouse button pans and which rotates the campaign camera is a
 * setting, not a constant. Zoom stays on the wheel — Babylon's
 * ArcRotateCamera has no button-drag zoom gesture, and faking one would
 * fight its pointer input. The settings UI presents all three actions;
 * zoom is shown as wheel-only so the player is not misled.
 */

import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { ArcRotateCameraPointersInput } from "@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput.js";

/** Mouse buttons by their DOM button index. */
export type MouseButton = 0 | 1 | 2;

export const MOUSE_BUTTON_LABELS: Record<MouseButton, string> = {
  0: "Left button",
  1: "Middle button",
  2: "Right button",
};

export interface MouseCameraBindings {
  /** Button that drag-pans the camera. */
  panButton: MouseButton;
  /** Button that drag-rotates (orbits) the camera. */
  rotateButton: MouseButton;
}

export const DEFAULT_MOUSE_CAMERA_BINDINGS: MouseCameraBindings = {
  panButton: 2,
  rotateButton: 0,
};

function parseButton(value: unknown, fallback: MouseButton): MouseButton {
  return value === 0 || value === 1 || value === 2 ? value : fallback;
}

/** Parse stored bindings; anything malformed falls back to the defaults. */
export function parseMouseCameraBindings(value: unknown): MouseCameraBindings {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_MOUSE_CAMERA_BINDINGS };
  const v = value as Partial<Record<keyof MouseCameraBindings, unknown>>;
  const panButton = parseButton(v.panButton, DEFAULT_MOUSE_CAMERA_BINDINGS.panButton);
  let rotateButton = parseButton(v.rotateButton, DEFAULT_MOUSE_CAMERA_BINDINGS.rotateButton);
  // Pan and rotate must differ; the rotate choice wins the conflict.
  if (rotateButton === panButton) {
    rotateButton = panButton === 0 ? 2 : 0;
  }
  return { panButton, rotateButton };
}

const STORAGE_KEY = "campaign.mouseCameraBindings.v1";

function resolveStorage(provided?: Storage): Storage | null {
  if (provided) return provided;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load the player's bindings; defaults when nothing is stored or on error. */
export function loadMouseCameraBindings(provided?: Storage): MouseCameraBindings {
  const storage = resolveStorage(provided);
  if (!storage) return { ...DEFAULT_MOUSE_CAMERA_BINDINGS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MOUSE_CAMERA_BINDINGS };
    return parseMouseCameraBindings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MOUSE_CAMERA_BINDINGS };
  }
}

/** Persist the player's bindings. Returns false when storage is unavailable. */
export function saveMouseCameraBindings(bindings: MouseCameraBindings, provided?: Storage): boolean {
  const storage = resolveStorage(provided);
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply the bindings to a Babylon ArcRotateCamera. The pan button is the
 * camera's `_panningMouseButton`; the handled button set is the union of
 * the two, so an unassigned middle button does not get swallowed.
 */
export function applyMouseCameraBindings(
  camera: ArcRotateCamera,
  bindings: MouseCameraBindings,
): void {
  camera._panningMouseButton = bindings.panButton;
  const pointers = camera.inputs.attached.pointers as ArcRotateCameraPointersInput | undefined;
  if (pointers) {
    pointers.buttons = [bindings.panButton, bindings.rotateButton];
  }
}
