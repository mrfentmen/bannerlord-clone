/**
 * The character sheet: who the player is, in the simulation's own words.
 *
 * Read-only. The character maker owns creation; the simulation owns the numbers.
 * This panel just prints them — name, age, biography, attributes and skills —
 * so a player can be told later what they picked.
 */
import { h, row, sectionHeader } from "../dom.js";
import { emptyState, panel } from "../kit.js";
import { asBottomSheet } from "./narrow.js";

export interface CharacterSheetData {
  characterName: string;
  age: number;
  ethnicityId: string;
  biography: string;
  attributes?: Record<string, number> | undefined;
  skills: Record<string, number>;
  influence: number;
  renown: number;
  factionId: string;
}

export interface CharacterPanelOptions {
  character: CharacterSheetData | null;
  testId?: string;
}

export function characterPanel(options: CharacterPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: options.character?.characterName ?? "Character",
    testId: options.testId ?? "character-panel",
    onClose: () => undefined,
  });
  root.querySelector(".panel__close")?.remove();
  asBottomSheet(root);

  const c = options.character;
  if (!c) {
    body.appendChild(emptyState("No character.", "Start a new game to create your character."));
    return root;
  }

  body.appendChild(sectionHeader("Identity"));
  body.appendChild(
    h("div", {},
      row("Name", c.characterName, { testId: "char-name" }),
      row("Age", String(c.age), { mono: true, testId: "char-age" }),
      row("Culture", c.ethnicityId, { testId: "char-ethnicity" }),
      row("Faction", c.factionId, { testId: "char-faction" }),
      row("Renown", String(Math.round(c.renown)), { mono: true, testId: "char-renown" }),
      row("Influence", String(Math.round(c.influence)), { mono: true, testId: "char-influence" }),
    ),
  );

  if (c.biography) {
    body.appendChild(sectionHeader("Biography"));
    body.appendChild(h("p", { class: "caption", "data-testid": "char-biography" }, c.biography));
  }

  if (c.attributes && Object.keys(c.attributes).length > 0) {
    body.appendChild(sectionHeader("Attributes"));
    const list = h("div", {});
    for (const [id, level] of Object.entries(c.attributes)) {
      list.appendChild(row(id, String(level), { mono: true, testId: `char-attr-${id}` }));
    }
    body.appendChild(list);
  }

  const skillEntries = Object.entries(c.skills);
  if (skillEntries.length > 0) {
    body.appendChild(sectionHeader("Skills"));
    const list = h("div", {});
    for (const [id, level] of skillEntries) {
      list.appendChild(row(id, String(level), { mono: true, testId: `char-skill-${id}` }));
    }
    body.appendChild(list);
  }

  return root;
}
