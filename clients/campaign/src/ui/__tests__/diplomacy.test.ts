/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDiplomacyScreen,
  relationBar,
  type DiplomacyCallbacks,
  type DiplomacyFaction,
  type DiplomacyState,
} from "../diplomacy.js";

const iron: DiplomacyFaction = {
  id: "iron",
  name: "Iron Syndicate",
  isPlayerFaction: true,
  relation: 100,
  atWar: false,
  allied: false,
  truceDaysLeft: null,
};

const river: DiplomacyFaction = {
  id: "river",
  name: "River Kings",
  isPlayerFaction: false,
  relation: -30,
  atWar: false,
  allied: false,
  truceDaysLeft: null,
};

const hawk: DiplomacyFaction = {
  id: "hawk",
  name: "Hawk Company",
  isPlayerFaction: false,
  relation: -90,
  atWar: true,
  allied: false,
  truceDaysLeft: null,
};

const vale: DiplomacyFaction = {
  id: "vale",
  name: "Vale Accord",
  isPlayerFaction: false,
  relation: 60,
  atWar: false,
  allied: true,
  truceDaysLeft: null,
};

const baseState = (): DiplomacyState => ({
  day: 100,
  playerFactionId: "iron",
  factions: [iron, river, hawk, vale],
  treaties: [],
});

const baseCallbacks = (): DiplomacyCallbacks => ({
  fetchWarConsequences: vi.fn(async () => ({
    affectedTrade: ["East docks"],
    brokenTreaties: [],
    newEnemies: ["Vale Accord"],
  })),
  onDeclareWar: vi.fn(async () => {}),
  onProposePeace: vi.fn(async () => ({ accepted: true, reason: "They want peace.", tributeTaken: 200 })),
  fetchAllianceBenefits: vi.fn(async () => [
    { title: "Shared war", detail: "They join your wars." },
  ]),
  onProposeAlliance: vi.fn(async () => ({ accepted: false, reason: "They do not trust you yet." })),
  onDefect: vi.fn(async () => {}),
});

describe("relationBar", () => {
  it("renders the exact sim relation number in the label", () => {
    const bar = relationBar(river);
    expect(bar.textContent).toContain("-30");
  });

  it("names the relation band in the aria-label", () => {
    const bar = relationBar(river);
    expect(bar.querySelector(".diplomacy__bar")?.getAttribute("aria-label")).toContain("Hostile");
  });

  it("maps relation onto a 0-100 fill width", () => {
    const bar = relationBar(hawk);
    const fill = bar.querySelector(".diplomacy__bar-fill") as HTMLElement;
    expect(fill.style.width).toBe("5%"); // (-90 + 100) / 2
  });
});

describe("diplomacy list", () => {
  let handle: ReturnType<typeof createDiplomacyScreen>;
  let cb: DiplomacyCallbacks;

  beforeEach(() => {
    cb = baseCallbacks();
    handle = createDiplomacyScreen(baseState(), cb);
    document.body.appendChild(handle.root);
  });

  it("lists every faction with a relation bar", () => {
    for (const f of [iron, river, hawk, vale]) {
      expect(handle.root.querySelector(`[data-testid="diplomacy-relation-${f.id}"]`)).not.toBeNull();
    }
  });

  it("marks the at-war faction with a chip", () => {
    expect(handle.root.querySelector('[data-testid="diplomacy-war-hawk"]')).not.toBeNull();
  });

  it("marks the allied faction with a chip", () => {
    expect(handle.root.querySelector('[data-testid="diplomacy-allied-vale"]')).not.toBeNull();
  });
});

describe("declare war flow", () => {
  let handle: ReturnType<typeof createDiplomacyScreen>;
  let cb: DiplomacyCallbacks;

  beforeEach(() => {
    cb = baseCallbacks();
    handle = createDiplomacyScreen(baseState(), cb);
    document.body.appendChild(handle.root);
  });

  it("shows the consequences preview before declaring", async () => {
    (handle.root.querySelector('[data-testid="diplomacy-select-river"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="diplomacy-war-open"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const root = handle.root.textContent ?? "";
    expect(root).toContain("East docks");
    expect(root).toContain("Vale Accord");
    expect(cb.fetchWarConsequences).toHaveBeenCalledWith("river");
  });

  it("declares war only after the confirm button", async () => {
    (handle.root.querySelector('[data-testid="diplomacy-select-river"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="diplomacy-war-open"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(cb.onDeclareWar).not.toHaveBeenCalled();
    (handle.root.querySelector('[data-testid="diplomacy-war-confirm"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(cb.onDeclareWar).toHaveBeenCalledWith("river");
  });
});

describe("peace flow", () => {
  it("sends the tribute and shows the sim's reason", async () => {
    const cb = baseCallbacks();
    const handle = createDiplomacyScreen(baseState(), cb);
    document.body.appendChild(handle.root);
    (handle.root.querySelector('[data-testid="diplomacy-select-hawk"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="diplomacy-peace-open"]') as HTMLButtonElement).click();
    const slider = handle.root.querySelector("#diplomacy-tribute") as HTMLInputElement;
    slider.value = "400";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    (handle.root.querySelector('[data-testid="diplomacy-peace-send"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(cb.onProposePeace).toHaveBeenCalledWith("hawk", 400);
    const root = handle.root.textContent ?? "";
    expect(root).toContain("They want peace.");
    expect(root).toContain("200g");
  });

  it("shows the refusal reason when the sim refuses", async () => {
    const cb = baseCallbacks();
    cb.onProposePeace = vi.fn(async () => ({
      accepted: false,
      reason: "Your tribute insults them.",
      tributeTaken: 0,
    }));
    const handle = createDiplomacyScreen(baseState(), cb);
    document.body.appendChild(handle.root);
    (handle.root.querySelector('[data-testid="diplomacy-select-hawk"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="diplomacy-peace-open"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="diplomacy-peace-send"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.root.textContent).toContain("Your tribute insults them.");
  });
});

describe("alliance flow", () => {
  it("lists shared-war benefits from the sim before proposing", async () => {
    const cb = baseCallbacks();
    const handle = createDiplomacyScreen(baseState(), cb);
    document.body.appendChild(handle.root);
    (handle.root.querySelector('[data-testid="diplomacy-select-river"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="diplomacy-alliance-open"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const root = handle.root.textContent ?? "";
    expect(root).toContain("Shared war");
    expect(root).toContain("They join your wars.");
    expect(cb.fetchAllianceBenefits).toHaveBeenCalledWith("river");
  });
});

describe("defection flow", () => {
  it("calls onDefect with the player's faction and the chosen target", async () => {
    const cb = baseCallbacks();
    const handle = createDiplomacyScreen(baseState(), cb);
    document.body.appendChild(handle.root);
    (handle.root.querySelector('[data-testid="diplomacy-defect-open"]') as HTMLButtonElement).click();
    const select = handle.root.querySelector("#diplomacy-defect-target") as HTMLSelectElement;
    select.value = "vale";
    (handle.root.querySelector('[data-testid="diplomacy-defect-confirm"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(cb.onDefect).toHaveBeenCalledWith("iron", "vale");
  });
});

describe("treaties and truces", () => {
  it("warns on an expired truce", () => {
    const cb = baseCallbacks();
    const state = baseState();
    state.treaties = [
      { id: "t1", kind: "truce", withFactionId: "river", withFactionName: "River Kings", expiresDay: 90, expired: true },
    ];
    const handle = createDiplomacyScreen(state, cb);
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector('[data-testid="diplomacy-treaty-risk-t1"]')).not.toBeNull();
    expect(handle.root.textContent).toContain("at war risk");
  });

  it("shows days left on a soon-expiring truce", () => {
    const cb = baseCallbacks();
    const state = baseState();
    state.treaties = [
      { id: "t2", kind: "truce", withFactionId: "river", withFactionName: "River Kings", expiresDay: 103, expired: false },
    ];
    const handle = createDiplomacyScreen(state, cb);
    document.body.appendChild(handle.root);
    expect(handle.root.textContent).toContain("Expires in 3d");
  });

  it("update() re-renders every relation bar with fresh sim data", () => {
    const cb = baseCallbacks();
    const handle = createDiplomacyScreen(baseState(), cb);
    document.body.appendChild(handle.root);
    const next = baseState();
    next.factions = next.factions.map((f) => (f.id === "river" ? { ...f, relation: 40 } : f));
    handle.update(next);
    const bar = handle.root.querySelector('[data-testid="diplomacy-relation-river"]');
    expect(bar?.getAttribute("aria-label")).toContain("40");
    expect(bar?.getAttribute("aria-label")).toContain("Friendly");
  });
});
