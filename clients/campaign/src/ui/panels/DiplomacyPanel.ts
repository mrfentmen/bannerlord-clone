/**
 * Diplomacy panel (integration for diplomacy tasks 81-90).
 *
 * The working surface for foreign affairs: the diplomatic reputation
 * meter, the reason-required relation-change feed, treaty compliance,
 * and the border-incident inbox with responses. The host supplies the
 * current season (relation changes are season-stamped).
 */

import { button, h, row, sectionHeader } from "../dom.js";
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

  const rerender = (nextNotice: string | null = null) => {
    root.replaceWith(buildDiplomacyPanel(options, nextNotice));
  };

  body.appendChild(sectionHeader("Standing"));
  const rep = diplomaticReputation();
  body.appendChild(row("Reputation", `${rep} — ${reputationTitle(rep)}`, { mono: true }));
  body.appendChild(
    h("p", { class: "caption", "data-testid": "diplomacy-reputation" }, reputationMeterLine()),
  );

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
