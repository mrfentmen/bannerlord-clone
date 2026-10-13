/**
 * Task 37: the faction banners, in the two top corners.
 *
 * Who is on your side and who is against you, where the eye already goes. The
 * player's banner sits top-left and the enemy's top-right, matching the order the
 * two troop counts read in.
 *
 * The cloth is `factionColor` from `scene/BattleUI.ts` — the one place a faction
 * name becomes a colour, off the locked faction and clan-banner palettes. This
 * module adds no swatch of its own; a second colour rule would let two corners
 * disagree about the same kingdom.
 *
 * The name is printed on the banner's own ground, not on the cloth, for the same
 * reason the deployment header does it: no contrast test has verified text over
 * an arbitrary heraldic colour. The cloth carries identity; the word carries the
 * information.
 */

import "./factionBanners.css";
import { h } from "../ui/dom.js";
import { factionColor } from "../scene/BattleUI.js";
import type { BattleFactions } from "./liveBattleSource.js";

export interface FactionBannerSource {
  /** The two sides' names, as the encounter knows them. */
  onFactions(fn: (factions: BattleFactions) => void): () => void;
}

export interface FactionBanners {
  root: HTMLElement;
  destroy(): void;
}

const SIDES = [
  { side: "player", owner: "Your side" },
  { side: "enemy", owner: "Enemy side" },
] as const;

/** One banner: the faction's own cloth, and its name beside it. */
function bannerEl(side: (typeof SIDES)[number]["side"], owner: string): HTMLElement {
  return h(
    "div",
    {
      class: `hud-banner hud-banner--${side}`,
      role: "group",
      "data-testid": `hud-banner-${side}`,
      "aria-label": owner,
      "data-owner": owner,
    },
    h("span", { class: "hud-banner__field", "aria-hidden": "true", "data-part": "field" }),
    h(
      "span",
      { class: "hud-banner__text" },
      h("span", { class: "hud-banner__owner" }, owner),
      h("span", { class: "hud-banner__name", "data-part": "name" }, ""),
    ),
  );
}

export function createFactionBanners(source: FactionBannerSource): FactionBanners {
  const banners = new Map<string, HTMLElement>();
  const root = h("div", { class: "hud-banners", "data-testid": "hud-banners" });
  for (const { side, owner } of SIDES) {
    const banner = bannerEl(side, owner);
    banners.set(side, banner);
    root.appendChild(banner);
  }

  function paint(side: (typeof SIDES)[number]["side"], name: string): void {
    const banner = banners.get(side);
    if (!banner) return;
    const field = banner.querySelector<HTMLElement>('[data-part="field"]');
    if (field) field.style.background = factionColor(name);
    const label = banner.querySelector<HTMLElement>('[data-part="name"]');
    if (label) {
      label.textContent = name;
      label.setAttribute("data-testid", `hud-banner-${side}-name`);
    }
    // The name is announced through the group's label, so a change of kingdom
    // reads as "Your side: <new name>" rather than as a bare word.
    banner.setAttribute("aria-label", `${banner.dataset["owner"] ?? ""}: ${name}`);
  }

  const unsubscribe = source.onFactions((factions) => {
    paint("player", factions.player);
    paint("enemy", factions.enemy);
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}