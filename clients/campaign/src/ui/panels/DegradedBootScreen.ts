/**
 * The degraded boot screen: what the player sees when the simulation will not answer.
 *
 * This replaces a full-screen fatal error that was also rethrown, which in a production
 * build was a white screen. `CONSTITUTION.md` section 1.3 requires a plain message and a
 * way to recover; `SPEC.md` section 10 requires something on screen before the request,
 * shaped like what is coming. So this screen is a paper sheet over the real map that has
 * already loaded, and it offers the two things a player can actually do:
 *
 *  - **Retry**, which asks the simulation again and, on success, hands the campaign over.
 *  - **Look at the world**, which is honest only because the map underneath is real
 *    terrain, real roads and real places from `public/world/**`. `DATA-MANIFEST.md`
 *    section 1 says exactly what those files do not contain, so the panel below shows the
 *    counts those files support and names the systems that are missing. There is no
 *    invented figure anywhere on this screen, and `src/boot/bootFailure.ts` is where that
 *    is enforced by construction: `SurveyFacts` has no field that could hold a price, an
 *    unrest figure or a town condition.
 *
 * Nothing here imports from `data/fixture/`. The fixture is quarantined from production
 * paths by `vite.config.ts` and proved by `tools/check-no-fixtures.mjs`, and a screen
 * that only appears when the live simulation is *missing* has no business reaching for
 * the module that stands in for it.
 */

import { button, clear, h } from "../dom.js";
import { errorState, statusChip, type StatusKind } from "../kit.js";
import type { BootFailure, SurveyFacts } from "../../boot/bootFailure.js";

export interface DegradedBootOptions {
  failure: BootFailure;
  facts: SurveyFacts;
  /** Asked again by Retry. The caller owns the request and the handover to the campaign. */
  onRetry: () => void;
  /** Opens the real map with no simulation state behind it. */
  onLookAtWorld: () => void;
}

export interface DegradedBootHandle {
  root: HTMLElement;
  /**
   * Put the screen into its waiting state for a retry in flight.
   *
   * A retry is a request, so `CONSTITUTION.md` section 3.2 wants something drawn for it
   * rather than a spinner, and the button has to be disabled or a second click issues a
   * second request. The player is told in words as well, because a bare grey wash says
   * "still loading" and not "you asked again and I am waiting".
   */
  setRetrying(retrying: boolean): void;
}

/** In-fiction headline. Names what did happen before what did not. */
const HEADLINE = "The map loaded. The world did not.";

/**
 * What happened, in one paragraph, above the buttons.
 *
 * The order is deliberate: the real thing first, then the missing thing, then the choice.
 * A player who reads only the first sentence still knows they have a map.
 */
const LEDE =
  "The terrain, the roads and the places on this map are real survey data, and they are on screen now. " +
  "The simulation that decides what is happening in them is not answering, so nothing about the state of " +
  "the world can be shown. Nothing has been lost and nothing has been guessed. You can look at the map, " +
  "or ask the simulation again.";

/** Shape is the primary signal for status and colour the third (ART_DIRECTION.md 5.3). */
const STATUS_KIND: Record<BootFailure["kind"], StatusKind> = {
  unreachable: "warning",
  refused: "warning",
  unreadable: "critical",
  unknown: "warning",
};

const STATUS_WORD: Record<BootFailure["kind"], string> = {
  unreachable: "Not answering",
  refused: "Refused",
  unreadable: "Unreadable reply",
  unknown: "Failed",
};

export function degradedBootScreen(options: DegradedBootOptions): DegradedBootHandle {
  const root = h("div", {
    class: "start degraded-boot",
    "data-testid": "degraded-boot",
    tabindex: "-1",
    role: "region",
    "aria-labelledby": "degraded-boot-title",
  });

  const inner = h("div", { class: "start__inner degraded-boot__inner" });

  const title = h("h1", { class: "display", tabindex: "-1", id: "degraded-boot-title" }, HEADLINE);
  inner.appendChild(h("header", { class: "start__head" }, title, h("p", { class: "lede start__lede" }, LEDE)));

  const status = h("div", { class: "degraded-boot__status", "data-testid": "degraded-boot-status" });
  status.appendChild(statusChip(STATUS_KIND[options.failure.kind], STATUS_WORD[options.failure.kind]));
  status.appendChild(
    h(
      "span",
      { class: "caption" },
      options.failure.retryable
        ? "The real survey is unaffected. Only the state of the world is missing."
        : "The simulation answered with something this client cannot read. Asking again in the same words is unlikely to help.",
    ),
  );
  inner.appendChild(status);

  const errorHost = h("div", { class: "degraded-boot__error" });
  inner.appendChild(errorHost);
  inner.appendChild(worldFactsSheet(options.facts, options.onLookAtWorld));

  root.appendChild(inner);

  let retrying = false;

  /**
   * Redraw only the error region.
   *
   * The facts sheet below it does not change while a retry is in flight — the world files
   * are already loaded and nothing about them is in question — so redrawing the whole
   * screen would be a layout shift for nothing, and would move focus off the retry button
   * mid-request.
   */
  function drawError(): void {
    clear(errorHost);
    if (retrying) {
      errorHost.appendChild(
        h(
          "p",
          { class: "caption degraded-boot__waiting", "data-testid": "degraded-boot-waiting", role: "status" },
          "Asking the simulation for the state of the world.",
        ),
      );
    }
    const sheetNode = errorState({
      // The provider's own sentence where it supplied one; a composed one otherwise.
      // Both are written to the same standard, and there is a test holding them to it.
      message: options.failure.playerMessage,
      // The developer detail goes to the console. It carries the URL, the status and the
      // port, none of which belong on a player's screen (ART_DIRECTION.md 10.3).
      detail: options.failure.developerDetail,
      // Kept wired while waiting and disabled below rather than removed: the layout does
      // not jump, the label says what the button is doing, and a `disabled` button is
      // announced as unavailable, which a missing one is not.
      onRetry: () => {
        if (!retrying) options.onRetry();
      },
      retryLabel: retrying ? "Asking the simulation again" : "Try the simulation again",
      testId: "degraded-boot-error",
    });
    errorHost.appendChild(sheetNode);
    const retry = sheetNode.querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']");
    if (retry) retry.disabled = retrying;
  }

  drawError();

  // The screen takes focus on its own heading, not on the retry button. Opening a failure
  // screen must not park the keyboard on the affirmative, which is the rule `startScreen`
  // already follows when it opens.
  queueMicrotask(() => {
    if (root.isConnected) title.focus();
  });

  return {
    root,
    setRetrying(next: boolean) {
      retrying = next;
      drawError();
    },
  };
}

/**
 * The honest half of the screen: what the world files support, and what they do not.
 *
 * `SurveyFacts` is built by counting those files, so every figure below is a count of real
 * data. The unsurveyed line is the load-bearing one. A bare "487 settlements surveyed"
 * would say every place has a population behind it, which is false for the ones with no
 * Census figure, so the two counts are printed separately and the gap is stated in the
 * same words the town panel uses for a single place. This is the Golden-settlement rule
 * applied to the whole map rather than to one town.
 */
function worldFactsSheet(facts: SurveyFacts, onLookAtWorld: () => void): HTMLElement {
  const sheetNode = h("section", { class: "sheet panel degraded-boot__world", "data-testid": "degraded-boot-world" });
  sheetNode.appendChild(
    h("header", { class: "panel__header" }, h("h2", { class: "panel__title" }, "What is on the map")),
  );

  const body = h("div", { class: "panel__body" });
  const list = h("dl", { class: "start__facts" });
  list.appendChild(fact("Region", facts.regionName || "The loaded region"));
  list.appendChild(fact("Places surveyed", facts.settlements.toLocaleString("en-US")));
  list.appendChild(
    fact(
      "With a real population figure",
      `${facts.surveyed.toLocaleString("en-US")} of ${facts.settlements.toLocaleString("en-US")}`,
    ),
  );
  if (facts.unsurveyed > 0) {
    list.appendChild(
      fact("Without one", `${facts.unsurveyed.toLocaleString("en-US")} — shown as "${facts.unsurveyedWording}"`),
    );
  }
  list.appendChild(fact("Roads", facts.roads.toLocaleString("en-US")));
  list.appendChild(fact("Rail lines", facts.rail.toLocaleString("en-US")));
  if (facts.retrieved) list.appendChild(fact("Survey retrieved", facts.retrieved));
  body.appendChild(list);

  // What is missing is stated as a fact about the data rather than as an apology. Naming
  // the absent systems is what stops a player reading this map as a paused campaign.
  body.appendChild(
    h(
      "p",
      { class: "danger degraded-boot__absent", "data-testid": "degraded-boot-absent" },
      h("span", { class: "label" }, "Not available"),
      h(
        "span",
        { class: "caption" },
        " Prices, unrest, who holds what, the ledger and the cause log are computed by the simulation. " +
          "It is not running, so this client shows no figure for any of them rather than inventing one.",
      ),
    ),
  );

  body.appendChild(
    h(
      "div",
      { class: "field-row degraded-boot__actions" },
      button("Look at the world", onLookAtWorld, { variant: "primary", testId: "degraded-boot-world-open" }),
    ),
  );

  sheetNode.appendChild(body);
  return sheetNode;
}

function fact(label: string, value: string): HTMLElement {
  return h(
    "div",
    { class: "start__fact" },
    h("dt", { class: "label" }, label),
    h("dd", { class: "start__fact-value" }, value),
  );
}
