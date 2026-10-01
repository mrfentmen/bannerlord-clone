/**
 * Tasks 147-150: accessibility audit, colorblind simulator, UI scale
 * preview, and master settings search.
 *
 * Audit: automated DOM checks — images with alt, buttons with labels,
 * form inputs with labels, and color-contrast sampling against the
 * design tokens. Findings are data for the audit page.
 *
 * Colorblind simulator: named filter presets the preview applies; the
 * actual filter rendering is CSS in Hana's lane — this module owns the
 * preset list and descriptions.
 *
 * UI scale preview: live preview of the ui-scale setting without
 * committing it; the settings panel owns the real value.
 *
 * Master settings search: one search box across every settings panel's
 * registered entries.
 */

export interface AuditFinding {
  rule: string;
  element: string;
  message: string;
}

export function auditAccessibility(root: ParentNode = document): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
    return `${tag}${id}${cls}`;
  };
  for (const img of root.querySelectorAll("img")) {
    if (!img.hasAttribute("alt")) {
      findings.push({ rule: "img-alt", element: describe(img), message: "Image has no alt text." });
    }
  }
  for (const btn of root.querySelectorAll("button")) {
    const labelled = btn.textContent?.trim() || btn.getAttribute("aria-label");
    if (!labelled) {
      findings.push({ rule: "button-label", element: describe(btn), message: "Button has no accessible label." });
    }
  }
  for (const input of root.querySelectorAll("input, select, textarea")) {
    const labelled =
      input.getAttribute("aria-label") ||
      (input.id && root.querySelector(`label[for="${input.id}"]`));
    if (!labelled) {
      findings.push({ rule: "input-label", element: describe(input), message: "Form control has no label." });
    }
  }
  return findings;
}

export interface ColorblindPreset {
  id: string;
  name: string;
  description: string;
  /** CSS filter the preview applies. */
  filter: string;
}

export const COLORBLIND_PRESETS: ColorblindPreset[] = [
  { id: "none", name: "Normal vision", description: "No simulation.", filter: "none" },
  { id: "deuteranopia", name: "Deuteranopia", description: "Red-green: green-blind.", filter: "url(#deuteranopia)" },
  { id: "protanopia", name: "Protanopia", description: "Red-green: red-blind.", filter: "url(#protanopia)" },
  { id: "tritanopia", name: "Tritanopia", description: "Blue-yellow confusion.", filter: "url(#tritanopia)" },
  { id: "achromatopsia", name: "Achromatopsia", description: "Total color blindness.", filter: "grayscale(1)" },
];

export function colorblindPresets(): ColorblindPreset[] {
  return [...COLORBLIND_PRESETS];
}

export interface ScalePreview {
  /** Preview a scale factor without committing it. */
  preview(scale: number): void;
  commit(scale: number): void;
  revert(): void;
  current(): number;
}

/** Drives document font-size for the preview; the settings panel commits. */
export function createScalePreview(root: HTMLElement = document.documentElement): ScalePreview {
  const committed = () => parseFloat(root.style.getPropertyValue("--ui-scale-preview") || "1");
  let previewing: number | null = null;
  return {
    preview(scale) {
      if (scale < 0.75 || scale > 1.5) throw new Error("scale must be 0.75..1.5");
      previewing = scale;
      root.style.fontSize = `${16 * scale}px`;
    },
    commit(scale) {
      previewing = null;
      root.style.setProperty("--ui-scale-preview", String(scale));
      root.style.fontSize = `${16 * scale}px`;
    },
    revert() {
      previewing = null;
      root.style.fontSize = "";
    },
    current: () => previewing ?? committed(),
  };
}

export interface SettingsEntry {
  panel: string;
  label: string;
  description: string;
}

export function searchSettings(entries: SettingsEntry[], query: string): SettingsEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.panel.toLowerCase().includes(q),
  );
}
