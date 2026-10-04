/**
 * The town-sections pipeline (Buffy, megabuild).
 *
 * Every town facility the simulation can back — tavern, smithy, dice, and
 * whatever the sim grows next — is a `TownSectionSpec`: a declared object that
 * says when it is available, how to load its view, and how to render it. The
 * generic renderer owns the parts every section shares, so a new facility is
 * one spec file plus a handler in main.ts, not another copy of the door,
 * message-line, retry-on-failure, and reload dance.
 *
 * Contract (tasks 115-121 established it, the pipeline enforces it):
 *  - a section with a `load` renders a door and fetches ONLY when the player
 *    steps inside, never on panel render;
 *  - a failed read keeps the door for a retry and shows the simulation's own
 *    message verbatim;
 *  - an action that refuses shows the refusal verbatim and re-arms its button;
 *  - a section is drawn only when the caller passed the handlers that make it
 *    real — a town never shows a button the connected simulation cannot serve.
 */

import { h } from "../dom.js";
import { emptyState } from "../kit.js";
import { sectionHeader } from "../dom.js";
import type { TownPanelOptions } from "./TownPanel.js";

/** What a section's render gets: a way to speak and a way to re-read. */
export interface TownSectionRuntime {
  /** Print a line in the section's status slot (refusals verbatim, results plain). */
  say: (text: string) => void;
  /** Re-run the section's load and re-render (after an action changed the world). */
  reload: () => void;
}

export interface TownSectionSpec<TView> {
  /** Stable id: testids are `${id}-section`, `${id}-enter`, `${id}-message`, `${id}-list`. */
  id: string;
  header: string;
  /** True when the caller passed the handlers that make the section real. */
  available: (options: TownPanelOptions) => boolean;
  /** Read the view. Omit for an action-only section that renders immediately. */
  load?: (options: TownPanelOptions) => Promise<TView>;
  /** Paint the loaded view (or the always-visible body of a doorless section). */
  render: (list: HTMLElement, view: TView, runtime: TownSectionRuntime, options: TownPanelOptions) => void;
  enterLabel: string;
  loadingLabel: string;
  failureLabel: string;
}

/** Render one section from its spec, or null when the caller cannot back it. */
export function townSectionFromSpec<TView>(
  spec: TownSectionSpec<TView>,
  options: TownPanelOptions,
): HTMLElement | null {
  if (!spec.available(options)) return null;

  const wrap = h("section", { "data-testid": `${spec.id}-section` });
  wrap.appendChild(sectionHeader(spec.header));

  const message = h("p", {
    class: "caption",
    "data-testid": `${spec.id}-message`,
    role: "status",
    style: "margin:0 0 var(--space-3)",
  });
  message.style.display = "none";
  const list = h("div", { "data-testid": `${spec.id}-list` });

  const runtime: TownSectionRuntime = {
    say: (text) => {
      message.style.display = "";
      message.textContent = text;
    },
    reload: () => runLoad(),
  };

  if (!spec.load) {
    // Action-only section: paint immediately, no door.
    spec.render(list, undefined as TView, runtime, options);
    wrap.append(message, list);
    return wrap;
  }

  const enter = h(
    "button",
    { type: "button", class: "btn", "data-testid": `${spec.id}-enter`, "aria-label": spec.enterLabel },
    spec.enterLabel,
  );
  enter.addEventListener("click", () => {
    enter.disabled = true;
    message.style.display = "";
    message.textContent = spec.loadingLabel;
    runLoad();
  });

  function runLoad(): void {
    void spec.load!(options).then(
      (view) => {
        enter.remove();
        message.style.display = "none";
        list.replaceChildren();
        spec.render(list, view, runtime, options);
      },
      (err: unknown) => {
        // The door stays on the card: a failed read is a retry, not a dead end.
        enter.disabled = false;
        runtime.say(err instanceof Error && err.message ? err.message : spec.failureLabel);
      },
    );
  }

  wrap.append(enter, message, list);
  return wrap;
}

/** Shared empty-state helper so every section's "nothing here" reads the same. */
export function sectionEmpty(specId: string, headline: string, detail: string): HTMLElement {
  const empty = emptyState(headline, detail);
  empty.setAttribute("data-testid", `${specId}-empty`);
  return empty;
}
