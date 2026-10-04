/**
 * Party speed on the campaign map, ported from Bannerlord and modernized.
 *
 * Bannerlord's rules (TaleWorlds dev blog 21/03/19, verified): more troops
 * slow the party; spare riding horses let footmen ride (one horse per footman
 * is optimal); pack animals add carry capacity but no speed; an oversized herd
 * slows everyone down; cargo above carrying capacity brings the party to a
 * crawl; terrain and night matter.
 *
 * Modernized: horses stay (the user wants breeds), trucks join as motorized
 * haulers. Trucks add huge carry capacity and love roads, hate mud; too many
 * trucks cause congestion; trucks + horses together get a synergy bonus (the
 * trucks haul the heavy gear, the horses keep the pace). Horse breeds have
 * terrain affinities -- a thoroughbred flies on pavement and flounders in a
 * swamp, a draft horse pulls through mud that stops everything else.
 *
 * This module is pure: composition in, speed report out. The fixture wires it
 * into `partySpeed()`; the UI reads `factors` for the Bannerlord-style speed
 * breakdown tooltip.
 */

/** Horse breeds, with terrain affinities. */
export type HorseBreed = 'quarter' | 'mustang' | 'draft' | 'thoroughbred';

/** Terrain the party is crossing. */
export type MarchTerrain =
  | 'plains'
  | 'road'
  | 'forest'
  | 'swamp'
  | 'hills'
  | 'urban'
  | 'desert'
  | 'snow';

/** What the party is made of. */
export interface PartyComposition {
  /** Foot troops (not cavalry). */
  footTroops: number;
  /** Cavalry -- already horsed, always fast. */
  mountedTroops: number;
  /** Spare riding horses, by breed. These mount the footmen. */
  horses: { breed: HorseBreed; count: number }[];
  /** Mules. Carry capacity, no speed. */
  packAnimals: number;
  /** Motorized haulers. Huge capacity, road-bound. */
  trucks: number;
  /** True when the trucks have fuel. Dead trucks are dead weight. */
  trucksFueled: boolean;
  /** Cargo weight in abstract units (see GOOD_WEIGHTS). */
  cargoWeight: number;
  wounded: number;
  prisoners: number;
  /** 0-100. */
  morale: number;
  /** True between dusk and dawn. */
  isNight: boolean;
  /** Scout skill points, for the scouting bonus. */
  scoutSkill: number;
  /** Forced march: +30% speed at a daily morale/food cost (see fieldSystems). */
  forcedMarch: boolean;
}

/** One line of the speed breakdown. */
export interface SpeedFactor {
  name: string;
  /** Multiplier applied. */
  mult: number;
  detail: string;
}

export interface PartySpeedReport {
  speedKmPerDay: number;
  factors: SpeedFactor[];
  /** Carry capacity vs cargo, for the encumbrance UI. */
  capacity: number;
  cargoWeight: number;
}

export const BASE_SPEED_KM_PER_DAY = 34;

/** Weight per unit of each trade good. */
export const GOOD_WEIGHTS: Readonly<Record<string, number>> = {
  grain: 1,
  medicine: 0.5,
  metal: 8,
  fuel: 2,
  arms: 4,
  textiles: 1.5,
  tools: 3,
  lumber: 5,
};

/**
 * Breed affinity per terrain. A thoroughbred on pavement is the fastest thing
 * on the map; the same horse in a swamp is a liability. A draft horse is slow
 * everywhere except the mud it was bred to pull through.
 */
export const BREED_TERRAIN: Readonly<Record<HorseBreed, Record<MarchTerrain, number>>> = {
  quarter:     { plains: 1.0,  road: 1.05, forest: 0.95, swamp: 0.9,  hills: 0.95, urban: 1.0,  desert: 0.95, snow: 0.9 },
  mustang:     { plains: 0.95, road: 0.95, forest: 1.0,  swamp: 0.9,  hills: 1.1,  urban: 0.95, desert: 1.05, snow: 0.95 },
  draft:       { plains: 0.9,  road: 0.9,  forest: 1.05, swamp: 1.1,  hills: 0.9,  urban: 0.95, desert: 0.9,  snow: 1.0 },
  thoroughbred:{ plains: 1.1,  road: 1.15, forest: 0.85, swamp: 0.75, hills: 0.85, urban: 1.0,  desert: 0.9,  snow: 0.8 },
};

/** Terrain multipliers for the whole party. */
export const TERRAIN_SPEED: Readonly<Record<MarchTerrain, number>> = {
  plains: 1.0,
  road: 1.15,
  forest: 0.8,
  swamp: 0.7,
  hills: 0.85,
  urban: 0.95,
  desert: 0.9,
  snow: 0.75,
};

const PERFECT_HERD_BONUS = 0.05;
const TRUCK_SYNERGY_BONUS = 0.05;

function totalHorses(c: PartyComposition): number {
  return c.horses.reduce((s, h) => s + h.count, 0);
}

/** Weighted breed affinity for the horses actually carrying footmen. */
function breedAffinity(c: PartyComposition, terrain: MarchTerrain): number {
  const horses = totalHorses(c);
  if (horses === 0 || c.footTroops === 0) return 1;
  const used = Math.min(horses, c.footTroops);
  let remaining = used;
  let weighted = 0;
  for (const h of c.horses) {
    if (remaining <= 0) break;
    const take = Math.min(h.count, remaining);
    weighted += take * BREED_TERRAIN[h.breed][terrain];
    remaining -= take;
  }
  return used > 0 ? weighted / used : 1;
}

function carryCapacity(c: PartyComposition): number {
  const troops = c.footTroops + c.mountedTroops;
  const truckCap = c.trucksFueled ? c.trucks * 400 : c.trucks * 200;
  return troops * 30 + c.packAnimals * 100 + totalHorses(c) * 20 + truckCap;
}

/**
 * Compute party speed. Every factor is recorded so the UI can show the
 * Bannerlord-style breakdown ("Footmen on horses +18%, Herd -6% ...").
 */
export function partySpeed(c: PartyComposition, terrain: MarchTerrain): PartySpeedReport {
  const factors: SpeedFactor[] = [];
  const troops = c.footTroops + c.mountedTroops;
  let speed = BASE_SPEED_KM_PER_DAY;
  const push = (name: string, mult: number, detail: string) => {
    factors.push({ name, mult, detail });
    speed *= mult;
  };

  // Party size: more people, more stragglers. (TaleWorlds: "more traffic jams".)
  if (troops > 0) {
    const mult = 1 / (1 + troops * 0.002);
    push('Party size', mult, `${troops} troops slow the column`);
  }

  // Footmen on horses: one riding horse per footman is the optimum.
  const horses = totalHorses(c);
  if (c.footTroops > 0 && horses > 0) {
    const mounted = Math.min(c.footTroops, horses);
    const ratio = mounted / c.footTroops;
    const affinity = breedAffinity(c, terrain);
    const mult = (1 + 0.3 * ratio) * affinity;
    push('Footmen on horses', mult, `${mounted}/${c.footTroops} footmen mounted`);
    // The perfect herd: exactly one horse per footman rides just right.
    if (horses === c.footTroops) {
      push('Perfect herd', 1 + PERFECT_HERD_BONUS, 'one horse per footman -- the column moves as one');
    }
  }

  // Herd penalty: too many animals and the troops spend the march herding.
  const animals = horses + c.packAnimals;
  if (troops > 0 && animals > 0) {
    const herdRatio = animals / troops;
    if (herdRatio > 1.5) {
      const mult = 1 - Math.min(0.3, (herdRatio - 1.5) * 0.2);
      push('Herd', mult, `${animals} animals for ${troops} troops -- too many mouths to manage`);
    }
  }

  // Trucks: capacity kings, road lovers. Too many clog the column; unfueled
  // trucks are dead weight. Horses + trucks together get the synergy bonus.
  if (c.trucks > 0) {
    if (terrain === 'road' || terrain === 'urban' || terrain === 'plains') {
      const mult = 1 + Math.min(0.1, c.trucks * 0.02);
      push('Motorized', mult, `${c.trucks} trucks on open ground`);
    } else {
      const mult = 1 - Math.min(0.15, c.trucks * 0.03);
      push('Trucks off-road', mult, `${c.trucks} trucks struggling on ${terrain}`);
    }
    if (!c.trucksFueled) {
      push('No fuel', 0.9, 'trucks are dead weight without fuel');
    }
    const truckRatio = c.trucks / Math.max(1, troops);
    if (truckRatio > 1 / 8) {
      push('Convoy congestion', 0.92, `${c.trucks} trucks for ${troops} troops clogs the column`);
    }
    if (horses > 0 && c.trucksFueled) {
      push('Horse-truck synergy', 1 + TRUCK_SYNERGY_BONUS, 'trucks haul the heavy gear, horses keep the pace');
    }
  }

  // Encumbrance: below capacity is marginal; over capacity the party crawls.
  const capacity = carryCapacity(c);
  const loadRatio = capacity > 0 ? c.cargoWeight / capacity : (c.cargoWeight > 0 ? 2 : 0);
  if (loadRatio > 1) {
    const mult = 1 - Math.min(0.7, 0.1 + (loadRatio - 1) * 0.5);
    push('Overburdened', mult, `${Math.round(c.cargoWeight)}/${Math.round(capacity)} capacity -- the party crawls`);
  } else if (loadRatio > 0.8) {
    push('Heavy load', 1 - loadRatio * 0.1, `${Math.round(c.cargoWeight)}/${Math.round(capacity)} capacity`);
  }

  // Terrain.
  const terrainMult = TERRAIN_SPEED[terrain];
  if (terrainMult !== 1) {
    push('Terrain', terrainMult, terrain);
  }

  // Wounded: -1% per 5% wounded, max -20%.
  if (troops > 0 && c.wounded > 0) {
    const mult = 1 - Math.min(0.2, (c.wounded / troops) * 0.2);
    push('Wounded', mult, `${c.wounded} wounded slow the march`);
  }

  // Prisoners: -5% per 10, max -25%.
  if (c.prisoners > 0) {
    const mult = 1 - Math.min(0.25, Math.floor(c.prisoners / 10) * 0.05);
    push('Prisoners', mult, `${c.prisoners} prisoners to guard`);
  }

  // Morale: a miserable column drags its feet.
  if (c.morale < 40) {
    const mult = 1 - ((40 - c.morale) / 40) * 0.15;
    push('Low morale', mult, `morale ${Math.round(c.morale)}`);
  }

  // Night marches are slower.
  if (c.isNight) {
    push('Night', 0.9, 'marching in the dark');
  }

  // Scout: +3% per skill point, max +15%.
  if (c.scoutSkill > 0) {
    const mult = 1 + Math.min(0.15, c.scoutSkill * 0.03);
    push('Scouting', mult, `scout skill ${c.scoutSkill}`);
  }

  // Forced march: the party pushes harder and pays for it daily.
  if (c.forcedMarch) {
    push('Forced march', 1.3, 'pushing hard -- morale and rations suffer');
  }

  return {
    speedKmPerDay: Math.max(5, Math.round(speed * 10) / 10),
    factors,
    capacity: Math.round(capacity),
    cargoWeight: Math.round(c.cargoWeight),
  };
}
