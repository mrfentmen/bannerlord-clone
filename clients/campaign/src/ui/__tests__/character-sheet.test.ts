/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  MODERN_ATTRIBUTES,
  MODERN_SKILLS,
  buildSkillList,
  createCharacterSheet,
  deserializeCharacterRecord,
  serializeCharacterRecord,
  type CharacterRecord,
  type CharacterSheetCallbacks,
} from "../character-sheet.js";

function makeRecord(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    version: 1,
    id: "char-1",
    name: "Del",
    culture: "Ironhold",
    background: "Street kid",
    dayCreated: 3,
    attributes: MODERN_ATTRIBUTES.map((a, i) => ({ ...a, value: 2 + i })),
    skills: buildSkillList(MODERN_SKILLS, {
      rifles: { level: 2, xp: 40, xpForNext: 100 },
    }),
    traits: [
      {
        id: "night-owl",
        name: "Night Owl",
        description: "Sharp after dark, slow in the morning.",
        positive: ["+2 Scouting at night"],
        negative: ["-1 Athletics before noon"],
      },
    ],
    renown: 120,
    influence: 45,
    relations: [{ entityId: "boss-mara", entityName: "Mara Voss", value: 30 }],
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<CharacterSheetCallbacks> = {}): CharacterSheetCallbacks {
  return {
    onSelectPerk: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("character record persistence (task 95)", () => {
  it("survives a serialize/deserialize round-trip, perks included", () => {
    const record = makeRecord();
    record.skills[1]!.chosenPerks.push("rifle-perk-a");
    const restored = deserializeCharacterRecord(serializeCharacterRecord(record));
    expect(restored).toEqual(record);
  });

  it("rejects corrupt JSON", () => {
    expect(() => deserializeCharacterRecord("not json")).toThrow(/valid JSON/);
  });

  it("rejects an unknown version", () => {
    expect(() => deserializeCharacterRecord(JSON.stringify({ version: 99 }))).toThrow(/unknown version/);
  });
});

describe("attributes (task 96)", () => {
  it("renders all six attributes with values and modifier tooltips", () => {
    const cb = makeCallbacks();
    const sheet = createCharacterSheet(makeRecord(), cb);
    try {
      for (const attr of MODERN_ATTRIBUTES) {
        const el = sheet.root.querySelector(`[data-testid="attr-${attr.id}"]`);
        expect(el, `attribute ${attr.id}`).not.toBeNull();
        expect(el!.textContent).toContain(attr.name);
        expect(el!.getAttribute("title")).toBe(attr.modifierText);
      }
    } finally {
      sheet.destroy();
    }
  });
});

describe("skills (task 97)", () => {
  it("renders all eighteen skills with levels and XP bars", () => {
    const cb = makeCallbacks();
    const sheet = createCharacterSheet(makeRecord(), cb);
    try {
      expect(MODERN_SKILLS).toHaveLength(18);
      for (const def of MODERN_SKILLS) {
        const el = sheet.root.querySelector(`[data-testid="skill-${def.id}"]`);
        expect(el, `skill ${def.id}`).not.toBeNull();
        const bar = el!.querySelector('[role="progressbar"]');
        expect(bar, `xp bar for ${def.id}`).not.toBeNull();
      }
    } finally {
      sheet.destroy();
    }
  });

  it("animates a skill row when update() raises its level", () => {
    const cb = makeCallbacks();
    const before = makeRecord();
    const sheet = createCharacterSheet(before, cb);
    try {
      const after = makeRecord();
      const rifles = after.skills.find((s) => s.id === "rifles")!;
      rifles.level = 3;
      sheet.update(after);
      const el = sheet.root.querySelector('[data-testid="skill-rifles"]');
      expect(el!.className).toContain("character-skill--leveled");
      expect(el!.textContent).toContain("Lv 3");
    } finally {
      sheet.destroy();
    }
  });
});

describe("perk selection (task 98)", () => {
  it("shows perk choices for a skill with a pending level-up", () => {
    const record = makeRecord();
    const rifles = record.skills.find((s) => s.id === "rifles")!;
    rifles.pendingLevelUps = 1;
    rifles.perkOptions = [
      { id: "rifle-a", name: "Steady Hands", description: "Less spread while crouched." },
      { id: "rifle-b", name: "Fast Hands", description: "Reload 15 percent faster." },
    ];
    const cb = makeCallbacks();
    const sheet = createCharacterSheet(record, cb);
    try {
      expect(sheet.root.querySelector('[data-testid="perk-rifle-a"]')).not.toBeNull();
      expect(sheet.root.querySelector('[data-testid="perk-rifle-b"]')).not.toBeNull();
      const btn = sheet.root.querySelector('[data-testid="take-perk-rifle-a"]') as HTMLButtonElement;
      btn.click();
      expect(cb.onSelectPerk).toHaveBeenCalledWith("rifles", "rifle-a");
    } finally {
      sheet.destroy();
    }
  });

  it("marks already-taken perks as taken", () => {
    const record = makeRecord();
    const rifles = record.skills.find((s) => s.id === "rifles")!;
    rifles.pendingLevelUps = 1;
    rifles.chosenPerks = ["rifle-a"];
    rifles.perkOptions = [{ id: "rifle-a", name: "Steady Hands", description: "Less spread while crouched." }];
    const cb = makeCallbacks();
    const sheet = createCharacterSheet(record, cb);
    try {
      const btn = sheet.root.querySelector('[data-testid="take-perk-rifle-a"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain("Taken");
    } finally {
      sheet.destroy();
    }
  });
});

describe("traits (task 99)", () => {
  it("lists each trait's positive and negative effects", () => {
    const cb = makeCallbacks();
    const sheet = createCharacterSheet(makeRecord(), cb);
    try {
      const el = sheet.root.querySelector('[data-testid="trait-night-owl"]');
      expect(el).not.toBeNull();
      expect(el!.textContent).toContain("Night Owl");
      expect(el!.textContent).toContain("+2 Scouting at night");
      expect(el!.textContent).toContain("-1 Athletics before noon");
      expect(el!.textContent).toContain("positive");
      expect(el!.textContent).toContain("negative");
    } finally {
      sheet.destroy();
    }
  });
});

describe("standing summary (task 100)", () => {
  it("shows renown, influence, and relations from the sim snapshot", () => {
    const cb = makeCallbacks();
    const sheet = createCharacterSheet(makeRecord(), cb);
    try {
      expect(sheet.root.querySelector('[data-testid="renown-value"]')!.textContent).toBe("120");
      expect(sheet.root.querySelector('[data-testid="influence-value"]')!.textContent).toBe("45");
      const rel = sheet.root.querySelector('[data-testid="relation-boss-mara"]');
      expect(rel).not.toBeNull();
      expect(rel!.textContent).toContain("Mara Voss");
      expect(rel!.textContent).toContain("30");
    } finally {
      sheet.destroy();
    }
  });
});
