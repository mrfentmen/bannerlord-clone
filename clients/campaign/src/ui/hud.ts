/**
 * The campaign HUD. `UI_UX.md` section 4.
 *
 * Top bar: date, time controls, and the five resources. Left: the party summary.
 * Right: the context panel for whatever is selected. Bottom: notifications.
 *
 * Every element of it is a real control with a real name, and every panel that reads
 * data shows a skeleton shaped like its content before the request goes out
 * (CONSTITUTION.md section 3.2).
 */

import { announce, clear, h, liveRegion, type Child } from "./dom.js";
import { errorState, skeleton, stamp, statusChip, type StatusKind } from "./kit.js";
import type {
  ConnectionStatus,
  Notification,
  ResourceId,
  ResourceWarning,
  SimSnapshot,
} from "../data/types.js";
import type { FogIndicator } from "../data/fog.js";
import { fogLegend, fogViewDetail } from "../data/fogView.js";

export interface HudOptions {
  onSelectPanel: (panel: HudPanel) => void;
  onTimeScale: (scale: number) => void;
  /** Jump the clock to the end of the party's current march. Optional: the button hides without it. */
  onSkipToArrival?: () => void;
  onOpenDataSource: () => void;
  /**
   * Applies one of the four text-size settings.
   *
   * The name says "open" but the signature is a setter, and it is kept as-is because
   * `main.ts` already supplies it under this key and is not this file to rename.
   */
  onOpenUiScale: (scale: number) => void;
  onNotification: (entityId: string, field: string) => void;
}

/**
 * The panels the context region can hold.
 *
 * `barter` is in here rather than being opened straight from the town panel because it
 * needs a town *and* a lord to bargain with, and the rail is where the player chooses a
 * panel: adding a fourth button there is cheaper than adding an action the town panel
 * would have to grow a skeleton row for.
 *
 * `quests` is here for the same reason, and for a second one: a quest log belongs to a
 * party rather than to a town, and its board is read by party id, so there is no town to
 * hang it off the way `barter` hangs off `town`.
 *
 * `rumours` is here for the same reason again and for a third: a rumour names two towns
 * rather than one, and the feed is a read of the world's prices rather than of anything
 * the map has selected, so there is no settlement on it to open the panel from.
 */
export type HudPanel =
  | "town"
  | "market"
  | "barter"
  | "party"
  | "march"
  | "quests"
  | "rumours"
  | "ledger"
  | "roster"
  | "why"
  | "none";

/** Which detent of the time dial is live. Used by the pointer and the tick scale. */
export type TimePositionId = "paused" | "normal" | "fast" | "very-fast";

/** One detent on the time dial. `scale` is the multiplier the simulation is run at. */
export interface TimePosition {
  id: TimePositionId;
  scale: number;
  /** Decorative, and always printed beside `label`. Nothing here is icon-only. */
  glyph: string;
  /** The typed label on the printed scale. */
  label: string;
  /** The accessible name, which must contain `label` (WCAG 2.5.3). */
  name: string;
  /** The tooltip, which says what the position does rather than repeating the label. */
  phrase: string;
}

/**
 * Notification priority, in the redundant shapes of ART_DIRECTION.md section 5.3.
 * The same glyph vocabulary as the status chips, so a critical notice and a critical
 * gauge are the same shape across the whole interface.
 */
const PRIORITY_GLYPH: Record<Notification["priority"], string> = {
  critical: "◆",
  important: "▲",
  informational: "■",
};

const PRIORITY_WORD: Record<Notification["priority"], string> = {
  critical: "Critical",
  important: "Important",
  informational: "For information",
};

/** `ART_DIRECTION.md` section 12: the four text-size settings, in percent. */
const UI_SCALES = [90, 100, 115, 130] as const;

type UiScale = (typeof UI_SCALES)[number];

const UI_SCALE_DEFAULT: UiScale = 100;

function isUiScale(value: number): value is UiScale {
  return (UI_SCALES as readonly number[]).includes(value);
}

/** The setting actually in force, read from the root element `main.ts` writes to. */
function currentUiScale(): UiScale {
  const raw = typeof document === "undefined" ? null : document.documentElement.getAttribute("data-ui-scale");
  const value = raw === null ? UI_SCALE_DEFAULT : Number(raw);
  return isUiScale(value) ? value : UI_SCALE_DEFAULT;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `ECONOMY.md` section 1: four core resources plus medicine. */
const RESOURCES: { id: ResourceId; label: string }[] = [
  { id: "money", label: "Money" },
  { id: "gold", label: "Gold" },
  { id: "food", label: "Grain" },
  { id: "metal", label: "Metal" },
  { id: "medicine", label: "Medicine" },
];

/**
 * The four detents of the time dial, in the order they sit on the arc.
 *
 * `glyph` is decorative and always sits beside a typed `label`, because nothing in
 * this interface is an icon-only control. `phrase` is the longer form for the
 * tooltip, so hovering says what the position does rather than repeating the label.
 */
export const TIME_POSITIONS = [
  { id: "paused", scale: 0, glyph: "‖", label: "Pause", name: "Pause", phrase: "Hold the clock where it is" },
  { id: "normal", scale: 1, glyph: "▶", label: "Normal", name: "Normal speed", phrase: "One day per real second" },
  { id: "fast", scale: 3, glyph: "▶▶", label: "Fast", name: "Fast speed", phrase: "Three days per real second" },
  { id: "very-fast", scale: 10, glyph: "▶▶▶", label: "Very fast", name: "Very fast speed", phrase: "Ten days per real second" },
] as const satisfies readonly TimePosition[];

export interface HudHandle {
  root: HTMLElement;
  renderState(state: HudState): void;
  setConnection(status: ConnectionStatus): void;
  announcer: HTMLElement;
}

export interface HudState {
  snapshot: SimSnapshot;
  warnings: ResourceWarning[];
  /** Panel to show in the right column. `null` while the map has nothing selected. */
  context: { panel: HudPanel; node: Node } | null;
  loading: boolean;
  loadingShape: string;
  timeScale: number;
  partyDaysOfFood: number;
  selectionName: string;
  /**
   * What this side can see, for the persistent fog indicator. Always present, because
   * "the simulation published no fog" is a state the indicator has to render rather
   * than an absence it can skip.
   */
  fog: FogIndicator;
  /**
   * Whether the player has turned fog off. Defaults to on.
   *
   * The toggle is in the rail rather than a settings panel because it changes what the map
   * claims to be, and burying that behind a settings screen is how a player ends up with an
   * unfiltered map and no memory of having turned it on.
   *
   * Optional so a caller that only wants the counts can leave it out, which is every test
   * that is not about the toggle. Defaulting to *on* is the safe direction: a missing
   * setting must never be the reason a map is drawn whole.
   */
  fogEnabled?: boolean;
  /** Turns the display setting. Never changes what the simulation publishes. */
  onFogToggle?: (enabled: boolean) => void;
}

export function createHud(options: HudOptions): HudHandle {
  const top = h("div", { class: "hud__top" });
  const left = h("div", { class: "hud__left" });
  const right = h("div", { class: "hud__right", "data-testid": "context-panel" });
  const bottom = h("div", { class: "hud__bottom" });
  const announcer = liveRegion("");

  // A dedicated region for the visible map. It holds nothing; the canvas is behind the
  // HUD. It exists so the narrow layout can reserve map space with flex rather than
  // guessing a max-height for a sheet that would then overlap the controls.
  const mapRegion = h("div", { class: "hud__map", "aria-hidden": "true" });

  const root = h("div", { class: "hud" }, top, left, mapRegion, right, bottom, announcer);

  let lastConnection: ConnectionStatus = { state: "connecting", detail: "", attempt: 0 };
  let lastState: HudState | null = null;

  function renderTop(state: HudState): HTMLElement {
    const bar = h("div", { class: "sheet topbar", "data-testid": "top-bar" });
    const { snapshot } = state;

    bar.appendChild(
      h(
        "div",
        { class: "topbar__clock" },
        h("span", { class: "caption", "data-testid": "hud-date" }, dateLabel(snapshot.day, snapshot.year)),
        h("span", { class: "caption" }, `Era tier ${snapshot.eraTier}`),
      ),
    );

    const res = h("div", { class: "topbar__resources" });
    for (const r of RESOURCES) {
      const value = snapshot.player.resources[r.id];
      const warning = state.warnings.find((w) => w.resource === r.id);
      const trend = trendOf(snapshot.ledger.netPerDay[r.id]);
      res.appendChild(
        h(
          "div",
          {
            class: "res",
            "data-testid": `res-${r.id}`,
            "data-status": warning ? warning.severity : "normal",
            title: warning ? `${warning.headline}. ${warning.detail}` : resourceTitle(r.id, value),
          },
          // Motif 6: the key is typed onto the form, so it is mono, uppercase and
          // widely tracked rather than set as running sans text.
          h("span", { class: "res__key data-sm" }, r.label),
          h(
            "span",
            { class: "res__value" },
            h("span", { class: "res__trend", "aria-hidden": "true", "data-trend": trend }, trendGlyph(trend)),
            // The type scale puts top-bar resources on `type-data-lg`, so the five
            // numbers are the largest figures on screen and are all tabular mono.
            h("span", { class: "res__figure data-lg" }, formatResource(r.id, value)),
          ),
          warning
            ? h("span", { class: "res__note", "data-testid": `res-note-${r.id}` }, daysNote(warning))
            : h("span", { class: "res__note" }, r.id === "food" ? `${state.partyDaysOfFood.toFixed(1)} days` : ""),
        ),
      );
    }
    bar.appendChild(res);
    bar.appendChild(uiScaleControl());
    bar.appendChild(dial(state.timeScale));
    bar.appendChild(skipToArrival(state));
    return bar;
  }

  /**
   * Jump the clock to the end of the current march. A one-shot button, not a dial
   * detent: it does one thing once rather than setting a speed. Disabled when the
   * party is not marching, because there is no arrival to skip to. Hidden entirely
   * when the app supplies no skip handler.
   */
  function skipToArrival(state: HudState): HTMLElement {
    if (!options.onSkipToArrival) return h("span", { style: "display:none" });
    const marching = state.snapshot.party.destination !== null;
    const btn = h(
      "button",
      {
        type: "button",
        class: "btn",
        "data-testid": "skip-to-arrival",
        "aria-label": marching
          ? `Skip to arrival at ${state.snapshot.party.destination?.name}`
          : "Skip to arrival",
        title: marching
          ? `Run the clock forward until the party reaches ${state.snapshot.party.destination?.name}.`
          : "The party is not marching. Order a march first.",
        disabled: marching ? undefined : true,
      },
      h("span", { class: "dial__glyph", "aria-hidden": "true" }, "⏭"),
      h("span", { class: "dial__label" }, "Skip to arrival"),
    );
    btn.addEventListener("click", () => options.onSkipToArrival?.());
    return btn;
  }

  /**
   * The text-size setting, as a field on the form rather than a gear icon.
   *
   * ART_DIRECTION.md section 12 asks for 90 / 100 / 115 / 130 percent, and `main.ts`
   * already applies whatever is stored on the root element. The control reads that
   * attribute rather than keeping its own copy, so it shows the truth even when the
   * size was changed at boot or from anywhere else, and cannot disagree with it.
   */
  function uiScaleControl(): HTMLElement {
    const id = "hud-ui-scale";
    const current = currentUiScale();
    const select = h(
      "select",
      {
        id,
        class: "uiscale__select field__input",
        "data-testid": "ui-scale",
        "aria-label": "Text size",
      },
      ...UI_SCALES.map((scale) =>
        h("option", { value: String(scale), selected: scale === current ? true : undefined }, `${scale}%`),
      ),
    );
    select.value = String(current);
    select.addEventListener("change", () => {
      const next = Number(select.value);
      if (isUiScale(next)) options.onOpenUiScale(next);
    });
    return h(
      "div",
      { class: "uiscale" },
      h("label", { class: "uiscale__label data-sm", for: id }, "Text"),
      select,
    );
  }

  /**
   * The time control, as a rotary dial with four detents. `ART_DIRECTION.md`
   * section 6.8 asks for exactly this and rules out the three-pill-button
   * alternative, so the face carries a pointer that swings to whichever detent is
   * live, and each detent is a tick on the printed scale beside it.
   *
   * Semantically it is a radio group: one of four mutually exclusive positions, so
   * the ARIA radiogroup pattern is used rather than four independent toggles. That
   * means a roving `tabindex` (one stop in the tab order, not four) and arrow keys
   * to move between detents, which is what a real dial does. The buttons are not
   * hidden and not replaced by the drawing: the drawing is `aria-hidden`, and the
   * buttons are the controls.
   *
   * `aria-pressed` is mirrored from `aria-checked` on each detent. It is redundant
   * with the radio role, and the honest fix is to drop it, but two test files outside
   * this area assert on it (`src/ui/__tests__/rendered.test.ts` and
   * `tests/e2e/campaign.spec.ts`), so it stays until those are updated together.
   */
  function dial(current: number): HTMLElement {
    const position = TIME_POSITIONS.find((p) => p.scale === current) ?? TIME_POSITIONS[0];
    const wrap = h("div", {
      class: "dial",
      role: "radiogroup",
      "aria-label": "Time controls",
      "data-testid": "time-dial",
      "data-position": position.id,
    });

    // The face: a pointer and three detent ticks. Decorative. The detent buttons
    // below it carry the names and do the work.
    const face = h("span", { class: "dial__face", "aria-hidden": "true" });
    for (const detent of TIME_POSITIONS) {
      face.appendChild(
        h("span", { class: "dial__detent", "data-detent": detent.id, "data-on": detent.scale === current ? "true" : "false" }),
      );
    }
    face.appendChild(h("span", { class: "dial__pointer" }));
    wrap.appendChild(face);

    // The printed scale. Each detent is a tick, a speed glyph and a typed label, so
    // nothing here is an icon-only control (ART_DIRECTION.md section 2.4).
    const scale_ = h("span", { class: "dial__scale" });
    const buttons: HTMLButtonElement[] = [];
    for (const detent of TIME_POSITIONS) {
      const selected = detent.scale === current;
      const btn = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: "dial__detent-btn",
          "data-testid": `time-${detent.scale}`,
          "data-position": detent.id,
          "aria-checked": selected ? "true" : "false",
          "aria-pressed": selected ? "true" : "false",
          "aria-label": detent.name,
          title: detent.phrase,
          // Roving tabindex: the dial is one stop in the tab order.
          tabindex: selected ? "0" : "-1",
        },
        h("span", { class: "dial__tick", "aria-hidden": "true" }),
        h("span", { class: "dial__glyph", "aria-hidden": "true" }, detent.glyph),
        h("span", { class: "dial__label" }, detent.label),
      );
      btn.addEventListener("click", () => options.onTimeScale(detent.scale));
      scale_.appendChild(btn);
      buttons.push(btn);
    }

    // Arrow keys walk the detents, the way turning a knob does. Home and End jump to
    // the ends of the arc. The handler is on the group rather than on each button, so
    // it catches the key wherever focus sits inside the dial. Only the live detent is
    // tabbable, so `current` is the one that was focused.
    wrap.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      const at = TIME_POSITIONS.findIndex((p) => p.scale === current);
      const to = event.key === "Home" ? 0 : event.key === "End" ? TIME_POSITIONS.length - 1 : at + step;
      if (to === at || to < 0 || to >= TIME_POSITIONS.length) return;
      event.preventDefault();
      const next = TIME_POSITIONS[to];
      if (!next) return;
      options.onTimeScale(next.scale);
      // The repaint is what moves focus to the new detent, so ask for it by test id
      // rather than holding a reference to a node that is about to be replaced.
      queueMicrotask(() => {
        const el = wrap.querySelector<HTMLButtonElement>(`[data-testid="time-${next.scale}"]`);
        el?.focus();
      });
    });

    wrap.appendChild(scale_);
    return wrap;
  }

  function renderLeft(state: HudState): HTMLElement {
    const { snapshot } = state;
    const headcount = snapshot.party.troops.reduce((a: number, t: { count: number }) => a + t.count, 0);
    const rail = h("div", { class: "rail" });

    const card = h("div", { class: "sheet rail__card", "data-testid": "party-rail" });
    card.appendChild(h("h3", { class: "rail__name label" }, snapshot.player.characterName));
    card.appendChild(h("p", { class: "caption", style: "margin:0 0 var(--space-2)" }, snapshot.party.name));
    card.appendChild(
      h(
        "div",
        {},
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Troops"), h("span", { class: "row__value data" }, String(headcount))),
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Grain"), h("span", { class: "row__value data", "data-testid": "rail-food" }, `${state.partyDaysOfFood.toFixed(1)} d`)),
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Morale"), h("span", { class: "row__value data" }, snapshot.party.morale.toFixed(2))),
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Ammo"), h("span", { class: "row__value data" }, String(Math.round(snapshot.party.metal)))),
      ),
    );
    rail.appendChild(card);

    const buttons = h("div", { class: "stack" });
    for (const [id, label, testId] of [
      ["party", "Party", "open-party"],
      ["march", "March", "open-march"],
      ["quests", "Quests", "open-quests"],
      ["rumours", "Rumours", "open-rumours"],
      ["barter", "Barter", "open-barter"],
      ["ledger", "Ledger", "open-ledger"],
      ["roster", "Rulers", "open-roster"],
    ] as [HudPanel, string, string][]) {
      const btn = h("button", { type: "button", class: "btn", "data-testid": testId }, label);
      btn.addEventListener("click", () => options.onSelectPanel(id));
      buttons.appendChild(btn);
    }
    rail.appendChild(buttons);

    const warnings = h("div", { class: "sheet rail__card", "data-testid": "rail-warnings" });
    warnings.appendChild(h("h4", { class: "section-header" }, "Warnings"));
    if (state.warnings.length === 0) {
      warnings.appendChild(h("p", { class: "caption", style: "margin:0" }, "Nothing short. Food, coin and metal are all holding."));
    } else {
      const list = h("ul", { class: "warnings", style: "margin-top:var(--space-2)" });
      for (const w of state.warnings.slice(0, 4)) {
        const btn = h(
          "button",
          { type: "button", class: "warning", "data-testid": `rail-warning-${w.id}`, "data-severity": w.severity, style: "width:100%;text-align:left" },
          h("span", { class: "label" }, w.headline),
        );
        btn.addEventListener("click", () => options.onNotification(w.entityId, w.field));
        list.appendChild(h("li", {}, btn));
      }
      warnings.appendChild(list);
    }
    rail.appendChild(warnings);

    rail.appendChild(fogIndicatorCard(state.fog, state.fogEnabled ?? true, state.onFogToggle ?? (() => {})));

    const dataBtn = h("button", { type: "button", class: "btn btn--quiet", "data-testid": "open-data-source" }, "Where does this data come from?");
    dataBtn.addEventListener("click", () => options.onOpenDataSource());
    rail.appendChild(dataBtn);

    return rail;
  }

  /**
   * The fog indicator: how much of this map this side can actually see.
   *
   * Persistent rather than sitting in the data-source modal, because the modal is
   * something the player goes looking for, and the question fog raises — how much of my
   * map is actually mine — is one they should be able to answer without leaving the map.
   *
   * The three states are three numbers and not a progress bar, because they are not
   * fractions of one journey: `unseen` is a place the player may never find, so a bar
   * filling toward "explored" would frame exploring as work owed rather than a fact
   * about the world.
   *
   * Each row carries its own colour swatch *and* its own word, so the three are
   * distinguishable with no colour vision and by a screen reader, which is the same
   * redundancy rule the notifications tray follows.
   */
  function fogIndicatorCard(
    fog: FogIndicator,
    fogEnabled: boolean,
    onFogToggle: (enabled: boolean) => void,
  ): HTMLElement {
    // The legend and the caveat are derived here rather than passed in, because both are
    // pure functions of the states and the toggle. Passing them in would have let a caller
    // render a legend that disagreed with the counts printed directly above it, and the
    // caveat is mandatory whenever the map is unfiltered — a caller that forgot to pass it
    // would be silently drawing the whole survey with no notice.
    const legend = fogLegend();
    const caveat = fogViewDetail({ enabled: fogEnabled, caveatShown: !fogEnabled });
    const card = h("div", {
      class: "sheet rail__card",
      "data-testid": "fog-indicator",
      role: "group",
      "aria-label": "Fog of war",
    });
    card.appendChild(h("h4", { class: "section-header" }, "Fog of war"));

    if (!fog.applied) {
      // The no-fog and no-vantage-point cases, stated rather than shown as zeroes.
      card.appendChild(
        h("p", {
          class: "caption",
          style: "margin:0",
          "data-testid": "fog-inactive",
        },           "Not being applied. Every settlement on this map is drawn in full, which is not a claim that this side can see all of it."),
      );
      // The legend and the toggle are still rendered when fog is inactive. Both are
      // explanations of the three states, and a player who is told "not being applied" and
      // given nothing else has no way to find out what the states would even mean.
      card.appendChild(fogLegendBlock(legend));
      card.appendChild(fogToggleBlock(fogEnabled, caveat, onFogToggle));
      return card;
    }

    // Swatch colours are the map's own: a town in sight, a remembered one, and a border
    // rule for a place with no mark at all. They are decoration for the word beside them,
    // so they are taken from existing tokens rather than introducing a second palette.
    //
    // The remembered swatch is a gradient rather than a flat fill, because that state is
    // the one with a range in it: a remembered town fades further the older its news is,
    // and a flat square beside a word called "Remembered" describes a state the map does
    // not actually have. The gradient runs left-to-right from "just seen" to "long out of
    // date", which is the same direction the ramp runs on the map.
    const rows: [string, number, string, string][] = [
      ["visible", fog.visible, "In sight", "var(--map-fog)"],
      [
        "remembered",
        fog.remembered,
        "Remembered",
        "linear-gradient(to right, var(--paper-300), var(--paper-100))",
      ],
      ["unseen", fog.unseen, "Never found", "var(--paper-100)"],
    ];
    const list = h("dl", { class: "fog__list", style: "margin:var(--space-2) 0 0" });
    for (const [id, value, label, swatch] of rows) {
      list.appendChild(
        h(
          "div",
          { class: "fog__row" },
          h(
            "dt",
            { class: "fog__label label" },
            h("span", {
              class: "fog__swatch",
              "aria-hidden": "true",
              "data-state": id,
              style: `background:${swatch}`,
            }),
            label,
          ),
          h("dd", {
            class: "fog__value data",
            "data-testid": `fog-${id}`,
          }, String(value)),
        ),
      );
    }
    card.appendChild(list);

    // The denominator, so the three numbers above have something to be a share of.
    card.appendChild(
      h(
        "p",
        { class: "caption fog__total", style: "margin:var(--space-2) 0 0", "data-testid": "fog-total" },
        `of ${fog.total} settlements on this map`,
      ),
    );

    if (fog.unsighted > 0) {
      // Only stated when non-zero, because it is a caveat on the totals above and a
      // standing caveat on a map with nothing to caveat would just be noise.
      card.appendChild(
        h(
          "p",
          { class: "caption", style: "margin:var(--space-1) 0 0", "data-testid": "fog-unsighted" },
          `${fog.unsighted} of these the simulation runs no town for, so they are drawn without a fog state.`,
        ),
      );
    }

    // Staleness: how old the remembered half of the map is.
    //
    // Its own line rather than a fourth row in the list above, because it is not a fourth
    // state. It is a property of the remembered row, and the three rows are meant to be
    // read as a partition of the map — adding a fourth would break that, and a player
    // reading four numbers as four buckets would be reading a map that does not exist.
    //
    // Shown only when something is actually old. A map where nothing has gone out of date
    // does not need saying so, and a permanent "everything is current" line would be the
    // kind of reassurance that stops being read the day it is wrong.
    if (fog.stale > 0) {
      const oldest = fog.oldestDays;
      const oldestText = oldest === null
        ? ""
        : ` The oldest is ${oldest.toFixed(0)} day${oldest === 1 ? "" : "s"} old.`;
      const row = h(
        "p",
        { class: "caption fog__stale", style: "margin:var(--space-1) 0 0", "data-testid": "fog-stale" },
        `${fog.stale} of the remembered ${fog.stale === 1 ? "place is" : "places are"} past the ` +
          `sighting memory, so they are faded further and their figures may be out of date.${oldestText}`,
      );
      card.appendChild(row);
    }

    card.appendChild(fogLegendBlock(legend));
    card.appendChild(fogToggleBlock(fogEnabled, caveat, onFogToggle));
    return card;
  }

  /**
   * The legend: a swatch and a word per state, and what it does to the map and the panels.
   *
   * A `<details>` element rather than a permanent block, because three states of prose
   * above the map's own controls would push them off a short screen. It is *not* behind
   * the data-source modal, which is where fog explanations used to be reachable: that is
   * a panel a player goes looking for, and a legend that has to be found is a legend most
   * players never read.
   */
  function fogLegendBlock(legend: ReturnType<typeof fogLegend>): HTMLElement {
    const details = h("details", { class: "fog__legend", "data-testid": "fog-legend" });
    details.appendChild(h("summary", { class: "label" }, "What the three states mean"));
    const list = h("dl", { class: "fog__legend-list" });
    for (const row of legend) {
      list.appendChild(
        h(
          "div",
          { class: "fog__legend-row", "data-state": row.state },
          h("dt", { class: "fog__legend-label label" }, row.label),
          h("dd", { class: "fog__legend-body caption" }, h("span", {}, row.onMap), " ", h("span", {}, row.inPanels)),
        ),
      );
    }
    details.appendChild(list);
    return details;
  }

  /**
   * The fog toggle, and the caveat that must accompany turning it off.
   *
   * A checkbox rather than a button, because the control reports a *setting* rather than
   * performing an action, and a checkbox is the control a screen reader will call a
   * checkbox. The caveat is rendered inside the card whenever the map is unfiltered, and
   * only then — a permanent notice on a correctly-filtered map is the same noise as the
   * unsighted caveat in the counts above.
   */
  function fogToggleBlock(
    fogEnabled: boolean,
    caveat: string | null,
    onFogToggle: (enabled: boolean) => void,
  ): HTMLElement {
    const wrap = h("div", { class: "fog__toggle-wrap" });
    const id = "fog-enabled-toggle";
    const input = h("input", {
      type: "checkbox",
      id,
      class: "fog__toggle-input",
      "data-testid": "fog-toggle",
    }) as HTMLInputElement;
    input.checked = fogEnabled;
    input.addEventListener("change", () => onFogToggle(input.checked));
    wrap.appendChild(
      h(
        "label",
        { class: "fog__toggle label", for: id },
        input,
        h("span", {}, "Fog of war"),
      ),
    );
    if (caveat !== null) {
      wrap.appendChild(
        h("p", { class: "caption fog__caveat", role: "status", "data-testid": "fog-caveat" }, caveat),
      );
    }
    return wrap;
  }

  function renderRight(state: HudState): Node {
    if (state.loading) {
      return skeleton({ shape: state.loadingShape, testId: "context-skeleton", label: "Loading." });
    }
    if (!state.context) {
      return h(
        "div",
        { class: "sheet panel", "data-testid": "no-selection" },
        h("div", { class: "panel__body" },
          h("h2", { class: "panel__title" }, "Nothing selected"),
          h("p", { class: "caption" }, "No town selected. Choose a settlement on the map, or press Tab to cycle holdings."),
        ),
      );
    }
    return state.context.node;
  }

  function renderBottom(state: HudState): HTMLElement {
    const { snapshot } = state;
    // Most urgent first, then most recent. Sorting on day alone could push a critical
    // notice off the end of the tray behind five informational ones from the same day.
    const PRIORITY_RANK: Record<Notification["priority"], number> = { critical: 0, important: 1, informational: 2 };
    const recent = [...snapshot.notifications]
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.day - a.day)
      .slice(0, 5);
    const tray = h("div", {
      class: "notices",
      "data-testid": "notifications",
      role: "region",
      "aria-label": "Notifications",
    });
    if (recent.length === 0) {
      tray.appendChild(
        h("p", { class: "sheet", style: "padding:var(--space-2) var(--space-3);margin:0", role: "status" }, "Nothing needs your attention."),
      );
      return tray;
    }
    for (const n of recent) {
      const opens = Boolean(n.entityId && n.field);
      const parts: Child[] = [
        // Priority is never carried by the coloured edge alone. The glyph is the
        // redundant shape from ART_DIRECTION.md section 5.3 and the word is there for
        // a screen reader, so the tray reads correctly with no colour vision at all.
        h("span", { class: "notice__priority", "aria-hidden": "true", "data-priority": n.priority }, PRIORITY_GLYPH[n.priority]),
        h("span", { class: "notice__day data-sm" }, dayLabel(n.day)),
        h("span", { class: "notice__text" }, n.text),
        h("span", { class: "visually-hidden" }, `${PRIORITY_WORD[n.priority]} notification.`),
      ];
      if (n.priority === "critical") {
        parts.unshift(stamp("URGENT", "critical"));
      }
      // Only a notice that has somewhere to go is a button. A control that takes
      // focus and does nothing when pressed is worse than plain text.
      const item = opens
        ? h(
            "button",
            { type: "button", class: "sheet notice", "data-testid": `notice-${n.id}`, "data-priority": n.priority },
            ...parts,
          )
        : h("div", { class: "sheet notice", "data-testid": `notice-${n.id}`, "data-priority": n.priority }, ...parts);
      if (opens) {
        item.addEventListener("click", () => {
          if (n.entityId && n.field) options.onNotification(n.entityId, n.field);
        });
      }
      tray.appendChild(item);
    }
    return tray;
  }

  /**
   * Which node is currently in each region, so an unchanged region is left alone.
   *
   * The HUD repaints on every tick, and the clock ticks several times a second. If
   * every repaint cleared and re-appended, the focused element would be removed from
   * the document on every frame and keyboard focus would be lost before a keypress
   * could ever complete. The context panel is the expensive one to rebuild, so it is
   * kept by identity, and the rest preserve focus by test id.
   */
  let inTop: Node | null = null;
  let inLeft: Node | null = null;
  let inRight: Node | null = null;
  let inBottom: Node | null = null;

  const replace = (region: HTMLElement, current: Node | null, next: Node): Node => {
    if (current === next && next.parentElement === region) return current;
    // Keep the keyboard where it was, by test id, across a repaint.
    const focused = document.activeElement;
    const focusedId =
      region.contains(focused) && focused instanceof HTMLElement ? focused.dataset.testid : undefined;
    clear(region);
    region.appendChild(next);
    if (focusedId) {
      const again = region.querySelector<HTMLElement>(`[data-testid="${focusedId}"]`);
      again?.focus();
    }
    return next;
  };

  function render(state: HudState): void {
    lastState = state;
    inTop = replace(top, inTop, renderTop(state));
    inLeft = replace(left, inLeft, renderLeft(state));
    inRight = replace(right, inRight, renderRight(state));
    inBottom = replace(bottom, inBottom, renderBottom(state));

    if (lastConnection.state === "reconnecting" || lastConnection.state === "degraded") {
      top.appendChild(
        h(
          "div",
          { class: "sheet", "data-testid": "connection-warning", role: "status", style: "padding:var(--space-1) var(--space-3);background:var(--status-warning);color:var(--paper-0);border-color:var(--status-warning)" },
          lastConnection.state === "degraded"
            ? "The simulation sent something unreadable. Showing the last good values."
            : `Reconnecting to the simulation. Attempt ${lastConnection.attempt}.`,
        ),
      );
    }
  }

  return {
    root,
    announcer,
    renderState(state) {
      render(state);
    },
    setConnection(status) {
      lastConnection = status;
      if (lastState) render(lastState);
      if (status.state === "connected") announce(announcer, "Connected to the world simulation.");
      if (status.state === "reconnecting") announce(announcer, "Lost the simulation. Reconnecting.");
    },
  };
}

/** The data-source panel, so the player can see what they are looking at. */
export function dataSourcePanel(options: {
  summary: string;
  regionName: string;
  retrieved: string;
  providerLabel: string;
  /** What the map is doing about fog, and why. Never omitted, never empty. */
  fogDetail: string;
  isFixture: boolean;
  connection: ConnectionStatus;
  onClose: () => void;
  onRetry: () => void;
}): HTMLElement {
  const wrap = h("div", { class: "sheet panel", "data-testid": "data-source-panel" });
  const body = h("div", { class: "panel__body" });

  body.appendChild(h("h2", { class: "panel__title", style: "margin:0 0 var(--space-2)" }, "Where this data comes from"));
  body.appendChild(h("p", { class: "caption" }, "Real geography is real. The state of the world is the simulation's."));

  body.appendChild(h("h3", { class: "section-header", style: "margin-top:var(--space-4)" }, "Map — real public data"));
  const mapList = h("div", {});
  mapList.append(
    dataRow("Region", options.regionName),
    dataRow("Retrieved", options.retrieved, "data"),
    dataRow("Detail", options.summary, "caption"),
    dataRow("Elevation", "NASA SRTM and USGS via AWS Open Data, terrarium tiles", "caption"),
    dataRow("Roads and towns", "OpenStreetMap, ODbL 1.0", "caption"),
    dataRow("Populations", "US Census Bureau, Vintage 2024 sub-county estimates", "caption"),
  );
  body.appendChild(mapList);

  body.appendChild(h("h3", { class: "section-header", style: "margin-top:var(--space-4)" }, "World state — the simulation"));
  const simList = h("div", {});
  simList.append(
    h(
      "div",
      { class: "row" },
      h("span", { class: "row__label label" }, "Source"),
      h("span", { class: "row__value data", "data-testid": "data-source-provider" }, options.providerLabel),
    ),
    h(
      "div",
      { class: "row" },
      h("span", { class: "row__label label" }, "Connection"),
      statusChip(connectionKind(options.connection.state), connectionText(options.connection.state), {
        testId: "data-source-connection",
      }),
    ),
  );
  body.appendChild(simList);

  // Fog of war, under the simulation rather than the map, because it is the simulation
  // that decides it: the terrain and the roads are real for everyone, and what this side
  // has found is not. Stated in a sentence rather than a row of numbers because the
  // interesting case is the one where it is *not* being applied, and a bare count of
  // "0 hidden" reads as a claim about the world rather than about the server.
  body.appendChild(h("h3", { class: "section-header", style: "margin-top:var(--space-4)" }, "What this side knows"));
  body.appendChild(h("p", { class: "caption", "data-testid": "data-source-fog" }, options.fogDetail));

  if (options.isFixture) {
    body.appendChild(
      h(
        "p",
        { class: "danger", style: "margin-top:var(--space-3)", "data-testid": "data-source-fixture-note" },
        "This build is running against test fixtures, not the real simulation. Town fields, prices, " +
          "unrest and the cause log are made up for testing. The terrain, roads and towns are real.",
      ),
    );
  }

  body.appendChild(
    h(
      "p",
      { class: "caption", style: "margin-top:var(--space-3)" },
      "Settlement classifications come from real Census populations. Where no real figure exists the town says " +
        "\"not surveyed\" rather than guessing a number.",
    ),
  );

  wrap.appendChild(
    h(
      "header",
      { class: "panel__header" },
      h("h2", { class: "panel__title" }, "Data sources"),
      h("div", { class: "panel__actions" }),
    ),
  );
  wrap.appendChild(body);

  const retry = h("button", { type: "button", class: "btn btn--primary", "data-testid": "data-source-retry" }, "Try again");
  retry.addEventListener("click", options.onRetry);
  const close = h("button", { type: "button", class: "btn", "data-testid": "data-source-close" }, "Close");
  close.addEventListener("click", options.onClose);
  body.appendChild(h("div", { class: "field-row", style: "margin-top:var(--space-4)" }, retry, close));
  return wrap;
}

/** The full-screen failure, used when the world data cannot load at all. */
export function fatalError(message: string, detail: string, onRetry: () => void): HTMLElement {
  const root = h("div", { class: "app", "data-testid": "fatal-error" });
  const stage = h("div", { class: "app__stage", style: "display:grid;place-items:center;padding:var(--space-5)" });
  const box = h("div", { class: "sheet", style: "max-width:var(--space-8);padding:var(--space-5)" });
  box.appendChild(h("h1", { class: "title", style: "margin:0 0 var(--space-2)" }, "The map did not load"));
  box.appendChild(errorState({ message, detail, onRetry, testId: "fatal-retry" }));
  stage.appendChild(box);
  root.appendChild(stage);
  return root;
}

function dataRow(label: string, value: string, valueClass = ""): HTMLElement {
  return h(
    "div",
    { class: "row" },
    h("span", { class: "row__label label" }, label),
    h("span", { class: `row__value ${valueClass}`.trim() }, value),
  );
}

function dateLabel(day: number, year: number): string {
  return `${day} ${MONTHS[(Math.max(1, day) - 1) % 12]} ${year}`;
}
function dayLabel(day: number): string {
  return `d${day}`;
}
function formatResource(id: ResourceId, v: number): string {
  if (id === "food") return `${v.toFixed(1)}d`;
  if (id === "medicine") return String(Math.round(v));
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
/** The tooltip has to say what the number is, or a bare figure is unreadable. */
function resourceTitle(id: ResourceId, v: number): string {
  if (id === "food") return `Grain: ${v.toFixed(1)} days of food in hand`;
  if (id === "medicine") return `Medicine: ${Math.round(v)} crates in hand`;
  return `${id === "money" ? "Money" : id === "gold" ? "Gold" : "Metal"}: $${Math.round(v).toLocaleString("en-US")} in hand`;
}
/**
 * How long a warned-about resource has left.
 *
 * `daysRemaining` is `null` when the resource is already spent, and `0` when it
 * runs out at the end of the day. Those are different facts, so they are worded
 * differently: printing `0.0 days` for a resource that is already gone would be a
 * number the player can read as "fine until tonight".
 */
function daysNote(warning: ResourceWarning): string {
  if (warning.daysRemaining === null) return "spent";
  if (warning.daysRemaining <= 0) return "ends today";
  return `${warning.daysRemaining.toFixed(1)} days`;
}
function trendGlyph(t: "up" | "down" | "flat"): string {
  return t === "up" ? "▲" : t === "down" ? "▼" : "—";
}
/**
 * The arrow beside a resource is that resource's own direction, read from the
 * ledger's net per day. Deriving one arrow for the whole bar and showing it on two
 * resources would claim that money and grain are moving together, which is the
 * opposite of what a ledger is for.
 */
function trendOf(netPerDay: number | undefined): "up" | "down" | "flat" {
  if (netPerDay === undefined || netPerDay === 0) return "flat";
  return netPerDay > 0 ? "up" : "down";
}
function connectionKind(s: ConnectionStatus["state"]): StatusKind {
  if (s === "connected") return "good";
  if (s === "degraded") return "warning";
  if (s === "reconnecting" || s === "connecting") return "warning";
  return "critical";
}
function connectionText(s: ConnectionStatus["state"]): string {
  if (s === "connected") return "Connected";
  if (s === "connecting") return "Connecting";
  if (s === "reconnecting") return "Reconnecting";
  if (s === "degraded") return "Connected, some updates unreadable";
  return "Offline";
}
