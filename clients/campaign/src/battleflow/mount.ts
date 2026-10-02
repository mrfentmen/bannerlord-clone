/**
 * Mounts the battle UI flow into the campaign client.
 *
 * One fixed overlay over the campaign map. It stays hidden until a battle
 * arc starts, then walks the player through it:
 *
 *   pre-battle -> live battle (orders) -> after-action
 *
 * Encounters arrive two ways:
 * - the `EncounterPoller` picks up server auto-triggered encounters
 *   (`GET /v1/encounters?partyId={id}`) and the encounter banner offers them
 *   to the player, who takes them into the overlay with "Meet them";
 * - `attack()` arranges an encounter by hand (a future "attack" affordance
 *   in the campaign UI calls this).
 *
 * Everything on screen comes from `BattleFlow`'s view models; this module
 * owns DOM only. It follows the project's panel conventions (`panel()`,
 * `button()`, `gauge()`, `statusChip()`, `dataTable()` from `src/ui/kit.ts`,
 * `h()` from `src/ui/dom.ts`) and reads its visuals from design tokens —
 * see `battle.css`.
 *
 * Server vs local is always labeled: a "Live battle" chip while the
 * battle server answers, a "Local drill" chip plus a caption when the
 * flow fell back to the local stand-in (unimplemented or unreachable).
 * The local model is a stand-in, not milo's battle sim and not the
 * server's.
 */

import "./battle.css";
import { button, clear, h, row } from "../ui/dom.js";
import {
  dataTable,
  errorState,
  gauge,
  panel,
  statusChip,
} from "../ui/kit.js";
import { BattleApiError, createHttpBattleApi, type BattleApi } from "./api";
import { encounterBanner, type EncounterBannerHandle } from "./encounterBanner";
import { createBattleAnnouncer, type BattleAnnouncer } from "./announcer";
import { scoutEnemy } from "./scouting";
import { previewAutoResolve } from "./autoresolvePreview";
import { weatherFor } from "./weather";
import {
  BattleFlow,
  type AfterActionView,
  type LiveBattleView,
  type LocalBattleSource,
  type PrebattleView,
} from "./flow";
import { EncounterPoller } from "./poll";
import type { BattleOrders, Encounter } from "./types";

export interface BattleMountOptions {
  /** API base URL the app uses (main.ts passes `config.simulationHttpUrl`). */
  apiBaseUrl: string;
  /**
   * The player's party id in the battle domain (numeric). The campaign
   * wire writes party ids as `party-<n>`; main.ts parses that. Pass -1
   * when the id is not a battle-domain id (e.g. the fixture's
   * "party-player") and set `pollEncounters: false`.
   */
  playerPartyId: number;
  /** Describes the two forces when the server cannot (local fallback). */
  local: LocalBattleSource;
  /**
   * Whether to poll the server for auto-triggered encounters. Defaults
   * to true; set false when `playerPartyId` is not a battle-domain id.
   */
  pollEncounters?: boolean;
  /** A BattleApi to use instead of the HTTP one. For tests. */
  api?: BattleApi;
  /** Where to mount the overlay. Defaults to `document.body`. */
  mountInto?: HTMLElement;
  /** Called when the arc ends and the overlay closes. */
  onDone?: () => void;
  /**
   * Battle events, for haptics/achievements wiring in main.ts. `order`
   * carries no view; `victory`/`defeat` carry the finished after-action view
   * so consumers can record real kills and loot instead of guessing.
   */
  onBattleEvent?: (
    event: "order" | "victory" | "defeat",
    view?: AfterActionView,
  ) => void;
}

export interface BattleMount {
  /** The overlay root element. */
  readonly root: HTMLElement;
  /** The flow (view models + phase machine). */
  readonly flow: BattleFlow;
  /** The encounter poller (started unless `pollEncounters: false`). */
  readonly poller: EncounterPoller;
  /** The "Hostile force encountered!" banner the poller offers encounters through. */
  readonly banner: EncounterBannerHandle;
  /** Screen-reader announcer for battle events (solo task 18). */
  readonly announcer: BattleAnnouncer;
  /** Adopt a server encounter (from the banner) and show pre-battle. */
  adoptEncounter(encounter: Encounter): void;
  /** Arrange an encounter by hand and show pre-battle. */
  attack(attackerPartyId: number, defenderPartyId: number): Promise<void>;
  /** Remove the overlay and stop polling. */
  destroy(): void;
}

const ORDER_DEFS: ReadonlyArray<{
  id: string;
  label: string;
  orders: BattleOrders;
  hint: string;
  variant: "primary" | "plain";
}> = [
  {
    id: "advance",
    label: "Advance",
    orders: { advance: 1 },
    hint: "Push forward at full intensity.",
    variant: "primary",
  },
  {
    id: "hold",
    label: "Hold",
    orders: { hold: true },
    hint: "Hold position; take fewer losses.",
    variant: "plain",
  },
  {
    id: "retreat",
    label: "Retreat",
    orders: { retreat: true },
    hint: "Withdraw. Ends the battle.",
    variant: "plain",
  },
  {
    id: "focusfire",
    label: "Focus fire",
    orders: { focusFire: true },
    hint: "Concentrate on the enemy's weakest group.",
    variant: "plain",
  },
];

export function mountBattleUi(options: BattleMountOptions): BattleMount {
  const into = options.mountInto ?? document.body;
  const api = options.api ?? createHttpBattleApi(options.apiBaseUrl);
  const flow = new BattleFlow(api, options.local, options.playerPartyId);

  const overlay = h("div", {
    class: "battle-overlay",
    "data-testid": "battle-overlay",
    hidden: true,
  }) as HTMLElement;
  into.appendChild(overlay);

  const banner = encounterBanner({
    playerPartyId: options.playerPartyId,
    onMeet: (encounter) => adoptEncounter(encounter),
  });
  into.appendChild(banner.root);

  // Screen-reader battle announcements (solo task 18): the region lives
  // outside the overlay so re-renders never wipe it.
  const announcer = createBattleAnnouncer();
  into.appendChild(announcer.region);

  const poller = new EncounterPoller(api, options.playerPartyId, {
    // An encounter is offered, not thrown onto the screen: the player is in the middle
    // of a campaign and a fight they did not start deserves a word before it takes the
    // map. "Meet them" on the banner is what opens the overlay.
    onNew: (encounter) => banner.offer(encounter),
    onError: (err) =>
      banner.reportProblem(
        err instanceof BattleApiError
          ? err.reason
          : "The battle server is not answering. Encounters will be picked up when it returns.",
      ),
  });

  let busy = false;

  function render(): void {
    clear(overlay);
    const phase = flow.phase;
    let screen: HTMLElement | null = null;
    if (phase === "prebattle") {
      const view = flow.prebattleView();
      if (view) screen = prebattleScreen(view);
    } else if (phase === "live") {
      const view = flow.liveView();
      if (view) screen = liveScreen(view);
    } else if (phase === "afteraction") {
      const view = flow.afterActionView();
      if (view) screen = afterActionScreen(view);
    }
    if (!screen) {
      overlay.hidden = true;
      return;
    }
    overlay.appendChild(screen);
    overlay.hidden = false;
    screen.focus();
  }

  /** Run a flow mutation: disable the buttons while it is in flight, show a
   * recoverable error if it fails, re-render when it lands. */
  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try {
      await action();
    } catch (err) {
      busy = false;
      fail(err, () => void run(action));
      return;
    }
    busy = false;
    const done = flow.afterActionView();
    if (done && flow.phase === "afteraction") {
      announcer.result(done.playerWon ? "victory" : "defeat");
      options.onBattleEvent?.(done.playerWon ? "victory" : "defeat", done);
    }
    render();
  }

  function fail(err: unknown, retry: () => void): void {
    clear(overlay);
    const { root, body } = panel({ title: "Battle", testId: "battle-error" });
    const message =
      err instanceof BattleApiError && err.reason
        ? err.reason
        : "The battle hit a problem it could not recover from.";
    body.appendChild(
      errorState({
        message,
        onRetry: retry,
        retryLabel: "Try again",
        secondary: button("Back", () => render(), { testId: "battle-error-back" }),
        detail: err instanceof Error ? err.message : String(err),
        testId: "battle-error",
      }),
    );
    overlay.appendChild(root);
    overlay.hidden = false;
    root.focus();
  }

  function modeChip(mode: "server" | "local"): HTMLElement {
    return mode === "server"
      ? statusChip("info", "Live battle", {
          testId: "battle-mode",
          title: "Fighting on the battle server.",
        })
      : statusChip("warning", "Local drill", {
          testId: "battle-mode",
          title:
            "The battle server is not answering; this fight runs on a local stand-in.",
        });
  }

  function localNote(): HTMLElement {
    return h(
      "p",
      { class: "caption battle__note", "data-testid": "battle-local-note" },
      "Local drill: the battle server is not answering, so this fight runs on a " +
        "small local stand-in. It decides a winner and losses, but it is not the " +
        "real battle simulation.",
    );
  }

  function prebattleScreen(view: PrebattleView): HTMLElement {
    const { root, body } = panel({
      title: "Battle",
      testId: "battle-prebattle",
      onClose: standDown,
    });
    body.appendChild(modeChip(view.mode));
    if (view.mode === "local") body.appendChild(localNote());
    body.appendChild(
      h(
        "p",
        { class: "caption", "data-testid": "battle-role" },
        view.playerIsAttacker ? "You are attacking." : "You are defending.",
      ),
    );
    body.appendChild(
      dataTable(
        "Forces",
        [
          { header: "Side", render: (r) => r.name },
          { header: "Troops", numeric: true, render: (r) => String(r.troops) },
          {
            header: "Power",
            numeric: true,
            render: (r) => String(Math.round(r.power)),
          },
        ],
        [view.encounter.attacker, view.encounter.defender],
        "battle-sides",
      ),
    );
    body.appendChild(
      gauge({
        label: "Your chance of winning",
        value: view.playerWinChance,
        format: (v) => `${Math.round(v * 100)}%`,
        testId: "battle-winchance",
      }),
    );
    body.appendChild(
      h("p", { class: "caption", "data-testid": "battle-assessment" }, view.assessment),
    );
    // Scouting report (solo task 21): enemy composition estimate before deployment.
    const enemy = view.playerIsAttacker ? view.encounter.defender : view.encounter.attacker;
    const report = scoutEnemy(enemy.troops, enemy.power);
    const scoutList = h("ul", { class: "scout__list", "data-testid": "scout-list" });
    for (const est of report.estimates) {
      scoutList.appendChild(
        h(
          "li",
          { "data-testid": `scout-${est.kind}` },
          `${est.kind}: ~${est.count} (${Math.round(est.share * 100)}%)`,
        ),
      );
    }
    body.appendChild(
      h(
        "section",
        { "data-testid": "scout-report", "aria-label": "Scouting report" },
        h("h3", {}, "Scouting report"),
        h("p", { class: "caption" }, report.summary + "."),
        scoutList,
        h("p", { class: "caption" }, report.note),
      ),
    );
    // Weather (solo task 30): active modifiers listed pre-battle.
    const weather = weatherFor(view.encounter.id);
    const weatherSection = h(
      "section",
      { "data-testid": "weather-panel", "aria-label": "Weather" },
      h("h3", {}, `Weather: ${weather.label}`),
      h("p", { class: "caption" }, weather.description),
    );
    if (weather.modifiers.length > 0) {
      const modList = h("ul", { class: "weather__list" });
      for (const mod of weather.modifiers) {
        modList.appendChild(h("li", { "data-testid": `weather-mod-${mod.target}` }, mod.effect));
      }
      weatherSection.appendChild(modList);
    }
    body.appendChild(weatherSection);
    const actions = h("div", { class: "battle__actions" });
    // Auto-resolve preview (solo task 28): estimated losses before choosing.
    const preview = previewAutoResolve(view.encounter, view.playerIsAttacker);
    actions.append(
      h(
        "p",
        { class: "caption", "data-testid": "battle-autoresolve-preview" },
        `${preview.summary}. ${preview.note}`,
      ),
    );
    actions.append(
      button("Fight the battle", () => void run(() => flow.escalate()), {
        variant: "primary",
        testId: "battle-fight",
        disabled: busy,
      }),
      button("Auto-resolve", () => void run(() => flow.autoResolve()), {
        testId: "battle-autoresolve",
        disabled: busy,
      }),
      button("Stand down", standDown, {
        variant: "quiet",
        testId: "battle-standdown",
      }),
    );
    body.appendChild(actions);
    return root;
  }

  function liveScreen(view: LiveBattleView): HTMLElement {
    const { root, body } = panel({
      title: `Battle — tick ${view.battle.tick}`,
      testId: "battle-live",
    });
    body.appendChild(modeChip(view.mode));
    if (view.mode === "local") body.appendChild(localNote());
    body.appendChild(
      dataTable(
        "Forces",
        [
          { header: "Side", render: (r) => r.name },
          { header: "Troops", numeric: true, render: (r) => String(r.troops) },
          {
            header: "Morale",
            numeric: true,
            render: (r) => `${Math.round(r.morale * 100)}%`,
          },
        ],
        [view.playerSide, view.enemySide],
        "battle-live-sides",
      ),
    );
    const orders = h("div", {
      class: "battle__orders",
      role: "group",
      "aria-label": "Battle orders",
    });
    for (const def of ORDER_DEFS) {
      const btn = button(
        def.label,
        () =>
          void run(async () => {
            await flow.orders(def.orders);
            options.onBattleEvent?.("order");
          }),
        {
          variant: def.variant,
          testId: `battle-order-${def.id}`,
          describedBy: `battle-order-${def.id}-hint`,
          disabled: busy,
        },
      );
      btn.title = def.hint;
      orders.append(
        h(
          "span",
          { class: "battle__order" },
          btn,
          h(
            "span",
            {
              class: "visually-hidden",
              id: `battle-order-${def.id}-hint`,
            },
            def.hint,
          ),
        ),
      );
    }
    body.appendChild(orders);
    return root;
  }

  function afterActionScreen(view: AfterActionView): HTMLElement {
    const { root, body } = panel({
      title: "After action",
      testId: "battle-afteraction",
    });
    body.appendChild(modeChip(view.mode));
    if (view.mode === "local") body.appendChild(localNote());
    body.appendChild(
      h(
        "h3",
        {
          class: "battle__result",
          "data-testid": "battle-result",
        },
        view.playerWon ? "Victory" : "Defeat",
      ),
    );
    body.appendChild(
      h("p", { class: "caption", "data-testid": "battle-summary" }, view.summary),
    );
    body.appendChild(row("Attacker losses", String(view.attackerLosses), { mono: true }));
    body.appendChild(row("Defender losses", String(view.defenderLosses), { mono: true }));
    if (view.loot > 0) body.appendChild(row("Loot", String(view.loot), { mono: true }));
    if (view.ticks > 0) body.appendChild(row("Battle ticks", String(view.ticks), { mono: true }));
    const { aftermath } = view;
    if (aftermath.lootAppraisal !== "No spoils.") {
      body.appendChild(row("Appraisal", aftermath.lootAppraisal, { mono: true }));
    }
    if (aftermath.warStory) {
      body.appendChild(
        h("p", { class: "caption", "data-testid": "battle-warstory" }, aftermath.warStory),
      );
    }
    if (aftermath.rivalLine) {
      body.appendChild(
        h("p", { class: "caption", "data-testid": "battle-rival" }, aftermath.rivalLine),
      );
    }
    if (aftermath.comparison) {
      const cmp = aftermath.comparison;
      body.appendChild(
        h("p", { class: "caption", "data-testid": "battle-comparison" }, cmp.verdict),
      );
      for (const d of cmp.deltas) {
        body.appendChild(row(d.metric, d.line, { mono: true }));
      }
    }
    const actions = h("div", { class: "battle__actions" });
    actions.append(
      button("Return to campaign", dismiss, {
        variant: "primary",
        testId: "battle-dismiss",
      }),
    );
    body.appendChild(actions);
    return root;
  }

  function standDown(): void {
    flow.reset();
    render();
  }

  function dismiss(): void {
    flow.reset();
    render();
    options.onDone?.();
  }

  function adoptEncounter(encounter: Encounter): void {
    // One battle at a time. A second encounter arriving mid-fight waits in the banner's
    // queue rather than being dropped, and the player takes it when this one is done.
    if (flow.phase !== "idle") return;
    banner.clear();
    flow.adoptEncounter(encounter);
    render();
  }

  async function attack(
    attackerPartyId: number,
    defenderPartyId: number,
  ): Promise<void> {
    banner.clear();
    await run(() => flow.begin(attackerPartyId, defenderPartyId));
  }

  function destroy(): void {
    poller.stop();
    banner.destroy();
    announcer.region.remove();
    overlay.remove();
  }

  if (options.pollEncounters !== false) poller.start();

  return { root: overlay, flow, poller, banner, announcer, adoptEncounter, attack, destroy };
}
