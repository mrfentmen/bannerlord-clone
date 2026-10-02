# ENDINGS AND EPILOGUES

What happens after the last battle, in every direction the campaign can finish. This is the text
the game shows once the final engagement resolves: the six section victories, the three ways to win
without a section, the four ways a campaign can end badly, what the eight companions do next, and
what ordinary people are doing ten years on.

Read content/lore/factions-regions.md for the six sides and the eight regions, and
content/characters/faction-leaders.md for the six leaders and their flaws, before changing anything
here. Every ending in this file is built out of those two documents and introduces no new
institution, leader, or organisation.

**Rules this file obeys**

- Plain ASCII throughout. No em dashes, no en dashes, no curly quotes, no special characters.
- No quantity is authored here. Every number an ending needs is read from simulation state at
  runtime. Square brackets in the text mark a slot, and a slot is never printed as written.
- Nothing in this file fires on a date. Every ending is a condition read from shared state, the same
  way a quest trigger in content/dialogue/quests.md is a condition and not a schedule.
- Real geography, fictional people. No real person, organisation, war, attack, disaster, or crisis is
  replayed, named, or dated. Per CONSTITUTION.md section 6.
- The player is addressed as you. Leaders and companions are named, the way they are named in
  content/characters/.
- No ending congratulates anybody. A victory here is allowed to be a relief, a compromise, or an
  accident, and several of them are two of those three.
- Bittersweet is the target tone, not sentimentality. Every ending has to cost somebody something
  the player can name.

---

## 0. HOW THESE ARE READ

An ending is chosen by a reader, not by a script. The reader reads shared state and asks a fixed set
of questions in a fixed order, and the first yes wins:

1. Did the player hold a section's leadership when that section ended the war with no rival fielded
   army inside its borders? Use the matching ending in section 1.
2. Did the player hold no section and did the war end anyway? Use section 2.
3. Did the final engagement resolve against the player? Use section 3.

Within a section victory, the extra paragraphs at the end of each ending handle the case where the
player took the leadership by force rather than inheriting it, which is a real path per
faction-leaders.md section 7. Those paragraphs are not optional flavor. A player who deposed Vega and
then won with the Compact must not read a text about Vega still being in charge.

Slot convention: `[hold_hours]` is a number, `[leader_fate]` is one of a short list of values,
`[county_name]` is a settlement the simulation already knows. Every slot used here is listed again in
section 6 with the field it reads.

---

## 1. VICTORY ENDINGS

Six, one per side. A section that wins did not solve its own problem, and each text below is about
what the problem looks like now that nobody has an excuse.

### 1.1 THE PACIFIC COMPACT WINS

*Trigger: the Compact holds the ports and the northern rail heads, no rival fielded army is inside
its borders, and the inland counties have not declared for anybody.*

The country runs on a schedule, and the schedule holds.

The war ends on a Tuesday, in a freight office, over a manifest. The cranes at Long Beach start
their Wednesday anyway, and the fact that the Wednesday did not stop is the news.

Marisol Vega does not give a speech. She gives a correction, to a reporter who has a number wrong,
and that is how most of the country finds out it won. She fixes one figure in front of the cameras
and the room watches a war end over a decimal place.

What she has won is the argument she has been having since the first convoy: who feeds whom, held
in a room instead of on a highway. The coastal cities still believe they are the ones with a problem
and the valley still believes the coast took the water and gave a lecture. She is angry at both of
them, and now she has the schedule and both of them, so both of them have to be in her meetings.

The country she has is one that has never closed a port. Not once, including the week it would
have been justified, including the week when closing one would have saved somebody she had promised
to save. That is a real record, and it is also a record that means she has to keep doing this for
years, because the machinery does not run itself. It runs on somebody answering a phone at four in
the morning when a boat is late, and that somebody has been her for six years.

The cost is inland. Four counties took a beating, got a seat at the table, and use it, so the water
argument is louder than ever. Hawaii and Alaska were asked rather than told, and the asking mostly
worked.

And you. She will not thank you, she is not built for it. What she does is put you on the schedule,
on a road you can hold, running with men who show up, and she tells a port captain that the man on
that run is not to be sent into a room that needed a truck. She was wrong about courage for six
years and knows it and will never say so. The road she keeps you on is a road she built for somebody
exactly like you.

**If the player took the section.** Vega is a leader in a room she no longer runs, from a consulting
position she did not ask for. She is completely right about the schedule and completely unable to
make anybody obey it. She comes to the inland meetings anyway, uninvited, and is listened to for
about a year, and then is not. That loss is felt in four counties that never knew what it was.

**If Vega is dead.** Same text, and the sentence about the phone at four in the morning now belongs
to you. Her people do not build a monument. They build a schedule, and the schedule is her, and
that is the monument, and you are the one keeping it, and it does not feel like a monument.

### 1.2 THE MOUNTAIN ALLIANCE WINS

*Trigger: the Alliance holds the passes and the shaft heads, and no rival army is inside the region.*

Nobody ever proves how it happened.

The final war is decided by three letters, one road closure a man in Butte shut on his own authority
in February, and the fact that every army that came at the Alliance walked, because it had to, and
arrived hungry, and fought uphill on ground the defenders had chosen. Hollis Grant fought three
engagements in his life. This was not one of them. This was the absence of engagements, which is the
thing he has been arguing for since before you arrived, and he won it by not having it.

What he has is the smallest section on the map intact, and its own problem with nowhere to hide.
When nobody can come over the passes, the water is entirely theirs and can no longer be blamed on
anybody. Albuquerque comes back to meetings in the third year, quietly, like a man returning to a
church. Las Vegas stops being anxious and starts being useful.

Ashby sells the three passes back at his price. He is paid in full and on time, which he waits to
confirm twice, and becomes a boring, reliable, taxable member of the Alliance. He hates it. He stays
for eleven years.

Grant is tired in a way that has stopped being visible, which is the dangerous kind. His three
memoranda, written when nobody wanted them, get filed in Denver by a woman who quotes him in
meetings he is not in. He asks you once a year whether the eastern flats are still held, which was
the interview question in the warehouse, and then he asks you something else. He never asks about the
nineteen again. He does not need to, and he does not entirely know why, and that bothers him more
than the wars would have.

In the fourth year something small breaks in Phoenix, about water, and nobody can afterward say
whether it broke the Alliance or only revealed it. Grant is at a funeral. He hears about it in a
truck, two hours late, which is the first time in six years he has been late to anything.

He says he does not know whether the Alliance held because it worked or because nobody tested it.
Then he drives out himself, because being asked is not the job.

**If the player took the section.** Grant is a man with a hard hat and no authority who shows up
every time, in a section that is now yours, because nobody has told him to stop and he does not read
a room the way the other five read a room. He is welcome and he is unbearable and every governor
wishes you would send him somewhere else. You do not send him anywhere else. Nothing in the section
works the way it did before he died, and every road in it was built by a man who believed that.

**If Grant is dead.** The Alliance loses nothing structural and everything load bearing. It keeps
working for about two years on momentum, which is the most generous thing that section has ever
done, and then a pass changes hands in a morning and there is no address to send anybody to. The
forty one men he pulled out of holes that were surveyed safe are all still alive. That is not an
accident either.

### 1.3 THE GREAT LAKES UNION WINS

*Trigger: the Union holds the Corn Belt and the Lakes Works, and the rail heads are running grain
rather than men.*

She makes the choice.

The lore of this section says Bernice Oyelaran has never had to pick which of her nine states goes
hungry, and that the player can make her pick. Winning means the choice got made, one way or
another, and there is no version of this ending where the harvest is good.

The Union lives. Eleven states with more food than they eat and the largest pool of recruits on the
map, held together by a promise she made to every governor in it and has now bent in exactly one
place, where it will show forever in the records. Either way the section eats. Either way there is a
place that is a name in a memo instead of a place.

The county that went hungry is not gone, which is the detail nobody outside the section believes. It
has a road now, graded and paid for, and a school whose heating bill gets paid. It has a name that
three hundred people still say out loud with no bitterness at all, which is worse. The governor who
sold that grain forward for three winters sat down with her afterwards and was decent about it, and
she has never forgiven him.

Nebraska votes for the Union in the next election out of a real position with real evidence, because
there is nowhere else to put it, and because she kept the gate shut for six years and then opened it
on her own terms and told them first. She was late by ninety days once, in writing, and Nebraska has
the letter.

She goes back to Cedar County and buys the right combine, the second one, the one she cannot afford.
Generosity here is not a number, it is a habit: everybody gets paid, including the people who think
she is a banker, and she goes last, and in the fourth year somebody puts that in a newspaper.

Her daughter calls on Sundays. She looks once at the drive to Des Moines she rode as a young woman
in a truck going the wrong way, says nothing about it, and drives out at half the speed she used to.

She is not triumphant. She is fifty eight. She had to write down one name she did not want to write
down, and she has not forgotten it.

**If the player took the section.** Oyelaran is a farm politician with a very good ear and no army,
and she loses the governors one at a time in the least dramatic manner available. She does not
resist. She goes home to the farm and runs it, and she is right about the harvest every year, and the
section gets its best harvests ever under an administration that got them by accident. She is cordial
in public. She brings up the one memo, once, and then never again.

**If she is dead.** The promise dies with her and the section keeps it for about three years out of
habit, and then a good year comes and the gate opens and nobody announces it. There is a sack of corn
in a paper bag that goes into a file in Chicago, and a great many people understand what it was for,
and none of them ever say so.

### 1.4 THE SOUTHERN COMPACT WINS

*Trigger: the Compact holds the river and the ten states, and the mobilisation that started the last
war has not yet run out of men.*

He holds them long enough.

That was the plan, and it was never a good plan, and he never explained it in a way that would
survive being repeated. The ten states get their own supply lines, their own officers, and their own
reasons to be a section instead of ten separate arguments. By the time the shooting stops they have
all three, and Cordell Jessup is no longer necessary.

The south is fast and poor and organized, which is what a room full of governors says when asked
what won. The first ninety days put more men in a field than any other section, and the last ninety
days were decided by men trained in the same camp the whole time, who went home at the end of it in
the same trucks.

The camp is a college now, with a rifle range, a curriculum, and a waiting list. The range is
funded and the curriculum is not. It is the most useful thing the Compact ever built and the reason it
did not have to conquer anybody.

The bill comes due the way his own file predicts, which is not neglect. Dumas and Boatwright each run
a half. They are cordial at funerals. Neither has started a fight in six years because there is
nothing left to fight over. The south is held by two men who cannot stand each other and a third
man who cannot stop being pleasant to both of them.

Then, about a year after the war, he starts a fight he has no plan to end. It is a customs
arrangement on a river facility, genuinely arguable and not worth a single life. He starts it
because a room went cold on him and he felt it happen and could do nothing about it, which is the
failure mode of a man who spent six years being liked instead of being needed. It costs him the
state he cared about least and teaches everyone in Atlanta what kind of leader he is, on the record.

He asks you to be in the room one more time. Same job, same two men. There is nothing in the room to
fix this time, which is the hard part, and he knows it, and he asks anyway because he has run out of
other rooms.

**If the player took the section.** Jessup is the most likable man in the south being told by ten
governors that they liked him. He keeps being pleasant for about a year because it is all he knows,
and then one of them is openly rude to you in a room he is in, and he does not defend you, because he
does not understand why he would. The section does not fall apart. It is simply held by a man nobody
is afraid of, and it takes a bad harvest to notice that this is not the same as being held by a man
they liked.

**If he is dead.** The Compact holds for four more years on the strength of a room he built, then the
room breaks, and it breaks between Dumas and Boatwright exactly where it was always going to break.
The college keeps running. Its name is not his. Somebody put it there because he said being
unnecessary was the point, and they took him at his word, which is the most generous possible reading
and the one he would have hated.

### 1.5 THE LONE STAR FRONTIER WINS

*Trigger: the Frontier holds the triangle and the border, and the section has refused every offer on
the table.*

He wins by not being bought, and then he has to find out what that was for.

The war ends with four neighbours being polite and the desert between them being the cheapest
artillery range in America. That is the Frontier's whole military argument, and it worked, because
nobody could make anybody close. The section is solvent. It has more money than it has ever had and
has never had to spend a year of revenue on a supply column, and everybody on this map has had years
to study a section that cannot be invaded, cannot be lent to, and cannot be reached.

The cost is the middle. Between the triangle there is less of everything every year. The ranch
families are the only institution out there that still functions, and they were doing the work of a
county before any of this. El Paso is a large town at the far end of the section that the section
still cannot reach quickly, still has the water problem, and still has a neighbour outside the map
that is not a rumour. Nobody solved El Paso. It was not going to be solved by winning.

Royce Adair reads his own list of refusals. It is a habit now: six offers in six years and two more
that came in a bad month. He has the letters. He also knows that the section nobody offers money to
is the section nobody has any information about, which is its own kind of exposure, and he has never
once said that out loud to the person he trusts.

Money is enough. That was the belief, it survived a laboratory of loan offers, and it is now being
tested by the only test that counts, which is the season where nobody is courteous and nobody is
offering anything. The succession problem he never solved is the section's largest single risk. Two
people in his own house have noticed it. Neither has said it to him. One of them is his daughter.

He is at the ranch more than he was. He says no one more time, out loud, to a courier who has come a
long way, and he says it the seventh time as he told you he would.

**If the player took the section.** Adair is a rich rancher with a real working knowledge of supply
who now has to be managed, and he is not managed so much as outlasted, because he is honest with
everybody including his officers and that is the only leverage he has. He keeps his word with every
section he refused, which makes him the only leader anybody trusts, and trusting him is not the same
as following him, and he finds that out in the third year.

**If he is dead.** The Frontier loses the one man who could refuse, and the first offer after the
funeral is made inside a season, and it is a good offer. The section takes it, because there is nobody
left to say no the way he said no, which was in person, at a gate, in daylight, with the number
stated out loud. The ranch sells inside a year. Nobody ever finds the third letter.

### 1.6 THE ATLANTIC CORRIDOR WINS

*Trigger: the Corridor holds the ports, the rail, and the paper, and no rival section has defaulted
on Corridor paper inside a quarter.*

The food arrives, and it arrives because of a schedule with a woman's name in it.

There is no ceremony. The Corridor wins the way it has won everything: on the morning after, the
trains run, the wage goes out on the first, and there is a document in Philadelphia that says what
will be delivered where and by when. Every other section is now a borrower. Not defeated. Borrower,
which is quieter and lasts longer.

She paid the best wage in North America and never pretended that bought loyalty, because she is the
one person here who does not need to be liked to run a country. It still costs her something she did
not price. Three sections begin paying late. Not out of anger. Out of arithmetic, then routine, then
habit, and nobody in Philadelphia breaks the habit, because breaking it takes a phone call everyone
is afraid to make.

The ledger is the country now. Every dispute, ration, and promise resolves into a document. The
document is honest. It does not know what to do in a bad year that was not in the model, and there
will be one, and not because she is careless, because a system that runs on one person has a date on
it that everyone in the room can read.

She builds her own replacement, and it is good, and it is her, which was always the plan. She hands
it over on a Tuesday with a folder and goes home. It works better than she expected, and that is the
part she did not get ready for. She has spent twenty two years being indispensable and has
concluded that being indispensable is a delay. She has been right about that, and being
right about it is the worst thing that has ever happened to her.

The last small thing she has for you is to send you with a message that is not important and ask you
to make it feel important, because she is the one leaving now.

She asked you once what you would do if the money ran out. You answered. She wrote it down. It is in
the file. She has read it four times, it is the wrong answer, and she is not going to tell you,
because the file is the country and the file does not give advice.

**If the player took the section.** Castille is the most competent administrator alive and she has
never held anything in her life except a portfolio, and she learns in about four months that being
indispensable is a relationship and not a title. She is honest with everyone, exactly as promised,
and it reads as a tactic, exactly as it always has, and she stops trying, which is the thing she had
already twice decided she would do. The wage goes up. The food arrives. Nobody thanks her. The
section is the best run on the map and it is not loved, and it was never going to be, and now you
have to live inside that.

**If she is dead.** The paper survives her, which is the argument she made for twenty two years and
which turns out to have been correct. Nobody can produce the address book. Four people know the top
half of it, two of them are vengeful, one of them is honest, and the last one is eighty one and lives
in Baltimore. The wage goes out for nine more years. Then it does not. The food keeps arriving for a
while after that, out of habit, the way a machine keeps running after the power is cut.

---

## 2. LONE WOLF ENDINGS

Three endings for a player who swore to nobody and ended the war anyway. A Wanderer has no section
bonuses and no penalties, which is the most freedom and the least safety in the game, and the three
texts below are the three things that freedom actually is.

### 2.1 THE PEACEMAKER

You won by being useful to everybody at once, which turns out to be a way of winning that nobody has
a name for.

You never held a section. You never held a town either, for more than a season. What you built is a
procedure: a standing order of business with printed agendas, a rule that whoever holds the road also
brings the count, and the discipline to keep sitting in the room when everybody else has an excuse to
leave it. Six sections held a settlement they still cannot explain, and the explanation is a
document you wrote and a sequence of meetings you insisted on and about four hundred small decisions
that only you knew were decisions.

The country that results is the least bloody version available and nobody celebrates it, because
there is nothing to celebrate. The ports are open. The grain moves. Nobody's capital was taken in the
last month of the war, because you had already arranged for that, by being in two rooms a week earlier
than anybody was comfortable with. Somewhere in this file there is a list of what did not happen, and
that list is the whole achievement.

Here is the part that is hard to sit with. Nobody has to answer to you. You have no land, no title, no
people who would come if you called, no section whose failures are yours. When the weather turned and
a county went hungry, four sections blamed the fifth and the fifth blamed the creditor, and you wrote
all of it down in a notebook, and it was true, and nobody could act on it, because acting on it would
require being inside one of those systems and you are, by design and by your own choice, outside all
six.

So the country you built is a country where the argument is always held and never settled, and the
argument is held because of you, and the holding is not enough, and everybody credits the agenda.

You get old doing it. There is a desk in a transit station with a drawer, a phone that rings at four
in the morning for somebody who is not you, and a nephew who thinks you work for a railroad and is
kind enough not to correct it. The day they stop needing you is a day nobody marks. It arrives on a
Tuesday, the way it always has, and after that the meetings go on and are a little worse and nobody
can say when it started.

**Trigger note.** This ending is the one most likely to be mistaken for a win. Do not let a trophy
screen play over it. The last shot on screen should be the meeting, not the flag.

### 2.2 THE WARLORD

You took a town you grew up in and put your banner over the courthouse.

It went fast, the way those things do once a man with a contract and a reputation starts saying no to
the offers that were keeping the war expensive. You were nobody, then you were the man who was always
hired, then you were the flag, and the flag went up over a building you have seen every day of your
life, and the ribbon on it is a bedsheet and it looks terrible and it is not coming down.

The section you have is real. It is small, it is poor, and it is run by people who can shoot and keep
accounts, which is a combination nothing on this map had before you. The school is open. The road
between the two towns is graded and paid for out of your own money. The hospital levy passed because
you wrote the check, and it passed the way the people wanted it written, which is the only honest
thing about it. When you walk through the market, people say good morning, and they mean it, and
they are not afraid of you, and that is exactly the problem.

Every one of them is loyal because they are fed. You have never once had a follower who was there
when being fed was a choice. You will not need one right now. There is a day, and nobody can tell you
when, and on that day somebody with a slightly worse offer will come down the road and your men will
do sums, and your men are not bad at sums.

The men who said no are three kinds of people. Some of them are dead, and you know exactly which
discipline that was and it was yours. Some of them are somewhere else, working, with their names
changed in the way people change their names out here. And some of them are in this town, doing the
job you are doing worse than you do it, and you are kind to them at the market, and neither of you
can ever talk about the road again.

The man whose courthouse it was was not a monster. That is the thing you keep turning over. He was
mediocre and familiar, which is worse, because a mediocre man does not cost anybody anything and a
familiar one can be replaced by anybody at all, including you.

Your own lieutenant asks you, kindly, for the authority to do a particular thing you have been too
proud to do. You give it to him. That is the difference between a warlord and a man who thinks he
ought to be one, and it is the only reason this ending is not the other one.

You are not a king. You are a man with a flag, a good road, and a town that knows your name, and the
name is not the same as winning, and it was never going to be, and on a bad night that is a
comforting thing to say rather than a satisfying one.

**Trigger note.** This ending should be playable by a player who never joined anybody. It should not
require that the player be cruel, only that the player be good at building something and bad at
letting go of it.

### 2.3 THE GHOST

You win and you are not there for any of it.

Nobody can name the day it ended. There was no capture, no surrender, no speech, no proclamation with
your name on it. The last four weeks are a series of arrangements made in rooms you were in for
about ninety minutes each, and then a week in which everything that was going to happen happened
without you, and by the time the sections were signing something in Philadelphia the whole thing had
the quality of a thing that was already decided.

You are in a town whose name you have never used. You are working under a document instead of a name,
and the document holds, and it has held for the length of your hair and the length of your silence.
You rent. You have a job. Your knee is bad in cold weather and you have a neighbor who brings you
soup about twice a month and does not ask, and you do not tell him, and he does not ask.

There are versions of you in this country and none of them are accurate.

A tavern in Amarillo has a man who rode in on a grey horse and paid for a round and left without
saying where he was going. A woman in Hagerstown says she sold something to somebody who did not
talk and did not look at the merchandise. Two old soldiers in a diner in Ohio disagree about whether
the road that opened last spring was yours or the governor's, and both of them have a story, and
the stories differ in the way that stories differ when nobody can check. Somebody in a union hall in
Flint says there was a woman from the war who could make anybody do anything, and when pressed for a
name, says she had already moved on, which was her whole approach.

You never gave a speech. There is no quotation attributed to you anywhere, which in a country that
runs on what people say about each other is close to being a ghost by legal definition.

Two histories get written in the ten years after. The official one calls the last year the
Settlement, which is accurate, and has a chapter about a road opening in the Appalachian valley that
four counties wanted and nobody could have paid for, and you arranged that in one afternoon, in a
room, with a sentence. You read that chapter, in a library, and you read it twice, and there is
nothing in it about you.

You won. It turns out that is a thing that can also happen to a man who is not there, and that the
winning does not come looking for you, and that you will spend a certain number of years being
nobody's enemy, which is the only safety this game offers anybody.

**Trigger note.** This ending needs no flag in the world. Every later text about the war should be
able to run without it. If a simulation panel needs a number here, the answer is that this campaign
has none.

---

## 3. DEFEAT

Four scenes. These are not endings, they are the last thirty seconds of a campaign plus whatever
happens to the player afterward, and they are chosen by how the final engagement actually resolved.

### 3.1 CAPTURE

The last of your line gives out at the fence line, and what comes up the lane is not a charge. It is
a walk: four men abreast, at a pace you could match with anything left in your legs. The one
in front is not in a hurry and he is polite. He says your name. All of it, including the part you
have never written down, and when you correct him he nods and gets it right too.

They put you in a truck facing the tailgate so you cannot watch where the road goes. A woman in the
second vehicle asks whether the wounded in your column are real, because the board count and the
field count did not match.

You have time to say one true thing before anyone asks you a question. Everyone who interviews you
from here on will be reasonable, patient, and completely uninterested in your reasons.

You will be treated well, the arrangement will be honored, and you will spend years in a room
somebody has opinions about, permitted to be right about the things you got right. Remember one name
from your own command. Not a title. A name.

**Reader note.** Fires when the party is surrounded with no route out. Any companion who can still
walk is taken with the player, and section 4 uses the captured variants.

### 3.2 ESCAPE

You have eleven minutes, because that bridge is eleven minutes when it is standing and four when it is
not, and it is standing, which is the only good news and it will not stay good news.

You leave [survivors_left] people. You do not get to say anything clever to them and you do not try.
The last one looks at you and does not look away.

Every mile you make is a mile between the man you were this morning and whoever arrives at dawn,
and there is no point along it where you get to stop being the man who chose.

Here is what you bought. Every gate on this map has a name, a schedule, and a price, and you have
been inside all of them, which means nobody who holds one will ever hire you and also means there is
no gate you cannot get through.

Dawn comes up flat and orange over ground you have no reason to be standing on. You are not a
defeated man. You are a man who got away, which in this country is nearly the same thing, and nobody
has ever written a song about it.

**Reader note.** Fires when a river, bridge, or vehicle check resolves in the player's favour at the
cost of the rearguard. The cost is written into party state, not into this text.

### 3.3 LAST STAND

You take the hill because the hill is the only thing between them and the town behind you, and you
say that out loud once, early, so nobody wonders later whether you knew.

There is not much water. You have [hold_hours] hours in you and you spend them carefully, because
the men who go down first should not have the most left.

At some point you stop being a commander and become a schedule. A man with a radio moves civilians
out through the low ground at four in the morning, and you know because the road goes quiet in the
wrong way. You hold the top so the low ground stays quiet.

They come up the slope twice and stop and look at you, and you watch them decide you are not worth the
hill, and you hold the top for a further [hold_hours] out of pure spite.

At the end there are eleven of them and you are nine. Somebody asks whether it was worth it and you
answer honestly. Your people are not defeated. They are finished, and the difference will matter to
them for the rest of their lives.

**Reader note.** Fires when the player holds a position past the point of breaking the assault in
order to buy the evacuation. The evacuation is real in the simulation and the town is measurably
emptier afterwards.

### 3.4 NEGOTIATED SURRENDER

You get terms, and better terms than you expected, because the other side has done the arithmetic and
knows taking the field costs more than the field is worth. This is not a courtesy. They are spending
your army's ammunition.

The terms are written and honored, and you keep the paper the way other men keep a pay stub.

Then you count them, because you have been counting men your whole life and cannot switch it off.
Eleven names on your roster, nine bodies, and the officer who should have been in the truck was in
the truck, and the man who gave you the count was wrong in one direction only.

You have one decision and you make it fast. You let the paper do what paper does. The column goes out
in the sun and nobody in it knows what you agreed to.

Later, somebody tells you what happened at the crossing. Not all of it. The part with the number.

You keep the paper in a drawer for the rest of your life. It is the most honest document you will
ever own and it cost eleven men, and you signed it.

**Reader note.** Fires when a field officer accepts terms. The eleven and the nine are constants in
this scene because the scene is a fixed script. Do not let them scale with party size.

---

## 4. COMPANION EPILOGUES

One paragraph per companion per outcome. Two variants: **won**, and **lost or walked away**. The
lost variant covers both the player losing and the companion leaving, because the tone of those two
things is nearly the same and the difference is only whether the door was locked.

These read their flags from companion state, not from the ending that fired. A companion can be
absent from a victory because they died in the campaign, left in the third year, or never joined. All
three use the second paragraph. A companion who died should not be written as though they emigrated.

### 4.1 TEODORA NAKASHIMA, engineer

**Won.** She gets the thing she wanted, which is one thing that outlives the section, the war, and
her, and it is a pumping station on a line she rebuilt twice with a bracket of her own design. The
section puts a plaque on it and she makes them take the plaque down, and it goes back up anyway in a
smaller font, and she complains about the font for twenty years. She is not allowed near the
Richmond conveyor line anymore because the man who runs it cannot stand being told why it works, and
she drives out on Sundays to sit in the parking lot and look at it. The bearings still go. She was
wrong about it being just a machine, in the way she is wrong about machines, but the machine is the
reason a town has water, so let it stand.

**Lost or walked away.** She goes back to a terminal that is being sold and a supervisor who has
never heard of her. She fixes the one thing in that town nobody else can fix, which is the generator
at the water plant, and then she fixes a school, and then she starts taking work at fairs and doing
it after hours for free. She is not bitter. She is working. The bearings still go.

### 4.2 ROYCE CALLOWAY, scout

**Won.** He walks the line. Gulf to Canada, the whole thing, in three pushes, with people who carry
what he says and no more than that. It takes longer than it should because he will not leave a road
unlooked at, and he is right about that twice. He calls his daughter in Ohio and the calls get longer,
and the letters get better written, and the glovebox still has all of the first ones. He finishes the
line in the fall and then has no reason to be anywhere, which turns out to be the actual hard part and
the part he never tells anybody about. He takes a job guiding water crews in the spring. It is not
restlessness if there is water to look at.

**Lost or walked away.** The party comes apart and he keeps the truck and the bad heater and the
route book. He does not stop moving. What he loses is the line: without somebody to make him commit
to a direction, it is only driving, and he tells two different people that the difference is not
important, and both of them know it is. He goes south in the fall and works winters somewhere with
good roads, and he is perfectly good at it, and he stays about four months.

### 4.3 ODESSA PRYOR, surgeon

**Won.** She has three. Not four. There are four, if you count the fourth, and the fourth argues with
her about sutures in front of the players and is right about sutures. She takes a house near a
hospital that is not a tent and a building with a roof that does not leak, and she works less and is
bored and cannot stand it and goes back in anyway. The shoulder is worse. She still does not eat before
a night operation and still claims a good appetite, and now there are eleven people who do not
believe her, which is the closest thing to a retirement she is capable of. She loses one of the three
in the fourth year and can name the town.

**Lost or walked away.** She goes back to a parish that has a floor, a sign, and a schedule, all three
of which are good, and she is still the only person in the building who can do what she does. She
trains somebody new every year and about half of them leave, and she does not keep a list, and she can
name every one.

### 4.4 WENDELL BRAGG, quartermaster

**Won.** He delivers it. Full, in one run, to the town that had eleven days left, and the manifest is
signed by four people and one of them is him. Then he asks for permission to stop, and the permission
takes nine months, and when it comes it is a chair by a window and a piece of work that is mostly
counting, and he accepts it without any expression at all, in the way that tells you everything. The
notebook is still the notebook. There is a page in the front with one delivery on it and no
annotations, because nothing about that shipment went wrong and he had nothing to add.

**Lost or walked away.** He is the man who tells the town the grain is not coming, and he does it the
way he does everything, which is early, in person, with the count written down and a figure he can
defend line by line. He does not soften it and he is not sympathetic about it and he is at the church
that evening. Then he goes back to work the next morning, because the next thing is a load from
somewhere, and the next thing is always a load from somewhere.

### 4.5 DELPHINE MORROW, trade runner

**Won.** She gets the box out of Hagerstown, and the name inside it is not hers and it holds for
eleven years, which is longer than most people's plans. She buys a town with no name anybody uses, a
business that needs managing, and no involvement in anything. The paper trail is immaculate. She
pays for a clinic in Mississippi every month for a decade under a name that is a company, and nobody
ever connects it, and the person receiving it knows exactly who is paying and has never once said so
and is not going to now. There is one phone number in a county that is on her list. It is Odessa
Pryor's. It has been there since a warehouse in a port district, before any of this.

**Lost or walked away.** She sells what she has, which is most of the party's movements and a
quantity of other people's, and she is very good at it. She keeps one name off the list and does not
explain that and neither do you. She is in a different section inside a season and doing well and
she will not tell anybody where, and she pays one clinic under a name that is a company, and that one
is not negotiable and has never been.

### 4.6 CODY BRAVO, ranger

**Won.** He sees the ocean. It is a grey Tuesday, it is colder than he expected, and it takes him
about forty minutes to say one sentence about it and then he stops saying anything for an hour. He is
so embarrassed about how much it moved him that he tells three people the Pacific is overrated. He
calls his uncle and does not explain where he is. And he stayed, which is the part nobody expected: he
has a plan that goes past next week now, and the plan is a stable and a woman who runs it and a
schedule with a name on it, and he wrote the schedule down himself, which for Cody Bravo is a
diploma.

**Lost or walked away.** He does not see it. If he went out at the end with the flag still on the
staff, he is out there two more years and comes back on a truck with other people's dust on him and
will not describe those two years. If he died, it was something stupid and fast, and it was somebody
else's bad road, and he was the best horseman in the party by a distance. A woman who worked with him
takes the commission in his name because somebody has to say it out loud, and she gets the detail
wrong, and he would have corrected her.

### 4.7 AUGUST RAMEY, gunner and engineer

**Won.** He finishes it. One weapon, the whole run, not one exception in a year of work, and the
third one does exactly what he tells it to do, and he stands there and finds that he does not know
what to do with that. It is the goal of his life and it is a machine now. He keeps the rail yard job
anyway, on the crane operator's courtesy, and he goes in Tuesdays, and nobody there is important and
he does not want them to be. The shoulder comes apart in his hands in the fourth year, in front of
you, and he hands it to you and says you have the steady hands, which from him is the highest thing in
this file.

**Lost or walked away.** He buries the weapon. He does it properly, with the reason explained at
length, and the explanation is better than any objection available. He goes back to Pittsburgh, where
the rail yard is still there and a crane operator still lets him help, and he fixes things for men
who want guns and do not want advice, and he is the best of them and the loneliest, and he is loud
about it so that nobody has to worry about him.

### 4.8 LORNA QUINN, organizer and negotiator

**Won.** She wins the dispute from the other side. The whole thing, with the grievance procedure that
she made the player sign into a contract when she joined, which is in the contract, in her
handwriting, in a drawer in Flint that four hundred people can produce. Nobody dies. That was the
goal and she hit it, and the plant reopens under terms she negotiated, and the union hall gets a
building. Her son is in the room on the other side of the table in uniform and does not look up once.
She does not mention him afterward. She says his name twice to you in the car, and asks you not to
repeat it back, and then talks about the grievance clause for forty minutes.

**Lost or walked away.** She keeps organizing, because there is nothing left to organize toward, and
so she organizes the thing that is nearest: a memorial committee, a food drive, a hall, a newspaper, a
grievance committee for people who are not members of anything. It works on about forty people, she
knows it is forty, she has the list, and she talks to a man she met in the third year of the war as
though she were putting together a second shift. Her son sends her a form letter. She reads it and
corrects the address by hand.

---

## 5. YEARS LATER

Ten vignettes of ordinary life in the country the war leaves behind. These are not rewards. They are
what the systems produce when nobody is looking, and they are all drawn from documented conditions:
elevators in the Plains, outmigration in the Appalachian Interior, water in the Mountain West,
grievance procedures in the Lakes Works, port logistics on both coasts.

1. **The elevator, eastern Nebraska.** The grain elevator is still the tallest thing for nine miles and
   the man who weighs your truck is the third man to hold that job. The scale house got a computer
   that works about a third of the time and he has a hand scale behind it for when the computer is
   feeling loud. He knows every farmer for forty miles and none of them vote for the same thing. The
   war is a story to him about basis and prices, and he tells it wrong, and the price of beans this
   spring is the only part of the story he gets right.

2. **The school, eastern Kentucky.** The high school has a tipple on the ridge above it and the coal
   came back under different ownership with a different name and it pays on the first of the month.
   The basketball team is undefeated for a reason that is about the coach, who was twelve when the war
   ended and is now forty one and was marked up by a man he did not know the name of. He is a very
   good coach. He has never once said anything about it, and if you brought it up he would ask what you
   meant.

3. **The bus, the Appalachian valley.** A route came back in the spring with three stops more than it
   had, and the driver is the same driver, and he is sixty one and knows the stops by the shape of the
   road rather than the sign. Twice a week the bus goes up a valley road that used to be a supply
   route, and there are people waiting on it who are not going anywhere in particular and who ride it
   because it is there. That is the whole service and it is more than there was before any of this.

4. **The bridge, the Monongahela.** A bridge over a valley river is new, or new enough, and there is a
   plate with an engineer's name on it that is a woman's name because she found the money and did not
   allow her own name to go on first. The mills are half what they were and the river is doing what it
   always did. There is a man who walks across it every morning at the hour the light comes up the
   gap, and he has done that for six years for no reason anybody has asked him about, and when you ask
   him he says he likes the walk.

5. **Two flags, San Antonio.** A bar on the west side keeps two flags on the wall, and one of them is
   old and nobody will take it down, and the second one is folded in a drawer and comes out when the
   team wins, which has not been often. The bartender has a list of regulars from the war years and he
   is politely rude to everybody's ghost, which is a skill. In a town that size the war is not a
   topic. It is a set of people at particular tables.

6. **The clinic, Memphis.** Same storefront, same floor, and there is now a form that works and a
   person whose entire job is knowing what goes on it. The line goes out the door, which it should,
   and it is shorter than it was and it is shorter for the boring reason that there are more of her. A
   woman who was in a ward during one of the years you know about runs intake and is better with
   frightened families than anybody in the building, including the one who trained her, who says so out
   loud, which would embarrass her if she heard it.

7. **The pump house, high desert, Mountain West.** A town of about four thousand people has a water
   line newer than the town is old and a pump house with two people working in it, one of whom is
   thirty one and knows more about the system than the man who trained her, who is honest about that
   and has moved into scheduling. There is a union hall bulletin board with a name on the pay envelope
   that is crossed out and a new one, and nobody ripped the old one off, and everybody knows both
   readings. The block still gets rationed. It gets rationed by a schedule now, which is the whole
   argument the Alliance has been having since before any of you were born, except that now there is
   a person to argue with.

8. **The harbor, Seattle.** A pilot counts ships in the fog and the lane is new and the schedule out
   to the northern rail heads exists in writing, and the barges from the far end of the Compact arrive
   on a date that two people in this industry have staked their reputations on being able to predict.
   Fog still closes it four days a year and nobody has gotten clever about that yet. On the pier a
   crew that has worked together for nine years takes the same shape of break, in the same order, on
   the same afternoon, for reasons that have never been written down.

9. **The cemetery, Ohio.** Six sections of a county are buried in six rows, and there is no stone
   that says which section anybody was in, because a man with a list was asked to include it and
   declined. One man mows all six rows and will not discuss it. A church group that has members on both
   sides of every one of these wars cleans the stones every spring, and they do it badly and
   correctly, and a woman in that group has done it for eleven years and has never once left anybody
   out.

10. **The truck stop, outside Amarillo.** Two men who spent the war on opposite sides of it pull into
    the same lot on the same afternoon and end up talking at the fuel island for two hours about
    nothing they can discuss. One hauled grain for the Lakes Union, one hauled fuel for the Frontier,
    and neither of them knew the other existed until now. Their kids got married two summers ago. They
    find that out at the pump and neither of them can work out what to say about it, so they talk
    about diesel.

**Usage note.** These are one paragraph cards, not a sequence. The montage reads best with gaps in
it, three or four vignettes per showing, and it should never play all ten in a row.

---

## 6. NOTES FOR IMPLEMENTATION

**Slots used in this file**

| Slot | Reads |
|---|---|
| `[hold_hours]` | Hours the position was actually held, from the engagement log |
| `[survivors_left]` | Party survivors at the moment the rearguard was cut off |
| `[county_name]` | A settlement the simulation already knows, read from the food or migration logs |
| `[march_days]` | Current Frontier per day food and money draw, from the March system |
| `[leader_fate]` | One of `player_holds`, `deposed_alive`, `dead`, `exiled`, `retired` |
| `[game_year]` | Nothing in this file prints a year, deliberately |

**How the defeat reader picks a scene.** Surrounded with no route: capture. A river, bridge, or
vehicle check that resolves for the player: escape. The player holding a position past the point of
breaking the assault: last stand. A field officer accepting terms: negotiated surrender. Where two
could fire, capture wins, because capture is the only one that leaves the player's party intact in
the simulation for section 4 to read.

**How companion epilogues are chosen.** `alive`, `goal_progress`, and `exit_reason`, per
CHARACTER.md section 8. A companion who died in the campaign uses the second paragraph, and the
cause panel should show the death. Do not soften the Cody Bravo variant. He is the one most likely to
die of something stupid, and the difficulty settings must be able to make that rarer, per
companions.md section 6.

**No numbers.** Nothing in this file may be printed with a hard figure in it. If a number is needed,
it comes from state, and the text degrades to a phrase when the state has no value. This is the same
rule as content/lore/factions-regions.md section 1.

**Voice.** Second person for the player, third person for everyone else. No present tense marketing,
no adjective doing work a fact could do. Every ending is written so it can be read aloud by somebody
who has never seen the game.

---

## 7. DECISIONS AND OPEN QUESTIONS

Decisions taken here because the lore left them open. Each one fits content/lore/factions-regions.md
and content/characters/faction-leaders.md, and each should be reviewed by the owner rather than
inherited silently.

1. **Six victories, not four.** The brief asked for four and every side gets one, because a faction
   with no ending reads as the second best outcome and that is the wrong feeling to hand somebody who
   played a long campaign.
2. **The country after the war is still six sections.** No document in the repo describes a federal
   restoration, a new union, or a constitutional convention, so no ending writes one. Each victory
   describes a section's problem getting harder rather than getting solved, which is what the existing
   lore predicts.
3. **Leaders can be present, deposed, or dead.** faction-leaders.md section 7 requires every leader to
   be replaceable, and that requires a text for the case where the player did the replacing. Each
   victory carries a paragraph for that, and one for the leader's death.
4. **Cody Bravo's ocean is the Pacific.** His file says he has never seen the coast and does not say
   which coast. Kerrville puts him on the Pacific side in region, so his won epilogue is the Pacific.
   If a player's route put him in a Gulf campaign, swap the paragraph for a bay, a shrimp dock, and
   the same forty minutes of silence. Do not rewrite the line about it being overrated.
5. **Lone wolf endings are not gated behind a founding action.** No faction creation screen exists in
   any document I could find, so the warlord ending is written to require only that the player hold
   territory and refuse every offer. If a founding system lands later, this is where its trigger
   plugs in.
6. **Nothing is written about Indigenous nations.** factions-regions.md section 6.1 leaves this as an
   owner decision and says it must not be resolved by an agent. These endings therefore say nothing
   about it anywhere, including in the Mountain West and Pacific victory text, where the omission is a
   choice and not an oversight.
7. **Alaska and Hawaii are asked, not told.** The Pacific victory uses the wording already in
   factions-regions.md section 2.1 rather than settling open question 2 in that file, because the
   Compact's origin is a shipping agreement and a victory text that simply annexed two islands would
   contradict the document this file is built on.
8. **The ghost ending leaves no state read.** By design, so every later system can run without the
   player present. If a panel needs a number here, the answer is that this campaign has none.
