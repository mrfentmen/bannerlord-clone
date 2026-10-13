/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { replayTimeline } from "../replayTimeline.js";
import type { Replay } from "../replay.js";

const REPLAY: Replay = {
  durationS: 120,
  events: [
    { t: 10, kind: "charge", data: {} },
    { t: 60, kind: "rout", data: {} },
  ],
};

describe("battle replay timeline (solo task 27)", () => {
  it("renders slider, play, speed, and event markers", () => {
    const el = replayTimeline({ replay: REPLAY });
    expect(el.querySelector('[data-testid="replay-slider"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="replay-play"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="replay-speed"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="replay-markers"] li')).toHaveLength(2);
  });

  it("scrubbing the slider seeks and notifies", () => {
    const onSeek = vi.fn();
    const el = replayTimeline({ replay: REPLAY, onSeek });
    const slider = el.querySelector('[data-testid="replay-slider"]') as HTMLInputElement;
    slider.value = "60";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onSeek).toHaveBeenCalledWith(60);
    expect(el.querySelector('[data-testid="replay-time"]')?.textContent).toBe("1:00");
  });

  it("marker buttons jump to the event", () => {
    const onSeek = vi.fn();
    const el = replayTimeline({ replay: REPLAY, onSeek });
    const marker = el.querySelector('[data-testid="replay-marker-10"]') as HTMLButtonElement;
    marker.click();
    expect(onSeek).toHaveBeenCalledWith(10);
  });

  it("play button toggles label", () => {
    const el = replayTimeline({ replay: REPLAY });
    const play = el.querySelector('[data-testid="replay-play"]') as HTMLButtonElement;
    expect(play.textContent).toBe("Play");
    play.click();
    expect(play.textContent).toBe("Pause");
    play.click();
    expect(play.textContent).toBe("Play");
    (el as unknown as { destroyReplay: () => void }).destroyReplay();
  });

  it("speed button cycles speeds", () => {
    const el = replayTimeline({ replay: REPLAY });
    const speed = el.querySelector('[data-testid="replay-speed"]') as HTMLButtonElement;
    expect(speed.textContent).toBe("1×");
    speed.click();
    expect(speed.textContent).toBe("2×");
    (el as unknown as { destroyReplay: () => void }).destroyReplay();
  });
});
