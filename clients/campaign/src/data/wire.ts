/**
 * Per-endpoint wire shapes. `src/data/provider.ts` is the transport; this is the
 * vocabulary.
 *
 * Every function here is one of two kinds, and the split is the whole point:
 *
 *  - A `*Problem` returns a developer-readable fragment naming the first field that is
 *    wrong, or `null` when the value is sound. It never throws and never mutates.
 *  - A `*Request` / `*Result` type is what the client *requires*, not a promise about
 *    what any server will send.
 *
 * CONSTITUTION.md section 1.3: every external call is untrusted. A bare
 * `await response.json() as SimSnapshot` is a promise to the rest of the client that the
 * server sent exactly the shape it was asked for, and the failure mode when that is not
 * true is a blank panel, a `NaN` in the top bar, or a `TypeError` thrown from three
 * frames away in a panel nobody was looking at. So each payload is checked at the
 * boundary and refused with a sentence the player can read.
 *
 * This mirrors `validateRegion` / `validateSettlements` / `validateNetwork` in
 * `src/world/load.ts`, deliberately: one house pattern for untrusted payloads, not two.
 */

import {
  fieldsProblem,
  isArray,
  isBoolean,
  isFiniteNumber,
  isOneOf,
  isRecord,
  isString,
  isText,
  listProblem,
  pointProblem,
  polylineProblem,
  tableProblem,
} from "./checks.js";
import type {
  BattleXpAward,
  ConstructionResult,
  ImproveRelationRequest,
  ImproveRelationResult,
  MarchPlan,
  NearbyForce,
  RecruitRequest,
  RecruitResult,
  SimSnapshot,
  StepDaysRequest,
  StepDaysResult,
  TalkToNotableResult,
  TavernCompanion,
  TradeRequest,
  TradeResult,
  UpgradeTroopsRequest,
  UpgradeTroopsResult,
  WhyChain,
} from "./types.js";

/** How deep a cause chain is walked before the oldest edges are dropped. */
export const WHY_MAX_EDGES = 50;

/**
 * A payload that failed its check.
 *
 * Carries the developer-readable fragment naming the offending field. The player-facing
 * sentence belongs to whoever called the check — `SimulationUnavailableError` in the
 * provider, a panel's own error state in a test — because what a player should be told
 * depends on which endpoint failed and what they were trying to do.
 */
export class WireError extends Error {
  readonly problem: string;

  constructor(problem: string) {
    super(`payload failed validation: ${problem}`);
    this.name = "WireError";
    this.problem = problem;
  }
}

// -- schema version -----------------------------------------------------------

/**
 * The snapshot schema versions this client can read.
 *
 * A range rather than a single number, so a client can be widened to accept the next
 * version without a flag day, and narrowed when a version arrives it has never seen.
 * Both ends are inclusive.
 */
export const SNAPSHOT_SCHEMA_MIN = 1;
export const SNAPSHOT_SCHEMA_MAX = 1;

/** The version this client writes into nothing and reads out of everything. */
export const SNAPSHOT_SCHEMA_VERSION = SNAPSHOT_SCHEMA_MAX;

/**
 * Whether the payload's schema version is outside the range this client reads.
 *
 * `null` when the version is supported — and also when there is no version to judge,
 * because a missing or unreadable `schemaVersion` is a malformed payload rather than a
 * skew, and `snapshotProblem` reports it as the malformed payload it is. This is checked
 * *before* the field-by-field validation on purpose: a snapshot from a future version is
 * missing fields this client never heard of, so validating it field by field produces a
 * list of nonsense complaints about a payload that is perfectly good for the server that
 * wrote it. The honest answer to that is "this client is too old for this world".
 */
export function schemaVersionProblem(raw: unknown): "too new" | "too old" | null {
  if (!isRecord(raw)) return null;
  const version = raw.schemaVersion;
  if (!isFiniteNumber(version) || !Number.isInteger(version)) return null;
  if (version > SNAPSHOT_SCHEMA_MAX) return "too new";
  if (version < SNAPSHOT_SCHEMA_MIN) return "too old";
  return null;
}

// -- GET /v1/snapshot ---------------------------------------------------------

/**
 * The first thing wrong with a snapshot, as a developer-readable sentence.
 *
 * Ordered top-down, because that is the order a developer reads the payload in. Nested
 * lists are checked element by element so a bad town at index 3 is reported as
 * `town 3 has no name` rather than `towns is invalid`, which is the difference between a
 * report they can act on and one they have to re-fetch to understand.
 */
export function snapshotProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  // Required rather than optional. A snapshot with no version cannot be placed in the
  // supported range, and a client that guessed would be the one silently reading a world
  // it does not understand.
  if (!isFiniteNumber(raw.schemaVersion) || !Number.isInteger(raw.schemaVersion)) {
    return "schemaVersion is missing or not a whole number";
  }
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  if (!isFiniteNumber(raw.year)) return "year is not a number";
  if (!isEraTier(raw.eraTier)) return "eraTier is not one of 1, 2, 3 or 4";
  const player = playerProblem(raw.player);
  if (player) return `player.${player}`;
  const party = partyProblem(raw.party);
  if (party) return `party.${party}`;
  const ledger = ledgerProblem(raw.ledger);
  if (ledger) return `ledger.${ledger}`;
  for (const key of ["towns", "sides", "rulers", "warnings", "notifications"]) {
    if (!isArray(raw[key])) return `${key} is not a list`;
  }
  if (!isRecord(raw.markets)) return "markets is not a table";
  const markets = tableProblem(raw.markets, marketProblem, (id) => `market ${id}`);
  if (markets) return markets;
  if (!isRecord(raw.causeLog)) return "causeLog is not a table";
  const cause = tableProblem(raw.causeLog, causeRowProblem, (id) => `cause row ${id}`);
  if (cause) return cause;
  return listProblem(raw.towns, townProblem, (i) => `town ${i}`);
}

function isEraTier(value: unknown): boolean {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function playerProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is missing";
  if (!isString(raw.partyId)) return "partyId is missing";
  if (!isString(raw.characterName)) return "characterName is missing";
  if (!isRecord(raw.resources)) return "resources is missing";
  for (const id of ["money", "gold", "food", "metal", "medicine"]) {
    if (!isFiniteNumber(raw.resources[id])) return `resources.${id} is not a number`;
  }
  if (!isFiniteNumber(raw.influence)) return "influence is not a number";
  if (!isFiniteNumber(raw.renown)) return "renown is not a number";
  return null;
}

function partyProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is missing";
  if (!isString(raw.id)) return "id is missing";
  if (!isString(raw.name)) return "name is missing";
  if (!isFiniteNumber(raw.morale)) return "morale is not a number";
  if (!isArray(raw.troops)) return "troops is not a list";
  return listProblem(raw.troops, troopProblem, (i) => `troop ${i}`);
}

function troopProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.id)) return "has no id";
  if (!isString(raw.name)) return "has no name";
  if (!isFiniteNumber(raw.count)) return "count is not a number";
  if (!isFiniteNumber(raw.quality)) return "quality is not a number";
  if (!isFiniteNumber(raw.tier)) return "tier is not a number";
  if (!isFiniteNumber(raw.xp)) return "xp is not a number";
  if (!isFiniteNumber(raw.wage)) return "wage is not a number";
  if (!isFiniteNumber(raw.morale)) return "morale is not a number";
  return null;
}

function ledgerProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is missing";
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  if (!isArray(raw.income)) return "income is not a list";
  if (!isArray(raw.expenses)) return "expenses is not a list";
  if (!isRecord(raw.netPerDay)) return "netPerDay is missing";
  return null;
}

function marketProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.townId)) return "has no townId";
  if (!isArray(raw.goods)) return "goods is not a list";
  return listProblem(raw.goods, marketGoodProblem, (i) => `good ${i}`);
}

function marketGoodProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.goodId)) return "has no goodId";
  if (!isString(raw.name)) return "has no name";
  if (!isFiniteNumber(raw.price)) return "price is not a number";
  return null;
}

export function causeRowProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.id)) return "has no id";
  if (!isFiniteNumber(raw.tick)) return "has no tick";
  if (!isFiniteNumber(raw.day)) return "has no day";
  if (!isString(raw.entityId)) return "has no entityId";
  if (!isString(raw.field)) return "has no field";
  if (!isFiniteNumber(raw.old)) return "has no before figure";
  if (!isFiniteNumber(raw.new)) return "has no after figure";
  if (!isString(raw.system)) return "has no system";
  if (!isArray(raw.causedBy)) return "has no cause list";
  if (!isString(raw.summary)) return "has no summary";
  return null;
}

function townProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.id)) return "has no id";
  if (!isString(raw.settlementId)) return "has no settlementId";
  if (!isString(raw.name)) return "has no name";
  if (!isOneOf(raw.klass, ["city", "town", "village"] as const)) return "klass is not city, town or village";
  for (const field of ["unrest", "loyalty", "security", "taxRate", "stateTaxRate"]) {
    if (!isFiniteNumber(raw[field])) return `${field} is not a number`;
  }
  if (!isFiniteNumber(raw.updatedTick)) return "updatedTick is not a number";
  if (!isArray(buildingsOf(raw))) return "buildings is not a list";
  return listProblem(buildingsOf(raw), buildingProblem, (i) => `building ${i}`);
}

function buildingsOf(raw: Record<string, unknown>): unknown {
  return raw.buildings;
}

function buildingProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.id)) return "has no id";
  if (!isString(raw.name)) return "has no name";
  if (!isFiniteNumber(raw.level)) return "level is not a number";
  if (!isFiniteNumber(raw.maxLevel)) return "maxLevel is not a number";
  if (!isFiniteNumber(raw.nextCost)) return "nextCost is not a number";
  if (!isFiniteNumber(raw.nextDays)) return "nextDays is not a number";
  return null;
}

// -- POST /v1/trade -----------------------------------------------------------

export function tradeRequestProblem(request: TradeRequest): string | null {
  if (!isString(request.partyId)) return "partyId is missing";
  if (!isString(request.townId)) return "townId is missing";
  if (!isString(request.goodId)) return "goodId is missing";
  if (!isOneOf(request.side, ["buy", "sell"] as const)) return "side is not buy or sell";
  if (!isFiniteNumber(request.quantity) || request.quantity <= 0) return "quantity is not a positive number";
  if (!isFiniteNumber(request.expectedDay)) return "expectedDay is not a number";
  return null;
}

export function tradeResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isBoolean(raw.accepted)) return "accepted is not true or false";
  if (!isOneOf(raw.side, ["buy", "sell"] as const)) return "side is not buy or sell";
  if (!isFiniteNumber(raw.unitPrice)) return "unitPrice is not a number";
  if (!isFiniteNumber(raw.quantity)) return "quantity is not a number";
  if (!isFiniteNumber(raw.total)) return "total is not a number";
  if (!isFiniteNumber(raw.partyQuantity)) return "partyQuantity is not a number";
  if (!isFiniteNumber(raw.marketPriceAfter)) return "marketPriceAfter is not a number";
  // A row id when the trade wrote one, and "" when it did not. `finishTrade` only looks
  // up a cause row for an accepted trade, and the field has no `omitempty` on the server,
  // so a refusal arrives with the key present and empty. `isText` rather than `isString`
  // for that reason; see checks.ts.
  if (!isText(raw.causedBy)) return "causedBy is missing";
  // A refusal is the simulation's right answer, so a reason is required on it and the
  // panel prints it verbatim. An acceptance with no reason is fine.
  if (!raw.accepted && !isString(raw.reason)) return "a refusal carries no reason";
  return null;
}

// -- POST /v1/recruit ---------------------------------------------------------

export function recruitRequestProblem(request: RecruitRequest): string | null {
  if (!isString(request.partyId)) return "partyId is missing";
  if (!isString(request.townId)) return "townId is missing";
  if (!isString(request.unitId)) return "unitId is missing";
  if (!Number.isInteger(request.quantity) || request.quantity <= 0) {
    return "quantity is not a positive whole number";
  }
  if (!isFiniteNumber(request.expectedDay)) return "expectedDay is not a number";
  return null;
}

export function recruitResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isBoolean(raw.accepted)) return "accepted is not true or false";
  if (!isString(raw.unitName)) return "unitName is missing";
  if (!isFiniteNumber(raw.quantity)) return "quantity is not a number";
  if (!isFiniteNumber(raw.totalCost)) return "totalCost is not a number";
  if (!isFiniteNumber(raw.newCount)) return "newCount is not a number";
  // A row id when the hire wrote one, "" when it did not: `recruit.go` only looks up a
  // cause row for an accepted order, and the field has no `omitempty`, so a refusal
  // arrives present and empty. `isText`, not `isString`; see checks.ts.
  if (!isText(raw.causedBy)) return "causedBy is missing";
  if (!raw.accepted && !isString(raw.reason)) return "a refusal carries no reason";
  return null;
}

// -- POST /v1/notables/talk ---------------------------------------------------

/**
 * A conversation.
 *
 * An empty `dialogue` array passes, because it is a legitimate answer from a notable who
 * has nothing to say to you. What must not pass is a blank *dialog*: the renderer in
 * `src/ui/panels/NotableDialog.ts` prints fallback copy for an empty array, so the
 * difference between a real answer and an unreadable one is never visible on screen.
 */
export function talkResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.notableId)) return "notableId is missing";
  if (!isString(raw.name)) return "name is missing";
  if (!isArray(raw.dialogue)) return "dialogue is not a list";
  for (const [index, line] of raw.dialogue.entries()) {
    if (typeof line !== "string") return `dialogue line ${index} is not text`;
  }
  if (!isArray(raw.actions)) return "actions is not a list";
  return listProblem(raw.actions, notableActionProblem, (i) => `action ${i}`);
}

function notableActionProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.id)) return "has no id";
  if (!isString(raw.label)) return "has no label";
  if (!isString(raw.detail)) return "has no detail";
  if (!isBoolean(raw.available)) return "available is not true or false";
  // An action the player cannot take has to say why, or the button is a dead control.
  if (!raw.available && !isString(raw.reason)) return "an unavailable action carries no reason";
  return null;
}

// -- POST /v1/notables/relation -----------------------------------------------

export function improveRelationRequestProblem(request: ImproveRelationRequest): string | null {
  if (!isString(request.notableId)) return "notableId is missing";
  if (!isOneOf(request.action, ["gift", "favor"] as const)) return "action is not gift or favor";
  if (request.action === "gift" && (!isFiniteNumber(request.amount) || request.amount <= 0)) {
    return "a gift carries no positive amount";
  }
  return null;
}

export function improveRelationResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isBoolean(raw.accepted)) return "accepted is not true or false";
  if (!isString(raw.notableId)) return "notableId is missing";
  if (!isString(raw.name)) return "name is missing";
  if (!isFiniteNumber(raw.relationBefore)) return "relationBefore is not a number";
  if (!isFiniteNumber(raw.relationAfter)) return "relationAfter is not a number";
  if (!isString(raw.summary)) return "summary is missing";
  // As in trade and recruit: set only for an accepted order, sent always, and empty on a
  // refusal. `isText`, not `isString`; see checks.ts.
  if (!isText(raw.causedBy)) return "causedBy is missing";
  if (!raw.accepted && !isString(raw.reason)) return "a refusal carries no reason";
  return null;
}

// -- POST /v1/time-scale ------------------------------------------------------

/**
 * The server's answer to a speed change.
 *
 * `accepted` is the whole contract. A speed change the player can see in the dial but
 * the simulation did not take is the one desync this client cannot have, so the field is
 * required rather than defaulted, and `false` is an error rather than a quiet no-op.
 */
export function timeScaleProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isBoolean(raw.accepted)) return "accepted is not true or false";
  if (raw.accepted && !isFiniteNumber(raw.daysPerRealSecond)) {
    return "an acceptance carries no daysPerRealSecond to run at";
  }
  if (!raw.accepted && !isString(raw.reason)) return "a refusal carries no reason";
  return null;
}

// -- POST /v1/skip-to-arrival -------------------------------------------------

export function skipToArrivalProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isFiniteNumber(raw.daysAdvanced)) return "daysAdvanced is not a number";
  if (!Number.isInteger(raw.daysAdvanced)) return "daysAdvanced is not a whole number";
  if (raw.daysAdvanced < 0) return "daysAdvanced is negative";
  return null;
}

// -- POST /v1/troops/battle-xp -----------------------------------------------

/** One award per stack, so the result screen can say who learned what. */
export function battleXpProblem(raw: unknown): string | null {
  if (!isArray(raw)) return "the reply is not a list of awards";
  return listProblem(raw, battleXpAwardProblem, (i) => `award ${i}`);
}

function battleXpAwardProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isString(raw.stackId)) return "has no stackId";
  if (!isFiniteNumber(raw.xp)) return "xp is not a number";
  return null;
}

// -- POST /v1/troops/upgrade --------------------------------------------------

export function upgradeRequestProblem(request: UpgradeTroopsRequest): string | null {
  if (!isString(request.stackId)) return "stackId is missing";
  return null;
}

/**
 * A wait order (task 132). The count must be whole days the client is willing
 * to sit still for; anything past a month is refused so travel stays the way
 * distance is crossed, not waiting.
 */
export function stepDaysRequestProblem(request: StepDaysRequest): string | null {
  if (!Number.isInteger(request.days) || request.days < 1) return "days must be a whole number of at least 1";
  if (request.days > 30) return "days must be 30 or fewer; march instead";
  return null;
}

/** The reply is `{ ok, day }`; the panel prints the day it landed on. */
export function stepDaysResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isBoolean(raw.ok)) return "ok is not true or false";
  if (!isFiniteNumber(raw.day)) return "the reply has no day";
  return null;
}

/**
 * A promotion, and the tiers it moved between.
 *
 * `fromTier` and `toTier` are both required rather than inferred from a `upgraded` flag,
 * because the party panel draws the new tier row straight from them. A promotion that
 * arrives without the tiers it produced would leave the panel showing the old tier until
 * the next full snapshot, which is exactly the "refreshes to the new tiers without a
 * reload" this is supposed to make true.
 */
export function upgradeResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isBoolean(raw.upgraded)) return "upgraded is not true or false";
  if (!isString(raw.stackId)) return "stackId is missing";
  if (!isFiniteNumber(raw.fromTier)) return "fromTier is not a number";
  if (!isFiniteNumber(raw.toTier)) return "toTier is not a number";
  if (!isFiniteNumber(raw.xpSpent)) return "xpSpent is not a number";
  if (!isFiniteNumber(raw.goldSpent)) return "goldSpent is not a number";
  // Set only on a successful promotion, sent always, and empty on a refusal, so a refusal
  // must be allowed to carry it empty. `isText`, not `isString`; see checks.ts.
  if (!isText(raw.causedBy)) return "causedBy is missing";
  if (raw.upgraded && raw.toTier <= raw.fromTier) return "an upgrade does not raise a tier";
  if (!raw.upgraded && !isString(raw.reason)) return "a refusal carries no reason";
  return null;
}

// -- POST /v1/town/tax and /v1/state/tax --------------------------------------

/**
 * The authoritative rate after a tax order.
 *
 * Not the rate the player asked for. The simulation clamps (a town is 0 to 0.5, a state
 * 0 to 0.15) and it is the only thing that knows what it clamped to, so the panel shows
 * what came back rather than what it sent.
 */
export function taxResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isFiniteNumber(raw.rate)) return "rate is not a number";
  return null;
}

// -- POST /v1/town/construct --------------------------------------------------

/**
 * A queued project, and the tick it finishes on.
 *
 * `completionTick` is what the project card counts down to, so it is required: a project
 * with no completion tick has no countdown, and a countdown to nothing is worse than
 * none because it looks like information.
 */
export function constructionResultProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isBoolean(raw.ok)) return "ok is not true or false";
  if (!isString(raw.message)) return "message is missing";
  if (!raw.ok) return null;
  if (!isFiniteNumber(raw.completionTick)) return "completionTick is not a number";
  if (!isFiniteNumber(raw.daysLeft)) return "daysLeft is not a number";
  if (!isString(raw.buildingId)) return "buildingId is missing";
  if (!isString(raw.buildingName)) return "buildingName is missing";
  return null;
}

// -- POST /v1/march/plan and /v1/march/commit --------------------------------

/**
 * A priced march: the polyline the planner draws, when it arrives, and what it costs.
 *
 * The route is checked as a polyline rather than merely as a list, because the campaign
 * map draws `route[i].x/z` directly. A route of three numbers would draw a line to
 * `undefined` and land the party in the sea.
 */
export function marchPlanProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.partyId)) return "partyId is missing";
  if (!isString(raw.destinationSettlementId)) return "destinationSettlementId is missing";
  if (!isString(raw.destinationName)) return "destinationName is missing";
  const route = raw.route;
  const routeProblem = polylineProblem(route);
  if (routeProblem) return `route ${routeProblem}`;
  // An unmapped march has no route to draw, so a short one is not a defect there. A
  // mapped march with fewer than two points would draw no line at all.
  if (raw.unmapped !== true && isArray(route) && route.length < 2) return "route has fewer than two points";
  if (!isFiniteNumber(raw.distanceKm)) return "distanceKm is not a number";
  if (!isFiniteNumber(raw.days)) return "days is not a number";
  if (!isFiniteNumber(raw.arrivalDay)) return "arrivalDay is not a number";
  if (!isRecord(raw.cost)) return "cost is missing";
  for (const id of ["food", "money", "metal"]) {
    if (!isFiniteNumber(raw.cost[id])) return `cost.${id} is not a number`;
  }
  if (raw.daysOfFoodOnArrival !== null && !isFiniteNumber(raw.daysOfFoodOnArrival)) {
    return "daysOfFoodOnArrival is neither a number nor null";
  }
  if (!isFiniteNumber(raw.roadDanger)) return "roadDanger is not a number";
  if (!isArray(raw.warnings)) return "warnings is not a list";
  for (const [index, w] of raw.warnings.entries()) {
    if (typeof w !== "string") return `warning ${index} is not text`;
  }
  if (!isBoolean(raw.unmapped)) return "unmapped is not true or false";
  return null;
}

/** A committed march, and the id the simulation filed it under. */
export function marchCommitProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.marchId)) return "marchId is missing";
  if (!isString(raw.destinationName)) return "destinationName is missing";
  if (!isFiniteNumber(raw.arrivalDay)) return "arrivalDay is not a number";
  if (!isFiniteNumber(raw.days)) return "days is not a number";
  return null;
}

// -- GET /v1/why --------------------------------------------------------------

export function whyChainProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.entityId)) return "entityId is missing";
  if (!isString(raw.field)) return "field is missing";
  if (!isArray(raw.rows)) return "rows is not a list";
  if (!isArray(raw.related)) return "related is not a list";
  const rows = listProblem(raw.rows, causeRowProblem, (i) => `row ${i}`);
  if (rows) return rows;
  return listProblem(raw.related, causeRowProblem, (i) => `related row ${i}`);
}

// -- tick frames --------------------------------------------------------------

export function tickFrameProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the frame is not a JSON object";
  if (!isFiniteNumber(raw.tick)) return "tick is not a number";
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  return null;
}

// -- GET /v1/parties/nearby --------------------------------------------------

/**
 * One row of `GET /v1/parties/nearby`, the force the encounter panel is built from.
 *
 * `position` is required because the flee path subtracts it from the player's own
 * position to get a direction, and an undefined there is a `NaN` in the retreat
 * order. `id` is required and is not just a label: it goes into the encounter
 * request and into fleeing and defeat, all of which look the party up by it.
 *
 * `troops` is deliberately not required. The server tracks a party it is not
 * simulating as a headcount and a morale rather than as stacks, so it sends no
 * composition and there is nothing to check; the fixture, which does simulate
 * them, sends one and it is read when present.
 */
function nearbyForceProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  const problem = fieldsProblem([
    ["id", isString(raw.id)],
    ["name", isString(raw.name)],
    ["troopCount", isFiniteNumber(raw.troopCount)],
    ["hostile", isBoolean(raw.hostile)],
  ]);
  if (problem) return `has no ${problem}`;
  const position = pointProblem(raw.position);
  if (position) return `position ${position}`;
  if (raw.distanceKm !== undefined && !isFiniteNumber(raw.distanceKm)) return "has a distanceKm that is not a number";
  return null;
}

export function nearbyForceListProblem(raw: unknown): string | null {
  if (!isArray(raw)) return "the reply is not a list of forces";
  return listProblem(raw, nearbyForceProblem, (i) => `force ${i}`);
}

const RECRUIT_KINDS = ["gold", "reputation", "win_fight"] as const;

function tavernCompanionProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  const problem = fieldsProblem([
    ["id", isString(raw.id)],
    ["name", isString(raw.name)],
    ["backstory", isString(raw.backstory)],
    ["traits", isArray(raw.traits) && raw.traits.every(isString)],
    ["skills", isRecord(raw.skills) && Object.values(raw.skills).every(isFiniteNumber)],
    ["wageDaily", isFiniteNumber(raw.wageDaily)],
    ["recruitKind", isOneOf(raw.recruitKind, RECRUIT_KINDS)],
    ["recruitValue", isFiniteNumber(raw.recruitValue)],
    ["hired", isBoolean(raw.hired)],
    ["available", isBoolean(raw.available)],
  ]);
  if (problem) return `has no ${problem}`;
  return null;
}

export function tavernCompanionListProblem(raw: unknown): string | null {
  if (!isArray(raw)) return "the reply is not a list of tavern companions";
  return listProblem(raw, tavernCompanionProblem, (i) => `companion ${i}`);
}

function smithingStaminaProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  const problem = fieldsProblem([
    ["stamina", isFiniteNumber(raw.stamina) && (raw.stamina as number) >= 0],
    ["max", isFiniteNumber(raw.max) && (raw.max as number) > 0],
  ]);
  if (problem) return `has no ${problem}`;
  return null;
}

export function smithingStaminaReplyProblem(raw: unknown): string | null {
  const problem = smithingStaminaProblem(raw);
  return problem === null ? null : `the smithing stamina reply ${problem}`;
}

// -- compile-time tie between the checks and the types they guard ------------
//
// A validator is only worth having if the type it guards is the type the client
// actually uses. These assignments are how that is enforced: rename a field in
// `types.ts` and this file stops compiling, rather than the validator quietly passing
// every payload forever while the panel reads `undefined`.

const _snapshot: (raw: unknown) => SimSnapshot | null = (raw) => (snapshotProblem(raw) === null ? (raw as SimSnapshot) : null);
const _trade: (raw: unknown) => TradeResult | null = (raw) => (tradeResultProblem(raw) === null ? (raw as TradeResult) : null);
const _recruit: (raw: unknown) => RecruitResult | null = (raw) => (recruitResultProblem(raw) === null ? (raw as RecruitResult) : null);
const _talk: (raw: unknown) => TalkToNotableResult | null = (raw) => (talkResultProblem(raw) === null ? (raw as TalkToNotableResult) : null);
const _relation: (raw: unknown) => ImproveRelationResult | null = (raw) =>
  improveRelationResultProblem(raw) === null ? (raw as ImproveRelationResult) : null;
const _awards: (raw: unknown) => BattleXpAward[] | null = (raw) =>
  battleXpProblem(raw) === null ? (raw as BattleXpAward[]) : null;
const _upgrade: (raw: unknown) => UpgradeTroopsResult | null = (raw) =>
  upgradeResultProblem(raw) === null ? (raw as UpgradeTroopsResult) : null;
const _construction: (raw: unknown) => ConstructionResult | null = (raw) =>
  constructionResultProblem(raw) === null ? (raw as ConstructionResult) : null;
const _plan: (raw: unknown) => MarchPlan | null = (raw) => (marchPlanProblem(raw) === null ? (raw as MarchPlan) : null);
const _chain: (raw: unknown) => WhyChain | null = (raw) => (whyChainProblem(raw) === null ? (raw as WhyChain) : null);
const _forces: (raw: unknown) => NearbyForce[] | null = (raw) =>
  nearbyForceListProblem(raw) === null ? (raw as NearbyForce[]) : null;
const _tavern: (raw: unknown) => TavernCompanion[] | null = (raw) =>
  tavernCompanionListProblem(raw) === null ? (raw as TavernCompanion[]) : null;
const _smithStamina: (raw: unknown) => { stamina: number; max: number } | null = (raw) =>
  smithingStaminaProblem(raw) === null ? (raw as { stamina: number; max: number }) : null;
const _stepDays: (raw: unknown) => StepDaysResult | null = (raw) =>
  stepDaysResultProblem(raw) === null ? (raw as StepDaysResult) : null;
void [_snapshot, _trade, _recruit, _talk, _relation, _awards, _upgrade, _construction, _plan, _chain, _forces, _tavern, _smithStamina, _stepDays];

/** Re-exported so a payload with a `{ x, z }` shape is checked the same way everywhere. */
export { pointProblem };