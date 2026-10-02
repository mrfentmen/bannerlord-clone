/**
 * TEST FIXTURE. Not a simulation, and not a competitor to one.
 *
 * Agent 2 owns the tick loop and the cause log (`agents/README.md` Contract B). It
 * has not landed, and it is blocked on the hosting decision in
 * `CONSTITUTION.md` section 4.1. This module stands in for it so the client can be
 * built and tested against the shape of the contract instead of against nothing.
 *
 * What it is: a deterministic test double for `SimulationProvider`. It responds to
 * the contract's methods with data of the right shape, including `causedBy` links,
 * so the Why panel's chain walk is exercised against a real graph.
 *
 * What it is not: a simulation. It does not implement the systems in
 * `CAUSE_EFFECT.md` section 3. When Agent 2 lands, this file is deleted and
 * `src/data/provider.ts` resolves `http` instead.
 *
 * It is not reachable in a production build. See `vite.config.ts` and
 * `tools/check-no-fixtures.mjs`.
 */

import { buildFixtureSides } from "./sides.js";
import type {
  BarterItem,
  BarterProposal,
  BarterProposalRequest,
  BarterResult,
  BarterTerms,
  CauseRow,
  ConnectionStatus,
  FogState,
  GoodId,
  Issue,
  IssueAction,
  IssueActionRequest,
  IssueActionResult,
  IssueBoard,
  IssueKind,
  IssueReward,
  IssueState,
  IssueStep,
  Ledger,
  MarketGood,
  MarketState,
  MarchPlan,
  MarchRequest,
  Notification,
  PartyState,
  PrisonerStack,
  RecruitableUnit,
  RecruitRequest,
  RecruitResult,
  ResourceWarning,
  RulerState,
  Rumour,
  RumourGood,
  SimSnapshot,
  SimulationProvider,
  TickUpdate,
  TownState,
  TradeRequest,
  TradeResult,
  WhyChain,
} from "../types.js";

/** Marker strings. `tools/check-no-fixtures.mjs` greps the production bundle for
 *  these, so this module cannot be smuggled into a shipped build unnoticed. */
export const FIXTURE_MARKER = "AGENT-3 TEST FIXTURE";
export const FIXTURE_WARNING = "TEST FIXTURE DATA — not the real simulation.";

/** Deterministic per-fixture constants, in one place (CONSTITUTION.md section 1.2). */
const FIXTURE = {
  /** Starting in-game date. Era tier 4 per ERA.md section 7. */
  startYear: 2005,
  startMonth: 3,
  startDay: 4,
  /** How many in-game days a real second covers at normal speed. */
  daysPerRealSecond: 0.5,
  /**
   * Price response. A market holding exactly its normal stock trades at the base
   * price; each 1% of shortfall or surplus moves it by this fraction.
   */
  priceElasticity: 0.9,
  /** Unrest gained per unit of daily food shortfall, lost per unit of surplus. */
  unrestPerDayOfShortfall: 0.22,
  unrestPerDayOfSurplus: 0.09,
  unrestCeiling: 0.95,
  unrestFloor: 0.02,
  /**
   * Person-days of food per person per day. One person-day is one person eating for
   * one day, so a town's daily demand is simply its population. This is the unit
   * `CAUSE_EFFECT.md` section 2 specifies for `food_stock`.
   */
  personDaysPerPersonPerDay: 1,
  /** Local production as a share of demand. Under 1 means the town imports the rest. */
  productionHealthy: 1.02,
  productionTroubled: 0.86,
  /** One grain unit bought or sold is this many person-days of town food stock. */
  grainUnitInPersonDays: 40,
  /**
   * Issues. A notable's request, the notice given when it is taken, and what serving it is
   * worth. Mirrors `balance.toml`'s `[issue]` block, which is the authority for these
   * numbers in the real simulation.
   */
  /** Share of the shortfall the taker must actually close. Below one, on purpose. */
  issueDeliverTolerance: 0.8,
  issueDeliverDeadlineDays: 24,
  issueHideoutDeadlineDays: 30,
  issueEscortDeadlineDays: 20,
  /** The disorder level a hideout issue is measured against, in the fixture's own units. */
  issueHideoutCrimeTarget: 0.2,
  /** The road safety an escorted road must reach, 0 to 1. */
  issueEscortSafetyTarget: 0.75,
  /** Rewards scale with what is at stake and with the notable's power. */
  issueRewardMoneyPerUnit: 0.85,
  issueRewardGoldPerUnit: 0.06,
  issueRewardRenownPerUnit: 0.14,
  issueRewardRelation: 18,
  /** How far walking away moves the notable's opinion, against their 0-100 standing. */
  issueAbandonRelationPenalty: 24,
  issueRelationShare: 0.5,
  /** How long an untaken offer survives before it lapses. */
  issueStaleOfferDays: 18,
  /**
   * The rumour feed: the smallest per-unit difference worth telling a player about, and
   * the most tips the feed will carry. These are the numbers the server passes to its own
   * rumour generator, so the double and the real thing publish the same feed.
   */
  rumourMinMargin: 5,
  rumourMax: 10,
  /**
   * Barter. A lord does not trade at the market price in either direction: they buy
   * under it and sell over it, and the difference is their margin. Barter is where
   * that margin shows up most plainly, because there is no money on the table to hide
   * it behind.
   */
  barterBuyShare: 0.82,
  barterSellShare: 1.24,
  /** What one gold coin is worth in money. `balance.toml` `gold_per_money = 22.0`. */
  barterGoldPerMoney: 22,
  /** Money one prisoner of quality 1 is worth on the day they are taken. */
  barterPrisonerBase: 34,
  /** A day in the cage raises what they fetch, up to a limit. */
  barterPrisonerDailyRise: 0.02,
  barterPrisonerDailyCap: 0.4,
  /**
   * How far short of even a deal this trader will still shake hands. A friend takes a
   * worse deal than a stranger; an enemy takes none at all.
   */
  barterTolerance: 0.04,
  barterTolerancePerRelation: 0.0006,
} as const;

const GOOD_NAMES: Record<GoodId, string> = {
  grain: "Grain",
  medicine: "Medicine",
  metal: "Metal",
  fuel: "Fuel",
  arms: "Arms",
  textiles: "Textiles",
  tools: "Tools",
  lumber: "Lumber",
};

const GOOD_IDS = Object.keys(GOOD_NAMES) as GoodId[];

/** Base prices. Seeded, not fixed: they are the starting values the Market system
 *  moves away from (ECONOMY.md section 7). */
const BASE_PRICE: Record<GoodId, number> = {
  grain: 12,
  medicine: 140,
  metal: 55,
  fuel: 30,
  arms: 210,
  textiles: 26,
  tools: 48,
  lumber: 19,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FixtureTownsSpec {
  settlementId: string;
  name: string;
  klass: "city" | "town" | "village";
  population: number | null;
  holder: string;
  unrest: number;
  loyalty: number;
  /** Days of food in store. Multiplied by demand to get the person-days the field holds. */
  daysOfFood: number;
  infected: number;
  /** Towns that are in trouble get a real pre-existing cause chain in the log. */
  scenario?: "shortage" | "outbreak" | "road-rot";
  /**
   * Which fog state this town is declared to be in. Fixed data, like everything else in
   * this file, and for the same reason: the client needs a snapshot carrying all three
   * states so the map's three renderings are exercised in the fixture build the
   * end-to-end tests run against. It is a declared shape, not a sighting rule, and the
   * real rule is `services/simulation/internal/systems/visibility/visibility.go`.
   */
  fog: "visible" | "remembered" | "unseen";
}

/** Twelve real places from `public/world/settlements.json`, with real populations. */
const TOWN_SPECS: FixtureTownsSpec[] = [
  { settlementId: "denver", name: "Denver", klass: "city", population: 715513, holder: "Halloway", unrest: 0.31, loyalty: 0.62, daysOfFood: 9.4, infected: 0.02, fog: "visible" },
  { settlementId: "aurora", name: "Aurora", klass: "city", population: 386333, holder: "Halloway", unrest: 0.24, loyalty: 0.7, daysOfFood: 12.1, infected: 0.01, fog: "visible" },
  { settlementId: "lakewood", name: "Lakewood", klass: "city", population: 155999, holder: "Halloway", unrest: 0.19, loyalty: 0.74, daysOfFood: 14.6, infected: 0.0, fog: "visible" },
  { settlementId: "boulder", name: "Boulder", klass: "city", population: 108556, holder: "Vashti", unrest: 0.38, loyalty: 0.55, daysOfFood: 6.2, infected: 0.03, fog: "visible" },
  { settlementId: "thornton", name: "Thornton", klass: "city", population: 141865, holder: "Halloway", unrest: 0.22, loyalty: 0.71, daysOfFood: 11.3, infected: 0.01, fog: "visible" },
  { settlementId: "arvada", name: "Arvada", klass: "town", population: 124354, holder: "Halloway", unrest: 0.27, loyalty: 0.66, daysOfFood: 8.8, infected: 0.02, fog: "visible" },
  { settlementId: "broomfield", name: "Broomfield", klass: "town", population: 74106, holder: "Halloway", unrest: 0.21, loyalty: 0.73, daysOfFood: 13.2, infected: 0.01, fog: "remembered" },
  { settlementId: "longmont", name: "Longmont", klass: "town", population: 98919, holder: "Vashti", unrest: 0.44, loyalty: 0.48, daysOfFood: 3.1, infected: 0.06, scenario: "shortage", fog: "remembered" },
  { settlementId: "golden", name: "Golden", klass: "town", population: 20415, holder: "Vashti", unrest: 0.72, loyalty: 0.29, daysOfFood: 0.4, infected: 0.14, scenario: "outbreak", fog: "remembered" },
  { settlementId: "idaho-springs", name: "Idaho Springs", klass: "town", population: 15273, holder: "Vashti", unrest: 0.49, loyalty: 0.51, daysOfFood: 5.5, infected: 0.04, scenario: "road-rot", fog: "unseen" },
  { settlementId: "nederland", name: "Nederland", klass: "town", population: 1470, holder: "Vashti", unrest: 0.35, loyalty: 0.6, daysOfFood: 7.4, infected: 0.02, fog: "unseen" },
  { settlementId: "central-city", name: "Central City", klass: "village", population: null, holder: "Vashti", unrest: 0.28, loyalty: 0.66, daysOfFood: 9.0, infected: 0.01, fog: "unseen" },
];

/**
 * The fog constants the fixture declares, matching the apiserver's fog block field for
 * field. Fixed numbers so the data-source panel has something to print and the tests have
 * something to assert on. The real values come from `visibility.sight_radius_km` and
 * `visibility.sighting_memory_days` in the simulation's config.
 */
const FIXTURE_FOG = {
  sideId: "side-1",
  sightRadiusKm: 24,
  sightRadiusLeagues: 24 / 4.828032,
  sightingMemoryDays: 3,
  /**
   * The fixture's own clock, in the unit `lastSeen` is counted in.
   *
   * Present because the real block carries one and a fixture that omitted it would make
   * the staleness code path untestable against the fixture: every town would be
   * `unknown`, nothing would fade, and a client regression there would never show up in a
   * run. Chosen so that the fixture actually exercises both bands — towns seen 2 ticks
   * ago are inside the 3-day memory window and towns seen 20 are well past it.
   */
  tick: 22,
} as const;

/** How long ago the fixture last laid eyes on each town, in `FIXTURE_FOG.tick` units. */
const FIXTURE_LAST_SEEN: Record<FixtureTownsSpec["fog"], number> = {
  // Seen on the current tick: in sight, and drawn in full.
  visible: 22,
  // Seen two ticks ago: still inside the sighting memory, so the simulation keeps counting
  // it as visible even though nobody is standing there. This is the band that exists
  // because of the memory window rather than because of the map.
  remembered: 20,
  unseen: -1,
};

const RULER_SPECS = [
  { name: "Ilse Halloway", faction: "Mountain Alliance", tier: "side-leader" as const, holdings: ["denver", "aurora", "lakewood", "thornton", "arvada", "broomfield"], influence: 92, renown: 74, loyalty: 0.81, relation: 34 },
  { name: "Corin Vashti", faction: "Mountain Alliance", tier: "state-governor" as const, holdings: ["boulder", "longmont", "golden", "idaho-springs", "nederland", "central-city"], influence: 61, renown: 48, loyalty: 0.63, relation: 11 },
  { name: "Nadine Oyelaran", faction: "Great Lakes Union", tier: "side-leader" as const, holdings: [], influence: 88, renown: 81, loyalty: 0.77, relation: -22 },
  { name: "Teodor Brekke", faction: "Pacific Compact", tier: "state-governor" as const, holdings: [], influence: 44, renown: 39, loyalty: 0.58, relation: -6 },
  { name: "Marta Sandoval", faction: "Atlantic Corridor", tier: "city-ruler" as const, holdings: [], influence: 37, renown: 52, loyalty: 0.69, relation: 19 },
  { name: "Oyelaran Pryce", faction: "Lone Star Frontier", tier: "lord" as const, holdings: [], influence: 29, renown: 34, loyalty: 0.51, relation: 4 },
  { name: "Halvard Ek", faction: "Southern Compact", tier: "lord" as const, holdings: [], influence: 33, renown: 41, loyalty: 0.47, relation: -14 },
  { name: "Bettina Roux", faction: "Mountain Alliance", tier: "mercenary-captain" as const, holdings: [], influence: 8, renown: 22, loyalty: 0.2, relation: 9 },
];

/**
 * The ids a town's `holder` shorthand resolves to.
 *
 * Written out rather than parsed back out of a lord's name, because both the town panel's
 * "Held by" line and the barter screen's counterparty hang off this, and a spelling
 * change in a fixture should not quietly leave one of them with nobody to talk to.
 */
const HOLDER_RULER_ID: Record<string, string> = { Halloway: "ruler-0", Vashti: "ruler-1" };

/**
 * A notable: a non-ruler person who holds local power and can therefore ask for help.
 *
 * `role` is the gate on which requests this person will put their name to, exactly as the
 * simulation gates it: a gang boss asks for a hideout cleared and would not ask anyone to
 * haul sacks of grain. Keeping the gate in the roster rather than hard-coding it per issue
 * is the difference between one rule in one table and a cross product.
 */
interface FixtureNotable {
  id: string;
  name: string;
  role: string;
  settlementId: string;
  /** How much this person sways their settlement, 0 to 1. */
  power: number;
  /** Their opinion of the player, 0 to 100 on the client's standing scale. */
  relation: number;
  grievance: number;
}

/** The roles the simulation knows, and which requests each will put their name to. */
const NOTABLE_ROLES: { role: string; kinds: IssueKind[] }[] = [
  { role: "mayor", kinds: ["deliver-goods", "clear-hideout"] },
  { role: "foreman", kinds: ["deliver-goods", "escort"] },
  { role: "merchant", kinds: ["deliver-goods", "escort"] },
  { role: "shopkeeper", kinds: ["deliver-goods"] },
  { role: "headman", kinds: ["deliver-goods"] },
  { role: "doctor", kinds: ["deliver-goods"] },
  { role: "gang boss", kinds: ["clear-hideout"] },
  { role: "militia captain", kinds: ["clear-hideout"] },
];

/** The three requests the simulation generates, and what each is measured against. */
const ISSUE_UNIT: Record<IssueKind, string> = {
  "deliver-goods": "grain units",
  "clear-hideout": "disorder",
  escort: "road safety",
};

/** Display names for the three issue kinds. */
const ISSUE_KIND_NAMES: Record<IssueKind, string> = {
  "deliver-goods": "Deliver goods",
  "clear-hideout": "Clear hideout",
  escort: "Escort",
};

/**
 * The three goods the rumour generator scans, each paired with the good this client calls
 * it by.
 *
 * `food` is the simulation's key for what the rest of this client calls `grain` — its
 * price field is `PriceFood`, while `GOODS` and the top bar say "Grain" — so the pair is
 * written out rather than worked out, and the sentence below says `food` for the same
 * reason the real generator does.
 */
const RUMOUR_GOODS: { simKey: RumourGood; clientGood: GoodId }[] = [
  { simKey: "food", clientGood: "grain" },
  { simKey: "medicine", clientGood: "medicine" },
  { simKey: "metal", clientGood: "metal" },
];

/** Names for generated notables, cycled by index. */
const NOTABLE_NAMES: string[] = [
  "Marcus Webb", "Elena Vasquez", "James Okafor", "Sarah Lindqvist", "David Chen",
  "Maria Santos", "Robert Hayes", "Aisha Johnson", "Thomas Mueller", "Lisa Park",
  "William Carter", "Ana Rodriguez", "Michael Torres", "Jennifer Kim", "Daniel Brooks",
  "Sofia Andersson", "Kevin O'Brien", "Rachel Green", "Anthony Russo", "Nina Petrov",
];

/** Format a number as a whole number for display. */
function whole(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Capitalize the first letter of a string. */
function cap(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Sort order for the issue board: live work first, then offers by expiry,
 * then history newest first.
 */
function byBoardOrder(a: Issue, b: Issue): number {
  const stateRank = (s: Issue["state"]): number => {
    switch (s) {
      case "accepted": return 0;
      case "offered": return 1;
      case "succeeded": return 2;
      case "failed": return 3;
      default: return 4;
    }
  };
  const ra = stateRank(a.state);
  const rb = stateRank(b.state);
  if (ra !== rb) return ra - rb;
  if (a.state === "offered" && b.state === "offered") {
    return a.deadlineDay - b.deadlineDay;
  }
  return (b.startedDay ?? 0) - (a.startedDay ?? 0);
}

/**
 * The fixture's own record of one outstanding request.
 *
 * It is not the contract type on purpose: the contract sends a projected `Issue` with
 * progress and the requirement sentence already resolved from world state, while this holds
 * the raw readings and the state. A double that returned the contract type directly would
 * be returning a copy of itself with the interesting part done for it.
 */
interface FixtureIssue {
  id: string;
  kind: IssueKind;
  notableId: string;
  settlementId: string;
  targetName: string | null;
  /** Road safety at the moment the offer was made, for an escort. */
  roadSafety: number;
  /** What is at stake, in `unit`. For a delivery, grain units of food. */
  amount: number;
  /** The objective's reading when it was taken, in the same unit as `amount`. */
  baseline: number;
  state: IssueState;
  startedDay: number | null;
  deadlineDay: number;
  deadlineDays: number;
  reward: IssueReward;
  steps: IssueStep[];
}

export function createFixtureSimulationProvider(options: { seed?: number } = {}): SimulationProvider {
  const state = new FixtureState(options.seed ?? 20050304);
  return {
    kind: "fixture",
    label: `${FIXTURE_MARKER} · Ohio River Valley`,
    getSnapshot: async () => state.snapshot(),
    trade: async (request) => state.trade(request),
    recruit: async (request) => state.recruit(request),
    barterTerms: async (traderId, townId) => state.barterTerms(traderId, townId),
    proposeBarter: async (request) => state.proposeBarter(request),
    commitBarter: async (request) => state.commitBarter(request),
    issueBoard: async (partyId) => state.issueBoard(partyId),
    acceptIssue: async (request) => state.acceptIssue(request),
    completeIssue: async (request) => state.completeIssue(request),
    abandonIssue: async (request) => state.abandonIssue(request),
    rumours: async () => state.rumours(),
    planMarch: async (request) => state.planMarch(request),
    commitMarch: async (request) => state.commitMarch(request),
    setTimeScale: (daysPerRealSecond) => state.setTimeScale(daysPerRealSecond),
    skipToArrival: async () => state.skipToArrival(),
    why: async (entityId, field) => state.why(entityId, field),
    subscribeTicks: (onTick, onStatus) => state.subscribe(onTick, onStatus),
  };
}

class FixtureState {
  #day: number = FIXTURE.startDay;
  #month: number = FIXTURE.startMonth;
  #year: number = FIXTURE.startYear;
  #tick = 0;
  #cause = new Map<string, CauseRow>();
  #sequence = 0;
  #random: () => number;
  #towns = new Map<string, TownState>();
  #markets = new Map<string, MarketState>();
  #party!: PartyState;
  #rulers: RulerState[] = [];
  #notables: FixtureNotable[] = [];
  #issues = new Map<string, FixtureIssue>();
  #warnings: ResourceWarning[] = [];
  #notifications: Notification[] = [];
  #ledger!: Ledger;
  #player = { partyId: "party-player", characterName: "Wren Calloway", factionId: "mountain-alliance", resources: { money: 2180, gold: 340, food: 46, metal: 62, medicine: 8 }, influence: 0, renown: 0 };
  #timer: ReturnType<typeof setInterval> | null = null;
  #tickListeners: ((t: TickUpdate) => void)[] = [];

  constructor(seed: number) {
    this.#random = mulberry32(seed);
    this.#build();
    this.#seedCauseChains();
    this.#seedIssues();
  }

  // -- construction ---------------------------------------------------------

  #build(): void {
    const rand = this.#random;
    for (const spec of TOWN_SPECS) {
      const id = `town-${spec.settlementId}`;
      const population = spec.population;
      const workers = population === null ? 0 : Math.round(population * 0.46);
      // Person-days per day. A town with no surveyed population gets a small fixed
      // demand rather than zero, because it still eats.
      const demand =
        population === null ? 400 : Math.round(population * FIXTURE.personDaysPerPersonPerDay);
      const troubled = spec.scenario === "outbreak" || spec.scenario === "shortage";
      const production = Math.round(demand * (troubled ? FIXTURE.productionTroubled : FIXTURE.productionHealthy));
      this.#towns.set(id, {
        id,
        settlementId: spec.settlementId,
        name: spec.name,
        klass: spec.klass,
        holderId: HOLDER_RULER_ID[spec.holder] ?? null,
        holderName: spec.holder,
        population,
        workers,
        foodStock: Math.round(demand * spec.daysOfFood),
        foodProduction: production,
        foodDemand: demand,
        medicineStock: spec.infected > 0.08 ? 40 : 320,
        sanitation: spec.infected > 0.08 ? 0.44 : 0.78,
        infected: spec.infected,
        crowding: spec.infected > 0.08 ? 0.71 : 0.33,
        unrest: spec.unrest,
        loyalty: spec.loyalty,
        prosperity: 0.5 + rand() * 0.3,
        taxRate: 0.22,
        garrison: spec.klass === "city" ? 420 : 90,
        garrisonConduct: 0.74,
        roadSafety: spec.scenario === "road-rot" ? 0.21 : 0.62 + rand() * 0.2,
        informationTrust: 0.5 + rand() * 0.3,
        money: Math.round((population ?? 900) * 2.4),
        gold: Math.round((population ?? 900) * 0.6),
        metal: Math.round((population ?? 900) * 0.9),
        updatedTick: 0,
        // Fog, from the declared state on the spec rather than from any rule. `known`
        // is the union of visible and remembered, matching what the simulation's
        // `EverSeenSides` mask means: a sighting is never forgotten, so a town that
        // leaves sight is remembered rather than unknown.
        visible: spec.fog === "visible",
        known: spec.fog !== "unseen",
        lastSeenTick: spec.fog === "unseen" ? 0 : 1,
        access: { allowed: true, reason: "" },
        recruitable: RECRUITABLE_UNITS.map((u) => ({
          ...u,
          available: Math.max(4, Math.round((RECRUIT_BASE_AVAILABLE[u.unitId] ?? 10) * sizeFactorFor(population))),
        })),
      });
      this.#markets.set(id, this.#market(id, population));
    }

    this.#party = {
      id: "party-player",
      name: "Wren Calloway's party",
      leaderName: "Wren Calloway",
      factionId: "mountain-alliance",
      position: { x: 0, z: 0 },
      destination: null,
      route: [],
      marchingSinceDay: null,
      food: 46,
      medicine: 8,
      metal: 62,
      money: 2180,
      morale: 0.78,
      fatigue: 0.12,
      wagesOwed: 0,
      speedKmPerDay: 34,
      troops: [
        { id: "t-riflemen", name: "Riflemen", count: 18, quality: 3, wage: 0.9, morale: 0.8 },
        { id: "t-drivers", name: "Drivers", count: 6, quality: 2, wage: 1.2, morale: 0.76 },
        { id: "t-surgeon", name: "Field surgeon", count: 1, quality: 4, wage: 3.1, morale: 0.85 },
      ],
      prisoners: PARTY_PRISONERS.map((p) => ({ ...p })),
      roles: { quartermaster: "Ivo Petran", surgeon: "Ada Renko", scout: "Bil Todd" },
      goods: [{ goodId: "grain", name: "Grain", quantity: 0, avgPaid: 0 }],
    };

    this.#rulers = RULER_SPECS.map((r, i) => ({
      id: `ruler-${i}`,
      name: r.name,
      factionId: r.faction.toLowerCase().replace(/\s+/g, "-"),
      factionName: r.faction,
      tier: r.tier,
      age: 34 + Math.floor(rand() * 30),
      traits: {
        valor: round2(0.3 + rand() * 0.6),
        mercy: round2(0.25 + rand() * 0.6),
        honor: round2(0.3 + rand() * 0.55),
        generosity: round2(0.2 + rand() * 0.65),
        calculation: round2(0.35 + rand() * 0.55),
      },
      ambitions: pick(this.#random, ["more land", "security", "revenge", "wealth", "a rival's downfall"]),
      holdings: r.holdings.map((h) => ({ settlementId: h, name: TOWN_SPECS.find((t) => t.settlementId === h)?.name ?? h })),
      garrison: 60 + Math.floor(rand() * 900),
      prisoners: rulerPrisonersFor(i, rand),
      wealth: {
        money: 4000 + Math.floor(rand() * 90000),
        gold: 100 + Math.floor(rand() * 4000),
        food: 30 + Math.floor(rand() * 900),
        metal: 40 + Math.floor(rand() * 1200),
        medicine: 20 + Math.floor(rand() * 600),
      },
      loyaltyToLeader: r.loyalty,
      influence: r.influence,
      renown: r.renown,
      relationToPlayer: r.relation,
      recentEvents: [],
    }));

    this.#rebuildLedger();
    this.#refreshWarnings();
  }

  /**
   * A market is the tradable stock a caravan deals in, not the town's whole harvest.
   *
   * That scale is what makes a trade legible: a load of 40 or 60 units is a real
   * fraction of a market of 90, so the price visibly moves, and it costs a purse of a
   * couple of thousand something the player can actually decide about. Markets scale
   * a little with town size, so Denver's is larger than Nederland's.
   */
  #market(townId: string, population: number | null): MarketState {
    const town = this.#towns.get(townId)!;
    const sizeFactor = sizeFactorFor(population);
    const goods: MarketGood[] = GOOD_IDS.map((goodId) => {
      const units = Math.round(GOOD_MARKET_UNITS[goodId] * sizeFactor);
      // Medicine is scarce wherever there is an outbreak, which is the sort of thing
      // the real Market system produces from scarcity rather than from a script.
      const scarcity = goodId === "medicine" ? 1 + town.infected * 4 : 1;
      const demand = Math.round(units * (0.92 + this.#random() * 0.2));
      const stock = Math.round(demand * (0.78 + this.#random() * 0.24));
      const price = round2(BASE_PRICE[goodId] * scarcity * priceFor(stock, demand));
      return {
        goodId,
        name: GOOD_NAMES[goodId],
        price,
        previousPrice: null,
        history: [
          { day: Math.max(1, FIXTURE.startDay - 6), price: round2(price * (0.97 + this.#random() * 0.06)) },
          { day: Math.max(1, FIXTURE.startDay - 3), price: round2(price * (0.99 + this.#random() * 0.02)) },
          { day: FIXTURE.startDay, price },
        ],
        stock,
        demand,
      };
    });
    return { townId, goods };
  }

  /**
   * Pre-existing cause chains, so the Why panel has real history to walk on load and
   * not only history the player just made.
   *
   * These are the chains from `CAUSE_EFFECT.md` sections 5 and 10, expressed as a
   * `causedBy` graph. `linked()` walks backwards from the newest row, so the graph
   * shape is what produces the chain, not an array that happens to be in order.
   */
  #seedCauseChains(): void {
    // Chain A — Longmont, a food shortage. Golden's famine echoes it.
    const lm = "town-longmont";
    const a1 = this.#row("foodStock", lm, "Longmont", 880229, 603370, "Food", [], "Longmont's grain store fell from 8.9 days to 6.1 days of food.");
    const a2 = this.#row("grain_stock", lm, "Longmont", 1420, 980, "Logistics", [a1], "A grain shipment of 440 units never arrived at Longmont.");
    const a3 = this.#row("road_safety", lm, "Longmont", 0.68, 0.29, "Security", [], "Road safety on the Longmont approach fell from 0.68 to 0.29.");
    const a4 = this.#row("garrison", lm, "Longmont", 120, 38, "Military upkeep", [a3], "Longmont's garrison fell from 120 to 38 soldiers.");
    this.#cause.set(a2, this.#get(a2)!);
    this.#cause.get(a2)!.causedBy = [a4];
    const a5 = this.#row("grain_price", lm, "Longmont", 11.4, 15.8, "Market", [a2], "Grain in Longmont rose from 11.4 to 15.8 per unit.");
    const a6 = this.#row("unrest", lm, "Longmont", 0.28, 0.44, "Unrest", [a5], "Unrest in Longmont rose from 0.28 to 0.44.");
    this.#row("loyalty", lm, "Longmont", 0.58, 0.48, "Loyalty", [a6], "Loyalty in Longmont fell from 0.58 to 0.48.");
    const lmTown = this.#towns.get(lm)!;
    lmTown.foodStock = Math.round(lmTown.foodDemand * 6.1);
    lmTown.unrest = 0.44;
    lmTown.loyalty = 0.48;
    lmTown.roadSafety = 0.29;
    lmTown.garrison = 38;
    this.#pushHistory(lm, "The grain road was left undefended for eleven days.", a4);

    // Chain B — Golden, the plague chain of CAUSE_EFFECT.md section 5, case 2.
    const gd = "town-golden";
    const b1 = this.#row("medicine_stock", gd, "Golden", 320, 40, "Disease", [], "Golden's medicine stock fell from 320 to 40 doses.");
    const b2 = this.#row("medicine_convoy", gd, "Golden", 0, 0, "Logistics", [b1], "The medicine caravan bound for Golden was robbed on the Golden–Idaho Springs road.");
    const b3 = this.#row("road_safety", gd, "Golden", 0.55, 0.18, "Security", [], "Road safety on the Golden–Idaho Springs road fell from 0.55 to 0.18.");
    this.#cause.get(b2)!.causedBy = [b3];
    const b4 = this.#row("infected", gd, "Golden", 0.02, 0.14, "Disease", [b1, b2], "Infection in Golden rose from 2% to 14% of the population.");
    const b5 = this.#row("workers", gd, "Golden", 9400, 6100, "Labor", [b4], "Golden lost 3,300 of its 9,400 workers to sickness.");
    const b6 = this.#row("food_production", gd, "Golden", 20823, 17557, "Labor", [b5], "Golden's food production fell from 20,823 to 17,557 person-days per day.");
    const b7 = this.#row("foodStock", gd, "Golden", 59203, 8166, "Food", [b6], "Golden's food stock fell from 2.9 days to 0.4 days of food.");
    const b8 = this.#row("unrest", gd, "Golden", 0.51, 0.72, "Unrest", [b7], "Unrest in Golden rose from 0.51 to 0.72.");
    this.#row("loyalty", gd, "Golden", 0.41, 0.29, "Loyalty", [b8], "Loyalty in Golden fell from 0.41 to 0.29.");
    const gdTown = this.#towns.get(gd)!;
    gdTown.foodStock = Math.round(gdTown.foodDemand * 0.4);
    gdTown.unrest = 0.72;
    gdTown.loyalty = 0.29;
    gdTown.infected = 0.14;
    gdTown.workers = 6100;
    gdTown.medicineStock = 40;
    gdTown.roadSafety = 0.18;
    this.#pushHistory(gd, "An outbreak began after a medicine shipment was taken on the road.", b4);

    // Chain C — Idaho Springs, road rot (CAUSE_EFFECT.md section 5, case 3).
    const is = "town-idaho-springs";
    const c1 = this.#row("garrison", is, "Idaho Springs", 140, 12, "Military upkeep", [], "Idaho Springs' garrison fell from 140 to 12 soldiers.");
    const c2 = this.#row("road_safety", is, "Idaho Springs", 0.66, 0.21, "Security", [c1], "Road safety around Idaho Springs fell from 0.66 to 0.21.");
    const c3 = this.#row("raider_pressure", is, "Idaho Springs", 0.08, 0.41, "Security", [c2], "Raider pressure on the Idaho Springs roads rose from 0.08 to 0.41.");
    const c4 = this.#row("caravans_lost", is, "Idaho Springs", 0, 6, "Logistics", [c3], "Six caravans working out of Idaho Springs were lost in a fortnight.");
    this.#cause.get(c4)!.causedBy = [c2];
    this.#row("medicine_stock", is, "Idaho Springs", 210, 60, "Logistics", [c4], "Idaho Springs' medicine stock fell from 210 to 60 doses.");
    const isTown = this.#towns.get(is)!;
    isTown.garrison = 12;
    isTown.roadSafety = 0.21;
    isTown.medicineStock = 60;
    isTown.foodStock = Math.round(isTown.foodDemand * 5.5);
    this.#pushHistory(is, "The garrison was pulled out, and the roads went unattended.", c1);
  }

  #row(field: string, entityId: string, entityName: string, old: number, next: number, system: string, causedBy: string[], summary: string): string {
    this.#sequence += 1;
    const id = `c-${String(this.#sequence).padStart(5, "0")}`;
    this.#cause.set(id, {
      id,
      tick: this.#tick,
      day: this.#day,
      entityId,
      entityName,
      field,
      old,
      new: next,
      system,
      causedBy,
      summary,
    });
    return id;
  }

  #get(id: string): CauseRow | undefined {
    return this.#cause.get(id);
  }

  #pushHistory(entityId: string, text: string, causedBy?: string): void {
    this.#notifications.push({
      id: `n-hist-${entityId}`,
      day: this.#day - 4,
      priority: "important",
      text,
      entityId,
      field: null,
      ...(causedBy === undefined ? {} : { causedBy }),
    });
  }

  // -- reads ----------------------------------------------------------------

  snapshot(): SimSnapshot {
    return {
      day: this.#day,
      year: this.#year,
      eraTier: 4,
      player: { ...this.#player, resources: { ...this.#player.resources } },
      party: structuredClone(this.#party),
      towns: [...this.#towns.values()].map((t) => ({ ...t })),
      villages: [],
      fog: this.#fog(),
      markets: Object.fromEntries([...this.#markets].map(([k, v]) => [k, structuredClone(v)])),
      sides: buildFixtureSides(),
      rulers: structuredClone(this.#rulers),
      ledger: structuredClone(this.#ledger),
      warnings: structuredClone(this.#warnings),
      notifications: structuredClone(this.#notifications.slice(-40)),
      causeLog: Object.fromEntries([...this.#cause].map(([k, v]) => [k, { ...v }])),
    };
  }

  /**
   * The fog block, in the apiserver's shape: three explicit id lists, the three counts,
   * and the radius in both units. Assembled from the declared state on each town spec.
   *
   * The three lists are written out rather than derived from each other, because that is
   * what the server does and the client is being fed this in place of a server. A fixture
   * that handed the client a derived list would be testing the client's own arithmetic
   * instead of its reading of the contract.
   */
  #fog(): FogState {
    const idsFor = (state: FixtureTownsSpec["fog"]): string[] =>
      TOWN_SPECS.filter((s) => s.fog === state).map((s) => `town-${s.settlementId}`);
    const visibleTowns = idsFor("visible");
    const knownTowns = TOWN_SPECS.filter((s) => s.fog !== "unseen").map((s) => `town-${s.settlementId}`);
    const unseenTowns = idsFor("unseen");
    // Only for towns this side has found, and only where the sighting is a real one —
    // the same rule `buildFog` follows in `cmd/apiserver/snapshot.go`, so a fixture town
    // that is unseen here is unseen there too and the two agree on what absence means.
    const lastSeen: Record<string, number> = {};
    for (const spec of TOWN_SPECS) {
      const seen = FIXTURE_LAST_SEEN[spec.fog];
      if (seen >= 0) lastSeen[`town-${spec.settlementId}`] = seen;
    }
    return {
      sideId: FIXTURE_FOG.sideId,
      sightRadiusKm: FIXTURE_FOG.sightRadiusKm,
      sightRadiusLeagues: FIXTURE_FOG.sightRadiusLeagues,
      sightingMemoryDays: FIXTURE_FOG.sightingMemoryDays,
      tick: FIXTURE_FOG.tick,
      lastSeen,
      visibleTowns,
      knownTowns,
      unseenTowns,
      counts: {
        visible: visibleTowns.length,
        known: knownTowns.length,
        unseen: unseenTowns.length,
        total: TOWN_SPECS.length,
      },
    };
  }

  /**
   * Walk the cause log.
   *
   * This is the whole premise, so it is a real graph walk: start at the newest row
   * for the field, then follow `causedBy` breadth-first, deduplicating by id so a
   * diamond in the graph cannot make a row appear twice. A single-cause answer or a
   * canned sentence is exactly the failure the premise forbids.
   */
  why(entityId: string, field: string): WhyChain {
    const rows = [...this.#cause.values()].filter((r) => r.entityId === entityId && r.field === field);
    if (rows.length === 0) {
      return { entityId, field, rows: [], related: [], totalDepth: 0, truncated: false };
    }
    const start = rows[rows.length - 1]!;

    const ordered: CauseRow[] = [start];
    const seen = new Set<string>([start.id]);
    const queue: { id: string; depth: number }[] = [{ id: start.id, depth: 0 }];
    let deepest = 0;
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const row = this.#get(id);
      if (!row) continue;
      deepest = Math.max(deepest, depth);
      for (const parentId of row.causedBy) {
        if (seen.has(parentId)) continue;
        const parent = this.#get(parentId);
        if (!parent) continue;
        seen.add(parentId);
        ordered.push(parent);
        queue.push({ id: parentId, depth: depth + 1 });
      }
    }

    // Anything in the same entity that this walk touched, for the "also changed" rail.
    const related = [...this.#cause.values()].filter(
      (r) => r.entityId === entityId && !seen.has(r.id) && ordered.length < 24,
    );
    return { entityId, field, rows: ordered, related, totalDepth: deepest + 1, truncated: false };
  }

  // -- writes ---------------------------------------------------------------

  async trade(request: TradeRequest): Promise<TradeResult> {
    if (request.quantity <= 0 || !Number.isInteger(request.quantity)) {
      throw new Error(`Trade quantity must be a positive whole number, got ${request.quantity}`);
    }
    const town = this.#towns.get(request.townId);
    if (!town) throw new Error(`No town with id ${request.townId}`);
    const market = this.#markets.get(request.townId);
    if (!market) throw new Error(`No market for town ${request.townId}`);
    const good = market.goods.find((g) => g.goodId === request.goodId);
    if (!good) throw new Error(`${request.goodId} is not traded at ${town.name}`);

    const held = this.#party.goods.find((g) => g.goodId === request.goodId);
    const partyQuantity = held?.quantity ?? 0;
    const total = round2(good.price * request.quantity);

    if (request.side === "buy") {
      if (this.#player.resources.money < total) {
        return {
          accepted: false,
          side: request.side,
          goodName: good.name,
          unitPrice: good.price,
          quantity: request.quantity,
          total,
          partyQuantity,
          marketPriceAfter: good.price,
          reason: `Short ${formatMoney(total - this.#player.resources.money)}. You have ${formatMoney(this.#player.resources.money)}. Sell first, or take a contract.`,
          causedBy: "trade-rejected",
        };
      }
      if (good.stock < request.quantity) {
        return {
          accepted: false,
          side: request.side,
          goodName: good.name,
          unitPrice: good.price,
          quantity: request.quantity,
          total,
          partyQuantity,
          marketPriceAfter: good.price,
          reason: `${town.name} has only ${good.stock} of ${good.name.toLowerCase()} in store.`,
          causedBy: "trade-rejected",
        };
      }
      this.#player.resources.money = round2(this.#player.resources.money - total);
      good.stock -= request.quantity;
      setHeld(this.#party, request.goodId, partyQuantity + request.quantity, good.price);
    } else {
      if (partyQuantity < request.quantity) {
        return {
          accepted: false,
          side: request.side,
          goodName: good.name,
          unitPrice: good.price,
          quantity: request.quantity,
          total,
          partyQuantity,
          marketPriceAfter: good.price,
          reason: `You hold ${partyQuantity} of ${good.name.toLowerCase()}. Buy some before selling.`,
          causedBy: "trade-rejected",
        };
      }
      this.#player.resources.money = round2(this.#player.resources.money + total);
      good.stock += request.quantity;
      setHeld(this.#party, request.goodId, partyQuantity - request.quantity, held?.avgPaid ?? good.price);
    }

    // A real trade moves the price, because the Market system reads scarcity and the
    // stock just changed. The chain records every link so the Why panel can walk it.
    const oldPrice = good.price;
    const newPrice = round2(
      Math.max(0.5, BASE_PRICE[request.goodId] * priceFor(good.stock, good.demand)),
    );
    good.previousPrice = oldPrice;
    good.price = newPrice;
    good.history = [...good.history, { day: this.#day, price: newPrice }].slice(-24);

    const tradeEvent = this.#row(
      "trade",
      this.#party.id,
      this.#party.name,
      request.side === "buy" ? -total : total,
      0,
      "Player",
      [],
      `You ${request.side === "buy" ? "bought" : "sold"} ${request.quantity} ${good.name.toLowerCase()} at ${town.name} for ${formatMoney(total)}.`,
    );
    const stockRow = this.#row(
      `${request.goodId}_stock`,
      town.id,
      town.name,
      good.stock + (request.side === "buy" ? -request.quantity : request.quantity),
      good.stock,
      "Market",
      [tradeEvent],
      `${town.name}'s ${good.name.toLowerCase()} store moved by ${request.quantity} units.`,
    );
    const priceRow = this.#row(
      `${request.goodId}_price`,
      town.id,
      town.name,
      oldPrice,
      newPrice,
      "Market",
      [stockRow],
      `${good.name} at ${town.name} moved from ${oldPrice} to ${newPrice} per unit.`,
    );
    // Grain sold into a town becomes that town's food stock. This is the link that
    // makes a trade into a starving place visible on the town panel, and the one the
    // Why panel walks back from unrest to the player's own order.
    if (request.goodId === "grain") {
      const beforeStock = town.foodStock;
      const delta = request.side === "sell" ? request.quantity : -request.quantity;
      town.foodStock = Math.max(0, Math.round(town.foodStock + delta * FIXTURE.grainUnitInPersonDays));
      const stockRow2 = this.#row(
        "foodStock",
        town.id,
        town.name,
        beforeStock,
        town.foodStock,
        "Food",
        [stockRow],
        `${town.name}'s food stock moved from ${(beforeStock / Math.max(1, town.foodDemand)).toFixed(1)} to ${(town.foodStock / Math.max(1, town.foodDemand)).toFixed(1)} days.`,
      );
      // A town eating into relief calms down a little; a town being sold grain it
      // cannot pay for gets restless. Both are the Unrest system reading shared state.
      const before = town.unrest;
      const relief = request.side === "sell" ? -0.02 : 0.01;
      const after = round2(clamp(before + relief, FIXTURE.unrestFloor, FIXTURE.unrestCeiling));
      town.unrest = after;
      this.#row("unrest", town.id, town.name, before, after, "Unrest", [stockRow2, priceRow], `${town.name}'s unrest moved from ${before} to ${after}.`);
    }

    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({ tick: this.#tick, day: this.#day, markets: { [town.id]: structuredClone(market) }, ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings) });

    return {
      accepted: true,
      side: request.side,
      goodName: good.name,
      unitPrice: oldPrice,
      quantity: request.quantity,
      total,
      partyQuantity: this.#party.goods.find((g) => g.goodId === request.goodId)?.quantity ?? 0,
      marketPriceAfter: newPrice,
      causedBy: priceRow,
    };
  }

  /**
   * Hire soldiers into the party.
   *
   * The hiring bonus comes out of the purse immediately, and the new mouths join the
   * wage bill and the ration line on the next tick, because the Ledger and Supply
   * systems read the party roster rather than a separate hiring record. The town's
   * pool of willing recruits drains, so hiring the same town dry is a real decision.
   */
  async recruit(request: RecruitRequest): Promise<RecruitResult> {
    if (request.quantity <= 0 || !Number.isInteger(request.quantity)) {
      throw new Error(`Recruit quantity must be a positive whole number, got ${request.quantity}`);
    }
    const town = this.#towns.get(request.townId);
    if (!town) throw new Error(`No town with id ${request.townId}`);
    const offered = town.recruitable.find((u) => u.unitId === request.unitId);
    if (!offered) throw new Error(`${request.unitId} cannot be raised at ${town.name}`);

    const totalCost = round2(offered.hireCost * request.quantity);
    if (offered.available < request.quantity) {
      return {
        accepted: false,
        unitName: offered.name,
        quantity: request.quantity,
        totalCost,
        newCount: this.#party.troops.find((t) => t.id === `t-${offered.unitId}`)?.count ?? 0,
        reason: `Only ${offered.available} ${offered.name.toLowerCase()} are willing to sign on at ${town.name}.`,
        causedBy: "recruit-rejected",
      };
    }
    if (this.#player.resources.money < totalCost) {
      return {
        accepted: false,
        unitName: offered.name,
        quantity: request.quantity,
        totalCost,
        newCount: this.#party.troops.find((t) => t.id === `t-${offered.unitId}`)?.count ?? 0,
        reason: `Short ${formatMoney(totalCost - this.#player.resources.money)}. You have ${formatMoney(this.#player.resources.money)}. The hiring bonus is ${formatMoney(offered.hireCost)} a head.`,
        causedBy: "recruit-rejected",
      };
    }

    this.#player.resources.money = round2(this.#player.resources.money - totalCost);
    offered.available -= request.quantity;
    const stackId = `t-${offered.unitId}`;
    const stack = this.#party.troops.find((t) => t.id === stackId);
    if (stack) {
      // Fresh recruits dilute the stack's quality toward the raw recruit quality, and
      // morale dips: veterans resent sharing the fire with green hands.
      const before = stack.count;
      stack.count += request.quantity;
      stack.quality = Math.round(((stack.quality * before + offered.quality * request.quantity) / stack.count) * 10) / 10;
      stack.morale = round2(clamp(stack.morale - 0.03, 0, 1));
    } else {
      this.#party.troops.push({
        id: stackId,
        name: offered.name,
        count: request.quantity,
        quality: offered.quality,
        wage: offered.wage,
        morale: 0.62,
      });
    }
    const newCount = this.#party.troops.find((t) => t.id === stackId)!.count;

    const hireEvent = this.#row(
      "recruit",
      this.#party.id,
      this.#party.name,
      -totalCost,
      0,
      "Player",
      [],
      `You hired ${request.quantity} ${offered.name.toLowerCase()} at ${town.name} for ${formatMoney(totalCost)}.`,
    );
    const causedBy = this.#row(
      "troops",
      this.#party.id,
      this.#party.name,
      newCount - request.quantity,
      newCount,
      "Military upkeep",
      [hireEvent],
      `${offered.name} in the party rose from ${newCount - request.quantity} to ${newCount}.`,
    );

    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({ tick: this.#tick, day: this.#day, party: structuredClone(this.#party), ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings) });

    return {
      accepted: true,
      unitName: offered.name,
      quantity: request.quantity,
      totalCost,
      newCount,
      causedBy,
    };
  }

  // -- barter ------------------------------------------------------------------
  //
  // Barter moves things and no money: goods for goods, prisoners for gold, a load of
  // grain for a stack of captives. So the only question the client cannot answer for
  // itself is whether the two sides are worth the same, and that is what `proposeBarter`
  // answers.
  //
  // What a thing is worth here is this lord's business. They pay under the market price
  // for anything they take off the table and charge over it for anything they put on it,
  // and a prisoner is worth what their quality and their days in the cage say he is
  // worth. The client is told both figures, adds them up, and is told yes or no.

  async barterTerms(traderId: string, townId: string): Promise<BarterTerms> {
    const trader = this.#ruler(traderId);
    const town = this.#towns.get(townId);
    if (!town) throw new Error(`No town with id ${townId}`);
    return this.#terms(trader, town);
  }

  async proposeBarter(request: BarterProposalRequest): Promise<BarterProposal> {
    const trader = this.#ruler(request.traderId);
    const town = this.#towns.get(request.townId);
    if (!town) throw new Error(`No town with id ${request.townId}`);
    return this.#appraise(trader, town, request);
  }

  async commitBarter(request: BarterProposalRequest): Promise<BarterResult> {
    const trader = this.#ruler(request.traderId);
    const town = this.#towns.get(request.townId);
    if (!town) throw new Error(`No town with id ${request.townId}`);
    const market = this.#markets.get(town.id);
    if (!market) throw new Error(`No market for town ${town.id}`);

    const proposal = this.#appraise(trader, town, request);
    const base = {
      ...proposal,
      day: this.#day,
      playerMoney: this.#player.resources.money,
      traderMoney: trader.wealth.money,
    };
    if (!proposal.accepted) {
      // This world is the authority on whether a deal can be struck. A client that
      // reaches here with a refused deal is refused again, with the tables untouched,
      // rather than accommodated.
      const terms = this.#terms(trader, town);
      return { ...base, playerItems: terms.playerItems, traderItems: terms.traderItems, causedBy: "barter-rejected" };
    }

    const barterRow = this.#row(
      "barter",
      this.#party.id,
      this.#party.name,
      proposal.playerValue,
      proposal.traderValue,
      "Player",
      [],
      `${this.#party.name} bartered at ${town.name} with ${trader.name}, ${formatMoney(proposal.playerValue)} against ${formatMoney(proposal.traderValue)}.`,
    );

    // -- what the player puts down ---------------------------------------------
    for (const line of request.offered) {
      if (line.kind === "good") {
        const good = market.goods.find((g) => g.goodId === line.itemId);
        if (!good) throw new Error(`${line.itemId} is not traded at ${town.name}`);
        const held = this.#party.goods.find((g) => g.goodId === line.itemId);
        const before = good.stock;
        // From the party into the town's store.
        good.stock += line.quantity;
        setHeld(this.#party, line.itemId as GoodId, (held?.quantity ?? 0) - line.quantity, held?.avgPaid ?? good.price);
        this.#row(
          `${line.itemId}_stock`,
          town.id,
          town.name,
          before,
          good.stock,
          "Market",
          [barterRow],
          `${town.name}'s ${good.name.toLowerCase()} store moved by ${line.quantity} units into ${this.#party.name}.`,
        );
        this.#movePrice(good, town, barterRow);
        // Grain that reaches a town is that town's food, whether it came over a market
        // counter or across a table.
        if (line.itemId === "grain") this.#grainReachesTown(town, line.quantity, barterRow);
      } else if (line.kind === "gold") {
        const before = trader.wealth.gold;
        this.#player.resources.gold = round2(this.#player.resources.gold - line.quantity);
        trader.wealth.gold = round2(trader.wealth.gold + line.quantity);
        this.#row(
          "gold",
          trader.id,
          trader.name,
          before,
          trader.wealth.gold,
          "Currency",
          [barterRow],
          `${trader.name}'s gold reserve rose from ${before} to ${trader.wealth.gold}.`,
        );
      } else {
        const taken = takePrisoners(this.#party.prisoners, line.itemId, line.quantity);
        addPrisoners(trader.prisoners, taken);
        this.#prisonerRow(trader, taken, line.quantity, barterRow, true);
      }
    }

// -- what the player takes away --------------------------------------------
    for (const line of request.asked) {
      if (line.kind === "good") {
        const good = market.goods.find((g) => g.goodId === line.itemId);
        if (!good) throw new Error(`${line.itemId} is not traded at ${town.name}`);
        const held = this.#party.goods.find((g) => g.goodId === line.itemId);
        const before = good.stock;
        // Out of the town's store and into the party's hold.
        good.stock -= line.quantity;
        setHeld(this.#party, line.itemId as GoodId, (held?.quantity ?? 0) + line.quantity, good.price);
        this.#row(
          `${line.itemId}_stock`,
          town.id,
          town.name,
          before,
          good.stock,
          "Market",
          [barterRow],
          `${town.name}'s ${good.name.toLowerCase()} store fell by ${line.quantity} units to ${this.#party.name}.`,
        );
        this.#movePrice(good, town, barterRow);
        if (line.itemId === "grain") this.#grainReachesTown(town, -line.quantity, barterRow);
      } else if (line.kind === "gold") {
        const before = this.#player.resources.gold;
        trader.wealth.gold = round2(trader.wealth.gold - line.quantity);
        this.#player.resources.gold = round2(this.#player.resources.gold + line.quantity);
        this.#row(
          "gold",
          trader.id,
          trader.name,
          trader.wealth.gold + line.quantity,
          trader.wealth.gold,
          "Currency",
          [barterRow],
          `${trader.name}'s gold reserve fell from ${trader.wealth.gold + line.quantity} to ${trader.wealth.gold}.`,
        );
        this.#row(
          "gold",
          this.#party.id,
          this.#party.name,
          before,
          this.#player.resources.gold,
          "Currency",
          [barterRow],
          `Gold in hand rose from ${before} to ${this.#player.resources.gold}.`,
        );
      } else {
        const taken = takePrisoners(trader.prisoners, line.itemId, line.quantity);
        addPrisoners(this.#party.prisoners, taken);
        this.#partyRow(taken, line.quantity, barterRow);
      }
    }

    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({
      tick: this.#tick,
      day: this.#day,
      markets: { [town.id]: structuredClone(market) },
      party: structuredClone(this.#party),
      ledger: structuredClone(this.#ledger),
      warnings: structuredClone(this.#warnings),
    });

    const terms = this.#terms(trader, town);
    return {
      ...proposal,
      day: this.#day,
      playerItems: terms.playerItems,
      traderItems: terms.traderItems,
      playerMoney: this.#player.resources.money,
      traderMoney: trader.wealth.money,
      causedBy: barterRow,
    };
  }

  #ruler(id: string): RulerState {
    const ruler = this.#rulers.find((r) => r.id === id);
    if (!ruler) throw new Error(`No lord with id ${id}`);
    return ruler;
  }

  /**
   * Both tables, each priced in the direction that side deals in.
   *
   * The player side is priced at what this lord would pay for it, because that is what
   * the player would be handing over; the trader's side at what they would ask, because
   * that is what the player would be walking away with. Same market underneath, two
   * margins, and the gap between them is the whole reason a deal can be refused.
   */
  #terms(trader: RulerState, town: TownState): BarterTerms {
    const market = this.#markets.get(town.id);
    if (!market) throw new Error(`No market for town ${town.id}`);
    const rate = FIXTURE.barterGoldPerMoney;

    const playerItems: BarterItem[] = [];
    for (const held of this.#party.goods) {
      if (held.quantity <= 0) continue;
      const good = market.goods.find((g) => g.goodId === held.goodId);
      if (!good) continue;
      playerItems.push({
        kind: "good",
        itemId: held.goodId,
        name: held.name,
        available: held.quantity,
        unitValue: round2(good.price * FIXTURE.barterBuyShare),
      });
    }
    if (this.#player.resources.gold > 0) {
      playerItems.push({
        kind: "gold",
        itemId: "gold",
        name: "Gold",
        available: Math.round(this.#player.resources.gold),
        unitValue: rate,
      });
    }
    for (const stack of this.#party.prisoners) {
      playerItems.push({
        kind: "prisoner",
        itemId: stack.unitId,
        name: stack.name,
        available: stack.count,
        unitValue: prisonerValue(stack),
      });
    }

    // The trader's goods are the town's market stock: this lord deals through it, so
    // what he can put on the table is what the town has.
    const traderItems: BarterItem[] = market.goods
      .filter((g) => g.stock > 0)
      .map((g) => ({
        kind: "good" as const,
        itemId: g.goodId,
        name: g.name,
        available: g.stock,
        unitValue: round2(g.price * FIXTURE.barterSellShare),
      }));
    if (trader.wealth.gold > 0) {
      traderItems.push({
        kind: "gold",
        itemId: "gold",
        name: "Gold",
        available: Math.round(trader.wealth.gold),
        unitValue: rate,
      });
    }
    for (const stack of trader.prisoners) {
      traderItems.push({
        kind: "prisoner",
        itemId: stack.unitId,
        name: stack.name,
        available: stack.count,
        unitValue: prisonerValue(stack),
      });
    }

    return {
      townId: town.id,
      traderId: trader.id,
      traderName: trader.name,
      traderItems,
      playerItems,
      relationToPlayer: trader.relationToPlayer,
      day: this.#day,
    };
  }

  /**
   * Whether this lord would deal, and what they make of it.
   *
   * Three refusals and one acceptance, all in the lord's own voice: nothing on the
   * table, more asked for than offered, or a line the player does not actually hold.
   * The first two are answers and the third is a correction, and all three come with the
   * numbers that produced them.
   */
  #appraise(trader: RulerState, town: TownState, request: BarterProposalRequest): BarterProposal {
    const terms = this.#terms(trader, town);
    const refused = (reason: string, playerValue: number, traderValue: number, shortBy?: number): BarterProposal => ({
      accepted: false,
      playerValue,
      traderValue,
      verdict: shortBy === undefined ? "No deal." : `Short by ${formatMoney(shortBy)}.`,
      reason,
      ...(shortBy === undefined ? {} : { shortBy }),
      causedBy: "barter-rejected",
    });

    if (request.offered.length === 0 && request.asked.length === 0) {
      return refused(
        `Nothing is on the table. Put something down from ${this.#party.name}, or ask ${trader.name} for something.`,
        0,
        0,
      );
    }
    if (request.offered.length === 0) {
      return refused(
        `There is nothing on your side of the table. ${trader.name} is not giving goods away.`,
        0,
        0,
      );
    }
    if (request.asked.length === 0) {
      return refused(
        "Nothing has been asked for. A deal has to go both ways.",
        0,
        0,
      );
    }

    let playerValue = 0;
    for (const line of request.offered) {
      const item = terms.playerItems.find((i) => i.kind === line.kind && i.itemId === line.itemId);
      if (!item) throw new Error(`${line.itemId} is not on ${this.#party.name}'s side of the table`);
      if (!wholeQuantity(line.quantity)) throw new Error(`Barter quantity must be a positive whole number, got ${line.quantity}`);
      if (line.quantity > item.available) {
        return refused(
          `${this.#party.name} holds ${item.available} of ${item.name.toLowerCase()}, not ${line.quantity}.`,
          0,
          0,
        );
      }
      playerValue = round2(playerValue + item.unitValue * line.quantity);
    }

    let traderValue = 0;
    for (const line of request.asked) {
      const item = terms.traderItems.find((i) => i.kind === line.kind && i.itemId === line.itemId);
      if (!item) throw new Error(`${line.itemId} is not on ${trader.name}'s side of the table`);
      if (!wholeQuantity(line.quantity)) throw new Error(`Barter quantity must be a positive whole number, got ${line.quantity}`);
      if (line.quantity > item.available) {
        return refused(`${trader.name} has only ${item.available} of ${item.name.toLowerCase()} to give.`, 0, 0);
      }
      traderValue = round2(traderValue + item.unitValue * line.quantity);
    }

    // A friend takes a worse deal than a stranger. The tolerance is this lord's
    // disposition, not the client's judgement, and it is bounded either way.
    const tolerance = FIXTURE.barterTolerance + clamp(trader.relationToPlayer * FIXTURE.barterTolerancePerRelation, -0.04, 0.12);
    const shortfall = round2(Math.max(0, traderValue - playerValue));
    if (traderValue > round2(playerValue * (1 + tolerance))) {
      return refused(
        `${trader.name} calls what you are asking ${formatMoney(traderValue)} and what you are offering ${formatMoney(playerValue)}. ` +
          `Put ${formatMoney(shortfall)} more on your side of the table, or ask for less.`,
        playerValue,
        traderValue,
        shortfall,
      );
    }

    return {
      accepted: true,
      playerValue,
      traderValue,
      verdict: `${trader.name} takes the deal: ${formatMoney(traderValue)} of goods out of ${formatMoney(playerValue)} you put down.`,
      causedBy: "barter-agreed",
    };
  }

  /** The Market system's price rule, applied because the stock just changed. */
  #movePrice(good: MarketGood, town: TownState, causedBy: string): void {
    const before = good.price;
    const after = round2(Math.max(0.5, BASE_PRICE[good.goodId] * priceFor(good.stock, good.demand)));
    if (after === before) return;
    good.previousPrice = before;
    good.price = after;
    good.history = [...good.history, { day: this.#day, price: after }].slice(-24);
    this.#row(
      `${good.goodId}_price`,
      town.id,
      town.name,
      before,
      after,
      "Market",
      [causedBy],
      `${good.name} at ${town.name} moved from ${before} to ${after} per unit.`,
    );
  }

  /** Grain into a town is that town's food stock, and a fed town is calmer. */
  #grainReachesTown(town: TownState, units: number, causedBy: string): void {
    if (units === 0) return;
    const before = town.foodStock;
    town.foodStock = Math.max(0, Math.round(town.foodStock + units * FIXTURE.grainUnitInPersonDays));
    const stockRow = this.#row(
      "foodStock",
      town.id,
      town.name,
      before,
      town.foodStock,
      "Food",
      [causedBy],
      `${town.name}'s food stock moved from ${(before / Math.max(1, town.foodDemand)).toFixed(1)} to ${(town.foodStock / Math.max(1, town.foodDemand)).toFixed(1)} days.`,
    );
    const unrestBefore = town.unrest;
    town.unrest = round2(clamp(unrestBefore + (units > 0 ? -0.02 : 0.01), FIXTURE.unrestFloor, FIXTURE.unrestCeiling));
    if (town.unrest !== unrestBefore) {
      this.#row("unrest", town.id, town.name, unrestBefore, town.unrest, "Unrest", [stockRow], `${town.name}'s unrest moved from ${unrestBefore} to ${town.unrest}.`);
    }
  }

  /** One row for a lord whose holding of prisoners just changed. */
  #prisonerRow(trader: RulerState, taken: PrisonerStack, count: number, causedBy: string, gained: boolean): void {
    const total = trader.prisoners.reduce((a, p) => a + p.count, 0);
    this.#row(
      "prisoners",
      trader.id,
      trader.name,
      Math.max(0, total - (gained ? -count : count)),
      total,
      "Prisoner",
      [causedBy],
      `${trader.name}'s prisoners ${gained ? "rose to" : "fell to"} ${total}, ${count} ${taken.name.toLowerCase()} among them.`,
    );
  }

  #partyRow(taken: PrisonerStack, count: number, causedBy: string): void {
    const total = this.#party.prisoners.reduce((a, p) => a + p.count, 0);
    this.#row(
      "prisoners",
      this.#party.id,
      this.#party.name,
      Math.max(0, total - count),
      total,
      "Prisoner",
      [causedBy],
      `${this.#party.name} holds ${total} prisoners, ${count} ${taken.name.toLowerCase()} among them.`,
    );
  }

  // -- issues ------------------------------------------------------------------
  //
  // One notable's request is the unit the player accepts and completes. Three rules shape
  // the code here, and all three are the simulation's rules rather than the fixture's.
  //
  // **Progress is read from the world, never declared.** Every read recomputes the objective
  // from the town's own readings, so a delivery made by somebody else counts and a claim
  // made without the goods does not. A double that let the player set its own progress
  // would be testing the panel against a fiction.
  //
  // **Reporting an issue complete is an order, not a fact.** `completeIssue` reads the world
  // and refuses an unsupported claim in the simulation's own words. This is the single most
  // important behaviour the quest panel has to get right, so it is the one this section is
  // built around.
  //
  // **Ignoring has consequences and walking away costs more.** An offer nobody takes ages
  // the notable's opinion, and abandoning an accepted issue costs a visible number. Both are
  // measured, both land in the per-issue step log, and the panel prints the figure before
  // the button rather than only in the refusal.

  /**
   * A notable roster and one request per troubled place.
   *
   * Seeded rather than generated, for the reason the cause chains are seeded: a double
   * whose requests appear at random would be a double whose quest panel could not be
   * asserted against, and the four states have to be on screen at once for the panel's four
   * button sets to be testable at all.
   */
  #seedIssues(): void {
    const rand = this.#random;
    const wanted: { settlementId: string; kind: IssueKind; state: IssueState }[] = [
      { settlementId: "longmont", kind: "deliver-goods", state: "offered" },
      { settlementId: "longmont", kind: "escort", state: "offered" },
      { settlementId: "golden", kind: "deliver-goods", state: "offered" },
      { settlementId: "golden", kind: "clear-hideout", state: "offered" },
      { settlementId: "idaho-springs", kind: "escort", state: "offered" },
      { settlementId: "denver", kind: "clear-hideout", state: "offered" },
      // One accepted, so the panel has a request with a notice running and both of the
      // buttons that only an accepted request is allowed to show.
      { settlementId: "boulder", kind: "deliver-goods", state: "accepted" },
      // And one of each resolved state, so the log is not only a list of things to do.
      { settlementId: "aurora", kind: "deliver-goods", state: "succeeded" },
      { settlementId: "golden", kind: "escort", state: "failed" },
    ];
    for (const [index, want] of wanted.entries()) {
      const town = this.#towns.get(`town-${want.settlementId}`);
      if (!town) continue;
      // The role gates which request this person will put their name to, so the pairing
      // comes out of the eligibility table rather than being written per issue.
      const seat = NOTABLE_ROLES.find((r) => r.kinds.includes(want.kind));
      if (!seat) continue;
      const notableId = `notable-${index}`;
      this.#notables.push({
        id: notableId,
        name: NOTABLE_NAMES[index % NOTABLE_NAMES.length] ?? "A notable of the town",
        role: seat.role,
        settlementId: town.id,
        // Power follows the settlement's size, so a prosperous town's requests are worth
        // more and a bankrupt one's worth less, with no separate rule per role.
        power: round2(clamp(0.22 + (town.population ?? 1400) / 1_400_000 + rand() * 0.18, 0.15, 1)),
        relation: Math.round(clamp(14 + rand() * 36, 0, 100)),
        grievance: round2(clamp(rand() * 0.18, 0, 1)),
      });
      const issue = this.#makeIssue(`issue-${index}`, want.kind, notableId, town);
      if (want.state !== "offered") this.#seedHistory(issue, want.state);
      this.#issues.set(issue.id, issue);
    }
  }

  /**
   * A fresh request from a notable who has one, with the objective measured against the
   * world as it stands today and the reward priced off the notable's own power.
   */
  #makeIssue(id: string, kind: IssueKind, notableId: string, town: TownState): FixtureIssue {
    const notable = this.#notable(notableId);
    const issue: FixtureIssue = {
      id,
      kind,
      notableId,
      settlementId: town.id,
      targetName: kind === "escort" ? `the ${town.name} road` : null,
      roadSafety: town.roadSafety,
      amount: this.#amountAtStake(kind, town),
      baseline: this.#readingAt(kind, town, 0),
      state: "offered",
      startedDay: null,
      // An untaken offer carries the stale-offer window rather than a working notice: the
      // deadline only becomes a real notice on the day somebody takes it up.
      deadlineDay: this.#day + FIXTURE.issueStaleOfferDays,
      deadlineDays: FIXTURE.issueStaleOfferDays,
      reward: this.#priceReward(kind, this.#amountAtStake(kind, town), notable, town),
      steps: [],
    };
    this.#logStep(issue, this.#offerText(issue, town), "offered");
    return issue;
  }

  /** What a request of this kind asks for today, in its own unit. */
  #amountAtStake(kind: IssueKind, town: TownState): number {
    switch (kind) {
      case "deliver-goods": {
        // Enough grain to lift a larder a fixed distance above where it stands.
        const larder = this.#readingAt(kind, town, 0);
        return Math.max(1, Math.round(larder * FIXTURE.issueDeliverTolerance + 10));
      }
      case "clear-hideout":
        return Math.round(town.unrest * 100);
      case "escort":
        return Math.round(town.roadSafety * 100);
    }
  }

  /** The number of days of notice given for this kind, which is the sim's table. */
  #noticeOf(kind: IssueKind): number {
    switch (kind) {
      case "deliver-goods":
        return FIXTURE.issueDeliverDeadlineDays;
      case "clear-hideout":
        return FIXTURE.issueHideoutDeadlineDays;
      case "escort":
        return FIXTURE.issueEscortDeadlineDays;
    }
  }

  /**
   * What serving this request is worth, scaled by what is at stake and by how much the
   * person asking sways their settlement.
   *
   * The promised money is then held under the payer's treasury, because a town that cannot
   * pay what it has promised should promise less rather than fail to pay at the end.
   */
  #priceReward(_kind: IssueKind, amount: number, notable: FixtureNotable, town: TownState): IssueReward {
    const power = 1 + FIXTURE.issueRelationShare * notable.power;
    const money = FIXTURE.issueRewardMoneyPerUnit * amount * power;
    return {
      money: round2(Math.min(money, town.money * 0.5)),
      gold: round2(FIXTURE.issueRewardGoldPerUnit * amount * power),
      renown: round2(FIXTURE.issueRewardRenownPerUnit * amount * power),
      relation: round2(FIXTURE.issueRewardRelation * power),
    };
  }

  /**
   * The objective's reading of the world, in the issue's own unit.
   *
   * Two of the three read fields the fixture really holds: a town's larder in grain units,
   * and a town's road safety. The third reads disorder, and the fixture has no crime field,
   * so it uses the unrest it does hold and says so here rather than inventing a number the
   * world would then have to agree with elsewhere. It is the one place in this double where
   * a field stands in for another, and it is labelled.
   */
  #readingAt(kind: IssueKind, town: TownState, _roadSafety: number): number {
    switch (kind) {
      case "deliver-goods":
        return round2(town.foodStock / FIXTURE.grainUnitInPersonDays);
      case "clear-hideout":
        return round2(town.unrest * 100);
      case "escort":
        return round2(town.roadSafety * 100);
    }
  }

  /** The reading the objective has to reach. Below the baseline for a hideout, by design. */
  #targetOf(issue: FixtureIssue): number {
    switch (issue.kind) {
      case "deliver-goods":
        return round2(issue.baseline + issue.amount * FIXTURE.issueDeliverTolerance);
      case "clear-hideout":
        return round2(FIXTURE.issueHideoutCrimeTarget * 100);
      case "escort":
        return round2(FIXTURE.issueEscortSafetyTarget * 100);
    }
  }

  /** Whether the world currently satisfies the objective. Read, never declared. */
  #metNow(issue: FixtureIssue, town: TownState): boolean {
    const reading = this.#readingAt(issue.kind, town, issue.roadSafety);
    return this.#compare(issue, reading, this.#targetOf(issue));
  }

  /** Higher is better for a delivery and an escort; lower is better for a hideout. */
  #compare(issue: FixtureIssue, reading: number, target: number): boolean {
    return issue.kind === "clear-hideout" ? reading <= target : reading >= target;
  }

  /** How far the objective is met, 0 to 1, measured from the reading captured on acceptance. */
  #progressNow(issue: FixtureIssue, town: TownState): number {
    if (issue.state !== "accepted") return issue.state === "succeeded" ? 1 : 0;
    const reading = this.#readingAt(issue.kind, town, issue.roadSafety);
    const target = this.#targetOf(issue);
    const span =
      issue.kind === "clear-hideout"
        ? issue.baseline - target
        : target - issue.baseline;
    if (span <= 0) return this.#metNow(issue, town) ? 1 : 0;
    const done = issue.kind === "clear-hideout" ? issue.baseline - reading : reading - issue.baseline;
    return clamp(done / span, 0, 1);
  }

  /**
   * The requirement in a full sentence, written here rather than in the panel because only
   * the simulation knows what the objective is: a delivery is a larder reading against the
   * baseline captured on the day it was taken, an escort is a road's safety, and a hideout is
   * disorder coming down rather than anything being raised.
   */
  #requirementText(issue: FixtureIssue, town: TownState, reading: number, target: number): string {
    if (issue.state === "offered") {
      switch (issue.kind) {
        case "deliver-goods":
          return `${town.name}'s larder stands at ${whole(reading)} grain units. Bring it to ${whole(target)} and ${this.#notable(issue.notableId).name} pays what is promised.`;
        case "clear-hideout":
          return `Disorder in ${town.name} stands at ${whole(reading)}. Bring it down to ${whole(target)} and ${this.#notable(issue.notableId).name} pays what is promised.`;
        case "escort":
          return `${cap(issue.targetName ?? "The road")} stands at ${whole(reading)} out of 100. Bring it to ${whole(target)} and ${this.#notable(issue.notableId).name} pays what is promised.`;
      }
    }
    const baseline = whole(issue.baseline);
    const now = whole(reading);
    switch (issue.kind) {
      case "deliver-goods":
        return `${town.name}'s larder stood at ${baseline} grain units when this was taken and must reach ${whole(target)}. It stands at ${now} now.`;
      case "clear-hideout":
        return `Disorder in ${town.name} stood at ${baseline} when this was taken and must come down to ${whole(target)}. It stands at ${now} now.`;
      case "escort":
        return `${cap(issue.targetName ?? "The road")} stood at ${baseline} when this was taken and must reach ${whole(target)}. It stands at ${now} now.`;
    }
  }

  /** The sentence the notable's request was made with, written into the step log. */
  #offerText(issue: FixtureIssue, town: TownState): string {
    const reading = this.#readingAt(issue.kind, town, issue.roadSafety);
    switch (issue.kind) {
      case "deliver-goods":
        return `offered: ${town.name} has ${whole(reading)} grain units in store`;
      case "clear-hideout":
        return `offered: disorder in ${town.name} is at ${whole(reading)}`;
      case "escort":
        return `offered: ${issue.targetName ?? "the road"} is at ${whole(reading)}`;
    }
  }

  /**
   * Backdate a request to a state other than offered, so the board carries history rather
   * than only work to do. Written through the same helpers the actions use, so the seed
   * cannot drift away from what a real resolution produces.
   */
  #seedHistory(issue: FixtureIssue, state: IssueState): void {
    if (state === "failed") {
      const daysAgo = 6;
      this.#day -= 0; // The clock is not rewound; the history is stamped into the past.
      issue.state = "accepted";
      issue.startedDay = this.#day;
      issue.deadlineDays = this.#noticeOf(issue.kind);
      issue.deadlineDay = this.#day + issue.deadlineDays;
      this.#logStep(issue, `taken up with ${issue.deadlineDays} days to do it`, "accepted", daysAgo);
      issue.state = "failed";
      this.#logStep(issue, "the taker walked away from it", "failed", daysAgo - 4);
      const notable = this.#notable(issue.notableId);
      notable.relation = Math.max(0, notable.relation - FIXTURE.issueAbandonRelationPenalty);
      notable.grievance = round2(clamp(notable.grievance + 0.2, 0, 1));
      return;
    }
    issue.state = "accepted";
    issue.startedDay = this.#day;
    issue.deadlineDays = this.#noticeOf(issue.kind);
    issue.deadlineDay = this.#day + issue.deadlineDays;
    this.#logStep(issue, `taken up with ${issue.deadlineDays} days to do it`, "accepted", 5);
    issue.state = state;
    this.#logStep(issue, "the goods arrived and the work was done", state, 2);
    // A served request is served by the world, not by the log. The step above says the
    // goods arrived, so the town is put where the goods would have put it, in the reading
    // the objective is measured against. Without this the seed contradicted itself: the
    // log claimed a delivery that had not happened, while `requirement.met` — recomputed
    // from the world on every read, which is the whole point of that field — said the larder
    // was still short. A panel printing a full gauge beside "the world does not meet the
    // objective" would have been reporting two of this fixture's own fields disagreeing.
    //
    // They are still allowed to drift apart afterwards, and that is not this bug: a served
    // request's progress is the state it settled in, while `met` is what the world says
    // today. The real system behaves the same way once the town has eaten the delivery.
    this.#serveWorld(issue);
    const notable = this.#notable(issue.notableId);
    notable.relation = Math.min(100, notable.relation + issue.reward.relation);
    notable.grievance = round2(clamp(notable.grievance - 0.25, 0, 1));
  }

  /**
   * Put a settlement where a served request says it is, in the objective's own reading.
   *
   * The mirror image of `#metNow`, and written through the same field each kind is
   * measured on: a delivery is grain in the larder, a hideout is disorder coming down and
   * an escort is a road getting safer. It is only called for a request the log records as
   * served — a failure leaves the world exactly as it found it, which is the whole of what
   * a failure means.
   */
  #serveWorld(issue: FixtureIssue): void {
    const town = this.#towns.get(issue.settlementId);
    if (!town) return;
    switch (issue.kind) {
      case "deliver-goods": {
        // Rounded up, so the reading comes back at or above the target rather than a
        // hundredth of a unit under it, which is the difference between a delivery that
        // arrived and one that stopped just short of the line.
        town.foodStock = Math.ceil(this.#targetOf(issue) * FIXTURE.grainUnitInPersonDays);
        break;
      }
      case "clear-hideout":
        town.unrest = round2(FIXTURE.issueHideoutCrimeTarget);
        break;
      case "escort":
        town.roadSafety = round2(FIXTURE.issueEscortSafetyTarget);
        break;
    }
  }

  /**
   * Age the board: an offer nobody took up lapses on its own, and an accepted request whose
   * notice ran out fails.
   *
   * Called from `issueBoard` rather than from a timer, because the only thing the quest panel
   * needs is for the board to be honest at the moment it is drawn, and a deadline that only
   * moves when somebody looks at it is not a deadline.
   */
  #age(): void {
    for (const issue of this.#issues.values()) {
      if (this.#day <= issue.deadlineDay) continue;
      if (issue.state === "offered") {
        this.#logStep(issue, "nobody took it up and the offer lapsed", "failed");
        const notable = this.#notable(issue.notableId);
        notable.grievance = round2(clamp(notable.grievance + 0.06, 0, 1));
        this.#issueRow(issue, "state", 0, 3, `${this.#title(issue)} lapsed with nobody to answer it.`);
      } else if (issue.state === "accepted") {
        this.#logStep(issue, "the notice ran out and the work was never done", "failed");
        const notable = this.#notable(issue.notableId);
        notable.relation = Math.max(0, notable.relation - FIXTURE.issueAbandonRelationPenalty);
        this.#issueRow(issue, "state", 1, 3, `${this.#title(issue)} failed: the notice ran out.`);
      }
    }
  }

  async issueBoard(partyId: string): Promise<IssueBoard> {
    if (partyId !== this.#party.id) throw new Error(`No party with id ${partyId}`);
    this.#age();
    return {
      partyId,
      day: this.#day,
      issues: [...this.#issues.values()]
        .map((issue) => this.#project(issue))
        // Live work first, then the offer that expires soonest, then history newest first.
        // The order is the simulation's to decide, so this only reads it.
        .sort(byBoardOrder),
    };
  }

  async acceptIssue(request: IssueActionRequest): Promise<IssueActionResult> {
    return this.#act(request, "accept");
  }

  async completeIssue(request: IssueActionRequest): Promise<IssueActionResult> {
    return this.#act(request, "complete");
  }

  async abandonIssue(request: IssueActionRequest): Promise<IssueActionResult> {
    return this.#act(request, "abandon");
  }

  /**
   * Trade rumours, generated from the prices this fixture's markets actually hold.
   *
   * The same rule and the same order as the simulation's rumour generator: for each of the
   * three goods it scans, the cheapest town against the dearest, dropped unless the
   * difference clears the threshold, then best margin first with ties broken by the good's
   * name so two runs of the same world give the same feed.
   *
   * The double is thinner than the real generator in two places, both because the fixture
   * has no field the simulation has. It skips no town, because these towns carry no
   * blockade or siege state to skip on; and it caps the list at the same ten, which three
   * goods cannot reach.
   *
   * The town ids are this fixture's own: the simulation numbers its towns and this one
   * names them after the settlement, so the number sent is the town's position in the
   * fixture's list. It is a number of the right shape for the contract and nothing more.
   * No panel reads it — the feed shows the two names, which is the join the client can
   * actually make.
   */
  async rumours(): Promise<Rumour[]> {
    const ids = [...this.#towns.keys()];
    const numberOf = (id: string): number => ids.indexOf(id);
    const feed: Rumour[] = [];
    for (const { simKey, clientGood } of RUMOUR_GOODS) {
      const priced = [...this.#towns.values()]
        .map((town) => ({ town, price: this.#goodPrice(town.id, clientGood) }))
        .filter((row): row is { town: TownState; price: number } => row.price !== null)
        .sort((a, b) => a.price - b.price);
      if (priced.length < 2) continue;
      const cheap = priced[0]!;
      const dear = priced[priced.length - 1]!;
      const margin = round2(dear.price - cheap.price);
      if (margin < FIXTURE.rumourMinMargin) continue;
      feed.push({
        good: simKey,
        buyTown: cheap.town.name,
        buyTownId: numberOf(cheap.town.id),
        buyPrice: cheap.price,
        sellTown: dear.town.name,
        sellTownId: numberOf(dear.town.id),
        sellPrice: dear.price,
        margin,
        // The simulation's own sentence, its key and its rounding included. Printed as
        // written, so the double has to write the same thing the real one does.
        text: `Buy ${simKey} cheap in ${cheap.town.name} (${Math.round(cheap.price)}), sell dear in ${dear.town.name} (${Math.round(dear.price)}). Margin ${Math.round(margin)} per unit.`,
      });
    }
    return feed
      .sort((a, b) => b.margin - a.margin || (a.good < b.good ? -1 : a.good > b.good ? 1 : 0))
      .slice(0, FIXTURE.rumourMax);
  }

  /** What a town charges for a good today, or `null` where it does not trade in it. */
  #goodPrice(townId: string, goodId: GoodId): number | null {
    const good = this.#markets.get(townId)?.goods.find((line) => line.goodId === goodId);
    return good === undefined ? null : good.price;
  }

  /**
   * One order against one request, resolved against the world rather than against the
   * player's claim.
   *
   * The issue's own state is the authority on whether an order still makes sense: an offer
   * that has lapsed is `failed`, and every action on it is refused in those words rather
   * than in a generic error. `expectedDay` is checked only for the impossible case of an
   * order dated ahead of the world, because the state check above already covers the case
   * the guard exists for and a clock that runs while the panel is open would otherwise
   * refuse every order the player makes.
   */
  #act(request: IssueActionRequest, action: IssueAction): IssueActionResult {
    if (request.partyId !== this.#party.id) throw new Error(`No party with id ${request.partyId}`);
    if (request.expectedDay > this.#day) {
      throw new Error(`Issue order dated day ${request.expectedDay}, ahead of the world's day ${this.#day}`);
    }
    const issue = this.#issue(request.issueId);
    this.#age();
    const town = this.#towns.get(issue.settlementId);
    if (!town) throw new Error(`Issue ${issue.id} names no town the fixture knows`);
    const notable = this.#notable(issue.notableId);

    if (action === "accept") {
      if (issue.state !== "offered") {
        return this.#refuse(issue, "accept", this.#staleReason(issue, "taken up"), "Offer taken");
      }
      // The notice is given now, and the reading is captured now: a request taken four days
      // after it was made is measured against the world as it stands today, not as it stood
      // when the notable happened to ask.
      issue.state = "accepted";
      issue.baseline = this.#readingAt(issue.kind, town, issue.roadSafety);
      issue.startedDay = this.#day;
      issue.deadlineDays = this.#noticeOf(issue.kind);
      issue.deadlineDay = this.#day + issue.deadlineDays;
      this.#logStep(issue, `taken up with ${issue.deadlineDays} days to do it`, "accepted");
      const row = this.#issueRow(
        issue,
        "state",
        0,
        1,
        `${this.#title(issue)} was taken up with ${issue.deadlineDays} days to do it.`,
      );
      notable.relation = Math.min(100, notable.relation + 4);
      return this.#settle(issue, "accept", `Taken. ${issue.deadlineDays} days to do it.`, row);
    }

    if (issue.state !== "accepted") {
      const why =
        issue.state === "offered"
          ? "This one is still an offer. Take it up first."
          : this.#staleReason(issue, action === "complete" ? "reported done" : "given up");
      return this.#refuse(issue, action, why, "Not your request to close");
    }

    if (action === "abandon") {
      const before = notable.relation;
      notable.relation = Math.max(0, before - FIXTURE.issueAbandonRelationPenalty);
      notable.grievance = round2(clamp(notable.grievance + 0.2, 0, 1));
      issue.state = "failed";
      this.#logStep(issue, "the taker walked away from it", "failed");
      const row = this.#issueRow(
        issue,
        "state",
        1,
        3,
        `${this.#title(issue)} was given up. ${notable.name} is ${FIXTURE.issueAbandonRelationPenalty} worse disposed towards the party.`,
        [`${notable.name}'s standing fell from ${before} to ${Math.round(notable.relation)}.`],
      );
      return this.#settle(
        issue,
        "abandon",
        `Given up. ${notable.name} is ${FIXTURE.issueAbandonRelationPenalty} worse disposed towards the party.`,
        row,
      );
    }

    // Completing. The world decides, not the claim: this is the branch that keeps the button
    // honest, and the refusal is written to name the shortfall rather than to say "no".
    const reading = this.#readingAt(issue.kind, town, issue.roadSafety);
    const target = this.#targetOf(issue);
    const over = this.#day > issue.deadlineDay;
    if (!this.#compare(issue, reading, target)) {
      if (over) {
        issue.state = "failed";
        this.#logStep(issue, "reported done after the notice had run out", "failed");
        const row = this.#issueRow(
          issue,
          "state",
          1,
          3,
          `${this.#title(issue)} was reported done ${this.#day - issue.deadlineDay} days too late to count.`,
        );
        return this.#settle(issue, "complete", "Too late to count. The notice had run out.", row);
      }
      return this.#refuse(
        issue,
        "complete",
        `Reported done, but ${this.#shortfallText(issue, town.name, reading, target)}.`,
        "Not done",
      );
    }
    issue.state = "succeeded";
    this.#logStep(issue, `the work was done on day ${this.#day}`, "succeeded");
    const paid = this.#pay(issue, notable);
    const row = this.#issueRow(
      issue,
      "state",
      1,
      2,
      `${this.#title(issue)} was served. ${notable.name} paid ${formatMoney(paid.money)}, ${whole(paid.gold)} gold and ${whole(paid.renown)} renown.`,
    );
    return this.#settle(
      issue,
      "complete",
      `Served. ${notable.name} paid ${formatMoney(paid.money)}, ${whole(paid.gold)} gold and ${whole(paid.renown)} renown.`,
      row,
      paid,
    );
  }

  /**
   * Pay what was promised.
   *
   * The money actually paid is what is there, not what was written: the promise was capped
   * against the payer's treasury when it was made, and a town that has spent its money since
   * pays the smaller figure and the sentence says so.
   */
  #pay(issue: FixtureIssue, notable: FixtureNotable): IssueReward {
    const town = this.#towns.get(issue.settlementId);
    const fromTreasury = town ? Math.min(issue.reward.money, town.money) : 0;
    if (town) town.money = round2(town.money - fromTreasury);
    this.#party.money = round2(this.#party.money + fromTreasury);
    this.#player.resources.money = round2(this.#player.resources.money + fromTreasury);
    this.#player.resources.gold = round2(this.#player.resources.gold + issue.reward.gold);
    this.#player.renown = round2(this.#player.renown + issue.reward.renown);
    notable.relation = Math.min(100, notable.relation + issue.reward.relation);
    notable.grievance = round2(clamp(notable.grievance - 0.25, 0, 1));
    return {
      money: round2(fromTreasury),
      gold: issue.reward.gold,
      renown: issue.reward.renown,
      relation: issue.reward.relation,
    };
  }

  /** A refusal: the simulation's own sentence, and the issue untouched. */
  #refuse(issue: FixtureIssue, action: IssueAction, reason: string, verdict: string): IssueActionResult {
    return {
      issueId: issue.id,
      action,
      accepted: false,
      verdict,
      reason,
      issue: this.#project(issue),
      causedBy: `issue-${action}-refused`,
    };
  }

  /** A settlement, carrying the cause row so the Why panel can walk it. */
  #settle(
    issue: FixtureIssue,
    action: IssueAction,
    verdict: string,
    row: string,
    paid?: IssueReward,
  ): IssueActionResult {
    return {
      issueId: issue.id,
      action,
      accepted: true,
      verdict,
      ...(paid === undefined ? {} : { paid }),
      issue: this.#project(issue),
      causedBy: row,
    };
  }

  /**
   * The request as the contract carries it: objective resolved from world state, author
   * resolved from the roster, and a detached copy so a later tick cannot write back into
   * what the panel is drawing.
   */
  #project(issue: FixtureIssue): Issue {
    const town = this.#towns.get(issue.settlementId);
    if (!town) throw new Error(`Issue ${issue.id} names no town the fixture knows`);
    const notable = this.#notable(issue.notableId);
    const reading = this.#readingAt(issue.kind, town, issue.roadSafety);
    return {
      id: issue.id,
      kind: issue.kind,
      state: issue.state,
      notable: {
        id: notable.id,
        name: notable.name,
        role: notable.role,
        settlementId: town.id,
        settlementName: town.name,
        power: notable.power,
        // Standing is the opinion minus the grievance it has already caused, on the
        // `RULERS.md` section 2 scale the roster screen already uses.
        relationToPlayer: Math.round(clamp(notable.relation - notable.grievance * 30, -100, 100)),
        openIssues: this.#openIssuesOf(notable.id),
        grievance: notable.grievance,
      },
      settlementId: town.id,
      settlementName: town.name,
      requirement: {
        text: this.#requirementText(issue, town, reading, this.#targetOf(issue)),
        targetName: issue.targetName,
        amount: issue.amount,
        baseline: issue.baseline,
        unit: ISSUE_UNIT[issue.kind],
        met: this.#metNow(issue, town),
      },
      progress: round2(this.#progressNow(issue, town)),
      deadlineDay: issue.deadlineDay,
      deadlineDays: issue.deadlineDays,
      startedDay: issue.startedDay,
      reward: { ...issue.reward },
      abandonPenalty: FIXTURE.issueAbandonRelationPenalty,
      steps: issue.steps.map((step) => ({ ...step })),
    };
  }

  /** How many requests this person still has outstanding, an offer or accepted alike. */
  #openIssuesOf(notableId: string): number {
    let open = 0;
    for (const issue of this.#issues.values()) {
      if (issue.notableId === notableId && (issue.state === "offered" || issue.state === "accepted")) open += 1;
    }
    return open;
  }

  /** One entry in a request's own log, which is why a request can explain itself. */
  #logStep(issue: FixtureIssue, text: string, state: IssueState, daysAgo = 0): void {
    issue.steps.push({ day: Math.max(1, this.#day - daysAgo), text, state });
  }

  /** The sentence naming this request, used in every cause row about it. */
  #title(issue: FixtureIssue): string {
    const town = this.#towns.get(issue.settlementId);
    return `${ISSUE_KIND_NAMES[issue.kind]} at ${town?.name ?? issue.settlementId}`;
  }

  /** One row in the cause log, so the Why panel has something real to walk for an issue. */
  #issueRow(
    issue: FixtureIssue,
    field: string,
    old: number,
    next: number,
    summary: string,
    extra: string[] = [],
  ): string {
    const town = this.#towns.get(issue.settlementId);
    const headline = this.#row(
      field,
      issue.id,
      `${this.#title(issue)} (${this.#notable(issue.notableId).name})`,
      old,
      next,
      "Issue",
      [],
      summary,
    );
    let causedBy = headline;
    for (const line of extra) {
      causedBy = this.#row(
        "notable_relation",
        issue.notableId,
        this.#notable(issue.notableId).name,
        0,
        0,
        "Issue",
        [causedBy],
        line,
      );
    }
    if (town) this.#pushHistory(town.id, summary, causedBy);
    return causedBy;
  }

  /** Why an order no longer applies, in the words for the state the request is actually in. */
  #staleReason(issue: FixtureIssue, what: string): string {
    switch (issue.state) {
      case "offered":
        return "This one is still an offer and was never taken up.";
      case "succeeded":
        return `This one is already done. It was ${what} on day ${issue.steps.at(-1)?.day ?? issue.deadlineDay}.`;
      case "failed":
        return `This one has already failed. It was ${what}: ${issue.steps.at(-1)?.text ?? "the notice ran out"}.`;
      case "accepted":
        return "This one is still in hand.";
    }
  }

  /** The number the player can go and fix, written as a sentence about the world. */
  #shortfallText(issue: FixtureIssue, townName: string, reading: number, target: number): string {
    switch (issue.kind) {
      case "deliver-goods":
        return `${townName} is ${whole(target - reading)} grain units short of the ${whole(target)} it needs`;
      case "clear-hideout":
        return `disorder in ${townName} stands at ${whole(reading)} against a target of ${whole(target)}`;
      case "escort":
        return `${issue.targetName ?? "the road"} stands at ${whole(reading)} against a target of ${whole(target)}`;
    }
  }

  #notable(id: string): FixtureNotable {
    const notable = this.#notables.find((n) => n.id === id);
    if (!notable) throw new Error(`No notable with id ${id}`);
    return notable;
  }

  #issue(id: string): FixtureIssue {
    const issue = this.#issues.get(id);
    if (!issue) throw new Error(`No issue with id ${id}`);
    return issue;
  }

  async planMarch(request: MarchRequest): Promise<MarchPlan> {
    const dest = TOWN_SPECS.find((t) => t.settlementId === request.destinationSettlementId);
    if (!dest) throw new Error(`No settlement with id ${request.destinationSettlementId}`);
    const from = TOWN_SPECS.find((t) => t.settlementId === "golden") ?? TOWN_SPECS[0]!;
    const town = this.#towns.get(`town-${dest.settlementId}`)!;

    // Straight-line distance between real settlement coordinates, which the 3D layer
    // supplies at runtime. The fixture uses a fixed table so plans are deterministic.
    const distanceKm = round2(DISTANCES[`${from.settlementId}->${dest.settlementId}`] ?? 0);
    if (distanceKm === 0) {
      return {
        partyId: this.#party.id,
        destinationSettlementId: dest.settlementId,
        destinationName: dest.name,
        route: [],
        distanceKm: 0,
        days: 0,
        arrivalDay: this.#day,
        cost: { food: 0, money: 0, metal: 0 },
        daysOfFoodOnArrival: null,
        roadDanger: 0,
        warnings: [`No surveyed road connects ${from.name} and ${dest.name}. Move to a town with a road, or plan off-road at reduced speed.`],
        unmapped: true,
      };
    }

    const headcount = this.#party.troops.reduce((a, t) => a + t.count, 0);
    const days = Math.max(1, Math.ceil(distanceKm / this.#party.speedKmPerDay));
    const food = round2(headcount * days * 0.85);
    const money = round2(headcount * days * 0.6 + (dest.klass === "city" ? 40 : 12));
    const metal = round2(headcount * days * 0.05);
    const daysOfFood = food > 0 ? round2(this.#party.food / food) : null;
    const danger = round2(1 - town.roadSafety);

    const warnings: string[] = [];
    if (this.#party.food < food) {
      warnings.push(`Short ${formatFood(food - this.#party.food)} of grain. You have ${formatFood(this.#party.food)} for a ${days}-day march.`);
    }
    if (this.#player.resources.money < money) {
      warnings.push(`Wages will be short by ${formatMoney(money - this.#player.resources.money)} over ${days} days.`);
    }
    if (danger > 0.6) {
      warnings.push(`${dest.name}'s roads are dangerous. Expect raiders on the approach.`);
    }
    if (town.roadSafety < 0.35) {
      warnings.push(`No patrols on this road. Road safety ${town.roadSafety.toFixed(2)}.`);
    }

    return {
      partyId: this.#party.id,
      destinationSettlementId: dest.settlementId,
      destinationName: dest.name,
      route: [],
      distanceKm,
      days,
      arrivalDay: this.#day + days,
      cost: { food, money, metal },
      daysOfFoodOnArrival: daysOfFood,
      roadDanger: danger,
      warnings,
      unmapped: false,
    };
  }

  async commitMarch(request: MarchRequest): Promise<void> {
    const plan = await this.planMarch(request);
    if (plan.unmapped) {
      throw new Error(`Cannot march to ${plan.destinationName}: no surveyed road.`);
    }
    this.#party.destination = { settlementId: request.destinationSettlementId, name: plan.destinationName };
    this.#party.marchingSinceDay = this.#day;
    this.#party.food = round2(this.#party.food - plan.cost.food);
    this.#player.resources.money = round2(this.#player.resources.money - plan.cost.money);
    this.#notifications.push({
      id: `n-march-${this.#sequence}`,
      day: this.#day,
      priority: "informational",
      text: `Marching on ${plan.destinationName}. ${plan.days} days, ${formatDistance(plan.distanceKm)}.`,
      entityId: this.#party.id,
      field: "destination",
    });
    this.#emit({ tick: this.#tick, day: this.#day, party: structuredClone(this.#party), notifications: structuredClone(this.#notifications.slice(-6)) });
  }

  subscribe(onTick: (t: TickUpdate) => void, onStatus: (s: ConnectionStatus) => void): () => void {
    this.#tickListeners.push(onTick);
    onStatus({ state: "connected", detail: "fixture in-process source", attempt: 0 });
    if (this.#timer === null) {
      this.#timer = setInterval(() => this.#step(), 1000 / Math.max(1, FIXTURE.daysPerRealSecond));
    }
    return () => {
      this.#tickListeners = this.#tickListeners.filter((l) => l !== onTick);
      if (this.#tickListeners.length === 0 && this.#timer !== null) {
        clearInterval(this.#timer);
        this.#timer = null;
      }
    };
  }

  /** One in-game day. Systems read the snapshot and write the next one. */
  #step(): void {
    this.#tick += 1;
    this.#day += 1;
    if (this.#day > 28) {
      this.#day = 1;
      this.#month += 1;
    }
    if (this.#month > 12) {
      this.#month = 1;
      this.#year += 1;
    }

    const townDeltas: Record<string, Partial<TownState>> = {};

    for (const town of this.#towns.values()) {
      const before = { food: town.foodStock, unrest: town.unrest, infected: town.infected, money: town.money };
      // Food system: a negative balance drains the stock, in person-days.
      const balance = town.foodProduction - town.foodDemand;
      town.foodStock = Math.max(0, Math.round(town.foodStock + balance));

      // Unrest system: reads the food balance as days of shortfall or surplus, and
      // the infection share. It reads shared fields and writes shared fields; it does
      // not call the Food or Disease systems (CONSTITUTION.md section 2).
      const daysShort = Math.max(0, -balance) / Math.max(1, town.foodDemand);
      const daysSurplus = Math.max(0, balance) / Math.max(1, town.foodDemand);
      const unrestTarget = clamp(
        town.unrest + daysShort * FIXTURE.unrestPerDayOfShortfall - daysSurplus * FIXTURE.unrestPerDayOfSurplus + town.infected * 0.02,
        FIXTURE.unrestFloor,
        FIXTURE.unrestCeiling,
      );
      town.unrest = round2(town.unrest + (unrestTarget - town.unrest) * 0.35);

      if (town.infected > 0.001) {
        // Disease system: burns medicine, and if there is none, takes population.
        const treated = Math.min(town.medicineStock, town.population ? town.infected * town.population * 0.004 : 0);
        town.medicineStock = round2(town.medicineStock - treated);
        town.infected = round2(clamp(town.infected - treated * 0.0006 - town.sanitation * 0.0004, 0, 0.6));
        if (treated === 0 && town.population !== null) {
          const dead = Math.round(town.population * town.infected * 0.0009);
          town.population = Math.max(0, town.population - dead);
          town.workers = Math.round(town.workers * 0.999);
        }
      }

      town.money = round2(town.money + town.prosperity * 40 * (1 - town.unrest));
      town.updatedTick = this.#tick;

      const delta: Partial<TownState> = {};
      if (before.food !== town.foodStock) delta.foodStock = town.foodStock;
      if (before.unrest !== town.unrest) delta.unrest = town.unrest;
      if (before.infected !== town.infected) delta.infected = town.infected;
      if (before.money !== town.money) delta.money = town.money;
      if (Object.keys(delta).length > 0) {
        townDeltas[town.id] = delta;
        if (Math.abs(town.unrest - before.unrest) > 0.02) {
          this.#row("unrest", town.id, town.name, before.unrest, town.unrest, "Unrest", [], `${town.name}'s unrest moved from ${before.unrest} to ${town.unrest}.`);
        }
      }
    }

    // Party marches if ordered: fatigue rises until the party arrives.
    if (this.#party.destination) {
      this.#party.fatigue = round2(clamp(this.#party.fatigue + 0.02, 0, 1));
      if ((this.#day - (this.#party.marchingSinceDay ?? this.#day)) >= 3) {
        this.#party.destination = null;
        this.#party.marchingSinceDay = null;
        this.#party.position = { x: 0, z: 0 };
        this.#notifications.push({ id: `n-arrive-${this.#sequence}`, day: this.#day, priority: "informational", text: "The party made camp.", entityId: this.#party.id, field: "position" });
      }
    }

    this.#applyDailyUpkeep();
    // Prisoners age a day a day, which is what makes waiting on a ransom a decision.
    // Only the player's own cage is ticked here; the lords' is the Ruler system's.
    for (const stack of this.#party.prisoners) stack.daysHeld += 1;
    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({ tick: this.#tick, day: this.#day, towns: townDeltas, party: structuredClone(this.#party), ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings) });
  }

  #emit(update: TickUpdate): void {
    for (const listener of this.#tickListeners) listener(update);
  }

  /**
   * The ledger is a bill, not a display. Every day the party eats its rations,
   * pays its wages, burns ammunition, and pays for the camp — marching or not.
   * A purse that cannot cover the day goes to zero and the shortfall becomes
   * wages owed, which is the number the party panel stamps.
   *
   * Income is not a daily drip: trade receipts arrive when a trade happens, and
   * tolls when the road is held. Only the costs run on the clock.
   */
  #applyDailyUpkeep(): void {
    const wages = round2(this.#party.troops.reduce((a, t) => a + t.count * t.wage, 0));
    const headcount = this.#party.troops.reduce((a, t) => a + t.count, 0);
    const rations = round2(headcount * 0.85);
    const ammo = 3;
    const camp = 14;

    const purseAfter = round2(this.#player.resources.money - wages - camp);
    if (purseAfter >= 0) {
      this.#player.resources.money = purseAfter;
    } else {
      this.#player.resources.money = 0;
      this.#party.wagesOwed = round2(this.#party.wagesOwed - purseAfter);
    }
    // The party's purse mirrors the player's: one purse, two views of it.
    this.#party.money = this.#player.resources.money;

    this.#party.food = round2(Math.max(0, this.#party.food - rations));
    this.#party.metal = round2(Math.max(0, this.#party.metal - ammo));
    this.#player.resources.food = this.#party.food;
    this.#player.resources.metal = this.#party.metal;
  }

  /**
   * Days of game time per real second. Zero pauses the clock. The dial in the HUD
   * is the only caller; the simulation does not guess at speeds on its own.
   */
  setTimeScale(daysPerRealSecond: number): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    if (daysPerRealSecond > 0) {
      this.#timer = setInterval(() => this.#step(), 1000 / daysPerRealSecond);
    }
  }

  /**
   * Run the clock forward until the party's march completes. A march that never
   * arrives is a bug, not an invitation to loop forever, so this gives up after a
   * year and says how far it got.
   */
  async skipToArrival(): Promise<{ daysAdvanced: number }> {
    let days = 0;
    while (this.#party.destination && days < 365) {
      this.#step();
      days += 1;
    }
    return { daysAdvanced: days };
  }

  // -- derived panels -------------------------------------------------------

  #rebuildLedger(): void {
    const headcount = this.#party.troops.reduce((a, t) => a + t.count, 0);
    const wages = round2(this.#party.troops.reduce((a, t) => a + t.count * t.wage, 0));
    const grain = round2(headcount * 0.85);
    const ledger: Ledger = {
      day: this.#day,
      income: [
        { id: "l-trade", label: "Trade receipts", resource: "money", amount: 0, perDay: 240 },
        { id: "l-roads", label: "Road tolls, Clear Creek", resource: "money", amount: 0, perDay: 86 },
      ],
      expenses: [
        { id: "l-wages", label: `Wages, ${headcount} in the party`, resource: "money", amount: wages, perDay: -wages },
        { id: "l-food", label: `Rations, ${headcount} in the party`, resource: "food", amount: grain, perDay: -grain },
        { id: "l-ammo", label: "Ammunition and repair", resource: "metal", amount: 3, perDay: -3 },
        { id: "l-upkeep", label: "Camp and cart upkeep", resource: "money", amount: 14, perDay: -14 },
      ],
      netPerDay: {
        money: round2(240 + 86 - wages - 14),
        food: round2(-grain),
        metal: -3,
        medicine: 0,
        gold: 0,
      },
    };
    this.#ledger = ledger;
  }

  /** Warnings before a resource hits zero (ECONOMY.md section 10). */
  #refreshWarnings(): void {
    const out: ResourceWarning[] = [];
    const days = (current: number, perDay: number): number | null => {
      if (perDay >= 0) return null;
      const draw = -perDay;
      if (draw === 0) return null;
      return round2(current / draw);
    };
    const moneyDays = days(this.#player.resources.money, this.#ledger.netPerDay.money ?? 0);
    if (moneyDays !== null && moneyDays < 12) {
      out.push({
        id: "w-money",
        resource: "money",
        severity: moneyDays < 5 ? "critical" : "warning",
        headline: `MONEY ${moneyDays.toFixed(1)} DAYS`,
        detail: `Wages and upkeep run ${formatMoney(Math.abs(this.#ledger.netPerDay.money ?? 0))} a day against ${formatMoney(this.#player.resources.money)} in the purse.`,
        daysRemaining: moneyDays,
        entityId: this.#party.id,
        field: "money",
      });
    }
    const foodDays = days(this.#party.food, this.#ledger.netPerDay.food ?? 0);
    if (foodDays !== null && foodDays < 10) {
      out.push({
        id: "w-food",
        resource: "food",
        severity: foodDays < 3 ? "critical" : "warning",
        headline: `GRAIN ${foodDays.toFixed(1)} DAYS`,
        detail: `${this.#party.food.toFixed(1)} person-days of grain left for ${this.#party.troops.reduce((a, t) => a + t.count, 0)} people.`,
        daysRemaining: foodDays,
        entityId: this.#party.id,
        field: "food",
      });
    }
    for (const town of this.#towns.values()) {
      const daysOfFood = town.foodDemand <= 0 ? 0 : town.foodStock / town.foodDemand;
      if (daysOfFood < 3) {
        const draw = town.foodDemand - town.foodProduction;
        out.push({
          id: `w-${town.id}`,
          resource: "food",
          severity: daysOfFood < 1 ? "critical" : "warning",
          headline: `${town.name.toUpperCase()} · FOOD ${daysOfFood.toFixed(1)} DAYS`,
          detail:
            draw > 0
              ? `Losing ${draw.toLocaleString("en-US")} person-days a day. Nothing is arriving faster than it is eaten.`
              : `Holding ${Math.abs(draw).toLocaleString("en-US")} person-days a day above demand.`,
          daysRemaining: town.foodStock === 0 ? null : draw > 0 ? round2(daysOfFood * (town.foodDemand / draw)) : null,
          entityId: town.id,
          field: "foodStock",
        });
      }
      if (town.unrest > 0.7) {
        out.push({
          id: `w-u-${town.id}`,
          resource: "money",
          severity: town.unrest > 0.85 ? "critical" : "warning",
          headline: `${town.name.toUpperCase()} · UNREST ${town.unrest.toFixed(2)}`,
          detail: `Loyalty ${town.loyalty.toFixed(2)}. A council vote is possible.`,
          daysRemaining: null,
          entityId: town.id,
          field: "unrest",
        });
      }
    }
    this.#warnings = out;
  }
}

/* -- helpers -------------------------------------------------------------- */

/**
 * Who is willing to sign on, before the town-size factor. A city raises a company;
 * a village raises a squad. The simulation is the authority on the list; the client
 * renders it and sends the order.
 */
const RECRUITABLE_UNITS: Omit<RecruitableUnit, "available">[] = [
  { unitId: "militia", name: "Militia", quality: 1, wage: 0.5, hireCost: 15, blurb: "Locals with rifles. Cheap, and it shows." },
  { unitId: "riflemen", name: "Riflemen", quality: 3, wage: 0.9, hireCost: 60, blurb: "Trained infantry. The backbone of a line." },
  { unitId: "scouts", name: "Scouts", quality: 2, wage: 1.2, hireCost: 90, blurb: "Fast riders. Eyes before the fight." },
];

/** Base willing recruits per unit at a mid-sized town, before the town-size factor. */
const RECRUIT_BASE_AVAILABLE: Record<string, number> = {
  militia: 40,
  riflemen: 24,
  scouts: 12,
};

/**
 * Who is in the cage.
 *
 * Anyone at all only if somebody was hit with something blunt: `balance.toml` sets
 * `blunt_capture_share = 0.15`, so a battle leaves a fifteenth of its casualties in
 * ropes. The player's party holds two stacks and each lord one or two, which is what
 * makes a prisoner worth bargaining for rather than a curiosity.
 */
const PARTY_PRISONERS: PrisonerStack[] = [
  { unitId: "p-raiders", name: "Raider captives", count: 14, quality: 2, daysHeld: 3 },
  { unitId: "p-militia", name: "Militia captives", count: 6, quality: 1, daysHeld: 1 },
];

const RULER_PRISONERS: PrisonerStack[] = [
  { unitId: "p-railcrew", name: "Rail crew", count: 22, quality: 1, daysHeld: 9 },
  { unitId: "p-enemy-line", name: "Enemy line infantry", count: 11, quality: 3, daysHeld: 5 },
];

/**
 * What each lord is holding, drawn from the shared pool so that no two lords are
 * identical and the numbers are the fixture's own rather than the player's.
 */
function rulerPrisonersFor(index: number, rand: () => number): PrisonerStack[] {
  return RULER_PRISONERS.filter((_, i) => (i + index) % 2 === 0).map((p) => ({
    ...p,
    count: Math.max(1, Math.round(p.count * (0.5 + rand() * 0.6))),
  }));
}

/**
 * How many units of each good a market holds at a mid-sized town, before the town-size
 * factor. Deliberately caravan scale, so a load of grain is a real decision.
 */
const GOOD_MARKET_UNITS: Record<GoodId, number> = {
  grain: 90,
  medicine: 24,
  metal: 60,
  fuel: 50,
  arms: 14,
  textiles: 40,
  tools: 32,
  lumber: 55,
};

/** Straight-line distances between the fixture's settlements, in kilometres. */
const DISTANCES: Record<string, number> = {
  "golden->denver": 32,
  "golden->boulder": 41,
  "golden->longmont": 58,
  "golden->idaho-springs": 21,
  "golden->nederland": 14,
  "golden->central-city": 16,
  "golden->aurora": 38,
  "golden->lakewood": 30,
  "denver->boulder": 41,
  "denver->aurora": 17,
  "denver->longmont": 55,
  "nederland->idaho-springs": 9,
  "idaho-springs->central-city": 7,
  "boulder->longmont": 27,
};

/**
 * The Market system's price rule: a market holding its normal stock trades at the base
 * price, and scarcity or surplus moves it in proportion. `ECONOMY.md` section 7 says
 * prices are outputs of shared state with no fixed values, so this is the only place
 * the relationship is written down and the client never applies it.
 */
function priceFor(stock: number, demand: number, base: number = 1): number {
  const ratio = demand <= 0 ? 1 : stock / demand;
  return base * Math.max(0.25, 1 + (1 - ratio) * FIXTURE.priceElasticity);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
/** How big a town's market and recruiting pool are, from its surveyed population. */
function sizeFactorFor(population: number | null): number {
  return population === null ? 0.35 : Math.min(2.2, 0.6 + Math.log10(population + 10) / 5.2);
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function pick<T>(rand: () => number, items: T[]): T[] {
  const chosen = [items[Math.floor(rand() * items.length)]!];
  if (rand() > 0.55) {
    const second = items[Math.floor(rand() * items.length)]!;
    if (!chosen.includes(second)) chosen.push(second);
  }
  return chosen;
}
function setHeld(party: PartyState, goodId: GoodId, quantity: number, price: number): void {
  const existing = party.goods.find((g) => g.goodId === goodId);
  if (existing) {
    existing.quantity = quantity;
    existing.avgPaid = price;
  } else {
    party.goods.push({ goodId, name: GOOD_NAMES[goodId], quantity, avgPaid: price });
  }
}

/** What one prisoner fetches: quality sets the base, days in the cage raise it. */
function prisonerValue(stack: PrisonerStack): number {
  const aged = Math.min(FIXTURE.barterPrisonerDailyCap, stack.daysHeld * FIXTURE.barterPrisonerDailyRise);
  return round2(FIXTURE.barterPrisonerBase * stack.quality * (1 + aged));
}

/**
 * Take prisoners off a stack and hand them back, so the caller can move them.
 *
 * An empty stack leaves the list rather than sitting there at zero, because "holding no
 * raider captives" and "holding zero raider captives" are the same fact and the second
 * one would put a row on the barter table that can never be filled.
 */
function takePrisoners(stacks: PrisonerStack[], unitId: string, count: number): PrisonerStack {
  const stack = stacks.find((p) => p.unitId === unitId);
  if (!stack || stack.count < count) {
    throw new Error(`Only ${stack?.count ?? 0} ${unitId} in hand, cannot give ${count}`);
  }
  stack.count -= count;
  const taken: PrisonerStack = { ...stack, count };
  if (stack.count === 0) stacks.splice(stacks.indexOf(stack), 1);
  return taken;
}

/**
 * Take prisoners into a stack, merging on the unit.
 *
 * The cage clock starts again on the day they change hands, because `prisoner_days` is
 * read from the day they were taken and not from anything they remember.
 */
function addPrisoners(stacks: PrisonerStack[], taken: PrisonerStack): void {
  const existing = stacks.find((p) => p.unitId === taken.unitId);
  if (existing) {
    existing.count += taken.count;
    return;
  }
  stacks.push({ ...taken, daysHeld: 0 });
}

/** A quantity a barter may ask for: a positive whole number, or nothing at all. */
function wholeQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0;
}
function formatMoney(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
}
function formatFood(v: number): string {
  return `${v.toFixed(1)} days of grain`;
}
function formatDistance(v: number): string {
  return `${v.toFixed(0)} km`;
}

