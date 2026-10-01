/**
 * Photo mode bar (MASTER_PLAN task 123).
 *
 * The task-123 state machine (`createPhotoMode`) owns the mode; this module
 * owns the DOM: a minimal bottom bar with orbit/zoom controls, an
 * interface-hide toggle, a capture button, and an exit. It mounts into
 * `document.body` (not `#app`) so it survives the interface hiding, which is
 * the app's job via `setInterfaceHidden`.
 *
 * The simulation clock is NOT paused here. Pausing time is the time-controls
 * lane (Pax), so photo mode hides the interface and frees the camera while
 * the world keeps moving; the bar says so in its hint. What you capture is
 * the live frame.
 *
 * Capture goes through the renderer's `captureFrame` (the Babylon canvas is
 * created with `preserveDrawingBuffer: true`, so `toDataURL` reads the frame
 * just rendered — no black screenshots). A failed capture shows an inline
 * error and downloads nothing, never a placeholder file.
 */

import "./photoMode.css";
import { announce, button, clear, h, liveRegion } from "../ui/dom.js";
import { createPhotoMode, type CaptureTarget, type PhotoMode } from "./photoMode.js";

export { createPhotoMode };
export type { CaptureTarget, PhotoMode };

export interface PhotoModeBarOptions {
  /** The task-123 state machine. `enter()` is called on mount. */
  photo: PhotoMode;
  /** Drive the real camera for an orbit step (radians). */
  onOrbit: (dYaw: number, dPitch: number) => void;
  /**
   * Drive the real camera for a zoom step. The factor multiplies the camera
   * distance (same convention as `PhotoMode.zoom`): below 1 zooms in.
   */
  onZoom: (factor: number) => void;
  /** PNG data URL of the current frame, or null when the frame is unreadable. */
  captureFrame: () => string | null;
  /** Hide/show the game interface (`#app` display in main.ts). */
  setInterfaceHidden: (hidden: boolean) => void;
  /** Suspend the game's own input actions while the bar owns the keys. */
  suspendInput: () => void;
  /** Resume the game's input actions on exit. */
  resumeInput: () => void;
  /** Called after exit, once the bar is gone. */
  onExit: () => void;
  /** Where to mount the bar. Defaults to `document.body`. */
  mountInto?: HTMLElement;
}

export interface PhotoModeBarHandle {
  /** The bar root element. */
  readonly root: HTMLElement;
  /** The photo-mode state machine. */
  readonly photo: PhotoMode;
  /** Exit photo mode and remove the bar. */
  destroy(): void;
}

/** Radians of orbit per button press / arrow key. */
const ORBIT_STEP = 0.18;
/** Zoom multiplier per press. */
const ZOOM_STEP = 1.25;

export function mountPhotoModeBar(options: PhotoModeBarOptions): PhotoModeBarHandle {
  const into = options.mountInto ?? document.body;
  const { photo } = options;

  const root = h("div", {
    class: "photo-bar",
    role: "toolbar",
    "aria-label": "Photo mode",
    "data-testid": "photo-bar",
  }) as HTMLElement;

  const errorLine = h("p", {
    class: "caption photo-bar__error",
    "data-testid": "photo-error",
    hidden: true,
  }) as HTMLElement;

  const announcer = liveRegion("Photo mode");

  function orbit(dYaw: number, dPitch: number): void {
    photo.orbit(dYaw, dPitch);
    options.onOrbit(dYaw, dPitch);
  }

  function zoom(factor: number): void {
    photo.zoom(factor);
    options.onZoom(factor);
  }

  function showError(message: string): void {
    clear(errorLine);
    errorLine.textContent = message;
    errorLine.hidden = false;
    announce(announcer, message);
  }

  function clearError(): void {
    clear(errorLine);
    errorLine.hidden = true;
  }

  function capture(): void {
    clearError();
    const frame = options.captureFrame();
    if (!frame || !frame.startsWith("data:image/")) {
      showError("The frame could not be captured. The shot was not saved.");
      return;
    }
    let url: string;
    try {
      url = photo.capture({ captureFrame: () => frame });
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "The photo could not be taken.",
      );
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-photo-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    announce(announcer, "Photo captured and downloaded.");
  }

  function toggleInterface(): void {
    const hidden = !photo.state().uiHidden;
    photo.setUiHidden(hidden);
    options.setInterfaceHidden(hidden);
    toggleBtn.querySelector(".btn__label")!.textContent = hidden
      ? "Show interface"
      : "Hide interface";
  }

  const toggleBtn = button("Show interface", toggleInterface, {
    testId: "photo-toggle-ui",
  });

  const controls = h("div", { class: "photo-bar__controls" });
  const orbitDefs: Array<[string, string, () => void]> = [
    ["photo-orbit-left", "◀ Orbit left", () => orbit(-ORBIT_STEP, 0)],
    ["photo-orbit-up", "▲ Tilt up", () => orbit(0, -ORBIT_STEP)],
    ["photo-orbit-down", "▼ Tilt down", () => orbit(0, ORBIT_STEP)],
    ["photo-orbit-right", "▶ Orbit right", () => orbit(ORBIT_STEP, 0)],
  ];
  for (const [testId, label, fn] of orbitDefs) {
    controls.appendChild(button(label, fn, { testId }));
  }
  controls.appendChild(button("＋ Zoom in", () => zoom(1 / ZOOM_STEP), { testId: "photo-zoom-in" }));
  controls.appendChild(button("－ Zoom out", () => zoom(ZOOM_STEP), { testId: "photo-zoom-out" }));
  controls.appendChild(toggleBtn);
  controls.appendChild(
    button("Capture photo", capture, { variant: "primary", testId: "photo-capture" }),
  );
  controls.appendChild(button("Exit photo mode", destroy, { testId: "photo-exit" }));

  root.append(
    h(
      "p",
      { class: "caption photo-bar__hint", "data-testid": "photo-hint" },
      "Drag the map to orbit. The world keeps moving — photo mode does not pause time.",
    ),
    controls,
    errorLine,
    announcer,
  );

  function onKeyDown(ev: KeyboardEvent): void {
    switch (ev.key) {
      case "ArrowLeft":
        ev.preventDefault();
        orbit(-ORBIT_STEP, 0);
        break;
      case "ArrowRight":
        ev.preventDefault();
        orbit(ORBIT_STEP, 0);
        break;
      case "ArrowUp":
        ev.preventDefault();
        orbit(0, -ORBIT_STEP);
        break;
      case "ArrowDown":
        ev.preventDefault();
        orbit(0, ORBIT_STEP);
        break;
      case "+":
      case "=":
        zoom(1 / ZOOM_STEP);
        break;
      case "-":
      case "_":
        zoom(ZOOM_STEP);
        break;
      case "h":
      case "H":
        toggleInterface();
        break;
      case "Escape":
        destroy();
        break;
      default:
        return;
    }
  }

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener("keydown", onKeyDown);
    photo.exit();
    options.setInterfaceHidden(false);
    options.resumeInput();
    root.remove();
    announce(announcer, "Photo mode closed.");
    options.onExit();
  }

  // Enter: the mode hides the interface by default (task 123: hide the UI
  // for the shot); the bar itself is the only chrome left.
  photo.enter();
  options.setInterfaceHidden(true);
  options.suspendInput();
  window.addEventListener("keydown", onKeyDown);
  into.appendChild(root);
  const captureBtn = root.querySelector('[data-testid="photo-capture"]');
  if (captureBtn instanceof HTMLElement) captureBtn.focus();

  return { root, photo, destroy };
}
