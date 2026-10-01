/**
 * Character sheet. MASTER_PLAN.md section 3A (tasks 95-100).
 *
 *  - Long-lived character record (task 95): the CharacterMaker output is a
 *    versioned JSON-serializable record. `serializeCharacterRecord` /
 *    `deserializeCharacterRecord` round-trip it, and the chosen perks live on
 *    the record itself, so saves carry them (task 98).
 *  - Attributes (task 96): the six attributes with values, each showing its
 *    modifier tooltip (a real `title` plus visible text, so it works for
 *    keyboard and touch users too).
 *  - Skills (task 97): the eighteen skills with level and an XP bar. When an
 *    `update()` raises a skill's level, that row gets the leveled animation
 *    class; pending level-ups render the perk choices (task 98).
 *  - Traits (task 99): each trait lists its positive and negative effects.
 *  - Summary (task 100): renown, influence, and relations, all from the sim
 *    snapshot the caller feeds in.
 *
 * Same pattern as the other UI modules: this module owns no sim connection.
 * The caller injects action callbacks and feeds state via `update()`; it
 * renders. Rowan wires the callbacks to the sim API.
 */

import { announce, button, h, liveRegion, replace, row, sectionHeader } from "./dom.js";
import { dataTable, emptyState, panel, statusChip } from "./kit.js";

// -- Data --------------------------------------------------------------------

/** The six attributes. Bannerlord's set, kept because the skills map to them. */
export interface CharacterAttribute {
  id: "vigor" | "control" | "endurance" | "cunning" | "social" | "intelligence";
  name: string;
  value: number;
  /** What this attribute modifies. Shown as the modifier tooltip. */
  modifierText: string;
}

export interface SkillPerkOption {
  id: string;
  name: string;
  description: string;
}

export interface CharacterSkill {
  id: string;
  name: string;
  /** Which attribute governs it. */
  attributeId: CharacterAttribute["id"];
  level: number;
  xp: number;
  xpForNext: number;
  /** Level-ups whose perk has not been chosen yet. */
  pendingLevelUps: number;
  /** The sim's offered perk choices for the pending level-up(s). */
  perkOptions: SkillPerkOption[];
  /** Perk ids already taken, in choice order. Persisted on the record. */
  chosenPerks: string[];
}

export interface CharacterTrait {
  id: string;
  name: string;
  description: string;
  /** Good things the trait does. */
  positive: string[];
  /** Bad things the trait does. */
  negative: string[];
}

export interface CharacterRelation {
  entityId: string;
  entityName: string;
  /** -100 to 100. */
  value: number;
}

/**
 * The CharacterMaker output, kept for the life of the character. Versioned
 * so a future record shape can migrate instead of breaking old saves.
 */
export interface CharacterRecord {
  version: 1;
  id: string;
  name: string;
  culture: string;
  background: string;
  dayCreated: number;
  attributes: CharacterAttribute[];
  skills: CharacterSkill[];
  traits: CharacterTrait[];
  renown: number;
  influence: number;
  relations: CharacterRelation[];
}

export interface CharacterSheetCallbacks {
  /** Persist the chosen perk. The caller saves the updated record. */
  onSelectPerk(skillId: string, perkId: string): void;
  onClose(): void;
}

// -- Persistence (task 95) ---------------------------------------------------

/** Serialize for a save slot. JSON, so any save backend can store it. */
export function serializeCharacterRecord(record: CharacterRecord): string {
  return JSON.stringify(record);
}

/**
 * Restore from a save slot. Throws a readable error on corrupt input rather
 * than returning a half-record.
 */
export function deserializeCharacterRecord(json: string): CharacterRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("character record is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || (parsed as { version?: unknown }).version !== 1) {
    throw new Error("character record has an unknown version");
  }
  return parsed as CharacterRecord;
}

// -- The sheet ----------------------------------------------------------------

function xpPercent(skill: CharacterSkill): number {
  if (skill.xpForNext <= 0) return 100;
  return Math.max(0, Math.min(100, (skill.xp / skill.xpForNext) * 100));
}

function xpBar(skill: CharacterSkill): HTMLElement {
  const pct = xpPercent(skill);
  return h(
    "div",
    {
      class: "character-skill__xp",
      role: "progressbar",
      "aria-label": `${skill.name} experience`,
      "aria-valuemin": "0",
      "aria-valuemax": String(skill.xpForNext),
      "aria-valuenow": String(skill.xp),
      "aria-valuetext": `${skill.xp} of ${skill.xpForNext} XP`,
    },
    h("div", { class: "character-skill__xp-fill", style: `width: ${pct}%` }),
  );
}

function relationBand(value: number): "good" | "warning" | "critical" | "neutral" {
  if (value >= 25) return "good";
  if (value >= 0) return "neutral";
  if (value > -25) return "warning";
  return "critical";
}

export interface CharacterSheetHandle {
  root: HTMLElement;
  update(next: CharacterRecord): void;
  destroy(): void;
}

export function createCharacterSheet(record: CharacterRecord, cb: CharacterSheetCallbacks): CharacterSheetHandle {
  const region = liveRegion();
  const { root, body } = panel({ title: "Character", onClose: cb.onClose, testId: "character-sheet" });
  let current = record;
  /** Skill ids that leveled up on the last update, for the animation class. */
  let justLeveled = new Set<string>();

  function renderHeader(): HTMLElement {
    return h(
      "div",
      { class: "character-head" },
      h("div", { class: "character-head__name" }, current.name),
      h("div", { class: "character-head__meta caption" }, `${current.culture} · ${current.background} · day ${current.dayCreated}`),
    );
  }

  function renderAttributes(): HTMLElement {
    const wrap = h("div", { class: "character-attrs" }, sectionHeader("Attributes"));
    for (const attr of current.attributes) {
      wrap.append(
        h(
          "div",
          { class: "character-attr", "data-testid": `attr-${attr.id}`, title: attr.modifierText },
          h("span", { class: "character-attr__name" }, attr.name),
          h("span", { class: "character-attr__value data" }, String(attr.value)),
          h("span", { class: "character-attr__modifier caption" }, attr.modifierText),
        ),
      );
    }
    return wrap;
  }

  function renderPerkChoices(skill: CharacterSkill): HTMLElement | null {
    if (skill.pendingLevelUps <= 0) return null;
    const wrap = h("div", { class: "character-perks" }, sectionHeader(`Choose a perk — ${skill.name}`));
    if (skill.perkOptions.length === 0) {
      wrap.append(h("p", { class: "caption" }, "The sim has no perk options for this skill yet."));
      return wrap;
    }
    for (const perk of skill.perkOptions) {
      const already = skill.chosenPerks.includes(perk.id);
      wrap.append(
        h(
          "div",
          { class: "character-perk", "data-testid": `perk-${perk.id}` },
          h("div", { class: "character-perk__name" }, perk.name),
          h("div", { class: "character-perk__desc caption" }, perk.description),
          button(already ? "Taken" : "Take perk", () => {
            if (already) return;
            cb.onSelectPerk(skill.id, perk.id);
            announce(region, `Perk chosen: ${perk.name} for ${skill.name}`);
          }, { variant: "primary", disabled: already, testId: `take-perk-${perk.id}` }),
        ),
      );
    }
    return wrap;
  }

  function renderSkills(): HTMLElement {
    const wrap = h("div", { class: "character-skills" }, sectionHeader("Skills"));
    for (const skill of current.skills) {
      const leveled = justLeveled.has(skill.id);
      const rowEl = h(
        "div",
        {
          class: `character-skill${leveled ? " character-skill--leveled" : ""}`,
          "data-testid": `skill-${skill.id}`,
        },
        h(
          "div",
          { class: "character-skill__head" },
          h("span", { class: "character-skill__name" }, skill.name),
          h("span", { class: "character-skill__level data" }, `Lv ${skill.level}`),
        ),
        xpBar(skill),
        skill.pendingLevelUps > 0
          ? statusChip("warning", `${skill.pendingLevelUps} perk${skill.pendingLevelUps > 1 ? "s" : ""} to choose`)
          : null,
      );
      wrap.append(rowEl);
      const choices = renderPerkChoices(skill);
      if (choices) wrap.append(choices);
    }
    return wrap;
  }

  function renderTraits(): HTMLElement {
    const wrap = h("div", { class: "character-traits" }, sectionHeader("Traits"));
    if (current.traits.length === 0) {
      wrap.append(emptyState("No traits", "This character has not earned any traits yet."));
      return wrap;
    }
    for (const trait of current.traits) {
      wrap.append(
        h(
          "div",
          { class: "character-trait", "data-testid": `trait-${trait.id}` },
          h("div", { class: "character-trait__name" }, trait.name),
          h("div", { class: "character-trait__desc caption" }, trait.description),
          dataTable(
            "Trait effects",
            [
              { header: "Effect", render: (e: { kind: string; text: string }) => e.text },
              { header: "Kind", render: (e: { kind: string }) => statusChip(e.kind === "positive" ? "good" : "critical", e.kind) },
            ],
            [
              ...trait.positive.map((text) => ({ kind: "positive", text })),
              ...trait.negative.map((text) => ({ kind: "negative", text })),
            ],
          ),
        ),
      );
    }
    return wrap;
  }

  function renderSummary(): HTMLElement {
    const wrap = h(
      "div",
      { class: "character-summary" },
      sectionHeader("Standing"),
      row("Renown", h("span", { class: "data", "data-testid": "renown-value" }, String(current.renown))),
      row("Influence", h("span", { class: "data", "data-testid": "influence-value" }, String(current.influence))),
      sectionHeader("Relations"),
    );
    if (current.relations.length === 0) {
      wrap.append(emptyState("No relations", "No notable relations recorded yet."));
    } else {
      for (const rel of current.relations) {
        wrap.append(
          h(
            "div",
            { class: "character-relation", "data-testid": `relation-${rel.entityId}` },
            h("span", { class: "character-relation__name" }, rel.entityName),
            statusChip(relationBand(rel.value), String(rel.value), { title: `Relation ${rel.value}` }),
          ),
        );
      }
    }
    return wrap;
  }

  function render(): void {
    replace(
      body,
      renderHeader(),
      renderAttributes(),
      renderSkills(),
      renderTraits(),
      renderSummary(),
    );
  }

  render();
  document.body.append(region);

  return {
    root,
    update(next: CharacterRecord) {
      const prev = new Map(current.skills.map((s) => [s.id, s.level]));
      justLeveled = new Set(
        next.skills.filter((s) => (prev.get(s.id) ?? s.level) < s.level).map((s) => s.id),
      );
      current = next;
      render();
      for (const id of justLeveled) {
        const skill = next.skills.find((s) => s.id === id);
        if (skill) announce(region, `${skill.name} reached level ${skill.level}. Choose a perk.`);
      }
    },
    destroy() {
      root.remove();
      region.remove();
    },
  };
}

/**
 * Build the eighteen skills from a sim-provided list of names. The caller
 * passes the sim's canonical skill table; this is just a convenience for
 * tests and for the fixture.
 */
export function buildSkillList(
  defs: { id: string; name: string; attributeId: CharacterAttribute["id"] }[],
  values: Partial<Record<string, Partial<CharacterSkill>>> = {},
): CharacterSkill[] {
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    attributeId: d.attributeId,
    level: 0,
    xp: 0,
    xpForNext: 100,
    pendingLevelUps: 0,
    perkOptions: [],
    chosenPerks: [],
    ...values[d.id],
  }));
}

/** The canonical eighteen skills of the modern setting. */
export const MODERN_SKILLS: { id: string; name: string; attributeId: CharacterAttribute["id"] }[] = [
  { id: "sidearms", name: "Sidearms", attributeId: "vigor" },
  { id: "rifles", name: "Rifles", attributeId: "vigor" },
  { id: "melee", name: "Melee", attributeId: "vigor" },
  { id: "marksmanship", name: "Marksmanship", attributeId: "control" },
  { id: "heavy-weapons", name: "Heavy Weapons", attributeId: "control" },
  { id: "throwing", name: "Throwing", attributeId: "control" },
  { id: "driving", name: "Driving", attributeId: "endurance" },
  { id: "athletics", name: "Athletics", attributeId: "endurance" },
  { id: "crafting", name: "Crafting", attributeId: "endurance" },
  { id: "scouting", name: "Scouting", attributeId: "cunning" },
  { id: "tactics", name: "Tactics", attributeId: "cunning" },
  { id: "streetwise", name: "Streetwise", attributeId: "cunning" },
  { id: "charm", name: "Charm", attributeId: "social" },
  { id: "leadership", name: "Leadership", attributeId: "social" },
  { id: "trade", name: "Trade", attributeId: "social" },
  { id: "steward", name: "Steward", attributeId: "intelligence" },
  { id: "medicine", name: "Medicine", attributeId: "intelligence" },
  { id: "engineering", name: "Engineering", attributeId: "intelligence" },
];

/** The six attributes with their modifier tooltips. */
export const MODERN_ATTRIBUTES: CharacterAttribute[] = [
  { id: "vigor", name: "Vigor", value: 0, modifierText: "Raises melee damage and health; each point adds carrying capacity." },
  { id: "control", name: "Control", value: 0, modifierText: "Steadies aim and reduces weapon spread." },
  { id: "endurance", name: "Endurance", value: 0, modifierText: "Extends stamina and speeds recovery." },
  { id: "cunning", name: "Cunning", value: 0, modifierText: "Improves scouting, tactics, and streetwise." },
  { id: "social", name: "Social", value: 0, modifierText: "Opens dialogue options and improves trade prices." },
  { id: "intelligence", name: "Intelligence", value: 0, modifierText: "Speeds skill XP gain; improves medicine and engineering." },
];
