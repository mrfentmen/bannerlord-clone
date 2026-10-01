// Measuring and closing: checking an accepted request against the world, and
// ending it one way or the other.
//
// Progress is recomputed from committed state every tick and never advanced by a
// player's say-so. That is the difference between a quest framework and a
// counter that goes up when you click: a delivery made by somebody else's
// caravan counts, because the settlement's larder really is fuller, and a claim
// made without the goods does not, because the larder really is not.
//
// A request ends in exactly three ways, and each is a state change somebody can
// be shown:
//
//	served     the objective was met and the taker said so
//	abandoned  the taker said it was done and it was not, which is a claim the
//	           world refuses and a cost the taker pays
//	expired    the notice ran out with the objective unmet, or nobody ever
//	           took the offer up
//
// All three go through close, so a reward is paid and a penalty applied by one
// function rather than three, and no path can pay twice or forget to charge.

package issue

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// measureAndClose measures every live request and ends the ones that are over.
//
// claimed is the set of requests carrying a completion claim that the order
// phase honoured. A claimed request is settled here rather than in the order
// phase so the world gets asked the question, and it is then excluded from the
// deadline test so a request cannot be paid and failed in the same tick.
func measureAndClose(v *sim.View, w *sim.WriteSet, claimed map[int]bool) {
	// settled is the set of requests this phase has already written a state
	// change for. The engine rejects two absolute writes to one field in one
	// tick, so a guard is not defensive coding: it is what keeps a request from
	// being resolved twice when two of its closing conditions hold at once.
	settled := map[int]bool{}

	for _, iid := range v.State.IssueIDs() {
		i := v.State.Issues[iid]
		if i == nil {
			continue
		}
		n := v.State.Notables[i.NotableID]
		if n == nil || !n.IsActive {
			// A request whose asker has retired can no longer be served, and
			// letting it lapse quietly would be the one way a world with no
			// player could avoid the cost of ignoring people. It is closed and
			// the notable's own state records it.
			if isLive(i) {
				closeFailed(v, w, i, n, "the person who asked is no longer here", false, settled)
			}
			continue
		}
		switch i.State {
		case model.IssueOffered:
			if i.DeadlineTick >= 0 && v.Tick > i.DeadlineTick {
				closeFailed(v, w, i, n, "nobody took it up", true, settled)
			}
		case model.IssueAccepted:
			advance(v, w, i, n, claimed[iid], settled)
		}
	}
}

// isLive reports whether a request is still outstanding.
func isLive(i *model.Issue) bool {
	return i.State == model.IssueOffered || i.State == model.IssueAccepted
}

// advance measures an accepted request, delivers what the party is carrying if
// it has arrived, and closes the request if it is over.
func advance(v *sim.View, w *sim.WriteSet, i *model.Issue, n *model.Notable, claimed bool, settled map[int]bool) {
	// The taker has to still be alive. A ruler who died mid-request did not fail
	// it, and charging the person who asked for a dead man's betrayal would be
	// the simulation inventing an offence nobody committed.
	r := v.State.Leaders[i.AcceptorID]
	if r == nil || !r.IsAlive {
		closeFailed(v, w, i, n, "the person who took it is gone", false, settled)
		return
	}
	p := partyOf(v, r)
	if p != nil && i.Kind == model.IssueDeliverGoods && p.CargoFood > 0 && atObjective(v, i, p) {
		land(v, w, i, p)
	}

	progress(v, w, i)
	met := objectiveMet(v, i)
	over := i.DeadlineTick >= 0 && v.Tick > i.DeadlineTick

	switch {
	case claimed:
		if met {
			closeServed(v, w, i, n, "the taker reported it done", settled)
			return
		}
		// The claim is refused. The request is not paid and not held open
		// forever: a taker who says an unfinished job is finished has abandoned
		// it, and pays the price of saying so. Letting it run on would make
		// reporting a finished job free and optional.
		closeFailed(v, w, i, n, "reported done without the work being done", true, settled)
	case met && over:
		// The objective was met, but too late to count, and nobody claimed it in
		// the meantime. The settlement is helped and the taker is not paid: late
		// is late, and paying for arriving after the fact would make the notice
		// a suggestion.
		closeFailed(v, w, i, n, "done too late to count", true, settled)
	case !met && over:
		closeFailed(v, w, i, n, "the notice ran out", true, settled)
	}
}

// progress recomputes how far an accepted request's objective is met and writes
// it if it moved.
//
// It is the share of the way from the baseline to the target that the world has
// moved, clamped at one because a town can be fed far beyond what was asked for
// and the excess is the food system's business rather than this system's.
func progress(v *sim.View, w *sim.WriteSet, i *model.Issue) {
	c := v.Cfg.Issue
	reading, ok := objectiveReading(v, i)
	if !ok {
		return
	}
	var p float64
	switch i.Kind {
	case model.IssueDeliverGoods:
		// Measured on the larder, against the shortfall the request was raised
		// for. The tolerance is below one, so a larder that recovered on its own
		// while the party walked there is not credited with a delivery.
		want := i.Amount * c.DeliverTolerance
		if want <= 0 {
			p = 0
		} else {
			p = shared.Share(reading-i.Baseline, want)
		}
	case model.IssueClearHideout:
		// Crime is measured downward, so the distance travelled is the crime that
		// has come off rather than the crime that is left. A town already below
		// the target when the taker set out has nothing left to prove, and the
		// reading has gone the wrong way for progress at all.
		if reading >= i.Baseline {
			p = 0
			break
		}
		p = shared.Share(i.Baseline-reading, i.Baseline-c.ClearHideoutCrimeTarget)
	case model.IssueEscort:
		// The road has to get safer by the amount the request named. A party
		// that merely walked the route has done this by accident at best.
		p = shared.Share(reading-i.Baseline, c.EscortSafetyTarget-i.Baseline)
	}
	p = shared.Clamp01(p)
	if p == i.Progress {
		return
	}
	read := shared.ReadString(
		shared.PairI("issue", i.ID),
		shared.PairI("kind", int(i.Kind)),
		shared.PairF("reading", reading),
		shared.PairF("baseline", i.Baseline),
		shared.PairF("at_stake", i.Amount),
	)
	w.Set(model.KindIssue, i.ID, "issue_progress", p, read,
		v.Log.RecentFor(model.KindIssue, i.ID, []string{"issue_state", "issue_deadline_tick"}, 2),
		kindName(i.Kind)+" #"+itoa(i.ID)+" is at "+whole(p*100)+" of its way")
}

// objectiveMet is the whole completion test for a request: did the thing that
// was asked for actually happen.
//
// It is a separate function from progress on purpose. Progress is one number the
// quest log shows, and it is the wrong place for a second condition: an escort
// that has raised a road's safety is visibly most of the way through, and saying
// it is at half while the bandits are still there is true in a way a player can
// act on. Whether that counts as done is a rule about the objective, and it lives
// here with the other objective rules.
func objectiveMet(v *sim.View, i *model.Issue) bool {
	c := v.Cfg.Issue
	switch i.Kind {
	case model.IssueDeliverGoods:
		reading, ok := objectiveReading(v, i)
		if !ok {
			return false
		}
		return reading >= i.Baseline+i.Amount*c.DeliverTolerance
	case model.IssueClearHideout:
		reading, ok := objectiveReading(v, i)
		if !ok {
			return false
		}
		return reading <= c.ClearHideoutCrimeTarget
	case model.IssueEscort:
		r := v.State.Routes[i.RouteID]
		if r == nil {
			return false
		}
		// Two things have to be true of an escorted road: it is safer, and the
		// men on it are broken up. Protecting a road means attacking the bandits
		// on it rather than walking about on it, so a taker who merely
		// accompanied the caravan has not done the second half.
		return r.Safety >= c.EscortSafetyTarget && r.Raiders <= c.EscortRaidersCleared
	}
	return false
}

// land turns a party's cargo into food at the destination it was delivered to.
//
// The load goes into the destination's arriving field rather than straight into
// the larder, because that field is the seam the food system already reads: a
// load in transit is not a load in a larder, and writing past the seam would
// make a delivery arrive on the tick it was loaded however far the party walked.
func land(v *sim.View, w *sim.WriteSet, i *model.Issue, p *model.Party) {
	t := v.State.Towns[objectiveTown(v, i)]
	if t == nil {
		return
	}
	load := p.CargoFood
	read := shared.ReadString(
		shared.PairI("issue", i.ID),
		shared.PairF("load", load),
		shared.PairF("food_days", t.FoodDays),
		shared.PairF("asked_for", i.Amount),
	)
	causes := v.Log.RecentFor(model.KindParty, p.ID, []string{"cargo_food"}, 2)
	w.Add(model.KindParty, p.ID, "cargo_food", -load, read, causes, "the load came off the cart")
	w.Add(model.KindTown, t.ID, "arriving_cargo_food", load, read, causes,
		"a delivery landed at "+t.Name)
	w.RecordIssueStep(i.ID, model.IssueStep{
		Tick:  v.Tick,
		State: model.IssueAccepted,
		Text:  "delivered " + whole(load) + " to " + t.Name,
	})
}

// closeServed pays a request and writes what serving it did to the world.
func closeServed(v *sim.View, w *sim.WriteSet, i *model.Issue, n *model.Notable, why string, settled map[int]bool) {
	if settled[i.ID] {
		return
	}
	settled[i.ID] = true

	read := shared.ReadString(
		shared.PairI("issue", i.ID),
		shared.PairF("at_stake", i.Amount),
		shared.PairF("progress", i.Progress),
		shared.PairF("reward_money", i.RewardMoney),
	)
	causes := v.Log.RecentFor(model.KindIssue, i.ID, []string{"issue_state", "issue_baseline", "issue_deadline_tick"}, 3)

	w.Set(model.KindIssue, i.ID, "issue_state", float64(model.IssueSucceeded), read, causes, why)
	w.RecordIssueStep(i.ID, model.IssueStep{
		Tick: v.Tick, State: model.IssueSucceeded, Text: why,
	})

	pay(v, w, i, read, causes)

	// The notable is better disposed towards the taker and their grievance is
	// spent. A person who was answered stops counting the days.
	w.Add(model.KindNotable, n.ID, "notable_relation", i.RewardRelation, read, causes,
		"the request was served")
	w.Add(model.KindNotable, n.ID, "notable_grievance", -shared.Clamp01(n.Grievance), read, causes,
		"nothing left to brood about")

	relief(v, w, i, n, true, read, causes)
}

// closeFailed ends a request that was not served.
//
// charge says whether the asker should be held responsible. It is false in
// exactly one case: nobody was at fault. An offer nobody took and a request whose
// taker died are both the world failing to connect a person to a job rather than
// a person declining one, and holding the asker to account for either would make
// the simulation invent an offence nobody committed.
//
// Where the taker did take the job up and did not do it, the penalty lands on
// the notable's opinion, which is where the cost of being ignored belongs, and
// the settlement takes a smaller share of the grievance because a town's
// patience is not the same thing as one man's. Nothing is ever paid out: there is
// no negative reward, because a failed request did not cost the taker money, it
// cost them the road to a town that still needs help.
func closeFailed(v *sim.View, w *sim.WriteSet, i *model.Issue, n *model.Notable, why string, charge bool, settled map[int]bool) {
	if settled[i.ID] {
		return
	}
	settled[i.ID] = true
	c := v.Cfg.Issue

	read := shared.ReadString(
		shared.PairI("issue", i.ID),
		shared.PairF("at_stake", i.Amount),
		shared.PairF("progress", i.Progress),
		shared.PairI("acceptor", i.AcceptorID),
	)
	causes := v.Log.RecentFor(model.KindIssue, i.ID, []string{"issue_state", "issue_progress", "issue_deadline_tick"}, 3)

	w.Set(model.KindIssue, i.ID, "issue_state", float64(model.IssueFailed), read, causes, why)
	w.RecordIssueStep(i.ID, model.IssueStep{
		Tick: v.Tick, State: model.IssueFailed, Text: why,
	})

	if !charge {
		// The step log above records it and the settlement's own systems will
		// read the consequence of an unfulfilled request soon enough, so the
		// notable is left alone. Their grievance does not move either: a person
		// does not brood about a taker they never had.
		return
	}
	// An offer nobody took is nobody's betrayal, so it costs the asker patience
	// rather than opinion. Charging an absent player for declining a job would
	// invent an obligation that was never accepted, and would make a world with
	// no player punish its own quiet.
	if i.AcceptorID < 0 {
		w.Add(model.KindNotable, n.ID, "notable_grievance", c.NotableGriefPerIgnoredDay*float64(c.StaleOfferDays),
			read, causes, "nobody came")
		return
	}
	w.Add(model.KindNotable, n.ID, "notable_relation", -c.AbandonRelationPenalty, read, causes, why)
	w.Add(model.KindNotable, n.ID, "notable_grievance", c.AbandonRelationPenalty, read, causes,
		"still owed help")
	relief(v, w, i, n, false, read, causes)
}

// pay writes the money, gold, and renown a served request earned.
//
// The money comes out of the settlement that promised it and into the taker's
// party purse, so a request that was affordable when it was made and is not
// affordable now pays what is left rather than creating money. Renown lands on
// the ruler either way, because renown is a fact about a person rather than
// about where they are standing, and a ruler with no party still did the work.
func pay(v *sim.View, w *sim.WriteSet, i *model.Issue, read string, causes []int) {
	if i.AcceptorID < 0 {
		return
	}
	r := v.State.Leaders[i.AcceptorID]
	if r == nil {
		return
	}
	p := partyOf(v, r)
	if p != nil && i.RewardMoney > 0 {
		if from := payer(v, i); from != nil {
			// A promise is a promise up to what the payer has, so the amount
			// actually moved is whatever is left rather than the figure that was
			// offered, and the shortfall is the town's problem, not the taker's.
			payable := i.RewardMoney
			if from.Money < payable {
				payable = from.Money
			}
			if payable > 0 {
				w.Add(model.KindTown, from.ID, "money", -payable, read, causes,
					"paid for "+describe(i))
				w.Add(model.KindParty, p.ID, "party_money", payable, read, causes,
					"paid for "+describe(i))
			}
		}
	}
	if i.RewardGold > 0 {
		w.Add(model.KindLeader, i.AcceptorID, "gold", i.RewardGold, read, causes,
			"paid for "+describe(i))
	}
	w.Add(model.KindLeader, i.AcceptorID, "renown", i.RewardRenown, read, causes,
		"served "+describe(i))
}

// payer is the settlement whose chest pays out, or nil if it has gone. A village
// headman's request is paid from the market town, because a village has no
// treasury of its own to promise from.
func payer(v *sim.View, i *model.Issue) *model.Town {
	return v.State.Towns[homeTownOf(v, i)]
}

// relief is what serving or failing a request does to the settlement that asked.
//
// A served request is worth something to a town's loyalty and unrest, because
// somebody influential in it got what they wanted and the town can see it. A
// failed one costs a little, because the same person is now unhappy and the town
// can see that too. The effect is scaled by the notable's power for the same
// reason the reward is: a headman who was ignored is a different amount of bad
// news than a shopkeeper.
func relief(v *sim.View, w *sim.WriteSet, i *model.Issue, n *model.Notable, served bool, read string, causes []int) {
	t := payer(v, i)
	if t == nil {
		return
	}
	power := shared.Clamp01(n.Power)
	if served {
		w.Add(model.KindTown, t.ID, "loyalty", 0.02*power, read, causes,
			"an influential person was answered")
		w.Add(model.KindTown, t.ID, "unrest", -0.01*power, read, causes,
			"a grievance was settled")
		return
	}
	w.Add(model.KindTown, t.ID, "unrest", 0.015*power, read, causes,
		"an influential person was left waiting")
	w.Add(model.KindTown, t.ID, "loyalty", -0.01*power, read, causes,
		"the town is short of an answer")
}
