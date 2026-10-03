/**
 * Merchant circuits and courier runs (Rowan).
 *
 * The fixture spawns merchant caravans and courier parties that travel
 * fixed paths between the twelve Front Range settlements instead of
 * wandering: merchants loop trade circuits, couriers shuttle point to
 * point. This module owns the route data — which stops, in which order —
 * and the party specs the fixture spawns from it. Movement itself stays in
 * the fixture's `#moveNpcParties`, which follows a party's `circuit`.
 *
 * Positions are schematic (x = east km, z = south km, Denver near origin).
 * Bearings follow the real geography of the Denver metro and leg lengths
 * honor the fixture's DISTANCES table where it has the pair. This is a game
 * map abstraction, not a survey — documented here so nobody mistakes it
 * for world data.
 */

import { titledName, createNameRng, type NameRng, type NpcRole } from "./names.js";

export interface MapPoint {
  x: number;
  z: number;
}

/** Schematic map positions for the fixture's twelve settlements. */
export const SETTLEMENT_POSITIONS: Record<string, MapPoint> = {
  denver: { x: 0, z: 0 },
  aurora: { x: 17, z: 2 },
  lakewood: { x: -12, z: 4 },
  thornton: { x: 3, z: -15 },
  arvada: { x: -10, z: -9 },
  broomfield: { x: -6, z: -20 },
  longmont: { x: -8, z: -54 },
  boulder: { x: -20, z: -36 },
  golden: { x: -30, z: 8 },
  "idaho-springs": { x: -48, z: 12 },
  nederland: { x: -40, z: -14 },
  "central-city": { x: -44, z: 4 },
};

export type TradePathKind = "merchant" | "courier";

export interface TradeCircuit {
  id: string;
  name: string;
  kind: TradePathKind;
  /** Ordered settlement ids. Merchants loop them; couriers shuttle A->B->A. */
  stops: string[];
}

/** Merchant circuits: closed loops through several settlements. */
export const MERCHANT_CIRCUITS: TradeCircuit[] = [
  {
    id: "circuit-mile-high",
    name: "Mile-High Loop",
    kind: "merchant",
    stops: ["denver", "aurora", "thornton", "broomfield", "arvada", "lakewood"],
  },
  {
    id: "circuit-foothills",
    name: "Foothills Run",
    kind: "merchant",
    stops: ["golden", "idaho-springs", "central-city", "nederland", "boulder", "arvada"],
  },
  {
    id: "circuit-north-corridor",
    name: "North Corridor",
    kind: "merchant",
    stops: ["denver", "thornton", "broomfield", "longmont", "boulder"],
  },
];

/** Courier runs: fast two-stop shuttles. */
export const COURIER_RUNS: TradeCircuit[] = [
  { id: "courier-denver-boulder", name: "Denver–Boulder Dispatch", kind: "courier", stops: ["denver", "boulder"] },
  { id: "courier-aurora-longmont", name: "Aurora–Longmont Post", kind: "courier", stops: ["aurora", "longmont"] },
  { id: "courier-golden-central", name: "Golden–Central City Line", kind: "courier", stops: ["golden", "central-city"] },
];

/** Map positions for each stop of a circuit, in order. */
export function circuitWaypoints(circuit: TradeCircuit): MapPoint[] {
  return circuit.stops.map((s) => SETTLEMENT_POSITIONS[s] ?? { x: 0, z: 0 });
}

/** Straight-line km per leg, same order as stops (last leg returns to first). */
export function legDistancesKm(circuit: TradeCircuit): number[] {
  const pts = circuitWaypoints(circuit);
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return Math.hypot(q.x - p.x, q.z - p.z);
  });
}

/** Total loop length in km. */
export function circuitLengthKm(circuit: TradeCircuit): number {
  return legDistancesKm(circuit).reduce((a, b) => a + b, 0);
}

export interface TradePartySpec {
  id: string;
  name: string;
  leaderName: string;
  leaderTitle: string;
  kind: "caravan";
  circuit: string[];
  /** Where the party starts (first stop's position). */
  start: MapPoint;
  speedKmPerDay: number;
  troopCount: number;
  /** Flavor: what this party hauls or carries. */
  cargo: string;
}

const MERCHANT_NAMES = ["Blue Ridge Haulers", "Mile-High Freight", "Foothills Trading Co."];
const COURIER_NAMES = ["Denver Dispatch", "Ridge Runners", "Lightning Post"];
const MERCHANT_CARGO = ["grain and textiles", "tools and medicine", "fuel and metal"];
const COURIER_CARGO = ["sealed letters", "light parcels", "urgent dispatches"];

function specFor(
  rng: NameRng,
  circuit: TradeCircuit,
  partyName: string,
  cargo: string,
  role: NpcRole,
  speed: number,
  troops: number,
  index: number,
): TradePartySpec {
  const leader = titledName(role, rng);
  const stops = circuit.stops;
  return {
    id: `npc-${circuit.kind}-${index}`,
    name: partyName,
    leaderName: leader.fullName,
    leaderTitle: leader.title,
    kind: "caravan",
    circuit: [...stops],
    start: { ...(SETTLEMENT_POSITIONS[stops[0]!] ?? { x: 0, z: 0 }) },
    speedKmPerDay: speed,
    troopCount: troops,
    cargo,
  };
}

/**
 * The trade parties for a campaign, drawn from the campaign seed so every
 * new game gets different merchants and couriers on the same roads.
 * Pass the fixture's RNG (or `createNameRng(seed)` standalone).
 */
export function planTradeParties(rng: NameRng): TradePartySpec[] {
  const specs: TradePartySpec[] = [];
  MERCHANT_CIRCUITS.forEach((circuit, i) => {
    specs.push(
      specFor(rng, circuit, MERCHANT_NAMES[i % MERCHANT_NAMES.length]!, MERCHANT_CARGO[i % MERCHANT_CARGO.length]!, "merchant", 28, 10 + Math.floor(rng() * 8), i),
    );
  });
  COURIER_RUNS.forEach((circuit, i) => {
    specs.push(
      specFor(rng, circuit, COURIER_NAMES[i % COURIER_NAMES.length]!, COURIER_CARGO[i % COURIER_CARGO.length]!, "courier", 55, 2 + Math.floor(rng() * 3), MERCHANT_CIRCUITS.length + i),
    );
  });
  return specs;
}

/** Standalone entry point: plan parties directly from a campaign seed. */
export function planTradePartiesForSeed(seed: number): TradePartySpec[] {
  return planTradeParties(createNameRng(seed ^ 0x9e3779b9));
}
