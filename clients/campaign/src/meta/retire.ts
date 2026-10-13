/**
 * Retirement (Rowan solo task 3).
 *
 * A ruler may lay down the banner at any time. Retirement ends the campaign
 * gracefully: the game generates an epilogue from the campaign's deeds, banks
 * the legacy hooks for New Game+ (owned by meta/newgameplus.ts), and hands
 * control back to the host to return to the title. Two-step confirmation —
 * retirement is irreversible.
 */

export interface RetirementDeeds {
  clanName: string;
  rulerName: string;
  daysElapsed: number;
  battlesWon: number;
  battlesLost: number;
  townsControlled: number;
  /** 0-100. */
  renown: number;
}

/** A closing line for the chronicle, chosen by renown. */
function epithet(renown: number): string {
  if (renown >= 80) return "the Magnificent";
  if (renown >= 60) return "the Respected";
  if (renown >= 40) return "the Steadfast";
  if (renown >= 20) return "the Unremarkable";
  return "the Forgotten";
}

/**
 * Generate the retirement epilogue from the campaign's deeds. Pure and
 * deterministic — the same deeds always produce the same epilogue.
 */
export function generateEpilogue(deeds: RetirementDeeds): string[] {
  const epi = epithet(Math.max(0, Math.min(100, deeds.renown)));
  const lines = [
    `${deeds.rulerName} ${epi} lays down the banner of ${deeds.clanName}.`,
    `After ${deeds.daysElapsed} days, ${deeds.battlesWon} victories and ${deeds.battlesLost} defeats, the clan holds ${deeds.townsControlled} towns.`,
  ];
  if (deeds.townsControlled >= 4) {
    lines.push("Bards will sing of the conquest for generations.");
  } else if (deeds.battlesWon > deeds.battlesLost) {
    lines.push("A warrior's retirement, earned blade in hand.");
  } else {
    lines.push("The chronicles are kind to those who endure.");
  }
  return lines;
}

export type RetireState = "idle" | "armed" | "done";

/**
 * Two-step retirement state machine. Arm first, then confirm — the host
 * performs the actual campaign teardown on "done".
 */
export function nextRetireState(state: RetireState, action: "arm" | "confirm" | "cancel"): RetireState {
  switch (state) {
    case "idle":
      return action === "arm" ? "armed" : "idle";
    case "armed":
      if (action === "confirm") return "done";
      if (action === "cancel") return "idle";
      return "armed";
    case "done":
      return "done";
  }
}
