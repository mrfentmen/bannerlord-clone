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
import { getEthnicity, getEthnicityEffects } from "../ethnicities.js";
import type {
  BattleResult,
  CauseRow,
  ConnectionStatus,
  GoodId,
  ImproveRelationRequest,
  ImproveRelationResult,
  Ledger,
  MarketGood,
  MarketState,
  MarchCommitResult,
  MarchPlan,
  MarchRequest,
  Notable,
  NotableType,
  Notification,
  PartyState,
  PlayerCharacter,
  RecruitableUnit,
  RecruitRequest,
  RecruitResult,
  ResourceWarning,
  RulerState,
  SimSnapshot,
  SimulationProvider,
  TalkToNotableResult,
  TickUpdate,
  TownState,
  TradeRequest,
  TradeResult,
  BattleXpAward,
  BattleXpInput,
  UpgradeTroopsRequest,
  UpgradeTroopsResult,
  ConstructionResult,
  TaxOrderResult,
  TimeScaleResult,
  WhyChain,
} from "../types.js";
import { troopStackPower, troopTier } from "../types.js";
import { SNAPSHOT_SCHEMA_VERSION } from "../wire.js";

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
  /** Fixed culture of the settlement. Holder culture mismatch drains loyalty. */
  culture: string;
  /** Culture of the holding clan. Defaults to matching `culture`. */
  holderCulture?: string;
  /** Starting security (0-1). Defaults to 0.55. */
  security?: number;
  /** Towns that are in trouble get a real pre-existing cause chain in the log. */
  scenario?: "shortage" | "outbreak" | "road-rot";
}

/** Starting city slug -> campaign map spawn position. */
const CITY_SPAWNS: Record<string, { x: number; z: number }> = {
  "manhattan-sample": { x: 100, z: 50 },
  "la-downtown": { x: -80, z: 120 },
  "houston-downtown": { x: 60, z: -90 },
  "miami-downtown": { x: 140, z: -40 },
};

/** Twelve real places from `public/world/settlements.json`, with real populations. */
const TOWN_SPECS: FixtureTownsSpec[] = [
  { settlementId: "denver", name: "Denver", klass: "city", population: 715513, holder: "Halloway", unrest: 0.31, loyalty: 0.62, daysOfFood: 9.4, infected: 0.02 , culture: "heartlander", holderCulture: "heartlander", security: 0.68},
  { settlementId: "aurora", name: "Aurora", klass: "city", population: 386333, holder: "Halloway", unrest: 0.24, loyalty: 0.7, daysOfFood: 12.1, infected: 0.01 , culture: "heartlander", holderCulture: "heartlander", security: 0.62},
  { settlementId: "lakewood", name: "Lakewood", klass: "city", population: 155999, holder: "Halloway", unrest: 0.19, loyalty: 0.74, daysOfFood: 14.6, infected: 0.0 , culture: "heartlander", holderCulture: "heartlander", security: 0.6},
  { settlementId: "boulder", name: "Boulder", klass: "city", population: 108556, holder: "Vashti", unrest: 0.38, loyalty: 0.55, daysOfFood: 6.2, infected: 0.03 , culture: "heartlander", holderCulture: "highlander", security: 0.52},
  { settlementId: "thornton", name: "Thornton", klass: "city", population: 141865, holder: "Halloway", unrest: 0.22, loyalty: 0.71, daysOfFood: 11.3, infected: 0.01 , culture: "heartlander", holderCulture: "heartlander", security: 0.64},
  { settlementId: "arvada", name: "Arvada", klass: "town", population: 124354, holder: "Halloway", unrest: 0.27, loyalty: 0.66, daysOfFood: 8.8, infected: 0.02 , culture: "heartlander", holderCulture: "heartlander", security: 0.55},
  { settlementId: "broomfield", name: "Broomfield", klass: "town", population: 74106, holder: "Halloway", unrest: 0.21, loyalty: 0.73, daysOfFood: 13.2, infected: 0.01 , culture: "heartlander", holderCulture: "heartlander", security: 0.58},
  { settlementId: "longmont", name: "Longmont", klass: "town", population: 98919, holder: "Vashti", unrest: 0.44, loyalty: 0.48, daysOfFood: 3.1, infected: 0.06, scenario: "shortage" , culture: "heartlander", holderCulture: "highlander", security: 0.45},
  { settlementId: "golden", name: "Golden", klass: "town", population: 20415, holder: "Vashti", unrest: 0.72, loyalty: 0.29, daysOfFood: 0.4, infected: 0.14, scenario: "outbreak" , culture: "highlander", holderCulture: "highlander", security: 0.38},
  { settlementId: "idaho-springs", name: "Idaho Springs", klass: "town", population: 15273, holder: "Vashti", unrest: 0.49, loyalty: 0.51, daysOfFood: 5.5, infected: 0.04, scenario: "road-rot" , culture: "highlander", holderCulture: "highlander", security: 0.5},
  { settlementId: "nederland", name: "Nederland", klass: "town", population: 1470, holder: "Vashti", unrest: 0.35, loyalty: 0.6, daysOfFood: 7.4, infected: 0.02 , culture: "highlander", holderCulture: "highlander", security: 0.53},
  { settlementId: "central-city", name: "Central City", klass: "village", population: null, holder: "Vashti", unrest: 0.28, loyalty: 0.66, daysOfFood: 9.0, infected: 0.01 , culture: "highlander", holderCulture: "highlander", security: 0.48},
];

/**
 * Settlement projects: Bannerlord's "Manage Town" building list, ported to
 * modern names. Mirrors the Go simulation's construction package. Costs are
 * per tier [1, 2, 3]; days = cost * 0.005.
 */
const BUILDING_DEFS: { id: string; name: string; bannerlord: string; blurb: string; costs: [number, number, number] }[] = [
  { id: "walls", name: "City Walls", bannerlord: "Fortifications", blurb: "Slows siege breach work", costs: [0, 8000, 16000] },
  { id: "barracks", name: "Police Barracks", bannerlord: "Garrison Barracks", blurb: "Raises garrison cap", costs: [2000, 3000, 4000] },
  { id: "training", name: "Training Grounds", bannerlord: "Training Fields", blurb: "Garrison morale up", costs: [2000, 3000, 4000] },
  { id: "community", name: "Community Center", bannerlord: "Fairgrounds", blurb: "Loyalty per day", costs: [2000, 3000, 4000] },
  { id: "commercial", name: "Commercial District", bannerlord: "Marketplace", blurb: "+5% tax income per tier", costs: [2000, 3000, 4000] },
  { id: "warehouse", name: "Food Warehouse", bannerlord: "Granary", blurb: "Food storage cap", costs: [1000, 1500, 2000] },
  { id: "farms", name: "Urban Farms", bannerlord: "Orchards", blurb: "Food per day", costs: [2000, 3000, 4000] },
  { id: "watch", name: "Neighborhood Watch", bannerlord: "Militia Grounds", blurb: "Militia per day", costs: [2000, 3000, 4000] },
  { id: "infra", name: "Infrastructure", bannerlord: "Aqueducts", blurb: "Prosperity per day", costs: [2000, 3000, 4000] },
  { id: "civic", name: "Civic Center", bannerlord: "Forum", blurb: "Influence per day to holder", costs: [2000, 3000, 4000] },
];

const BUILDING_MAX_LEVEL = 3;
const BUILDING_DAYS_PER_COST = 0.005;

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
    label: `${FIXTURE_MARKER} · Ohio River Valley`,
    getSnapshot: async () => state.snapshot(),
    trade: async (request) => state.trade(request),
    recruit: async (request) => state.recruit(request),
    talkToNotable: async (settlementId, notableId) => state.talkToNotable(settlementId, notableId),
    improveRelation: async (request) => state.improveRelation(request),
    planMarch: async (request) => state.planMarch(request),
    commitMarch: async (request) => state.commitMarch(request),
    setTimeScale: async (daysPerRealSecond) => state.setTimeScale(daysPerRealSecond),
    skipToArrival: async () => state.skipToArrival(),
    setEthnicity: (ethnicityId) => state.setEthnicity(ethnicityId),
    setCharacter: (character) => state.setCharacter(character),
    awardBattleXp: async (input) => state.awardBattleXp(input),
    applyBattleResult: async (input) => state.applyBattleResult(input),
    applyBattleOutcome: async (result) => state.applyBattleOutcome(result),
    defeatNpcParty: async (partyId) => state.defeatNpcParty(partyId),
    restoreSnapshot: async (snapshot) => state.restoreSnapshot(snapshot),
    getNearbyHostiles: async (rangeKm) => state.getNearbyHostiles(rangeKm),
    upgradeTroops: async (request) => state.upgradeTroops(request),
    setTaxRate: async (townId, rate) => state.setTaxRate(townId, rate),
    setStateTaxRate: async (st, rate) => state.setStateTaxRate(st, rate),
    startConstruction: async (townId, buildingId) => state.startConstruction(townId, buildingId),
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
  #notables = new Map<string, Notable>();
  #markets = new Map<string, MarketState>();
  #party!: PartyState;
  #rulers: RulerState[] = [];
  #warnings: ResourceWarning[] = [];
  #notifications: Notification[] = [];
  #ledger!: Ledger;
  // Typed as the snapshot's own player so the character sheet's optional
  // fields are typed here too, rather than written through a Record<string,
  // unknown> cast that no typechecker reads.
  #player: SimSnapshot["player"] = { partyId: "party-player", characterName: "Wren Calloway", ethnicityId: "african", appearanceId: "", age: 30, biography: "", skills: {}, factionId: "mountain-alliance", resources: { money: 2180, gold: 340, food: 46, metal: 62, medicine: 8 }, influence: 0, renown: 0 };
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
        security: spec.security ?? 0.55,
        culture: spec.culture,
        holderCulture: spec.holderCulture ?? spec.culture,
        rebellious: false,
        notables: [],
        prosperity: 0.5 + rand() * 0.3,
        taxRate: 0.22,
        stateTaxRate: 0.03,
        state: "CO",
        buildings: BUILDING_DEFS.map((d) => {
          const level = Math.floor(rand() * 2); // fixture towns start at tier 0-1
          const nextCost = level >= BUILDING_MAX_LEVEL ? 0 : (d.costs[level] ?? 0);
          return {
            id: d.id,
            name: d.name,
            bannerlord: d.bannerlord,
            level,
            maxLevel: BUILDING_MAX_LEVEL,
            blurb: d.blurb,
            nextCost,
            nextDays: Math.max(1, Math.round(nextCost * BUILDING_DAYS_PER_COST)),
          };
        }),
        constructionBuilding: null,
        constructionDaysLeft: 0,
        garrison: spec.klass === "city" ? 420 : 90,
        garrisonConduct: 0.74,
        roadSafety: spec.scenario === "road-rot" ? 0.21 : 0.62 + rand() * 0.2,
        informationTrust: 0.5 + rand() * 0.3,
        money: Math.round((population ?? 900) * 2.4),
        gold: Math.round((population ?? 900) * 0.6),
        metal: Math.round((population ?? 900) * 0.9),
        updatedTick: 0,
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
        { id: "t-riflemen", name: "Riflemen", count: 18, wounded: 0, quality: 3, tier: 3, xp: 0, wage: 0.9, morale: 0.8 },
        { id: "t-drivers", name: "Drivers", count: 6, wounded: 0, quality: 2, tier: 2, xp: 0, wage: 1.2, morale: 0.76 },
        { id: "t-surgeon", name: "Field surgeon", count: 1, wounded: 0, quality: 4, tier: 4, xp: 0, wage: 3.1, morale: 0.85 },
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
    this.#generateNotables();
  }

  /**
   * Notables: 2-4 named NPCs per settlement with power and relations.
   * Wiki gap item #39. Power gates recruitment; relations unlock prices and quests.
   */
  #generateNotables(): void {
    const rand = this.#random;
    for (const town of this.#towns.values()) {
      const count = 2 + Math.floor(rand() * 3); // 2-4
      const types = [...NOTABLE_TYPES].sort(() => rand() - 0.5).slice(0, count);
      const notables: Notable[] = types.map((type, i) => {
        const culture = NOTABLE_CULTURES[Math.floor(rand() * NOTABLE_CULTURES.length)]!;
        const firsts = NOTABLE_FIRST_NAMES[culture]!;
        const lasts = NOTABLE_LAST_NAMES[culture]!;
        const first = firsts[Math.floor(rand() * firsts.length)]!;
        const last = lasts[Math.floor(rand() * lasts.length)]!;
        // Bigger towns attract more powerful notables.
        const sizeBonus = town.klass === "city" ? 25 : town.klass === "town" ? 10 : 0;
        const power = Math.round(clamp(20 + rand() * 55 + sizeBonus, 1, 100));
        const notable: Notable = {
          id: `notable-${town.settlementId}-${i}`,
          settlementId: town.settlementId,
          name: `${first} ${last}`,
          type,
          power,
          // Start slightly warm or cool; the player earns the rest.
          relation: Math.round((rand() - 0.5) * 30),
          blurb: NOTABLE_TYPE_BLURBS[type],
        };
        this.#notables.set(notable.id, notable);
        return notable;
      });
      town.notables = notables;
      this.#applyNotablePowerToRecruits(town);
    }
  }

  /**
   * Notable power gates recruitment: the willing pool scales with the total
   * power of the settlement's notables. A town full of nobodies raises a squad;
   * a town with connected notables raises a company.
   */
  #applyNotablePowerToRecruits(town: TownState): void {
    const totalPower = town.notables.reduce((a, n) => a + n.power, 0);
    // 2-4 notables at ~20-100 power each: total 40-400. Maps to 0.5x-2.5x.
    const factor = 0.5 + totalPower / 200;
    const fx = getEthnicityEffects(this.#player.ethnicityId);
    for (const unit of town.recruitable) {
      const base = Math.max(4, Math.round((RECRUIT_BASE_AVAILABLE[unit.unitId] ?? 10) * sizeFactorFor(town.population)));
      unit.available = Math.max(2, Math.round(base * factor * fx.recruitSpeedMult));
    }
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
    const fx = getEthnicityEffects(this.#player.ethnicityId);
    const party = structuredClone(this.#party);
    party.morale = Math.min(1, Math.max(0, party.morale + fx.partyMoraleBonus + fx.desertMoralePenalty));
    return {
      // Stamped like the real server does, so the client's version gate is exercised by
      // the fixture too rather than only by a hand-written test payload.
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      day: this.#day,
      year: this.#year,
      eraTier: 4,
      player: { ...this.#player, resources: { ...this.#player.resources } },
      party,
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
      const fx = getEthnicityEffects(this.#player.ethnicityId);
      const sellTotal = round2(total * fx.tradeProfitMult * fx.sellPriceMult);
      this.#player.resources.money = round2(this.#player.resources.money + sellTotal);
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
        wounded: 0,
        quality: offered.quality,
        tier: offered.quality,
        xp: 0,
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

  /**
   * Talk to a notable. Dialogue is shaped by type and relation; the action list
   * reflects what the notable will actually do for the player right now.
   */
  async talkToNotable(settlementId: string, notableId: string): Promise<TalkToNotableResult> {
    const notable = this.#notables.get(notableId);
    if (!notable || notable.settlementId !== settlementId) {
      throw new Error(`No notable ${notableId} in ${settlementId}`);
    }
    const town = this.#towns.get(`town-${settlementId}`);
    const townName = town?.name ?? settlementId;

    const dialogue: string[] = [];
    if (notable.relation >= 50) {
      dialogue.push(`${notable.name} grins. "Always good to see you. What do you need?"`);
    } else if (notable.relation >= 0) {
      dialogue.push(`${notable.name} nods. "Talk. I've got things to do."`);
    } else if (notable.relation >= -40) {
      dialogue.push(`${notable.name} eyes you coldly. "You. What do you want?"`);
    } else {
      dialogue.push(`${notable.name} doesn't look up. "Make it quick, or get out of ${townName}."`);
    }
    if (notable.type === "merchant") dialogue.push('"Everything in this town passes through my hands. Remember that."');
    else if (notable.type === "gang-leader") dialogue.push('"The streets are mine after dark. You want something done quiet, I\'m the one."');
    else if (notable.type === "veteran") dialogue.push('"I\'ve buried better than you. But you\'ve got spine, I\'ll give you that."');
    else dialogue.push('"This neighborhood holds together because people like me hold it. Don\'t forget that."');

    const canGift = this.#player.resources.money >= 50;
    const canAskRecruits = notable.relation >= -20;
    const canAskQuest = notable.relation >= 30 && notable.power >= 50;
    const actions: TalkToNotableResult["actions"] = [
      {
        id: "gift", label: "Offer a gift (50 gold)", detail: "Gold opens doors. Raises relation.",
        available: canGift, ...(canGift ? {} : { reason: "You don't have 50 gold to spare." }),
      },
      {
        id: "favor", label: "Do a favor", detail: "Run an errand. Raises relation more than gold.",
        available: true,
      },
      {
        id: "ask-recruits", label: "Ask about recruits",
        detail: `Power ${notable.power}: their word carries weight in the hiring halls.`,
        available: canAskRecruits, ...(canAskRecruits ? {} : { reason: "They won't lift a finger for you at this relation." }),
      },
      {
        id: "ask-quest", label: "Ask for work", detail: "Notables with real power always have problems that need solving.",
        available: canAskQuest, ...(canAskQuest ? {} : { reason: "Earn their trust first (relation 30+, power 50+)." }),
      },
    ];

    return { notableId: notable.id, name: notable.name, dialogue, actions };
  }

  /**
   * Raise a notable's relation. Gifts cost gold with diminishing returns;
   * favors cost nothing but give a bigger bump. Relation caps at 100.
   */
  async improveRelation(request: ImproveRelationRequest): Promise<ImproveRelationResult> {
    const notable = this.#notables.get(request.notableId);
    if (!notable) throw new Error(`No notable ${request.notableId}`);
    const before = notable.relation;

    if (request.action === "gift") {
      const amount = request.amount ?? 50;
      if (amount < 50) {
        return {
          accepted: false, notableId: notable.id, name: notable.name,
          relationBefore: before, relationAfter: before,
          summary: "A gift under 50 gold is an insult, not a gesture.",
          reason: "Gifts start at 50 gold.", causedBy: "notable-gift-rejected",
        };
      }
      if (this.#player.resources.money < amount) {
        return {
          accepted: false, notableId: notable.id, name: notable.name,
          relationBefore: before, relationAfter: before,
          summary: `You don't have ${formatMoney(amount)} to give.`,
          reason: "Not enough gold.", causedBy: "notable-gift-rejected",
        };
      }
      this.#player.resources.money = round2(this.#player.resources.money - amount);
      const gain = Math.max(2, Math.round(12 * (1 - before / 150)));
      notable.relation = clamp(before + gain, -100, 100);
      const causedBy = this.#row("relation", notable.id, notable.name, before, notable.relation, "Diplomacy", [],
        `${notable.name}'s relation rose from ${before} to ${notable.relation} after a ${formatMoney(amount)} gift.`);
      this.#rebuildLedger();
      this.#emitNotables(notable);
      return {
        accepted: true, notableId: notable.id, name: notable.name,
        relationBefore: before, relationAfter: notable.relation,
        summary: `You gave ${notable.name} ${formatMoney(amount)}. Relation ${before} → ${notable.relation}.`,
        causedBy,
      };
    }

    const gain = Math.max(3, Math.round(18 * (1 - before / 150)));
    notable.relation = clamp(before + gain, -100, 100);
    const causedBy = this.#row("relation", notable.id, notable.name, before, notable.relation, "Diplomacy", [],
      `${notable.name}'s relation rose from ${before} to ${notable.relation} after you did them a favor.`);
    this.#emitNotables(notable);
    return {
      accepted: true, notableId: notable.id, name: notable.name,
      relationBefore: before, relationAfter: notable.relation,
      summary: `You did a favor for ${notable.name}. Relation ${before} → ${notable.relation}.`,
      causedBy,
    };
  }

  /** Push a notable change to tick listeners via its town's delta. */
  #emitNotables(notable: Notable): void {
    const townId = `town-${notable.settlementId}`;
    const town = this.#towns.get(townId);
    this.#emit({
      tick: this.#tick, day: this.#day,
      ...(town ? { towns: { [townId]: { notables: town.notables.map((n) => ({ ...n })) } } } : {}),
      party: structuredClone(this.#party), ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings),
    });
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

  /**
   * Give the march order and file it as a record.
   *
   * The march id is not decoration: it goes into the cause log as the id of the row that
   * wrote the party's destination, so "why is my party on the road" is walkable from the
   * id the client was handed. That is the whole premise, and it only works if the commit
   * hands the id back rather than throwing it away.
   */
  async commitMarch(request: MarchRequest): Promise<MarchCommitResult> {
    const plan = await this.planMarch(request);
    if (plan.unmapped) {
      throw new Error(`Cannot march to ${plan.destinationName}: no surveyed road.`);
    }
    const marchId = `march-${this.#sequence + 1}`;
    this.#party.destination = { settlementId: request.destinationSettlementId, name: plan.destinationName };
    this.#party.marchingSinceDay = this.#day;
    this.#party.food = round2(this.#party.food - plan.cost.food);
    this.#player.resources.money = round2(this.#player.resources.money - plan.cost.money);
    // Written against the `destination` field, because that is the field the HUD asks
    // about: `why(partyId, "destination")` reaches this row and no other.
    const causedBy = this.#row(
      "destination",
      this.#party.id,
      this.#party.name,
      0,
      1,
      "Player",
      [],
      `The order to march on ${plan.destinationName} was given and accepted: ${plan.days} days, arriving day ${plan.arrivalDay}.`,
    );
    this.#notifications.push({
      id: `n-march-${this.#sequence}`,
      day: this.#day,
      priority: "informational",
      text: `Marching on ${plan.destinationName}. ${plan.days} days, ${formatDistance(plan.distanceKm)}.`,
      entityId: this.#party.id,
      field: "destination",
      causedBy,
    });
    this.#emit({ tick: this.#tick, day: this.#day, party: structuredClone(this.#party), notifications: structuredClone(this.#notifications.slice(-6)) });
    return { marchId, destinationName: plan.destinationName, arrivalDay: plan.arrivalDay, days: plan.days };
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
      const before = { food: town.foodStock, unrest: town.unrest, infected: town.infected, money: town.money, loyalty: town.loyalty, security: town.security, rebellious: town.rebellious };
      // Construction: advance the active project, completing it when due.
      this.#progressConstruction(town);
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

      // -- Security system (Bannerlord, scaled 0-100 -> 0-1) ------------------
      const garrisonFactor = town.garrison / 400;
      const securityTarget = clamp(0.5 + (garrisonFactor - 1) * 0.3, 0.1, 0.95);
      town.security = clamp(town.security + (securityTarget - town.security) * 0.1, 0, 1);
      if (town.underSiege) town.security = clamp(town.security - 0.03, 0, 1);
      if (town.nearbyHideout) town.security = clamp(town.security - 0.02, 0, 1);
      if (town.lootedVillage) town.security = clamp(town.security - 0.02, 0, 1);
      town.security = clamp(town.security, 0, 1);

      // -- Loyalty system (Bannerlord, scaled 0-100 -> 0-1) --------------------
      let loyaltyDelta = 0;
      if (town.holderCulture !== town.culture) loyaltyDelta -= 0.03;
      loyaltyDelta += town.security >= 0.5 ? 0.01 : -0.02;
      if (town.foodStock <= 0) loyaltyDelta -= 0.02;
      loyaltyDelta += (0.5 - town.loyalty) * 0.05;
      const loyaltyBefore = town.loyalty;
      town.loyalty = clamp(town.loyalty + loyaltyDelta, 0, 1);

      if (town.loyalty < 0.25 && !town.rebellious && this.#random() < 0.25) {
        town.rebellious = true;
        this.#notifications.push({
          id: `n-rebel-${town.id}-${this.#sequence++}`,
          day: this.#day,
          priority: "critical",
          text: `${town.name} has risen in rebellion!`,
          entityId: town.id,
          field: "rebellious",
        });
        this.#row("rebellion", town.id, town.name, loyaltyBefore, town.loyalty, "Rebellion", [], `${town.name}'s loyalty collapsed to ${town.loyalty} and the town rebelled.`);
      }
      if (town.rebellious && town.loyalty >= 0.4) {
        town.rebellious = false;
        this.#notifications.push({
          id: `n-calm-${town.id}-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `${town.name} has been pacified.`,
          entityId: town.id,
          field: "rebellious",
        });
      }

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

      let taxMult = 1;
      if (!town.rebellious) {
        if (town.security >= 0.75) taxMult += 0.05;
        if (town.security < 0.5) taxMult -= 0.1;
        if (town.loyalty >= 0.75) taxMult += 0.05;
      } else {
        taxMult = 0;
      }
      town.money = round2(town.money + town.prosperity * 40 * (1 - town.unrest) * taxMult);
      town.updatedTick = this.#tick;

      const delta: Partial<TownState> = {};
      if (before.food !== town.foodStock) delta.foodStock = town.foodStock;
      if (before.unrest !== town.unrest) delta.unrest = town.unrest;
      if (before.infected !== town.infected) delta.infected = town.infected;
      if (before.money !== town.money) delta.money = town.money;
      if (before.loyalty !== town.loyalty) delta.loyalty = town.loyalty;
      if (before.security !== town.security) delta.security = town.security;
      if (before.rebellious !== town.rebellious) delta.rebellious = town.rebellious;
      if (Object.keys(delta).length > 0) {
        townDeltas[town.id] = delta;
        if (Math.abs(town.unrest - before.unrest) > 0.02) {
          this.#row("unrest", town.id, town.name, before.unrest, town.unrest, "Unrest", [], `${town.name}'s unrest moved from ${before.unrest} to ${town.unrest}.`);
        }
      }
    }

    // Notables: power drifts a little each day (random walk, mean-reverting).
    // Relations decay slowly toward 0 when neglected — friendship needs upkeep.
    // Drift also re-gates recruitment, so the hiring pool breathes over time.
    const notableDeltas = new Map<string, Notable[]>();
    for (const notable of this.#notables.values()) {
      const beforePower = notable.power;
      const beforeRelation = notable.relation;
      const drift = (this.#random() - 0.5) * 4; // ±2
      const meanReversion = (50 - notable.power) * 0.02;
      notable.power = Math.round(clamp(notable.power + drift + meanReversion, 1, 100));
      if (notable.relation !== 0) {
        notable.relation = Math.round(notable.relation * 0.995);
      }
      if (notable.power !== beforePower || notable.relation !== beforeRelation) {
        const townId = `town-${notable.settlementId}`;
        if (!notableDeltas.has(townId)) notableDeltas.set(townId, []);
        notableDeltas.get(townId)!.push({ ...notable });
      }
    }
    for (const townId of notableDeltas.keys()) {
      const town = this.#towns.get(townId);
      if (town) {
        this.#applyNotablePowerToRecruits(town);
        townDeltas[townId] = { ...townDeltas[townId], notables: town.notables.map((n) => ({ ...n })) };
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
    this.#applyTrainingXp();
    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({ tick: this.#tick, day: this.#day, towns: townDeltas, party: structuredClone(this.#party), ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings) });
    this.#recoverWounded();
    this.#moveNpcParties();
    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({ tick: this.#tick, day: this.#day, towns: townDeltas, party: structuredClone(this.#party), npcParties: structuredClone(this.#npcParties), ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings) });
  }

  /**
   * Wounded troops recover over campaign time. Each day, a fraction of wounded
   * return to fighting strength. Recovery is faster with a surgeon and medicine.
   */
  #recoverWounded(): void {
    const hasSurgeon = this.#party.roles.surgeon != null;
    const medicineBonus = this.#party.medicine > 0 ? 0.1 : 0;
    // Base 20% recover per day, +10% with surgeon, +10% with medicine.
    const recoveryRate = 0.2 + (hasSurgeon ? 0.1 : 0) + medicineBonus;

    for (const stack of this.#party.troops) {
      if (stack.wounded > 0) {
        const recovered = Math.min(stack.wounded, Math.max(1, Math.round(stack.wounded * recoveryRate)));
        stack.wounded -= recovered;
        stack.count += recovered;
      }
    }
  }

  /**
   * Move NPC parties. Bandits wander; when they have no destination they pick a
   * new random one within a bounded range. Deterministic via the seeded RNG.
   */
  #moveNpcParties(): void {    const rand = this.#random;
    for (const npc of this.#npcParties) {
      if (!npc.destination) {
        // Pick a new wander target within ~150km.
        const angle = rand() * Math.PI * 2;
        const dist = 40 + rand() * 110;
        npc.destination = {
          x: npc.position.x + Math.cos(angle) * dist,
          z: npc.position.z + Math.sin(angle) * dist,
        };
      }
      const dx = npc.destination.x - npc.position.x;
      const dz = npc.destination.z - npc.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1) {
        npc.destination = null;
        continue;
      }
      const step = Math.min(dist, npc.speedKmPerDay);
      npc.position.x += (dx / dist) * step;
      npc.position.z += (dz / dist) * step;
    }
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
    const fx = getEthnicityEffects(this.#player.ethnicityId);
    const wages = round2(this.#party.troops.reduce((a, t) => a + t.count * t.wage, 0) * fx.troopWageMult);
    const headcount = this.#party.troops.reduce((a, t) => a + t.count, 0);
    const rations = round2(headcount * 0.85 * fx.foodConsumptionMult);
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
   * Daily drill. A party sitting in camp trains: every soldier banks a little
   * XP. Marching troops are too busy walking to drill. (When the Training
   * Fields construction project lands, it will multiply this for garrisons.)
   */
  #applyTrainingXp(): void {
    if (this.#party.destination) return;
    const XP_PER_SOLDIER_PER_DAY = 2;
    for (const stack of this.#party.troops) {
      if (stack.count > 0) {
        stack.xp = Math.round(stack.xp + XP_PER_SOLDIER_PER_DAY * stack.count);
      }
    }
  }

  async awardBattleXp(input: BattleXpInput): Promise<BattleXpAward[]> {
    const ids = new Set(input.stackIds ?? this.#party.troops.map((t) => t.id));
    const fighters = this.#party.troops.filter((t) => ids.has(t.id) && t.count > 0);
    if (fighters.length === 0) return [];

    const ownStrength = fighters.reduce((a, t) => a + troopStackPower(t), 0);
    const ratio = Math.min(3, Math.max(0.25, input.enemyStrength / Math.max(1, ownStrength)));
    const xpPerSoldier = Math.round(20 * ratio * (input.won ? 1 : 0.5));

    const awarded: BattleXpAward[] = [];
    for (const stack of fighters) {
      const xp = xpPerSoldier * stack.count;
      stack.xp = Math.round(stack.xp + xp);
      awarded.push({ stackId: stack.id, xp });
    }

    this.#notifications.push({
      id: `n-xp-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: input.won
        ? `Victory. The troops gained ${xpPerSoldier} XP per soldier.`
        : `Defeat, but the survivors learned ${xpPerSoldier} XP per soldier.`,
      entityId: this.#party.id,
      field: "troops",
    });
    return awarded;
  }

  /**
   * Apply a battle's outcome to the campaign party: casualties reduce troop
   * counts proportionally across stacks, loot is added to money, and XP is
   * awarded to surviving troops.
   */
  async applyBattleResult(input: {
    won: boolean;
    playerLosses: number;
    loot: number;
    enemyStrength: number;
    prisonersCaptured?: { troopId: string; name: string; count: number; tier: number }[];
  }): Promise<{
    troopsRemaining: number;
    money: number;
    xpAwards: { stackId: string; xp: number }[];
    prisoners: { troopId: string; name: string; count: number; tier: number }[];
  }> {
    // Apply casualties proportionally across stacks with troops.
    const stacks = this.#party.troops.filter((t) => t.count > 0);
    const totalTroops = stacks.reduce((a, t) => a + t.count, 0);

    if (totalTroops > 0 && input.playerLosses > 0) {
      let lossesLeft = Math.round(input.playerLosses);
      // Distribute losses proportionally, largest stacks first for stability.
      const sorted = [...stacks].sort((a, b) => b.count - a.count);
      for (const stack of sorted) {
        if (lossesLeft <= 0) break;
        const share = Math.min(stack.count, Math.round((stack.count / totalTroops) * input.playerLosses));
        const loss = Math.min(share, lossesLeft, stack.count);
        stack.count -= loss;
        lossesLeft -= loss;
      }
      // Mop up rounding remainder from the largest remaining stack.
      if (lossesLeft > 0) {
        const biggest = sorted.find((s) => s.count > 0);
        if (biggest) biggest.count = Math.max(0, biggest.count - lossesLeft);
      }
    }

    const troopsRemaining = this.#party.troops.reduce((a, t) => a + t.count, 0);

    // Add loot to money.
    if (input.loot > 0) {
      this.#party.money = Math.round(this.#party.money + input.loot);
    }

    // Award XP to survivors.
    const xpAwards = await this.awardBattleXp({
      won: input.won,
      enemyStrength: input.enemyStrength,
    });

    // Add prisoners to the party's prisoner list.
    if (input.prisonersCaptured && input.prisonersCaptured.length > 0) {
      for (const p of input.prisonersCaptured) {
        const existing = this.#party.prisoners.find((x) => x.troopId === p.troopId);
        if (existing) {
          existing.count += p.count;
        } else {
          this.#party.prisoners.push({ ...p });
        }
      }
    }

    this.#notifications.push({
      id: `n-battle-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: input.won
        ? `Victory. Lost ${totalTroops - troopsRemaining} troops, gained ${Math.round(input.loot)} in spoils.`
        : `Defeat. Lost ${totalTroops - troopsRemaining} troops.`,
      entityId: this.#party.id,
      field: "troops",
    });

    return {
      troopsRemaining,
      money: this.#party.money,
      xpAwards,
      prisoners: structuredClone(this.#party.prisoners),
    };
  }

  /**
   * Apply an authoritative battle result. Uses actual killed/wounded numbers
   * from the battle, not estimates. Wounded troops move to the wounded pool
   * and recover over campaign time.
   */
  async applyBattleOutcome(result: BattleResult): Promise<{
    troopsRemaining: number;
    money: number;
    xpAwards: { stackId: string; xp: number }[];
    prisoners: { troopId: string; name: string; count: number; tier: number }[];
  }> {
    const player = result.attacker.isPlayer ? result.attacker : result.defender;
    const enemy = result.attacker.isPlayer ? result.defender : result.attacker;
    const won = result.winner === "attacker" ? result.attacker.isPlayer : result.winner === "defender" ? result.defender.isPlayer : false;

    // Apply killed and wounded proportionally across stacks.
    const stacks = this.#party.troops.filter((t) => t.count > 0);
    const totalTroops = stacks.reduce((a, t) => a + t.count, 0);

    let killedLeft = Math.round(player.killed);
    let woundedLeft = Math.round(player.wounded);

    if (totalTroops > 0 && (killedLeft > 0 || woundedLeft > 0)) {
      // Distribute killed first, then wounded, proportionally.
      const sorted = [...stacks].sort((a, b) => b.count - a.count);
      for (const stack of sorted) {
        if (killedLeft <= 0 && woundedLeft <= 0) break;
        const share = stack.count / totalTroops;
        // Killed: permanent removal
        if (killedLeft > 0) {
          const killed = Math.min(stack.count, Math.round(player.killed * share));
          const actual = Math.min(killed, killedLeft);
          stack.count -= actual;
          killedLeft -= actual;
        }
        // Wounded: move from count to wounded pool
        if (woundedLeft > 0 && stack.count > 0) {
          const wounded = Math.min(stack.count, Math.round(player.wounded * share));
          const actual = Math.min(wounded, woundedLeft, stack.count);
          stack.count -= actual;
          stack.wounded += actual;
          woundedLeft -= actual;
        }
      }
      // Handle rounding leftovers
      for (const stack of sorted) {
        if (killedLeft <= 0 && woundedLeft <= 0) break;
        if (killedLeft > 0 && stack.count > 0) {
          stack.count -= 1;
          killedLeft -= 1;
        } else if (woundedLeft > 0 && stack.count > 0) {
          stack.count -= 1;
          stack.wounded += 1;
          woundedLeft -= 1;
        }
      }
    }

    const troopsRemaining = this.#party.troops.reduce((a, t) => a + t.count, 0);

    // Loot
    this.#party.money = Math.round(this.#party.money + result.loot);

    // Prisoners taken
    if (player.prisonersTaken > 0) {
      const existing = this.#party.prisoners.find((p) => p.troopId === "t-captive");
      if (existing) {
        existing.count += player.prisonersTaken;
      } else {
        this.#party.prisoners.push({
          troopId: "t-captive",
          name: "Captives",
          count: player.prisonersTaken,
          tier: 1,
        });
      }
    }

    // XP: scaled by actual enemy troops faced, not a guess.
    const xpAwards: { stackId: string; xp: number }[] = [];
    const xpPool = Math.round(enemy.initialTroops * 2);
    const fighters = this.#party.troops.filter((t) => t.count > 0);
    const totalFighters = fighters.reduce((a, t) => a + t.count, 0);
    if (totalFighters > 0 && xpPool > 0) {
      for (const stack of fighters) {
        const xp = Math.round((stack.count / totalFighters) * xpPool);
        stack.xp = Math.round(stack.xp + xp);
        xpAwards.push({ stackId: stack.id, xp });
      }
    }

    this.#notifications.push({
      id: `n-battle-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: won
        ? `Victory. ${player.killed} killed, ${player.wounded} wounded. Gained ${Math.round(result.loot)} in spoils.`
        : `Defeat. ${player.killed} killed, ${player.wounded} wounded.`,
      entityId: this.#party.id,
      field: "troops",
    });

    return {
      troopsRemaining,
      money: this.#party.money,
      xpAwards,
      prisoners: structuredClone(this.#party.prisoners),
    };
  }

  /**
   * Remove a defeated NPC party from the campaign. The party is gone;
   * a new bandit party may spawn elsewhere after some days.
   */
  async defeatNpcParty(partyId: string): Promise<void> {
    const idx = this.#npcParties.findIndex((p) => p.id === partyId);
    if (idx >= 0) {
      const removed: NpcParty = this.#npcParties[idx]!;
      this.#npcParties.splice(idx, 1);
      this.#notifications.push({
        id: `n-defeat-${this.#sequence++}`,
        day: this.#day,
        priority: "informational",
        text: `${removed.name} has been destroyed.`,
        entityId: removed.id,
        field: "party",
      });
    }
  }

  /**
   * Promote a stack to the next tier. Costs the stack's banked XP (threshold ×
   * headcount) plus gold from the purse (20 per soldier per current tier).
   * Higher tiers fight better but cost more every payday.
   */
  async upgradeTroops(request: UpgradeTroopsRequest): Promise<UpgradeTroopsResult> {
    const stack = this.#party.troops.find((t) => t.id === request.stackId);
    if (!stack) {
      return { upgraded: false, stackId: request.stackId, fromTier: 0, toTier: 0, xpSpent: 0, goldSpent: 0, reason: `No stack ${request.stackId} in the party.`, causedBy: "upgrade-rejected" };
    }
    const fromTier = troopTier(stack.tier);
    const toTier = stack.tier >= 5 ? null : troopTier(stack.tier + 1);
    if (!toTier || fromTier.xpToNext === null) {
      return { upgraded: false, stackId: stack.id, fromTier: stack.tier, toTier: stack.tier, xpSpent: 0, goldSpent: 0, reason: `${stack.name} are already elite. There is nowhere higher to go.`, causedBy: "upgrade-rejected" };
    }
    const xpNeeded = fromTier.xpToNext * stack.count;
    if (stack.xp < xpNeeded) {
      return { upgraded: false, stackId: stack.id, fromTier: stack.tier, toTier: stack.tier, xpSpent: 0, goldSpent: 0, reason: `${stack.name} need ${xpNeeded - Math.round(stack.xp)} more XP before they can become ${toTier.name.toLowerCase()}s.`, causedBy: "upgrade-rejected" };
    }
    const goldCost = Math.round(stack.count * 20 * stack.tier);
    if (this.#player.resources.money < goldCost) {
      return { upgraded: false, stackId: stack.id, fromTier: stack.tier, toTier: stack.tier, xpSpent: 0, goldSpent: 0, reason: `Upgrading ${stack.name} costs ${formatMoney(goldCost)}. You have ${formatMoney(this.#player.resources.money)}.`, causedBy: "upgrade-rejected" };
    }

    this.#player.resources.money = round2(this.#player.resources.money - goldCost);
    this.#party.money = this.#player.resources.money;
    stack.xp = Math.round(stack.xp - xpNeeded);
    stack.tier = toTier.tier;
    stack.quality = toTier.tier;
    stack.wage = round2(stack.wage * (toTier.wageMultiplier / fromTier.wageMultiplier));
    stack.morale = round2(clamp(stack.morale + 0.05, 0, 1));

    return {
      upgraded: true,
      stackId: stack.id,
      fromTier: fromTier.tier,
      toTier: toTier.tier,
      xpSpent: xpNeeded,
      goldSpent: goldCost,
      causedBy: "upgrade",
    };
  }

  /**
   * Days of game time per real second. Zero pauses the clock. The dial in the HUD
   * is the only caller; the simulation does not guess at speeds on its own.
   *
   * Returns the accepted speed rather than nothing, to match the HTTP provider's
   * contract: the caller is owed an answer either way, and the HUD moves the dial on the
   * answer rather than on the click.
   */
  setTimeScale(daysPerRealSecond: number): TimeScaleResult {
    if (!Number.isFinite(daysPerRealSecond) || daysPerRealSecond < 0) {
      throw new Error(`Time scale must be zero or a positive number, got ${daysPerRealSecond}`);
    }
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    if (daysPerRealSecond > 0) {
      this.#timer = setInterval(() => this.#step(), 1000 / daysPerRealSecond);
    }
    return { accepted: true, daysPerRealSecond };
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

  setEthnicity(ethnicityId: string): void {
    if (!getEthnicity(ethnicityId)) throw new Error(`Unknown ethnicity ${ethnicityId}`);
    this.#player.ethnicityId = ethnicityId;
  }

  /**
   * Holder's order: set a town's tax rate, clamped to 0-0.5.
   *
   * Answers with the rate actually in force rather than the one asked for, which is the
   * whole reason this returns a value: the stepper shows what the simulation decided, so
   * an order that was clamped is visible as a clamped number rather than as the player
   * having got what they typed.
   */
  async setTaxRate(townId: string, rate: number): Promise<TaxOrderResult> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error(`Unknown town ${townId}`);
    const before = town.taxRate;
    town.taxRate = Math.min(0.5, Math.max(0, rate));
    town.updatedTick = this.#tick;
    this.#row(
      "taxRate",
      town.id,
      town.name,
      before,
      town.taxRate,
      "Player",
      [],
      `${town.name}'s tax rate was set to ${(town.taxRate * 100).toFixed(1)} percent.`,
    );
    return { rate: town.taxRate };
  }

  /** Holder's order: set the state-level rate for every town in a US state. */
  async setStateTaxRate(state: string, rate: number): Promise<TaxOrderResult> {
    const clamped = Math.min(0.15, Math.max(0, rate));
    let any = false;
    for (const town of this.#towns.values()) {
      if (town.state === state) {
        town.stateTaxRate = clamped;
        town.updatedTick = this.#tick;
        any = true;
      }
    }
    if (!any) throw new Error(`No towns in state ${state}`);
    return { rate: clamped };
  }

  /**
   * Holder's order: queue a settlement project. One at a time, costs town money.
   *
   * An acceptance carries the tick the project finishes on, because the project card
   * counts down to it and the client has no way to know how many ticks a mason needs.
   * A refusal carries the reason and no countdown, since there is nothing to count down.
   */
  async startConstruction(townId: string, buildingId: string): Promise<ConstructionResult> {
    const town = this.#towns.get(townId);
    if (!town) return { ok: false, message: `Unknown town ${townId}.` };
    const def = BUILDING_DEFS.find((d) => d.id === buildingId);
    if (!def) return { ok: false, message: `Unknown project ${buildingId}.` };
    const info = town.buildings.find((b) => b.id === buildingId)!;
    if (town.constructionBuilding) {
      return { ok: false, message: `${town.name} is already building ${this.#buildingName(town.constructionBuilding)}.` };
    }
    if (info.level >= BUILDING_MAX_LEVEL) {
      return { ok: false, message: `${def.name} is already at max tier.` };
    }
    const cost = def.costs[info.level] ?? 0;
    if (town.money < cost) {
      return { ok: false, message: `${town.name} cannot afford ${def.name} tier ${info.level + 1} (${cost.toLocaleString()} needed).` };
    }
    town.money -= cost;
    town.constructionBuilding = buildingId;
    town.constructionDaysLeft = Math.max(1, Math.round(cost * BUILDING_DAYS_PER_COST));
    town.updatedTick = this.#tick;
    return {
      ok: true,
      message: `${def.name} tier ${info.level + 1} started in ${town.name} (${town.constructionDaysLeft} days).`,
      buildingId,
      buildingName: def.name,
      completionTick: this.#tick + town.constructionDaysLeft,
      daysLeft: town.constructionDaysLeft,
    };
  }

  #buildingName(id: string): string {
    return BUILDING_DEFS.find((d) => d.id === id)?.name ?? id;
  }

  /** Advance any active construction project by one day. Called from #step. */
  #progressConstruction(town: TownState): void {
    if (!town.constructionBuilding) return;
    town.constructionDaysLeft -= 1;
    if (town.constructionDaysLeft > 0) return;
    const info = town.buildings.find((b) => b.id === town.constructionBuilding)!;
    info.level = Math.min(BUILDING_MAX_LEVEL, info.level + 1);
    const def = BUILDING_DEFS.find((d) => d.id === town.constructionBuilding)!;
    info.nextCost = info.level >= BUILDING_MAX_LEVEL ? 0 : (def.costs[info.level] ?? 0);
    info.nextDays = Math.max(1, Math.round(info.nextCost * BUILDING_DAYS_PER_COST));
    town.constructionBuilding = null;
    town.constructionDaysLeft = 0;
    town.updatedTick = this.#tick;
    this.#notifications.push({
      id: `construction-${town.id}-${this.#tick}`,
      day: this.#day,
      priority: "informational",
      text: `${town.name} finished ${def.name} tier ${info.level}.`,
      entityId: town.id,
      field: "buildings",
    });
  }

  setCharacter(character: PlayerCharacter): void {
    this.#player.characterName = `${character.firstName} ${character.lastName}`;
    this.#player.ethnicityId = character.ethnicityId;
    this.#player.appearanceId = character.appearanceId;
    this.#player.age = character.age;
    this.#player.biography = character.biography;
    this.#player.skills = { ...character.startingSkills };
    // The background choices used to be dropped here, so a finished campaign could
    // show the biography a sheet had built but never what the player had picked.
    // They ride along with the attributes and focus the sheet allocates.
    this.#player.backgroundChoices = { ...character.backgroundChoices };
    this.#player.attributes = { ...(character.attributes ?? {}) };
    this.#player.skillFocus = { ...(character.skillFocus ?? {}) };
    (this.#player as Record<string, unknown>).difficulty = character.difficulty;
    (this.#player as Record<string, unknown>).startCity = character.startCity;
    this.#player.resources.money = character.startingCash;
    // Spawn the party near the chosen starting city.
    const spawn = CITY_SPAWNS[character.startCity];
    if (spawn) {
      this.#party.position = { ...spawn };
    }
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

/**
 * Procedural American notable names, grouped loosely by the game's cultures.
 * A generator, not a list: picks are deterministic per seed via the fixture RNG.
 */
const NOTABLE_FIRST_NAMES: Record<string, string[]> = {
  italian: ["Marco", "Sofia", "Tony", "Gina", "Sal", "Rosa", "Vito", "Elena"],
  irish: ["Seamus", "Bridget", "Connor", "Maeve", "Patrick", "Nora", "Finn", "Aoife"],
  chinese: ["Wei", "Mei", "Jian", "Li", "Chen", "Xiao", "Fang", "Bo"],
  korean: ["Jin", "Soo", "Min", "Hana", "Tae", "Yuna", "Dong", "Seo"],
  african: ["Marcus", "Keisha", "Darnell", "Tamika", "Jerome", "Latoya", "Andre", "Nia"],
  jamaican: ["Damian", "Marlene", "Orlando", "Shanice", "Tyrone", "Althea", "Dwayne", "Denise"],
  mexican: ["Carlos", "Maria", "Diego", "Lucia", "Miguel", "Rosa", "Jorge", "Elena"],
  puertoRican: ["Luis", "Carmen", "Rafael", "Isabel", "Miguel", "Sofia", "Diego", "Luz"],
  german: ["Hans", "Greta", "Klaus", "Ingrid", "Otto", "Helga", "Fritz", "Anna"],
  russian: ["Ivan", "Natasha", "Dmitri", "Olga", "Sergei", "Irina", "Viktor", "Anya"],
};

const NOTABLE_LAST_NAMES: Record<string, string[]> = {
  italian: ["Rossi", "Marino", "Conti", "Ferrara", "Bianchi", "Romano"],
  irish: ["Murphy", "Kelly", "Sullivan", "Walsh", "Byrne", "Ryan"],
  chinese: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang"],
  korean: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang"],
  african: ["Johnson", "Williams", "Brown", "Jones", "Davis", "Wilson"],
  jamaican: ["Brown", "Campbell", "Reid", "Thompson", "Walker", "Morgan"],
  mexican: ["Garcia", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Perez"],
  puertoRican: ["Rivera", "Torres", "Santiago", "Cruz", "Morales", "Ortiz"],
  german: ["Schmidt", "Weber", "Meyer", "Wagner", "Becker", "Schulz"],
  russian: ["Ivanov", "Petrov", "Sokolov", "Smirnov", "Kuznetsov", "Popov"],
};

const NOTABLE_CULTURES = Object.keys(NOTABLE_FIRST_NAMES);

const NOTABLE_TYPE_BLURBS: Record<NotableType, string> = {
  merchant: "Runs the biggest concern in town. Everything has a price.",
  "gang-leader": "Controls the streets after dark. Cross them and vanish.",
  veteran: "Fought in the last war. The young ones listen when they talk.",
  "community-leader": "Keeps the neighborhood together. People trust their word.",
};

const NOTABLE_TYPES: NotableType[] = ["merchant", "gang-leader", "veteran", "community-leader"];

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
function formatMoney(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
}
function formatFood(v: number): string {
  return `${v.toFixed(1)} days of grain`;
}
function formatDistance(v: number): string {
  return `${v.toFixed(0)} km`;
}

