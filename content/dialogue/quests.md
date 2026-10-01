# QUESTS AND QUEST GIVERS

Ten notable quest givers with full quests, one per starter quest type in
QUESTS_AND_NOTABLES.md section 4. Each one is a notable, not a ruler, so the
player meets them by riding into a town, not by being summoned.

Rules that hold for everything in this file:

- Real geography, fictional people. No real person, company, or event appears
  here. Per CONSTITUTION.md section 6.
- Every quest is triggered by world state. If the trigger is not true, the
  quest cannot appear. The trigger condition is listed under each quest so
  simulation can read it.
- Every quest writes back. Success and failure both change shared fields, and
  both get a cause log row.
- Dialogue is plain spoken American English. Contractions, fragments, regional
  rhythm. Nobody talks like a briefing document.
- One thought per line in dialogue. No em dashes, no fancy punctuation.

---

## 1. RUTHIE VANCE

**Farm owner. Village of Laton, California. Bound to Fresno. Pacific Compact.**

| Field | Value |
|---|---|
| Notable type | Farm owner and village headman |
| Home | Laton, Fresno County, six miles off the state route |
| Power | High. She speaks for four small farms and most of them are related to her |
| Party role she can offer | None. She has nobody to spare, which is the point |
| Quest type | Food delivery (type 1) |
| Trigger | Village food stock under 5 days, or a road closure on the Laton to Fresno route |
| Success writes | food_stock, Fresno prices, relation with Ruthie, loyalty |
| Failure writes | food_stock down, Ruthie relation hard down, cause log entry |

### Background

Ruthie Vance farms eleven hundred acres of grapes and almonds that used to be
somebody else's idea about what grows well in the Central Valley. She took it
over when the owner walked off the water debt, which she mentions in the first
five minutes because she does not want you thinking she is a success story. She
has four hundred people in her extended family inside a fifty mile radius and
roughly ninety of them work for her at some point in a year.

She is very good at one thing, which is knowing how much food a place has. Not
the county, not the state, the place. She can walk into a kitchen and tell you
how long it lasts by looking at the shelf and the trash can, and she has never
been wrong in a way she could not explain.

Her village has three and a half days of food. It is late August. The heat came
early, the shipping window on the north route closed after a week of fighting
between two crews over a water convoy, and the state highway is a checkpoint
that now wants a permit nobody in Laton has ever applied for.

### Setup dialogue

*She is standing in the shade of a truck bed with a clipboard and a jar of cold
coffee she is not drinking, watching two men argue about a tarp. She has been
watching you walk in for about thirty seconds.*

**Ruthie:** You are the one they sent. Okay. Do you have a truck that works or
a truck that looks like it works, because I have had a man stand in front of my
shed and lie to me about the radiator and I would rather not start the week
that way.

**Player:** It works.

**Ruthie:** It works on what grade of road.

**Player:** Bad.

**Ruthie:** Fine. Everybody says that. A man who says bad is at least honest,
so we are starting ahead.

*She hands you the clipboard. There is a number on it, then a line of names,
then a column of household sizes.*

**Ruthie:** Here is what I need. Eleven loads, and I will take eight if eight
is what you can do without making it a lie. Eleven is what the people here eat
before the heat turns and we can get at the orchards. Eight is what they eat if
we start cutting back on the ones who are already cutting back.

**Player:** What is between here and Fresno.

**Ruthie:** Four miles of nothing that is fine, then ninety minutes of route
66 that is now a checkpoint, then a bridge that got shot at in March and is
still standing out of spite. The checkpoint is the problem, not the bridge. The
checkpoint wants paperwork and nobody in this village has ever filed
paperwork.

**Player:** Who runs the checkpoint.

**Ruthie:** Two men from Bakersfield and a contractor out of Sacramento with a
clipboard of his own. That is the whole operation. The Bakersfield guys do not
care about the permit, they care about the coffee and the diesel. The
contractor cares about the permit.

**Player:** So we can talk to him.

**Ruthie:** You can talk to him. Just do not tell him my name until you know
whose name he wants. People in this valley have gotten in trouble for less.

*She finally drinks the coffee and makes a face about it.*

**Ruthie:** One thing. If you get up there and it is already loaded, somebody
else bought it, then do not do anything heroic, just come back and tell me. I
can work around a shortage. I cannot work around a hole in somebody's trailer
on a road with no shoulder.

### Objectives

1. Travel to the route 66 checkpoint at the eastern edge of Fresno County.
2. Secure a load of grain, forty sacks or equivalent, from Fresno market.
3. Bring it back to Laton and deliver it to the village hall.
4. Optional, costs one day: find out who holds the permit on the north route.

### Completion dialogue

*Four men are unloading into a hall that was a school until six years ago.
Somebody's kid is on the roof with a hose. Ruthie has not sat down since you
arrived.*

**Ruthie:** Count it. I do not care that you are tired, count it, because I am
going to have to write a number on a board tonight and I want it to be the right
number.

**Player:** It is all there.

**Ruthie:** Okay. Good. Okay. Now here is the part nobody thanks you for. I am
going to have to decide who does not get the next load, and I am going to do
that, and I will not enjoy it, and you are not going to be here for it, which is
the arrangement.

**Player:** You can tell me who.

**Ruthie:** No, I cannot, and if I told you then I would be doing it so you
would feel better about yourself. I have twelve households on that list and
about nine loads of grain. The eleven was never true. Eleven was me being
careful out loud.

*She folds the clipboard. She does not look at the truck.*

**Ruthie:** You know what the actual thing was, though. I did not need eleven
loads of grain. I needed somebody in this valley to be seen driving through
that checkpoint at a time when the men running it expected to get away with
whatever they wanted. Now they have to check. That is worth about nine loads to
me and about nine more loads next month.

**Player:** Will that come back up.

**Ruthie:** Everything comes back up. Probably some man in Sacramento will
write a memo about you and I will be the reason a form exists. Welcome to the
valley. Do not expect thank you again, I am only saying it once and I have said
it.

### Notes for implementation

- Eight is the real target and eleven is her stated ask, so the quest log
  should show eight as success. This teaches the player that notable numbers
  are negotiation, not math.
- The permit sub objective is the hook. It has no reward of its own and
  unlocks two later quests, a freight broker in Fresno and a smaller ambush
  chain on the north route.
- If this quest fails, do not delete the giver. She offers the food delivery
  again on a longer cooldown with a worse price, and she never mentions it.

---

## 2. DR. WREN OKONKWO

**Clinic director. Memphis, Tennessee. Southern Compact.**

| Field | Value |
|---|---|
| Notable type | Clinic head, runs the county public health office |
| Home | Memphis, Third Street clinic and a converted storefront on Summer Avenue |
| Power | Medium and rising. People trust her because she has not lied about a number yet |
| Party role she can offer | Surgeon, at a price, and only if the player passes a background check |
| Quest type | Medicine run (type 2) |
| Trigger | infection_index above threshold in Memphis or Jackson, medicine_stock low |
| Success writes | infection falls, medicine restored, loyalty, clinic relation |
| Failure writes | infection rises, quarantine holds longer, deaths recorded in log as a stat |

### Background

Dr. Wren Okonkwo has run public health for Shelby County since before the
institutions came apart, which means for most of her working life she has been
doing public health with no agency above her, no budget worth the name, and a
count of cases that she has had to take to the press to get anybody to move.

She is not a battlefield medic and does not enjoy being asked for one. Her whole
view of the world is that most of what kills people in this country is
predictable six weeks in advance and the only real question is whether anybody
with authority is willing to be unpopular on the day it is scheduled.

Memphis has a rotavirus outbreak in two apartment blocks and a shelter with
three hundred people in it. She has oral rehydration salts, antibiotics for the
secondary infections, and about a fifth of what she needs. The rest is in a
warehouse in Jackson that she has a requisition for and no way to pick up,
because the pickup requires a vehicle, a driver, and somebody willing to sit in
a truck for eleven hours with a stranger.

### Setup dialogue

*The clinic has a waiting room with eight chairs and all eight are full. She
comes out of the back in scrubs, does not shake your hand, and starts talking
while she walks.*

**Dr. Okonkwo:** Are you the man who is coming to Jackson. I am going to assume
yes because you are the only person in this building who is not holding a
child.

**Player:** I am.

**Dr. Okonkwo:** Good. Then I am going to be very fast and then you are going
to ask me questions in the car, and the answers will be better in the car.

*She hands you a piece of paper with a warehouse address on it. It is folded
into quarters, which means it has been folded many times.*

**Dr. Okonkwo:** Jackson, downtown warehouse, the one with the yellow strip on
the door. My requisition has been signed since the eleventh. It is sitting on
a pallet with about nine other things I did not ask for, including somebody's
entire private reserve of a medication I could actually use, which tells you
what kind of clerk I am dealing with.

**Player:** What is in the load.

**Dr. Okonkwo:** Seventy two cases. Salts, two antibiotics, and about forty
gallons of something I have never had enough of, which is clean water. I am
serious about the water. The water is the load. Everything else is the excuse I
am using to get the water.

**Player:** What is the actual problem getting there.

**Dr. Okonkwo:** Two things and only one of them is people. The route is a
four hour drive and it is not the driving that is hard, the driving is
nothing. The problem is the last ninety minutes. There is a stretch where the
state has a checkpoint and the county has a checkpoint and they do not always
agree about who has jurisdiction, and last month a volunteer got held for six
hours over a form.

**Player:** Could we get held.

**Dr. Okonkwo:** You could. If you are carrying medical cargo under a county
order you are probably fine and probably slow. Here is what I need from you and
I will know whether you did it. When somebody stops you, do not argue with a
man holding a rifle about jurisdiction. Ask for his supervisor. That works
about seventy percent of the time and the other thirty percent you find out
where you are.

**Player:** What is the deadline.

**Dr. Okonkwo:** I have ninety four cases in the shelter on Summer and the
count is going up every morning, so I do not have a deadline, I have a number.
When the number gets to three hundred with the same thing, this stops being a
clinic problem and starts being a thing that shuts down the interstate, and
then your truck does not come back either. So.

**Player:** I understand.

**Dr. Okonkwo:** Good. One more thing and then I will stop talking. Do not
open the cases. Not because I do not trust you, I do not trust the man in the
truck, I do not know where he has been, and there is a way to check that
without making a scene. Ask what the last place on his log is. If he says
Chicago, we take the load. If he hesitates, we go.

### Objectives

1. Travel to the warehouse in Jackson, Mississippi.
2. Obtain clearance from the dock clerk. The negotiation is the job.
3. Escort seventy two cases back to Memphis without opening them.
4. Deliver to the Summer Avenue shelter, not the clinic.

### Completion dialogue

*She takes the manifest, signs it, and reads it twice. When she looks up she
looks at you for a second longer than the transaction requires.*

**Dr. Okonkwo:** The water was in there. You understood that when I said it.

**Player:** You said it twice.

**Dr. Okonkwo:** People usually hear the medicine part and pack up. Thank you.

**Player:** How bad is it in the blocks.

**Dr. Okonkwo:** Better, and I want to be careful how I say better. Better is
down from forty one new cases to maybe fourteen a day, and that is the water
and the salts doing what they do. It is not over. There will be a fourth week of
this and people will get bored of it, and boredom is how this goes back up.

*She sits down. It is the first time she has sat down in the conversation.*

**Dr. Okonkwo:** Now I am going to ask you for something, and I would like you
to know I hate it, because I do not want to be a person who keeps a soldier.

**Player:** Say it.

**Dr. Okonkwo:** Once a week, one of my people rides with you. Not armed, not
any of that, she is a nurse named Cynthia and she is better at this than anyone
in this building. She goes where the load goes and she tells me what is
actually happening at the other end instead of what the driver says. It costs
you a seat. It costs me nothing I can afford.

**Player:** And if I say no.

**Dr. Okonkwo:** Then I stop asking and I keep sending drivers who do not know
what they are looking at. Do not tell me no this week. Tell me no after you have
done it twice, when you know what it is.

### Notes for implementation

- The dock clerk is a real decision point. Pressing him yields faster loading
  and a better relation with a Southern Compact captain. Bribing him is
  faster and creates a corrupt ledger entry the Why panel will show.
- The medicine run is the cleanest "your success is a number" quest in the
  game. Good first quest to teach that objectives write to state.
- Cynthia Ravelo is a recruitable companion. Two medicine runs makes her join
  permanently, which is a real party loss and a real stat gain.

---

## 3. SAL FERRARO

**Freight broker. Pittsburgh, Pennsylvania. Atlantic Corridor.**

| Field | Value |
|---|---|
| Notable type | Merchant, runs a brokerage out of a strip mall office |
| Home | Pittsburgh, a unit in a business park off the turnpike |
| Power | High. He moves freight for four different mayors and does not pretend otherwise |
| Party role he can offer | Quartermaster, expensively, and the price is negotiable if you are useful |
| Quest type | Escort caravan (type 3) |
| Trigger | road_safety low on the Pittsburgh to Columbus or Pittsburgh to Nashville route |
| Success writes | prices normalize, goods arrive, road_safety up, Ferraro relation |
| Failure writes | cargo lost, prices spike, Ferraro takes the loss on paper and off paper somewhere worse |

### Background

Sal Ferraro has never owned a truck in his life and has made money moving four
hundred thousand dollars of freight a week for eleven years. He does not
apologize for this and does not explain it. He will tell you within a week that
he knows more about what a route costs than any general on this map, and he is
right.

He came up the way a lot of the old independents did, driving before he
brokered, and he still keeps a CDL he does not need and a habit of checking tire
pressure on trucks that are not his. He is loud in a way that reads as friendly
and is mostly calculation. He calls everyone friend and means it maybe a third
of the time.

His problem this season is a load of industrial controls and machine parts,
seven pallets, going from Pittsburgh to Columbus for a plant that has been down
for nine days. The plant has three hundred people on it and the parts are on
the truck. Between Pittsburgh and Columbus there is a stretch of interstate
that three different operations are using, none of which he is paying, all of
which know his name and his plate numbers.

### Setup dialogue

*The office has a wall of screens showing routes and a wall of framed things he
is proud of, and he is on the phone when you come in. He hands you the phone
without covering the receiver, which is either rudeness or respect.*

**Sal:** Yeah, no, tell them the Thursday freight is fine and I will tell them
the Thursday freight is fine and if they ask me again I will tell them
something less polite. Thank you, bye. Do you drive?

**Player:** I do.

**Sal:** Everybody drives. I mean do you know what a bill of lading is.

**Player:** I know what one is.

**Sal:** That was a different answer than I expected. Okay. Sit down, I am
going to talk for a minute, and if I talk too long tell me to shut up because
you will not get a chance later.

*He turns a screen around to show you a map with a stretch of it in red.*

**Sal:** Seven pallets. Factory equipment. It goes from here to Columbus, it is
four hours if the world is normal, and the world is not normal, and I am not
going to pretend it is not my fault because it is not. My fault would have been
cheaper and slower. This was fast and cheap.

**Player:** So the route is the problem.

**Sal:** The route is not the problem, the route is the price. Here is the
problem. There are three operations working that interstate between us. Two
small ones that take cash, which is fine and I hate it and everybody does it. And
one that does not take cash, because the man running it does not want money, he
wants to know what is moving through his forty miles. And what is moving through
his forty miles is my seven pallets, and a man who makes medical parts or
machine parts can figure out what plant is down and why.

**Player:** So he is not extorting you.

**Sal:** No. And this is the interesting part and I want you to understand it
because I have been trying to explain it to three other people this month. He is
not extorting me, he is providing security, badly and for free, and the day he
gets tired of doing it there is nobody left on that road.

*He leans back.*

**Sal:** So here is the job, and I am going to pay you properly, which I do not
do. Drive my truck, take my people, and go fast. When they stop you, you stop
politely, you tell them what you are carrying and who wants it, and then you
look at them until somebody makes a decision.

**Player:** And if nobody makes a decision.

**Sal:** Then it is about fifteen more minutes and they will make one. Men on
that road do not want to be the reason a plant in Ohio is down in month eight of
a year. Somebody higher up knows that plant is down and that is the only reason
you are getting through. That is not security, that is everybody wanting the
same thing at the same time, and I have built a business on it.

**Player:** What if the truck is gone when I get there.

**Sal:** Then it is gone and I will find out who, and that will take four
months, and in the meantime three hundred people do not get paid. You will not
be able to fix that for me. Just do not be the reason.

### Objectives

1. Escort the truck from Pittsburgh to Columbus. Time limit three days.
2. Survive three checkpoints. The first is a cash toll, the second is a man who
   wants to inspect, the third is the one that matters.
3. Do not damage the cargo. A single broken pallet cuts the payment by half.
4. Optional, high risk: at the third checkpoint, offer Sal's route schedule in
   exchange for passage.

### Completion dialogue

*He meets you in the parking lot of the plant, not the office. The plant is
running. You can hear it from the road, which is the point of him standing here
rather than inside.*

**Sal:** You look terrible and I am going to assume the freight is intact. Give
me the paper.

**Player:** Here.

**Sal:** Signed. Good. Two hundred and forty thousand dollars of equipment and
nine days of a plant that makes parts for water treatment, which I want you to
notice because I have been saying the word water treatment in this office for a
week and nobody cares.

**Player:** You are going to pay me more than you said.

**Sal:** I am going to pay you exactly what I said, which was more than I said,
so your second sentence is wrong. Do not teach me my own business.

*He pays, right there, faster than you expected. Then he does not leave.*

**Sal:** Okay. Now the part where I ask you to do something and I would like you
to notice I did not dress it up. I want to run that route again in nine days
and I would like to take you with me and introduce you to Denny Amsler.

**Player:** The man on the interstate.

**Sal:** The man on the interstate. And I want to be very clear about what I am
suggesting, which is that there is probably a legitimate arrangement available
to both of us with somebody like him in it, and I cannot go there alone because
I am a broker and he does not deal with brokers, he deals with people who carry
things.

**Player:** And if he is not open to an arrangement.

**Sal:** Then I will keep paying cash to the two small ones and I will keep
wondering what happens in month nine. I would like to stop wondering. That is
the whole pitch and it is not a good pitch, because it might involve you being
on a road where somebody knows you are the man who drove it.

### Notes for implementation

- The fourth checkpoint is the branch point. Paying cash is safe and pays less.
  Offering the schedule is a Calculation check, pays well, and writes a
  road_safety value the player does not love.
- Sal is the best source of the Denny Amsler bounty chain in the game and the
  worst way to start it. Doing his first quest first gives the player a worse
  first offer from Amsler, which is the interesting version.
- Failure here should not destroy the cargo irrecoverably. A failed run with
  the truck recovered costs half. A failed run without the truck costs the
  Columbus plant, and that price shows up in town prices for a month.

---

## 4. OTIS BRAND

**Neighborhood organizer. Baltimore, Maryland. Atlantic Corridor.**

| Field | Value |
|---|---|
| Notable type | Gang boss, of the sort that calls himself a community leader |
| Home | Baltimore, a barbershop on the east side and four buildings within six blocks |
| Power | High locally, mocked nationally. He can put two hundred men on a street in an hour |
| Party role he can offer | Nobody. His whole pitch is that he does not need soldiers |
| Quest type | Gang dispute (type 10) |
| Trigger | unrest high in two districts, two organizations both claiming the same blocks |
| Success writes | unrest falls, security rises, relation with whoever you sided with |
| Failure writes | unrest rises, a district burns, one organization gets stronger and remembers |

### Background

Otis Brand runs the blocks between two dead streets and has done since before
the institutions came apart. He takes a percentage, which he defends as the
price of a phone tree that works, and he has genuinely kept the shooting down
on his streets for three years, which is a real thing and he will bring it up
every time.

What he does not control is the four blocks north, which a newer organization
took last spring. The new one does not take a percentage. It takes a loyalty,
and it has better people in it, and it has a member of the city council in it,
which is the part Otis cannot shoot at.

Both sides have now taken to hitting the same two corner stores, and the
district on the east side where the player arrives has four hundred residents
and no functioning business.

### Setup dialogue

*The barbershop is open and two of the chairs are occupied and neither barber
is working. Otis is in the third chair with his own hair half done, which he
keeps, because a man who gets his hair done somewhere cannot talk.*

**Otis:** Close the door. Not because we are doing anything, my friend, but
because it is one hundred degrees and the AC is not heroic.

**Player:** You know who I am.

**Otis:** I know who everybody is, it is a small block and I do not pay
attention, I pay attention. I know you are the man who drove a load through
three checkpoints last week. Which means either you are good at this or you are
lucky, and I want to figure out which, so sit down.

*He gets up, takes a chair, and turns it around. He does not sit back in it.*

**Otis:** I am going to tell you what my neighborhood looks like right now and
then I am going to ask you for something, and I want to get to the asking before
you get attached to any of it.

**Player:** Go ahead.

**Otis:** Four hundred people, six blocks, and I have kept it calm for three
years. Three years. No shooting. Not none, one, in February, and I handled it
and the man who did it is not on this street anymore. I have eleven buildings
and forty businesses paying me a percentage, which I will defend to anybody,
because the alternative is a man with a rifle and a list.

*He points north with two fingers without looking.*

**Otis:** Now they come in from the north in February and take four blocks, and
they are better funded, they are younger, and they do not take a percentage,
they take a check. They are running a legitimate operation. I have a council
member in mine, I do not, and that is the whole difference between me and them
and it is not a moral difference, it is a phone book difference.

**Player:** You want them out.

**Otis:** I want the corner stores open.

**Player:** That is not the same thing.

**Otis:** No it is not. It is what I am saying instead of the true thing,
which is that I would like to drive them out and I would like somebody else to
drive them out who is not me.

### Quest type options

This quest has three endings and the player picks with their hands.

**Option A, take his side.** Clear the four northern blocks. Violence, high
casualty, fast. Reward is money and the loyalty of six blocks.

**Option B, take the new organization's side.** Brand is the one with the
history and the worse reputation. Fight for the newer group. Pays better in
recruits and worse in how the player is talked about afterward.

**Option C, mediate.** Sit both sides down. Requires Influence and a high
enough relation with both, and it works about a third of the time.

### Setup dialogue for options B and C

**Otis:** If you go north and ask their people, they will give you a better
story than mine. Check. That is not me being gracious, that is me telling you
so you do not walk in there cold. Their story is that I have been running a
protection operation since before they were born and that they are the ones
doing community work. Both of those are true and neither of them is the reason
you should trust them.

**Player:** And the third way.

**Otis:** You want me to say the smart thing. The smart thing is that the two of
us cannot share six blocks and neither of us can leave, so somebody outside
comes in and sits at a table and makes us shake hands on a line that is not a
street line, it is a block count. Eight blocks each, neutral on the rest. It
would work for about eight months.

**Player:** And after eight months.

**Otis:** After eight months somebody will be stronger and it will happen
again, and the somebody will be whoever the outside table decided to favor.
See, I have been in rooms with your kind of solution. You all want a piece of
paper and you want it to look like peace.

*He sits back, then stands up again.*

**Otis:** I will say this. I do not want the neutral table. If you are going to
do the neutral thing, do it anyway, but do not tell me it is because you respect
me.

### Objectives

1. Find the newer organization. Their leader is a woman named Teairra Bloom,
   age thirty one, and she will be polite to you in a way that Brand never is.
2. Speak to Bloom. She will offer a version of Option A with different
   numbers.
3. Deliver the outcome: clear the blocks, take the money, or hold the neutral
   table at the church on Ashland Ave.
4. Optional: find the council member, who will be found at a bar in Canton
   during business hours.

### Completion dialogue

*The player returns to the barbershop. It depends entirely on the outcome which
chair is occupied.*

**Option A, Brand's side, the blocks held**

**Otis:** It is done. Six blocks are mine, four blocks are a parking lot, and I
am going to be honest with you about how I feel about it.

**Player:** It worked.

**Otis:** It worked. That is the part that is going to keep me up. I have been
doing this nineteen years and I have never felt good about a clean win, and
everybody tells me I should feel good, so either I am soft or this is not what
winning is.

**Player:** What do you want.

**Otis:** Nothing. Take your money and go, and if you are in this city in a
year do not come in here, not because I will not have you, but because there
are not enough streets left to be careful about. Go be somewhere with a map.

**Option B, Bloom's side**

*Bloom meets the player at the neutral table, not the barbershop.*

**Teairra:** I am not going to pretend you did this for money, because you did
not, and I would rather we both skip it.

**Player:** Then why.

**Teairra:** Because he was going to do the same thing to us and somebody in
this city had to be willing. That is it. That is the whole answer.

**Player:** And what is going to happen in eight months.

**Teairra:** Something. I have three of my people on that council now, which is
two more than I had in January. Ask me again in eight months. It will be me
asking somebody else the version of this question.

**Option C, the neutral table**

*The table is in a church basement on Ashland Avenue and it runs nine hours.
Both of them shake hands. Neither of them is happy.*

**Otis:** That was the cheapest thing I have ever been part of and I hated every
hour of it.

**Player:** It holds.

**Otis:** It holds for a while. Somebody has to write down what happens when it
stops holding, and it is not going to be either of us.

### Notes for implementation

- This is the game's flagstone quest for "your choice writes to state." All
  three endings must be fully implemented with different field values, because
  a player who makes the third choice and gets the first ending's results will
  correctly stop trusting the system.
- Option C should be locked for a first-time player by relation and Influence,
  not by a flag. It is meant to be a thing you can attempt at Influence 40 and
  mostly fail.
- Teairra Bloom is a full notable with her own quest chain and a route to being
  a ruler. Otis Brand is a route to being a nuisance forever.

---

## 5. DEZ WHITCOMB

**Maintenance foreman. Detroit, Michigan. Great Lakes Union.**

| Field | Value |
|---|---|
| Notable type | Foreman, industrial and civic maintenance |
| Home | Detroit, a municipal garage on the east side, plus a house in Van Dyke |
| Power | Medium. He keeps the lights on in a district the other officials do not live in |
| Party role she can offer | Engineer, no charge, if you do not embarrass her |
| Quest type | Repair infrastructure (type 9) |
| Trigger | infrastructure_condition below threshold at the Van Dyke substation or water plant |
| Success writes | infrastructure recovers, prosperity rises, fuel supply stabilizes |
| Failure writes | infrastructure stays down, unrest rises, district loses population |

### Background

Dez Whitcomb has run the maintenance yard for the city since a twenty year
stretch when nobody was funding anything and the crews went home. She has nine
technicians, three of them trained, and a parts inventory she has been
accumulating out of other people's broken equipment since 2019.

She talks like a foreman because she is one, and her first instinct when meeting
a soldier is to assess what he can carry and whether he will complain about
carrying it.

Her problem is the substation on the east side, which took a hit during the
fighting in the spring and has been running on a bypass ever since. It is
holding. It is also sixty percent of the capacity for a neighborhood of nine
thousand people, and it is being held together by three things: luck, a
salvage unit that should not be running, and an electrician named Prewitt who
is sixty eight years old and refuses to say that he is tired.

She does not want a battle. She wants the salvage unit back before Prewitt has
a bad night.

### Setup dialogue

*The yard is organized to an extent that surprises you. Every truck has a
folder taped to the dash. Dez is under a bus, on a creeper, and does not get
down while she talks.*

**Dez:** Hold that end. No, you are holding it wrong, grab the frame. Good. You
can lift?

**Player:** I can lift.

**Dez:** Everybody says they can lift. Keep it level for ten seconds and do not
let it go if I start talking. That is the test.

*She gets out from under it and wipes her hands on a rag that has never been
clean.*

**Dez:** Okay. You are the army. I have been trying to get somebody from the
army on the phone for five weeks and I got you, which means you are either
faster than the others or you say yes to things.

**Player:** I say yes to things.

**Dez:** I am going to describe a problem and I am going to say the boring true
version first, because I have found that if you do not, you spend an hour on
the dramatic version and then have to do this conversation again.

**Player:** Go ahead.

**Dez:** The substation on the east side is a hole in the system. It got hit in
April, everybody knows, and we have been running on a bypass since then. That
bypass holds nine thousand people at sixty percent capacity. Sixty percent is
fine until it is not, and it is going to stop being fine in the first week it
gets to ninety degrees, which is in about ten days.

**Player:** Can you repair it.

**Dez:** I can repair it if I have a transformer, and I do not have a
transformer, and nobody in this yard is going to fix that with attitude. A
transformer is a two hundred thousand dollar object that I cannot fabricate.

*She starts walking and expects you to follow.*

**Dez:** So there are two ways this goes. One, you go to the depot in Warren
and you get on somebody's case about the four units sitting in a yard that
nobody has requisitioned. Those units have been sitting since the spring and
they are not going anywhere on their own, because a requisition is a piece of
paper and there is nobody left at the state level who signs them for fun.

**Player:** And the other way.

**Dez:** The other way is that there is a salvage yard out past 8 Mile with a
unit in it that works. Belongs to a man named Ostrowski who bought a warehouse
full of equipment from a company that does not exist anymore, which means he
bought it for almost nothing and he knows exactly what it is worth.

**Player:** So we buy it.

**Dez:** He is not selling it to us. He is not selling it to the city, he does
not like cities, and he has already had two people try to lean on him. What
Ostrowski wants is somebody with credentials, which I assume is what you are.

**Player:** And if he wants to keep it.

**Dez:** Then we go back to Warren and we wait for a piece of paper, and the
paper will come in October, and the east side does not last until October on
sixty percent.

### Objectives

1. Travel to the depot in Warren, Michigan. Optional branch, paperwork.
2. Travel to the salvage yard on 8 Mile. Speak to Teodor Ostrowski, who will be
   suspicious, funny, and reasonable.
3. Obtain the transformer by payment, by persuasion, or by whatever the player
   is willing to do.
4. Escort the transformer to the Van Dyke substation.
5. Optional, high cost: bring Prewitt's replacement in from somewhere.

### Completion dialogue

*It is eleven at night on the east side. The substation is running and half the
block has come outside, which is the part nobody planned. Dez is sitting on a
curb with the rag in her hand.*

**Dez:** Nine thousand people have air conditioning and half of them are
outside right now because it is the first night in three months where it made
sense to be outside.

**Player:** You ran the patch.

**Dez:** Prewitt ran the patch. I got him a cot and a chair and I told him he
was not allowed to be a hero about it, and he was anyway. He has been doing
this since before I was in this yard and he is not going to be talked out of it
by me.

*She looks at the substation for a while.*

**Dez:** I need to tell you something and I do not want it to sound like I am
giving you a job. That thing you did, getting that unit, there is no version of
this city where a sergeant does that. There is a version where we submit a form
in October and we get it in November and nine thousand people spend the summer
uncomfortable and a few of them die, and everybody calls that weather.

**Player:** What is the other thing.

**Dez:** I have got three technicians and I need six. That is not a favor, that
is a headcount, and if you have got anybody who can wire and does not need to be
the smartest person in the room, send them to me. I will not pay what the army
pays. I will pay what keeps them.

**Player:** I will ask.

**Dez:** Do not ask like you are doing me a favor. Ask like you are handing me
somebody I can use.

### Notes for implementation

- Ostrowski is the model's good-guy trap. He is funny, he is reasonable, he is
  not a villain, and if the player robs him the game must let that stand and
  never say anything about it. Dez does not care how the player got it. That is
  her character.
- The Warren branch is the slow, honest, lower-pay path. Both branches must be
  worth taking, which is the design test for this quest.
- Prewitt is the callback. If the player brings a replacement, the reward is
  higher and Dez says one more line about him, which is the entire reward.

---

## 6. INES CALLOWAY

**Militia captain. Cedar County, Iowa. Great Lakes Union.**

| Field | Value |
|---|---|
| Notable type | Militia captain, county level, unpaid |
| Home | Cedar County, a fire station in the town of Brandon with a flagpole and no flag |
| Power | High in a three town radius. She commands people who are not officially hers |
| Party role she can offer | Scout, and a small militia that rides badly and does not complain |
| Quest type | Protect the harvest (type 6) |
| Trigger | food production threatened, harvest window open, raiders active on county routes |
| Success writes | food preserved, prices stable, militia relation, county loyalty |
| Failure writes | food production lost, food prices spike across three towns, unrest |

### Background

Ines Calloway has a fire chief's job, a volunteer roster of sixty one, and the
authority of a woman everybody in Cedar County has personally decided to let
have authority, which she describes as the least reliable structure in
governance and the only one that works.

She grew up on a farm eleven miles from where she works and left at nineteen,
came back at thirty one when her father had a stroke and there was nobody. She
knows every field in the county by the gate number and does not consider this
useful information.

The harvest is four weeks out. The county has nineteen thousand acres of corn
in the ground and one grain elevator, which sits at the only place the county
roads cross a rail line. The elevator is also the only thing in the county worth
robbing, and there are people doing the arithmetic on that.

### Setup dialogue

*She meets you at the fire station because she is not going to the barn to meet
a soldier in front of a hundred people who will talk about it for a month. There
is a coffee maker that is clearly older than both of you.*

**Ines:** You are the outsider they sent. Sit down, do not sit in that chair,
that is Ray's chair and Ray is not here and Ray will notice.

**Player:** I will stand.

**Ines:** No, sit in the one by the copier. That is fine. Good.

*She pours two coffees without asking about either.*

**Ines:** I am going to tell you what is going to happen and I am going to skip
the part where we get acquainted, because you and I are going to be working
together for four weeks and there is no time for that and I dislike it.

**Player:** Go ahead.

**Ines:** Four weeks from this Friday we start cutting corn. Nineteen thousand
acres. One elevator. Two things I need that I do not have.

**Player:** Name them.

**Ines:** Bodies. And luck. I have got sixty one names on a volunteer sheet and
forty four of them have shot something this year and I am not going to insult
you by telling you forty four is nothing. But forty four scattered over a
county is forty four people in forty four places, and the elevator is one place.

*She turns a county map around. It is a real road map, folded up, redrawn in
pencil.*

**Ines:** So what I actually want is somebody who can stand at one spot and
make the spot safe, and what I cannot tell you is which spot, because it will be
the spot where whoever is robbing this decides to be.

**Player:** So it is bait.

**Ines:** It is a roadblock with the patience. There is a difference and I have
had to explain that difference to people far smarter than me.

**Player:** What are the odds somebody comes.

**Ines:** Good odds. Here is my thinking and you can tell me it is wrong. The
first two years we had this, nobody came, and everybody told me I was being
dramatic. Last September somebody came, and it was four men with a come-along
and no plan, and we killed no one and we lost one truck and they came back in
March and did it right.

**Player:** So you are baiting a serious operation.

**Ines:** I am baiting it with sixty one people who now know where to be, which
is not bait, it is preparation wearing a costume. Do not call it bait in
front of the volunteer sheet.

### Objectives

1. Choose a position. The player picks one of three: the elevator, the county
   highway junction, or the rail crossing.
2. Hold it for the duration of the harvest window. Time limit twenty eight
   days.
3. Two scripted encounters fire during the window, one at a time, and the
   player's earlier choices determine which.
4. Keep the volunteer roster intact. Losses here are permanent for the county,
   not just for the window.

### Completion dialogue

*The elevator is running. It is the loudest thing Ines has ever been near and she
keeps raising her voice over it and then getting annoyed about it.*

**Ines:** Nineteen thousand acres is in and it is out and it is in the bin and
I have been standing next to a working elevator for six hours and I still do not
believe it.

**Player:** You had it covered.

**Ines:** We had it covered. You had it covered. Ray had the highway junction and
he only had to walk toward one sound, and Dolores had the crossing and she is
the reason nobody got to the crossing.

*She stops. The elevator keeps running.*

**Ines:** Two things and then I will let you have your money.

**Player:** Go ahead.

**Ines:** One, I am not going to pay you the way I pay the sheet. I am going to
pay you the way I would pay a hired man and that is a real number and you should
look at it before you say yes.

**Player:** And two.

**Ines:** Two is that there was a Tuesday in the middle of this where nobody
called in and I thought the whole thing had fallen apart quietly, and then
Dolores picked up. And I realized what we actually have here is not a militia.
It is a phone tree that works. That is a real thing and it is fragile as hell
and it is the only reason Cedar County is not on somebody's route map.

*She turns to face the player properly.*

**Ines:** I would like somebody to know it exists who is not standing in this
room. So I am going to introduce you to the other eleven counties. That is not
a job, that is an introduction, and I am going to spend what credibility I have
on it tonight, which is most of what I have.

### Notes for implementation

- The most combat-heavy quest in this file and the only one where the player
  holds a position rather than moving. It must be a different gameplay verb
  from the escort in number 3.
- Dolores and Ray are named NPCs who appear in the encounter dialogue. If the
  player loses either, the completion dialogue must change, and the quest must
  still complete. Losing them is a real cost, not a fail state.
- County to county introductions unlock five near identical quests with five
  different captains, which is the intended shape of this content. The
  variations are what keep it from being a job.

---

## 7. DUANE PETTIBONE

**Ranch owner. Abilene, Texas. Lone Star Frontier.**

| Field | Value |
|---|---|
| Notable type | Landowner and livestock operator |
| Home | Outside Abilene, a ranch that is 62,000 acres and one road |
| Power | Very high. He has four ranches, more grass than most counties, and no interest in politics |
| Party role he can offer | Ranger, and horses, and the horses are the real offer |
| Quest type | Bounty (type 5) |
| Trigger | bandit leader active within two counties, road_safety falling, price of cattle falling |
| Success writes | bounty claim, road_safety up, ranch prices recover, Frontier relation |
| Failure writes | ranch raided again, bandit power up, road_safety down further |

### Background

Duane Pettibone has run cattle since he was nine and has never held a political
office, never wanted one, and has strong opinions about both cattle and men who
have never hauled a year of anything.

He is blunt in a way that reads as stupidity to people who have not talked to
him for ten minutes, and he is one of the two or three wealthiest men in the
Frontier, which makes him a target for every operation in the region that thinks
a ranch is just a bag of money standing in a field.

His problem is a man named Lonnie Futch, who has been taking cattle off the
county line road for eight months and has now moved to taking them with a
crew of eleven and a working plan. Futch is not a raider. Futch learned
logistics from a man who moved freight for a living and it shows.

### Setup dialogue

*He is at the gate in a truck that has earned the mud on it. He does not get
out until you have been standing there for a second, and then he does not
hurry.*

**Duane:** You are not the marshal.

**Player:** I am not.

**Duane:** You are not the governor either. Okay. I will give you thirty
seconds of my attention because you showed up on time and that puts you ahead
of about four people I was expecting.

**Player:** Go.

**Duane:** Lonnie Futch. Last name sounds like a hardware store, which is what
he is, he is a supply chain that stole a truck. Eight months, started with two
guys and a panel van, now it is eleven men and he has a barn outside
Sweetwater that I have not been able to get anybody to sit on a ridge at night
for. That is the problem. He knows where I keep my cattle because he has
watched me, and he has watched me for eight months.

**Player:** Why has nobody stopped him.

**Duane:** Why has nobody stopped him. That is a good question and the answer
is about eleven different reasons and none of them are because nobody can do
anything. It is that the sheriff has eleven deputies for four counties. It is
that the men who could do it have hay out in June. It is that twice now somebody
has tried and twice now it has been one vehicle and no radios.

*He gets the truck into park.*

**Duane:** And it is that Futch is smart enough not to be stupid. He has never
hit a house. Never hurt a person that anybody can put on a tape. He takes
livestock and he takes equipment and he is gone in under an hour. Legally I
have nothing. Practically I have forty head that are not mine anymore.

**Player:** What do you want.

**Duane:** I want him gone and I want it settled so it stays gone. And I want
to be very clear that I do not care how. I am not the law anymore, I am a man
whose cattle are being taken, and I have money and I have a horse pasture and I
am offering you the pasture.

### Objectives

1. Locate Futch's operation. Three locations are possible and only one is
   correct. The player gets contradictory information from three NPCs.
2. Survive the approach. Futch's camp has a vehicle perimeter and a spotter who
   is awake at odd hours.
3. Deal with Lonnie Futch. Alive or dead are both valid and pay differently.
4. Return the recovered livestock brand, or the tally, to Duane.
5. Optional, hidden: the fence cut on the county line road. Finding who cut it
   identifies a fourth location and shortens the job.

### Completion dialogue, Futch dead**

*Duane meets you at the gate. He has been there long enough that there is a
second vehicle behind you.*

**Duane:** You did not bring him.

**Player:** He is not coming.

**Duane:** No. He is not. Okay. I notice what you just did, because I know what
that answer usually comes with, and you did not give it to me.

*He hands over a transfer. It is a ranch, not money, and it is titled before
the handshake.*

**Duane:** South quarter. Grass and a house with a well. I have three of those
and I do not need three. That is not a gift, understand, that is a fee, and
next time you need something from me I am going to ask.

**Player:** Understood.

**Duane:** Good. Now I am going to say something and you can tell your friends
it made me sound soft. That boy was good. He had a supply line. That is a rare
thing out here, most of these people are just hungry and mean, and he was
neither. He took four hundred head off me in eight months and did not waste
anything and did not make an enemy he did not have to make.

**Player:** That is not a defense.

**Duane:** It is an observation. I have known one other man like him and he ran
a feed store in San Angelo and he was fine, and somebody put him in a ditch
anyway.

### Completion dialogue, Futch taken alive**

**Duane:** You brought him in. That is either a mistake or the smartest thing
you have done this month and I have not decided.

**Player:** He talks.

**Duane:** He talks to a sheriff with nine deputies who cannot feed their own
families and a state that has three legal ways to hold a man for something this
size. You know what happens to him. I know what happens to him. He gets four
years in a facility in Alpine and he comes out and he has nothing and he knows
everything about me, my gates, my cattle, my routes.

**Player:** That is why I brought him to you.

**Duane:** That is why you brought him to me. And what I am going to do about
it is not something you want to hear, so I will tell you anyway. I am going to
have somebody drive him to the county line, and after that is not mine.

*He looks at the ranch map on the back of the pickup.*

**Duane:** He will know my schedule by now. Eleven weeks, maybe less. So I am
going to move the whole operation west a quarter mile and I am going to do it
this month, and I am going to tell you it is so you know I thought about it.

**Player:** And the ranch.

**Duane:** The ranch with the better fence. You understand that is the
compensation for my mistake and not for your work.

### Notes for implementation

- The bounty has two endings and both should be roughly equal in money. The
  live ending gives the player a prisoner, a reputation with law, and a
  Duane who is slightly worse to deal with. The dead ending gives clean money
  and one uncomfortable conversation.
- The fence cut is the good detective work. Rewards should be the correct
  location, which is the entire point of the quest being about logistics
  rather than a fight.
- Futch should be offered as a companion on the dead-ending-adjacent branch if
  the player spares him in dialogue. He is a logistics officer and he is worth
  more to a Frontier player than most recruits in that region.

---

## 8. COUNCILMAN RALPH TRUESDALE

**City council member. Philadelphia, Pennsylvania. Atlantic Corridor.**

| Field | Value |
|---|---|
| Notable type | City official, port and commerce committee |
| Home | Philadelphia, a row house in Queen Village and an office with a view of nothing |
| Power | High inside the city, no power outside it. He is honest about this |
| Party role she can offer | None. He considers himself a civilian and means it |
| Quest type | Recover stolen goods (type 7) |
| Trigger | shipment seized, port dispute unresolved, cargo unaccounted for |
| Success writes | cargo returns, prices fall, council relation, and one faction likes him less |
| Failure writes | cargo is sold, prices stay high, he loses the chair |

### Background

Ralph Truesdale has served on the Philadelphia city council for eleven years and
has never once confused that with power. He can approve a dock permit. He cannot
move a shipment, cannot change a tariff, and cannot make a phone call that
matters outside the building he works in, and he says so constantly, mostly to
himself.

He is the kind of official that the Corridor produces by accident. He has a
degree in public administration from before the institutions came apart, he
still uses it, and he has a reputation for paying for things he agreed to pay for
even after the person who agreed died.

The shipment was a container of pharmaceutical intermediates and machine
gauges from three states inland, seized at a port checkpoint in Delaware on a
documentation error that Ralph is fairly sure was deliberate. The paperwork
dispute has been running for five weeks. The freight is not in Philadelphia and
not seized and not destroyed, and there is a specific building in a specific
industrial park in Baltimore where it is.

### Setup dialogue

*The office is on a floor where the elevator is slow and the coffee is worse.
Ralph has a stack of paper on his desk that is taller than the chair he is
sitting in.*

**Ralph:** Sit down. No, do not sit in that one, it has a leg problem. Right,
that one.

**Player:** Thank you.

**Ralph:** I am going to be frank with you in a way that will make you want to
leave, and I would rather you left than stayed and got bored.

*He turns a folder over so the top page faces you.*

**Ralph:** This is a container of pharmaceuticals and machine gauges that was
seized in Delaware five weeks ago on a paperwork question. It is worth about
four hundred thousand dollars at the docks and considerably more than that to
the people waiting for it, because two of the items are the active ingredient
in a drug that a clinic in North Philly is rationing right now.

**Player:** And it is gone.

**Ralph:** It is not gone. That is the thing. It is not in a warehouse and it is
not sold and it is not destroyed, because destroying it does not help anybody
who wants to win an argument. It is sitting in a building in Baltimore in a
dispute between two private parties and one insurance company, and the process
has a name and the name is that nobody has standing.

**Player:** You have standing.

**Ralph:** I have standing in a city that has nothing to do with the building in
Baltimore. If I file, I file for a hearing, and the hearing happens in fourteen
months.

*He closes the folder.*

**Ralph:** So I am going to tell you what I want, and then I am going to tell
you the part I have not told my own staff.

**Player:** Go ahead.

**Ralph:** I want it back before the hearing. Not through the hearing. If it
comes back before the hearing, I can tell three hundred people that the city is
capable of resolving a dispute, which is a sentence that matters this year. If
it does not, I do not lose the chair. I want to be accurate. I lose nothing.

### Objectives

1. Establish which party is holding the container. Three candidates: the
   terminal operator, the freight forwarder's competitor, and a private
   security firm. One of them is a frame.
2. Get the release paperwork. Legal route takes eleven days, requires a
   contact Ralph has, and costs money.
3. Take possession of the container at the industrial park in Baltimore.
4. Return it to the Philadelphia port.
5. Optional: identify who filed the false documentation. This is the discovery
   that changes who Ralph is permanently.

### Completion dialogue, cargo returned**

*He meets you at the pier. It is the first time you have seen him outside an
office and he looks like a man who has been standing in the sun for an hour on
purpose.*

**Ralph:** It is here. I watched it come off. That is not useful information but
I watched it come off.

**Player:** There is a signature chain in there.

**Ralph:** Do not tell me that on a pier. I will buy you a very bad lunch.

**Player:** Later.

**Ralph:** Better. Okay. I am going to pay you the money now and I am going to
pay the clerk who cleared it too, quietly, because she did not have to.

**Player:** And the hearing.

**Ralph:** The hearing happens anyway in fourteen months. But now I can stand
up in a room and say the thing resolved, and that is not nothing, because the
next time somebody tells this city it cannot fix a problem, I will have a piece
of paper saying that at least one it did.

*He pauses on the steps.*

**Ralph:** Now the other thing. The false documentation. You found out who
filed it.

**Player:** A competitor firm.

**Ralph:** Say the name.

**Player:** ...

**Ralph:** You do not have to say it. That is fine. I will say what it means so
you can tell me if I have it right. That name is on a list that goes to people
who do not want me asking questions about the Port of Philadelphia before a
budget season.

**Player:** Yes.

**Ralph:** Okay. Then I am not going to do anything, and I want you to
understand that this is a choice and it is mine and I have made it before.

**Player:** You could push it.

**Ralph:** I could push it. And the push would go for about six weeks and then
I would be a councilman in an argument about port policy, which means I would
be finished, which means whoever filed that paperwork would win. So I am not
going to push it. I am going to know it. That is what I actually got out of
this.

### Completion dialogue, cargo lost**

*He takes the folder back and reads the top page and puts it down.*

**Ralph:** Okay. Thank you for telling me in person, which I understand is a
courtesy and not a favor.

**Player:** I will keep looking.

**Ralph:** Please do not keep looking for me. Do it if you want to. But I am
telling you what my position is so there is no misunderstanding later. I am
going to walk into that hearing in eleven months and say that I tried and that
the private actors in this region are stronger than municipal authority, and
then somebody will ask me why I did not authorize the recovery of a shipment in
a private yard.

**Player:** And you will say.

**Ralph:** I will say that I did not have the men and I am a civilian, and it
will be true, and I will not be able to look at anybody while I say it.

*He picks the folder back up.*

**Ralph:** For what it is worth, and I would not say this to my staff. You
believed me when I said the medicine was the point. That was the only part of
this I cared about and I could not say it out loud to a soldier without sounding
like a man who wanted something.

### Notes for implementation

- The most political quest in the file. Its real subject is that Ralph chooses
  not to use the information, and the game must let him be correct about why.
- The false documentation discovery is the only place the player can make a
  named faction permanently hostile. It should be a real, permanent, visible
  state write with a cause log entry the player can read in the Why panel.
- Both endings resolve. Neither gives a "you failed" screen. The failure text
  should be the same length and tone as the success text.

---

## 9. WALT KRANTZ

**Bar owner. Reno, Nevada. Mountain Alliance.**

| Field | Value |
|---|---|
| Notable type | Bar owner, the kind who knows everything and admits nothing |
| Home | Reno, a bar three blocks off the river, open when it is convenient |
| Power | Low on paper, very high in practice, because he hears things first |
| Party role he can offer | Scout, on a tab, which is a loyalty test |
| Quest type | Clear the road (type 4) |
| Trigger | road_safety low on the I-80 corridor or a county road off it, two incidents |
| Success writes | road_safety up, travel time down, prices down, Walt relation |
| Failure writes | road_safety worse, the county stops running night freight, Walt closes the tab |

### Background

Walt Krantz has owned the same bar in Reno for twenty six years, through two
recessions and one institutional collapse, and he did it by being the place
where people who need to say something out loud end up sitting.

He is a gossip by trade and by disposition. He will tell you anything if you buy
the first drink, and the price of the second drink is that you tell him
something true about yourself. He has been doing this for a very long time and
he is very good at it.

He also has a problem. The county road that runs out of his bar's parking lot
and into the Donner Pass side has had three incidents in five weeks: a
tractor trailer run off, a car with the doors open and nobody in it, and a
survey crew that reported a man standing in the road at two in the morning with
a device. There is no gang doing it. There is one man, and Walt knows which one,
and has known for a month.

### Setup dialogue

*The bar is maybe a third full at two in the afternoon on a weekday. Walt is
behind it and it is visible from the door that he was waiting for you, which he
admits later.*

**Walt:** Sit at the end bar. Not the middle, not a table, the end. You get
the door and I get the register and we can both see who comes in.

**Player:** You asked for this.

**Walt:** I asked for a man who drives like he grew up somewhere with weather.
You have got dirt on one side of the truck and not the other, so you have been
out west of Tahoe or you have been careful. Either way you are not from here.

**Player:** No.

**Walt:** You are not. Good. Locals will take the job and then they will talk
about it, and then the thing I am going to tell you will get around.

*He sets a drink down without being asked.*

**Walt:** First thing you are going to want to buy, and you are not going to
buy it, and I want to be clear that I know that.

**Player:** What is it.

**Walt:** A drink. Yeah. Here is the free one and here is what it comes with.
You are going to go out on the county road tonight and you are going to look
like you are looking, and somebody is going to follow you, and when he follows
you, I need you to not turn around.

**Player:** For how long.

**Walt:** Four miles. Past the fairground, past the hairpin, until he decides
you did not see him. If you turn around on the county road, he will not do
anything and he will not do it again either, and I will have spent my one
thing.

**Player:** What is he doing out there.

**Walt:** Okay, this is where I get to be honest, and I want you to know it
sounds worse than it is because the way people say it is worse than it is.

**Player:** Go on.

**Walt:** His name is Emory Rusk and he was a lineman for a utility company
until the company stopped existing. He has a two way radio and a handheld
repeater he bought, and he puts the repeater up on the pass and calls in the
locations of cars. He is not a bandit, he has never taken anything from a
person, and there is a set of circumstances where you could call him a
terrorist and a set of circumstances where you could call him the only
person still monitoring that road.

### The moral problem

The player can find the utility company records and learn that Rusk's employer
had a maintenance contract on the pass, and that when the company folded, nobody
inherited the contract. That the road was never unsafe. That it was unmonitored,
which is different and which is why three things happened on it.

Rusk will not stop if asked. He will stop if told what the job is now, if
someone with authority puts it in writing, and if the player can find a county
sheriff who will sign it. That is the whole alternative solution and it takes
four days longer.

### Objectives

1. Drive the county road at night and let yourself be followed.
2. Confirm the follower without confronting him.
3. Find Rusk's position on the pass before he relocates.
4. Resolve it by force, by negotiation, or by finding him a job.

### Completion dialogue, negotiated**

*Rusk drives up in a pickup that has a repeater antenna on it and does not get
out. Walt is on the porch and so is the sheriff, who is fifty eight and looks
like it.*

**Walt:** He wanted a paper, is what this is. I could not believe it. A man has
been standing in the road with a radio for four months and all he wanted was
somebody in a uniform to say the road is somebody's job.

**Player:** Who signed it.

**Walt:** Nobody signed it. I did. I own a bar, I am not a commissioner, and I
have written the most legally worthless document in Nevada, and he is driving
the county road tonight because of it, and tomorrow he goes to the sheriff and
the sheriff pretends he got it from a friend.

**Player:** That is not a solution.

**Walt:** No. It is a man with a flashlight in a truck and a woman who owns a
bar, and both of those are better than what we had. Ask me again in six months
when he has been doing it for free and the county has found the money.

### Completion dialogue, forced**

*The bar is closed when the player comes in, which has never happened.*

**Walt:** Sit down. Do not say anything yet. I have been angry about this for
about four hours and I need to get past the part where I yell at you.

**Player:** I will wait.

**Walt:** Here is the thing. He was not a criminal. That is not me defending
him, that is the actual situation. He was unassigned and he did not have
permission and he had no enemy and there was nobody on the road.

*He refills a drink he is not drinking.*

**Walt:** Now you get the part I actually want to say and then I am going back
to work. I gave you a job that was really an excuse to find out about a
neighbor, and you found out and then you solved it the way your trade solves
things. That is not on you. On me. And I am going to keep serving you and
I am going to keep my mouth shut, and both of those are the most I can do.

### Notes for implementation

- The best example in the file of a quest that can be completed with almost no
  fighting. The "let yourself be followed" objective is a patience test and
  most players will fail it by turning around.
- Walt should reappear in three later quests across two sections. He is the
  connective tissue character for Mountain Alliance content.
- The bar tab is the real reward mechanic. Players who buy drinks for Walt get
  intel options that other players do not have, and this should be a persistent
  party stat, not a one-off check.

---

## 10. PAULETTE HINES

**Boarding house owner. Albuquerque, New Mexico. Mountain Alliance.**

| Field | Value |
|---|---|
| Notable type | Small business owner, and the person everyone in the district calls for |
| Home | Albuquerque, South Broadway, a boarding house she owns and lives on the second floor of |
| Power | Low officially, extremely high in practice among people with nowhere else to go |
| Party role she can offer | Surgeon, and she is very good, and she has not slept since Tuesday |
| Quest type | Rescue prisoner (type 8) |
| Trigger | notable relative captured, ransom demand received, road_safety low |
| Success writes | relative returns, relation extreme, loyalty, four other quests unlock |
| Failure writes | relative lost or dead, relation collapse, notable leaves the simulation |

### Background

Paulette Hines owns a boarding house on South Broadway that is half way house,
half way legal, and entirely known to everyone including the people who should be
objecting. Her mother ran it before her. There are forty one people living in it
and eleven of them are not supposed to be there, and all eleven of them are
somebody's kid, and that is the whole business.

She has a nephew named Wendell who is nineteen and has made one mistake, which
was telling a man in a bar in Espanola that his employer was moving copper out
on a Sunday. He has been gone eleven days. The demand came through a gas station
attendant and it was for four thousand dollars and a vehicle, and she has the
money for the four thousand.

She has not called anyone. She has been trying to handle this herself for eleven
days by driving around looking, which has worked zero percent of the time.

### Setup dialogue

*She is in the boarding house kitchen at two in the morning, and there is a
pot of something on the stove that she has been reheating, and eleven people are
sleeping in the next room.*

**Paulette:** Keep your voice down. Not because of me. Because of the floor,
that is thin, and Delphine in room three has a baby that has been asleep since
ten.

**Player:** I will keep it down.

**Paulette:** Sit. No, that chair, that is a good chair. You are the man from
the army. I am not going to pretend I am glad you are here because this is the
worst thing that has happened to me in eleven years and you are the fourth person
who has come.

**Player:** I am the fourth?

**Paulette:** Two from the county, one from a church. The church one was nice.
He sat where you are sitting and he said what people say, which is that there
are people who can help, and then he left and I have not heard from him.

**Player:** What do you know.

*She gets up and turns off the stove, which is the only way this conversation
is going to be private.*

**Paulette:** Wendell is nineteen. He lives in my basement, he works at the
yard on Coors, and he is not a bad kid, he is a careless kid, and there is a
difference and it is the only thing keeping me from being completely destroyed
right now.

**Player:** What happened.

**Paulette:** He was in a bar in Espanola eleven days ago and he said the
wrong thing to the wrong person. That is all of it. That a shipment of copper
was going out Sunday. That is a true fact that four hundred people already knew.

*She sits down.*

**Paulette:** And there is a company that moves that copper, and they have a man
who does this, and I found out about that from a man at the gas station who
would not stop talking about how much he wished somebody would do something
about it. Nobody is doing anything about it. That is what I am up against. Not
a man. Nobody.

### Objectives

1. Find where Wendell is being held. Four locations are possible. Paulette has
   one and it is wrong.
2. Confirm he is alive. This is an objective, not an assumption, and the game
   must let the player fail it.
3. Get him out. Two ways: force, or trade the four thousand and the vehicle.
4. Bring him back to the boarding house.

### Completion dialogue, Wendell returned**

*He is on the second floor in a chair by the window with a blanket over his
shoulders, and Paulette is standing in the doorway not going in. Several of the
people in the building have come out of their rooms and are standing in the hall,
which they have all decided to do quietly.*

**Paulette:** He has a broken finger and he has not eaten and he is going to be
all right. I am not going to come in yet.

**Player:** Take your time.

**Paulette:** I have got a question and I want to ask it in front of the
people in the hall, because I have decided I do not care what the answer is as
long as it is a real one.

**Player:** Ask.

**Paulette:** There are eleven people in this house who are not supposed to be
here. Somebody in a uniform has known that for years and has decided it is
easier if the building has a woman who owns it instead of a man who owns a
motel on Central. That has been the arrangement and it has kept those people
out of a system that would not have been good to them.

**Player:** Yes.

**Paulette:** Okay. And now there is a room on the second floor with a nineteen
year old in it, and after tonight there is going to be a person in this county
who knows where this building is. So tell me what happens to this house.

**Player:** It stays.

**Paulette:** Say it as a promise or do not say it.

**Player:** It stays.

*She finally comes into the room. She does not sit down.*

**Paulette:** I have got forty one people in this building and about nine of
them can work. Two of them weld. One of them drives a truck better than whoever
has been hauling our water. And I am not going to put them in a truck for you
because I am not that kind of woman.

**Player:** Then what.

**Paulette:** What I am going to do is keep a list of every time somebody comes
to me and says a thing about somebody on this road, and there is going to be
somebody in this county who reads that list and acts on it, and I would like
that somebody to be somebody who drove eleven miles to talk to a woman in a
kitchen at two in the morning instead of somebody who did not.

### Completion dialogue, Wendell not recovered**

*Paulette is on the porch. It is morning and she has been out there since
before it was light, which is obvious.*

**Paulette:** You told me. I am not asking what happened out there. I am not
going to ask and you are not going to tell me, and if you tell me anyway I will
not be able to live in this building.

**Player:** I am sorry.

**Paulette:** Do not do that. Sorry is for a thing that was going to go wrong.
You did not get him out of there and I do not know yet whether that was
possible.

*She is quiet for a while.*

**Paulette:** Here is what I am going to do and you are going to help me and
you are not going to get a choice. There is a woman on Central with four rooms
and a car and she has taken Wendell types before. We are going to go there in
the morning, and if he is there, he is there. And if he is not, then I am going
to have to figure out how to keep this building running for thirty nine people,
and I would like to do that with somebody who did not stop.

### Notes for implementation

- The hardest writing in this file and the quest with the largest downstream
  payoff. A successful return unlocks Paulette as a permanent quest hub and
  seeds four later quests, including two that are worth more than this one.
- Failure must be survivable and must not remove her from the simulation. A
  notable who dies on a failed quest is a bad outcome and this quest is where
  players will find that out.
- The kidnapping is fictional and generic. No real company, no real route, no
  real incident. Per CONSTITUTION.md section 6.

---

## CROSS CUTTING NOTES

### How these ten fit the simulation

| Number | Giver | Quest type | Section | Primary field written |
|---|---|---|---|---|
| 1 | Ruthie Vance | Food delivery | Pacific Compact | food_stock |
| 2 | Dr. Wren Okonkwo | Medicine run | Southern Compact | infection |
| 3 | Sal Ferraro | Escort caravan | Atlantic Corridor | prices |
| 4 | Otis Brand | Gang dispute | Atlantic Corridor | unrest |
| 5 | Dez Whitcomb | Repair infrastructure | Great Lakes Union | infrastructure |
| 6 | Ines Calloway | Protect the harvest | Great Lakes Union | food_production |
| 7 | Duane Pettibone | Bounty | Lone Star Frontier | road_safety |
| 8 | Ralph Truesdale | Recover stolen goods | Atlantic Corridor | prices |
| 9 | Walt Krantz | Clear the road | Mountain Alliance | road_safety |
| 10 | Paulette Hines | Rescue prisoner | Mountain Alliance | loyalty |

### Dialogue rules for anything added later

1. Plain American English. Contractions. Fragments are fine and often better.
2. One thought per line. If a speaker has two ideas, it is two lines.
3. No em dashes, no ellipsis characters, no smart quotes. Plain punctuation.
4. No speeches. A notable giving a speech is a bug. If they can say it in a
   sentence, they should.
5. Every quest giver states a number, a place, and a deadline. If the quest has
   no number in it, the quest does not have a trigger yet.
6. The giver is wrong about one thing. Every single one of them is wrong about
   something, and the player finds it by doing the job, not by being told.
7. Regional vocabulary is allowed and encouraged. A Cedar County captain says
   gate number. A Pittsburgh broker says bill of lading. Nobody says "my liege."
8. No real people, companies, or events. Real places, fictional everything
   else.