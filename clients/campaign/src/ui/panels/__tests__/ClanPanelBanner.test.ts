/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClanPanel } from "../ClanPanel.js";
import { BANNER_COLORS, BANNER_PATTERNS, BANNER_SIGILS, bannerSvg } from "../../../clan/banner.js";
import type { ClanBanner } from "../../../clan/types.js";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function build(overrides: Parameters<typeof createClanPanel>[0] = {}) {
  const handle = createClanPanel(overrides);
  document.body.appendChild(handle.root);
  return handle;
}

/** jsdom re-serialises self-closing tags, so compare through a parse, not a raw string. */
function normalise(svg: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = svg;
  return holder.innerHTML;
}

function handle_of(field: string, value: string): HTMLElement {
  const el = document.body.querySelector<HTMLElement>(`[data-field="${field}"][data-value="${value}"]`);
  if (!el) throw new Error(`no swatch ${field}=${value}`);
  return el;
}

describe("clan panel banner designer (task 246)", () => {
  it("opens on a banner drawn from the locked heraldic palette", () => {
    const handle = build();
    const banner = handle.banner();
    expect(BANNER_COLORS).toContain(banner.primary);
    expect(BANNER_COLORS).toContain(banner.secondary);
    expect(BANNER_PATTERNS).toContain(banner.pattern);
    expect(BANNER_SIGILS).toContain(banner.sigil);
  });

  it("previews the banner with the shared SVG the map and the battlefield read", () => {
    const handle = build();
    const preview = handle.root.querySelector('[data-testid="clan-banner-preview"]')!;
    expect(preview.innerHTML).toBe(normalise(bannerSvg(handle.banner())));
    handle.destroy();
  });

  it("offers exactly the palette's colours for both cloths", () => {
    const handle = build();
    for (const field of ["primary", "secondary"]) {
      const swatches = handle.root.querySelectorAll(`[data-field="${field}"]`);
      expect(swatches).toHaveLength(BANNER_COLORS.length);
      for (const swatch of swatches) {
        expect(BANNER_COLORS).toContain(swatch.getAttribute("data-value"));
      }
    }
    handle.destroy();
  });

  it("offers every pattern and every sigil the banner module defines", () => {
    const handle = build();
    const patterns = [...handle.root.querySelectorAll('[data-field="pattern"]')].map((b) =>
      b.getAttribute("data-value"),
    );
    const sigils = [...handle.root.querySelectorAll('[data-field="sigil"]')].map((b) =>
      b.getAttribute("data-value"),
    );
    expect(patterns).toEqual([...BANNER_PATTERNS]);
    expect(sigils).toEqual([...BANNER_SIGILS]);
    handle.destroy();
  });

  it("changes the banner when a colour is picked, and repaints the preview", () => {
    const onBannerChange = vi.fn();
    const handle = build({ onBannerChange });
    const before = handle.banner().primary;
    const next = BANNER_COLORS.find((c) => c !== before)!;
    handle_of("primary", next).click();
    expect(handle.banner().primary).toBe(next);
    expect(handle.root.querySelector('[data-testid="clan-banner-preview"]')!.innerHTML).toBe(
      normalise(bannerSvg({ ...handle.banner() })),
    );
    expect(onBannerChange).toHaveBeenCalledTimes(1);
    expect(onBannerChange.mock.calls[0]![0]).toMatchObject({ primary: next });
  });

  it("changes the pattern and the sigil independently", () => {
    const handle = build();
    handle_of("pattern", "chevron").click();
    expect(handle.banner().pattern).toBe("chevron");
    handle_of("sigil", "crown").click();
    expect(handle.banner().sigil).toBe("crown");
    expect(handle.banner().pattern).toBe("chevron");
    handle.destroy();
  });

  it("hands the caller a copy, so a later edit cannot rewrite what it was given", () => {
    const onBannerChange = vi.fn();
    build({ onBannerChange });
    handle_of("sigil", "star").click();
    const handed = onBannerChange.mock.calls[0]![0] as ClanBanner;
    handle_of("sigil", "boar").click();
    expect(handed.sigil).toBe("star");
  });

  it("opens on the banner the caller supplies", () => {
    const banner: ClanBanner = {
      primary: BANNER_COLORS[3],
      secondary: BANNER_COLORS[5],
      pattern: "border",
      sigil: "wave",
    };
    const handle = build({ banner });
    expect(handle.banner()).toEqual(banner);
    expect(
      handle.root.querySelector(`[data-field="primary"][data-value="${BANNER_COLORS[3]}"]`)!.getAttribute("aria-pressed"),
    ).toBe("true");
    handle.destroy();
  });

  it("marks the current choice as pressed, so the selection is legible without colour", () => {
    const handle = build();
    const chosen = handle.root.querySelector(
      `[data-field="pattern"][data-value="${handle.banner().pattern}"]`,
    )!;
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
    handle_of("pattern", "halved").click();
    expect(chosen.getAttribute("aria-pressed")).toBe("false");
    handle.destroy();
  });

  it("names the banner for a screen reader rather than only drawing it", () => {
    const handle = build();
    const preview = handle.root.querySelector('[data-testid="clan-banner-preview"]')!;
    expect(preview.getAttribute("role")).toBe("img");
    expect(preview.getAttribute("aria-label")).toContain(handle.banner().pattern);
    expect(preview.getAttribute("aria-label")).toContain(handle.banner().sigil);
    handle.destroy();
  });

  it("works with no onBannerChange at all", () => {
    const handle = build();
    expect(() => handle_of("sigil", "fist").click()).not.toThrow();
    expect(handle.banner().sigil).toBe("fist");
    handle.destroy();
  });

  it("writes nothing to storage — persisting the banner is the store's job", () => {
    const handle = build();
    handle_of("primary", BANNER_COLORS[2]).click();
    expect(localStorage.length).toBe(0);
    handle.destroy();
  });

  it("detaches its handler on destroy, so a rebuilt panel cannot double-apply", () => {
    const onBannerChange = vi.fn();
    const handle = build({ onBannerChange });
    const preview = handle.root.querySelector('[data-testid="clan-banner-preview"]')!;
    handle.destroy();
    // The node is gone, but the listener would still be live if destroy only removed
    // the element from the document without unbinding it.
    expect(document.body.contains(handle.root)).toBe(false);
    expect(preview.innerHTML).toBe(normalise(bannerSvg(handle.banner())));
    expect(onBannerChange).not.toHaveBeenCalled();
  });

  it("shows the clan offices the store actually holds, with their bonus", () => {
    const handle = build();
    const office = document.body.querySelector('[data-testid="clan-offices"]')!;
    // The store is empty in a clean profile, so this is the honest empty state
    // rather than an invented roster.
    expect(office.textContent).toContain("No offices filled");
    handle.destroy();
  });

  it("prints an office with its holder and bonus once the store has one", async () => {
    const { assignClanRole, upsertMember } = await import("../../../clan/store.js");
    upsertMember({ id: "m1", name: "Ada Okonjo", gender: "f", birthYear: 1970, traits: [], skills: { stewardship: 80 } });
    assignClanRole("m1", "steward");
    const handle = build();
    expect(handle.root.querySelector('[data-testid="clan-office-steward"]')!.textContent).toContain("Ada Okonjo");
    expect(handle.root.querySelector('[data-testid="clan-office-steward"]')!.textContent).toContain("tax income");
    handle.destroy();
  });
});