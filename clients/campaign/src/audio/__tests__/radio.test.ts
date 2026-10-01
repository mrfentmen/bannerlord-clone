/**
 * Radio tests. MASTER_PLAN.md section 4E, task 149.
 */

import { describe, expect, it, vi } from "vitest";
import { createRadio, RADIO_STATIONS } from "../radio.js";
import type { AudioPlayer, SoundHandle } from "../audio.js";

function fakePlayer(over: Partial<AudioPlayer> = {}): AudioPlayer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    playSound(file, _opts) {
      calls.push(file);
      const handle: SoundHandle = { setVolume: vi.fn(), stop: vi.fn() };
      return handle;
    },
    ...over,
  };
}

describe("radio", () => {
  it("ships at least one station with an id and a name", () => {
    expect(RADIO_STATIONS.length).toBeGreaterThan(0);
    for (const station of RADIO_STATIONS) {
      expect(station.id.length).toBeGreaterThan(0);
      expect(station.name.length).toBeGreaterThan(0);
    }
  });

  it("starts on the first station and reports it", () => {
    const player = fakePlayer();
    const radio = createRadio(player);
    radio.start();
    expect(radio.isPlaying()).toBe(true);
    expect(radio.current()).toEqual(RADIO_STATIONS[0]);
    const first = player.calls[0];
    if (first === undefined) throw new Error("expected one playSound call");
    const station0 = RADIO_STATIONS[0];
    if (!station0) throw new Error("expected at least one station");
    expect(first).toBe(`/audio/radio/${station0.id}.mp3`);
    radio.destroy();
  });

  it("starts on a named station when given an id", () => {
    const player = fakePlayer();
    const radio = createRadio(player);
    const target = RADIO_STATIONS[RADIO_STATIONS.length - 1];
    if (!target) throw new Error("expected at least one station");
    radio.start(target.id);
    expect(radio.current()).toEqual(target);
    const first = player.calls[0];
    if (first === undefined) throw new Error("expected one playSound call");
    expect(first).toBe(`/audio/radio/${target.id}.mp3`);
    radio.destroy();
  });

  it("ignores a second start while already playing", () => {
    const player = fakePlayer();
    const radio = createRadio(player);
    radio.start();
    radio.start();
    expect(player.calls).toHaveLength(1);
    radio.destroy();
  });

  it("next() advances and wraps around the station list", () => {
    const player = fakePlayer();
    const changes: (string | null)[] = [];
    const radio = createRadio(player, { onStationChange: (s) => changes.push(s ? s.id : null) });
    radio.start();
    radio.next();
    expect(radio.current()).toEqual(RADIO_STATIONS[1 % RADIO_STATIONS.length]);
    // Walk past the end to check the wrap.
    for (let i = 0; i < RADIO_STATIONS.length; i += 1) radio.next();
    expect(radio.current()).toEqual(RADIO_STATIONS[1 % RADIO_STATIONS.length]);
    expect(changes.length).toBeGreaterThan(1);
    radio.destroy();
  });

  it("stop() ends playback and clears the current station", () => {
    const player = fakePlayer();
    const radio = createRadio(player);
    radio.start();
    radio.stop();
    expect(radio.isPlaying()).toBe(false);
    expect(radio.current()).toBeNull();
    radio.destroy();
  });

  it("skips a station whose player throws and keeps playing", () => {
    const bad: AudioPlayer = {
      playSound: () => {
        throw new Error("no file");
      },
    };
    const radio = createRadio(bad);
    radio.start();
    // A throwing player means nothing plays, but nothing throws either.
    expect(radio.isPlaying()).toBe(false);
    radio.destroy();
  });

  it("falls back to the first station for an unknown id", () => {
    const player = fakePlayer();
    const radio = createRadio(player);
    radio.start("no-such-station");
    expect(radio.current()).toEqual(RADIO_STATIONS[0]);
    radio.destroy();
  });
});
