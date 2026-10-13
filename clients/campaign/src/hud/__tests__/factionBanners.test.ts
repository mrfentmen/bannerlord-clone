/**
 * Task 37: the faction banners.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFactionBanners, type FactionBannerSource } from "../factionBanners.js";
import { createLiveBattleSource } from "../liveBattleSource.js";
import { factionColor } from "../../scene/BattleUI.js";
import { PLAYABLE_SIDE_IDS } from "../../design/factions.js";
import type { LiveBattleView } from "../../battleflow/flow.js";

function view(player: string, enemy: string): LiveBattleView {
  return {
    mode: "local",
    battle: {
      id: "b1",
      encounterId: "e1",
      status: "active",
      tick: 1,
      attacker: { partyId: 1, name: player, troops: 10, morale: 1 },
      defender: { partyId: 2, name: enemy, troops: 10, morale: 1 },
    },
    playerSide: { partyId: 1, name: player, troops: 10, morale: 1 },
    enemySide: { partyId: 2, name: enemy, troops: 10, morale: 1 },
    playerIsAttacker: true,
    availableOrders: [],
  };
}

function manualSource(): FactionBannerSource & { report(player: string, enemy: string): void; readonly subscribers: number } {
  const fns = new Set<(player: string, enemy: string) => void>();
  return {
    report(player: string, enemy: string) {
      for (const fn of fns) fn(player, enemy);
    },
    get subscribers() {
      return fns.size;
    },
    onFactions(fn) {
      return source_subscribe(fns, fn);
    },
  };
}

/** The source hands a listener one object; the manual source tracks two names. */
function source_subscribe(
  fns: Set<(player: string, enemy: string) => void>,
  fn: (factions: { player: string; enemy: string }) => void,
): () => void {
  const wrapped = (player: string, enemy: string): void => fn({ player, enemy });
  fns.add(wrapped);
  return () => fns.delete(wrapped);
}

/**
 * What the DOM stores for a background. jsdom normalises `#1f4d8c` to
 * `rgb(31, 77, 140)`, so a test comparing against the token has to compare
 * against the same normalisation rather than the source string.
 */
function stored(css: string): string {
  const probe = document.createElement("span");
  probe.style.background = css;
  return probe.style.background;
}

function name(root: HTMLElement, side: "player" | "enemy"): string {
  return root.querySelector<HTMLElement>(`[data-testid="hud-banner-${side}-name"]`)?.textContent ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("faction banners", () => {
  it("puts the player's faction on the left and the enemy's on the right", () => {
    const source = manualSource();
    const banners = createFactionBanners(source);
    document.body.append(banners.root);

    source.report("Vlandia", "Western Empire");
    expect(name(banners.root, "player")).toBe("Vlandia");
    expect(name(banners.root, "enemy")).toBe("Western Empire");

    const [first, second] = Array.from(banners.root.children);
    expect(first?.className).toContain("hud-banner--player");
    expect(second?.className).toContain("hud-banner--enemy");

    banners.destroy();
  });

  it("says which side each banner is, so a banner is not a mystery crest", () => {
    const source = manualSource();
    const banners = createFactionBanners(source);
    document.body.append(banners.root);
    source.report("Vlandia", "Western Empire");

    const player = banners.root.querySelector('[data-testid="hud-banner-player"]');
    const enemy = banners.root.querySelector('[data-testid="hud-banner-enemy"]');
    expect(player?.getAttribute("aria-label")).toBe("Your side: Vlandia");
    expect(enemy?.getAttribute("aria-label")).toBe("Enemy side: Western Empire");
    expect(player?.textContent).toContain("Your side");
    expect(enemy?.textContent).toContain("Enemy side");

    banners.destroy();
  });

  it("takes its cloth from the shared faction colour rule, not its own", () => {
    const source = manualSource();
    const banners = createFactionBanners(source);
    document.body.append(banners.root);

    // A playable side, so the locked faction palette answers for it.
    const playable = PLAYABLE_SIDE_IDS[0]!;
    source.report(playable, PLAYABLE_SIDE_IDS[1]!);

    const field = banners.root.querySelector<HTMLElement>('[data-testid="hud-banner-player"] [data-part="field"]');
    expect(field?.style.background).toBe(stored(factionColor(playable)));

    banners.destroy();
  });

  it("changes cloth when the name changes, which is what makes it a banner", () => {
    const source = manualSource();
    const banners = createFactionBanners(source);
    document.body.append(banners.root);

    source.report("Vlandia", "Western Empire");
    const first = banners.root.querySelector<HTMLElement>('[data-testid="hud-banner-enemy"] [data-part="field"]')?.style.background;
    source.report("Vlandia", "Sturgia");
    const second = banners.root.querySelector<HTMLElement>('[data-testid="hud-banner-enemy"] [data-part="field"]')?.style.background;

    expect(second).toBe(stored(factionColor("Sturgia")));
    expect(second).not.toBe(first);
    expect(name(banners.root, "enemy")).toBe("Sturgia");

    banners.destroy();
  });

  it("has nothing to show before any name arrives", () => {
    const banners = createFactionBanners(manualSource());
    document.body.append(banners.root);

    expect(name(banners.root, "player")).toBe("");
    const field = banners.root.querySelector<HTMLElement>('[data-testid="hud-banner-player"] [data-part="field"]');
    expect(field?.style.background).toBe("");

    banners.destroy();
  });

  it("destroy unsubscribes and removes the banners", () => {
    const source = manualSource();
    const banners = createFactionBanners(source);
    document.body.append(banners.root);

    banners.destroy();
    expect(source.subscribers).toBe(0);
    expect(banners.root.isConnected).toBe(false);
  });
});

describe("live battle source, factions", () => {
  it("pushes the two names, and only when one of them changes", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = view("Vlandia", "Western Empire");
    const source = createLiveBattleSource(() => current);
    const seen: Array<{ player: string; enemy: string }> = [];
    source.onFactions((f) => seen.push(f));
    vi.advanceTimersByTime(250);

    current = view("Vlandia", "Western Empire"); // a rebuilt object, same names
    vi.advanceTimersByTime(250);
    expect(seen).toHaveLength(1);

    current = view("Vlandia", "Sturgia");
    vi.advanceTimersByTime(250);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ player: "Vlandia", enemy: "Sturgia" });

    source.destroy();
    vi.useRealTimers();
  });

  it("hands over a copy, so a listener cannot write into the source", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const source = createLiveBattleSource(() => view("Vlandia", "Sturgia"));
    source.onFactions((f) => {
      f.player = "tampered";
    });
    vi.advanceTimersByTime(250);

    const seen: Array<{ player: string }> = [];
    source.onFactions((f) => seen.push(f));
    expect(seen[0]?.player).toBe("Vlandia");

    source.destroy();
    vi.useRealTimers();
  });

  it("drives the banners end to end", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = null;
    const source = createLiveBattleSource(() => current);
    const banners = createFactionBanners(source);
    document.body.append(banners.root);

    current = view("Vlandia", "Sturgia");
    vi.advanceTimersByTime(250);
    expect(name(banners.root, "player")).toBe("Vlandia");
    expect(name(banners.root, "enemy")).toBe("Sturgia");

    current = view("Aserion", "Sturgia");
    vi.advanceTimersByTime(250);
    expect(name(banners.root, "player")).toBe("Aserion");

    source.destroy();
    banners.destroy();
    vi.useRealTimers();
  });
});