/**
 * @vitest-environment jsdom
 *
 * MarchPlanner wiring to the real sim (master plan 2H):
 * - the plan-ready callback fires when a plan is priced, so the caller can
 *   draw the route polyline on the map (89),
 * - the breakdown shows distance, days, food/wage cost, and danger (90),
 * - committing posts to /v1/march/commit, hands back the march id, and
 *   closes the planner (91).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { marchPlanner } from "../panels/MarchPlanner.js";
import type {
  MarchPlan,
  PartyState,
  SettlementOption,
  SimulationProvider,
} from "../../data/types.js";

function party(): PartyState {
  return {
    id: "party-player",
    name: "Iron Company",
    leaderName: "Del",
    factionId: "f1",
    position: { x: 0, z: 0 },
    destination: null,
    route: [],
    marchingSinceDay: null,
    food: 100,
    medicine: 5,
    metal: 20,
    money: 500,
    morale: 0.7,
    fatigue: 0.1,
    wagesOwed: 0,
    speedKmPerDay: 30,
    troops: [{ id: "t1", name: "Riflemen", count: 40, quality: 2, wage: 0.6, morale: 0.7 }],
    roles: {},
    goods: [],
  };
}

function destinations(): SettlementOption[] {
  return [
    { id: "denver", simulationId: "denver", name: "Denver", distanceKm: 60, distanceHint: "60 km", klass: "city" },
  ];
}

function plan(): MarchPlan {
  return {
    partyId: "party-player",
    destinationSettlementId: "denver",
    destinationName: "Denver",
    route: [{ x: 0, z: 0 }, { x: 30, z: 10 }, { x: 60, z: 0 }],
    distanceKm: 60,
    days: 2,
    arrivalDay: 14,
    cost: { food: 68, money: 88, metal: 3.4 },
    daysOfFoodOnArrival: 1.5,
    roadDanger: 0.45,
    warnings: [],
    unmapped: false,
  };
}

function provider(): SimulationProvider {
  return {
    kind: "fixture",
    label: "test",
    getSnapshot: vi.fn(),
    trade: vi.fn(),
    planMarch: vi.fn().mockResolvedValue(plan()),
    commitMarch: vi.fn().mockResolvedValue({ marchId: "march-0007" }),
    cancelMarch: vi.fn(),
    why: vi.fn(),
    subscribeTicks: vi.fn(),
  } as unknown as SimulationProvider;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("march planner sim wiring", () => {
  it("fires onPlanReady with the priced plan so the map can draw the route", async () => {
    const onPlanReady = vi.fn();
    const handle = marchPlanner({ party: party(), destinations: destinations(), provider: provider(), onPlanReady });
    document.body.append(handle.root);
    await vi.waitFor(() => expect(onPlanReady).toHaveBeenCalled());
    // The first call clears the preview (null); the priced plan follows.
    await vi.waitFor(() => expect(onPlanReady.mock.calls.some((c) => c[0] !== null)).toBe(true));
    const priced: MarchPlan = onPlanReady.mock.calls.find((c) => c[0] !== null)![0];
    expect(priced.destinationName).toBe("Denver");
    expect(priced.route).toHaveLength(3);
  });

  it("shows distance, days, food/wage cost, and danger before commit", async () => {
    const handle = marchPlanner({ party: party(), destinations: destinations(), provider: provider() });
    document.body.append(handle.root);
    await vi.waitFor(() => expect(handle.root.querySelector('[data-testid="march-summary"]')).not.toBeNull());
    const summary = handle.root.querySelector('[data-testid="march-summary"]')?.textContent ?? "";
    expect(summary).toContain("60 km");
    expect(summary).toContain("2 days");
    expect(handle.root.querySelector('[data-testid="march-cost-food"]')?.textContent).toContain("68");
    expect(handle.root.querySelector('[data-testid="march-cost-money"]')?.textContent).toContain("88");
    expect(handle.root.querySelector('[data-testid="march-danger"]')?.textContent).toContain("0.45");
  });

  it("commits with the march id and closes the planner", async () => {
    const onCommitted = vi.fn();
    const onClose = vi.fn();
    const p = provider();
    const handle = marchPlanner({
      party: party(),
      destinations: destinations(),
      provider: p,
      onCommitted,
      onClose,
    });
    document.body.append(handle.root);
    await vi.waitFor(() => expect(handle.root.querySelector('[data-testid="march-commit"]')).not.toBeNull());
    (handle.root.querySelector('[data-testid="march-commit"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onCommitted).toHaveBeenCalled());
    expect(p.commitMarch).toHaveBeenCalledWith({
      partyId: "party-player",
      destinationSettlementId: "denver",
      departure: "now",
    });
    const [committedPlan, marchId] = onCommitted.mock.calls[0]!;
    expect((committedPlan as MarchPlan).destinationName).toBe("Denver");
    expect(marchId).toBe("march-0007");
    expect(onClose).toHaveBeenCalled();
  });

  it("clears the route preview when the destination changes", async () => {
    const onPlanReady = vi.fn();
    const handle = marchPlanner({
      party: party(),
      destinations: [
        ...destinations(),
        { id: "aurora", simulationId: "aurora", name: "Aurora", distanceKm: 40, distanceHint: "40 km", klass: "city" },
      ],
      provider: provider(),
      onPlanReady,
    });
    document.body.append(handle.root);
    await vi.waitFor(() => expect(onPlanReady).toHaveBeenCalled());
    onPlanReady.mockClear();
    const select = handle.root.querySelector('[data-testid="march-target"]') as HTMLSelectElement;
    select.value = "aurora";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(onPlanReady).toHaveBeenCalledWith(null));
  });
});
