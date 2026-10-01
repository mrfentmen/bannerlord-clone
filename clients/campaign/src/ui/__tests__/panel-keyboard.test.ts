/**
 * The start screen and the march planner, driven from the keyboard.
 *
 * `paperwork.test.ts` already checks that every control in these two panels has a real
 * element, a real name, an explicit button type and nothing out of the tab order without a
 * role to explain it. What it cannot check is the thing a keyboard player actually runs
 * into, and what both panels do structurally: every step and every price is a full
 * re-render. A node that leaves the document takes the focus with it, `document.activeElement`
 * falls back to `<body>`, and the next `Tab` restarts the page from the top.
 *
 * So a panel here can pass every name, role and element assertion and still be unusable,
 * because the player loses their place on the very first choice they make. The tests below
 * drive both panels the way a player does — Tab along the tab order, press Enter, press
 * Escape, press the arrow keys — and after every press assert two things: that focus
 * landed where it was supposed to, and that it never fell out of the panel onto `<body>`.
 *
 * Two harness facts, because they are what makes this a keyboard test rather than a
 * `.click()` test with extra steps:
 *
 *  - **jsdom has no `Tab`.** It does not move focus, and a `keydown` it dispatches does not
 *    cause the browser's default action. So `pressTab` walks the tab order the panel
 *    actually exposes — every enabled control with a non-negative tab index, in document
 *    order — which is precisely the property under test, and `activate` presses Enter and
 *    then clicks, which is what a real `<button>` does with Enter.
 *  - **jsdom does not blur a focused node when it is removed.** It cannot catch a lost
 *    focus by accident, so every assertion below is written to fail on its own.
 *
 * `ui.css` is read from disk rather than imported because jsdom rewrites `import.meta.url`.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import { marchPlanner, type MarchPlannerHandle } from "../panels/MarchPlanner.js";
import { startScreen, startScreenError } from "../panels/StartScreen.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import type { SimSnapshot, SimulationProvider } from "../../data/types.js";

/** The component stylesheet, read from the project root. */
function uiCss(): string {
  return readFileSync(join(process.cwd(), "src", "ui", "ui.css"), "utf8");
}

/** The generated token stylesheet, where the focus ring itself is defined. */
function tokensCss(): string {
  return readFileSync(join(process.cwd(), "src", "design", "tokens.css"), "utf8");
}

let provider: SimulationProvider;
let snapshot: SimSnapshot;

const noop = (): void => {};

/** One turn of the event loop, which is all a fixture round trip and a `.focus()` need. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

function visibleText(root: Node): string {
  const out: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const t = child.textContent?.trim() ?? "";
        if (t.length > 0) out.push(t);
      } else if (child.nodeType === 1) {
        walk(child);
      }
    }
  };
  walk(root);
  return out.join(" ");
}

// -- the keyboard itself -------------------------------------------------------

/** The controls `Tab` reaches in a panel, in the order it reaches them. */
function tabOrder(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, select, input, a[href], [tabindex]")).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0,
  );
}

/** Every control the two panels draw, in document order, tabbable or not. */
function allControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, select, input, a[href], [tabindex]"));
}

/**
 * Moves focus one step along the tab order.
 *
 * The resume point is the *document position of whatever holds the focus*, not its place
 * in the tab list, because that is what a browser does and it is what makes focusing a
 * step region work: a `tabindex="-1"` region is not in the tab list at all, and a Tab
 * from it has to resume after it in the document or every step change dumps the player
 * back at the top of the step bar.
 *
 * The list wraps, which a real Tab does not. Tab off the end of a page leaves the page,
 * and a harness that could leave the panel could not assert that focus stayed inside it.
 */
function pressTab(root: HTMLElement, shift = false): HTMLElement {
  const all = allControls(root);
  const tabbable = tabOrder(root);
  const active = document.activeElement;
  const here = active instanceof HTMLElement ? all.indexOf(active) : -1;
  const ahead = tabbable.filter((el) => (shift ? all.indexOf(el) < here : all.indexOf(el) > here));
  const landed = shift ? ahead.reverse()[0] ?? tabbable[tabbable.length - 1] : ahead[0] ?? tabbable[0];
  expect(landed, "the panel has nothing to Tab to").toBeDefined();
  landed!.focus();
  return landed!;
}

/** Tabs until the named control has focus, so a walk starts from a known place. */
function tabTo(root: HTMLElement, wanted: string, limit = 60): HTMLElement {
  for (let i = 0; i < limit; i += 1) {
    if ((document.activeElement as HTMLElement | null)?.dataset?.testid === wanted) {
      return document.activeElement as HTMLElement;
    }
    pressTab(root);
  }
  throw new Error(`${wanted} is not in the tab order`);
}

/** A keydown, dispatched the way the browser delivers it. */
function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Enter on a control: the key, then the click a real button raises from it. */
function activate(el: HTMLElement): void {
  press(el, "Enter");
  (el as HTMLElement & { click(): void }).click();
}

/** Focus must be inside the panel and on this exact control, never dropped on `<body>`. */
function expectFocusHeldBy(root: HTMLElement, testId: string): void {
  const active = document.activeElement as HTMLElement | null;
  expect(root.contains(active), `focus fell out of the panel onto <${active?.tagName?.toLowerCase()}>`).toBe(true);
  expect(active?.dataset?.testid ?? active?.id, "focus is not on the control that was asked for").toBe(testId);
}

/** Mounts a panel, unmounting whatever was mounted before it. */
function mount(node: HTMLElement): HTMLElement {
  document.body.replaceChildren();
  document.body.appendChild(node);
  return node;
}

afterEach(() => {
  document.body.replaceChildren();
});

// -- the two panels, wired the way `main.ts` wires them --------------------------

type StartChoice = { sideId: string; stateCode: string; role: string };

function start(opts: { sides?: SimSnapshot["sides"]; onStart?: (c: StartChoice) => void } = {}): HTMLElement {
  return startScreen({
    sides: opts.sides ?? snapshot.sides,
    startYear: 2005,
    eraLabel: "1990s to 2000s",
    onStart: opts.onStart ?? noop,
  });
}

function destinations() {
  return snapshot.towns.map((t) => ({
    id: t.settlementId,
    simulationId: t.settlementId,
    name: t.name,
    distanceKm: 20,
    distanceHint: "20 km",
    klass: t.klass,
  }));
}

function march(opts: { onClose?: () => void; provider?: SimulationProvider } = {}): MarchPlannerHandle {
  return marchPlanner({
    party: snapshot.party,
    destinations: destinations(),
    provider: opts.provider ?? provider,
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
    onError: noop,
  });
}

/** A section that actually holds states, which the Wanderer does not. */
function sectionWithStates() {
  return snapshot.sides.find((s) => s.states.length > 0)!;
}

beforeAll(async () => {
  provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
});

// -- the start screen -----------------------------------------------------------

describe("the start screen, driven from the keyboard (UI_UX.md 12, ART_DIRECTION.md 12)", () => {
  it("opens with the keyboard on its own heading, and the heading is not a tab stop", async () => {
    const root = mount(start());
    await flush();
    // A screen that appears without taking focus leaves the keyboard wherever it was — on
    // the map canvas — and a screen reader says nothing about the screen at all.
    expectFocusHeldBy(root, "start-title");
    // `tabindex="-1"` is a focus target, not a stop the player has to Tab past.
    expect(tabOrder(root).some((el) => el.dataset.testid === "start-title")).toBe(false);
    const heading = document.activeElement as HTMLElement;
    expect(heading.tabIndex, "a focus target must be out of the tab sequence").toBe(-1);
  });

  it("Tab walks the step bar, then the side grid, then the way on — in that order", async () => {
    const root = mount(start());
    await flush();
    // The document order is the reading order: which step you are on, which sections are
    // on offer, and then the way forward.
    expect(tabOrder(root).map((el) => el.dataset.testid ?? el.id)).toEqual([
      "step-0",
      "step-1",
      "step-2",
      "step-3",
      ...snapshot.sides.map((s) => `side-${s.id}`),
      "start-next",
    ]);
    for (const id of ["step-0", "step-1", "step-2", "step-3", `side-${snapshot.sides[0]!.id}`, "start-next"]) {
      tabTo(root, id);
      expectFocusHeldBy(root, id);
    }
    // Shift+Tab walks back the way it came, and off the front it wraps to the end rather
    // than dropping the player on `<body>`, from which Tab would restart the page.
    const lastSide = snapshot.sides[snapshot.sides.length - 1]!.id;
    pressTab(root, true);
    expectFocusHeldBy(root, `side-${lastSide}`);
    tabTo(root, "step-0");
    pressTab(root, true);
    expectFocusHeldBy(root, "start-next");
  });

  it("Enter on a side card takes the side and leaves the keyboard on that card", async () => {
    const root = mount(start());
    await flush();
    const target = sectionWithStates();
    tabTo(root, `side-${target.id}`);
    activate(document.activeElement as HTMLElement);
    // The card is chosen and the keyboard is still on it. This is the whole bug: choosing
    // a side is a click that redraws the screen, and without the focus handed back, the
    // next Tab starts at the top of the page with the player seven cards further away.
    expectFocusHeldBy(root, `side-${target.id}`);
    expect(root.querySelector(`[data-testid='side-${target.id}']`)!.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelectorAll(".side[aria-pressed='true']").length).toBe(1);
  });

  it("arrow keys walk the side grid and choose as they go", async () => {
    const root = mount(start());
    await flush();
    const ids = snapshot.sides.map((s) => s.id);
    tabTo(root, `side-${ids[0]!}`);

    press(document.activeElement as HTMLElement, "ArrowRight");
    expectFocusHeldBy(root, `side-${ids[1]!}`);
    expect(root.querySelector(`[data-testid='side-${ids[1]!}']`)!.getAttribute("aria-pressed")).toBe("true");

    press(document.activeElement as HTMLElement, "ArrowLeft");
    expectFocusHeldBy(root, `side-${ids[0]!}`);

    press(document.activeElement as HTMLElement, "End");
    expectFocusHeldBy(root, `side-${ids[ids.length - 1]!}`);
    press(document.activeElement as HTMLElement, "Home");
    expectFocusHeldBy(root, `side-${ids[0]!}`);

    // No dead ends: forward off the last card wraps to the first, and back off the first
    // wraps to the last. A grid where the arrow stops is one nobody can learn the edges of.
    press(document.activeElement as HTMLElement, "ArrowLeft");
    expectFocusHeldBy(root, `side-${ids[ids.length - 1]!}`);
    press(document.activeElement as HTMLElement, "ArrowDown");
    expectFocusHeldBy(root, `side-${ids[0]!}`);
  });

  it("moves focus into the new step on every step change, so the change is announced", async () => {
    const root = mount(start());
    await flush();
    // Each step is a named region, so focusing it says what it is. An unnamed region
    // focused silently says nothing, which would leave the step change invisible to a
    // screen reader and obvious to everyone else.
    const region = (n: number) => root.querySelector<HTMLElement>(`[data-testid='start-step-${n}']`);
    expect(region(0), "the side step is not a region").not.toBeNull();
    expect(region(0)!.getAttribute("role")).toBe("region");
    expect(region(0)!.getAttribute("tabindex")).toBe("-1");
    const heading = root.querySelector<HTMLElement>(`#${region(0)!.getAttribute("aria-labelledby")}`)!;
    expect(heading.tagName).toBe("H2");
    expect(heading.textContent).toBe("Pick a side");

    // Onto the state step, by keyboard, from a section that holds states — the Wanderer
    // holds none, so its state step is answered with an explanation instead of a grid.
    const target = sectionWithStates();
    tabTo(root, `side-${target.id}`);
    activate(document.activeElement as HTMLElement);
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-1");
    expect(root.querySelector("[data-testid='state-grid']")).not.toBeNull();

    // And the next Tab is inside the new step, not back out at the step bar.
    expect(pressTab(root).dataset.testid).toMatch(/^state-/);
  });

  it("runs the whole flow to Start the campaign without the focus ever leaving the panel", async () => {
    const started: StartChoice[] = [];
    const root = mount(start({ onStart: (c) => started.push(c) }));
    await flush();
    const target = sectionWithStates();
    const from = snapshot.sides[0]!.id;
    const order = snapshot.sides.map((s) => s.id);
    const steps = (order.indexOf(target.id) - order.indexOf(from) + order.length) % order.length;

    // 1. Side. Arrow to the section being chosen, so the arrow path is in the walk too.
    tabTo(root, `side-${from}`);
    for (let i = 0; i < steps; i += 1) {
      press(document.activeElement as HTMLElement, "ArrowRight");
      expect(root.contains(document.activeElement), "focus fell out of the panel").toBe(true);
    }
    expectFocusHeldBy(root, `side-${target.id}`);

    // 2. State.
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-1");
    const stateCode = target.states[0]!.code;
    tabTo(root, `state-${stateCode}`);
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, `state-${stateCode}`);
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-2");

    // 3. Role. The screen opens on the first of the three, so one arrow moves off it.
    tabTo(root, "role-ruler-in-waiting");
    press(document.activeElement as HTMLElement, "ArrowRight");
    expectFocusHeldBy(root, "role-mercenary-captain");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "role-mercenary-captain");

    // 4. Confirm. The last press starts the campaign, which is what the whole walk is for.
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-3");
    expect(visibleText(root.querySelector(".start__summary")!)).toContain(target.name);

    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expect(started).toEqual([{ sideId: target.id, stateCode, role: "mercenary-captain" }]);
  });

  it("keeps a chosen role across a back-and-forward round trip, focus and all", async () => {
    const root = mount(start());
    await flush();
    const target = sectionWithStates();
    tabTo(root, `side-${target.id}`);
    activate(document.activeElement as HTMLElement);
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-1");
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-2");
    tabTo(root, "role-mercenary-captain");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "role-mercenary-captain");

    // Back out of the role step and forward again. `UI_UX.md` section 3: every step can
    // be navigated backwards without losing what was chosen.
    tabTo(root, "start-back");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-1");
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "start-step-2");
    expect(root.querySelector("[data-testid='role-mercenary-captain']")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("holds the keyboard inside the step when the player backs out of the role step", async () => {
    const root = mount(start());
    await flush();
    const target = sectionWithStates();
    tabTo(root, `side-${target.id}`);
    activate(document.activeElement as HTMLElement);
    for (const way of ["start-next", "start-next", "start-back"]) {
      tabTo(root, way);
      activate(document.activeElement as HTMLElement);
      expect(root.contains(document.activeElement), `focus fell out of the panel on ${way}`).toBe(true);
    }
    expectFocusHeldBy(root, "start-step-1");
    expect(root.querySelector("[data-testid='start-back']")).not.toBeNull();
  });

  it("does not close on Escape, because this screen is a flow and not a dialog", () => {
    const root = mount(start());
    // There is nothing behind this screen to go back to: `main.ts` removes it only when a
    // campaign starts. So Escape has nothing to do here, and the one thing it must not do
    // is throw the keyboard onto `<body>` on the way past. This is asserted rather than
    // assumed, because a panel that starts handling Escape has to keep handling it.
    const first = `side-${snapshot.sides[0]!.id}`;
    tabTo(root, first);
    press(document.activeElement as HTMLElement, "Escape");
    expectFocusHeldBy(root, first);
    expect(root.isConnected).toBe(true);
    expect(root.querySelector("[data-testid='side-grid']")).not.toBeNull();
  });

  it("keeps a shut step out of the tab order, and draws nothing behind it", () => {
    // A section holding no states has answered the state question, so every step opens and
    // none of them is a silent no-op.
    const bare = { ...snapshot.sides[0]!, states: [] };
    const root = mount(start({ sides: [bare] }));
    for (const n of [0, 1, 2, 3]) {
      expect(root.querySelector<HTMLButtonElement>(`[data-testid='step-${n}']`)!.disabled).toBe(false);
    }
    // With no sections at all, nothing past the first step opens, and a disabled button is
    // correctly absent from the tab order rather than focusable and inert. Nothing else is
    // drawn either: no half-built grid, no dead continue button.
    const empty = mount(start({ sides: [] }));
    expect(tabOrder(empty).map((el) => el.dataset.testid)).toEqual(["step-0"]);
    expect(empty.querySelectorAll("button").length).toBe(4);
    expect(empty.querySelectorAll("button:not([disabled])").length).toBe(1);
    expect(empty.querySelector("[data-testid='side-grid']")).toBeNull();
    expect(visibleText(empty.querySelector("[data-testid='empty-state']")!)).toMatch(/No sides were reported/i);
  });

  it("announces the failure screen on its heading, not on its retry button", async () => {
    const retried: string[] = [];
    const root = mount(startScreenError("ECONNREFUSED 127.0.0.1:8080", () => retried.push("again")));
    await flush();
    const active = document.activeElement as HTMLElement;
    expect(root.contains(active)).toBe(true);
    expect(active.tagName).toBe("H1");
    expect(active.textContent).toBe("The sections did not load");
    // Landing a keyboard on Try again would arm a retry nobody asked for. The retry is
    // still the first tab stop and still works from the keyboard.
    expect(pressTab(root).dataset.testid).toBe("start-error-retry");
    activate(document.activeElement as HTMLElement);
    expect(retried).toEqual(["again"]);
  });

  it("gives every control a real element, a name and a type, on every step", () => {
    const root = mount(start());
    const problems: string[] = [];
    const check = (scope: HTMLElement, label: string): void => {
      for (const el of Array.from(scope.querySelectorAll<HTMLElement>("button, select, input, a[href]"))) {
        if (!["BUTTON", "SELECT", "INPUT", "A"].includes(el.tagName)) {
          problems.push(`${label}: <${el.tagName.toLowerCase()}> is not focusable by default`);
        }
        const name =
          el.getAttribute("aria-label") ??
          (el.id ? scope.querySelector(`label[for='${el.id}']`)?.textContent : null) ??
          el.textContent ??
          "";
        if (name.trim().length === 0) problems.push(`${label}: ${el.dataset.testid} has no accessible name`);
        if (el.tagName === "BUTTON" && el.getAttribute("type") !== "button") {
          problems.push(`${label}: ${el.dataset.testid} has no explicit type`);
        }
      }
    };
    const target = sectionWithStates();
    // Each grid is a group of cards the arrow keys travel, and every card in it is still a
    // real button in the tab order: the arrows are an addition to Tab, not a replacement
    // for it, because a pressed button is what these cards are and what the copy says.
    // Counted per step, because a step redraws and the step before it is gone.
    expect(root.querySelectorAll("[data-testid='side-grid'] button").length).toBe(snapshot.sides.length);
    check(root, "side step");
    tabTo(root, `side-${target.id}`);
    activate(document.activeElement as HTMLElement);
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    check(root, "state step");
    expect(root.querySelectorAll("[data-testid='state-grid'] button").length).toBe(target.states.length);
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    check(root, "role step");
    expect(root.querySelectorAll("[data-testid='role-grid'] button").length).toBeGreaterThan(0);
    tabTo(root, "start-next");
    activate(document.activeElement as HTMLElement);
    check(root, "confirm step");
    expect(problems, problems.join("\n")).toHaveLength(0);
  });
});

// -- the march planner ----------------------------------------------------------

describe("the march planner, driven from the keyboard (UI_UX.md 12, ART_DIRECTION.md 12)", () => {
  it("names the panel as a region, so it can be listed and announced", async () => {
    const root = mount(march().root);
    await flush();
    // `kit.panel` gives the sheet an `h2` and no name, which leaves it an unnamed
    // `section`: a landmark a screen reader cannot list.
    expect(root.tagName).toBe("SECTION");
    expect(root.getAttribute("aria-label")).toBe("March planner");
  });

  it("reaches every control by Tab, in the order the panel is read", async () => {
    const root = mount(march().root);
    await flush();
    // The destination, then the single order action. Nothing is a div with a click
    // handler, and nothing is stranded behind the price.
    expect(tabOrder(root).map((el) => el.dataset.testid ?? el.id)).toEqual(["march-target", "march-commit"]);
  });

  it("keeps the keyboard on the destination field across a re-price, skeleton and all", async () => {
    const root = mount(march().root);
    await flush();
    const select = root.querySelector<HTMLSelectElement>("#march-target")!;
    tabTo(root, "march-target");
    expectFocusHeldBy(root, "march-target");

    // Re-point the destination the way the keyboard does, then wait for the price.
    const from = select.value;
    const to = snapshot.towns.find((t) => t.settlementId !== from)!.settlementId;
    select.value = to;
    select.dispatchEvent(new Event("change"));

    // Mid-flight: the skeleton is up and the field is still there, still holding the
    // keyboard. This is the first of the two renders that used to throw it away.
    expect(root.querySelector("[data-testid='march-skeleton']")).not.toBeNull();
    expectFocusHeldBy(root, "march-target");

    // Landed: the priced plan is on screen and the keyboard is still on the field that
    // caused it. Before the fix this was `<body>`, and Tab restarted the page.
    await flush();
    expect(root.querySelector("[data-testid='march-skeleton']")).toBeNull();
    expect(root.querySelector("[data-testid='march-commit']")).not.toBeNull();
    expectFocusHeldBy(root, "march-target");
    // And the player can keep working from there: Tab reaches the order button next.
    expect(pressTab(root).dataset.testid).toBe("march-commit");
  });

  it("keeps the keyboard off the order button while the price is on its way", async () => {
    const root = mount(march().root);
    await flush();
    // The panel takes focus for itself on open and keeps it through the fetch. Nothing in
    // the body is focused at any point in that fetch, so the re-render that ends it has
    // nothing to hand back and must not grab the order button — the one control in here
    // that spends money — as a consolation.
    expect(document.activeElement).toBe(root);
    expect(root.tabIndex, "the panel must be focusable without adding a tab stop").toBe(-1);
    // Tab from the panel resumes at the destination field, and then at the order button —
    // the reading order, and not a jump to the control that spends money.
    expect(pressTab(root).dataset.testid).toBe("march-target");
    expect(pressTab(root).dataset.testid).toBe("march-commit");
  });

  it("arms the order with Enter, hands the keyboard to the affirmative, and Escape backs it out", async () => {
    const closed: string[] = [];
    const root = mount(march({ onClose: () => closed.push("closed") }).root);
    await flush();

    tabTo(root, "march-commit");
    activate(document.activeElement as HTMLElement);
    // Focus goes to the order, not to "Change the plan": the dangerous default is the one
    // you do not mean.
    expectFocusHeldBy(root, "march-commit-confirm");
    expect(root.querySelector("[data-testid='march-bill']")).not.toBeNull();

    // Escape is the same escape hatch as the cancel button, and it happens on this press
    // rather than the one that closes the panel.
    press(document.activeElement as HTMLElement, "Escape");
    expect(closed, "Escape disarmed the order and also closed the panel").toHaveLength(0);
    expect(root.querySelector("[data-testid='march-bill']")).toBeNull();
    expectFocusHeldBy(root, "march-commit");

    // Arm it again and back out with the cancel button instead.
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "march-commit-confirm");
    tabTo(root, "march-cancel");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "march-commit");
  });

  it("closes on Escape when nothing is armed", async () => {
    const closed: string[] = [];
    const root = mount(march({ onClose: () => closed.push("closed") }).root);
    await flush();
    tabTo(root, "march-target");
    press(document.activeElement as HTMLElement, "Escape");
    expect(closed).toEqual(["closed"]);
  });

  it("leaves Escape to the host when it was not given a way to close", async () => {
    // `main.ts` mounts the planner with no `onClose` and closes it from its own global
    // Escape handler. Swallowing the key here would take that away and close nothing.
    const root = mount(march().root);
    await flush();
    tabTo(root, "march-target");
    const prevented: boolean[] = [];
    root.addEventListener("keydown", (ev) => prevented.push(ev.defaultPrevented));
    press(document.activeElement as HTMLElement, "Escape");
    expect(prevented).toEqual([false]);
    expect(root.isConnected).toBe(true);
  });

  it("gives the keyboard to the retry when the price cannot be had, and recovers from it", async () => {
    // The first price is refused and the second is not, so the retry is exercised as a
    // retry rather than as a second copy of the same failure.
    let attempts = 0;
    const flaky: SimulationProvider = {
      ...provider,
      planMarch: async (request) => {
        attempts += 1;
        if (attempts === 1) {
          throw new SimulationUnavailableError("the socket closed", "ECONNREFUSED 127.0.0.1:8080");
        }
        return provider.planMarch(request);
      },
    };
    const root = mount(march({ provider: flaky }).root);
    await flush();
    expect(root.querySelector("[data-testid='march-error']")).not.toBeNull();
    // The retry is the one action the failure state offers, and it is the safe default:
    // it asks for a price again, it does not give an order.
    expectFocusHeldBy(root, "march-error-retry");

    activate(document.activeElement as HTMLElement);
    await flush();
    expect(root.querySelector("[data-testid='march-error']")).toBeNull();
    expect(root.querySelector("[data-testid='march-commit']")).not.toBeNull();
    // The keyboard did not get left on a control that the recovered panel no longer has.
    expect(root.contains(document.activeElement)).toBe(true);
  });

  it("gives the keyboard to the retry when the order is refused, and keeps the plan", async () => {
    let refusals = 1;
    const flaky: SimulationProvider = {
      ...provider,
      commitMarch: async (request) => {
        if (refusals > 0) {
          refusals -= 1;
          throw new SimulationUnavailableError("the order was refused", "ECONNREFUSED 127.0.0.1:8080");
        }
        return provider.commitMarch(request);
      },
    };
    const root = mount(march({ provider: flaky }).root);
    await flush();
    tabTo(root, "march-commit");
    activate(document.activeElement as HTMLElement);
    expectFocusHeldBy(root, "march-commit-confirm");
    activate(document.activeElement as HTMLElement);
    await flush();

    expect(root.querySelector("[data-testid='march-commit-error']")).not.toBeNull();
    // The confirm button the player pressed is gone with the rest of the body. Focus goes
    // to the retry, which is the same order again and not a new one.
    expectFocusHeldBy(root, "march-commit-error-retry");
    activate(document.activeElement as HTMLElement);
    await flush();
    expect(root.querySelector("[data-testid='march-commit-error']")).toBeNull();
    expect(root.querySelector("[data-testid='march-commit']")).not.toBeNull();
  });

  it("parks the keyboard on the panel once the order has been given", async () => {
    const committed: string[] = [];
    const root = mount(march().root);
    await flush();
    tabTo(root, "march-commit");
    activate(document.activeElement as HTMLElement);
    const handle = marchPlanner({
      party: snapshot.party,
      destinations: destinations(),
      provider,
      onCommitted: (plan) => committed.push(plan.destinationName),
      onError: noop,
    });
    mount(handle.root);
    await flush();
    tabTo(handle.root, "march-commit");
    activate(document.activeElement as HTMLElement);
    activate(document.activeElement as HTMLElement);
    await flush();
    // The host replaces the panel the moment the order lands, and the node the keyboard
    // was on goes with it. Parking it on the panel is the best this file can do; the host
    // owns where it goes afterwards.
    expect(committed).toHaveLength(1);
    expect(document.activeElement).toBe(handle.root);
    expect(root.isConnected).toBe(false);
  });

  it("leaves the keyboard alone when there is nowhere to march", async () => {
    const handle = marchPlanner({ party: snapshot.party, destinations: [], provider, onError: noop });
    const root = mount(handle.root);
    await flush();
    expect(visibleText(root.querySelector("[data-testid='empty-state']")!)).toMatch(/Nowhere to march to/i);
    // No control in the body at all, so there is nothing to hand the keyboard to and
    // nothing to steal it with. The panel itself is the only sensible place it can be.
    expect(root.querySelectorAll("button").length).toBe(0);
    expect(tabOrder(root)).toHaveLength(0);
    expect(document.activeElement).toBe(root);
  });

  it("says the price out loud, because the keyboard stays on the destination field", async () => {
    const root = mount(march().root);
    await flush();
    const region = root.querySelector<HTMLElement>("[role='status']");
    expect(region, "the planner needs somewhere to announce a price").not.toBeNull();
    expect(region!.getAttribute("aria-live")).toBe("polite");
    // The announcement is the route, the time and the day it lands: what the panel is for.
    expect(region!.textContent).toMatch(/kilometres, \d+ days?, arriving day \d+/);
    expect(region!.textContent).toMatch(/grain/);
  });

  it("keeps the announced price out of the visible sheet", async () => {
    // The announcement lives on the panel, not in the body, so the next render — which
    // replaces the body wholesale — cannot wipe it, and so no re-price leaves a stale
    // figure on screen where a player can read it.
    const root = mount(march().root);
    await flush();
    const region = root.querySelector<HTMLElement>("[role='status']")!;
    expect(root.querySelector(".panel__body")!.contains(region)).toBe(false);
    expect(region.classList.contains("visually-hidden")).toBe(true);
  });
});

// -- the focus indicator --------------------------------------------------------

describe("the focus indicator survives the components it lands on (ART_DIRECTION.md 12)", () => {
  it("re-asserts the locked ring on every control these two panels put the keyboard on", () => {
    // `tokens.css` applies the ring with a bare `:focus-visible`, which is specificity
    // 0-1-0 and is imported *before* `ui.css`. A component rule that sets `box-shadow` at
    // that specificity wins on source order, and one at 0-2-0 wins outright — so a focused
    // control loses its ring and shows only its own shadow, which is the one thing a focus
    // indicator must never be mistaken for.
    //
    // The sweep is scoped to the classes these two panels put the keyboard on. It is a
    // check on this work, not on the whole stylesheet, which is shared with panels other
    // agents are working in — see the note in the hand-off about the ones this leaves.
    const css = uiCss();
    const controls = ["side", "state", "role", "step", "btn", "field__input"];
    const shadowed = controls.filter((cls) => new RegExp(`\\.${cls}[^{}]*\\{[^}]*box-shadow`).test(css));
    // These two are the ones that can beat the global rule, and both sit on a control this
    // work focuses: the side cards the start screen opens on, and the destination field
    // the march planner holds the keyboard on across a re-price.
    expect(shadowed).toContain("side");
    expect(shadowed).toContain("field__input");
    for (const cls of shadowed) {
      const ring = new RegExp(`\\.${cls}[^{}]*:focus-visible[^{}]*\\{[^}]*var\\(--focus-ring\\)`);
      expect(css, `.${cls} sets box-shadow but has no :focus-visible rule re-asserting the ring`).toMatch(ring);
    }
  });

  it("puts the ring behind the component's own shadow rather than in place of it", () => {
    // A side card is still a sheet of paper sitting on the table while it holds the
    // keyboard. Focalling it must not flatten it into a ring.
    const css = uiCss();
    expect(css).toMatch(/\.side:focus-visible\s*\{\s*box-shadow: var\(--sheet-0\), var\(--focus-ring\)/);
    expect(css).toMatch(/\.side\[aria-pressed="true"\]:focus-visible\s*\{\s*box-shadow: var\(--sheet-2\), var\(--focus-ring\)/);
    expect(css).toMatch(/\.field__input:focus-visible\s*\{\s*box-shadow: var\(--well-inset\), var\(--focus-ring\)/);
    // And the ring itself is the locked token, not a value invented in `ui.css`.
    expect(tokensCss()).toMatch(/--focus-ring: 0 0 0 2px #F2EDE1, 0 0 0 4px #2B4A6F/);
  });

  it("never removes an outline from a control without something in its place", () => {
    // The one `outline: none` in the client is the map canvas, and it is legal: the locked
    // `:focus-visible` ring is a `box-shadow`, so the canvas is still visibly focusable.
    // What would not be legal is an outline removed from a control with no replacement, so
    // the assertion is that every `outline: none` sits on a selector nothing else focuses
    // without a ring of its own.
    const css = uiCss();
    const selectors = [...css.matchAll(/([^{}]*)\{[^}]*outline:\s*none/g)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      const cls = /\.([a-z][\w-]*)/.exec(selector)?.[1] ?? "";
      // `.app__canvas` is covered by the global rule in `tokens.css`, asserted above. A
      // component rule that removed an outline would have to re-assert the ring itself, as
      // the focus block in this file does.
      expect(
        cls === "app__canvas" || new RegExp(`\\.${cls}:focus-visible`).test(css),
        `${selector} removes an outline with no focus indicator of its own`,
      ).toBe(true);
    }
  });
});
