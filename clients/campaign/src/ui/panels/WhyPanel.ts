/**
 * The Why panel. `UI_UX.md` section 5, `CAUSE_EFFECT.md` section 4.
 *
 * This is the panel the whole project exists for. `README.md` calls traceability the
 * one premise: "one change ripples into ten others, and the player can trace the chain
 * afterward." This panel is where the player does that.
 *
 * The rule that makes it a panel rather than a tooltip: it walks the chain. A single
 * cause, or a generated paragraph that says "because things went badly", is not a Why
 * panel however well it renders. So the panel never invents an order and never invents a
 * reason.
 *
 * **A chain is links, not sentences.** `CauseLink` below is the unit: a `cause`, the
 * `effect` it produced, and the `evidence` — the numbers the log actually wrote, with
 * the system that wrote them. Every printed step carries all three, so a line is
 * checkable against the record without opening anything. A chain needs
 * `MIN_CAUSE_LINKS` of them; a change with fewer links on record is not dressed up
 * into a chain, it is reported as the change it is, together with the specific
 * information the log is missing. Inventing a second link to satisfy a rule is the same
 * failure as a canned sentence, and worse, because it looks like a finding.
 *
 * The rest of the rules that make it honest:
 *
 *  - The graph is the simulation's. `walkCauseChain` rebuilds the tree the simulation
 *    sent by following `causedBy` back from the row the player asked about, in
 *    causal order, and the panel prints that order. Where the graph branches, the
 *    branch is shown; where one write feeds two effects, the second appearance says so
 *    rather than silently deduplicating and hiding a real link.
 *  - Depth is shown by indentation, so the shape of the cascade is visible before a
 *    word is read.
 *  - Every line expands to the exact values, the before and after, the system that
 *    wrote the row, the day and tick, and the cause ids. `UI_UX.md` section 5 asks for
 *    all three and the panel gives them in one press, Papers-Please style
 *    (`ART_DIRECTION.md` section 2, reference R10).
 *  - Cause ids are printed verbatim, in mono, exactly as the log holds them. A player
 *    who wants to check a chain by hand needs the same identifier the log uses.
 *  - Every numeral the panel formats itself is IBM Plex Mono with tabular figures
 *    (`ART_DIRECTION.md` section 3.1). Sentences the simulation wrote are quoted as the
 *    record holds them, because rewriting a cause row is the one thing this panel must
 *    never do.
 *  - The chain is truncated at a readable depth with an explicit "show the full
 *    chain", never silently. If the log has more to say, the panel says so and says
 *    how much.
 *
 * An empty chain is a real answer and gets real copy, not a shrug: the field was true
 * when the survey was taken and no system wrote to it, so there is nothing to walk.
 */

import { clear, h, liveRegion, announce, type Child } from "../dom.js";
import { emptyState, errorState, panel, type StatusKind } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import { whySkeletonBody, WHY_LINKS_SHOWN, WHY_RELATED_ROWS } from "./panel-skeletons.js";
import type { CauseRow, SimulationProvider, WhyChain } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/**
 * How many times one row may be printed in the same walk.
 *
 * A diamond in the graph is a real fact — one shortage caused two things — and hiding
 * the second edge would make the panel look tidier than the world is. But a graph can
 * also close a loop, and an unbounded walk of a loop is a hang. Two is enough to show
 * both edges of any diamond the systems can produce and short of unbounded.
 */
const MAX_LINKS_PER_ROW = 2;

/**
 * How many links a chain needs before the panel will call it a chain.
 *
 * Two is the floor `README.md` describes and the only shape that answers the player's
 * question: something happened (the effect), something did it (the first cause), and
 * something made that happen too. One link is a record of a change and one reason, and
 * the reason is where the log stops — so the panel says so, names the field it is
 * missing, and prints the links it does have. It does not manufacture a second link.
 */
export const MIN_CAUSE_LINKS = 2;

/** ART_DIRECTION.md section 10.2, verbatim. The two halves are shown as one sentence. */
const NOTHING_CAUSED = "Nothing caused this.";
const NOTHING_CAUSED_DETAIL = "It was true when the survey was taken.";

/** Shown when the log holds fewer than `MIN_CAUSE_LINKS` links. */
const SHORT_NONE = "One change on the record. No cause behind it.";
const SHORT_ONE = "One link on the record. The chain stops there.";
const SHORT_DETAIL =
  "A chain needs at least two links: the change, and the write behind it. What is printed below is everything the log holds.";
const NOT_ON_FILE = "Not on file:";

export interface WhyPanelOptions {
  entityId: string;
  field: string;
  /** Used in the headline when the log has no human name for the entity. */
  entityName?: string;
  provider: SimulationProvider;
  onClose?: () => void;
  /** Called when the player asks about a field this panel links to. */
  onDrill?: (entityId: string, field: string) => void;
}

export interface WhyPanelHandle {
  root: HTMLElement;
  reload(): Promise<void>;
}

// -- the chain walk -----------------------------------------------------------

/**
 * One printed row of the walk.
 *
 * This is a row, not a `CauseLink`: the walk is over rows, and a link is the edge
 * between two of them. `effectId` names the row above this one in the reading order,
 * which is the row *this row caused* — the walk follows `causedBy` backwards, so a row's
 * cause is the row it points at and its effect is the row it was reached from.
 */
export interface ChainLink {
  row: CauseRow;
  depth: number;
  /** The same write already printed higher up the chain. */
  repeat: boolean;
  /** The id of the row this row caused, or `null` for the outcome itself. */
  effectId: string | null;
}

/**
 * Turn the cause rows the simulation sent into the order the player reads.
 *
 * Depth-first from the row that was asked about, following `causedBy` backwards,
 * because a cause chain is a tree and a breadth-first flattening loses the shape that
 * makes the cascade legible. The rules that keep it honest:
 *
 *  - A row is printed at most `MAX_LINKS_PER_ROW` times. After that it is left out
 *    rather than repeated, because a closed loop in the log would otherwise never
 *    terminate the walk.
 *  - The second and later appearances are marked `repeat`, so the panel can say "the
 *    same write as above" instead of pretending to have found two different causes.
 *  - A row already on the *current path* is not followed at all. That is what makes a
 *    cycle terminate: `a` causes `b` and `b` causes `a` is two lines, not an infinite
 *    descent, because the walk refuses to return to a row it is already inside.
 *  - Any row the walk never reached is appended at the end, flat and flagged. The
 *    simulation sent it as part of this chain, so dropping it would be the client
 *    quietly editing the log.
 *
 * The function is pure and exported so the walk itself can be tested against the
 * fixture's real graphs rather than only through the rendered panel.
 */
export function walkCauseChain(rows: CauseRow[]): ChainLink[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const printed = new Map<string, number>();
  const out: ChainLink[] = [];
  const seenEdges = new Set<string>();

  const visit = (id: string, depth: number, effectId: string | null, onPath: Set<string>): void => {
    const row = byId.get(id);
    if (!row) return;
    // A row already above us on this branch is a cycle in the log. Stopping here is
    // what keeps the walk finite, and it is honest: the edge that closes the loop is
    // not shown, because printing it would show the same write as its own cause.
    if (onPath.has(id)) return;
    const times = printed.get(id) ?? 0;
    if (times >= MAX_LINKS_PER_ROW) return;
    // One edge between one pair of rows is one line, however many paths reach it.
    const edge = `${effectId ?? ""}>${id}`;
    if (seenEdges.has(edge)) return;
    seenEdges.add(edge);
    printed.set(id, times + 1);
    out.push({ row, depth, repeat: times > 0, effectId });
    const nextPath = new Set(onPath);
    nextPath.add(id);
    for (const causeId of row.causedBy) {
      visit(causeId, depth + 1, id, nextPath);
    }
  };

  if (rows.length > 0) visit(rows[0]!.id, 0, null, new Set());

  // Anything the walk could not reach, in the order the log gave it.
  const reached = new Set(out.map((l) => l.row.id));
  for (const row of rows.slice(1)) {
    if (!reached.has(row.id)) {
      printed.set(row.id, 1);
      out.push({ row, depth: 0, repeat: false, effectId: null });
    }
  }
  return out;
}

// -- the links ----------------------------------------------------------------

/**
 * The figures behind one link, exactly as the log wrote them.
 *
 * These are the numbers the player can check the edge by, so every one of them is
 * rendered in IBM Plex Mono with tabular figures (`ART_DIRECTION.md` section 3.1). The
 * system name is here because `CONSTITUTION.md` section 2 says systems read and write
 * shared state and never call each other: the system that wrote the row is therefore
 * the honest name of a cause, and "something went wrong" is not.
 */
export interface CauseEvidence {
  /** The tracked field that moved, spelled as the log spells it. */
  field: string;
  /** Where the field stood before the write. */
  before: number;
  /** Where it stood after. */
  after: number;
  /** `after - before`, signed. A level field carries no sign. */
  delta: number;
  /** In-game day of the write. */
  day: number;
  /** Tick of the write. */
  tick: number;
  /** The system that wrote the row, and so the name of the cause. */
  system: string;
}

/**
 * One edge of the chain: what did it, and what it did.
 *
 * A `CauseRow` is a write. A `CauseLink` is the claim that one write produced another,
 * and the three fields are that claim: the cause, the effect, and the figures that make
 * it checkable. The panel prints all three on every step, so a link never has to be
 * taken on trust or behind a disclosure.
 */
export interface CauseLink {
  /** The write that did the work. `causedBy` on the effect points at it. */
  cause: CauseRow;
  /** The write it produced. The first link's effect is what the player asked about. */
  effect: CauseRow;
  /** The numbers, the day and tick, and the system that wrote them. */
  evidence: CauseEvidence;
}

/** A printed step: one row of the walk, plus the link into it where there is one. */
export interface ChainStep extends ChainLink {
  /** The edge from this row to the row it caused. `null` for the outcome itself. */
  link: CauseLink | null;
}

/** One thing the log does not hold, named in the panel's own words. */
export interface MissingNote {
  /** The cause row the record stops at. */
  rowId: string;
  sentence: string;
}

export type WhyStatus = "nothing" | "chain" | "incomplete";

/**
 * What the panel can honestly say about a field, and the rows it says it with.
 *
 * `status` is the honest verdict rather than a rendering choice: `nothing` when no
 * system wrote to the field at all, `chain` when the log holds at least
 * `MIN_CAUSE_LINKS` links, and `incomplete` when it does not. `incomplete` is a real
 * answer, not a failure to find one — the change is on the record, and so is exactly
 * how far back the record goes.
 */
export interface WhyExplanation {
  status: WhyStatus;
  /** Rows in the order the player reads them: the outcome first, its causes below. */
  steps: ChainStep[];
  /** One entry per real edge, in the same order as the steps they came from. */
  links: CauseLink[];
  /** What the log is missing, one note per row the record stops at. */
  missing: MissingNote[];
}

/**
 * The figures for one edge, taken from the write the log made.
 *
 * The evidence is the *effect's* numbers: what the field read before the cause landed
 * and what it read after, the size of the move, and the stamp on the write. The cause's
 * own figures are printed on the step for the cause, so no figure is shown twice and
 * none is invented. Pure, so a test can check a chain without rendering a panel.
 */
export function evidenceFor(effect: CauseRow): CauseEvidence {
  return {
    field: effect.field,
    before: effect.old,
    after: effect.new,
    delta: effect.new - effect.old,
    day: effect.day,
    tick: effect.tick,
    system: effect.system,
  };
}

/**
 * The edges of a walk, in the order the walk printed the rows.
 *
 * The walk prints the outcome first, so the first link is the cause directly behind the
 * outcome and its effect is the outcome itself. Every link after that pairs a cause with
 * the row that cause produced. A row that is not reached from anything — the outcome, or
 * a row the log linked to nothing — is not a link and is not counted as one.
 */
export function buildCauseLinks(steps: ChainLink[]): CauseLink[] {
  const byId = new Map(steps.map((s) => [s.row.id, s.row]));
  const out: CauseLink[] = [];
  for (const step of steps) {
    if (step.effectId === null) continue;
    const effect = byId.get(step.effectId);
    if (!effect) continue; // A cause id the chain never carried is not an edge.
    out.push({ cause: step.row, effect, evidence: evidenceFor(effect) });
  }
  return out;
}

/**
 * Read a cause log as a chain, or as an honest admission that it is not one yet.
 *
 * The whole panel hangs off this, and it is pure, so the rule is testable without a
 * DOM: a chain is at least `MIN_CAUSE_LINKS` links, and everything else is reported
 * for what it is. A field nobody wrote to is `nothing`. A change with one link, or with
 * none, is `incomplete`, with a note for each row the record stops at — the field whose
 * own cause is absent, and whether the log names a cause the chain did not carry.
 */
export function explainWhy(rows: CauseRow[]): WhyExplanation {
  if (rows.length === 0) return { status: "nothing", steps: [], links: [], missing: [] };

  const walked = walkCauseChain(rows);
  const links = buildCauseLinks(walked);
  const byEdge = new Map(links.map((l) => [`${l.cause.id}>${l.effect.id}`, l]));
  const steps: ChainStep[] = walked.map((step) => ({
    ...step,
    link: step.effectId === null ? null : byEdge.get(`${step.row.id}>${step.effectId}`) ?? null,
  }));

  const onRecord = new Set(steps.map((s) => s.row.id));
  const missing: MissingNote[] = [];
  for (const [index, step] of steps.entries()) {
    if (step.row.causedBy.some((id) => onRecord.has(id))) continue;
    // The outcome is the change the player asked about, so it is not a dead end just
    // because nothing sits above it. It only is one when it stands alone.
    if (index === 0 && steps.length > 1) continue;
    const dangling = step.row.causedBy.filter((id) => !onRecord.has(id));
    missing.push(missingNote(step.row, dangling.length));
  }

  return {
    status: links.length >= MIN_CAUSE_LINKS ? "chain" : "incomplete",
    steps,
    links,
    missing,
  };
}

/**
 * One sentence about what the log does not hold, for a row the record stops at.
 *
 * It names the entity, the field and the situation rather than saying "insufficient
 * data", and when the log does name a cause that the chain did not carry, it says that
 * instead of pretending the log said nothing.
 */
function missingNote(row: CauseRow, dangling: number): MissingNote {
  const where = `${row.entityName}'s ${humanField(row.field)}`;
  const sentence =
    dangling > 0
      ? `${NOT_ON_FILE} the log names a cause for ${where}, and this chain did not carry it.`
      : `${NOT_ON_FILE} what moved ${where}. The log holds the change and nothing behind it.`;
  return { rowId: row.id, sentence };
}

// -- the panel ----------------------------------------------------------------

/** What the panel holds before the log answers, so every branch starts somewhere. */
const NO_EXPLANATION: WhyExplanation = { status: "nothing", steps: [], links: [], missing: [] };

export function whyPanel(options: WhyPanelOptions): WhyPanelHandle {
  const { root, body } = panel({
    title: "Why",
    testId: "why-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);
  const announcer = liveRegion("Reading the cause log.");
  root.appendChild(announcer);

  let chain: WhyChain | null = null;
  let explanation: WhyExplanation = NO_EXPLANATION;
  const expanded = new Set<string>();
  let showAll = false;
  let reloadToken = 0;

  async function load(): Promise<void> {
    const token = ++reloadToken;
    // The skeleton goes up before the request, so there is never a frame with neither
    // data nor placeholder (CONSTITUTION.md section 3.2).
    clear(body);
    body.appendChild(whySkeletonBody());
    announce(announcer, "Reading the cause log.");
    try {
      const result = await options.provider.why(options.entityId, options.field);
      if (token !== reloadToken) return; // A newer request already answered.
      chain = result;
      explanation = explainWhy(result.rows);
      render();
      announce(announcer, summaryForAnnouncer(explanation, result));
    } catch (err) {
      if (token !== reloadToken) return;
      chain = null;
      explanation = NO_EXPLANATION;
      const message =
        err instanceof SimulationUnavailableError
          ? err.playerMessage
          : "The reason behind that change could not be read.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      const retryable = !(err instanceof SimulationUnavailableError) || err.retryable;
      clear(body);
      body.appendChild(
        errorState({
          message,
          detail,
          testId: "why-error",
          // CONSTITUTION.md section 1.3: a message and a way out. When the simulation
          // says the failure is permanent there is nothing honest to offer but a way to
          // close the panel, which the header already carries.
          ...(retryable ? { onRetry: () => void load() } : { secondary: closeAffordance() }),
        }),
      );
      announce(announcer, message);
    }
  }

  /**
   * What the panel has to say out loud, in one sentence, before anything is read.
   *
   * A short chain is announced as short. Reading "reason found" over a panel that is
   * then obliged to explain that it has nothing to explain would be the panel lying
   * twice.
   */
  function summaryForAnnouncer(result: WhyExplanation, source: WhyChain): string {
    if (result.status === "nothing") return `${NOTHING_CAUSED} ${NOTHING_CAUSED_DETAIL}`;
    if (result.status === "incomplete") {
      return `The log holds ${result.links.length === 0 ? "the change and no cause" : "one link"}. The rest of the chain is not on file.`;
    }
    return `Reason found. ${result.links.length} links in the chain, ${source.totalDepth} deep.`;
  }

  /** A way out of a failure that retrying will not fix. */
  function closeAffordance(): HTMLElement {
    const btn = h("button", { type: "button", class: "btn", "data-testid": "why-error-dismiss" }, "Close");
    btn.addEventListener("click", () => options.onClose?.());
    return btn;
  }

  function render(): void {
    clear(body);
    if (!chain || explanation.status === "nothing") {
      // ART_DIRECTION.md section 10.2, and a real answer rather than a failure to find
      // one: the field was set before the survey and no system has written to it since.
      body.appendChild(emptyState(NOTHING_CAUSED, NOTHING_CAUSED_DETAIL));
      return;
    }

    body.appendChild(headBlock(chain));
    // A change the log cannot chain is said to be unchainable, in the same place, before
    // the rows — so the player reads the limit of the record before the record.
    if (explanation.status === "incomplete") body.appendChild(shortChainBlock(explanation));
    body.appendChild(chainBlock());
    // A chain long enough to call a chain can still stop short at its origin, and the
    // player is entitled to be told where the record ends.
    if (explanation.status === "chain" && explanation.missing.length > 0) {
      body.appendChild(
        h(
          "p",
          { class: "why__origin caption", "data-testid": "why-origin-note" },
          explanation.missing.map((n) => n.sentence).join(" "),
        ),
      );
    }

    // Truncation is stated, never silent. UI_UX.md section 5 asks for a readable depth
    // with an option to expand, and a chain that quietly ends looks like a chain that
    // ended.
    const total = explanation.steps.length;
    const shown = showAll ? total : WHY_LINKS_SHOWN;
    const hidden = total - shown;
    if (hidden > 0) {
      body.appendChild(
        h(
          "p",
          { class: "caption", "data-testid": "why-truncation" },
          "Showing ",
          mono(shown),
          " of ",
          mono(total),
          " links. The chain continues ",
          mono(hidden),
          ` more ${hidden === 1 ? "link" : "links"} deep.`,
        ),
      );
    }

    // The button only exists when it has something to open. Offering "show the full
    // chain" over a chain that is already whole is a control that does nothing.
    if (total > WHY_LINKS_SHOWN) {
      const label: Child[] = showAll
        ? ["Show less"]
        : ["Show the full chain (", mono(total), " links)"];
      const showMore = h(
        "button",
        {
          type: "button",
          class: "btn why__disclose",
          "data-testid": "why-show-all",
          "aria-expanded": showAll ? "true" : "false",
        },
        ...label,
      );
      showMore.addEventListener("click", () => {
        showAll = !showAll;
        render();
      });
      body.appendChild(showMore);
    }

    if (chain.related.length > 0) body.appendChild(relatedBlock());
  }

  /**
   * What the player asked about.
   *
   * The headline is the *question*, in the panel's own words, and the chain below it is
   * the simulation's answer. Printing the simulation's first summary in both places
   * would say the same sentence twice, which reads as two findings rather than one.
   */
  function headBlock(source: WhyChain): HTMLElement {
    const head = source.rows[0]!;
    const wrap = h("section", { class: "why__head-block" });
    wrap.appendChild(h("h3", { class: "why__headline" }, `Why did ${head.entityName}'s ${humanField(head.field)} change?`));
    wrap.appendChild(
      h(
        "p",
        { class: "why__meta caption" },
        `${head.entityName} · day `,
        mono(head.day),
        " · tick ",
        mono(head.tick),
        ` · the ${head.system} system wrote this`,
      ),
    );
    return wrap;
  }

  /**
   * The chain, as linked steps. A change the log cannot chain says so in words, and
   * names what is missing, rather than being padded out to look like a chain.
   */
  function shortChainBlock(result: WhyExplanation): HTMLElement {
    const box = h("div", { class: "empty", "data-testid": "why-short-chain" });
    box.appendChild(
      h("p", { class: "empty__headline label" }, result.links.length === 0 ? SHORT_NONE : SHORT_ONE),
    );
    box.appendChild(h("p", { class: "empty__detail caption" }, SHORT_DETAIL));
    const list = h("ul", { class: "why__missing" });
    for (const note of result.missing) {
      list.appendChild(h("li", { class: "caption", "data-testid": "why-missing" }, note.sentence));
    }
    box.appendChild(list);
    return box;
  }

  function chainBlock(): HTMLElement {
    const section = h("section", { class: "panel__section why__section" });
    section.appendChild(
      h("h3", { class: "section-header" }, h("span", {}, "Cause chain"), h("hr", { class: "form-rule" })),
    );
    const list = h("ol", { class: "why__chain", "data-testid": "why-chain" });
    // The first row is the result. Everything after it is a cause, so it is drawn at
    // least one step in and carries the "<-" from the shape in UI_UX.md section 5.
    const visible = showAll ? explanation.steps : explanation.steps.slice(0, WHY_LINKS_SHOWN);
    for (const step of visible) list.appendChild(stepNode(step));
    section.appendChild(list);
    return section;
  }

  function stepNode(step: ChainStep): HTMLElement {
    const { row, depth } = step;
    const isOpen = expanded.has(row.id);
    const shown = Math.min(depth, 4);
    const detailId = `why-detail-${row.id}`;

    const item = h("li", { class: "why__item" });
    const inner = h("div", {
      class: "why__link",
      "data-depth": String(shown),
      "data-testid": `why-link-depth-${shown}`,
      "data-cause": row.id,
    });
    if (step.repeat) inner.dataset.repeat = "true";

    const toggle = h(
      "button",
      {
        type: "button",
        class: "why__toggle",
        "data-testid": "why-link",
        "aria-expanded": isOpen ? "true" : "false",
        "aria-controls": detailId,
      },
      depth > 0 ? h("span", { class: "why__arrow", "aria-hidden": "true" }, "←") : null,
      h("span", { class: "why__summary" }, row.summary),
      // The line is expanded, so say which line in words rather than relying on the
      // marker alone.
      h("span", { class: "visually-hidden" }, isOpen ? ", open" : ", closed"),
    );
    toggle.addEventListener("click", () => {
      if (expanded.has(row.id)) expanded.delete(row.id);
      else expanded.add(row.id);
      render();
    });
    inner.appendChild(toggle);

    // The link itself, outside the disclosure: the cause, the effect and the figures.
    // A chain the player has to open line by line to check is a chain they will not
    // check, and the edge is the point of this panel rather than a detail of it.
    inner.appendChild(edgeBlock(step));

    if (step.repeat) {
      inner.appendChild(
        h("p", { class: "why__repeat caption", "data-testid": "why-repeat" },
          "The same write as an earlier line. One cause, two effects."),
      );
    }

    if (isOpen) inner.appendChild(detailBlock(row, detailId));
    else inner.appendChild(h("div", { id: detailId, hidden: true, class: "why__detail-slot" }));

    // A line about another entity is a question about that entity, so it is offered as
    // one. Without it a chain that leaves the town stops at the border.
    if (row.entityId !== options.entityId) {
      const drill = h(
        "button",
        { type: "button", class: "why__disclose", "data-testid": "why-drill" },
        `Ask about ${row.entityName}'s ${humanField(row.field)}`,
      );
      drill.addEventListener("click", () => options.onDrill?.(row.entityId, row.field));
      inner.appendChild(drill);
    }

    item.appendChild(inner);
    return item;
  }

  /**
   * One step as a link: the cause, the effect, and the evidence for the edge.
   *
   * For every step below the outcome the pair is the row itself as the cause and the row
   * it produced as the effect. The outcome has no link into it, so it names the nearest
   * cause the record holds — the step printed directly below it — and says that is what
   * it is. Where the record holds no cause at all, the line says so and leaves the space
   * empty rather than filling it.
   *
   * `data-edge` is the same string for both ends of one link, so the edge is counted
   * once however many lines show it. A panel that printed the same link from both ends
   * could otherwise pass for a chain of two links, and "one link on the record" is the
   * whole difference between an honest answer and an invented one.
   */
  function edgeBlock(step: ChainStep): HTMLElement {
    const isOutcome = step.effectId === null;
    const nearestStep = isOutcome
      ? explanation.steps.find((s) => s.effectId === step.row.id) ?? null
      : null;
    const cause = step.link?.cause ?? nearestStep?.row ?? null;
    const effect = step.link?.effect ?? step.row;

    const box = h("div", { class: "why__edge why__detail", "data-testid": "why-edge" });
    box.dataset.system = effect.system;
    if (cause) {
      box.dataset.causeId = cause.id;
      box.dataset.edge = `${cause.id}>${effect.id}`;
      box.appendChild(edgeLine("Cause", cause, isOutcome ? "Nearest cause on record." : ""));
    } else {
      box.appendChild(
        h(
          "p",
          { class: "why__edgeline", "data-testid": "why-edge-nocause" },
          h("span", { class: "label" }, "Cause"),
          " No cause is on record for this change.",
        ),
      );
    }
    box.appendChild(
      edgeLine("Effect", effect, isOutcome ? "The change you asked about." : ""),
    );
    box.appendChild(evidenceBlock(step.link?.evidence ?? evidenceFor(effect)));
    return box;
  }

  /**
   * One half of a link. The system's own name leads, because `CONSTITUTION.md` section 2
   * makes the system the honest name of a cause, and the cause row's own sentence and
   * identifier follow it verbatim so the edge can be checked against the log.
   */
  function edgeLine(label: string, row: CauseRow, qualifier: string): HTMLElement {
    return h(
      "p",
      { class: "why__edgeline" },
      h("span", { class: "label" }, label),
      qualifier ? ` ${qualifier} ` : " ",
      `${row.system} system · ${humanField(row.field)}: `,
      row.summary,
      " ",
      h("code", { class: "why__id data-sm" }, row.id),
    );
  }

  /**
   * The figures. Every numeral here is one the panel formatted itself, so every one of
   * them is set in IBM Plex Mono with tabular figures (`ART_DIRECTION.md` section 3.1):
   * a column of evidence that shifts as it updates cannot be checked by eye.
   */
  function evidenceBlock(e: CauseEvidence): HTMLElement {
    const change = h(
      "span",
      { class: "why__change" },
      h("span", { class: "why__before" }, fmt(e.before)),
      h("span", { class: "why__arrow-plain", "aria-hidden": "true" }, " → "),
      h("span", { class: "why__after" }, fmt(e.after)),
      h("span", { class: "why__delta" }, ` ${signed(e.delta)}`),
    );
    return h(
      "div",
      { class: "why__evidence", "data-testid": "why-evidence" },
      h("p", { class: "why__fieldline" }, h("span", { class: "label" }, "Evidence"), change),
      h(
        "p",
        { class: "why__stamp caption" },
        `${humanField(e.field)} · the ${e.system} system wrote this on day `,
        mono(e.day),
        ", tick ",
        mono(e.tick),
        ".",
      ),
    );
  }

  /**
   * The expand-a-line form. Everything `UI_UX.md` section 5 asks for on one press: the
   * exact values, and the system that wrote them. Plus the identifiers, because a chain
   * the player cannot check against the log is a story rather than a record.
   */
  function detailBlock(row: CauseRow, detailId: string): HTMLElement {
    const detail = h("div", { class: "why__detail", id: detailId, "data-testid": "why-detail" });
    detail.appendChild(
      h(
        "div",
        { class: "why__fieldline" },
        h("span", { class: "label" }, humanField(row.field)),
        h(
          "span",
          { class: "why__change" },
          h("span", { class: "why__before" }, fmt(row.old)),
          h("span", { class: "why__arrow-plain", "aria-hidden": "true" }, " → "),
          h("span", { class: "why__after" }, fmt(row.new)),
        ),
      ),
    );
    detail.appendChild(
      h(
        "p",
        { class: "caption" },
        `System: ${row.system}. Entity: ${row.entityName}. Written on day `,
        mono(row.day),
        ", tick ",
        mono(row.tick),
        ".",
      ),
    );
    detail.appendChild(causeIdLine(row, "why-cause-id"));
    if (row.causedBy.length > 0) {
      const line = h("p", { class: "why__causedby caption" }, "Caused by ");
      for (const [index, id] of row.causedBy.entries()) {
        if (index > 0) line.appendChild(h("span", {}, ", "));
        line.appendChild(h("code", { class: "why__id data-sm" }, id));
      }
      detail.appendChild(line);
    }
    return detail;
  }

  /** A cause id, printed exactly as the log holds it, in mono. */
  function causeIdLine(row: CauseRow, testId: string): HTMLElement {
    return h(
      "p",
      { class: "why__idline" },
      h("span", { class: "label" }, "Cause "),
      h("code", { class: "why__id data-sm", "data-testid": testId }, row.id),
    );
  }

  /** Rows the log holds for this entity that this walk did not link. */
  function relatedBlock(): HTMLElement {
    const section = h("section", { class: "why__related" });
    section.appendChild(h("h4", { class: "section-header" }, "Also changed here"));
    const list = h("ul", { class: "ledger__list" });
    for (const row of (chain?.related ?? []).slice(0, WHY_RELATED_ROWS)) {
      const item = h(
        "li",
        {},
        h(
          "button",
          { type: "button", class: "ledger__item why__drill", "data-testid": "why-related-row" },
          h("span", {}, `${humanField(row.field)} (${row.system})`),
          h("span", { class: "ledger__amount data" }, `${fmt(row.old)} → ${fmt(row.new)}`),
        ),
      );
      item.querySelector("button")?.addEventListener("click", () => options.onDrill?.(row.entityId, row.field));
      list.appendChild(item);
    }
    section.appendChild(list);
    return section;
  }

  void load();
  return { root, reload: load };
}

/**
 * A number the panel formatted itself, set in IBM Plex Mono with tabular figures.
 *
 * `ART_DIRECTION.md` section 3.1 allows no other face for a numeral inside a cause
 * chain, and the type is only worth anything because the generated stylesheet says so,
 * which is what `src/ui/__tests__/panels.test.ts` asserts.
 */
function mono(v: number): HTMLElement {
  return h("span", { class: "data-sm" }, v.toLocaleString("en-US"));
}

/** A whole number, or a fraction trimmed of its trailing zeros. Never `NaN`. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "not recorded";
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return v
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}

/** The size of a move. A level field carries no sign, the way the ledger does it. */
function signed(v: number): string {
  if (!Number.isFinite(v)) return "not recorded";
  if (v === 0) return fmt(0);
  return `${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}`;
}

/**
 * A field name in the panel's own words.
 *
 * The log spells fields as the systems do — `foodStock`, `food_production`,
 * `loyalty_to_leader` — and all three are identifiers, not copy. Splitting on the camel
 * case as well as the underscores turns them into English without inventing anything.
 */
function humanField(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/** Convenience for the map and the HUD: the status a field currently reads. */
export function statusForWarning(severity: "critical" | "warning"): StatusKind {
  return severity === "critical" ? "critical" : "warning";
}
