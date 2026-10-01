/**
 * @vitest-environment jsdom
 *
 * March tracker: active march progress + ETA (92), interruption alerts with
 * the encounter option (93), march cancel with partial refund (94).
 * MarchPlanner: plan-ready route callback (89), commit returns the march id
 * and closes the planner (91).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createMarchTracker,
  etaLabel,
  marchProgress,
  type MarchTrackerCallbacks,
} from "../march-tracker.js";
import type {
  CancelMarchResult,
  MarchInterruption,
  PartyState,
  SimulationProvider,
} from "../../data/types.js";

function party(overrides: Partial<PartyState> = {}): PartyState {
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
    troops: [],
    roles: {},
    goods: [],
    ...overrides,
  };
}

function marchingParty(): PartyState {
  return party({
    destination: { settlementId: "denver", name: "Denver", marchId: "march-0001", daysTotal: 4 },
    marchingSinceDay: 10,
  });
}

function provider(overrides: Partial<SimulationProvider> = {}): SimulationProvider {
  return {
    kind: "fixture",
    label: "test",
    getSnapshot: vi.fn(),
    trade: vi.fn(),
    planMarch: vi.fn(),
    commitMarch: vi.fn(),
    cancelMarch: vi.fn(),
    why: vi.fn(),
    subscribeTicks: vi.fn(),
    ...overrides,
  } as unknown as SimulationProvider;
}

function callbacks(overrides: Partial<MarchTrackerCallbacks> = {}): MarchTrackerCallbacks {
  return {
    onFaceInterruption: vi.fn(),
    onDismissInterruption: vi.fn(),
    ...overrides,
  };
}

function mount(p = provider(), cb?: MarchTrackerCallbacks) {
  const handle = createMarchTracker({ provider: p, callbacks: cb ?? callbacks() });
  document.body.append(handle.root);
  return handle;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("marchProgress", () => {
  it("returns null when the party is not marching", () => {
    expect(marchProgress(party(), 12)).toBeNull();
  });

  it("computes days out, total, and remaining", () => {
    expect(marchProgress(marchingParty(), 12)).toEqual({ daysOut: 2, daysTotal: 4, daysRemaining: 2 });
  });

  it("never reports negative remaining days", () => {
    expect(marchProgress(marchingParty(), 20)?.daysRemaining).toBe(0);
  });
});

describe("etaLabel", () => {
  it("counts down in plain words", () => {
    expect(etaLabel({ daysRemaining: 3 }, 15)).toBe("Arrives in 3 days (day 15)");
    expect(etaLabel({ daysRemaining: 1 }, 15)).toBe("Arrives in 1 day (day 15)");
    expect(etaLabel({ daysRemaining: 0 }, 15)).toBe("Arriving now");
  });
});

describe("march tracker", () => {
  it("shows the destination, progress, and ETA countdown", () => {
    const handle = mount();
    handle.update(marchingParty(), 12);
    expect(handle.root.querySelector('[data-testid="march-tracker-destination"]')?.textContent).toContain("Denver");
    expect(handle.root.querySelector('[data-testid="march-tracker-eta"]')?.textContent).toBe("Arrives in 2 days (day 14)");
    const meter = handle.root.querySelector('[data-testid="march-tracker-progress"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("2");
    expect(meter?.getAttribute("aria-valuemax")).toBe("4");
  });

  it("shows an empty state when nothing is marching", () => {
    const handle = mount();
    handle.update(party(), 12);
    expect(handle.root.textContent).toContain("No march under way.");
  });

  it("advances the countdown as days pass", () => {
    const handle = mount();
    handle.update(marchingParty(), 12);
    expect(handle.root.querySelector('[data-testid="march-tracker-eta"]')?.textContent).toContain("2 days");
    handle.update(marchingParty(), 13);
    expect(handle.root.querySelector('[data-testid="march-tracker-eta"]')?.textContent).toContain("1 day");
  });

  it("calls cancelMarch and shows the partial refund", async () => {
    const result: CancelMarchResult = {
      marchId: "march-0001",
      destinationName: "Denver",
      daysRemaining: 2,
      daysTotal: 4,
      refundedFood: 50,
      refundedMoney: 120,
      refundedMetal: 8,
    };
    const p = provider({ cancelMarch: vi.fn().mockResolvedValue(result) });
    const handle = mount(p);
    handle.update(marchingParty(), 12);
    (handle.root.querySelector('[data-testid="march-tracker-cancel"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(handle.root.querySelector('[data-testid="march-cancel-result"]')).not.toBeNull();
    });
    expect(p.cancelMarch).toHaveBeenCalledWith("march-0001");
    const text = handle.root.querySelector('[data-testid="march-cancel-result"]')?.textContent ?? "";
    expect(text).toContain("Denver");
    expect(text).toContain("50.0");
    expect(text).toContain("120");
  });

  it("shows an error when cancel fails", async () => {
    const p = provider({ cancelMarch: vi.fn().mockRejectedValue(new Error("No such march.")) });
    const handle = mount(p);
    handle.update(marchingParty(), 12);
    (handle.root.querySelector('[data-testid="march-tracker-cancel"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(handle.root.textContent).toContain("No such march.");
    });
  });

  it("raises an ambush alert with a face-them option", () => {
    const cb = callbacks();
    const handle = mount(provider(), cb);
    handle.update(marchingParty(), 12);
    const interruption: MarchInterruption = {
      id: "i-1",
      marchId: "march-0001",
      kind: "ambush",
      day: 12,
      description: "Raiders hit the column.",
      strength: 90,
    };
    handle.interrupt(interruption);
    expect(handle.root.querySelector('[data-testid="march-interruption-i-1"]')?.textContent).toContain("Ambush on the road");
    (handle.root.querySelector('[data-testid="march-interruption-face-i-1"]') as HTMLButtonElement).click();
    expect(cb.onFaceInterruption).toHaveBeenCalledWith(interruption);
    // The alert is gone after acting on it.
    expect(handle.root.querySelector('[data-testid="march-interruption-i-1"]')).toBeNull();
  });

  it("a blocked road offers waiting it out, no battle option", () => {
    const cb = callbacks();
    const handle = mount(provider(), cb);
    handle.update(marchingParty(), 12);
    handle.interrupt({
      id: "i-2",
      marchId: "march-0001",
      kind: "blocked",
      day: 12,
      description: "A rockslide blocks the road.",
    });
    expect(handle.root.querySelector('[data-testid="march-interruption-i-2"]')?.textContent).toContain("Road blocked");
    expect(handle.root.querySelector('[data-testid="march-interruption-face-i-2"]')).toBeNull();
    (handle.root.querySelector('[data-testid="march-interruption-dismiss-i-2"]') as HTMLButtonElement).click();
    expect(cb.onDismissInterruption).toHaveBeenCalled();
  });

  it("ignores the same interruption twice", () => {
    const handle = mount();
    handle.update(marchingParty(), 12);
    const interruption: MarchInterruption = {
      id: "i-3",
      marchId: "march-0001",
      kind: "ambush",
      day: 12,
      description: "Raiders hit the column.",
    };
    handle.interrupt(interruption);
    handle.interrupt(interruption);
    expect(handle.root.querySelectorAll('[data-testid="march-interruption-i-3"]')).toHaveLength(1);
  });
});
