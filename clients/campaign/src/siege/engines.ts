/**
 * Siege engine build order, modernized per the 2026-10-04 directive.
 *
 * Medieval rams and trebuchets don't fit modern America, so the engines
 * are breaching trucks, artillery pieces, assault ladders, and shield
 * walls. The missing piece was the build order itself: engines now queue
 * up over days, sit in reserve, deploy to the siege lines, and get
 * chewed up by defender counter-battery. Fire variants hit harder and
 * sometimes cook off.
 */

export interface SiegeEngineType {
  id: string;
  name: string;
  /** Days to build one. */
  buildDays: number;
  /** Gold to build one. */
  cost: number;
  /** Damage to wall integrity per assault day when deployed (0-1). */
  siegeDamage: number;
  /** Daily chance a defender counter-battery kills a deployed engine. */
  counterBatteryRisk: number;
}

export const SIEGE_ENGINE_TYPES: SiegeEngineType[] = [
  {
    id: "breaching-truck",
    name: "Breaching Truck",
    buildDays: 3,
    cost: 800,
    siegeDamage: 0.25,
    counterBatteryRisk: 0.1,
  },
  {
    id: "artillery",
    name: "Artillery Piece",
    buildDays: 5,
    cost: 1500,
    siegeDamage: 0.35,
    counterBatteryRisk: 0.15,
  },
  {
    id: "assault-ladder",
    name: "Assault Ladder",
    buildDays: 1,
    cost: 200,
    siegeDamage: 0.08,
    counterBatteryRisk: 0.05,
  },
  {
    id: "shield-wall",
    name: "Shield Wall",
    buildDays: 2,
    cost: 400,
    siegeDamage: 0.0,
    counterBatteryRisk: 0.03,
  },
];

export interface EngineQueueItem {
  typeId: string;
  daysLeft: number;
}

export interface EnginePark {
  /** Being built. */
  queue: EngineQueueItem[];
  /** Built, waiting. */
  reserve: string[];
  /** At the siege lines. */
  deployed: string[];
  /** Fire-variant engines burn hotter: double damage, 10% cook-off per day. */
  fireVariants: string[];
}

export function emptyEnginePark(): EnginePark {
  return { queue: [], reserve: [], deployed: [], fireVariants: [] };
}

export function engineType(typeId: string): SiegeEngineType | null {
  return SIEGE_ENGINE_TYPES.find((t) => t.id === typeId) ?? null;
}

/** Queue an engine for construction. Returns its cost. */
export function queueEngine(park: EnginePark, typeId: string): { cost: number } {
  const type = engineType(typeId);
  if (!type) throw new Error(`Unknown engine: ${typeId}`);
  park.queue.push({ typeId, daysLeft: type.buildDays });
  return { cost: type.cost };
}

export interface EngineTickResult {
  completed: string[];
  destroyed: string[];
  cookoffs: string[];
}

/**
 * Advance one siege day: build progress, defender counter-battery against
 * deployed engines, and fire-variant cook-offs. Mutates the park.
 */
export function tickEngines(park: EnginePark, roll: () => number): EngineTickResult {
  const result: EngineTickResult = { completed: [], destroyed: [], cookoffs: [] };

  for (const item of park.queue) item.daysLeft -= 1;
  const done = park.queue.filter((i) => i.daysLeft <= 0);
  park.queue = park.queue.filter((i) => i.daysLeft > 0);
  for (const item of done) {
    park.reserve.push(item.typeId);
    result.completed.push(item.typeId);
  }

  // Defender counter-battery: each deployed engine risks destruction.
  const survivors: string[] = [];
  for (const typeId of park.deployed) {
    const type = engineType(typeId)!;
    if (roll() < type.counterBatteryRisk) {
      result.destroyed.push(typeId);
      park.fireVariants = park.fireVariants.filter((f) => f !== typeId);
    } else {
      survivors.push(typeId);
    }
  }
  park.deployed = survivors;

  // Fire variants: double damage, but 10% daily cook-off.
  const kept: string[] = [];
  for (const typeId of park.fireVariants) {
    if (park.deployed.includes(typeId) && roll() < 0.1) {
      result.cookoffs.push(typeId);
      park.deployed = park.deployed.filter((d) => d !== typeId);
    } else {
      kept.push(typeId);
    }
  }
  park.fireVariants = kept;

  return result;
}

/** Move an engine between reserve and deployed. */
export function moveEngine(park: EnginePark, typeId: string, to: "reserve" | "deployed"): void {
  const from = to === "deployed" ? park.reserve : park.deployed;
  const idx = from.indexOf(typeId);
  if (idx < 0) throw new Error(`No ${typeId} in ${to === "deployed" ? "reserve" : "deployed"}.`);
  from.splice(idx, 1);
  (to === "deployed" ? park.deployed : park.reserve).push(typeId);
}

/** Total wall damage per assault day from deployed engines (fire variants doubled). */
export function deployedDamage(park: EnginePark): number {
  return park.deployed.reduce((sum, typeId) => {
    const type = engineType(typeId)!;
    const mult = park.fireVariants.includes(typeId) ? 2 : 1;
    return sum + type.siegeDamage * mult;
  }, 0);
}
