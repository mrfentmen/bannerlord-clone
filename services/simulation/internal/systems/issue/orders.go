// Orders: a player taking a request, and a player reporting one finished.
//
// Both arrive as data through View.Orders, the same queue every other player
// action uses, so there is no code path in which a human and a scripted profile
// behave differently. Neither order is a command that something happens because:
// OrderAcceptIssue asks whether the request can be taken, and OrderCompleteIssue
// asks whether the objective was met. This system answers both by reading the
// world, which is what stops a claim from being a promise.
//
// An order that cannot be honoured produces no write at all, exactly as a
// recruit order from a broke ruler does. Refusing quietly is deliberate: the
// cause log records changes to state, and a refusal is not a change to state.
// What it does produce is nothing, which is the correct outcome for an order
// that named something which does not exist or which somebody else already has.

package issue

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// orders applies this tick's issue orders.
//
// Acceptance runs before the measuring phase so an issue taken this tick is
// measured against the world as it was when the order was issued, rather than
// sitting unmeasured for a day. That is the same snapshot every other system
// read, and it is what makes accepting an issue a decision the taker can
// inspect rather than a race with the clock.
//
// taken is the set of requests this tick's queue has already bound, and it is
// not an optimisation. Staged writes are not committed until the engine applies
// them, so a second order naming the same request in the same queue still sees
// the request on offer. Without this, two rulers issuing acceptance in one
// tick's orders would both be recorded as answerable for one load of grain, and
// the engine would reject the tick as order-dependent rather than the second
// ruler being told the job was gone.
// It returns the set of requests carrying a completion claim that was honoured,
// which is the only authority the measuring phase has to settle one.
func orders(v *sim.View, w *sim.WriteSet) map[int]bool {
	taken := map[int]bool{}
	claimed := map[int]bool{}
	for _, o := range v.Orders {
		switch o.Kind {
		case sim.OrderAcceptIssue:
			if taken[o.Target] {
				continue
			}
			if accept(v, w, o) {
				taken[o.Target] = true
			}
		case sim.OrderCompleteIssue:
			if complete(v, w, o) {
				claimed[o.Target] = true
			}
		}
	}
	return claimed
}

// accept takes an offered request for a ruler.
//
// The order names the request in Target and the ruler in LeaderID, and the ruler
// is the one who becomes answerable for it. Four things are checked before
// anything is written, and each is a reason a request might be refused:
//
//   - it exists and is still on offer, and has not already been bound by an
//     earlier order in this same queue. An offer that lapsed yesterday cannot be
//     taken today, or a request would come back from the dead.
//   - its asker is still in the roster. A request whose asker has left has
//     nobody to pay or to penalise, so making the taker answerable to nobody
//     would be a debt with no creditor.
//   - the taker is alive.
//   - the taker has somebody to send. A request nobody can carry is not worth
//     taking, and accepting it would start a deadline ticking against something
//     that could never be met.
//
// It reports whether the request was taken, so the caller can stop offering it
// to anybody else in the same queue.
func accept(v *sim.View, w *sim.WriteSet, o sim.Order) bool {
	i := v.State.Issues[o.Target]
	if i == nil || i.State != model.IssueOffered {
		return false
	}
	n := v.State.Notables[i.NotableID]
	if n == nil || !n.IsActive {
		return false
	}
	r := v.State.Leaders[o.LeaderID]
	if r == nil || !r.IsAlive {
		return false
	}
	p := partyOf(v, r)
	if p == nil || p.Troops <= 0 {
		return false
	}

	// The baseline is captured now, not at offer time, because the objective is
	// a change and a change is measured from the moment somebody became
	// answerable for it. A larder that recovered while the request sat on offer
	// has not been helped by the taker, and paying for it would make every
	// request in a busy world collectable by waiting.
	baseline := objectiveBaseline(v, i)
	deadline := v.Tick + int(i.DeadlineDays)

	read := shared.ReadString(
		shared.PairI("issue", i.ID),
		shared.PairI("notable", n.ID),
		shared.PairI("kind", int(i.Kind)),
		shared.PairF("at_stake", i.Amount),
		shared.PairF("reading_now", baseline),
	)
	causes := v.Log.RecentFor(model.KindIssue, i.ID, []string{"issue_state", "issue_kind"}, 2)

	w.Set(model.KindIssue, i.ID, "issue_state", float64(model.IssueAccepted), read, causes,
		n.Name+" put the player to it")
	w.Set(model.KindIssue, i.ID, "issue_acceptor", float64(r.ID), read, causes, "")
	w.Set(model.KindIssue, i.ID, "issue_baseline", baseline, read, causes,
		"the state the taker is answerable from")
	w.Set(model.KindIssue, i.ID, "issue_started_tick", float64(v.Tick), read, causes, "")
	w.Set(model.KindIssue, i.ID, "issue_progress", 0, read, causes, "")
	// The notice starts when the taker takes it up rather than when the request
	// was made, so an offer that sat unclaimed for a month does not arrive
	// already overdue.
	w.Set(model.KindIssue, i.ID, "issue_deadline_tick", float64(deadline), read, causes,
		"notice given: "+whole(i.DeadlineDays)+" days")
	w.RecordIssueStep(i.ID, model.IssueStep{
		Tick:  v.Tick,
		State: model.IssueAccepted,
		Text:  "accepted by ruler #" + itoa(r.ID) + " with " + whole(i.DeadlineDays) + " days to do it",
	})

	// Taking a request is itself a reason to be aggrieved less: somebody has
	// finally answered, and the person who asked stops counting the days.
	w.Add(model.KindNotable, n.ID, "notable_grievance", -v.Cfg.Issue.NotableGriefPerIgnoredDay*float64(i.DeadlineDays),
		read, causes, "the player took it up")

	dispatch(v, w, i, p, read, causes)
	return true
}

// complete is the OrderCompleteIssue handler: the taker says the job is done and
// the world is asked whether it is.
//
// The order carries the ruler in LeaderID as well as the request in Target, and
// the two must agree. Without that check any ruler could close anybody else's
// request, and a scripted profile driving one court would be settling the
// affairs of every court on the map.
//
// The claim itself decides nothing. This function has no way to succeed a
// request; it only records that a claim was made, and the measuring phase asks
// the world. That split is the whole of the "a claim is checked" rule.
//
// It reports whether the claim was honoured. A claim that failed its checks
// returns false and is not passed to the measuring phase, which matters: the
// request is still measured and can still lapse, but a ruler who was not the
// taker cannot bring its deadline forward by naming it in an order.
func complete(v *sim.View, w *sim.WriteSet, o sim.Order) bool {
	i := v.State.Issues[o.Target]
	if i == nil || i.State != model.IssueAccepted {
		return false
	}
	if i.AcceptorID != o.LeaderID {
		return false
	}
	if r := v.State.Leaders[o.LeaderID]; r == nil || !r.IsAlive {
		return false
	}
	w.RecordIssueStep(i.ID, model.IssueStep{
		Tick:  v.Tick,
		State: model.IssueAccepted,
		Text:  "reported done by ruler #" + itoa(o.LeaderID),
	})
	return true
}

// partyOf returns the party a ruler leads, or nil.
//
// A ruler's own PartyID is tried first and the roster is scanned only if that
// is empty or dangling, because a generated party sometimes carries no back
// reference and the scan is the only way to find it.
func partyOf(v *sim.View, r *model.Leader) *model.Party {
	if p := v.State.Parties[r.PartyID]; p != nil {
		return p
	}
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p != nil && p.LeaderID == r.ID {
			return p
		}
	}
	return nil
}

// dispatch points the taker's party at the objective and loads it, where the
// objective is goods.
//
// A delivery is the only kind where the party has to be carrying something when
// it sets out, so it is the only one that stages a load. The load comes out of
// the party's own larder, which is what makes accepting a delivery a cost
// rather than a favour: the food the settlement needs is food the taker does not
// eat this month, and a player with an empty hold takes the job knowing they
// have to buy the grain on the way.
func dispatch(v *sim.View, w *sim.WriteSet, i *model.Issue, p *model.Party, read string, causes []int) {
	target := objectiveTown(v, i)
	t := v.State.Towns[target]
	if t == nil {
		return
	}
	w.Set(model.KindParty, p.ID, "activity", float64(model.ActMarching), read, causes, "on an issue")
	w.Set(model.KindParty, p.ID, "dest_town", float64(target), read, causes, "")
	w.Set(model.KindParty, p.ID, "dest_x", t.X, read, causes, "")
	w.Set(model.KindParty, p.ID, "dest_y", t.Y, read, causes, "")

	if i.Kind != model.IssueDeliverGoods {
		return
	}
	load := i.Amount
	have := p.Food
	if load > have {
		// The party cannot carry more than it has. Taking the request with an
		// empty hold is allowed, because a player may be about to buy the grain
		// on the way; what is not allowed is staging a load that is not aboard.
		load = have
	}
	if load <= 0 {
		return
	}
	loadRead := shared.ReadString(
		shared.PairF("loading", load),
		shared.PairF("larder", have),
		shared.PairF("asked_for", i.Amount),
	)
	w.Add(model.KindParty, p.ID, "party_food", -load, loadRead, causes, "loaded for a delivery")
	w.Set(model.KindParty, p.ID, "cargo_food", load, loadRead, causes, "carrying a delivery")
}

// objectiveTown is the town a party's objective is at, or -1.
//
// A delivery's objective is the settlement that asked, resolved to the town that
// can receive the load: a village has no larder a cart can reach and no market
// to receive it, and routing the load to the market town is where the food
// system would put it anyway. A hideout's objective is the town the asker is
// in. An escort's objective is the far end of the road, because seeing a caravan
// through means walking it the whole way rather than standing at the near end
// watching it leave.
func objectiveTown(v *sim.View, i *model.Issue) int {
	switch i.Kind {
	case model.IssueDeliverGoods:
		return homeTownOf(v, i)
	case model.IssueClearHideout:
		return i.TownID
	case model.IssueEscort:
		return i.TargetID
	}
	return -1
}

// homeTownOf is the town a request's settlement does its business through, and
// -1 when both the settlement and its market town are gone.
func homeTownOf(v *sim.View, i *model.Issue) int {
	if i.TownID >= 0 {
		return i.TownID
	}
	if x := v.State.Villages[i.VillageID]; x != nil {
		return x.TownID
	}
	return -1
}

// objectiveBaseline is the reading an objective is measured from, captured at
// the moment somebody became answerable for it.
//
// It is the larder for a delivery, the crime for a hideout, and the road's
// safety for an escort: in each case the one field whose movement is the thing
// being asked for. One field per kind is what lets progress be a single number
// while the kind still chooses what that number means.
func objectiveBaseline(v *sim.View, i *model.Issue) float64 {
	reading, ok := objectiveReading(v, i)
	if !ok {
		return 0
	}
	return reading
}

// objectiveReading is the current value of the field an objective is measured
// against, and false if the thing being measured is gone.
//
// A vanished objective is not zero progress; it is no longer measurable, and the
// caller treats that as a request that can no longer be served.
func objectiveReading(v *sim.View, i *model.Issue) (float64, bool) {
	switch i.Kind {
	case model.IssueDeliverGoods:
		_, larder, ok := issueFood(v, i)
		return larder, ok
	case model.IssueClearHideout:
		t := v.State.Towns[i.TownID]
		if t == nil {
			return 0, false
		}
		return t.Crime, true
	case model.IssueEscort:
		r := v.State.Routes[i.RouteID]
		if r == nil {
			return 0, false
		}
		return r.Safety, true
	}
	return 0, false
}

// issueFood returns a request's settlement's days of food and its larder.
func issueFood(v *sim.View, i *model.Issue) (days, larder float64, ok bool) {
	if i.TownID >= 0 {
		t := v.State.Towns[i.TownID]
		if t == nil {
			return 0, 0, false
		}
		return t.FoodDays, t.FoodStock, true
	}
	x := v.State.Villages[i.VillageID]
	if x == nil {
		return 0, 0, false
	}
	return villageFoodDays(v, x), x.Food, true
}

// atObjective reports whether a party has arrived where the request must be
// carried out.
//
// The test is the distance to the town rather than an exact coordinate match,
// because a party that has marched its last leg ends the tick a little short of
// the gate and a party whose order was accepted while it stood in the square
// never left. Within a league is "there" for a request measured in days.
func atObjective(v *sim.View, i *model.Issue, p *model.Party) bool {
	t := v.State.Towns[objectiveTown(v, i)]
	if t == nil {
		return false
	}
	dx := t.X - p.X
	dy := t.Y - p.Y
	const arrived = 1.0
	return dx*dx+dy*dy <= arrived*arrived
}
