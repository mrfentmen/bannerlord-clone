/**
 * Party management UI. MASTER_PLAN.md section 3B (tasks 101-109).
 *
 * Extends the base party panel (panels/PartyPanel.ts) rather than touching
 * it: that panel keeps its summary rendering; this module owns the
 * management actions the plan asks for:
 *
 *  - Troop roster grouped by tier with counts from the sim (task 101).
 *  - Upgrade buttons per upgradeable stack. The client calls
 *    `POST /v1/troops/upgrade` through the `onUpgrade` callback and then
 *    feeds the fresh sim state back through `update()`; the new tier
 *    renders in that same update (task 102).
 *  - Daily wage bill with a treasury projection covering exactly 30 days
 *    (task 103).
 *  - Morale with a cause tooltip via `/v1/why`: the "Why?" button fetches
 *    the causes and the top 3 land in the tooltip (task 104).
 *  - Food stocks as days remaining; the estimate goes critical under 3
 *    days (task 105).
 *  - Wounded listed separately with recovery ETAs. The sim returns them
 *    to the roster on their recovery tick; the caller feeding ticks
 *    through `update()` makes them reappear in the roster automatically
 *    (task 106).
 *  - Prisoners with recruit / release / ransom actions. Recruiting
 *    converts a prisoner to a tier-1 troop inside the sim; the fresh
 *    state comes back through `update()` (task 107).
 *  - Party speed with its contributing factors; overweight and slow-unit
 *    factors are highlighted (task 108).
 *  - Party inventory: medicine, ammo, trade goods, quantities straight
 *    from the sim (task 109).
 *
 * Same pattern as the other UI modules: this module owns no sim
 * connection and no fetch. The caller (Rowan's campaign client) injects
 * the action callbacks, wires them to the sim API, and feeds state via
 * `update()`; this module renders.
 */

import { announce, button, h, liveRegion, replace, row, sectionHeader } from "./dom.js";
import { dataTable, emptyState, gauge, panel, statusChip, type Column } from "./kit.js";

export interface PartyTroopUpgrade {
  stackId: string;
  canUpgrade: boolean;
  /** Gold per troop for the upgrade. */
  costPerTroop: number;
  targetTier: number;
  targetName: string;
  /** Shown when canUpgrade is false, e.g. "needs 200 more gold". */
  blockedReason?: string;
}

export interface PartyTroop {
  id: string;
  name: string;
  count: number;
  /** 0 to 5. */
  quality: number;
  /** Money per day per soldier. */
  wage: number;
  morale: number;
  upgrade?: PartyTroopUpgrade;
}

export interface TierGroup {
  tier: number;
  troops: PartyTroop[];
}

export interface MoraleCause {
  label: string;
  /** Positive helps morale, negative hurts it. */
  delta: number;
}

export interface WoundedStack {
  id: string;
  name: string;
  count: number;
  /** Sim day number the recovery tick returns them to the roster. */
  recoveryDay: number;
}

export interface PrisonerStack {
  id: string;
  name: string;
  count: number;
  /** Gold each on ransom. */
  ransomEach: number;
}

export interface SpeedFactor {
  label: string;
  deltaKmPerDay: number;
  /** Overweight and slow-unit factors are flagged bad and highlighted. */
  bad: boolean;
}

export interface PartyInventory {
  medicine: number;
  ammo: number;
  goods: { goodId: string; name: string; quantity: number }[];
}

export interface PartyManagementState {
  /** Today's day number, for recovery and projection arithmetic. */
  day: number;
  name: string;
  leaderName: string;
  /** Gold on hand. */
  treasury: number;
  /** 0 to 1. */
  morale: number;
  /** Days of food remaining, from the sim. */
  foodDays: number;
  tierGroups: TierGroup[];
  wounded: WoundedStack[];
  prisoners: PrisonerStack[];
  speedKmPerDay: number;
  speedFactors: SpeedFactor[];
  inventory: PartyInventory;
}

export interface PrisonerRansomResult {
  gold: number;
}

export interface PartyManagementCallbacks {
  /** Upgrade a stack via POST /v1/troops/upgrade; the caller feeds the
   *  fresh state back through update(). */
  onUpgrade: (stackId: string) => Promise<void>;
  /** Fetch morale causes via /v1/why; the top 3 are shown. */
  fetchMoraleCauses: () => Promise<MoraleCause[]>;
  /** Recruit converts the prisoner to a tier-1 troop inside the sim. */
  onRecruitPrisoner: (prisonerId: string) => Promise<void>;
  onReleasePrisoner: (prisonerId: string) => Promise<void>;
  onRansomPrisoner: (prisonerId: string) => Promise<PrisonerRansomResult>;
  onClose?: () => void;
  testId?: string;
}

export interface PartyManagementHandle {
  root: HTMLElement;
  /** Feed fresh sim state; every section re-renders in one call. */
  update: (state: PartyManagementState) => void;
  destroy: () => void;
}

/** Treasury projection covers exactly this many days (task 103). */
export const PROJECTION_DAYS = 30;
/** Food estimate turns critical under this many days (task 105). */
export const FOOD_CRITICAL_DAYS = 3;

/** Checkpoints rendered for the projection: start, weekly, and day 30. */
export const PROJECTION_CHECKPOINTS = [0, 7, 14, 21, 30] as const;

export function dailyWageBill(state: PartyManagementState): number {
  return state.tierGroups
    .flatMap((g) => g.troops)
    .reduce((sum, t) => sum + t.count * t.wage, 0);
}

/** Projected treasury after n days. The sim owns the real economy;
 *  this is the linear bill the client shows, exactly 30 days out. */
export function projectedTreasury(state: PartyManagementState, days: number): number {
  return state.treasury - dailyWageBill(state) * days;
}

/** Days until the treasury runs out at the current burn rate, or null
 *  when it never runs out inside the projection window. */
export function treasuryRunoutDay(state: PartyManagementState): number | null {
  const bill = dailyWageBill(state);
  if (bill <= 0) return null;
  const days = Math.ceil(state.treasury / bill);
  return days <= PROJECTION_DAYS ? days : null;
}

export function createPartyManagement(
  initial: PartyManagementState,
  callbacks: PartyManagementCallbacks,
): PartyManagementHandle {
  let state = initial;
  const { root, body } = panel({
    title: initial.name,
    testId: callbacks.testId ?? "party-management",
    ...(callbacks.onClose ? { onClose: callbacks.onClose } : {}),
  });
  const region = liveRegion();
  root.appendChild(region);

  // -- roster grouped by tier --------------------------------------------
  function rosterSection(): HTMLElement {
    const wrap = h("div", {});
    const headcount = state.tierGroups
      .flatMap((g) => g.troops)
      .reduce((a, t) => a + t.count, 0);
    wrap.appendChild(
      h("p", { class: "caption", style: "margin:0 0 var(--space-2)" },
        `Led by ${state.leaderName} · ${headcount} under arms`),
    );
    if (state.tierGroups.length === 0) {
      wrap.appendChild(emptyState("Nobody is following you.", "Recruit in a town before you march anywhere."));
      return wrap;
    }
    for (const group of state.tierGroups) {
      const groupCount = group.troops.reduce((a, t) => a + t.count, 0);
      const columns: Column<PartyTroop>[] = [
        { header: "Unit", render: (t) => h("span", { class: "label" }, t.name) },
        {
          header: "Count",
          numeric: true,
          testId: `party-tier-${group.tier}-count`,
          render: (t) => String(t.count),
        },
        { header: "Wage/day", numeric: true, render: (t) => `$${(t.count * t.wage).toFixed(2)}` },
        {
          header: "Upgrade",
          testId: `party-upgrade-col-${group.tier}`,
          render: (t) => upgradeCell(t),
        },
      ];
      wrap.appendChild(sectionHeader(`Tier ${group.tier} — ${groupCount} troops`));
      wrap.appendChild(dataTable(`Tier ${group.tier} troops`, columns, group.troops, `party-tier-${group.tier}`));
    }
    return wrap;
  }

  function upgradeCell(troop: PartyTroop): HTMLElement | string {
    const up = troop.upgrade;
    if (!up || !up.canUpgrade) {
      return h(
        "span",
        { class: "caption" },
        up?.blockedReason ?? "Max tier",
      );
    }
    const label = `Upgrade to ${up.targetName} ($${up.costPerTroop}/troop)`;
    const btn = button(label, () => void upgradeTroop(up.stackId), {
      variant: "primary",
      testId: `party-upgrade-${up.stackId}`,
    });
    return btn;
  }

  async function upgradeTroop(stackId: string): Promise<void> {
    const btn = root.querySelector<HTMLButtonElement>(`[data-testid="party-upgrade-${stackId}"]`);
    btn?.setAttribute("disabled", "");
    try {
      await callbacks.onUpgrade(stackId);
      // The caller feeds the fresh sim state back through update();
      // the new tier renders in that same update.
    } finally {
      btn?.removeAttribute("disabled");
    }
  }

  // -- wages and treasury projection -------------------------------------
  function wagesSection(): HTMLElement {
    const wrap = h("div", {});
    const bill = dailyWageBill(state);
    const runout = treasuryRunoutDay(state);
    wrap.appendChild(
      row("Daily wage bill", `$${bill.toFixed(2)}`, { mono: true, testId: "party-wage-bill" }),
    );
    wrap.appendChild(
      row("Treasury", `$${Math.round(state.treasury).toLocaleString("en-US")}`, {
        mono: true,
        testId: "party-treasury",
      }),
    );
    wrap.appendChild(
      h("p", { class: "caption" }, `Projection covers exactly ${PROJECTION_DAYS} days.`),
    );
    const rows = PROJECTION_CHECKPOINTS.map((d) => ({
      day: d,
      gold: projectedTreasury(state, d),
    }));
    wrap.appendChild(
      dataTable(
        "30-day treasury projection",
        [
          { header: "Day", numeric: true, testId: "party-projection-day", render: (r) => `+${r.day}` },
          {
            header: "Projected gold",
            numeric: true,
            testId: "party-projection-gold",
            render: (r) => `$${Math.round(r.gold).toLocaleString("en-US")}`,
          },
        ],
        rows,
        "party-projection",
      ),
    );
    wrap.appendChild(
      runout !== null
        ? statusChip("critical", `Treasury runs out in ${runout} days at this rate`, {
            testId: "party-treasury-runout",
          })
        : statusChip("good", "Treasury holds for the full 30 days", {
            testId: "party-treasury-ok",
          }),
    );
    return wrap;
  }

  // -- morale with /v1/why causes ----------------------------------------
  function moraleSection(): HTMLElement {
    const wrap = h("div", {});
    const why = button("Why?", () => void showMoraleCauses(), {
      variant: "quiet",
      testId: "party-why-morale",
    });
    wrap.appendChild(
      gauge({
        label: "Morale",
        value: state.morale,
        trend: "flat",
        note: state.morale < 0.4 ? "They will not hold a line for long." : "Holding.",
        thresholds: { criticalBelow: 0.3, warningBelow: 0.5, goodAbove: 0.75 },
        testId: "party-morale-gauge",
      }),
    );
    wrap.appendChild(h("div", { style: "margin:var(--space-1) 0" }, why));
    const causesBox = h("div", { "data-testid": "party-morale-causes" });
    wrap.appendChild(causesBox);
    return wrap;
  }

  async function showMoraleCauses(): Promise<void> {
    const box = root.querySelector('[data-testid="party-morale-causes"]');
    if (!box) return;
    replace(box, h("p", { class: "caption" }, "Asking the sim…"));
    const causes = await callbacks.fetchMoraleCauses();
    const top = causes.slice(0, 3);
    // The tooltip lists the top 3 morale causes.
    const tooltip = top.map((c) => `${c.label} (${c.delta >= 0 ? "+" : ""}${c.delta})`).join("\n");
    replace(
      box,
      h(
        "div",
        {
          class: "caption",
          title: tooltip,
          "data-testid": "party-morale-causes-tip",
        },
        ...top.map((c) =>
          h("p", { style: "margin:0" }, `${c.label}: ${c.delta >= 0 ? "+" : ""}${c.delta}`),
        ),
      ),
    );
    announce(region, `Top morale causes: ${top.map((c) => c.label).join(", ")}.`);
  }

  // -- food ----------------------------------------------------------------
  function foodSection(): HTMLElement {
    const wrap = h("div", {});
    const critical = state.foodDays < FOOD_CRITICAL_DAYS;
    wrap.appendChild(
      row("Food remaining", `${state.foodDays.toFixed(1)} days`, {
        mono: true,
        testId: "party-food-days",
      }),
    );
    wrap.appendChild(
      critical
        ? statusChip("critical", "Under 3 days — buy food or the party goes hungry", {
            testId: "party-food-critical",
          })
        : statusChip("good", "Food stocks healthy", { testId: "party-food-ok" }),
    );
    return wrap;
  }

  // -- wounded ---------------------------------------------------------------
  function woundedSection(): HTMLElement {
    const wrap = h("div", {});
    if (state.wounded.length === 0) {
      wrap.appendChild(emptyState("Nobody is hurt.", "Wounded troops appear here with their recovery ETA."));
      return wrap;
    }
    wrap.appendChild(
      h("p", { class: "caption" }, "They return to the roster automatically on their recovery tick."),
    );
    const columns: Column<WoundedStack>[] = [
      { header: "Unit", render: (w) => h("span", { class: "label" }, w.name) },
      { header: "Count", numeric: true, testId: "party-wounded-count", render: (w) => String(w.count) },
      {
        header: "Recovery",
        testId: "party-wounded-eta",
        render: (w) => {
          const days = Math.max(0, w.recoveryDay - state.day);
          return days === 0 ? "Ready next tick" : `${days} day${days === 1 ? "" : "s"} (day ${w.recoveryDay})`;
        },
      },
    ];
    wrap.appendChild(dataTable("Wounded troops", columns, state.wounded, "party-wounded"));
    return wrap;
  }

  // -- prisoners ---------------------------------------------------------------
  function prisonersSection(): HTMLElement {
    const wrap = h("div", {});
    if (state.prisoners.length === 0) {
      wrap.appendChild(emptyState("No prisoners.", "Captured fighters appear here."));
      return wrap;
    }
    for (const p of state.prisoners) {
      wrap.appendChild(
        h(
          "div",
          { class: "party-prisoner" },
          h(
            "div",
            { class: "party-prisoner__head" },
            h("span", { class: "label" }, `${p.name} × ${p.count}`),
            h("span", { class: "caption" }, `ransom $${p.ransomEach} each`),
          ),
          h(
            "div",
            { class: "party-prisoner__actions" },
            button("Recruit", () => void recruitPrisoner(p.id), {
              variant: "primary",
              testId: `party-prisoner-recruit-${p.id}`,
            }),
            button("Release", () => void releasePrisoner(p.id), {
              testId: `party-prisoner-release-${p.id}`,
            }),
            button("Ransom", () => void ransomPrisoner(p.id), {
              testId: `party-prisoner-ransom-${p.id}`,
            }),
          ),
        ),
      );
    }
    return wrap;
  }

  async function recruitPrisoner(prisonerId: string): Promise<void> {
    // The sim converts the prisoner to a tier-1 troop; the caller feeds
    // the fresh state back through update().
    await callbacks.onRecruitPrisoner(prisonerId);
    announce(region, "Prisoner recruited as a tier-1 troop.");
  }

  async function releasePrisoner(prisonerId: string): Promise<void> {
    await callbacks.onReleasePrisoner(prisonerId);
    announce(region, "Prisoner released.");
  }

  async function ransomPrisoner(prisonerId: string): Promise<void> {
    const result = await callbacks.onRansomPrisoner(prisonerId);
    announce(region, `Ransom paid: $${result.gold}.`);
  }

  // -- speed -------------------------------------------------------------------
  function speedSection(): HTMLElement {
    const wrap = h("div", {});
    wrap.appendChild(
      row("March speed", `${state.speedKmPerDay.toFixed(0)} km/day`, {
        mono: true,
        testId: "party-speed",
      }),
    );
    if (state.speedFactors.length === 0) {
      wrap.appendChild(h("p", { class: "caption" }, "Nothing is slowing the party down."));
      return wrap;
    }
    for (const f of state.speedFactors) {
      wrap.appendChild(
        h(
          "div",
          { class: "party-speed-factor" },
          h("span", { class: "label" }, f.label),
          h(
            "span",
            { class: "caption" },
            `${f.deltaKmPerDay >= 0 ? "+" : ""}${f.deltaKmPerDay.toFixed(1)} km/day`,
          ),
          f.bad
            ? statusChip("warning", "Slowing the party", {
                testId: `party-speed-bad-${f.label.replace(/\s+/g, "-").toLowerCase()}`,
              })
            : null,
        ),
      );
    }
    return wrap;
  }

  // -- inventory -----------------------------------------------------------------
  function inventorySection(): HTMLElement {
    const wrap = h("div", {});
    wrap.appendChild(
      row("Medicine", `${Math.round(state.inventory.medicine)} doses`, {
        mono: true,
        testId: "party-inventory-medicine",
      }),
    );
    wrap.appendChild(
      row("Ammo", `${Math.round(state.inventory.ammo)} rounds`, {
        mono: true,
        testId: "party-inventory-ammo",
      }),
    );
    const goods = state.inventory.goods.filter((g) => g.quantity > 0);
    if (goods.length === 0) {
      wrap.appendChild(emptyState("No trade goods in the wagons.", "Buy something in a market before hauling."));
    } else {
      wrap.appendChild(
        dataTable(
          "Trade goods",
          [
            { header: "Good", render: (g) => h("span", { class: "label" }, g.name) },
            {
              header: "Quantity",
              numeric: true,
              testId: "party-inventory-good-qty",
              render: (g) => String(g.quantity),
            },
          ],
          goods,
          "party-inventory-goods",
        ),
      );
    }
    return wrap;
  }

  function render(): void {
    body.innerHTML = "";
    body.appendChild(sectionHeader("Roster"));
    body.appendChild(rosterSection());
    body.appendChild(sectionHeader("Wages and treasury"));
    body.appendChild(wagesSection());
    body.appendChild(sectionHeader("Morale"));
    body.appendChild(moraleSection());
    body.appendChild(sectionHeader("Food"));
    body.appendChild(foodSection());
    body.appendChild(sectionHeader("Wounded"));
    body.appendChild(woundedSection());
    body.appendChild(sectionHeader("Prisoners"));
    body.appendChild(prisonersSection());
    body.appendChild(sectionHeader("March speed"));
    body.appendChild(speedSection());
    body.appendChild(sectionHeader("Party inventory"));
    body.appendChild(inventorySection());
  }

  render();

  return {
    root,
    update(next: PartyManagementState) {
      state = next;
      render();
      announce(region, "Party management updated.");
    },
    destroy() {
      root.remove();
      region.remove();
    },
  };
}
