/**
 * Coming-of-age events (Rowan solo task 9).
 *
 * When a clan child reaches adulthood (18), the campaign fires an event:
 * the child gains an adult trait and the player gets an event panel naming
 * the new adult and their trait. Pure detection + DOM panel; the campaign
 * layer calls `checkComingOfAge` on each season tick and mounts the panel
 * for each returned member.
 */

import type { ClanMember } from "./types.js";
import { h } from "../ui/dom.js";
import { modalize } from "../ui/focusTrap.js";

/** Age at which a clan child becomes an adult. Matches the education cutoff. */
export const ADULT_AGE = 18;

/** Traits a new adult can gain at their coming of age. */
export const COMING_OF_AGE_TRAITS = [
  "brave",
  "shrewd",
  "charismatic",
  "sturdy",
  "pious",
  "ambitious",
] as const;

export type ComingOfAgeTrait = (typeof COMING_OF_AGE_TRAITS)[number];

export interface ComingOfAgeEvent {
  memberId: string;
  name: string;
  trait: ComingOfAgeTrait;
}

/**
 * Find members who reached adulthood between the previous and current year.
 * Dead members are skipped. Deterministic: the trait is derived from the
 * member id hash so the same child always gains the same trait.
 */
export function checkComingOfAge(
  members: ClanMember[],
  prevYear: number,
  currentYear: number,
): ComingOfAgeEvent[] {
  const events: ComingOfAgeEvent[] = [];
  for (const m of members) {
    if (m.deathYear !== undefined) continue;
    const prevAge = prevYear - m.birthYear;
    const age = currentYear - m.birthYear;
    if (prevAge < ADULT_AGE && age >= ADULT_AGE) {
      events.push({ memberId: m.id, name: m.name, trait: traitFor(m.id) });
    }
  }
  return events;
}

function traitFor(id: string): ComingOfAgeTrait {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COMING_OF_AGE_TRAITS[hash % COMING_OF_AGE_TRAITS.length]!;
}

/** Apply a coming-of-age event to the member: record the trait. Pure-ish. */
export function applyComingOfAge(members: Map<string, ClanMember>, event: ComingOfAgeEvent): boolean {
  const m = members.get(event.memberId);
  if (!m) return false;
  if (!m.traits.includes(event.trait)) m.traits.push(event.trait);
  return true;
}

export interface ComingOfAgePanelOptions {
  events: ComingOfAgeEvent[];
  onDismiss: () => void;
}

export function comingOfAgePanel(options: ComingOfAgePanelOptions): HTMLElement {
  const { events } = options;
  const list = h("ul", { class: "coa__list", "data-testid": "coa-list" });
  for (const e of events) {
    list.appendChild(
      h(
        "li",
        { class: "coa__item", "data-testid": `coa-item-${e.memberId}` },
        h("strong", {}, e.name),
        h("span", { class: "caption" }, ` comes of age and is known as ${e.trait}.`),
      ),
    );
  }
  const root = h(
    "div",
    { class: "coa", role: "dialog", "aria-label": "Coming of age", "data-testid": "coa-panel" },
    h("h2", {}, "Coming of age"),
    list,
    h("p", { class: "caption" }, "New adults can marry, lead parties, and inherit."),
  );
  const dismiss = h("button", { type: "button", class: "btn", "data-testid": "coa-dismiss" }, "Acknowledge");
  const cleanup = modalize(root, () => {
    cleanup();
    options.onDismiss();
  });
  dismiss.addEventListener("click", () => {
    cleanup();
    options.onDismiss();
  });
  root.appendChild(dismiss);
  return root;
}
