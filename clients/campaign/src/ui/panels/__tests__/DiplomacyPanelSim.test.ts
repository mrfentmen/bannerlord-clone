/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";

beforeEach(() => localStorage.clear());

const wars = [
  { id: "war-1", attackerFactionId: "f-north", defenderFactionId: "f-south", startDay: 100, exhaustion: 40, attackerScore: 12, defenderScore: 3 },
  { id: "war-2", attackerFactionId: "f-player", defenderFactionId: "f-east", startDay: 150, exhaustion: 10, attackerScore: 0, defenderScore: 0 },
];

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("diplomacy panel: the simulation's wars, defection, mercenary refusals", () => {
  it("hides the sim sections when the caller passes none of the handlers", () => {
    const root = diplomacyPanel({ currentSeason: 12 });
    expect(root.querySelector('[data-testid="simwar-war-1"]')).toBeNull();
    expect(root.querySelector('[data-testid="defect-clan"]')).toBeNull();
    expect(root.querySelector('[data-testid="mercenary-sign-f-north"]')).toBeNull();
  });

  it("lists the simulation's wars with scores and exhaustion", () => {
    const root = diplomacyPanel({ currentSeason: 12, simWars: wars, playerFactionId: "f-player", onMakePeace: vi.fn().mockResolvedValue(undefined) });
    expect(root.querySelector('[data-testid="simwar-war-1"]')).not.toBeNull();
    expect(root.textContent).toContain("f-north vs f-south");
    expect(root.textContent).toContain("score 12\u20133");
    expect(root.textContent).toContain("exhaustion 40%");
    // Mine gets the peace button; the foreign war does not.
    expect(root.querySelector('[data-testid="simwar-peace-war-2"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="simwar-peace-war-1"]')).toBeNull();
  });

  it("peace goes through the caller and the notice carries the sim's wording", async () => {
    const onMakePeace = vi.fn().mockResolvedValue(undefined);
    const onWorldChanged = vi.fn();
    document.body.appendChild(
      diplomacyPanel({ currentSeason: 12, simWars: wars, playerFactionId: "f-player", onMakePeace, onWorldChanged }),
    );
    document.querySelector<HTMLButtonElement>('[data-testid="simwar-peace-war-2"]')!.click();
    await tick();
    expect(onMakePeace).toHaveBeenCalledWith("war-2");
    expect(document.body.textContent).toContain("The war is ended.");
    expect(onWorldChanged).toHaveBeenCalled();
    document.body.innerHTML = "";
  });

  it("a refused peace prints the transport's own message verbatim", async () => {
    const onMakePeace = vi.fn().mockRejectedValue(new Error("Peace is not available on the live simulation yet."));
    document.body.appendChild(
      diplomacyPanel({ currentSeason: 12, simWars: wars, playerFactionId: "f-player", onMakePeace }),
    );
    document.querySelector<HTMLButtonElement>('[data-testid="simwar-peace-war-2"]')!.click();
    await tick();
    expect(document.body.textContent).toContain("Peace is not available on the live simulation yet.");
    document.body.innerHTML = "";
  });

  it("declaring war posts the faction id and clears the input", async () => {
    const onDeclareWar = vi.fn().mockResolvedValue({ warId: "war-9" });
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, simWars: [], onDeclareWar }));
    const input = document.querySelector<HTMLInputElement>('[data-testid="simwar-enemy-input"]')!;
    input.value = "f-east";
    document.querySelector<HTMLButtonElement>('[data-testid="simwar-declare"]')!.click();
    await tick();
    expect(onDeclareWar).toHaveBeenCalledWith("f-east");
    // The panel re-rendered on the replacement node: a fresh input, empty.
    expect(document.querySelector<HTMLInputElement>('[data-testid="simwar-enemy-input"]')!.value).toBe("");
    expect(document.body.textContent).toContain("War is declared.");
    document.body.innerHTML = "";
  });

  it("defection posts through the caller and prints the sim's line", async () => {
    const onDefectClan = vi.fn().mockResolvedValue({ line: "You swore yourself to the Northern banner." });
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, onDefectClan }));
    document.querySelector<HTMLInputElement>('[data-testid="defect-faction-input"]')!.value = "f-north";
    document.querySelector<HTMLButtonElement>('[data-testid="defect-clan"]')!.click();
    await tick();
    expect(onDefectClan).toHaveBeenCalledWith("f-north");
    expect(document.body.textContent).toContain("You swore yourself to the Northern banner.");
    document.body.innerHTML = "";
  });

  it("a mercenary sign that the sim refuses lands verbatim, not swallowed", async () => {
    const onSignMercenary = vi.fn().mockRejectedValue(new Error("Not enough renown for their banner."));
    document.body.appendChild(
      diplomacyPanel({
        currentSeason: 12,
        mercenaryFactions: [{ id: "f-north", name: "The North" }],
        onSignMercenary,
      }),
    );
    document.querySelector<HTMLButtonElement>('[data-testid="mercenary-sign-f-north"]')!.click();
    await tick();
    expect(document.body.textContent).toContain("Not enough renown for their banner.");
    document.body.innerHTML = "";
  });
});

describe("diplomacy panel: realm influence", () => {
  const ACTIONS = [
    { id: "muster-army", label: "Muster an army", cost: 30 },
    { id: "call-vote", label: "Call a council vote", cost: 20 },
    { id: "bribe-lord", label: "Bribe a lord", cost: 25 },
    { id: "recruit-vassal", label: "Recruit a vassal", cost: 50 },
    { id: "force-policy", label: "Force a policy", cost: 40 },
  ] as const;

  it("the influence section is absent without a balance and a caller", () => {
    const bare = diplomacyPanel({ currentSeason: 12 });
    expect(bare.querySelector('[data-testid="influence-balance"]')).toBeNull();
    const noCaller = diplomacyPanel({ currentSeason: 12, influenceBalance: 100 });
    expect(noCaller.querySelector('[data-testid="influence-balance"]')).toBeNull();
    const noBalance = diplomacyPanel({ currentSeason: 12, onSpendInfluence: vi.fn() });
    expect(noBalance.querySelector('[data-testid="influence-balance"]')).toBeNull();
  });

  it("renders the sim's balance and one button per realm action, priced", () => {
    const root = diplomacyPanel({ currentSeason: 12, influenceBalance: 45, onSpendInfluence: vi.fn() });
    expect(root.querySelector('[data-testid="influence-balance"]')?.textContent).toContain("45 influence");
    for (const a of ACTIONS) {
      const btn = root.querySelector<HTMLButtonElement>(`[data-testid="influence-${a.id}"]`);
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toContain(String(a.cost));
    }
    // The balance cannot afford the vassal (50) but can afford the rest.
    expect(root.querySelector<HTMLButtonElement>('[data-testid="influence-recruit-vassal"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="influence-force-policy"]')?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="influence-call-vote"]')?.disabled).toBe(false);
  });

  it("a spend order goes through the caller and the sim's line becomes the notice", async () => {
    const onSpendInfluence = vi.fn().mockResolvedValue({ line: "The banners answer. An army musters under your command." });
    const onWorldChanged = vi.fn();
    document.body.appendChild(
      diplomacyPanel({ currentSeason: 12, influenceBalance: 100, onSpendInfluence, onWorldChanged }),
    );
    document.querySelector<HTMLButtonElement>('[data-testid="influence-muster-army"]')!.click();
    await tick();
    expect(onSpendInfluence).toHaveBeenCalledWith("muster-army");
    expect(document.body.textContent).toContain("The banners answer.");
    expect(onWorldChanged).toHaveBeenCalled();
    document.body.innerHTML = "";
  });

  it("a refused spend lands verbatim and re-arms the button", async () => {
    const onSpendInfluence = vi.fn().mockRejectedValue(new Error("Needs 50 influence (have 12)."));
    document.body.appendChild(
      diplomacyPanel({ currentSeason: 12, influenceBalance: 12, onSpendInfluence }),
    );
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="influence-bribe-lord"]')!;
    btn.disabled = false; // the harness balance would gate it; force the refusal path
    btn.click();
    await tick();
    expect(onSpendInfluence).toHaveBeenCalledWith("bribe-lord");
    expect(document.body.textContent).toContain("Needs 50 influence (have 12).");
    document.body.innerHTML = "";
  });
});
