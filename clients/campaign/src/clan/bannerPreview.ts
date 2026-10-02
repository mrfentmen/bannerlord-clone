/**
 * Banner preview on troops (Rowan solo task 58).
 *
 * Renders the designed clan banner on a shield shape — the same SVG the
 * battle scene applies to unit shields through the BannerTarget interface.
 * The preview panel shows the shield at troop scale so the player can
 * judge the design before committing.
 */

import type { ClanBanner } from "./types.js";
import { bannerSvg } from "./banner.js";
import { h } from "../ui/dom.js";

/**
 * The banner design rendered inside a heater-shield outline. The scene
 * uses this SVG for unit shields.
 */
export function bannerShieldSvg(banner: ClanBanner): string {
  const inner = bannerSvg(banner)
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">` +
    `<defs><clipPath id="shieldclip"><path d="M10 10 H90 V60 Q90 95 50 112 Q10 95 10 60 Z"/></clipPath></defs>` +
    `<g clip-path="url(#shieldclip)"><g transform="translate(0,-4) scale(1,1.28)">${inner}</g></g>` +
    `<path d="M10 10 H90 V60 Q90 95 50 112 Q10 95 10 60 Z" fill="none" stroke="#2a2a2a" stroke-width="4"/>` +
    `</svg>`
  );
}

export interface ShieldPreviewOptions {
  banner: ClanBanner;
  /** Unit kinds to preview the shield beside. */
  unitKinds?: string[];
}

/** DOM preview: the banner on shields at troop scale. */
export function shieldPreview(options: ShieldPreviewOptions): HTMLElement {
  const kinds = options.unitKinds ?? ["infantry", "archers", "cavalry"];
  const root = h("div", { class: "shield-preview", "data-testid": "shield-preview" });
  root.appendChild(h("h3", {}, "Banner on troops"));
  const row = h("div", { class: "shield-preview__row" });
  for (const kind of kinds) {
    const cell = h("div", { class: "shield-preview__cell", "data-testid": `shield-${kind}` });
    const holder = h("div", { class: "shield-preview__shield" });
    holder.innerHTML = bannerShieldSvg(options.banner);
    cell.appendChild(holder);
    cell.appendChild(h("span", { class: "caption" }, kind));
    row.appendChild(cell);
  }
  root.appendChild(row);
  return root;
}
