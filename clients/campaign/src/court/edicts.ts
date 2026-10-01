/**
 * Tasks 87-88: edicts and council. Propose a realm law; every seated
 * councilor votes weighted by influence, with their own lean per law;
 * a majority of weighted votes passes it. Each council seat shows its
 * modifier — the standing bonus the seat grants while filled.
 */

import type { Councilor, CouncilSeat, RealmLaw } from "./types.js";

export const COUNCIL_SEATS: CouncilSeat[] = ["marshal", "steward", "spymaster", "chancellor"];

/** Standing modifier each filled seat grants. */
export const SEAT_MODIFIERS: Record<CouncilSeat, { label: string; effect: string }> = {
  marshal: { label: "Marshal", effect: "Army morale +10%" },
  steward: { label: "Steward", effect: "Tax income +12%" },
  spymaster: { label: "Spymaster", effect: "Scheme discovery +15%" },
  chancellor: { label: "Chancellor", effect: "Diplomacy +10%" },
};

export interface Council {
  seats(): Record<CouncilSeat, Councilor | null>;
  appoint(seat: CouncilSeat, councilor: Omit<Councilor, "seat">): void;
  dismiss(seat: CouncilSeat): void;
  modifiers(): { seat: CouncilSeat; label: string; effect: string; holder: string | null }[];
}

export function createCouncil(): Council {
  const seats = new Map<CouncilSeat, Councilor | null>(
    COUNCIL_SEATS.map((s) => [s, null]),
  );
  return {
    seats: () => Object.fromEntries(seats) as Record<CouncilSeat, Councilor | null>,
    appoint(seat, c) {
      if (c.influence < 0 || c.influence > 100) throw new Error("influence must be 0..100");
      seats.set(seat, { ...c, seat });
    },
    dismiss(seat) {
      seats.set(seat, null);
    },
    modifiers() {
      return COUNCIL_SEATS.map((seat) => ({
        seat,
        label: SEAT_MODIFIERS[seat]!.label,
        effect: SEAT_MODIFIERS[seat]!.effect,
        holder: seats.get(seat)?.name ?? null,
      }));
    },
  };
}

export interface EdictVote {
  councilorId: string;
  inFavor: boolean;
  weight: number;
}

export interface EdictResult {
  law: RealmLaw;
  votes: EdictVote[];
  passed: boolean;
  forWeight: number;
  againstWeight: number;
}

/**
 * Council vote on a law. `leans` maps councilor id -> -1..1 predisposition;
 * the vote is deterministic from lean + influence so tests don't flake.
 * Passed laws are returned for the campaign layer to enact.
 */
export function voteOnEdict(
  law: RealmLaw,
  council: Council,
  leans: Record<string, number>,
): EdictResult {
  const votes: EdictVote[] = [];
  let forWeight = 0;
  let againstWeight = 0;
  for (const seat of COUNCIL_SEATS) {
    const c = council.seats()[seat];
    if (!c) continue;
    const lean = leans[c.id] ?? 0;
    const inFavor = lean + (c.influence - 50) / 200 >= 0;
    votes.push({ councilorId: c.id, inFavor, weight: c.influence });
    if (inFavor) forWeight += c.influence;
    else againstWeight += c.influence;
  }
  if (votes.length === 0) throw new Error("no councilors seated: cannot vote");
  return { law, votes, passed: forWeight > againstWeight, forWeight, againstWeight };
}
