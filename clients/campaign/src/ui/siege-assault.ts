/**
 * Siege assault UI. MASTER_PLAN.md section 2F (tasks 78-81).
 *
 * Four panels:
 *  - Staging: attacker camp (supplies, troops), siege equipment built and
 *    building, wall/gate state. All breach percentages come from the sim.
 *  - Bombardment: pick a wall section to shell, watch the progress bar, and
 *    see the ETA to breach. The bar advances on sim ticks: the caller feeds
 *    fresh SiegeState on every /v1/battle/state poll or WS tick.
 *  - Assault launch: deploy ladders/towers at wall sections, and once a
 *    section is breached, launch the assault through the gap.
 *  - Defender sorties: sally-forth events as they happen, gate defence
 *    status, and a repel action for active sorties.
 *
 * This module owns no sim connection and no 3D scene. The caller injects
 * action callbacks and feeds state via update(); it renders. Rowan wires the
 * callbacks to the sim API and the callbacks' targets to the battle scene.
 */

import { h } from "./dom.js";

export type SiegePhase = "staging" | "bombarding" | "assaulting" | "breached" | "resolved";

export type EquipmentKind = "ladder" | "tower" | "ram" | "catapult";

export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  ladder: "Ladder",
  tower: "Siege tower",
  ram: "Battering ram",
  catapult: "Catapult",
};

export interface WallSection {
  id: string;
  name: string;
  /** 0..1, 1 = intact. */
  integrity: number;
  breached: boolean;
  laddersDeployed: number;
  towersDeployed: number;
}

export interface SiegeEquipment {
  kind: EquipmentKind;
  built: number;
  /** Items currently under construction. */
  building: number;
  /** 0..1 progress of the item at the head of the queue. */
  buildProgress: number;
}

export interface SortieEvent {
  id: string;
  tick: number;
  label: string;
  strength: number;
  repelled: boolean;
}

export interface SiegeState {
  phase: SiegePhase;
  tick: number;
  /** Sim ticks per wall-clock second; used to derive the breach ETA. */
  ticksPerSecond: number;
  camp: { supplies: number; suppliesPerTick: number; troops: number };
  equipment: SiegeEquipment[];
  walls: WallSection[];
  bombardment: {
    active: boolean;
    targetSectionId: string | null;
    /** 0..1 toward breaching the target section. */
    progress: number;
    /** Fraction of wall integrity removed per tick at the current rate. */
    damagePerTick: number;
  };
  /** 0..1, 1 = intact. */
  gateIntegrity: number;
  sorties: SortieEvent[];
}

export interface SiegeAssaultOptions {
  onBuildEquipment: (kind: EquipmentKind) => void;
  onSetBombardTarget: (sectionId: string | null) => void;
  onDeploy: (sectionId: string, kind: "ladder" | "tower") => void;
  onLaunchAssault: (sectionId: string) => void;
  onRepelSortie: (sortieId: string) => void;
}

export interface SiegeAssaultHandle {
  root: HTMLElement;
  update(state: SiegeState): void;
  destroy(): void;
}

const PHASE_LABELS: Record<SiegePhase, string> = {
  staging: "Staging",
  bombarding: "Bombarding",
  assaulting: "Assaulting",
  breached: "Breached",
  resolved: "Resolved",
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Seconds until the breach, or null when no ETA can be computed. */
export function breachEtaSeconds(state: SiegeState): number | null {
  if (!state.bombardment.active) return null;
  if (state.bombardment.progress >= 1) return 0;
  const perSecond = state.bombardment.damagePerTick * state.ticksPerSecond;
  if (perSecond <= 0) return null;
  return (1 - state.bombardment.progress) / perSecond;
}

export function createSiegeAssaultPanel(opts: SiegeAssaultOptions): SiegeAssaultHandle {
  const root = h("div", { class: "siege-panel" });

  // Header: phase badge.
  const header = h("div", { class: "siege-header" });
  const phaseBadge = h("span", { class: "siege-phase" });
  header.append(h("span", { class: "siege-title" }, "Siege"), phaseBadge);
  root.append(header);

  // --- Staging: camp + equipment (task 78). ---
  const staging = h("section", { class: "siege-section" });
  staging.append(h("h3", { class: "siege-section-title" }, "Staging"));
  const campRow = h("div", { class: "siege-camp" });
  const campSupplies = h("span", { class: "siege-stat" });
  const campTroops = h("span", { class: "siege-stat" });
  campRow.append(campSupplies, campTroops);
  const equipList = h("div", { class: "siege-equip" });
  staging.append(campRow, equipList);
  root.append(staging);

  // --- Walls: integrity per section (task 78). ---
  const wallsSec = h("section", { class: "siege-section" });
  wallsSec.append(h("h3", { class: "siege-section-title" }, "Walls"));
  const wallList = h("div", { class: "siege-walls" });
  wallsSec.append(wallList);
  root.append(wallsSec);

  // --- Bombardment: target picker + progress + ETA (task 79). ---
  const bombSec = h("section", { class: "siege-section" });
  bombSec.append(h("h3", { class: "siege-section-title" }, "Bombardment"));
  const targetRow = h("div", { class: "siege-targets" });
  const bombBar = h("div", { class: "siege-bar" }, h("div", { class: "siege-bar-fill" }));
  const bombEta = h("span", { class: "siege-eta" });
  bombSec.append(targetRow, bombBar, bombEta);
  root.append(bombSec);

  // --- Assault: deploy + launch (task 80). ---
  const assaultSec = h("section", { class: "siege-section" });
  assaultSec.append(h("h3", { class: "siege-section-title" }, "Assault"));
  const assaultList = h("div", { class: "siege-assault-rows" });
  assaultSec.append(assaultList);
  root.append(assaultSec);

  // --- Defender sorties + gate defence (task 81). ---
  const sortieSec = h("section", { class: "siege-section" });
  sortieSec.append(h("h3", { class: "siege-section-title" }, "Defender sorties"));
  const gateRow = h("div", { class: "siege-gate" });
  const gateBar = h("div", { class: "siege-bar" }, h("div", { class: "siege-bar-fill" }));
  gateRow.append(h("span", { class: "siege-label" }, "Gate"), gateBar);
  const sortieList = h("div", { class: "siege-sorties" });
  sortieSec.append(gateRow, sortieList);
  root.append(sortieSec);

  function renderEquipment(equipment: SiegeEquipment[]): void {
    equipList.innerHTML = "";
    for (const e of equipment) {
      const row = h("div", { class: "siege-equip-row" });
      const name = h("span", { class: "siege-label" }, EQUIPMENT_LABELS[e.kind]);
      const count = h("span", { class: "siege-stat" }, `Built: ${e.built}`);
      const buildBtn = h(
        "button",
        { class: "siege-btn small", "data-equip": e.kind },
        "Build",
      );
      buildBtn.addEventListener("click", () => opts.onBuildEquipment(e.kind));
      row.append(name, count, buildBtn);
      if (e.building > 0) {
        const bar = h("div", { class: "siege-bar small" }, h("div", { class: "siege-bar-fill" }));
        (bar.firstChild as HTMLElement).style.width = `${Math.round(clamp01(e.buildProgress) * 100)}%`;
        row.append(h("span", { class: "siege-stat" }, `Building: ${e.building}`), bar);
      }
      equipList.append(row);
    }
  }

  function renderWalls(walls: WallSection[]): void {
    wallList.innerHTML = "";
    for (const w of walls) {
      const row = h("div", { class: "siege-wall-row" });
      const name = h("span", { class: "siege-label" }, w.name);
      const bar = h("div", { class: "siege-bar" }, h("div", { class: "siege-bar-fill" }));
      (bar.firstChild as HTMLElement).style.width = `${Math.round(clamp01(w.integrity) * 100)}%`;
      bar.setAttribute("data-integrity", String(Math.round(clamp01(w.integrity) * 100)));
      row.append(name, bar);
      if (w.breached) {
        row.append(h("span", { class: "siege-badge breached" }, "Breached"));
      } else {
        row.append(h("span", { class: "siege-stat" }, `${Math.round(clamp01(w.integrity) * 100)}%`));
      }
      wallList.append(row);
    }
  }

  function renderTargets(walls: WallSection[], targetId: string | null): void {
    targetRow.innerHTML = "";
    for (const w of walls) {
      const btn = h("button", {
        class: `siege-btn small${targetId === w.id ? " active" : ""}`,
        "data-section": w.id,
        "aria-pressed": targetId === w.id ? "true" : "false",
      }, w.name);
      btn.addEventListener("click", () =>
        opts.onSetBombardTarget(targetId === w.id ? null : w.id),
      );
      targetRow.append(btn);
    }
  }

  function renderAssault(walls: WallSection[]): void {
    assaultList.innerHTML = "";
    for (const w of walls) {
      const row = h("div", { class: "siege-assault-row" });
      row.append(h("span", { class: "siege-label" }, w.name));

      const ladderBtn = h(
        "button",
        { class: "siege-btn small", "data-section": w.id, "data-deploy": "ladder" },
        `Ladder (${w.laddersDeployed})`,
      );
      ladderBtn.addEventListener("click", () => opts.onDeploy(w.id, "ladder"));

      const towerBtn = h(
        "button",
        { class: "siege-btn small", "data-section": w.id, "data-deploy": "tower" },
        `Tower (${w.towersDeployed})`,
      );
      towerBtn.addEventListener("click", () => opts.onDeploy(w.id, "tower"));

      const assaultBtn = h(
        "button",
        {
          class: "siege-btn small primary",
          "data-section": w.id,
          "data-assault": "launch",
          disabled: !w.breached,
        },
        "Launch assault",
      );
      assaultBtn.addEventListener("click", () => opts.onLaunchAssault(w.id));

      row.append(ladderBtn, towerBtn, assaultBtn);
      assaultList.append(row);
    }
  }

  function renderSorties(sorties: SortieEvent[]): void {
    sortieList.innerHTML = "";
    if (sorties.length === 0) {
      sortieList.append(h("div", { class: "siege-none" }, "No sorties reported."));
      return;
    }
    for (const s of sorties) {
      const row = h("div", { class: "siege-sortie-row" });
      row.append(
        h("span", { class: "siege-label" }, s.label),
        h("span", { class: "siege-stat" }, `Tick ${s.tick}`),
        h("span", { class: "siege-stat" }, `Strength ${s.strength}`),
      );
      if (s.repelled) {
        row.append(h("span", { class: "siege-badge repelled" }, "Repelled"));
      } else {
        const repelBtn = h(
          "button",
          { class: "siege-btn small", "data-sortie": s.id },
          "Repel",
        );
        repelBtn.addEventListener("click", () => opts.onRepelSortie(s.id));
        row.append(repelBtn);
      }
      sortieList.append(row);
    }
  }

  const handle: SiegeAssaultHandle = {
    root,

    update(state: SiegeState): void {
      phaseBadge.textContent = PHASE_LABELS[state.phase];
      phaseBadge.className = `siege-phase ${state.phase}`;

      campSupplies.textContent = `Supplies: ${state.camp.supplies} (${state.camp.suppliesPerTick >= 0 ? "+" : ""}${state.camp.suppliesPerTick}/tick)`;
      campTroops.textContent = `Troops: ${state.camp.troops}`;

      renderEquipment(state.equipment);
      renderWalls(state.walls);
      renderTargets(state.walls, state.bombardment.targetSectionId);

      const fill = bombBar.firstChild as HTMLElement;
      fill.style.width = `${Math.round(clamp01(state.bombardment.progress) * 100)}%`;
      bombBar.setAttribute("data-progress", String(Math.round(clamp01(state.bombardment.progress) * 100)));
      const eta = breachEtaSeconds(state);
      if (!state.bombardment.active) {
        bombEta.textContent = "Bombardment idle — pick a target section.";
      } else if (eta === null) {
        bombEta.textContent = "ETA unavailable";
      } else if (eta === 0) {
        bombEta.textContent = "Breach imminent";
      } else {
        bombEta.textContent = `Breach ETA ${fmtTime(eta)}`;
      }

      renderAssault(state.walls);

      const gateFill = gateBar.firstChild as HTMLElement;
      gateFill.style.width = `${Math.round(clamp01(state.gateIntegrity) * 100)}%`;
      gateBar.setAttribute("data-integrity", String(Math.round(clamp01(state.gateIntegrity) * 100)));

      renderSorties(state.sorties);
    },

    destroy(): void {
      root.remove();
    },
  };

  return handle;
}
