# FACTIONS AND REGIONS

Lore for the six sides and the eight regions of the campaign map. Read FACTIONS.md first for the
mechanics, RULERS.md for the people, and content/characters/faction-leaders.md for the six leaders
in full. This file is the narrative layer that sits on top of all of it.

**Rules this file obeys**

- Real geography, real state and city names, real structural problems (CONSTITUTION.md section 6).
  Fictional people. Fictional history. No real war, crisis, or organisation is replayed.
- No number is invented here. Settlement populations, food output, mining output, and section
  ratings are computed from imported data (PHASES.md Phase 0). The only numbers that appear below
  are the design targets already published in FACTIONS.md section 3. Where this file says a region
  produces food, that is a direction, not a quantity, and the pipeline sets the amount.
- Everything written as "what happens here" is a set of conditions for the systems in
  CAUSE_EFFECT.md, not a scripted event. Nothing below fires on a date.
- No em dashes and no special characters. Plain ASCII throughout, matching
  content/dialogue/townsfolk.md.

---

## 1. HOW THE WORLD IS CUT

Two different cuts, and the difference matters.

- **Sections** (also called sides) are political. Six of them. Every state and D.C. belongs to
  exactly one at world start. This is the Bannerlord kingdom list and it comes from FACTIONS.md
  section 4.
- **Regions** are geographic. Eight of them. A region is what the player plays in: a place with one
  weather pattern, one harvest calendar, one road problem, and one local fight that has been going
  on for years and will be going on after they leave.

A region is not a side. Three of the eight regions are inside one side. The interesting play is
always at a seam, where a region touches a region held by somebody else.

### The eight regions

| Region | States | Held by | The player's problem here |
|---|---|---|---|
| 1. The Seaboard | ME, NH, VT, MA, RI, CT, NY, NJ, PA, DE, MD, DC, VA, WV | Atlantic Corridor | Rich, crowded, and structurally unable to feed itself |
| 2. The Great Lakes Works | MI, OH, IN, IL, WI | Great Lakes Union | Big industry, flat ground, no natural defence |
| 3. The Corn Belt and Plains | ND, SD, NE, KS, IA, MN, MO | Great Lakes Union | Everyone wants your grain and nobody defends you |
| 4. The Texas Frontier | TX, OK | Lone Star Frontier | Distance is the enemy and you have four neighbours |
| 5. The Gulf | LA, MS, AL, FL | Southern Compact | Fast mobilisation, low tax base, weather that kills |
| 6. The Appalachian Interior | KY, TN, AR, GA, SC, NC | Southern Compact | Grudges older than the player, and very poor ground |
| 7. The Mountain West | MT, WY, ID, UT, NV, CO, AZ, NM | Mountain Alliance | Safe at home, cannot reach anybody, water is finite |
| 8. The Pacific Coast | CA, OR, WA, HI, AK | Pacific Compact | The most money on the map and the shortest fuse |

All 50 states plus D.C. appear exactly once. Region assignment is a lookup on FIPS code, same as
the section assignment in services/world-data, so the two tables cannot disagree.

### Documented region exceptions

Three places do not play like the region they sit in. These are terrain and gameplay exceptions,
not reassignments, and the terrain data will already produce them.

| Place | In region | Plays as | Why |
|---|---|---|---|
| Pittsburgh and the Monongahela valley | Seaboard | Mountain | It is a mountain city held by a coastal section, and it has fought the Corridor over that for years |
| El Paso and the lower Rio Grande | Texas Frontier | Desert | Frontier-held desert, and the water rules are nothing like the rest of Texas |
| Alaska and Hawaii | Pacific Coast | Ocean | Both are separated from the mainland by more distance than a section can supply across |

### The V1 slice

`config/world_data.toml` sets the V1 region to the Ohio River Valley, the Ohio and Kentucky metro
cluster. That slice straddles **region 2** (Ohio) and **region 6** (Kentucky), which is the correct
place to start: it is the only place on the map where a Lakes Union state and a Southern Compact
state share a river, a road, and a phone code. The first playable content should show that seam.

---

## 2. THE SIX SIDES

### 2.1 PACIFIC COMPACT

**Territory.** California, Oregon, Washington, Hawaii, Alaska. Seats of power in Los Angeles, San
Francisco, San Diego, Seattle, and Portland, with the weight sitting on the two southern ports and
Seattle. Leader: **Marisol Vega**, based in Los Angeles.

**History.** The Compact was not founded as a political project. It was founded as a shipping
agreement, and that is still what it is.

The coast had the money, the harbors, and the shipyards, and it could not feed itself. The interior
had the fields, the water, and the votes, and it could not eat what it grew because the grain went
onto trucks that someone else controlled. When the federal authority stopped arranging both halves,
the only people in a position to fix it were the people who could talk to both, and the only thing
they could offer was a schedule.

So a set of port operators, inland agricultural interests, and county officials signed something
that was deliberately not a constitution. It moved freight. It settled disputes over loading docks
instead of over land. It created a single chain of custody for food so that a shortage in one
county would show up in a spreadsheet in another county four days later, and the argument about what
to do about it would happen while it could still be helped.

That is the whole origin. There was no flag moment, and the Compact is embarrassed by the suggestion
that there was. What it has instead is the thing that actually holds sections together, which is a
procedure everyone agreed to follow when nobody trusted anybody.

Hawaii and Alaska are inside the Compact on paper and are a standing argument in practice. Both are
farther from the mainland than the supply chain was designed for. Both have strong local leadership
that resents being a wing of a continental section. Both pay their own way, most months, and both
would have to be asked rather than told.

**Values.**

1. A map of need is a kind of authority, and the person holding it has a duty to be honest with it.
2. Keep people fed on a schedule. Volume beats heroism. Nobody is sent to fix a shortage that a
   fleet could have fixed.
3. Never close a port. Ports are the section's nervous system, and a closed port is a famine with a
   headline.
4. Nobody stops moving because a person is in the way. The rule Vega gives every commander in the
   Compact is that you stop for anyone in trouble and you do not take their vehicle.
5. The coast and the interior are both necessary, and the Compact's job is to be the argument
   between them in a room instead of on a highway.

**Who is really in charge.** Vega, narrowly, and only because she is the only person both halves
trust. The coastal cities believe the Compact is being run for them by a logistics manager. The
inland counties believe it is being run for the ports. Governors hold real power over their own
states and can be replaced without her, which is the mechanism by which she usually loses. Water
allocation is the standing domestic fight and it never fully resolves, it just moves to a different
river.

**Signature mechanic.** Port Trade (FACTIONS.md). Ports generate income, and a raided or blockaded
port damages the whole section at once.

**What they are wrong about.** Vega is certain that courage is not a supply chain input. The
Compact will lose a fight it should have won by sending a warm, reckless, personally loyal man into
a room that needed one, and it will find out late. This is the player's opening if the player is
that person.

### 2.2 MOUNTAIN ALLIANCE

**Territory.** Montana, Idaho, Wyoming, Utah, Colorado, Nevada, Arizona, New Mexico. Seats of power
in Denver, Salt Lake City, Phoenix, Albuquerque, and Las Vegas, with the actual mining interests
spread across Butte, the Coeur d'Alenes, the Nevada camps, and the Colorado basin. Leader:
**Hollis Grant**, based in Denver.

**History.** The Alliance exists because the interior ran out of things to trade and started
running out of things to argue about.

It is the smallest section by people and the richest by head, per head, in metal and gold. That
combination produced a very specific kind of politics. Nobody in the interior has ever had enough
labour to build anything twice, so nothing here is duplicated. Every mine, every water line, every
road, and every ore truck is a single point of failure with a family living next to it, and the
people who know that best are the engineers and the crews, not the politicians.

The Alliance was written as a maintenance compact: a shared road standard, a shared mining code, a
shared water priority, and a mutual aid obligation when something breaks. It has never had an
authority that can order anybody to do anything. Denver cannot command Salt Lake City. Denver cannot
command Phoenix, which has been furious about water since May. Albuquerque has stopped attending.

Grant holds it together by being the man who shows up. He came out of the Butte mines, he was
underground for nine years, and he has pulled forty-one men out of holes that were surveyed as safe.
He is not a political leader in the sense the other five are. He is a man with a hard hat and a
reputation for arriving, and it turns out that reputation is load bearing.

Las Vegas is the region's clearest proof that this is not a coherent state. It is a large city with
essentially no farmland, in the driest possible place, that survives on money. It pays for its
water and its food and it has almost no military value. The Alliance cannot feed it and cannot lose
it, which makes it the most anxious member of the most loosely held section.

**Values.**

1. Show up. Authority is earned one crisis at a time and is revoked the moment you stop arriving.
2. A fight you can win in the mountains is a fight you can also avoid, and avoiding it is worth more.
3. Water is finite and everybody in this section knows the number. Never pretend otherwise in public.
4. Small population means every casualty is personal and every garrison pulled is a town left open.
   Do not spend people you cannot replace.
5. Nobody in this section is a subject. The Alliance works because it is not a hierarchy, and the day
   it becomes one is the day it stops working.

**Who is really in charge.** No one, consistently. Grant has moral authority and no legal authority
and he says so more often than is comfortable for the people around him. The real power is split
between the mining interests, the irrigation districts, and the individual governors, who each know
their water better than anyone in Denver. The Alliance's chronic failure mode is that three of those
three do not speak to each other.

**Signature mechanic.** High Ground (FACTIONS.md). Enormous defensive bonus and heavy attacker
attrition in rough terrain, and almost no ability to project force outward.

**What they are wrong about.** Grant believes the loose structure is what makes the Alliance strong.
It is what makes it strong until the day it fails, and then it fails all at once and in the middle,
not gradually, which is a much worse way to come apart. A clever ruler with one relationship in
Phoenix and one in Salt Lake can split the section without a single battle, and Grant has already
written three memoranda warning about exactly this and been ignored three times by men who own tanks.

### 2.3 GREAT LAKES UNION

**Territory.** North Dakota, South Dakota, Nebraska, Kansas, Iowa, Minnesota, Wisconsin, Michigan,
Indiana, Ohio, Missouri. Seats of power in Chicago, Detroit, Minneapolis, Cleveland, Columbus, and
Kansas City, with the food coming from a belt of small towns and rural counties that have no power
of their own. Leader: **Bernice Oyelaran**, based in Chicago.

**History.** The Lakes Union is the mirror image of the Pacific Compact and it was built the same way
way, in reverse. It has the food, the industry, and the largest pool of recruits on the map, and it
has never had enough cash.

The industrial belt around Chicago, Detroit, and Cleveland was built to make things from other
people's raw materials, and it is still built that way. The Corn Belt around it was built to feed
those cities and then, when the cities could no longer be relied on, to feed whoever would pay. By
the time the federal arrangements stopped, the Lakes Union held the one thing every other section
needed and had almost nothing it could buy with.

Oyelaran built the Union on one promise, made to every governor in it: she will never sell a
member's grain out from under them without telling them first. She has kept it for six years at
enormous cost, and it is the only reason Nebraska is still in the section. It is also the single
thing Nebraska resents most.

The real internal fight is not about food. It is about what food is for. The cities want it
distributed at cost inside the section. The Plains states want the export gates opened and the
money brought home. The industrial states want a protected supply so their factories do not stop.
All three positions are correct and they cannot all be satisfied, and the Union's stability is
measured entirely in how long that argument is held without anybody walking out.

**Values.**

1. Never sell a member's grain out from under them without telling them first. The rule is the
   section.
2. Know what your field looks like before you buy the machine. Almost every disaster in this section
   was a correct budget spent on the wrong assumption about a specific place.
3. Be believed in a cornfield in October. Legitimacy out here is seasonal and local, and a leader
   who is respected in a city is nobody in the county that feeds it.
4. Pay people out of what the land produces, honestly and without theatre. A leader who cannot afford
   to be generous should say so out loud rather than borrow for it.
5. Famine is not a moral question. It is an arithmetic question with a body count, and the
   arithmetic wins.

**Who is really in charge.** Oyelaran, because of the grain, and less than she would like. The
governors of the Plains states are individually insignificant and collectively decisive, and they
know it. The governors of the industrial states are individually decisive and collectively
inconsistent, and they know that too. Chicago is the meeting place and is not itself a holder of
much.

**Signature mechanic.** Bread and Iron (FACTIONS.md). Food exports buy alliances and cash, and
selling too much means there is no reserve when the harvest fails.

**What they are wrong about.** Oyelaran believes that fairness survives a famine. It does not. The
first real shortage in this section will be decided by who is willing to let a specific county go
hungry for a specific number of days, and the correct answer, from the standpoint of keeping the
section alive, is usually the answer she has spent six years refusing to give. She has fought three
governors who broke the promise and broken them back, so she is not squeamish about it, but she has
never had to choose which of her own nine states to write off. The player can force that choice on
her, and it is the best quest in the section.

### 2.4 SOUTHERN COMPACT

**Territory.** Kentucky, Tennessee, Arkansas, Louisiana, Mississippi, Alabama, Georgia, Florida,
South Carolina, North Carolina. Seats of power in Atlanta, Nashville, New Orleans, Jacksonville, and
Charlotte. Leader: **Cordell Jessup**, based in Atlanta.

**History.** The Compact is the largest section by land south of the Plains and it came together for
the least ideological of possible reasons: a man with a training room.

When the federal arrangements came apart, the thing that was most obviously reusable across ten
states was not a government, it was a building with a firing range, a schedule, and a man who knew
which county sheriffs already had more rifles than training manuals. Jessup ran that. The Compact
formed around him because he was the only person in the south who had got a room full of competing
lords into the same building and then got them out of it again with nobody killed.

That is the entire founding event, and it is much less impressive than the section's reputation.
There is no manifesto. There is a training camp that turned into a coordinating body because it was
the only place the money and the men went.

The Compact's strength is speed. A long growing season, cheap land, a genuine local culture of
self-defence that is not propaganda, and county-level institutions that already know how to call men
up and feed them badly. In the first ninety days after a call, the Compact can put more men in a
field than any other section. After that it has fewer cards than everyone, and this is the deal.

Its weakness is that it is ten states that agree on almost nothing except a shared suspicion of
distant authority. The Gulf wants a maritime empire, Tennessee wants the river and the capital, the
Carolinas want their own money kept local, and Florida has one set of problems that the other nine
cannot help with and one set of allies nobody else in the section can match. Two of the standing
fights are personal. Governor Dumas in Louisiana and Colonel Boatwright in Tennessee have hated each
other for two years over a pontoon bridge and it stopped being about the bridge a long time ago.

**Values.**

1. The first ninety days win wars. After that you are slower and poorer than everyone.
2. Charm is infrastructure. A leader who is genuinely liked does not lose governors, and Jessup has
   spent six years making sure he is.
3. Never lie about anything that can be checked. The reputation for honesty is a tool and it is
   maintained on purpose.
4. Cheap soldiers are not the problem. Keeping them loyal is the problem, and loyalty is paid in
   attention, not in money.
5. Hold them long enough. The goal is not to be necessary. The goal is for the ten states to have
   their own supply lines, their own officers, and their own reasons to be a section by the time he
   is gone.

**Who is really in charge.** Jessup, on charm, and it is thinner than it looks. He has never started
a fight he did not have a plan to end, and the day he starts one is the day two governors discover
they were only ever friends with him. Loyalty in this section fails in a specific pattern: not from
neglect, but from being kept at a polite distance too long, which is why the Compact is most at risk
from success.

**Signature mechanic.** Call to Arms (FACTIONS.md). Fastest and cheapest mobilisation, and lords may
refuse an order outright if their loyalty or their grievances say so.

**What they are wrong about.** Jessup believes everyone can be managed. He cannot. He genuinely likes
people, genuinely enjoys the work, and genuinely cannot tell the difference between a person he likes
and a person he is using, and the accumulated weight of that is going to be the thing that ends his
leadership. Dumas and Boatwright are both entirely aware of this and both wait on it.

### 2.5 LONE STAR FRONTIER

**Territory.** Texas and Oklahoma. Seats of power in Houston, Dallas, San Antonio, and Oklahoma
City, with almost nobody in the middle. Leader: **Royce Adair**, based in Houston but seen most often
in San Antonio.

**History.** The Frontier got its name the same way the Mountain Alliance got its reputation: as a
thing somebody else said first and nobody bothered to correct.

Texas and Oklahoma are enormous, energy rich, thinly populated outside four or five cities, and
nobody else wanted them. When the sections formed, four rivals looked at the map and agreed that
there was nothing on that land worth the cost of holding it, which was true about the land and
completely wrong about the ports, the oil, the cattle, and the ranch land underneath it.

So the Frontier had to police itself, and the man who ended up doing it is a rancher who never once
pretended to be poor. His family found oil under pasture that had been cattle since the 1840s and
has spent three generations turning animals into a currency nobody in his house was ever taught to
handle carefully. He still spends weeks a year moving cattle with men whose entire resumes consist
of being good at it. He can ride better than anyone in the Compact and knows exactly how little that
is worth against an enemy who never has to close.

The Frontier's real structure is the triangle. Houston, the Dallas and Fort Worth area, and San
Antonio hold nearly all the people. Between them is a great deal of nothing, and the policing of
that nothing is what an army out here is actually for. Every column that leaves the triangle spends
most of its time eating and driving. That is not a tactical problem, it is the shape of the ground,
and no amount of cavalry changes it.

El Paso and the lower Rio Grande sit on the far end of the same problem. It is Frontier-held desert,
it has the only large population in the section that cannot be reached quickly from anywhere, and it
is the only place in America where an outside power with its own interests is a daily fact of life
rather than a rumour. Canada and Mexico are not playable. They are sources of loan offers, arms
deals, and refugee flows, and Adair has learned exactly how much to trust all three.

**Values.**

1. Distance is the enemy. Every march away from the triangle spends food it should be selling.
2. Refuse more offers than you accept, and say no out loud so there is nothing to misunderstand later.
3. A deal is better than a flag. If somebody wants to put a garrison on your land and call it a
   partnership, the answer is no, and it is no on the seventh offer as well as the first.
4. Be bought in the open. Pay a man for what you want from him, in front of him, where he knows
   exactly what he was bought with. A hidden term is a debt that becomes a war.
5. There is more room here than people. Both of those are true at the same time and the section has
   never resolved which one it is.

**Who is really in charge.** Adair, and this is the only side where that is close to unambiguous.
He is rich enough to fund loyalty outright, independent enough that no other section has a claim on
him, and blunt enough that nobody wastes time courting him. The Frontier has the fewest internal
factions of any side. What it has instead is a logistics problem that only he understands and a
succession problem that nobody is solving.

**Signature mechanic.** Long Reach (FACTIONS.md). Fastest cavalry, best raiders, and every march far
from home burns extra food and money.

**What they are wrong about.** Adair believes money is enough. It was enough to refinance the
Atlantic Corridor twice and turn down the offer twice, and it will not be enough the first time
somebody stops offering and starts taking. The Frontier has no natural ally on the map and four
neighbours, and the day one of them decides that a Corridor loan to Adair's own treasury would be
cheaper than a war, the section he built on being unbuyable is the section that gets bought. He
knows this. He has said it out loud to exactly one other person.

### 2.6 ATLANTIC CORRIDOR

**Territory.** Maine, New Hampshire, Vermont, Massachusetts, Rhode Island, Connecticut, New York,
New Jersey, Pennsylvania, Delaware, Maryland, D.C., Virginia, West Virginia. Seats of power in New
York, Philadelphia, Boston, Washington, Baltimore, and Pittsburgh. Leader: **Yvonne Castille**,
working out of Washington and New York.

**History.** The Corridor is the section that won the collapse and has been paying for it since.

The eastern institutions did not all stop. Most of them stopped answering to anything. The buildings
were still there, the records were still there, and the people who knew where the money went were
still working. The Corridor is the section that ended up holding the paperwork of half the country,
and it holds it not because it won anything but because it was the only part of the system whose
value was stored in files rather than in crops.

So the Corridor has the ports, the banks, the rail, the largest population in the country, and the
strongest position in every negotiation that can be settled with a signature. It also has the least
farmland of any section, structurally none, and it eats more than it grows every single day. The
water between those two facts does not contain food.

Castille spent twenty-two years in federal administration, which in practice means she spent
twenty-two years learning exactly which promises could not be kept. She was appointed because she
was the only person in the room who could produce a list of every holder of federal paper in the
eastern half of the country. That list is the foundation of the section. It is also the reason the
section has more money than anyone and no friends at all.

The Corridor solved its food problem the only way it can be solved, which is by lending. A state
that cannot grow what it eats borrows. A state that cannot repay in money repays in access, in
ports, in rail, in standing capacity. Over six years Castille has placed herself between the eastern
seaboard and every other section's ability to feed itself, and every section in the game knows it,
and not one of them is stupid enough to say so out loud.

**Values.**

1. The wage is the wage. Pay above any other section on the map and do not pretend it is loyalty.
2. A loan is a relationship and relationships have terms. Put the terms in front of the person. A
   hidden term is a trap that requires you to still be alive when it springs.
3. Be indispensable rather than liked. Indispensability is measurable and liking is not, and the
   Corridor is the only section in America that has ever optimised for that on purpose.
4. Write off the losses. She has written off a hundred million dollars of Corridor paper owed by
   families that could not pay, on purpose, at a real cost in leverage she still misses.
5. Administer honestly, because administration is the only power left. The section that keeps the
   records keeps the future.

**Who is really in charge.** Castille, absolutely, and she knows it is a problem. A system where one
person is load bearing is not a system, it is a delay. There is a real plan to distribute her
function and the people attached to it are serious and none of them are the player yet. Every other
ruler in the game knows that the Corridor's strength is one woman's address book, and the section's
entire defensive posture is that nobody has found a way to make her unnecessary in a hurry.

**Signature mechanic.** Ledger (FACTIONS.md). Loans, debt, and bribes nobody else can match, and a
debt-heavy position that can be turned around and used against you.

**What they are wrong about.** Castille has decided that being honest is a substitute for being
liked. It is not. She has tried twice and both times it read as a tactic, and she has concluded the
problem is her and stopped trying. Her section is the most efficient administration in the country
and the least popular, and the Corridor's food problem gets solved one day not by any of her methods
but by her own leadership failing to solve it, which is a valid way for a player to win the region
without firing a shot.

### 2.7 THE WANDERER

Not a side, but it belongs here. A Wanderer starts anywhere with no section bonuses and no section
penalties, which means the player gets the most freedom and the least safety. In practice this is
the start for a player who intends to found their own faction, and the reason nobody in the game
helps a Wanderer is that a Wanderer has nothing anybody wants. The first job is always the same:
become expensive enough to matter before becoming powerful enough to be frightening.

---

## 3. THE EIGHT REGIONS

Each region below gives the look, the control, and the conditions that produce what happens there.
"What happens here" is a set of readings on shared fields, not a schedule.

### 3.1 THE SEABOARD

**What it looks like.** Dense, coastal, and stacked. From Portland, Maine to Richmond, Virginia the
land is a thin ribbon of workable ground with water on one side and hills on the other, and almost
every acre of it has been built on twice. There is no horizon in this region. There is a wall, a
parking structure, or the next town, and everything is about eight minutes from everything else, and
all of it is at the water's edge.

What the land cannot do is grow food, and this is not a matter of bad policy or a bad year. The
usable farmland in this region is a rounding error, and the region's entire economic life is an
argument about how to bring in what it cannot make. The ports are the reason the cities are where
they are. The rail is the reason the interior of the region is as dense as the coast. The density is
the reason the food arrives in the first place, and the density is also why every mistake here is
louder than anywhere else on the map.

Winter is grey and wet and long enough to affect morale. The region has the best hospitals, the best
communications, and the most competent administration in the country, and it uses all three to
manage the fact that it is the most crowded place in America with the least slack in its system.

**Who controls it.** The Atlantic Corridor, and Castille, and in practice a layer of port
commissioners, bank administrators, and state officials who actually run things. D.C. is a
ceremonial prize that nobody in the region can eat and that every ruler in the game would like to
hold. Pittsburgh is the awkward one, a mountain city administered by a coastal section, and it has
been an open grievance since before the Compact existed.

Control here is not in question. The question is affordability. Castille holds this region the way a
creditor holds a borrower, and the local fighters in it are mostly people who have found a way to
live inside that arrangement rather than people who are fighting it.

**What happens there.** Outbreaks. The region has the best medicine in America and the highest
population density, and those two facts fight each other. When infection reaches a district here it
spreads through crowding faster than any region on the map, and a clinic with power and drugs can
still lose, because the growth rate is set by how many people are in the room.

Prices move on news. This is the only region where media reach is effectively universal, which means
`information_trust` in a Seaboard town is unusually sensitive to a contradiction. A leader here can
raise loyalty with a broadcast and lose twice as much by being caught in one, and the more channels
there are, the faster both happen.

Food arrives or it does not. Every Caravan's route in this region runs through a small number of
chokepoints: the ports, the rail heads, and a handful of bridges. Take a bridge out and the detours
raise cost on half the region at once. This is the single most valuable sabotage target in the game
and Castille knows it, which is why she never leaves two of them undefended at the same time.

What the player can do here: escort a grain train, hold a bridge, run a clinic through an outbreak,
or become the person a hungry district talks to. What the player cannot do here is farm, and any
plan that requires a local food source is a plan to import.

### 3.2 THE GREAT LAKES WORKS

**What it looks like.** Flat, cold, and industrial in a specific way. The factories here were built to
make other people's raw materials into other people's products, and the buildings show it: enormous,
low, spread along rail lines and harbours, most of them a hundred years old and in a state that
could not be described as good. The land between the cities is the best corn and soybean ground in
the country, and the only reason it is not covered in houses is that the cities have been eating it
and paying for the privilege.

The Great Lakes themselves are the region's highway and its coastline at the same time. Freight that
does not need to move fast moves by water, which is cheap and slow and reliable, and the entire
industrial belt is arranged around that fact. Cleveland, Detroit, Gary, Milwaukee, and Chicago are
the same kind of city with different fortunes, and a player driving between them sees the same
combination every time: enormous plant, empty lots, a working river, a downtown that is either
being rebuilt or being left.

**Who controls it.** The Great Lakes Union, and the argument is about what the factories are for.
Oyelaran holds the section on grain. The industrial governors hold their cities on the labour and
they do not like being dependent on a section that is run by a farm politician from Iowa. Chicago is
where the section meets itself, and Detroit is where the meeting goes badly, because Detroit has the
manufacturing base and almost none of the surrounding food and a very long memory.

The local power is not the governor. It is the combination of the plant foreman, the union local,
and whoever controls the rail spur, and a ruler who ignores any one of those three discovers it at
the worst possible moment.

**What happens there.** Labour, not hunger. The Lakes Works is the one region where the recurring
crisis is a stoppage. A factory that closes does not just stop producing, it empties a district, and
an empty district has no money, no food demand, and a lot of unrest, and it is the fastest way to
lose a town to a council vote in the entire game.

Flat ground. The Great Lakes Works is the most exposed terrain in America. There is nowhere to dig
in, nothing to hide behind, and no high ground within a day's march. Any side with better infantry
or better artillery simply wins here, and the counter is that this region has the deepest industrial
capacity on the map, so the side that holds it can out-produce the winner in ammunition and metal
within a year. This is a war of attrition with a very long fuse and everybody knows it.

Water is a state issue, not a scarcity. The Lakes have the largest fresh water supply in the
country. What they do not have is a defence, and the region is the most attractive invasion target
in the game for exactly that reason.

### 3.3 THE CORN BELT AND PLAINS

**What it looks like.** The flattest, most exposed, most productive land in the game. Flat enough
that you can see a storm from one county to the next, which means the weather is the local
conversation and the local opinion. The land is a checkerboard of section lines a mile and a half
wide, and from the air the region looks like a spreadsheet, which is roughly what it is.

Everything in this region is about four things: corn, soybeans, water, and the price. The grain
moves out through rail heads, and the rail heads are the closest thing the region has to a capital.
The towns are small, spread out, and mostly exist to hold a set of grain elevators and a co-op. The
sparsity is real. A town that loses its elevator does not get poorer, it empties, because there is
nothing to do there and the people have three hundred miles of nothing in every direction.

This is the region that feeds everybody, including the four regions that could most easily destroy
it. Its politics are correspondingly paranoid and correspondingly dull, and the dullness is
accurate. Nobody in Nebraska is plotting anything. They are worried about a specific number.

**Who controls it.** The Great Lakes Union, and Nebraska is the problem in the section. Nebraska has
wanted open export markets for a century, Oyelaran has held the gate shut on them out of principle
for six years, and Nebraska has an extremely good case. This is the most likely defection in the
game and it is not a secret, it is a public argument that has been running long enough that
everyone has a position.

Elsewhere the region is held loosely and locally. A grain trader's opinion about a rail head
decides more than a governor's. Sioux Falls, Fargo, Des Moines, Omaha, Lincoln, and Wichita are
sizable and hold themselves, and the counties between them are where the region's real politics
happen.

**What happens there.** Raids, and this is the defining activity. The Corn Belt and Plains is where
bandit and raider pressure is highest in the game, not because the region is lawless but because it
is flat, empty, and full of high value targets moving slowly on open routes. Every raid here cuts
food production, and every cut to food production here propagates to four other regions within a
season. The Security system reading `road_safety` and the Food system reading `food_production` are
the two most connected pair of systems in the game, and this is where it happens.

A bad harvest here is not a local event. The fourth week of July is when the region stops being a
rumour and starts being a fact, and Oyelaran's whole section is suddenly the most strategically
important territory in America and the most difficult to hold, because a starving region with a
rail network is a region whose cities will sell their own food to whoever is buying.

The player who works here is a convoy escort, a scout, or a grain runner. A cavalry force is
mistaken for a raiding force. This is the region where a player with horses and no friends has the
worst possible time, and the region where a player with a reputation for keeping promises is
dangerously overemployed.

### 3.4 THE TEXAS FRONTIER

**What it looks like.** Vast, hot, and mostly empty, with everything that matters clustered in
places that are very far from each other. The defining feature of this region is negative space
between real features: a city, then a long drive, then a town, then a longer drive. A column that
leaves the triangle is not marching, it is commuting at a cost.

The land varies enormously inside the region. East Texas is wet, wooded, and slow. The Hill Country
is the part that looks like the postcards. West Texas is a dry basin with a few enormous cities in
it and a great deal of nothing between them, and the border runs down the middle of the least
governable ground in the country. The Panhandle is cattle country that is genuinely more cattle than
people. Oklahoma is the quiet half, oil in the middle, corn in the east, and a capital that has
stopped pretending to be in charge of the western part.

**Who controls it.** The Lone Star Frontier, and Adair, and this is the least ambiguous control in
the game. What the region has instead of internal rivals is external pressure on five sides. The
Atlantic Corridor wants a loan. The Southern Compact wants the Mississippi and the eastern border
counties. The Mountain Alliance wants the western desert and the water in it. The Pacific Compact
wants the port at the far end of the state. And Mexico is not a section and is not going away.

The local structure is ranch families and oil money, and the two do not get along. The ranches want
the land left alone and the oil interests want it drilled, and every fight in this region that is
not about a section is about whether a particular field stays open.

**What happens there.** Distance, expressed as money. This is the only region where the March system's
per-day food and money draw is the dominant strategic fact, and the only region where the fastest
cavalry in the game is also a liability, because fast troops that are nine days from a supply point
arrive as a hungry, unsupplied force regardless of how quickly they got there.

Raids are the Frontier's standing method. Adair's riders are the best raiders on the map and the
region's own tradition is that a mounted force that crosses your land takes what it can carry.
Border country is the worst of it, where raiding is a legitimate economic activity for a rancher who
cannot feed his cattle and a legitimate target for a man with a rifle and a truck.

Energy is the export and the vulnerability. The fuel and metal this region produces is the reason
the other five sections have not simply decided to take it, and the reason Castille would rather
own it through a loan than a war. Cut the pipelines and the region's own economy stops before
somebody else's does.

### 3.5 THE GULF

**What it looks like.** Wet, low, hot, and built on top of a coastline that everyone involved knows is
the most dangerous piece of real estate in the country. The land here is barely above sea level in
places and the whole region is shaped by water in two directions: the ocean that can come in, and
the river systems that made the cities worth anything in the first place.

New Orleans sits on a bend of a river and is the most strategically located port in the interior of
the continent and the most flood-prone major city in America, and both of those are true
simultaneously and always have been. The Mississippi Delta, which gave the region its food, its
timber, its name, and its first economy, is the most damaged piece of ground in the game. Mobile
and Pensacola and the panhandle coast trade on the Navy and the interstate. Florida is not the Gulf
region, it is a separate country with a beach economy, and it is in this region because it is on
this coast, and the region's problems and Florida's problems are related in the way two unrelated
catastrophes are related.

**Who controls it.** The Southern Compact, and the least stable control in the section. Governor
Dumas in Louisiana runs the most valuable port on the map and wants a Gulf empire that has nothing
to do with Atlanta. The Florida interests are aligned with nobody and fund whoever is useful. The
panhandle counties are loyal to a naval base. Every one of these is a separate claim on the same
coastline.

Control here is seasonal. The storm season is also the season when nobody can move an army, and the
region's wars and politics are effectively paused for a few months a year, which everybody plans
around and nobody discusses.

**What happens there.** Weather as a system, not an event. The Disease system and the Food system
both get hit here in ways they get hit nowhere else. Storms damage infrastructure, damaged power
kills water pumps, dead pumps drop sanitation, sanitation drives infection, infection kills workers,
and the harvest fails because the workers are dead. That is one chain and it is the reason the Gulf
is the hardest region in the game to govern. It is documented as chain 1 in
INFRASTRUCTURE_AND_MEDIA.md and the simulation should produce it in this region more than anywhere
else without anything being written for it.

Ports here are enormous and few. Whoever holds New Orleans and the Florida ports controls the
southern approach to the whole map, and the March and Siege systems make a port here worth more than
its population suggests.

The player here is dealing with a place that is tired. A long growing season means a quick
mobilisation and a quick collapse, since the same warmth that grows the crops lets disease and
disorder move. Tax capacity is the lowest in the game, so a Southern war fought out of the Gulf is a
war the Compact cannot pay for, which is the historical pattern repeating for reasons the
simulation can produce on its own.

### 3.6 THE APPALACHIAN INTERIOR

**What it looks like.** The oldest, poorest, most stubborn ground in the game. Not a desert and not
a plain: narrow valleys, short rivers, ridges that run for fifty miles without a gap, and towns that
are forty minutes and one mountain range apart. The land will not support large farms and never has.
What it supports is timber, coal, tobacco-scale agriculture, and small towns with a very long
memory.

The region's infrastructure is the oldest in the country. The roads follow cattle paths and river
crossings and were paved once, badly, decades ago. Rail lines follow the same valleys because the
valleys are the only way through. Power lines and water lines are older than most of the people
maintaining them, and the regions infrastructure decay is the slowest in the game, which is a polite
way of saying that the region has been poor for a very long time and the pipes are the reason.

Georgia, the Carolinas, and Tennessee have money and are not quite this region any more. The money is
in the larger cities and it arrived later than the money on the coast, and the arrival of money
broke more in this region than it fixed.

**Who controls it.** The Southern Compact, and this is where Jessup's job is hardest. The Tennessee
interior runs on Colonel Boatwright and the Alignment, which is a real organisation with real
authority and which Jessup does not control. The Kentucky coal operators run their own country
around the mines and the loading facilities. The Delta and the coastal Carolinas look at Atlanta for
leadership. Georgia's large cities run themselves on a banking economy and have no particular
interest in the mountains a few hours away.

The defining structural fact is that this region holds grudges with a documented history and a
paper trail. A dispute about a mill, a road, a mine lease, or a flooded field is a dispute that
predates the player, has written records, and will be settled by the people it started with. The
player is not solving a dispute here. The player is choosing a side in one.

**What happens there.** Terrain that favours the defender more than anywhere except the Mountain
West, and a population that has been leaving for a generation. The Migration system is the
dominant system in this region: people leave for the Seaboard, for the Gulf, and for the Lakes Works,
they take their skills, and they leave behind a place with a lower worker count every year, which
lowers production, which makes it cheaper to leave.

Coal and timber are the export and the reason nobody here is quite as poor as it looks. Both are
metal-adjacent in the game economy, and a region with a genuine mineral export and a declining
workforce is a region that can arm itself but cannot field an army of size.

Outbreaks spread along the roads rather than the density, which is a rare configuration in this game
and produces a completely different feel: an infection that follows a valley, hits a town, waits
there, and moves on when the road traffic carries it. The player who understands this can contain an
outbreak in this region that would be uncontrollable in the Seaboard.

### 3.7 THE MOUNTAIN WEST

**What it looks like.** The largest region by area and the emptiest by a factor of ten. The terrain
does the defining: a spine of genuinely serious mountains running down the middle, high desert on
both sides of it, and valleys between the ranges that are either very good farmland or nothing at
all. Elevation is the region's main character. Towns sit at different altitudes within a few miles of
each other and the people in the high towns are visibly different from the people in the valley, and
they have been for a century.

The region's wealth is underground and its settlement is on the surface, so the pattern everywhere is
a company town with a company above it. Butte, the Coeur d'Alenes, the Nevada camps, the Colorado
basin, and the oil fields of the Permian edge are all variations on this. The company pays well, owns
the housing, and is the only reason the town exists.

**Who controls it.** The Mountain Alliance, which means it is controlled by nobody in particular and
defended by everybody in a way that has never been tested. Denver is the nominal seat. Salt Lake
controls the water. Phoenix controls nothing except a great deal of water that it wants. Albuquerque
has stopped participating. Las Vegas is a city with no farmland that pays for everything and
contributes almost nothing except money and anxiety.

**What happens there.** Water, and only water. The Mountain West is the only region where the Water
system is the primary constraint on everything else, and the numbers are not in dispute: this region
has been drawing down a supply that does not replenish for a very long time, and everyone in it
knows it. Agriculture, population, and industry all compete for the same shrinking resource, and the
political structure described above is the structure that has been failing to solve it for a
decade. A region that runs out of water is not a region that has a crisis. It is a region that
loses population every year with no floor, because there is no floor when the constraint is physical.

Defence is the region's other function. Anything coming from the east has to come through flat land
eventually, and anything coming from the west has to cross the Sierra or the desert. A force that
attacks into this region walks. That is the whole military argument and it is why the section has
survived when smaller ones have not, and it is also why Grant cannot win anything.

The player here gets the best defensive gameplay in the game and the worst offensive experience, and
a lot of escort, hold, patrol, and supply work. A player who wants to spend the whole campaign
conquering will be miserable in this region, and the region's leaders know that and have stopped
apologising for it.

### 3.8 THE PACIFIC COAST

**What it looks like.** Two coasts and a valley, and the valley is the part that matters. From
Oregon to San Diego the region is a coastal strip of ports and an inland strip of the most productive
agricultural land in the country, and the entire political and economic life of the Compact is the
relationship between those two strips. The coast has the harbors, the money, the factories, and the
people arriving from out of state. The valley has the water, the fields, and the people who cannot
leave.

Outside the lower forty-eight, Alaska and Hawaii sit in this region and are a different problem
entirely. Both are separated from the mainland by more distance than the Compact's supply design
assumes. Both have strong local leadership. Both would have to be asked rather than told, and the
Compact's paper geography and its actual logistics disagree about both of them constantly.

**Who controls it.** The Pacific Compact, and the internal argument is the most visible in the game
because everybody in the country can see it. The coastal cities believe the valley is subsidised. The
valley believes the coast took the water and gave a lecture. Vega is the only person in California
who is genuinely angry at both of them, and that shared anger is the only thing holding the section
together. Hawaii and Alaska are not in the argument because they are not in the room.

**What happens there.** Chokepoints. This region has the lowest food security in the game and the
most concentrated set of ways to lose it. The ports, the two northern rail heads, and a small number
of bridges and passes between the coast and the valley are the entire supply system, and a raid on
one of them is felt in four states. The Pacific Compact's rating for food is the lowest of the six
and this is the region where that number is earned, every single day, in a way the other sections
do not have to think about.

Water allocation is a recurring, legitimate, and completely unresolved fight. The region's farmland
depends on irrigation that the coastal cities also depend on, and every year the number is
recalculated and every year somebody's fields are the adjustment. This produces local unrest that
never quite reaches a crisis, low loyalty in specific inland counties, and a standing temptation for
an outside ruler, mainly the Mountain Alliance, to walk in and offer a better water deal. Vega has
seen that offer made four times.

Weather is the region's other variable and it is not only storms. A dry year in the valley is a
national food event, and the region's own leaders know they are one bad year from having to choose
between feeding the coast and feeding the towns inland, which is the exact choice that Vega's entire
career has been about avoiding.

The player here is on the most profitable ground in the game and the most fragile. Trade contracts
pay the best rates anywhere. A closed port or a cut road turns that into the worst situation anywhere.

---

## 4. RELATIONS BETWEEN SIDES

Starting relations are computed, not typed, per FACTIONS.md section 6. What follows is the shape
those relations will tend toward, and the reason each pair is the way it is.

| Pair | The real tension |
|---|---|
| Pacific and Atlantic | The two rich, food-short sections. They do not compete for farmland, they compete for the same suppliers, and the only thing keeping them apart is that they are on opposite coasts and both too busy to notice. |
| Atlantic and Great Lakes | The creditor and the debtor, and it is the most consequential relationship in the game. Corridor loans buy Lakes grain and Lakes votes, which is how the most powerful administration in the country keeps the most important territory in it aligned. |
| Atlantic and Lone Star | The lender who offered twice and was refused twice. Castille has refinanced the refusal both times and Adair has told the player it was boring and important. This pair is the most likely to turn from commerce into war, and it will be over something neither side planned. |
| Great Lakes and Southern | Two food exporters with a border nobody can define. The Ohio and Mississippi river country is the shared ground and the shared grievance, and Bernice and Cordell are both solving the same problem of feeding a section that eats more than it makes. |
| Great Lakes and Mountain | The Plains supply the mountains' food and the mountains supply the plains' metal, and neither trusts the other's price. |
| Mountain and Pacific | Water, and only water. The Mountain West's water problem and the Pacific Compact's irrigation problem are the same physical problem, and both sides have an interest in the other's farmland that neither will admit. |
| Mountain and Lone Star | A border in the desert that neither side can supply across, which has kept them at peace and has produced a long border industry of trucks and small-time raiding. |
| Southern and Pacific | The shortest relationship in the game. They are far apart, they compete for almost nothing, and they are the two sections most likely to be allied simply because nobody has a reason to fight. |

The two pairs that are not going to hold are the Atlantic and Great Lakes pair, which is a
relationship rather than a rivalry, and the Atlantic and Lone Star pair, which is a grudge. A player
who understands that the grudge is the only relationship on this table that exists because
somebody was refused something gets the whole early game.

---

## 5. WHAT THE PLAYER SEES AT START

- The side selection screen shows ratings, pros, cons, and the biggest danger per side, per
  FACTIONS.md section 7. All of the language for that screen should come from the values sections
  above rather than being written fresh.
- The region screen shows the eight regions, who holds each, and the dominant local condition. The
  player picks a region, then a state inside it, then a role.
- Every region names a first local problem the player can walk into on day one. Those are listed in
  the What happens there sections and are all conditions the systems can already evaluate.
- The Wanderer option is presented as the sandbox start it is, with no bonuses and no protection.

---

## 6. OPEN QUESTIONS FOR THE OWNER

These are decisions the lore cannot make and that should not be fudged in content.

1. **Indigenous nations.** The Mountain West, the Pacific Coast, and the Plains all have sovereign
   Native nations with land and treaty rights. CONSTITUTION.md section 6 bans real organisations as
   factions, which is correct, but it leaves a real question: are these nations present in the world
   as entities the player must deal with, as settlements with distinct governance, or are they
   handled entirely off-screen? This needs an owner decision before any text is written about the
   region, and it is not a question to be resolved by an agent.
2. **Alaska and Hawaii in the Pacific Coast region.** They are inside the section and they are not
   operationally part of the mainland supply system. Either they get a sub-region of their own, or
   they get a travel penalty severe enough that the map communicates the distance on its own.
3. **The water systems naming.** Real western water districts, irrigation authorities, and
   municipalities are named organisations with real authority. The region text refers to them by role
   rather than by name to stay inside CONSTITUTION.md section 6, which means the Pacific and Mountain
   regions are less specific than the others. Owner call on how far to go.
4. **Metro areas that cross a region line.** Pittsburgh, El Paso, and the Ohio River Valley slice
   all sit in the documented exception table in section 1. Whether the pipeline should assign
   settlements at metro level rather than state level for these is a Phase 0 data question, not a
   content question, but the content is written assuming it can.
5. **Whether the six hand-written strongmen named in this file's region sections should exist as
   fixed characters or as seeds.** They are placeholders written to make the control structure
   legible. RULERS.md says the roster is generated, and the right answer is probably to keep one or
   two anchors per region and generate the rest, but that is a call about how much hand-written
   character content V1 can carry.
