/**
 * The orders the client knows how to ask for and the campaign server does not serve.
 *
 * This table is the single source of truth for that fact, and it lives in the shipped
 * bundle rather than in a test, because it is needed at runtime as much as it is needed
 * by a test:
 *
 *   - `apiContract.test.ts` reads it to build the allow-list of paths the server mounts
 *     no route for, so the test cannot drift from this file.
 *   - `SimulationProvider.servesOrder` reads it to answer "can the backend I am
 *     connected to carry this order out?", and the panels ask that before they draw a
 *     button.
 *
 * The second use is the one that matters to a player. A provider method can exist, be
 * fully implemented, be covered by passing tests and still 404 against a real server,
 * because no route is mounted for it. That is not hypothetical: the campaign map calls
 * `POST /v1/encounters/flee` and `POST /v1/encounters/defeat` when a battle ends badly,
 * and neither route was mounted, so every flee and every defeat failed while the fixture
 * provider the client is developed against implemented both perfectly well.
 *
 * So a panel is given an order callback only when the connected provider can actually
 * send it. Where the fixture is live every one of these works, because the fixture
 * implements them all, and the panels are unchanged. Against the campaign server the
 * control is not drawn at all, which is the same rule the panels already apply to data
 * they cannot act on: a button that can only fail is worse than no button, because it
 * tells the player an action exists that the world will not perform.
 *
 * `apiContract.test.ts` keeps the table honest from both ends. It fails if the server
 * mounts a route for a path listed here, and it fails if nothing in the client asks for
 * a path any more, so an entry has to be either genuinely unserved and genuinely
 * wanted, or deleted.
 */

/**
 * An order the campaign server mounts no route for.
 *
 * Named for what the player does, not for the path, so a panel says which order it is
 * offering and the path stays an implementation detail of this table.
 */
export type UnservedOrder =
  | "splitParty"
  | "mergeParty"
  | "recruitMilitia"
  | "buyWorkshop"
  | "sellWorkshop"
  | "listArmies"
  | "joinArmy"
  | "leaveArmy"
  | "disbandArmy"
  | "setArmyObjective"
  | "listWars"
  | "makePeace"
  | "listQuests"
  | "abandonQuest"
  | "commitCrime"
  | "payFine"
  | "marry"
  | "haveChild"
  | "killCharacter"
  | "setClanHeir"
  | "getHeldLords"
  | "ransomHeldLord"
  | "releaseHeldLord"
  | "executeHeldLord"
  | "getClanTier"
  | "foundKingdom"
  | "startCourtship"
  | "performCourtAction"
  | "proposeMarriage"
  | "getCourtships"
  | "sellPrisonersToBroker"
  | "playTavernDice"
  | "savePartyTemplate"
  | "getPartyTemplates"
  | "refitPartyToward"
  | "queueSiegeEngine"
  | "moveSiegeEngine"
  | "makeFireVariant"
  | "getSiegeEngines"
  | "getSmithingStamina"
  | "getInfluence"
  | "spendInfluenceAction";

/** What the table records about one unserved path. */
export interface UnservedPath {
  /** The client order that asks for this path. */
  readonly order: UnservedOrder;
  /**
   * The `SimulationProvider` method that sends this path.
   *
   * Recorded separately from `order` because the two names are not the same for four of
   * the twenty entries: `listArmies` is sent by `createArmy`, `listWars` by
   * `declareWar`, `listQuests` by `acceptQuest`, and `setClanHeir` by `getHeir`. Those
   * names describe the order a player would give; the method names describe the call
   * the client actually makes.
   *
   * It is written down here rather than left to be remembered because the gate that
   * withholds a control takes the order name and the body of that gate calls the method,
   * and TypeScript cannot connect the two. `order(provider, "listArmies", () =>
   * provider.createArmy(...))` type-checks perfectly well and 404s against a real
   * server, because the gate consulted the table for `listArmies` and decided, wrongly,
   * that it was withholding a call to `createArmy`. `apiContract.test.ts` now reads this
   * field and fails on any gate whose body calls some other method.
   */
  readonly method: string;
  /** Why the campaign server mounts no route for it. */
  readonly reason: string;
}

/**
 * Every path the client requests that the server does not mount, with the reason.
 *
 * Paths are written with Go's `{wildcard}` segments, which is the form the route table
 * in `api/api.go` uses, so an entry can be compared against a mounted route directly.
 *
 * Every entry is a debt somebody has to pay. The day the server mounts the route, delete
 * the line: `apiContract.test.ts` fails on a stale entry, which is what stops this table
 * from becoming a list that only ever grows.
 */
export const UNSERVED: Readonly<Record<string, UnservedPath>> = {
  "/v1/parties/split": {
    order: "splitParty",
    method: "splitParty",
    reason: "party split/merge is implemented in the client's fixture, with no server side yet",
  },
  "/v1/parties/{}/merge": {
    order: "mergeParty",
    method: "mergeParty",
    reason: "party split/merge is implemented in the client's fixture, with no server side yet",
  },
  "/v1/towns/{}/militia": {
    order: "recruitMilitia",
    method: "recruitMilitia",
    reason:
      "the server raises a town's militia into a party through POST /v1/recruit, and has no model for buying garrison troops, so there is no garrison order to send",
  },
  "/v1/towns/{}/workshops": {
    order: "buyWorkshop",
    method: "buyWorkshop",
    reason: "workshop purchase is implemented in the client's fixture, with no server side yet",
  },
  "/v1/workshops/{}/sell": {
    order: "sellWorkshop",
    method: "sellWorkshop",
    reason: "workshop sale is implemented in the client's fixture, with no server side yet",
  },
  "/v1/armies": {
    order: "listArmies",
    method: "createArmy",
    reason: "armies are implemented in the client's fixture, with no server side yet",
  },
  "/v1/armies/{}/join": {
    order: "joinArmy",
    method: "joinArmy",
    reason: "armies are implemented in the client's fixture, with no server side yet",
  },
  "/v1/armies/{}/leave": {
    order: "leaveArmy",
    method: "leaveArmy",
    reason: "armies are implemented in the client's fixture, with no server side yet",
  },
  "/v1/armies/{}/disband": {
    order: "disbandArmy",
    method: "disbandArmy",
    reason: "armies are implemented in the client's fixture, with no server side yet",
  },
  "/v1/armies/{}/objective": {
    order: "setArmyObjective",
    method: "setArmyObjective",
    reason: "armies are implemented in the client's fixture, with no server side yet",
  },
  "/v1/wars": {
    order: "listWars",
    method: "declareWar",
    reason: "wars are implemented in the client's fixture, with no server side yet",
  },
  "/v1/wars/{}/peace": {
    order: "makePeace",
    method: "makePeace",
    reason: "wars are implemented in the client's fixture, with no server side yet",
  },
  "/v1/quests": {
    order: "listQuests",
    method: "acceptQuest",
    reason: "quests are implemented in the client's fixture, with no server side yet",
  },
  "/v1/quests/{}/abandon": {
    order: "abandonQuest",
    method: "abandonQuest",
    reason: "quests are implemented in the client's fixture, with no server side yet",
  },
  "/v1/towns/{}/crime": {
    order: "commitCrime",
    method: "commitCrime",
    reason: "crime is implemented in the client's fixture, with no server side yet",
  },
  "/v1/towns/{}/fine": {
    order: "payFine",
    method: "payFine",
    reason: "crime is implemented in the client's fixture, with no server side yet",
  },
  "/v1/dynasty/marry": {
    order: "marry",
    method: "marry",
    reason: "the dynasty foundation landed client-side first; the server side is not written",
  },
  "/v1/dynasty/child": {
    order: "haveChild",
    method: "haveChild",
    reason: "the dynasty foundation landed client-side first; the server side is not written",
  },
  "/v1/dynasty/characters/{}/kill": {
    order: "killCharacter",
    method: "killCharacter",
    reason: "the dynasty foundation landed client-side first; the server side is not written",
  },
  "/v1/dynasty/clans/{}/heir": {
    order: "setClanHeir",
    method: "getHeir",
    reason: "the dynasty foundation landed client-side first; the server side is not written",
  },
  "/v1/courtship": {
    order: "getCourtships",
    method: "getCourtships",
    reason: "courtship landed client-side first; the server side is not written",
  },
  "/v1/courtship/start": {
    order: "startCourtship",
    method: "startCourtship",
    reason: "courtship landed client-side first; the server side is not written",
  },
  "/v1/courtship/action": {
    order: "performCourtAction",
    method: "performCourtAction",
    reason: "courtship landed client-side first; the server side is not written",
  },
  "/v1/courtship/propose": {
    order: "proposeMarriage",
    method: "proposeMarriage",
    reason: "courtship landed client-side first; the server side is not written",
  },
  "/v1/towns/{}/broker/sell": {
    order: "sellPrisonersToBroker",
    method: "sellPrisonersToBroker",
    reason: "ransom brokers landed client-side first; the server side is not written",
  },
  "/v1/towns/{}/tavern/dice": {
    order: "playTavernDice",
    method: "playTavernDice",
    reason: "tavern dice landed client-side first; the server side is not written",
  },
  "/v1/party/templates": {
    order: "savePartyTemplate",
    method: "savePartyTemplate",
    reason: "party templates landed client-side first; the server side is not written",
  },
  "/v1/party/templates/{}/refit": {
    order: "refitPartyToward",
    method: "refitPartyToward",
    reason: "party templates landed client-side first; the server side is not written",
  },
  "/v1/sieges/{}/engines": {
    order: "getSiegeEngines",
    method: "getSiegeEngines",
    reason: "siege engines landed client-side first; the server side is not written",
  },
  "/v1/sieges/{}/engines/queue": {
    order: "queueSiegeEngine",
    method: "queueSiegeEngine",
    reason: "siege engines landed client-side first; the server side is not written",
  },
  "/v1/sieges/{}/engines/move": {
    order: "moveSiegeEngine",
    method: "moveSiegeEngine",
    reason: "siege engines landed client-side first; the server side is not written",
  },
  "/v1/sieges/{}/engines/fire-variant": {
    order: "makeFireVariant",
    method: "makeFireVariant",
    reason: "siege engines landed client-side first; the server side is not written",
  },
  "/v1/smithing/stamina": {
    order: "getSmithingStamina",
    method: "getSmithingStamina",
    reason: "smithing stamina landed client-side first; the server side is not written",
  },
  "/v1/influence": {
    order: "getInfluence",
    method: "getInfluence",
    reason: "the influence economy landed client-side first; the server side is not written",
  },
  "/v1/influence/spend": {
    order: "spendInfluenceAction",
    method: "spendInfluenceAction",
    reason: "the influence economy landed client-side first; the server side is not written",
  },
  "/v1/lords": {
    order: "getHeldLords",
    method: "getHeldLords",
    reason: "lord capture and prisoner management are implemented in the client's fixture, with no server side yet",
  },
  "/v1/lords/{}/ransom": {
    order: "ransomHeldLord",
    method: "ransomHeldLord",
    reason: "lord capture and prisoner management are implemented in the client's fixture, with no server side yet",
  },
  "/v1/lords/{}/release": {
    order: "releaseHeldLord",
    method: "releaseHeldLord",
    reason: "lord capture and prisoner management are implemented in the client's fixture, with no server side yet",
  },
  "/v1/lords/{}/execute": {
    order: "executeHeldLord",
    method: "executeHeldLord",
    reason: "lord capture and prisoner management are implemented in the client's fixture, with no server side yet",
  },
  "/v1/clan/tier": {
    order: "getClanTier",
    method: "getClanTier",
    reason: "clan tiers are implemented in the client's fixture, with no server side yet",
  },
  "/v1/kingdom": {
    order: "foundKingdom",
    method: "foundKingdom",
    reason: "kingdom founding is implemented in the client's fixture, with no server side yet",
  },
};

/** The path an unserved order asks for, or undefined if the name is not one of them. */
export function unservedPath(order: string): string | undefined {
  for (const [path, entry] of Object.entries(UNSERVED)) {
    if (entry.order === order) return path;
  }
  return undefined;
}

/**
 * Whether the campaign server mounts a route for an unserved order.
 *
 * False for every order in the table today. It takes the order rather than the path so a
 * caller cannot pass a path that is not the one this table records, which would quietly
 * answer for a different order than the one asked about.
 */
export function servesOrder(order: string): boolean {
  return unservedPath(order) === undefined;
}
