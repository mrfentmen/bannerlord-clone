/**
 * Task 21: the HUD top bar.
 *
 * Three facts about the fight, in one strip across the top of the screen: who
 * is fighting, how long it has been going, and what the sky is doing.
 *
 * The battle name and the weather are passed in rather than derived here. Both
 * have real owners elsewhere — the name from the encounter's two party names
 * (`BattleFlow`), the weather from `battleflow/weather.ts`'s deterministic
 * `weatherFor(encounterId)`, which is the same figure the simulation applies to
 * damage and movement. A top bar that guessed its own weather would be a
 * second, disagreeing weather report.
 *
 * The clock is `ui/battleTimer.ts`'s `createBattleTimer`, reused rather than
 * reimplemented: task 38 owns elapsed battle time and one implementation of it
 * is enough. The caller starts and stops it with the battle, so this module has
 * no opinion about when the clock runs.
 */

import "./topBar.css";
import { h } from "../ui/dom.js";
import { createBattleTimer, type BattleTimer } from "../ui/battleTimer.js";
import type { BattleWeather, WeatherKind } from "../battleflow/weather.js";

export type { BattleWeather };

/**
 * Weather as a glyph. The word sits beside it in the rendered chip, so the
 * glyph is decoration for a sighted player and never the only carrier of the
 * meaning; a screen reader is told "Rain" by the chip's own label.
 */
const WEATHER_GLYPH: Record<WeatherKind, string> = {
  clear: "☀",
  rain: "☂",
  fog: "☰",
  snow: "❄",
  heat: "☼",
};

export interface TopBarOptions {
  /** The two sides, as the encounter names them: "Vlandia vs Western Empire". */
  battleName: string;
  /** The weather the simulation is running under. */
  weather: BattleWeather;
  /** Clock for the embedded timer; injected for tests. */
  now?: () => number;
}

export interface TopBar {
  root: HTMLElement;
  /** The embedded elapsed clock, so the caller can start it with the battle. */
  timer: BattleTimer;
  destroy(): void;
}

export function createTopBar(opts: TopBarOptions): TopBar {
  const timer = createBattleTimer(opts.now ? { now: opts.now } : {});
  const weather = h(
    "span",
    { class: "hud-topbar__weather", role: "img", "aria-label": `Weather: ${opts.weather.label}` },
    h("span", { class: "hud-topbar__weather-glyph", "aria-hidden": "true" }, WEATHER_GLYPH[opts.weather.kind]),
    h("span", { class: "hud-topbar__weather-label", "data-testid": "hud-topbar-weather" }, opts.weather.label),
  );
  const root = h(
    "header",
    { class: "hud-topbar", "data-testid": "hud-topbar", role: "banner", "aria-label": "Battle status" },
    h("h2", { class: "hud-topbar__name", "data-testid": "hud-topbar-name" }, opts.battleName),
    timer.root,
    weather,
  );

  return {
    root,
    timer,
    destroy() {
      timer.destroy();
      root.remove();
    },
  };
}