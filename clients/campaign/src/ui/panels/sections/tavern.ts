/**
 * The tavern section spec (tasks 115-117). The roster is fetched when the
 * player steps inside; the simulation owns the roster, the price, and every
 * refusal. First facility on the town-sections pipeline.
 */
import { h } from "../../dom.js";
import type { TavernCompanion } from "../../../data/types.js";
import type { TownPanelOptions } from "../TownPanel.js";
import { sectionEmpty, type TownSectionRuntime, type TownSectionSpec } from "../townSections.js";

/** What the companion wants before joining, in the simulation's own terms. */
function tavernWant(comp: TavernCompanion): string {
  const value = Math.round(comp.recruitValue).toLocaleString("en-US");
  if (comp.recruitKind === "gold") return `$${value} up front`;
  if (comp.recruitKind === "reputation") return `renown ${value}`;
  return `${value} battle win${comp.recruitValue === 1 ? "" : "s"}`;
}

function tavernRow(comp: TavernCompanion, options: TownPanelOptions, rt: TownSectionRuntime): HTMLElement {
  const card = h("div", { class: "field-row", "data-testid": `tavern-companion-${comp.id}`, style: "margin-bottom:var(--space-3)" });

  const head = h("div");
  const name = h("strong", {}, comp.name);
  const wage = h("span", { class: "caption", style: "margin-left:var(--space-2)" }, `$${Math.round(comp.wageDaily).toLocaleString("en-US")}/day`);
  head.append(name, wage);

  const facts: string[] = [];
  if (comp.traits.length > 0) facts.push(comp.traits.join(", "));
  const skills = Object.entries(comp.skills)
    .map(([skill, level]) => `${skill.charAt(0).toUpperCase()}${skill.slice(1)} ${Math.round(level)}`)
    .join(" \u00b7 ");
  if (skills) facts.push(skills);
  const detail = h("p", { class: "caption", style: "margin:0" }, facts.join(" \u2014 "));

  const story = h("p", { class: "caption", style: "margin:0" }, comp.backstory);

  const want = tavernWant(comp);
  const hire = h(
    "button",
    { type: "button", class: "btn", "data-testid": `tavern-hire-${comp.id}`, "aria-label": `Hire ${comp.name} for ${want}` },
    `Hire ${comp.name} \u2014 ${want}`,
  );
  hire.disabled = !comp.available;
  hire.addEventListener("click", () => {
    hire.disabled = true;
    void options.onHireCompanion!(comp.id).then(
      () => {
        rt.say(`${comp.name} signed on. $${Math.round(comp.wageDaily).toLocaleString("en-US")} joins the daily bill.`);
        rt.reload();
      },
      (err: unknown) => {
        hire.disabled = false;
        // The simulation's own refusal is the message: a short purse, a name
        // not yet known, a fight not yet won. Shown verbatim, not paraphrased.
        rt.say(err instanceof Error && err.message ? err.message : "They declined.");
      },
    );
  });

  card.append(head, detail, story, hire);
  return card;
}

export const tavernSectionSpec: TownSectionSpec<TavernCompanion[]> = {
  id: "tavern",
  header: "Tavern",
  enterLabel: "Step inside",
  loadingLabel: "Reading the room...",
  failureLabel: "The tavern roster could not be read.",
  available: (options) => options.onLoadTavern !== undefined && options.onHireCompanion !== undefined,
  load: (options) => options.onLoadTavern!(),
  render: (list, roster, rt, options) => {
    if (roster.length === 0) {
      list.appendChild(sectionEmpty("tavern", "The benches are empty.", "Nobody in this tavern is looking for work tonight."));
      return;
    }
    for (const comp of roster) list.appendChild(tavernRow(comp, options, rt));
  },
};
