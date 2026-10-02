/**
 * Council voting (Rowan solo task 57).
 *
 * Major decisions go to the council: each councilor votes yes/no/abstain
 * from their stance (deterministic from a seed). A majority decides; a
 * tie goes to the player to break. The record shows every vote.
 */

export type CouncilVote = "yes" | "no" | "abstain";

export interface Councilor {
  id: string;
  name: string;
  /** -1 (opposed) .. 1 (supportive) toward the proposal. */
  stance: number;
}

export interface VoteRecord {
  councilorId: string;
  name: string;
  vote: CouncilVote;
}

export type CouncilResult =
  | { outcome: "passed" | "failed"; votes: VoteRecord[]; tie: false; note: string }
  | { outcome: "tie"; votes: VoteRecord[]; tie: true; note: string };

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function draw(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
}

/** Each councilor votes from their stance; deterministic per proposal seed. */
export function holdVote(proposalId: string, councilors: Councilor[], seed: number): CouncilResult {
  const votes: VoteRecord[] = councilors.map((c) => {
    const roll = draw(hash(`${proposalId}:${c.id}`) ^ (seed >>> 0));
    // Stance shifts the yes-threshold: stance 1 -> yes unless roll > 0.9, etc.
    const yesThreshold = 0.5 + c.stance * 0.4;
    const vote: CouncilVote = roll < 0.1 ? "abstain" : roll < yesThreshold ? "yes" : "no";
    return { councilorId: c.id, name: c.name, vote };
  });
  const yes = votes.filter((v) => v.vote === "yes").length;
  const no = votes.filter((v) => v.vote === "no").length;
  if (yes > no) {
    return { outcome: "passed", votes, tie: false, note: `The council passes the measure ${yes}–${no}.` };
  }
  if (no > yes) {
    return { outcome: "failed", votes, tie: false, note: `The council rejects the measure ${no}–${yes}.` };
  }
  return {
    outcome: "tie",
    votes,
    tie: true,
    note: `The council ties ${yes}–${no}. The decision falls to you.`,
  };
}

export type TieBreak = "pass" | "fail";

/** The player breaks a tie. Throws when the vote was not a tie. */
export function breakTie(result: CouncilResult, choice: TieBreak): Exclude<CouncilResult, { tie: true }> {
  if (!result.tie) throw new Error("there is no tie to break");
  const outcome = choice === "pass" ? "passed" : "failed";
  return {
    outcome,
    votes: result.votes,
    tie: false,
    note: `You break the tie: the measure is ${outcome}.`,
  };
}
