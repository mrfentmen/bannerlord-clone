/**
 * Task 125: loading tips rotation. Tips show on loading screens while the
 * world data streams in, and no tip repeats within ten loads.
 *
 * Data-level only. The rotation is a {@link TipRotator}: `next()` picks a tip
 * for a fresh load, honoring a persisted window of the last ten shown tips,
 * and `nextInSession()` cycles tips inside one loading screen without an
 * immediate repeat. The recent-tip window persists in localStorage, so the
 * no-repeat rule holds across reloads — not just within one session.
 *
 * Storage is best-effort: corrupt or blocked storage degrades to an in-memory
 * window for the session rather than crashing or showing no tip at all.
 */

export interface LoadingTip {
  /** Stable id, e.g. "tip-memorial". Persisted in the recent window. */
  id: string;
  /** One or two sentences, true about the shipped game. */
  text: string;
}

/**
 * The corpus. Every tip names a real, shipped control or screen — nothing
 * aspirational. If the feature the tip names is ever removed, the tip goes
 * with it.
 */
export const LOADING_TIPS: readonly LoadingTip[] = [
  {
    id: "tip-deploy-presets",
    text: "Before the horn, set a formation preset on the deployment map — line, column, or wedge — and your units spawn in that shape.",
  },
  {
    id: "tip-radial",
    text: "Hold the command key and flick toward an order to issue it from the radial menu — attack, follow, hold, or retreat in under a second.",
  },
  {
    id: "tip-hotkeys",
    text: "Number keys select your units and F1–F4 fire quick orders. Every binding is rebindable in the keybinding editor.",
  },
  {
    id: "tip-control-groups",
    text: "Bind units to control groups with Ctrl+number, then double-tap the number to jump the camera to them.",
  },
  {
    id: "tip-waypoints",
    text: "Hold Shift and click to queue multi-leg waypoints — a unit walks the whole route on its own.",
  },
  {
    id: "tip-market-sparkline",
    text: "Every market good carries a price-history sparkline. Prices move on real supply and demand — buy low, haul far, sell high.",
  },
  {
    id: "tip-trade-price",
    text: "The client never sets a price. A trade returns the price the market moved to — what you see is what the simulation charged.",
  },
  {
    id: "tip-memorial",
    text: "Every named hero who falls gets a stone in the war memorial, with an epitaph. Open it from the HUD rail.",
  },
  {
    id: "tip-heatmap",
    text: "The battle heatmap on the HUD rail plots every fight you've won or lost on the world map — denser ground glows red.",
  },
  {
    id: "tip-photo-mode",
    text: "Photo mode on the HUD rail gives you a free camera, filters, and a hidden UI for clean captures.",
  },
  {
    id: "tip-settings-presets",
    text: "Graphics presets — Low, Medium, High, Ultra — swap a dozen engine values in one click. Try Low if the campaign map stutters.",
  },
  {
    id: "tip-settings-search",
    text: "The settings panel has search. Type “shadow” and it finds the shadow controls for you.",
  },
  {
    id: "tip-keybindings",
    text: "Rebind every action in the keybinding editor — conflicts are flagged inline before they bite you.",
  },
  {
    id: "tip-codex",
    text: "The codex documents every mechanic in the game. When a panel confuses you, its help button opens the right page.",
  },
  {
    id: "tip-touch-rotate",
    text: "On touch screens, twist two fingers to rotate the campaign map — pinch still zooms, and neither fires a click.",
  },
  {
    id: "tip-gamepad",
    text: "Plug in a controller: gamepad navigation walks every menu without a mouse.",
  },
  {
    id: "tip-haptics",
    text: "Haptic feedback rumbles on hits and orders where the platform supports it — toggleable, and a clean no-op on desktop.",
  },
  {
    id: "tip-crash-recovery",
    text: "If a panel crashes, you get a recovery screen with reload and report — never a blank page.",
  },
  {
    id: "tip-kill-feed",
    text: "The kill feed tracks hero kills only, capped at twenty rows — the rank and file die off-screen, the named ones make the feed.",
  },
  {
    id: "tip-battle-log",
    text: "The battle log timestamps charges, routs, and hero downs as they happen.",
  },
  {
    id: "tip-threat",
    text: "A flashing screen edge means you're being flanked — the threat indicator fires on rear attacks.",
  },
  {
    id: "tip-direction",
    text: "The damage-direction arc points at whoever just hit you. Turn to face it.",
  },
  {
    id: "tip-vignette",
    text: "The red vignette closing in means you're near death. It scales with exactly how much health is missing.",
  },
  {
    id: "tip-offline",
    text: "If the simulation server drops, an offline banner appears within seconds — the client never silently pretends it's connected.",
  },
  {
    id: "tip-update",
    text: "When a new build deploys, a toast offers “reload to update”. Your campaign is untouched by the reload.",
  },
  {
    id: "tip-damage-numbers",
    text: "Floating damage numbers are pooled and toggleable — two hundred of them on screen won't spike the garbage collector.",
  },
  {
    id: "tip-encounters",
    text: "Hostile parties that meet on the map auto-trigger encounters. The battle UI polls for them — you never create fights by hand.",
  },
  {
    id: "tip-install",
    text: "The game is installable: the PWA prompt lets it launch fullscreen like a native app.",
  },
  {
    id: "tip-objectives",
    text: "Capture points and VIPs carry 3D objective markers, visible through fog at two hundred meters.",
  },
  {
    id: "tip-edge",
    text: "Arrows at the screen edge track off-screen allies and enemies through a full 360 degrees.",
  },
];

/** How many recent loads a tip must stay out of. */
export const TIP_HISTORY_WINDOW = 10;

/** localStorage key for the persisted recent-tip ids (oldest first). */
export const TIP_STORE_KEY = "campaign.loadingTips.recent.v1";

/** The storage surface the rotator needs — satisfied by localStorage or a test fake. */
export interface TipStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TipRotator {
  /**
   * Pick the tip for a fresh load: never one of the last
   * {@link TIP_HISTORY_WINDOW} shown, then record it in the persisted window.
   */
  next(): LoadingTip;
  /**
   * Pick the next tip inside one loading screen: never the tip showing now.
   * Does not touch the persisted window — only loads count toward it.
   */
  nextInSession(current: LoadingTip): LoadingTip;
  /** The ids currently in the window, oldest first. A copy. */
  recent(): string[];
}

function readWindow(storage: TipStorage | null, tips: readonly LoadingTip[]): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(TIP_STORE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const known = new Set(tips.map((t) => t.id));
    const ids = parsed.filter((v): v is string => typeof v === "string" && known.has(v));
    return ids.slice(-TIP_HISTORY_WINDOW);
  } catch {
    // Corrupted entry: start the window fresh rather than crashing.
    return [];
  }
}

/**
 * Create a tip rotator. `rng` supplies [0,1) for candidate selection and is
 * injectable so tests can run deterministically.
 */
export function createTipRotator(
  storage: TipStorage | null,
  tips: readonly LoadingTip[] = LOADING_TIPS,
  rng: () => number = Math.random,
): TipRotator {
  if (tips.length === 0) throw new Error("createTipRotator: need at least one tip");
  let window: string[] = readWindow(storage, tips);

  function persist(): void {
    if (!storage) return;
    try {
      storage.setItem(TIP_STORE_KEY, JSON.stringify(window));
    } catch {
      // Storage full or blocked: keep the window in memory for the session.
    }
  }

  function pick(candidates: readonly LoadingTip[]): LoadingTip {
    const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
    return candidates[index]!;
  }

  return {
    next(): LoadingTip {
      const recent = new Set(window);
      let candidates = tips.filter((t) => !recent.has(t.id));
      if (candidates.length === 0) {
        // Corpus exhausted inside the window (only possible with a tiny
        // corpus): allow everything except the most recently shown tip.
        const last = window[window.length - 1];
        candidates = tips.filter((t) => t.id !== last);
        if (candidates.length === 0) candidates = [...tips];
      }
      const tip = pick(candidates);
      window = [...window, tip.id].slice(-TIP_HISTORY_WINDOW);
      persist();
      return tip;
    },

    nextInSession(current: LoadingTip): LoadingTip {
      const candidates = tips.filter((t) => t.id !== current.id);
      return pick(candidates.length > 0 ? candidates : [...tips]);
    },

    recent(): string[] {
      return [...window];
    },
  };
}
