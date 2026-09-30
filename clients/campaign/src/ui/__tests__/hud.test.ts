/**
 * The HUD's own contract: the time dial, the resource bar, the party rail and the
 * notification tray.
 *
 * This is a separate file from `src/ui/__tests__/rendered.test.ts` on purpose. That
 * file walks every panel for banned copy and for accessible names; this one asserts
 * how the HUD's controls behave and are shaped, which is a different question and
 * would only slow the copy sweep down.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHud, dataSourcePanel, type HudState, TIME_POSITIONS } from "../hud.js";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import type { SimSnapshot } from "../../data/types.js";

let snapshot: SimSnapshot;

function hudAt(overrides: Partial<HudState> = {}): HTMLElement {
  const noop = (): void => {};
  const hud = createHud({
    onSelectPanel: noop,
    onTimeScale: noop,
    onOpenDataSource: noop,
    onOpenUiScale: noop,
    onNotification: noop,
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
    ...overrides,
  });
  return hud.root;
}

beforeAll(async () => {
  snapshot = await createFixtureSimulationProvider().getSnapshot();
});

describe("the time dial (ART_DIRECTION.md section 6.8)", () => {
  it("is a radio group of three detents, not a row of independent toggles", () => {
    const dial = hudAt().querySelector("[data-testid='time-dial']")!;
    expect(dial.getAttribute("role")).toBe("radiogroup");
    expect(dial.getAttribute("aria-label")).toBe("Time controls");
    const radios = Array.from(dial.querySelectorAll("[role='radio']"));
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute("data-testid"))).toEqual(["time-0", "time-1", "time-3"]);
  });

  it("checks exactly one detent, and marks it checked for assistive tech", () => {
    for (const scale of [0, 1, 3]) {
      const dial = hudAt({ timeScale: scale }).querySelector("[data-testid='time-dial']")!;
      const checked = Array.from(dial.querySelectorAll("[role='radio']")).filter(
        (r) => r.getAttribute("aria-checked") === "true",
      );
      expect(checked, `time scale ${scale} has ${checked.length} checked detents`).toHaveLength(1);
      expect(checked[0]!.getAttribute("data-testid")).toBe(`time-${scale}`);
    }
  });

  it("is one stop in the tab order, not three, the way a knob is", () => {
    // A roving tabindex: the dial takes focus once and the arrow keys move within it.
    const dial = hudAt({ timeScale: 1 }).querySelector("[data-testid='time-dial']")!;
    const tabbable = Array.from(dial.querySelectorAll("[role='radio']")).filter(
      (r) => r.getAttribute("tabindex") === "0",
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]!.getAttribute("data-testid")).toBe("time-1");
  });

  it("moves between detents with the arrow keys, and reports the new scale", () => {
    const onTimeScale = vi.fn();
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale,
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
    const dial = hud.root.querySelector("[data-testid='time-dial']")!;
    dial.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(onTimeScale).toHaveBeenCalledWith(1);
    dial.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(onTimeScale).toHaveBeenCalledWith(3);
  });

  it("does not run off either end of the arc", () => {
    const onTimeScale = vi.fn();
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale,
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
    const dial = hud.root.querySelector("[data-testid='time-dial']")!;
    dial.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    dial.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(onTimeScale).not.toHaveBeenCalled();
  });

  it("draws the face as a pointer and three detent ticks, all hidden from a reader", () => {
    const dial = hudAt({ timeScale: 3 }).querySelector("[data-testid='time-dial']")!;
    const face = dial.querySelector(".dial__face")!;
    expect(face.getAttribute("aria-hidden"), "the drawing must not be read as content").toBe("true");
    expect(dial.querySelector(".dial__pointer"), "the dial has no pointer").not.toBeNull();
    const detents = Array.from(face.querySelectorAll(".dial__detent"));
    expect(detents).toHaveLength(3);
    expect(detents.filter((d) => d.getAttribute("data-on") === "true")).toHaveLength(1);
    // The pointer angle is CSS, keyed off the position, so the drawing and the checked
    // radio can never disagree about which detent is live.
    expect(dial.getAttribute("data-position")).toBe("fast");
    expect(detents.filter((d) => d.getAttribute("data-on") === "true")[0]!.getAttribute("data-detent")).toBe("fast");
  });

  it("prints a typed label beside every glyph, so no detent is icon-only", () => {
    for (const detent of TIME_POSITIONS) {
      const btn = hudAt().querySelector(`[data-testid='time-${detent.scale}']`)!;
      const label = btn.querySelector(".dial__label")!.textContent ?? "";
      expect(label.toUpperCase(), `time-${detent.scale} has no typed label`).toBe(detent.label.toUpperCase());
      expect(btn.querySelector(".dial__glyph"), `time-${detent.scale} has no glyph`).not.toBeNull();
      // WCAG 2.5.3: the accessible name has to contain the visible label.
      expect(btn.getAttribute("aria-label")?.toLowerCase()).toContain(detent.label.toLowerCase());
    }
  });

  it("names every detent button, so each one is reachable and announced", () => {
    const dial = hudAt().querySelector("[data-testid='time-dial']")!;
    for (const radio of Array.from(dial.querySelectorAll("[role='radio']"))) {
      expect(radio.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
      expect(radio.getAttribute("title")?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("the text-size setting (ART_DIRECTION.md section 12)", () => {
  it("offers exactly the four scales the direction names", () => {
    const select = hudAt().querySelector<HTMLSelectElement>("[data-testid='ui-scale']")!;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["90", "100", "115", "130"]);
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["90%", "100%", "115%", "130%"]);
  });

  it("has a real label and an accessible name, so it is not a mystery box", () => {
    const select = hudAt().querySelector<HTMLSelectElement>("[data-testid='ui-scale']")!;
    const label = hudAt().querySelector(`label[for='${select.id}']`);
    expect(label, "the text-size field has no <label>").not.toBeNull();
    expect(label!.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(select.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
  });

  it("shows the setting that is actually in force", () => {
    // It reads the root element rather than keeping its own copy, so it cannot
    // disagree with what the entry point applied at boot.
    document.documentElement.setAttribute("data-ui-scale", "115");
    try {
      const select = hudAt().querySelector<HTMLSelectElement>("[data-testid='ui-scale']")!;
      expect(select.value).toBe("115");
    } finally {
      document.documentElement.removeAttribute("data-ui-scale");
    }
  });

  it("reports a change through the entry point's own hook", () => {
    const onOpenUiScale = vi.fn();
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale,
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
    const select = hud.root.querySelector<HTMLSelectElement>("[data-testid='ui-scale']")!;
    select.value = "130";
    select.dispatchEvent(new Event("change"));
    expect(onOpenUiScale).toHaveBeenCalledWith(130);
  });

  it("falls back to 100 percent for a size it does not recognise", () => {
    document.documentElement.setAttribute("data-ui-scale", "250");
    try {
      const select = hudAt().querySelector<HTMLSelectElement>("[data-testid='ui-scale']")!;
      expect(select.value).toBe("100");
    } finally {
      document.documentElement.removeAttribute("data-ui-scale");
    }
  });
});

describe("the top resource bar", () => {
  it("sets every figure in mono, on the type-data-lg step", () => {
    const top = hudAt();
    for (const id of ["money", "gold", "food", "metal", "medicine"]) {
      const figure = top.querySelector(`[data-testid='res-${id}'] .res__figure`)!;
      expect(figure.classList.contains("data-lg"), `${id} is not on the data-lg step`).toBe(true);
      // The mono class is the only thing that guarantees tabular figures here.
      expect(figure.classList.contains("data-lg")).toBe(true);
    }
  });

  it("types the keys in mono, uppercase and widely tracked", () => {
    for (const key of Array.from(hudAt().querySelectorAll(".res__key"))) {
      expect(key.classList.contains("data-sm"), "a resource key is not on the data-sm step").toBe(true);
    }
  });

  it("never prints a bare figure without saying what it is", () => {
    for (const res of Array.from(hudAt().querySelectorAll(".res"))) {
      const title = res.getAttribute("title");
      expect(title?.length ?? 0, "a resource has no tooltip").toBeGreaterThan(0);
    }
  });

  it("reads a spent resource as spent rather than as zero days left", () => {
    // `daysRemaining` is null once the resource is gone, which is a different fact
    // from "ends at midnight", and printing 0.0 would read as "fine until tonight".
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    hud.renderState({
      snapshot,
      warnings: [
        {
          id: "w1",
          resource: "food",
          severity: "critical",
          headline: "Grain runs out",
          detail: "The party eats faster than the column brings in.",
          daysRemaining: null,
          entityId: "party-1",
          field: "food",
        },
      ],
      context: null,
      loading: false,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 0,
      selectionName: "",
    });
    const note = hud.root.querySelector("[data-testid='res-note-food']")!;
    expect(note.textContent).toBe("spent");
    expect(note.textContent).not.toMatch(/0\.0 days/);
  });

  it("gives each resource its own direction rather than one arrow for the bar", () => {
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    const diverging: SimSnapshot = {
      ...snapshot,
      ledger: { ...snapshot.ledger, netPerDay: { money: 40, food: -12 } },
    };
    hud.renderState({
      snapshot: diverging,
      warnings: [],
      context: null,
      loading: false,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 4.2,
      selectionName: "",
    });
    const money = hud.root.querySelector("[data-testid='res-money'] .res__trend")!;
    const food = hud.root.querySelector("[data-testid='res-food'] .res__trend")!;
    expect(money.getAttribute("data-trend")).toBe("up");
    expect(food.getAttribute("data-trend")).toBe("down");
  });
});

describe("the notification tray", () => {
  it("gives every notice a priority glyph, because colour alone cannot carry it", () => {
    const tray = hudAt().querySelector("[data-testid='notifications']")!;
    for (const notice of Array.from(tray.querySelectorAll(".notice"))) {
      const priority = notice.getAttribute("data-priority")!;
      const glyph = notice.querySelector(".notice__priority");
      expect(glyph, `a ${priority} notice has no glyph`).not.toBeNull();
      expect(glyph!.getAttribute("data-priority")).toBe(priority);
      expect(glyph!.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it("says the priority in words as well as in shape", () => {
    const tray = hudAt().querySelector("[data-testid='notifications']")!;
    for (const notice of Array.from(tray.querySelectorAll(".notice"))) {
      const text = notice.textContent ?? "";
      const priority = notice.getAttribute("data-priority")!;
      const word = priority === "critical" ? "Critical" : priority === "important" ? "Important" : "For information";
      expect(text, `a ${priority} notice does not name its priority`).toContain(word);
    }
  });

  it("only makes a notice a button when there is somewhere to go", () => {
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    hud.renderState({
      snapshot,
      warnings: [],
      context: null,
      loading: false,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 4.2,
      selectionName: "",
    });
    const tray = hud.root.querySelector("[data-testid='notifications']")!;
    for (const notice of Array.from(tray.querySelectorAll(".notice"))) {
      // Every notice in the fixture either has a target or does not; a control that
      // takes focus and does nothing when pressed must not exist.
      if (notice.tagName === "BUTTON") {
        expect(notice.querySelector("button, a")).toBeNull();
      }
    }
    // At least one notice in the fixture is plain text, so the rule is exercised.
    expect(tray.querySelectorAll("div.notice").length + tray.querySelectorAll("button.notice").length).toBeGreaterThan(0);
  });

  it("keeps a critical notice ahead of an informational one from the same day", () => {
    const day = snapshot.day;
    const withBoth: SimSnapshot = {
      ...snapshot,
      notifications: [
        { id: "n-info", day, priority: "informational", text: "A ledger line was written.", entityId: null, field: null },
        { id: "n-crit", day, priority: "critical", text: "A town has run out of grain.", entityId: "town-1", field: "foodStock" },
      ],
    };
    const tray = hudAt({ snapshot: withBoth }).querySelector("[data-testid='notifications']")!;
    const order = Array.from(tray.querySelectorAll(".notice")).map((n) => n.getAttribute("data-testid"));
    expect(order[0]).toBe("notice-n-crit");
  });

  it("stamps a critical notice, per the rubber-stamp motif", () => {
    const day = snapshot.day;
    const withCritical: SimSnapshot = {
      ...snapshot,
      notifications: [
        { id: "n-crit", day, priority: "critical", text: "A town has run out of grain.", entityId: "town-1", field: "foodStock" },
      ],
    };
    const tray = hudAt({ snapshot: withCritical }).querySelector("[data-testid='notifications']")!;
    const stamp = tray.querySelector(".stamp--critical");
    expect(stamp, "a critical notice carries no stamp").not.toBeNull();
    expect(stamp!.getAttribute("aria-hidden"), "the stamp duplicates the word beside it").toBe("true");
  });

  it("says so plainly when there is nothing to report", () => {
    const quiet: SimSnapshot = { ...snapshot, notifications: [] };
    const tray = hudAt({ snapshot: quiet }).querySelector("[data-testid='notifications']")!;
    expect(tray.textContent).toMatch(/nothing needs your attention/i);
  });
});

describe("the party rail", () => {
  it("shows the party, its grain in days, and the panels it can open", () => {
    const rail = hudAt().querySelector("[data-testid='party-rail']")!;
    expect(rail.textContent).toContain(snapshot.player.characterName);
    for (const id of ["open-party", "open-march", "open-ledger", "open-roster", "open-data-source"]) {
      const btn = hudAt().querySelector(`[data-testid='${id}']`);
      expect(btn, `the rail is missing ${id}`).not.toBeNull();
      expect(btn!.getAttribute("aria-label")?.length ?? (btn!.textContent ?? "").length).toBeGreaterThan(0);
    }
  });

  it("gives every rail control an accessible name", () => {
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
    for (const el of Array.from(hud.root.querySelectorAll("button"))) {
      const name = el.getAttribute("aria-label") ?? el.textContent ?? "";
      expect(name.trim().length, `<button data-testid="${el.dataset.testid ?? "?"}"> has no name`).toBeGreaterThan(0);
    }
  });

  it("keeps the keyboard where the player left it across a repaint", () => {
    // The clock ticks several times a second, and a repaint that removes the focused
    // element would drop focus before a keypress could complete.
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    const state: HudState = {
      snapshot,
      warnings: snapshot.warnings,
      context: null,
      loading: false,
      loadingShape: "town",
      timeScale: 0,
      partyDaysOfFood: 4.2,
      selectionName: "",
    };
    document.body.appendChild(hud.root);
    hud.renderState(state);
    const btn = hud.root.querySelector<HTMLElement>("[data-testid='open-ledger']")!;
    btn.focus();
    expect(document.activeElement).toBe(btn);
    hud.renderState({ ...state, timeScale: 1 });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("open-ledger");
    hud.root.remove();
  });
});

describe("player-visible copy in the HUD (CONSTITUTION.md section 3.3)", () => {
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
    /[A-Za-z]:\\|\/src\/|\.ts\b|\.mjs\b|\.json\b|npm run/,
  ];

  it("has no placeholder, developer or path text anywhere in the HUD", () => {
    const offenders: string[] = [];
    const walk = (node: Node): void => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          const text = child.textContent?.trim() ?? "";
          for (const pattern of BANNED) {
            if (text.length > 0 && pattern.test(text)) offenders.push(`${pattern} in "${text.slice(0, 80)}"`);
          }
        } else if (child.nodeType === 1) {
          walk(child);
        }
      }
    };
    walk(hudAt());
    expect(offenders, `banned copy in the HUD:\n${offenders.join("\n")}`).toHaveLength(0);
  });

  it("has no banned copy in the data-source panel either", () => {
    const panel = dataSourcePanel({
      summary: "Front Range, Colorado.",
      regionName: "Front Range",
      retrieved: "2026-09-30",
      providerLabel: "Live simulation",
      isFixture: true,
      connection: { state: "connected", detail: "", attempt: 0 },
      onClose: () => {},
      onRetry: () => {},
    });
    const offenders: string[] = [];
    for (const el of Array.from(panel.querySelectorAll("*"))) {
      for (const attr of ["title", "aria-label"]) {
        const value = el.getAttribute(attr) ?? "";
        for (const pattern of BANNED) {
          if (value.length > 0 && pattern.test(value)) offenders.push(`${attr}: ${value.slice(0, 80)}`);
        }
      }
    }
    expect(offenders, `banned copy in the data-source panel:\n${offenders.join("\n")}`).toHaveLength(0);
  });
});
