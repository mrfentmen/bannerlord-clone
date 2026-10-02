/**
 * Simulation state as the client consumes it. Contract B, proposed.
 *
 * Field names follow `CAUSE_EFFECT.md` sections 2 and 8 and `SPEC.md` section 3, so
 * the mapping is checkable against the design docs. Agent 2's export is authoritative;
 * the boundary itself is `SimulationProvider` at the bottom of this file and
 * `HttpSimulationProvider` in `src/data/provider.ts`.
 *
 * Nothing in this file is invented by the client. Every value here arrives from the
 * provider. The client computes no balances, prices or rates of its own — that would
 * be a second, competing simulation, which is the one thing this client must not be.
 *
 * These types are the shape the client *requires*, not a promise about what any server
 * will send. An HTTP response is untrusted, so `src/data/provider.ts` checks the fields
 * the client dereferences before casting to these types, and refuses the payload with
 * a readable sentence if they are not there.
 */

import type { TownClassName } from "../design/tokens.js";

/** The four core resources of ECONOMY.md section 1, plus medicine from CAUSE_EFFECT.md §2. */
export type ResourceId = "money" | "gold" | "food" | "metal" | "medicine";

export interface Resources {
  money: number;
  gold: number;
  food: number;
  metal: number;
  medicine: number;
}

/** The player's hold. Negative means a debt against that resource. */
export interface LedgerLine {
  id: string;
  label: string;
  resource: ResourceId;
  amount: number;
  /** Signed daily change, so the UI can show direction without another request. */
  perDay: number;
  /** The cause-log id of the write that produced this line, so it is explainable. */
  causedBy?: string;
}

export interface Ledger {
  /** In-game day the ledger closes on. */
  day: number;
  income: LedgerLine[];
  expenses: LedgerLine[];
  /** Net per day per resource, after everything. */
  netPerDay: Partial<Record<ResourceId, number>>;
}

/** A warning raised before a resource hits zero (ECONOMY.md section 10). */
export interface ResourceWarning {
  id: string;
  resource: ResourceId;
  severity: "critical" | "warning";
  headline: string;
  detail: string;
  /** Days until the resource runs out, or `null` when it is already at zero. */
  daysRemaining: number | null;
  /** The field to open the Why panel on. */
  entityId: string;
  field: string;
}

/** Town state, from `CAUSE_EFFECT.md` section 2 plus section 8. */
export interface TownState {
  id: string;
  settlementId: string;
  name: string;
  klass: TownClassName;
  holderId: string | null;
  holderName: string;

  population: number | null;
  workers: number;
  foodStock: number;
  /** Person-days per tick. */
  foodProduction: number;
  foodDemand: number;
  medicineStock: number;
  sanitation: number;
  infected: number;
  crowding: number;
  unrest: number;
  loyalty: number;
  prosperity: number;
  taxRate: number;
  garrison: number;
  garrisonConduct: number;
  roadSafety: number;
  informationTrust: number;

  money: number;
  gold: number;
  metal: number;

  /** The last tick this town changed, so the UI can show staleness honestly. */
  updatedTick: number;
  /**
   * Whether the player's side has this town in sight right now.
   *
   * From `FogState`, and per town rather than only in the three lists, so a caller that
   * already holds a `TownState` does not have to go back to the snapshot to ask whether
   * the town is being watched. The map reads `FogState` instead, because that block
   * states the three states explicitly and this flag pair cannot express the third.
   */
  visible: boolean;
  /** Whether the player's side has ever had this town in sight. Never cleared. */
  known: boolean;
  /**
   * Tick when any side last had this town in view, or 0 or less when nobody ever has.
   *
   * In the same unit as `FogState.tick`, which is the only clock in that unit anywhere on
   * the wire — `SimSnapshot.day` is `Tick % 365` and wraps every year, so a subtraction
   * against it is wrong twice a year and wrong silently. The never-seen sentinel is
   * written here as "0 or less" rather than as a single number because the two producers
   * do not agree on it: the simulation's field registry defaults to -1 (`model/fields.go`
   * `last_seen_tick`) and the fixture uses 0. Read it with `townAge`, which treats
   * anything at or below zero as never.
   */
  lastSeenTick: number;
  /**
   * Who can be hired here. The simulation is the authority on what a town offers:
   * the client renders the list and sends the order, nothing more.
   */
  recruitable: RecruitableUnit[];
}

// -- fog of war ----------------------------------------------------------------
//
// Fog is the simulation's, not the client's. `services/simulation/internal/systems/
// visibility/visibility.go` decides the answer — a side sees a town when one of its
// parties is close enough to have spotted it — and publishes two masks per town and two
// counts per side. The apiserver's `buildFog` in `cmd/apiserver/snapshot.go` renders that
// into the `fog` block below. The client draws what it is told and computes no radius,
// no distance and no sight line of its own: a client that measured visibility itself
// would be a second visibility system, and a raid would be visible to the player before
// the attacker left, which is the whole thing fog exists to prevent.

/**
 * The three states a town can be in for the side this snapshot is written from.
 *
 * The middle one is the reason this is a type and not a boolean. A town out of sight but
 * remembered is neither known nor unknown: the side knows it is there and does not know
 * what is happening in it, and collapsing the two either hides a town the player has
 * already found or shows them a place they have never been.
 */
export type TownVisibility = "visible" | "remembered" | "unseen";

/**
 * What this side can see, and what it has ever found.
 *
 * Every number here is the simulation's. `sideId` is the side the rest of the block is
 * stated against, and it is `null` when the snapshot has no player to state it from —
 * which is a different answer from "this side sees nothing", and the two are kept apart
 * so the map is not emptied by a session that simply has no vantage point.
 *
 * The three id lists are explicit rather than left to subtraction. "Never found" is the
 * complement of two other lists, and a client that derived it by set difference would get
 * it wrong the first time a town was added or removed between snapshots, and the failure
 * would be a town wrongly shown rather than a town wrongly hidden.
 */
export interface FogState {
  /** The side these lists are relative to. `null` when there is no player vantage point. */
  sideId: string | null;
  /** The configured sight radius, in the unit the player reads. */
  sightRadiusKm: number;
  /** The same radius in the map's own unit, so the client need not convert it. */
  sightRadiusLeagues: number;
  /**
   * How long a sighting keeps counting as seen. A town leaves `visibleTowns` when the
   * window closes but stays in `knownTowns` forever, which is what the two lists are for.
   */
  sightingMemoryDays: number;
  /** Town ids in sight now, widened by the sighting memory. */
  visibleTowns: string[];
  /** Town ids this side has ever had in sight. Never shrinks. */
  knownTowns: string[];
  /** Town ids this side has never found. Stated, not derived. */
  unseenTowns: string[];
  /**
   * The simulation tick this block is stated at, in the same unit as every value in
   * `lastSeen`. `null` when the server has not published one.
   *
   * Sent because the client has no other clock in this unit and is not allowed to invent
   * one. `day` is `Tick % 365` and wraps; `TickUpdate.tick` counts frames the server has
   * pushed since it started. Without a tick in the fog block there is nothing to subtract
   * a last-seen tick from, which is why `lastSeenTick` sat on `TownState` unread for as
   * long as it did: there was no honest way to turn it into an age.
   *
   * Optional for the same reason the whole block is: a simulation that does not publish a
   * clock is one whose towns have no stated age, and that must read as "unknown" rather
   * than as "seen right now".
   */
  tick?: number | null;
  /**
   * When each known town was last in a side's sight, keyed by town id. Absent or missing
   * an entry means never seen.
   *
   * Absent rather than set to a sentinel for one reason: the simulation's own never-seen
   * value is -1 and this client's is 0, and a block that had to carry a magic number would
   * be carrying the disagreement instead of settling it. An entry that is missing has one
   * meaning.
   *
   * This is the block-level twin of `TownState.lastSeenTick` and exists because the tick
   * frame carries fog but not towns: without it, a town the party has just walked past
   * would grey out one tick after its state changed, because the age would still be
   * reading the snapshot's copy.
   */
  lastSeen?: Record<string, number>;
  counts: FogCounts;
}

/**
 * How many towns are in each of the three states.
 *
 * The three are nullable for one reason: with no vantage point the answer is "nobody is
 * looking", not "there are none". `total` is always a number, because the number of
 * towns in the world does not depend on whether anyone is watching them.
 */
export interface FogCounts {
  visible: number | null;
  known: number | null;
  unseen: number | null;
  total: number;
}

/** One kind of soldier a town can raise, as the simulation describes it. */
export interface RecruitableUnit {
  unitId: string;
  name: string;
  /** 0 to 5, same scale as TroopStack.quality. */
  quality: number;
  /** Money per day per soldier, added to the wage bill on hire. */
  wage: number;
  /** One-time hiring bonus per soldier, taken from the purse on hire. */
  hireCost: number;
  /** How many are willing to sign on here right now. */
  available: number;
  /** One line on what they are, in the product's voice. */
  blurb: string;
}

export interface RecruitRequest {
  partyId: string;
  townId: string;
  unitId: string;
  quantity: number;
  /** The day the player is looking at, so a stale roster cannot be hired against. */
  expectedDay: number;
}

export interface RecruitResult {
  accepted: boolean;
  unitName: string;
  quantity: number;
  /** The hiring bonus paid, in whole money. */
  totalCost: number;
  /** Soldiers of this unit in the party after the hire. */
  newCount: number;
  /** Why the hire failed, in the product's voice, when `accepted` is false. */
  reason?: string;
  causedBy: string;
}

export interface MarketGood {
  goodId: GoodId;
  name: string;
  /** Current price. Simulation output; the client never computes one. */
  price: number;
  /** Most recent previous price, for the trend arrow. */
  previousPrice: number | null;
  /** Rolling history, oldest first. Powers the sparkline and price history. */
  history: { day: number; price: number }[];
  stock: number;
  demand: number;
}

export interface MarketState {
  townId: string;
  goods: MarketGood[];
}

export type PartyRole = "quartermaster" | "scout" | "surgeon" | "engineer";

export interface TroopStack {
  id: string;
  name: string;
  count: number;
  /** 0 to 5, per `RULERS.md` and the troop quality rules in `MARCH_AND_WAR.md` §5. */
  quality: number;
  /** Money per day per soldier. */
  wage: number;
  morale: number;
}

/**
 * A prisoner held by a party or by a lord. `COMBAT.md` §6 and the Prisoner system:
 * `prisoners` and `prisoner_days` in `services/simulation/internal/model/fields.go`
 * are the same two fields, so this is the client's view of a real one and not a new
 * idea.
 *
 * `daysHeld` is the clock the Prisoner system reads, so it decides what a ransom is
 * worth. The client prints it and never prices from it.
 */
export interface PrisonerStack {
  unitId: string;
  name: string;
  count: number;
  /** 0 to 5, the same scale as `TroopStack.quality`. */
  quality: number;
  /** Days this stack has been in hand. Zero on the day they were taken. */
  daysHeld: number;
}

export interface PartyState {
  id: string;
  name: string;
  leaderName: string;
  factionId: string;
  position: { x: number; z: number };
  destination: { settlementId: string; name: string } | null;
  route: { x: number; z: number }[];
  /** Day the march started. `null` when stationary. */
  marchingSinceDay: number | null;

  food: number;
  medicine: number;
  metal: number;
  money: number;
  morale: number;
  fatigue: number;
  wagesOwed: number;
  speedKmPerDay: number;

  troops: TroopStack[];
  prisoners: PrisonerStack[];
  roles: Partial<Record<PartyRole, string>>;
  goods: { goodId: string; name: string; quantity: number; avgPaid: number }[];
}

/** The tradeable goods of ECONOMY.md, named so the market is legible. */
export const GOODS = [
  { id: "grain", name: "Grain" },
  { id: "medicine", name: "Medicine" },
  { id: "metal", name: "Metal" },
  { id: "fuel", name: "Fuel" },
  { id: "arms", name: "Arms" },
  { id: "textiles", name: "Textiles" },
  { id: "tools", name: "Tools" },
  { id: "lumber", name: "Lumber" },
] as const;

export type GoodId = (typeof GOODS)[number]["id"];

/**
 * A place the player can march to, built from the real world data the client loaded.
 * `distanceHint` is shown next to the name so the list is readable before pricing.
 */
export interface SettlementOption {
  /** The client's id, used to draw the route and pick the map pin. */
  id: string;
  /**
   * The simulation's id for the same place, used in orders. See SettlementIndex.
   * `null` when the simulation is not running a town for it, in which case no order
   * can be sent for it and the planner must say so rather than send something wrong.
   */
  simulationId: string | null;
  name: string;
  /** How far the party is now, in kilometres, for the picker label. */
  distanceKm: number;
  distanceHint: string;
  klass: "city" | "town" | "village";
}

/** A side from FACTIONS.md. Ratings are computed from real data, never hand-typed. */
export interface SideRatings {
  money: number;
  gold: number;
  food: number;
  metal: number;
  population: number;
}

export interface SideState {
  id: string;
  name: string;
  ratings: SideRatings;
  /** FACTIONS.md section 3 difficulty column, as written there. */
  difficulty: "Easy to Medium" | "Medium" | "Hard";
  pros: string[];
  cons: string[];
  /** FACTIONS.md section 7: the plain-language line about what this side is bad at. */
  biggestDanger: string;
  signatureMechanic: string;
  memberStates: string[];
  /** State profiles computed from real data, per FACTIONS.md section 5. */
  states: StateProfile[];
}

export interface StateProfile {
  code: string;
  name: string;
  population: number | null;
  /** Ratings 1 to 5, computed from real data. */
  money: number;
  gold: number;
  food: number;
  metal: number;
  /** Why this state scores what it does, in one line, for the selection screen. */
  summary: string;
}

export type StartingRole = "ruler-in-waiting" | "mercenary-captain" | "wanderer";

export interface StartingRoleInfo {
  id: StartingRole;
  name: string;
  description: string;
  /** What the player starts holding, in the product's own words. */
  startsWith: string;
}

export interface RulerTraits {
  valor: number;
  mercy: number;
  honor: number;
  generosity: number;
  calculation: number;
}

export interface RulerState {
  id: string;
  name: string;
  factionId: string;
  factionName: string;
  /** `RULERS.md` section 2 tiers. */
  tier: "side-leader" | "state-governor" | "city-ruler" | "lord" | "local-warlord" | "mercenary-captain";
  age: number;
  traits: RulerTraits;
  ambitions: string[];
  holdings: { settlementId: string; name: string }[];
  garrison: number;
  /** Prisoners in this lord's own keeping, which is what makes bartering for them real. */
  prisoners: PrisonerStack[];
  wealth: Resources;
  loyaltyToLeader: number;
  influence: number;
  renown: number;
  /** Relation to the player, -100 to 100. */
  relationToPlayer: number;
  recentEvents: { day: number; text: string; causedBy?: string }[];
}

/** March planner preview. `MARCH_AND_WAR.md` section 11. */
export interface MarchRequest {
  partyId: string;
  destinationSettlementId: string;
  /** Leave now, or hold until resources recover. */
  departure: "now" | "hold";
}

export interface MarchPlan {
  partyId: string;
  destinationSettlementId: string;
  destinationName: string;
  /** The route the planner intends to take, for drawing on the map. */
  route: { x: number; z: number }[];
  distanceKm: number;
  days: number;
  arrivalDay: number;
  cost: {
    food: number;
    money: number;
    metal: number;
  };
  /** Days of food left on arrival, or `null` when the plan runs out before it gets there. */
  daysOfFoodOnArrival: number | null;
  /** Road danger along the route, 0 safe to 1 lethal. */
  roadDanger: number;
  warnings: string[];
  /** Any leg the planner has no surveyed road for. */
  unmapped: boolean;
}

export interface TradeRequest {
  partyId: string;
  townId: string;
  goodId: GoodId;
  side: "buy" | "sell";
  quantity: number;
  /** The day the player is looking at, so a stale price cannot be bought against. */
  expectedDay: number;
}

export interface TradeResult {
  accepted: boolean;
  side: "buy" | "sell";
  goodName?: string;
  unitPrice: number;
  quantity: number;
  total: number;
  /** New quantity in the party's hold after the trade. */
  partyQuantity: number;
  /** The market price after the trade, which moves because the trade happened. */
  marketPriceAfter: number;
  /** Why the trade failed, in the product's voice, when `accepted` is false. */
  reason?: string;
  causedBy: string;
}

// -- barter -------------------------------------------------------------------
//
// Barter is not trading at a price. It is two tables, one item against another, with no
// money moving at all, and the only question worth asking is whether the two sides are
// worth the same to each other. `docs/missing-vs-bannerlord.md` row 7.11 records the
// screen as missing, so the shape below is proposed rather than observed.
//
// The split the screen needs is the same split the market panel needs: **what each side
// holds** and **what the simulation calls it worth**. Both come from the simulation, in
// one read (`barterTerms`), because a valuation the client produced would be a second
// economy. What the client does with them is arithmetic a player can check — two sums
// and a subtraction — and the decision on whether to deal is never the client's: it is
// `proposeBarter` answering, in words.

/** The three kinds of thing that can go on a barter table. */
export type BarterItemKind = "good" | "gold" | "prisoner";

/**
 * One line of a barter table.
 *
 * `available` is the simulation's count of what that side holds, not the client's, and
 * `unitValue` is what the simulation calls one unit worth at this town. A lord pays less
 * for goods than the market asks and sells for more, and that spread is theirs to set:
 * `ECONOMY.md` §5 puts the gold rate and the ransom terms on the simulation's side of
 * the line, and the client never invents one.
 */
export interface BarterItem {
  kind: BarterItemKind;
  /** A `GoodId` for goods, `gold` for coin, the prisoner unit id for prisoners. */
  itemId: string;
  name: string;
  /** How many this side can put on the table right now. */
  available: number;
  /** What the simulation calls one unit worth here, in money. */
  unitValue: number;
}

/**
 * Both tables, priced, at one place and one moment.
 *
 * `day` is stamped so a table that went stale while the player was filling it in cannot
 * be traded against without the simulation noticing, the same guard `expectedDay` gives
 * a market order.
 */
export interface BarterTerms {
  townId: string;
  traderId: string;
  traderName: string;
  /** What the trader can put on the table. */
  traderItems: BarterItem[];
  /** What the trader holds of the player's things, and what they call them worth. */
  playerItems: BarterItem[];
  /** Standing with this trader, -100 to 100, per `RULERS.md` §2. */
  relationToPlayer: number;
  /** The day these terms were struck. */
  day: number;
}

/** One line the player has put down, or asked for. */
export interface BarterLine {
  kind: BarterItemKind;
  itemId: string;
  quantity: number;
}

export interface BarterProposalRequest {
  partyId: string;
  traderId: string;
  townId: string;
  /** What the player puts down. */
  offered: BarterLine[];
  /** What the player asks for. */
  asked: BarterLine[];
  /** The day the player is looking at, so a stale table cannot be dealt against. */
  expectedDay: number;
}

/**
 * The trader's answer to a proposed deal, before anything has moved.
 *
 * `verdict` is the trader's own sentence and `reason` is why they said no. Both are
 * written by the simulation in the product's voice, and both are shown verbatim: a
 * refusal with a reason is an answer, and "short by $40" is a number the player can
 * act on, where "not a fair trade" is not.
 */
export interface BarterProposal {
  accepted: boolean;
  /** The simulation's valuation of the whole of the player's offer, in money. */
  playerValue: number;
  /** The simulation's valuation of the whole of what the player is asking for. */
  traderValue: number;
  /** What the trader makes of the deal, in their own words. */
  verdict: string;
  /** Why the deal was refused, when `accepted` is false. */
  reason?: string;
  /** What the offer is short by, in money, when refused. */
  shortBy?: number;
  causedBy: string;
}

/** A deal struck: the proposal, and the tables as the simulation now holds them. */
export interface BarterResult extends BarterProposal {
  /** The day the deal was struck. */
  day: number;
  playerItems: BarterItem[];
  traderItems: BarterItem[];
  /** Money on each side after the deal. Barter moves none; these are for the ledger. */
  playerMoney: number;
  traderMoney: number;
}

// -- issues -------------------------------------------------------------------
//
// An issue is one outstanding request from one notable, and the unit the player accepts
// and completes. `QUESTS_AND_NOTABLES.md` sections 3 to 7 describe it, and the simulation
// owns it: the notable's situation, the trigger that produced the request, the reward
// scale, and whether the objective has actually been met.
//
// The split below is the same split the barter screen uses. **The client reads the state
// and writes nothing it could have decided for itself.** Every sentence the panel shows —
// what the request wants, why it was made, what serving it is worth, why a completion was
// refused — is written by the simulation and shown verbatim. A client that phrased its own
// "you have delivered enough" sentence would be a second issue system, and a player could
// never tell which one it was reading.
//
// Two fields earn their place by being the two things the simulation knows and the client
// cannot invent: `progress`, recomputed from world state every tick rather than declared
// by the player, and `requirement.met`, read off the world at the moment the request was
// read. Reporting an issue complete is an order, not a fact: whether the goods arrived or
// the hideout came down is settled in the simulation, and an unsupported claim is refused.

// The three kinds of issue the simulation generates. Deliberately different in kind and
// not only in scale: one moves goods, one fights, one travels, and each therefore has its
// own trigger, its own measure of progress, and its own effects on the world.
export type IssueKind = "deliver-goods" | "clear-hideout" | "escort";

// Where an issue is in its life. There are four states and no others: an offer that is
// never accepted lapses on its own, and "abandoned" is not a state but a reason recorded
// against `failed` in the step log, because whether a taker walked away or ran out of
// time is a fact about the step log and not about the issue.
export type IssueState = "offered" | "accepted" | "succeeded" | "failed";

/** One recorded moment of an issue's life, the per-issue log `QUESTS_AND_NOTABLES.md` §3 asks for. */
export interface IssueStep {
  day: number;
  /** The plain-language step, written by the simulation. Shown verbatim. */
  text: string;
  /** The state this step produced. */
  state: IssueState;
}

/**
 * A non-ruler person who holds local power: the one who can notice that a town has three
 * days of food left and can therefore ask for help, and whose opinion of the player moves
 * when that help does or does not arrive.
 */
export interface Notable {
  id: string;
  name: string;
  /** `mayor`, `headman`, `gang boss` and the rest, as the simulation names the role. */
  role: string;
  /** The settlement this person belongs to. A notable is attached to exactly one. */
  settlementId: string;
  settlementName: string;
  /** How much this person sways their settlement, 0 to 1. */
  power: number;
  /** This person's opinion of the player, -100 to 100, on the `RULERS.md` §2 scale. */
  relationToPlayer: number;
  /** How many issues this person currently has outstanding, an offer or accepted alike. */
  openIssues: number;
  /** How aggrieved this person is at the moment, 0 to 1. */
  grievance: number;
}

/**
 * What the request asks for, in the simulation's own words.
 *
 * `text` is the whole requirement and it is written by the simulation because only the
 * simulation knows the objective: a delivery is a larder reading against the baseline
 * captured on the day it was accepted, an escort is a road's safety *and* the raiders on
 * it. The numbers behind it come along so the panel can show progress, and `met` is the
 * simulation's own reading of whether the objective holds right now.
 */
export interface IssueRequirement {
  /** The requirement in a full sentence, written by the simulation. Shown verbatim. */
  text: string;
  /** The settlement the objective concerns, or `null` where the objective has no second place. */
  targetName: string | null;
  /** What there is at stake in the issue's own unit: sacks, riders, person-days. */
  amount: number;
  /**
   * The world reading captured when the issue was accepted.
   *
   * Progress is measured against this, and it is sent because "the larder stood at 300 and
   * must reach 700" only means something with both figures on screen. `null` where the
   * objective has no baseline.
   */
  baseline: number | null;
  /** The unit `amount` and `baseline` are counted in, written out for the panel. */
  unit: string;
  /** Whether the simulation currently reads the objective as met. */
  met: boolean;
}

/**
 * What serving this issue is worth.
 *
 * Priced at offer time by the simulation, from the notable's own power, so a large
 * shortage asked by someone who matters pays more than a small one asked by someone who
 * does not. All four are the simulation's figures. `relation` is how far the notable's
 * opinion of the taker moves, and it is the reward the player cannot spend.
 */
export interface IssueReward {
  money: number;
  gold: number;
  renown: number;
  relation: number;
}

/**
 * One outstanding request, and the unit the player accepts and completes.
 *
 * `state` is the field to branch on and nothing else should be: the buttons, the deadline
 * countdown and the progress gauge all read it, so there is one place in this client where
 * the life of an issue is decided and every other place is drawing the consequence.
 */
export interface Issue {
  id: string;
  kind: IssueKind;
  state: IssueState;
  /** Who asked. Every effect is written against this person, so an ignored request has an author. */
  notable: Notable;
  /** The settlement asking. */
  settlementId: string;
  settlementName: string;
  /** What the request wants. */
  requirement: IssueRequirement;
  /** How far the objective is met, 0 to 1. Recomputed by the simulation every tick. */
  progress: number;
  /** The day the notice runs out, and how many days of notice were given. */
  deadlineDay: number;
  deadlineDays: number;
  /** The day the issue was accepted, or `null` while it is still an offer. */
  startedDay: number | null;
  reward: IssueReward;
  /**
   * What walking away costs, in the notable's opinion of the player.
   *
   * Shown before the abandon button rather than after it. A panel that only mentioned the
   * penalty in the refusal would be telling the player what it costs to find out what it
   * costs.
   */
  abandonPenalty: number;
  /** The per-issue log of what happened and when. */
  steps: IssueStep[];
}

/**
 * Everything the quest panel needs in one read: the requests this party can act on, and
 * the people who made them.
 *
 * One read rather than two because the two cannot disagree: an issue and its author are
 * one fact about the world, and a panel that read them separately could show a request
 * from somebody it had already drawn a different opinion of. `day` is stamped for the same
 * reason `BarterTerms` carries one — so an order sent against a stale board is refused
 * rather than silently applied to a request that has since lapsed.
 *
 * Keyed by the party rather than by the ruler who owns the issues, because the party id is
 * the one entity identifier in the snapshot the client is certain about: `player.partyId`
 * is in every snapshot, while the leader behind it is a question the simulation answers.
 * Resolving party to leader is the simulation's indirection to own, not the client's.
 */
export interface IssueBoard {
  /** The party this quest log belongs to. */
  partyId: string;
  day: number;
  /** Offered and accepted, and recently resolved ones, all in the simulation's order. */
  issues: Issue[];
}

/** The three things a player can do to an issue. */
export type IssueAction = "accept" | "complete" | "abandon";

/** One order against one issue. */
export interface IssueActionRequest {
  partyId: string;
  issueId: string;
  /**
   * The day the player is looking at, so a request that has since lapsed cannot be taken
   * up against a board the player was looking at three days ago.
   */
  expectedDay: number;
}

/**
 * What the simulation did with an order, in words.
 *
 * `accepted` is false whenever the simulation refused, and `reason` then says why in the
 * simulation's own sentence — an offer taken by somebody else, a notice that ran out, or a
 * claim of completion the world does not support. Both are shown in full, because both name
 * the number the player can go and fix.
 *
 * `issue` is the request as the simulation now holds it, which replaces the one on screen.
 * A panel that kept drawing the copy it started with after the world moved on would be a
 * panel reporting a state that does not exist.
 */
export interface IssueActionResult {
  issueId: string;
  action: IssueAction;
  accepted: boolean;
  /** What the simulation makes of the order, in its own words. */
  verdict: string;
  /** Why it was refused, when `accepted` is false. */
  reason?: string;
  /** What was actually paid, when an action settled the issue. Absent on a refusal. */
  paid?: IssueReward;
  /** The issue as the simulation now holds it. */
  issue: Issue;
  causedBy: string;
}

// -- rumours -------------------------------------------------------------------

/**
 * The goods the rumour feed prices, in the simulation's own keys.
 *
 * The simulation scans three, and it says `food` where the rest of this client says
 * `grain`: `GOODS` names the good `grain`, the market panel's first row is grain, and the
 * top bar prints "Grain". The panel translates rather than printing the raw key beside a
 * different word for the same goods, and `Text` — the simulation's own sentence — is
 * printed as written, `food` and all.
 *
 * A closed set, because the panel has a word for each of these and no word at all for a
 * fourth. A good it cannot name is refused at the boundary rather than drawn as a key.
 */
export type RumourGood = "food" | "medicine" | "metal";

/**
 * One trade tip: a good, the town it is cheapest in, the town it is dearest in, and what
 * the difference is worth per unit.
 *
 * `margin` is the simulation's own subtraction of its own two prices, and the panel prints
 * it as sent rather than working it out again. `buyTownId` and `sellTownId` are the
 * simulation's integer town ids; the rest of this client keys towns by string, so the panel
 * shows the two names and does not pretend it can open either town from a number.
 */
export interface Rumour {
  good: RumourGood;
  buyTown: string;
  buyTownId: number;
  buyPrice: number;
  sellTown: string;
  sellTownId: number;
  sellPrice: number;
  margin: number;
  /** The tip in a full sentence, written by the simulation. Shown verbatim. */
  text: string;
}

/**
 * One row of the cause log, `CAUSE_EFFECT.md` section 4.
 *
 * `causedBy` is what makes the Why panel a chain walk rather than a list. Each row
 * points at the rows that produced it.
 */
export interface CauseRow {
  id: string;
  tick: number;
  day: number;
  entityId: string;
  entityName: string;
  field: string;
  old: number;
  new: number;
  /** The system that wrote it. CONSTITUTION.md section 2: systems never call each other. */
  system: string;
  /** Prior cause ids. A chain is a walk of these. */
  causedBy: string[];
  /** A plain sentence for the player, generated by the simulation, not by the client. */
  summary: string;
}

export interface WhyChain {
  entityId: string;
  field: string;
  /** The observable result, first. Then its causes, then theirs. */
  rows: CauseRow[];
  /** Rows that were not linked by `causedBy` and are shown as related context. */
  related: CauseRow[];
  /** How many rows the simulation actually holds, before any truncation. */
  totalDepth: number;
  truncated: boolean;
}

export interface SimSnapshot {
  /** In-game clock. */
  day: number;
  year: number;
  /** `ERA.md` tier 1 to 4. */
  eraTier: 1 | 2 | 3 | 4;
  /** The player's hold, the top bar. */
  player: {
    partyId: string;
    characterName: string;
    factionId: string;
    resources: Resources;
    influence: number;
    renown: number;
  };
  party: PartyState;
  towns: TownState[];
  /**
   * Fog of war for the side this snapshot is written from. See `FogState`.
   *
   * Optional because the client must not treat its absence as an empty world. A
   * simulation that has not published visibility yet is not a simulation in which every
   * town is unknown, and drawing a blank map on that reading would be the single worst
   * thing this client could do with a missing field. So the map is drawn whole and the
   * data-source panel says that visibility is not being published, which is what is
   * actually true.
   */
  fog?: FogState;
  markets: Record<string, MarketState>;
  sides: SideState[];
  rulers: RulerState[];
  ledger: Ledger;
  warnings: ResourceWarning[];
  notifications: Notification[];
  /** Every cause row the client may walk, keyed by id. */
  causeLog: Record<string, CauseRow>;
}

export interface Notification {
  id: string;
  day: number;
  priority: "critical" | "important" | "informational";
  text: string;
  entityId: string | null;
  field: string | null;
  /** Cause-log id, so a notification opens straight into the Why panel. */
  causedBy?: string;
}

export interface TickUpdate {
  tick: number;
  day: number;
  /** Sparse deltas. Absent keys mean unchanged, so a tick frame stays small. */
  towns?: Record<string, Partial<TownState>>;
  markets?: Record<string, Partial<MarketState>>;
  party?: Partial<PartyState>;
  player?: Partial<SimSnapshot["player"]>;
  ledger?: Ledger;
  warnings?: ResourceWarning[];
  notifications?: Notification[];
  causeRows?: CauseRow[];
  /**
   * The frame's fog block, a *complete* one. See `FogState`.
   *
   * Optional, because a frame from a server that has not been rebuilt may carry none, and
   * the merge falls back to the last full snapshot rather than dropping fog. Complete
   * rather than sparse: every other key here means "absent means unchanged", and a fog
   * block with ten fields where a partial read would have to know which of them this
   * particular frame carried is a block that can be half-applied without error.
   *
   * This is what makes the map move with the party. The apiserver rebuilds the block per
   * frame (`cmd/apiserver/ws.go` `broadcastTick`) from the same `fogViewFor` the snapshot
   * uses, so a town greys out on the tick it leaves sight instead of on the next full
   * snapshot read — and because the block carries `FogState.tick` and `lastSeen`, it
   * carries the ages with it.
   */
  fog?: FogState;
}

/** The full read and write surface the client needs from the simulation. */
export interface SimulationProvider {
  readonly kind: "http" | "fixture";
  /** Shown in the data-source panel so the player knows what they are looking at. */
  readonly label: string;
  getSnapshot(): Promise<SimSnapshot>;
  trade(request: TradeRequest): Promise<TradeResult>;
  recruit(request: RecruitRequest): Promise<RecruitResult>;
  /** Both tables, priced, for one trader at one town. */
  barterTerms(traderId: string, townId: string): Promise<BarterTerms>;
  /** Ask the trader whether they would deal. Moves nothing. */
  proposeBarter(request: BarterProposalRequest): Promise<BarterProposal>;
  /** Strike a deal the trader has already agreed to. Moves goods, gold and prisoners. */
  commitBarter(request: BarterProposalRequest): Promise<BarterResult>;
  /** This party's quest log: every live request, with the notable who made each one. */
  issueBoard(partyId: string): Promise<IssueBoard>;
  /** Take an outstanding request. The simulation decides whether it can be taken. */
  acceptIssue(request: IssueActionRequest): Promise<IssueActionResult>;
  /**
   * Report an accepted request as finished.
   *
   * An order, never a guarantee: the simulation reads the world and finds out whether the
   * goods arrived or the hideout came down, and an unsupported claim is refused rather than
   * paid.
   */
  completeIssue(request: IssueActionRequest): Promise<IssueActionResult>;
  /** Give up an accepted request, and pay the notable for it. */
  abandonIssue(request: IssueActionRequest): Promise<IssueActionResult>;
  /**
   * The trade rumours the simulation has generated from live market prices, best margin
   * first.
   *
   * A read and nothing else: the feed is a query over the world's prices, and no order
   * rides on it. Which rumours are worth publishing is the simulation's call — it holds the
   * threshold that a tip has to clear and the order it hands them over in, and this client
   * asks for the list and draws it as it arrives.
   */
  rumours(): Promise<Rumour[]>;
  planMarch(request: MarchRequest): Promise<MarchPlan>;
  commitMarch(request: MarchRequest): Promise<void>;
  /** Days of game time per real second. Zero pauses the clock. */
  setTimeScale(daysPerRealSecond: number): void;
  /** Run the clock until the party's march completes. Resolves with days advanced. */
  skipToArrival(): Promise<{ daysAdvanced: number }>;
  why(entityId: string, field: string): Promise<WhyChain>;
  subscribeTicks(onTick: (tick: TickUpdate) => void, onStatus: (status: ConnectionStatus) => void): () => void;
}

export type ConnectionState = "connected" | "connecting" | "reconnecting" | "degraded" | "offline";

export interface ConnectionStatus {
  state: ConnectionState;
  /** Why, for the developer console. Never shown to the player raw. */
  detail: string;
  attempt: number;
}
