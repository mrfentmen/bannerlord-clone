/**
 * Task 24: the player's morale bar.
 *
 * Morale is the one number on the HUD that is not a headcount, so it gets a bar
 * rather than digits. The figure is `LiveBattleView.playerSide.morale`, which
 * `BattleFlow` has already turned into a 0..1 fraction on both sides — this
 * module does not rescale it, because the server's 0..100 and the local model's
 * 0..1 are two shapes of one value and guessing between them here would be a
 * second conversion nobody could check.
 *
 * The bar is a `progressbar`, so the value is announced and reachable by keyboard
 * rather than being a picture of a number. The percentage is printed beside it
 * anyway: colour and width are not information on their own.
 */

import "./moraleBar.css";
import { h } from "../ui/dom.js";

export interface MoraleSource {
  /** Morale as a fraction of a full force, 0..1. */
  onMorale(fn: (fraction: number) => void): () => void;
}

export interface MoraleBarOptions {
  /** Which army the bar is about; sets the label and the accessible name. */
  side: "player" | "enemy";
}

export interface MoraleBar {
  root: HTMLElement;
  destroy(): void;
}

const SIDES: Record<MoraleBarOptions["side"], { label: string; name: string }> = {
  player: { label: "Your morale", name: "Your morale" },
  enemy: { label: "Enemy morale", name: "Enemy morale" },
};

/** Shown until the source reports, and again if a report is not a number. */
const UNKNOWN = "—";

export function createMoraleBar(source: MoraleSource, opts: MoraleBarOptions): MoraleBar {
  const { label, name } = SIDES[opts.side];
  const testId = opts.side === "player" ? "hud-player-morale" : "hud-enemy-morale";
  const fill = h("span", { class: "hud-morale__fill", "data-testid": `${testId}-fill` });
  const text = h("span", { class: "hud-morale__value data", "data-testid": testId }, UNKNOWN);
  const track = h(
    "div",
    {
      class: "hud-morale__track",
      role: "progressbar",
      "aria-label": name,
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "data-live": "false",
    },
    fill,
  );
  const root = h(
    "div",
    { class: `hud-morale hud-morale--${opts.side}` },
    h("span", { class: "hud-morale__label label" }, label),
    track,
    text,
  );

  const unsubscribe = source.onMorale((fraction) => {
    if (!Number.isFinite(fraction)) return;
    // Clamped for the bar, because a fill wider than its track is not a bar. The
    // printed figure is clamped to the same 0..100 the aria value reports, so
    // the three never disagree about what is being shown.
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    fill.style.width = `${pct}%`;
    text.textContent = `${pct}%`;
    track.setAttribute("aria-valuenow", String(pct));
    track.setAttribute("data-live", "true");
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}