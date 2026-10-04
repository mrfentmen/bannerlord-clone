# WIRING_BACKLOG.md

Everything simulated but unreachable by the player. Audit method (2026-10-04):
94 provider methods in `types.ts` scanned against all 579 non-test client
files outside the data layer; server routes in `api/api.go` scanned against the
client's fetch surface; `soundEvents.ts` entries scanned against fire sites.
Update the numbers when you clear a bucket.

## 1. Provider methods with no UI caller (60 of 92)

Every method below has a fixture implementation and (where mounted) a live
route. UI is the only missing half.

| Bucket | Methods | Home | Sim/fixture source |
|---|---|---|---|
| Party ops | setForcedMarch, getForcedMarch, attemptPrisonBreak, mergeParty, assignPartyRole, getPartyCapacity, getPartySpeed | PartyPanel | b5c08b0f claimed forced march + prison break wired; lost in the 9fb5b0d4 restore |
| Party templates | savePartyTemplate, getPartyTemplates, refitPartyToward | PartyPanel | Pax systems batch 6b7229ff |
| Quests | acceptQuest, abandonQuest (+ journal from snapshot.quests) | TownPanel quests tab (tasks 125-126) + quest journal | campaign/quests.ts |
| Dynasty | marry, haveChild, killCharacter, getHeir, startCourtship, performCourtAction, proposeMarriage, getCourtships | New dynasty/clan panel | 310c96d5, 4bea7fc8 |
| Clan power | getClanTier, foundKingdom, getHeldLords, ransomHeldLord, releaseHeldLord, executeHeldLord | RulerPanel | 7002ecb4 |
| Armies | createArmy, joinArmy, leaveArmy, disbandArmy, setArmyObjective | PartyPanel / army screen | provider only |
| Sieges | startSiege, assaultSiege, liftSiege, queueSiegeEngine, moveSiegeEngine, makeFireVariant, getSiegeEngines | Siege screen | Pax siege engines 6b7229ff |
| Diplomacy | declareWar, makePeace, signMercenaryContract, getMercenaryContract, breakMercenaryContract, defectClan | DiplomacyPanel | ec700fe1 wired mercenary sounds to a section the wipe removed; re-wire |
| Notables | talkToNotable, improveRelation | TownPanel notables | core; talk route is mounted live |
| Economy/crime | barterDeal, commitCrime, payFine, persuade, assignGovernor, getGovernor, sellPrisonersToBroker | Market / town / prisoner UI | 04bc30ec, 4bea7fc8 |
| Troops | upgradeTroops, awardBattleXp, applyBattleResult (verify battle-overlay path first) | PartyPanel | battle-xp routes mounted |

## 2. Client system modules nothing imports (12)

Real implementations, zero consumers outside their own directory and tests.
Each needs either a UI caller or an owner's decision that the provider method
above already covers it:

economy/workshopChains, troop/branches, siege/engines, tavern/games,
party/templates, campaign/smithingStamina (fixture uses it; UI reads snapshot
only), court/influence, economy/mercenary, economy/governors,
economy/craftingOrders, economy/barter, clan/defection, campaign/quests,
clan/tiers.

## 3. Server routes the client never references (36)

Bandits/bounties are server-ONLY: not in the client contract at all — need
provider methods + wire validators + UI, not just a button.

- Bandit layer: GET /v1/bandits, GET /v1/bandits/camps
- Bounty layer: GET /v1/bounties, POST /v1/bounties/{id}/claim
- Prisoner per-troop ops: POST /v1/prisoners/{id}/{ransom,recruit,release,execute}
- Held-lord ops: POST /v1/lords/{name}/{ransom,release,execute}, GET heir
- Siege engine park: GET/POST /v1/sieges/{id}/engines/*, assault, lift, town siege start
- Save/load over HTTP: POST /v1/save, POST /v1/load (client saves are local-only)
- Tavern dice: POST /v1/towns/{id}/tavern/dice (UI now exists via the pipeline; provider still fixture-only)
- Party template refit route; companion role assignment; character kill
- Pause/resume, step-days, health check

## 4. Sound events nothing fires (49 of 73)

Hana's cue map is complete; the game never calls most of it. Biggest clusters:
- UI chrome: ui.hover, ui.tab-switch, ui.back, ui.pause/resume, ui.panel-open/close, ui.map-open, ui.paper, ui.save/load, ui.gold-loss, ui.time-speed, ui.tutorial-ping
- Combat: hit-armour, shot, pistol, shotgun, wounded, horse, explosion, reload, dry-fire, formation, arrow-fire/hit, weapon-switch, artillery-distant, footstep, ambient-battle, rain-loop, suppressive-fire
- World: objective.update/accepted, level-up, skill-point, notification.critical, construction.complete, party.depart/arrive, siege.begun/wall-breach/ram, alarm.air-raid/gong, tavern.game-win/lose/crowd, market.trade

## Priority order (core loop first)

1. Party ops + templates (daily-play loop)
2. Quests tab + journal (task 125-126, section G)
3. Notables talk/relations (town social loop)
4. Dynasty + clan power panels (the Bag-felle loop)
5. Sieges + armies (war loop)
6. Diplomacy re-wire (mercenary contracts were wiped once already)
7. Economy/crime cluster
8. Troops verification, sound events (spread across all of the above)
9. Bandits/bounties (needs contract work, not just UI)

Rule of engagement: sections pipeline (`ui/panels/townSections.ts`) for town
facilities; panel-option handlers elsewhere; the simulation owns every number
and every refusal; no fake.
