/**
 * Intro story panel (Rowan solo task 5).
 *
 * Full-screen story beats on campaign start. Next/Back through the beats,
 * Skip intro any time, Begin at the end. Escape skips. The host persists the
 * skip and starts the campaign.
 */

import { h } from "../ui/dom.js";
import { panel } from "../ui/kit.js";
import { createIntroStory, type StoryBeat } from "./introStory.js";

export interface IntroStoryPanelOptions {
  beats?: StoryBeat[];
  onBegin: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function introStoryPanel(options: IntroStoryPanelOptions): HTMLElement {
  const story = createIntroStory(options.beats);
  const { root, body } = panel({
    title: "A New Campaign",
    testId: "intro-story",
    onClose: options.onClose,
  });
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");

  const beatEl = h("div", { class: "intro__beat", "data-testid": "intro-beat" });
  const render = (): void => {
    const beat = story.beats()[story.index()]!;
    beatEl.replaceChildren(
      h("h2", { "data-testid": "intro-heading" }, beat.heading),
      h("p", { "data-testid": "intro-body" }, beat.body),
      h(
        "p",
        { class: "caption", "data-testid": "intro-progress" },
        `Part ${story.index() + 1} of ${story.beats().length}`,
      ),
    );
    nextBtn.textContent = story.atEnd() ? "Begin the campaign" : "Next";
  };

  const backBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "intro-back" },
    "Back",
  );
  backBtn.addEventListener("click", () => {
    story.back();
    render();
  });
  const nextBtn = h(
    "button",
    { type: "button", class: "btn btn--primary", "data-testid": "intro-next" },
    "Next",
  );
  nextBtn.addEventListener("click", () => {
    if (story.atEnd()) {
      options.onBegin();
      return;
    }
    story.next();
    render();
  });
  const skipBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "intro-skip" },
    "Skip intro",
  );
  skipBtn.addEventListener("click", () => {
    story.skip();
    options.onSkip();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      story.skip();
      options.onSkip();
    }
  });

  body.append(beatEl, h("div", { class: "intro__actions" }, backBtn, skipBtn, nextBtn));
  render();
  return root;
}
