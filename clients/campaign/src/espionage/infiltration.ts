/**
 * Task 100: disguise/infiltration flow. An agent goes in under a cover
 * identity with a detection meter (0..100). Snooping gathers intel but
 * raises suspicion; laying low rebuilds cover. If the meter empties, the
 * cover is blown and a chase starts — outrun it to exfiltrate, get caught
 * and the agent is burned.
 */

export type InfiltrationStatus = "active" | "chase" | "escaped" | "caught";

export interface Infiltration {
  id: string;
  /** Where the agent is operating. */
  post: string;
  /** The cover identity. */
  disguise: string;
  /** Detection meter 0..100. 0 = blown. */
  cover: number;
  intel: number;
  status: InfiltrationStatus;
  /** Chase rounds survived, once blown. */
  chaseRounds: number;
}

let nextOp = 1;

export function startInfiltration(post: string, disguise: string): Infiltration {
  return {
    id: `op-${nextOp++}`,
    post,
    disguise,
    cover: 100,
    intel: 0,
    status: "active",
    chaseRounds: 0,
  };
}

/** Lay low: rebuild cover, no intel. */
export function layLow(op: Infiltration): Infiltration {
  if (op.status !== "active") return op;
  return { ...op, cover: Math.min(100, op.cover + 25) };
}

/** Snoop: gather intel, but suspicion rises. Blowing cover starts the chase. */
export function snoop(op: Infiltration, heat: number): Infiltration {
  if (op.status !== "active") return op;
  const cover = Math.max(0, op.cover - Math.max(5, heat));
  if (cover <= 0) {
    return { ...op, cover: 0, status: "chase", chaseRounds: 0 };
  }
  return { ...op, cover, intel: op.intel + 1 };
}

/**
 * Run from a chase. `roll` 0..1 vs the escape odds; two successful rounds
 * exfiltrate the agent, a failed round burns them.
 */
export function runChase(op: Infiltration, roll: () => number): Infiltration {
  if (op.status !== "chase") return op;
  const rounds = op.chaseRounds + 1;
  if (roll() < 0.55) {
    return rounds >= 2 ? { ...op, status: "escaped", chaseRounds: rounds } : { ...op, chaseRounds: rounds };
  }
  return { ...op, status: "caught", chaseRounds: rounds };
}

/** Slip out quietly while still under cover. */
export function exfiltrate(op: Infiltration): Infiltration {
  if (op.status !== "active") return op;
  return { ...op, status: "escaped" };
}
