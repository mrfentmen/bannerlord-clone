/**
 * Battle replay timeline viewer (Rowan solo task 27).
 *
 * Renders replay data as a scrubbable timeline: a range slider for the
 * battle clock, play/pause, speed control, and event markers. Built on the
 * existing replay player (afteraction/replay.ts) — this is the view it was
 * missing.
 */

import { h } from "../ui/dom.js";
import { createReplayPlayer, type Replay } from "./replay.js";

export interface ReplayTimelineOptions {
  replay: Replay;
  /** Called on every tick with the current time (for the scene to render). */
  onSeek?: (t: number) => void;
}

export function replayTimeline(options: ReplayTimelineOptions): HTMLElement {
  const { replay } = options;
  const player = createReplayPlayer(replay, {
    onTick: (tick) => {
      slider.value = String(tick.t);
      timeLabel.textContent = formatTime(tick.t);
      options.onSeek?.(tick.t);
    },
  });

  const root = h(
    "div",
    { class: "replay-timeline", "data-testid": "replay-timeline" },
    h("h3", {}, "Battle replay"),
  );

  const controls = h("div", { class: "replay-timeline__controls" });
  const playBtn = h(
    "button",
    { type: "button", class: "btn", "data-testid": "replay-play" },
    "Play",
  ) as HTMLButtonElement;
  playBtn.addEventListener("click", () => {
    player.toggle();
    playBtn.textContent = player.isPlaying() ? "Pause" : "Play";
  });
  controls.appendChild(playBtn);

  const speedBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "replay-speed" },
    "1×",
  ) as HTMLButtonElement;
  const SPEEDS = [1, 2, 4, 0.5];
  let speedIdx = 0;
  speedBtn.addEventListener("click", () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    player.setSpeed(SPEEDS[speedIdx]!);
    speedBtn.textContent = `${SPEEDS[speedIdx]}×`;
  });
  controls.appendChild(speedBtn);
  root.appendChild(controls);

  const slider = h("input", {
    type: "range",
    min: "0",
    max: String(replay.durationS),
    step: "0.1",
    value: "0",
    class: "replay-timeline__slider",
    "aria-label": "Battle time",
    "data-testid": "replay-slider",
  }) as HTMLInputElement;
  slider.addEventListener("input", () => {
    player.seek(Number(slider.value));
    timeLabel.textContent = formatTime(player.time());
    options.onSeek?.(player.time());
  });
  root.appendChild(slider);

  const timeLabel = h(
    "span",
    { class: "caption", "data-testid": "replay-time" },
    formatTime(0),
  );
  root.appendChild(timeLabel);

  if (replay.events.length > 0) {
    const markers = h("ul", { class: "replay-timeline__markers", "data-testid": "replay-markers" });
    for (const ev of replay.events) {
      const item = h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            class: "btn btn--quiet",
            "data-testid": `replay-marker-${Math.round(ev.t)}`,
            "aria-label": `Jump to ${ev.kind} at ${formatTime(ev.t)}`,
          },
          `${formatTime(ev.t)} ${ev.kind}`,
        ),
      ) as HTMLLIElement;
      item.querySelector("button")!.addEventListener("click", () => {
        player.seek(ev.t);
        slider.value = String(ev.t);
        timeLabel.textContent = formatTime(ev.t);
        options.onSeek?.(ev.t);
      });
      markers.appendChild(item);
    }
    root.appendChild(markers);
  }

  // Cleanup hook for the host.
  (root as unknown as { destroyReplay: () => void }).destroyReplay = () => player.destroy();
  return root;
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
