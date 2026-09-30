# UI_UX.md

Screens, flows, and interface rules. Visual style is in ART_AND_AUDIO.md. Rules from CONSTITUTION.md section 3 apply: no generic look, no spinners (skeleton states only), UI copy reads like a real game.

---

## 1. DESIGN PRINCIPLES

- **Legibility of cause and effect.** Every number that matters is inspectable, and every bad outcome can be explained through the Why panel.
- **Warn early.** Shortages and threats appear before they hit zero.
- **Dense but readable.** Strategy games need information. Group it, layer it, and let players drill down.
- **Fast to act.** Common actions take few clicks. Time controls are always reachable.
- **Period tone.** Interface elements should feel like the era (printed forms, radio dials, typewritten reports), not sci-fi.

## 2. SCREEN LIST

| Screen | Purpose | Tier |
|---|---|---|
| Main menu | New game, load, settings, credits | V1 |
| New game flow | Era and start year, side, state, role, character creation | V1 |
| Campaign map (HUD) | Main play view | V1 |
| Party screen | Troops, roles, companions, prisoners, wages | V1 |
| Inventory screen | Items, vehicles, cargo, fuel | V1 |
| Town screen | Population, food, health, unrest, projects, notables, market | V1 |
| Market screen | Buy, sell, price history | V1 |
| Character screen | Attributes, skills, perks, traits | V1 |
| Quest log | Active, completed, failed | V1 |
| Ruler roster and card | Filter, sort, details, relations | V1 |
| Diplomacy screen | Wars, peace, alliances, offers | V1 |
| March planner | Route, time, cost, supply preview | V1 |
| Ledger | Income and expense lines | V1 |
| Why panel | Cause chains for any event | V1 |
| Battle HUD | Formations, orders, ammo, health, minimap | V1 |
| Aftermath report | Casualties, loot, prisoners, changes | V1 |
| Encyclopedia | Rulers, sides, places, units, items | V2 |
| Policy screen | Kingdom policies and votes | V2 |
| Family screen | Spouse, children, heirs | V2 |

## 3. NEW GAME FLOW

1. Choose start year or scenario decade (ERA.md section 7).
2. Choose side. The screen shows ratings, pros, cons, and the biggest danger (FACTIONS.md section 7), recomputed for the chosen year.
3. Choose state.
4. Choose starting role.
5. Character creation questions (CHARACTER.md section 1).
6. Confirm with a summary and start.

Every step allows going back. Skeleton loading shows while world data streams in.

## 4. CAMPAIGN MAP HUD

- **Top bar:** date, time controls (pause, normal, fast), money, gold, food, metal, fuel (once adopted), influence, renown.
- **Left:** party summary, days of food, fuel, and ammo, morale.
- **Right:** context panel for the selected town, party, or ruler.
- **Bottom:** notifications and quick menu.
- **Map overlays** (toggle): side ownership, food, unrest, disease, supply, road safety, infrastructure condition, media trust.
- **Selection:** click a town, party, or route to see details and available actions.
- **Map speed:** pause is always one key. Pausing is allowed anywhere on the map.

## 5. THE WHY PANEL (required feature)

Available from any event, warning, or value. Shows a chain:

```
Town voted you out
  <- loyalty below 0.2 for 12 days
     <- unrest at 0.8
        <- food at zero for 9 days
           <- fuel convoy raided on Route 9
```

Rules:
- Each line links to the underlying entity and time.
- The player can expand a line to see the exact values and the system that wrote them.
- Chains are truncated at a readable depth with an option to expand.
- Reads directly from the cause log (CAUSE_EFFECT.md section 4).

## 6. TOWN SCREEN

Sections: population and workers, food and supply days, health (infection, medicine), sanitation and infrastructure, unrest and loyalty, media trust, garrison, projects queue, notables and quests, market link.

Every gauge shows its current value, trend arrow, and days until problem. Hover to see contributing factors.

## 7. MARCH PLANNER

- Select destination, see the route, travel time, and daily cost.
- Show total food, money, fuel, and ammo use, with days of supply remaining.
- Warn when supplies are short or a route crosses dangerous ground.
- Allow splitting the party and choosing routes.

## 8. BATTLE HUD

- Health, stamina, ammo, and weapon.
- Formation panel with quick commands and formation status.
- Morale indicators per formation.
- Minimap with friendly and known enemy positions.
- Tactical overview toggle for issuing orders.
- Minimal clutter, with the option to hide elements.

## 9. NOTIFICATIONS

- Priority tiers: critical (town falling, army in danger), important (shortage soon, war declared), informational.
- Critical alerts interrupt and pause (configurable). Others queue.
- Each notification links to the Why panel or the relevant screen.
- No notification spam. Repeated alerts merge.

## 10. LOADING AND ERROR STATES

- Skeleton loading for all data-driven panels (no spinners).
- Errors show a plain message and a way to recover, and log details for developers (CONSTITUTION.md section 1).

## 11. CONTROLS

- Keyboard and mouse first, with full rebinding.
- Gamepad support later.
- Consistent hotkeys across screens (map, party, inventory, character, quests, ledger).

## 12. ACCESSIBILITY

- Color-blind safe palettes for overlays and status colors, with shape or pattern redundancy.
- Adjustable text size and UI scale.
- Subtitles for any voiced or broadcast audio.
- Optional reduced camera shake and screen effects.
- Clear contrast in all UI text.

## 13. PLATFORMS

- Desktop browsers are the target.
- Mobile is out of scope for V1.
- Minimum window size and performance mode settings (SPEC.md section 10).
