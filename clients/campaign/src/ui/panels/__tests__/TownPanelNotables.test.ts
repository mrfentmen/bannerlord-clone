/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState, Notable, TalkToNotableResult, ImproveRelationResult } from "../../../data/types.js";

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

function notable(overrides: Partial<Notable> = {}): Notable {
  return {
    id: "notable-1",
    settlementId: "s1",
    name: "Merchant Vex",
    type: "merchant",
    power: 60,
    relation: 10,
    blurb: "Everything passes through their hands.",
    ...overrides,
  };
}

function talkResult(overrides: Partial<TalkToNotableResult> = {}): TalkToNotableResult {
  return {
    notableId: "notable-1",
    name: "Merchant Vex",
    dialogue: ['Merchant Vex nods. "Talk. I\'ve got things to do."'],
    actions: [
      { id: "gift", label: "Offer a gift (50 gold)", detail: "Gold opens doors. Raises relation.", available: true },
      { id: "favor", label: "Do a favor", detail: "Run an errand. Raises relation more than gold.", available: true },
      {
        id: "ask-recruits",
        label: "Ask about recruits",
        detail: "Power 60: their word carries weight in the hiring halls.",
        available: true,
      },
      {
        id: "ask-quest",
        label: "Ask for work",
        detail: "Notables with real power always have problems that need solving.",
        available: true,
      },
    ],
    ...overrides,
  };
}

function improveResult(overrides: Partial<ImproveRelationResult> = {}): ImproveRelationResult {
  return {
    accepted: true,
    notableId: "notable-1",
    name: "Merchant Vex",
    relationBefore: 10,
    relationAfter: 20,
    summary: "You gave Merchant Vex $50. Relation 10 \u2192 20.",
    causedBy: "test",
    ...overrides,
  };
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

describe("town panel notables talk (tasks 129-133)", () => {
  it("hides the talk section when the caller cannot serve conversations", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="notabletalk-section"]')).toBeNull();
  });

  it("shows no section for a town with no notables, even with handlers wired", () => {
    const t = town();
    const root = townPanel(options({ town: { ...t, notables: [] }, onNotableTalk: vi.fn(), onNotableImprove: vi.fn() }));
    expect(root.querySelector('[data-testid="notabletalk-section"]')).toBeNull();
  });

  it("draws the roster doorless on render: one Talk button per notable, no fetch on paint", async () => {
    const onNotableTalk = vi.fn().mockResolvedValue(talkResult());
    const t = town();
    const root = townPanel(
      options({ town: { ...t, notables: [notable()] }, onNotableTalk, onNotableImprove: vi.fn() }),
    );
    expect(root.querySelector('[data-testid="notabletalk-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="notabletalk-notable-1"]')).not.toBeNull();
    expect(onNotableTalk).not.toHaveBeenCalled();
    const talk = root.querySelector('[data-testid="notable-talk-notable-1"]') as HTMLButtonElement;
    expect(talk).not.toBeNull();
    talk.click();
    await flush();
    expect(onNotableTalk).toHaveBeenCalledWith("notable-1");
  });

  it("opens a conversation: dialogue lines verbatim, gift and favor are live buttons", async () => {
    const onNotableTalk = vi.fn().mockResolvedValue(talkResult());
    const t = town();
    const root = townPanel(
      options({ town: { ...t, notables: [notable()] }, onNotableTalk, onNotableImprove: vi.fn() }),
    );
    (root.querySelector('[data-testid="notable-talk-notable-1"]') as HTMLButtonElement).click();
    await flush();
    expect(root.textContent).toContain("Talk. I've got things to do.");
    expect(root.querySelector('[data-testid="notable-action-gift"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="notable-action-favor"]')).not.toBeNull();
    // No execution method exists for these two in the contract: text, not buttons.
    expect(root.querySelector('[data-testid="notable-action-ask-recruits"]')?.tagName).toBe("P");
    expect(root.querySelector('[data-testid="notable-action-ask-quest"]')?.tagName).toBe("P");
  });

  it("sends the gift through improveRelation and prints the sim's summary verbatim", async () => {
    const onNotableImprove = vi.fn().mockResolvedValue(improveResult());
    const onNotableTalk = vi.fn().mockResolvedValue(talkResult());
    const t = town();
    const root = townPanel(
      options({ town: { ...t, notables: [notable()] }, onNotableTalk, onNotableImprove }),
    );
    (root.querySelector('[data-testid="notable-talk-notable-1"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="notable-action-gift"]') as HTMLButtonElement).click();
    await flush();
    expect(onNotableImprove).toHaveBeenCalledWith({ notableId: "notable-1", action: "gift", amount: 50 });
    const message = root.querySelector('[data-testid="notabletalk-message"]');
    expect(message?.textContent).toContain("Relation 10 \u2192 20.");
  });

  it("shows the gate reason for an unavailable real action, no button", async () => {
    const result = talkResult({
      actions: [
        {
          id: "gift",
          label: "Offer a gift (50 gold)",
          detail: "Gold opens doors.",
          available: false,
          reason: "You don't have 50 gold to spare.",
        },
      ],
    });
    const onNotableTalk = vi.fn().mockResolvedValue(result);
    const t = town();
    const root = townPanel(
      options({ town: { ...t, notables: [notable()] }, onNotableTalk, onNotableImprove: vi.fn() }),
    );
    (root.querySelector('[data-testid="notable-talk-notable-1"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="notable-action-gift"]')?.tagName).toBe("P");
    expect(root.textContent).toContain("You don't have 50 gold to spare.");
  });

  it("a failed talk keeps the button armed and says why", async () => {
    const onNotableTalk = vi.fn().mockRejectedValue(new Error("No notable notable-1 in s1"));
    const t = town();
    const root = townPanel(
      options({ town: { ...t, notables: [notable()] }, onNotableTalk, onNotableImprove: vi.fn() }),
    );
    (root.querySelector('[data-testid="notable-talk-notable-1"]') as HTMLButtonElement).click();
    await flush();
    const talk = root.querySelector('[data-testid="notable-talk-notable-1"]') as HTMLButtonElement;
    expect(talk.disabled).toBe(false);
    const message = root.querySelector('[data-testid="notabletalk-message"]');
    expect(message?.textContent).toContain("No notable notable-1 in s1");
  });

  it("a different town resets the conversation state", async () => {
    const onNotableTalk = vi.fn().mockResolvedValue(talkResult());
    const t = town();
    const root = townPanel(
      options({ town: { ...t, notables: [notable()] }, onNotableTalk, onNotableImprove: vi.fn() }),
    );
    (root.querySelector('[data-testid="notable-talk-notable-1"]') as HTMLButtonElement).click();
    await flush();
    const other = { ...t, id: "t2", settlementId: "s2" };
    const root2 = townPanel(
      options({
        town: { ...other, notables: [notable({ settlementId: "s2" })] },
        onNotableTalk,
        onNotableImprove: vi.fn(),
      }),
    );
    // The other town starts with a Talk button, not the previous conversation.
    expect(root2.querySelector('[data-testid="notable-talk-notable-1"]')).not.toBeNull();
    expect(root2.querySelector('[data-testid="notabletalk-notable-1"]')?.textContent).not.toContain("things to do");
  });
});
