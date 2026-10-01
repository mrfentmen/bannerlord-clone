/**
 * The character maker: Bannerlord-style creation for modern America.
 *
 * Steps: Name → Appearance → Background (4 categories) → Review.
 * Each background choice grants skill bonuses and shapes the biography.
 * The result feeds into the campaign start.
 */

import { clear, h } from "../dom.js";
import { BACKGROUNDS, APPEARANCE_PRESETS, appearancesForEthnicity, computeCharacterStats, type GameCharacter } from "../../data/backgrounds.js";
import { ETHNICITIES } from "../../data/ethnicities.js";

export interface CharacterMakerOptions {
  onComplete: (character: GameCharacter) => void;
  onCancel: () => void;
  testId?: string;
}

const MAKER_STEPS = ["Name", "Appearance", "Background", "Review"] as const;
type MakerStep = 0 | 1 | 2 | 3;

export function characterMaker(options: CharacterMakerOptions): HTMLElement {
  let step: MakerStep = 0;
  let firstName = "";
  let lastName = "";
  let gender: "male" | "female" = "male";
  let appearanceId = APPEARANCE_PRESETS[0]!.id;
  let ethnicityId = ETHNICITIES[0]!.id;
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
    return true;
  }

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
        render();
      });
      egrid.appendChild(btn);
    }

    frag.append(firstInput, lastInput, h("h3", {}, "Gender"), genderRow, egrid);
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

  function backgroundStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "Your story"));
    frag.appendChild(h("p", { class: "caption" }, "Each choice shapes your starting skills."));

    for (const category of BACKGROUNDS) {
      frag.appendChild(h("h3", {}, category.question));
      const grid = h("div", { class: "roles", "data-testid": `bg-${category.id}` });
      for (const opt of category.options) {
        const selected = backgroundChoices[category.id] === opt.id;
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

  function reviewStep(): HTMLElement {
    const frag = h("div", { class: "maker-step" });
    frag.appendChild(h("h2", { class: "title" }, "Review your character"));

    const { skills, cash, biography } = computeCharacterStats(backgroundChoices);
    const ethnicity = ETHNICITIES.find((e) => e.id === ethnicityId);
    const appearance = appearancesForEthnicity(ethnicityId).find((a) => a.id === appearanceId);

    const card = h("div", { class: "sheet", "data-testid": "char-review" });
    card.appendChild(h("div", { style: "font-size:3rem;text-align:center" }, appearance?.icon ?? "🧑"));
    card.appendChild(h("h3", { style: "text-align:center" }, `${firstName} ${lastName}`));
    card.appendChild(
      h("p", { class: "caption", style: "text-align:center" },
        `${gender === "male" ? "Male" : "Female"} · ${ethnicity?.name ?? ""} · ${appearance?.label ?? ""}`),
    );

    card.appendChild(h("h4", {}, "Starting skills"));
    const skillList = h("ul", {});
    for (const [skill, value] of Object.entries(skills).sort((a, b) => b[1] - a[1])) {
      skillList.appendChild(h("li", {}, `${skill}: ${value}`));
    }
    card.appendChild(skillList);
    card.appendChild(h("p", {}, `Starting cash: $${cash.toLocaleString()}`));
    card.appendChild(h("h4", {}, "Biography"));
    card.appendChild(h("p", { class: "caption" }, biography));

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
    else if (step === 2) body.appendChild(backgroundStep());
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
    if (step < 3) {
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
        const { skills, cash, biography } = computeCharacterStats(backgroundChoices);
        options.onComplete({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender,
          appearanceId,
          ethnicityId,
          backgroundChoices: { ...backgroundChoices },
          startingSkills: skills,
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
