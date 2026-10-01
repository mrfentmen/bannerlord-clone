/**
 * Audio bus tests. MASTER_PLAN.md section 4E, task 148.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import {
  attachClickSounds,
  browserAudioPlayer,
  createAudioBus,
  silentHandle,
  SOUND_EVENT_NAMES,
  SOUND_EVENTS,
  type AudioPlayer,
  type SoundEventName,
  type SoundHandle,
} from "../audio.js";

interface PlayCall {
  file: string;
  opts: { volume: number; loop?: boolean };
}

/** Fake player that records every playSound call. */
function fakePlayer(): AudioPlayer & { calls: PlayCall[]; handles: SoundHandle[] } {
  const calls: PlayCall[] = [];
  const handles: SoundHandle[] = [];
  return {
    calls,
    handles,
    playSound(file, opts) {
      calls.push({ file, opts });
      const handle: SoundHandle = {
        setVolume: vi.fn(),
        stop: vi.fn(),
      };
      handles.push(handle);
      return handle;
    },
  };
}

describe("SOUND_EVENTS documentation", () => {
  it("documents the required hook points with their event names", () => {
    const required: SoundEventName[] = ["ui.click", "combat.hit", "construction.complete"];
    for (const name of required) {
      expect(SOUND_EVENT_NAMES).toContain(name);
    }
  });

  it("gives every event a file, a volume, and a description", () => {
    for (const name of SOUND_EVENT_NAMES) {
      const spec = SOUND_EVENTS[name];
      expect(spec.file, `${name} file`).toMatch(/^\/audio\//);
      expect(spec.volume, `${name} volume`).toBeGreaterThan(0);
      expect(spec.volume, `${name} volume`).toBeLessThanOrEqual(1);
      expect(spec.description.length, `${name} description`).toBeGreaterThan(0);
    }
  });
});

describe("createAudioBus", () => {
  it("plays the documented file and volume for an event", () => {
    const player = fakePlayer();
    const bus = createAudioBus(player);
    bus.play("ui.click");
    expect(player.calls).toHaveLength(1);
    const first = player.calls[0];
    if (!first) throw new Error("expected one playSound call");
    expect(first.file).toBe(SOUND_EVENTS["ui.click"].file);
    expect(first.opts.volume).toBeCloseTo(SOUND_EVENTS["ui.click"].volume);
  });

  it("scales event volume by the master volume", () => {
    const player = fakePlayer();
    const bus = createAudioBus(player);
    bus.setMasterVolume(0.5);
    bus.play("combat.hit");
    const first = player.calls[0];
    if (!first) throw new Error("expected one playSound call");
    expect(first.opts.volume).toBeCloseTo(SOUND_EVENTS["combat.hit"].volume * 0.5);
  });

  it("clamps the master volume to 0..1", () => {
    const player = fakePlayer();
    const bus = createAudioBus(player);
    bus.setMasterVolume(5);
    expect(bus.masterVolume()).toBe(1);
    bus.setMasterVolume(-2);
    expect(bus.masterVolume()).toBe(0);
  });

  it("stays silent while muted and plays again after unmute", () => {
    const player = fakePlayer();
    const bus = createAudioBus(player);
    bus.mute();
    expect(bus.isMuted()).toBe(true);
    bus.play("ui.click");
    expect(player.calls).toHaveLength(0);
    bus.unmute();
    expect(bus.isMuted()).toBe(false);
    bus.play("ui.click");
    expect(player.calls).toHaveLength(1);
  });
});

describe("attachClickSounds", () => {
  it("plays ui.click when a button inside the root is clicked", () => {
    const player = fakePlayer();
    const bus = createAudioBus(player);
    const root = document.createElement("div");
    const btn = document.createElement("button");
    btn.textContent = "Hire";
    root.appendChild(btn);
    document.body.appendChild(root);
    const detach = attachClickSounds(root, bus);
    btn.click();
    expect(player.calls).toHaveLength(1);
    const first = player.calls[0];
    if (!first) throw new Error("expected one playSound call");
    expect(first.file).toBe(SOUND_EVENTS["ui.click"].file);
    detach();
    btn.click();
    expect(player.calls).toHaveLength(1);
    root.remove();
  });

  it("ignores clicks outside buttons, disabled buttons, and opt-outs", () => {
    const player = fakePlayer();
    const bus = createAudioBus(player);
    const root = document.createElement("div");
    const plain = document.createElement("span");
    plain.textContent = "not a button";
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const optedOut = document.createElement("button");
    optedOut.setAttribute("data-no-click-sound", "");
    root.append(plain, disabled, optedOut);
    document.body.appendChild(root);
    attachClickSounds(root, bus);
    plain.click();
    disabled.click();
    optedOut.click();
    expect(player.calls).toHaveLength(0);
    root.remove();
  });
});

describe("browserAudioPlayer", () => {
  it("returns a silent handle where Audio is unavailable", () => {
    const player = browserAudioPlayer();
    const handle = player.playSound("/audio/sfx/ui-click.mp3", { volume: 1 });
    expect(() => {
      handle.setVolume(0.5);
      handle.stop();
    }).not.toThrow();
  });

  it("silentHandle never throws", () => {
    const handle = silentHandle();
    expect(() => {
      handle.setVolume(0.5);
      handle.stop();
    }).not.toThrow();
  });
});
