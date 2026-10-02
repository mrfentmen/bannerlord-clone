/**
 * Campaign score panel (Rowan solo task 4).
 *
 * The chronicle's verdict: three category bars, the total, and the rank
 * title. Rendered at campaign end alongside victory/defeat/retirement.
 */

import { h } from "../ui/dom.js";
import { panel } from "../ui/kit.js";
import { scoreCampaign, type CampaignScoreInput } from "./campaignScore.js";

export interface ScorePanelOptions {
  input: () => CampaignScoreInput;
  onClose: () => void;
}

export function scorePanel(options: ScorePanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Campaign Score",
    testId: "score-panel",
    onClose: options.onClose,
  });

  const score = scoreCampaign(options.input());
  const max = Math.max(1, ...score.categories.map((c) => c.points));

  body.appendChild(
    h("h2", { class: "score__rank", "data-testid": "score-rank" }, score.rank),
  );
  body.appendChild(
    h("p", { class: "score__total", "data-testid": "score-total" }, `Total: ${score.total}`),
  );

  const list = h("ul", { class: "score__categories", "data-testid": "score-categories" });
  for (const cat of score.categories) {
    const bar = h("div", {
      class: "score__bar",
      role: "img",
      "aria-label": `${cat.name}: ${cat.points} points`,
    });
    const fill = h("div", { class: "score__fill" });
    fill.style.width = `${Math.round((cat.points / max) * 100)}%`;
    bar.appendChild(fill);
    const item = h("li", { class: "score__category" });
    item.append(
      h("strong", {}, `${cat.name}: ${cat.points}`),
      bar,
      h("small", { class: "caption" }, cat.lines.join(" · ")),
    );
    list.appendChild(item);
  }
  body.appendChild(list);

  return root;
}
