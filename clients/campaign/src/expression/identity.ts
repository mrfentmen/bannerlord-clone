/**
 * Tasks 129-131: nicknames, portrait customization, and motto engraving.
 *
 * Nicknames: deeds earn titles; the display name renders the highest-
 * priority earned title before the name.
 *
 * Portraits: face options the UI portrait renderer reads. Rendering itself
 * is a UI concern; this module owns the option data and validation.
 *
 * Motto engraving: a custom motto on a weapon, shown in its tooltip.
 */

import type { NicknameRule, PortraitOptions } from "./types.js";

export const NICKNAME_RULES: NicknameRule[] = [
  { deed: "win-10-battles", title: "the Unbroken" },
  { deed: "win-outnumbered", title: "the Bold" },
  { deed: "hold-5-fiefs", title: "the Steadfast" },
  { deed: "sign-3-treaties", title: "the Peacemaker" },
  { deed: "complete-10-schemes", title: "the Shadow" },
  { deed: "amass-50000-coin", title: "the Golden" },
  { deed: "survive-assassination", title: "the Deathless" },
];

export interface Nicknames {
  earned(): string[];
  earn(deed: string): string | null;
  /** "Aldric" -> "Aldric the Bold", or plain name when nothing earned. */
  displayName(name: string): string;
}

export function createNicknames(): Nicknames {
  const titles: string[] = [];
  return {
    earned: () => [...titles],
    earn(deed) {
      const rule = NICKNAME_RULES.find((r) => r.deed === deed);
      if (!rule || titles.includes(rule.title)) return null;
      titles.push(rule.title);
      return rule.title;
    },
    displayName: (name) => (titles.length > 0 ? `${name} ${titles[titles.length - 1]}` : name),
  };
}

export const PORTRAIT_DEFAULTS: PortraitOptions = {
  skin: "tan",
  hair: "brown",
  beard: "none",
  scar: false,
};

export function customizePortrait(over: Partial<PortraitOptions>): PortraitOptions {
  return { ...PORTRAIT_DEFAULTS, ...over };
}

/** Stable key the portrait renderer uses to pick face layers. */
export function portraitKey(opts: PortraitOptions): string {
  return [opts.skin, opts.hair, opts.beard, opts.scar ? "scar" : "clean"].join("|");
}

export interface EngravedWeapon {
  name: string;
  motto: string | null;
}

export function engraveMotto(weapon: string, motto: string): EngravedWeapon {
  const trimmed = motto.trim();
  if (trimmed.length === 0) throw new Error("a motto cannot be empty");
  if (trimmed.length > 80) throw new Error("a motto cannot exceed 80 characters");
  return { name: weapon, motto: trimmed };
}

/** Tooltip text for an engraved weapon. */
export function weaponTooltip(weapon: EngravedWeapon): string {
  return weapon.motto ? `${weapon.name} — "${weapon.motto}"` : weapon.name;
}
