/**
 * NPC, clan, and kingdom screens. MASTER_PLAN.md section 3D (tasks 115-119).
 *
 * Extends the RulerPanel: the ruler roster and ruler card stay as they are,
 * and these screens cover the people below and around a ruler.
 *  - NPC profile: age, family, home, faction, traits, relations (task 115).
 *  - Clan tree: members and holdings, up to 3 generations (task 116).
 *  - Kingdom overview: fiefs, clans, policies, strength, each section
 *    linking to its detail view (task 117).
 *  - Ruler AI goal: expanding, defending, etc., from the sim. The caller
 *    feeds fresh goals on campaign ticks via the returned `update()`
 *    (task 118).
 *  - Track NPC: the profile's track button fires `onTrack(npcId)` /
 *    `onUntrack(npcId)`. The caller (the campaign client) pins the NPC on
 *    the map and keeps the marker following them on ticks (task 119).
 *
 * Same pattern as the other panels: this module owns no sim connection and
 * no map. The caller injects callbacks and feeds state. Rowan wires the
 * callbacks to the sim API and the campaign map.
 */

import { clear, h, sectionHeader } from "../dom.js";
import { dataTable, emptyState, panel, statusChip, type Column } from "../kit.js";
import type { ClanTree, KingdomOverview, NpcProfile, RulerGoal } from "../../data/types.js";

export interface NpcProfileCallbacks {
  /** Pin this NPC on the campaign map (task 119). */
  onTrack: (npcId: string) => void;
  /** Remove the pin (task 119). */
  onUntrack: (npcId: string) => void;
  /** Open the home settlement detail. */
  onSelectSettlement?: (settlementId: string) => void;
  onClose?: () => void;
  testId?: string;
}

export function npcProfile(profile: NpcProfile, callbacks: NpcProfileCallbacks): HTMLElement {
  const { root, body } = panel({
    title: profile.name,
    testId: callbacks.testId ?? "npc-profile",
    ...(callbacks.onClose ? { onClose: callbacks.onClose } : {}),
  });

  let tracked = false;
  const trackBtn = h(
    "button",
    {
      type: "button",
      class: "npc__track",
      "data-testid": "npc-track",
      "aria-pressed": "false",
    },
    "Track on map",
  );
  trackBtn.addEventListener("click", () => {
    tracked = !tracked;
    trackBtn.textContent = tracked ? "Tracking" : "Track on map";
    trackBtn.setAttribute("aria-pressed", tracked ? "true" : "false");
    if (tracked) callbacks.onTrack(profile.id);
    else callbacks.onUntrack(profile.id);
  });

  body.appendChild(
    h(
      "div",
      { class: "npc__head", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" },
          `Age ${profile.age} · ${profile.factionName}`),
        h(
          "p",
          { class: "caption", style: "margin:0" },
          "Home: ",
          callbacks.onSelectSettlement
            ? h(
                "button",
                { type: "button", class: "npc__link", "data-testid": "npc-home" },
                profile.homeSettlementName,
              )
            : profile.homeSettlementName,
        ),
      ),
      trackBtn,
    ),
  );

  if (callbacks.onSelectSettlement) {
    body.querySelector('[data-testid="npc-home"]')?.addEventListener("click", () => {
      callbacks.onSelectSettlement?.(profile.homeSettlementId);
    });
  }

  body.appendChild(sectionHeader("Traits"));
  if (profile.traits.length === 0) {
    body.appendChild(emptyState("No traits on record.", "The sim has not weighed in on this person yet."));
  } else {
    body.appendChild(
      h(
        "div",
        { class: "npc__traits", "data-testid": "npc-traits" },
        ...profile.traits.map((t) =>
          h(
            "div",
            { class: "trait" },
            h("span", {}, t.name),
            h("span", { class: "data-sm" }, t.value.toFixed(2)),
          ),
        ),
      ),
    );
  }

  body.appendChild(sectionHeader("Family"));
  if (profile.family.length === 0) {
    body.appendChild(emptyState("No family on record.", "This NPC's kin are not in the sim's books."));
  } else {
    const columns: Column<NpcProfile["family"][number]>[] = [
      { header: "Name", render: (f) => h("span", {}, f.name) },
      { header: "Relation", render: (f) => h("span", { class: "caption" }, f.relation) },
    ];
    body.appendChild(dataTable("Family of this NPC", columns, profile.family, "npc-family"));
  }

  body.appendChild(sectionHeader("Relations"));
  if (profile.relations.length === 0) {
    body.appendChild(emptyState("No standing on record.", "Nobody in the sim has an opinion of this person yet."));
  } else {
    const columns: Column<NpcProfile["relations"][number]>[] = [
      { header: "Who", render: (r) => h("span", {}, r.entityName) },
      {
        header: "Standing",
        render: (r) =>
          statusChip(
            r.value >= 20 ? "good" : r.value <= -20 ? "critical" : "info",
            String(Math.round(r.value)),
          ),
      },
    ];
    body.appendChild(dataTable("Relations of this NPC", columns, profile.relations, "npc-relations"));
  }

  return root;
}

export interface ClanTreeCallbacks {
  /** Open a member's NPC profile. */
  onSelectMember: (npcId: string) => void;
  /** Open a holding's settlement detail. */
  onSelectSettlement?: (settlementId: string) => void;
  onClose?: () => void;
  testId?: string;
}

/** The clan tree renders at most 3 generations: roots, children, grandchildren. */
const MAX_GENERATIONS = 3;

export function clanTree(tree: ClanTree, callbacks: ClanTreeCallbacks): HTMLElement {
  const { root, body } = panel({
    title: `Clan ${tree.name}`,
    testId: callbacks.testId ?? "clan-tree",
    ...(callbacks.onClose ? { onClose: callbacks.onClose } : {}),
  });

  body.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:0 0 var(--space-3)" },
      `${tree.factionName} · strength ${tree.strength.toLocaleString("en-US")}`,
    ),
  );

  body.appendChild(sectionHeader("Members"));
  if (tree.members.length === 0) {
    body.appendChild(emptyState("No members on record.", "The sim has not filled out this clan yet."));
  } else {
    const list = h("div", { class: "clan__tree", "data-testid": "clan-members" });
    for (const member of tree.members) renderMember(list, member, 1, callbacks);
    body.appendChild(list);
  }

  body.appendChild(sectionHeader("Holdings"));
  if (tree.holdings.length === 0) {
    body.appendChild(emptyState("No land.", "This clan holds nothing in the sim."));
  } else {
    body.appendChild(
      h(
        "div",
        { class: "clan__holdings", "data-testid": "clan-holdings" },
        ...tree.holdings.map((hh) =>
          callbacks.onSelectSettlement
            ? h("button", { type: "button", class: "npc__link", "data-testid": `clan-holding-${hh.settlementId}` }, hh.name)
            : h("span", { class: "caption" }, hh.name),
        ),
      ),
    );
    if (callbacks.onSelectSettlement) {
      for (const hh of tree.holdings) {
        body
          .querySelector(`[data-testid="clan-holding-${hh.settlementId}"]`)
          ?.addEventListener("click", () => callbacks.onSelectSettlement?.(hh.settlementId));
      }
    }
  }

  return root;
}

function renderMember(
  parent: HTMLElement,
  member: ClanTree["members"][number],
  generation: number,
  callbacks: ClanTreeCallbacks,
): void {
  const btn = h(
    "button",
    {
      type: "button",
      class: `clan__member clan__member--gen${generation}`,
      "data-testid": `clan-member-${member.id}`,
      "data-generation": String(generation),
      "aria-label": `Generation ${generation}: ${member.name}`,
    },
    h("span", { class: "clan__member-name" }, member.name),
    h("span", { class: "caption" }, `${member.role} · age ${member.age}`),
  );
  btn.addEventListener("click", () => callbacks.onSelectMember(member.id));
  parent.appendChild(btn);

  if (generation < MAX_GENERATIONS && member.children.length > 0) {
    const kids = h("div", { class: "clan__children" });
    for (const child of member.children) renderMember(kids, child, generation + 1, callbacks);
    parent.appendChild(kids);
  }
}

export interface KingdomOverviewCallbacks {
  /** Open a fief's settlement detail. */
  onSelectFief: (settlementId: string) => void;
  /** Open a clan's detail view. */
  onSelectClan: (clanId: string) => void;
  /** Open the ruler's card. */
  onSelectRuler?: (rulerId: string) => void;
  onClose?: () => void;
  testId?: string;
}

export function kingdomOverview(kingdom: KingdomOverview, callbacks: KingdomOverviewCallbacks): HTMLElement {
  const { root, body } = panel({
    title: kingdom.name,
    testId: callbacks.testId ?? "kingdom-overview",
    ...(callbacks.onClose ? { onClose: callbacks.onClose } : {}),
  });

  body.appendChild(
    h(
      "div",
      { class: "kingdom__head", style: "margin-bottom:var(--space-3)" },
      h("p", { class: "caption", style: "margin:0 0 var(--space-1)" },
        `Strength ${kingdom.strength.toLocaleString("en-US")} · ruled by ${kingdom.rulerName}`),
      h("div", { class: "kingdom__strength", role: "img", "aria-label": `Kingdom strength ${kingdom.strength}` }),
    ),
  );

  body.appendChild(sectionHeader("Fiefs"));
  if (kingdom.fiefs.length === 0) {
    body.appendChild(emptyState("No fiefs on record.", "This kingdom holds no ground in the sim."));
  } else {
    const columns: Column<KingdomOverview["fiefs"][number]>[] = [
      {
        header: "Fief",
        render: (f) =>
          h("button", { type: "button", class: "npc__link", "data-testid": `kingdom-fief-${f.settlementId}` }, f.name),
      },
      { header: "Prosperity", numeric: true, render: (f) => String(Math.round(f.prosperity)) },
    ];
    body.appendChild(dataTable("Fiefs of this kingdom", columns, kingdom.fiefs, "kingdom-fiefs"));
    for (const f of kingdom.fiefs) {
      body
        .querySelector(`[data-testid="kingdom-fief-${f.settlementId}"]`)
        ?.addEventListener("click", () => callbacks.onSelectFief(f.settlementId));
    }
  }

  body.appendChild(sectionHeader("Clans"));
  if (kingdom.clans.length === 0) {
    body.appendChild(emptyState("No clans on record.", "The sim has not filled out the clans yet."));
  } else {
    const columns: Column<KingdomOverview["clans"][number]>[] = [
      {
        header: "Clan",
        render: (c) =>
          h("button", { type: "button", class: "npc__link", "data-testid": `kingdom-clan-${c.id}` }, c.name),
      },
      { header: "Strength", numeric: true, render: (c) => c.strength.toLocaleString("en-US") },
      { header: "Loyalty", numeric: true, render: (c) => String(Math.round(c.loyalty)) },
    ];
    body.appendChild(dataTable("Clans of this kingdom", columns, kingdom.clans, "kingdom-clans"));
    for (const c of kingdom.clans) {
      body
        .querySelector(`[data-testid="kingdom-clan-${c.id}"]`)
        ?.addEventListener("click", () => callbacks.onSelectClan(c.id));
    }
  }

  body.appendChild(sectionHeader("Policies"));
  if (kingdom.policies.length === 0) {
    body.appendChild(emptyState("No policies on record.", "This kingdom's laws are not in the sim yet."));
  } else {
    const columns: Column<KingdomOverview["policies"][number]>[] = [
      { header: "Policy", render: (p) => h("span", {}, p.name) },
      { header: "Effect", render: (p) => h("span", { class: "caption" }, p.effect) },
    ];
    body.appendChild(dataTable("Policies of this kingdom", columns, kingdom.policies, "kingdom-policies"));
  }

  return root;
}

const GOAL_LABEL: Record<RulerGoal["goal"], string> = {
  expanding: "Expanding",
  defending: "Defending",
  raiding: "Raiding",
  trading: "Trading",
  plotting: "Plotting",
  recovering: "Recovering",
};

export interface RulerGoalPanel {
  root: HTMLElement;
  /** Refresh with the sim's latest goal; call on campaign ticks (task 118). */
  update: (goal: RulerGoal) => void;
  destroy: () => void;
}

export function createRulerGoalPanel(initial: RulerGoal, opts: { testId?: string } = {}): RulerGoalPanel {
  const { root, body } = panel({ title: "Ruler's aim", testId: opts.testId ?? "ruler-goal" });

  function render(goal: RulerGoal): void {
    clear(body);
    const pct = Math.max(0, Math.min(100, Math.round(goal.progress * 100)));
    body.appendChild(
      h(
        "div",
        { class: "ruler-goal" },
        h("p", { class: "npc__ruler", "data-testid": "ruler-goal-ruler", style: "margin:0 0 var(--space-1)" }, goal.rulerName),
        h(
          "p",
          { style: "margin:0 0 var(--space-2)" },
          statusChip("info", GOAL_LABEL[goal.goal], { testId: "ruler-goal-kind" }),
        ),
        h("p", { class: "caption", "data-testid": "ruler-goal-text", style: "margin:0 0 var(--space-2)" }, goal.goalText),
        h(
          "div",
          {
            class: "ruler-goal__bar",
            role: "img",
            "aria-label": `${GOAL_LABEL[goal.goal]} progress ${pct} percent, set on day ${goal.day}`,
            "data-testid": "ruler-goal-progress",
          },
          h("span", { class: "ruler-goal__fill", style: `width:${pct}%` }),
        ),
        h("p", { class: "caption", "data-testid": "ruler-goal-day", style: "margin:var(--space-1) 0 0" },
          `Set on day ${goal.day}`),
      ),
    );
  }

  render(initial);

  return {
    root,
    update: (goal: RulerGoal) => render(goal),
    destroy: () => root.remove(),
  };
}
