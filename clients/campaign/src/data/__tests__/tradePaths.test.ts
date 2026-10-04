/**
 * Tests for merchant circuits and courier runs (Rowan).
 */

import { describe, expect, it } from "vitest";
import {
  circuitLengthKm,
  circuitWaypoints,
  COURIER_RUNS,
  INTERSTATE_CORRIDORS,
  legDistancesKm,
  LONG_HAUL_CIRCUITS,
  MERCHANT_CIRCUITS,
  NATIONAL_CITY_NAMES,
  NATIONAL_CITY_POSITIONS,
  NATIONAL_COURIER_RUNS,
  nationalCircuitLengthKm,
  nationalWaypoints,
  planTradeParties,
  planTradePartiesForSeed,
  SETTLEMENT_POSITIONS,
} from "../tradePaths.js";
import { createNameRng } from "../names.js";

describe("trade paths", () => {
  it("gives every circuit stop a map position", () => {
    for (const circuit of [...MERCHANT_CIRCUITS, ...COURIER_RUNS]) {
      for (const stop of circuit.stops) {
        expect(
          SETTLEMENT_POSITIONS[stop],
          `missing position for stop ${stop} on ${circuit.id}`,
        ).toBeDefined();
      }
    }
  });

  it("merchant circuits loop three or more distinct stops", () => {
    expect(MERCHANT_CIRCUITS.length).toBeGreaterThan(0);
    for (const circuit of MERCHANT_CIRCUITS) {
      expect(new Set(circuit.stops).size).toBeGreaterThanOrEqual(3);
    }
  });

  it("courier runs shuttle exactly two distinct stops", () => {
    expect(COURIER_RUNS.length).toBeGreaterThan(0);
    for (const run of COURIER_RUNS) {
      expect(run.stops).toHaveLength(2);
      expect(run.stops[0]).not.toBe(run.stops[1]);
    }
  });

  it("leg distances are positive and one per stop", () => {
    for (const circuit of [...MERCHANT_CIRCUITS, ...COURIER_RUNS]) {
      const legs = legDistancesKm(circuit);
      expect(legs).toHaveLength(circuit.stops.length);
      for (const km of legs) expect(km).toBeGreaterThan(0);
      expect(circuitLengthKm(circuit)).toBeGreaterThan(0);
    }
  });

  it("waypoints match stops in order", () => {
    const circuit = MERCHANT_CIRCUITS[0]!;
    const pts = circuitWaypoints(circuit);
    expect(pts).toHaveLength(circuit.stops.length);
    expect(pts[0]).toEqual(SETTLEMENT_POSITIONS[circuit.stops[0]!]);
  });

  it("plans merchants and couriers with named leaders", () => {
    const specs = planTradeParties(createNameRng(77));
    expect(specs).toHaveLength(MERCHANT_CIRCUITS.length + COURIER_RUNS.length);
    const ids = specs.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const spec of specs) {
      expect(spec.kind).toBe("caravan");
      expect(spec.name.length).toBeGreaterThan(0);
      expect(spec.leaderName.length).toBeGreaterThan(0);
      expect(spec.leaderTitle.length).toBeGreaterThan(0);
      expect(spec.circuit.length).toBeGreaterThanOrEqual(2);
      expect(spec.start).toEqual(SETTLEMENT_POSITIONS[spec.circuit[0]!]!);
      expect(spec.speedKmPerDay).toBeGreaterThan(0);
      expect(spec.troopCount).toBeGreaterThan(0);
    }
    const couriers = specs.filter((s) => s.circuit.length === 2);
    const merchants = specs.filter((s) => s.circuit.length > 2);
    expect(couriers.length).toBe(COURIER_RUNS.length);
    expect(merchants.length).toBe(MERCHANT_CIRCUITS.length);
    // Couriers are faster than merchants.
    for (const c of couriers) {
      for (const m of merchants) expect(c.speedKmPerDay).toBeGreaterThan(m.speedKmPerDay);
    }
  });

  it("is deterministic per seed", () => {
    const a = planTradePartiesForSeed(12345);
    const b = planTradePartiesForSeed(12345);
    expect(a).toEqual(b);
    const c = planTradePartiesForSeed(54321);
    expect(c.map((s) => s.leaderName)).not.toEqual(a.map((s) => s.leaderName));
  });
});

describe("national road network", () => {
  it("gives every national city a position and a display name", () => {
    for (const [id, pos] of Object.entries(NATIONAL_CITY_POSITIONS)) {
      expect(pos.x).toBeDefined();
      expect(pos.z).toBeDefined();
      expect(NATIONAL_CITY_NAMES[id], `missing name for ${id}`).toBeDefined();
    }
  });

  it("traces interstate corridors through real cities in order", () => {
    expect(INTERSTATE_CORRIDORS.length).toBeGreaterThanOrEqual(6);
    for (const corridor of INTERSTATE_CORRIDORS) {
      expect(corridor.cities.length).toBeGreaterThanOrEqual(4);
      for (const city of corridor.cities) {
        expect(NATIONAL_CITY_POSITIONS[city], `${corridor.id} references unknown ${city}`).toBeDefined();
      }
    }
    // I-70 runs through Denver, the fixture hub.
    const i70 = INTERSTATE_CORRIDORS.find((c) => c.id === "i-70")!;
    expect(i70.cities).toContain("denver");
  });

  it("gives every long-haul stop a national waypoint", () => {
    for (const circuit of [...LONG_HAUL_CIRCUITS, ...NATIONAL_COURIER_RUNS]) {
      expect(circuit.stops.length).toBeGreaterThanOrEqual(2);
      const pts = nationalWaypoints(circuit);
      expect(pts).toHaveLength(circuit.stops.length);
      // Every stop resolves to a placed city (Denver sits at the origin by design).
      circuit.stops.forEach((stop, i) => {
        const placed =
          NATIONAL_CITY_POSITIONS[stop] !== undefined || SETTLEMENT_POSITIONS[stop] !== undefined;
        expect(placed, `${stop} has no map position`).toBe(true);
        expect(pts[i]).toBeDefined();
      });
    }
  });

  it("long-haul circuits span thousands of km", () => {
    for (const circuit of LONG_HAUL_CIRCUITS) {
      // Coast-to-coast scale: the shortest long-haul loop still exceeds 3,000 km.
      expect(nationalCircuitLengthKm(circuit)).toBeGreaterThan(3000);
    }
  });

  it("denver joins the national map at the fixture origin", () => {
    expect(NATIONAL_CITY_POSITIONS["denver"]).toEqual(SETTLEMENT_POSITIONS["denver"]);
  });
});
