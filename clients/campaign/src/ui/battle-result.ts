/**
 * The battle result screen. MASTER_PLAN.md section 2E.
 *
 * Victory/defeat screen with kills, losses, and duration — every number
 * comes from the sim result payload. Casualty list per troop tier: each
 * tier shows killed and wounded counts.
 *
 * The caller passes the /v1/battle/state result payload (or the resolve
 * response) and this renders it. Rowan wires it into the battle scene.
 */

import { h } from "./dom.js";

export interface TierCasualties {
  tier: number;
  tierName: string;
  killed: number;
  wounded: number;
}

export interface BattleResult {
  outcome: "victory" | "defeat" | "draw";
  kills: number;
  losses: number;
  durationSeconds: number;
  tiers: TierCasualties[];
  lootMoney?: number;
  prisoners?: number;
}

export function createBattleResultScreen(result: BattleResult, onClose: () => void): HTMLElement {
  const root = h("div", { class: "battle-result" });

  const title = h("h1", { class: `battle-result-title ${result.outcome}` });
  title.textContent =
    result.outcome === "victory" ? "Victory" : result.outcome === "defeat" ? "Defeat" : "Draw";

  const summary = h("div", { class: "battle-result-summary" });
  const mins = Math.floor(result.durationSeconds / 60);
  const secs = Math.floor(result.durationSeconds % 60);
  summary.append(
    h("div", { class: "battle-result-stat" }, `Kills: ${result.kills}`),
    h("div", { class: "battle-result-stat" }, `Losses: ${result.losses}`),
    h("div", { class: "battle-result-stat" }, `Duration: ${mins}:${secs.toString().padStart(2, "0")}`),
  );
  if (result.lootMoney !== undefined) {
    summary.append(h("div", { class: "battle-result-stat" }, `Loot: $${result.lootMoney}`));
  }
  if (result.prisoners !== undefined) {
    summary.append(h("div", { class: "battle-result-stat" }, `Prisoners: ${result.prisoners}`));
  }

  const tierList = h("div", { class: "battle-result-tiers" });
  tierList.append(h("h2", {}, "Casualties by tier"));
  for (const t of result.tiers) {
    const row = h("div", { class: "battle-result-tier" });
    row.append(
      h("span", { class: "tier-name" }, t.tierName),
      h("span", { class: "tier-killed" }, `Killed: ${t.killed}`),
      h("span", { class: "tier-wounded" }, `Wounded: ${t.wounded}`),
    );
    tierList.append(row);
  }

  const closeBtn = h("button", { class: "battle-result-close" }, "Continue");
  closeBtn.addEventListener("click", onClose);

  root.append(title, summary, tierList, closeBtn);
  return root;
}
