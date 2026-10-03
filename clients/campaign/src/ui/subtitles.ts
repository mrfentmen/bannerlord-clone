/**
 * Dialogue subtitle bar (MASTER_PLAN task 21).
 *
 * A bottom-of-screen caption line with a speaker name. The dialogue system
 * (milo's lane) feeds it via `show(speaker, text)`; this module owns the
 * presentation and the accessibility settings that shape it:
 *
 * - `subtitleSize`: small / medium / large.
 * - `subtitleBackground`: off (text shadow only) / translucent / solid.
 *
 * `role="status"` + aria-live polite so screen readers announce lines.
 * Hidden with the `hidden` attribute when no line is showing.
 */
import { h } from "./dom.js";
import { getAudioManager } from "../audio/AudioManager.js";
import { settings } from "../settings/index.js";
import type { SubtitleBackground, SubtitleSize } from "../settings/schema.js";

export interface SubtitleBar {
  readonly root: HTMLElement;
  show(speaker: string, text: string): void;
  hide(): void;
  destroy(): void;
}

const SIZE_CLASS: Record<SubtitleSize, string> = {
  small: "subtitles--small",
  medium: "subtitles--medium",
  large: "subtitles--large",
};

const BACKGROUND_CLASS: Record<SubtitleBackground, string> = {
  off: "subtitles--bg-off",
  translucent: "subtitles--bg-translucent",
  solid: "subtitles--bg-solid",
};

export function createSubtitleBar(): SubtitleBar {
  const speakerEl = h("span", { class: "subtitles__speaker" });
  const textEl = h("span", { class: "subtitles__text" });
  const root = h(
    "div",
    {
      class: "subtitles",
      role: "status",
      "aria-live": "polite",
      "data-testid": "subtitle-bar",
    },
    speakerEl,
    textEl,
  );
  root.hidden = true;

  const applySettings = (): void => {
    const s = settings.get();
    root.classList.remove(
      "subtitles--small",
      "subtitles--medium",
      "subtitles--large",
      "subtitles--bg-off",
      "subtitles--bg-translucent",
      "subtitles--bg-solid",
    );
    root.classList.add(SIZE_CLASS[s.subtitleSize], BACKGROUND_CLASS[s.subtitleBackground]);
  };
  applySettings();
  const off = settings.subscribe(applySettings);

  return {
    root,
    show(speaker: string, text: string): void {
      speakerEl.textContent = speaker;
      textEl.textContent = text;
      root.hidden = false;
      getAudioManager().setDialogueDucked(true);
    },
    hide(): void {
      root.hidden = true;
      speakerEl.textContent = "";
      textEl.textContent = "";
      getAudioManager().setDialogueDucked(false);
    },
    destroy(): void {
      off();
      getAudioManager().setDialogueDucked(false);
      root.remove();
    },
  };
}
