/**
 * @vitest-environment jsdom
 *
 * Clan & family tests (MASTER_PLAN 3A, tasks 76-84).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBanner,
  assignCompanion,
  assignTutor,
  bannerSvg,
  companionBonus,
  createEducation,
  createTreeViewer,
  DEFAULT_LAWS,
  draftProposal,
  influenceLoyalty,
  layoutFamilyTree,
  loyaltyAlerts,
  marriageOdds,
  propose,
  startSuccessionCrisis,
  successionPreview,
  tickSeason,
  type ClanMember,
  type Companion,
} from "../index.js";

function member(over: Partial<ClanMember> & { id: string; name: string }): ClanMember {
  return {
    gender: "m",
    birthYear: 1200,
    traits: [],
    skills: {},
    ...over,
  };
}

/** Four generations: Aldric/Ysolde -> Bram/Celine -> Dov/Elin -> Finn. */
function fourGenerations(): ClanMember[] {
  const aldric = member({ id: "aldric", name: "Aldric", birthYear: 1140, deathYear: 1190 });
  const ysolde = member({ id: "ysolde", name: "Ysolde", gender: "f", birthYear: 1142, deathYear: 1192, spouseId: "aldric" });
  aldric.spouseId = "ysolde";
  const bram = member({ id: "bram", name: "Bram", birthYear: 1165, fatherId: "aldric", motherId: "ysolde", spouseId: "celine" });
  const celine = member({ id: "celine", name: "Celine", gender: "f", birthYear: 1168, spouseId: "bram" });
  const dov = member({ id: "dov", name: "Dov", birthYear: 1190, fatherId: "bram", motherId: "celine", spouseId: "elin" });
  const elin = member({ id: "elin", name: "Elin", gender: "f", birthYear: 1192, spouseId: "dov" });
  const finn = member({ id: "finn", name: "Finn", birthYear: 1215, fatherId: "dov", motherId: "elin" });
  return [aldric, ysolde, bram, celine, dov, elin, finn];
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("family tree (task 76)", () => {
  it("renders 4 generations cleanly", () => {
    const tree = layoutFamilyTree(fourGenerations());
    expect(tree.generations).toBe(4);
    const rows = new Map<number, number[]>();
    for (const n of tree.nodes) {
      rows.set(n.generation, [...(rows.get(n.generation) ?? []), n.x]);
    }
    expect(rows.size).toBe(4);
    // No two nodes in the same row overlap (node half-width 60 + spouse nudge).
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThan(40);
      }
    }
    // Generations are ordered top to bottom.
    const byGen = [...rows.keys()].sort((a, b) => a - b);
    const ys = byGen.map((g) => tree.nodes.find((n) => n.generation === g)!.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]!);
  });

  it("viewer marks the dead and renders every member", () => {
    const el = createTreeViewer({ members: fourGenerations() });
    document.body.appendChild(el);
    expect(el.querySelectorAll(".clan-tree-node").length).toBe(7);
    expect(el.querySelectorAll(".clan-tree-node.is-dead").length).toBe(2);
  });
});

describe("marriage (task 77)", () => {
  const suitor = member({ id: "s", name: "Suitor" });
  const target = member({ id: "t", name: "Target", gender: "f" });

  it("shows odds before proposing", () => {
    const ctx = { relation: 40, rankDelta: 0, laws: DEFAULT_LAWS };
    const proposal = draftProposal(suitor, target, { coin: 500, land: [] }, ctx);
    expect(proposal.odds).toBeGreaterThan(0.5);
    expect(proposal.odds).toBeLessThanOrEqual(0.97);
    // Better dowry improves odds.
    const richer = marriageOdds(suitor, target, { coin: 9000, land: [] }, ctx);
    expect(richer).toBeGreaterThan(proposal.odds);
  });

  it("resolves proposals against the odds deterministically", () => {
    const p = draftProposal(suitor, target, { coin: 0, land: [] }, { relation: 0, rankDelta: 0, laws: DEFAULT_LAWS });
    expect(propose(p, () => 0)).toBe(true);
    expect(propose(p, () => 0.999)).toBe(false);
  });
});

describe("education (task 78)", () => {
  it("skills grow over seasons with a tutor", () => {
    const child = member({ id: "child", name: "Child", birthYear: 1210, skills: { sword: 10 } });
    const tutor = member({ id: "tutor", name: "Tutor", birthYear: 1180, skills: { sword: 90 } });
    const ed = createEducation([child, tutor]);
    assignTutor(ed, { childId: "child", tutorId: "tutor", skill: "sword" });
    let total = 0;
    for (let year = 1216; year < 1220; year++) {
      for (const r of tickSeason(ed, year)) total += r.gained;
    }
    expect(total).toBeGreaterThan(0);
    expect(child.skills.sword).toBeGreaterThan(10);
    expect(child.skills.sword).toBeLessThanOrEqual(90);
  });
});

describe("succession (tasks 79, 80, 82)", () => {
  function rulerWithKids(): ClanMember[] {
    const ruler = member({ id: "ruler", name: "Ruler", birthYear: 1150 });
    const a = member({ id: "kid-a", name: "Eldest", birthYear: 1175, fatherId: "ruler", skills: { war: 20 } });
    const b = member({ id: "kid-b", name: "Middle", birthYear: 1180, fatherId: "ruler", skills: { war: 60 } });
    const c = member({ id: "kid-c", name: "Youngest", birthYear: 1185, fatherId: "ruler", skills: { war: 40 } });
    return [ruler, a, b, c];
  }

  it("laws change who inherits", () => {
    const fam = rulerWithKids();
    const holdings = ["keep", "mill", "port"];
    const primo = successionPreview("ruler", fam, { ...DEFAULT_LAWS, inheritance: "primogeniture" }, holdings);
    expect(primo.heirId).toBe("kid-a");
    const ultimo = successionPreview("ruler", fam, { ...DEFAULT_LAWS, inheritance: "ultimogeniture" }, holdings);
    expect(ultimo.heirId).toBe("kid-c");
    const elective = successionPreview("ruler", fam, { ...DEFAULT_LAWS, inheritance: "elective" }, holdings);
    expect(elective.heirId).toBe("kid-b"); // most skilled
  });

  it("partible law splits the realm", () => {
    const fam = rulerWithKids();
    const holdings = ["keep", "mill", "port"];
    const preview = successionPreview("ruler", fam, { ...DEFAULT_LAWS, inheritance: "partible" }, holdings);
    const holders = new Set(Object.values(preview.split));
    expect(holders.size).toBe(3); // realm split among the three children
  });

  it("a crisis with 4 claimants resolves", () => {
    const fam = rulerWithKids();
    const fourth = member({ id: "kid-d", name: "Cousin", birthYear: 1178, fatherId: "ruler" });
    const crisis = startSuccessionCrisis(["kid-a", "kid-b", "kid-c", "kid-d"], [...fam, fourth]);
    let winner: string | null = null;
    let guard = 0;
    while (!winner && guard++ < 8) {
      const choices = crisis.choices();
      winner = crisis.choose(choices[0]!.id).winnerId;
    }
    expect(winner).not.toBeNull();
    expect(["kid-a", "kid-b", "kid-c", "kid-d"]).toContain(winner);
  });
});

describe("banner designer (task 81)", () => {
  it("renders the chosen colors, pattern, and sigil", () => {
    const svg = bannerSvg({ primary: "#8c1f28", secondary: "#e8e4da", pattern: "cross", sigil: "star" });
    expect(svg).toContain("#8c1f28");
    expect(svg).toContain("#e8e4da");
    expect(svg).toContain("<path");
  });

  it("applies through the narrow target interface", () => {
    let received = "";
    applyBanner({ setBanner: (s) => { received = s; } }, { primary: "#1f4d8c", secondary: "#e8e4da", pattern: "halved", sigil: "tower" });
    expect(received).toContain("#1f4d8c");
  });
});

describe("companions (task 83)", () => {
  it("assigned companions grant party bonuses", () => {
    const c: Companion = { ...member({ id: "comp", name: "Sable" }), loyalty: 80, skills: { scouting: 80 } };
    const assigned = assignCompanion(c, "party-1", "scout");
    const bonus = companionBonus(assigned)!;
    expect(bonus.partyId).toBe("party-1");
    expect(bonus.magnitude).toBeCloseTo(0.8, 5);
    expect(bonus.description).toContain("sight range");
  });

  it("unassigned companions grant nothing", () => {
    const c: Companion = { ...member({ id: "comp", name: "Sable" }), loyalty: 80, skills: {} };
    expect(companionBonus(c)).toBeNull();
  });
});

describe("loyalty (task 84)", () => {
  it("low loyalty triggers warnings, critical triggers events", () => {
    const ok: Companion = { ...member({ id: "c1", name: "A" }), loyalty: 80, skills: {} };
    const low: Companion = { ...member({ id: "c2", name: "B" }), loyalty: 25, skills: {} };
    const critical: Companion = { ...member({ id: "c3", name: "C" }), loyalty: 10, skills: {} };
    expect(loyaltyAlerts(ok)).toEqual([]);
    expect(loyaltyAlerts(low)[0]!.level).toBe("warning");
    expect(loyaltyAlerts(critical)[0]!.level).toBe("critical");
  });

  it("influence moves loyalty with diminishing returns at the top", () => {
    const c: Companion = { ...member({ id: "c", name: "D" }), loyalty: 90, skills: {} };
    const gifted = influenceLoyalty(c, "gift");
    expect(gifted.loyalty).toBe(94); // 8 halved above 80
    const scolded = influenceLoyalty(c, "reprimand");
    expect(scolded.loyalty).toBe(80);
  });
});
