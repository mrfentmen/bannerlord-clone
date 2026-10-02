/**
 * Tasks 120-122: glossary, video guides, and new-player protection.
 *
 * Glossary: searchable terms dictionary.
 *
 * Video guides: a list of tutorial videos with a placeholder player UI —
 * real video hosting is out of scope; the player shows title, duration,
 * and a "video coming soon" frame the app can replace with an embed.
 *
 * New-player protection: a 10-season grace. During grace, stronger
 * neighbors cannot declare war on the player — `canDeclareWar` says no
 * and names the reason.
 */

import type { GlossaryTerm, VideoGuide } from "./types.js";

const GLOSSARY: GlossaryTerm[] = [
  { term: "Fief", definition: "A settlement you own. Fiefs pay taxes and provide recruits.", tags: ["economy", "map"] },
  { term: "Party", definition: "An army on the campaign map, led by you or a companion.", tags: ["map", "battle"] },
  { term: "Morale", definition: "A unit's willingness to fight. Low morale routes.", tags: ["battle"] },
  { term: "Scheme", definition: "A covert operation run by your spies: theft, dissent, sabotage, or assassination.", tags: ["espionage"] },
  { term: "Edict", definition: "A realm law proposed to your council and passed by weighted vote.", tags: ["court"] },
  { term: "Vassal", definition: "A lord sworn to you. Vassals pay tribute and owe troops.", tags: ["diplomacy", "court"] },
  { term: "Tribute", definition: "Regular payment between factions, often the price of peace.", tags: ["economy", "diplomacy"] },
  { term: "Cover", definition: "A spy's protection against discovery. Heat burns cover.", tags: ["espionage"] },
  { term: "Prosperity", definition: "A settlement's economic health. Rich towns pay more and recruit better.", tags: ["economy"] },
  { term: "Claimant", definition: "Someone with a claim on your throne when succession is disputed.", tags: ["clan"] },
  { term: "Dowry", definition: "Wealth paid to arrange a marriage. Bigger dowries buy better odds.", tags: ["clan"] },
  { term: "Reputation", definition: "Your honor in diplomacy. Broken deals lower it and haunt future talks.", tags: ["diplomacy"] },
];

/**
 * Task 124: link glossary terms inside a text. Wraps every known term in an
 * anchor to its glossary entry (longest terms first so "supply line" wins
 * over "supply"). Tooltip and hint renderers use this for "terms link from
 * tooltips".
 */
export function glossarize(text: string): string {
  const terms = searchGlossary("").sort((a, b) => b.term.length - a.term.length);
  let out = text;
  for (const t of terms) {
    const re = new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, (m) => `<a class="glossary-link" data-term="${t.term}">${m}</a>`);
  }
  return out;
}

export function searchGlossary(query: string): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...GLOSSARY];
  return GLOSSARY.filter(
    (t) =>
      t.term.toLowerCase().includes(q) ||
      t.definition.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q)),
  );
}

export const VIDEO_GUIDES: VideoGuide[] = [
  { id: "basics", title: "Campaign basics", duration: "8:24", url: "https://example.com/guides/basics" },
  { id: "battle", title: "Winning your first battle", duration: "12:10", url: "https://example.com/guides/battle" },
  { id: "economy", title: "Gold, taxes, and trade", duration: "9:47", url: "https://example.com/guides/economy" },
  { id: "diplomacy", title: "Alliances and betrayals", duration: "11:02", url: "https://example.com/guides/diplomacy" },
];

/** Placeholder player DOM: title, duration, and a coming-soon frame. */
export function createVideoPlayer(guide: VideoGuide): HTMLElement {
  const el = document.createElement("div");
  el.className = "video-guide";
  el.innerHTML =
    `<div class="video-guide-frame" role="img" aria-label="Tutorial video placeholder">` +
    `<span>Video coming soon</span></div>` +
    `<div class="video-guide-title"></div>` +
    `<div class="video-guide-duration"></div>` +
    `<a class="video-guide-link" target="_blank" rel="noopener">Watch externally</a>`;
  el.querySelector(".video-guide-title")!.textContent = guide.title;
  el.querySelector(".video-guide-duration")!.textContent = guide.duration;
  (el.querySelector(".video-guide-link") as HTMLAnchorElement).href = guide.url;
  return el;
}

export const GRACE_SEASONS = 10;

/** Can `attacker` declare war on the player at this season? */
export function canDeclareWar(
  attackerStrength: number,
  playerStrength: number,
  currentSeason: number,
): { allowed: boolean; reason: string } {
  if (currentSeason < GRACE_SEASONS && attackerStrength > playerStrength) {
    return {
      allowed: false,
      reason: `New-player protection: stronger neighbors cannot declare war for the first ${GRACE_SEASONS} seasons.`,
    };
  }
  return { allowed: true, reason: "" };
}
