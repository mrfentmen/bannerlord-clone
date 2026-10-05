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
| Party ops | ~~setForcedMarch, attemptPrisonBreak, mergeParty, assignPartyRole~~ DONE 2026-10-04 (re-wired; getForcedMarch/getPartyCapacity/getPartySpeed are read-models the panel derives from the snapshot) | PartyPanel | b5c08b0f claimed forced march + prison break wired; lost in the 9fb5b0d4 restore |
| Party templates | ~~savePartyTemplate, getPartyTemplates, refitPartyToward~~ DONE 2026-10-04 | PartyPanel | Pax systems batch 6b7229ff |
| Quests | acceptQuest, abandonQuest (+ journal from snapshot.quests) | TownPanel quests tab (tasks 125-126) + quest journal | campaign/quests.ts |
| Dynasty | marry, haveChild, killCharacter, getHeir, startCourtship, performCourtAction, proposeMarriage, getCourtships | New dynasty/clan panel | 310c96d5, 4bea7fc8 |
| Clan power | getClanTier, foundKingdom, getHeldLords, ransomHeldLord, releaseHeldLord, executeHeldLord | RulerPanel | 7002ecb4 |
| Armies | createArmy, joinArmy, leaveArmy, disbandArmy, setArmyObjective | PartyPanel / army screen | provider only |
| Sieges | startSiege, assaultSiege, liftSiege, queueSiegeEngine, moveSiegeEngine, makeFireVariant, getSiegeEngines | Siege screen | Pax siege engines 6b7229ff |
| Diplomacy | declareWar, makePeace, signMercenaryContract, getMercenaryContract, breakMercenaryContract, defectClan | DiplomacyPanel | ec700fe1 wired mercenary sounds to a section the wipe removed; re-wire |
| Notables | talkToNotable, improveRelation | TownPanel notables | core; talk route is mounted live |
| Economy/crime | barterDeal, commitCrime, payFine, persuade, assignGovernor, getGovernor, sellPrisonersToBroker | Market / town / prisoner UI | 04bc30ec, 4bea7fc8 |
| Troops | upgradeTroops, awardBattleXp, applyBattleResult (verify battle-overlay path first) | PartyPanel | battle-xp routes mounted |

## 2. Client system modules nothing imports (re-audited 2026-10-04)

Re-audit verdicts: siege/engines (engine park UI, 5925f320),
troop/branches (training fork, c4d3621b), party/templates, tavern/games,
court/influence (realm influence, 7a11cf56), campaign/smithingStamina and
clan/tiers (fixture-backed reads) now have consumers. Still zero-consumer:
economy/mercenary and diplomacy/barter (the fixture providers own the
logic they re-implement), economy/workshopChains (a read-model the market
panel has not taken), campaign/quests and economy/governors (the modules
do not exist — the fixture implements quests and governors inline; the
backlog rows above describe the UI gap, not a module gap).

## 3. Server routes the client never references (36)

Bounties are wired (town bounty board); bandit camps still need a UI surface
(provider methods exist). The rest of this list is routes with no client
caller at all — need provider methods + wire validators + UI, not just a button.

- Bounty layer: GET /v1/bounties, POST /v1/bounties/{id}/claim — DONE, wired as the town bounty board
- Prisoner per-troop ops: POST /v1/prisoners/{id}/{ransom,recruit,release,execute} — DONE, all four wired (release/execute as party-panel buttons, task 153)
- Held-lord ops: POST /v1/lords/{name}/{ransom,release,execute}, GET heir
- Siege engine park: GET/POST /v1/sieges/{id}/engines/*, assault, lift, town siege start
- ~~Tavern dice~~ DONE: provider posts the live route and the tavern dice section is wired via the pipeline
- Interface hotkeys: party (P, task 141) and journal (J, task 766) — DONE, registry actions + main.ts handlers with the typing guard (2026-10-04)
- Party template refit route; companion role assignment; character kill
- Pause/resume, step-days, health check

## 4. Sound events nothing fires (45 of 73; was 49)

Bucket 8 wired four cues into flows Buffy owns: `soundTroopsFreed` (prison break that frees anyone), `soundGovernorAssigned` (governor appointment), `soundBirth` (dynasty birth), `soundDefection` (clan defection). The 8 gameSounds still without an honest trigger point, and why:
- `soundBarter` / `soundPersuasion`: the underlying sim features are unwired on purpose (no demand to barter against; no scenario to persuade in). Wire the cue with the feature.
- `soundCompanionDeath`: `killCharacter` has no UI (sim test hook only).
- `soundCavalryCharge` / `soundDuelExchange` / `soundDuelEnd`: combat and duel systems expose no client event surface — combat lane (Pax).
- `soundMercenaryPay`: contract pay accrues inside the sim; no discrete client event exists.
- `soundNpcBattle`: NPC battles resolve inside the sim; the snapshot carries no battle event.

Hana's cue map is complete; the game never calls the rest of it. Biggest clusters:
- UI chrome: ui.hover, ui.tab-switch, ui.back, ui.pause/resume, ui.panel-open/close, ui.map-open, ui.paper, ui.save/load, ui.gold-loss, ui.time-speed, ui.tutorial-ping
- Combat: hit-armour, shot, pistol, shotgun, wounded, horse, explosion, reload, dry-fire, formation, arrow-fire/hit, weapon-switch, artillery-distant, footstep, ambient-battle, rain-loop, suppressive-fire
- World: objective.update/accepted, level-up, skill-point, notification.critical, construction.complete, party.depart/arrive, siege.begun/wall-breach/ram, alarm.air-raid/gong, tavern.game-win/lose/crowd, market.trade

## Priority order (core loop first)

1. [DONE a9fc37b7] Party ops + templates (daily-play loop)
2. [DONE this commit] Quests tab + journal (tasks 125-128, section G)
3. [DONE this commit] Notables talk/relations (town social loop) — gift/favor are real routes; ask-recruits/ask-quest stay as the sim's own information lines until the contract grows an execution method
4. [DONE this commit] Dynasty + clan power panels (ClanPanel: family/heir/fiefs, courtship, tier + found kingdom, held lords)
5. [DONE this commit] Sieges + armies (war loop) — siege section live on town panel; armies read + ordered in ClanPanel (army routes not yet on the live server: orders fail with the transport's own message)
6. [DONE this commit] Diplomacy re-wire (sim wars + declare/peace + defection + mercenary contracts restored to DiplomacyPanel; refusal text no longer swallowed)
7. [MOSTLY DONE this commit] Economy/crime cluster — crime/fines + governor + ransom broker wired as town sections. Still unwired, on purpose: `barterDeal` (the sim never supplies a demand to barter against — a caller-invented demand would be a fake negotiation) and `persuade` (a bare charm roll with no scenario attached; wire it when a sim feature needs talking your way past something)
8. Troops verification, sound events (spread across all of the above)
9. [DONE this commit] Bandits/bounties client contract — getBounties/claimBounty/getBanditCamps/getBandits on the provider (live server already served the routes), bounty board as a town section, fixture loop refuse-on-live/defeat/claim-pays

Rule of engagement: sections pipeline (`ui/panels/townSections.ts`) for town
facilities; panel-option handlers elsewhere; the simulation owns every number
and every refusal; no fake.

## 5. Bannerlord canon comparison (fandom wiki scan, 2026-10-04)

Sources: Mount&Blade II main page, Fiefs page. Verdict per mechanic:
W = wired, M = made but unwired (see sections 1-3), N = needs making.

| Bannerlord mechanic | Verdict | Notes |
|---|---|---|
| Overland map, towns, travel, encounters | W | core loop live |
| Markets/trade, caravans, goods prices | W | TownPanel market + caravans |
| Workshops (buy, earn) | W | TownPanel workshops section |
| Tavern: recruit companions | W | tasks 115-117 |
| Tavern dice | W | pipeline e0bb0bf0 (fixture-only until server route wired) |
| Smithy: smelt/forge/stamina/crafting orders | W | 97cc9e78 (fixture-only) |
| Party: recruit/upgrade troops, food, morale, wages, forced march* | W*/M | *forced march was wired once, lost — re-wire |
| Prisoners: recruit/ransom via panel | W | recruitPrisoners/ransomPrisoners in PartyPanel |
| Quests | M | contract + fixture done; accept/abandon UI missing |
| Notables: talk, relations | M | routes mounted live; TownPanel has no talk/gift UI |
| Party templates (save/refit) | M | Pax systems batch |
| Influence: earn/spend (muster, vote, bribe, vassal, policy) | M | spend wired 2026-10-04 (Realm influence section in DiplomacyPanel, balance-gated buttons); vote/policy effects are still flavor strings — real council effects need making |
| Governors | M | 04bc30ec |
| Mercenary contracts | M | wired once (ec700fe1), lost in wipe; re-wire |
| Barter with lords | M | barterDeal engine done |
| Dynasty: marry, children, courtship, heir, execution | M | 310c96d5 + 4bea7fc8 |
| Clan tiers, found kingdom | M | 7002ecb4 |
| Held lords: ransom/release/execute | M | routes mounted live |
| Armies (create/join/objective) | M | provider only |
| Sieges (start/assault/lift) + engine park | ~~M~~ DONE 2026-10-04 | engine park wired into the siege section (queue/move/fire-variant through the provider, build order from siege/engines.ts) |
| Save/load over HTTP | ~~M~~ DONE 2026-10-04 | saves lane was always live (POST /v1/save, /v1/load); the panel's load hook now repaints the app from the restored world instead of throwing "not supported" |
| Bandits list/camps | M | provider methods exist (getBandits/getBanditCamps); camps UI has no surface and the fixture serves none — waiting on a map layer |
| Castles as a fief type | N | klass is city/town/village only |
| Fief ownership by the player/vassals (landed titles, ownership transfer after siege) | N | towns have holders but no player-owns-fief loop, no award vote |
| Perks (skill-tree perk selection) | N | skills 0-10 exist, no perks |
| Crafting part discovery (unlock pieces by smelting) | N | forge names/quality exist, no part unlocks |
| Tournaments | N | none |
| Village raiding with economic effect | N | raiders exist; raid loot/prosperity damage to villages does not |
| Garrison troop transfer (donate/take) | Y | donate DONE: leave troops from party into a held town's garrison (fixture provider; live sim has no route yet). Taking from garrison: no sim flow |
| Companions leading their own parties | N | roles exist (quartermaster/scout/surgeon/engineer, unwired) but no independent parties |
| Board games per faction | N | deliberately out — Americanization keeps dice (fine) |
| Civilian outfit / cosmetic layers | N | out of scope for this skin unless asked |

Read: the sim-lane muses have BUILT almost every Bannerlord system; the client
has wired about a third of it. Sections 1-3 of this file ARE the gap. The only
genuinely missing systems are the fief-ownership loop (castles, ownership,
award votes, garrison donation, raids; ownership transfer via siege victory IS
wired, garrison donation IS wired), perks, part discovery, tournaments,
and the bandit/bounty contract work (bounty board IS wired).
