import type { NpcParty } from "../../data/types.js";

export interface EncounterChoice {
  action: "fight" | "flee" | "dismiss";
  npcParty: NpcParty;
}

/**
 * Encounter panel: shown when the player party comes within encounter range
 * of a hostile NPC party. The player chooses to fight, flee, or dismiss.
 */
export function encounterPanel(opts: {
  npc: NpcParty;
  playerTroops: number;
  onChoice: (choice: EncounterChoice) => void;
}): HTMLElement {
  const root = document.createElement("div");
  root.className = "encounter-panel-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Encounter");

  const panel = document.createElement("div");
  panel.className = "encounter-panel";

  const title = document.createElement("h2");
  title.textContent = `⚔️ Encounter: ${opts.npc.name}`;
  panel.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "encounter-desc";
  const relation = opts.npc.hostile ? "hostile" : "neutral";
  desc.textContent = `A ${relation} party of ${opts.npc.troopCount} ${opts.npc.troopCount === 1 ? "fighter" : "fighters"} blocks your path. Your party: ${opts.playerTroops} troops.`;
  panel.appendChild(desc);

  const btnRow = document.createElement("div");
  btnRow.className = "encounter-buttons";

  const fightBtn = document.createElement("button");
  fightBtn.className = "encounter-fight";
  fightBtn.textContent = "⚔️ Fight";
  fightBtn.addEventListener("click", () => {
    opts.onChoice({ action: "fight", npcParty: opts.npc });
    root.remove();
  });

  const fleeBtn = document.createElement("button");
  fleeBtn.className = "encounter-flee";
  fleeBtn.textContent = "🏃 Flee";
  fleeBtn.addEventListener("click", () => {
    opts.onChoice({ action: "flee", npcParty: opts.npc });
    root.remove();
  });

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "encounter-dismiss";
  dismissBtn.textContent = "Dismiss";
  dismissBtn.addEventListener("click", () => {
    opts.onChoice({ action: "dismiss", npcParty: opts.npc });
    root.remove();
  });

  btnRow.append(fightBtn, fleeBtn, dismissBtn);
  panel.appendChild(btnRow);
  root.appendChild(panel);

  return root;
}
