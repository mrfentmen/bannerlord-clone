/**
 * Task 123: photo mode. Pause, hide the UI, and orbit a free camera; the
 * actual screenshot goes through the CaptureTarget the renderer implements.
 */

import type { PhotoModeState } from "./types.js";

/** Narrow interface the renderer implements for screenshots. */
export interface CaptureTarget {
  /** Returns a data URL of the current frame. */
  captureFrame(): string;
}

export interface PhotoMode {
  state(): PhotoModeState;
  enter(): void;
  exit(): void;
  orbit(dYaw: number, dPitch: number): void;
  zoom(factor: number): void;
  /** Hide/show the game UI for the shot. */
  setUiHidden(hidden: boolean): void;
  capture(target: CaptureTarget): string;
}

export function createPhotoMode(): PhotoMode {
  let state: PhotoModeState = { active: false, uiHidden: false, yaw: 0, pitch: 0.3, distance: 10 };
  return {
    state: () => ({ ...state }),
    enter() {
      state = { ...state, active: true, uiHidden: true };
    },
    exit() {
      state = { ...state, active: false, uiHidden: false };
    },
    orbit(dYaw, dPitch) {
      if (!state.active) throw new Error("photo mode is not active");
      state = {
        ...state,
        yaw: state.yaw + dYaw,
        pitch: Math.min(1.4, Math.max(-0.2, state.pitch + dPitch)),
      };
    },
    zoom(factor) {
      if (!state.active) throw new Error("photo mode is not active");
      if (factor <= 0) throw new Error("zoom factor must be positive");
      state = { ...state, distance: Math.min(60, Math.max(2, state.distance * factor)) };
    },
    setUiHidden(hidden) {
      state = { ...state, uiHidden: hidden };
    },
    capture(target) {
      if (!state.active) throw new Error("photo mode is not active");
      return target.captureFrame();
    },
  };
}
