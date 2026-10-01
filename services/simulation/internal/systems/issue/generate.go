// Generation: turning a trigger that is currently true into a request somebody
// has put their name to.
//
// Every function here has the same shape, and the shape is the point. It reads
// a field another system owns, it tests that reading against a threshold, and
// it returns without writing anything at all when the test fails. There is no
// path in this file that produces a request without a reading behind it, and
// the reading is carried into the request's own record, so the Why panel can
// show the player the number their quest is about: "Millbrook has 9 days of
// food left".
//
// The rate at which a passing trigger becomes a request is a probability rather
// than a certainty, and the caps are checked before the draw. Both matter. A
// world where every hungry town raises a request the moment it gets hungry has
// a quest log nobody can read. One where a request appears the instant its
// trigger becomes true has no queue at all, so a player who arrives late finds
// the town already helped by somebody else and learns nothing from it.

package issue

import (
	"math"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// generate offers new issues to notables whose settlement has something true to
// ask about.
func generate(v *sim.View, w *sim.WriteSet) {
	cfg := v.Cfg.Issue
	draws := v.Rng.Derive("issue-generate")
	c := countLive(v.State)
	// The per-settlement count is updated as offers are made, so a town that
	// fills its cap on the first draw is not offered the rest in the same tick.
	live := make(map[int]int, len(c.livePerSettlement))
	for k, n := range c.livePerSettlement {
		live[k] = n
	}

	for _, nid := range v.State.NotableIDs() {
		n := v.State.Notables[nid]
		if n == nil || !n.IsActive {
			continue
		}
		if v.Tick < n.CooldownUntil {
			continue
		}
		if float64(c.openPerNotable[nid]) >= cfg.MaxOpenPerNotable {
			continue
		}
		key := settlementKeyOf(n.TownID, n.VillageID)
		if key < 0 || float64(live[key]) >= cfg.MaxLivePerSettlement {
			continue
		}
		if !draws.Chance(cfg.OfferChancePerDay) {
			continue
		}
		if !offer(v, w, draws, n) {
			continue
		}
		c.openPerNotable[nid]++
		live[key]++

		// A notable who has just asked goes quiet for a while. Without this a
		// person with several triggers that are all true files a request every
		// day, and the open-issue cap becomes the effective rate, which makes
		// the cap a rate rather than the rate being a rate.
		read := "asked for help"
		w.Set(model.KindNotable, nid, "notable_cooldown_until", float64(v.Tick+cooldownDays(v, n)),
			read, nil, "will not ask again for now")
		w.Set(model.KindNotable, nid, "notable_last_offer_tick", float64(v.Tick),
			read, nil, "")
	}
}

// cooldownDays is how long a notable waits after asking before asking again.
//
// It is derived from the notice a request carries rather than being one
// constant, because a request about a larder three days from empty has a short
// fuse and one about a hideout does not. A single constant would either let
// urgent asks repeat daily or make patient asks take a season.
func cooldownDays(v *sim.View, n *model.Notable) int {
	c := v.Cfg.Issue
	base := c.StaleOfferDays / 2
	if base < 1 {
		base = 1
	}
	// A person who matters has more to do and asks less often, which keeps the
	// busiest towns from being monopolised by their most powerful residents.
	return int(base * (1 + 0.5*shared.Clamp01(n.Power)))
}

// offer asks for one request, choosing the kind from what is true.
//
// The kinds are shuffled per notable rather than tried in a fixed order, because
// a fixed order means a town that is starving, criminal, and on a bad road only
// ever asks about food, forever. The shuffle is over a slice local to this call,
// so two notables in one town are not correlated in what they ask about.
func offer(v *sim.View, w *sim.WriteSet, draws *rng.Rng, n *model.Notable) bool {
	kinds := []model.IssueKind{
		model.IssueDeliverGoods,
		model.IssueClearHideout,
		model.IssueEscort,
	}
	for i := len(kinds) - 1; i > 0; i-- {
		j := draws.Intn(i + 1)
		kinds[i], kinds[j] = kinds[j], kinds[i]
	}
	for _, kind := range kinds {
		if !canOffer(n.Role, kind) {
			continue
		}
		if tryOffer(v, w, n, kind) {
			return true
		}
	}
	return false
}

// tryOffer writes one request of one kind if that kind's trigger holds.
func tryOffer(v *sim.View, w *sim.WriteSet, n *model.Notable, kind model.IssueKind) bool {
	switch kind {
	case model.IssueDeliverGoods:
		return offerDeliver(v, w, n)
	case model.IssueClearHideout:
		return offerClearHideout(v, w, n)
	case model.IssueEscort:
		return offerEscort(v, w, n)
	}
	return false
}

// offerDeliver writes a request for food if the settlement is short of it.
//
// The trigger is the food system's own days-of-food figure. This system does
// not decide a town is hungry, and computing a second opinion here would mean
// two systems disagreeing about the same larder. It asks the one that maintains
// it, and if that system says there is food, there is food.
func offerDeliver(v *sim.View, w *sim.WriteSet, n *model.Notable) bool {
	c := v.Cfg.Issue
	days, larder, ok := settlementFood(v, n)
	if !ok {
		return false
	}
	if days >= c.DeliverFoodDaysTrigger {
		return false
	}
	if !hasPeople(v, n) {
		// A settlement with nobody in it is not short of food, it is empty, and
		// there is no one for grain to reach. Its days-of-food reads as zero
		// because the food system divides by a population of zero, which would
		// otherwise make the most desperate larder in the world a place with no
		// one in it at all.
		return false
	}
	// The shortfall in days becomes person-days, so the request is denominated
	// in the food system's own unit rather than in days, and the reward can
	// scale with a quantity that means the same thing in a hamlet and a city.
	shortfallDays := c.DeliverFoodDaysTrigger - days
	if shortfallDays < c.DeliverDays {
		// Never ask for less than a nominal load. A request for a hundredth of a
		// wagon is not worth anybody's trip, and offering one teaches the player
		// that the quest log can be ignored.
		shortfallDays = c.DeliverDays
	}
	amount := shortfallDays * peoplePerDay(v, n)

	build := func(i *model.Issue) {
		i.Amount = amount
		i.Baseline = larder
		i.DeadlineDays = float64(scaledDeadline(v, c.DeliverDeadlineDays, n))
	}
	read := record(model.IssueDeliverGoods, n.ID, amount, days, c.DeliverFoodDaysTrigger)
	writeIssue(v, w, n, model.IssueDeliverGoods, build, read,
		"a short larder, and somebody who needs it fed",
		"offered: "+whole(days)+" days of food left")
	return true
}

// peoplePerDay is how many person-days a settlement eats in a day, which turns a
// shortfall measured in days into one measured in food.
//
// The result is floored at one. The conversion is what makes a request scale
// with the size of the place asking, and a factor of zero would make a
// settlement's request worth nothing however short it was, which is the opposite
// of how the reward is meant to scale.
func peoplePerDay(v *sim.View, n *model.Notable) float64 {
	perHead := v.Cfg.Food.PersonDaysPerPersonDay
	if perHead <= 0 {
		return 1
	}
	if n.TownID >= 0 {
		if t := v.State.Towns[n.TownID]; t != nil {
			return math.Max(1, t.Population*perHead)
		}
		return 1
	}
	if x := v.State.Villages[n.VillageID]; x != nil {
		return math.Max(1, x.Population*perHead)
	}
	return 1
}

// hasPeople reports whether a settlement has anybody in it, which is what makes
// it a place somebody can ask on behalf of.
func hasPeople(v *sim.View, n *model.Notable) bool {
	if n.TownID >= 0 {
		t := v.State.Towns[n.TownID]
		return t != nil && t.Population > 0
	}
	x := v.State.Villages[n.VillageID]
	return x != nil && x.Population > 0
}

// offerClearHideout writes a request to break a criminal network if the town's
// crime has reached the level the hideout system treats as an active one.
//
// The trigger is the same field, at the same threshold, that the hideout system
// reads. That shared reading is the whole reason this request is allowed to
// exist: if crime is high enough for somebody to pay for a hideout being
// cleared, it is high enough for there to be one, and the two can never be true
// in the same town and disagree. Inventing a second crime figure here would
// reopen exactly the seam this avoids.
func offerClearHideout(v *sim.View, w *sim.WriteSet, n *model.Notable) bool {
	c := v.Cfg.Issue
	if !hasPeople(v, n) {
		return false
	}
	if n.TownID < 0 {
		// A village has no hideout of its own, and a headman is not the person
		// who answers for a criminal network. The town's gang boss is.
		return false
	}
	t := v.State.Towns[n.TownID]
	if t == nil || t.Crime < c.ClearHideoutCrimeTrigger {
		return false
	}
	// What is at stake is the size of the network, so the reward scales with how
	// big a thing the taker is being asked to break.
	amount := t.Crime * 100

	build := func(i *model.Issue) {
		i.Amount = amount
		i.Baseline = t.Crime
		i.DeadlineDays = float64(scaledDeadline(v, c.ClearHideoutDeadlineDays, n))
	}
	read := record(model.IssueClearHideout, n.ID, amount, t.Crime, c.ClearHideoutCrimeTrigger)
	writeIssue(v, w, n, model.IssueClearHideout, build, read,
		"a criminal network that has outgrown what the town will tolerate",
		"offered: the network here is at "+whole(t.Crime*100))
	return true
}

// offerEscort writes a request to see a caravan safely along a road if the road
// is unsafe.
//
// The route chosen is the worst one leaving the notable's own town that is short
// and unsafe, not the worst road on the map: a merchant asks about the road they
// use. Choosing globally would let a hamlet's shopkeeper commission an escort
// across a continent, which is not what a request from a person is.
func offerEscort(v *sim.View, w *sim.WriteSet, n *model.Notable) bool {
	c := v.Cfg.Issue
	townID := homeTown(v, n)
	if townID < 0 {
		return false
	}
	route, ok := unsafeRoute(v, townID, c.EscortSafetyTrigger)
	if !ok {
		return false
	}
	// What is at stake is the traffic the road carries, because that is what a
	// safe road is worth to the people who use it, and it is what the reward
	// scales by.
	amount := route.Traffic * 20
	if amount < 1 {
		amount = 1
	}

	build := func(i *model.Issue) {
		i.Amount = amount
		i.Baseline = route.Safety
		i.RouteID = route.ID
		i.TargetID = otherEnd(route, townID)
		i.DeadlineDays = float64(scaledDeadline(v, c.EscortDeadlineDays, n))
	}
	read := record(model.IssueEscort, n.ID, amount, route.Safety, c.EscortSafetyTrigger)
	writeIssue(v, w, n, model.IssueEscort, build, read,
		"a road the caravans are afraid of",
		"offered: the road out of "+homeName(v, n)+" is at "+whole(route.Safety*100))
	return true
}

// homeTown is the town a notable's business is conducted from: their own, or
// the market town a village sells through. It is -1 when both are gone.
func homeTown(v *sim.View, n *model.Notable) int {
	if n.TownID >= 0 {
		return n.TownID
	}
	if x := v.State.Villages[n.VillageID]; x != nil {
		return x.TownID
	}
	return -1
}

// homeName is that town's name, or a placeholder if it is gone.
func homeName(v *sim.View, n *model.Notable) string {
	if t := v.State.Towns[homeTown(v, n)]; t != nil {
		return t.Name
	}
	return "here"
}

// unsafeRoute returns the shortest of the routes out of a town that are unsafe
// enough to be worth an escort.
//
// Shortest rather than worst, because the request is somebody's own journey and
// a merchant will pay for their road rather than for the worst road they have
// heard of. The town ids are walked in ascending order and a strict comparison
// keeps the first at any distance, so the choice is deterministic.
func unsafeRoute(v *sim.View, townID int, trigger float64) (*model.Route, bool) {
	var best *model.Route
	bestD := 0.0
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		if r == nil || (r.TownA != townID && r.TownB != townID) {
			continue
		}
		if r.Safety > trigger {
			continue
		}
		d := v.State.DistanceBetweenTowns(r.TownA, r.TownB)
		if best == nil || d < bestD {
			best, bestD = r, d
		}
	}
	if best == nil {
		return nil, false
	}
	return best, true
}

// otherEnd returns the town at the far end of a route from the given town.
func otherEnd(r *model.Route, tid int) int {
	if r.TownA == tid {
		return r.TownB
	}
	return r.TownA
}

// scaledDeadline gives a request notice proportional to how far the taker has to
// go, so a request from a town four days away is not given the same four days as
// one from next door.
//
// The yardstick is the settlement's own nearest neighbour rather than a world
// size, so the same constants give a sensible notice in a dense region and a
// sparse one without a separate constant per region.
func scaledDeadline(v *sim.View, days float64, n *model.Notable) int {
	townID := homeTown(v, n)
	if townID < 0 || v.Cfg.March.SpeedPerDay <= 0 {
		return int(days)
	}
	nearest := nearestOther(v, townID)
	if nearest < 0 {
		return int(days)
	}
	legDays := v.State.DistanceBetweenTowns(townID, nearest) / v.Cfg.March.SpeedPerDay
	if legDays < 1 {
		legDays = 1
	}
	return int(days + legDays)
}

// nearestOther returns the closest other town to one, or -1 if it is alone.
func nearestOther(v *sim.View, townID int) int {
	best := -1
	bestD := 0.0
	for _, tid := range v.State.TownIDs() {
		if tid == townID {
			continue
		}
		d := v.State.DistanceBetweenTowns(townID, tid)
		if best < 0 || d < bestD {
			best, bestD = tid, d
		}
	}
	return best
}

// settlementFood returns a settlement's days of food and the size of its larder,
// and reports false if the settlement is gone.
//
// The larder is carried as well as the days because the two are not the same
// question. Days is the trigger, a ratio the food system recomputes every tick.
// The larder is the baseline an objective is later measured from, and it is
// what a request is actually about.
func settlementFood(v *sim.View, n *model.Notable) (days, larder float64, ok bool) {
	if n.TownID >= 0 {
		t := v.State.Towns[n.TownID]
		if t == nil {
			return 0, 0, false
		}
		return t.FoodDays, t.FoodStock, true
	}
	x := v.State.Villages[n.VillageID]
	if x == nil {
		return 0, 0, false
	}
	return villageFoodDays(v, x), x.Food, true
}

// writeIssue creates a request, fully built, and records the offer.
//
// The entity is constructed whole inside the create rather than being written
// field by field, for two reasons. The identifier has to be allocated at commit
// time, because a number guessed during the tick could collide with one another
// systems guess. And a request is a fact rather than an accumulation: a larder
// at zero with a baseline of zero is a request for nothing, and writing it as a
// series of additions would have it pass through states that never existed.
func writeIssue(v *sim.View, w *sim.WriteSet, n *model.Notable, kind model.IssueKind, build func(*model.Issue), read, note, opening string) {
	c := v.Cfg.Issue
	i := &model.Issue{
		ID:          -1,
		Kind:        kind,
		NotableID:   n.ID,
		TownID:      n.TownID,
		VillageID:   n.VillageID,
		TargetID:    -1,
		RouteID:     -1,
		State:       model.IssueOffered,
		AcceptorID:  -1,
		StartedTick: -1,
		// An offer carries a deadline like any other request, and it is the one
		// that stops an untaken offer lingering forever. It is replaced with a
		// notice to the taker if somebody takes it up, because a deadline should
		// only start running against somebody who agreed to be bound by it.
		DeadlineTick: v.Tick + int(c.StaleOfferDays),
	}
	build(i)
	// The reward is set at offer time rather than at resolution, so what a
	// player is being offered is a figure they can see and be held to. It is
	// also scaled and capped here, once, so the figure in the quest log is the
	// figure that would be paid.
	priceReward(v, i, n)

	w.CreateEntity(func(s *model.State) {
		i.ID = s.NewID(model.IDIssue)
		i.Steps = append(i.Steps, model.IssueStep{
			Tick:  v.Tick,
			Text:  opening,
			State: model.IssueOffered,
		})
		s.Issues[i.ID] = i
	})

	// The notable's open count goes up by a real, logged write, so the moment a
	// request appears in the world is an event in the cause log rather than only
	// a new row in a list.
	w.Add(model.KindNotable, n.ID, "notable_open_issues", 1, read,
		v.Log.RecentFor(model.KindNotable, n.ID, []string{"notable_grievance", "notable_power"}, 2),
		note+", asked by "+n.Name)
}

// priceReward sets what a request is worth, scaled by what is at stake and by
// how much the asker matters.
//
// The money is capped at a share of the settlement's treasury, so a request from
// a bankrupt town promises less rather than a sum it cannot pay. A town that
// cannot afford the reward has a real problem, and inflating the offer anyway
// would make the reward scale the wrong way round: the worse off the asker, the
// more they would be paying.
func priceReward(v *sim.View, i *model.Issue, n *model.Notable) {
	c := v.Cfg.Issue
	power := 1 + c.RelationShare*shared.Clamp01(n.Power)
	i.RewardMoney = c.RewardMoneyPerUnit * i.Amount * power
	i.RewardGold = c.RewardGoldPerUnit * i.Amount * power
	i.RewardRenown = c.RewardRenownPerUnit * i.Amount * power
	i.RewardRelation = c.RewardRelation * power

	treasury := settlementMoney(v, n)
	if treasury <= 0 {
		i.RewardMoney = 0
		return
	}
	if limit := treasury * c.RewardMoneyShare; i.RewardMoney > limit {
		i.RewardMoney = limit
	}
}

// settlementMoney is the money a settlement can promise out of, or zero if it
// has none. A village has no chest of its own, so a headman's request is paid
// out of the market town they sell through.
func settlementMoney(v *sim.View, n *model.Notable) float64 {
	if t := v.State.Towns[homeTown(v, n)]; t != nil {
		return t.Money
	}
	return 0
}
