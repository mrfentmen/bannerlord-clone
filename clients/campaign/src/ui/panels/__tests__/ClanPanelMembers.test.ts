/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createClanPanel } from "../ClanPanel.js";
import { loadClanStore, setRuler, upsertMember } from "../../../clan/store.js";
import type { ClanMember } from "../../../clan/types.js";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function member(overrides: Partial<ClanMember> = {}): ClanMember {
  return {
    id: "m1",
    name: "Ada Okonjo",
    gender: "f",
    birthYear: 1970,
    traits: [],
    skills: {},
    ...overrides,
  };
}

function build(options: Parameters<typeof createClanPanel>[0] = {}) {
  const handle = createClanPanel(options);
  document.body.appendChild(handle.root);
  return handle;
}

function rows(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>(".clan-member")];
}

describe("clan panel member list (task 248)", () => {
  it("says nobody is in the clan when the store holds nobody", () => {
    build();
    const section = document.body.querySelector('[data-testid="clan-members"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("Nobody is in the clan yet");
  });

  it("lists every member the store holds", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo" }));
    upsertMember(member({ id: "b", name: "Teodor Brekke", birthYear: 1962 }));
    build();
    expect(rows()).toHaveLength(2);
    expect(document.body.textContent).toContain("Ada Okonjo");
    expect(document.body.textContent).toContain("Teodor Brekke");
  });

  it("puts the living first and the dead after, so the list is not longer than it is", () => {
    upsertMember(member({ id: "young", name: "Nadia Vance", birthYear: 2001 }));
    upsertMember(member({ id: "old", name: "Ibrahim Sadiq", birthYear: 1940, deathYear: 1998 }));
    build();
    expect(rows().map((r) => r.getAttribute("data-testid"))).toEqual([
      "clan-member-young",
      "clan-member-old",
    ]);
  });

  it("orders each group oldest first, which is the order succession reads", () => {
    upsertMember(member({ id: "c", name: "C", birthYear: 1990 }));
    upsertMember(member({ id: "a", name: "A", birthYear: 1950 }));
    upsertMember(member({ id: "b", name: "B", birthYear: 1970 }));
    build();
    expect(rows().map((r) => r.textContent?.split("aged|scouting|")[0]?.trim().slice(0, 1))).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("marks the ruler from the store's own rulerId", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo" }));
    upsertMember(member({ id: "b", name: "Teodor Brekke" }));
    setRuler("a");
    build();
    expect(document.body.querySelector('[data-testid="clan-member-a"]')!.textContent).toContain("Ruler");
    expect(document.body.querySelector('[data-testid="clan-member-b"]')!.textContent).not.toContain("Ruler");
  });

  it("marks a dead member with the year, as a word as well as the greyed badge", () => {
    upsertMember(member({ id: "old", name: "Ibrahim Sadiq", deathYear: 1998 }));
    build();
    const row = document.body.querySelector('[data-testid="clan-member-old"]')!;
    expect(row.getAttribute("data-living")).toBe("false");
    expect(row.textContent).toContain("died 1998");
  });

  it("prints an age only when the caller supplies the year", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo", birthYear: 1970 }));
    build({ year: 2030 });
    expect(document.body.querySelector('[data-testid="clan-member-a"]')!.textContent).toContain("aged 60");
  });

  it("prints no age at all without a year, rather than guessing one", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo", birthYear: 1970 }));
    build();
    const row = document.body.querySelector('[data-testid="clan-member-a"]')!;
    expect(row.textContent).not.toContain("aged");
    expect(row.textContent).not.toMatch(/\b\d\d\b/);
  });

  it("shows the member's best recorded skill at face value", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo", skills: { scouting: 41, stewardship: 78 } }));
    build();
    const row = document.body.querySelector('[data-testid="clan-member-a"]')!;
    expect(row.textContent).toContain("stewardship 78");
    expect(row.textContent).not.toContain("scouting 41");
  });

  it("does not name a skill the member has none of", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo", skills: { scouting: 0 } }));
    build();
    expect(document.body.querySelector('[data-testid="clan-member-a"]')!.textContent).not.toContain("scouting");
  });

  it("lists the traits the store records", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo", traits: ["reads contracts", "keeps a grudge"] }));
    build();
    expect(document.body.querySelector('[data-testid="clan-member-a"]')!.textContent).toContain(
      "reads contracts, keeps a grudge",
    );
  });

  it("reads the roster through the store, so a re-open picks up a new member", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo" }));
    const first = build();
    expect(first.root.querySelectorAll(".clan-member")).toHaveLength(1);
    first.destroy();

    upsertMember(member({ id: "b", name: "Teodor Brekke" }));
    const second = build();
    expect(second.root.querySelectorAll(".clan-member")).toHaveLength(2);
  });

  it("points at the succession law rather than naming an heir it cannot know", () => {
    upsertMember(member({ id: "a", name: "Ada Okonjo" }));
    build();
    expect(document.body.querySelector('[data-testid="clan-member-note"]')!.textContent).toContain(
      "succession law",
    );
  });

  it("matches the store's own roster length", () => {
    upsertMember(member({ id: "a" }));
    upsertMember(member({ id: "b" }));
    upsertMember(member({ id: "c", deathYear: 1990 }));
    build();
    expect(rows()).toHaveLength(loadClanStore().members.length);
  });
});