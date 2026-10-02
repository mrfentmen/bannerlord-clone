/**
 * Diplomacy panel (integration for diplomacy tasks 81-90).
 *
 * The working surface for foreign affairs: the diplomatic reputation
 * meter, the reason-required relation-change feed, treaty compliance,
 * and the border-incident inbox with responses. The host supplies the
 * current season (relation changes are season-stamped).
 */

import { button, h, numberField, row, sectionHeader } from "../dom.js";
import { dataTable, emptyState, panel, type Column } from "../kit.js";
import {
  adjustRelation,
  relationNotifications,
  relationWith,
  type RelationNotification,
} from "../../diplomacy/relationNotifications.js";
import {
  diplomaticReputation,
  reputationMeterLine,
  reputationTitle,
  REPUTATION_ACTIONS,
  REPUTATION_DRIFT,
  REPUTATION_EFFECTS,
  type ReputationAction,
} from "../../diplomacy/reputation.js";
import {
  treatyCompliance,
  type TreatyStatus,
} from "../../diplomacy/treaties.js";
import {
  answerBorderIncident,
  INCIDENT_RESPONSES,
  pendingBorderIncidents,
  type BorderIncident,
  type IncidentResponse,
} from "../../diplomacy/borderIncidents.js";
import {
  activeWars,
  declareWarGoal,
  endWar,
  tickWarWeariness,
  WAR_GOALS,
  WAR_GOAL_DESCRIPTIONS,
  type WarGoal,
} from "../../diplomacy/warGoals.js";
import { EMPTY_PEACE_TERMS, negotiatePeace } from "../../diplomacy/peaceConcessions.js";
import { suggestTribute } from "../../diplomacy/tributeCalculator.js";
import { rankGreatPowers, type ClanPower, type PowerRank } from "../../diplomacy/greatPowers.js";
import { markHintShown, shouldShowHint } from "../../onboarding/hintCooldown.js";
import "./diplomacyPanel.css";

/**
 * Each reputation action, in a sentence rather than a slug. The ids in
 * `REPUTATION_EFFECTS` are for the code; a player reading "broke-treaty" learns
 * nothing about what they just did.
 */
const REPUTATION_ACTION_LABEL: Record<ReputationAction, string> = {
  "kept-treaty": "Kept a treaty",
  "honored-deal": "Honoured a deal",
  "paid-tribute": "Paid tribute on time",
  "freed-prisoners": "Freed prisoners",
  "broke-treaty": "Broke a treaty",
  "betrayed-ally": "Betrayed an ally",
  "sacked-town": "Sacked a town",
  "executed-envoy": "Executed an envoy",
};

export interface DiplomacyPanelOptions {
  /** Campaign season; relation changes are stamped with it. */
  currentSeason: number;
  /**
   * The powers the player wants compared, as the caller holds them. Task 221.
   *
   * There is no faction roster in the diplomacy layer's own state, so the power
   * board is drawn only when the caller supplies one — a table of invented
   * strengths would be a map made of guesses. Omitted, the section is absent.
   */
  powers?: ClanPower[];
  onClose?: () => void;
  testId?: string;
}

export function diplomacyPanel(options: DiplomacyPanelOptions): HTMLElement {
  return buildDiplomacyPanel(options, null);
}

function buildDiplomacyPanel(options: DiplomacyPanelOptions, notice: string | null): HTMLElement {
  const { root, body } = panel({
    title: "Diplomacy",
    testId: options.testId ?? "diplomacy-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  if (notice) {
    body.appendChild(
      h("p", { class: "caption", "data-testid": "diplomacy-notice" }, notice),
    );
  }

  // Contextual hint, at most once per 10 minutes (solo task 92).
  if (shouldShowHint("diplomacy.intro")) {
    markHintShown("diplomacy.intro");
    body.appendChild(
      h("p", { class: "caption", "data-testid": "hint-diplomacy-intro" },
        "Answer border incidents before they fester. Every relation change is logged with its reason."),
    );
  }

  const rerender = (nextNotice: string | null = null) => {
    root.replaceWith(buildDiplomacyPanel(options, nextNotice));
  };

  body.appendChild(sectionHeader("Standing"));
  const rep = diplomaticReputation();
  body.appendChild(row("Reputation", `${rep} — ${reputationTitle(rep)}`, { mono: true }));
  body.appendChild(
    h("p", { class: "caption", "data-testid": "diplomacy-reputation" }, reputationMeterLine()),
  );
  body.appendChild(reputationEffectsLegend());

  const powers = powerBoard(options.powers);
  if (powers) body.appendChild(powers);

  body.appendChild(sectionHeader("War goals"));
  const wars = activeWars();
  if (wars.length === 0) {
    body.appendChild(emptyState("No declared wars", "Declare a war goal against an enemy faction to fight with purpose."));
  } else {
    const columns: Column<(typeof wars)[number]>[] = [
      { header: "Enemy", render: (w) => w.enemyName },
      { header: "Goal", render: (w) => w.goal ? `${w.goal} — ${WAR_GOAL_DESCRIPTIONS[w.goal]}` : "None declared" },
      { header: "Weariness", numeric: true, render: (w) => `${Math.round(w.weariness)}` },
      {
        header: "Orders",
        render: (w) =>
          button("End war", () => { endWar(w.id); rerender(); }, { variant: "quiet", testId: `war-end-${w.id}` }),
      },
    ];
    body.appendChild(dataTable("War goals", columns, wars, "diplomacy-wars"));
  }
  const enemyInput = h("input", {
    type: "text",
    placeholder: "Enemy faction",
    "aria-label": "Enemy faction",
    "data-testid": "war-enemy-input",
  }) as HTMLInputElement;
  const goalSelect = h(
    "select",
    { "aria-label": "War goal", "data-testid": "war-goal-select" },
    ...WAR_GOALS.map((g) => h("option", { value: g }, g)),
  ) as HTMLSelectElement;
  body.appendChild(
    h("div", { class: "form-row" }, enemyInput, goalSelect,
      button("Declare goal", () => {
        const enemy = enemyInput.value.trim();
        if (!enemy) return;
        declareWarGoal(enemy.toLowerCase().replace(/\s+/g, "-"), enemy, goalSelect.value as WarGoal, options.currentSeason);
        rerender();
      }, { testId: "war-declare" }),
      button("Season passes", () => { tickWarWeariness(); rerender(); }, { variant: "quiet", testId: "war-tick" }),
    ),
  );

  // -- peace negotiation (solo task 84): terms against a live war ---------
  if (wars.length > 0) {
    body.appendChild(sectionHeader("Negotiate peace"));
    const peaceWar = h(
      "select",
      { "aria-label": "War to negotiate", "data-testid": "peace-war-select" },
      ...wars.map((w) => h("option", { value: w.id }, w.enemyName)),
    ) as HTMLSelectElement;
    const { field: scoreField, input: scoreInput } = numberField("peace-score", "War score (-100 to 100)", 0, { min: -100, max: 100 });
    const { field: coinField, input: coinInput } = numberField("peace-coin", "Coin offered", 0, { min: 0 });
    const peaceLine = h("p", { class: "caption", "data-testid": "peace-result", role: "status" },
      "Set terms; the odds read comes from their weariness and your war score.");
    body.appendChild(
      h("div", { class: "form-row" }, peaceWar, scoreField, coinField,
        button("Read the odds", () => {
          const war = wars.find((w) => w.id === peaceWar.value);
          if (!war) return;
          const score = Number(scoreInput.value);
          const coin = Number(coinInput.value);
          if (!Number.isFinite(score) || !Number.isFinite(coin) || coin < 0) return;
          const view = negotiatePeace(war.enemyName, score, war.weariness, { ...EMPTY_PEACE_TERMS, coinOffered: coin });
          peaceLine.textContent = view.line;
        }, { testId: "peace-read" }),
      ),
    );
    body.appendChild(peaceLine);
  }

  body.appendChild(sectionHeader("Border incidents"));
  const incidents = pendingBorderIncidents();
  if (incidents.length === 0) {
    body.appendChild(emptyState("Quiet borders", "No incidents await a response."));
  } else {
    for (const incident of incidents) {
      body.appendChild(incidentCard(incident, options.currentSeason, (line) => rerender(line)));
    }
  }

  body.appendChild(sectionHeader("Treaties"));
  const treaties = treatyCompliance();
  if (treaties.length === 0) {
    body.appendChild(emptyState("No treaties", "Signed treaties and their compliance appear here."));
  } else {
    const columns: Column<TreatyStatus>[] = [
      { header: "Treaty", render: (t) => t.treaty.name },
      { header: "With", render: (t) => t.treaty.factionName },
      {
        header: "Status",
        render: (t) => (t.underStrain ? `▲ Under strain (${t.brokenTerms} broken)` : "◆ Holding"),
      },
    ];
    body.appendChild(dataTable("Treaties", columns, treaties, "diplomacy-treaties"));
  }

  // -- tribute (task 214) -----------------------------------------------------
  // `suggestTribute` reads the power differential and says who should pay and how
  // much; it was written for this and wired to nothing. The panel supplies the
  // three numbers it needs — the two power scores and the income the coin scales
  // against — and prints its line. The panel does not decide who pays and does not
  // do the arithmetic a second time.
  body.appendChild(sectionHeader("Tribute"));
  const { field: yourPowerField, input: yourPowerInput } = numberField("tribute-your-power", "Your power", 1000, { min: 0 });
  const { field: theirPowerField, input: theirPowerInput } = numberField("tribute-their-power", "Their power", 1000, { min: 0 });
  const { field: incomeField, input: incomeInput } = numberField("tribute-income", "Your income a season", 1000, { min: 1 });
  const tributeLine = h("p", {
    class: "caption",
    "data-testid": "tribute-suggestion",
    role: "status",
  }, "Read the odds: the calculator says who pays and how much.");
  const tributeAmount = numberField("tribute-amount", "Amount to send", 0, { min: 0 });
  const tributePay = h(
    "p",
    { class: "caption", "data-testid": "tribute-payable", role: "status" },
    "Nothing is payable until the calculator names an amount.",
  );
  body.appendChild(
    h("div", { class: "form-row" }, yourPowerField, theirPowerField, incomeField),
  );
  body.appendChild(
    button("Read the tribute", () => {
      const yourPower = Number(yourPowerInput.value);
      const theirPower = Number(theirPowerInput.value);
      const income = Number(incomeInput.value);
      if (!Number.isFinite(yourPower) || !Number.isFinite(theirPower) || yourPower < 0 || theirPower < 0) {
        tributeLine.textContent = "Power scores cannot be negative.";
        tributePay.textContent = "Nothing is payable until the calculator names an amount.";
        return;
      }
      if (!Number.isFinite(income) || income <= 0) {
        tributeLine.textContent = "Income has to be positive for the coin to scale against.";
        tributePay.textContent = "Nothing is payable until the calculator names an amount.";
        return;
      }
      try {
        const suggestion = suggestTribute(yourPower, theirPower, income);
        tributeLine.textContent = suggestion.line;
        // The slider (task 215) opens on the suggested figure and stays editable:
        // the calculator prices the demand, the player decides what to send.
        tributeAmount.input.value = String(suggestion.amount);
        tributePay.textContent =
          suggestion.amount === 0
            ? suggestion.payer === "you"
              ? "Nothing is owed to them."
              : "They owe nothing you can collect."
            : `You would send $${suggestion.amount.toLocaleString("en-US")} a season, and they would be expected to refuse.`;
      } catch (e) {
        tributeLine.textContent = e instanceof Error ? e.message : "The tribute could not be priced.";
        tributePay.textContent = "Nothing is payable until the calculator names an amount.";
      }
    }, { testId: "tribute-read" }),
  );
  body.appendChild(tributeLine);
  body.appendChild(h("div", { class: "form-row" }, tributeAmount.field));
  body.appendChild(tributePay);
  body.appendChild(
    h(
      "p",
      { class: "annotation", style: "font-size:var(--type-caption-size)" },
      "The panel prices the demand; the answer is theirs. Nothing here records a payment.",
    ),
  );

  body.appendChild(sectionHeader("Relation changes"));
  const feed = relationNotifications().slice(0, 20);
  if (feed.length === 0) {
    body.appendChild(emptyState("No changes recorded", "Every relation change is logged here with its reason."));
  } else {
    const columns: Column<RelationNotification>[] = [
      { header: "Faction", render: (n) => n.factionName },
      { header: "Change", numeric: true, render: (n) => `${n.delta >= 0 ? "▲+" : "▼"}${n.delta}` },
      { header: "Now", numeric: true, render: (n) => `${n.newValue}` },
      { header: "Reason", render: (n) => n.reason },
    ];
    body.appendChild(dataTable("Relation changes", columns, feed, "diplomacy-relations"));
  }

  return root;
}

/**
 * The power board. Task 221.
 *
 * A composite strength estimate per faction, ranked, with the gap to the leader and
 * a one-line verdict. The scoring is `rankGreatPowers` from
 * `src/diplomacy/greatPowers.ts` — troops, towns, treasury and reputation weighted
 * into one number by that module and not re-derived here, because a second opinion
 * about who is stronger is exactly the thing that makes a war-starting panel
 * untrustworthy. The panel draws the ranking it is given.
 *
 * Absent a roster, nothing is drawn: there is no faction list in the diplomacy
 * layer's own state, and a table of strengths nobody supplied would be a map made
 * of guesses. An empty roster is a different thing and says so.
 */
function powerBoard(powers: ClanPower[] | undefined): HTMLElement | null {
  if (powers === undefined) return null;
  const wrap = h("section", { "data-testid": "diplomacy-powers" });
  wrap.appendChild(sectionHeader("Strength of the powers"));

  if (powers.length === 0) {
    wrap.appendChild(
      emptyState("No powers to compare", "Nobody has been measured yet. Powers appear once the campaign reports them."),
    );
    return wrap;
  }

  const ranked = rankGreatPowers(powers);
  const columns: Column<PowerRank>[] = [
    { header: "#", numeric: true, render: (p) => String(p.rank) },
    { header: "Power", render: (p) => h("span", { class: "label" }, p.clanName) },
    { header: "Strength", numeric: true, testId: "power-score", render: (p) => p.score.toLocaleString("en-US") },
    { header: "Behind the leader", numeric: true, render: (p) => (p.gapToLeader === 0 ? "—" : p.gapToLeader.toLocaleString("en-US")) },
    { header: "Reading", render: (p) => p.verdict },
  ];
  wrap.appendChild(dataTable("Power ranking", columns, ranked, "diplomacy-power-table"));
  wrap.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:var(--space-2) 0 0" },
      "Strength is troops, towns held, treasury and standing, weighted together by the campaign. It is an estimate, not a count.",
    ),
  );
  return wrap;
}

/**
 * What moves the reputation meter. Task 225.
 *
 * A meter with no explanation is a number the player can only watch, so the list
 * of actions and their weights is printed under it. The weights are
 * `REPUTATION_EFFECTS` from `src/diplomacy/reputation.ts`, which owns them — the
 * panel prints that table and does not restate a figure of its own, because a
 * reputation action worth -12 in one place and -10 in another is how a player stops
 * believing the meter.
 *
 * Built as a real `<details>` disclosure rather than a `title` attribute: a tooltip
 * is unreachable by keyboard and by touch, and this is the difference between
 * honouring an oath and being branded an oathbreaker.
 *
 * The sign carries in the word as well as the number — "costs 12", "gains 4" —
 * because the effect is a direction, not just a magnitude.
 */
function reputationEffectsLegend(): HTMLElement {
  const details = h("details", {
    class: "reputation-legend",
    "data-testid": "reputation-effects",
  });
  details.appendChild(
    h("summary", { class: "label" }, "What moves your reputation"),
  );
  const list = h("ul", { class: "reputation-legend__list" });
  for (const action of REPUTATION_ACTIONS) {
    const effect = REPUTATION_EFFECTS[action];
    const item = h("li", {
      class: "reputation-legend__row",
      "data-testid": `reputation-effect-${action}`,
      "data-direction": effect >= 0 ? "up" : "down",
    });
    item.append(
      h("span", { class: "label" }, REPUTATION_ACTION_LABEL[action]),
      h(
        "span",
        { class: "row__value data" },
        effect >= 0 ? `gains ${effect}` : `costs ${Math.abs(effect)}`,
      ),
    );
    list.appendChild(item);
  }
  details.appendChild(list);
  details.appendChild(
    h(
      "p",
      { class: "annotation", style: "font-size:var(--type-caption-size);margin:var(--space-2) 0 0" },
      `Standing drifts ${REPUTATION_DRIFT} a season toward neutral when nothing happens.`,
    ),
  );
  return details;
}

function incidentCard(
  incident: BorderIncident,
  season: number,
  onAnswered: (notice: string) => void,
): HTMLElement {
  const card = h(
    "div",
    { class: "incident-card", "data-testid": `border-incident-${incident.id}` },
    h("p", { class: "label" }, incident.description),
    row("Standing", `${relationWith(incident.factionId)}`, { mono: true }),
  );
  const actions = h("div", { class: "row-actions" });
  for (const response of INCIDENT_RESPONSES) {
    actions.append(
      button(responseLabel(response), () => {
        const resolution = answerBorderIncident(incident.id, response, Date.now() % 2 ** 31);
        if (!resolution) {
          onAnswered("That incident was already answered.");
          return;
        }
        // The response moves the relationship; the reason is required and honest.
        adjustRelation(
          incident.factionId,
          incident.factionName,
          resolution.relationDelta,
          `border incident: ${response}`,
          season,
        );
        onAnswered(
          `${resolution.line} (relations ${resolution.relationDelta >= 0 ? "+" : ""}${resolution.relationDelta})`,
        );
      }, { testId: `border-incident-${response}-${incident.id}` }),
    );
  }
  card.appendChild(actions);
  return card;
}

function responseLabel(response: IncidentResponse): string {
  return response === "retaliate" ? "Retaliate" : response === "protest" ? "Protest" : "Overlook";
}
