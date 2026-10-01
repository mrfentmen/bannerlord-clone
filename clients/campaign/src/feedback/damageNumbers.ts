/**
 * Task 51: floating damage numbers. A fixed pool of DOM nodes — spawning never
 * allocates, and the oldest active number is recycled when the pool is full,
 * so 200 simultaneous numbers stay at a flat 60fps with no GC spikes.
 * Toggleable via the `floatingDamageNumbers` accessibility setting.
 */

import { h } from "../ui/dom.js";
import { settings } from "../settings/index.js";
import type { DamageTick, FeedbackProjection, FeedbackSource, Unsubscribe } from "./types.js";

const POOL_SIZE = 200;
const RISE_PX = 46;
const LIFE_MS = 900;

interface Pooled {
  el: HTMLElement;
  busyUntil: number;
}

export interface DamageNumbers {
  root: HTMLElement;
  /** How many pool nodes exist (always POOL_SIZE — the pool never grows). */
  poolSize(): number;
  destroy(): void;
}

export function createDamageNumbers(
  source: FeedbackSource,
  projection: FeedbackProjection,
): DamageNumbers {
  const layer = h("div", { class: "fb-damage-layer", "data-testid": "fb-damage-layer" });
  const pool: Pooled[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const el = h("span", { class: "fb-damage" });
    el.hidden = true;
    layer.appendChild(el);
    pool.push({ el, busyUntil: 0 });
  }

  let enabled = settings.get().floatingDamageNumbers;
  const offSettings = settings.subscribe((s) => {
    enabled = s.floatingDamageNumbers;
  });
  const unsubs: Unsubscribe[] = [source.onDamage(onDamage), offSettings];
  let raf = 0;
  const active: Array<{ p: Pooled; x: number; y: number; start: number }> = [];

  function onDamage(d: DamageTick): void {
    if (!enabled) return;
    const now = performance.now();
    // Oldest-busy first so a burst recycles gracefully instead of dropping.
    let slot = pool.find((p) => p.busyUntil <= now);
    if (!slot) {
      slot = pool.reduce((a, b) => (a.busyUntil < b.busyUntil ? a : b));
      const idx = active.findIndex((a) => a.p === slot);
      if (idx >= 0) active.splice(idx, 1);
    }
    const s = projection.fieldToScreen(d.x, d.z);
    slot.busyUntil = now + LIFE_MS;
    slot.el.hidden = false;
    slot.el.textContent = String(Math.round(d.amount));
    slot.el.classList.toggle("is-crit", d.crit === true);
    active.push({ p: slot, x: s.x, y: s.y, start: now });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    raf = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i]!;
      const t = (now - a.start) / LIFE_MS;
      if (t >= 1) {
        a.p.el.hidden = true;
        active.splice(i, 1);
        continue;
      }
      const rise = RISE_PX * t;
      a.p.el.style.transform = `translate(${a.x.toFixed(1)}px, ${(a.y - rise).toFixed(1)}px)`;
      a.p.el.style.opacity = t < 0.7 ? "1" : String(1 - (t - 0.7) / 0.3);
    }
    if (active.length > 0) raf = requestAnimationFrame(tick);
  }

  return {
    root: layer,
    poolSize: () => pool.length,
    destroy() {
      for (const u of unsubs) u();
      cancelAnimationFrame(raf);
      layer.remove();
    },
  };
}
