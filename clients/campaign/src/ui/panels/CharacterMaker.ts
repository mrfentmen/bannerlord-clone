/**
 * The character maker: Bannerlord-style creation for modern America.
 *
 * Steps: Name → Appearance → Age → City → Difficulty → Background → Attributes →
 * Skills → Review. Each background choice grants skill bonuses and shapes the
 * biography. Attributes and skills are the six and the eighteen of
 * `CHARACTER.md`, and `src/data/attributes.ts` owns the rules for both.
 * The result feeds into the campaign start.
 */

import { clear, h } from "../dom.js";
import { BACKGROUNDS, appearancesForEthnicity, computeCharacterStats,
  START_CITIES, AGE_BRACKETS, DIFFICULTIES, clanNamesForEthnicity,
  scenarioForBackgrounds, type GameCharacter } from "../../data/backgrounds.js";
import { ATTRIBUTES, ATTRIBUTE_MAX, ATTRIBUTE_MIN, ATTRIBUTE_POINTS_TOTAL,
  FOCUS_POINTS_TOTAL, SKILLS, attributeLabel, attributePointsRemaining,
  attributePointsSpent, canLowerAttribute, canRaiseAttribute, evenAttributes,
  emptyFocus, focusRemaining, nextPerkThreshold, perksEarned,
  skillLabel, startingSkillLevels } from "../../data/attributes.js";
import { ETHNICITIES } from "../../data/ethnicities.js";

export interface CharacterMakerOptions {
  onComplete: (character: GameCharacter) => void;
  onCancel: () => void;
  testId?: string;
  /**
   * Focus points the player may allocate on individual skills (MASTER_PLAN task
   * 142: New Game+ heirs get legacy training on top of the base budget).
   */
  bonusPointsTotal?: number | undefined;
}

const MAKER_STEPS = ["Name", "Appearance", "Age", "City", "Difficulty", "Background",
  "Attributes", "Skills", "Review"] as const;
type MakerStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const LAST_STEP: MakerStep = 8;
/**
 * The default focus-point budget. Kept under its old name because `main.ts` and
 * the New Game+ heir record already speak in "bonus points", and what those points
 * buy is now honest: focus on individual skills rather than a row mislabelled as an
 * attribute. See `FOCUS_POINTS_TOTAL`, which this defers to.
 */
export const BONUS_POINTS_TOTAL = FOCUS_POINTS_TOTAL;

export function characterMaker(options: CharacterMakerOptions): HTMLElement {
  let step: MakerStep = 0;
  // The canon protagonist pre-fills the maker: Sam "Rook" Reyes. The player can
  // rename freely; the default is our character.
  let firstName = "Sam";
  let lastName = "Reyes";
  let gender: "male" | "female" = "male";
  let appearanceId = appearancesForEthnicity(ETHNICITIES[0]!.id)[0]?.id ?? "";
  let ethnicityId = ETHNICITIES[0]!.id;
  let age = 30;
  let startCity = "manhattan-sample";
  let difficulty = "normal";
  let attributes = evenAttributes();
  let skillFocus = emptyFocus();
  let backgroundChoices: Record<string, string> = {};
  // Default to first option in each category.
  for (const cat of BACKGROUNDS) {
    backgroundChoices[cat.id] = cat.options[0]!.id;
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
    if (step === 6) return attributePointsSpent(attributes) === ATTRIBUTE_POINTS_TOTAL;
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

    // Heritage (ethnicity) picker — same data as the start screen.
    frag.appendChild(h("h3", {}, "Heritage"));
    const egrid = h("div", { class: "roles", "data-testid": "char-ethnicity-grid" });
    for (const e of ETHNICITIES) {
      const btn = h(
        "button",
        {
          class: `role${ethnicityId === e.id ? " role--selected" : ""}`,
          "aria-pressed": ethnicityId === e.id ? "true" : "false",
          "data-testid": `char-ethnicity-${e.id}`,
          title: e.tagline,
        },
        e.name,
      );
      btn.addEventListener("click", () => {
        ethnicityId = e.id;
        // Reset appearance to this ethnicity's first preset.
        appearanceId = appearancesForEthnicity(ethnicityId)[0]?.id ?? "";
        render();
      });
      egrid.appendChild(btn);
    }

    frag.append(firstInput, lastInput, h("h3", {}, "Gender"), genderRow, egrid);

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

  function appearanceStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    const ethnicity = ETHNICITIES.find((e) => e.id === ethnicityId);
    frag.appendChild(h("h2", { class: "title" }, `Choose your look — ${ethnicity?.name ?? ""}`));
    frag.appendChild(h("p", { class: "caption" }, "Pick a face for your character."));

    const presets = appearancesForEthnicity(ethnicityId);
    // Reset to first preset of this ethnicity if current doesn't belong.
    if (!presets.some((p) => p.id === appearanceId)) {
      appearanceId = presets[0]?.id ?? "";
    }

    const grid = h("div", { class: "roles", "data-testid": "appearance-grid" });
    for (const preset of presets) {
      const btn = h(
        "button",
        {
          class: `role${appearanceId === preset.id ? " role--selected" : ""}`,
          "aria-pressed": appearanceId === preset.id ? "true" : "false",
          "data-testid": `appearance-${preset.id}`,
          title: preset.description,
        },
        h("span", { style: "font-size:2rem" }, preset.icon),
        h("br"),
        preset.label,
      );
      btn.addEventListener("click", () => {
        appearanceId = preset.id;
        render();
      });
      grid.appendChild(btn);
    }
    frag.appendChild(grid);
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

  function cityStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "Where do you start?"));
    frag.appendChild(h("p", { class: "caption" }, "Your home turf shapes your whole campaign. Each city has real tradeoffs — read them before you commit."));

    const grid = h("div", { class: "roles", "data-testid": "city-grid" });
    for (const city of START_CITIES) {
      const selected = startCity === city.slug;
      const proList = h("ul", { class: "pros" });
      for (const pro of city.pros) {
        proList.appendChild(h("li", { title: pro.reason }, `+ ${pro.label}`));
      }
      const conList = h("ul", { class: "cons" });
      for (const con of city.cons) {
        conList.appendChild(h("li", { title: con.reason }, `- ${con.label}`));
      }
      const btn = h(
        "button",
        {
          class: `role city-card${selected ? " role--selected" : ""}`,
          "aria-pressed": selected ? "true" : "false",
          "data-testid": `city-${city.slug}`,
          title: city.description,
        },
        h("strong", {}, city.name),
        h("br"),
        h("em", { class: "tagline" }, city.tagline),
        h("p", { class: "caption city-desc" }, city.description),
        h("div", { class: "city-pros-cons" }, proList, conList),
      );
      btn.addEventListener("click", () => {
        startCity = city.slug;
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

  function backgroundStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "Your story"));
    frag.appendChild(h("p", { class: "caption" }, "Each choice grants skill bonuses and starting cash. Pick the life that made you."));

    for (const category of BACKGROUNDS) {
      frag.appendChild(h("h3", {}, category.question));
      const grid = h("div", { class: "roles", "data-testid": `bg-${category.id}` });
      for (const opt of category.options) {
        const selected = backgroundChoices[category.id] === opt.id;
        const skillList = h("ul", { class: "pros" });
        for (const [skill, bonus] of Object.entries(opt.skills)) {
          skillList.appendChild(h("li", {}, `+${bonus} ${skill}`));
        }
        if (opt.cash !== 0) {
          skillList.appendChild(
            h("li", {}, `${opt.cash > 0 ? "+" : ""}$${opt.cash} starting cash`),
          );
        }
        const btn = h(
          "button",
          {
            class: `role${selected ? " role--selected" : ""}`,
            "aria-pressed": selected ? "true" : "false",
            "data-testid": `bg-${category.id}-${opt.id}`,
            title: opt.description,
          },
          h("strong", {}, opt.label),
          h("br"),
          h("span", { class: "caption" }, opt.description),
          skillList,
        );
        btn.addEventListener("click", () => {
          backgroundChoices[category.id] = opt.id;
          render();
        });
        grid.appendChild(btn);
      }
      frag.appendChild(grid);
    }
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
    const canonicalLevels = startingSkillLevels(attributes, skillFocus, skills);
    const ethnicity = ETHNICITIES.find((e) => e.id === ethnicityId);
    const appearance = appearancesForEthnicity(ethnicityId).find((a) => a.id === appearanceId);
    const bracket = AGE_BRACKETS.find((b) => age >= b.min && age <= b.max);
    const city = START_CITIES.find((c) => c.slug === startCity);

    const card = h("div", { class: "sheet portrait-panel", "data-testid": "char-review" });
    // Portrait preview — large icon with appearance details.
    const portrait = h("div", { class: "portrait", style: "text-align:center;padding:16px;background:linear-gradient(135deg,rgb(26,26,46),rgb(22,33,62));border-radius:12px;margin-bottom:16px" });
    portrait.appendChild(h("div", { style: "font-size:5rem;line-height:1" }, appearance?.icon ?? "🧑"));
    portrait.appendChild(h("div", { style: "font-size:1.2rem;font-weight:bold;margin-top:8px;color:rgb(255,255,255)" }, `${firstName} ${lastName}`));
    portrait.appendChild(h("div", { style: "color:rgb(170,170,170);font-size:0.9rem" }, appearance?.label ?? ""));
    portrait.appendChild(h("div", { style: "color:rgb(136,136,136);font-size:0.8rem;font-style:italic" }, appearance?.description ?? ""));
    card.appendChild(portrait);
    card.appendChild(h("h3", { style: "text-align:center" }, `${firstName} ${lastName}`));
    card.appendChild(
      h("p", { class: "caption", style: "text-align:center" },
        `${gender === "male" ? "Male" : "Female"} · ${bracket?.label ?? ""} · ${ethnicity?.name ?? ""} · ${appearance?.label ?? ""}`),
    );
    const diff = DIFFICULTIES.find((d) => d.id === difficulty);
    card.appendChild(
      h("p", { class: "caption", style: "text-align:center" },
        `Starting city: ${city?.name ?? startCity} · Difficulty: ${diff?.label ?? difficulty}`),
    );
    if (city) {
      card.appendChild(h("p", { class: "caption", style: "text-align:center" }, city.tagline));
      const cityEffects = h("ul", { class: "city-effects" });
      for (const pro of city.pros) {
        cityEffects.appendChild(h("li", { class: "pro", title: pro.reason }, `+ ${pro.label}`));
      }
      for (const con of city.cons) {
        cityEffects.appendChild(h("li", { class: "con", title: con.reason }, `- ${con.label}`));
      }
      card.appendChild(cityEffects);
    }

    card.appendChild(h("h4", {}, "Attributes"));
    const attrList = h("ul", {});
    for (const attribute of ATTRIBUTES) {
      attrList.appendChild(
        h("li", { "data-testid": `review-attribute-${attribute.id}` },
          `${attribute.name}: ${attributes[attribute.id]}`),
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
    else if (step === 1) body.appendChild(appearanceStep());
    else if (step === 2) body.appendChild(ageStep());
    else if (step === 3) body.appendChild(cityStep());
    else if (step === 4) body.appendChild(difficultyStep());
    else if (step === 5) body.appendChild(backgroundStep());
    else if (step === 6) body.appendChild(attributesStep());
    else if (step === 7) body.appendChild(skillsStep());
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
          appearanceId,
          ethnicityId,
          backgroundChoices: { ...backgroundChoices },
          attributes: { ...attributes },
          skillFocus: { ...skillFocus },
          startingSkills: skills,
          startCity,
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
