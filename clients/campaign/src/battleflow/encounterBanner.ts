/**
 * The encounter banner: "Hostile force encountered!"
 *
 * The poller finds an encounter when the campaign server auto-triggers one
 * (`encounter_tick.go` scans party pairs every batch of ticks), and until now the
 * battle overlay simply appeared over the campaign map. That is the wrong shape for an
 * interruption: a fight the server decided to start, arriving on its own schedule, in a
 * campaign the player was in the middle of something else in.
 *
 * So the encounter is *offered* here first. A banner, politely announced, with the two
 * decisions that exist — meet it, or leave it — and a link into the battle UI that the
 * player takes. It never takes focus: the campaign is still the player's to drive until
 * they say otherwise.
 *
 * Two states share this surface because they are the same news in different clothing:
 * an encounter is waiting, or the server that would report one has stopped answering.
 * Both are visible; neither is silent (CONSTITUTION.md section 1.3).
 *
 * Offers queue. A second encounter that arrives while one is on screen waits its turn
 * rather than being dropped, because the server will keep it `pending` and offer it again.
 */

import { button, clear, h } from "../ui/dom.js";
import type { Encounter, EncounterSide } from "./types";

/** The headline, verbatim from the agent spec that asked for this surface. */
const HEADLINE = "Hostile force encountered!";

/**
 * How many offers are held while one is on screen.
 *
 * Bounded because the source is a poll: a server that has queued several encounters
 * must not be able to grow this without limit. Three is more than a player can act on
 * before the first is stale, and the rest stay `pending` on the server.
 */
export const MAX_QUEUED_OFFERS = 3;

export interface EncounterBannerOptions {
  /** The player's party id in the battle domain, so the banner names their own side. */
  playerPartyId: number;
  /** The player chose to meet the force. */
  onMeet: (encounter: Encounter) => void;
  /** The player left the fight alone; the encounter is still waiting on the server. */
  onDismiss?: (encounter: Encounter) => void;
}

export interface EncounterBannerHandle {
  readonly root: HTMLElement;
  /** The encounter on screen, or null. */
  readonly current: Encounter | null;
  /** How many offers are waiting behind the one on screen. */
  readonly queued: number;
  /** Offer an encounter. Queued when one is already on screen. */
  offer(encounter: Encounter): void;
  /** Report that polling is failing, in the player's words. */
  reportProblem(message: string): void;
  /** Take the offer down without offering it again: the player is already in the fight. */
  clear(): void;
  destroy(): void;
}

export function encounterBanner(
  options: EncounterBannerOptions
): EncounterBannerHandle {
  const root = h("div", {
    class: "encounter-banner",
    "data-testid": "encounter-banner",
    role: "status",
    // Polite, because a fight arriving while the player is mid-menu should wait for a
    // pause rather than talk over them.
    "aria-live": "polite",
    hidden: true,
  }) as HTMLElement;

  let current: Encounter | null = null;
  let waiting: Encounter[] = [];
  let problem: string | null = null;

  function render(): void {
    clear(root);
    if (current === null) {
      if (problem !== null) {
        root.appendChild(
          h(
            "p",
            { class: "encounter-banner__line", "data-testid": "encounter-problem" },
            problem,
          ),
        );
        root.hidden = false;
        return;
      }
      root.hidden = true;
      return;
    }
    root.appendChild(
      h(
        "p",
        { class: "encounter-banner__headline", "data-testid": "encounter-headline" },
        HEADLINE,
      ),
    );
    root.appendChild(
      h(
        "p",
        { class: "encounter-banner__line", "data-testid": "encounter-detail" },
        detailFor(current, options.playerPartyId),
      ),
    );
    const actions = h("div", { class: "encounter-banner__actions" });
    actions.append(
      button("Meet them", () => meet(), { variant: "primary", testId: "encounter-meet" }),
      button("Leave it", () => dismiss(), { variant: "quiet", testId: "encounter-dismiss" }),
    );
    root.appendChild(actions);
    if (waiting.length > 0) {
      root.appendChild(
        h(
          "p",
          { class: "encounter-banner__line", "data-testid": "encounter-queued" },
          waiting.length === 1
            ? "One more force is on the road."
            : `${waiting.length} more forces are on the road.`,
        ),
      );
    }
    root.hidden = false;
  }

  function meet(): void {
    const encounter = current;
    if (!encounter) return;
    // The battle UI takes the offer from here; the banner has nothing left to say.
    current = null;
    waiting = [];
    render();
    options.onMeet(encounter);
  }

  function dismiss(): void {
    const encounter = current;
    if (!encounter) return;
    current = waiting.shift() ?? null;
    render();
    options.onDismiss?.(encounter);
  }

  return {
    root,
    get current() {
      return current;
    },
    get queued() {
      return waiting.length;
    },
    offer(encounter) {
      problem = null;
      if (current === null) current = encounter;
      else if (waiting.length < MAX_QUEUED_OFFERS && !isQueued(encounter)) {
        waiting = [...waiting, encounter];
      }
      render();
    },
    reportProblem(message) {
      problem = message;
      render();
    },
    clear() {
      current = null;
      waiting = [];
      problem = null;
      render();
    },
    destroy() {
      current = null;
      waiting = [];
      root.remove();
    },
  };

  function isQueued(encounter: Encounter): boolean {
    return waiting.some((e) => e.id === encounter.id);
  }
}

/**
 * What the player is being asked to walk into, in one sentence.
 *
 * Both sides' troop counts, because the decision is whether to fight at all and the
 * first question about that is how many are waiting. The power figures are left to the
 * pre-battle screen, which is where a win chance can be drawn from them.
 */
function detailFor(encounter: Encounter, playerPartyId: number): string {
  const yours: EncounterSide | undefined =
    encounter.attacker.partyId === playerPartyId
      ? encounter.attacker
      : encounter.defender.partyId === playerPartyId
        ? encounter.defender
        : undefined;
  const other = yours === encounter.attacker ? encounter.defender : encounter.attacker;
  if (!yours) {
    return `${encounter.attacker.name} (${encounter.attacker.troops}) has met ${encounter.defender.name} (${encounter.defender.troops}) on the road.`;
  }
  return `Your ${yours.name} (${yours.troops}) has met ${other.name} (${other.troops}) on the road.`;
}