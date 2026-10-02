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
import type { BannerPattern, ClanBanner, ClanMember } from "../../clan/types.js";
import { loadClanStore, roleAssignments } from "../../clan/store.js";
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
  /**
   * The current campaign year, so a member's age can be printed. Task 248.
   *
   * Ages are not derived without it: the store records a birth year and nothing
   * that says how old the clan is now, so an age printed from an assumed "today"
   * would drift by a year every time the player forgot.
   */
  year?: number;
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

  // -- the clan roster (task 248) ---------------------------------------------
  body.appendChild(memberSection(options));

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
/**
 * Who is in the clan. Task 248.
 *
 * Read out of `loadClanStore()` — the roster, not a list the panel assembled. The
 * living come first and the dead after, because a family list that interleaves them
 * reads as a longer family than it is; within each, oldest first, which is the order
 * the succession rules in `src/clan/succession.ts` care about. The ruler is marked
 * with the store's own `rulerId` rather than by position in the list.
 *
 * Ages need a year to be measured against, so they are printed only when the caller
 * supplies one. The skill shown is the member's best, by the store's own record —
 * not a composite, and not a rating the panel has invented.
 *
 * An empty roster is the honest empty state. A clan with nobody in it is a state the
 * store can genuinely be in, and printing a placeholder family for it would be the
 * worst kind of lie: one the player might act on.
 */
function memberSection(options: ClanPanelOptions): HTMLElement {
  const store = loadClanStore();
  const wrap = h("section", { "data-testid": "clan-members" });
  wrap.appendChild(h("h3", { class: "section-header" }, h("span", {}, "Clan")));

  if (store.members.length === 0) {
    wrap.appendChild(
      emptyState(
        "Nobody is in the clan yet.",
        "No members are recorded. Marriages, births and anyone who joins are listed here as they happen.",
      ),
    );
    return wrap;
  }

  const byAge = (a: ClanMember, b: ClanMember): number => a.birthYear - b.birthYear;
  const living = store.members.filter((m) => m.deathYear === undefined).sort(byAge);
  const dead = store.members.filter((m) => m.deathYear !== undefined).sort(byAge);

  const list = h("ul", { class: "clan-list" });
  for (const member of [...living, ...dead]) {
    const item = h("li", {
      class: "clan-list__row clan-member",
      "data-testid": `clan-member-${member.id}`,
      "data-living": String(member.deathYear === undefined),
    });
    item.appendChild(
      h(
        "span",
        { class: "label" },
        member.name,
        store.rulerId === member.id ? h("span", { class: "clan-member__badge" }, "Ruler") : null,
        member.deathYear !== undefined
          ? h("span", { class: "clan-member__badge clan-member__badge--dead" }, `died ${member.deathYear}`)
          : null,
      ),
    );
    item.appendChild(
      h(
        "span",
        { class: "clan-member__facts caption" },
        [
          options.year !== undefined ? `aged ${options.year - member.birthYear}` : null,
          bestSkill(member),
          member.traits.length > 0 ? member.traits.join(", ") : null,
        ]
          .filter((part): part is string => part !== null)
          .join(" · "),
      ),
    );
    list.appendChild(item);
  }
  wrap.appendChild(list);
  wrap.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:var(--space-2) 0 0", "data-testid": "clan-member-note" },
      "Heirs follow the succession law set in the clan laws panel.",
    ),
  );
  return wrap;
}

/**
 * The member's strongest recorded skill, as "scouting 62".
 *
 * The store holds a `Record<string, number>` and nothing that ranks it, so the best
 * entry is taken and printed at face value. A skill at zero is not worth naming.
 */
function bestSkill(member: ClanMember): string | null {
  let best: [string, number] | null = null;
  for (const [name, value] of Object.entries(member.skills)) {
    if (!Number.isFinite(value)) continue;
    if (!best || value > best[1]) best = [name, value];
  }
  if (!best || best[1] <= 0) return null;
  return `${best[0]} ${Math.round(best[1])}`;
}
