import {
  resolveMelee,
  type AttackDirection,
  type Defense,
} from "../battleflow/meleeManeuvers.js";

/**
 * Assassination approach options (Rowan solo task 67).
 *
 * Three ways to kill a target — poison, duel, ambush — each with
 * different success odds, exposure risk, and cost. Outcomes resolve
 * deterministically from a seed: success, failure, or exposure.
 */

export type AssassinationApproach = "poison" | "duel" | "ambush";

export const ASSASSINATION_APPROACHES: AssassinationApproach[] = ["poison", "duel", "ambush"];

export interface ApproachProfile {
  approach: AssassinationApproach;
  name: string;
  description: string;
  /** 0..1 chance of killing the target. */
  successChance: number;
  /** 0..1 chance of being exposed if the attempt fails. */
  exposureOnFailure: number;
  cost: number;
}

export const APPROACH_PROFILES: Record<AssassinationApproach, ApproachProfile> = {
  poison: {
    approach: "poison",
    name: "Poison",
    description: "Slow and deniable. The target simply never wakes up.",
    successChance: 0.55,
    exposureOnFailure: 0.2,
    cost: 400,
  },
  duel: {
    approach: "duel",
    name: "Duel",
    description: "Face them blade to blade. Honorable — and public.",
    successChance: 0.7,
    exposureOnFailure: 0.8,
    cost: 0,
  },
  ambush: {
    approach: "ambush",
    name: "Ambush",
    description: "A dark alley, a quick knife. Fast, brutal, risky.",
    successChance: 0.8,
    exposureOnFailure: 0.5,
    cost: 150,
  },
};

export type AssassinationOutcome =
  | { result: "success"; approach: AssassinationApproach; line: string }
  | { result: "failed"; approach: AssassinationApproach; exposed: boolean; line: string };

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

/**
 * Attempt an assassination. Skill 0..10 shifts success odds (+3% per
 * point). Deterministic from target + approach + seed.
 */
export function attemptAssassination(
  target: string,
  approach: AssassinationApproach,
  skill: number,
  seed: number,
): AssassinationOutcome {
  const profile = APPROACH_PROFILES[approach];
  if (!profile) throw new Error(`unknown assassination approach: ${approach}`);
  const clamped = Math.max(0, Math.min(10, skill));
  const chance = Math.min(0.95, profile.successChance + clamped * 0.03);
  const roll = draw(hash(`${target}:${approach}`) ^ (seed >>> 0));
  if (roll < chance) {
    return {
      result: "success",
      approach,
      line: `${target} is dead by ${profile.name.toLowerCase()}. None can prove it was you.`,
    };
  }
  const exposed = draw(hash(`${target}:${approach}:exposure`) ^ (seed >>> 0)) < profile.exposureOnFailure;
  return {
    result: "failed",
    approach,
    exposed,
    line: exposed
      ? `The attempt on ${target} failed — and witnesses name you.`
      : `The attempt on ${target} failed, but your hand stayed hidden.`,
  };
}

/**
 * A real duel, fought exchange by exchange with the melee maneuver system.
 * Bannerlord's dueling: feints punish committed blocks, chambers punish
 * predictable attacks. The player attacks each round; the target defends
 * with a simple AI (blocks the most-used direction, sometimes chambers).
 * First to 0 HP loses. Skill 0..10 for both sides.
 */
export interface DuelRound {
  playerAttack: AttackDirection;
  feintFrom?: AttackDirection;
  targetDefense: Defense;
  outcome: string;
  playerHp: number;
  targetHp: number;
}

export interface DuelResult {
  winner: "player" | "target";
  rounds: DuelRound[];
}

export function duel(
  playerSkill: number,
  targetSkill: number,
  seed: number,
  playerPlan: { attack: AttackDirection; feintFrom?: AttackDirection }[],
): DuelResult {
  const rounds: DuelRound[] = [];
  let playerHp = 3;
  let targetHp = 3;
  let round = 0;
  // Target AI: tracks the player's favorite direction, blocks it; chambers
  // when the player repeats the same attack twice.
  const used: AttackDirection[] = [];
  while (playerHp > 0 && targetHp > 0 && round < 20) {
    const plan = playerPlan[round % playerPlan.length]!;
    used.push(plan.attack);
    const counts = new Map<AttackDirection, number>();
    for (const d of used) counts.set(d, (counts.get(d) ?? 0) + 1);
    const favorite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const lastTwo = used.slice(-2);
    const targetDefense: Defense =
      lastTwo.length === 2 && lastTwo[0] === lastTwo[1] && draw(hash(`chamber:${seed}:${round}`)) < 0.3
        ? { kind: "chamber" }
        : { kind: "block", direction: favorite };
    const outcome = resolveMelee(
      {
        attack: plan.attack,
        ...(plan.feintFrom ? { feintFrom: plan.feintFrom } : {}),
        defense: targetDefense,
        attackerSkill: playerSkill,
        defenderSkill: targetSkill,
      },
      () => draw(hash(`duel:${seed}:${round}`)),
    );
    // Player is the attacker; damage goes to the target. On a chamber the
    // target counter-hits the player.
    if (outcome.result === "chambered") playerHp -= 1;
    else if (outcome.result === "hit") targetHp -= outcome.damageMult >= 1.25 ? 2 : 1;
    rounds.push({
      playerAttack: plan.attack,
      ...(plan.feintFrom ? { feintFrom: plan.feintFrom } : {}),
      targetDefense,
      outcome: outcome.detail,
      playerHp,
      targetHp,
    });
    round++;
  }
  return { winner: targetHp <= 0 ? "player" : "target", rounds };
}
