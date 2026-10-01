/**
 * The clan laws panel (MASTER_PLAN task 82).
 *
 * Inheritance and marriage policy, editable and persisted by the caller.
 * Changing a law immediately re-runs the succession preview below it, so
 * the accept criterion ("laws affect succession outcomes") is visible, not
 * just asserted: switch to partible and the outlook shows the realm split;
 * switch to ultimogeniture and the named heir changes.
 *
 * The outlook renders against a live roster accessor. When no clan roster
 * is recorded yet the panel says so instead of inventing one — the family
 * tree viewer (task 76) is where members get recorded.
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import { successionPreview } from "./succession.js";
import { type ClanLaws, type ClanMember, type InheritanceLaw, type MarriagePolicy } from "./types.js";
import "./lawsPanel.css";

export interface LawsRoster {
  members: ClanMember[];
  rulerId: string;
}

export interface LawsPanelOptions {
  /** Live accessor: the panel re-reads it on every render. */
  laws: () => ClanLaws;
  onChange: (laws: ClanLaws) => void;
  onReset: () => void;
  /** Null until clan members are recorded (family tree, task 76). */
  roster: () => LawsRoster | null;
  /** Settlement ids that count as realm holdings for the split view. */
  holdings: () => string[];
  onClose: () => void;
}

export interface LawsPanelHandle {
  root: HTMLElement;
  refresh(): void;
  dispose(): void;
}

const INHERITANCE_LAWS: Array<{ id: InheritanceLaw; name: string; effect: string }> = [
  {
    id: "primogeniture",
    name: "Primogeniture",
    effect: "The eldest living child inherits everything.",
  },
  {
    id: "ultimogeniture",
    name: "Ultimogeniture",
    effect: "The youngest living child inherits everything.",
  },
  {
    id: "partible",
    name: "Partible inheritance",
    effect: "Every living child inherits a share — holdings split round-robin, eldest first.",
  },
  {
    id: "elective",
    name: "Elective",
    effect: "The clan elects the most skilled living child.",
  },
];

const MARRIAGE_POLICIES: Array<{ id: MarriagePolicy; name: string; effect: string }> = [
  {
    id: "alliance-first",
    name: "Alliance first",
    effect: "Suitors with faction ties get +5% acceptance odds.",
  },
  {
    id: "love-match",
    name: "Love match",
    effect: "Members marry for personal ties. No acceptance bonus.",
  },
  {
    id: "dowry-first",
    name: "Dowry first",
    effect: "Rich dowries sway acceptance, up to +15%.",
  },
];

function radioOption(opts: {
  name: string;
  value: string;
  label: string;
  effect: string;
  checked: boolean;
  testId: string;
  onPick: () => void;
}): HTMLElement {
  const input = h("input", {
    type: "radio",
    name: opts.name,
    value: opts.value,
    checked: opts.checked,
    "data-testid": opts.testId,
    "aria-label": opts.label,
  });
  input.addEventListener("change", () => {
    if (input.checked) opts.onPick();
  });
  return h(
    "label",
    { class: "laws__option" },
    input,
    h(
      "span",
      { class: "laws__option-text" },
      h("strong", { class: "label" }, opts.label),
      h("span", { class: "caption laws__effect" }, opts.effect),
    ),
  );
}

export function lawsPanel(options: LawsPanelOptions): LawsPanelHandle {
  const { root, body } = panel({
    title: "Clan laws",
    testId: "clan-laws-panel",
    onClose: options.onClose,
  });

  const inheritField = h("fieldset", { class: "laws__group" },
    h("legend", { class: "label laws__legend" }, "Inheritance"));
  const marriageField = h("fieldset", { class: "laws__group" },
    h("legend", { class: "label laws__legend" }, "Marriage policy"));
  const outlook = h("section", { class: "laws__outlook", "data-testid": "succession-outlook" },
    h("h3", { class: "label laws__legend" }, "Succession outlook"));
  const outlookBody = h("div");
  outlook.appendChild(outlookBody);

  const resetConfirm = h("div", { class: "laws__confirm", hidden: true },
    h("p", { class: "label" }, "Restore the ancient laws? Your changes are lost."),
    h("button", { type: "button", class: "btn btn--danger", "data-testid": "laws-reset-confirm" }, "Restore defaults"),
  );
  const resetBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "laws-reset" },
    "Restore ancient laws",
  );
  resetBtn.addEventListener("click", () => {
    resetConfirm.hidden = false;
  });
  resetConfirm
    .querySelector('[data-testid="laws-reset-confirm"]')
    ?.addEventListener("click", () => {
      options.onReset();
      resetConfirm.hidden = true;
      render();
    });

  body.append(inheritField, marriageField, outlook, resetBtn, resetConfirm);

  function render(): void {
    const laws = options.laws();

    // Remove and rebuild the radio groups so `checked` always reflects live state.
    inheritField.querySelectorAll("label").forEach((el) => el.remove());
    marriageField.querySelectorAll("label").forEach((el) => el.remove());

    for (const law of INHERITANCE_LAWS) {
      inheritField.appendChild(
        radioOption({
          name: "inheritance-law",
          value: law.id,
          label: law.name,
          effect: law.effect,
          checked: laws.inheritance === law.id,
          testId: `law-inheritance-${law.id}`,
          onPick: () => {
            options.onChange({ ...options.laws(), inheritance: law.id });
            render();
          },
        }),
      );
    }
    for (const policy of MARRIAGE_POLICIES) {
      marriageField.appendChild(
        radioOption({
          name: "marriage-policy",
          value: policy.id,
          label: policy.name,
          effect: policy.effect,
          checked: laws.marriagePolicy === policy.id,
          testId: `law-marriage-${policy.id}`,
          onPick: () => {
            options.onChange({ ...options.laws(), marriagePolicy: policy.id });
            render();
          },
        }),
      );
    }

    renderOutlook();
  }

  function renderOutlook(): void {
    const laws = options.laws();
    const roster = options.roster();
    outlookBody.replaceChildren();
    if (!roster) {
      outlookBody.appendChild(
        emptyState(
          "No clan roster recorded",
          "Record your clan members in the family tree and the outlook will name the heir under these laws.",
        ),
      );
      return;
    }
    let preview;
    try {
      preview = successionPreview(roster.rulerId, roster.members, laws, options.holdings());
    } catch {
      outlookBody.appendChild(
        emptyState(
          "No succession to preview",
          "The roster has no living children of the ruler, so there is no heir under any law.",
        ),
      );
      return;
    }
    const names = new Map(roster.members.map((m) => [m.id, m.name]));
    const heirName = names.get(preview.heirId) ?? preview.heirId;
    const lawName = INHERITANCE_LAWS.find((l) => l.id === preview.law)?.name ?? preview.law;

    const splitRows = Object.entries(preview.split).map(([holding, heirId]) =>
      h(
        "li",
        { class: "laws__split-row", "data-testid": "succession-split-row" },
        h("span", { class: "label" }, holding),
        h("span", { class: "caption" }, names.get(heirId) ?? heirId),
      ),
    );

    outlookBody.append(
      h("p", { class: "laws__heir", "data-testid": "succession-heir" },
        h("span", { class: "caption" }, `Under ${lawName}:`),
        h("strong", { class: "label" }, ` ${heirName}`),
      ),
      h("ol", { class: "laws__split", "data-testid": "succession-split" }, ...splitRows),
    );
  }

  render();

  let disposed = false;

  return {
    root,
    refresh() {
      if (!disposed) render();
    },
    dispose() {
      disposed = true;
      root.remove();
    },
  };
}
