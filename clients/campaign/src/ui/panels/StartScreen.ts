/**
 * The new game flow: side, then state, then role. `UI_UX.md` section 3,
 * `FACTIONS.md` sections 3, 4 and 7.
 *
 * The screen has one job beyond collecting three choices, and that job is to make the
 * trade explicit. `FACTIONS.md` section 7: "Choosing a side is choosing which problem
 * to have." So every side shows its ratings, its pros, its cons, and one plain sentence
 * about the problem you are choosing to have. The ratings are the values the
 * simulation computed, not adjectives.
 *
 * Every step can be navigated backwards (`UI_UX.md` section 3), and the whole thing is
 * keyboard operable.
 */

import { clear, h } from "../dom.js";
import { statusChip, type StatusKind } from "../kit.js";
import { STARTING_ROLES } from "../../data/sides.js";
import type { SideState, StartingRole, StateProfile } from "../../data/types.js";

export interface StartScreenOptions {
  sides: SideState[];
  startYear: number;
  eraLabel: string;
  onStart: (choice: { sideId: string; stateCode: string; role: StartingRole }) => void;
  /** Shown at the top while the world data streams in. */
  loading?: boolean;
  testId?: string;
}

const DIFFICULTY_STATUS: Record<string, StatusKind> = {
  Easy: "good",
  "Easy to Medium": "good",
  Medium: "warning",
  Hard: "critical",
};

export function startScreen(options: StartScreenOptions): HTMLElement {
  let step: 0 | 1 | 2 | 3 = 0;
  let sideId = options.sides[0]?.id ?? "";
  let stateCode = "";
  let role: StartingRole = "ruler-in-waiting";

  const root = h("div", { class: "start", "data-testid": "start-screen" });

  function currentSide(): SideState | undefined {
    return options.sides.find((s) => s.id === sideId);
  }

  function go(next: 0 | 1 | 2 | 3): void {
    step = next;
    render();
  }

  function render(): void {
    clear(root);
    const side = currentSide();

    const inner = h("div", { class: "start__inner" });
    inner.appendChild(
      h(
        "header",
        { style: "margin-bottom:var(--space-5)" },
        h("h1", { class: "display", style: "margin:0 0 var(--space-2)" }, "Take a side. Then live with it."),
        h(
          "p",
          { class: "lede" },
          `Starting in ${options.startYear}, the ${options.eraLabel}. Everything below is computed from real data about ` +
            "these states, not from a difficulty setting. Choose the problem you want to have.",
        ),
      ),
    );

    const steps = h("nav", { class: "steps", "aria-label": "New game steps" });
    const stepDefs: [string, number][] = [["1. Side", 0], ["2. State", 1], ["3. Role", 2], ["4. Confirm", 3]];
    for (const [label, index] of stepDefs) {
      const btn = h("button", { type: "button", class: "step", "data-testid": `step-${index}` }, label);
      if (step === index) btn.setAttribute("aria-current", "step");
      btn.addEventListener("click", () => go(index as 0 | 1 | 2 | 3));
      steps.appendChild(btn);
    }
    inner.appendChild(steps);

    if (options.loading) {
      const sk = h("div", { class: "skeleton skeleton--start", "data-testid": "start-skeleton", "aria-busy": "true", role: "status" });
      sk.appendChild(h("span", { class: "visually-hidden" }, "Reading the state profiles."));
      for (let i = 0; i < 6; i += 1) sk.appendChild(h("div", { class: "skeleton__block" }));
      inner.appendChild(sk);
      root.appendChild(inner);
      return;
    }

    if (step === 0) {
      inner.appendChild(h("h2", { class: "title", style: "margin:0 0 var(--space-2)" }, "Pick a side"));
      inner.appendChild(
        h("p", { class: "caption", style: "margin:0 0 var(--space-3);max-width:62ch" },
          "Every strength connects through the systems to a weakness. Nothing here is simply the best choice."),
      );
      const grid = h("div", { class: "sides", "data-testid": "side-grid" });
      for (const s of options.sides) grid.appendChild(sideCard(s));
      inner.appendChild(grid);
      inner.appendChild(navRow("Back", null, "Choose a side to continue", () => go(1), sideId !== ""));
    }

    if (step === 1 && side) {
      inner.appendChild(h("h2", { class: "title", style: "margin:0 0 var(--space-2)" }, `Pick a state in the ${side.name}`));
      inner.appendChild(
        h("p", { class: "caption", style: "margin:0 0 var(--space-3);max-width:62ch" },
          "The state's real profile decides what you start with. Start where you want the problem you understand."),
      );
      const grid = h("div", { class: "states", "data-testid": "state-grid" });
      for (const s of side.states) grid.appendChild(stateCard(s));
      if (side.states.length === 0) {
        grid.appendChild(
          h("p", { class: "caption" }, "No state in the loaded region belongs to this side. The Wanderer start is open from anywhere."),
        );
      }
      inner.appendChild(grid);
      inner.appendChild(navRow("Back", () => go(0), "Continue", () => go(2), stateCode !== ""));
    }

    if (step === 2) {
      inner.appendChild(h("h2", { class: "title", style: "margin:0 0 var(--space-2)" }, "Pick a starting role"));
      const grid = h("div", { class: "roles", "data-testid": "role-grid" });
      for (const r of STARTING_ROLES) {
        const card = h(
          "button",
          { type: "button", class: "role", "data-testid": `role-${r.id}`, "aria-pressed": role === r.id ? "true" : "false" },
          h("span", { class: "role__name" }, r.name),
          h("span", { class: "caption" }, r.description),
          h("span", { class: "danger" }, r.startsWith),
        );
        card.addEventListener("click", () => {
          role = r.id;
          render();
        });
        grid.appendChild(card);
      }
      inner.appendChild(grid);
      inner.appendChild(navRow("Back", () => go(1), "Continue", () => go(3), true));
    }

    if (step === 3) {
      const state = side?.states.find((s) => s.code === stateCode);
      inner.appendChild(h("h2", { class: "title", style: "margin:0 0 var(--space-2)" }, "Confirm"));
      const summary = h("div", { class: "sheet", style: "padding:var(--space-4);max-width:var(--space-8)" });
      summary.appendChild(h("h3", { class: "section-header" }, "Your start"));
      const dl = h("div", { style: "margin-top:var(--space-2)" });
      dl.appendChild(summaryRow("Side", side?.name ?? "Not chosen"));
      dl.appendChild(summaryRow("State", state ? `${state.name} (${state.code})` : "Not chosen"));
      dl.appendChild(summaryRow("Role", STARTING_ROLES.find((r) => r.id === role)?.name ?? role));
      if (state) {
        dl.appendChild(summaryRow("Starting population", state.population === null ? "Not surveyed" : state.population.toLocaleString("en-US")));
        dl.appendChild(summaryRow("What you start with", state.summary));
      }
      summary.appendChild(dl);
      inner.appendChild(summary);
      inner.appendChild(navRow("Back", () => go(2), "Start the campaign", () => options.onStart({ sideId, stateCode, role }), true));
    }

    root.appendChild(inner);
  }

  function sideCard(s: SideState): HTMLElement {
    const card = h(
      "button",
      {
        type: "button",
        class: "side",
        "data-testid": `side-${s.id}`,
        "aria-pressed": sideId === s.id ? "true" : "false",
      },
      h("h3", { class: "side__name" }, s.name),
      h(
        "div",
        { class: "side__difficulty" },
        statusChip(DIFFICULTY_STATUS[s.difficulty] ?? "info", s.difficulty, { testId: `side-difficulty-${s.id}` }),
      ),
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
        h("div", {}, h("h4", {}, "For you"), h("ul", {}, s.pros.map((p) => h("li", {}, p)))),
        h("div", {}, h("h4", {}, "Against you"), h("ul", {}, s.cons.map((c) => h("li", {}, c)))),
      ),
      h("p", { class: "danger", "data-testid": `danger-${s.id}` }, s.biggestDanger),
      h("p", { class: "caption" }, s.signatureMechanic),
    );
    card.addEventListener("click", () => {
      sideId = s.id;
      stateCode = s.states[0]?.code ?? "";
      render();
    });
    return card;
  }

  function stateCard(s: StateProfile): HTMLElement {
    const card = h(
      "button",
      { type: "button", class: "state", "data-testid": `state-${s.code}`, "aria-pressed": stateCode === s.code ? "true" : "false" },
      h("span", { class: "state__name" }, `${s.name} (${s.code})`),
      h("span", { class: "data" }, s.population === null ? "Population not surveyed" : s.population.toLocaleString("en-US")),
      h(
        "span",
        { class: "ratings" },
        rating("Money", s.money),
        rating("Gold", s.gold),
        rating("Food", s.food),
        rating("Metal", s.metal),
      ),
      h("span", { class: "caption" }, s.summary),
    );
    card.addEventListener("click", () => {
      stateCode = s.code;
      render();
    });
    return card;
  }

  function navRow(
    backLabel: string | null,
    onBack: (() => void) | null,
    nextLabel: string,
    onNext: () => void,
    nextEnabled: boolean,
  ): HTMLElement {
    const row = h("div", { class: "field-row", style: "margin-top:var(--space-5)" });
    if (backLabel && onBack) {
      const back = h("button", { type: "button", class: "btn", "data-testid": "start-back" }, backLabel);
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

  function rating(label: string, value: number): HTMLElement {
    const pips = h("span", { class: "rating__pips", role: "img", "aria-label": `${label} ${value} of 5` });
    for (let i = 1; i <= 5; i += 1) {
      pips.appendChild(h("span", { class: "rating__pip", "data-on": i <= value ? "true" : "false" }));
    }
    return h("span", { class: "rating" }, h("span", { class: "label" }, label), pips, h("span", { class: "data-sm" }, `${value}/5`));
  }

  function summaryRow(label: string, value: string): HTMLElement {
    return h("div", { class: "row" }, h("span", { class: "row__label label" }, label), h("span", { class: "row__value" }, value));
  }

  // The Wanderer start has no states, so nothing is pre-selected there.
  stateCode = options.sides[0]?.states[0]?.code ?? "";
  render();
  return root;
}
