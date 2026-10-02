/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameAudio } from "../audio.js";

function stubMedia(): void {
  window.HTMLMediaElement.prototype.play = (() =>
    Promise.resolve()) as unknown as typeof window.HTMLMediaElement.prototype.play;
  window.HTMLMediaElement.prototype.pause = (() => undefined) as unknown as typeof window.HTMLMediaElement.prototype.pause;
}

describe("GameAudio danger layer", () => {
  beforeEach(() => {
    stubMedia();
    vi.useFakeTimers();
    return () => {
      vi.useRealTimers();
    };
  });

  it("starts muted-off and fades the tension bed in on setDanger(true)", () => {
    const audio = new GameAudio({ muteButton: false });
    audio.unlock();
    expect(audio.danger).toBe(false);
    audio.setDanger(true);
    expect(audio.danger).toBe(true);
    const el = (audio as unknown as { dangerEl: HTMLAudioElement }).dangerEl;
    expect(el.src).toContain("music/danger-pulse.mp3");
    expect(el.loop).toBe(true);
    // Fade completes after 20 steps x 50ms.
    vi.advanceTimersByTime(1100);
    expect(el.volume).toBeCloseTo(0.35, 2);
  });

  it("fades out and pauses on setDanger(false)", () => {
    const audio = new GameAudio({ muteButton: false });
    audio.unlock();
    audio.setDanger(true);
    vi.advanceTimersByTime(1100);
    const el = (audio as unknown as { dangerEl: HTMLAudioElement }).dangerEl;
    const pause = vi.spyOn(el, "pause");
    audio.setDanger(false);
    expect(audio.danger).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(el.volume).toBeCloseTo(0, 2);
    expect(pause).toHaveBeenCalled();
  });

  it("is a no-op when called with the current state", () => {
    const audio = new GameAudio({ muteButton: false });
    audio.unlock();
    audio.setDanger(true);
    const el = (audio as unknown as { dangerEl: HTMLAudioElement }).dangerEl;
    const play = vi.spyOn(el, "play");
    audio.setDanger(true);
    expect(play).not.toHaveBeenCalled();
  });

  it("remembers danger across unlock and starts on the gesture", () => {
    const audio = new GameAudio({ muteButton: false });
    audio.setDanger(true);
    expect(audio.danger).toBe(true);
    const el = (audio as unknown as { dangerEl: HTMLAudioElement }).dangerEl;
    expect(el.src).toBe("");
    audio.unlock();
    expect(el.src).toContain("music/danger-pulse.mp3");
  });

  it("keeps the danger bed silent while muted", () => {
    const audio = new GameAudio({ muteButton: false });
    audio.unlock();
    audio.setMuted(true);
    audio.setDanger(true);
    vi.advanceTimersByTime(1100);
    const el = (audio as unknown as { dangerEl: HTMLAudioElement }).dangerEl;
    expect(el.volume).toBe(0);
  });
});
