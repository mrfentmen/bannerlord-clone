/**
 * @vitest-environment jsdom
 *
 * The character maker's attribute and skill steps, and the sheet it hands the
 * campaign.
 *
 * The maker had no tests at all before this. It is the first thing a player sees
 * after faction select and the last thing that writes a character, so the two
 * allocation steps and the payload are worth pinning: a step that renders the
 * wrong number of rows, or a finish that quietly drops a field, both fail
 * silently at the start of a campaign rather than in a panel somebody is looking
 * at.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { BONUS_POINTS_TOTAL, characterMaker } from "../CharacterMaker.js";
import {
  ATTRIBUTES,
  ATTRIBUTE_IDS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  ATTRIBUTE_POINTS_TOTAL,
  FOCUS_POINT_XP,
  SKILLS,
  SKILL_IDS,
  startingSkillLevels,
} from "../../../data/attributes.js";
import type { GameCharacter } from "../../../data/backgrounds.js";
import type { WorldSettlement } from "../../../world/types.js";

/** The nine steps, in order. */
const STEPS = [
  "Name",
  "Appearance",
  "Age",
  "Home",
  "Difficulty",
  "Background",
  "Attributes",
  "Skills",
  "Review",
] as const;

const HOME_STEP = 3;

/** A real-shaped settlement for the home resolver, population and all. */
function place(over: Partial<WorldSettlement> & { name: string }): WorldSettlement {
  const { name, ...rest } = over;
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    place: "city",
    lat: 0,
    lon: 0,
    population: 1000,
    populationSource: "U.S. Census Bureau",
    state: null,
    stateCode: null,
    osmPopulation: null,
    ...rest,
  };
}

const ATTRIBUTES_STEP = 6;
const SKILLS_STEP = 7;
const REVIEW_STEP = 8;

beforeEach(() => {
  document.body.innerHTML = "";
});

interface Maker {
  root: HTMLElement;
  /** The character the maker handed over, once `done()` has been pressed. */
  complete: () => GameCharacter | null;
}

/** Builds the maker with a name already filled in, so step 0 can be left. */
function build(options: {
  bonusPointsTotal?: number;
  side?: { id: string; name: string; stateCodes: readonly string[] };
  stateCode?: string;
  settlements?: WorldSettlement[];
} = {}): Maker {
  let character: GameCharacter | null = null;
  const root = characterMaker({
    ...(options.bonusPointsTotal === undefined ? {} : { bonusPointsTotal: options.bonusPointsTotal }),
    ...(options.side === undefined ? {} : { side: options.side }),
    ...(options.stateCode === undefined ? {} : { stateCode: options.stateCode }),
    ...(options.settlements === undefined ? {} : { settlements: options.settlements }),
    onComplete: (c) => {
      character = c;
    },
    onCancel: () => {},
  });
  document.body.appendChild(root);
  return { root, complete: () => character };
}

function q<T extends HTMLElement>(root: HTMLElement, testid: string): T {
  const el = root.querySelector<T>(`[data-testid="${testid}"]`);
  if (el === null) throw new Error(`no element with data-testid="${testid}"`);
  return el;
}

function click(root: HTMLElement, testid: string): void {
  const el = root.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);
  if (el === null) throw new Error(`no button with data-testid="${testid}"`);
  el.click();
}

function text(root: HTMLElement, testid: string): string {
  return q(root, testid).textContent ?? "";
}

/** Names the character and walks to `target`, clicking Next on every step before it. */
function walkTo(root: HTMLElement, target: number): void {
  (root.querySelector('[data-testid="char-first-name"]') as HTMLInputElement).value = "Wren";
  (root.querySelector('[data-testid="char-first-name"]') as HTMLInputElement).dispatchEvent(
    new Event("input", { bubbles: true }),
  );
  (root.querySelector('[data-testid="char-last-name"]') as HTMLInputElement).value = "Calloway";
  (root.querySelector('[data-testid="char-last-name"]') as HTMLInputElement).dispatchEvent(
    new Event("input", { bubbles: true }),
  );
  for (let step = 0; step < target; step += 1) {
    const next = root.querySelector<HTMLButtonElement>('[data-testid="maker-next"]');
    if (next === null) throw new Error(`step ${step} has no Next button`);
    if (next.disabled) throw new Error(`Next was disabled on step ${step}, cannot reach ${target}`);
    next.click();
  }
}

describe("character maker steps", () => {
  it("offers attributes and skills as their own steps", () => {
    const { root } = build();
    const labels = [...root.querySelectorAll(".stepbar__step")].map((b) => b.textContent ?? "");
    expect(labels).toHaveLength(9);
    for (const [i, name] of STEPS.entries()) {
      expect(labels[i], `step ${i}`).toContain(name);
    }
    expect(labels[ATTRIBUTES_STEP]).toContain("Attributes");
    expect(labels[SKILLS_STEP]).toContain("Skills");
    expect(labels[REVIEW_STEP]).toContain("Review");
  });

  it("walks from the name step to the review step one Next at a time", () => {
    const { root } = build();
    walkTo(root, REVIEW_STEP);
    expect(root.querySelector('[data-testid="char-review"]')).not.toBeNull();
    // The review step finishes rather than advancing, so there is no Next.
    expect(root.querySelector('[data-testid="maker-done"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="maker-next"]')).toBeNull();
  });

  it("derives the home town from the side and the heritage", () => {
    const settlements = [
      place({ name: "New York City", state: "New York", stateCode: "NY", population: 8_804_190 }),
      place({ name: "Columbus", state: "Ohio", stateCode: "OH", population: 913_175 }),
      place({ name: "Los Angeles", state: "California", stateCode: "CA", population: 3_898_747 }),
    ];
    // Default heritage is Italian-American, whose strongest real concentration is
    // New York; the side's states are the constraint that picks the state.
    const maker = build({
      side: { id: "atlantic-corridor", name: "Atlantic Corridor", stateCodes: ["NY", "PA"] },
      settlements,
    });
    walkTo(maker.root, HOME_STEP);
    expect(q(maker.root, "home-card").textContent).toContain("New York City");
    expect(text(maker.root, "home-reason")).toContain("New York");
  });

  it("hands the campaign the home town's simulation slug rather than a display name", () => {
    const settlements = [
      place({ name: "New York City", state: "New York", stateCode: "NY", population: 8_804_190 }),
    ];
    const maker = build({
      side: { id: "atlantic-corridor", name: "Atlantic Corridor", stateCodes: ["NY"] },
      settlements,
    });
    walkTo(maker.root, HOME_STEP);
    for (let i = HOME_STEP; i < REVIEW_STEP; i += 1) click(maker.root, "maker-next");
    expect(text(maker.root, "review-home-reason")).toContain("New York");
    click(maker.root, "maker-done");
    expect(maker.complete()!.startCity).toBe("new-york-city");
  });

  it("says so honestly when no mapped settlement fits the side", () => {
    const maker = build();
    walkTo(maker.root, HOME_STEP);
    expect(q(maker.root, "home-missing")).toBeTruthy();
  });

  it("keeps the review open and allows retry when starting the campaign fails", async () => {
    let attempts = 0;
    const root = characterMaker({
      onComplete: async () => {
        attempts += 1;
        throw Object.assign(new Error("internal detail"), { playerMessage: "The simulation is not answering." });
      },
      onCancel: () => {},
    });
    document.body.appendChild(root);
    walkTo(root, REVIEW_STEP);

    click(root, "maker-done");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(q(root, "maker-start-error").textContent).toContain("The simulation is not answering.");
    expect(root.querySelector('[data-testid="char-review"]')).not.toBeNull();
    expect(q<HTMLButtonElement>(root, "maker-done").disabled).toBe(false);
    click(root, "maker-done");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(attempts).toBe(2);
  });
});

describe("attribute step", () => {
  it("shows the six attributes and starts on a complete sheet", () => {
    const { root } = build();
    walkTo(root, ATTRIBUTES_STEP);

    for (const attribute of ATTRIBUTES) {
      expect(q(root, `attr-${attribute.id}-value`), attribute.id).not.toBeNull();
      expect(q(root, `attr-${attribute.id}-plus`), attribute.id).not.toBeNull();
      expect(q(root, `attr-${attribute.id}-minus`), attribute.id).not.toBeNull();
    }
    const total = ATTRIBUTE_IDS.reduce((sum, id) => sum + Number(text(root, `attr-${id}-value`)), 0);
    expect(total).toBe(ATTRIBUTE_POINTS_TOTAL);
    expect(text(root, "attribute-points-remaining")).toContain(`0 of ${ATTRIBUTE_POINTS_TOTAL}`);
  });

  it("names the three skills each attribute governs", () => {
    const { root } = build();
    walkTo(root, ATTRIBUTES_STEP);
    const row = q(root, "attr-vigor-value").closest(".attr-row");
    expect(row?.textContent).toContain("Vigor");
    expect(row?.textContent).toContain("One-Handed");
    expect(row?.textContent).toContain("Two-Handed");
    expect(row?.textContent).toContain("Polearm");
  });

  it("opens with the budget already spent, so raising needs a point freed first", () => {
    const { root } = build();
    walkTo(root, ATTRIBUTES_STEP);

    expect(text(root, "attr-vigor-value")).toBe("5");
    expect(text(root, "attribute-points-remaining")).toContain(`0 of ${ATTRIBUTE_POINTS_TOTAL}`);
    // Every plus is shut: thirty are already placed and there is nothing to take.
    for (const id of ATTRIBUTE_IDS) {
      const plus = root.querySelector<HTMLButtonElement>(`[data-testid="attr-${id}-plus"]`);
      expect(plus?.disabled, id).toBe(true);
    }
  });

  it("moves a point between attributes and keeps the total honest", () => {
    const { root } = build();
    walkTo(root, ATTRIBUTES_STEP);

    click(root, "attr-cunning-minus");
    expect(text(root, "attr-cunning-value")).toBe("4");
    expect(text(root, "attribute-points-remaining")).toContain(`1 of ${ATTRIBUTE_POINTS_TOTAL}`);

    // Now there is a point to move, and it goes to exactly one attribute.
    click(root, "attr-intelligence-plus");
    expect(text(root, "attr-intelligence-value")).toBe("6");
    expect(text(root, "attribute-points-remaining")).toContain(`0 of ${ATTRIBUTE_POINTS_TOTAL}`);
    expect(text(root, "attr-cunning-value")).toBe("4");
    expect(root.querySelector<HTMLButtonElement>('[data-testid="attr-intelligence-plus"]')?.disabled).toBe(true);
  });

  it("will not take an attribute below its floor or above its ceiling", () => {
    const { root } = build();
    walkTo(root, ATTRIBUTES_STEP);

    // Pressing minus far past the floor is refused rather than wrapped.
    const minus = root.querySelector<HTMLButtonElement>('[data-testid="attr-social-minus"]');
    for (let i = 0; i < ATTRIBUTE_POINTS_TOTAL; i += 1) minus?.click();
    expect(text(root, "attr-social-value")).toBe(String(ATTRIBUTE_MIN));

    // Two freed points is two raises, not thirty: the budget is what bounds it.
    const plus = root.querySelector<HTMLButtonElement>('[data-testid="attr-vigor-plus"]');
    for (let i = 0; i < ATTRIBUTE_POINTS_TOTAL; i += 1) plus?.click();
    expect(text(root, "attr-vigor-value")).toBe("7");
    expect(text(root, "attribute-points-remaining")).toContain(`0 of ${ATTRIBUTE_POINTS_TOTAL}`);

    // And the ceiling refuses a point freed from elsewhere.
    click(root, "attr-social-minus");
    click(root, "attr-control-minus");
    click(root, "attr-endurance-minus");
    click(root, "attr-vigor-plus");
    expect(text(root, "attr-vigor-value")).toBe(String(ATTRIBUTE_MAX));
    expect(root.querySelector<HTMLButtonElement>('[data-testid="attr-vigor-plus"]')?.disabled).toBe(true);
  });

  it("cannot be left with the budget unspent", () => {
    const { root } = build();
    walkTo(root, ATTRIBUTES_STEP);
    const isNextDisabled = (): boolean | undefined =>
      root.querySelector<HTMLButtonElement>('[data-testid="maker-next"]')?.disabled;

    // Free a point without spending it: the sheet is 29 of 30 and Next is closed.
    click(root, "attr-cunning-minus");
    expect(text(root, "attribute-points-remaining")).toContain(`1 of ${ATTRIBUTE_POINTS_TOTAL}`);
    expect(isNextDisabled()).toBe(true);

    // Putting it back reopens it, which proves the gate reads the sheet and is
    // not stuck closed. The button is re-read each time: every click re-renders the
    // nav, so a node captured before a click is a detached one.
    click(root, "attr-cunning-plus");
    expect(isNextDisabled()).toBe(false);
  });
});

describe("skill step", () => {
  it("shows all eighteen skills with the attribute that governs each", () => {
    const { root } = build();
    walkTo(root, SKILLS_STEP);

    for (const skill of SKILLS) {
      expect(q(root, `skill-${skill.id}-value`), skill.id).not.toBeNull();
    }
    const rendered = root.querySelectorAll('[data-testid^="skill-"][data-testid$="-value"]');
    expect(rendered).toHaveLength(18);
    expect(q(root, "skills-list")).toBeTruthy();

    const tradeRow = q(root, "skill-trade-value").closest(".attr-row");
    expect(tradeRow?.textContent).toContain("Trade");
    expect(tradeRow?.textContent).toContain("Social");
  });

  it("starts on the focus budget unspent", () => {
    const { root } = build();
    walkTo(root, SKILLS_STEP);
    expect(text(root, "focus-points-remaining")).toContain(`${BONUS_POINTS_TOTAL} of ${BONUS_POINTS_TOTAL}`);
    for (const id of SKILL_IDS) expect(text(root, `skill-${id}-value`), id).toBe("0");
  });

  it("spends a focus point on one skill and shows the level it buys", () => {
    const { root } = build();
    walkTo(root, SKILLS_STEP);

    // Every skill's level before the click, so "nothing else moved" is a real
    // assertion rather than a hand-written copy of the expected numbers.
    const levelsBefore = new Map(SKILL_IDS.map((id) => [id, levelShown(rowText(root, `skill-${id}`))]));
    expect(perksShown(rowText(root, "skill-trade"))).toBe("0 of 8 perks");

    click(root, "skill-trade-plus");
    expect(text(root, "skill-trade-value")).toBe("1");
    expect(text(root, "focus-points-remaining")).toContain(
      `${BONUS_POINTS_TOTAL - 1} of ${BONUS_POINTS_TOTAL}`,
    );

    // The level moved by exactly one focus point's worth, which from the starting
    // spread is enough to cross the first perk threshold.
    const after = levelShown(rowText(root, "skill-trade"));
    expect(after).toBe(levelsBefore.get("trade")! + FOCUS_POINT_XP);
    expect(perksShown(rowText(root, "skill-trade"))).toBe("1 of 8 perks");

    // The other seventeen are untouched, including the two that share Trade's
    // governing attribute and the two that share each other's.
    for (const id of SKILL_IDS) {
      if (id === "trade") continue;
      expect(levelShown(rowText(root, `skill-${id}`)), id).toBe(levelsBefore.get(id));
    }
  });

  it("will not spend more than the budget and can take a point back", () => {
    const { root } = build({ bonusPointsTotal: 3 });
    walkTo(root, SKILLS_STEP);

    for (let i = 0; i < 10; i += 1) click(root, "skill-medicine-plus");
    expect(text(root, "skill-medicine-value")).toBe("3");
    expect(text(root, "focus-points-remaining")).toContain("0 of 3");
    expect(root.querySelector<HTMLButtonElement>('[data-testid="skill-medicine-plus"]')?.disabled).toBe(true);
    // Nothing else can take one either.
    expect(root.querySelector<HTMLButtonElement>('[data-testid="skill-trade-plus"]')?.disabled).toBe(true);

    click(root, "skill-medicine-minus");
    expect(text(root, "skill-medicine-value")).toBe("2");
    expect(root.querySelector<HTMLButtonElement>('[data-testid="skill-trade-plus"]')?.disabled).toBe(false);
  });

  it("may be left with points unspent rather than trapping the player", () => {
    const { root } = build();
    walkTo(root, SKILLS_STEP);
    // Unspent focus is allowed; requiring it would mean a player who wants to skip
    // has to invent five reasons to spend points.
    expect(text(root, "focus-points-remaining")).toContain(`${BONUS_POINTS_TOTAL} of ${BONUS_POINTS_TOTAL}`);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="maker-next"]')?.disabled).toBe(false);
  });

  it("gives a New Game+ heir the larger budget it was promised", () => {
    const base = build();
    walkTo(base.root, SKILLS_STEP);
    expect(text(base.root, "focus-points-remaining")).toContain(`${BONUS_POINTS_TOTAL} of ${BONUS_POINTS_TOTAL}`);

    // main.ts passes BONUS_POINTS_TOTAL + ngplusRecord.bonusPoints.
    const heir = build({ bonusPointsTotal: BONUS_POINTS_TOTAL + 2 });
    walkTo(heir.root, SKILLS_STEP);
    expect(text(heir.root, "focus-points-remaining")).toContain(`${BONUS_POINTS_TOTAL + 2} of ${BONUS_POINTS_TOTAL + 2}`);
    for (let i = 0; i < BONUS_POINTS_TOTAL + 2; i += 1) click(heir.root, "skill-roguery-plus");
    expect(text(heir.root, "skill-roguery-value")).toBe(String(BONUS_POINTS_TOTAL + 2));
  });
});

describe("review and the character the campaign receives", () => {
  it("prints the six attributes and the eighteen skills", () => {
    const { root } = build();
    walkTo(root, REVIEW_STEP);

    for (const attribute of ATTRIBUTES) {
      expect(text(root, `review-attribute-${attribute.id}`)).toContain(attribute.name);
    }
    expect(root.querySelectorAll('[data-testid^="review-skill-"]')).toHaveLength(18);
    expect(text(root, "review-skill-medicine")).toContain("Medicine");
    // Each row says how far along the perk track it is.
    expect(text(root, "review-skill-medicine")).toContain("of 8 perks");
  });

  it("hands the campaign the attributes, the focus, and the background choices", () => {
    const maker = build();
    walkTo(maker.root, ATTRIBUTES_STEP);
    // Every raise needs a freed point, so each one is preceded by a lower.
    click(maker.root, "attr-cunning-minus");
    click(maker.root, "attr-intelligence-plus");
    click(maker.root, "attr-cunning-minus");
    click(maker.root, "attr-intelligence-plus");
    click(maker.root, "attr-social-minus");
    click(maker.root, "attr-intelligence-plus");
    click(maker.root, "attr-endurance-minus");
    click(maker.root, "attr-vigor-plus");

    click(maker.root, "maker-next");
    click(maker.root, "skill-medicine-plus");
    click(maker.root, "skill-medicine-plus");
    click(maker.root, "skill-trade-plus");
    click(maker.root, "maker-next");
    click(maker.root, "maker-done");

    const character = maker.complete();
    expect(character).not.toBeNull();
    const sheet = character!;

    expect(Object.keys(sheet.attributes).sort()).toEqual([...ATTRIBUTE_IDS].sort());
    expect(sheet.attributes.vigor).toBe(6);
    expect(sheet.attributes.control).toBe(5);
    expect(sheet.attributes.endurance).toBe(4);
    expect(sheet.attributes.cunning).toBe(3);
    expect(sheet.attributes.social).toBe(4);
    expect(sheet.attributes.intelligence).toBe(8);
    expect(Object.values(sheet.attributes).reduce((a, b) => a + b, 0)).toBe(ATTRIBUTE_POINTS_TOTAL);

    expect(sheet.skillFocus.medicine).toBe(2);
    expect(sheet.skillFocus.trade).toBe(1);
    expect(focusSum(sheet)).toBe(3);

    // The background choices used to be passed and never stored; they are what the
    // biography is built from, so losing them loses the player's own account of
    // who they are.
    expect(Object.keys(sheet.backgroundChoices)).toContain("childhood");
    expect(sheet.biography.length).toBeGreaterThan(0);
    expect(sheet.startingCash).toBeGreaterThan(0);
    expect(Object.keys(sheet.startingSkills)).toContain("combat");
  });

  it("hands over exactly the fields the simulation's wire type declares", () => {
    // POST /v1/character is decoded with DisallowUnknownFields, so a field the
    // maker emits and the simulation does not declare is a 400 at campaign start.
    const maker = build();
    walkTo(maker.root, REVIEW_STEP);
    click(maker.root, "maker-done");
    const sheet = maker.complete()!;

    const expected = new Set([
      "firstName",
      "lastName",
      "gender",
      "appearanceId",
      "ethnicityId",
      "age",
      "startCity",
      "difficulty",
      "backgroundChoices",
      "attributes",
      "skillFocus",
      "startingSkills",
      "startingCash",
      "biography",
    ]);
    expect(new Set(Object.keys(sheet))).toEqual(expected);
    // bonusPoints went away with the step that mislabelled skills as attributes.
    expect(Object.keys(sheet)).not.toContain("bonusPoints");
  });

  it("carries skill levels that match what the rules say they should be", () => {
    const maker = build();
    walkTo(maker.root, ATTRIBUTES_STEP);
    click(maker.root, "attr-cunning-minus");
    click(maker.root, "attr-intelligence-plus");
    click(maker.root, "attr-cunning-plus");
    click(maker.root, "attr-social-minus");
    click(maker.root, "attr-social-plus");
    click(maker.root, "maker-next");
    click(maker.root, "skill-medicine-plus");
    click(maker.root, "maker-next");
    click(maker.root, "maker-done");
    const sheet = maker.complete()!;

    const expected = startingSkillLevels(sheet.attributes, sheet.skillFocus, sheet.startingSkills);
    // The maker does not store the derived eighteen; the simulation is handed the
    // sheet it can derive them from, and the panels derive the same numbers.
    expect(Object.keys(expected)).toHaveLength(18);
    expect(expected.medicine).toBeGreaterThan(expected.trade);
    for (const id of SKILL_IDS) expect(typeof expected[id], id).toBe("number");
  });
});

function rowText(root: HTMLElement, testid: string): string {
  return q(root, `${testid}-value`).closest(".attr-row")?.textContent ?? "";
}

function levelShown(row: string): number {
  return Number(/level (\d+)/.exec(row)?.[1] ?? "-1");
}

function perksShown(row: string): string {
  return /(\d of 8 perks)/.exec(row)?.[1] ?? "";
}

function focusSum(sheet: GameCharacter): number {
  return Object.values(sheet.skillFocus).reduce((a, b) => a + b, 0);
}
describe("family stage", () => {
  const BACKGROUND_STEP = 5;

  it("opens the background step on the family question with six options", () => {
    const { root } = build();
    walkTo(root, BACKGROUND_STEP);
    const grid = q(root, "bg-family");
    expect(grid.querySelectorAll("button").length).toBe(6);
    expect(root.textContent).toContain("What family were you born into?");
  });

  it("defaults to the first family and shows its attribute bonus", () => {
    const { root } = build();
    walkTo(root, BACKGROUND_STEP);
    const badge = q<HTMLButtonElement>(root, "bg-family-badge");
    expect(badge.getAttribute("aria-pressed")).toBe("true");
    expect(badge.textContent).toContain("+1");
    expect(badge.textContent).toContain("Social");
  });

  it("switches families when another is picked", () => {
    const { root } = build();
    walkTo(root, BACKGROUND_STEP);
    click(root, "bg-family-merchant");
    expect(q<HTMLButtonElement>(root, "bg-family-merchant").getAttribute("aria-pressed")).toBe("true");
    expect(q<HTMLButtonElement>(root, "bg-family-badge").getAttribute("aria-pressed")).toBe("false");
  });

  it("tells the player on the attributes step that the family bonus lands on top", () => {
    const { root } = build();
    walkTo(root, ATTRIBUTES_STEP);
    expect(text(root, "family-attribute-bonus")).toContain("+1");
    expect(text(root, "family-attribute-bonus")).toContain("Social");
  });

  it("shows the boosted attribute at review and keeps the stored sheet honest", () => {
    const maker = build();
    walkTo(maker.root, BACKGROUND_STEP);
    click(maker.root, "bg-family-merchant");
    // walkTo starts from step 0, so step forward from the background step.
    for (let i = BACKGROUND_STEP; i < REVIEW_STEP; i += 1) click(maker.root, "maker-next");
    // Merchant family: +1 Intelligence on top of the even 5s.
    expect(text(maker.root, "review-attribute-intelligence")).toContain("6 (+1 family)");
    expect(text(maker.root, "review-attribute-social")).not.toContain("(+1 family)");
    click(maker.root, "maker-done");
    const sheet = maker.complete()!;
    // The stored attributes stay the pure 30-point buy; the bonus applies at
    // derivation time. The family choice itself is what the campaign reads.
    expect(sheet.attributes.intelligence).toBe(5);
    expect(sheet.backgroundChoices["family"]).toBe("merchant");
  });
});
