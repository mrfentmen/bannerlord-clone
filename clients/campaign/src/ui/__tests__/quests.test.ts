/**
 * Quest log and markers UI tests. MASTER_PLAN.md section 3F (tasks 126-130).
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQuestLog,
  createQuestOffer,
  expiryKind,
  EXPIRY_WARNING_HOURS,
  type Quest,
  type QuestLogCallbacks,
  type QuestLogState,
  type QuestOfferCallbacks,
} from "../quests.js";

function quest(over: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1",
    title: "Grain for the north",
    description: "Deliver grain to the northern outpost.",
    giverName: "Marta the miller",
    status: "active",
    objectives: [
      { id: "obj-1", label: "Collect grain", current: 2, target: 5, locationName: "Old Mill" },
      { id: "obj-2", label: "Deliver grain", current: 0, target: 1, locationName: "North Outpost" },
    ],
    rewards: { gold: 120, xp: 40, relations: [{ entityName: "Miller guild", value: 10 }] },
    ...over,
  };
}

function state(): QuestLogState {
  return {
    quests: [
      quest(),
      quest({ id: "quest-2", title: "Bandits cleared", status: "completed" }),
      quest({ id: "quest-3", title: "The missing cart", status: "failed" }),
    ],
  };
}

let callbacks: QuestLogCallbacks;
let log: ReturnType<typeof createQuestLog>;

beforeEach(() => {
  document.body.innerHTML = "";
  callbacks = { onTrackQuest: vi.fn(), onUntrackQuest: vi.fn() };
  log = createQuestLog(state(), callbacks);
  document.body.append(log.root);
});

function tabButton(tab: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`[data-testid="quest-tab-${tab}"]`)!;
}

function cardTitles(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".quest-card .quest-card__title")).map(
    (el) => el.textContent ?? "",
  );
}

describe("tabs filter the quest list (task 126)", () => {
  it("starts on the active tab showing only active quests", () => {
    expect(cardTitles()).toContain("Grain for the north");
    expect(cardTitles()).not.toContain("Bandits cleared");
    expect(cardTitles()).not.toContain("The missing cart");
  });

  it("completed tab shows only completed quests", () => {
    tabButton("completed").click();
    expect(cardTitles()).toContain("Bandits cleared");
    expect(cardTitles()).not.toContain("Grain for the north");
  });

  it("failed tab shows only failed quests", () => {
    tabButton("failed").click();
    expect(cardTitles()).toContain("The missing cart");
    expect(cardTitles()).not.toContain("Grain for the north");
  });

  it("tab labels carry the per-status counts", () => {
    expect(tabButton("active").textContent).toContain("(1)");
    expect(tabButton("completed").textContent).toContain("(1)");
    expect(tabButton("failed").textContent).toContain("(1)");
  });

  it("tabs expose the tablist semantics", () => {
    expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabButton("active").getAttribute("aria-selected")).toBe("true");
    tabButton("completed").click();
    expect(tabButton("completed").getAttribute("aria-selected")).toBe("true");
  });

  it("renders an empty state when a tab has no quests", () => {
    log.update({ quests: [quest({ id: "only", status: "active" })] });
    tabButton("completed").click();
    expect(document.querySelector('[data-testid="empty-state"]')).not.toBeNull();
  });
});

describe("objectives with progress counters (task 127)", () => {
  it("renders each objective with a current/target counter", () => {
    const counters = Array.from(document.querySelectorAll<HTMLElement>(".quest-objective__counter")).map(
      (el) => el.textContent,
    );
    expect(counters).toContain("2/5");
    expect(counters).toContain("0/1");
  });

  it("progress bars carry the counter as aria values", () => {
    const bar = document.querySelector<HTMLElement>('.quest-objective[data-objective-id="obj-1"] [role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
  });

  it("update() moves the counters with the world on ticks", () => {
    log.update({ quests: [quest({ objectives: [{ id: "obj-1", label: "Collect grain", current: 5, target: 5 }] })] });
    const counter = document.querySelector<HTMLElement>(
      '.quest-objective[data-objective-id="obj-1"] .quest-objective__counter',
    )!;
    expect(counter.textContent).toBe("5/5");
  });

  it("shows the objective location for the map marker", () => {
    expect(document.body.textContent).toContain("Old Mill");
  });
});

describe("tracking and markers (task 128)", () => {
  it("fires onTrackQuest when the track toggle is pressed", () => {
    const toggle = document.querySelector<HTMLButtonElement>('[data-testid="quest-track-toggle"]')!;
    toggle.click();
    expect(callbacks.onTrackQuest).toHaveBeenCalledWith("quest-1");
  });

  it("fires onUntrackQuest when an already tracked quest is toggled", () => {
    log.update({ quests: [quest({ tracked: true })] });
    const toggle = document.querySelector<HTMLButtonElement>('[data-testid="quest-track-toggle"]')!;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    toggle.click();
    expect(callbacks.onUntrackQuest).toHaveBeenCalledWith("quest-1");
  });

  it("completed quests offer no tracking, so their markers clear on completion", () => {
    tabButton("completed").click();
    expect(document.querySelector('[data-testid="quest-track-toggle"]')).toBeNull();
  });
});

describe("rewards preview before acceptance (task 129)", () => {
  it("the quest offer shows gold, XP and relations before the accept button", () => {
    const offer = createQuestOffer(quest(), { onAcceptQuest: () => {}, onDeclineQuest: () => {} });
    document.body.append(offer);
    expect(document.querySelector('[data-testid="quest-offer-rewards"]')?.textContent).toContain("120g");
    expect(document.querySelector('[data-testid="quest-offer-rewards"]')?.textContent).toContain("40");
    expect(document.querySelector('[data-testid="quest-offer-rewards"]')?.textContent).toContain("Miller guild");
  });

  it("accept fires onAcceptQuest with the quest id", () => {
    const offerCallbacks: QuestOfferCallbacks = { onAcceptQuest: vi.fn(), onDeclineQuest: vi.fn() };
    const offer = createQuestOffer(quest(), offerCallbacks);
    document.body.append(offer);
    document.querySelector<HTMLButtonElement>('[data-testid="quest-accept"]')!.click();
    expect(offerCallbacks.onAcceptQuest).toHaveBeenCalledWith("quest-1");
  });

  it("decline fires onDeclineQuest with the quest id", () => {
    const offerCallbacks: QuestOfferCallbacks = { onAcceptQuest: vi.fn(), onDeclineQuest: vi.fn() };
    const offer = createQuestOffer(quest(), offerCallbacks);
    document.body.append(offer);
    document.querySelector<HTMLButtonElement>('[data-testid="quest-decline"]')!.click();
    expect(offerCallbacks.onDeclineQuest).toHaveBeenCalledWith("quest-1");
  });

  it("the log quest card shows the rewards preview too", () => {
    const rewards = document.querySelector<HTMLElement>(".quest-card .quest-rewards");
    expect(rewards?.textContent).toContain("120g");
  });
});

describe("failure and expiry warnings (task 130)", () => {
  it(`a quest expiring within ${EXPIRY_WARNING_HOURS} hours gets a warning badge`, () => {
    log.update({ quests: [quest({ expiresInHours: 12 })] });
    const badge = document.querySelector('[data-testid="quest-expiry-warning"]')!;
    expect(badge.getAttribute("data-status")).toBe("warning");
    expect(badge.textContent).toContain("Expires in 12h");
    expect(expiryKind(quest({ expiresInHours: 12 }))).toBe("expiring");
  });

  it("an expired quest gets a critical chip", () => {
    log.update({ quests: [quest({ expiresInHours: 0 })] });
    const badge = document.querySelector('[data-testid="quest-expiry-warning"]')!;
    expect(badge.getAttribute("data-status")).toBe("critical");
    expect(badge.textContent).toContain("Expired");
  });

  it("a quest far from expiry gets no badge", () => {
    log.update({ quests: [quest({ expiresInHours: 200 })] });
    expect(document.querySelector('[data-testid="quest-expiry-warning"]')).toBeNull();
  });

  it("an at-risk quest gets a failure warning", () => {
    log.update({ quests: [quest({ atRisk: true })] });
    const warning = document.querySelector('[data-testid="quest-failure-warning"]')!;
    expect(warning.getAttribute("data-status")).toBe("critical");
    expect(warning.textContent).toContain("At risk of failing");
  });
});
