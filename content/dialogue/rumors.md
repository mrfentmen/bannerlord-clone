# RUMORS

The rumor system. Rumors are the cheapest information in the game and the least
reliable. A rumor is one person saying a thing they heard from somebody who
heard it from somebody, and by the time it reaches the player it has usually
been through four mouths and one bad driver.

Structure: rumor blocks first, then escalating chains, then rumors about the
player. Every rumor carries three fields:

- **Line.** What gets said, in the mouth of somebody who is not thinking about
  the player.
- **Who.** The speaker role that would actually say this. Bartender, farmer,
  guard, kid, mechanic, preacher, dockworker, nurse. A rumor is only believable
  coming out of the right sort of mouth.
- **Tag.** One word. `true`, `false`, or `twisted`.

**What the tags mean for the simulation:**

- `true` means the line is factually correct in the world state. Use these to
  teach a player something real, or to confirm something a system just did.
- `false` means the line is wrong, and wrong in a way that is checkable. Use
  these to teach distrust. A false rumor should be false about something that
  matters, not about trivia.
- `twisted` means the true fact is underneath and it has been distorted in a
  specific, repeatable way. Too many people, wrong unit, wrong place, wrong
  blame, wrong reason. A `twisted` rumor is the most useful one in the game
  because a careful player can recover the true fact from it, and most players
  will not try.

**Rules this file obeys**

- Plain ASCII only. No em dashes, no en dashes, no curly quotes, no unicode
  of any kind.
- Humanize everything. Nobody states a rumor cleanly. People hedge, blame
  somebody specific, and get the number wrong because they were told the number.
- No marketing speak, no ad-style hyphenation, no paired construction like
  "fast and reliable." Two things are not better than one thing just because we
  listed them.
- One thought per line. Rumors are meant to fit on one screen line.
- Real geography, fictional people, per CONSTITUTION.md section 6. No real
  person, company, or event is referenced.
- No overlap with townsfolk.md or tavern-merchants.md. Those files already own
  ambient weather complaint and shop gossip. A rumor here is a claim about a
  person, a firm, a battle, a price with a cause behind it, or the player.

---

## 1. WAR NEWS

Big movements, engagements, and who is winning. Most of these are `twisted`,
because by the time war news crosses a region it has picked up a hero.

- **Line.** They took the bridge at four in the morning and the whole thing was over before anybody had breakfast.
  **Who.** Guard, retired sergeant, radio operator.
  **Tag.** twisted

- **Line.** There is a whole division sitting on that road and nobody will say whose it is.
  **Who.** Farmer, trucker, gas station owner.
  **Tag.** true

- **Line.** Forty men went into that valley. I know because I counted the ones that came back and it was not forty.
  **Who.** Township trustee, funeral director, county clerk.
  **Tag.** twisted

- **Line.** The supply column has gone east twice this month and both times it came back lighter.
  **Who.** Quartermaster's wife, warehouse clerk, mechanic.
  **Tag.** true

- **Line.** They are saying the whole thing is a feint and the real push is over by the water.
  **Who.** Kid on a bicycle, barber, retired Air Force.
  **Tag.** twisted

- **Line.** Our general has not been seen in the state since the state stopped having news.
  **Who.** Bank teller, receptionist, tax preparer.
  **Tag.** false

- **Line.** The men up north are eating better than we are and they know it, that is the trouble.
  **Who.** Cannery worker, farmhand, cafeteria server.
  **Tag.** twisted

- **Line.** Two officers had a meeting over that map and one of them left through the side door.
  **Who.** Sergeant, adjutant, mail carrier.
  **Tag.** twisted

- **Line.** There is armor on the rail spur, real armor, and somebody is guarding the flat cars with kids.
  **Who.** Railroad worker, crossing guard, welder.
  **Tag.** true

- **Line.** The war is coming to this county by spring. That is what the county clerk said.
  **Who.** County clerk, or anyone repeating the county clerk.
  **Tag.** false

- **Line.** They burned the courthouse and rebuilt it. Same flag out front. Different clerk.
  **Who.** Farmer, courthouse regular, lawyer.
  **Tag.** twisted

- **Line.** Every third truck on that highway is a hauler now. That is not an army, that is a supply line with a bad attitude.
  **Who.** Highway patrol, cafe waitress, tire salesman.
  **Tag.** true

---

## 2. FACTION GOSSIP

The six sections and the people who run them. This is where rumor does the
most damage, because faction rumors get repeated as fact by people who have
never met a section leader.

- **Line.** She holds it together because half of them owe her money and the other half owe her favors.
  **Who.** Bartender, bookkeeper, county politician.
  **Tag.** twisted

- **Line.** The man out west has no legal authority over anything and everybody up there still does what he says.
  **Who.** Miner, welder, road crew.
  **Tag.** true

- **Line.** They say the coast decided a while back to let the inland counties go hungry first.
  **Who.** Farm wife, irrigation board member, farm kid.
  **Tag.** twisted

- **Line.** That woman in the east has never lost an argument and that is not the same as being right.
  **Who.** Lobbyist, city desk reporter, union steward.
  **Tag.** twisted

- **Line.** The southern outfit is the fastest to raise anywhere in the country and by month three they are broke.
  **Who.** Militia wife, hardware owner, motor pool clerk.
  **Tag.** true

- **Line.** There is a preacher out of Tennessee telling everybody the truth and nobody up in Atlanta will say his name out loud.
  **Who.** Church deacon, bootlegger, schoolteacher.
  **Tag.** twisted

- **Line.** Prewitt out of Nebraska has been buying elevator capacity for four years and everybody in Omaha knows except the governor.
  **Who.** Grain trader, elevator hand, auditor.
  **Tag.** twisted

- **Line.** Alcaraz does not care about people, he cares about allocation, and I will take him for that.
  **Who.** Grower, irrigation pump hand, mechanic.
  **Tag.** true

- **Line.** Shay runs four counties better than the state ever did and somebody should make that official.
  **Who.** Virginia clerk, courthouse widow, school board member.
  **Tag.** true

- **Line.** Cobb kept that courthouse in good repair on purpose. He wants it to look like the law still works here.
  **Who.** Ranch hand, traveling salesman, bailiff.
  **Tag.** twisted

- **Line.** Grant has written three warnings about the water and been ignored by men who own tanks.
  **Who.** Farmer, mine foreman, city councilman.
  **Tag.** true

- **Line.** Oyelaran made a promise to the Plains states and kept it six years and Nebraska still hates her for it.
  **Who.** Elevator operator, feed salesman, bartender.
  **Tag.** true

- **Line.** Jessup started this because a room full of men who hate each other finally got quiet. That is the whole founding story.
  **Who.** Old militia member, courthouse clerk, range hand.
  **Tag.** true

- **Line.** Adair has been offered a deal by the Coast twice and turned it down twice and everybody thinks he is playing hard to get.
  **Who.** Banker, oil field roughneck, trucker.
  **Tag.** twisted

- **Line.** Vega has never once lost an argument with a governor and she has lost eleven of them.
  **Who.** Port commissioner, farm bureau rep, shipping clerk.
  **Tag.** false

- **Line.** Castille can buy this county before she can walk it and she is too polite to mention it.
  **Who.** County treasurer, insurance man, lawyer.
  **Tag.** twisted

---

## 3. PERSONAL SCANDALS

The half-true stuff about individuals that has a motive attached. Scandal
rumors are where `twisted` earns its keep, because a scandal always has a real
embarrassment at the bottom of it.

- **Line.** The judge took money once, years ago, and has never forgiven himself and cannot stop mentioning it.
  **Who.** Bailiff, courthouse clerk, his ex-wife.
  **Tag.** twisted

- **Line.** The mill owner and the union man are brothers. Nobody says it out loud. Everybody knows it.
  **Who.** Foreman, line cook, union steward.
  **Tag.** true

- **Line.** The sheriff's brother works for the outfit the sheriff is supposed to be watching.
  **Who.** Deputy, barista, cattle dealer.
  **Tag.** twisted

- **Line.** The schoolteacher is having somebody else's baby and the whole town figured it out before she did.
  **Who.** Postmistress, teenager, school bus driver.
  **Tag.** twisted

- **Line.** He kept the insurance money. That is what his wife told the barber, and the barber told me, and I paid attention.
  **Who.** Barber, insurance adjuster, widow.
  **Tag.** twisted

- **Line.** The preacher ran a casino in the next county for nine years and never lost at cards.
  **Who.** Waitress, deacon, ex-husband.
  **Tag.** true

- **Line.** She bought her way onto that board and half the board knows it and the other half got bought too.
  **Who.** Chamber of commerce, rival business owner, county commissioner.
  **Tag.** twisted

- **Line.** The diner owner and the health inspector have not spoken since the freezer incident and the freezer was not food.
  **Who.** Cook, trucker, teen.
  **Tag.** twisted

- **Line.** He votes every election and has voted twice in three years, and if you ask him about it he tells you about his grandfather.
  **Who.** Cafeteria server, road worker, his wife.
  **Tag.** twisted

- **Line.** The bank has taken over three farms on that road this year and not one of them had a lawyer.
  **Who.** Farmer, auctioneer, rural mail carrier.
  **Tag.** true

- **Line.** Two brothers fought over a will for eleven years and the money was forty thousand dollars.
  **Who.** Executor, bartender, the loser.
  **Tag.** twisted

---

## 4. GHOST STORIES AND SUPERSTITIONS

Fires, floods, mines, and the things people blame. Most of these are `false` or
`twisted`, and a couple are `true` in a boring way nobody wants to admit.

- **Line.** Do not count the vehicles at that crossing after dark. My uncle counted to forty and then he started over.
  **Who.** Kid, long-haul driver, night-shift nurse.
  **Tag.** twisted

- **Line.** The lights in the quarry go out every year at the same week. Every year. Nobody has ever explained it and nobody has to.
  **Who.** Miner, quarry foreman, truck driver.
  **Tag.** twisted

- **Line.** That church has a girl in the basement and the deacon will deny it with his whole chest.
  **Who.** Kid, local reporter, church woman.
  **Tag.** false

- **Line.** When the river comes up over the levee it takes the same three houses first. People say it chooses.
  **Who.** Lifelong resident, insurance man, fisherman.
  **Tag.** true

- **Line.** If you hear your name called from the mine shaft, do not answer, because it is not the shift bell.
  **Who.** Old miner, safety inspector, widow.
  **Tag.** twisted

- **Line.** The hospital has a fourth floor that is not on the elevator panel and has not been since before anyone worked there.
  **Who.** Nurse, orderly, night janitor.
  **Tag.** false

- **Line.** I buried my husband on that hill and I have found the same dirt in three other states in three other graves.
  **Who.** Grave digger, funeral home helper, older woman at the bus stop.
  **Tag.** twisted

- **Line.** Do not park on the grass at that rest stop. It has been mowed around one car every morning for two years.
  **Who.** Trucker, state trooper, traveling salesman.
  **Tag.** twisted

- **Line.** The valley below the dam is quiet now and it is not quiet because anything good happened.
  **Who.** Carpenter, surveyor, teacher.
  **Tag.** true

- **Line.** They say the orchard house has a second staircase going down. My cousin went looking. He came back and did not talk about it.
  **Who.** Farm kid, handyman, drunk in a good mood.
  **Tag.** false

- **Line.** Salt in your pockets before a funeral and the family will not be able to see you.
  **Who.** Older woman, funeral director, grandmother type.
  **Tag.** twisted

- **Line.** There is a road out past the fence that is on the county map and it is not on the ground.
  **Who.** Surveyor, deputy, mail carrier.
  **Tag.** twisted

- **Line.** Floodwater came into the store and the freezer stayed running for nine days off a generator somebody's wife kept feeding.
  **Who.** Grocery owner, flood volunteer, kid.
  **Tag.** true

---

## 5. ECONOMIC TALK

Prices, shortages, and the money behind them. These are the rumors that are
always `true` and always about a cause, which is the point of them. If a price
moved in the simulation, a rumor in this section is why.

- **Line.** Flour went up eleven percent in a month and every single sack came off one mill on one river.
  **Who.** Grocer, cafeteria cook, baker.
  **Tag.** true

- **Line.** Somebody cornered the fuel before the weather turned and now we all find out what a drought costs.
  **Who.** Rancher, irrigation hand, truck stop owner.
  **Tag.** twisted

- **Line.** Fertilizer is booked out four months and any man promising you a month is selling you air.
  **Who.** Farm supply dealer, farmer, co-op manager.
  **Tag.** true

- **Line.** The plant is running nights and hiring, and that is either good news or the last good news.
  **Who.** Welder, line cook, foreman's wife.
  **Tag.** twisted

- **Line.** Three houses on my street sold to the same family in one week. Nobody in that family lives in that state.
  **Who.** Mail carrier, neighbor, realtor.
  **Tag.** true

- **Line.** Tires are up because everybody has been driving out to look at the fight and wearing them out on each other.
  **Who.** Tire salesman, mechanic, sheriff's deputy.
  **Tag.** true

- **Line.** There is more food in this county than there was two years ago and fewer people able to buy it.
  **Who.** Grocer, school lunch cook, welfare office clerk.
  **Tag.** true

- **Line.** A loan came through this morning for a farm that cannot pay it back, and nobody at the bank asked for a plan.
  **Who.** Bank teller, neighbor, farm kid.
  **Tag.** true

- **Line.** The only thing moving through that port is money and imports. We have had nothing but money and imports.
  **Who.** Longshoreman, warehouse foreman, fish seller.
  **Tag.** true

- **Line.** Nobody buys used anymore because a new one costs the same, and that is not normal.
  **Who.** Car dealer, mechanic, junkyard man.
  **Tag.** true

- **Line.** Cattle prices are fine and the cattle are not, and the people who own the good land are not the people who own the cows.
  **Who.** Cowboy, feed salesman, bank officer.
  **Tag.** true

- **Line.** Somebody bought the seed for four counties out of one dealer on one day and paid cash for all of it.
  **Who.** Co-op clerk, farmer's wife, seed salesman.
  **Tag.** true

- **Line.** The base contractor books his meals at a restaurant and the restaurant books a debt. That is a supply chain with a step in it.
  **Who.** Head waitress, chef, bookkeeper.
  **Tag.** twisted

- **Line.** Water is the whole price list here now. Every other number on this sheet comes out of that one.
  **Who.** Irrigation district manager, grower, city councilman.
  **Tag.** true

---

## 6. PLAYER REPUTATION RUMORS

Generic enough to fit anywhere. These fire off the player's own ledger, not off
a specific quest. `true` means the game confirms it, `twisted` means the game
has the fact and the town has the story wrong. Use the false and twisted ones
as incentives: the player can be told something untrue and know it.

### 6.1 After a good deed

- **Line.** They held that crossing for two days so the ambulances could get through, and they did not ask anybody for money.
  **Who.** Nurse, driver, sheriff's deputy.
  **Tag.** true

- **Line.** I heard they took a whole convoy back from raiders and then fed the crew before they left.
  **Who.** Truck driver, cook, camp follower.
  **Tag.** twisted

- **Line.** Word is they paid a town back what they took and did not itemize it, which is either very fair or a very good story.
  **Who.** Shopkeeper, mayor's clerk, traveling salesman.
  **Tag.** twisted

- **Line.** My cousin walked home from that one. Take that however you want to.
  **Who.** Farm woman, mail carrier, kid.
  **Tag.** true

- **Line.** They sat down with three old men who wanted to burn somebody and talked them out of it. I do not know what else to tell you.
  **Who.** Tavern owner, retired sergeant, church woman.
  **Tag.** true

- **Line.** They lost the horse and came back on foot and finished the job. That is the part people keep repeating.
  **Who.** Cavalryman, ranch hand, farrier.
  **Tag.** true

- **Line.** They broke a contract with somebody who owned half the county to keep a village's well running.
  **Who.** Farmer, water board member, attorney.
  **Tag.** true

- **Line.** They took a beating in front of everybody and did not explain it later, which is the whole reason anybody believes any of it.
  **Who.** Bystander, competitor's wife, veteran.
  **Tag.** true

### 6.2 After a bad deed

- **Line.** They hit that town and took the food out of it, and the food was the only food in it.
  **Who.** Grocer, teacher, refugee.
  **Tag.** true

- **Line.** Four hundred people know what happened at the depot and none of them can tell you what was in the trucks.
  **Who.** Rail worker, widow, deputy.
  **Tag.** twisted

- **Line.** Two of ours came back with money and did not come back with their boots and nobody asked where the boots went.
  **Who.** Deserter's mother, veteran, bartender.
  **Tag.** twisted

- **Line.** They promised those people safe passage and then they took the horses, and everybody remembers the order of those two things.
  **Who.** Stable hand, displaced farmer, camp follower.
  **Tag.** twisted

- **Line.** There is a town out there that will sell to you and a town out there that will not, and the second one knows their names.
  **Who.** Traveling salesman, stage driver, innkeeper.
  **Tag.** true

- **Line.** They burned it to keep the paperwork from being read. That is the story. Whether that is true is a different question.
  **Who.** Railroad clerk, arson investigator, local kid.
  **Tag.** twisted

- **Line.** I do not know what they did. I know they were paid and I know a man who drove them is dead.
  **Who.** Bar owner, mechanic, widow.
  **Tag.** twisted

- **Line.** They turned them over at the crossing instead of at the camp. Somebody tell me why that is worse. I still do not know.
  **Who.** Guard, nurse, camp chaplain.
  **Tag.** true

---

## 7. ESCALATING RUMOR CHAINS

Ten stories, each told three times. The calm version is roughly what happened.
The exaggerated version is what happened plus one detail and one number. The
wild version is what the fourth mouth needed it to be.

Use these as a set. A player who hears the calm version in town A and the wild
version in town D, four hundred miles and three weeks later, has learned
something true about the size of this country.

Each chain also names the **tell**, which is the detail that changed. A player
who catches the tell has caught the lie.

### CHAIN 1. The bridge at Redwater

**Calm.**
- **Line.** They took the bridge over the river at Redwater before daylight. The militia got there in the morning and there was nobody left on it.
  **Who.** Ferry operator, mail carrier.
  **Tag.** true

**Exaggerated.**
- **Line.** They took the bridge at Redwater and then the whole county. Four thousand men, and the ferries were still running when they crossed.
  **Who.** Tavern owner, teamster, retired sergeant.
  **Tag.** twisted

**Wild.**
- **Line.** The bridge at Redwater is where it turns. Everybody knows that. Three flags went up on that bridge and nobody on this road is going home.
  **Who.** Kid, preacher, someone repeating the preacher.
  **Tag.** twisted

**Tell:** the wild version turns a tactic into a destiny. Three flags is an
order, not a prophecy.

### CHAIN 2. The granary at Hall's Crossing

**Calm.**
- **Line.** A raider crew took four hundred bushels out of the elevator at Hall's Crossing and it burned coming back.
  **Who.** Elevator hand, farmer, insurance man.
  **Tag.** true

**Exaggerated.**
- **Line.** They took the Hall's elevator and burned the town with it. Nobody was out by morning.
  **Who.** Grocery owner, hired hand, ambulance driver.
  **Tag.** twisted

**Wild.**
- **Line.** Hall's Crossing does not exist anymore and everybody who knows where it was will not say.
  **Who.** Kid, traveling preacher, nervous bartender.
  **Tag.** false

**Tell:** "nobody was out by morning" becomes "nobody lives there." The town is
still there with a rebuilt elevator and a different insurance company.

### CHAIN 3. The order from Chicago

**Calm.**
- **Line.** Somebody in the capital bought two hundred loads of feed on the state's own account without telling the farms.
  **Who.** Grain buyer, elevator operator, farm wife.
  **Tag.** true

**Exaggerated.**
- **Line.** Chicago bought the whole harvest ahead of the farmers. Every elevator in four states is booked to a buyer nobody elected.
  **Who.** Trader, co-op manager, auditor.
  **Tag.** twisted

**Wild.**
- **Line.** They bought the harvest and then they sold it back to us at the price they set. That is the whole system and everybody is in on it.
  **Who.** Angry farmer, road worker, man at the bar.
  **Tag.** twisted

**Tell:** an advance purchase becomes a conspiracy the moment somebody needs a
villain. Check the delivery dates. The buy was forward, the trucks went out,
and somebody did lose money.

### CHAIN 4. The county sheriff's meeting

**Calm.**
- **Line.** Four sheriffs met in a school gym with the section staff about buying a shared parts depot.
  **Who.** Deputy, school janitor, radio talk host.
  **Tag.** true

**Exaggerated.**
- **Line.** Four sheriffs met to split the county map into four fiefs. Each one took his roads and nobody is allowed across.
  **Who.** Bootlegger, hater, courier.
  **Tag.** twisted

**Wild.**
- **Line.** There is a sheriff who walks with two men behind him now, and one of them carries the list of names.
  **Who.** Kid, nervous clerk, informant.
  **Tag.** twisted

**Tell:** the gym meeting had a purchase order and a budget line. Nobody walks
with two men behind them anywhere in the counties involved.

### CHAIN 5. The hospital on Fourth Street

**Calm.**
- **Line.** The power went out at the hospital for two days after the storm and they ran the surgery wing off truck batteries.
  **Who.** Nurse, ambulance driver, orderly.
  **Tag.** true

**Exaggerated.**
- **Line.** Forty people died at Fourth Street because the backup never worked. They covered it up and the funeral home did not ask questions.
  **Who.** Neighbor of the funeral home, grieving family member, talker.
  **Tag.** twisted

**Wild.**
- **Line.** Fourth Street is where they send people when they want them to not come back. It is where the ones from the camps go.
  **Who.** Kid, frightened driver, someone repeating a frightened driver.
  **Tag.** twisted

**Tell:** the wild version turns a power failure into a policy. The batteries
were truck batteries and that is why it worked. Forty deaths and a coverup
would both have papers. Find the papers.

### CHAIN 6. The mine at Alder Creek

**Calm.**
- **Line.** The Alder Creek shaft is running two shifts and hiring, and the crew foreman has been there thirty years.
  **Who.** Miner, supply driver, grocer.
  **Tag.** true

**Exaggerated.**
- **Line.** Alder Creek has doubled its crew and half of them came in from out of state, and nobody asks where they eat.
  **Who.** Miner, townsperson who moved here, waitress.
  **Tag.** twisted

**Wild.**
- **Line.** Alder Creek is running men into the ground on purpose. They are working the old stantage because the new one is finished and there is nobody to replace anybody.
  **Who.** Widow, old miner, drifter.
  **Tag.** twisted

**Tell:** two shifts is not a death sentence for a shaft. The dangerous part is
the word "finished," which is exactly the word the company would use.

### CHAIN 7. The two governors and the pontoon bridge

**Calm.**
- **Line.** Two governors argued in a hotel conference room over who pays to rebuild the pontoon bridge and they agreed to a new bridge instead.
  **Who.** Secretary, hotel clerk, driver.
  **Tag.** true

**Exaggerated.**
- **Line.** The two governors nearly fought. One of them had men staged on the bridge for a week before the meeting.
  **Who.** Deputy, trucker, bar owner.
  **Tag.** twisted

**Wild.**
- **Line.** That bridge is where the war starts. Both sides have their own half and the river belongs to whoever holds the middle.
  **Who.** Kid, preacher, nervous mill worker.
  **Tag.** false

**Tell:** a staredown about a bill is told as a war about a river. The river is
still there. It is not anybody's.

### CHAIN 8. The soldier with the papers

**Calm.**
- **Line.** A soldier came through town with a sealed envelope for the county clerk and refused to say what was in it.
  **Who.** Clerk, gas station attendant, kid.
  **Tag.** true

**Exaggerated.**
- **Line.** There is an order in this county that names people. The clerk read it and then he went home for three days.
  **Who.** Banker, deputy, nervous clerk.
  **Tag.** twisted

**Wild.**
- **Line.** That envelope is a list of names and every name on it is going to be taken out in the night.
  **Who.** Unwashed man at the bar, child, tired mother.
  **Tag.** false

**Tell:** "sealed" is doing all the work. A clerk refusing to talk is usually a
clerk who was told not to talk, which is a much smaller thing.

### CHAIN 9. The loan on the county

**Calm.**
- **Line.** The eastern bank lent the county two million at a rate nobody at the county can pay and everybody at the bank expects.
  **Who.** Treasurer, lawyer, reporter.
  **Tag.** true

**Exaggerated.**
- **Line.** The county is bought. The bank owns the courthouse, the water plant, and the sheriff's department by spring.
  **Who.** Angry taxpayer, county commissioner, union organizer.
  **Tag.** twisted

**Wild.**
- **Line.** Whoever holds that paper owns this county. There is nothing you can do here except work for whoever they send.
  **Who.** Bar owner, teacher, older neighbor.
  **Tag.** twisted

**Tell:** a loan with terms is a loan with terms. "Bought" is a story about
power. Read what is actually collateral.

### CHAIN 10. The car with the flags on it

**Calm.**
- **Line.** An old woman drives a sedan with a flag decal on both doors and she has driven it to every town in four states by herself.
  **Who.** Service station attendant, trucker, diner waitress.
  **Tag.** true

**Exaggerated.**
- **Line.** She has been followed. There is a whole service watching her and she knows all of their names.
  **Who.** Younger driver, deputy's cousin, woman repeating a deputy.
  **Tag.** twisted

**Wild.**
- **Line.** That woman is not alone in that car. There is somebody in the trunk and it is a soldier and he is alive.
  **Who.** Kid, drifter, man telling this at volume.
  **Tag.** false

**Tell:** the escalation in this chain is entirely about adding a passenger. She is
driving by herself and she would be offended to be told otherwise.

---

## 8. HOW THE RUMOR SYSTEM PICKS A LINE

For whoever wires this up.

**Selection order**

1. Filter by `who` matching the speaking NPC's role. A rumor a mechanic says
   should be one a mechanic would say.
2. Filter by region if the chain has a regional anchor. Otherwise any region.
3. Filter by truth state available in the world. If the player just took the
   bridge at Redwater, prefer Chain 1's calm version first, then exaggerated,
   then wild, in that order, and never repeat a version inside the same town.
4. Filter out lines already heard. A player who has heard a rumor once should
   never hear that exact line again unless the world state changed.
5. Pick at random from what survives. Do not weight toward "useful" rumors. The
   useless ones are what make the useful ones believable.

**Timing**

- Player-specific rumors fire on the rumor beat, not on quest completion. The
  town should be talking about what you did two towns ago.
- Chain versions escalate with distance and time, not with repetition. Hearing
  the same story closer to its source gets you closer to the calm version.

**Player correction**

If the player can verify a rumor in the world, they can contradict an NPC.
That is worth doing and it should cost something socially, because the NPC was
not lying. They were repeating.

**Anti-repeat**

Every rumor carries an identity, not just a string, so the system knows it has
been said. Mutating a line is a new rumor, not a new identity.

---

## 9. LINES THAT DO NOT BELONG HERE

Written down so a later addition does not put them in this file by mistake.

- Weather with no story attached. That is townsfolk.md.
- Shop prices with no cause behind them. That is tavern-merchants.md.
- Anything that requires a specific quest to make sense. Rumors are
  standalone.
- Anything where the point of the line is a pun. Nobody gossiping for a laugh.
- Anything where the teller knows they are lying to you on purpose. That is
  an interrogator, not a rumor system.

---

## 10. DECISIONS AND OPEN QUESTIONS

- Rumors are not tied to the `information_trust` field directly. My call is
  that trust gates the *rate* a rumor spreads in a town and does not change its
  truth tag. A town with low trust mutates faster, which means more wild
  versions and fewer calm ones. Noted plainly as a choice, since it was not
  written down anywhere else.
- The `twisted` tag has no machine-readable subtype yet. It needs one, because
  a twisted rumor's distortion type (too many people, wrong unit, wrong place,
  wrong blame, wrong reason) determines how a careful player can recover the
  fact. Recommended six subtypes, left unimplemented on purpose.
- Player reputation rumors assume the player is at least somewhat known. Early
  game the player-specific blocks stay locked and the generic blocks carry the
  load. Whether an unknown player generates its own low-information rumors
  (vaguely "they say somebody did something out west") is unresolved.
- No numbers in this file are simulation values. Where a line mentions a count
  or a percentage it is a person misremembering, and the number is meant to be
  wrong. Real numbers belong in the systems, not in somebody's mouth.