/**
 * The character panel (Buffy tasks 237 and 238).
 *
 * `CharacterMaker` is the character *sheet* at the start of a campaign: a wizard for
 * spending five points before the first march. This is the character *panel* after
 * it — the standing record of who the player is and what they can do, read from the
 * same fields the maker wrote and the simulation has been carrying ever since
 * (`SimSnapshot.player.skills`, `characterName`, `age`, `biography`).
 *
 * Every bar is on the 0-100 scale `ClanMember.skills` declares, because that is the
 * one scale the client has for a skill. Each skill also prints its number, so a
 * player who distrusts the bar can read the figure instead — the bar is a summary,
 * not the only way to get the value.
 *
 * A skill the simulation has never heard of is printed with a capital in place of
 * the space rather than dropped: a missing skill and a skill nobody has yet are
 * different facts, and a panel that quietly drops one of them lies about it.
 */

import { h } from "../dom.js";
import { emptyState, gauge, panel } from "../kit.js";
import "./characterPanel.css";

/** The 0-100 scale `ClanMember.skills` uses, per `src/clan/types.ts`. */
const SKILL_SCALE = 100;

/** Skill ids in the order the maker lists them, with a readable name for each. */
const SKILL_LABEL: Record<string, string> = {
  combat: "Combat",
  leadership: "Leadership",
  trade: "Trade",
  medicine: "Medicine",
  engineering: "Engineering",
  athletics: "Athletics",
  streetwise: "Streetwise",
  stealth: "Stealth",
  surveillance: "Surveillance",
  survival: "Survival",
};

/** The order skills are listed in when the simulation has not sent a fixed set. */
const SKILL_ORDER = Object.keys(SKILL_LABEL);

export interface CharacterPanelOptions {
  /** The player's name as the campaign has it. */
  name: string;
  /** Skills by id, straight from the simulation. */
  skills: Record<string, number>;
  /** Age in years, when the campaign knows it. */
  age?: number;
  /** The biography assembled at character creation. */
  biography?: string;
  /** Influence and renown, when the caller has them. */
  influence?: number;
  renown?: number;
  onClose?: () => void;
  testId?: string;
}

export interface CharacterPanelHandle {
  root: HTMLElement;
  destroy(): void;
}

export function createCharacterPanel(options: CharacterPanelOptions): CharacterPanelHandle {
  const { root, body } = panel({
    title: options.name,
    testId: options.testId ?? "character-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  const header = h("div", { class: "character__head" });
  header.appendChild(
    h(
      "p",
      { class: "caption", "data-testid": "character-name" },
      options.age !== undefined ? `${options.name}, aged ${options.age}` : options.name,
    ),
  );
  if (options.influence !== undefined) {
    header.appendChild(
      h("p", { class: "caption", "data-testid": "character-influence" }, `Influence ${options.influence}`),
    );
  }
  if (options.renown !== undefined) {
    header.appendChild(
      h("p", { class: "caption", "data-testid": "character-renown" }, `Renown ${options.renown}`),
    );
  }
  body.appendChild(header);

  if (options.biography) {
    body.appendChild(
      h("p", { class: "character__bio", "data-testid": "character-biography" }, options.biography),
    );
  }

  body.appendChild(h("h3", { class: "section-header" }, h("span", {}, "Skills")));
  const ids = skillIdsInOrder(options.skills);
  if (ids.length === 0) {
    body.appendChild(
      emptyState(
        "No skills recorded.",
        "Nothing has been recorded against this character yet. Skills arrive from the simulation as they are trained.",
      ),
    );
  } else {
    for (const id of ids) {
      const value = options.skills[id] ?? 0;
      body.appendChild(
        gauge({
          label: SKILL_LABEL[id] ?? titleCase(id),
          // Clamped so a skill the campaign pushed past the scale fills the bar
          // rather than overflowing it, while the printed number stays honest.
          value: Math.max(0, Math.min(1, value / SKILL_SCALE)),
          format: () => `${Math.round(value)} / ${SKILL_SCALE}`,
          thresholds: { warningBelow: 0.15, goodAbove: 0.5 },
          testId: `skill-${id}`,
        }),
      );
    }
  }

  return {
    root,
    destroy(): void {
      // Nothing here subscribes to anything: every value came in as an argument, so
      // there is no listener to leak. The panel is still torn down explicitly so
      // callers can treat every handle the same way.
      root.remove();
    },
  };
}

/**
 * The skills to print, in the canonical order first and anything the simulation sent
 * after them. A skill nobody has heard of is still printed — see the note above.
 */
function skillIdsInOrder(skills: Record<string, number>): string[] {
  const known = SKILL_ORDER.filter((id) => id in skills);
  const extra = Object.keys(skills)
    .filter((id) => !SKILL_ORDER.includes(id))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

/** `streetwise-ish` reads as `Streetwise-ish`. For skills the client has no label for. */
function titleCase(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}