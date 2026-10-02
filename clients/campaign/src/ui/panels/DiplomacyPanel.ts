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
import { markHintShown, shouldShowHint } from "../../onboarding/hintCooldown.js";

export interface DiplomacyPanelOptions {
  /** Campaign season; relation changes are stamped with it. */
  currentSeason: number;
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
