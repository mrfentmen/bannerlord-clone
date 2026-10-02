/**
 * Task 36: HUD unit health bars. One bar per tracked unit, projected above the
 * unit and filled to `hp / maxHp`. Toggleable — `enabled` at build time and
 * `setEnabled()` live, so the HUD can hang it off a settings row.
 *
 * A unit with no `hp`/`maxHp`, or a dead one, draws no bar; the component
 * never invents health it was not told about. Bars are capped at
 * {@link MAX_BARS} so a 500-unit melee cannot grow the DOM without bound —
 * the nearest units keep their bars, the rest wait for room.
 *
 * Call `refresh()` once per frame (the hub does) to track the camera.
 */

import "./unitHealthBars.css";
import { h } from "../ui/dom.js";
import type { FeedbackProjection, FeedbackSource, TrackedUnit, Unsubscribe } from "./types.js";

/** Hard cap on simultaneous bars. */
export const MAX_BARS = 64;

export interface UnitHealthBars {
  root: HTMLElement;
  /** Toggle the whole layer; bars keep tracking while hidden. */
  setEnabled(on: boolean): void;
  enabled(): boolean;
  refresh(): void;
  destroy(): void;
}

interface Bar {
  el: HTMLElement;
  fill: HTMLElement;
}

function fraction(u: TrackedUnit): number | null {
  if (typeof u.hp !== "number" || typeof u.maxHp !== "number" || u.maxHp <= 0) return null;
  return Math.min(1, Math.max(0, u.hp / u.maxHp));
}

/** Nearest to the camera origin first; the cap then trims the far stragglers. */
function nearestFirst(units: TrackedUnit[]): TrackedUnit[] {
  return [...units].sort((a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z));
}

export function createUnitHealthBars(
  source: FeedbackSource,
  projection: FeedbackProjection,
  opts: { enabled?: boolean } = {},
): UnitHealthBars {
  const layer = h("div", { class: "fb-health-layer", "data-testid": "fb-health-layer", "aria-hidden": "true" });
  const bars = new Map<string, Bar>();
  let on = opts.enabled !== false;
  const unsubs: Unsubscribe[] = [source.onUnitsChanged(sync)];

  function sync(): void {
    const wanted = new Map<string, TrackedUnit>();
    for (const u of nearestFirst(source.units()).filter((u) => u.alive && fraction(u) !== null)) {
      if (wanted.size >= MAX_BARS) break;
      wanted.set(u.id, u);
    }
    for (const [id, bar] of bars) {
      if (!wanted.has(id)) {
        bar.el.remove();
        bars.delete(id);
      }
    }
    for (const u of wanted.values()) {
      let bar = bars.get(u.id);
      if (!bar) {
        const fill = h("span", { class: "fb-health__fill" });
        const el = h(
          "div",
          { class: `fb-health is-${u.side}`, "data-testid": "fb-unit-health", "data-side": u.side },
          fill,
        );
        layer.appendChild(el);
        bar = { el, fill };
        bars.set(u.id, bar);
      }
    }
    refresh();
  }

  function refresh(): void {
    if (!on) return;
    const units = new Map(source.units().map((u) => [u.id, u]));
    for (const [id, bar] of bars) {
      const u = units.get(id);
      if (!u) continue;
      const pct = fraction(u) ?? 0;
      const s = projection.fieldToScreen(u.x, u.z);
      bar.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -160%)`;
      bar.fill.style.width = `${(pct * 100).toFixed(1)}%`;
      bar.el.classList.toggle("is-hurt", pct <= 0.33);
    }
  }

  function apply(): void {
    layer.hidden = !on;
    if (on) refresh();
  }

  sync();
  apply();

  return {
    root: layer,
    setEnabled(next: boolean) {
      on = next;
      apply();
    },
    enabled: () => on,
    refresh,
    destroy() {
      for (const u of unsubs) u();
      layer.remove();
    },
  };
}
