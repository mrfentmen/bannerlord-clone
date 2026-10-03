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
import {
  createTipRotator,
  TIP_STORE_KEY,
  type LoadingTip,
  type TipStorage,
} from "../../onboarding/loadingTips.js";

export interface StartScreenOptions {
  sides: SideState[];
  startYear: number;
  eraLabel: string;
  onStart: (choice: {
    sideId: string;
    stateCode: string;
    role: StartingRole;
    /** Ironman (MASTER_PLAN task 143): one autosave, no manual saves. */
    ironman: boolean;
    /** New Game+ (MASTER_PLAN task 142): begin as the banked legacy's heir. */
    newGamePlus: boolean;
  }) => void;
  /**
   * Banked legacy carryover lines (MASTER_PLAN task 142). Shown on the
   * confirm step when present; absent means no legacy is banked.
   */
  newGamePlusLines?: string[] | undefined;
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

  const root = h("div", { class: "start", "data-testid": "start-screen" });

  function currentSide(): SideState | undefined {
    return options.sides.find((s) => s.id === sideId);
  }

  function go(next: Step): void {
    step = next;
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
    clear(root);
    const side = currentSide();

    const inner = h("div", { class: "start__inner" });
    inner.appendChild(
      h(
        "header",
        { class: "start__head" },
        h("h1", { class: "display" }, "Take a side. Then live with it."),
        h(
          "p",
          { class: "lede start__lede" },
          `Starting in ${options.startYear}, the ${options.eraLabel}. Everything below is computed from real data about ` +
            "these states, not from a difficulty setting. Choose the problem you want to have.",
        ),
        h(
          "p",
          { class: "lede start__lede" },
          "Twenty years after the Unraveling, you are Sam \u201cRook\u201d Reyes \u2014 a former Guard " +
            "logistics officer turned company captain, running convoys out of Colorado Springs with forty drivers, " +
            "twelve rigs, and a ledger of favors. Six factions divide the country. Every one of them is deciding " +
            "what you are worth. Take a side. Then live with it.",
        ),
      ),
    );
    inner.appendChild(stepBar());

    if (options.loading) {
      // The skeleton is the real three-column grid of side cards, not a grey block, so
      // the screen does not reflow when the profiles arrive.
      inner.appendChild(startSkeletonBody());
      // Task 125: a loading tip under the skeleton, rotated while the world streams
      // in. The rotator's persisted window keeps any tip from repeating within ten
      // loads; in-screen rotation never repeats the tip currently showing.
      inner.appendChild(loadingTip(root));
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
    const frag = h("section", { class: "start__step" });
    frag.appendChild(
      h("h2", { class: "title" }, "Pick a side"),
    );
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "Every strength connects through the systems to a weakness. Nothing here is simply the best choice.",
      ),
    );
    const grid = h("div", { class: "sides", "data-testid": "side-grid" });
    for (const s of options.sides) grid.appendChild(sideCard(s));
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
      render();
    });
    return card;
  }

  // -- step 2: state ----------------------------------------------------------

  function stepState(side: SideState): HTMLElement {
    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, `Pick a state in the ${side.name}`));
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
      render();
    });
    return card;
  }

  // -- step 3: role -----------------------------------------------------------

  function stepRole(): HTMLElement {
    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, "Pick a starting role"));
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
        render();
      });
      grid.appendChild(card);
    }
    frag.appendChild(grid);
    frag.appendChild(navRow(() => go(1), "Continue", () => go(3), true));
    return frag;
  }

  // -- step 4: confirm --------------------------------------------------------

  function stepConfirm(): HTMLElement {
    const side = currentSide();
    const state = side?.states.find((s) => s.code === stateCode);
    const roleInfo = STARTING_ROLES.find((r) => r.id === role);

    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, "Confirm"));

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

    // New Game+ (MASTER_PLAN task 142): the carryover list is the
    // acceptance criterion — the player sees exactly what the heir
    // inherits before choosing to begin as them.
    let ngplusBox: HTMLInputElement | null = null;
    if (options.newGamePlusLines && options.newGamePlusLines.length > 0) {
      const lines = h("ul", { class: "start__ngplus-lines", "data-testid": "start-ngplus-lines" });
      for (const line of options.newGamePlusLines) {
        lines.appendChild(h("li", {}, line));
      }
      ngplusBox = h("input", {
        type: "checkbox",
        id: "start-ngplus",
        class: "field__checkbox",
        "data-testid": "start-ngplus",
      }) as HTMLInputElement;
      frag.appendChild(
        h(
          "div",
          { class: "start__ngplus" },
          h("p", { class: "label" }, "A legacy is banked"),
          lines,
          h(
            "label",
            { class: "field", for: "start-ngplus" },
            ngplusBox,
            h("span", { class: "field__label" }, "Begin as the heir (New Game+)"),
            h("span", { class: "caption" }, " Inherit gold and training from the banked campaign."),
          ),
        ),
      );
    }

    // Ironman opt-in (MASTER_PLAN task 143): chosen once, at the confirm
    // step, because it changes what the save system may do for the run.
    const ironmanBox = h("input", {
      type: "checkbox",
      id: "start-ironman",
      class: "field__checkbox",
      "data-testid": "start-ironman",
    }) as HTMLInputElement;
    frag.appendChild(
      h(
        "label",
        { class: "field start__ironman", for: "start-ironman" },
        ironmanBox,
        h("span", { class: "field__label" }, "Ironman run"),
        h(
          "span",
          { class: "caption" },
          " One autosave, no manual saves. The run cannot be reloaded or branched.",
        ),
      ),
    );

    frag.appendChild(
      navRow(
        () => go(2),
        "Start the campaign",
        () =>
          options.onStart({ sideId, stateCode, role, ironman: ironmanBox.checked, newGamePlus: ngplusBox?.checked === true }),
        sideId !== "" && (side?.id === "wanderer" || stateCode !== ""),
      ),
    );
    return frag;
  }

  // -- shared furniture -------------------------------------------------------

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
  return root;
}

/**
 * Task 125: the loading tip shown under the start-screen skeleton.
 *
 * The first tip comes from a rotator over the persisted recent-tip window, so
 * no tip repeats within ten loads even across reloads. While the screen stays
 * attached it rotates every five seconds, never repeating the tip on screen.
 * Reduced-motion users get the single static tip — rotation is vestibular
 * motion they asked out of. The interval self-clears once the screen leaves
 * the document, so a removed boot screen never keeps a timer alive.
 */
function loadingTip(root: HTMLElement): HTMLElement {
  const rotator = createTipRotator(tipStorage());
  let current: LoadingTip = rotator.next();
  const textEl = h("span", { class: "start__tip-text", "data-testid": "loading-tip" }, current.text);
  const aside = h(
    "aside",
    { class: "start__tip", "aria-live": "polite" },
    h("span", { class: "start__tip-label" }, "Tip"),
    textEl,
  );
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    const timer = window.setInterval(() => {
      if (!root.isConnected) {
        window.clearInterval(timer);
        return;
      }
      current = rotator.nextInSession(current);
      textEl.textContent = current.text;
    }, 5000);
  }
  return aside;
}

/** localStorage behind a probe: blocked contexts degrade to the in-memory window. */
function tipStorage(): TipStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    localStorage.getItem(TIP_STORE_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * The start screen's failure state, for when the sides could not be read at all.
 *
 * A plain sentence and a way to recover (CONSTITUTION.md section 1.3). The cause goes
 * to the console, never to the screen: `ART_DIRECTION.md` section 10.3 bans a file path
 * or a developer string in anything the player can read.
 */
export function startScreenError(detail: string, onRetry: () => void): HTMLElement {
  const root = h("div", { class: "start", "data-testid": "start-screen" });
  const inner = h("div", { class: "start__inner" });
  inner.appendChild(h("h1", { class: "display" }, "The sections did not load"));
  inner.appendChild(
    errorState({
      message: "The list of sections did not arrive. Nothing can be chosen until it does.",
      detail,
      onRetry,
      testId: "start-error",
    }),
  );
  root.appendChild(inner);
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
