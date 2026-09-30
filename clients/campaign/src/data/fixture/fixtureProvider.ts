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
  CauseRow,
  ConnectionStatus,
  GoodId,
  Ledger,
  MarketGood,
  MarketState,
  MarchPlan,
  MarchRequest,
  Notification,
  PartyState,
  ResourceWarning,
  RulerState,
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
}

/** Twelve real places from `public/world/settlements.json`, with real populations. */
const TOWN_SPECS: FixtureTownsSpec[] = [
  { settlementId: "denver", name: "Denver", klass: "city", population: 715513, holder: "Halloway", unrest: 0.31, loyalty: 0.62, daysOfFood: 9.4, infected: 0.02 },
  { settlementId: "aurora", name: "Aurora", klass: "city", population: 386333, holder: "Halloway", unrest: 0.24, loyalty: 0.7, daysOfFood: 12.1, infected: 0.01 },
  { settlementId: "lakewood", name: "Lakewood", klass: "city", population: 155999, holder: "Halloway", unrest: 0.19, loyalty: 0.74, daysOfFood: 14.6, infected: 0.0 },
  { settlementId: "boulder", name: "Boulder", klass: "city", population: 108556, holder: "Vashti", unrest: 0.38, loyalty: 0.55, daysOfFood: 6.2, infected: 0.03 },
  { settlementId: "thornton", name: "Thornton", klass: "city", population: 141865, holder: "Halloway", unrest: 0.22, loyalty: 0.71, daysOfFood: 11.3, infected: 0.01 },
  { settlementId: "arvada", name: "Arvada", klass: "town", population: 124354, holder: "Halloway", unrest: 0.27, loyalty: 0.66, daysOfFood: 8.8, infected: 0.02 },
  { settlementId: "broomfield", name: "Broomfield", klass: "town", population: 74106, holder: "Halloway", unrest: 0.21, loyalty: 0.73, daysOfFood: 13.2, infected: 0.01 },
  { settlementId: "longmont", name: "Longmont", klass: "town", population: 98919, holder: "Vashti", unrest: 0.44, loyalty: 0.48, daysOfFood: 3.1, infected: 0.06, scenario: "shortage" },
  { settlementId: "golden", name: "Golden", klass: "town", population: 20415, holder: "Vashti", unrest: 0.72, loyalty: 0.29, daysOfFood: 0.4, infected: 0.14, scenario: "outbreak" },
  { settlementId: "idaho-springs", name: "Idaho Springs", klass: "town", population: 15273, holder: "Vashti", unrest: 0.49, loyalty: 0.51, daysOfFood: 5.5, infected: 0.04, scenario: "road-rot" },
  { settlementId: "nederland", name: "Nederland", klass: "town", population: 1470, holder: "Vashti", unrest: 0.35, loyalty: 0.6, daysOfFood: 7.4, infected: 0.02 },
  { settlementId: "central-city", name: "Central City", klass: "village", population: null, holder: "Vashti", unrest: 0.28, loyalty: 0.66, daysOfFood: 9.0, infected: 0.01 },
];

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

export function createFixtureSimulationProvider(options: { seed?: number } = {}): SimulationProvider {
  const state = new FixtureState(options.seed ?? 20050304);
  return {
    kind: "fixture",
    label: `${FIXTURE_MARKER} · Northern Colorado Front Range`,
    getSnapshot: async () => state.snapshot(),
    trade: async (request) => state.trade(request),
    planMarch: async (request) => state.planMarch(request),
    commitMarch: async (request) => state.commitMarch(request),
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
        holderId: spec.holder === "Halloway" ? "ruler-halloway" : "ruler-vashti",
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
    const sizeFactor = population === null ? 0.35 : Math.min(2.2, 0.6 + Math.log10(population + 10) / 5.2);
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

    // Party marches if ordered: the position advances and food comes down.
    if (this.#party.destination) {
      this.#party.food = round2(Math.max(0, this.#party.food - this.#party.troops.reduce((a, t) => a + t.count, 0) * 0.85));
      this.#party.fatigue = round2(clamp(this.#party.fatigue + 0.02, 0, 1));
      if ((this.#day - (this.#party.marchingSinceDay ?? this.#day)) >= 3) {
        this.#party.destination = null;
        this.#party.marchingSinceDay = null;
        this.#party.position = { x: 0, z: 0 };
        this.#notifications.push({ id: `n-arrive-${this.#sequence}`, day: this.#day, priority: "informational", text: "The party made camp.", entityId: this.#party.id, field: "position" });
      }
    }

    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({ tick: this.#tick, day: this.#day, towns: townDeltas, party: structuredClone(this.#party), ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings) });
  }

  #emit(update: TickUpdate): void {
    for (const listener of this.#tickListeners) listener(update);
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
function formatMoney(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
}
function formatFood(v: number): string {
  return `${v.toFixed(1)} days of grain`;
}
function formatDistance(v: number): string {
  return `${v.toFixed(0)} km`;
}

