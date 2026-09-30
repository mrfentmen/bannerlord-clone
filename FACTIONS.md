# FACTIONS.md

The playable sides. Read DESIGN.md first. Economy detail is in ECONOMY.md, war detail in MARCH_AND_WAR.md, rulers in RULERS.md.

---

## 1. HOW THE MAP IS DIVIDED

America is split into **six sections**. Each section is a **side**, the equivalent of a Bannerlord kingdom: a bloc of states with its own leadership, culture, troop styles, and economy. Every state belongs to exactly one section at start, and states inside a section are separate holdings with their own rulers and stats.

Real geography and real city names are used as-is. Factions, leaders, and history are fictional, per CONSTITUTION.md section 6.

## 2. STARTING THE GAME

The player makes three choices:

1. **Pick a side** (one of the six sections, or **Wanderer**).
2. **Pick a starting state** inside that side. This is the player's home region, and the state's real data decides its starting strengths and weaknesses.
3. **Pick a starting role.**
   - **Ruler-in-waiting:** start as a minor lord holding one town in the chosen state, loyal to the section's leader.
   - **Mercenary captain:** start with a small party and a contract, no land.
   - **Wanderer:** start as a nobody anywhere on the map, join any side later or build your own.

Later, the player can switch sides, betray a leader, or found a new faction, as in Bannerlord.

## 3. SECTIONS AT A GLANCE

Ratings are starting design targets from 1 (weak) to 5 (strong). The real game values are **computed from real data** (production, population, mining output, farmland, economic output), not hand-typed, so the final numbers come out of the Phase 0 pipeline. These ratings are what the pipeline should roughly produce and what balance testing checks against.

| Section | Money | Gold | Food | Metal | Population | Difficulty |
|---|---|---|---|---|---|---|
| Pacific Compact | 5 | 3 | 2 | 2 | 4 | Hard |
| Mountain Alliance | 2 | 5 | 2 | 5 | 1 | Medium |
| Great Lakes Union | 3 | 1 | 5 | 4 | 5 | Easy to Medium |
| Southern Compact | 3 | 1 | 4 | 3 | 4 | Medium |
| Lone Star Frontier | 4 | 2 | 3 | 4 | 3 | Medium |
| Atlantic Corridor | 5 | 4 | 1 | 2 | 5 | Hard |

**Balance rule:** no side is simply the best. Every strength must connect through the systems to a weakness, so a side's pros create its dangers. This is checked in headless simulation, not assumed.

## 4. THE SIX SIDES

### Pacific Compact
**States:** California, Oregon, Washington, Hawaii, Alaska.
**Big cities:** Los Angeles, San Francisco, San Diego, Seattle, Portland.

**Pros**
- Highest income from ports, trade, and tech industry.
- Best intelligence and reconnaissance: revealed information about rivals is more accurate.
- Strong medical and engineering capacity, so disease response is faster.

**Cons**
- Cities depend on inland farms and imports for food. Cut the supply and they starve quickly.
- Coastal cities and inland counties disagree, so internal loyalty is fragile.
- Water disputes can flare between rulers.

**Troop style:** marksmen, engineers, medics. Fewer, better-equipped soldiers.
**Signature mechanic:** *Port Trade.* Ports add income, but a blockaded or raided port hurts the whole section.

### Mountain Alliance
**States:** Montana, Idaho, Wyoming, Utah, Colorado, Nevada, Arizona, New Mexico.
**Big cities:** Denver, Phoenix, Las Vegas, Salt Lake City, Albuquerque.

**Pros**
- Excellent defensive terrain. Attackers lose speed and take attrition in the mountains.
- Rich in gold and metal from mining, so it can afford equipment and mercenaries.
- Rulers have wide independence, so the section resists being conquered piece by piece.

**Cons**
- Smallest population, so armies are small and losses hurt.
- Food and water are scarce, and settlements are far apart.
- Slow to unite: the leader has less authority over member rulers.

**Troop style:** scouts, mountain infantry, snipers.
**Signature mechanic:** *High Ground.* Big defensive bonus and attacker attrition in rough terrain, but low ability to project force outward.

### Great Lakes Union
**States:** North Dakota, South Dakota, Nebraska, Kansas, Iowa, Minnesota, Wisconsin, Michigan, Illinois, Indiana, Ohio, Missouri.
**Big cities:** Chicago, Detroit, Minneapolis, Cleveland, Columbus, Kansas City, St. Louis.

**Pros**
- The breadbasket. Huge food output and export leverage.
- Deep industry, so plenty of metal and manufacturing.
- Largest pool of recruits.

**Cons**
- Everyone wants its food, so it is constantly targeted and courted.
- Flat open terrain is hard to defend.
- Member rulers argue over selling versus stockpiling grain. A bad harvest can split the section.

**Troop style:** heavy infantry, large militia levies, mechanics.
**Signature mechanic:** *Bread and Iron.* Food exports buy alliances and gold, but selling too much leaves a section with no reserve when a bad harvest comes.

### Southern Compact
**States:** Kentucky, Tennessee, Arkansas, Louisiana, Mississippi, Alabama, Georgia, Florida, South Carolina, North Carolina.
**Big cities:** Atlanta, Miami, Charlotte, Nashville, New Orleans, Jacksonville.

**Pros**
- Large, ready militaries and cheap recruits.
- Solid food production and long growing seasons.
- Fast mobilization: armies gather quicker than elsewhere.

**Cons**
- Member rulers quarrel and hold grudges, so vassal loyalty is harder to keep.
- Storm and heat events hit hard and stress food and disease systems.
- Lower tax base, so long wars are hard to fund.

**Troop style:** light infantry, riflemen, mounted scouts.
**Signature mechanic:** *Call to Arms.* Quick, cheap mobilization, but lords may refuse orders if their loyalty or grievances say so.

### Lone Star Frontier
**States:** Texas, Oklahoma.
**Big cities:** Houston, Dallas, San Antonio, Austin, Oklahoma City.

**Pros**
- A strong economy with energy, industry, and large farmland.
- Big territory with a strong tradition of horse riders.
- Independent by nature, with fewer internal factions than other sides.

**Cons**
- Enormous distances: supply lines are long and marches are expensive.
- Borders many rivals and has few natural allies.
- Sprawling cities are hard to garrison and patrol evenly.

**Troop style:** mounted riflemen, rangers, ranch militia.
**Signature mechanic:** *Long Reach.* Fastest cavalry and best raiders, but every march far from home burns extra food and money.

### Atlantic Corridor
**States:** Maine, New Hampshire, Vermont, Massachusetts, Rhode Island, Connecticut, New York, New Jersey, Pennsylvania, Delaware, Maryland, D.C., Virginia, West Virginia.
**Big cities:** New York, Philadelphia, Boston, Washington, Baltimore, Pittsburgh.

**Pros**
- The richest banks and ports. Best money and gold reserves.
- Biggest population, and the strongest diplomacy and influence, since it hosts what remains of the old federal institutions.
- Best at deals, loans, and buying loyalty.

**Cons**
- Almost no farmland. Starvation is the constant threat.
- Dense cities mean outbreaks spread fastest here.
- Everyone owes it money or resents it, so many rulers want it weak.

**Troop style:** professional soldiers, medics, intelligence officers.
**Signature mechanic:** *Ledger.* Loans, debts, and bribes that other sides cannot match, but a debt-heavy position can be turned against it.

### Wanderer (no side)
Start anywhere as an unaligned character. No section bonuses or penalties. Highest freedom, lowest safety, closest to a Bannerlord sandbox start.

## 5. STATE-LEVEL DIFFERENCES

Inside a side, each state has its own profile, computed from real data:
- Population and largest cities (census and city datasets)
- Farmland and food output (agricultural data)
- Mining and gold and metal output (geological survey data)
- Economic output and trade volume (economic data)
- Land area, terrain, and ports (geography data)

Example of the intended effect: starting in California means big money and ports but a food problem. Starting in Iowa means food to spare but little cash. The player picks the problem they want to solve. These examples are guidance for what the data should show, not values to hardcode.

## 6. RELATIONS BETWEEN SIDES

- Every pair of sides has a relation score that changes with trade, border incidents, raids, broken promises, and shared enemies.
- Sides can be at war, at peace, allied, or in a trade pact.
- Rulers inside a side can defect to another side, as in Bannerlord, if their loyalty collapses (see RULERS.md).
- Outside powers (Canada, Mexico, overseas trade partners) exist as event sources for V1: loan offers, arms deals, refugee flows. They are not playable.

## 7. WHAT THE PLAYER GIVES UP

Choosing a side is choosing which problem to have:
- Pacific and Atlantic: rich but hungry and fragile.
- Great Lakes and Southern: fed and populous but targeted or quarrelsome.
- Mountain: safe but small.
- Lone Star: strong but stretched thin.

All of this should be visible on the side-selection screen: the ratings, the pros and cons, and a plain-language line about the biggest danger of each.
