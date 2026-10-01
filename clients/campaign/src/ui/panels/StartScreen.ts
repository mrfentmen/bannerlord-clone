/**
 * The new game flow: side, then state, then role, then confirm.
 * `UI_UX.md` section 3, `FACTIONS.md` sections 3, 4 and 7.
 *
 * The screen has one job beyond collecting three choices, and that job is to make the
 * trade explicit. `FACTIONS.md` section 7: "Choosing a side is choosing which problem
 * to have." So every side shows its ratings, its pros, its cons, and one plain sentence
 * about the problem you are choosing to have. The ratings are the values the simulation
 * computed from real data, not adjectives, and each rating is drawn as five pips with
 * the figure in mono beside them so a 3 of 5 is a number rather than a feeling.
 *
 * Three things `UI_UX.md` section 3 asks for are load-bearing:
 *
 *  - **Every step can be navigated backwards.** The step bar is a row of real buttons,
 *    not a progress indicator, and a step already answered stays reachable after the
 *    fact. Choosing a different side after looking at the states must not lose them.
 *  - **Skeleton loading while the world data streams in.** The skeleton is the same
 *    three-column grid of side cards the real screen draws, drawn before the data lands.
 *  - **Confirm with a summary and start.** The last step restates all three choices with
 *    the state's real figures, and a step that has not been answered cannot be skipped.
 *
 * The Wanderer start is a first-class choice, not an escape hatch: it has no section to
 * belong to, so it holds no states, and the state step says so rather than showing an
 * empty grid with no explanation.
 */

import { clear, h } from "../dom.js";
import { emptyState, errorState, statusChip, type StatusKind } from "../kit.js";
import { startRoleSkeletonBody, startSkeletonBody, startStateSkeletonBody } from "./panel-skeletons.js";
import { STARTING_ROLES } from "../../data/sides.js";
import type { SideState, StartingRole, StateProfile } from "../../data/types.js";

export interface StartScreenOptions {
  sides: SideState[];
  startYear: number;
  eraLabel: string;
  onStart: (choice: { sideId: string; stateCode: string; role: StartingRole }) => void;
  /**
   * The world survey is still being read. Renders `start-skeleton`, shaped like the
   * side grid, before the profiles arrive (CONSTITUTION.md section 3.2).
   */
  loading?: boolean;
  testId?: string;
}

/** The four steps, in the order `UI_UX.md` section 3 puts them. */
const STEPS = ["Side", "State", "Role", "Confirm"] as const;
type Step = 0 | 1 | 2 | 3;

/**
 * The test id of the region that draws a step. Where the keyboard goes on a step change.
 *
 * Prefixed `start-` rather than `step-`, because `step-0` through `step-3` are the step
 * bar's own test ids and `paperwork.test.ts` selects those with `[data-testid^='step-']`:
 * a region called `step-panel-1` is picked up by that query and the step bar counts five
 * buttons. An id that reads the same way and answers to a different query is the only way
 * two families of ids can share a prefix.
 */
function stepRegionTestId(at: Step): string {
  return `start-step-${at}`;
}

/** The id of a step's heading, so the region is named by the thing it is about. */
function stepHeadingId(at: Step): string {
  return `start-head-${at}`;
}

/**
 * The four keys that walk a one-of-many choice, in the direction the grid is read.
 *
 * The three card grids are single-choice groups of real buttons, so `Tab` already reaches
 * every card and `Enter` already chooses one. The arrows are the grid affordance on top
 * of that: seven side cards, each carrying five ratings and two lists, is a long row to
 * tab through, and a player comparing two sections wants to walk it. Direction is
 * collapsed to next/previous on purpose — the grid reflows to one column below 900px, and
 * a radio group whose left/right means "different rows on a wide screen" and "the same
 * thing on a narrow one" is a widget nobody can learn. That is the ARIA radio contract,
 * and the role here is the one the panel already uses for a card: a pressed button.
 */
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

const DIFFICULTY_STATUS: Record<string, StatusKind> = {
  "Easy to Medium": "good",
  Medium: "warning",
  Hard: "critical",
};

export function startScreen(options: StartScreenOptions): HTMLElement {
  let step: Step = 0;
  let sideId = options.sides[0]?.id ?? "";
  let stateCode = "";
  let role: StartingRole = "ruler-in-waiting";

  const root = h("div", { class: "start", "data-testid": "start-screen", tabindex: "-1" });

  /**
   * The control that should hold the keyboard once the next render is on screen.
   *
   * Every step redraws from scratch, and an element that leaves the document takes the
   * focus with it: `document.activeElement` falls back to `<body>`, and the next `Tab`
   * restarts from the top of the page. That is the whole difference between this screen
   * being operable from the keyboard and not — choosing a side is a click that happens to
   * be a re-render, and a keyboard player who loses their place on every comparison cannot
   * compare anything. So the control that had focus is named here before the redraw and
   * put back after it, and it is named by test id because that is the one handle on these
   * cards that survives the element being thrown away and built again.
   */
  let wantedFocus: string | null = null;

  function currentSide(): SideState | undefined {
    return options.sides.find((s) => s.id === sideId);
  }

  /**
   * Finds a control by test id, exactly, without building a selector out of data.
   *
   * A state code is real data, and `querySelector('[data-testid=CO]')` is a syntax error
   * the first time a code carries a character the selector grammar reserves. Comparing the
   * attribute value instead cannot go wrong, and these grids are a dozen nodes.
   */
  function byTestId(scope: HTMLElement, testId: string): HTMLElement | null {
    for (const el of Array.from(scope.querySelectorAll<HTMLElement>("[data-testid]"))) {
      if (el.dataset.testid === testId) return el;
    }
    return null;
  }

  /** Hands the keyboard to the control the last action asked for. */
  function settleFocus(): void {
    const wanted = wantedFocus;
    wantedFocus = null;
    if (!wanted) return;
    byTestId(root, wanted)?.focus();
  }

  function go(next: Step): void {
    step = next;
    // The step changed, so what the player was reading changed with it. The keyboard goes
    // to the region the new step drew rather than staying on the control that got them
    // here: that is what makes the change announced, and it puts the next Tab inside the
    // step rather than back out at the step bar.
    wantedFocus = stepRegionTestId(next);
    render();
  }

  /**
   * Whether a step can be opened.
   *
   * A step is reachable once the choice before it has been made, and every step already
   * visited stays reachable afterwards so going back never loses a selection. The
   * Wanderer start holds no states, so the state step is answered — there is nothing to
   * choose — rather than blocked.
   */
  function reachable(target: Step): boolean {
    if (target === 0) return true;
    if (target === 1) return sideId !== "";
    if (target === 2) {
      const side = currentSide();
      // A section with no states has answered the state question for the player: there
      // is nothing in it to choose. So the role step opens with it rather than leaving
      // the player stuck on a step that cannot be completed.
      if (side && side.states.length === 0) return true;
      return side?.id === "wanderer" || stateCode !== "";
    }
    return options.sides.length > 0;
  }

  function render(): void {
    paint();
    settleFocus();
  }

  function paint(): void {
    clear(root);
    const side = currentSide();

    const inner = h("div", { class: "start__inner" });
    inner.appendChild(
      h(
        "header",
        { class: "start__head" },
        // The heading is the screen's focus target when it opens, so it is the one heading
        // on the screen that can be focused without a tab stop of its own.
        h("h1", { class: "display", tabindex: "-1", "data-testid": "start-title" }, "Take a side. Then live with it."),
        h(
          "p",
          { class: "lede start__lede" },
          `Starting in ${options.startYear}, the ${options.eraLabel}. Everything below is computed from real data about ` +
            "these states, not from a difficulty setting. Choose the problem you want to have.",
        ),
      ),
    );
    inner.appendChild(stepBar());

    if (options.loading) {
      // The skeleton is the real three-column grid of side cards, not a grey block, so
      // the screen does not reflow when the profiles arrive.
      inner.appendChild(startSkeletonBody());
      root.appendChild(inner);
      return;
    }

    if (options.sides.length === 0) {
      inner.appendChild(
        emptyState(
          "No sides were reported.",
          "The simulation did not send a list of sections, so there is nothing to pick. Start the simulation and take the snapshot again.",
        ),
      );
      root.appendChild(inner);
      return;
    }

    if (step === 0) inner.appendChild(stepSide());
    if (step === 1 && side) inner.appendChild(stepState(side));
    if (step === 2) inner.appendChild(stepRole());
    if (step === 3) inner.appendChild(stepConfirm());

    root.appendChild(inner);
  }

  // -- the step bar -----------------------------------------------------------

  function stepBar(): HTMLElement {
    const nav = h("nav", { class: "steps", "aria-label": "New game steps" });
    STEPS.forEach((label, index) => {
      const at = index as Step;
      const open = reachable(at);
      const btn = h(
        "button",
        {
          type: "button",
          class: "step",
          "data-testid": `step-${at}`,
          disabled: !open,
          ...(step === at ? { "aria-current": "step" } : {}),
        },
        `${at + 1}. ${label}`,
      );
      // A step that is not yet open is a real disabled button, not a silent no-op: the
      // player can see the whole flow and which choice comes next.
      if (!open) btn.title = `Choose a ${label.toLowerCase()} first.`;
      btn.addEventListener("click", () => go(at));
      nav.appendChild(btn);
    });
    return nav;
  }

  // -- step 1: side -----------------------------------------------------------

  function stepSide(): HTMLElement {
    const frag = stepRegion(0, "Pick a side");
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "Every strength connects through the systems to a weakness. Nothing here is simply the best choice.",
      ),
    );
    const grid = h("div", { class: "sides", "data-testid": "side-grid" });
    for (const s of options.sides) grid.appendChild(sideCard(s));
    wireCardKeys(grid);
    frag.appendChild(grid);
    frag.appendChild(navRow(null, "Choose a side to continue", () => go(1), sideId !== ""));
    return frag;
  }

  function sideCard(s: SideState): HTMLElement {
    const card = h(
      "button",
      {
        type: "button",
        class: "side",
        "data-testid": `side-${s.id}`,
        "aria-pressed": sideId === s.id ? "true" : "false",
        // The card is one control, so it needs one name. The name says which side and
        // what the player is about to take on, which is the decision being made.
        "aria-label": `${s.name}. ${s.difficulty}. ${s.biggestDanger}`,
      },
      h("h3", { class: "side__name" }, s.name),
      h(
        "div",
        { class: "side__difficulty" },
        statusChip(DIFFICULTY_STATUS[s.difficulty] ?? "info", s.difficulty, { testId: `side-difficulty-${s.id}` }),
      ),
      h("h4", { class: "section-header side__subhead" }, "Ratings"),
      h(
        "div",
        { class: "ratings", "data-testid": `ratings-${s.id}` },
        rating("Money", s.ratings.money),
        rating("Gold", s.ratings.gold),
        rating("Food", s.ratings.food),
        rating("Metal", s.ratings.metal),
        rating("People", s.ratings.population),
      ),
      h(
        "div",
        { class: "proscons" },
        h("div", {}, h("h4", { class: "section-header side__subhead" }, "For you"), h("ul", {}, s.pros.map((p) => h("li", {}, p)))),
        h("div", {}, h("h4", { class: "section-header side__subhead" }, "Against you"), h("ul", {}, s.cons.map((c) => h("li", {}, c)))),
      ),
      // FACTIONS.md section 7: the plain-language line about what this side is bad at.
      // It is given its own block rather than being left in the cons list, because it is
      // the thing the screen exists to tell the player.
      h(
        "div",
        { class: "danger side__danger", "data-testid": `danger-${s.id}` },
        h("span", { class: "label side__danger-key" }, "The trouble you take on"),
        h("p", { class: "caption side__danger-text" }, s.biggestDanger),
      ),
      h("p", { class: "caption side__mechanic" }, s.signatureMechanic),
    );
    card.addEventListener("click", () => {
      sideId = s.id;
      // Picking a side re-seeds the state list: the previous state belonged to a
      // different section, and leaving it selected would start the player somewhere
      // they did not choose.
      stateCode = s.states[0]?.code ?? "";
      wantedFocus = `side-${s.id}`;
      render();
    });
    return card;
  }

  // -- step 2: state ----------------------------------------------------------

  function stepState(side: SideState): HTMLElement {
    const frag = stepRegion(1, `Pick a state in the ${side.name}`);
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "The state's real profile decides what you start with. Start where you want the problem you understand.",
      ),
    );

    if (side.states.length === 0) {
      // The Wanderer holds no states. That is what the role is, so say what the player
      // is actually choosing rather than showing an empty grid.
      frag.appendChild(
        emptyState(
          "No states in this section.",
          side.id === "wanderer"
            ? "The Wanderer starts nowhere in particular. You will pick a state later, or never."
            : "No state in the loaded region belongs to this side. The Wanderer start is open from anywhere.",
        ),
      );
      frag.appendChild(navRow(() => go(0), "Continue", () => go(2), true));
      return frag;
    }

    const grid = h("div", { class: "states", "data-testid": "state-grid" });
    for (const s of side.states) grid.appendChild(stateCard(s));
    wireCardKeys(grid);
    frag.appendChild(grid);
    frag.appendChild(navRow(() => go(0), "Continue", () => go(2), stateCode !== ""));
    return frag;
  }

  function stateCard(s: StateProfile): HTMLElement {
    const card = h(
      "button",
      {
        type: "button",
        class: "state",
        "data-testid": `state-${s.code}`,
        "aria-pressed": stateCode === s.code ? "true" : "false",
        "aria-label": `${s.name}, ${s.code}. ${s.summary}`,
      },
      h("span", { class: "state__name" }, `${s.name} (${s.code})`),
      h(
        "span",
        { class: "state__pop" },
        s.population === null
          ? h("span", { class: "caption" }, "Population not surveyed")
          : h("span", { class: "data" }, s.population.toLocaleString("en-US")),
      ),
      h(
        "span",
        { class: "ratings state__ratings" },
        rating("Money", s.money),
        rating("Gold", s.gold),
        rating("Food", s.food),
        rating("Metal", s.metal),
      ),
      h("span", { class: "caption state__summary" }, s.summary),
    );
    card.addEventListener("click", () => {
      stateCode = s.code;
      wantedFocus = `state-${s.code}`;
      render();
    });
    return card;
  }

  // -- step 3: role -----------------------------------------------------------

  function stepRole(): HTMLElement {
    const frag = stepRegion(2, "Pick a starting role");
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "The role decides what you hold on the first morning and what you owe somebody.",
      ),
    );
    const grid = h("div", { class: "roles", "data-testid": "role-grid" });
    for (const r of STARTING_ROLES) {
      const card = h(
        "button",
        {
          type: "button",
          class: "role",
          "data-testid": `role-${r.id}`,
          "aria-pressed": role === r.id ? "true" : "false",
          "aria-label": `${r.name}. ${r.description} You start with ${r.startsWith}`,
        },
        h("span", { class: "role__name" }, r.name),
        h("span", { class: "caption role__desc" }, r.description),
        h(
          "span",
          { class: "danger role__starts" },
          h("span", { class: "label role__starts-key" }, "You start with"),
          h("span", { class: "caption" }, r.startsWith),
        ),
      );
      card.addEventListener("click", () => {
        role = r.id;
        wantedFocus = `role-${r.id}`;
        render();
      });
      grid.appendChild(card);
    }
    wireCardKeys(grid);
    frag.appendChild(grid);
    frag.appendChild(navRow(() => go(1), "Continue", () => go(3), true));
    return frag;
  }

  // -- step 4: confirm --------------------------------------------------------

  function stepConfirm(): HTMLElement {
    const side = currentSide();
    const state = side?.states.find((s) => s.code === stateCode);
    const roleInfo = STARTING_ROLES.find((r) => r.id === role);

    const frag = stepRegion(3, "Confirm");

    // A summary on one sheet of paper, because this is the last thing read before the
    // clock starts and it should look like the form it is.
    const summary = h("section", { class: "sheet start__summary triplicate" });
    summary.appendChild(h("h3", { class: "section-header" }, "Your start"));
    const list = h("dl", { class: "start__facts" });
    list.appendChild(fact("Side", side?.name ?? "Not chosen"));
    list.appendChild(fact("State", state ? `${state.name} (${state.code})` : "Not chosen"));
    list.appendChild(fact("Role", roleInfo?.name ?? "Not chosen"));
    if (state) {
      list.appendChild(
        fact("Starting population", state.population === null ? "Not surveyed" : state.population.toLocaleString("en-US")),
      );
    }
    if (side) list.appendChild(fact("Difficulty", side.difficulty));
    summary.appendChild(list);
    if (side) {
      summary.appendChild(
        h(
          "p",
          { class: "danger start__confirm-danger" },
          h("span", { class: "label" }, "The trouble you take on"),
          h("span", { class: "caption" }, ` ${side.biggestDanger}`),
        ),
      );
    }
    if (roleInfo) {
      summary.appendChild(h("p", { class: "caption start__confirm-role" }, `You start with ${roleInfo.startsWith.toLowerCase()}.`));
    }
    frag.appendChild(summary);

    frag.appendChild(
      navRow(
        () => go(2),
        "Start the campaign",
        () => options.onStart({ sideId, stateCode, role }),
        sideId !== "" && (side?.id === "wanderer" || stateCode !== ""),
      ),
    );
    return frag;
  }

  // -- shared furniture -------------------------------------------------------

  /**
   * A step's region, named by its own heading and focusable without a tab stop.
   *
   * `tabindex="-1"` is what makes this a legitimate focus target rather than a place the
   * keyboard can be parked: it takes focus when `go` asks for it and never appears in the
   * tab sequence itself. Naming it with `aria-labelledby` is what turns the focus move
   * into an announcement — an unnamed region focused silently says nothing, which would
   * leave the step change as invisible to a screen reader as it is invisible to nobody
   * else.
   */
  function stepRegion(at: Step, heading: string): HTMLElement {
    const region = h("section", {
      class: "start__step",
      tabindex: "-1",
      role: "region",
      "aria-labelledby": stepHeadingId(at),
      "data-testid": stepRegionTestId(at),
    });
    region.appendChild(h("h2", { class: "title", id: stepHeadingId(at) }, heading));
    return region;
  }

  /**
   * Arrow-key movement across one of the three card grids.
   *
   * Delegated to the grid rather than wired per card, so a grid cannot end up with the
   * handler on some of its cards and not others. Moving with the arrow selects as it goes,
   * which is the one-of-many contract: the grid is a pressed button per card, and the
   * card the arrow lands on is the card that gets chosen. Selection redraws the step and
   * hands the keyboard back to the card it just landed on, which is what `wantedFocus` in
   * the click handlers is for.
   */
  function wireCardKeys(grid: HTMLElement): void {
    grid.addEventListener("keydown", (ev) => {
      const key = (ev as KeyboardEvent).key;
      const forward = NEXT_KEYS.has(key);
      const back = PREV_KEYS.has(key);
      if (!forward && !back && key !== "Home" && key !== "End") return;
      const card = (ev.target as HTMLElement | null)?.closest("button");
      if (!card || !grid.contains(card)) return;
      const cards = Array.from(grid.querySelectorAll<HTMLElement>("button"));
      const at = cards.indexOf(card);
      if (at < 0) return;
      const to = key === "Home" ? 0 : key === "End" ? cards.length - 1 : (at + (forward ? 1 : -1) + cards.length) % cards.length;
      // No dead ends: from the last card, forward wraps to the first. A grid where the
      // arrow stops is a grid the keyboard user has to guess the edges of.
      ev.preventDefault();
      cards[to]?.click();
    });
  }

  function navRow(
    onBack: (() => void) | null,
    nextLabel: string,
    onNext: () => void,
    nextEnabled: boolean,
  ): HTMLElement {
    const row = h("div", { class: "field-row start__nav" });
    if (onBack) {
      const back = h("button", { type: "button", class: "btn", "data-testid": "start-back" }, "Back");
      back.addEventListener("click", onBack);
      row.appendChild(back);
    }
    const next = h(
      "button",
      { type: "button", class: "btn btn--primary", "data-testid": "start-next", disabled: !nextEnabled },
      nextLabel,
    );
    next.addEventListener("click", onNext);
    row.appendChild(next);
    return row;
  }

  /**
   * A rating as five pips and a figure.
   *
   * The pips carry the shape, which is what a player compares at a glance across seven
   * cards, and the figure in mono carries the number, which is what they quote later.
   * The pip row is marked as an image with the full reading as its name, so a screen
   * reader hears "Food 5 of 5" rather than six unlabelled boxes.
   */
  function rating(label: string, value: number): HTMLElement {
    const clamped = Math.max(0, Math.min(5, Math.round(value)));
    // The rating figures are read one after another down a column of seven cards, so
    // they are tabular. `type-data` is mono at 15px, which is `type-data-lg` scaled
    // down — but the scale has no step between the two, and the data-sm step is 12px,
    // which is below the 15px minimum body size in ART_DIRECTION.md section 3.2. So the
    // figure is `data` with the mono class the token stylesheet already defines, and
    // the locked size comes from the generated class rather than an inline style.
    const pips = h("span", { class: "rating__pips", role: "img", "aria-label": `${label} ${clamped} of 5` });
    for (let i = 1; i <= 5; i += 1) {
      pips.appendChild(h("span", { class: "rating__pip", "data-on": i <= clamped ? "true" : "false", "aria-hidden": "true" }));
    }
    return h(
      "span",
      { class: "rating" },
      h("span", { class: "label rating__label" }, label),
      pips,
      h("span", { class: "data rating__value" }, `${clamped}/5`),
    );
  }

  function fact(label: string, value: string): HTMLElement {
    return h(
      "div",
      { class: "start__fact" },
      h("dt", { class: "label" }, label),
      h("dd", { class: "start__fact-value" }, value),
    );
  }

  // A side with no states holds nothing to pre-select, so the state step opens empty and
  // says why. Sides that do hold states open on the first of them, because a player
  // who has picked a section will be inside it.
  stateCode = options.sides[0]?.states[0]?.code ?? "";
  render();
  // The screen takes focus as it opens, on its own heading. Not the first side card —
  // that is a choice, and opening a screen must not make one — and not the continue
  // button, because landing a keyboard on the affirmative is how a player commits to a
  // campaign they have not read.
  const heading = byTestId(root, "start-title");
  if (heading) focusHeadingWhenMounted(root, heading);
  return root;
}

/**
 * Hands focus to a start-screen heading once the root is in the document.
 *
 * Shared by the live screen and its failure state, which have the same opening problem:
 * both are built and then appended by their caller, so a `.focus()` inside the factory
 * lands on a detached node and does nothing at all. `queueMicrotask` is the earliest
 * moment the caller has had the chance to append, and `isConnected` is checked because a
 * screen built and never mounted, as in the tests, has nothing to focus.
 */
function focusHeadingWhenMounted(root: HTMLElement, heading: HTMLElement): void {
  queueMicrotask(() => {
    if (root.isConnected) heading.focus();
  });
}

/**
 * The start screen's failure state, for when the sides could not be read at all.
 *
 * A plain sentence and a way to recover (CONSTITUTION.md section 1.3). The cause goes
 * to the console, never to the screen: `ART_DIRECTION.md` section 10.3 bans a file path
 * or a developer string in anything the player can read.
 */
export function startScreenError(detail: string, onRetry: () => void): HTMLElement {
  const root = h("div", { class: "start", "data-testid": "start-screen", tabindex: "-1" });
  const inner = h("div", { class: "start__inner" });
  const heading = h("h1", { class: "display", tabindex: "-1" }, "The sections did not load");
  inner.appendChild(heading);
  inner.appendChild(
    errorState({
      message: "The list of sections did not arrive. Nothing can be chosen until it does.",
      detail,
      onRetry,
      testId: "start-error",
    }),
  );
  root.appendChild(inner);
  // Same rule as the live screen: focus lands on the heading, which is what announces
  // that the screen failed and not the button that would retry it.
  focusHeadingWhenMounted(root, heading);
  return root;
}

/**
 * The role step at skeleton scale, for a caller that loads the roles separately.
 *
 * The three cards are drawn because three roles is what `FACTIONS.md` section 2 lists,
 * and a placeholder that showed one block would promise a single-column screen the real
 * one does not have.
 */
export function startRoleSkeleton(): HTMLElement {
  const root = h("div", { class: "start", "data-testid": "start-screen" });
  const inner = h("div", { class: "start__inner" });
  inner.appendChild(startRoleSkeletonBody());
  root.appendChild(inner);
  return root;
}

/** The state step at skeleton scale. */
export function startStateSkeleton(): HTMLElement {
  const root = h("div", { class: "start", "data-testid": "start-screen" });
  const inner = h("div", { class: "start__inner" });
  inner.appendChild(startStateSkeletonBody());
  root.appendChild(inner);
  return root;
}
