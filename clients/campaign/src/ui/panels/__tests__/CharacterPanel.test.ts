/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { characterPanel } from "../CharacterPanel.js";

const character = {
  characterName: "Del",
  age: 35,
  ethnicityId: "american",
  biography: "A warlord from the streets.",
  attributes: { vigor: 5, control: 4 },
  skills: { leadership: 3, tactics: 2 },
  influence: 100,
  renown: 250,
  factionId: "f1",
};

describe("character panel", () => {
  it("shows the character's name, age and culture", () => {
    const root = characterPanel({ character });
    expect(root.querySelector('[data-testid="char-name"]')!.textContent).toBe("Del");
    expect(root.querySelector('[data-testid="char-age"]')!.textContent).toBe("35");
    expect(root.querySelector('[data-testid="char-ethnicity"]')!.textContent).toBe("american");
    expect(root.querySelector('[data-testid="char-faction"]')!.textContent).toBe("f1");
  });

  it("shows renown and influence", () => {
    const root = characterPanel({ character });
    expect(root.querySelector('[data-testid="char-renown"]')!.textContent).toBe("250");
    expect(root.querySelector('[data-testid="char-influence"]')!.textContent).toBe("100");
  });

  it("prints the biography verbatim", () => {
    const root = characterPanel({ character });
    expect(root.querySelector('[data-testid="char-biography"]')!.textContent).toBe(
      "A warlord from the streets.",
    );
  });

  it("lists attributes and skills", () => {
    const root = characterPanel({ character });
    expect(root.querySelector('[data-testid="char-attr-vigor"]')!.textContent).toBe("5");
    expect(root.querySelector('[data-testid="char-skill-leadership"]')!.textContent).toBe("3");
  });

  it("says so plainly when there is no character", () => {
    const root = characterPanel({ character: null });
    expect(root.textContent).toContain("No character.");
  });
});
