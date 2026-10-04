/**
 * @vitest-environment jsdom
 */
/**
 * The ported sound bus, from `milo/tasks-101-200:src/audio/audio.ts` (task 148).
 *
 * The parked module's events all named files the library does not have, so
 * nothing it could play existed. The first test here is therefore the one that
 * matters: every event id resolves to a real manifest entry with a real file
 * behind it. The rest pin the behaviour that survived the port.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SfxId } from "../AudioManager.js";
import {
  type AudioPlayer,
  SOUND_EVENT_NAMES,
  SOUND_EVENTS,
  attachClickSounds,
  createSoundBus,
  silentHandle,
  type SoundHandle,
} from "../soundEvents.js";

// vitest runs with cwd = clients/campaign. import.meta.url is an http URL under
// jsdom, so the repo root has to come from the working directory, not from it.
const index = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/audio/audio-index.json"), "utf8"),
) as { paths: Record<string, string> };

interface Call {
  id: string;
  volume: number;
  loop: boolean | undefined;
}

function recordingPlayer(): { player: AudioPlayer; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    player: {
      playSound(id: SfxId, opts: { volume: number; loop?: boolean }): SoundHandle {
        calls.push({ id, volume: opts.volume, loop: opts.loop });
        return silentHandle();
      },
    },
  };
}

describe("every sound event names an asset that exists", () => {
  it.each(SOUND_EVENT_NAMES)("%s resolves to a file", (name) => {
    const id = SOUND_EVENTS[name].id;
    const path = index.paths[id];
    expect(path, `${name} -> ${id} is not in audio-index.json`).toBeDefined();
    // The index stores web-root paths ("/audio/..."), served from public/.
    expect(existsSync(join(process.cwd(), "public", path!.replace(/^\//, "")))).toBe(true);
  });

  it("documents where each event is fired", () => {
    for (const name of SOUND_EVENT_NAMES) {
      expect(SOUND_EVENTS[name].hook.length).toBeGreaterThan(4);
      expect(SOUND_EVENTS[name].volume).toBeGreaterThan(0);
      expect(SOUND_EVENTS[name].volume).toBeLessThanOrEqual(1);
    }
  });

  it("does not name the files the parked module invented", () => {
    const ids = SOUND_EVENT_NAMES.map((name) => SOUND_EVENTS[name].id);
    // These were the parked module's paths, flattened to ids. None of them shipped.
    for (const phantom of [
      "sfx-ui-click-filepath",
      "sfx-hit",
      "sfx-shot",
      "sfx-kill",
      "sfx-construction-complete",
      "sfx-notification",
      "sfx-game-win",
      "sfx-game-lose",
    ]) {
      expect(ids).not.toContain(phantom);
    }
  });
});

describe("createSoundBus", () => {
  it("plays the event's own asset at the event's own weight", () => {
    const { player, calls } = recordingPlayer();
    const bus = createSoundBus(player);
    bus.play("combat.hit");
    expect(calls).toEqual([{ id: SOUND_EVENTS["combat.hit"].id, volume: SOUND_EVENTS["combat.hit"].volume, loop: undefined }]);
  });

  it("applies its master volume on top of the event weight", () => {
    const { player, calls } = recordingPlayer();
    const bus = createSoundBus(player);
    bus.setMasterVolume(0.5);
    expect(bus.masterVolume()).toBe(0.5);
    bus.play("combat.hit");
    expect(calls[0]!.volume).toBeCloseTo(SOUND_EVENTS["combat.hit"].volume * 0.5);
  });

  it("clamps a master volume that is out of range or not a number", () => {
    const bus = createSoundBus(recordingPlayer().player);
    bus.setMasterVolume(4);
    expect(bus.masterVolume()).toBe(1);
    bus.setMasterVolume(-2);
    expect(bus.masterVolume()).toBe(0);
    bus.setMasterVolume(Number.NaN);
    expect(bus.masterVolume()).toBe(0);
  });

  it("plays nothing while muted and resumes on unmute", () => {
    const { player, calls } = recordingPlayer();
    const bus = createSoundBus(player);
    bus.mute();
    expect(bus.isMuted()).toBe(true);
    bus.play("ui.click");
    expect(calls).toHaveLength(0);
    bus.unmute();
    bus.play("ui.click");
    expect(calls).toHaveLength(1);
  });
});

describe("attachClickSounds", () => {
  it("delegates clicks on buttons and not on anything else", () => {
    const { player, calls } = recordingPlayer();
    const bus = createSoundBus(player);
    const root = document.createElement("div");
    const button = document.createElement("button");
    const span = document.createElement("span");
    button.appendChild(span);
    root.appendChild(button);
    root.appendChild(document.createElement("p"));

    const detach = attachClickSounds(root, bus);

    span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls.map((call) => call.id)).toEqual([SOUND_EVENTS["ui.click"].id]);

    root.querySelector("p")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toHaveLength(1);

    detach();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toHaveLength(1);
  });

  it("leaves a disabled button and an opted-out button alone", () => {
    const { player, calls } = recordingPlayer();
    const bus = createSoundBus(player);
    const root = document.createElement("div");
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const optedOut = document.createElement("button");
    optedOut.setAttribute("data-no-click-sound", "");
    root.append(disabled, optedOut);

    attachClickSounds(root, bus);
    disabled.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    optedOut.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toHaveLength(0);
  });
});

describe("silentHandle", () => {
  it("takes volume and stop without doing anything", () => {
    const handle = silentHandle();
    expect(() => {
      handle.setVolume(0.5);
      handle.stop();
    }).not.toThrow();
  });

  it("keeps the real mixer player from throwing when there is no audio context", () => {
    // The default player routes through getAudioManager(); jsdom has no
    // AudioContext, so a play must still be safe to call and stay silent.
    const bus = createSoundBus();
    expect(() => bus.play("ui.click")).not.toThrow();
  });
});
