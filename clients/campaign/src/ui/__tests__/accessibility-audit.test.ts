/**
 * MASTER_PLAN task 22: automated screen-reader audit.
 *
 * Renders the main panels and asserts every interactive element exposes an
 * accessible name (visible text, aria-label, aria-labelledby, an associated
 * <label>, or a title) and every image carries alt text. This is the audit
 * the plan asks for; it runs in CI, not in a browser, so it checks names —
 * not focus order or live-region timing, which need a real AT stack.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { settingsPanel } from "../panels/SettingsPanel.js";
import { createHud } from "../hud.js";
import { createSubtitleBar } from "../subtitles.js";
import { createRadialMenu } from "../../command/radial.js";
import { settings } from "../../settings/index.js";

function accessibleName(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  }
  const label = el.getAttribute("aria-label");
  if (label?.trim()) return label.trim();
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length > 0) {
      const text = Array.from(labels)
        .map((l) => l.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }
  }
  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();
  return el.textContent?.trim() ?? "";
}

function describeEl(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testid = el.getAttribute("data-testid");
  const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
  return `<${tag}${testid ? ` data-testid="${testid}"` : ""}${cls ? ` class="${cls}"` : ""}>`;
}

/** Every interactive element under root must have an accessible name. */
function auditInteractive(root: Element, surface: string): string[] {
  const problems: string[] = [];
  const els = root.querySelectorAll(
    "button, input, select, textarea, a[href], [role='button'], [role='menuitem'], [role='tab']",
  );
  for (const el of els) {
    if ((el as HTMLElement).hidden) continue;
    const style = (el as HTMLElement).style;
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (!accessibleName(el)) {
      problems.push(`${surface}: ${describeEl(el)} has no accessible name`);
    }
  }
  const imgs = root.querySelectorAll("img");
  for (const img of imgs) {
    if (img.getAttribute("alt") === null) {
      problems.push(`${surface}: ${describeEl(img)} has no alt attribute`);
    }
  }
  return problems;
}

describe("screen-reader audit (task 22)", () => {
  it("settings panel: every tab, every control has a name", () => {
    settings.reset();
    const root = settingsPanel({ onClose: () => {} });
    document.body.appendChild(root);
    const problems: string[] = [];
    for (const tabId of ["graphics", "audio", "gameplay", "accessibility"]) {
      (root.querySelector(`[data-testid="settings-tab-${tabId}"]`) as HTMLButtonElement).click();
      problems.push(...auditInteractive(root, `settings/${tabId}`));
    }
    root.remove();
    expect(problems).toEqual([]);
  });

  it("HUD rail and topbar controls have names", () => {
    settings.reset();
    const hud = createHud({
      onSelectPanel: () => {},
      onTimeScale: () => {},
      onOpenDataSource: () => {},
      onOpenControls: () => {},
      onOpenSettings: () => {},
      onOpenJournal: () => {},
      onOpenCodex: () => {},
      onOpenAchievements: () => {},
      onOpenUiScale: () => {},
      onNotification: () => {},
    });
    document.body.appendChild(hud.root);
    const problems = auditInteractive(hud.root, "hud");
    hud.root.remove();
    expect(problems).toEqual([]);
  });

  it("subtitle bar and command radial expose names", () => {
    settings.reset();
    const bar = createSubtitleBar();
    document.body.appendChild(bar.root);
    const radial = createRadialMenu({
      items: [{ kind: "attack" }, { kind: "retreat" }],
      x: 100,
      y: 100,
      onPick: () => {},
      onCancel: () => {},
    });
    document.body.appendChild(radial.root);
    const problems = [
      ...auditInteractive(bar.root, "subtitles"),
      ...auditInteractive(radial.root, "radial"),
    ];
    expect(radial.root.getAttribute("role")).toBe("menu");
    bar.destroy();
    radial.destroy();
    expect(problems).toEqual([]);
  });
});
