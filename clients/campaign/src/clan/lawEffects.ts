/**
 * Law effects preview (Rowan solo task 56).
 *
 * Before enacting an inheritance law, show its predicted effects: who the
 * heir would be, how holdings would split, and which children gain or lose
 * standing. Built on the existing succession preview — pure and safe to
 * run without enacting anything.
 */

import type { ClanLaws, ClanMember, InheritanceLaw } from "./types.js";
import { successionPreview } from "./succession.js";

export interface LawEffect {
  /** Human-readable predicted effect. */
  text: string;
  /** "good" | "bad" | "neutral" from the clan's perspective. */
  tone: "good" | "bad" | "neutral";
}

export interface LawEffectsPreview {
  law: InheritanceLaw;
  lawName: string;
  heirName: string;
  effects: LawEffect[];
}

const LAW_NAMES: Record<InheritanceLaw, string> = {
  primogeniture: "Primogeniture",
  ultimogeniture: "Ultimogeniture",
  partible: "Partible inheritance",
  elective: "Elective succession",
};

/**
 * Predict the effects of enacting a law, without changing anything.
 * membersById resolves names for the report.
 */
export function previewLawEffects(
  law: InheritanceLaw,
  currentLaws: ClanLaws,
  rulerId: string,
  members: ClanMember[],
  holdings: string[],
  membersById: Map<string, string>,
): LawEffectsPreview {
  const next: ClanLaws = { ...currentLaws, inheritance: law };
  const preview = successionPreview(rulerId, members, next, holdings);
  const heirName = membersById.get(preview.heirId) ?? preview.heirId;
  const effects: LawEffect[] = [
    { text: `${heirName} would become heir.`, tone: "neutral" },
  ];

  if (law === "partible") {
    const holders = new Set(Object.values(preview.split));
    effects.push({
      text: `Holdings would split among ${holders.size} heirs — no single ruler controls everything.`,
      tone: "bad",
    });
  } else {
    effects.push({
      text: `All ${holdings.length} holding(s) would pass to ${heirName} intact.`,
      tone: "good",
    });
  }

  if (law === "elective") {
    effects.push({
      text: "The council would choose the heir — expect campaigning and bribes.",
      tone: "neutral",
    });
  }

  if (law !== currentLaws.inheritance) {
    effects.push({
      text: "Changing the law will upset those who benefited from the old one.",
      tone: "bad",
    });
  } else {
    effects.push({
      text: "This law is already in force — no change.",
      tone: "neutral",
    });
  }

  return { law, lawName: LAW_NAMES[law], heirName, effects };
}
