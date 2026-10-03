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
/**
 * One settlement project: Bannerlord's "Manage Town" building list, ported to
 * modern names. The simulation owns levels, costs, and build times; the client
 * renders what it is told.
 */
export interface BuildingInfo {
  /** Stable id: "walls" | "barracks" | "training" | "community" | "commercial" | "warehouse" | "farms" | "watch" | "infra" | "civic". */
  id: string;
  /** Modern display name, e.g. "City Walls". */
  name: string;
  /** The original Bannerlord project name, e.g. "Fortifications". */
  bannerlord: string;
  /** Current tier, 0-3. */
  level: number;
  /** Max tier (3). */
  maxLevel: number;
  /** One-line effect description. */
  blurb: string;
  /** Cost of the next tier in town money. 0 when maxed. */
  nextCost: number;
  /** Days the next tier takes to build. 0 when maxed. */
  nextDays: number;
}

/** A player-owned workshop in a town. Produces daily income. */
export interface Workshop {
  id: string;
  townId: string;
  /** Type: "smithy" | "brewery" | "weavery" | "tannery" | "press". */
  type: string;
  name: string;
  /** Daily income in gold. */
  dailyIncome: number;
  /** Days since purchased. */
  ageDays: number;
}

/**
 * The answer to a construction order.
 *
 * The second half is only present when `ok` is true, and it is what the project card
 * counts down to: `completionTick` is the tick the tier finishes on and `daysLeft` is
 * the simulation's own remaining-time figure. Both come from the simulation because the
 * client does not know what a day is worth to a mason.
 */
export interface ConstructionResult {
  ok: boolean;
  message: string;
  /** The building queued, by id. Absent on a refusal. */
  buildingId?: string;
  /** The building's display name, so the card can print it without a lookup. */
  buildingName?: string;
  /** The tick the project completes on. Absent on a refusal. */
  completionTick?: number;
  /** Days remaining as the simulation counts them. Absent on a refusal. */
  daysLeft?: number;
}

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
  /**
   * 0 to 1. Bannerlord's Security stat: driven by garrison strength, drifts
   * toward 0.5. >= 0.75 gives +5% taxes; < 0.5 gives -10% taxes and feeds
   * loyalty penalties. See docs/bannerlord-gap-analysis.md item #7.
   */
  security: number;
  /**
   * The settlement's culture (fixed per settlement in the fixture). Used for
   * loyalty: owner culture mismatch drains loyalty daily.
   */
  culture: string;
  /** The holder's culture. Mismatch with `culture` drains loyalty. */
  holderCulture: string;
  /**
   * True when loyalty collapsed below 0.25 and the rebellion roll fired.
   * A rebellious town stops paying taxes until loyalty recovers.
   */
  rebellious: boolean;
  /** Situational security penalties (Bannerlord: hideout -2, looted village -2, siege -3, scaled to 0-1). */
  underSiege?: boolean;
  nearbyHideout?: boolean;
  lootedVillage?: boolean;
  prosperity: number;
  taxRate: number;
  /** The US-state-level tax rate (e.g. Colorado's), shared by every town in the state. */
  stateTaxRate: number;
  /** The US state this town is in ("CO", "NY", ...). */
  state: string;
  /**
   * Settlement projects (Bannerlord's "Manage Town" building list).
   * The simulation is the authority on levels and costs.
   */
  buildings: BuildingInfo[];
  /** The building id currently under construction, or null. */
  constructionBuilding: string | null;
  /** Days left on the active project. */
  constructionDaysLeft: number;
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
   * Who can be hired here. The simulation is the authority on what a town offers:
   * the client renders the list and sends the order, nothing more.
   */
  recruitable: RecruitableUnit[];
  /**
   * Named notables in this settlement. Their power gates recruitment and their
   * relations unlock prices and quests. Per-notable, not per-settlement.
   */
  notables: Notable[];
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

/** A named notable NPC in a settlement. Wiki gap item #39: notables have Power
 *  and per-notable relations that gate recruitment and hand out issues. */
export type NotableType = "merchant" | "gang-leader" | "veteran" | "community-leader";

export interface Notable {
  id: string;
  settlementId: string;
  name: string;
  type: NotableType;
  /** 1 to 100. Higher power unlocks more and better recruits. */
  power: number;
  /** -100 to +100. Raised by gifts and favors; unlocks prices and quests. */
  relation: number;
  /** One line on who they are, in the product's voice. */
  blurb: string;
}

/** What the player can do when talking to a notable. */
export type NotableAction = "gift" | "favor" | "ask-recruits" | "ask-quest";

export interface TalkToNotableResult {
  notableId: string;
  name: string;
  /** Lines of dialogue, in order. */
  dialogue: string[];
  /** Actions currently available with this notable. */
  actions: { id: NotableAction; label: string; detail: string; available: boolean; reason?: string }[];
}

export interface ImproveRelationRequest {
  notableId: string;
  action: "gift" | "favor";
  /** Gold for a gift; ignored for favors. */
  amount?: number;
}

export interface ImproveRelationResult {
  accepted: boolean;
  notableId: string;
  name: string;
  relationBefore: number;
  relationAfter: number;
  /** What it cost, in the product's voice. */
  summary: string;
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
  /** Wounded troops in this stack. They recover over campaign time. */
  wounded: number;
  /** 0 to 5, per `RULERS.md` and the troop quality rules in `MARCH_AND_WAR.md` §5. */
  quality: number;
  /** 1 to 5, indexes TROOP_TIERS. Kept in sync with quality on upgrade. */
  tier: number;
  /** XP banked toward the next tier upgrade (stack total; thresholds scale by count). */
  xp: number;
  /** Money per day per soldier. */
  wage: number;
  morale: number;
}

/**
 * The troop tier ladder. XP thresholds are per soldier; a stack of N soldiers
 * needs xpToNext * N banked XP to become eligible for upgrade. Combat and wage
 * multipliers are relative to tier 1.
 */
export interface TroopTier {
  tier: number;
  name: string;
  /** XP per soldier to reach the next tier. null = max tier, no further upgrade. */
  xpToNext: number | null;
  combatMultiplier: number;
  wageMultiplier: number;
}

export const TROOP_TIERS: TroopTier[] = [
  { tier: 1, name: "Recruit", xpToNext: 100, combatMultiplier: 1.0, wageMultiplier: 1.0 },
  { tier: 2, name: "Militia", xpToNext: 250, combatMultiplier: 1.3, wageMultiplier: 1.4 },
  { tier: 3, name: "Soldier", xpToNext: 500, combatMultiplier: 1.7, wageMultiplier: 1.9 },
  { tier: 4, name: "Veteran", xpToNext: 1000, combatMultiplier: 2.2, wageMultiplier: 2.5 },
  { tier: 5, name: "Elite", xpToNext: null, combatMultiplier: 2.8, wageMultiplier: 3.2 },
];

/** Look up a tier by number, clamping to the valid 1..5 range. */
export function troopTier(tier: number): TroopTier {
  return TROOP_TIERS[Math.min(5, Math.max(1, Math.round(tier))) - 1]!;
}

/** Effective combat strength of a stack: bodies × tier × morale. */
export function troopStackPower(stack: Pick<TroopStack, "count" | "tier" | "morale">): number {
  const tier = troopTier(stack.tier);
  return stack.count * tier.combatMultiplier * (0.5 + stack.morale / 2);
}

export interface UpgradeTroopsRequest {
  stackId: string;
}

export interface UpgradeTroopsResult {
  upgraded: boolean;
  stackId: string;
  fromTier: number;
  toTier: number;
  /** XP deducted from the stack's bank. */
  xpSpent: number;
  /** Gold deducted from the purse. */
  goldSpent: number;
  /** Why the upgrade failed, in the product's voice, when `upgraded` is false. */
  reason?: string;
  causedBy: string;
}

export interface BattleXpInput {
  /** Whether the player's side won. Losers learn too, at half rate. */
  won: boolean;
  /** Total enemy combat strength, for scaling XP. Stronger foe, more learned. */
  enemyStrength: number;
  /** Stack ids that fought. Defaults to every stack in the party. */
  stackIds?: string[];
}

export interface BattleXpAward {
  stackId: string;
  xp: number;
}

/** A battle participant's outcome. Authoritative data from the battle, not estimates. */
export interface BattleParticipantResult {
  /** Party ID (player party or NPC party ID). */
  partyId: string;
  /** Display name. */
  name: string;
  /** Whether this is the player's party. */
  isPlayer: boolean;
  /** Troops at battle start. */
  initialTroops: number;
  /** Troops still fighting at battle end. */
  survivingTroops: number;
  /** Killed in action (permanent losses). */
  killed: number;
  /** Wounded (recover over campaign time). */
  wounded: number;
  /** Enemy troops captured by this participant. */
  prisonersTaken: number;
  /** Own troops captured by the enemy. */
  prisonersLost: number;
  /** Whether this side retreated. */
  retreated: boolean;
}

/** Authoritative battle result. Produced by the battle, consumed by campaign writeback. */
export interface BattleResult {
  /** Battle ID. */
  battleId: string;
  /** Who won: attacker, defender, or draw. */
  winner: "attacker" | "defender" | "draw";
  attacker: BattleParticipantResult;
  defender: BattleParticipantResult;
  /** Loot value gained by the winner. */
  loot: number;
  /** Battle duration in ticks. */
  ticks: number;
}

/** Input for applying a battle's outcome to the campaign party. */
export interface BattleResultInput {
  /** Whether the player's side won. */
  won: boolean;
  /** Number of player troops lost (killed/wounded). */
  playerLosses: number;
  /** Loot value gained (added to money). */
  loot: number;
  /** Total enemy combat strength, for XP scaling. */
  enemyStrength: number;
  /** Enemy troops captured as prisoners. */
  prisonersCaptured?: { troopId: string; name: string; count: number; tier: number }[];
}

/** Result of applying a battle outcome. */
export interface BattleResultOutcome {
  /** Troops remaining after casualties. */
  troopsRemaining: number;
  /** Money after loot added. */
  money: number;
  /** XP awarded per stack. */
  xpAwards: BattleXpAward[];
  /** Current prisoner list. */
  prisoners: { troopId: string; name: string; count: number; tier: number }[];
}

/** An NPC party roaming the campaign map. */
export interface NpcParty {
  id: string;
  name: string;
  kind: "bandit" | "caravan" | "lord" | "militia";
  factionId: string;
  position: { x: number; z: number };
  troops: { name: string; count: number; tier: number }[];
  /** Total troop count (denormalized for quick checks). */
  troopCount: number;
  /** Whether this party is hostile to the player. */
  hostile: boolean;
  /** Movement target, null when stationary. */
  destination: { x: number; z: number } | null;
  speedKmPerDay: number;
  /** Army this party belongs to, if any. */
  armyId?: string;
}

/**
 * A force in the player's encounter range, as the encounter flow is given it.
 *
 * This is the whole of what `getNearbyHostiles` promises, and it is a narrower
 * thing than {@link NpcParty}. The fixture answers that call with whole
 * npcParties rows, which satisfy this. The campaign server answers it with the
 * facts it holds about a party: a name, a headcount, whether it is hostile, and
 * where it is. It has no composition for a party it is not simulating --
 * `model.Party` is a count and a morale, not stacks -- so `troops` is optional
 * and absent from the server's rows rather than invented to fill the shape.
 *
 * `id` is the party's simulation id. That is what POST /v1/encounters wants as a
 * target.
 */
export interface NearbyForce {
  id: string;
  name: string;
  troopCount: number;
  hostile: boolean;
  position: { x: number; z: number };
  distanceKm?: number;
  troops?: { name: string; count: number; tier: number }[];
}

/** A multi-party army. Parties move as a coordinated group under a leader. */
export interface Army {
  id: string;
  name: string;
  /** Character ID of the army leader. */
  leaderId: string;
  factionId: string;
  /** Party IDs in the army (including the leader's party). */
  partyIds: string[];
  /** Current objective: town ID, party ID, or coordinates. */
  objective: { kind: "town"; townId: string } | { kind: "party"; partyId: string } | { kind: "position"; x: number; z: number } | null;
  /** Total troops across all member parties (denormalized). */
  totalTroops: number;
  /** Whether the army is currently engaged in a siege. */
  besiegingTownId?: string;
  /** Day the army was formed. */
  formedDay: number;
}

/** A siege in progress. Simulation entity, not art. */
export interface Siege {
  id: string;
  townId: string;
  townName: string;
  /** Faction ID of the attackers. */
  attackerFactionId: string;
  /** Army ID leading the siege, if any. */
  armyId?: string;
  /** Party IDs of attackers (for non-army sieges). */
  attackerPartyIds: string[];
  /** Day the siege began. */
  startDay: number;
  /** 0-1: siege preparation progress. 1 = ready to assault. */
  preparation: number;
  /** 0-1: wall integrity. 0 = breached. */
  wallIntegrity: number;
  /** Whether the walls are breached. */
  breached: boolean;
  /** Days of food remaining for defenders. */
  defenderFoodDays: number;
  /** Attacker casualties so far. */
  attackerCasualties: number;
  /** Defender casualties so far. */
  defenderCasualties: number;
  /** Number of siege engines built. */
  siegeEngines: number;
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
  roles: Partial<Record<PartyRole, string>>;
  goods: { goodId: string; name: string; quantity: number; avgPaid: number }[];
  /** Captured enemy troops held as prisoners. */
  prisoners: { troopId: string; name: string; count: number; tier: number }[];
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
  wealth: Resources;
  loyaltyToLeader: number;
  influence: number;
  renown: number;
  /** Relation to the player, -100 to 100. */
  relationToPlayer: number;
  recentEvents: { day: number; text: string; causedBy?: string }[];
}

/** A clan: the fundamental dynasty unit. Clans hold fiefs, field parties, and provide succession. */
export interface Clan {
  /** Stable clan ID, e.g. "clan-player". */
  id: string;
  name: string;
  /** Character ID of the clan leader. */
  leaderId: string;
  /** Character IDs of all clan members. */
  memberIds: string[];
  /** Clan tier 1-6. Higher tiers unlock more parties and fiefs. */
  tier: number;
  /** Renown: clan prestige, earned through battles and deeds. */
  renown: number;
  /** Clan wealth in money. */
  wealth: number;
  /** Faction/kingdom the clan belongs to. */
  factionId: string;
  /** Settlement IDs controlled by the clan. */
  fiefIds: string[];
  /** Banner color for UI. */
  bannerColor: string;
}

/** A character: a named individual in the campaign world. */
export interface GameCharacter {
  /** Stable character ID, e.g. "char-player". */
  id: string;
  name: string;
  /** Age in years. */
  age: number;
  /** Clan ID. */
  clanId: string;
  /** Faction ID. */
  factionId: string;
  /** Whether the character is alive. */
  alive: boolean;
  /** Day the character died (if dead). */
  deathDay?: number;
  /** Character ID of spouse, if married. */
  spouseId?: string;
  /** Character IDs of parents. */
  parentIds: string[];
  /** Character IDs of children. */
  childrenIds: string[];
  /** Role: ruler, lord, companion, etc. */
  role: "ruler" | "lord" | "companion" | "commoner";
  /** Party ID if leading a party. */
  partyId?: string;
  /** Whether this is the player character. */
  isPlayer: boolean;
  /** Skill levels (0-10) for companions. Affects party/settlement systems. */
  skills?: Record<string, number>;
}

/** Marriage record. */
export interface Marriage {
  /** Character ID of spouse 1. */
  spouse1Id: string;
  /** Character ID of spouse 2. */
  spouse2Id: string;
  /** Day the marriage occurred. */
  day: number;
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

/**
 * A march the simulation accepted, and the record it filed.
 *
 * `marchId` is why this is not `Promise<void>`: an accepted march is a thing in the
 * simulation's log that the cause chain can be walked from later, and a client that
 * threw the id away could never link the march to the unrest it caused on the road.
 */
export interface MarchCommitResult {
  marchId: string;
  destinationName: string;
  /** The in-game day the party is expected to arrive. */
  arrivalDay: number;
  /** Days on the road. */
  days: number;
}

/**
 * The authoritative result of a tax order.
 *
 * The simulation clamps (a town is 0 to 0.5, a state 0 to 0.15) and it is the only thing
 * that knows what it clamped to, so the panel shows `rate` — what came back — rather
 * than what the player asked for.
 */
export interface TaxOrderResult {
  rate: number;
}

/**
 * The simulation's answer to a speed change.
 *
 * `accepted: false` is an error, not a quiet no-op. A speed the dial shows but the
 * simulation did not take is the one desync this client cannot have, so the caller has
 * to be told and has to put the dial back.
 */
export interface TimeScaleResult {
  accepted: boolean;
  /** The speed actually in force, which is only there when `accepted` is true. */
  daysPerRealSecond?: number;
  /** Why the simulation refused, in its own words. */
  reason?: string;
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
  /**
   * Edges dropped to keep the chain followable, oldest first.
   *
   * `0` when nothing was dropped. The Why panel prints this rather than a bare
   * "truncated", because a chain that quietly ends is indistinguishable from a chain
   * that really ended, and that is the one ambiguity this project exists to remove.
   */
  droppedEdges?: number;
}

export interface SimSnapshot {
  /**
   * The snapshot schema version this payload was written against.
   *
   * Present so the client can refuse a world it does not understand *before* it starts
   * field-checking fields the newer version may not even have, which is what turns a
   * version skew into a blank panel. See `SNAPSHOT_SCHEMA_MIN` / `MAX` in `wire.ts`.
   */
  schemaVersion: number;
  /** In-game clock. */
  day: number;
  year: number;
  /** `ERA.md` tier 1 to 4. */
  eraTier: 1 | 2 | 3 | 4;
  /** The player's hold, the top bar. */
  player: {
    partyId: string;
    characterName: string;
    /** The player's chosen ethnicity (culture). See src/data/ethnicities.ts. */
    ethnicityId: string;
    /** Appearance preset from the character maker. */
    appearanceId: string;
    /** Character age from the maker. */
    age: number;
    /** Biography assembled from background choices. */
    biography: string;
    /**
     * The background choices as made, category id -> option id.
     *
     * Optional and additive on purpose. The sheet used to survive only as its
     * effects — skills, cash, biography — so a player could not be told later what
     * they had picked. Adding the field is why the schema version did not have to
     * move: an old save simply does not have it.
     */
    backgroundChoices?: Record<string, string> | undefined;
    /** The six attributes as allocated, attribute id -> level. */
    attributes?: Record<string, number> | undefined;
    /** Focus points spent per skill id. */
    skillFocus?: Record<string, number> | undefined;
    /** Starting skills from backgrounds + age + bonus points. */
    skills: Record<string, number>;
    factionId: string;
    resources: Resources;
    influence: number;
    renown: number;
  };
  party: PartyState;
  /** NPC parties roaming the map (bandits, caravans, lord parties). */
  npcParties: NpcParty[];
  towns: TownState[];
  markets: Record<string, MarketState>;
  sides: SideState[];
  rulers: RulerState[];
  /** Clans in the campaign. */
  clans: Clan[];
  /** Characters in the campaign. */
  characters: GameCharacter[];
  /** Player-owned workshops. */
  workshops: Workshop[];
  /** Armies in the campaign. */
  armies: Army[];
  /** Active sieges. */
  sieges: Siege[];
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
  npcParties?: NpcParty[];
  player?: Partial<SimSnapshot["player"]>;
  ledger?: Ledger;
  warnings?: ResourceWarning[];
  notifications?: Notification[];
  causeRows?: CauseRow[];
}

/** The full read and write surface the client needs from the simulation. */
/** Full player character from the character maker. Passed to the sim on game start. */
export interface PlayerCharacter {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  appearanceId: string;
  ethnicityId: string;
  age: number;
  startCity: string;
  difficulty: string;
  backgroundChoices: Record<string, string>;
  /**
   * The six attributes as allocated. Optional because the simulation accepts the
   * sheet either way and an older client omits it; the maker always sends it.
   */
  attributes?: Record<string, number> | undefined;
  /** Focus points spent per skill id. Optional, for the same reason. */
  skillFocus?: Record<string, number> | undefined;
  startingSkills: Record<string, number>;
  startingCash: number;
  biography: string;
}

/** The full read and write surface the client needs from the simulation. */
export interface SimulationProvider {
  readonly kind: "http" | "fixture";
  /** Shown in the data-source panel so the player knows what they are looking at. */
  readonly label: string;
  getSnapshot(): Promise<SimSnapshot>;
  trade(request: TradeRequest): Promise<TradeResult>;
  recruit(request: RecruitRequest): Promise<RecruitResult>;
  /** Talk to a notable: dialogue plus the actions currently available. */
  talkToNotable(settlementId: string, notableId: string): Promise<TalkToNotableResult>;
  /** Raise a notable's relation with a gift or a favor. */
  improveRelation(request: ImproveRelationRequest): Promise<ImproveRelationResult>;
  planMarch(request: MarchRequest): Promise<MarchPlan>;
  /**
   * Give the order. Resolves with the simulation's record of the march, and rejects if
   * the march was not accepted, so a party that did not set off is never drawn as though
   * it had.
   */
  commitMarch(request: MarchRequest): Promise<MarchCommitResult>;
  /**
   * Days of game time per real second. Zero pauses the clock.
   *
   * Returns a promise because the dial must not move until the simulation has agreed to
   * the speed. A rejected change leaves the caller's clock where it was rather than
   * showing a speed the world is not running at.
   */
  setTimeScale(daysPerRealSecond: number): Promise<TimeScaleResult>;
  /** Run the clock until the party's march completes. Resolves with days advanced. */
  skipToArrival(): Promise<{ daysAdvanced: number }>;
  /** Set the player's ethnicity (culture). Applies bonuses from that point on. */
  setEthnicity(ethnicityId: string): void;
  /** Set the full player character from the character maker. Persists name, appearance, skills, cash, biography. */
  setCharacter(character: PlayerCharacter): void;
  /** Award battle XP to troops. Called after combat resolves. */
  awardBattleXp(input: BattleXpInput): Promise<BattleXpAward[]>;
  /** Apply a battle's outcome (casualties, loot, XP) to the campaign party. */
  applyBattleResult(input: BattleResultInput): Promise<BattleResultOutcome>;
  /**
   * Apply an authoritative battle result. The result carries actual participant
   * rosters (killed/wounded/survivors), not estimates. Preferred over
   * applyBattleResult when the battle produces a full BattleResult.
   */
  applyBattleOutcome(result: BattleResult): Promise<BattleResultOutcome>;
  /**
   * Mark an NPC party as defeated (removes it from the campaign). Called after
   * the player wins a battle against that party.
   */
  defeatNpcParty(partyId: string): Promise<void>;
  /**
   * Flee from an encounter: move the player to a new position away from the
   * hostile party. Applies morale/fatigue consequences.
   */
  fleeFromEncounter(npcPartyId: string, newPosition: { x: number; z: number }): Promise<void>;
  /**
   * Apply player defeat consequences: the victorious NPC loots the player,
   * takes prisoners, and the player retreats. The NPC party persists with
   * its surviving troops.
   */
  applyPlayerDefeat(input: { npcPartyId: string; lootTaken: number; prisonersTaken: number }): Promise<void>;
  /**
   * Split the player party: move troops into a new detached party.
   * The detached party is player-controlled and can be merged back.
   */
  splitParty(input: { troopIds: { stackId: string; count: number }[]; name: string }): Promise<{ partyId: string }>;
  /**
   * Merge a detached party back into the player party.
   */
  mergeParty(partyId: string): Promise<void>;
  /** Recruit militia for a town's garrison. Costs money, increases garrison. */
  recruitMilitia(townId: string, count: number): Promise<void>;
  // -- Clans and dynasty ----------------------------------------------------
  /** Create a marriage between two living unmarried characters. */
  marry(charId1: string, charId2: string): Promise<void>;
  /** Record the birth of a child to two parents. */
  haveChild(parentId1: string, parentId2: string, childName: string): Promise<{ childId: string }>;
  /** Kill a character (natural death, battle, etc.). Handles succession. */
  killCharacter(charId: string, cause: string): Promise<void>;
  /** Get the current heir for a clan (succession). */
  getHeir(clanId: string): Promise<GameCharacter | null>;
  /** Test hook: set clan tier. */
  debugSetClanTier?(clanId: string, tier: number): Promise<void>;
  /** Test hook: add prisoners. */
  debugAddPrisoners?(troopId: string, name: string, count: number, tier: number): Promise<void>;
  /** Buy a workshop in a town. */
  buyWorkshop(townId: string, type: string): Promise<{ workshopId: string }>;
  /** Sell a workshop. */
  sellWorkshop(workshopId: string): Promise<void>;
  /** Recruit prisoners into the party. Costs 20 gold per prisoner. */
  recruitPrisoners(troopId: string, count: number): Promise<void>;
  /** Ransom prisoners for gold. */
  ransomPrisoners(troopId: string, count: number): Promise<{ gold: number }>;
  /** Create an army led by a character. Returns the army ID. */
  createArmy(name: string, leaderId: string): Promise<{ armyId: string }>;
  /** Add a party to an army. */
  joinArmy(armyId: string, partyId: string): Promise<void>;
  /** Remove a party from an army. */
  leaveArmy(armyId: string, partyId: string): Promise<void>;
  /** Disband an army. Parties become independent. */
  disbandArmy(armyId: string): Promise<void>;
  /** Begin a siege on a town. Attackers must be at the town. */
  startSiege(townId: string, attackerPartyIds: string[], armyId?: string): Promise<{ siegeId: string }>;
  /** Launch an assault on a besieged town. Requires breach or high preparation. */
  assaultSiege(siegeId: string): Promise<{ victory: boolean; casualties: number }>;
  /** Lift a siege (attackers withdraw). */
  liftSiege(siegeId: string): Promise<void>;
  /** Recruit a companion into the player's clan. Costs 500 gold. */
  recruitCompanion(charId: string): Promise<void>;
  /** Assign a companion to a party role. */
  assignPartyRole(charId: string, role: "quartermaster" | "scout" | "surgeon" | "engineer" | null): Promise<void>;
  /** Set an army's objective. */
  setArmyObjective(armyId: string, objective: Army["objective"]): Promise<void>;
  /** Restore the provider's internal state from a saved snapshot. */
  restoreSnapshot(snapshot: SimSnapshot): Promise<void>;
  /** Forces within rangeKm of the player party. */
  getNearbyHostiles(rangeKm: number): Promise<NearbyForce[]>;
  /** Promote a troop stack to the next tier, spending banked XP and gold. */
  upgradeTroops(request: UpgradeTroopsRequest): Promise<UpgradeTroopsResult>;
  /**
   * Set a town's tax rate (0-0.5). The holder's order; the simulation clamps it and
   * answers with the rate actually in force.
   */
  setTaxRate(townId: string, rate: number): Promise<TaxOrderResult>;
  /**
   * Set the state-level tax rate for every town in a US state. Clamped harder than a
   * town's, and answered the same way.
   */
  setStateTaxRate(state: string, rate: number): Promise<TaxOrderResult>;
  /** Queue a settlement project in a town. One project at a time. */
  startConstruction(townId: string, buildingId: string): Promise<ConstructionResult>;
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
