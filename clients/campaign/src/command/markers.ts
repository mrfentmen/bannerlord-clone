/**
 * Battlefield overlay markers for the commander (tasks 43-45): ping markers
 * with edge-of-screen direction, waypoint trails, and the rally point flag.
 *
 * All markers live in the CommandSurface overlay in screen pixels. Timers are
 * real `setTimeout`s; `destroy()` clears everything they created.
 */

import { h } from "../ui/dom.js";

export interface Markers {
  /** Task 44: drop a ping at screen (sx, sy); fades after 5 s. */
  ping(sx: number, sy: number): void;
  /** Task 43: redraw the queued-waypoint trail through the given points. */
  setWaypoints(points: { x: number; y: number }[]): void;
  clearWaypoints(): void;
  /** Task 45: plant the rally flag at screen (sx, sy); replaces the old one. */
  setRallyPoint(sx: number, sy: number): void;
  clearRallyPoint(): void;
  destroy(): void;
}

const PING_MS = 5000;

export function createMarkers(overlay: HTMLElement): Markers {
  const owned: HTMLElement[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let waypointLayer: HTMLElement | null = null;
  let rallyEl: HTMLElement | null = null;

  function track(el: HTMLElement, ms?: number): void {
    owned.push(el);
    overlay.appendChild(el);
    if (ms != null) {
      timers.push(
        setTimeout(() => {
          el.remove();
          const i = owned.indexOf(el);
          if (i >= 0) owned.splice(i, 1);
        }, ms),
      );
    }
  }

  function ping(sx: number, sy: number): void {
    // On-screen: an expanding ring at the point. Off-screen: an arrow pinned
    // to the nearest viewport edge pointing at the ping.
    const inView =
      sx >= 0 && sx <= window.innerWidth && sy >= 0 && sy <= window.innerHeight;
    const el = h("div", {
      class: "cmd-ping",
      role: "status",
      "aria-label": "Map ping",
      "data-testid": "cmd-ping",
    });
    if (inView) {
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
    } else {
      const cx = Math.max(24, Math.min(window.innerWidth - 24, sx));
      const cy = Math.max(24, Math.min(window.innerHeight - 24, sy));
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      const ang = Math.atan2(sy - cy, sx - cx);
      el.style.setProperty("--ping-angle", `${ang}rad`);
      el.classList.add("is-edge");
    }
    track(el, PING_MS);
  }

  function setWaypoints(points: { x: number; y: number }[]): void {
    clearWaypoints();
    if (points.length === 0) return;
    waypointLayer = h("div", {
      class: "cmd-waypoints",
      "aria-hidden": "true",
      "data-testid": "cmd-waypoints",
    });
    points.forEach((p, i) => {
      const dot = h("div", { class: "cmd-waypoint", text: String(i + 1) });
      dot.style.left = `${p.x}px`;
      dot.style.top = `${p.y}px`;
      waypointLayer!.appendChild(dot);
    });
    track(waypointLayer);
  }

  function clearWaypoints(): void {
    if (waypointLayer) {
      waypointLayer.remove();
      const i = owned.indexOf(waypointLayer);
      if (i >= 0) owned.splice(i, 1);
      waypointLayer = null;
    }
  }

  function setRallyPoint(sx: number, sy: number): void {
    clearRallyPoint();
    rallyEl = h("div", {
      class: "cmd-rally",
      role: "status",
      "aria-label": "Rally point",
      "data-testid": "cmd-rally",
      text: "⚑",
    });
    rallyEl.style.left = `${sx}px`;
    rallyEl.style.top = `${sy}px`;
    track(rallyEl);
  }

  function clearRallyPoint(): void {
    if (rallyEl) {
      rallyEl.remove();
      const i = owned.indexOf(rallyEl);
      if (i >= 0) owned.splice(i, 1);
      rallyEl = null;
    }
  }

  function destroy(): void {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    for (const el of owned) el.remove();
    owned.length = 0;
    waypointLayer = null;
    rallyEl = null;
  }

  return { ping, setWaypoints, clearWaypoints, setRallyPoint, clearRallyPoint, destroy };
}
