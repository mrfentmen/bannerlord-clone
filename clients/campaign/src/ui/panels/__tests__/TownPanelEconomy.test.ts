/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState } from "../../../data/types.js";

function town(): TownState {
  return {
    id: "t1",
    settlementId: "s1",
    name: "Brooklyn",
    klass: "town",
    holderId: "h1",
    holderName: "Del",
    population: 1000,
    workers: 400,
    foodStock: 100,
    foodProduction: 50,
    foodDemand: 40,
    medicineStock: 10,
    sanitation: 0.6,
    infected: 0.01,
    crowding: 0.2,
    unrest: 0.1,
    loyalty: 0.7,
    security: 0.5,
    culture: "american",
    holderCulture: "american",
    rebellious: false,
    prosperity: 0.6,
    taxRate: 0.2,
    stateTaxRate: 0.05,
    state: "NY",
    buildings: [],
    constructionBuilding: null,
    constructionDaysLeft: 0,
    garrison: 50,
    garrisonConduct: 0.6,
    roadSafety: 0.7,
    informationTrust: 0.6,
    crimeRating: 0.15,
    money: 1000,
    gold: 0,
    metal: 0,
    updatedTick: 1,
    recruitable: [],
    notables: [],
  } as TownState;
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    town: town(),
    onWhy: vi.fn(),
    onOpenMarket: vi.fn(),
    onMarchHere: vi.fn(),
    onRoster: vi.fn(),
    ...overrides,
  } as Parameters<typeof townPanel>[0];
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("town panel: crime, governor, ransom broker (bucket 7)", () => {
  it("hides all three sections without handlers", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="crime-section"]')).toBeNull();
    expect(root.querySelector('[data-testid="governor-section"]')).toBeNull();
    expect(root.querySelector('[data-testid="broker-section"]')).toBeNull();
  });

  it("the fine ledger reads through the caller: outstanding or clean", async () => {
    const onGetOutstandingFine = vi.fn().mockResolvedValue(700);
    const root = townPanel(options({ onGetOutstandingFine, onCommitCrime: vi.fn(), onPayFine: vi.fn() }));
    await flush();
    expect(root.querySelector('[data-testid="crime-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="crime-fine"]')?.textContent).toContain("$700");
    const clean = townPanel(options({ onGetOutstandingFine: vi.fn().mockResolvedValue(0), onCommitCrime: vi.fn(), onPayFine: vi.fn() }));
    await flush();
    expect(clean.querySelector('[data-testid="crime-fine"]')?.textContent).toContain("No fines outstanding.");
  });

  it("committing a crime posts the kind and prints the sim's fine", async () => {
    const onCommitCrime = vi.fn().mockResolvedValue({ fine: 500 });
    const onWorldChanged = vi.fn();
    const root = townPanel(options({ onGetOutstandingFine: vi.fn().mockResolvedValue(0), onCommitCrime, onPayFine: vi.fn(), onWorldChanged }));
    (root.querySelector('[data-testid="crime-assault"]') as HTMLButtonElement).click();
    await flush();
    expect(onCommitCrime).toHaveBeenCalledWith("assault");
    expect(root.querySelector('[data-testid="crime-message"]')?.textContent).toContain("$500");
    expect(onWorldChanged).toHaveBeenCalled();
  });

  it("paying the fine prints the paid amount; a refusal lands verbatim", async () => {
    const onPayFine = vi.fn().mockRejectedValue(new Error("No outstanding fine in this town."));
    const root = townPanel(options({ onGetOutstandingFine: vi.fn().mockResolvedValue(0), onCommitCrime: vi.fn(), onPayFine }));
    (root.querySelector('[data-testid="crime-pay-fine"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="crime-message"]')?.textContent).toContain("No outstanding fine in this town.");
  });

  it("the governor section is gated on holding the town and reads the appointment", async () => {
    const onGetGovernor = vi.fn().mockResolvedValue(null);
    const root = townPanel(options({
      heldByPlayer: true,
      onGetGovernor,
      onAssignGovernor: vi.fn(),
      governorCandidates: [{ id: "c1", name: "Derek Hollis" }],
    }));
    await flush();
    expect(root.querySelector('[data-testid="governor-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="governor-current"]')?.textContent).toContain("No governor appointed.");
    const noHold = townPanel(options({ heldByPlayer: false, onGetGovernor, onAssignGovernor: vi.fn() }));
    expect(noHold.querySelector('[data-testid="governor-section"]')).toBeNull();
  });

  it("appointing a governor posts the companion id and prints the sim's line", async () => {
    const onAssignGovernor = vi.fn().mockResolvedValue({ line: "Derek Hollis takes Brooklyn. Medic training steadies the sick." });
    const onWorldChanged = vi.fn();
    const root = townPanel(options({
      heldByPlayer: true,
      onGetGovernor: vi.fn().mockResolvedValue(null),
      onAssignGovernor,
      governorCandidates: [{ id: "c1", name: "Derek Hollis" }],
      onWorldChanged,
    }));
    (root.querySelector('[data-testid="governor-assign"]') as HTMLButtonElement).click();
    await flush();
    expect(onAssignGovernor).toHaveBeenCalledWith("c1");
    expect(root.querySelector('[data-testid="governor-message"]')?.textContent).toContain("Derek Hollis takes Brooklyn");
    expect(onWorldChanged).toHaveBeenCalled();
  });

  it("the broker sells prisoners at the sim's price and refusals land verbatim", async () => {
    const onSellPrisonersToBroker = vi.fn().mockRejectedValue(new Error("Cannot sell 9 (have 4)."));
    const root = townPanel(options({
      onGetOutstandingFine: vi.fn().mockResolvedValue(0),
      onCommitCrime: vi.fn(),
      onPayFine: vi.fn(),
      prisoners: [{ troopId: "troop-bandit", name: "Bandits", count: 4, tier: 2 }],
      onSellPrisonersToBroker,
    }));
    await flush();
    expect(root.querySelector('[data-testid="broker-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="broker-troop-bandit"]')).not.toBeNull();
    const qty = root.querySelector<HTMLInputElement>('[data-testid="broker-troop-bandit"] input');
    qty!.value = "9";
    (root.querySelector('[data-testid="broker-sell-troop-bandit"]') as HTMLButtonElement).click();
    await flush();
    expect(onSellPrisonersToBroker).toHaveBeenCalledWith("troop-bandit", 9);
    expect(root.querySelector('[data-testid="broker-message"]')?.textContent).toContain("Cannot sell 9 (have 4).");
  });

  it("a successful broker sale prints the sim's line and fires the changed hook", async () => {
    const onSellPrisonersToBroker = vi.fn().mockResolvedValue({ gold: 240, line: "The broker pays $240." });
    const onWorldChanged = vi.fn();
    const root = townPanel(options({
      onGetOutstandingFine: vi.fn().mockResolvedValue(0),
      onCommitCrime: vi.fn(),
      onPayFine: vi.fn(),
      prisoners: [{ troopId: "troop-bandit", name: "Bandits", count: 4, tier: 2 }],
      onSellPrisonersToBroker,
      onWorldChanged,
    }));
    await flush();
    (root.querySelector('[data-testid="broker-sell-troop-bandit"]') as HTMLButtonElement).click();
    await flush();
    expect(onSellPrisonersToBroker).toHaveBeenCalledWith("troop-bandit", 4);
    expect(root.querySelector('[data-testid="broker-message"]')?.textContent).toContain("The broker pays $240.");
    expect(onWorldChanged).toHaveBeenCalled();
  });
});

describe("town panel: garrison transfer (fief loop)", () => {
  it("the garrison section is gated on holding the town, a handler, and party troops", () => {
    const full = townPanel(options({
      heldByPlayer: true,
      partyTroops: [{ id: "troop-militia", name: "Militia", count: 5 }],
      onTransferToGarrison: vi.fn(),
    }));
    expect(full.querySelector('[data-testid="garrison-section"]')).not.toBeNull();
    const noHold = townPanel(options({
      heldByPlayer: false,
      partyTroops: [{ id: "troop-militia", name: "Militia", count: 5 }],
      onTransferToGarrison: vi.fn(),
    }));
    expect(noHold.querySelector('[data-testid="garrison-section"]')).toBeNull();
    const noTroops = townPanel(options({ heldByPlayer: true, partyTroops: [], onTransferToGarrison: vi.fn() }));
    expect(noTroops.querySelector('[data-testid="garrison-section"]')).toBeNull();
  });

  it("renders the garrison count and one row per party stack", () => {
    const root = townPanel(options({
      heldByPlayer: true,
      partyTroops: [
        { id: "troop-militia", name: "Militia", count: 5 },
        { id: "troop-veteran", name: "Veterans", count: 3 },
      ],
      onTransferToGarrison: vi.fn(),
    }));
    expect(root.querySelector('[data-testid="garrison-current"]')?.textContent).toContain("Garrison: 50");
    expect(root.querySelector('[data-testid="garrison-leave-troop-militia"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="garrison-leave-troop-veteran"]')).not.toBeNull();
  });

  it("a refusal lands verbatim and re-arms the button", async () => {
    const onTransferToGarrison = vi.fn().mockRejectedValue(new Error("Someone has to ride out. Leave at least one troop with the party."));
    const onWorldChanged = vi.fn();
    const root = townPanel(options({
      heldByPlayer: true,
      partyTroops: [{ id: "troop-militia", name: "Militia", count: 5 }],
      onTransferToGarrison,
      onWorldChanged,
    }));
    await flush();
    const qty = root.querySelector<HTMLInputElement>('[data-testid="garrison-troop-militia"] input');
    qty!.value = "5";
    const btn = root.querySelector('[data-testid="garrison-leave-troop-militia"]') as HTMLButtonElement;
    btn.click();
    await flush();
    expect(onTransferToGarrison).toHaveBeenCalledWith("troop-militia", 5);
    expect(root.querySelector('[data-testid="garrison-message"]')?.textContent).toContain("Someone has to ride out");
    expect(btn.disabled).toBe(false);
    expect(onWorldChanged).not.toHaveBeenCalled();
  });

  it("a successful transfer posts the count, prints the sim's line, and fires the changed hook", async () => {
    const onTransferToGarrison = vi.fn().mockResolvedValue({ garrison: 55, line: "5 Militia now garrison Brooklyn. Garrison 55." });
    const onWorldChanged = vi.fn();
    const root = townPanel(options({
      heldByPlayer: true,
      partyTroops: [{ id: "troop-militia", name: "Militia", count: 5 }],
      onTransferToGarrison,
      onWorldChanged,
    }));
    await flush();
    (root.querySelector('[data-testid="garrison-leave-troop-militia"]') as HTMLButtonElement).click();
    await flush();
    expect(onTransferToGarrison).toHaveBeenCalledWith("troop-militia", 5);
    expect(root.querySelector('[data-testid="garrison-message"]')?.textContent).toContain("Garrison 55.");
    expect(onWorldChanged).toHaveBeenCalled();
  });
});

