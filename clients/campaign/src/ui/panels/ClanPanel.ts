/**
 * The clan panel. `UI_UX.md` section 6, and the surface the banner designer
 * (task 246) hangs off.
 *
 * Everything printed here is read out of the clan store through
 * `src/clan/store.ts` and out of the banner modules in `src/clan/`. The panel
 * invents nothing: if the store holds no members, the member list says so; if no
 * banner has been chosen, the preview shows the default cloth rather than a blank.
 *
 * **What this panel does not own.** The banner is composed here and handed to the
 * caller through `onBannerChange`. Persisting it is the store's job, and the store
 * is another lane's file, so this panel deliberately writes no `localStorage` of
 * its own — two writers to one key is how a clan's banner ends up disagreeing with
 * itself between panels.
 */

import { h } from "../dom.js";
import { emptyState, panel } from "../kit.js";
import { BANNER_PATTERNS, BANNER_SIGILS, bannerSvg, BANNER_COLORS, type BannerSigil } from "../../clan/banner.js";
import type { BannerPattern, ClanBanner } from "../../clan/types.js";
import { roleAssignments } from "../../clan/store.js";
import "./clanPanel.css";

/**
 * The banner a clan starts on when nothing has been chosen: the first two colours
 * of the locked heraldic palette, the first pattern, the first sigil. Chosen from
 * the palette rather than typed, so the default is as valid as any design the
 * player can reach.
 */
const DEFAULT_BANNER: ClanBanner = {
  primary: BANNER_COLORS[0],
  secondary: BANNER_COLORS[1],
  pattern: "stripes",
  sigil: "tower",
};

export interface ClanPanelOptions {
  /** Called with the composed banner whenever the player changes any part of it. */
  onBannerChange?: (banner: ClanBanner) => void;
  /** The banner to open on. Omitted, the default cloth above. */
  banner?: ClanBanner;
  onClose?: () => void;
  testId?: string;
}

export interface ClanPanelHandle {
  root: HTMLElement;
  /** The banner currently composed. The same object handed to `onBannerChange`. */
  banner(): ClanBanner;
  destroy(): void;
}

export function createClanPanel(options: ClanPanelOptions = {}): ClanPanelHandle {
  const { root, body } = panel({
    title: "Clan",
    testId: options.testId ?? "clan-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  let banner: ClanBanner = { ...(options.banner ?? DEFAULT_BANNER) };

  // -- banner designer (task 246) --------------------------------------------
  const preview = h("div", {
    class: "clan-banner__preview",
    "data-testid": "clan-banner-preview",
    role: "img",
  });

  const paint = (): void => {
    preview.innerHTML = bannerSvg(banner);
    preview.setAttribute("aria-label", `Clan banner: ${banner.pattern} pattern, ${banner.sigil} sigil`);
    // Re-mark every swatch against the composed banner. Without this the pressed
    // state is whatever was true at build time, so the control would claim the
    // player chose the first thing they were shown.
    for (const option of body.querySelectorAll<HTMLElement>("[data-field][data-value]")) {
      const field = option.getAttribute("data-field");
      const value = option.getAttribute("data-value");
      if (field !== "primary" && field !== "secondary" && field !== "pattern" && field !== "sigil") continue;
      option.setAttribute("aria-pressed", String(banner[field] === value));
    }
  };

  /** One listener on the container, not one per swatch: the panel has to be able to detach cleanly. */
  const onPick = (ev: Event): void => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const field = target.getAttribute("data-field");
    const value = target.getAttribute("data-value");
    if (!field || !value) return;
    if (field === "primary" || field === "secondary") banner[field] = value;
    else if (field === "pattern") banner.pattern = value as BannerPattern;
    else if (field === "sigil") banner.sigil = value as BannerSigil;
    else return;
    paint();
    options.onBannerChange?.({ ...banner });
  };
  body.addEventListener("click", onPick);

  const fieldGroup = (field: "primary" | "secondary", label: string): HTMLElement => {
    const group = h("div", { class: "clan-banner__group", "data-testid": `clan-banner-${field}` });
    group.appendChild(h("span", { class: "label" }, label));
    const swatches = h("div", { class: "clan-banner__swatches" });
    for (const colour of BANNER_COLORS) {
      const swatch = h("button", {
        type: "button",
        class: "clan-banner__swatch",
        "data-field": field,
        "data-value": colour,
        "aria-label": `${label}: ${colour}`,
        "aria-pressed": String(banner[field] === colour),
      });
      // The cloth is data — it comes from the locked palette — so the colour is
      // set inline here rather than being invented in the stylesheet.
      swatch.style.background = colour;
      swatches.appendChild(swatch);
    }
    group.appendChild(swatches);
    return group;
  };

  const patternGroup = (): HTMLElement => {
    const group = h("div", { class: "clan-banner__group", "data-testid": "clan-banner-pattern" });
    group.appendChild(h("span", { class: "label" }, "Pattern"));
    const row = h("div", { class: "clan-banner__choices" });
    for (const pattern of BANNER_PATTERNS) {
      row.appendChild(
        h("button", {
          type: "button",
          class: "btn btn--small",
          "data-field": "pattern",
          "data-value": pattern,
          "aria-pressed": String(banner.pattern === pattern),
        }, pattern),
      );
    }
    group.appendChild(row);
    return group;
  };

  const sigilGroup = (): HTMLElement => {
    const group = h("div", { class: "clan-banner__group", "data-testid": "clan-banner-sigil" });
    group.appendChild(h("span", { class: "label" }, "Sigil"));
    const row = h("div", { class: "clan-banner__choices" });
    for (const sigil of BANNER_SIGILS) {
      row.appendChild(
        h("button", {
          type: "button",
          class: "btn btn--small",
          "data-field": "sigil",
          "data-value": sigil,
          "aria-pressed": String(banner.sigil === sigil),
        }, sigil),
      );
    }
    group.appendChild(row);
    return group;
  };

  const bannerSection = h("section", { "data-testid": "clan-banner" });
  bannerSection.appendChild(h("h3", { class: "section-header" }, h("span", {}, "Banner")));
  bannerSection.appendChild(
    h("p", { class: "caption", style: "margin:0 0 var(--space-3)" },
      "Cloth, pattern and sigil. The banner is what your people are recognised by on the map."),
  );
  bannerSection.append(
    fieldGroup("primary", "Cloth"),
    fieldGroup("secondary", "Markings"),
    patternGroup(),
    sigilGroup(),
    preview,
  );
  body.appendChild(bannerSection);
  paint();

  // -- clan offices, from the store ------------------------------------------
  const offices = roleAssignments();
  const officeSection = h("section", { "data-testid": "clan-offices" });
  officeSection.appendChild(h("h3", { class: "section-header" }, h("span", {}, "Offices")));
  if (offices.length === 0) {
    officeSection.appendChild(
      emptyState("No offices filled", "Nobody holds a clan office. Appointments appear here as they are made."),
    );
  } else {
    const list = h("ul", { class: "clan-list" });
    for (const office of offices) {
      list.appendChild(
        h(
          "li",
          { class: "clan-list__row", "data-testid": `clan-office-${office.role}` },
          h("span", { class: "label" }, office.role),
          h("span", { class: "row__value" }, office.memberName),
          h("span", { class: "caption" }, office.bonus),
        ),
      );
    }
    officeSection.appendChild(list);
  }
  body.appendChild(officeSection);

  return {
    root,
    banner: () => ({ ...banner }),
    destroy(): void {
      // One delegated listener, one removal: nothing else to unhook, which is what
      // makes this safe to rebuild on every navigation.
      body.removeEventListener("click", onPick);
      root.remove();
    },
  };
}