/**
 * Tasks 118-119: tooltips and the help overlay.
 *
 * Tooltip registry: every major UI element registers an id + tooltip text.
 * The coverage check lists registered ids against the required set so a
 * test can fail when a new screen ships without tooltips.
 *
 * Help overlay: press H on any screen; the overlay shows the help topics
 * for that screen.
 */

export interface TooltipRegistry {
  register(id: string, text: string): void;
  textFor(id: string): string | null;
  registeredIds(): string[];
  /** Ids in `required` that have no tooltip. */
  missing(required: string[]): string[];
}

export function createTooltipRegistry(): TooltipRegistry {
  const tips = new Map<string, string>();
  return {
    register(id, text) {
      tips.set(id, text);
    },
    textFor: (id) => tips.get(id) ?? null,
    registeredIds: () => [...tips.keys()],
    missing: (required) => required.filter((id) => !tips.has(id)),
  };
}

/** UI ids that must have tooltips before a screen is considered done. */
export const REQUIRED_TOOLTIPS = [
  "party-banner",
  "move-order",
  "attack-order",
  "charge-order",
  "retreat-order",
  "tax-rate",
  "recruit-button",
  "feast-host",
  "treaty-builder",
  "spy-post",
  "scheme-planner",
  "alliance-offer",
  "workshop-buy",
  "caravan-fund",
  "heir-designate",
  "banner-designer",
  "tutor-assign",
  "petition-resolve",
  "trial-verdict",
  "summit-vote",
];

export interface HelpTopic {
  screen: string;
  title: string;
  body: string;
}

const HELP_TOPICS: HelpTopic[] = [
  { screen: "map", title: "Campaign map", body: "Move parties, manage fiefs, and watch the seasons turn. H opens this help anywhere." },
  { screen: "battle", title: "Battle", body: "Command groups with number keys, issue orders with right-click, F charges, R retreats." },
  { screen: "clan", title: "Clan", body: "Manage your family tree, marriages, heirs, banners, and companions." },
  { screen: "court", title: "Court", body: "Hold feasts, judge trials, answer petitions, and pass edicts with your council." },
  { screen: "economy", title: "Economy", body: "Watch prices, fund caravans, run workshops, set taxes, and mind the ledger." },
  { screen: "diplomacy", title: "Diplomacy", body: "Send envoys, negotiate alliances, sign pacts, and hold summits." },
  { screen: "espionage", title: "Espionage", body: "Place spies, run schemes, recruit informants, and decode messages." },
];

export function helpFor(screen: string): HelpTopic[] {
  return HELP_TOPICS.filter((t) => t.screen === screen);
}

export function helpScreens(): string[] {
  return [...new Set(HELP_TOPICS.map((t) => t.screen))];
}
