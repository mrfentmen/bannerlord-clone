/**
 * The character maker: the second half of creation for modern America.
 *
 * The start screen answers who the character is — heritage, family job,
 * upbringing, home. This panel finishes the sheet: name, age, difficulty,
 * attributes, skills, review. There is no look picker here any more: the
 * low-poly models cannot honour a face choice, so the design step was removed
 * rather than left promising something the game does not deliver. The result
 * feeds into the campaign start, and `startCity` comes from the resolved home,
 * never from a city list. Attributes and skills are the six and the eighteen of
 * `CHARACTER.md`, and `src/data/attributes.ts` owns the rules for both.
 */

import { clear, h } from "../dom.js";
import { CHARACTER_STAGES, computeCharacterStats,
  AGE_BRACKETS, DIFFICULTIES, clanNamesForEthnicity,
  scenarioForBackgrounds, type GameCharacter } from "../../data/backgrounds.js";
import { attributesWithFamilyBonus, familyById } from "../../data/families.js";
import { ATTRIBUTES, ATTRIBUTE_MAX, ATTRIBUTE_MIN, ATTRIBUTE_POINTS_TOTAL,
  FOCUS_POINTS_TOTAL, SKILLS, attributeLabel, attributePointsRemaining,
  attributePointsSpent, canLowerAttribute, canRaiseAttribute, evenAttributes,
  emptyFocus, focusRemaining, nextPerkThreshold, perksEarned,
  skillLabel, startingSkillLevels } from "../../data/attributes.js";
import { ETHNICITIES, getEthnicity } from "../../data/ethnicities.js";
import { personName, createNameRng } from "../../data/names.js";

/** The home the start screen resolved, passed through so review tells the truth. */
export interface MakerHome {
  /** The settlement name slug the simulation relocates the player by. */
  slug: string;
  /** Display name of the town. */
  town: string;
  /** Display name of the state. */
  stateName: string;
  /** The one-sentence reason the resolver gave for this town. */
  reason: string;
}

export interface CharacterMakerOptions {
  onComplete: (character: GameCharacter) => void;
  onCancel: () => void;
  testId?: string;
  /**
   * Focus points the player may allocate on individual skills (MASTER_PLAN task
   * 142: New Game+ heirs get legacy training on top of the base budget).
   */
  bonusPointsTotal?: number | undefined;
  /** The heritage chosen on the start screen; seeds clan names and the review. */
  ethnicityId?: string;
  /**
   * The family and upbringing choices made on the start screen, by category id.
   * Categories the start screen does not answer fall back to their first option.
   */
  backgrounds?: Record<string, string>;
  /** The resolved home from the start screen. Required: the sheet has to land somewhere real. */
  home: MakerHome;
  /** Open a codex lore entry (e.g. ethnicity lore from the name step). */
  onOpenLore?: (entryId: string) => void;
}

const MAKER_STEPS = ["Name", "Age", "Difficulty", "Attributes", "Skills", "Review"] as const;
type MakerStep = 0 | 1 | 2 | 3 | 4 | 5;

const LAST_STEP: MakerStep = 5;
/**
 * The default focus-point budget. Kept under its old name because `main.ts` and
 * the New Game+ heir record already speak in "bonus points", and what those points
 * buy is now honest: focus on individual skills rather than a row mislabelled as an
 * attribute. See `FOCUS_POINTS_TOTAL`, which this defers to.
 */
export const BONUS_POINTS_TOTAL = FOCUS_POINTS_TOTAL;

export function characterMaker(options: CharacterMakerOptions): HTMLElement {
  let step: MakerStep = 0;
  let firstName = "";
  let lastName = "";
  let gender: "male" | "female" = "male";
  let ethnicityId = options.ethnicityId ?? ETHNICITIES[0]!.id;
  let age = 30;
  let difficulty = "normal";
  let attributes = evenAttributes();
  let skillFocus = emptyFocus();
  let backgroundChoices: Record<string, string> = {};
  // Default to first option in each stage, family first, then take the answers
  // the start screen already collected on top.
  for (const cat of CHARACTER_STAGES) {
    backgroundChoices[cat.id] = cat.options[0]!.id;
  }
  if (options.backgrounds) {
    for (const [categoryId, optionId] of Object.entries(options.backgrounds)) {
      if (optionId) backgroundChoices[categoryId] = optionId;
    }
  }

  const root = h("div", { class: "character-maker", "data-testid": options.testId ?? "character-maker" });

  function go(next: MakerStep): void {
    step = next;
    render();
  }

  function canProceed(): boolean {
    if (step === 0) return firstName.trim().length > 0 && lastName.trim().length > 0;
    // The attribute budget is fixed and always completable: every attribute can be
    // lowered to its floor, so a player can always get back to spending exactly the
    // thirty and cannot strand themselves short. The focus pool deliberately is
    // not gated the same way. Requiring all of it spent would mean a player who
    // wants to skip the step has to find five reasons to spend points they do not
    // have, so leaving points unspent is allowed and the remainder is simply lost.
    if (step === 3) return attributePointsSpent(attributes) === ATTRIBUTE_POINTS_TOTAL;
    return true;
  }

  const focusBudget = (): number => options.bonusPointsTotal ?? BONUS_POINTS_TOTAL;

  function stepBar(): HTMLElement {
    const bar = h("div", { class: "stepbar" });
    MAKER_STEPS.forEach((label, i) => {
      const btn = h(
        "button",
        {
          class: `stepbar__step${i === step ? " stepbar__step--current" : ""}${i < step ? " stepbar__step--done" : ""}`,
          disabled: i > step ? true : undefined,
          "data-testid": `maker-step-${i}`,
        },
        `${i + 1}. ${label}`,
      );
      btn.addEventListener("click", () => {
        if (i <= step) go(i as MakerStep);
      });
      bar.appendChild(btn);
    });
    return bar;
  }

  function nameStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "Who are you?"));
    const heritage = getEthnicity(ethnicityId);
    frag.appendChild(
      h("p", { class: "caption" }, `Heritage: ${heritage?.name ?? "unlisted"} — chosen on the first screen, it shapes your clan name and your starting town.`),
    );

    const firstInput = h("input", {
      class: "field__input",
      placeholder: "First name",
      value: firstName,
      "data-testid": "char-first-name",
      "aria-label": "First name",
    }) as HTMLInputElement;
    firstInput.addEventListener("input", () => {
      firstName = firstInput.value;
      nextBtn.disabled = !canProceed();
    });

    const lastInput = h("input", {
      class: "field__input",
      placeholder: "Last name",
      value: lastName,
      "data-testid": "char-last-name",
      "aria-label": "Last name",
    }) as HTMLInputElement;
    lastInput.addEventListener("input", () => {
      lastName = lastInput.value;
      nextBtn.disabled = !canProceed();
    });

    const genderRow = h("div", { class: "roles" });
    (["male", "female"] as const).forEach((g) => {
      const btn = h(
        "button",
        {
          class: `role${gender === g ? " role--selected" : ""}`,
          "aria-pressed": gender === g ? "true" : "false",
          "data-testid": `char-gender-${g}`,
        },
        g === "male" ? "Male" : "Female",
      );
      btn.addEventListener("click", () => {
        gender = g;
        render();
      });
      genderRow.appendChild(btn);
    });

    // A lore deep-link for the heritage already chosen on the start screen
    // (Rowan, del order 2026-10-03): the picker itself lives on the start
    // screen now, so the link follows it here as a single quiet button.
    if (options.onOpenLore && heritage) {
      const loreBtn = h(
        "button",
        {
          type: "button",
          class: "btn btn--quiet btn--xs",
          "data-testid": `char-heritage-lore`,
          title: `Read the lore of the ${heritage.name} community`,
        },
        "📖 Lore",
      ) as HTMLButtonElement;
      loreBtn.addEventListener("click", () => {
        options.onOpenLore?.(`lore-ethnicity-${heritage.id}`);
      });
      frag.appendChild(loreBtn);
    }

    // Random name from the heritage's name generator (Rowan, del order 2026-10-03).
    const randomBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn--quiet",
        "data-testid": "char-random-name",
        title: "Generate a random name for your heritage and gender",
      },
      "🎲 Random name",
    ) as HTMLButtonElement;
    randomBtn.addEventListener("click", () => {
      const rng = createNameRng((Math.random() * 0x7fffffff) | 0);
      const person = personName(ethnicityId, rng, gender);
      firstName = person.firstName;
      lastName = person.lastName;
      firstInput.value = firstName;
      lastInput.value = lastName;
      nextBtn.disabled = !canProceed();
    });

    frag.append(firstInput, lastInput, randomBtn, h("h3", {}, "Gender"), genderRow);

    // Clan name suggestions based on heritage.
    const clans = clanNamesForEthnicity(ethnicityId);
    if (clans.length > 0) {
      frag.appendChild(h("h3", {}, "Clan names — pick one or write your own"));
      const cgrid = h("div", { class: "roles", "data-testid": "char-clan-grid" });
      for (const clan of clans) {
        const btn = h(
          "button",
          {
            class: "role",
            "data-testid": `char-clan-${clan.name}`,
            title: clan.meaning,
          },
          h("strong", {}, clan.name),
          h("br"),
          h("span", { class: "caption" }, clan.meaning),
        );
        btn.addEventListener("click", () => {
          lastName = clan.name;
          lastInput.value = clan.name;
          nextBtn.disabled = !canProceed();
        });
        cgrid.appendChild(btn);
      }
      frag.appendChild(cgrid);
    }
    return frag;
  }

  function ageStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "How old are you?"));
    frag.appendChild(h("p", { class: "caption" }, "Age shapes your starting skills and cash. Every stage of life has tradeoffs."));

    const grid = h("div", { class: "roles", "data-testid": "age-grid" });
    for (const bracket of AGE_BRACKETS) {
      // Use the midpoint of the bracket as the representative age.
      const mid = Math.floor((bracket.min + bracket.max) / 2);
      const selected = age >= bracket.min && age <= bracket.max;
      const proList = h("ul", { class: "pros" });
      for (const pro of bracket.pros) {
        proList.appendChild(h("li", { title: pro.reason }, `+ ${pro.label}`));
      }
      const conList = h("ul", { class: "cons" });
      for (const con of bracket.cons) {
        conList.appendChild(h("li", { title: con.reason }, `- ${con.label}`));
      }
      const btn = h(
        "button",
        {
          class: `role${selected ? " role--selected" : ""}`,
          "aria-pressed": selected ? "true" : "false",
          "data-testid": `age-${bracket.min}-${bracket.max}`,
          title: bracket.description,
        },
        h("strong", {}, bracket.label),
        h("br"),
        h("em", { class: "tagline" }, bracket.tagline),
        h("p", { class: "caption" }, bracket.description),
        h("div", { class: "city-pros-cons" }, proList, conList),
      );
      btn.addEventListener("click", () => {
        age = mid;
        render();
      });
      grid.appendChild(btn);
    }
    frag.appendChild(grid);
    return frag;
  }

  function difficultyStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "How hard should it be?"));
    frag.appendChild(h("p", { class: "caption" }, "Difficulty affects enemy strength, economy, and glory. Be honest with yourself."));

    const grid = h("div", { class: "roles", "data-testid": "difficulty-grid" });
    for (const diff of DIFFICULTIES) {
      const selected = difficulty === diff.id;
      const proList = h("ul", { class: "pros" });
      for (const pro of diff.pros) {
        proList.appendChild(h("li", { title: pro.reason }, `+ ${pro.label}`));
      }
      const conList = h("ul", { class: "cons" });
      for (const con of diff.cons) {
        conList.appendChild(h("li", { title: con.reason }, `- ${con.label}`));
      }
      const btn = h(
        "button",
        {
          class: `role${selected ? " role--selected" : ""}`,
          "aria-pressed": selected ? "true" : "false",
          "data-testid": `difficulty-${diff.id}`,
          title: diff.description,
        },
        h("strong", {}, diff.label),
        h("br"),
        h("em", { class: "tagline" }, diff.tagline),
        h("p", { class: "caption" }, diff.description),
        h("div", { class: "city-pros-cons" }, proList, conList),
      );
      btn.addEventListener("click", () => {
        difficulty = diff.id;
        render();
      });
      grid.appendChild(btn);
    }
    frag.appendChild(grid);
    return frag;
  }

  /**
   * A minus/plus/value row, shared by the attribute and skill steps so the two
   * read identically and a test can find either by the same shape.
   */
  function pointRow(options2: {
    testid: string;
    label: string;
    title: string | undefined;
    detail: HTMLElement[];
    value: number;
    canLower: boolean;
    canRaise: boolean;
    onLower: () => void;
    onRaise: () => void;
  }): HTMLElement {
    const row = h("div", {
      class: "attr-row",
      style: "display:flex;align-items:center;gap:8px;margin:4px 0",
    });
    const name = h("span", { style: "flex:1" }, options2.label);
    if (options2.title !== undefined) name.title = options2.title;
    row.appendChild(name);
    for (const node of options2.detail) row.appendChild(node);

    const minus = h(
      "button",
      {
        class: "btn",
        "data-testid": `${options2.testid}-minus`,
        disabled: options2.canLower ? undefined : true,
        "aria-label": `Remove a point from ${options2.label}`,
      },
      "−",
    ) as HTMLButtonElement;
    minus.addEventListener("click", options2.onLower);

    const val = h("span", { "data-testid": `${options2.testid}-value`, style: "min-width:2ch;text-align:center" },
      String(options2.value));

    const plus = h(
      "button",
      {
        class: "btn",
        "data-testid": `${options2.testid}-plus`,
        disabled: options2.canRaise ? undefined : true,
        "aria-label": `Add a point to ${options2.label}`,
      },
      "+",
    ) as HTMLButtonElement;
    plus.addEventListener("click", options2.onRaise);

    row.append(minus, val, plus);
    return row;
  }

  function attributesStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "Your six attributes"));
    const remaining = attributePointsRemaining(attributes);
    frag.appendChild(h("p", { class: "caption" },
      `Distribute ${ATTRIBUTE_POINTS_TOTAL} points across the six. ` +
      `Each attribute is worth ${ATTRIBUTE_MIN} to ${ATTRIBUTE_MAX} and it caps the three skills it governs.`));
    const famBonus = familyById(backgroundChoices["family"] ?? "")?.attributeBonus;
    if (famBonus) {
      frag.appendChild(h("p", { class: "caption", "data-testid": "family-attribute-bonus" },
        `Your family grants +${famBonus.points} ${attributeLabel(famBonus.attribute)} on top of these points, applied at review.`));
    }
    frag.appendChild(
      h("p", { class: "caption", "data-testid": "attribute-points-remaining" },
        `${remaining} of ${ATTRIBUTE_POINTS_TOTAL} points remaining`),
    );

    const list = h("div", { "data-testid": "attributes-list" });
    for (const attribute of ATTRIBUTES) {
      const id = attribute.id;
      const skills = h("span", { class: "caption" },
        attribute.skills.map((s) => skillLabel(s)).join(", "));
      list.appendChild(pointRow({
        testid: `attr-${id}`,
        label: attribute.name,
        title: attribute.description,
        detail: [skills],
        value: attributes[id],
        canLower: canLowerAttribute(attributes, id),
        canRaise: canRaiseAttribute(attributes, id),
        onLower: () => {
          if (canLowerAttribute(attributes, id)) attributes[id] = attributes[id] - 1;
          render();
        },
        onRaise: () => {
          if (canRaiseAttribute(attributes, id)) attributes[id] = attributes[id] + 1;
          render();
        },
      }));
    }
    frag.appendChild(list);
    return frag;
  }

  function skillsStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    const total = focusBudget();
    frag.appendChild(h("h2", { class: "title" }, "Where to put your focus"));
    frag.appendChild(h("p", { class: "caption" },
      "Your attributes already set every skill's starting level. Focus points push a " +
      "single skill past the perks it would otherwise reach, so spend them where you want to be good."));
    frag.appendChild(
      h("p", { class: "caption", "data-testid": "focus-points-remaining" },
        `${focusRemaining(skillFocus, total)} of ${total} focus points remaining`),
    );

    const levels = startingSkillLevels(attributes, skillFocus, {});
    const list = h("div", { "data-testid": "skills-list" });
    for (const skill of SKILLS) {
      const id = skill.id;
      const level = levels[id];
      const next = nextPerkThreshold(level);
      const perkCount = perksEarned(level);
      const detail = [
        h("span", { class: "caption" }, attributeLabel(skill.attribute)),
        h("span", { class: "caption" }, `level ${level} · ${perkCount} of 8 perks`),
      ];
      if (next !== null) {
        detail.push(h("span", { class: "tagline" }, `next at ${next}`));
      }
      list.appendChild(pointRow({
        testid: `skill-${id}`,
        label: skill.name,
        title: skill.description,
        detail,
        value: skillFocus[id] ?? 0,
        canLower: (skillFocus[id] ?? 0) > 0,
        canRaise: focusRemaining(skillFocus, total) > 0,
        onLower: () => {
          const current = skillFocus[id] ?? 0;
          if (current > 0) skillFocus[id] = current - 1;
          render();
        },
        onRaise: () => {
          if (focusRemaining(skillFocus, total) <= 0) return;
          skillFocus[id] = (skillFocus[id] ?? 0) + 1;
          render();
        },
      }));
    }
    frag.appendChild(list);
    return frag;
  }

  function reviewStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "Review your character"));

    const { skills, cash, biography } = computeCharacterStats(backgroundChoices, age, {});
    // The stored attributes stay a pure 30-point buy; the family bonus applies
    // at derivation time (see attributesWithFamilyBonus).
    const finalAttributes = attributesWithFamilyBonus(attributes, backgroundChoices["family"]);
    const canonicalLevels = startingSkillLevels(finalAttributes, skillFocus, skills);
    const ethnicity = getEthnicity(ethnicityId);
    const bracket = AGE_BRACKETS.find((b) => age >= b.min && age <= b.max);
    const diff = DIFFICULTIES.find((d) => d.id === difficulty);

    const card = h("div", { class: "sheet portrait-panel", "data-testid": "char-review" });
    card.appendChild(h("h3", { style: "text-align:center" }, `${firstName} ${lastName}`));
    card.appendChild(
      h("p", { class: "caption", style: "text-align:center" },
        `${gender === "male" ? "Male" : "Female"} · ${bracket?.label ?? ""} · ${ethnicity?.name ?? ""}`),
    );
    card.appendChild(
      h("p", { class: "caption", style: "text-align:center" },
        `Home: ${options.home.town}, ${options.home.stateName} · Difficulty: ${diff?.label ?? difficulty}`),
    );
    card.appendChild(h("p", { class: "caption", style: "text-align:center" }, options.home.reason));

    card.appendChild(h("h4", {}, "Attributes"));
    const attrList = h("ul", {});
    const reviewBonus = familyById(backgroundChoices["family"] ?? "")?.attributeBonus;
    for (const attribute of ATTRIBUTES) {
      const boosted = reviewBonus?.attribute === attribute.id;
      attrList.appendChild(
        h("li", { "data-testid": `review-attribute-${attribute.id}` },
          `${attribute.name}: ${finalAttributes[attribute.id]}${boosted ? " (+1 family)" : ""}`),
      );
    }
    card.appendChild(attrList);

    card.appendChild(h("h4", {}, "Skills"));
    const skillRows = h("ul", { "data-testid": "review-skills" });
    const ranked = [...SKILLS].sort((a, b) => canonicalLevels[b.id] - canonicalLevels[a.id]);
    for (const skill of ranked) {
      const level = canonicalLevels[skill.id];
      const focus = skillFocus[skill.id] ?? 0;
      const suffix = focus > 0 ? ` (${focus} focus)` : "";
      skillRows.appendChild(
        h("li", { "data-testid": `review-skill-${skill.id}` },
          `${skill.name}: ${level} · ${perksEarned(level)} of 8 perks${suffix}`),
      );
    }
    card.appendChild(skillRows);

    card.appendChild(h("h4", {}, "Legacy starting skills"));
    card.appendChild(h("p", { class: "caption" },
      "The nine broad skills the background sheet still speaks in, kept for the clan roster."));
    const legacyList = h("ul", { "data-testid": "review-legacy-skills" });
    for (const [skill, value] of Object.entries(skills).sort((a, b) => b[1] - a[1])) {
      legacyList.appendChild(h("li", {}, `${skill}: ${value}`));
    }
    card.appendChild(legacyList);
    card.appendChild(h("p", {}, `Starting cash: $${cash.toLocaleString()}`));
    card.appendChild(h("h4", {}, "Biography"));
    card.appendChild(h("p", { class: "caption" }, biography));

    // Starting scenario based on background.
    const scenario = scenarioForBackgrounds(backgroundChoices);
    if (scenario) {
      card.appendChild(h("h4", {}, "Your first quest"));
      const scenarioBox = h("div", { style: "background:rgb(42,26,26);border-left:4px solid rgb(255,107,107);padding:12px;margin:8px 0;border-radius:4px" });
      scenarioBox.appendChild(h("strong", {}, scenario.title));
      scenarioBox.appendChild(h("p", { class: "caption" }, scenario.description));
      scenarioBox.appendChild(h("p", {}, `Objective: ${scenario.objective}`));
      scenarioBox.appendChild(h("p", { class: "caption" }, `Reward: ${scenario.reward}`));
      card.appendChild(scenarioBox);
    }

    frag.appendChild(card);
    return frag;
  }

  let nextBtn!: HTMLButtonElement;

  function render(): void {
    clear(root);
    root.appendChild(stepBar());

    const body = h("div", { class: "maker-body" });
    if (step === 0) body.appendChild(nameStep());
    else if (step === 1) body.appendChild(ageStep());
    else if (step === 2) body.appendChild(difficultyStep());
    else if (step === 3) body.appendChild(attributesStep());
    else if (step === 4) body.appendChild(skillsStep());
    else body.appendChild(reviewStep());
    root.appendChild(body);

    const nav = h("div", { class: "maker-nav" });
    if (step > 0) {
      const back = h("button", { class: "btn", "data-testid": "maker-back" }, "← Back");
      back.addEventListener("click", () => go((step - 1) as MakerStep));
      nav.appendChild(back);
    } else {
      const cancel = h("button", { class: "btn", "data-testid": "maker-cancel" }, "Cancel");
      cancel.addEventListener("click", () => options.onCancel());
      nav.appendChild(cancel);
    }
    if (step < LAST_STEP) {
      nextBtn = h("button", {
        class: "btn btn--primary",
        "data-testid": "maker-next",
        disabled: !canProceed() ? true : undefined,
      }, "Next →") as HTMLButtonElement;
      nextBtn.addEventListener("click", () => {
        if (canProceed()) go((step + 1) as MakerStep);
      });
      nav.appendChild(nextBtn);
    } else {
      const done = h("button", { class: "btn btn--primary", "data-testid": "maker-done" }, "Start Game");
      done.addEventListener("click", () => {
        const { skills, cash, biography } = computeCharacterStats(backgroundChoices, age, {});
        options.onComplete({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender,
          ethnicityId,
          backgroundChoices: { ...backgroundChoices },
          attributes: { ...attributes },
          skillFocus: { ...skillFocus },
          startingSkills: skills,
          startCity: options.home.slug,
          age,
          difficulty,
          startingCash: cash,
          biography,
        });
      });
      nav.appendChild(done);
    }
    root.appendChild(nav);
  }

  render();
  return root;
}
