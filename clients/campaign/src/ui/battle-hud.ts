/**
 * The battle HUD. MASTER_PLAN.md section 2D.
 *
 * Top bar: ally/enemy counts, morale bars, battle timer — all values tick
 * from sim data via the /v1/battle/state poll or the WS stream.
 * Kill feed: last 5 kills with unit names, entries fade after 6s.
 * Unit cards: one per player formation, click to select.
 * Minimap: unit dots, refreshes every 500ms.
 *
 * This module owns no sim connection. The caller feeds it state snapshots
 * and it renders. Rowan wires it into the battle scene.
 */

import { h } from "./dom.js";
import { ink, status } from "../design/tokens.js";

export interface BattleHudState {
  tick: number;
  phase: string;
  allies: { alive: number; total: number; morale: number };
  enemies: { alive: number; total: number; morale: number };
  elapsedSeconds: number;
  formations: { id: string; name: string; alive: number; total: number }[];
  units: { id: string; side: "ally" | "enemy"; x: number; y: number; alive: boolean }[];
}

export interface KillEntry {
  tick: number;
  killerName: string;
  victimName: string;
}

export interface BattleHudHandle {
  root: HTMLElement;
  update(state: BattleHudState): void;
  pushKill(kill: KillEntry): void;
  onSelectFormation: (id: string) => void;
  destroy(): void;
}

const KILL_FADE_MS = 6000;
const MINIMAP_MS = 500;

export function createBattleHud(onSelectFormation: (id: string) => void): BattleHudHandle {
  const root = h("div", { class: "battle-hud" });

  // Top bar: counts, morale, timer.
  const topBar = h("div", { class: "battle-topbar" });
  const allyCount = h("span", { class: "battle-count ally" });
  const allyMorale = h("div", { class: "battle-morale ally" }, h("div", { class: "battle-morale-fill" }));
  const timer = h("span", { class: "battle-timer" });
  const enemyMorale = h("div", { class: "battle-morale enemy" }, h("div", { class: "battle-morale-fill" }));
  const enemyCount = h("span", { class: "battle-count enemy" });
  topBar.append(allyCount, allyMorale, timer, enemyMorale, enemyCount);

  // Kill feed.
  const killFeed = h("div", { class: "battle-killfeed" });

  // Unit cards.
  const cards = h("div", { class: "battle-cards" });

  // Minimap.
  const minimap = h("canvas", { class: "battle-minimap", width: "160", height: "160" }) as HTMLCanvasElement;

  root.append(topBar, killFeed, cards, minimap);

  let lastState: BattleHudState | null = null;
  let minimapTimer: ReturnType<typeof setInterval> | null = null;
  const killTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function drawMinimap(state: BattleHudState): void {
    const ctx = minimap.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 160);
    ctx.fillStyle = ink[900];
    ctx.fillRect(0, 0, 160, 160);
    // Scale world coords into the 160px box. Battles are fought on fields
    // measured in hundreds of metres; clamp to a 400m view.
    const scale = 160 / 400;
    for (const u of state.units) {
      if (!u.alive) continue;
      const px = 80 + u.x * scale;
      const py = 80 + u.y * scale;
      if (px < 0 || px > 160 || py < 0 || py > 160) continue;
      ctx.fillStyle = u.side === "ally" ? status.info.mark : status.critical.mark;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
  }

  const handle: BattleHudHandle = {
    root,
    onSelectFormation,

    update(state: BattleHudState): void {
      lastState = state;
      allyCount.textContent = `${state.allies.alive}/${state.allies.total}`;
      enemyCount.textContent = `${state.enemies.alive}/${state.enemies.total}`;
      (allyMorale.firstChild as HTMLElement).style.width = `${Math.round(state.allies.morale * 100)}%`;
      (enemyMorale.firstChild as HTMLElement).style.width = `${Math.round(state.enemies.morale * 100)}%`;
      timer.textContent = fmtTime(state.elapsedSeconds);

      // Rebuild cards only when formations change.
      cards.innerHTML = "";
      for (const f of state.formations) {
        const card = h("button", { class: "battle-card", "data-id": f.id });
        card.textContent = `${f.name} ${f.alive}/${f.total}`;
        card.addEventListener("click", () => onSelectFormation(f.id));
        cards.append(card);
      }
    },

    pushKill(kill: KillEntry): void {
      const entry = h("div", { class: "battle-kill" });
      entry.textContent = `${kill.killerName} killed ${kill.victimName}`;
      killFeed.prepend(entry);
      // Keep the last 5.
      while (killFeed.children.length > 5) {
        const old = killFeed.lastChild as HTMLElement;
        const t = killTimers.get(old);
        if (t) clearTimeout(t);
        killTimers.delete(old);
        old.remove();
      }
      const timerId = setTimeout(() => {
        entry.classList.add("fade");
        setTimeout(() => entry.remove(), 500);
        killTimers.delete(entry);
      }, KILL_FADE_MS);
      killTimers.set(entry, timerId);
    },

    destroy(): void {
      if (minimapTimer) clearInterval(minimapTimer);
      for (const t of killTimers.values()) clearTimeout(t);
      killTimers.clear();
      root.remove();
    },
  };

  minimapTimer = setInterval(() => {
    if (lastState) drawMinimap(lastState);
  }, MINIMAP_MS);

  return handle;
}
