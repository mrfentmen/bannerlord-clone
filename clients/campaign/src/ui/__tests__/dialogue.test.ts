/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBarter,
  createDialogue,
  createPersuasion,
  portraitFor,
  type BarterCallbacks,
  type BarterState,
  type DialogueCallbacks,
  type DialogueNode,
  type PersuasionCallbacks,
  type PersuasionState,
} from "../dialogue.js";

function node(over: Partial<DialogueNode> = {}): DialogueNode {
  return {
    id: "n1",
    speaker: { name: "Blacksmith Mara", role: "Notable", factionName: "Iron Hogs" },
    text: "You again. What do you want?",
    options: [
      { id: "o1", label: "We need steel.", nextNodeId: "n2" },
      { id: "o2", label: "Convince her.", nextNodeId: "n3", opens: "persuade", hint: "[Persuade]" },
      { id: "o3", label: "Let's trade.", nextNodeId: "n4", opens: "barter", hint: "[Barter]" },
    ],
    ...over,
  };
}

function callbacks(over: Partial<DialogueCallbacks> = {}): DialogueCallbacks {
  return {
    onSelectOption: vi.fn(async (_nodeId: string, _optId: string) => node({ id: "n2", text: "Fine." })),
    ...over,
  };
}

describe("portraitFor", () => {
  it("uses an explicit portraitUrl when given", () => {
    expect(portraitFor("Anyone", "/custom.png")).toBe("/custom.png");
  });

  it("maps names stably onto the four staged portraits", () => {
    const first = portraitFor("Blacksmith Mara");
    expect(portraitFor("Blacksmith Mara")).toBe(first);
    expect(first).toMatch(/^\/images\/portraits\/(rifleman_black|rifleman_latina|medic_asian|gunner_white)\.jpg$/);
  });
});

describe("dialogue UI (task 131)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders speaker, portrait, text, and options from the sim graph", () => {
    const handle = createDialogue(node(), callbacks());
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector(".dialogue__name")?.textContent).toBe("Blacksmith Mara");
    const img = handle.root.querySelector<HTMLImageElement>(".dialogue__portrait");
    expect(img?.src).toContain("/images/portraits/");
    expect(img?.alt).toBe("Portrait of Blacksmith Mara");
    expect(handle.root.querySelector(".dialogue__text")?.textContent).toBe("You again. What do you want?");
    expect(handle.root.querySelectorAll('[data-testid^="dialogue-option-"]').length).toBe(3);
  });

  it("advances the graph through onSelectOption and renders the next node", async () => {
    const onSelectOption = vi.fn(async (_n: string, _o: string) => node({ id: "n2", text: "Steel it is." }));
    const handle = createDialogue(node(), callbacks({ onSelectOption }));
    document.body.appendChild(handle.root);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="dialogue-option-o1"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onSelectOption).toHaveBeenCalledWith("n1", "o1");
    expect(handle.root.querySelector(".dialogue__text")?.textContent).toBe("Steel it is.");
  });

  it("shows the Leave button on end nodes", () => {
    const handle = createDialogue(node({ options: [] }), callbacks());
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector('[data-testid="dialogue-leave"]')).not.toBeNull();
  });

  it("showNode re-renders with fresh sim state", () => {
    const handle = createDialogue(node(), callbacks());
    document.body.appendChild(handle.root);
    handle.showNode(node({ id: "n9", text: "A different day." }));
    expect(handle.root.querySelector(".dialogue__text")?.textContent).toBe("A different day.");
  });
});

describe("relation delta (task 133)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the delta chip inside the dialog", () => {
    const handle = createDialogue(node({ options: [] }), callbacks());
    document.body.appendChild(handle.root);
    handle.showRelationDelta("Blacksmith Mara", 12);
    const chip = handle.root.querySelector('[data-testid="dialogue-relation-delta"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("Blacksmith Mara");
    expect(chip?.getAttribute("aria-label")).toContain("+12");
  });

  it("renders negative deltas with the critical chip", () => {
    const handle = createDialogue(node({ options: [] }), callbacks());
    document.body.appendChild(handle.root);
    handle.showRelationDelta("Iron Hogs", -8);
    const chip = handle.root.querySelector('[data-testid="dialogue-relation-delta"]');
    expect(chip?.getAttribute("data-status")).toBe("critical");
    expect(chip?.getAttribute("aria-label")).toContain("-8");
  });
});

describe("persuasion minigame (task 132)", () => {
  const pstate: PersuasionState = {
    points: 10,
    progress: 0,
    target: 100,
    arguments: [
      { id: "a1", label: "Appeal to profit", cost: 4 },
      { id: "a2", label: "Remind of debts", cost: 6 },
    ],
  };

  function pcb(over: Partial<PersuasionCallbacks> = {}): PersuasionCallbacks {
    return {
      onMakeArgument: vi.fn(async (id: string) => ({
        done: false,
        success: false,
        progress: id === "a1" ? 40 : 70,
        points: id === "a1" ? 6 : 4,
        message: "She considers it.",
      })),
      onConcede: vi.fn(),
      ...over,
    };
  }

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows points, a progress bar with sim values, and argument buttons", () => {
    const handle = createPersuasion(pstate, pcb());
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector('[data-testid="persuasion-points"]')?.textContent).toContain("10");
    const bar = handle.root.querySelector('[data-testid="persuasion-progress"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("0");
    expect(bar?.getAttribute("aria-valuemax")).toBe("100");
    expect(handle.root.querySelectorAll('[data-testid^="persuasion-arg-"]').length).toBe(2);
  });

  it("disables arguments that cost more points than the player has", () => {
    const handle = createPersuasion({ ...pstate, points: 3 }, pcb());
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector<HTMLButtonElement>('[data-testid="persuasion-arg-a1"]')!.disabled).toBe(true);
  });

  it("spends points and moves the bar from the sim result", async () => {
    const handle = createPersuasion(pstate, pcb());
    document.body.appendChild(handle.root);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="persuasion-arg-a1"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.root.querySelector('[data-testid="persuasion-points"]')?.textContent).toContain("6");
    expect(handle.root.querySelector('[data-testid="persuasion-progress"]')?.getAttribute("aria-valuenow")).toBe("40");
  });

  it("shows the sim's success/fail result when done", async () => {
    const onMakeArgument = vi.fn(async () => ({
      done: true,
      success: true,
      progress: 100,
      points: 2,
      message: "She agrees to the deal.",
    }));
    const handle = createPersuasion(pstate, pcb({ onMakeArgument }));
    document.body.appendChild(handle.root);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="persuasion-arg-a1"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.root.querySelector('[data-testid="persuasion-result"]')?.textContent).toBe("She agrees to the deal.");
  });
});

describe("barter sub-screen (task 134)", () => {
  const bstate: BarterState = {
    notableName: "Blacksmith Mara",
    playerGold: 500,
    playerGoods: [
      { id: "g1", name: "Iron ingots", price: 120, qty: 3 },
      { id: "g2", name: "Salt", price: 40, qty: 5 },
    ],
    notableGoods: [{ id: "n1", name: "Steel sword", price: 300, qty: 1 }],
  };

  function bcb(over: Partial<BarterCallbacks> = {}): BarterCallbacks {
    return {
      onMakeOffer: vi.fn(async () => ({ accepted: true, message: "Deal. The sword is yours." })),
      onDone: vi.fn(),
      ...over,
    };
  }

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows gold, the notable's goods, and the player's goods", () => {
    const handle = createBarter(bstate, bcb());
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector('[data-testid="barter-gold-have"]')?.textContent).toContain("500");
    expect(handle.root.textContent).toContain("Steel sword");
    expect(handle.root.textContent).toContain("Iron ingots");
  });

  it("the offer total reflects gold slider plus selected goods", () => {
    const handle = createBarter(bstate, bcb());
    document.body.appendChild(handle.root);
    const slider = handle.root.querySelector<HTMLInputElement>('[data-testid="barter-gold"]')!;
    slider.value = "200";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    handle.root.querySelector<HTMLButtonElement>('[data-testid="barter-good-g1"]')!.click();
    expect(handle.root.querySelector('[data-testid="barter-total"]')?.textContent).toContain("320g");
  });

  it("shows the sim's accept/refuse before dismissal", async () => {
    const onMakeOffer = vi.fn(async () => ({ accepted: false, message: "Not enough. Come back richer." }));
    const handle = createBarter(bstate, bcb({ onMakeOffer }));
    document.body.appendChild(handle.root);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="barter-offer"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onMakeOffer).toHaveBeenCalledWith({ gold: 0, itemIds: [] });
    expect(handle.root.querySelector('[data-testid="barter-result"]')?.textContent).toBe("Not enough. Come back richer.");
  });
});
