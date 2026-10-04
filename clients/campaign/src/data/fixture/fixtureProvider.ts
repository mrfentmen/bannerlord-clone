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
import { advanceTier, canHoldFief, tierName, renownToNextTier, maxFiefsForTier, companionSlotsForTier, partyCapacityForTier } from "../../clan/tiers.js";
import { foundKingdom as proclaimKingdom } from "../../court/foundKingdom.js";
import { executionConsequences } from "../../afteraction/prisoners.js";
import { tickConformity, checkConformity, recruitmentMoraleCost } from "../../afteraction/conformity.js";
import { startPregnancy, conceptionChance, pregnancyStatus, resolveBirth, type Pregnancy } from "../../clan/pregnancy.js";
import { expressInterest, courtAction, propose, type Courtship, type CourtAction } from "../../clan/courtship.js";
import { sellToBroker } from "../../economy/brokers.js";
import { WORKSHOP_RECIPES, runWorkshopDay } from "../../economy/workshopChains.js";
import { branchChoices, getBranch, isValidBranch } from "../../troop/branches.js";
import { emptyEnginePark, queueEngine, moveEngine, tickEngines, deployedDamage, engineType } from "../../siege/engines.js";
import { startDiceGame, playDiceRound, settleDiceGame, npcStake } from "../../tavern/games.js";
import { saveTemplate, refitToward, templateSummary, type PartyTemplate } from "../../party/templates.js";
import { maxStamina, checkStamina, spendStamina, recoverStamina, SMELT_STAMINA_PER_ARMS, forgeStaminaCost } from "../../campaign/smithingStamina.js";
import { influenceGain, spendInfluence, type InfluenceGainSource, type InfluenceSpendAction } from "../../court/influence.js";
import type {
  BattleResult,
  CauseRow,
  Clan,
  ConnectionStatus,
  GameCharacter,
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
  NpcParty,
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
  TavernCompanion,
  Workshop,
  Army,
  Siege,
  SideState,
  War,
  Quest,
  QuestObjective,
  QuestOffer,
  TaxOrderResult,
  TimeScaleResult,
  WhyChain,
} from "../types.js";
import { troopStackPower, troopTier } from "../types.js";
import { SNAPSHOT_SCHEMA_VERSION } from "../wire.js";
// Rowan (del order 2026-10-03): ethnicity-based name generator and merchant /
// courier trade paths. The fixture draws every notable name from names.ts and
// assigns trade circuits from tradePaths.ts, so each campaign seed gets a
// fresh cast of leaders, kings, nobles, merchants and couriers on fixed roads.
import { generateNotableName, titledName, type NpcRole } from "../names.js";
import { planTradeParties, SETTLEMENT_POSITIONS } from "../tradePaths.js";
// Rowan (trader system, del order 2026-10-03): player-founded trade convoys,
// modernized from Bannerlord's caravans.
import {
  CARAVAN_FOUNDING_COST,
  foundCaravanSpec,
} from "../traders.js";
import {
  GOOD_WEIGHTS,
  partySpeed,
  type MarchTerrain,
  type PartySpeedReport,
} from "../../campaign/partySpeed.js";
import {
  FORCED_MARCH_FOOD_MULT,
  FORCED_MARCH_MORALE_COST,
  foodVariety,
  foodVarietyMoraleDelta,
} from "../../campaign/fieldSystems.js";
import { rollAnnualDeath } from "../../campaign/mortality.js";
import { simulateNpcBattle } from "../../battleflow/npcBattle.js";
import {
  SMITHING_RECIPES,
  canForge,
  resolvePrisonBreak,
  type PrisonBreakResult,
  rollQuality,
  QUALITY_MULTIPLIERS,
  spoilFood,
} from "../../campaign/fieldSystems.js";
import { generateWeaponName } from "../../campaign/namePools.js";
import {
  randomName,
  type NameSex,
} from "../../campaign/namePools.js";
import { rollChildTraits } from "../../campaign/fortune.js";
import { rollBattleDeath } from "../../campaign/fortune.js";
import { rollPersuasion } from "../../campaign/fortune.js";
import {
  signContract,
  tickContract,
  breakContract,
  contractTerms,
  type MercenaryContract,
} from "../../diplomacy/mercenary.js";
import {
  generateOrder,
  tickOrders,
  fulfillOrder,
  type CraftingOrder,
} from "../../campaign/craftingOrders.js";
import { governorBonus } from "../../settlements/governor.js";
import { barter, type BarterOffer } from "../../diplomacy/barter.js";
import { defect } from "../../court/defection.js";

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
  beer: "Beer",
  cloth: "Cloth",
  leather: "Leather",
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
  beer: 18,
  cloth: 32,
  leather: 45,
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
    // The fixture implements every order the client knows, so no control is
    // ever withheld when it is the provider (it is the deployed build's
    // fallback when no simulation server answers).
    servesOrder: () => true,
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
    fleeFromEncounter: async (npcPartyId, newPosition) => state.fleeFromEncounter(npcPartyId, newPosition),
    applyPlayerDefeat: async (input) => state.applyPlayerDefeat(input),
    splitParty: async (input) => state.splitParty(input),
    mergeParty: async (partyId) => state.mergeParty(partyId),
    recruitMilitia: async (townId, count) => state.recruitMilitia(townId, count),
    buyWorkshop: async (townId, type) => state.buyWorkshop(townId, type),
    sellWorkshop: async (workshopId) => state.sellWorkshop(workshopId),
    recruitPrisoners: async (troopId, count) => state.recruitPrisoners(troopId, count),
    ransomPrisoners: async (troopId, count) => state.ransomPrisoners(troopId, count),
    getHeldLords: async () => state.getHeldLords(),
    ransomHeldLord: async (name) => state.ransomHeldLord(name),
    releaseHeldLord: async (name) => state.releaseHeldLord(name),
    executeHeldLord: async (name) => state.executeHeldLord(name),
    getClanTier: async () => state.getClanTier(),
    foundKingdom: async (kingdomName) => state.foundKingdom(kingdomName),
    createArmy: async (name, leaderId) => state.createArmy(name, leaderId),
    joinArmy: async (armyId, partyId) => state.joinArmy(armyId, partyId),
    leaveArmy: async (armyId, partyId) => state.leaveArmy(armyId, partyId),
    disbandArmy: async (armyId) => state.disbandArmy(armyId),
    setArmyObjective: async (armyId, objective) => state.setArmyObjective(armyId, objective),
    startSiege: async (townId, attackerPartyIds, armyId) => state.startSiege(townId, attackerPartyIds, armyId),
    assaultSiege: async (siegeId) => state.assaultSiege(siegeId),
    liftSiege: async (siegeId) => state.liftSiege(siegeId),
    recruitCompanion: async (charId) => state.recruitCompanion(charId),
    tavernCompanions: async (townId) => state.tavernCompanions(townId),
    assignPartyRole: async (charId, role) => state.assignPartyRole(charId, role),
    declareWar: async (targetFactionId) => state.declareWar(targetFactionId),
    makePeace: async (warId) => state.makePeace(warId),
    acceptQuest: async (giverId, giverName, templateId) => state.acceptQuest(giverId, giverName, templateId),
    abandonQuest: async (questId) => state.abandonQuest(questId),
    getQuestOffers: async (giverId, giverName) => state.getQuestOffers(giverId, giverName),
    commitCrime: async (townId, kind) => state.commitCrime(townId, kind),
    payFine: async (townId) => state.payFine(townId),
    getPartyCapacity: async () => state.partyCapacity(),
    getPartySpeed: async () => state.partySpeed(),
    setForcedMarch: async (active: boolean) => state.setForcedMarch(active),
    getForcedMarch: async () => state.getForcedMarch(),
    smeltArms: async (quantity: number) => state.smeltArms(quantity),
    forgeItem: async (recipeId: string) => state.forgeItem(recipeId),
    getSmithingRecipes: async () => SMITHING_RECIPES.map((r) => ({ ...r })),
    attemptPrisonBreak: async (holderId: string, teamSize: number) =>
      state.attemptPrisonBreak(holderId, teamSize),
    persuade: async (charm: number, difficulty: number) =>
      rollPersuasion(charm, difficulty, state.random()),
    signMercenaryContract: async (factionId: string, factionName: string) =>
      state.signMercenaryContract(factionId, factionName),
    getMercenaryContract: async () => state.getMercenaryContract(),
    breakMercenaryContract: async () => state.breakMercenaryContract(),
    getCraftingOrders: async () => state.getCraftingOrders(),
    fulfillCraftingOrder: async (orderId: string) => state.fulfillCraftingOrder(orderId),
    assignGovernor: async (townId: string, characterId: string) =>
      state.assignGovernor(townId, characterId),
    getGovernor: async (townId: string) => state.getGovernor(townId),
    barterDeal: async (offer, demandValue: number) => state.barterDeal(offer, demandValue),
    defectClan: async (clanId: string, joinFactionId?: string) =>
      state.defectClan(clanId, joinFactionId),
    marry: async (charId1, charId2) => state.marry(charId1, charId2),
    haveChild: async (parentId1, parentId2, childName) => state.haveChild(parentId1, parentId2, childName),
    startCourtship: async (targetId) => state.startCourtship(targetId),
    performCourtAction: async (action) => state.performCourtAction(action),
    proposeMarriage: async () => state.proposeMarriage(),
    getCourtships: async () => state.getCourtships(),
    sellPrisonersToBroker: async (townId, troopId, count) => state.sellPrisonersToBroker(townId, troopId, count),
    playTavernDice: async (townId, stake) => state.playTavernDice(townId, stake),
    savePartyTemplate: async (name) => state.savePartyTemplate(name),
    getPartyTemplates: async () => state.getPartyTemplates(),
    refitPartyToward: async (templateId) => state.refitPartyToward(templateId),
    queueSiegeEngine: async (siegeId, typeId) => state.queueSiegeEngine(siegeId, typeId),
    moveSiegeEngine: async (siegeId, typeId, to) => state.moveSiegeEngine(siegeId, typeId, to),
    makeFireVariant: async (siegeId, typeId) => state.makeFireVariant(siegeId, typeId),
    getSiegeEngines: async (siegeId) => state.getSiegeEngines(siegeId),
    getSmithingStamina: async () => state.getSmithingStamina(),
    spendInfluenceAction: async (action) => state.spendInfluenceAction(action),
    getInfluence: async () => state.getInfluence(),
    killCharacter: async (charId, cause) => state.killCharacter(charId, cause),
    getHeir: async (clanId) => state.getHeir(clanId),
    debugSetClanTier: async (clanId, tier) => state.debugSetClanTier(clanId, tier),
    debugAddPrisoners: async (troopId, name, count, tier, conformity) => state.debugAddPrisoners(troopId, name, count, tier, conformity),
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
  /** Hour of day, 0-23. The fixture ticks by days; scenarios set this directly. */
  #hour = 12;

  /** True between 20:00 and 06:00. Night marches are slower. */
  #isNight(): boolean {
    return this.#hour < 6 || this.#hour >= 20;
  }
  #cause = new Map<string, CauseRow>();
  #sequence = 0;
  #random: () => number;

  /** The seeded RNG, for provider methods that need a die roll. */
  random(): () => number {
    return this.#random;
  }
  #towns = new Map<string, TownState>();
  #notables = new Map<string, Notable>();
  #markets = new Map<string, MarketState>();
  #party!: PartyState;
  #npcParties: NpcParty[] = [];
  #clans: Clan[] = [];
  /** Active mercenary contract, if the player serves a faction. */
  #contract: MercenaryContract | null = null;
  /** Open crafting orders at the smithy. */
  #orders: CraftingOrder[] = [];
  /** Town governors: townId -> character. */
  #governors = new Map<string, { id: string; name: string; skills: Record<string, number> }>();
  #characters: GameCharacter[] = [];
  #workshops: Workshop[] = [];
  #armies: Army[] = [];
  #sieges: Siege[] = [];
  #wars: War[] = [];
  #quests: Quest[] = [];
  /**
   * Captured enemy lords held by the player clan. Each entry names a ruler
   * from #rulers taken prisoner when their party was destroyed.
   */
  #heldLords: { name: string; factionId: string; clanName: string; capturedDay: number }[] = [];
  /** Player-founded factions (kingdoms), appended to the fixture sides. */
  #extraSides: SideState[] = [];
  /** Active pregnancies (motherId -> pregnancy). */
  #pregnancies: Pregnancy[] = [];
  /** Active courtships. */
  #courtships: Courtship[] = [];
  /** Smithing stamina remaining (refills each dawn). */
  #smithingStamina = 100;
  /** Saved party composition templates. */
  #partyTemplates: PartyTemplate[] = [];
  /** Outstanding fines per town ID. */
  #fines: Map<string, number> = new Map();
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
        crimeRating: 0.1 + rand() * 0.2,
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
      prisoners: [],
      horses: [{ breed: "quarter", count: 10 }],
      packAnimals: 2,
      trucks: 1,
    };

    // Spawn hostile bandit parties near the player's start.
    // They wander and can be encountered.
    const banditNames = ["Rust Vultures", "Highway Jackals", "Dust Runners", "Iron Howlers"];
    this.#npcParties = banditNames.map((name, i) => {
      const angle = (i / banditNames.length) * Math.PI * 2 + rand() * 0.5;
      const dist = 80 + rand() * 120;
      const count = 8 + Math.floor(rand() * 12);
      return {
        id: `npc-bandit-${i}`,
        name,
        kind: "bandit" as const,
        factionId: "bandits",
        position: {
          x: Math.cos(angle) * dist,
          z: Math.sin(angle) * dist,
        },
        troops: [{ name: "Bandit", count, tier: 1 }],
        troopCount: count,
        hostile: true,
        destination: null,
        speedKmPerDay: 25 + rand() * 10,
      };
    });

    // Trade caravans: travel between towns, buying low and selling high.
    // They move goods through the economy, affecting supply and prices.
    // Rowan (del order 2026-10-03): each caravan is assigned a fixed trade
    // circuit from `data/tradePaths.ts` and a named merchant leader from the
    // ethnicity name generator, drawn from the campaign seed.
    const caravanNames = ["Red Wagon Trading", "Blue Mule Co.", "Golden Wheel"];
    const tradeSpecs = planTradeParties(rand);
    const merchantSpecs = tradeSpecs.filter((s) => s.circuit.length > 2);
    this.#npcParties.push(...caravanNames.map((name, i) => {
      const angle = (i / caravanNames.length) * Math.PI * 2;
      const dist = 60 + rand() * 40;
      const spec = merchantSpecs[i % merchantSpecs.length]!;
      return {
        id: `npc-caravan-${i}`,
        name: `${name} — ${spec.leaderTitle} ${spec.leaderName}`,
        kind: "caravan" as const,
        factionId: "merchants",
        position: {
          x: Math.cos(angle) * dist,
          z: Math.sin(angle) * dist,
        },
        troops: [{ name: "Guards", count: 8, tier: 2 }],
        troopCount: 8,
        hostile: false,
        destination: null,
        speedKmPerDay: 30,
        cargo: [],
        circuit: spec.circuit,
        circuitIndex: -1,
      };
    }));

    // Rowan (del order 2026-10-03): courier parties run fixed point-to-point
    // mail routes between towns, drawn from the campaign seed like everything
    // else. They travel their route physically instead of trading abstractly.
    for (const spec of tradeSpecs.filter((s) => s.circuit.length === 2)) {
      const nextStop = SETTLEMENT_POSITIONS[spec.circuit[1]!] ?? spec.start;
      this.#npcParties.push({
        id: spec.id,
        name: `${spec.name} — ${spec.leaderTitle} ${spec.leaderName}`,
        kind: "courier" as const,
        factionId: "merchants",
        position: { ...spec.start },
        troops: [{ name: "Riders", count: spec.troopCount, tier: 1 }],
        troopCount: spec.troopCount,
        hostile: false,
        destination: { ...nextStop },
        speedKmPerDay: spec.speedKmPerDay,
        circuit: spec.circuit,
        circuitIndex: 1,
      });
    }

    // Initialize clans and characters.
    // Player clan: the player's dynasty.
    const playerChar: GameCharacter = {
      id: "char-player",
      name: this.#player.characterName || "Player",
      age: 30,
      clanId: "clan-player",
      factionId: this.#player.factionId,
      alive: true,
      parentIds: [],
      childrenIds: [],
      role: "ruler",
      partyId: "party-player",
      isPlayer: true,
    };
    const playerClan: Clan = {
      id: "clan-player",
      name: "Player Clan",
      leaderId: "char-player",
      memberIds: ["char-player"],
      tier: 1,
      renown: 0,
      wealth: 1000,
      factionId: this.#player.factionId,
      fiefIds: [],
      bannerColor: "#4a90d9",
    };
    this.#characters = [playerChar];
    this.#clans = [playerClan];

    // Companion candidates: wandering heroes available for hire.
    // They start clanless; recruitment adds them to the player's clan.
    // Backstory and wage are the fixture's own world data, the same way the
    // ruler specs are — the tavern roster reads them, the hire order bills them.
    const companionSpecs = [
      { name: "Sable", age: 28, skills: { medicine: 4, leadership: 2 }, wageDaily: 12, backstory: "Field medic for a caravan crew that stopped coming home. Works for whoever keeps people breathing." },
      { name: "Corvus", age: 32, skills: { scouting: 5, tactics: 3 }, wageDaily: 15, backstory: "Read trails the way toll-booth operators read faces. Never lost a party, never lost a fight he chose." },
      { name: "Mira", age: 26, skills: { steward: 4, trade: 3 }, wageDaily: 11, backstory: "Ran a trading post on the river until the tolls ran it under. Knows what everything costs and who can pay it." },
      { name: "Dain", age: 35, skills: { engineering: 5, tactics: 2 }, wageDaily: 14, backstory: "Bridge builder before the bridges stopped being safe. If it holds weight, he built it or broke it." },
    ];
    for (let i = 0; i < companionSpecs.length; i++) {
      const spec = companionSpecs[i]!;
      this.#characters.push({
        id: `comp-${i}`,
        name: spec.name,
        age: spec.age,
        clanId: "",
        factionId: "",
        alive: true,
        parentIds: [],
        childrenIds: [],
        role: "companion",
        isPlayer: false,
        skills: spec.skills,
        backstory: spec.backstory,
        wageDaily: spec.wageDaily,
      });
    }

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
        // Rowan (del order 2026-10-03): every notable name comes from the
        // ethnicity-based generator, so each campaign seed gets fresh
        // leaders, kings and nobles. Titles follow the notable's station.
        const person = generateNotableName(rand);
        const role: NpcRole =
          type === "merchant" ? "merchant"
          : type === "gang-leader" ? "king"
          : type === "veteran" ? "noble"
          : "leader";
        const titled = titledName(role, rand, person.ethnicityId);
        // Bigger towns attract more powerful notables.
        const sizeBonus = town.klass === "city" ? 25 : town.klass === "town" ? 10 : 0;
        const power = Math.round(clamp(20 + rand() * 55 + sizeBonus, 1, 100));
        const notable: Notable = {
          id: `notable-${town.settlementId}-${i}`,
          settlementId: town.settlementId,
          name: titled.fullName,
          title: titled.title,
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
      npcParties: structuredClone(this.#npcParties),
      towns: [...this.#towns.values()].map((t) => ({ ...t })),
      markets: Object.fromEntries([...this.#markets].map(([k, v]) => [k, structuredClone(v)])),
      sides: [...buildFixtureSides(), ...structuredClone(this.#extraSides)],
      rulers: structuredClone(this.#rulers),
      clans: structuredClone(this.#clans),
      characters: structuredClone(this.#characters),
      workshops: structuredClone(this.#workshops),
      armies: structuredClone(this.#armies),
      sieges: structuredClone(this.#sieges),
      wars: structuredClone(this.#wars),
      heldLords: structuredClone(this.#heldLords),
      pregnancies: structuredClone(this.#pregnancies),
      courtships: structuredClone(this.#courtships),
      partyTemplates: structuredClone(this.#partyTemplates),
      smithingStamina: this.#smithingStamina,
      quests: structuredClone(this.#quests),
      fines: Object.fromEntries(this.#fines),
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
   * Found a player-owned trade convoy (Rowan, trader system, del order 2026-10-03).
   * Modernized Bannerlord caravan founding: $15,000, a hired driver, and a
   * security detail. The convoy spawns as an NPC party on the town's circuit
   * and its trading profits flow back to the player's purse.
   */
  async foundCaravan(
    townId: string,
    circuit: string[],
  ): Promise<{ accepted: boolean; caravanId?: string; displayName?: string; reason?: string }> {
    if (this.#player.resources.money < CARAVAN_FOUNDING_COST) {
      return {
        accepted: false,
        reason: `A trade convoy costs $${CARAVAN_FOUNDING_COST.toLocaleString()}. You have $${Math.floor(this.#player.resources.money).toLocaleString()}.`,
      };
    }
    const town = this.#towns.get(townId);
    if (!town) {
      return { accepted: false, reason: `No town with id ${townId}.` };
    }
    this.#player.resources.money = round2(this.#player.resources.money - CARAVAN_FOUNDING_COST);
    const spec = foundCaravanSpec({
      townId,
      seed: Math.floor(this.#random() * 0x7fffffff),
      circuit,
    });
    const caravanId = `npc-caravan-player-${this.#npcParties.length}`;
    const pos = SETTLEMENT_POSITIONS[townId] ?? { x: 0, z: 0 };
    this.#npcParties.push({
      id: caravanId,
      name: spec.displayName,
      kind: "caravan",
      factionId: "merchants",
      position: { x: pos.x, z: pos.z },
      troops: [{ name: "Security", count: spec.guardCount, tier: 2 }],
      troopCount: spec.guardCount,
      hostile: false,
      destination: null,
      speedKmPerDay: 30,
      cargo: [],
      circuit: spec.circuit,
      circuitIndex: -1,
      ownerId: "player",
      foundedDay: this.#day,
      totalProfit: 0,
    });
    return { accepted: true, caravanId, displayName: spec.displayName };
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

    // Party capacity: clan tier limits how many troops you can field.
    const currentTroops = this.#party.troops.reduce((s, t) => s + t.count, 0);
    const capacity = this.partyCapacity();
    if (currentTroops + request.quantity > capacity) {
      return {
        accepted: false,
        unitName: offered.name,
        quantity: request.quantity,
        totalCost,
        newCount: this.#party.troops.find((t) => t.id === `t-${offered.unitId}`)?.count ?? 0,
        reason: `Party is at capacity (${currentTroops}/${capacity}). Raise your clan tier to field more troops.`,
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

    // Quest progress: recruiting troops
    this.trackQuestProgress("recruit_troops", request.quantity);

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
    // Recompute party speed from composition every day.
    const speedReport = this.partySpeedReport();
    this.#party.speedKmPerDay = speedReport.speedKmPerDay;
    this.#party.speedFactors = speedReport.factors;
    if (this.#day > 28) {
      this.#day = 1;
      this.#month += 1;
    }
    if (this.#month > 12) {
      this.#month = 1;
      this.#year += 1;
      // Age characters by one year; the old may die of old age (Bannerlord's
      // mortality -- see campaign/mortality.ts). Succession is handled by
      // killCharacter.
      for (const char of this.#characters) {
        if (char.alive) {
          char.age += 1;
          if (rollAnnualDeath(char.age, this.#random)) {
            void this.killCharacter(char.id, "old age").catch(() => {});
          }
        }
      }
    }

    // Party upkeep: wages, food, morale.
    this.#partyUpkeep();
    this.#siegeTick();
    this.#warTick();
    this.#questTick();
    // Dynasty: clan tier follows renown; lord parties ride for factions at war.
    this.#clanTierTick();
    this.#lordPartyTick();
    // Family: conceptions, pregnancies, births. Prisoners: conformity builds.
    this.#pregnancyTick();
    this.#conformityTick();

    // Smithing stamina refills each dawn; the forge can only take so much.
    this.#smithingStamina = recoverStamina(this.#player.skills?.["crafting"] ?? 0);

    // Workshop production: each workshop runs its recipe against the town
    // market — buys inputs, sells outputs, pays wages, keeps the difference.
    for (const workshop of this.#workshops) {
      const town = this.#towns.get(workshop.townId);
      const market = this.#markets.get(workshop.townId);
      if (!town || !market) continue;
      workshop.ageDays += 1;
      const recipe = WORKSHOP_RECIPES[workshop.type];
      if (!recipe) continue;
      const lines = new Map(market.goods.map((g) => [g.goodId, g]));
      const result = runWorkshopDay(recipe, lines, workshop.name);
      workshop.lastProfit = result.profit;
      workshop.dailyIncome = result.profit;
      this.#party.money += result.profit;
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

      // -- Garrison wages -----------------------------------------------------
      // Garrison costs 1 gold per 10 militia per day, paid from town money.
      // If the town can't pay, garrison desertion occurs.
      const garrisonWages = Math.ceil(town.garrison / 10);
      if (town.money >= garrisonWages) {
        town.money -= garrisonWages;
      } else {
        // Can't pay: lose 5% of garrison to desertion
        const deserters = Math.ceil(town.garrison * 0.05);
        town.garrison = Math.max(0, town.garrison - deserters);
        town.money = 0;
      }

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
    this.#recoverWounded();
    this.#moveNpcParties();
    this.#resolveNpcBattles();
    this.#tickContractDay();
    this.#tickOrdersDay();
    this.#rebuildLedger();
    this.#refreshWarnings();
    this.#emit({ tick: this.#tick, day: this.#day, towns: townDeltas, party: structuredClone(this.#party), npcParties: structuredClone(this.#npcParties), ledger: structuredClone(this.#ledger), warnings: structuredClone(this.#warnings) });
  }

  /**
   * Daily party upkeep: wages, food consumption, and morale.
   * - Each troop costs daily wages (tier-based). Unpaid wages accumulate and hurt morale.
   * - Each troop consumes food. Starvation hurts morale and causes desertion.
   * - Morale recovers when troops are fed and paid, drops when they're not.
   */
  #partyUpkeep(): void {
    const troopCount = this.#party.troops.reduce((sum, t) => sum + t.count, 0);
    if (troopCount === 0) return;

    // Wages: 2 gold per tier per troop per day
    const dailyWages = this.#party.troops.reduce((sum, t) => sum + t.count * t.tier * 2, 0);
    const money = this.#party.money;
    if (money >= dailyWages) {
      this.#party.money -= dailyWages;
    } else {
      // Can't pay full wages: pay what we can, rest goes to wagesOwed
      this.#party.money = 0;
      this.#party.wagesOwed += dailyWages - money;
      this.#party.morale = Math.max(0, this.#party.morale - 0.05);
    }

    // Food: 1 food per 5 troops per day (quartermaster reduces waste)
    let dailyFood = Math.ceil(troopCount / 5);
    const quartermasterId = this.#party.roles.quartermaster;
    if (quartermasterId) {
      const qm = this.#characters.find((c) => c.id === quartermasterId);
      const stewardSkill = qm?.skills?.steward ?? 0;
      // Each steward point reduces food consumption by 3%
      dailyFood = Math.max(1, Math.floor(dailyFood * (1 - stewardSkill * 0.03)));
    }
    // Forced march burns extra rations.
    if (this.#party.forcedMarch) {
      dailyFood = Math.ceil(dailyFood * FORCED_MARCH_FOOD_MULT);
    }
    const food = this.#party.food;
    if (food >= dailyFood) {
      this.#party.food -= dailyFood;
      // Well-fed: morale recovers slightly
      this.#party.morale = Math.min(1, this.#party.morale + 0.01);
    } else {
      // Starving: consume what's left, morale drops, risk desertion
      this.#party.food = 0;
      this.#party.morale = Math.max(0, this.#party.morale - 0.08);
      // Desertion: if morale is very low, troops leave
      if (this.#party.morale < 0.2 && this.#random() < 0.1) {
        const stack = this.#party.troops[Math.floor(this.#random() * this.#party.troops.length)];
        if (stack && stack.count > 1) {
          const deserters = Math.max(1, Math.floor(stack.count * 0.1));
          stack.count -= deserters;
          this.#notifications.push({
            id: `n-desert-${this.#sequence++}`,
            day: this.#day,
            priority: "important",
            text: `${deserters} ${stack.name} deserted due to low morale and hunger!`,
            entityId: this.#party.id,
            field: "morale",
          });
        }
      }
    }

    // Morale drift toward 0.5 when conditions are neutral
    if (this.#party.food > 0 && this.#party.wagesOwed === 0) {
      this.#party.morale = Math.min(1, this.#party.morale + 0.005);
    }

    // Forced march grinds morale down every day it is active.
    if (this.#party.forcedMarch) {
      this.#party.morale = Math.max(0, this.#party.morale - FORCED_MARCH_MORALE_COST);
    }

    // Food variety: a varied diet keeps morale up (Bannerlord's rule).
    const variety = foodVariety(this.#party.goods, this.#party.food);
    this.#party.morale = Math.min(1, this.#party.morale + foodVarietyMoraleDelta(variety));
  }

  /**
   * Wounded troops recover over campaign time. Each day, a fraction of wounded
   * return to fighting strength. Recovery is faster with a surgeon and medicine.
   */
  /**
   * Maximum troops the player party can hold. Grows with clan tier:
   * 25 base + 25 per tier. Tier 1 = 50, tier 6 = 175.
   */
  partyCapacity(): number {
    const clan = this.#clans.find((c) => c.id === "clan-player");
    const tier = clan?.tier ?? 1;
    return 25 + tier * 25;
  }

  /**
   * Current party speed in km/day, from troop composition.
   * Mounted troops are faster; wounded and prisoners slow the column;
   * a scout companion speeds it up.
   */
  partySpeed(): number {
    return this.partySpeedReport().speedKmPerDay;
  }

  /**
   * Full Bannerlord-style speed breakdown. The party's horses, mules, trucks,
   * cargo, wounded, prisoners and morale all feed the campaign/partySpeed
   * module; the factors list is what the party panel shows as the tooltip.
   */
  partySpeedReport(terrain: MarchTerrain = "plains"): PartySpeedReport {
    const troops = this.#party.troops;
    const footTroops = troops.reduce((s, t) => s + (t.mounted ? 0 : t.count), 0);
    const mountedTroops = troops.reduce((s, t) => s + (t.mounted ? t.count : 0), 0);
    const wounded = troops.reduce((s, t) => s + (t.wounded ?? 0), 0);
    const prisoners = this.#party.prisoners.reduce((s, p) => s + p.count, 0);
    const cargoWeight = this.#party.goods.reduce(
      (s, g) => s + g.quantity * (GOOD_WEIGHTS[g.goodId] ?? 1),
      0,
    );
    const scoutId = this.#party.roles.scout;
    const scout = scoutId ? this.#characters.find((c) => c.id === scoutId) : undefined;
    const fuel = this.#party.goods.find((g) => g.goodId === "fuel");

    return partySpeed(
      {
        footTroops,
        mountedTroops,
        horses: this.#party.horses ?? [],
        packAnimals: this.#party.packAnimals ?? 0,
        trucks: this.#party.trucks ?? 0,
        trucksFueled: (fuel?.quantity ?? 0) > 0,
        cargoWeight,
        wounded,
        prisoners,
        morale: this.#party.morale <= 1 ? this.#party.morale * 100 : this.#party.morale,
        isNight: this.#isNight(),
        scoutSkill: scout?.skills?.scouting ?? 0,
        forcedMarch: this.#party.forcedMarch ?? false,
      },
      terrain,
    );
  }

  /** Toggle forced march: +30% speed at daily morale and food cost. */
  setForcedMarch(active: boolean): void {
    this.#party.forcedMarch = active;
    this.#party.speedKmPerDay = this.partySpeed();
  }

  getForcedMarch(): boolean {
    return this.#party.forcedMarch ?? false;
  }

  /**
   * Smithing: smelt captured arms into metal (1 arms = 2 metal).
   * Bannerlord's smelting rewards looting.
   */
  smeltArms(quantity: number): { metal: number } {
    const arms = this.#party.goods.find((g) => g.goodId === "arms");
    const available = arms?.quantity ?? 0;
    const take = Math.max(0, Math.min(quantity, available));
    if (take <= 0) throw new Error("No arms to smelt.");
    const crafting = this.#player.skills?.["crafting"] ?? 0;
    const staminaCost = take * SMELT_STAMINA_PER_ARMS;
    const staminaCheck = checkStamina({ crafting, stamina: this.#smithingStamina }, staminaCost);
    if (!staminaCheck.ok) throw new Error(staminaCheck.reason);
    this.#smithingStamina = spendStamina({ crafting, stamina: this.#smithingStamina }, staminaCost);
    arms!.quantity -= take;
    const metal = take * 2;
    this.#party.metal += metal;
    return { metal };
  }

  /**
   * Smithing: forge a recipe from the bench. Spends metal and fuel,
   * adds the finished piece to the crafted stockpile.
   */
  forgeItem(recipeId: string): { name: string } {
    const recipe = SMITHING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`);
    const fuel = this.#party.goods.find((g) => g.goodId === "fuel");
    const check = canForge(recipe, this.#party.metal, fuel?.quantity ?? 0);
    if (!check.ok) throw new Error(`Cannot forge ${recipe.name}: ${check.reason}.`);
    const crafting = this.#player.skills?.["crafting"] ?? 0;
    const staminaCost = forgeStaminaCost(Math.ceil(recipe.metal / 2));
    const staminaCheck = checkStamina({ crafting, stamina: this.#smithingStamina }, staminaCost);
    if (!staminaCheck.ok) throw new Error(staminaCheck.reason);
    this.#smithingStamina = spendStamina({ crafting, stamina: this.#smithingStamina }, staminaCost);
    this.#party.metal -= recipe.metal;
    fuel!.quantity -= recipe.fuel;
    // Bannerlord names every forge: stitch descriptors onto the base item.
    // Quality comes from the smith's skill (player's crafting skill).
    const quality = rollQuality(this.#player.skills?.["crafting"] ?? 0, this.#random);
    const forgedName = `${QUALITY_MULTIPLIERS[quality].label} ${generateWeaponName(recipe.name, this.#random)}`;
    const stock = (this.#party.crafted ??= []);
    const existing = stock.find((c) => c.recipeId === recipeId && c.name === forgedName);
    if (existing) existing.count += 1;
    else stock.push({ recipeId, name: forgedName, count: 1 });
    return { name: forgedName };
  }

  /**
   * Mercenary work (Bannerlord): sign a 30-day contract with a faction.
   * Daily retainer, pay per victory, no fealty. Renown-gated.
   */
  signMercenaryContract(factionId: string, factionName: string): { contract: MercenaryContract } {
    const terms = contractTerms(factionId, factionName, 5);
    const result = signContract(terms, this.#player.renown ?? 0, this.#contract);
    if (!result.ok) throw new Error(result.reason);
    this.#contract = result.contract;
    return { contract: result.contract };
  }

  getMercenaryContract(): MercenaryContract | null {
    return this.#contract;
  }

  breakMercenaryContract(): { relationPenalty: number } {
    if (!this.#contract) throw new Error("No active contract to break.");
    const result = breakContract(this.#contract);
    this.#contract = null;
    return { relationPenalty: result.relationPenalty };
  }

  /**
   * Crafting orders: list open orders, generate new ones, fulfill with
   * forged pieces.
   */
  getCraftingOrders(): CraftingOrder[] {
    return [...this.#orders];
  }

  fulfillCraftingOrder(orderId: string): { reward: number; line: string } {
    const order = this.#orders.find((o) => o.id === orderId);
    if (!order) throw new Error("Order not found.");
    const result = fulfillOrder(order, this.#party.crafted ?? []);
    if (!result.ok) throw new Error(result.reason);
    // Consume the forged piece.
    const stock = this.#party.crafted!.find((c) => c.recipeId === order.recipeId)!;
    stock.count -= 1;
    this.#party.crafted = this.#party.crafted!.filter((c) => c.count > 0);
    this.#orders = this.#orders.filter((o) => o.id !== orderId);
    this.#party.money += result.reward;
    return { reward: result.reward, line: result.line };
  }

  /**
   * Governors: assign a companion to a town. Their skills shape it.
   */
  assignGovernor(townId: string, characterId: string): { line: string } {
    const char = this.#characters.find((c) => c.id === characterId);
    if (!char) throw new Error("Character not found.");
    if (!char.alive) throw new Error("The dead govern nothing.");
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");
    this.#governors.set(townId, { id: char.id, name: char.name, skills: char.skills ?? {} });
    const bonus = governorBonus({ id: char.id, name: char.name, skills: char.skills ?? {} });
    return { line: `${char.name} takes ${town.name}. ${bonus.line}` };
  }

  getGovernor(townId: string): { name: string; line: string } | null {
    const g = this.#governors.get(townId);
    if (!g) return null;
    return { name: g.name, line: governorBonus(g).line };
  }

  /**
   * Barter: value an offer against a demand. Used for peace deals and
   * prisoner swaps.
   */
  barterDeal(offer: BarterOffer, demandValue: number): { accepted: boolean; gap: number; line: string } {
    const prices: Record<string, number> = {};
    for (const m of this.#markets.values()) {
      for (const g of m.goods) {
        prices[g.goodId] = g.price;
      }
    }
    return barter(offer, { demandValue, prices, prisonerValue: 100 });
  }

  /**
   * Defection: a clan walks away from its kingdom.
   */
  defectClan(clanId: string, joinFactionId?: string): { line: string } {
    const clan = this.#clans.find((c) => c.id === clanId);
    if (!clan) throw new Error("Clan not found.");
    const fiefNames = clan.fiefIds
      .map((id) => this.#towns.get(id)?.name ?? id)
      .filter(Boolean);
    const result = defect({
      clanName: clan.name,
      kingdomName: clan.factionId || "its kingdom",
      // Clans track no loyalty stat; use renown standing as a proxy —
      // low-renown clans have little to lose by walking.
      loyalty: Math.min(100, (clan.renown ?? 0) / 10),
      fiefs: fiefNames,
      ...(joinFactionId ? { joinKingdom: joinFactionId } : {}),
    });
    if (!result.ok) throw new Error(result.reason);
    clan.factionId = joinFactionId ?? "";
    if (!result.keepsFiefs) clan.fiefIds = [];
    return { line: result.line };
  }

  /**
   * Prison break (roguery): attempt to free imprisoned troops from a holder.
   * Uses the fieldSystems odds; success returns them to the party as a
   * wounded-light troop stack, failure wounds the team and angers the holder.
   */
  attemptPrisonBreak(holderId: string, teamSize: number): PrisonBreakResult & { freedName?: string } {
    const held = this.#party.imprisoned ?? [];
    const entry = held.find((h) => h.holderId === holderId);
    if (!entry || entry.count <= 0) throw new Error("No prisoners held there.");
    const player = this.#player;
    const roguery = player.skills?.["roguery"] ?? 0;
    const holder = this.#npcParties.find((p) => p.id === holderId);
    const garrison = holder?.troopCount ?? 20;
    const result = resolvePrisonBreak(
      { roguery, teamSize: Math.max(1, Math.min(teamSize, 20)), garrison, prisonersHeld: entry.count },
      this.#random,
    );
    if (result.success) {
      // Freed troops rejoin as a fresh stack.
      this.#party.troops.push({
        id: `t-freed-${Date.now()}`,
        name: "Freed captives",
        count: entry.count,
        wounded: 0,
        quality: 1,
        tier: 1,
        xp: 0,
        wage: 0.5,
        morale: 0.9,
      });
      this.#party.imprisoned = held.filter((h) => h.holderId !== holderId);
      if (holder) holder.troopCount = Math.max(0, holder.troopCount - entry.count);
    } else {
      // The team took wounds; getting caught turns the holder hostile.
      const stack = this.#party.troops[0];
      if (stack) stack.wounded = Math.min(stack.count, stack.wounded + result.wounded);
      if (result.caught && holder) holder.hostile = true;
    }
    this.#notifications.push({
      id: `n-break-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: result.success
        ? `Prison break succeeded! ${entry.count} troops freed from ${entry.holderName}.`
        : `Prison break failed at ${entry.holderName}.${result.caught ? " They know it was you." : ""}`,
      entityId: this.#party.id,
      field: "prisoners",
    });
    return result.success ? { ...result, freedName: entry.holderName } : result;
  }

  #recoverWounded(): void {
    const surgeonId = this.#party.roles.surgeon;
    let surgeonBonus = 0;
    if (surgeonId) {
      surgeonBonus = 0.1;
      // Skilled surgeons heal faster: +2% per medicine skill point
      const surgeon = this.#characters.find((c) => c.id === surgeonId);
      if (surgeon?.skills?.medicine) {
        surgeonBonus += surgeon.skills.medicine * 0.02;
      }
    }
    const medicineBonus = this.#party.medicine > 0 ? 0.1 : 0;
    // Base 20% recover per day, +surgeon, +10% with medicine.
    const recoveryRate = 0.2 + surgeonBonus + medicineBonus;

    for (const stack of this.#party.troops) {
      if (stack.wounded > 0) {
        const recovered = Math.min(stack.wounded, Math.max(1, Math.round(stack.wounded * recoveryRate)));
        stack.wounded -= recovered;
        stack.count += recovered;
      }
    }
  }

  /**
   * NPC vs NPC battles (Bannerlord's autocombat). When two hostile NPC
   * parties end the day within 5 km of each other, they fight: the
   * battleflow/npcBattle sim resolves it, casualties come off the stacks,
   * and a wiped party is removed. Caravans are fought by bandits; lords
   * fight bandits and enemy factions.
   */
  #resolveNpcBattles(): void {
    const BATTLE_RANGE_KM = 5;
    const fought = new Set<string>();
    for (let i = 0; i < this.#npcParties.length; i++) {
      for (let j = i + 1; j < this.#npcParties.length; j++) {
        const a = this.#npcParties[i]!;
        const b = this.#npcParties[j]!;
        if (fought.has(a.id) || fought.has(b.id)) continue;
        if (!this.#npcHostile(a, b)) continue;
        const dist = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        if (dist > BATTLE_RANGE_KM) continue;
        fought.add(a.id);
        fought.add(b.id);

        const toSide = (p: NpcParty) => {
          // Cavalry estimate: tier 4+ troops fight mounted (documented heuristic).
          const mounted = p.troops
            .filter((t) => t.tier >= 4)
            .reduce((s, t) => s + t.count, 0);
          return {
            troops: p.troopCount,
            avgLevel: p.troops.length > 0
              ? p.troops.reduce((s, t) => s + t.tier * 6 * t.count, 0) / Math.max(1, p.troopCount)
              : 6,
            morale: 0.5,
            cavalryFraction: p.troopCount > 0 ? mounted / p.troopCount : 0,
            ridingSkill: 4,
          };
        };
        const result = simulateNpcBattle(toSide(a), toSide(b), this.#random);
        this.#applyNpcCasualties(a, result.killed[0] + result.wounded[0]);
        this.#applyNpcCasualties(b, result.killed[1] + result.wounded[1]);

        const winner = result.winner === 0 ? a : b;
        const loser = result.winner === 0 ? b : a;
        const loserGone = loser.troopCount <= 0;
        this.#notifications.push({
          id: `n-npcbattle-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `${winner.name} defeated ${loser.name} (${result.killed[0] + result.killed[1]} killed, ${result.rounds} rounds)${loserGone ? ` -- ${loser.name} was wiped out.` : ""}`,
          entityId: winner.id,
          field: "battle",
        });
        if (loserGone) {
          this.#npcParties = this.#npcParties.filter((p) => p.id !== loser.id);
        }
      }
    }
  }

  /**
   * Daily mercenary tick: retainer pay accrues, the contract counts down.
   * Mercenary victories are paid when battles resolve for the faction.
   */
  #tickContractDay(): void {
    if (!this.#contract) return;
    const { contract, pay, expired } = tickContract(this.#contract);
    this.#party.money += pay;
    this.#contract = contract;
    if (expired) {
      this.#notifications.push({
        id: `n-contract-${this.#sequence++}`,
        day: this.#day,
        priority: "informational",
        text: `Your mercenary contract has ended. The faction thanks you for your service.`,
        entityId: this.#party.id,
        field: "contract",
      });
    }
  }

  /**
   * Daily crafting-order tick: new orders arrive, old ones expire.
   */
  #tickOrdersDay(): void {
    const { kept, expired } = tickOrders(this.#orders);
    this.#orders = kept;
    for (const o of expired) {
      this.#notifications.push({
        id: `n-orderexp-${this.#sequence++}`,
        day: this.#day,
        priority: "informational",
        text: `${o.patron}'s order for a ${o.recipeName} expired. They'll remember the wait.`,
        entityId: this.#party.id,
        field: "orders",
      });
    }
    // New orders drift in, up to 3 open.
    if (this.#orders.length < 3 && this.#random() < 0.3) {
      const order = generateOrder(
        SMITHING_RECIPES.map((r) => ({ id: r.id, name: r.name })),
        `order-${Date.now()}-${Math.round(this.#random() * 10000)}`,
        this.#random,
      );
      if (order) {
        this.#orders.push(order);
        this.#notifications.push({
          id: `n-ordernew-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `New crafting order: ${order.patron} (${order.patronTitle}) wants a ${order.recipeName} — ${order.reward} gold.`,
          entityId: this.#party.id,
          field: "orders",
        });
      }
    }
  }

  /** Two NPC parties fight when bandits meet non-bandits, or hostile factions meet. */
  #npcHostile(a: NpcParty, b: NpcParty): boolean {    if (a.kind === "bandit" && b.kind !== "bandit") return true;
    if (b.kind === "bandit" && a.kind !== "bandit") return true;
    return a.factionId !== b.factionId && (a.hostile || b.hostile);
  }

  /** Remove casualties proportionally across an NPC party's stacks. */
  #applyNpcCasualties(p: NpcParty, losses: number): void {
    let remaining = Math.min(losses, p.troopCount);
    for (const stack of p.troops) {
      if (remaining <= 0) break;
      const take = Math.min(stack.count, Math.ceil((stack.count / Math.max(1, p.troopCount)) * losses));
      const actual = Math.min(take, remaining);
      stack.count -= actual;
      remaining -= actual;
    }
    p.troops = p.troops.filter((t) => t.count > 0);
    p.troopCount = p.troops.reduce((s, t) => s + t.count, 0);
  }
  /**
   * Move NPC parties. Bandits wander; when they have no destination they pick a
   * new random one within a bounded range. Deterministic via the seeded RNG.
   */
  #moveNpcParties(): void {    const rand = this.#random;
    for (const npc of this.#npcParties) {
      if (npc.kind === "caravan") {
        this.#moveCaravan(npc);
        continue;
      }
      if (npc.circuit && npc.circuit.length > 1 && !npc.destination) {
        // Rowan: couriers run their fixed route, stop to stop, forever.
        const next = ((npc.circuitIndex ?? 0) + 1) % npc.circuit.length;
        npc.circuitIndex = next;
        const stop = SETTLEMENT_POSITIONS[npc.circuit[next]!];
        if (stop) npc.destination = { ...stop };
      }
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

  /**
   * Caravan trade logic: abstract trade flow between towns.
   * Every few days, a caravan arrives at a random town, sells cargo,
   * and buys cheap goods. Moves goods through the economy.
   */
  #moveCaravan(npc: NpcParty): void {
    // Caravans trade on a cycle: every 5 days they reach a new town.
    // Use the NPC's position as a timer proxy (deterministic via day).
    const cycleDay = this.#day % 5;
    if (cycleDay !== 0) return;

    // Rowan: caravans with an assigned trade circuit visit its stops in
    // order; caravans without one pick a random town as before.
    let townId: string;
    if (npc.circuit && npc.circuit.length > 0) {
      const next = ((npc.circuitIndex ?? -1) + 1) % npc.circuit.length;
      npc.circuitIndex = next;
      townId = npc.circuit[next]!;
    } else {
      const townIds = [...this.#towns.keys()];
      if (townIds.length === 0) return;
      townId = townIds[Math.floor(this.#random() * townIds.length)]!;
    }
    const market = this.#markets.get(townId);
    if (!market) return;

    // Sell cargo (increasing town stock, lowering price).
    // Rowan (trader system): track revenue for player-owned convoys so
    // profits flow back to the player's purse, Bannerlord-style.
    let sellRevenue = 0;
    for (const item of npc.cargo ?? []) {
      const good = market.goods.find((g) => g.goodId === item.goodId);
      if (good && item.quantity > 0) {
        sellRevenue = round2(sellRevenue + good.price * item.quantity);
        good.stock += item.quantity;
        good.price = round2(BASE_PRICE[item.goodId as keyof typeof BASE_PRICE] * priceFor(good.stock, good.demand));
      }
    }
    npc.cargo = [];

    // Buy the cheapest good (up to 20 units)
    let cheapest: MarketGood | null = null;
    for (const good of market.goods) {
      if (!cheapest || good.price < cheapest.price) {
        cheapest = good;
      }
    }
    let buyCost = 0;
    if (cheapest && cheapest.stock > 20) {
      const qty = Math.min(20, Math.floor(cheapest.stock * 0.2));
      buyCost = round2(cheapest.price * qty);
      cheapest.stock -= qty;
      cheapest.price = round2(BASE_PRICE[cheapest.goodId as keyof typeof BASE_PRICE] * priceFor(cheapest.stock, cheapest.demand));
      npc.cargo.push({ goodId: cheapest.goodId, quantity: qty });
    }

    // Player convoys: profit = revenue - cost, paid to the player's purse.
    if (npc.ownerId === "player") {
      const profit = round2(sellRevenue - buyCost);
      npc.totalProfit = round2((npc.totalProfit ?? 0) + profit);
      if (profit !== 0) {
        this.#player.resources.money = round2(this.#player.resources.money + profit);
      }
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
    // Fresh food rots: spoilage hits before the party eats.
    const rotted = spoilFood(this.#party.goods);
    for (const r of rotted) {
      if (r.lost >= 5) {
        this.#notifications.push({
          id: `n-rot-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `${r.lost} ${r.goodId} rotted in the packs.`,
          entityId: this.#party.id,
          field: "goods",
        });
      }
    }
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

  /**
   * Restore internal state from a saved snapshot. Rebuilds towns, markets,
   * party, rulers, player, and time from the snapshot data.
   */
  async restoreSnapshot(snapshot: SimSnapshot): Promise<void> {
    this.#day = snapshot.day;
    this.#year = snapshot.year ?? this.#year;
    this.#party = structuredClone(snapshot.party);
    this.#npcParties = structuredClone(snapshot.npcParties ?? []);
    this.#player = {
      ...this.#player,
      ...structuredClone(snapshot.player),
      resources: { ...structuredClone(snapshot.player.resources) },
    };
    this.#towns = new Map(snapshot.towns.map((t) => [t.id, structuredClone(t)]));
    this.#markets = new Map(
      Object.entries(snapshot.markets ?? {}).map(([k, v]) => [k, structuredClone(v)])
    );
    this.#rulers = structuredClone(snapshot.rulers ?? []);
    this.#clans = structuredClone(snapshot.clans ?? []);
    this.#characters = structuredClone(snapshot.characters ?? []);
    this.#workshops = structuredClone(snapshot.workshops ?? []);
    this.#armies = structuredClone(snapshot.armies ?? []);
    this.#sieges = structuredClone(snapshot.sieges ?? []);
    this.#wars = structuredClone(snapshot.wars ?? []);
    this.#quests = structuredClone(snapshot.quests ?? []);
    this.#heldLords = structuredClone(snapshot.heldLords ?? []);
    this.#pregnancies = structuredClone(snapshot.pregnancies ?? []);
    this.#courtships = structuredClone(snapshot.courtships ?? []).map((c) => ({
      ...c,
      stage: c.stage as Courtship["stage"],
    }));
    this.#partyTemplates = structuredClone(snapshot.partyTemplates ?? []);
    this.#smithingStamina = snapshot.smithingStamina ?? 100;
    // Player-founded kingdoms persist: re-derive from the side list.
    this.#extraSides = structuredClone(
      (snapshot.sides ?? []).filter((s) => s.id.startsWith("kingdom-")),
    );
    this.#fines = new Map(Object.entries(snapshot.fines ?? {}).map(([k, v]) => [k, v as number]));
    this.#ledger = structuredClone(snapshot.ledger);
    // Reset transient state
    this.#notifications = [];
    this.#warnings = [];
    this.#sequence = 0;
  }

  /**
   * NPC parties within rangeKm of the player party. Used by the client to
   * trigger encounters when hostiles get close.
   */
  async getNearbyHostiles(rangeKm: number): Promise<NpcParty[]> {
    const px = this.#party.position.x;
    const pz = this.#party.position.z;
    return this.#npcParties
      .filter((npc) => npc.hostile && npc.troopCount > 0)
      .filter((npc) => Math.hypot(npc.position.x - px, npc.position.z - pz) <= rangeKm)
      .map((npc) => structuredClone(npc));
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

    // Influence: victories are heard. The realm notices who wins.
    if (won) this.#awardInfluence("battle-victory");

    // Mercenary victory pay: the contract pays per battle won.
    if (won && this.#contract) {
      this.#party.money += this.#contract.payPerVictory;
      this.#notifications.push({
        id: `n-mercpay-${this.#sequence++}`,
        day: this.#day,
        priority: "informational",
        text: `${this.#contract.factionName} pays ${this.#contract.payPerVictory} gold for the victory.`,
        entityId: this.#party.id,
        field: "contract",
      });
    }

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
      // A defeated lord may be captured — 50/50 in Bannerlord's spirit.
      // Captured lords can be ransomed, released (for relation), or executed.
      if (removed.kind === "lord" && removed.leaderName && this.#random() < 0.5) {
        const ruler = this.#rulers.find((r) => r.name === removed.leaderName);
        this.#heldLords.push({
          name: removed.leaderName,
          factionId: removed.factionId,
          clanName: ruler ? `${ruler.name.split(" ").slice(-1)[0]} Household` : "a noble house",
          capturedDay: this.#day,
        });
        this.#notifications.push({
          id: `n-capture-${this.#sequence++}`,
          day: this.#day,
          priority: "important",
          text: `${removed.leaderName} was captured! Ransom, release, or execute them from the party panel.`,
          entityId: removed.id,
          field: "prisoners",
        });
      } else if (removed.kind === "lord" && removed.leaderName) {
        this.#notifications.push({
          id: `n-escape-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `${removed.leaderName} slipped away in the rout.`,
          entityId: removed.id,
          field: "party",
        });
      }
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
   * Flee from an encounter. Moves the player to the escape position, reduces
   * morale slightly (retreat is demoralizing), and adds fatigue.
   */
  async fleeFromEncounter(npcPartyId: string, newPosition: { x: number; z: number }): Promise<void> {
    const npc = this.#npcParties.find((p) => p.id === npcPartyId);
    const npcName = npc?.name ?? "the enemy";

    // Move the player
    this.#party.position = { x: newPosition.x, z: newPosition.z };

    // Morale hit: fleeing is demoralizing
    for (const stack of this.#party.troops) {
      stack.morale = Math.round((stack.morale - 0.05) * 100) / 100;
      if (stack.morale < 0) stack.morale = 0;
    }
    this.#party.morale = Math.max(0, Math.round((this.#party.morale - 0.05) * 100) / 100);

    this.#notifications.push({
      id: `n-flee-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Fled from ${npcName}. The party's morale suffers.`,
      entityId: this.#party.id,
      field: "position",
    });
  }

  /**
   * Apply player defeat consequences. The victorious NPC takes loot and
   * prisoners from the player. The player retreats away from the battle.
   * The NPC party persists (it won).
   */
  async applyPlayerDefeat(input: { npcPartyId: string; lootTaken: number; prisonersTaken: number }): Promise<void> {    const npc = this.#npcParties.find((p) => p.id === input.npcPartyId);

    // Enemy takes loot from the player
    const lootTaken = Math.min(this.#party.money, input.lootTaken);
    this.#party.money = Math.round(this.#party.money - lootTaken);

    // Enemy takes prisoners from the player's wounded/survivors
    let prisonersTaken = input.prisonersTaken;
    if (prisonersTaken > 0) {
      // Take from wounded first (they can't run), then from healthy
      const stacks = [...this.#party.troops].sort((a, b) => b.wounded - a.wounded);
      for (const stack of stacks) {
        if (prisonersTaken <= 0) break;
        // Take from wounded
        const fromWounded = Math.min(stack.wounded, prisonersTaken);
        stack.wounded -= fromWounded;
        prisonersTaken -= fromWounded;
        // Take from healthy if still needed
        if (prisonersTaken > 0 && stack.count > 0) {
          const fromHealthy = Math.min(stack.count, prisonersTaken);
          stack.count -= fromHealthy;
          prisonersTaken -= fromHealthy;
        }
      }
      const actualTaken = input.prisonersTaken - prisonersTaken;
      if (actualTaken > 0 && npc) {
        // The NPC gains prisoners (tracked loosely as increased troop count for now)
        npc.troopCount += actualTaken;
        // Track them as imprisoned so prison breaks can free them.
        const held = (this.#party.imprisoned ??= []);
        const existing = held.find((h) => h.holderId === npc.id);
        if (existing) existing.count += actualTaken;
        else held.push({ name: "Captured troops", count: actualTaken, holderId: npc.id, holderName: npc.name });
      }
    }

    // Player retreats: move away from the NPC
    // Bannerlord's battle death: companions downed in a lost battle have a
    // ~10% chance to die instead of pulling through.
    const clan = this.#clans.find((c) => c.id === "clan-player");
    if (clan) {
      for (const memberId of [...clan.memberIds]) {
        const member = this.#characters.find((c) => c.id === memberId);
        if (!member || member.isPlayer || !member.alive) continue;
        if (rollBattleDeath(this.#random)) {
          member.alive = false;
          member.deathDay = this.#day;
          clan.memberIds = clan.memberIds.filter((id) => id !== memberId);
          this.#notifications.push({
            id: `n-bdeath-${this.#sequence++}`,
            day: this.#day,
            priority: "important",
            text: `${member.name} was killed in the rout.`,
            entityId: memberId,
            field: "family",
          });
        }
      }
    }
    if (npc) {
      const dx = this.#party.position.x - npc.position.x;
      const dz = this.#party.position.z - npc.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      const retreatDist = 60;
      this.#party.position = {
        x: this.#party.position.x + (dx / dist) * retreatDist,
        z: this.#party.position.z + (dz / dist) * retreatDist,
      };
    }

    // Morale hit from defeat
    for (const stack of this.#party.troops) {
      stack.morale = Math.max(0, Math.round((stack.morale - 0.1) * 100) / 100);
    }
    this.#party.morale = Math.max(0, Math.round((this.#party.morale - 0.1) * 100) / 100);

    const actualPrisoners = input.prisonersTaken - prisonersTaken;
    this.#notifications.push({
      id: `n-defeat-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `Defeated by ${npc?.name ?? "the enemy"}. Lost ${Math.round(lootTaken)} in loot${actualPrisoners > 0 ? ` and ${actualPrisoners} troops were captured` : ""}. The party retreats.`,
      entityId: this.#party.id,
      field: "troops",
    });
  }

  /**
   * Split the player party: create a detached party with the specified troops.
   * The detached party stays near the player and can be merged back.
   */
  async splitParty(input: { troopIds: { stackId: string; count: number }[]; name: string }): Promise<{ partyId: string }> {
    // Enforce clan party limit: tier determines max parties.
    const playerClan = this.#clans.find((c) => c.id === "clan-player");
    if (playerClan) {
      const maxParties = playerClan.tier; // Tier 1 = 1 party, Tier 2 = 2, etc.
      const currentParties = this.#npcParties.filter((p) => p.factionId === this.#player.factionId).length + 1; // +1 for player party
      if (currentParties >= maxParties) {
        throw new Error(`Clan tier ${playerClan.tier} allows ${maxParties} parties. Increase clan tier to field more.`);
      }
    }

    const partyId = `detached-${Date.now()}-${Math.round(this.#random() * 10000)}`;
    const detachedTroops: { name: string; count: number; tier: number }[] = [];
    let totalCount = 0;

    for (const { stackId, count } of input.troopIds) {
      const stack = this.#party.troops.find((t) => t.id === stackId);
      if (!stack || stack.count < count || count <= 0) {
        throw new Error(`Cannot split ${count} from ${stackId}: insufficient troops.`);
      }
      if (stack.count - count < 1) {
        throw new Error(`Cannot split all troops from ${stack.name}; keep at least one.`);
      }
      stack.count -= count;
      detachedTroops.push({ name: stack.name, count, tier: stack.tier });
      totalCount += count;
    }

    if (totalCount === 0) {
      throw new Error("Cannot split an empty party.");
    }

    const detached: NpcParty = {
      id: partyId,
      name: input.name || "Detachment",
      kind: "militia",
      factionId: this.#party.factionId,
      position: { ...this.#party.position },
      troops: detachedTroops,
      troopCount: totalCount,
      hostile: false,
      destination: null,
      speedKmPerDay: this.#party.speedKmPerDay,
    };
    this.#npcParties.push(detached);

    this.#notifications.push({
      id: `n-split-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Split ${totalCount} troops into "${detached.name}".`,
      entityId: this.#party.id,
      field: "troops",
    });

    return { partyId };
  }

  /**
   * Merge a detached party back into the player party.
   */
  async mergeParty(partyId: string): Promise<void> {
    const idx = this.#npcParties.findIndex((p) => p.id === partyId);
    if (idx < 0) {
      throw new Error(`No detached party ${partyId} to merge.`);
    }
    const detached = this.#npcParties[idx]!;
    if (detached.hostile) {
      throw new Error(`Cannot merge hostile party ${detached.name}.`);
    }

    for (const dt of detached.troops) {
      const existing = this.#party.troops.find((t) => t.name === dt.name && t.tier === dt.tier);
      if (existing) {
        existing.count += dt.count;
      } else {
        this.#party.troops.push({
          id: `t-merged-${Date.now()}-${Math.round(this.#random() * 10000)}`,
          name: dt.name,
          count: dt.count,
          wounded: 0,
          quality: 2,
          tier: dt.tier,
          xp: 0,
          wage: 1.0,
          morale: 0.7,
        });
      }
    }

    this.#npcParties.splice(idx, 1);

    this.#notifications.push({
      id: `n-merge-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Merged "${detached.name}" (${detached.troopCount} troops) back into the party.`,
      entityId: this.#party.id,
      field: "troops",
    });
  }

  /**
   * Recruit militia for a town. Costs 50 gold per militia.
   * Militia increases garrison, which improves security.
   */
  async recruitMilitia(townId: string, count: number): Promise<void> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");
    if (count <= 0) throw new Error("Count must be positive.");
    
    const cost = count * 50;
    if (this.#party.money < cost) {
      throw new Error(`Recruiting ${count} militia costs ${cost} gold.`);
    }
    
    this.#party.money -= cost;
    town.garrison += count;
    
    this.#notifications.push({
      id: `n-militia-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Recruited ${count} militia for ${town.name} (${cost} gold). Garrison: ${town.garrison}.`,
      entityId: town.id,
      field: "garrison",
    });
  }

  /**
   * Buy a workshop in a town. Costs 2000 gold.
   * Workshops generate daily income based on town prosperity.
   */
  async buyWorkshop(townId: string, type: string): Promise<{ workshopId: string }> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");
    
    const validTypes = ["smithy", "brewery", "weavery", "tannery", "press"];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid workshop type. Must be one of: ${validTypes.join(", ")}.`);
    }
    
    // Max 1 workshop per town (for now)
    if (this.#workshops.some((w) => w.townId === townId)) {
      throw new Error("You already own a workshop in this town.");
    }
    
    const cost = 2000;
    if (this.#party.money < cost) {
      throw new Error(`A workshop costs ${cost} gold.`);
    }
    
    this.#party.money -= cost;
    
    const typeNames: Record<string, string> = {
      smithy: "Smithy",
      brewery: "Brewery",
      weavery: "Weavery",
      tannery: "Tannery",
      press: "Print Press",
    };
    
    const workshop: Workshop = {
      id: `ws-${this.#sequence++}`,
      townId,
      type,
      name: `${typeNames[type]} of ${town.name}`,
      dailyIncome: 50, // Base, modified by prosperity in tick
      ageDays: 0,
    };
    
    this.#workshops.push(workshop);
    
    this.#notifications.push({
      id: `n-ws-buy-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Purchased ${workshop.name} for ${cost} gold.`,
      entityId: town.id,
      field: "workshop",
    });
    
    return { workshopId: workshop.id };
  }

  /**
   * Sell a workshop. Returns 50% of the purchase price.
   */
  async sellWorkshop(workshopId: string): Promise<void> {
    const idx = this.#workshops.findIndex((w) => w.id === workshopId);
    if (idx === -1) throw new Error("Workshop not found.");
    
    const workshop = this.#workshops[idx]!;
    const salePrice = 1000; // 50% of 2000
    
    this.#party.money += salePrice;
    this.#workshops.splice(idx, 1);
    
    this.#notifications.push({
      id: `n-ws-sell-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Sold ${workshop.name} for ${salePrice} gold.`,
      entityId: workshop.townId,
      field: "workshop",
    });
  }

  /**
   * Recruit prisoners into the party. Costs 20 gold per prisoner.
   * Prisoners join at their current tier.
   */
  async recruitPrisoners(troopId: string, count: number): Promise<void> {
    const prisoner = this.#party.prisoners.find((p) => p.troopId === troopId);
    if (!prisoner) throw new Error("No such prisoners held.");
    if (count <= 0 || count > prisoner.count) {
      throw new Error(`Cannot recruit ${count} (have ${prisoner.count}).`);
    }

    // Conformity: only broken-in prisoners will enlist.
    const check = checkConformity(prisoner.tier, prisoner.conformity ?? 0);
    if (!check.willing) throw new Error(check.reason);

    const cost = count * 20;
    if (this.#party.money < cost) {
      throw new Error(`Recruiting ${count} prisoners costs ${cost} gold.`);
    }

    this.#party.money -= cost;
    prisoner.count -= count;
    if (prisoner.count === 0) {
      this.#party.prisoners = this.#party.prisoners.filter((p) => p.troopId !== troopId);
    }
    // The old hands resent fighting beside yesterday's enemy.
    this.#party.morale = Math.max(0, this.#party.morale - recruitmentMoraleCost(count));
    
    // Add to troops (merge with existing stack of same type if present)
    const existing = this.#party.troops.find((t) => t.id === troopId);
    if (existing) {
      existing.count += count;
    } else {
      this.#party.troops.push({
        id: troopId,
        name: prisoner.name,
        count,
        wounded: 0,
        quality: prisoner.tier,
        tier: prisoner.tier,
        xp: 0,
        wage: prisoner.tier * 2,
        morale: 0.5,
      });
    }
    
    this.#notifications.push({
      id: `n-recruit-pris-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Recruited ${count} ${prisoner.name} from prisoners (${cost} gold).`,
      entityId: this.#party.id,
      field: "troops",
    });
  }

  /**
   * Ransom prisoners for gold. Higher tiers ransom for more.
   */
  async ransomPrisoners(troopId: string, count: number): Promise<{ gold: number }> {
    const prisoner = this.#party.prisoners.find((p) => p.troopId === troopId);
    if (!prisoner) throw new Error("No such prisoners held.");
    if (count <= 0 || count > prisoner.count) {
      throw new Error(`Cannot ransom ${count} (have ${prisoner.count}).`);
    }
    
    // Ransom value: 30 gold per tier per prisoner
    const gold = count * prisoner.tier * 30;
    
    prisoner.count -= count;
    if (prisoner.count === 0) {
      this.#party.prisoners = this.#party.prisoners.filter((p) => p.troopId !== troopId);
    }
    
    this.#party.money += gold;
    
    this.#notifications.push({
      id: `n-ransom-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Ransomed ${count} ${prisoner.name} for ${gold} gold.`,
      entityId: this.#party.id,
      field: "prisoners",
    });
    
    return { gold };
  }

  /** Lords currently held prisoner by the player clan. */
  async getHeldLords(): Promise<{ name: string; factionId: string; clanName: string; capturedDay: number }[]> {
    return structuredClone(this.#heldLords);
  }

  /**
   * Ransom a held lord back to their faction. Pays gold and slightly warms
   * relations — even enemies respect a clean transaction.
   */
  async ransomHeldLord(name: string): Promise<{ gold: number }> {
    const idx = this.#heldLords.findIndex((l) => l.name === name);
    if (idx < 0) throw new Error(`${name} is not your prisoner.`);
    const lord = this.#heldLords[idx]!;
    const gold = 1500 + Math.floor(this.#random() * 1500);
    this.#heldLords.splice(idx, 1);
    this.#party.money += gold;
    this.#adjustFactionRelation(lord.factionId, 5);
    this.#notifications.push({
      id: `n-lord-ransom-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `${lord.name} ransomed home for ${gold} gold.`,
      entityId: lord.factionId,
      field: "prisoners",
    });
    return { gold };
  }

  /**
   * Release a held lord freely. Bannerlord's primary honorable political
   * tool: grants relation with their faction and honor.
   */
  async releaseHeldLord(name: string): Promise<{ relationGained: number }> {
    const idx = this.#heldLords.findIndex((l) => l.name === name);
    if (idx < 0) throw new Error(`${name} is not your prisoner.`);
    const lord = this.#heldLords[idx]!;
    this.#heldLords.splice(idx, 1);
    const relationGained = 15;
    this.#adjustFactionRelation(lord.factionId, relationGained);
    this.#player.honor = (this.#player.honor ?? 0) + 10;
    this.#awardInfluence("release-lord");
    this.#notifications.push({
      id: `n-lord-release-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `${lord.name} walks free. Their faction will remember the mercy (+${relationGained} relation).`,
      entityId: lord.factionId,
      field: "prisoners",
    });
    return { relationGained };
  }

  /**
   * Execute a held lord — the nuclear option. Applies the full political
   * fallout: their faction's rulers turn hostile, honor craters, dread
   * rises, your troops lose heart.
   */
  async executeHeldLord(name: string): Promise<{ line: string }> {
    const idx = this.#heldLords.findIndex((l) => l.name === name);
    if (idx < 0) throw new Error(`${name} is not your prisoner.`);
    const lord = this.#heldLords[idx]!;
    this.#heldLords.splice(idx, 1);
    const consequences = executionConsequences({
      id: `lord-${name}`,
      name: lord.name,
      tier: 4,
      ransomValue: 0,
      isNoble: true,
      factionId: lord.factionId,
      clanName: lord.clanName,
    });
    this.#adjustFactionRelation(lord.factionId, consequences.factionRelationDelta);
    this.#player.honor = (this.#player.honor ?? 0) + consequences.honorDelta;
    this.#player.dread = (this.#player.dread ?? 0) + consequences.dreadGained;
    for (const stack of this.#party.troops) {
      stack.morale = Math.max(0, (stack.morale ?? 0.5) + consequences.ownMoraleDelta / 100);
    }
    this.#notifications.push({
      id: `n-execute-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: consequences.line,
      entityId: lord.factionId,
      field: "prisoners",
    });
    return { line: consequences.line };
  }

  /** Shift every ruler of a faction's relation to the player. */
  #adjustFactionRelation(factionId: string, delta: number): void {
    for (const ruler of this.#rulers) {
      if (ruler.factionId === factionId) {
        ruler.relationToPlayer = Math.max(-100, Math.min(100, ruler.relationToPlayer + delta));
      }
    }
  }

  /** Clan tier info for the clan panel: tier, name, limits, progress. */
  async getClanTier(): Promise<{
    tier: number;
    name: string;
    renown: number;
    renownToNext: number;
    fiefLimit: number;
    fiefsHeld: number;
    companionSlots: number;
    partyCapacity: number;
  }> {
    const clan = this.#clans.find((c) => c.id === "clan-player");
    if (!clan) throw new Error("Player clan not found.");
    return {
      tier: clan.tier,
      name: tierName(clan.tier),
      renown: clan.renown,
      renownToNext: renownToNextTier(clan.tier, clan.renown),
      fiefLimit: maxFiefsForTier(clan.tier),
      fiefsHeld: clan.fiefIds.length,
      companionSlots: companionSlotsForTier(clan.tier),
      partyCapacity: partyCapacityForTier(clan.tier),
    };
  }

  /**
   * Found your own kingdom. Breaking away with fiefs means the old faction
   * declares war — the crown does not give up land with a handshake.
   */
  async foundKingdom(kingdomName: string): Promise<{
    kingdomName: string;
    capital: string;
    warWithFormer: boolean;
    line: string;
  }> {
    const clan = this.#clans.find((c) => c.id === "clan-player");
    if (!clan) throw new Error("Player clan not found.");
    const formerFactionId = this.#player.factionId;
    const result = proclaimKingdom({
      clanName: clan.name,
      tier: clan.tier,
      fiefs: [...clan.fiefIds],
      isVassal: false, // founding IS the break; the war below is the price
      formerKingdom: formerFactionId,
      keptFiefsOnDefection: clan.fiefIds.length > 0,
      influence: this.#player.influence,
      kingdomName,
    });
    if (!result.ok) throw new Error(result.reason);

    this.#player.influence -= result.influenceSpent;
    const newFactionId = `kingdom-${kingdomName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    // Register the new side among the factions.
    if (!this.#extraSides.some((s) => s.id === newFactionId)) {
      this.#extraSides.push({
        id: newFactionId,
        name: result.kingdomName,
        difficulty: "Medium",
        memberStates: [],
        pros: ["A new power, unburdened by old treaties."],
        cons: ["Every established faction sees a rival."],
        biggestDanger: "The old kingdom wants its land back.",
        signatureMechanic: "Founded by the player clan.",
        ratings: { money: 3, gold: 3, food: 3, metal: 3, population: 3 },
        states: [],
      });
    }
    this.#player.factionId = newFactionId;
    clan.factionId = newFactionId;

    if (result.warWithFormer) {
      await this.declareWar(formerFactionId);
    }
    this.#notifications.push({
      id: `n-kingdom-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: result.line,
      entityId: newFactionId,
      field: "court",
    });
    return {
      kingdomName: result.kingdomName,
      capital: result.capital,
      warWithFormer: result.warWithFormer,
      line: result.line,
    };
  }

  /**
   * Create an army led by a character. The leader must be alive and belong to
   * a clan. The army starts empty; parties join via joinArmy.
   */
  async createArmy(name: string, leaderId: string): Promise<{ armyId: string }> {
    const leader = this.#characters.find((c) => c.id === leaderId);
    if (!leader) throw new Error("Leader character not found.");
    if (!leader.alive) throw new Error("Cannot lead an army while dead.");
    if (!name.trim()) throw new Error("Army name is required.");

    const army: Army = {
      id: `army-${this.#sequence++}`,
      name: name.trim(),
      leaderId,
      factionId: leader.factionId,
      partyIds: [],
      objective: null,
      totalTroops: 0,
      formedDay: this.#day,
    };
    this.#armies.push(army);

    this.#notifications.push({
      id: `n-army-create-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `${leader.name} formed the army "${army.name}".`,
      entityId: army.id,
      field: "army",
    });

    return { armyId: army.id };
  }

  /**
   * Add a party to an army. The party must belong to the same faction as the
   * army (or be the player's party joining a player-faction army).
   */
  async joinArmy(armyId: string, partyId: string): Promise<void> {
    const army = this.#armies.find((a) => a.id === armyId);
    if (!army) throw new Error("Army not found.");

    // Find the party (player party or NPC party)
    let party: { id: string; factionId: string; troopCount: number; name: string } | null = null;
    let isPlayerParty = false;
    if (this.#party.id === partyId) {
      party = { id: this.#party.id, factionId: this.#player.factionId, troopCount: this.#party.troops.reduce((s, t) => s + t.count, 0), name: "Player party" };
      isPlayerParty = true;
    } else {
      const npc = this.#npcParties.find((p) => p.id === partyId);
      if (npc) party = { id: npc.id, factionId: npc.factionId, troopCount: npc.troopCount, name: npc.name };
    }
    if (!party) throw new Error("Party not found.");
    if (army.partyIds.includes(partyId)) throw new Error("Party is already in this army.");
    if (party.factionId !== army.factionId) throw new Error("Party faction does not match army faction.");

    // A party can only be in one army
    for (const a of this.#armies) {
      if (a.partyIds.includes(partyId)) throw new Error("Party is already in another army.");
    }

    army.partyIds.push(partyId);
    army.totalTroops += party.troopCount;
    if (!isPlayerParty) {
      const npc = this.#npcParties.find((p) => p.id === partyId)!;
      npc.armyId = armyId;
    }

    this.#notifications.push({
      id: `n-army-join-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `"${party.name}" joined the army "${army.name}".`,
      entityId: army.id,
      field: "army",
    });
  }

  /**
   * Begin a siege on a town. The town must not already be besieged.
   * Attackers should be at the town (not enforced in fixture).
   */
  async startSiege(townId: string, attackerPartyIds: string[], armyId?: string): Promise<{ siegeId: string }> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");
    if (this.#sieges.some((s) => s.townId === townId)) {
      throw new Error(`${town.name} is already under siege.`);
    }
    if (attackerPartyIds.length === 0) throw new Error("At least one attacker party is required.");

    // Determine attacker faction from first party
    let attackerFactionId = "";
    for (const pid of attackerPartyIds) {
      if (this.#party.id === pid) {
        attackerFactionId = this.#player.factionId;
        break;
      }
      const npc = this.#npcParties.find((p) => p.id === pid);
      if (npc) {
        attackerFactionId = npc.factionId;
        break;
      }
    }
    if (!attackerFactionId) throw new Error("Attacker parties not found.");

    const siegeBase = {
      id: `siege-${this.#sequence++}`,
      townId,
      townName: town.name,
      attackerFactionId,
      attackerPartyIds: [...attackerPartyIds],
      startDay: this.#day,
      preparation: 0,
      wallIntegrity: 1,
      breached: false,
      defenderFoodDays: Math.max(3, Math.floor(town.foodStock / Math.max(1, town.population ?? 1000) * 30)),
      attackerCasualties: 0,
      defenderCasualties: 0,
      siegeEngines: 0,
      engines: emptyEnginePark(),
    };
    const siege: Siege = armyId ? { ...siegeBase, armyId } : siegeBase;
    this.#sieges.push(siege);
    town.underSiege = true;

    if (armyId) {
      const army = this.#armies.find((a) => a.id === armyId);
      if (army) army.besiegingTownId = townId;
    }

    this.#notifications.push({
      id: `n-siege-start-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `The siege of ${town.name} has begun!`,
      entityId: town.id,
      field: "siege",
    });

    return { siegeId: siege.id };
  }

  /**
   * Launch an assault on a besieged town. Requires breached walls or
   * preparation >= 0.8. Resolves the siege immediately.
   */
  async assaultSiege(siegeId: string): Promise<{ victory: boolean; casualties: number }> {
    const siege = this.#sieges.find((s) => s.id === siegeId);
    if (!siege) throw new Error("Siege not found.");
    const town = this.#towns.get(siege.townId);
    if (!town) throw new Error("Town not found.");

    if (!siege.breached && siege.preparation < 0.8) {
      throw new Error("Walls are intact and preparations incomplete. Bombard first or wait.");
    }

    // Calculate strengths
    let attackerTroops = 0;
    for (const pid of siege.attackerPartyIds) {
      if (this.#party.id === pid) {
        attackerTroops += this.#party.troops.reduce((s, t) => s + t.count, 0);
      } else {
        const npc = this.#npcParties.find((p) => p.id === pid);
        if (npc) attackerTroops += npc.troopCount;
      }
    }
    const defenderTroops = town.garrison;

    // Assault resolution: attackers need 2:1 odds vs intact walls, 1.2:1 vs breach
    const requiredRatio = siege.breached ? 1.2 : 2.0;
    const ratio = defenderTroops > 0 ? attackerTroops / defenderTroops : 99;
    const victory = ratio >= requiredRatio;

    // Casualties: 15% of attackers, 25% of defenders on victory; worse on defeat
    const attackerLoss = Math.floor(attackerTroops * (victory ? 0.15 : 0.3));
    const defenderLoss = Math.floor(defenderTroops * (victory ? 0.6 : 0.25));

    siege.attackerCasualties += attackerLoss;
    siege.defenderCasualties += defenderLoss;

    if (victory) {
      // Capture the town: transfer holder to attacker faction's leader
      town.garrison = Math.max(0, town.garrison - defenderLoss);
      town.underSiege = false;
      town.loyalty = Math.max(0.1, town.loyalty - 0.3); // Conquered populace is unhappy
      this.#awardInfluence("siege-victory");

      // Apply attacker casualties to parties
      this.#applySiegeCasualties(siege.attackerPartyIds, attackerLoss);

      // The player clan claims the fief — gated by clan-tier fief limits
      // (the anti-snowball rule: you cannot hold everything at tier 1).
      if (siege.attackerPartyIds.includes(this.#party.id)) {
        const clan = this.#clans.find((c) => c.id === "clan-player");
        if (clan) {
          const grant = canHoldFief(clan.tier, clan.fiefIds.length);
          if (grant.ok) {
            clan.fiefIds.push(town.id);
            town.holderId = clan.leaderId;
            town.holderName = clan.name;
            this.#notifications.push({
              id: `n-fief-${this.#sequence++}`,
              day: this.#day,
              priority: "important",
              text: `${town.name} is now a fief of ${clan.name} (${clan.fiefIds.length} held).`,
              entityId: town.id,
              field: "clan",
            });
          } else {
            // At the cap: the town is sacked for gold but cannot be held.
            const loot = 500 + Math.floor(this.#random() * 500);
            this.#party.money += loot;
            this.#notifications.push({
              id: `n-fief-cap-${this.#sequence++}`,
              day: this.#day,
              priority: "important",
              text: `${town.name} falls but ${clan.name} cannot hold it — ${grant.reason} Sacked for ${loot} gold instead.`,
              entityId: town.id,
              field: "clan",
            });
          }
        }
      }

      this.#notifications.push({
        id: `n-siege-capture-${this.#sequence++}`,
        day: this.#day,
        priority: "important",
        text: `${siege.townName} has fallen to the ${siege.attackerFactionId}!`,
        entityId: town.id,
        field: "siege",
      });
    } else {
      // Failed assault: attackers lose more, siege continues
      this.#applySiegeCasualties(siege.attackerPartyIds, attackerLoss);
      town.garrison = Math.max(0, town.garrison - defenderLoss);

      this.#notifications.push({
        id: `n-siege-repulse-${this.#sequence++}`,
        day: this.#day,
        priority: "important",
        text: `The assault on ${siege.townName} was repulsed!`,
        entityId: town.id,
        field: "siege",
      });
    }

    // Remove the siege (resolved by assault)
    this.#sieges = this.#sieges.filter((s) => s.id !== siegeId);
    if (siege.armyId) {
      const army = this.#armies.find((a) => a.id === siege.armyId);
      if (army) delete army.besiegingTownId;
    }

    return { victory, casualties: attackerLoss };
  }

  /** Queue a siege engine for construction at a siege. Costs gold. */
  async queueSiegeEngine(siegeId: string, typeId: string): Promise<{ cost: number }> {
    const siege = this.#sieges.find((s) => s.id === siegeId);
    if (!siege) throw new Error("Siege not found.");
    siege.engines ??= emptyEnginePark();
    const { cost } = queueEngine(siege.engines, typeId);
    if (this.#party.money < cost) {
      siege.engines.queue.pop();
      throw new Error(`A ${engineType(typeId)?.name ?? typeId} costs ${cost} gold.`);
    }
    this.#party.money -= cost;
    return { cost };
  }

  /** Move a siege engine between reserve and deployed. */
  async moveSiegeEngine(siegeId: string, typeId: string, to: "reserve" | "deployed"): Promise<void> {
    const siege = this.#sieges.find((s) => s.id === siegeId);
    if (!siege) throw new Error("Siege not found.");
    siege.engines ??= emptyEnginePark();
    moveEngine(siege.engines, typeId, to);
  }

  /** Mark a reserve engine as a fire variant: double damage, cook-off risk. */
  async makeFireVariant(siegeId: string, typeId: string): Promise<void> {
    const siege = this.#sieges.find((s) => s.id === siegeId);
    if (!siege) throw new Error("Siege not found.");
    siege.engines ??= emptyEnginePark();
    if (!siege.engines.reserve.includes(typeId)) throw new Error("Engine must be in reserve to convert.");
    if (!siege.engines.fireVariants.includes(typeId)) siege.engines.fireVariants.push(typeId);
  }

  /** Engine park state for a siege. */
  async getSiegeEngines(siegeId: string): Promise<{ queue: { typeId: string; daysLeft: number }[]; reserve: string[]; deployed: string[]; fireVariants: string[] }> {
    const siege = this.#sieges.find((s) => s.id === siegeId);
    if (!siege) throw new Error("Siege not found.");
    siege.engines ??= emptyEnginePark();
    return structuredClone(siege.engines);
  }

  /**
   * Tavern dice: stake gold against the town's regulars. Best of 3 rounds,
   * highest total takes the pot. Bannerlord's tavern game, with dice.
   */
  async playTavernDice(townId: string, stake: number): Promise<{ won: boolean; payout: number; line: string }> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");
    if (stake <= 0) throw new Error("Stake must be positive.");
    if (this.#party.money < stake) throw new Error(`You don't have ${stake} gold to stake.`);
    this.#party.money -= stake;
    const opponents = [
      { name: "A regular", stake: npcStake(town.prosperity, this.#random) },
      { name: "The barkeep", stake: npcStake(town.prosperity, this.#random) },
    ];
    const game = startDiceGame(this.#party.name, stake, opponents);
    for (let r = 0; r < game.totalRounds; r++) playDiceRound(game, this.#random);
    const result = settleDiceGame(game, this.#party.name);
    const won = result.pot > 0;
    if (won) this.#party.money += result.pot;
    return { won, payout: result.pot, line: result.line };
  }

  /** Save the current party composition as a named template. */
  async savePartyTemplate(name: string): Promise<{ templateId: string; summary: string }> {
    if (!name.trim()) throw new Error("Name the template.");
    const template = saveTemplate(
      `tpl-${this.#sequence++}`,
      name.trim(),
      this.#party.troops.map((t) => ({ tier: t.tier, branch: t.branch ?? null, count: t.count })),
      this.#day,
    );
    this.#partyTemplates.push(template);
    return { templateId: template.id, summary: templateSummary(template) };
  }

  /** List saved party templates. */
  async getPartyTemplates(): Promise<{ id: string; name: string; summary: string }[]> {
    return this.#partyTemplates.map((t) => ({ id: t.id, name: t.name, summary: templateSummary(t) }));
  }

  /** Compare the party against a template: recruit/dismiss orders to refit. */
  async refitPartyToward(templateId: string): Promise<{ orders: { action: string; tier: number; branch: string | null; count: number }[] }> {
    const template = this.#partyTemplates.find((t) => t.id === templateId);
    if (!template) throw new Error("Template not found.");
    const orders = refitToward(
      template,
      this.#party.troops.map((t) => ({ tier: t.tier, branch: t.branch ?? null, count: t.count })),
    );
    return { orders };
  }

  /** Smithing stamina remaining / max. */
  async getSmithingStamina(): Promise<{ stamina: number; max: number }> {
    const crafting = this.#player.skills?.["crafting"] ?? 0;
    return { stamina: Math.floor(this.#smithingStamina), max: maxStamina(crafting) };
  }

  /** Spend influence on a realm action. */
  async spendInfluenceAction(action: InfluenceSpendAction): Promise<{ line: string }> {
    const result = spendInfluence(action, this.#player.influence);
    if (!result.ok) throw new Error(result.reason);
    this.#player.influence -= result.spent;
    return { line: result.line };
  }

  /** Current influence. */
  async getInfluence(): Promise<number> {
    return this.#player.influence;
  }

  /** Award influence for a deed (battle, quest, release...). The famous are heard. */
  #awardInfluence(source: InfluenceGainSource): void {
    const clan = this.#clans.find((c) => c.id === "clan-player");
    const gain = influenceGain(source, clan?.renown ?? 0, this.#random);
    this.#player.influence += gain;
  }

  /**
   * Lift a siege (attackers withdraw).
   */
  async liftSiege(siegeId: string): Promise<void> {
    const idx = this.#sieges.findIndex((s) => s.id === siegeId);
    if (idx === -1) throw new Error("Siege not found.");
    const siege = this.#sieges[idx]!;
    const town = this.#towns.get(siege.townId);
    if (town) town.underSiege = false;
    if (siege.armyId) {
      const army = this.#armies.find((a) => a.id === siege.armyId);
      if (army) delete army.besiegingTownId;
    }
    this.#sieges.splice(idx, 1);

    this.#notifications.push({
      id: `n-siege-lift-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `The siege of ${siege.townName} was lifted.`,
      entityId: siege.townId,
      field: "siege",
    });
  }

  /**
   * The tavern roster: companions sitting in a town's tavern right now.
   *
   * The fixture's tavern is the wandering-hero pool itself — everyone alive,
   * clanless, and asking a wage is in town tonight. `available` reflects what a
   * hire order would actually do to this purse: `recruitCompanion` bills 500
   * gold flat, so that is the number reported and the test of availability.
   */
  tavernCompanions(_townId: string): Promise<TavernCompanion[]> {
    const COST = 500;
    const roster = this.#characters
      .filter((c) => c.role === "companion" && c.alive && !c.clanId && !c.isPlayer && c.wageDaily !== undefined && c.backstory !== undefined)
      .map((c) => ({
        id: c.id,
        name: c.name,
        backstory: c.backstory!,
        traits: c.traits ?? [],
        skills: c.skills ?? {},
        wageDaily: c.wageDaily!,
        recruitKind: "gold" as const,
        recruitValue: COST,
        hired: false,
        available: this.#party.money >= COST,
      }));
    return Promise.resolve(roster);
  }

  /**
   * Recruit a companion into the player's clan. Costs 500 gold.
   * The companion must be alive, clanless, and have the companion role.
   */
  async recruitCompanion(charId: string): Promise<void> {
    const char = this.#characters.find((c) => c.id === charId);
    if (!char) throw new Error("Character not found.");
    if (!char.alive) throw new Error("Cannot recruit a dead character.");
    if (char.role !== "companion") throw new Error("This character is not available as a companion.");
    if (char.clanId) throw new Error("This companion already belongs to a clan.");

    const cost = 500;
    if (this.#party.money < cost) {
      throw new Error(`Recruiting a companion costs ${cost} gold.`);
    }

    this.#party.money -= cost;
    char.clanId = "clan-player";
    char.factionId = this.#player.factionId;

    const clan = this.#clans.find((c) => c.id === "clan-player");
    if (clan && !clan.memberIds.includes(charId)) {
      clan.memberIds.push(charId);
    }

    this.#notifications.push({
      id: `n-comp-recruit-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `${char.name} joined your clan as a companion!`,
      entityId: char.id,
      field: "companion",
    });
  }

  /**
   * Assign a companion to a party role (or unassign with null).
   * The companion must belong to the player's clan.
   */
  async assignPartyRole(charId: string, role: "quartermaster" | "scout" | "surgeon" | "engineer" | null): Promise<void> {
    const char = this.#characters.find((c) => c.id === charId);
    if (!char) throw new Error("Character not found.");
    if (!char.alive) throw new Error("Cannot assign a dead character.");
    if (char.clanId !== "clan-player") throw new Error("Only your clan members can hold party roles.");

    if (role === null) {
      // Unassign: remove from wherever they are
      for (const r of ["quartermaster", "scout", "surgeon", "engineer"] as const) {
        if (this.#party.roles[r] === charId) {
          delete this.#party.roles[r];
        }
      }
    } else {
      // Assign: remove whoever was there, put this character in
      this.#party.roles[role] = charId;
    }

    this.#notifications.push({
      id: `n-role-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: role ? `${char.name} assigned as ${role}.` : `${char.name} relieved of party duties.`,
      entityId: char.id,
      field: "role",
    });
  }

  /**
   * Declare war on another faction. Cannot declare war on your own faction
   * or on a faction you're already at war with.
   */
  async declareWar(targetFactionId: string): Promise<{ warId: string }> {
    const myFaction = this.#player.factionId;
    if (targetFactionId === myFaction) {
      throw new Error("Cannot declare war on your own faction.");
    }
    if (this.#wars.some((w) =>
      (w.attackerFactionId === myFaction && w.defenderFactionId === targetFactionId) ||
      (w.attackerFactionId === targetFactionId && w.defenderFactionId === myFaction)
    )) {
      throw new Error("Already at war with this faction.");
    }

    const war: War = {
      id: `war-${this.#sequence++}`,
      attackerFactionId: myFaction,
      defenderFactionId: targetFactionId,
      startDay: this.#day,
      exhaustion: 0,
      attackerScore: 0,
      defenderScore: 0,
    };
    this.#wars.push(war);

    this.#notifications.push({
      id: `n-war-declare-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `War declared on ${targetFactionId}!`,
      entityId: war.id,
      field: "war",
    });

    return { warId: war.id };
  }

  /**
   * Make peace, ending a war. High exhaustion makes peace more likely
   * (but the player can always force it).
   */
  async makePeace(warId: string): Promise<void> {
    const idx = this.#wars.findIndex((w) => w.id === warId);
    if (idx === -1) throw new Error("War not found.");
    const war = this.#wars[idx]!;

    this.#wars.splice(idx, 1);

    this.#notifications.push({
      id: `n-war-peace-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `Peace with ${war.attackerFactionId === this.#player.factionId ? war.defenderFactionId : war.attackerFactionId}.`,
      entityId: war.id,
      field: "war",
    });
  }

  /**
   * Quest templates. Data-driven: new quests are added here, not in code branches.
   */
  static readonly QUEST_TEMPLATES = [
    {
      id: "bandit-hunt",
      title: "Bandit Hunt",
      description: "Clear out the bandits troubling the roads.",
      objectives: [{ kind: "kill_bandits" as const, target: 10, progress: 0 }],
      rewardMoney: 500,
      rewardRenown: 5,
      deadlineDays: 30,
    },
    {
      id: "grain-run",
      title: "Grain Run",
      description: "Deliver grain to a hungry town.",
      objectives: [{ kind: "deliver_goods" as const, target: 50, progress: 0, goodId: "grain" }],
      rewardMoney: 800,
      rewardRenown: 3,
      deadlineDays: 20,
    },
    {
      id: "raise-militia",
      title: "Raise the Militia",
      description: "Recruit troops for the coming war.",
      objectives: [{ kind: "recruit_troops" as const, target: 20, progress: 0 }],
      rewardMoney: 300,
      rewardRenown: 8,
      deadlineDays: 25,
    },
  ];

  /**
   * Work a notable has posted: their offers, priced by the simulation.
   * A notable's power gates which problems they trust to whom.
   */
  async getQuestOffers(giverId: string, giverName: string): Promise<QuestOffer[]> {
    void giverId;
    void giverName;
    return (FixtureState.QUEST_TEMPLATES as any[]).map((t) => ({
      templateId: t.id,
      title: t.title,
      description: t.description,
      rewardMoney: t.rewardMoney,
      rewardRenown: t.rewardRenown,
      deadlineDays: t.deadlineDays ?? null,
    }));
  }

  /**
   * Accept a quest from a giver.
   */
  async acceptQuest(giverId: string, giverName: string, templateId: string): Promise<{ questId: string }> {
    const template = (FixtureState.QUEST_TEMPLATES as any[]).find((t) => t.id === templateId);
    if (!template) throw new Error(`Unknown quest template: ${templateId}`);

    // Can't accept the same quest twice while active
    if (this.#quests.some((q) => q.giverId === giverId && q.title === template.title && q.status === "active")) {
      throw new Error("You already have this quest active.");
    }

    const quest: Quest = {
      id: `quest-${this.#sequence++}`,
      title: template.title,
      description: template.description,
      giverId,
      giverName,
      objectives: template.objectives.map((o: any) => ({ ...o })),
      rewardMoney: template.rewardMoney,
      rewardRenown: template.rewardRenown,
      deadlineDay: template.deadlineDays ? this.#day + template.deadlineDays : null,
      acceptedDay: this.#day,
      status: "active",
    };
    this.#quests.push(quest);

    this.#notifications.push({
      id: `n-quest-accept-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Quest accepted: ${quest.title}`,
      entityId: quest.id,
      field: "quest",
    });

    return { questId: quest.id };
  }

  /**
   * Abandon an active quest.
   */
  async abandonQuest(questId: string): Promise<void> {
    const quest = this.#quests.find((q) => q.id === questId);
    if (!quest) throw new Error("Quest not found.");
    if (quest.status !== "active") throw new Error("Quest is not active.");

    quest.status = "failed";

    this.#notifications.push({
      id: `n-quest-abandon-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Quest abandoned: ${quest.title}`,
      entityId: quest.id,
      field: "quest",
    });
  }

  /**
   * Commit a crime in a town. Raises the town's crime rating, lowers security,
   * damages relations with the holder, and adds to your fine.
   * Returns the fine amount.
   */
  async commitCrime(townId: string, kind: "theft" | "assault" | "smuggling"): Promise<{ fine: number }> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");

    const crimeValues = { theft: 0.15, assault: 0.25, smuggling: 0.1 };
    const fineValues = { theft: 200, assault: 500, smuggling: 350 };
    const crimeAmount = crimeValues[kind];
    const fine = fineValues[kind];

    town.crimeRating = Math.min(1, town.crimeRating + crimeAmount);
    town.security = Math.max(0, town.security - crimeAmount * 0.5);
    // Crime hurts prosperity
    town.prosperity = Math.max(0, town.prosperity - crimeAmount * 0.2);

    const currentFine = this.#fines.get(townId) ?? 0;
    this.#fines.set(townId, currentFine + fine);

    // Relation damage with holder
    if (town.holderId) {
      const ruler = this.#rulers.find((r) => r.id === town.holderId);
      if (ruler) {
        ruler.relationToPlayer = Math.max(-100, ruler.relationToPlayer - 10);
      }
    }

    // Renown damage for the clan
    const clan = this.#clans.find((c) => c.id === "clan-player");
    if (clan) clan.renown = Math.max(0, clan.renown - 2);

    this.#notifications.push({
      id: `n-crime-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `${kind} in ${town.name}! Fine: ${fine} gold. The authorities are watching.`,
      entityId: town.id,
      field: "crime",
    });

    return { fine };
  }

  /**
   * Pay off outstanding fines in a town.
   */
  async payFine(townId: string): Promise<{ paid: number }> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");

    const fine = this.#fines.get(townId) ?? 0;
    if (fine === 0) throw new Error("No outstanding fine in this town.");
    if (this.#party.money < fine) {
      throw new Error(`Cannot afford the ${fine} gold fine.`);
    }

    this.#party.money -= fine;
    this.#fines.delete(townId);

    // Paying fines reduces crime heat slightly
    town.crimeRating = Math.max(0, town.crimeRating - 0.1);

    this.#notifications.push({
      id: `n-fine-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `Paid ${fine} gold fine in ${town.name}.`,
      entityId: town.id,
      field: "crime",
    });

    return { paid: fine };
  }

  /**
   * Track quest progress. Called when relevant events happen.
   */
  trackQuestProgress(kind: QuestObjective["kind"], amount: number = 1): void {
    for (const quest of this.#quests) {
      if (quest.status !== "active") continue;
      let allComplete = true;
      for (const obj of quest.objectives) {
        if (obj.kind === kind && obj.progress < obj.target) {
          obj.progress = Math.min(obj.target, obj.progress + amount);
        }
        if (obj.progress < obj.target) allComplete = false;
      }
      if (allComplete) {
        this.#completeQuest(quest);
      }
    }
  }

  #completeQuest(quest: Quest): void {
    quest.status = "completed";
    this.#party.money += quest.rewardMoney;
    this.#awardInfluence("quest-complete");
    // Renown goes to player character
    const player = this.#characters.find((c) => c.id === "char-player");
    if (player) {
      // Renown is tracked on clan
      const clan = this.#clans.find((c) => c.id === "clan-player");
      if (clan) clan.renown += quest.rewardRenown;
    }

    this.#notifications.push({
      id: `n-quest-complete-${this.#sequence++}`,
      day: this.#day,
      priority: "important",
      text: `Quest completed: ${quest.title}! +${quest.rewardMoney} gold, +${quest.rewardRenown} renown.`,
      entityId: quest.id,
      field: "quest",
    });
  }

  /**
   * Daily quest tick: check deadlines.
   */
  #questTick(): void {
    for (const quest of this.#quests) {
      if (quest.status !== "active") continue;
      if (quest.deadlineDay !== null && this.#day > quest.deadlineDay) {
        quest.status = "failed";
        this.#notifications.push({
          id: `n-quest-fail-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `Quest failed (deadline passed): ${quest.title}`,
          entityId: quest.id,
          field: "quest",
        });
      }
    }
  }

  /**
   * Daily war tick: exhaustion grows, high exhaustion triggers peace offers.
   */
  #warTick(): void {
    for (const war of [...this.#wars]) {
      // Exhaustion grows 1 per day, faster if losing
      war.exhaustion = Math.min(100, war.exhaustion + 1);

      // At 100 exhaustion, the losing side sues for peace (AI wars only)
      // Player wars never auto-resolve — the player decides.
      const playerInvolved = war.attackerFactionId === this.#player.factionId ||
        war.defenderFactionId === this.#player.factionId;
      if (!playerInvolved && war.exhaustion >= 100) {
        this.#wars = this.#wars.filter((w) => w.id !== war.id);
        this.#notifications.push({
          id: `n-war-autopeace-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `${war.attackerFactionId} and ${war.defenderFactionId} made peace from exhaustion.`,
          entityId: war.id,
          field: "war",
        });
      }
    }
  }

  /**
   * Dynasty tick: the player clan's tier follows its renown. Advancement is
   * announced; tiers unlock party capacity, companion slots, and fief limits
   * (see clan/tiers.ts).
   */
  #clanTierTick(): void {
    const clan = this.#clans.find((c) => c.id === "clan-player");
    if (!clan) return;
    const advancement = advanceTier(clan.tier, clan.renown, clan.name);
    if (advancement.advanced) {
      clan.tier = advancement.toTier;
      this.#notifications.push({
        id: `n-tier-${this.#sequence++}`,
        day: this.#day,
        priority: "important",
        text: advancement.line,
        entityId: clan.id,
        field: "clan",
      });
    }
  }

  /**
   * War tick: factions at war with the player keep one lord party in the
   * field, led by one of their rulers. Destroying it can capture the lord —
   * the ransom/release/execute loop in Bannerlord starts here.
   */
  #lordPartyTick(): void {
    const myFaction = this.#player.factionId;
    const enemyFactions = new Set<string>();
    for (const war of this.#wars) {
      if (war.attackerFactionId === myFaction) enemyFactions.add(war.defenderFactionId);
      else if (war.defenderFactionId === myFaction) enemyFactions.add(war.attackerFactionId);
    }
    for (const factionId of enemyFactions) {
      const already = this.#npcParties.some((p) => p.kind === "lord" && p.factionId === factionId);
      if (already) continue;
      const factionName = factionId
        .split("-")
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(" ");
      const rulers = this.#rulers.filter(
        (r) =>
          r.factionId === factionId &&
          (r.tier === "lord" || r.tier === "side-leader" || r.tier === "state-governor" || r.tier === "city-ruler"),
      );
      if (rulers.length === 0) continue;
      const ruler = rulers[Math.floor(this.#random() * rulers.length)]!;
      const holding = ruler.holdings[0]?.settlementId;
      const pos = holding ? (SETTLEMENT_POSITIONS[holding] ?? { x: 0, z: 0 }) : { x: 0, z: 0 };
      const count = 20 + Math.floor(this.#random() * 25);
      this.#npcParties.push({
        id: `npc-lord-${factionId}-${this.#sequence++}`,
        name: `${ruler.name}'s Host`,
        kind: "lord" as const,
        factionId,
        position: { x: pos.x + 30, z: pos.z + 30 },
        troops: [{ name: "Household Guard", count, tier: 3 }],
        troopCount: count,
        hostile: true,
        destination: null,
        speedKmPerDay: 30,
        leaderName: ruler.name,
      });
      this.#notifications.push({
        id: `n-lord-${this.#sequence++}`,
        day: this.#day,
        priority: "important",
        text: `${ruler.name} of the ${factionName} has taken the field against you.`,
        entityId: factionId,
        field: "war",
      });
    }
  }

  /**
   * Family tick: married couples may conceive; pregnancies advance to birth.
   * Birth uses the existing haveChild flow; the mother may not survive it.
   */
  #pregnancyTick(): void {
    // Conception: every married couple where both are alive rolls daily.
    for (const char of this.#characters) {
      if (!char.alive || !char.spouseId) continue;
      // Only roll once per couple (the lower id rolls).
      if (char.id > char.spouseId) continue;
      const spouse = this.#characters.find((c) => c.id === char.spouseId);
      if (!spouse || !spouse.alive) continue;
      if (this.#pregnancies.some((p) => p.motherId === char.id || p.motherId === spouse.id)) continue;
      // The younger spouse carries the pregnancy.
      const younger = char.age <= spouse.age ? char : spouse;
      const older = younger === char ? spouse : char;
      if (this.#random() < conceptionChance(younger.age, older.age)) {
        this.#pregnancies.push(startPregnancy(younger.id, older.id, this.#day));
      }
    }
    // Advance: births on the due day.
    for (const preg of [...this.#pregnancies]) {
      const status = pregnancyStatus(preg, this.#day);
      if (status !== "due" && status !== "overdue") continue;
      this.#pregnancies = this.#pregnancies.filter((p) => p !== preg);
      const mother = this.#characters.find((c) => c.id === preg.motherId);
      const father = this.#characters.find((c) => c.id === preg.fatherId);
      if (!mother || !father || !mother.alive || !father.alive) continue;
      const birth = resolveBirth(mother.age, this.#random);
      // The child arrives through the normal flow (unnamed = pool decides).
      void this.haveChild(preg.motherId, preg.fatherId, "");
      if (!birth.motherSurvives) {
        mother.alive = false;
        mother.deathDay = this.#day;
        this.#notifications.push({
          id: `n-childbirth-death-${this.#sequence++}`,
          day: this.#day,
          priority: "important",
          text: `${mother.name} died in childbirth.`,
          entityId: mother.id,
          field: "family",
        });
      }
    }
  }

  /**
   * Prisoner tick: conformity builds daily toward each stack's need.
   * Leadership comes from the party leader's skill, if any.
   */
  #conformityTick(): void {
    const player = this.#characters.find((c) => c.isPlayer);
    const leadership = player?.skills?.["leadership"] ?? 0;
    for (const stack of this.#party.prisoners) {
      const current = stack.conformity ?? 0;
      stack.conformity = tickConformity({ tier: stack.tier, conformity: current, leadership });
    }
  }

  /**
   * Apply casualties proportionally across attacker parties.
   */
  #applySiegeCasualties(partyIds: string[], totalLoss: number): void {
    let remaining = totalLoss;
    for (const pid of partyIds) {
      if (remaining <= 0) break;
      if (this.#party.id === pid) {
        // Player party: remove from stacks proportionally
        const total = this.#party.troops.reduce((s, t) => s + t.count, 0);
        if (total === 0) continue;
        for (const stack of this.#party.troops) {
          const loss = Math.min(stack.count, Math.floor((stack.count / total) * totalLoss));
          stack.count -= loss;
          remaining -= loss;
        }
        this.#party.troops = this.#party.troops.filter((t) => t.count > 0);
      } else {
        const npc = this.#npcParties.find((p) => p.id === pid);
        if (npc) {
          const loss = Math.min(npc.troopCount, Math.floor(totalLoss / partyIds.length));
          npc.troopCount -= loss;
          remaining -= loss;
        }
      }
    }
  }

  /**
   * Daily siege tick: preparation, bombardment, starvation, surrender checks.
   * Called from #step.
   */
  #siegeTick(): void {
    for (const siege of [...this.#sieges]) {
      const town = this.#towns.get(siege.townId);
      if (!town) {
        this.#sieges = this.#sieges.filter((s) => s.id !== siege.id);
        continue;
      }

      // Preparation advances (engineer speeds it up)
      let prepRate = 0.1;
      // Check if any attacker party has an engineer (simplified: player party only)
      const engineerId = this.#party.roles.engineer;
      if (engineerId && siege.attackerPartyIds.includes(this.#party.id)) {
        const eng = this.#characters.find((c) => c.id === engineerId);
        const engSkill = eng?.skills?.engineering ?? 0;
        prepRate += engSkill * 0.02;
      }
      siege.preparation = Math.min(1, siege.preparation + prepRate);

      // Engine build order: queue progress, counter-battery, cook-offs.
      siege.engines ??= emptyEnginePark();
      const engineEvents = tickEngines(siege.engines, this.#random);
      for (const done of engineEvents.completed) {
        const type = engineType(done);
        this.#notifications.push({
          id: `n-engine-done-${this.#sequence++}`,
          day: this.#day,
          priority: "informational",
          text: `${type?.name ?? done} completed at the siege of ${siege.townName} — in reserve.`,
          entityId: siege.id,
          field: "siege",
        });
      }
      for (const lost of [...engineEvents.destroyed, ...engineEvents.cookoffs]) {
        const type = engineType(lost);
        this.#notifications.push({
          id: `n-engine-lost-${this.#sequence++}`,
          day: this.#day,
          priority: "important",
          text: `${type?.name ?? lost} destroyed at the siege of ${siege.townName}.`,
          entityId: siege.id,
          field: "siege",
        });
      }
      siege.siegeEngines = siege.engines.reserve.length + siege.engines.deployed.length;

      // Bombardment damages walls — deployed engines do the work now.
      const engineDamage = deployedDamage(siege.engines);
      if (engineDamage > 0 && !siege.breached) {
        siege.wallIntegrity = Math.max(0, siege.wallIntegrity - engineDamage);
        if (siege.wallIntegrity <= 0) {
          siege.breached = true;
          this.#notifications.push({
            id: `n-siege-breach-${this.#sequence++}`,
            day: this.#day,
            priority: "important",
            text: `The walls of ${siege.townName} have been breached!`,
            entityId: town.id,
            field: "siege",
          });
        }
      }

      // Defenders consume food
      siege.defenderFoodDays -= 1;
      if (siege.defenderFoodDays <= 0) {
        // Starvation: town surrenders
        town.underSiege = false;
        town.loyalty = Math.max(0.1, town.loyalty - 0.2);
        town.garrison = Math.floor(town.garrison * 0.5); // Half deserted/starved

        this.#notifications.push({
          id: `n-siege-starve-${this.#sequence++}`,
          day: this.#day,
          priority: "important",
          text: `${siege.townName} surrendered from starvation!`,
          entityId: town.id,
          field: "siege",
        });

        this.#sieges = this.#sieges.filter((s) => s.id !== siege.id);
        if (siege.armyId) {
          const army = this.#armies.find((a) => a.id === siege.armyId);
          if (army) delete army.besiegingTownId;
        }
        continue;
      }

      // Surrender check: low morale + breach + low food
      if (siege.breached && siege.defenderFoodDays < 5 && town.loyalty < 0.3) {
        if (this.#random() < 0.3) {
          town.underSiege = false;
          this.#notifications.push({
            id: `n-siege-surrender-${this.#sequence++}`,
            day: this.#day,
            priority: "important",
            text: `${siege.townName} surrendered!`,
            entityId: town.id,
            field: "siege",
          });
          this.#sieges = this.#sieges.filter((s) => s.id !== siege.id);
          if (siege.armyId) {
            const army = this.#armies.find((a) => a.id === siege.armyId);
            if (army) delete army.besiegingTownId;
          }
          continue;
        }
      }

      // Attrition: both sides lose a few troops daily
      const attackerAttrition = Math.floor(siege.attackerPartyIds.length * 0.5);
      const defenderAttrition = 1;
      siege.attackerCasualties += attackerAttrition;
      siege.defenderCasualties += defenderAttrition;
      town.garrison = Math.max(0, town.garrison - defenderAttrition);
    }
  }

  /**
   * Remove a party from an army. If the leader's party leaves and no parties
   * remain, the army disbands.
   */
  async leaveArmy(armyId: string, partyId: string): Promise<void> {
    const army = this.#armies.find((a) => a.id === armyId);
    if (!army) throw new Error("Army not found.");
    const idx = army.partyIds.indexOf(partyId);
    if (idx === -1) throw new Error("Party is not in this army.");

    let troopCount = 0;
    let partyName = partyId;
    if (this.#party.id === partyId) {
      troopCount = this.#party.troops.reduce((s, t) => s + t.count, 0);
      partyName = "Player party";
    } else {
      const npc = this.#npcParties.find((p) => p.id === partyId);
      if (npc) {
        troopCount = npc.troopCount;
        partyName = npc.name;
        delete npc.armyId;
      }
    }

    army.partyIds.splice(idx, 1);
    army.totalTroops = Math.max(0, army.totalTroops - troopCount);

    this.#notifications.push({
      id: `n-army-leave-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `"${partyName}" left the army "${army.name}".`,
      entityId: army.id,
      field: "army",
    });

    // Disband if empty
    if (army.partyIds.length === 0) {
      await this.disbandArmy(armyId);
    }
  }

  /**
   * Disband an army. Member parties become independent.
   */
  async disbandArmy(armyId: string): Promise<void> {
    const idx = this.#armies.findIndex((a) => a.id === armyId);
    if (idx === -1) throw new Error("Army not found.");
    const army = this.#armies[idx]!;

    for (const pid of army.partyIds) {
      const npc = this.#npcParties.find((p) => p.id === pid);
      if (npc) delete npc.armyId;
    }
    this.#armies.splice(idx, 1);

    this.#notifications.push({
      id: `n-army-disband-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `The army "${army.name}" disbanded.`,
      entityId: army.id,
      field: "army",
    });
  }

  /**
   * Set an army's objective. Member parties move toward it as a group.
   */
  async setArmyObjective(armyId: string, objective: Army["objective"]): Promise<void> {
    const army = this.#armies.find((a) => a.id === armyId);
    if (!army) throw new Error("Army not found.");
    army.objective = objective ? structuredClone(objective) : null;

    const desc = !objective ? "no objective"
      : objective.kind === "town" ? `town ${objective.townId}`
      : objective.kind === "party" ? `party ${objective.partyId}`
      : `position (${objective.x}, ${objective.z})`;
    this.#notifications.push({
      id: `n-army-obj-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `The army "${army.name}" marches on ${desc}.`,
      entityId: army.id,
      field: "army",
    });
  }

  /**
   * Marry two characters. Both must be alive and unmarried.
   */
  async marry(charId1: string, charId2: string): Promise<void> {
    const c1 = this.#characters.find((c) => c.id === charId1);
    const c2 = this.#characters.find((c) => c.id === charId2);
    if (!c1 || !c2) throw new Error("Character not found.");
    if (!c1.alive || !c2.alive) throw new Error("Cannot marry a dead character.");
    if (c1.spouseId || c2.spouseId) throw new Error("One or both characters are already married.");
    if (c1.id === c2.id) throw new Error("Cannot marry oneself.");

    c1.spouseId = c2.id;
    c2.spouseId = c1.id;

    this.#notifications.push({
      id: `n-marry-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `${c1.name} and ${c2.name} are married.`,
      entityId: c1.id,
      field: "family",
    });
  }

  /**
   * Record the birth of a child. The child is a new character with both parents.
   */
  async haveChild(parentId1: string, parentId2: string, childName: string): Promise<{ childId: string }> {
    const p1 = this.#characters.find((c) => c.id === parentId1);
    const p2 = this.#characters.find((c) => c.id === parentId2);
    if (!p1 || !p2) throw new Error("Parent not found.");
    if (!p1.alive || !p2.alive) throw new Error("Cannot have a child with a dead parent.");

    // Bannerlord pulls newborn names from the culture pool; an empty name
    // means "let the pool decide."
    const sex: NameSex = this.#random() < 0.5 ? "male" : "female";
    const name = childName.trim() || randomName(p1.factionId, sex, this.#random);
    const childId = `char-${Date.now()}-${Math.round(this.#random() * 10000)}`;
    const child: GameCharacter = {
      id: childId,
      name,
      age: 0,
      clanId: p1.clanId, // child joins the first parent's clan
      factionId: p1.factionId,
      alive: true,
      parentIds: [p1.id, p2.id],
      childrenIds: [],
      role: "commoner",
      isPlayer: false,
      // Bannerlord rolls child traits flat random — parents don't skew it.
      traits: rollChildTraits(this.#random),
    };
    this.#characters.push(child);
    p1.childrenIds.push(childId);
    p2.childrenIds.push(childId);

    // Add to clan
    const clan = this.#clans.find((c) => c.id === p1.clanId);
    if (clan && !clan.memberIds.includes(childId)) {
      clan.memberIds.push(childId);
    }

    this.#notifications.push({
      id: `n-birth-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: `${name} is born to ${p1.name} and ${p2.name}.`,
      entityId: childId,
      field: "family",
    });

    return { childId };
  }

  /**
   * Begin courting an unmarried character. The player is the suitor; the
   * first impression mixes relation and charm (player's charm skill).
   */
  async startCourtship(targetId: string): Promise<{ line: string }> {
    const player = this.#characters.find((c) => c.isPlayer);
    const target = this.#characters.find((c) => c.id === targetId);
    if (!player || !target) throw new Error("Character not found.");
    if (!player.alive || !target.alive) throw new Error("Courtship with the dead is not a thing.");
    if (player.spouseId) throw new Error("You are already married.");
    if (target.spouseId) throw new Error(`${target.name} is already married.`);
    if (this.#courtships.some((c) => c.targetId === targetId && c.stage === "courting")) {
      throw new Error(`You are already courting ${target.name}.`);
    }
    const charm = player.skills?.["charm"] ?? 0;
    const approachRoll = Math.min(100, this.#random() * 100 * 0.7 + charm * 0.3);
    // First impression: charm plus how the target's faction feels about you.
    const ruler = this.#rulers.find((r) => r.factionId === target.factionId);
    const relation = ruler?.relationToPlayer ?? 0;
    const result = expressInterest({
      suitorId: player.id,
      targetId: target.id,
      suitorName: player.name,
      targetName: target.name,
      relation,
      approachRoll,
      day: this.#day,
    });
    if (!result.ok) throw new Error(result.reason);
    this.#courtships.push(result.courtship);
    return { line: result.line };
  }

  /** Perform a courting action toward the active courtship target. */
  async performCourtAction(action: CourtAction): Promise<{ line: string; affection: number }> {
    const courtship = this.#courtships.find((c) => c.stage === "courting");
    if (!courtship) throw new Error("You are not courting anyone.");
    const target = this.#characters.find((c) => c.id === courtship.targetId);
    const updated = courtAction(courtship, action, this.#random);
    const idx = this.#courtships.indexOf(courtship);
    this.#courtships[idx] = updated;
    return {
      affection: updated.affection,
      line: `You ${action === "deed" ? "perform a deed of valor" : action === "poem" ? "recite a poem" : action === "gift" ? "send a gift" : "pay a visit"} for ${target?.name ?? "your beloved"}. Affection: ${Math.round(updated.affection)}.`,
    };
  }

  /** Propose marriage. On acceptance the couple marries immediately. */
  async proposeMarriage(): Promise<{ accepted: boolean; line: string }> {
    const idx = this.#courtships.findIndex((c) => c.stage === "courting");
    if (idx < 0) throw new Error("You are not courting anyone.");
    const courtship = this.#courtships[idx]!;
    const suitor = this.#characters.find((c) => c.id === courtship.suitorId);
    const target = this.#characters.find((c) => c.id === courtship.targetId);
    const result = propose(courtship, suitor?.name ?? "You", target?.name ?? "they");
    this.#courtships[idx] = result.courtship;
    if (result.accepted && suitor && target) {
      await this.marry(suitor.id, target.id);
    }
    return { accepted: result.accepted, line: result.line };
  }

  /** Active courtships for display. */
  async getCourtships(): Promise<{ targetName: string; affection: number; stage: string }[]> {
    return this.#courtships.map((c) => {
      const target = this.#characters.find((t) => t.id === c.targetId);
      return { targetName: target?.name ?? c.targetId, affection: Math.round(c.affection), stage: c.stage };
    });
  }

  /**
   * Sell prisoners to a town's ransom broker. Instant gold at a discount —
   * fast now beats full later.
   */
  async sellPrisonersToBroker(townId: string, troopId: string, count: number): Promise<{ gold: number; line: string }> {
    const town = this.#towns.get(townId);
    if (!town) throw new Error("Town not found.");
    const prisoner = this.#party.prisoners.find((p) => p.troopId === troopId);
    if (!prisoner) throw new Error("No such prisoners held.");
    if (count <= 0 || count > prisoner.count) {
      throw new Error(`Cannot sell ${count} (have ${prisoner.count}).`);
    }
    const ransomValue = count * prisoner.tier * 30;
    const deal = sellToBroker(town.name, `${count} ${prisoner.name}`, {
      ransomValue,
      townProsperity: town.prosperity ?? 50,
    });
    prisoner.count -= count;
    if (prisoner.count === 0) {
      this.#party.prisoners = this.#party.prisoners.filter((p) => p.troopId !== troopId);
    }
    this.#party.money += deal.gold;
    this.#notifications.push({
      id: `n-broker-${this.#sequence++}`,
      day: this.#day,
      priority: "informational",
      text: deal.line,
      entityId: this.#party.id,
      field: "prisoners",
    });
    return { gold: deal.gold, line: deal.line };
  }

  /**
   * Kill a character. Handles succession if they were a clan leader or ruler.
   */
  async killCharacter(charId: string, cause: string): Promise<void> {
    const char = this.#characters.find((c) => c.id === charId);
    if (!char) throw new Error("Character not found.");
    if (!char.alive) throw new Error("Character is already dead.");

    char.alive = false;
    char.deathDay = this.#day;

    // Remove from party leadership
    if (char.partyId) {
      delete char.partyId;
    }

    // Handle clan leadership succession
    const clan = this.#clans.find((c) => c.id === char.clanId);
    if (clan && clan.leaderId === charId) {
      const heir = await this.getHeir(clan.id);
      if (heir) {
        clan.leaderId = heir.id;
        this.#notifications.push({
          id: `n-succession-${this.#sequence++}`,
          day: this.#day,
          priority: "important",
          text: `${char.name} has died (${cause}). ${heir.name} succeeds as leader of ${clan.name}.`,
          entityId: clan.id,
          field: "leadership",
        });
      } else {
        this.#notifications.push({
          id: `n-succession-${this.#sequence++}`,
          day: this.#day,
          priority: "important",
          text: `${char.name} has died (${cause}). ${clan.name} has no heir!`,
          entityId: clan.id,
          field: "leadership",
        });
      }
    } else {
      this.#notifications.push({
        id: `n-death-${this.#sequence++}`,
        day: this.#day,
        priority: "informational",
        text: `${char.name} has died (${cause}).`,
        entityId: char.id,
        field: "family",
      });
    }
  }

  /**
   * Get the heir for a clan. Succession rule: oldest living child of the
   * leader, then oldest living sibling, then oldest living clan member.
   * Must be at least 16 years old to inherit.
   */
  async getHeir(clanId: string): Promise<GameCharacter | null> {
    const clan = this.#clans.find((c) => c.id === clanId);
    if (!clan) return null;
    const leader = this.#characters.find((c) => c.id === clan.leaderId);
    if (!leader) return null;

    const eligible = (c: GameCharacter) => c.alive && c.age >= 16;

    // 1. Oldest living child of the leader
    const children = leader.childrenIds
      .map((id) => this.#characters.find((c) => c.id === id))
      .filter((c): c is GameCharacter => c !== undefined && eligible(c))
      .sort((a, b) => b.age - a.age);
    if (children.length > 0) return children[0]!;

    // 2. Oldest living sibling (share a parent)
    const siblings = this.#characters.filter(
      (c) =>
        c.id !== leader.id &&
        c.clanId === clanId &&
        eligible(c) &&
        c.parentIds.some((p) => leader.parentIds.includes(p)) &&
        leader.parentIds.length > 0
    ).sort((a, b) => b.age - a.age);
    if (siblings.length > 0) return siblings[0]!;

    // 3. Oldest living clan member (not the leader)
    const members = clan.memberIds
      .map((id) => this.#characters.find((c) => c.id === id))
      .filter((c): c is GameCharacter => c !== undefined && c.id !== leader.id && eligible(c))
      .sort((a, b) => b.age - a.age);
    if (members.length > 0) return members[0]!;

    return null;
  }

  /**
   * Test hook: set a clan's tier directly.
   * @internal
   */
  async debugSetClanTier(clanId: string, tier: number): Promise<void> {
    const clan = this.#clans.find((c) => c.id === clanId);
    if (!clan) throw new Error("Clan not found.");
    clan.tier = Math.max(1, Math.min(6, tier));
  }

  /**
   * Test hook: add prisoners directly.
   * @internal
   */
  async debugAddPrisoners(troopId: string, name: string, count: number, tier: number, conformity = 0): Promise<void> {
    const existing = this.#party.prisoners.find((p) => p.troopId === troopId);
    if (existing) {
      existing.count += count;
      existing.conformity = Math.max(existing.conformity ?? 0, conformity);
    } else {
      this.#party.prisoners.push({ troopId, name, count, tier, conformity });
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
    // Branching tiers: the troop must choose a specialty.
    const choices = branchChoices(stack.tier);
    let branch = null as ReturnType<typeof getBranch>;
    if (choices.length > 0) {
      if (!request.branchId || !isValidBranch(stack.tier, request.branchId)) {
        return {
          upgraded: false,
          stackId: stack.id,
          fromTier: stack.tier,
          toTier: stack.tier,
          xpSpent: 0,
          goldSpent: 0,
          reason: `${stack.name} stand at a fork: choose their specialty.`,
          branchChoices: choices.map((c) => ({ id: c.id, name: c.name, role: c.role })),
          causedBy: "upgrade-branch-required",
        };
      }
      branch = getBranch(request.branchId);
    }

    this.#player.resources.money = round2(this.#player.resources.money - goldCost);
    this.#party.money = this.#player.resources.money;
    stack.xp = Math.round(stack.xp - xpNeeded);
    stack.tier = toTier.tier;
    stack.quality = toTier.tier;
    stack.wage = round2(stack.wage * (toTier.wageMultiplier / fromTier.wageMultiplier) * (branch?.wageMult ?? 1));
    stack.morale = round2(clamp(stack.morale + 0.05, 0, 1));
    if (branch) {
      stack.branch = branch.id;
      stack.name = branch.name;
    }

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
  beer: 36,
  cloth: 30,
  leather: 26,
};

/**
 * Rowan (del order 2026-10-03): notable names moved to `data/names.ts` —
 * the ethnicity-based generator. The old per-culture tables were removed.
 */

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

