/**
 * Task 89: petition handling. Twelve petition types, each with grant/deny/
 * defer resolutions trading rep against gold. The numbers are the decision;
 * the campaign layer moves the actual rep and coin.
 */

import type { Petition, PetitionKind, PetitionResolution } from "./types.js";

export const PETITION_KINDS: PetitionKind[] = [
  "grain-shortage",
  "bandit-raids",
  "tax-dispute",
  "land-claim",
  "guild-charter",
  "marriage-blessing",
  "plague-fear",
  "bridge-repair",
  "desertion-pardon",
  "well-poisoning",
  "market-rights",
  "orphan-care",
];

export const PETITION_LABELS: Record<PetitionKind, string> = {
  "grain-shortage": "Grain shortage",
  "bandit-raids": "Bandit raids",
  "tax-dispute": "Tax dispute",
  "land-claim": "Land claim",
  "guild-charter": "Guild charter",
  "marriage-blessing": "Marriage blessing",
  "plague-fear": "Plague fear",
  "bridge-repair": "Bridge repair",
  "desertion-pardon": "Desertion pardon",
  "well-poisoning": "Well poisoning",
  "market-rights": "Market rights",
  "orphan-care": "Orphan care",
};

export type PetitionDecision = "grant" | "deny" | "defer";

const BASE: Record<PetitionKind, { grant: [number, number]; deny: [number, number] }> = {
  "grain-shortage": { grant: [8, -300], deny: [-10, 0] },
  "bandit-raids": { grant: [10, -200], deny: [-12, 0] },
  "tax-dispute": { grant: [4, -150], deny: [-4, 100] },
  "land-claim": { grant: [6, -100], deny: [-6, 50] },
  "guild-charter": { grant: [5, 200], deny: [-3, 0] },
  "marriage-blessing": { grant: [3, 0], deny: [-2, 0] },
  "plague-fear": { grant: [9, -400], deny: [-14, 0] },
  "bridge-repair": { grant: [6, -250], deny: [-8, 0] },
  "desertion-pardon": { grant: [-4, 0], deny: [5, 0] },
  "well-poisoning": { grant: [7, -150], deny: [-9, 0] },
  "market-rights": { grant: [4, 150], deny: [-3, 50] },
  "orphan-care": { grant: [8, -200], deny: [-10, 0] },
};

/** Resolve a petition: returns [rep, gold] deltas and a text for the log. */
export function resolvePetition(petition: Petition, decision: PetitionDecision): PetitionResolution {
  const base = BASE[petition.kind];
  if (!base) throw new Error(`unknown petition kind: ${petition.kind}`);
  const label = PETITION_LABELS[petition.kind];
  if (decision === "defer") {
    return { rep: -1, gold: 0, text: `${label}: deferred. ${petition.petitioner} will return.` };
  }
  const [rep, gold] = decision === "grant" ? base.grant : base.deny;
  return {
    rep,
    gold,
    text: `${label}: ${decision === "grant" ? "granted" : "denied"}.`,
  };
}
