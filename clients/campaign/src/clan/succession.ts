/**
 * Tasks 79, 80, 82: heirs and succession.
 *
 * - designateHeir: pick an heir explicitly (overrides law-based default).
 * - successionPreview: under the clan's inheritance law, who inherits and —
 *   for partible law — how the realm's holdings split among the children.
 * - successionCrisis: when the ruler dies with 3+ claimants, the crisis
 *   plays out as a sequence of choices; each choice shifts claimant support
 *   until one claimant wins outright.
 */

import type { ClanLaws, ClanMember, InheritanceLaw } from "./types.js";

export interface SuccessionPreview {
  heirId: string;
  /** Holding -> heir id, only populated under partible law. */
  split: Record<string, string>;
  law: InheritanceLaw;
}

function livingChildren(ruler: ClanMember, members: Map<string, ClanMember>): ClanMember[] {
  return [...members.values()].filter(
    (m) =>
      m.deathYear === undefined &&
      (m.fatherId === ruler.id || m.motherId === ruler.id),
  );
}

function sortByLaw(kids: ClanMember[], law: InheritanceLaw): ClanMember[] {
  const byAge = [...kids].sort((a, b) => a.birthYear - b.birthYear);
  switch (law) {
    case "primogeniture":
      return byAge;
    case "ultimogeniture":
      return [...byAge].reverse();
    case "partible":
      return byAge;
    case "elective":
      // The most skilled candidate wins the election.
      return [...kids].sort(
        (a, b) =>
          Object.values(b.skills).reduce((s, v) => s + v, 0) -
          Object.values(a.skills).reduce((s, v) => s + v, 0),
      );
  }
}

/**
 * Preview succession. Holdings split only under partible law; every other
 * law names a single heir for everything.
 */
export function successionPreview(
  rulerId: string,
  members: ClanMember[],
  laws: ClanLaws,
  holdings: string[],
  designatedHeirId?: string,
): SuccessionPreview {
  const map = new Map(members.map((m) => [m.id, m]));
  const ruler = map.get(rulerId);
  if (!ruler) throw new Error(`unknown ruler: ${rulerId}`);
  const kids = livingChildren(ruler, map);
  if (kids.length === 0) throw new Error("no living children to inherit");
  const ordered = sortByLaw(kids, laws.inheritance);
  const heirId = designatedHeirId && map.has(designatedHeirId) ? designatedHeirId : ordered[0]!.id;
  const split: Record<string, string> = {};
  if (laws.inheritance === "partible") {
    holdings.forEach((h, i) => {
      split[h] = ordered[i % ordered.length]!.id;
    });
  } else {
    for (const h of holdings) split[h] = heirId;
  }
  return { heirId, split, law: laws.inheritance };
}

export interface CrisisClaimant {
  memberId: string;
  claim: string;
  support: number; // 0..100
}

export interface CrisisChoice {
  id: string;
  label: string;
  /** support deltas by claimant id */
  effects: Record<string, number>;
  text: string;
}

export interface SuccessionCrisis {
  claimants: CrisisClaimant[];
  rounds: number;
  choices(): CrisisChoice[];
  choose(choiceId: string): { winnerId: string | null; text: string };
}

/**
 * A contested succession with 3+ claimants. Each choice moves support;
 * a claimant above 60 wins, or after 5 rounds the strongest takes it.
 */
export function startSuccessionCrisis(claimantIds: string[], members: ClanMember[]): SuccessionCrisis {
  if (claimantIds.length < 3) throw new Error("a succession crisis needs at least 3 claimants");
  const map = new Map(members.map((m) => [m.id, m]));
  const claimants: CrisisClaimant[] = claimantIds.map((id, i) => {
    const m = map.get(id);
    if (!m) throw new Error(`unknown claimant: ${id}`);
    return { memberId: id, claim: `Claim of ${m.name}`, support: 30 - i * 4 };
  });
  let rounds = 0;

  const crisis: SuccessionCrisis = {
    claimants,
    rounds: 0,
    choices() {
      const [a, b, c] = claimants;
      return [
        {
          id: "back-eldest",
          label: `Back ${map.get(a!.memberId)!.name} (eldest claim)`,
          effects: { [a!.memberId]: 18, [b!.memberId]: -6, [c!.memberId]: -6 },
          text: "The council nods at precedent. The eldest's claim hardens.",
        },
        {
          id: "back-strongest",
          label: `Back ${map.get(b!.memberId)!.name} (strongest army)`,
          effects: { [b!.memberId]: 18, [a!.memberId]: -6, [c!.memberId]: -6 },
          text: "Swords speak louder than birth order. The war party rallies.",
        },
        {
          id: "compromise",
          label: "Propose a regency council",
          effects: Object.fromEntries(claimants.map((k) => [k.memberId, 6])),
          text: "A compromise: no single ruler yet, but the bleeding stops.",
        },
      ];
    },
    choose(choiceId) {
      const choice = crisis.choices().find((c) => c.id === choiceId);
      if (!choice) throw new Error(`unknown crisis choice: ${choiceId}`);
      for (const [id, delta] of Object.entries(choice.effects)) {
        const k = claimants.find((x) => x.memberId === id)!;
        k.support = Math.min(100, Math.max(0, k.support + delta));
      }
      rounds += 1;
      crisis.rounds = rounds;
      const winner = claimants.find((k) => k.support >= 60);
      if (winner) return { winnerId: winner.memberId, text: `${choice.text} ${map.get(winner.memberId)!.name} claims the seat.` };
      if (rounds >= 5) {
        const top = [...claimants].sort((x, y) => y.support - x.support)[0]!;
        return { winnerId: top.memberId, text: `Exhausted, the council settles on ${map.get(top.memberId)!.name}.` };
      }
      return { winnerId: null, text: choice.text };
    },
  };
  return crisis;
}
