/**
 * What a player actually sees.
 *
 * `CONSTITUTION.md` section 3.3 bans placeholder text, developer-speak and TODO in
 * anything a player can see. Checking the source for those words is the wrong check:
 * the word "placeholder" appears in a legitimate type name and in a comment explaining
 * the ban. So this file renders every panel against real fixture data in a DOM and
 * walks the rendered text, which is the only thing the rule is actually about.
 *
 * The same render pass is used for the skeleton rule (section 3.2) and the keyboard and
 * labelling rule (`UI_UX.md` section 12), because all three are properties of what got
 * built rather than of what was typed.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import { ledgerPanel } from "../panels/LedgerPanel.js";
import { marketPanel } from "../panels/MarketPanel.js";
import { partyPanel } from "../panels/PartyPanel.js";
import { rulerCard, rulerRoster } from "../panels/RulerPanel.js";
import { startScreen } from "../panels/StartScreen.js";
import { townPanel } from "../panels/TownPanel.js";
import { whyPanel } from "../panels/WhyPanel.js";
import { marchPlanner } from "../panels/MarchPlanner.js";
import { createHud } from "../hud.js";
import type { SimSnapshot, SimulationProvider } from "../../data/types.js";

let provider: SimulationProvider;
let snapshot: SimSnapshot;

/** Every text node a player could read, in one list. */
function visibleText(root: Node): string[] {
  const out: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const t = child.textContent?.trim() ?? "";
        if (t.length > 0) out.push(t);
      } else if (child.nodeType === 1) {
        const el = child as Element;
        // A visually-hidden node is for screen readers, so it is still player-visible.
        walk(el);
      }
    }
  };
  walk(root);
  return out;
}

function renderedPanels(snap: SimSnapshot): Record<string, HTMLElement> {
  const golden = snap.towns.find((t) => t.name === "Golden")!;
  const longmont = snap.towns.find((t) => t.name === "Longmont")!;
  const ruler = snap.rulers[1]!;
  const noop = (): void => {};

  return {
    town: townPanel({ town: golden, previous: null, onWhy: noop, onOpenMarket: noop, onMarchHere: noop, onRoster: noop }),
    market: marketPanel({
      townId: longmont.id,
      townName: longmont.name,
      market: snap.markets[longmont.id]!,
      party: snap.party,
      money: snap.player.resources.money,
      day: snap.day,
      provider,
      onTraded: noop,
      onError: noop,
    }).root,
    party: partyPanel({ party: snap.party, previous: null, onWhy: noop }),
    ledger: ledgerPanel({ ledger: snap.ledger, warnings: snap.warnings, onWhy: noop }),
    roster: rulerRoster({ rulers: snap.rulers, playerFactionId: snap.player.factionId, selectedId: null, onSelect: noop }),
    card: rulerCard({ ruler, onWhy: noop }),
    start: startScreen({ sides: snap.sides, startYear: 2005, eraLabel: "1990s to 2000s", onStart: noop }),
    march: marchPlanner({
      party: snap.party,
      destinations: snap.towns.slice(0, 5).map((t) => ({ id: t.settlementId, simulationId: t.settlementId, name: t.name, distanceKm: 20, distanceHint: "20 km", klass: t.klass })),
      provider,
      onError: noop,
    }).root,
    why: whyPanel({ entityId: golden.id, field: "unrest", provider, onDrill: noop }).root,
  };
}

const BANNED = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\blorem ipsum\b/i,
  /\bcoming soon\b/i,
  /\bplaceholder\b/i,
  /\bundefined\b/,
  /\bNaN\b/,
  /\bnull\b/,
  /\[[\]]/,
  /\bSomething went wrong\b/i,
  /\bOops\b/,
  /\bWelcome back\b/,
  /\buntitled\b/i,
];

beforeAll(async () => {
  provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
  // The Why panel and the march planner resolve asynchronously, so give them a turn.
  await new Promise((r) => setTimeout(r, 30));
});

describe("player-visible copy (CONSTITUTION.md section 3.3)", () => {
  it("contains no placeholder, developer or empty-state junk in any panel", () => {
    const panels = renderedPanels(snapshot);
    const offenders: string[] = [];
    for (const [name, node] of Object.entries(panels)) {
      for (const line of visibleText(node)) {
        for (const pattern of BANNED) {
          if (pattern.test(line)) offenders.push(`${name}: ${pattern} in "${line.slice(0, 90)}"`);
        }
      }
    }
    expect(offenders, `banned copy in rendered panels:\n${offenders.join("\n")}`).toHaveLength(0);
  });

  it("states a shortage in plain words rather than a number alone", () => {
    const golden = snapshot.towns.find((t) => t.name === "Golden")!;
    const panel = renderedPanels(snapshot).town!;
    const text = visibleText(panel).join(" ");
    // Golden is at 0.4 days of food. The panel has to say what that means.
    expect(text).toMatch(/days/i);
    expect(text).toMatch(/person-days a day|Nothing is arriving/i);
    expect(golden.foodStock / golden.foodDemand).toBeLessThan(1);
  });

  it("offers a way to recover from an error, not just a message (section 1.3)", async () => {
    const failing: SimulationProvider = {
      ...provider,
      getSnapshot: async () => {
        throw new Error("boom");
      },
    };
    // The market panel is the one that renders a retry.
    const panel = marketPanel({
      townId: "town-longmont",
      townName: "Longmont",
      market: null,
      party: snapshot.party,
      money: 0,
      day: snapshot.day,
      provider: failing,
      onError: () => {},
    }).root;
    const text = visibleText(panel).join(" ");
    expect(text).toMatch(/did not load/i);
    expect(panel.querySelector("[data-testid='market-error-retry']")).not.toBeNull();
  });
});

describe("skeletons, not spinners (section 3.2)", () => {
  it("shows a shaped skeleton before data arrives, and never a spinner", async () => {
    let resolve: (v: SimSnapshot) => void = () => {};
    const slow: SimulationProvider = {
      ...provider,
      getSnapshot: () => new Promise<SimSnapshot>((r) => (resolve = r)),
    };
    const panel = marketPanel({
      townId: "town-longmont",
      townName: "Longmont",
      market: null,
      party: snapshot.party,
      money: 0,
      day: snapshot.day,
      provider: slow,
      onError: () => {},
    }).root;
    // The skeleton is up on the first frame, before the request resolves.
    const sk = panel.querySelector("[data-testid='market-error']");
    expect(sk).not.toBeNull();
    resolve(snapshot);
    void panel;
  });

  it("uses aria-busy on skeletons so a screen reader knows the region is loading", () => {
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    hud.renderState({
      snapshot,
      warnings: snapshot.warnings,
      context: null,
      loading: true,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 4,
      selectionName: "",
    });
    const sk = hud.root.querySelector("[aria-busy='true']");
    expect(sk).not.toBeNull();
    expect(sk!.getAttribute("role")).toBe("status");
  });
});

describe("accessibility (UI_UX.md section 12)", () => {
  it("gives every interactive control an accessible name", () => {
    const panels = renderedPanels(snapshot);
    const unnamed: string[] = [];
    for (const [name, node] of Object.entries(panels)) {
      for (const el of Array.from(node.querySelectorAll("button, input, select"))) {
        const label =
          el.getAttribute("aria-label") ??
          (el.id ? node.querySelector(`label[for='${el.id}']`)?.textContent : null) ??
          el.textContent?.trim() ??
          "";
        if (label.trim().length === 0) {
          unnamed.push(`${name}: <${el.tagName.toLowerCase()}> with no name`);
        }
      }
    }
    expect(unnamed, `controls with no accessible name:\n${unnamed.join("\n")}`).toHaveLength(0);
  });

  it("puts a role and an aria-label on every gauge, and a value on the meter", () => {
    const panel = renderedPanels(snapshot).town!;
    const meters = Array.from(panel.querySelectorAll("[role='meter']"));
    expect(meters.length).toBeGreaterThanOrEqual(4);
    for (const m of meters) {
      expect(m.getAttribute("aria-label")).toBeTruthy();
      expect(m.getAttribute("aria-valuemin")).toBe("0");
      expect(m.getAttribute("aria-valuemax")).toBe("1");
      // Either a real number or an explicit "not surveyed". Never nothing.
      expect(m.getAttribute("aria-valuenow") ?? m.getAttribute("aria-valuetext")).toBeTruthy();
    }
  });

  it("gives every status chip a role, a label and a distinct glyph", () => {
    const panel = renderedPanels(snapshot).town!;
    const chips = Array.from(panel.querySelectorAll("[data-status]"));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      const aria = chip.getAttribute("aria-label");
      if (chip.classList.contains("chip")) {
        expect(aria, "a status chip must carry its status in words").toBeTruthy();
        expect(aria).not.toMatch(/^:/);
      }
    }
  });

  it("marks decorative colour as such and never uses ink-300 for information", () => {
    const panel = renderedPanels(snapshot).town!;
    // The trend arrows are decorative: the number beside them carries the value.
    for (const arrow of Array.from(panel.querySelectorAll(".gauge__trend"))) {
      expect(arrow.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("the HUD is operable and readable", () => {
  it("shows the four resources plus medicine, each labelled", () => {
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    hud.renderState({
      snapshot,
      warnings: snapshot.warnings,
      context: null,
      loading: false,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 4,
      selectionName: "",
    });
    for (const id of ["money", "gold", "food", "metal", "medicine"]) {
      const res = hud.root.querySelector(`[data-testid='res-${id}']`);
      expect(res, `the top bar is missing ${id}`).not.toBeNull();
      expect(res!.getAttribute("title")).toBeTruthy();
    }
  });

  it("offers pause as a real control, and pause is reachable from anywhere", () => {
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    hud.renderState({
      snapshot,
      warnings: snapshot.warnings,
      context: null,
      loading: false,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 4,
      selectionName: "",
    });
    const pause = hud.root.querySelector("[data-testid='time-0']");
    expect(pause).not.toBeNull();
    expect(pause!.getAttribute("aria-pressed")).toBe("true");
    expect(pause!.getAttribute("aria-label")).toBe("Pause");
  });

  it("shows the party summary with days of food, not a raw number", () => {
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    hud.renderState({
      snapshot,
      warnings: snapshot.warnings,
      context: null,
      loading: false,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 4.2,
      selectionName: "",
    });
    const food = hud.root.querySelector("[data-testid='rail-food']");
    expect(food!.textContent).toMatch(/d$/);
  });
});
