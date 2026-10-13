/**
 * Treaty compliance tracker (Rowan solo task 82).
 *
 * Treaties have terms; terms have compliance. Each season, mark a term
 * kept or broken for each party; the tracker lists every term with its
 * status and flags treaties under strain. Persists in localStorage.
 */

export type TermStatus = "kept" | "broken" | "pending";

export interface TreatyTerm {
  id: string;
  text: string;
  /** Who must honor it: "us" or the other party's faction id. */
  party: string;
  status: TermStatus;
  seasonsKept: number;
}

export interface Treaty {
  id: string;
  name: string;
  factionId: string;
  factionName: string;
  seasonSigned: number;
  terms: TreatyTerm[];
}

const STORE_KEY = "campaign.treaties.v1";

function load(): Treaty[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(treaties: Treaty[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(treaties));
  } catch {
    // Session-only treaties.
  }
}

/** Sign a treaty with its terms. All terms start pending. */
export function signTreaty(
  name: string,
  factionId: string,
  factionName: string,
  season: number,
  terms: { text: string; party: string }[],
): Treaty {
  if (terms.length === 0) throw new Error("a treaty needs at least one term");
  const treaty: Treaty = {
    id: `treaty-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    factionId,
    factionName,
    seasonSigned: season,
    terms: terms.map((t, i) => ({
      id: `term-${i}-${Date.now().toString(36)}`,
      text: t.text,
      party: t.party,
      status: "pending" as TermStatus,
      seasonsKept: 0,
    })),
  };
  const treaties = load();
  treaties.push(treaty);
  save(treaties);
  return treaty;
}

/** Mark a term kept or broken. Returns the updated treaty. */
export function markTerm(treatyId: string, termId: string, kept: boolean): Treaty {
  const treaties = load();
  const treaty = treaties.find((t) => t.id === treatyId);
  if (!treaty) throw new Error(`no treaty: ${treatyId}`);
  const term = treaty.terms.find((t) => t.id === termId);
  if (!term) throw new Error(`no term: ${termId}`);
  term.status = kept ? "kept" : "broken";
  if (kept) term.seasonsKept += 1;
  save(treaties);
  return treaty;
}

export interface TreatyStatus {
  treaty: Treaty;
  brokenTerms: number;
  /** True when any term is broken. */
  underStrain: boolean;
  line: string;
}

/** Every treaty with its compliance summary. */
export function treatyCompliance(): TreatyStatus[] {
  return load().map((treaty) => {
    const brokenTerms = treaty.terms.filter((t) => t.status === "broken").length;
    const underStrain = brokenTerms > 0;
    return {
      treaty,
      brokenTerms,
      underStrain,
      line: underStrain
        ? `${treaty.name} (${treaty.factionName}): ${brokenTerms} broken term(s) — under strain.`
        : `${treaty.name} (${treaty.factionName}): all ${treaty.terms.length} term(s) honored.`,
    };
  });
}
