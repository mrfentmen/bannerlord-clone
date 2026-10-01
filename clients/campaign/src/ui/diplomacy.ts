/**
 * Diplomacy UI. MASTER_PLAN.md section 3E (tasks 120-125).
 *
 *  - Faction list with relation bars (task 120): every bar renders the
 *    sim's relation number; the bar label states the exact value.
 *  - Declare war (task 121): confirmation view lists affected trade and
 *    treaties from the sim's consequence preview before anything is sent.
 *  - Propose peace (task 122): tribute slider, the sim accepts or refuses
 *    with a stated reason, shown before dismissal.
 *  - Alliance proposal (task 123): the proposed alliance lists its
 *    shared-war benefits; the sim accepts or refuses with a reason.
 *  - Defection (task 124): leave a kingdom, join another. The caller feeds
 *    fresh relations back through `update()` and every relation bar
 *    re-renders, so the update is visible in one call.
 *  - Treaties and truces (task 125): active entries with expiry days.
 *    An expired truce renders an "at war risk" warning chip.
 *
 * Same pattern as the other UI modules: this module owns no sim connection.
 * The caller injects action callbacks and feeds state via `update()`;
 * it renders. Rowan wires the callbacks to the sim API.
 */

import { announce, button, h, liveRegion, replace } from "./dom.js";
import { dataTable, emptyState, panel, statusChip } from "./kit.js";

export interface DiplomacyFaction {
  id: string;
  name: string;
  isPlayerFaction: boolean;
  /** -100 (hatred) to 100 (allied). Rendered as the relation bar. */
  relation: number;
  atWar: boolean;
  allied: boolean;
  /** Days left on a truce, null when there is none. */
  truceDaysLeft: number | null;
}

export interface WarConsequences {
  affectedTrade: string[];
  brokenTreaties: string[];
  /** Factions that will turn hostile as well (their allies). */
  newEnemies: string[];
}

export interface PeaceResult {
  accepted: boolean;
  reason: string;
  tributeTaken: number;
}

export interface AllianceResult {
  accepted: boolean;
  reason: string;
}

export interface AllianceBenefit {
  title: string;
  detail: string;
}

export interface Treaty {
  id: string;
  kind: "alliance" | "truce" | "non-aggression";
  withFactionId: string;
  withFactionName: string;
  /** Null for alliances (no expiry); set for truces and non-aggression. */
  expiresDay: number | null;
  expired: boolean;
}

export interface DiplomacyState {
  /** Today's day number, for expiry arithmetic. */
  day: number;
  playerFactionId: string;
  factions: DiplomacyFaction[];
  treaties: Treaty[];
}

export interface DiplomacyCallbacks {
  /** Ask the sim for the consequence preview before declaring war. */
  fetchWarConsequences: (factionId: string) => Promise<WarConsequences>;
  onDeclareWar: (factionId: string) => Promise<void>;
  onProposePeace: (factionId: string, tribute: number) => Promise<PeaceResult>;
  /** Shared-war benefits come from the sim. */
  fetchAllianceBenefits: (factionId: string) => Promise<AllianceBenefit[]>;
  onProposeAlliance: (factionId: string) => Promise<AllianceResult>;
  onDefect: (fromFactionId: string, toFactionId: string) => Promise<void>;
  onClose?: () => void;
  testId?: string;
}

export interface DiplomacyHandle {
  root: HTMLElement;
  /** Feed fresh sim state; every relation bar and treaty re-renders. */
  update: (state: DiplomacyState) => void;
  destroy: () => void;
}

type View = "list" | "detail" | "declare-war" | "peace" | "alliance" | "defect";

function relationLabel(relation: number): string {
  if (relation >= 75) return "Allied";
  if (relation >= 25) return "Friendly";
  if (relation > -25) return "Neutral";
  if (relation > -75) return "Hostile";
  return "Hateful";
}

export function relationBar(faction: DiplomacyFaction): HTMLElement {
  const wrap = h("div", { class: "diplomacy__relation" });
  const label = relationLabel(faction.relation);
  // -100..100 mapped onto a 0..100 fill for the bar.
  const fillPct = Math.max(0, Math.min(100, (faction.relation + 100) / 2));
  const bar = h(
    "div",
    {
      class: "diplomacy__bar",
      role: "img",
      "data-testid": `diplomacy-relation-${faction.id}`,
      "aria-label": `${faction.name}: relation ${faction.relation} of -100 to 100, ${label}`,
    },
    h("div", { class: "diplomacy__bar-fill", style: `width:${fillPct}%` }),
  );
  wrap.append(bar, h("span", { class: "diplomacy__bar-label data" }, `${faction.relation} · ${label}`));
  return wrap;
}

export function createDiplomacyScreen(
  initial: DiplomacyState,
  cb: DiplomacyCallbacks,
): DiplomacyHandle {
  let state = initial;
  let view: View = "list";
  let selectedId: string | null = null;
  const region = liveRegion();
  const { root, body } = panel({
    title: "Diplomacy",
    testId: cb.testId ?? "diplomacy",
    ...(cb.onClose ? { onClose: cb.onClose } : {}),
  });

  const byId = (id: string | null): DiplomacyFaction | null =>
    state.factions.find((f) => f.id === id) ?? null;

  const playerFaction = (): DiplomacyFaction | null => byId(state.playerFactionId);

  const backButton = (testId: string): HTMLButtonElement =>
    button("Back", () => {
      view = "list";
      selectedId = null;
      render();
    }, { variant: "quiet", testId });

  function factionRow(faction: DiplomacyFaction): HTMLElement {
    const status: string[] = [];
    if (faction.atWar) status.push("at war");
    if (faction.allied) status.push("allied");
    if (faction.truceDaysLeft !== null && faction.truceDaysLeft >= 0)
      status.push(`truce ${faction.truceDaysLeft}d`);
    return h(
      "div",
      { class: "diplomacy__faction" },
      h(
        "div",
        { class: "diplomacy__faction-head" },
        h("span", { class: "diplomacy__faction-name" }, faction.name),
        faction.isPlayerFaction ? h("span", { class: "caption" }, "(your kingdom)") : null,
        faction.atWar ? statusChip("critical", "At war", { testId: `diplomacy-war-${faction.id}` }) : null,
        faction.allied ? statusChip("good", "Allied", { testId: `diplomacy-allied-${faction.id}` }) : null,
      ),
      relationBar(faction),
      h("p", { class: "caption", style: "margin:var(--space-1) 0 0" }, status.join(" · ")),
      h(
        "div",
        { class: "diplomacy__actions" },
        button(faction.isPlayerFaction ? "Manage" : "Select", () => {
          selectedId = faction.id;
          view = "detail";
          render();
        }, { variant: "quiet", testId: `diplomacy-select-${faction.id}` }),
        faction.isPlayerFaction
          ? button("Defect to another kingdom", () => {
              selectedId = faction.id;
              view = "defect";
              render();
            }, { variant: "quiet", testId: "diplomacy-defect-open" })
          : null,
      ),
    );
  }

  function listView(): void {
    const mine = playerFaction();
    if (mine) body.appendChild(factionRow(mine));
    const others = state.factions.filter((f) => !f.isPlayerFaction);
    body.appendChild(
      others.length > 0
        ? h("div", { class: "diplomacy__list" }, ...others.map((f) => factionRow(f)))
        : emptyState("No factions", "The sim reports no other factions to talk to."),
    );
    treatiesView();
  }

  function detailView(faction: DiplomacyFaction): void {
    body.appendChild(backButton("diplomacy-back"));
    body.appendChild(
      h(
        "div",
        { class: "diplomacy__detail" },
        h("h3", { class: "diplomacy__faction-name" }, faction.name),
        relationBar(faction),
        faction.isPlayerFaction
          ? h("p", { class: "caption" }, "This is your kingdom. Use the defect option on the list to leave it.")
          : h(
              "div",
              { class: "diplomacy__actions" },
              faction.atWar
                ? button("Propose peace", () => {
                    view = "peace";
                    render();
                  }, { variant: "primary", testId: "diplomacy-peace-open" })
                : faction.allied
                  ? h("p", { class: "caption" }, "You are allied. Alliances end on the treaties tab.")
                  : button("Declare war", () => {
                      view = "declare-war";
                      render();
                    }, { variant: "primary", testId: "diplomacy-war-open" }),
              !faction.atWar && !faction.allied
                ? button("Propose alliance", () => {
                    view = "alliance";
                    render();
                  }, { testId: "diplomacy-alliance-open" })
                : null,
            ),
      ),
    );
  }

  async function declareWarView(faction: DiplomacyFaction): Promise<void> {
    body.appendChild(backButton("diplomacy-war-back"));
    const loading = h("p", { class: "caption" }, "Asking the sim for consequences...");
    body.appendChild(loading);
    const consequences = await cb.fetchWarConsequences(faction.id);
    replace(
      loading,
      h(
        "div",
        { class: "diplomacy__confirm" },
        h("h3", {}, `Declare war on ${faction.name}?`),
        h("p", { class: "caption" }, "This is what happens if you do:"),
        consequences.affectedTrade.length > 0
          ? dataTable(
              "Affected trade",
              [{ header: "Trade route", render: (t: string) => t }],
              consequences.affectedTrade,
              "diplomacy-trade",
            )
          : emptyState("No trade affected", "No trade routes with this faction will be lost."),
        consequences.brokenTreaties.length > 0
          ? dataTable(
              "Broken treaties",
              [{ header: "Treaty", render: (t: string) => t }],
              consequences.brokenTreaties,
              "diplomacy-broken",
            )
          : h("p", { class: "caption" }, "No treaties will be broken."),
        consequences.newEnemies.length > 0
          ? dataTable(
              "New enemies",
              [{ header: "Faction", render: (t: string) => t }],
              consequences.newEnemies,
              "diplomacy-enemies",
            )
          : h("p", { class: "caption" }, "No other faction will turn hostile."),
        h(
          "div",
          { class: "diplomacy__actions" },
          button("Declare war", async () => {
            await cb.onDeclareWar(faction.id);
            announce(region, `War declared on ${faction.name}.`);
            view = "list";
            selectedId = null;
            render();
          }, { variant: "primary", testId: "diplomacy-war-confirm" }),
          button("Cancel", () => {
            view = "detail";
            render();
          }, { testId: "diplomacy-war-cancel" }),
        ),
      ),
    );
  }

  function peaceView(faction: DiplomacyFaction): void {
    let tribute = 0;
    const resultBox = h("div", { class: "diplomacy__result" });
    const slider = h("input", {
      type: "range",
      id: "diplomacy-tribute",
      min: 0,
      max: 1000,
      step: 50,
      value: "0",
      "aria-label": "Tribute gold",
    }) as HTMLInputElement;
    const readout = h("span", { class: "data", "data-testid": "diplomacy-tribute-value" }, "0g");
    slider.addEventListener("input", () => {
      tribute = Number(slider.value);
      readout.textContent = `${tribute}g`;
    });

    body.appendChild(
      h(
        "div",
        { class: "diplomacy__peace" },
        h("h3", {}, `Propose peace with ${faction.name}`),
        h("label", { class: "field__label label", for: "diplomacy-tribute" }, "Tribute (gold): ", readout),
        slider,
        resultBox,
        h(
          "div",
          { class: "diplomacy__actions" },
          button("Send offer", async () => {
            const result = await cb.onProposePeace(faction.id, tribute);
            replace(
              resultBox,
              h(
                "div",
                { class: "diplomacy__result" },
                result.accepted
                  ? statusChip("good", "Peace accepted", { testId: "diplomacy-peace-result" })
                  : statusChip("warning", "Peace refused", { testId: "diplomacy-peace-result" }),
                h("p", { class: "caption" }, result.reason),
                result.tributeTaken > 0
                  ? h("p", { class: "caption" }, `Tribute paid: ${result.tributeTaken}g.`)
                  : null,
                result.accepted
                  ? button("Done", () => {
                      view = "list";
                      selectedId = null;
                      render();
                    }, { variant: "primary", testId: "diplomacy-peace-done" })
                  : null,
              ),
            );
            announce(region, result.accepted ? "Peace accepted." : "Peace refused.");
          }, { variant: "primary", testId: "diplomacy-peace-send" }),
          button("Cancel", () => {
            view = "detail";
            render();
          }, { testId: "diplomacy-peace-cancel" }),
        ),
      ),
    );
  }

  async function allianceView(faction: DiplomacyFaction): Promise<void> {
    body.appendChild(backButton("diplomacy-alliance-back"));
    const loading = h("p", { class: "caption" }, "Asking the sim for alliance terms...");
    body.appendChild(loading);
    const benefits = await cb.fetchAllianceBenefits(faction.id);
    const resultBox = h("div", { class: "diplomacy__result" });
    replace(
      loading,
      h(
        "div",
        { class: "diplomacy__confirm" },
        h("h3", {}, `Alliance with ${faction.name}`),
        h("p", { class: "caption" }, "Shared-war benefits:"),
        benefits.length > 0
          ? dataTable(
              "Alliance benefits",
              [
                { header: "Benefit", render: (b: AllianceBenefit) => b.title },
                { header: "Detail", render: (b: AllianceBenefit) => b.detail },
              ],
              benefits,
              "diplomacy-benefits",
            )
          : h("p", { class: "caption" }, "The sim lists no shared-war benefits."),
        resultBox,
        h(
          "div",
          { class: "diplomacy__actions" },
          button("Propose alliance", async () => {
            const result = await cb.onProposeAlliance(faction.id);
            replace(
              resultBox,
              h(
                "div",
                { class: "diplomacy__result" },
                result.accepted
                  ? statusChip("good", "Alliance accepted", { testId: "diplomacy-alliance-result" })
                  : statusChip("warning", "Alliance refused", { testId: "diplomacy-alliance-result" }),
                h("p", { class: "caption" }, result.reason),
                result.accepted
                  ? button("Done", () => {
                      view = "list";
                      selectedId = null;
                      render();
                    }, { variant: "primary", testId: "diplomacy-alliance-done" })
                  : null,
              ),
            );
            announce(region, result.accepted ? "Alliance accepted." : "Alliance refused.");
          }, { variant: "primary", testId: "diplomacy-alliance-send" }),
        ),
      ),
    );
  }

  function defectView(mine: DiplomacyFaction): void {
    const others = state.factions.filter((f) => !f.isPlayerFaction && !f.atWar);
    const targetSelect = h("select", {
      id: "diplomacy-defect-target",
      class: "field__input",
      "data-testid": "diplomacy-defect-target",
    }) as HTMLSelectElement;
    for (const f of others) {
      targetSelect.appendChild(h("option", { value: f.id }, f.name));
    }
    body.appendChild(backButton("diplomacy-defect-back"));
    body.appendChild(
      h(
        "div",
        { class: "diplomacy__defect" },
        h("h3", {}, `Leave ${mine.name}`),
        h(
          "p",
          { class: "caption" },
          "Defection ends your standing with this kingdom and starts you over with the new one. Every relation bar will update.",
        ),
        h("label", { class: "field__label label", for: "diplomacy-defect-target" }, "Join:"),
        others.length > 0
          ? targetSelect
          : emptyState("No kingdoms to join", "Every other faction is at war with you or does not exist."),
        h(
          "div",
          { class: "diplomacy__actions" },
          others.length > 0
            ? button("Defect", async () => {
                await cb.onDefect(mine.id, targetSelect.value);
                announce(region, "Defection complete. Relations updated.");
                view = "list";
                selectedId = null;
                render();
              }, { variant: "primary", testId: "diplomacy-defect-confirm" })
            : null,
        ),
      ),
    );
  }

  function treatiesView(): void {
    const sections = h("div", { class: "diplomacy__treaties" });
    sections.appendChild(
      h("h3", { class: "caption", style: "margin:var(--space-4) 0 var(--space-2)" }, "Treaties and truces"),
    );
    if (state.treaties.length === 0) {
      sections.appendChild(emptyState("No treaties", "You hold no treaties or truces right now."));
    } else {
      for (const t of state.treaties) {
        const expiry = t.expiresDay === null ? "no expiry" : `expires day ${t.expiresDay}`;
        sections.appendChild(
          h(
            "div",
            { class: "diplomacy__treaty" },
            h("span", { class: "diplomacy__treaty-name" }, `${t.kind} — ${t.withFactionName}`),
            h("span", { class: "caption" }, expiry),
            t.expired
              ? statusChip("critical", "Expired — at war risk", {
                  testId: `diplomacy-treaty-risk-${t.id}`,
                })
              : t.expiresDay !== null && t.expiresDay - state.day <= 5
                ? statusChip("warning", `Expires in ${t.expiresDay - state.day}d`, {
                    testId: `diplomacy-treaty-soon-${t.id}`,
                  })
                : null,
          ),
        );
      }
    }
    body.appendChild(sections);
  }

  function render(): void {
    body.innerHTML = "";
    const faction = byId(selectedId);
    if (view === "detail" && faction) {
      detailView(faction);
    } else if (view === "declare-war" && faction) {
      void declareWarView(faction);
    } else if (view === "peace" && faction) {
      peaceView(faction);
    } else if (view === "alliance" && faction) {
      void allianceView(faction);
    } else if (view === "defect" && playerFaction()) {
      defectView(playerFaction() as DiplomacyFaction);
    } else {
      view = "list";
      selectedId = null;
      listView();
    }
  }

  render();

  return {
    root,
    update(next: DiplomacyState) {
      state = next;
      render();
      announce(region, "Diplomacy updated.");
    },
    destroy() {
      root.remove();
      region.remove();
    },
  };
}
