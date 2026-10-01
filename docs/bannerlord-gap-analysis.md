# Bannerlord Gap Analysis — What's Missing

Comparison of Mount & Blade II: Bannerlord's systems vs our current implementation.
Generated 2026-10-01. This drives the build priority.

## ✅ HAVE (shipped to main)

| System | Status | Location |
|--------|--------|----------|
| World map | 487 settlements, real OH/KY/IN/WV/VA geography | clients/campaign/public/world/ |
| Ethnicities | 10 factions, 2-pro-1-con, territories | services/world-data/data/ethnicities.json |
| Troop trees | 30 units (10 × 3 tiers) | services/world-data/data/troop_trees.json |
| Weapons | 7 melee (4-dir), 5 firearms, 4 shields | services/world-data/data/weapons.json |
| Trade goods | 8 goods with prices | services/world-data/data/trade_goods.json |
| Settlement economy | 487 settlements → production | services/world-data/data/settlement_economy.json |
| Character creation | 6 family + 12 life-stage backgrounds | services/world-data/data/character_backgrounds.json |
| Skills & perks | 18 skills × 8 perks (144 total) | services/world-data/data/skills.json |
| Mechanics spec | Full port checklist | docs/bannerlord-mechanics-port.md |
| NYC data | Manhattan + Bronx (partial) | data/cities/nyc/ |

## ❌ MISSING (Bannerlord has, we don't)

### High Priority (core game loop)
1. **Companion NPCs** — Bannerlord has unique wanderers with backstories who join your party. We have troops but no named characters.
2. **Settlement buildings** — Bannerlord towns have constructible projects (workshops, granaries). We have economy data but no buildable improvements.
3. **Gang hideouts** — Bannerlord's bandit lairs. Clearable combat locations on the map.
4. **Street tournaments** — Bannerlord's arena tournaments. Regular fighting competitions in cities.

### Medium Priority (campaign depth)
5. **Main questline** — Bannerlord has the Neretzes/dragon banner campaign. We need a story.
6. **Kingdom policies** — Bannerlord's laws (e.g., "Tribunes of the People"). Faction-wide effects.
7. **Army system** — Bannerlord lets you form armies from multiple parties. We only have single party.
8. **Breach equipment** — For compound assaults: rams, explosives, ladders.

### Lower Priority (polish)
9. **Clan system** — Bannerlord's family/clan with members, not just party.
10. **Dynamic issues** — Bannerlord's village quests that spawn from conditions.

## Build Order (this session)
1. Companion NPCs → 2. Settlement buildings → 3. Gang hideouts → 4. Street tournaments →
5. Main questline → 6. Kingdom policies → 7. Army system → 8. Breach equipment
