/**
 * Child naming ceremony (Rowan solo task 53).
 *
 * Cultural name lists for the naming ceremony: pick a culture, get
 * suggestions, validate a custom name. Names carry a meaning line for
 * the ceremony text.
 */

export type NameCulture = "highlander" | "coastal" | "steppe" | "urban";

export const NAME_CULTURES: NameCulture[] = ["highlander", "coastal", "steppe", "urban"];

export interface CeremonyName {
  name: string;
  meaning: string;
}

const NAME_LISTS: Record<NameCulture, { male: CeremonyName[]; female: CeremonyName[] }> = {
  highlander: {
    male: [
      { name: "Duncan", meaning: "dark warrior" },
      { name: "Callum", meaning: "dove of the peaks" },
      { name: "Fergus", meaning: "man of vigor" },
    ],
    female: [
      { name: "Mairead", meaning: "pearl of the glen" },
      { name: "Elspeth", meaning: "pledged to the clan" },
      { name: "Isla", meaning: "island-born" },
    ],
  },
  coastal: {
    male: [
      { name: "Marlow", meaning: "from the hill by the sea" },
      { name: "Caspian", meaning: "of the deep water" },
      { name: "Dorian", meaning: "gift of the tide" },
    ],
    female: [
      { name: "Marina", meaning: "of the sea" },
      { name: "Coral", meaning: "jewel of the reef" },
      { name: "Nerissa", meaning: "sea nymph" },
    ],
  },
  steppe: {
    male: [
      { name: "Temur", meaning: "iron-willed" },
      { name: "Batu", meaning: "firm as stone" },
      { name: "Khan", meaning: "born to lead" },
    ],
    female: [
      { name: "Altan", meaning: "golden dawn" },
      { name: "Saran", meaning: "moon over grass" },
      { name: "Naran", meaning: "sun child" },
    ],
  },
  urban: {
    male: [
      { name: "Marcus", meaning: "of the market ward" },
      { name: "Silas", meaning: "of the foundry" },
      { name: "Theo", meaning: "gift of the city" },
    ],
    female: [
      { name: "Vera", meaning: "true to the borough" },
      { name: "Lena", meaning: "light of the arcade" },
      { name: "Mira", meaning: "wonder of the wards" },
    ],
  },
};

/** Suggested names for a culture and sex. */
export function suggestNames(culture: NameCulture, sex: "male" | "female"): CeremonyName[] {
  const list = NAME_LISTS[culture];
  if (!list) throw new Error(`unknown name culture: ${culture}`);
  return [...list[sex]];
}

export interface NameValidation {
  ok: boolean;
  reason?: string;
}

/** Validate a custom name: 2-24 letters, spaces, hyphens, apostrophes. */
export function validateName(name: string): NameValidation {
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, reason: "names must be at least 2 letters" };
  if (trimmed.length > 24) return { ok: false, reason: "names must be 24 letters or fewer" };
  if (!/^[A-Za-z'’\- ]+$/.test(trimmed)) {
    return { ok: false, reason: "names may only use letters, spaces, hyphens, and apostrophes" };
  }
  return { ok: true };
}

/** The ceremony line spoken when the name is bestowed. */
export function ceremonyLine(name: string, meaning?: string): string {
  return meaning
    ? `By clan and kin, we name this child ${name} — "${meaning}".`
    : `By clan and kin, we name this child ${name}.`;
}
