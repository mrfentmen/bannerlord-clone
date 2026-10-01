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
}

/** The full read and write surface the client needs from the simulation. */
export interface SimulationProvider {
  readonly kind: "http" | "fixture";
  /** Shown in the data-source panel so the player knows what they are looking at. */
  readonly label: string;
  getSnapshot(): Promise<SimSnapshot>;
  trade(request: TradeRequest): Promise<TradeResult>;
  planMarch(request: MarchRequest): Promise<MarchPlan>;
  commitMarch(request: MarchRequest): Promise<void>;
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

// =============================================================================
// ENTITY REFERENCES
//
// The known limitation this replaces: a ledger line's `causedBy` is a cause-log id,
// which names a *write* rather than a thing in the world, so the ledger could only
// print it as text. An `EntityRef` names the thing itself, so a line can be a link.
//
// The id format, one per kind, and stable across days and across restarts because it
// is derived from the entity's own world id and never from its position, its array
// index or its name:
//
//   settlement  stl:<slug>    stl:golden          stl:idaho-springs
//   ruler       rlr:<slug>    rlr:ruler-3
//   party       pty:<slug>    pty:party-player
//   route       rte:<from>-><to>   rte:golden->longmont
//
// A slug is lowercase alphanumerics in dash-separated words (`[a-z0-9]+(-[a-z0-9]+)*`),
// which is what the imported world data already uses for settlement ids. A route is two
// slugs joined by `->`, because a dash cannot be the join: `idaho-springs` would
// otherwise be unreadable as a pair. Every prefix is exactly three characters, so a
// serialised id is greppable and readable in a log without a parser.
//
// The codec that reads and writes these ids lives with the ledger panel for now. It is
// the only module permitted to hold it, and it is pure, so moving it to
// `src/data/entity-ref.ts` is a file move and not a rewrite.
// =============================================================================

/** The four kinds of thing a ledger entry can point at. */
export type EntityKind = "settlement" | "ruler" | "party" | "route";

/** The three-character prefix that opens a serialised entity id, per kind. */
export type EntityRefPrefix = "stl" | "rlr" | "pty" | "rte";

/**
 * A typed pointer at one thing in the world.
 *
 * `kind` and `id` are separate fields so a caller cannot build a settlement reference
 * out of a ruler's id by typing it in the wrong place: the pair is the reference, and
 * the prefix only appears when the id is serialised.
 */
export interface EntityRef {
  readonly kind: EntityKind;
  readonly id: string;
}

/** A ledger line that names the entities it belongs to. */
export interface ReferencedLedgerLine extends LedgerLine {
  /**
   * The entities this line accounts for, in the order the simulation wrote them.
   *
   * Optional on purpose: `LedgerLine` is the contract as it stands today, and a line
   * with nothing to point at is a line that still has to render.
   */
  readonly refs?: readonly EntityRef[];
}

/**
 * The ledger, when its lines carry entity references.
 *
 * Every plain `Ledger` satisfies this, because `refs` is optional — which is what lets
 * the panel take the richer type without the simulation having to be rewritten first.
 */
export interface ReferencedLedger extends Omit<Ledger, "income" | "expenses"> {
  readonly income: readonly ReferencedLedgerLine[];
  readonly expenses: readonly ReferencedLedgerLine[];
}

/**
 * Display names for entity references, keyed by the serialised id (`stl:golden`).
 *
 * A name that is missing from this index is a stale reference, not an error: the
 * simulation has retired the entity and the ledger still names it.
 */
export type EntityNameIndex = Readonly<Record<string, string>>;

// -- the codec -----------------------------------------------------------------

/** The prefix each kind opens its serialised id with. */
export const ENTITY_REF_PREFIX: Readonly<Record<EntityKind, EntityRefPrefix>> = {
  settlement: "stl",
  ruler: "rlr",
  party: "pty",
  route: "rte",
};

const KIND_BY_PREFIX: Readonly<Record<EntityRefPrefix, EntityKind>> = {
  stl: "settlement",
  rlr: "ruler",
  pty: "party",
  rte: "route",
};

/** What the four kinds are called in a sentence. Copy, not a token. */
export const ENTITY_KIND_LABEL: Readonly<Record<EntityKind, string>> = {
  settlement: "settlement",
  ruler: "ruler",
  party: "party",
  route: "route",
};

/** How a route names its two ends. A dash cannot do it; see the note above. */
const ROUTE_JOIN = "->";

/**
 * One slug: lowercase alphanumerics in dash-separated words.
 *
 * This is the shape the imported world data already gives settlement ids
 * (`idaho-springs`, `central-city`), so no id has to be renamed to satisfy it. Leading,
 * trailing and doubled dashes are rejected, because two ids that differ only in those
 * look identical on a printed line and are different entities everywhere else.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Long enough for `party-player-player-player-convoy`, short enough to read. */
const SLUG_MAX = 64;

/**
 * Ids that are the *shape* of an id and never an id.
 *
 * A serialised reference arrives over the wire and can be anything, and the one thing
 * this client must never print is a leaked JavaScript value. `stl:undefined` satisfies
 * the slug grammar perfectly well — it is lowercase — so the grammar alone would let it
 * through and the panel would print "undefined" as though it were a place. Rejecting the
 * three words by name is cheaper and more honest than trying to detect the leak later.
 */
const RESERVED_ID = new Set(["undefined", "null", "nan", "none", "nil", "unknown"]);

function slugOk(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX && SLUG.test(slug) && !RESERVED_ID.has(slug);
}

/**
 * Whether a `{ kind, id }` pair is a reference this client is willing to navigate to.
 *
 * `unknown` rather than `EntityRef`, because the input is untrusted: an HTTP payload
 * and a fixture both arrive as whatever the sender wrote, and a type guard that assumes
 * its argument is already an `EntityRef` is an assertion dressed up as a check.
 */
export function isEntityRef(value: unknown): value is EntityRef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { kind?: unknown; id?: unknown };
  if (typeof candidate.kind !== "string" || typeof candidate.id !== "string") return false;
  if (!(candidate.kind in ENTITY_REF_PREFIX)) return false;
  if (candidate.kind === "route") {
    const ends = candidate.id.split(ROUTE_JOIN);
    return ends.length === 2 && ends.every(slugOk);
  }
  return slugOk(candidate.id);
}

/**
 * Read a serialised id back into a reference.
 *
 * Returns `null` for anything malformed rather than throwing and rather than returning a
 * half-built reference: an unparseable id is a stale reference, and the caller's job is
 * to degrade, not to recover. `stl:` with nothing after the prefix, `stl:Golden` with a
 * capital, `nope:golden` with an unknown prefix and `stl:golden->longmont` claiming to be
 * a settlement are all rejected.
 */
export function parseEntityRefId(raw: unknown): EntityRef | null {
  if (typeof raw !== "string") return null;
  const cut = raw.indexOf(":");
  if (cut !== 3) return null;
  const prefix = raw.slice(0, 3) as EntityRefPrefix;
  const kind = KIND_BY_PREFIX[prefix];
  if (kind === undefined) return null;
  const ref: EntityRef = { kind, id: raw.slice(4) };
  return isEntityRef(ref) ? ref : null;
}

/** The serialised form, for a key in an `EntityNameIndex` and for a log line. */
export function formatEntityRefId(ref: EntityRef): string {
  return `${ENTITY_REF_PREFIX[ref.kind]}:${ref.id}`;
}
