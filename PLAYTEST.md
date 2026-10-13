# PLAYTEST.md

How to playtest the Bannerlord Clone. For humans, not automated tests.

---

## Setup

1. Deploy via `DEPLOY.md` OR run locally:
   ```bash
   cd clients/campaign && npm run dev
   ```
2. Open in Chrome (best WebGL support)
3. Open DevTools console (to catch errors)
4. Have this checklist open

---

## The Core Loop Test

This is the minimum viable game. If this doesn't work, nothing else matters.

### 1. Start a Campaign (5 min)
- [ ] Start screen loads with faction select
- [ ] Pick a faction (try Great Lakes Union - easiest)
- [ ] Pick a state (try Iowa - food rich)
- [ ] Create character (any options)
- [ ] Campaign map loads with 3D terrain
- [ ] **Music plays** (menu theme → ambient exploration)
- [ ] HUD appears with party info

**Breaks?** Note exactly where. Screenshot the console.

### 2. March Somewhere (10 min)
- [ ] Click a nearby town to select it
- [ ] Open March Planner
- [ ] Plan a route to the town
- [ ] Confirm the march
- [ ] Party moves on the map (3D marker moves)
- [ ] Time passes, food decreases
- [ ] Arrive at destination

**Breaks?** Does the party move? Does time pass? Does food drain?

### 3. Fight a Battle (15 min)
- [ ] Find bandits or hostile party (or use debug to spawn)
- [ ] Initiate battle
- [ ] Pre-battle screen shows forces
- [ ] **Battle music starts**
- [ ] Deploy troops
- [ ] Give orders (right-click move, A+attack-move)
- [ ] Battle plays out in 3D
- [ ] **Victory fanfare** plays on win
- [ ] After-action shows casualties, loot
- [ ] Return to campaign map, **ambient music resumes**

**Breaks?** Do orders work? Do units move? Does the battle end?

### 4. Trade in a Market (10 min)
- [ ] Open town panel
- [ ] Open Market tab
- [ ] See goods with prices and trends
- [ ] Buy something (click Buy)
- [ ] **Click sound plays**
- [ ] Purse decreases, inventory increases
- [ ] Sell something
- [ ] Purse increases

**Breaks?** Do prices make sense? Does inventory update?

### 5. Manage Your Party (10 min)
- [ ] Open Party panel
- [ ] See troop list with counts, morale, wages
- [ ] Recruit new troops (if available)
- [ ] Check food stock and daily consumption
- [ ] **Warning appears** if food will run out

**Breaks?** Are numbers sane? Do troops desert if unpaid?

### 6. Save and Load (5 min)
- [ ] Open Game Menu
- [ ] Save game (name it "playtest1")
- [ ] Make a change (buy something, move somewhere)
- [ ] Load "playtest1"
- [ ] **State is restored** (position, inventory, purse)

**Breaks?** Does save work? Does load restore correctly?

---

## Extended Tests

### Diplomacy
- [ ] Open Diplomacy panel
- [ ] See faction relations
- [ ] Propose a trade deal or alliance
- [ ] AI responds (accept/reject/counter)

### Quests
- [ ] Open Quest Journal
- [ ] See available quests
- [ ] Accept a quest
- [ ] Complete quest objective
- [ ] Turn in for reward

### Sieges
- [ ] Attack a walled town
- [ ] Siege interface appears
- [ ] Choose: assault, starve, or negotiate
- [ ] Resolve the siege

### Character Progression
- [ ] Fight battles, gain XP
- [ ] Level up a skill
- [ ] Unlock a perk
- [ ] Perk has visible effect

---

## What to Record

For each break:
1. **What you did** (exact steps)
2. **What you expected** (what should happen)
3. **What happened** (what actually happened)
4. **Console errors** (copy from DevTools)
5. **Screenshot** (if visual)

---

## Performance Check

- [ ] Open `?perf=1` (performance overlay)
- [ ] Note FPS on campaign map
- [ ] Start a battle with 100+ units
- [ ] Note FPS in battle
- [ ] **Target:** 60fps campaign, 30fps battle (100 units)

---

## Audio Check

- [ ] Menu theme on start screen
- [ ] Ambient music on campaign map
- [ ] Battle theme in combat
- [ ] Victory/defeat stingers
- [ ] UI clicks on buttons
- [ ] **No audio glitches** (pops, cuts, overlaps)

---

## The "Fun" Test

After the technical stuff, ask:
- [ ] Did I understand what to do?
- [ ] Did I feel like my choices mattered?
- [ ] Was I surprised by anything (good)?
- [ ] Was I frustrated by anything (bad)?
- [ ] Would I play for another hour?

Be honest. The game needs to be fun, not just functional.
