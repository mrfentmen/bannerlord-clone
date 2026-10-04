/**
 * The bounty board (Phase 2: bandits/bounties client contract). A door section:
 * stepping inside reads the town-posted bounties through the caller. Each row
 * names the bandit party, its read strength, the reward, and where it was last
 * seen; the Claim order posts to the simulation, which pays only when the
 * party is destroyed — a live target refuses verbatim and the button re-arms.
 */
import { h } from "../../dom.js";
import type { BountyOffer } from "../../../data/types.js";
import { sectionEmpty, type TownSectionRuntime, type TownSectionSpec } from "../townSections.js";

export const townBountySectionSpec: TownSectionSpec<BountyOffer[]> = {
  id: "bounty",
  header: "Bounty board",
  enterLabel: "Read the bounty board",
  loadingLabel: "Reading the bounties...",
  failureLabel: "The bounty board could not be read.",
  available: (options) => options.onGetBounties !== undefined && options.onClaimBounty !== undefined,
  load: (options) => options.onGetBounties!(),
  render: (list, bounties, rt: TownSectionRuntime, options) => {
    if (bounties.length === 0) {
      list.appendChild(sectionEmpty("bounty", "No bounties posted.", "The towns have no work for bounty hunters tonight."));
      return;
    }
    for (const b of bounties) {
      const card = h("div", { class: "field-row", "data-testid": `bounty-${b.id}`, style: "margin-bottom:var(--space-3)" });
      card.append(
        h("div", {},
          h("strong", { class: "label" }, `${b.banditName} — $${Math.round(b.reward).toLocaleString("en-US")}`),
          h("p", { class: "caption", style: "margin:0" },
            `${b.banditType} \u00b7 read strength ~${Math.round(b.strengthEstimate)} \u00b7 last seen (${Math.round(b.lastKnown.x)}, ${Math.round(b.lastKnown.y)})`),
        ),
      );
      const claim = h("button", { type: "button", class: "btn", "data-testid": `bounty-claim-${b.id}` }, "Claim");
      claim.addEventListener("click", () => {
        claim.disabled = true;
        void options.onClaimBounty!(b.id).then(
          (r) => {
            rt.say(`The bounty is paid: $${Math.round(r.reward).toLocaleString("en-US")}.`);
            rt.reload();
          },
          (err: unknown) => {
            claim.disabled = false;
            rt.say(err instanceof Error && err.message ? err.message : "The bounty could not be claimed.");
          },
        );
      });
      card.append(claim);
      list.append(card);
    }
  },
};
