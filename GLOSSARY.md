# GLOSSARY.md

Shared vocabulary across all docs. If a term is used in a doc, it means what is written here.

---

## WORLD AND SETTING

- **Side:** one of the six playable blocs of states (FACTIONS.md), or the Wanderer start.
- **Section:** another word for a side, used for the geographic grouping of states.
- **State:** a US state (or D.C.). Each belongs to exactly one side at start.
- **Town, city:** a settlement with full simulation.
- **Village:** a smaller settlement that produces food or goods for a town it is bound to.
- **Base, compound:** a fortified military or bandit location, the modern version of a castle.
- **Route:** a road, rail line, or path connecting settlements.
- **Wanderer:** an unaligned start with no side bonuses.
- **Era, tier:** the technology level for a given year (ERA.md).
- **Start year:** the campaign year the player chooses at the start.

## RESOURCES

- **Money:** everyday currency, spent daily, can lose value.
- **Gold:** hard reserve, stable in value, used for big moves.
- **Food:** feeds people and armies, also a trade good.
- **Metal:** industrial base for ammo, gear, repairs, and construction.
- **Fuel:** energy for vehicles and generators (proposal, VEHICLES_AND_FUEL.md).
- **Medicine:** supplies used in treatment and outbreak response.
- **Influence:** political currency inside a side.
- **Renown:** standing that raises party size and how rulers regard you.
- **Ledger:** the daily list of income and expense lines.

## SIMULATION

- **Tick:** one step of the simulation clock.
- **System:** an independent rule that reads some shared fields and writes others. Systems never call each other.
- **Shared state, shared fields:** the data on entities that systems read and write.
- **Entity:** a thing in the simulation, such as a town, party, ruler, or route.
- **Cause log:** the record of why each important change happened (CAUSE_EFFECT.md section 4).
- **Why panel:** the UI that shows a cause chain to the player (UI_UX.md section 5).
- **Chain:** a sequence of linked cause-and-effect events that emerges from systems interacting.
- **Emergent:** produced by systems interacting, not written as a scripted event.
- **Seed:** a number that fixes random choices so a run can be repeated.
- **Headless:** running the simulation with no graphics.
- **Band:** a range of values (for example "stable" or "unstable") used as a trigger for regeneration instead of raw numbers.
- **Config:** the data files holding tunable constants (TESTING_AND_BALANCE.md section 5).

## PEOPLE AND POLITICS

- **Ruler:** any person who holds towns, armies, or political power.
- **Lord, clan head:** the Bannerlord-style landholding ruler.
- **Leader:** the head of a side.
- **Notable:** a local power broker who gives quests and recruits, not a ruler (QUESTS_AND_NOTABLES.md).
- **Companion:** a recruitable named character who joins the player's party.
- **Party role:** one of Quartermaster, Scout, Surgeon, Engineer.
- **Fief:** a town or village held by a ruler.
- **Vassal:** a ruler who owes service to a leader or other ruler.
- **Defect, defection:** a ruler switching sides.
- **Vote (council):** the check that can remove a holder when loyalty collapses.
- **Trait:** one of Valor, Mercy, Honor, Generosity, Calculation.
- **Ambition:** what a ruler wants (land, security, revenge, wealth).

## MILITARY

- **Party:** a group of troops and characters that moves on the map.
- **Army:** several parties gathered under one leader.
- **Garrison:** troops stationed in a town or base.
- **March:** movement over time and distance, costing food, money, fuel, and morale.
- **Supply line:** the route by which an army receives food, fuel, and ammo.
- **Attrition:** losses from exhaustion, disease, and hunger.
- **Siege:** surrounding a town or base to force it to yield or to assault it.
- **Raid:** an attack on a village or route to take supplies or hurt an enemy.
- **Formation:** a group of units that follows orders together in battle.
- **Fire team, squad:** small unit groups inside a formation.
- **Suppression:** reduced unit effectiveness from incoming fire.
- **Morale, rout:** willingness to fight, and the collapse into flight.
- **Battle Layer:** the 3D battle scene (SPEC.md section 5).
- **Campaign Layer:** the 3D world map (SPEC.md section 6).

## TECHNICAL

- **Snapshot:** the state passed into a battle at its start.
- **Write-back:** results from a battle applied to the world state.
- **LOD:** level of detail, meaning simpler models at a distance.
- **Thin instances:** Babylon.js feature for drawing many copies of a mesh cheaply.
- **GLB, glTF:** the 3D model format used at runtime.
- **Manifest:** the record of every asset with source, author, and license (ASSETS.md section 2).
- **Skeleton loading:** placeholder shapes shown while data loads (no spinners).
- **Golden log:** a saved reference run used to detect unintended changes.

## DOCUMENT STATUS WORDS

- **V1:** needed for the first playable game.
- **V2:** after V1 works end to end.
- **Later:** only if V1 and V2 succeed.
- **Covered, Partial, New:** how far a feature is documented (FEATURES.md).
