/**
 * Tavern dice (Pax's tavern/games.ts, task block 6b7229ff). Bannerlord's
 * tavern game: stake gold against two regulars, best of three takes the pot.
 * The simulation owns the odds, the purse check, and the telling; this section
 * only offers the stakes and prints the telling verbatim. Doorless: there is
 * nothing to read first, so the stakes are on the table when the panel opens.
 */
import { h } from "../../dom.js";
import type { TownSectionSpec } from "../townSections.js";

const STAKES = [10, 25, 50] as const;

export const tavernDiceSectionSpec: TownSectionSpec<undefined> = {
  id: "dice",
  header: "Tavern dice",
  enterLabel: "Take a seat",
  loadingLabel: "Rolling...",
  failureLabel: "The game could not be played.",
  available: (options) => options.onPlayDice !== undefined,
  render: (list, _view, rt, options) => {
    const intro = h(
      "p",
      { class: "caption", "data-testid": "dice-intro", style: "margin:0 0 var(--space-3)" },
      "Two regulars wave you over to a barrel-top game \u2014 best of three, highest total takes the pot.",
    );
    list.appendChild(intro);

    for (const stake of STAKES) {
      const play = h(
        "button",
        { type: "button", class: "btn", "data-testid": `dice-stake-${stake}`, "aria-label": `Play dice for $${stake}` },
        `Stake $${stake}`,
      );
      play.addEventListener("click", () => {
        play.disabled = true;
        void options.onPlayDice!(stake).then(
          (result) => {
            rt.say(result.line);
            play.disabled = false;
          },
          (err: unknown) => {
            play.disabled = false;
            rt.say(err instanceof Error && err.message ? err.message : "The game refused.");
          },
        );
      });
      list.appendChild(play);
    }
  },
};
