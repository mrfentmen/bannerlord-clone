/**
 * @vitest-environment jsdom
 */
/**
 * Audio lane prerequisite (tasks 501–600): the manifest stores repository paths
 * because it doubles as the attribution ledger, but the browser serves
 * `clients/campaign/public/` as the web root — so the stored path must be
 * normalised before it is fetched, or every asset 404s and the game is silent.
 *
 * The integration test records the URLs actually fetched and asserts the stored
 * path never reaches the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager, webAudioPath } from "../AudioManager.js";

class FakeParam {
  value = 0;
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
}

class FakeGain {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createGain(): FakeGain {
    return new FakeGain();
  }
  decodeAudioData(): Promise<unknown> {
    return Promise.resolve({ duration: 1 });
  }
}

const ASSETS = [
  {
    id: "sfx-ui-click",
    path: "clients/campaign/public/audio/sfx/ui/click.mp3",
  },
  {
    id: "menu-theme",
    path: "clients/campaign/public/audio/menu-theme.mp3",
  },
  {
    id: "already-web",
    path: "/audio/already-web.mp3",
  },
];

let fetched: string[];

beforeEach(() => {
  fetched = [];
  const ctx = new FakeAudioContext();
  (window as unknown as { AudioContext: new () => unknown }).AudioContext = class {
    constructor() {
      return ctx;
    }
  };
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    return {
      json: async () => ({ assets: ASSETS }),
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("webAudioPath", () => {
  it("turns a repository path into a web-root path", () => {
    expect(webAudioPath("clients/campaign/public/audio/menu-theme.mp3")).toBe(
      "/audio/menu-theme.mp3",
    );
    expect(webAudioPath("clients/campaign/public/audio/sfx/ui/click.mp3")).toBe(
      "/audio/sfx/ui/click.mp3",
    );
  });

  it("leaves a web-root path alone and fixes a dot-relative one", () => {
    expect(webAudioPath("/audio/already-web.mp3")).toBe("/audio/already-web.mp3");
    expect(webAudioPath("./audio/thing.mp3")).toBe("/audio/thing.mp3");
  });
});

describe("manifest loading uses the normalised path", () => {
  it("fetches assets from the web root, never from the repository path", async () => {
    const audio = new AudioManager();
    await audio.init();
    await audio.loadManifest("/audio-manifest.json");

    expect(fetched).toContain("/audio/sfx/ui/click.mp3");
    // The page's own manifest fetch is the only non-asset request.
    const assetFetches = fetched.filter((url) => url !== "/audio-manifest.json");
    for (const url of assetFetches) {
      expect(url.startsWith("/audio/")).toBe(true);
      expect(url).not.toContain("clients/campaign/public");
    }
  });

  it("normalises on-demand preloads too", async () => {
    const audio = new AudioManager();
    await audio.init();
    await audio.loadManifest("/audio-manifest.json");
    fetched.length = 0;
    await audio.preload(["already-web"]);
    expect(fetched).toEqual(["/audio/already-web.mp3"]);
  });
});
