/**
 * Task 57: hit-stop + screen shake. Heavy hits trigger a brief freeze and a
 * camera shake. Both are toggleable in the accessibility settings, and
 * `reduceMotion` forces both off regardless of the toggles.
 *
 * Honest boundary: pausing the actual simulation/render loop belongs to the
 * sim and scene owners (milo's / Hana's lanes). This controller decides WHEN
 * a hit-stop happens and emits the request through `onHitStopRequest`; the
 * scene adapter wires it to its loop. Screen shake applies a CSS transform to
 * the `shakeTarget` element the hub is given (the canvas wrapper) — without
 * one, shake is a documented no-op.
 */

import { h } from "../ui/dom.js";
import { settings } from "../settings/index.js";
import type { DamageTick, FeedbackSource, Unsubscribe } from "./types.js";

const HIT_STOP_MS = 90;
const SHAKE_MS = 280;
const SHAKE_PX = 10;

export interface ImpactFX {
  root: HTMLElement;
  /** The scene adapter subscribes: pause your loop for `ms`. */
  onHitStopRequest(fn: (ms: number) => void): Unsubscribe;
  destroy(): void;
}

export function createImpactFX(
  source: FeedbackSource,
  opts: { shakeTarget?: HTMLElement } = {},
): ImpactFX {
  const layer = h("div", { class: "fb-impact-layer", "data-testid": "fb-impact-layer" });
  const hitStopListeners = new Set<(ms: number) => void>();
  const unsubs: Unsubscribe[] = [source.onDamage(onDamage)];
  let shaking = false;

  function allowed(): { hitStop: boolean; shake: boolean } {
    const s = settings.get();
    if (s.reduceMotion) return { hitStop: false, shake: false };
    return { hitStop: s.hitStop, shake: s.screenShake };
  }

  function onDamage(d: DamageTick): void {
    if (!d.heavy) return;
    const { hitStop, shake } = allowed();
    if (hitStop) {
      for (const fn of hitStopListeners) fn(HIT_STOP_MS);
    }
    if (shake && opts.shakeTarget && !shaking) {
      shaking = true;
      const t0 = performance.now();
      const target = opts.shakeTarget;
      const step = (now: number): void => {
        const t = (now - t0) / SHAKE_MS;
        if (t >= 1) {
          target.style.transform = "";
          shaking = false;
          return;
        }
        const mag = SHAKE_PX * (1 - t);
        const dx = (Math.random() * 2 - 1) * mag;
        const dy = (Math.random() * 2 - 1) * mag;
        target.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  return {
    root: layer,
    onHitStopRequest(fn) {
      hitStopListeners.add(fn);
      return () => {
        hitStopListeners.delete(fn);
      };
    },
    destroy() {
      for (const u of unsubs) u();
      layer.remove();
    },
  };
}
