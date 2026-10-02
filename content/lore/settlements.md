# SETTLEMENTS

The places on the campaign map, written the way a traveler remembers them after
leaving. Eighteen entries: big towns, small villages, and rough outposts, spread
across all eight regions and all six sections so that no part of the map is only
a name.

Read `content/lore/factions-regions.md` first. It holds the regions, the six
sides, and the local fight in each one. This file does not repeat any of that. It
answers a narrower question: what does this place look like when you ride in, who
is standing around, and which building tells you the most about who actually runs
it.

Rules this file obeys:

- Real geography, real settlement names, fictional people and fictional history.
  No real person, company, or organisation appears here, per CONSTITUTION.md
  section 6. Where a real agency is unavoidable, it is described by its role the
  way `factions-regions.md` describes western water districts.
- Populations and size classes are the published 2020 Census place figures
  imported by the Phase 0 pipeline in `services/world-data/exports/settlements.jsonl.gz`.
  Nothing here is invented. Where a settlement feels bigger or smaller than its
  class, that gap is the point and is written down rather than smoothed over.
- Every entry describes a condition the systems can already read. A town that has
  a stockyard problem has one because the food and unrest systems say it does, not
  because anything below fires on a date.
- Plain ASCII throughout. No em dashes, no en dashes, no curly quotes, no special
  characters. Line wrap near 100 columns, matching the rest of `content/`.
- Each description runs 150 to 250 words. Each entry closes with three to five
  one-line first impressions, written as a scout would report them.

## How to read an entry

| Field | Meaning |
|---|---|
| Region | One of the eight regions from `factions-regions.md` section 1, named the same way |
| Section | The side that holds it at world start, from `factions-regions.md` section 2 |
| Population | Published 2020 Census count for the incorporated place or consolidated city-county |
| Size class | The pipeline's own classification: village, town, or city |
| Known for | The one thing a local would say first |
| Notable location | The building the player is most likely to walk into |

The "Plays as" line, where it appears, is the documented region exception from
`factions-regions.md` section 1. Pittsburgh and El Paso are the only two such
places on this list.

---

## 1. CINCINNATI, OHIO

**Great Lakes Works. Great Lakes Union. City, 311,097.**

| Field | Value |
|---|---|
| Region | 2. The Great Lakes Works |
| Section | Great Lakes Union |
| Population | 311,097 |
| Size class | City |
| Known for | The river, the bridges, and forty years of arguing about who pays to keep them up |
| Notable location | A beer hall in a converted packinghouse two blocks off the bluff |

### Arriving

You come up off the bridge from Kentucky and the whole city arrives at once, all
of it stacked on the first terrace of hills above the water and none of it
visible past the next block. This is a river town that grew up looking at the
water instead of at itself, so everything runs downhill toward the same strip of
warehouses, bridges, and machine shops, and the hill streets above it are all
residential and all tired.

The mood is working, not cheerful. People here talk about the river constantly
and rarely with any affection, because the river is where the freight comes from
and where the good industrial ground floods. Half the workforce in this metro area
is downstream of a bridge that somebody in the section's capital has decided is
fine for another four years.

You see the actual shape of the section in the shift change: men in work clothes
walking toward the mills at four in the afternoon and men in the same clothes
walking away from them at eleven at night. The packinghouse district still has a
beer hall in an old cold-storage building where the afternoon shift and the
overtime crowd drink at separate ends of the same bar without ever quite merging.
Ask which plant is short a crew this week and everybody answers before you finish
the question.

### First impressions

- River town, real industry, and everybody's mood depends on which shift they are on.
- Most of this population lives on a floodplain the city keeps choosing not to fix.
- Nobody is hungry and nobody is happy, which the locals insist are different facts.
- The bridges are the whole economy and the whole argument, and they are watched.
- A man here will tell you what a bushel of corn does in Chicago before he tells you his name.

---

## 2. NEWPORT, KENTUCKY

**Appalachian Interior. Southern Compact. Village by the pipeline's cut, 13,812.**

| Field | Value |
|---|---|
| Region | 6. The Appalachian Interior |
| Section | Southern Compact |
| Population | 13,812 |
| Size class | Village by the population cut, and wrong about it |
| Known for | Being the town you are looking at when you are standing in a different section |
| Notable location | The tow yard at the foot of the bridge, which is also the local office of everything |

### Arriving

The pipeline files this as a village and the field is right there on the ridge
overlooking the water, running out toward the levee and the crossing. In practice
Newport is denser than four fifths of the towns in either section, because it is
built on the only flat workable ground on the Kentucky side of a river that
four hundred thousand people depend on.

You feel the seam before you understand it. The bridge takes you from a Great
Lakes Union city into a Southern Compact town in about four minutes, and the
things that change are not dramatic. The phone code changes. The license plates
change. The men at the tow yard call across the water to a man they know by name,
and neither of them finds that remarkable, because it has always been that way
and there is a shared bar on the Kentucky side where they have been arguing about
it since long before either section existed.

The people here are Kentucky people living a Cincinnati commute. That makes them
the most politically confusing population in the game: their wages, their water,
and their jobs all point north across the river, and their loyalty, their kin, and
their county line all point the other way. Almost nobody here considers themselves
part of the Southern Compact in a personal sense. Almost nobody here will say that
out loud to a stranger either.

### First impressions

- Small, crowded, and split across a river from a city four times its size.
- The tow yard at the bridge foot is the closest thing to a town hall.
- Wages say Ohio. Family, church, and grave say Kentucky. People live in the gap.
- Two sections share one crossing and neither has ever garrisoned it properly.
- Good ground is scarce here, which is why the price of a driveway is a real subject.

---

## 3. PIKEVILLE, KENTUCKY

**Appalachian Interior. Southern Compact. Village, 7,437.**

| Field | Value |
|---|---|
| Region | 6. The Appalachian Interior |
| Section | Southern Compact |
| Population | 7,437 |
| Size class | Village |
| Known for | Coal, a courthouse, and the fact that both of those are older than the state |
| Notable location | A garage on the bypass that fixes trucks and settles arguments |

### Arriving

The road into Pikeville comes down off the mountain in eleven switchbacks and
then straightens out for the last mile, which is the part where you can suddenly
see how boxed in the town is. Ridges close on the valley from three directions.
There is one way in worth the name and one way out, and the second one floods
often enough that the county has a public argument about sandbags every spring.

The town is a coal town that has outlived two booms, and it does not apologize
for that. Most people here have a father or a grandfather in the mines and a
brother or a husband who left, and the ones who left are why the housing is cheap.
There is not much money in Pikeville and there is a surprising amount of work,
because the roads are always bad and the road crews are always hiring.

The mood is not miserable. It is the specific mood of a place where everyone has
already survived the last bad thing and plans to survive the next one. Strangers
get a formality that is regional rather than unfriendly. The one building worth
finding is a garage out on the bypass, a two-bay place that does heavy truck work
in the morning and becomes an unofficial town meeting in the afternoon, where the
disputes about who owns which lease get settled out loud in front of everybody
while a man changes an oil filter.

### First impressions

- One valley, two usable roads, and a long habit of being cut off in winter.
- Coal still runs the ledger and the road crews run the payroll.
- Cheap housing, plenty of work, and a generation quietly leaving.
- Every local argument has a paper trail and predates the player by decades.
- A troop column here is a rumor by the second town, which is fine, that is what it is for.

---

## 4. PADUCAH, KENTUCKY

**Appalachian Interior. Southern Compact. Village by the cut, 26,749.**

| Field | Value |
|---|---|
| Region | 6. The Appalachian Interior |
| Section | Southern Compact |
| Population | 26,749 |
| Size class | Village by the cut, which is generous to the word village |
| Known for | The river, the levee, and the southern end of the state |
| Notable location | A diner where the towboat crews eat, on the wrong side of the wall |

### Arriving

Paducah sits on the far western edge of Kentucky where the Tennessee comes in to
join the Ohio, and that geography explains the entire town. It is a river town in
the sense that everything about it is downstream of something. The farmland around
it is the best in the state. The water underneath it is the reason the farmland is
worth anything and the reason the town has spent a hundred and fifty years
building the wall that keeps the river in its own bed.

The wall is the first thing you see and it is the town's whole personality. People
walk on top of it. It is paved, it is mowed, it has benches, and it is the only
flat continuous public ground for three miles in any direction. Kids bike on it.
When the river comes up close, half the population ends up on it, and the section
governor from Atlanta learns about it before the local government does.

What you feel arriving is a working river economy that is not quite as healthy as
it was. The towboat crews still eat at the same three places and there are three
fewer places than there were. The grain and the barge traffic give this town more
contact with the section's interior than any city in the state, which makes it the
first place in the Appalachian region where an outsider's accent stops being an
event.

### First impressions

- Rich farmland on top of the best river bottom land in the state, none of it safe.
- The levee is the town's park, its promenade, and its flood plan all at once.
- A Southern Compact town that trades west more than it trades south.
- Towboat crews are the closest thing here to a foreign service, and they know it.
- The wall is walked by everybody, which makes it the best place in town to hear what is actually happening.

---

## 5. LORAIN, OHIO

**Great Lakes Works. Great Lakes Union. Town, 65,337.**

| Field | Value |
|---|---|
| Region | 2. The Great Lakes Works |
| Section | Great Lakes Union |
| Population | 65,337 |
| Size class | Town |
| Known for | A steel plant on a freshwater harbor, and the shore road that looks over all of it |
| Notable location | The union hall, where the foreman and the men who work for him drink in the same room |

### Arriving

The harbor is the town. There is no other reason for Lorain to exist where it
does and there never has been, and everything in the place is arranged around the
water on one side and the ore and the finished steel going out on the other. You
can drive the whole town in fifteen minutes. You will do it twice on your first
day because you will get turned around at the ship channel.

The mood is the Lakes Works mood in its purest form, which is to say nobody here
is talking about food. The recurring crisis in this region is a stoppage, and in
Lorain that stoppage is one payroll decision away at a company that is not a
section and does not answer to one. The plant pays above the section average
because the work is hard, and the section cannot replace it and would not want to.

The interesting thing here is the arrangement on the ground. Management, the
foreman, the union local, and whoever controls the rail spur all live in the same
four square miles, and all four of them outnumber the people who belong to none of
those four. A ruler who only speaks to the plant manager will learn the truth in
a week. A ruler who walks into the union hall first will be told what is actually
true by people with no reason to lie, provided nobody asks them to promise
anything.

### First impressions

- One plant, one harbor, one town, and a ship channel you will get lost in.
- The busiest stoppage risk in the region and the highest wages in it.
- Management and the men who work for them drink in one building. Watch how they do it.
- Fresh water harbor, flat ground, no high ground for miles, which the local defense plan mentions constantly.
- The rail spur is a real political structure here, not a logistics detail.

---

## 6. OMAHA, NEBRASKA

**Corn Belt and Plains. Great Lakes Union. City, 483,335.**

| Field | Value |
|---|---|
| Region | 3. The Corn Belt and Plains |
| Section | Great Lakes Union |
| Population | 483,335 |
| Size class | City |
| Known for | The elevators, the rail, and the section's most public argument |
| Notable location | An elevator office with a coffee pot that has been on since four in the morning |

### Arriving

Omaha is not a farming town. It is a town built by farmers to move what they grew,
and everything physical about it points at that fact. The elevators stand at the
south end of the city in a row you can see from the interstate. The rail comes
in, crosses the river, and goes into a yard the width of a neighborhood. The
office buildings downtown hold the people who decide what a bushel is worth.

That decision is why this place matters more than its size suggests. The Corn Belt
feeds the whole map, and Nebraska wants the export gates opened and the money
brought home. Everybody in this city works in one of the two rooms where that
fight is not settled. You arrive somewhere that is professionally, as a matter of
employment, interested in a policy disagreement.

The mood is fast and argumentative in a specific way. People here are not
resigned, they are mid-argument, and the argument is about a number. The
agricultural year is the local calendar and the local politics both. In the fourth
week of July the city gets quieter, because that is when everyone finds out what
they actually have.

A mechanic's garage two blocks off the elevator row will tell you the state of the
crop better than any office will, and the elevator offices will tell you what the
crop is worth. Two different questions, and this is the only place on the map
where both get asked at once.

### First impressions

- Grain capital of the section, and the only city in it where the argument is the job.
- Elevator row is the town's skyline. There is no second skyline.
- Best prices on the map, worst argument about whether to take them.
- Flat, wide open, and you can see a storm from three counties out, which is also how gossip travels.
- Every large cavalry or supply column that comes through is mistaken for a raiding column, and nobody is fully wrong.

---

## 7. OGALLALA, NEBRASKA

**Corn Belt and Plains. Great Lakes Union. Village, 4,680.**

| Field | Value |
|---|---|
| Region | 3. The Corn Belt and Plains |
| Section | Great Lakes Union |
| Population | 4,680 |
| Size class | Village |
| Known for | The river valley, the interstate, and everything that comes down it |
| Notable location | A gas station cafe with six tables and a wall map with the local road closures marked in grease pencil |

### Arriving

Ogallala is on the Platte River in western Nebraska, which means it sits in the
middle of the flattest, widest, most exposed ground in the game with a river that
does not go anywhere. The land around it is superb and the town is not, because
this is not a farming town. It is a place that got built because the highway
crossed the river here, and when the highway stopped needing anything, the town
did not move.

You feel the raiding immediately and you do not need to be told. This is the part
of the Corn Belt where bandits and raiders operate, not because the people are
lawless but because there is three hundred miles of open road in every direction
and slow, valuable things moving along it. Local families here have been raided,
some of them more than once, and they have a settled, unhysterical way of talking
about it that is much harder to read than anger would be.

The notable location is the cafe, and it is a real institution. Six tables, a
counter, an excellent pie, and a wall map that the truckers update themselves in
grease pencil every time a road closes or a bridge goes out. Half the local
intelligence in this region passes through that wall, free, and nobody has
successfully closed it.

### First impressions

- Highway town on a river that goes nowhere, four thousand people and one very good pie.
- Raiders are routine here and locals discuss it like weather.
- The wall map in the cafe is the most accurate road report in the section.
- Best hunting land and worst road safety in the region, and everybody knows both.
- A cavalry column on this highway is a raiding column until proven otherwise.

---

## 8. PITTSBURGH, PENNSYLVANIA

**The Seaboard, but it plays as Mountain. Atlantic Corridor. City, 303,255.**

| Field | Value |
|---|---|
| Region | 1. The Seaboard |
| Plays as | Mountain. Documented exception: a mountain city held by a coastal section |
| Section | Atlantic Corridor |
| Population | 303,255 |
| Size class | City |
| Known for | Rivers in a valley, freight brokerage, and a grievance with a very long paper trail |
| Notable location | A mill bar on the bluff that has outlasted three of the companies that funded it |

### Arriving

You come up out of the Monongahela valley and Pittsburgh is not a city on a plain,
it is a city inside a crease in the ground. Rivers on three sides, ridges on the
other three, and every single street that matters runs along one of those contours.
It is built at the scale of a valley rather than a map, and it has the strong
industrial light of a place that was very rich fifty years ago and built
everything to a standard it can no longer quite afford.

The mood is proud and litigious. This is the awkward child of the Atlantic
Corridor, a mountain city administered from Washington and New York by people who
have never worked a shift, and the resentment about that is not new and not going
away. What makes Pittsburgh worth writing down is that it is still competent.
The freight brokerage district is the best in the eastern half of the country and
its reputation is deserved, which means the city is genuinely difficult to bully.

And the terrain is the joke the region tells at its own expense. The section's
signature advantage is an administration you can sign things with, and this city
has spent forty years pointing out that it can be defended extremely well by a
handful of determined people on a ridge, and that nobody in the capital has ever
come to see whether that is true. It is true.

### First impressions

- Mountain city with a coastal section's paperwork, and an old grievance about exactly that.
- Ridges, valleys, and rivers. Nothing here is flat, including the political lines.
- Freight brokerage capital of the eastern half, reputation fully earned.
- Defensible by a small determined force, which the capital has never bothered to test.
- Everyone here says "the Corridor" the way people elsewhere say "the government."

---

## 9. PORTLAND, MAINE

**The Seaboard. Atlantic Corridor. Town, 69,104.**

| Field | Value |
|---|---|
| Region | 1. The Seaboard |
| Section | Atlantic Corridor |
| Population | 69,104 |
| Size class | Town |
| Known for | A working harbor, long winters, and food that arrives from somewhere else |
| Notable location | A fish pier shack that doubles as the town noticeboard |

### Arriving

Portland is the oldest working harbor in this region and it shows in the bones of
the place. The downtown is brick, the streets are narrow, the buildings are four
stories, and everything was built for a trade that still happens. The water is
cold enough in April to make people honest. There is no horizon and there is never
any distance between anything, because the whole eastern seaboard is a ribbon of
buildable ground with water on one side and hills on the other.

The thing that strikes you, coming from anywhere west, is the arithmetic. Portland
has a harbor, a rail line, a hospital, and the best communications in the country,
and it cannot grow a meaningful thing to eat. The farmland around this town is
whatever is left over after the roads and the houses, which is close to nothing.
Every sack of grain, every can of food, and most of what is in the pantry came up
the river or off a boat, and everybody in town knows it, and it is the single
loudest subject in local politics.

The mood in winter is grey and long and everyone says it affects them, and it
does. Morale in this town drops with the light and recovers with the light, which
makes it a strange place to garrison in February and a strange place to be a
refugee in.

### First impressions

- Coldest, oldest, tightest town on the map. Beautiful and it does not pretend otherwise.
- Imports essentially all of its food and resents that more than it resents anything.
- Prices move on news here faster than anywhere else in the country.
- Best hospital and best phone coverage on the map, which is what a Seaboard crowd is for.
- Population density is the local danger. A crowded district here fails faster than a crowded district anywhere.

---

## 10. NEW ORLEANS, LOUISIANA

**The Gulf. Southern Compact. City, 364,136.**

| Field | Value |
|---|---|
| Region | 5. The Gulf |
| Section | Southern Compact |
| Population | 364,136 |
| Size class | City |
| Known for | The river, the port, and the fact that both of those can kill you |
| Notable location | A bar two blocks from the water where the dock crews drink and the pilots argue |

### Arriving

New Orleans is on a bend of a river and everything about the place is an argument
with water. The French Quarter is the old high ground and it is the part everyone
photographs. The rest of the city is built on ground that is barely above the
river, and the people who live on it know exactly how high that is, because they
have had to find out.

This is the most strategically located port in the interior of the continent and
the most flood-prone major city in America, and both of those are true at the same
time and always have been. It is not a contradiction. It is the reason the port is
worth taking and the reason nobody who has lived here for two generations trusts a
ruler who promises to fix the walls.

The mood is not defeated. It is tired in a specific and accurate way. This is a
place that has been hit hard repeatedly and gets up, and the getting up has left
the population older, the housing worse, and the tax base the lowest in the game.
You can move an army out of here in nine days. You can pay for it in about nine
days too, which is the sentence the section's finance people say when nobody else
is listening.

### First impressions

- The best port in the interior and the worst ground in the country, at once, permanently.
- Lowest tax capacity on the map. Wars fought from here are wars somebody else pays for.
- Storm season is also the season nobody can move an army, and everybody plans around it.
- Ground that is mostly not high enough, and a culture that has stopped pretending otherwise.
- Warehouse blocks and a bar. The port is run by people whose names you will not find on any section list.

---

## 11. BILOXI, MISSISSIPPI

**The Gulf. Southern Compact. Town, 48,235.**

| Field | Value |
|---|---|
| Region | 5. The Gulf |
| Section | Southern Compact |
| Population | 48,235 |
| Size class | Town |
| Known for | The beach, the boats, and a town that rebuilt twice and kept the same businesses |
| Notable location | A bait shop that also passes mail, makes coffee, and knows the town's mood better than any official |

### Arriving

Biloxi is a beach economy in a region that is mostly delta, and it sits on this map
as its own thing with a set of problems none of the other Gulf towns have and one
set of allies nobody else in the section can match. The water is the reason people
are here. The rest is whatever you build once you have decided to stay, and what
they built is a strip of restaurants, a set of docks, and a lot of buildings that
have been rebuilt and kept their addresses.

You notice first that there are very few permanent residents under thirty and a
lot of people over fifty. That is the whole story of the beach economy in one
detail. The young people work a season and leave for the construction money
somewhere else. The ones who stay are the ones whose money came from somewhere
that did not move.

The mood between storms is genuinely good. People swim, they eat outside, and the
tourism economy keeps the lights on for eleven months of the year. Then the water
comes in and takes a quarter of the town in a day, and the recovery is less a
repair than a substitution: the same people, the same businesses, different
buildings, a new generation of out-of-state money, and a local population that is
about the same size it was before and noticeably grayer.

### First impressions

- Beach economy on a delta coast. Rules to itself, contributes money, absorbs damage.
- Storm season is annual, total, and everyone has a plan for it that has never worked.
- Young people leave in a season. The ones who stay are the ones with money.
- Youngest median age in the Gulf, except right after a storm, when it is the oldest.
- Useful to a ruler who needs the coast and useless to one who needs the interior.

---

## 12. EL PASO, TEXAS

**The Texas Frontier, but it plays as Desert. Lone Star Frontier. City, 678,958.**

| Field | Value |
|---|---|
| Region | 4. The Texas Frontier |
| Plays as | Desert. Documented exception: Frontier-held desert, and the water rules are nothing like the rest of Texas |
| Section | Lone Star Frontier |
| Population | 678,958 |
| Size class | City |
| Known for | The border, the mountains, and a water supply that is the whole argument |
| Notable location | The city water office on the west side, where the public meetings are packed and the notices go up early |

### Arriving

El Paso sits in the crook of the Rio Grande with a wall of mountains behind it
and desert in every other direction, and it is the largest city in the section and
the one least like the rest of it. East Texas is wet and wooded. The Hill Country
looks like the postcards. This is the far end, and the section's authority over
here is administrative at best.

You feel the water problem before you see it in anybody's face, because you feel
it in what is planted, what is paved, and how many lawns are actually green. In
the rest of Texas you can drive for two hours and find water. Here you can see the
source of it from the highway and it is a finite thing under somebody's
jurisdiction, and the argument about who gets how much of it is older than
everybody currently arguing about it.

The mood is not tense. It is practical in a way that surprises visitors, because a
city this size built on this much desert has had to solve things that nobody else
in the section has to solve at all. What it has not solved is distance. El Paso is
a long, expensive, badly supplied march from Houston and from San Antonio, and a
column that comes out here is a column that is eating and driving for most of the
journey.

### First impressions

- Desert city, huge population, and the only water anybody in the section has to fight over.
- Longest march in the game. Distance here is the enemy and nobody has fixed it.
- Everything is irrigated, rationed, and priced. Nothing is free and nothing is from here.
- The border is a daily fact of life, not a rumour, and it is not a place the player can project into.
- Compact, tough, self-contained, and effectively unreinforceable from the section's capital.

---

## 13. ALPINE, TEXAS

**The Texas Frontier. Lone Star Frontier. Village, 6,039.**

| Field | Value |
|---|---|
| Region | 4. The Texas Frontier |
| Section | Lone Star Frontier |
| Population | 6,039 |
| Size class | Village |
| Known for | Ranch country, a real college town, and a highway that goes nowhere else |
| Notable location | A cafe attached to the fuel station, where the county's whole weekly business gets done |

### Arriving

Alpine is six thousand people in the middle of a very large space, and it is
split in half by the highway in a way that is true of half the towns in this
section. The people who work the ranches live here. The people who work the oil
field forty minutes north live here in summer and drive every day or live in the
field camps. They get along the way two groups get along who both own the same
water.

The town has a university, which is unusual this far out and which does more for
its character than anything else. It means there are young people, which means
there is a coffee shop that is not a bar, which means there is somewhere in this
town where a conversation can be had that is not about the same forty families
that everybody else is related to.

What the region lore says about this section is that every fight down here that
is not about a section is about whether a particular field stays open. In Alpine
that is literally the town meeting. Cattle interests, oil interests, and the people
whose families have been here since before either of them, sitting in the same
room, arguing about grazing and flaring and who pays for the road that serves both.
It has been going on longer than any player will be in the campaign.

### First impressions

- Small, dry, and split between cattle money and oil money, which have never liked each other.
- The weekly meeting is the real local government and the minutes are the record.
- Ranch tradition says a mounted force crossing your land takes what it can carry.
- The college is the only reason this is not a company town.
- Two days of supplies from anywhere useful, which everybody knows and nobody enjoys.

---

## 14. BUTTE, MONTANA

**Mountain West. Mountain Alliance. Town, 36,360.**

| Field | Value |
|---|---|
| Region | 7. The Mountain West |
| Section | Mountain Alliance |
| Population | 36,360 |
| Size class | Town |
| Known for | The headframe, the altitude, and the fact that the mountain is still the employer |
| Notable location | A shift-change diner at the bottom of the hill |

### Arriving

Butte is a town built inside a hole in the ground. The streets are laid out on the
floor of what was once an open pit, the streets above them are the benches cut
around its edge, and from most of the town you can look up at the town. It is the
most vertical small city in the country and the altitude is part of how it looks.
People carry on slower than you expect and have for generations.

The wealth is underground and the settlement is on the surface, which makes this
the pattern everywhere in the Mountain West: a company town with a company above
it. The mine pays well, owns the housing, and is the reason the town exists. When
the mine cuts back, this town empties in a way no factory closure in the Great
Lakes Works can match, because there is nothing here to fall back into. There is
no other industry within a hundred miles a person could walk into and be hired by.

The mood is proud and specific. This is a mining town where the mine is old enough
to have fathers and grandsons in it, and the pride holds even when the sentiment
does not. The diner at the bottom of the hill is the place to be at shift change,
and it is where the section's credibility is decided. If somebody from Denver has
come to visit, the crew will say whether it mattered long before the capital hears
about it.

### First impressions

- Vertical company town. One employer, one employer-owned housing stock, no backup.
- Thin air, slow pace, and everyone has a relative underground or retired from it.
- Beautiful in a way that makes people defensive about it.
- Hardest place to leave and worst place to arrive without a job already lined up.
- The section's most earned reputation in its own territory, and its most fragile.

---

## 15. PHOENIX, ARIZONA

**Mountain West. Mountain Alliance. City, 1,650,070.**

| Field | Value |
|---|---|
| Region | 7. The Mountain West |
| Section | Mountain Alliance |
| Population | 1,650,070 |
| Size class | City |
| Known for | Being enormous, being hot, and wanting more water than exists |
| Notable location | The irrigation district's field office, where the annual number goes up on the wall every January |

### Arriving

Phoenix is the largest city in the Mountain Alliance by a margin that would be
absurd in a poor section, and it is the clearest proof on the map that this is not
a coherent state. A very large city in the driest possible place, with almost no
farmland, surviving on money and on water somebody else allocated to it.

You arrive into flat, enormous, and white. The valley is paved out to the horizon
in low buildings and parking. The mountains are visible from everywhere and you
learn to ignore them within a day, which only happens in places where the
mountains cannot help you. The afternoon heat changes how people move and talk.

The mood is not depressed, it is alert. The water number is public. Every January
the allocation for the year goes up on a wall in plain sight and everybody
immediately knows who got less, because the arithmetic is simple and the
disagreement is not. In this section water is not one issue among others. It is
the issue. Agriculture, population, and industry all compete for the same
shrinking resource, and the politics of the whole region is the argument about
which of the three gets cut this year.

And here is the thing Phoenix and the rest of the section both know: the most
powerful member of this alliance has spent years telling the others no, and that
one relationship is enough to split a section nobody else could split.

### First impressions

- Enormous, flat, dry, and entirely dependent on a number that goes up on a wall every January.
- Almost no farmland inside any practical distance, which makes this a port city that happens to be inland.
- The water argument is not politics here, it is arithmetic, and it is public.
- Money arrives fast, most of it from outside, and very little of it is local.
- One relationship in this city is worth more to an invader than an army, and the section knows it.

---

## 16. GALLUP, NEW MEXICO

**Mountain West. Mountain Alliance. Village, 20,451.**

| Field | Value |
|---|---|
| Region | 7. The Mountain West |
| Section | Mountain Alliance |
| Population | 20,451 |
| Size class | Village |
| Known for | The railroad, the high desert, and the water nobody has settled |
| Notable location | A diner across from the rail yard that opens when the second freight comes through |

### Arriving

Gallup came into being because the railroad needed a place to put water and a
place to put a yard, and it is still, fundamentally, that. The town is strung out
along the tracks at the bottom of a high desert valley, the elevation is high
enough that the light does something strange in the afternoon, and the nearest
large thing is very far away in every direction.

The people here are mostly not from here and the ones who are have been here a
long time. It is a railroad town with a truck stop economy, a coal and water
argument going on out of sight, and a stretch of highway that is the only
reason most of the people you see are passing through.

The mood is friendly and tired in the specific way of places that are important
to somebody's supply chain and not to anybody's heart. Albuquerque has stopped
attending the section's meetings and Gallup is downstream of that in every way
that matters, which is to say it is a town in a section that has stopped being
able to promise it anything. When the trains slow, the town's fortunes slow with
them, and the diner across from the yard is where you will hear it described
honestly by people who are not complaining, only counting.

### First impressions

- Railroad town, high desert, and mostly a place where freight stops to drink.
- Twenty thousand people in a valley the size of a small county.
- Section authority here is nominal and getting thinner.
- Free of the factional grinding that marks the rest of the Mountain West, and cut off from it too.
- A town that turns when the trains turn, and everybody here plans around that.

---

## 17. FRESNO, CALIFORNIA

**Pacific Coast. Pacific Compact. City, 545,716.**

| Field | Value |
|---|---|
| Region | 8. The Pacific Coast |
| Section | Pacific Compact |
| Population | 545,716 |
| Size class | City |
| Known for | The valley floor, the irrigation, and feeding a coast that has more people than water |
| Notable location | A packing shed where the loading starts at two in the morning |

### Arriving

Fresno is the middle of the Central Valley, which is the agricultural engine of
the entire Pacific Compact and one of the reasons any of it is fed at all. You
come into it through forty miles of orchards and field crops that go on past the
horizon, and then you are in a city of half a million people in the middle of that
cropland, and that is not a mistake, it is where the packing houses and the
trucks and the buyers are.

The water is the fight. Everything the valley grows goes through irrigation, and
the coastal cities that eat what the valley grows depend on the same
infrastructure. Every year the number is recalculated and every year somebody's
fields are the adjustment, and the people who take that adjustment are never the
people who made the calculation. That produces a low-grade unrest out here that
never reaches a crisis and never goes away, and it is the specific reason a
mountain-based rival has been able to walk in here four times with an offer that
sounded reasonable.

The mood is busy and slightly resentful in a way people here are proud of. They
grow the food for the entire coast and they know what that is worth, and the coast
knows it too, and the two have agreed to keep having this conversation in a room
instead of on a highway. Fresno is where it is hardest, because Fresno is the side
with the crops.

### First impressions

- Grows food for a coast of millions, and has the lowest food security in the game.
- Every field is irrigated and every irrigation is somebody's decision made by somebody else.
- Inland counties are the ones with the water argument, and they are the ones who get blamed for it.
- The packing sheds run all night and the town runs on their schedule.
- A mountain ruler with one good relationship here could take the valley without a fight. Vega has seen the offer made four times.

---

## 18. ASTORIA, OREGON

**Pacific Coast. Pacific Compact. Village, 9,986.**

| Field | Value |
|---|---|
| Region | 8. The Pacific Coast |
| Section | Pacific Compact |
| Population | 9,986 |
| Size class | Village |
| Known for | Fog, a bar at the end of the road, and the mouth of the largest river on the coast |
| Notable location | A dock bar that opens when the boats come in and closes when the fog comes in |

### Arriving

Astoria is where the Columbia comes out into the Pacific, and the town sits on
the north bank at the last place a person can stand and watch it happen. Ten
thousand people, a working harbor, a cannery row, and a marine railroad that runs
up out of the water and off into the woods. Everything in the town is either built
by somebody who came here for the water or has been here longer than the water.

The fog is the town's clock. It comes off the ocean in the afternoon, it stays
until the middle of the night, and the whole town runs on it. The boats come in
before it and the docks go quiet after it, and the bar at the end of the road
opens when the boats dock and empties when the fog lifts. Locals measure their
day by when they can see the far bank.

The mood is patient. Nothing here is in a hurry and nothing is coming. The
Pacific Compact has the highest food fragility and the best trade rates on the map,
and Astoria is a place where a person can stand in a doorway and see both halves
of that at once: a harbor that is worth a fortune and a town of ten thousand that
could not feed itself for three weeks if the road north closed.

### First impressions

- Ten thousand people at the mouth of a river, which is a strange place to be a real town.
- Fog sets the schedule. The bar opens when the boats come in.
- Best trade rates on the map and one very small road out.
- Everyone here works for somebody's supply chain and calls it a livelihood.
- Rain, salt, and diesel. A garrison here is a garrison and a guest at the same time.

---

## Notes for implementation

**Region and section assignment.** Every entry is assigned from the tables in
`factions-regions.md` sections 1 and 2, by state, so the lookup cannot disagree
with the region table. Cincinnati and Lorain are Ohio and so are region 2 and the
Great Lakes Union. Newport, Paducah, and Pikeville are Kentucky and so are region 6
and the Southern Compact. That asymmetry is intentional and is the whole point of
the V1 slice: a Lakes Union state and a Southern Compact state sharing a river, a
road, and a phone code.

**Pittsburgh and El Paso.** Both are documented exceptions in
`factions-regions.md` section 1: Pittsburgh is a mountain city held by a coastal
section, El Paso is Frontier-held desert with its own water rules. Both carry the
"Plays as" line. No other entry on this list is an exception, and
Alaska and Hawaii are the third documented exception and are not written here,
because the ocean treatment for them is an open owner question in
`factions-regions.md` section 6, item 2, and an agent should not resolve it.

**Size classes that do not fit.** The pipeline classifies by population quantile
cuts, which produces two entries that read wrong: Newport (13,812) and Paducah
(26,749) are both filed as villages and both read as dense small towns. That gap
is described rather than fixed. Fixing it would mean overriding
`services/world-data/exports/settlements.jsonl.gz`, which is generated output and
not a content file.

**Population figures.** All eighteen are the published 2020 Census counts already
imported by the Phase 0 pipeline. No population, food, or output number in this
file is invented. The food and unrest conditions described in each entry are the
conditions the systems can already evaluate per `factions-regions.md` and
`CAUSE_EFFECT.md`; nothing here is an event on a date.

**What this file deliberately does not do.** It does not name factions' internal
strongmen beyond what `factions-regions.md` already names, so no settlement
entry restates a leader's or antagonist's story. It does not write dialogue, which
belongs in `content/dialogue/`, and it does not assign quests, which belongs in
`content/dialogue/quests.md`. The notable location in each entry is the place a
regional variant of the tavern and merchant dialogue can be anchored to if anybody
wants to write one later.