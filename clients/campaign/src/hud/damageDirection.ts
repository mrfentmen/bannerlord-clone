/**
 * Task 45: damage direction indicator — a red arc on the screen edge pointing
 * at where the hit came from.
 *
 * It fires only when the player's side takes a hit. The strike carries the
 * world-space direction from victim to attacker; the camera yaw rotates that
 * into screen space, so the arc sits on the edge facing the attacker. The yaw
 * reader is injected because this module owns no camera — whoever mounts the
 * indicator passes `() => camera.rotation.y` or the equivalent.
 *
 * One arc, reused: a second hit while the first is showing moves the arc
 * rather than stacking them, because two arcs would imply two attackers.
 */

import "./damageDirection.css";
import { h } from "../ui/dom.js";
import type { CombatEventSource } from "../scene/combatEvents.js";

export interface DamageDirection {
  root: HTMLElement;
  destroy(): void;
}

/** ms the arc stays visible. Injected for tests. */
export const DAMAGE_ARC_MS = 700;

export function createDamageDirection(
  source: CombatEventSource,
  getCameraYaw: () => number,
  opts: { showMs?: number; setTimeout?: (fn: () => void, ms: number) => unknown } = {},
): DamageDirection {
  const showMs = opts.showMs ?? DAMAGE_ARC_MS;
  const later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));

  const arc = h("div", { class: "hud-dmgdir__arc" });
  const root = h(
    "div",
    { class: "hud-dmgdir", "aria-hidden": "true" },
    h("div", { class: "hud-dmgdir__ring" }, arc),
  );

  const unsubscribe = source.onStrike((e) => {
    if (e.victimTeam !== 0) return;
    // World angle of the incoming direction, then into screen space: the arc
    // is placed at (worldAngle - cameraYaw), so it faces the attacker as the
    // player sees the field.
    const worldAngle = Math.atan2(e.fromDirection.x, e.fromDirection.z);
    const screenAngle = worldAngle - getCameraYaw();
    arc.style.transform = `rotate(${(screenAngle * 180) / Math.PI}deg)`;
    root.classList.add("hud-dmgdir--show");
    later(() => root.classList.remove("hud-dmgdir--show"), showMs);
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
