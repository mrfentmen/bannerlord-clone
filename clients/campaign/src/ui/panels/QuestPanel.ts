/**
 * The quest log. `QUESTS_AND_NOTABLES.md` sections 3, 5 and 9, `UI_UX.md` section 2's
 * "Quest log" row, `docs/missing-vs-bannerlord.md` row 4.4.
 *
 * A list of the requests this party can act on, the one the player has open in full, and
 * three buttons: take it on, report it done, walk away. The request is the unit, not the
 * step and not the objective: `IssueRequirement` carries the words and the figures but
 * nothing here can be part-completed by hand, because a quest log with per-objective
 * checkboxes would be a second progress system and a player could never tell which of the
 * two they were reading.
 *
 * Five rules shape the code here, and all five are the simulation's rules rather than this
 * file's.
 *
 * **The client has no say in whether a request is met.** `progress` and
 * `requirement.met` are the simulation's own readings, recomputed from the world every
 * tick, and they are drawn. The *report it done* button is therefore shown for every
 * accepted request and never gated on `met`: an offer taken four days ago is measured
 * against a baseline the player has not seen, and a client that hid the button until the
 * gauge crossed a line would be deciding the matter the sim exists to settle. The refusal
 * arrives in the sim's own sentence and is printed in full.
 *
 * **The board's order is the board's, and this file has no sort of its own.** The
 * simulation orders the log so live work is first, then the offer that expires soonest,
 * then history newest first, and the list is drawn in whatever order the board arrived in.
 * A settled request is swapped into that order rather than appended to it, because a list
 * that reshuffles on the same click that pressed the button is a list nobody can hit; the
 * simulation's own ordering comes back on the next read, which is the app's to ask for.
 *
 * **Ignoring and walking away are different, and both cost something.** An offer lapses on
 * its own and the notable notices; `abandonPenalty` is a separate, larger number, and it is
 * printed *before* the button rather than only in the refusal afterwards. A panel that
 * mentioned the cost after the fact would be telling the player what it costs to find out
 * what it costs.
 *
 * **The first frame is a skeleton, not a blank and not an error.** Handed no board, the
 * panel draws `quest-skeleton`, shaped as the list-over-detail it is about to draw, and
 * then asks for it. Only a request that has actually failed gets a plain message and a
 * real way to retry (CONSTITUTION.md sections 3.2 and 1.3).
 *
 * **Every word the simulation writes is printed as written.** The requirement sentence, the
 * step log, the verdict, the reason for a refusal, the reward. This file formats numbers
 * and adds headings, and decides nothing about what any of them mean.
 */

import { h, sectionHeader } from "../dom.js";
import { emptyState, errorState, gauge, panel, stamp, statusChip, type StatusKind } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import { questSkeletonBody } from "./panel-skeletons.js";
import type {
  Issue,
  IssueAction,
  IssueActionResult,
  IssueBoard,
  IssueKind,
  IssueReward,
  IssueState,
  Notable,
  SimulationProvider,
} from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/** The three kinds of request, as a player would name them rather than as the sim keys them. */
const KIND_WORD: Record<IssueKind, string> = {
  "deliver-goods": "Deliver goods",
  "clear-hideout": "Clear a hideout",
  escort: "Escort",
};

/** The four states, as the short word a status chip can carry. */
const STATE_WORD: Record<IssueState, string> = {
  offered: "Offered",
  accepted: "Accepted",
  succeeded: "Done",
  failed: "Failed",
};

/** `RULERS.md` section 2 relation, as one of the five status kinds the kit already has. */
const STATE_KIND: Record<IssueState, StatusKind> = {
  offered: "info",
  accepted: "warning",
  succeeded: "good",
  failed: "critical",
};

/**
 * What the button row says once there is nothing left to press.
 *
 * Both sentences name the log and nothing else. They do not say *why* a request failed,
 * because the sim's reason for a failure is one of three things — the notice ran out, the
 * taker walked away, or the work was refused — and a fixed sentence would be a client
 * guessing which. The log above is where the sim says which it was.
 */
const RESOLVED_SENTENCE: Record<"succeeded" | "failed", string> = {
  succeeded: "Settled. The log above is what the simulation recorded.",
  failed: "It failed. The log above is what the simulation recorded.",
};

/** The stamp a settled request carries, and whether it is a good mark or a bad one. */
const RESOLVED_STAMP: Record<"succeeded" | "failed", { text: string; kind: "critical" | "primary" }> = {
  succeeded: { text: "DONE", kind: "primary" },
  failed: { text: "FAILED", kind: "critical" },
};

/** What the row says while an order is in flight, so the button is not a dead grey box. */
const IN_FLIGHT: Record<IssueAction, string> = {
  accept: "Taking it on…",
  complete: "Sending the report…",
  abandon: "Giving it up…",
};

/**
 * The plain sentence shown when the order never reached the simulation at all.
 *
 * These are the same sentences `provider.acceptIssue` and friends use, so a network fault
 * and a refusal are worded alike and the developer detail on the console is what tells
 * them apart.
 */
const NO_ANSWER: Record<IssueAction, string> = {
  accept: "The request was not taken up.",
  complete: "The request was not closed.",
  abandon: "The request was not given up.",
};

/**
 * The log when nobody has asked for anything.
 *
 * It says what to do about it, because `CONSTITUTION.md` section 3.3 requires an empty
 * state to name the next move and an empty quest log's next move is to go somewhere people
 * are short of something.
 */
const NOTHING_ASKED =
  "No notable in the region has a request out at the moment. Requests appear when a town's own readings say " +
  "it is short of food, unsafe on its roads, or troubled, and its headman or mayor decides to ask. Travel to a " +
  "settlement that is doing badly, and one will be waiting for you.";

export interface QuestPanelOptions {
  partyId: string;
  partyName: string;
  /**
   * The log, or `null` when the caller has not read it yet.
   *
   * `null` means the panel is about to go and get it, so it draws the skeleton rather than
   * complaining about a request that was never on its way.
   */
  board: IssueBoard | null;
  provider: SimulationProvider;
  onClose?: () => void;
  /**
   * Called after every order, taken or refused.
   *
   * The app rebuilds this panel from a fresh board after an action, because completing a
   * request moves the notable's opinion, the party's purse and the town's own readings.
   */
  onAction?: (result: IssueActionResult) => void;
  onError?: (message: string) => void;
  /** The log is still being read. */
  loading?: boolean;
  /**
   * The outcome of the last order, carried across a re-render.
   *
   * Without this the confirmation the player has just earned would be wiped by the very
   * refresh that showed the new state.
   */
  lastOutcome?: { tone: "good" | "critical"; text: string } | null;
  /** Which request to open on. Defaults to the first one that can still be acted on. */
  selectedId?: string;
  testId?: string;
}

export interface QuestPanelHandle {
  root: HTMLElement;
  body: HTMLElement;
  refresh(): void;
  /** Re-read the whole log. Backs the "Try again" button, so it is a real request. */
  reload(): Promise<void>;
}

export function questPanel(options: QuestPanelOptions): QuestPanelHandle {
  const { root, body } = panel({
    title: `Quest log — ${options.partyName}`,
    testId: options.testId ?? "quest-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);

  // The panel's own copy of the log, so a settled request can be written back without a
  // round trip and without reaching into whatever the caller is holding. Copied rather
  // than referenced for that reason alone.
  let board: IssueBoard | null = copyBoard(options.board);
  let loading = options.loading ?? (options.board === null);
  let selectedId: string | null = options.selectedId ?? null;
  /** The order in flight, or `null`. Also what the action row describes itself as doing. */
  let acting: IssueAction | null = null;
  /** A read failure, which `render` draws as an error state with a retry. */
  let failure: { message: string; detail: string } | null = null;
  /** The outcome of the last order, carried across the re-render that shows it. */
  let notice: { tone: "good" | "critical"; text: string } | null = options.lastOutcome ?? null;
  let loadToken = 0;

  function issues(): Issue[] {
    return board?.issues ?? [];
  }

  /**
   * The request the player has open.
   *
   * Resolved on read rather than stored as a second truth: a selection that points at a
   * request the sim has since dropped falls back to the first one still worth acting on,
   * so opening the log never lands on a detail pane for something that no longer exists.
   */
  function selected(): Issue | null {
    const all = issues();
    if (all.length === 0) return null;
    if (selectedId !== null) {
      const found = all.find((issue) => issue.id === selectedId);
      if (found) return found;
    }
    return all.find(isActive) ?? all[0] ?? null;
  }

  /**
   * Re-read the whole log.
   *
   * A request, which is what makes the retry button honest: it can succeed where the last
   * one failed, and a button that only re-rendered the same missing log would be a lie
   * told to the player.
   */
  async function reload(): Promise<void> {
    const token = ++loadToken;
    failure = null;
    loading = true;
    render();
    try {
      const fresh = copyBoard(await options.provider.issueBoard(options.partyId));
      board = fresh;
      // A request that has left the board is dropped rather than left selected, so the
      // detail pane falls to whatever is actually on it now.
      if (selectedId !== null && !(fresh?.issues.some((issue) => issue.id === selectedId) ?? false)) selectedId = null;
    } catch (err) {
      if (token !== loadToken) return;
      failure = {
        message: err instanceof SimulationUnavailableError ? err.playerMessage : "The quest log could not be read.",
        detail: err instanceof SimulationUnavailableError ? err.developerDetail : String(err),
      };
      options.onError?.(`${failure.message} :: ${failure.detail}`);
    } finally {
      if (token === loadToken) {
        loading = false;
        render();
      }
    }
  }

  /**
   * Send one order against the open request, and take the simulation's answer for it.
   *
   * Whatever comes back replaces the request on screen, because `IssueActionResult.issue`
   * is the request as the simulation now holds it and a panel still drawing the copy it
   * started with would be reporting a state that does not exist. A refusal replaces it too:
   * the sim sends the untouched request back with a reason, and the reason is the thing
   * the player has to act on.
   */
  async function act(action: IssueAction): Promise<void> {
    if (acting !== null || board === null) return;
    const issue = selected();
    if (issue === null) return;
    // The day is stamped from the board being looked at, so an order cannot be taken up
    // against a log the player read three days ago and has since ignored.
    const request = { partyId: options.partyId, issueId: issue.id, expectedDay: board.day };
    acting = action;
    render();
    try {
      const result =
        action === "accept"
          ? await options.provider.acceptIssue(request)
          : action === "complete"
            ? await options.provider.completeIssue(request)
            : await options.provider.abandonIssue(request);
      replaceIssue(result.issue);
      notice = { tone: result.accepted ? "good" : "critical", text: outcomeText(result) };
      options.onAction?.(result);
    } catch (err) {
      const message = err instanceof SimulationUnavailableError ? err.playerMessage : NO_ANSWER[action];
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      notice = { tone: "critical", text: message };
      options.onError?.(`${message} :: ${detail}`);
    } finally {
      acting = null;
      render();
    }
  }

  /**
   * Swap one request for the sim's version of it, in place.
   *
   * In place rather than appended, because the order of the log is the simulation's and a
   * request that jumped to the bottom because the player pressed a button would be a list
   * that reorders itself under the cursor.
   */
  function replaceIssue(next: Issue): void {
    if (board === null) return;
    const at = board.issues.findIndex((issue) => issue.id === next.id);
    board = {
      ...board,
      issues: at < 0 ? [...board.issues, next] : board.issues.map((issue) => (issue.id === next.id ? next : issue)),
    };
  }

  function render(): void {
    // The focused control is remembered across the repaint, because the panel rebuilds
    // itself on every selection and every order, and a log that drops the keyboard as you
    // move through it is a log you cannot use without a mouse.
    const focused = document.activeElement;
    const focusedId = focused instanceof HTMLElement && body.contains(focused) ? focused.dataset.testid : undefined;

    body.replaceChildren();

    if (loading) {
      body.appendChild(questSkeletonBody());
      return;
    }

    if (failure !== null) {
      body.appendChild(
        errorState({
          message: failure.message,
          detail: failure.detail,
          onRetry: () => void reload(),
          testId: "quest-error",
        }),
      );
      return;
    }

    if (board === null) {
      // Neither data nor a complaint yet: the request is still in flight, and the frame
      // that says so is the skeleton rather than a blank sheet.
      body.appendChild(questSkeletonBody());
      return;
    }

    body.appendChild(head());

    if (notice !== null) {
      body.appendChild(
        h(
          "p",
          { class: "caption", "data-testid": "quest-message", role: "status", style: "margin:0 0 var(--space-3)" },
          statusChip(notice.tone, notice.text, { testId: "quest-message-chip" }),
        ),
      );
    }

    const issue = selected();

    if (issue === null) {
      body.appendChild(emptyState("No one has asked you for anything.", NOTHING_ASKED));
      return;
    }

    body.appendChild(sectionHeader("Requests"));
    body.appendChild(countLine());
    const list = h("div", { class: "quests", "data-testid": "quest-list" });
    // In the simulation's order, which is live work first and then the soonest to lapse.
    for (const entry of issues()) list.appendChild(issueCard(entry, issue.id));
    body.appendChild(list);

    body.appendChild(detail(issue));
    body.appendChild(actions(issue));

    body.appendChild(
      h(
        "p",
        { class: "caption", style: "margin:var(--space-3) 0 0" },
        "Every figure, sentence and step on this screen is the simulation's own, read from the world at the " +
          "moment it was drawn. This panel adds up nothing and decides nothing: whether a request is met is " +
          "settled there, and an order it refuses comes back in its own words.",
      ),
    );

    if (focusedId) {
      const again = body.querySelector<HTMLElement>(`[data-testid="${escapeAttribute(focusedId)}"]`);
      again?.focus();
    }
  }

  /** Whose log this is, and the day it was read on. */
  function head(): HTMLElement {
    return h(
      "div",
      { class: "field-row", "data-testid": "quest-head", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, "Asked of"),
        h("p", { class: "label", style: "margin:0" }, options.partyName),
      ),
      statusChip("neutral", `Day ${board?.day ?? 0}`, {
        testId: "quest-day",
        title: "The day this log was read. An order dated against an older board is refused rather than applied.",
      }),
    );
  }

  /** How much of the log is still worth acting on, in words as well as figures. */
  function countLine(): HTMLElement {
    const all = issues();
    const open = all.filter(isActive).length;
    return h(
      "p",
      { class: "caption", "data-testid": "quest-count", role: "status", style: "margin:0 0 var(--space-2)" },
      `${countOf(open, "request")} still open of ${all.length} on the log.`,
    );
  }

  /**
   * One request in the list, as a card the player opens.
   *
   * The whole card is the button, so its name is the accessible name and the facts ride
   * along inside it. Which facts ride along depends on the state: an open request shows
   * how long is left on it, and a settled one shows the last thing that happened to it,
   * because "6 days left" is the question a player has about an offer and a closed request
   * has no such question.
   */
  function issueCard(issue: Issue, openId: string): HTMLElement {
    const day = board?.day ?? 0;
    const card = h(
      "button",
      {
        type: "button",
        class: "quest",
        "data-testid": `quest-card-${issue.id}`,
        "aria-pressed": issue.id === openId ? "true" : "false",
        "aria-label": `${KIND_WORD[issue.kind]} asked by ${issue.notable.name} of ${issue.settlementName}, ${STATE_WORD[issue.state]}`,
      },
      h(
        "span",
        { class: "quest__head" },
        h("span", { class: "quest__name" }, issue.notable.name),
        h("span", { class: "data-sm" }, KIND_WORD[issue.kind]),
      ),
      h("span", { class: "caption" }, `${issue.settlementName} · ${issue.notable.role}`),
      h(
        "span",
        { class: "quest__foot" },
        statusChip(STATE_KIND[issue.state], STATE_WORD[issue.state], { testId: `quest-state-${issue.id}` }),
        h("span", { class: "caption" }, isActive(issue) ? noticeText(issue, day) : lastStepText(issue)),
      ),
    );
    card.addEventListener("click", () => {
      selectedId = issue.id;
      // A notice is about one request. Opening another drops it rather than leaving it
      // hanging above a detail pane it has nothing to do with.
      notice = null;
      render();
    });
    return card;
  }

  /**
   * The open request in full: how far along it is, what it wants, who asked, what it pays
   * and everything that has happened to it.
   *
   * The order is the order `QUESTS_AND_NOTABLES.md` section 9 asks for — objectives, time
   * left, the world condition behind the request, the person who wants it, the price and
   * the log — with progress first because it is the only figure that moves.
   */
  function detail(issue: Issue): HTMLElement {
    const day = board?.day ?? 0;
    const mark = resolvedStamp(issue.state);
    const wrap = h("section", { class: "panel__section", "data-testid": `quest-detail-${issue.id}` });

    wrap.appendChild(sectionHeader("The request", mark === null ? undefined : stamp(mark.text, mark.kind)));

    // What kind of request this is, in the player's words rather than the sim's key, and
    // who it is for. The card carries the same word in summary, but the card is one line
    // among nine and this is the request itself.
    wrap.appendChild(
      h(
        "p",
        { class: "quest__give", "data-testid": `quest-kind-${issue.id}` },
        `${KIND_WORD[issue.kind]}, asked of ${issue.settlementName}.`,
      ),
    );

    // Progress is the simulation's own reading of the world, recomputed every tick. It is
    // drawn and never nudged, because a quest log that could be argued into reporting more
    // progress would be reporting fiction.
    wrap.appendChild(
      gauge({
        label: "How far along it is",
        value: issue.progress,
        format: (v) => `${Math.round(v * 100)}%`,
        note: progressNote(issue, day),
        thresholds: { warningBelow: 0.25, goodAbove: 1 },
        testId: `quest-progress-${issue.id}`,
      }),
    );

    // The requirement, in the simulation's own sentence, with the figures behind it.
    wrap.appendChild(
      h(
        "div",
        { class: "quest__section", "data-testid": `quest-requirement-${issue.id}` },
        sectionHeader("What is wanted"),
        h("p", { class: "quest__give" }, issue.requirement.text),
        h("p", { class: "caption", style: "margin:0" }, requirementFigures(issue, day)),
      ),
    );

    // The giver. Every effect of this request is written against this person, so an
    // ignored request has an author and a reward has somebody to be grateful to.
    wrap.appendChild(giverBlock(issue.notable));

    wrap.appendChild(
      h(
        "div",
        { class: "quest__section", "data-testid": `quest-reward-${issue.id}` },
        sectionHeader("What it pays"),
        h("div", { class: "costs costs--four" }, ...rewardCells(issue)),
      ),
    );

    wrap.appendChild(
      h(
        "div",
        { class: "quest__section", "data-testid": `quest-log-${issue.id}` },
        sectionHeader("What has happened"),
        stepList(issue),
      ),
    );

    return wrap;
  }

  /** The person who asked, and where the player stands with them. */
  function giverBlock(notable: Notable): HTMLElement {
    return h(
      "div",
      { class: "quest__section", "data-testid": `quest-giver-${notable.id}` },
      sectionHeader("Who asked"),
      h("p", { class: "quest__give" }, `${notable.name}, ${notable.role} of ${notable.settlementName}`),
      h(
        "p",
        { class: "caption", style: "margin:0" },
        `Sways ${percent(notable.power)} of ${notable.settlementName} · standing ${signed(notable.relationToPlayer)} · ` +
          `aggrieved ${percent(notable.grievance)} · ${countOf(notable.openIssues, "other request")} out`,
      ),
      h(
        "p",
        { class: "caption", style: "margin:var(--space-1) 0 0" },
        `${notable.name} is ${standingWords(notable.relationToPlayer)} with you.`,
      ),
    );
  }

  /**
   * The reward, in the four cost cells the march planner already uses.
   *
   * All four are the simulation's figures, priced at offer time off the notable's own
   * power. `Standing` is the one the player cannot spend, and it is on the same row as the
   * money for that reason: a request that pays well and costs goodwill is a decision, and
   * a reward split across two sections would hide half of it.
   */
  function rewardCells(issue: Issue): HTMLElement[] {
    const reward: IssueReward = issue.reward;
    return [
      costCell("Money", money(reward.money), "into the war chest", "quest-reward-money"),
      costCell("Gold", count(reward.gold), "carried with you", "quest-reward-gold"),
      costCell("Renown", count(reward.renown), "spent nowhere", "quest-reward-renown"),
      costCell("Standing", signed(reward.relation), `with ${issue.notable.name}`, "quest-reward-relation"),
    ];
  }

  /**
   * The step log, oldest first, each step the simulation's own sentence.
   *
   * A quest with no steps is not a quest with nothing to report: it is a quest the
   * simulation has not written anything about yet, and the panel says so rather than
   * drawing an empty list.
   */
  function stepList(issue: Issue): HTMLElement {
    if (issue.steps.length === 0) {
      return h("p", { class: "caption", style: "margin:0" }, "Nothing recorded yet.");
    }
    const list = h("ul", { class: "quest__log" });
    for (const step of issue.steps) {
      list.appendChild(
        h(
          "li",
          { class: "quest__step" },
          h("span", { class: "quest__step-day data-sm" }, `Day ${step.day}`),
          h("span", {}, step.text),
        ),
      );
    }
    return list;
  }

  /**
   * The buttons, and the one of the three the request's state allows.
   *
   * `state` is the only thing that decides, so there is one place in this file where the
   * life of a request is acted on. An offer can only be taken on; an accepted request can
   * only be reported done or given up; a settled one offers neither, because there is no
   * order left to send.
   *
   * The report button is deliberately *not* gated on `requirement.met`. See the header
   * comment: the sim recomputes the objective every tick, and hiding the button until the
   * gauge crossed a line would be the client deciding the matter.
   */
  function actions(issue: Issue): HTMLElement {
    const row = h("div", { class: "quest__actions", "data-testid": "quest-actions" });

    if (acting !== null) {
      row.appendChild(h("p", { class: "caption", style: "margin:0", role: "status" }, IN_FLIGHT[acting]));
      return row;
    }

    if (issue.state === "offered") {
      row.appendChild(orderButton("accept", "Take it on", `quest-accept-${issue.id}`, "btn btn--primary", issue));
      return row;
    }

    if (issue.state === "accepted") {
      // What walking away costs, printed before the button rather than only in the
      // refusal afterwards. See the header comment.
      row.appendChild(
        h(
          "p",
          { class: "caption quest__penalty", "data-testid": "quest-abandon-penalty", style: "margin:0 0 var(--space-2);flex:1 1 100%" },
          `Walking away now costs ${count(Math.abs(issue.abandonPenalty))} of ${issue.notable.name}'s standing, and ` +
            `${issue.notable.name} is ${standingWords(issue.notable.relationToPlayer)} with you already.`,
        ),
      );
      row.appendChild(orderButton("complete", "Report it done", `quest-complete-${issue.id}`, "btn btn--primary", issue));
      row.appendChild(orderButton("abandon", "Walk away", `quest-abandon-${issue.id}`, "btn btn--quiet", issue));
      return row;
    }

    row.appendChild(h("p", { class: "caption", style: "margin:0" }, RESOLVED_SENTENCE[issue.state]));
    return row;
  }

  /**
   * One order button, disabled while an order of any kind is in flight.
   *
   * All three share one disabled condition rather than one each, because two orders sent
   * against the same request at once is not a thing the player meant to do.
   */
  function orderButton(
    action: IssueAction,
    label: string,
    testId: string,
    className: string,
    issue: Issue,
  ): HTMLElement {
    const hint =
      action === "complete" && !issue.requirement.met
        ? "The world does not meet the objective today. The simulation will refuse this and say what is missing."
        : undefined;
    const button = h("button", { type: "button", class: className, "data-testid": testId, ...(hint ? { title: hint } : {}) }, label);
    button.addEventListener("click", () => void act(action));
    return button;
  }

  render();
  // Handed no log, and a provider to read it from: ask. Gated on what the caller passed,
  // not on `loading`, which is true precisely because of that.
  if (options.board === null) void reload();

  return { root, body, refresh: render, reload };
}

// -- wording ------------------------------------------------------------------

/** A request can still be taken on or reported done. Anything else is history. */
function isActive(issue: Issue): boolean {
  return issue.state === "offered" || issue.state === "accepted";
}

/**
 * The stamp a settled request carries, or `null` for one still running.
 *
 * A rubber stamp on the ones that are done and the ones that failed, and nothing at all on
 * a request still in play, because a stamp is a verdict and a request the player is still
 * holding is not a thing anybody has ruled on yet.
 */
function resolvedStamp(state: IssueState): { text: string; kind: "critical" | "primary" } | null {
  return state === "succeeded" || state === "failed" ? RESOLVED_STAMP[state] : null;
}

/**
 * What the sim's answer to an order is, in one line.
 *
 * A refusal leads with the reason, because the reason names the number the player can go
 * and fix. An accepted order that settled something carries what was actually paid, which
 * is the sim's figure and not the one that was on the card.
 */
function outcomeText(result: IssueActionResult): string {
  if (!result.accepted) return result.reason ?? result.verdict;
  if (result.paid) return `${result.verdict} Paid ${paidText(result.paid)}.`;
  return result.verdict;
}

/** The reward in a sentence, naming only the parts that are not zero. */
function paidText(reward: IssueReward): string {
  const parts: string[] = [];
  if (reward.money !== 0) parts.push(money(reward.money));
  if (reward.gold !== 0) parts.push(`${count(reward.gold)} gold`);
  if (reward.renown !== 0) parts.push(`${count(reward.renown)} renown`);
  if (reward.relation !== 0) parts.push(`${signed(reward.relation)} standing`);
  return parts.length === 0 ? "nothing" : parts.join(", ");
}

/** How long is left on a request, in the sim's own units. */
function noticeText(issue: Issue, day: number): string {
  const left = issue.deadlineDay - day;
  if (left <= 0) return "the notice has run out";
  return left === 1 ? "1 day of notice left" : `${left} days of notice left`;
}

/**
 * The line under the progress gauge: two separate readings from the simulation, kept apart.
 *
 * Whether the world meets the objective, and how long is left on the notice. The notice is
 * mentioned only for a request still running, because "12 days left" on a request that
 * failed three days ago is a figure the player has to think twice before trusting, and
 * because the deadline on a settled request is a number that no longer means anything.
 */
function progressNote(issue: Issue, day: number): string {
  const met = issue.requirement.met ? "The world met the objective" : "The world did not meet the objective";
  if (!isActive(issue)) return `${met}.`;
  return `${issue.requirement.met ? "The world meets the objective today" : "The world does not meet the objective yet"}. ${noticeText(issue, day)}.`;
}

/** The last thing the sim recorded about a request, for a card whose notice is over. */
function lastStepText(issue: Issue): string {
  const last = issue.steps[issue.steps.length - 1];
  return last === undefined ? "nothing recorded" : last.text;
}

/** The figures behind the requirement sentence, as the sim's numbers. */
function requirementFigures(issue: Issue, day: number): string {
  const req = issue.requirement;
  const bits: string[] = [`${count(req.amount)} ${req.unit}`];
  bits.push(
    req.baseline === null
      ? "no baseline to measure it against"
      : `measured from ${count(req.baseline)} on day ${issue.startedDay ?? day}`,
  );
  if (req.targetName !== null) bits.push(`at ${req.targetName}`);
  // No "today" and no "yet": those would promise a request that is already closed still
  // has a future, and this reading is only ever what the world says now.
  bits.push(req.met ? "the world meets it" : "the world does not meet it");
  return `${bits.join(" · ")}.`;
}

/** One figure in a cost cell: the key, the value, and what the value is for. */
function costCell(key: string, value: string, note: string, testId: string): HTMLElement {
  return h(
    "div",
    { class: "cost", "data-testid": testId },
    h("div", { class: "cost__key" }, key),
    h("div", { class: "data" }, value),
    h("div", { class: "caption" }, note),
  );
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

/** A count and its noun, so a figure never has to be read on its own. */
function countOf(n: number, noun: string): string {
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}

/** `RULERS.md` section 2 relation, in words, at the same five bands the other panels use. */
function standingWords(relation: number): string {
  if (relation >= 30) return "well disposed";
  if (relation >= 5) return "friendly";
  if (relation >= -30) return "wary";
  return "hostile";
}

/** A detached copy of the log, so a settled request cannot write back into the caller's. */
function copyBoard(board: IssueBoard | null): IssueBoard | null {
  if (!board) return null;
  return {
    partyId: board.partyId,
    day: board.day,
    issues: board.issues.map((issue) => ({
      ...issue,
      notable: { ...issue.notable },
      requirement: { ...issue.requirement },
      reward: { ...issue.reward },
      steps: issue.steps.map((step) => ({ ...step })),
    })),
  };
}

function escapeAttribute(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
