/**
 * Spymaster panel (integration for espionage tasks 61-70).
 *
 * The working surface for the spy game: the persisted spy roster with
 * mission assignment, and the enemy-spy alert inbox with responses.
 * The host supplies the campaign day (mission deadlines) and optional
 * post-name resolution; everything else reads the persisted stores.
 */

import { button, h, row, sectionHeader } from "../dom.js";
import { dataTable, emptyState, panel, type Column } from "../kit.js";
import {
  answerAlert,
  alertResponses,
  pendingAlerts,
  type EnemySpyAlert,
  type SpyAlertResponse,
} from "../../espionage/spyAlerts.js";
import {
  assignMission,
  cancelMission,
  MISSION_ICONS,
  SPY_MISSIONS,
  spyMission,
  type SpyMissionKind,
} from "../../espionage/spyMissions.js";
import {
  placeSpy,
  recallSpy,
  spyRoster,
  type RosterSpy,
} from "../../espionage/roster.js";

/** Mission length in campaign days (panel presentation choice). */
const MISSION_DAYS: Record<SpyMissionKind, number> = {
  "gather-intel": 7,
  sabotage: 14,
  "steal-plans": 21,
  "spread-rumors": 10,
  "lay-low": 5,
};

export interface SpymasterPanelOptions {
  /** Campaign day; mission deadlines count from here. */
  currentDay: number;
  /** Post id -> display name. */
  postNames?: Record<string, string>;
  onClose?: () => void;
  testId?: string;
}

export function spymasterPanel(options: SpymasterPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Spymaster",
    testId: options.testId ?? "spymaster-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  const rerender = () => {
    const fresh = spymasterPanel(options);
    root.replaceWith(fresh);
  };

  const postName = (id: string) => options.postNames?.[id] ?? id;

  body.appendChild(sectionHeader("Your spies"));
  const spies = spyRoster();
  if (spies.length === 0) {
    body.appendChild(
      emptyState(
        "No spies placed",
        "Place a spy at a post to start running missions.",
      ),
    );
  } else {
    const columns: Column<RosterSpy>[] = [
      { header: "Spy", render: (s) => s.name },
      { header: "Post", render: (s) => postName(s.post) },
      { header: "Cover", numeric: true, render: (s) => `${s.cover}` },
      { header: "Skill", numeric: true, render: (s) => `${s.skill}` },
      {
        header: "Mission",
        render: (s) => {
          const m = spyMission(s.id);
          return m
            ? `${MISSION_ICONS[m.kind]} ${m.kind} (day ${m.completesDay})`
            : "—";
        },
      },
      {
        header: "Orders",
        render: (s) => {
          const wrap = h("span", { class: "row-actions" });
          const select = h(
            "select",
            { "aria-label": `Mission for ${s.name}`, "data-testid": `spy-mission-select-${s.id}` },
            ...SPY_MISSIONS.map((k) =>
              h("option", { value: k }, `${MISSION_ICONS[k]} ${k}`),
            ),
          ) as HTMLSelectElement;
          const assign = button("Assign", () => {
            assignMission(s.id, select.value as SpyMissionKind, options.currentDay + MISSION_DAYS[select.value as SpyMissionKind]);
            rerender();
          }, { testId: `spy-assign-${s.id}` });
          wrap.append(select, assign);
          const m = spyMission(s.id);
          if (m) {
            wrap.append(
              button("Cancel", () => {
                cancelMission(s.id);
                rerender();
              }, { variant: "quiet", testId: `spy-cancel-${s.id}` }),
            );
          }
          wrap.append(
            button("Recall", () => {
              cancelMission(s.id);
              recallSpy(s.id);
              rerender();
            }, { variant: "quiet", testId: `spy-recall-${s.id}` }),
          );
          return wrap;
        },
      },
    ];
    body.appendChild(dataTable("Spies", columns, spies, "spymaster-spies"));
  }

  body.appendChild(sectionHeader("Place a spy"));
  const nameInput = h("input", {
    type: "text",
    placeholder: "Spy name",
    "aria-label": "Spy name",
    "data-testid": "spy-name-input",
  }) as HTMLInputElement;
  const postInput = h("input", {
    type: "text",
    placeholder: "Post id",
    "aria-label": "Post id",
    "data-testid": "spy-post-input",
  }) as HTMLInputElement;
  const form = h("div", { class: "form-row" }, nameInput, postInput,
    button("Place spy", () => {
      const name = nameInput.value.trim();
      const post = postInput.value.trim();
      if (!name || !post) return;
      try {
        placeSpy({
          id: `spy-${Date.now().toString(36)}`,
          name,
          post,
          cover: 60,
          skill: 5,
        });
      } catch {
        return;
      }
      rerender();
    }, { testId: "spy-place" }),
  );
  body.appendChild(form);

  body.appendChild(sectionHeader("Enemy spy alerts"));
  const alerts = pendingAlerts();
  if (alerts.length === 0) {
    body.appendChild(
      emptyState("No alerts", "Counter-espionage has spotted nothing. Yet."),
    );
  } else {
    for (const alert of alerts) {
      body.appendChild(alertCard(alert, postName, rerender));
    }
  }

  return root;
}

function alertCard(
  alert: EnemySpyAlert,
  postName: (id: string) => string,
  rerender: () => void,
): HTMLElement {
  const card = h(
    "div",
    { class: "alert-card", "data-testid": `spy-alert-${alert.id}` },
    h("p", { class: "label" }, alert.line),
    row("Certainty", `${alert.certainty}%`, { mono: true }),
    row("Post", postName(alert.postId)),
  );
  const actions = h("div", { class: "row-actions" });
  for (const { response, blurb } of alertResponses()) {
    const btn = button(label(response), () => {
      const resolution = answerAlert(alert.id, response, Date.now() % 2 ** 31);
      if (resolution) {
        card.replaceWith(
          h("p", { class: "caption", "data-testid": `spy-alert-resolved-${alert.id}` }, resolution.line),
        );
      } else {
        rerender();
      }
    }, { testId: `spy-alert-${response}-${alert.id}` });
    btn.title = blurb;
    actions.append(btn);
  }
  card.appendChild(actions);
  return card;
}

function label(response: SpyAlertResponse): string {
  return response === "arrest" ? "Arrest" : response === "turn" ? "Turn" : "Watch";
}
