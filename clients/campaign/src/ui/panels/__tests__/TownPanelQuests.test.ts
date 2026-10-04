/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState, Quest, QuestOffer } from "../../../data/types.js";
import type { TownQuestsView } from "../sections/townQuests.js";

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

function offer(overrides: Partial<QuestOffer> = {}): QuestOffer {
  return {
    templateId: "bandit-hunt",
    title: "Bandit Hunt",
    description: "Clear out the bandits troubling the roads.",
    rewardMoney: 500,
    rewardRenown: 5,
    deadlineDays: 30,
    ...overrides,
  };
}

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1",
    title: "Bandit Hunt",
    description: "Clear out the bandits troubling the roads.",
    giverId: "notable-1",
    giverName: "Merchant Vex",
    objectives: [{ kind: "kill_bandits", target: 10, progress: 3 }],
    rewardMoney: 500,
    rewardRenown: 5,
    deadlineDay: 30,
    acceptedDay: 5,
    status: "active",
    ...overrides,
  } as unknown as Quest;
}

function questsView(overrides: Partial<TownQuestsView> = {}): TownQuestsView {
  return { offers: [offer()], active: [], ...overrides };
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

describe("town panel quests (tasks 125-126)", () => {
  it("hides the quests section when the caller cannot send the orders", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="quests-section"]')).toBeNull();
  });

  it("fetches the board only when the player asks around, not on render", async () => {
    const onLoadQuests = vi.fn().mockResolvedValue(questsView());
    const root = townPanel(options({
      onLoadQuests,
      onAcceptQuest: vi.fn(),
      onAbandonQuest: vi.fn(),
    }));
    expect(onLoadQuests).not.toHaveBeenCalled();
    (root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(onLoadQuests).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-testid="quest-offer-bandit-hunt"]')).not.toBeNull();
  });

  it("shows each offer's pay, renown, and deadline", async () => {
    const onLoadQuests = vi.fn().mockResolvedValue(questsView());
    const root = townPanel(options({ onLoadQuests, onAcceptQuest: vi.fn(), onAbandonQuest: vi.fn() }));
    (root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.textContent).toContain("$500");
    expect(root.textContent).toContain("5 renown");
    expect(root.textContent).toContain("30 day limit");
  });

  it("shows carried quests with progress and an abandon button", async () => {
    const onLoadQuests = vi.fn().mockResolvedValue(questsView({ active: [quest()] }));
    const root = townPanel(options({ onLoadQuests, onAcceptQuest: vi.fn(), onAbandonQuest: vi.fn() }));
    (root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="quest-quest-1"]')).not.toBeNull();
    expect(root.textContent).toContain("3/10");
    expect(root.textContent).toContain("Merchant Vex");
  });

  it("sends the accept order and reloads", async () => {
    const onAcceptQuest = vi.fn().mockResolvedValue({ questId: "quest-9" });
    const onLoadQuests = vi.fn().mockResolvedValue(questsView());
    const root = townPanel(options({ onLoadQuests, onAcceptQuest, onAbandonQuest: vi.fn() }));
    (root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="quest-accept-bandit-hunt"]') as HTMLButtonElement).click();
    await flush();
    expect(onAcceptQuest).toHaveBeenCalledWith("bandit-hunt");
    expect(root.querySelector('[data-testid="quests-message"]')?.textContent).toContain("Taken: Bandit Hunt.");
    expect(onLoadQuests).toHaveBeenCalledTimes(2);
  });

  it("shows a refusal verbatim and re-arms the accept button", async () => {
    const onAcceptQuest = vi.fn().mockRejectedValue(new Error("You already have this quest active."));
    const onLoadQuests = vi.fn().mockResolvedValue(questsView());
    const root = townPanel(options({ onLoadQuests, onAcceptQuest, onAbandonQuest: vi.fn() }));
    (root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement).click();
    await flush();
    const accept = root.querySelector('[data-testid="quest-accept-bandit-hunt"]') as HTMLButtonElement;
    accept.click();
    await flush();
    expect(root.querySelector('[data-testid="quests-message"]')?.textContent).toBe("You already have this quest active.");
    expect(accept.disabled).toBe(false);
  });

  it("sends the abandon order and reloads", async () => {
    const onAbandonQuest = vi.fn().mockResolvedValue(undefined);
    const onLoadQuests = vi.fn().mockResolvedValue(questsView({ active: [quest()] }));
    const root = townPanel(options({ onLoadQuests, onAcceptQuest: vi.fn(), onAbandonQuest }));
    (root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="quest-abandon-quest-1"]') as HTMLButtonElement).click();
    await flush();
    expect(onAbandonQuest).toHaveBeenCalledWith("quest-1");
    expect(root.querySelector('[data-testid="quests-message"]')?.textContent).toContain("Abandoned: Bandit Hunt.");
  });

  it("keeps the door for a retry when the board cannot be read", async () => {
    const onLoadQuests = vi.fn().mockRejectedValue(new Error("The board could not be read."));
    const root = townPanel(options({ onLoadQuests, onAcceptQuest: vi.fn(), onAbandonQuest: vi.fn() }));
    (root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement).click();
    await flush();
    const enter = root.querySelector('[data-testid="quests-enter"]') as HTMLButtonElement | null;
    expect(enter).not.toBeNull();
    expect(enter!.disabled).toBe(false);
  });
});
