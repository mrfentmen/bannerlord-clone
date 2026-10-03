/**
 * Tests for merchant circuits and courier runs (Rowan).
 */

import { describe, expect, it } from "vitest";
import {
  circuitLengthKm,
  circuitWaypoints,
  COURIER_RUNS,
  legDistancesKm,
  MERCHANT_CIRCUITS,
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
