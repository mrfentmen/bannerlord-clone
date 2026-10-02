/**
 * Task 73: veteran unit naming. Distinguished units (battle MVPs, surviving
 * veterans) can be given a name that sticks with the troop record across
 * battles. The panel is presentation + validation; the name itself lives on
 * the troop record in party data (which already carries a `name` field and
 * persists across battles), read through `getName` and written through
 * `onRename` — the campaign (data) layer owns the mutation.
 */

import { h } from "../ui/dom.js";

export const VETERAN_NAME_MAX = 40;

export interface VeteranUnit {
  id: string;
  /** Display label, e.g. "Veteran Sergeant — 12 kills". */
  label: string;
}

/** Clean a raw input into a usable unit name, or null when unusable. */
export function cleanVeteranName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0 || name.length > VETERAN_NAME_MAX) return null;
  return name;
}

export interface VeteranNamePanelOptions {
  /** Current name of the unit (empty when unnamed). */
  getName(): string;
  /** Persist the new name on the troop record. */
  onRename(name: string): void;
}

export interface VeteranNamePanel {
  root: HTMLElement;
  destroy(): void;
}

export function createVeteranNamePanel(
  unit: VeteranUnit,
  opts: VeteranNamePanelOptions,
): VeteranNamePanel {
  const root = h("div", { class: "aa-veteran-name", "data-testid": "aa-veteran-name" });
  const input = h("input", {
    class: "aa-veteran-name-input",
    type: "text",
    maxlength: String(VETERAN_NAME_MAX),
    value: opts.getName(),
  }) as HTMLInputElement;
  input.setAttribute("aria-label", `Name for ${unit.label}`);
  const error = h("p", { class: "aa-veteran-name-error", role: "alert" });
  error.hidden = true;
  const save = h("button", { class: "btn", type: "button" }, "Name unit");

  save.addEventListener("click", () => {
    const name = cleanVeteranName(input.value);
    if (name === null) {
      error.hidden = false;
      error.textContent = `Give a name of 1-${VETERAN_NAME_MAX} characters.`;
      return;
    }
    error.hidden = true;
    opts.onRename(name);
  });

  root.append(h("h3", {}, `Name your veteran`), h("p", { class: "aa-veteran-name-label" }, unit.label), input, save, error);
  return {
    root,
    destroy() {
      root.remove();
    },
  };
}
