/**
 * The new game flow: heritage, family job, upbringing, home, confirm.
 *
 * The locked design (CONSTITUTION.md creation order) puts no side pick at
 * creation: the shipped map holds only part of the country, so a side list
 * would show sections that own no towns at all. Sides recruit the player
 * later, in the game, and a heritage shifts how fast they open up — it never
 * blocks anything. So the four answers this screen collects are who the
 * character is and where they start, and the confirm step restates them.
 *
 * Three things the old screen got right stay load-bearing:
 *
 *  - **Every step can be navigated backwards.** The step bar is a row of real
 *    buttons, not a progress indicator, and a step already answered stays
 *    reachable after the fact.
 *  - **Skeleton loading while the world data streams in.** The boot screen
 *    renders the skeleton before the settlement survey lands, so the screen
 *    does not reflow when the data arrives.
 *  - **Confirm with a summary and start.** The last step restates all four
 *    answers with the home town's real figures, and a step that has not been
 *    answered cannot be skipped.
 *
 * The home step derives the town from `resolveHome` — the player picks a state
 * or lets their heritage decide — so no start screen choice can name a town
 * the map does not hold.
 */

import { clear, h } from "../dom.js";
import { emptyState, errorState } from "../kit.js";
import { startSkeletonBody } from "./panel-skeletons.js";
import { BACKGROUNDS } from "../../data/backgrounds.js";
import { FAMILIES } from "../../data/families.js";
import { mappedStates, resolveHome } from "../../data/homes.js";
import { ETHNICITIES, getEthnicity } from "../../data/ethnicities.js";
import { attributeLabel } from "../../data/attributes.js";
import type { WorldSettlement } from "../../world/types.js";
import {
  createTipRotator,
  TIP_STORE_KEY,
  type LoadingTip,
  type TipStorage,
} from "../../onboarding/loadingTips.js";

/** What the start screen hands the campaign when the player confirms. */
export interface StartChoice {
  ethnicityId: string;
  /** The family job the character was born into (`data/families.ts`). */
  familyId: string;
  /** The life stages answered on the upbringing step: category id -> option id. */
  upbringing: Record<string, string>;
  /** The state the player picked for home, or null when heritage decided. */
  homeStateCode: string | null;
  /** Display name of the home state, for the maker's review and the summary. */
  homeState: string;
  /**
   * The home settlement's name slug. This is the value POST /v1/character
   * sends as `startCity`, and the simulation relocates the player by it.
   */
  startCity: string;
  /** The home town's display name. */
  homeTown: string;
  /** The one-sentence reason the resolver gave for this town. */
  homeReason: string;
  /** Ironman (MASTER_PLAN task 143): one autosave, no manual saves. */
  ironman: boolean;
  /** New Game+ (MASTER_PLAN task 142): begin as the banked legacy's heir. */
  newGamePlus: boolean;
}

export interface StartScreenOptions {
  /** The settlement survey the loaded region really has, for the home step. */
  settlements: readonly WorldSettlement[];
  startYear: number;
  eraLabel: string;
  onStart: (choice: StartChoice) => void;
  /**
   * Banked legacy carryover lines (MASTER_PLAN task 142). Shown on the
   * confirm step when present; absent means no legacy is banked.
   */
  newGamePlusLines?: string[] | undefined;
  /**
   * The world survey is still being read. Renders the boot skeleton before the
   * settlement data lands (CONSTITUTION.md section 3.2).
   */
  loading?: boolean;
  testId?: string;
}

/** The five steps: the locked creation order, then the confirm sheet. */
const STEPS = ["Heritage", "Family", "Upbringing", "Home", "Confirm"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

export function startScreen(options: StartScreenOptions): HTMLElement {
  let step: Step = 0;
  let ethnicityId = "";
  // The family job is preseeded like the upbringing is: the confirm sheet
  // restates it, and the step bar makes changing it one click at any time.
  let familyId = FAMILIES[0]!.id;
  /** The life stages, preseeded with each category's first option so the
   * flow is never stuck on a page of sixteen required clicks; the confirm
   * sheet restates every answer so a default the player disliked is one
   * step-bar click away. */
  let upbringing: Record<string, string> = {};
  for (const category of BACKGROUNDS) {
    upbringing[category.id] = category.options[0]!.id;
  }
  /** Null = let the heritage decide, which is the default until picked. */
  let homeStateCode: string | null = null;

  const root = h("div", { class: "start", "data-testid": options.testId ?? "start-screen" });

  function currentEthnicity() {
    return getEthnicity(ethnicityId);
  }

  function currentFamily() {
    return FAMILIES.find((f) => f.id === familyId);
  }

  function go(next: Step): void {
    step = next;
    render();
  }

  /**
   * Whether a step can be opened.
   *
   * The heritage step is the only gate: the headline choice is made explicitly.
   * Family and upbringing carry honest defaults, and the home step resolves
   * from the survey that already landed, so once a heritage exists the whole
   * path is open and every answer stays editable from the step bar.
   */
  function reachable(target: Step): boolean {
    if (target === 0) return true;
    if (ethnicityId === "") return false;
    return target !== 4 || homeChoice() !== null;
  }

  /** The home the current answers resolve to, or null while the map has no towns. */
  function homeChoice() {
    const ethnicity = currentEthnicity();
    if (!ethnicity) return null;
    return resolveHome({
      ethnicityId: ethnicity.id,
      ethnicityName: ethnicity.name,
      stateCode: homeStateCode,
      settlements: options.settlements,
    });
  }

  function render(): void {
    clear(root);

    const inner = h("div", { class: "start__inner" });
    inner.appendChild(
      h(
        "header",
        { class: "start__head" },
        h("h1", { class: "display" }, "Who you are before the trouble starts."),
        h(
          "p",
          { class: "lede start__lede" },
          `Starting in ${options.startYear}, the ${options.eraLabel}. Four answers put a character on the map: ` +
            "your people, your family's trade, how you were raised, and where home is. No section owns you at " +
            "creation — sides recruit you later, in the game, and your heritage shifts how fast they open up.",
        ),
        h(
          "p",
          { class: "lede start__prologue" },
          "Twenty years after the Unraveling, six factions divide the country and every road has a toll. " +
            "You are a captain with a company, a past of your own choosing, and bills to pay. The Rook Company " +
            "runs the Front Range convoys \u2014 for now, they are the competition.",
        ),
      ),
    );
    inner.appendChild(stepBar());

    if (options.loading) {
      // The boot skeleton: the world survey streams in underneath it, and the
      // screen takes its real shape when the data lands.
      inner.appendChild(startSkeletonBody());
      inner.appendChild(loadingTip(root));
      root.appendChild(inner);
      return;
    }

    if (step === 0) inner.appendChild(stepHeritage());
    if (step === 1) inner.appendChild(stepFamily());
    if (step === 2) inner.appendChild(stepUpbringing());
    if (step === 3) inner.appendChild(stepHome());
    if (step === 4) inner.appendChild(stepConfirm());

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
      if (!open) btn.title = `Choose a heritage first.`;
      btn.addEventListener("click", () => go(at));
      nav.appendChild(btn);
    });
    return nav;
  }

  // -- step 1: heritage -------------------------------------------------------

  function stepHeritage(): HTMLElement {
    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, "Your heritage"));
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "Where your people live shapes where you start and how quickly the sections open their doors to you. A heritage raises or lowers an acceptance bar; it never blocks one.",
      ),
    );
    const grid = h("div", { class: "roles", "data-testid": "heritage-grid" });
    for (const e of ETHNICITIES) grid.appendChild(heritageCard(e.id, e.name, e.tagline, e.homeRegion, e.bonuses));
    frag.appendChild(grid);
    frag.appendChild(navRow(null, "Continue", () => go(1), ethnicityId !== ""));
    return frag;
  }

  function heritageCard(
    id: string,
    name: string,
    tagline: string,
    homeRegion: string,
    bonuses: readonly { label: string; reason: string; pro: boolean }[],
  ): HTMLElement {
    const selected = ethnicityId === id;
    const bonusesList = h("ul", { class: "pros" });
    for (const b of bonuses) {
      bonusesList.appendChild(
        h("li", { class: b.pro ? "pro" : "con", title: b.reason }, `${b.pro ? "+" : "-"} ${b.label}`),
      );
    }
    const card = h(
      "button",
      {
        type: "button",
        class: `role${selected ? " role--selected" : ""}`,
        "data-testid": `heritage-${id}`,
        "aria-pressed": selected ? "true" : "false",
        "aria-label": `${name}. ${tagline} Home region: ${homeRegion}.`,
      },
      h("strong", {}, name),
      h("br"),
      h("em", { class: "tagline" }, tagline),
      h("p", { class: "caption" }, `Home region: ${homeRegion}`),
      bonusesList,
    );
    card.addEventListener("click", () => {
      ethnicityId = id;
      render();
    });
    return card;
  }

  // -- step 2: family ---------------------------------------------------------

  function stepFamily(): HTMLElement {
    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, "Your family's trade"));
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "The family you were born into grants one attribute and a set of skills, and a story worth telling.",
      ),
    );
    const grid = h("div", { class: "roles", "data-testid": "family-grid" });
    for (const f of FAMILIES) {
      const selected = familyId === f.id;
      const gains = h("ul", { class: "pros" });
      gains.appendChild(
        h("li", { class: "pro" }, `+${f.attributeBonus.points} ${attributeLabel(f.attributeBonus.attribute)}`),
      );
      for (const [skill, bonus] of Object.entries(f.skills)) {
        gains.appendChild(h("li", { class: "pro" }, `+${bonus} ${skill}`));
      }
      if (f.cash !== 0) {
        gains.appendChild(h("li", { class: f.cash > 0 ? "pro" : "con" }, `${f.cash > 0 ? "+" : ""}$${f.cash} starting cash`));
      }
      const card = h(
        "button",
        {
          type: "button",
          class: `role${selected ? " role--selected" : ""}`,
          "data-testid": `family-${f.id}`,
          "aria-pressed": selected ? "true" : "false",
          "aria-label": `${f.label}. ${f.description}`,
        },
        h("strong", {}, f.label),
        h("br"),
        h("span", { class: "caption" }, f.description),
        gains,
      );
      card.addEventListener("click", () => {
        familyId = f.id;
        render();
      });
      grid.appendChild(card);
    }
    frag.appendChild(grid);
    frag.appendChild(navRow(() => go(0), "Continue", () => go(2), true));
    return frag;
  }

  // -- step 3: upbringing -----------------------------------------------------

  function stepUpbringing(): HTMLElement {
    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, "Your upbringing"));
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "Four life stages, one answer each. Each choice grants skills and cash, and writes a line of your biography.",
      ),
    );
    for (const category of BACKGROUNDS) {
      frag.appendChild(h("h3", { class: "section-header" }, category.question));
      const grid = h("div", { class: "roles", "data-testid": `bg-${category.id}` });
      for (const opt of category.options) {
        const selected = upbringing[category.id] === opt.id;
        const gains = h("ul", { class: "pros" });
        for (const [skill, bonus] of Object.entries(opt.skills)) {
          gains.appendChild(h("li", { class: "pro" }, `+${bonus} ${skill}`));
        }
        if (opt.cash !== 0) {
          gains.appendChild(
            h("li", { class: opt.cash > 0 ? "pro" : "con" }, `${opt.cash > 0 ? "+" : ""}$${opt.cash} starting cash`),
          );
        }
        const card = h(
          "button",
          {
            type: "button",
            class: `role${selected ? " role--selected" : ""}`,
            "data-testid": `bg-${category.id}-${opt.id}`,
            "aria-pressed": selected ? "true" : "false",
            "aria-label": `${opt.label}. ${opt.description}`,
          },
          h("strong", {}, opt.label),
          h("br"),
          h("span", { class: "caption" }, opt.description),
          gains,
        );
        card.addEventListener("click", () => {
          upbringing[category.id] = opt.id;
          render();
        });
        grid.appendChild(card);
      }
      frag.appendChild(grid);
    }
    frag.appendChild(navRow(() => go(1), "Continue", () => go(3), true));
    return frag;
  }

  // -- step 4: home -----------------------------------------------------------

  function stepHome(): HTMLElement {
    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, "Where home is"));
    frag.appendChild(
      h(
        "p",
        { class: "caption start__note" },
        "Pick a state on the map, or let your heritage decide. The town is the real one: the largest mapped settlement of your part of the map, from the survey the game loaded.",
      ),
    );

    const states = mappedStates(options.settlements);
    if (states.length === 0) {
      // The survey landed but holds no placeable towns, so no honest start
      // exists yet. Say so plainly rather than offering a picker of nothing.
      frag.appendChild(
        emptyState(
          "The map holds no towns yet.",
          "The settlement survey arrived without placeable towns, so no start can be resolved. Load a region with towns and take this step again.",
        ),
      );
      frag.appendChild(navRow(() => go(2), "Back", () => go(2), true));
      return frag;
    }

    const grid = h("div", { class: "states", "data-testid": "home-state-grid" });
    const heritageCard = h(
      "button",
      {
        type: "button",
        class: `state${homeStateCode === null ? " role--selected" : ""}`,
        "data-testid": "home-heritage",
        "aria-pressed": homeStateCode === null ? "true" : "false",
        "aria-label": "Let your heritage decide the state.",
      },
      h("span", { class: "state__name" }, "Let my heritage decide"),
      h(
        "span",
        { class: "caption state__summary" },
        "You start where your people are most concentrated, as the census counts them.",
      ),
    );
    heritageCard.addEventListener("click", () => {
      homeStateCode = null;
      render();
    });
    grid.appendChild(heritageCard);
    for (const s of states) {
      const card = h(
        "button",
        {
          type: "button",
          class: `state${homeStateCode === s.code ? " role--selected" : ""}`,
          "data-testid": `home-state-${s.code}`,
          "aria-pressed": homeStateCode === s.code ? "true" : "false",
          "aria-label": `${s.name} (${s.code}). ${s.townCount} mapped towns, ${s.population.toLocaleString("en-US")} people surveyed.`,
        },
        h("span", { class: "state__name" }, `${s.name} (${s.code})`),
        h(
          "span",
          { class: "state__pop" },
          s.population === 0
            ? h("span", { class: "caption" }, "Population not surveyed")
            : h("span", { class: "data" }, s.population.toLocaleString("en-US")),
        ),
        h("span", { class: "caption state__summary" }, `${s.townCount} mapped ${s.townCount === 1 ? "town" : "towns"}`),
      );
      card.addEventListener("click", () => {
        homeStateCode = s.code;
        render();
      });
      grid.appendChild(card);
    }
    frag.appendChild(grid);

    const home = homeChoice();
    if (home) {
      const resolution = h(
        "div",
        { class: "sheet start__summary", "data-testid": "home-resolution" },
        h("h3", { class: "section-header" }, "Your start"),
        h(
          "p",
          {},
          h("strong", {}, home.settlement.name),
          h("span", { class: "caption" }, ` — ${home.settlement.state ?? ""}`),
        ),
        h(
          "p",
          { class: "caption" },
          home.settlement.population === null
            ? "Population not surveyed"
            : `Census population ${home.settlement.population.toLocaleString("en-US")}`,
        ),
        h("p", { class: "caption" }, home.reason),
      );
      frag.appendChild(resolution);
    }
    frag.appendChild(navRow(() => go(2), "Continue", () => go(4), home !== null));
    return frag;
  }

  // -- step 5: confirm --------------------------------------------------------

  function stepConfirm(): HTMLElement {
    const ethnicity = currentEthnicity();
    const family = currentFamily();
    const home = homeChoice();

    const frag = h("section", { class: "start__step" });
    frag.appendChild(h("h2", { class: "title" }, "Confirm"));

    // A summary on one sheet of paper, because this is the last thing read before the
    // clock starts and it should look like the form it is.
    const summary = h("section", { class: "sheet start__summary triplicate" });
    summary.appendChild(h("h3", { class: "section-header" }, "Your start"));
    const list = h("dl", { class: "start__facts" });
    list.appendChild(fact("Heritage", ethnicity?.name ?? "Not chosen"));
    list.appendChild(fact("Family", family?.label ?? "Not chosen"));
    const upbringingLabels = BACKGROUNDS.map(
      (c) => c.options.find((o) => o.id === upbringing[c.id])?.label ?? "",
    ).filter((label) => label.length > 0);
    list.appendChild(fact("Upbringing", upbringingLabels.join(", ") || "Not chosen"));
    if (home) {
      list.appendChild(fact("Home", `${home.settlement.name}, ${home.settlement.state ?? ""}`));
      list.appendChild(
        fact(
          "Home population",
          home.settlement.population === null ? "Not surveyed" : home.settlement.population.toLocaleString("en-US"),
        ),
      );
    }
    summary.appendChild(list);
    if (home) summary.appendChild(h("p", { class: "caption start__confirm-role" }, home.reason));
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
        () => go(3),
        "Start the campaign",
        () => {
          if (!ethnicity || !family || !home) return;
          options.onStart({
            ethnicityId: ethnicity.id,
            familyId: family.id,
            upbringing: { ...upbringing },
            homeStateCode,
            homeState: home.settlement.state ?? "",
            startCity: home.slug,
            homeTown: home.settlement.name,
            homeReason: home.reason,
            ironman: ironmanBox.checked,
            newGamePlus: ngplusBox?.checked === true,
          });
        },
        ethnicity !== undefined && family !== undefined && home !== null,
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
      {
        type: "button",
        class: "btn btn--primary",
        "data-testid": "start-next",
        disabled: !nextEnabled,
      },
      nextLabel,
    );
    next.addEventListener("click", onNext);
    row.appendChild(next);
    return row;
  }

  function fact(label: string, value: string): HTMLElement {
    return h(
      "div",
      { class: "start__fact" },
      h("dt", { class: "label" }, label),
      h("dd", { class: "start__fact-value" }, value),
    );
  }

  render();
  return root;
}

/**
 * Task 125: the loading tip shown under the boot skeleton.
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
 * The start screen's failure state, for when the survey could not be read at all.
 *
 * A plain sentence and a way to recover (CONSTITUTION.md section 1.3). The cause goes
 * to the console, never to the screen: `ART_DIRECTION.md` section 10.3 bans a file path
 * or a developer string in anything the player can read.
 */
export function startScreenError(detail: string, onRetry: () => void): HTMLElement {
  const root = h("div", { class: "start", "data-testid": "start-screen" });
  const inner = h("div", { class: "start__inner" });
  inner.appendChild(h("h1", { class: "display" }, "The world survey did not load"));
  inner.appendChild(
    errorState({
      message: "The settlement survey did not arrive. Nothing can be chosen until it does.",
      detail,
      onRetry,
      testId: "start-error",
    }),
  );
  root.appendChild(inner);
  return root;
}
