/**
 * Court & politics (MASTER_PLAN 3B, tasks 85-93): court events feed, feasts,
 * edicts and council, petitions, trials, faction relation matrix, war
 * council, and peace treaties.
 *
 * Data-level domain logic plus DOM where the plan demands UI. Enforcing
 * outcomes in the world (loyalty changes, treaty borders, war declarations)
 * is the campaign/sim layer's job — this module produces the decisions.
 */

export type CourtEventKind = "feast" | "trial" | "petition" | "edict" | "war" | "treaty" | "info";

export interface CourtEvent {
  id: string;
  kind: CourtEventKind;
  title: string;
  text: string;
  /** Season/day stamp for the feed. */
  stamp: string;
  read: boolean;
}

export interface Councilor {
  id: string;
  name: string;
  seat: CouncilSeat;
  influence: number; // 0..100, weights their vote
}

export type CouncilSeat = "marshal" | "steward" | "spymaster" | "chancellor";

export interface RealmLaw {
  id: string;
  name: string;
  description: string;
  /** Effect summary shown when it passes. */
  effect: string;
  proposedBy: string;
}

export type PetitionKind =
  | "grain-shortage"
  | "bandit-raids"
  | "tax-dispute"
  | "land-claim"
  | "guild-charter"
  | "marriage-blessing"
  | "plague-fear"
  | "bridge-repair"
  | "desertion-pardon"
  | "well-poisoning"
  | "market-rights"
  | "orphan-care";

export interface Petition {
  id: string;
  kind: PetitionKind;
  petitioner: string;
  text: string;
}

export interface PetitionResolution {
  rep: number;
  gold: number;
  text: string;
}

export interface TrialCase {
  id: string;
  title: string;
  plaintiff: string;
  defendant: string;
  description: string;
}

export type Verdict = "for-plaintiff" | "for-defendant" | "compromise";

export interface FactionStanding {
  factionId: string;
  name: string;
  /** -100..100 vs every other faction, keyed by faction id. */
  vs: Record<string, number>;
}

export interface WarPlan {
  id: string;
  target: string;
  reason: string;
}

export interface VassalVote {
  vassalId: string;
  name: string;
  inFavor: boolean;
  weight: number;
}

export interface TreatyTerms {
  parties: [string, string];
  reparations: number;
  borderConcessions: string[];
  durationSeasons: number;
  prisonerExchange: boolean;
}
