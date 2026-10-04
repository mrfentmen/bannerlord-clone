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
