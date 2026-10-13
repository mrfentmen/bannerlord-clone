/**
 * Reading the campaign's party ids as battle-domain ids.
 *
 * `POST /v1/encounters` takes two integers: the attacker's and the defender's
 * `model.Party` id, the key the campaign holds its parties under. The two
 * routes that name a party write it two different ways, and the difference is
 * the whole reason this module exists.
 *
 * - `GET /v1/parties/nearby` answers with `strconv.Itoa(p.ID)` -- a bare
 *   decimal string, `"7"`. `campaign.NearbyParties` says so in a comment:
 *   the row carries "the party's simulation id, because this is the id the
 *   rest of the battle surface takes", and notes it used to be the party's
 *   *name*, "which meant the client had no id it could put in an encounter
 *   request and had to invent one."
 * - The snapshot's own `party.id` is an entity id, `party-7`
 *   (`EntityID(model.KindParty, c.party)`).
 *
 * So a party arrives by one spelling or the other, and a parser for one does
 * not read the other. The id used to be invented client-side -- `hashNpcId`
 * hashed the string and offset it by 1000 -- which the server had never heard
 * of, so `POST /v1/encounters` came back `defender party 1049 not found`.
 *
 * Both parsers answer {@link NOT_A_BATTLE_PARTY} for anything that is not a
 * battle-domain id, rather than guessing. A caller that gets it must not send
 * it to the server: the fixture's parties are named things like `npc-raid-3`
 * and have no `model.Party` id at all, and asking the campaign to fight
 * `npc-raid-3` would be a request for a party that does not exist.
 */

/** The answer for an id that is not a party's id in the battle domain. */
export const NOT_A_BATTLE_PARTY = -1;

/**
 * The battle-domain party id of the player's own party, from the snapshot's
 * `party-<n>` entity id.
 *
 * {@link NOT_A_BATTLE_PARTY} when the id is absent or spelled some other way,
 * which is what the fixture sends (`"party-player"`).
 */
export function playerBattlePartyId(id: string | undefined): number {
  const m = typeof id === "string" ? /^party-(\d+)$/.exec(id) : null;
  return m ? Number(m[1]) : NOT_A_BATTLE_PARTY;
}

/**
 * The battle-domain party id of a force from `GET /v1/parties/nearby`, whose
 * `id` is a bare decimal string.
 *
 * Only a whole non-negative decimal counts. `Number.parseInt` would read
 * `"7abc"` as `7` and `" 7"` as `7`, so a malformed id would become a real
 * party id and the encounter would be raised against the wrong party -- a
 * worse failure than refusing, because it is invisible.
 */
export function nearbyPartyBattleId(id: string): number {
  return /^\d+$/.test(id) ? Number(id) : NOT_A_BATTLE_PARTY;
}

/**
 * Whether both sides can be named to the server, so `POST /v1/encounters`
 * can be sent a request it will accept.
 *
 * The campaign refuses an encounter naming a party it does not hold, so a
 * client holding one bad half has no valid request to make and must run the
 * local drill instead of inventing the missing half.
 */
export function canNameEncounter(
  attackerPartyId: number,
  defenderPartyId: number
): boolean {
  return (
    Number.isInteger(attackerPartyId) &&
    Number.isInteger(defenderPartyId) &&
    attackerPartyId >= 0 &&
    defenderPartyId >= 0
  );
}
