// Package council decides who holds a town, and lets a side lose provinces.
//
// Reads loyalty, unrest, the days those have persisted, and the state of the
// rulers who could replace the holder, and writes the holder. It is the last
// step of chain 1 and the first of chain 6's political half.
//
// The system never reads "the game wants the player to lose", per
// CAUSE_EFFECT.md section 3. A vote needs loyalty below a threshold, unrest
// above another, and both persisting for a set number of days. Three conditions
// and a delay is why a vote is a consequence rather than a punishment.
package council

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the council system.
func System() sim.System {
	return sim.System{
		Name: "council",
		Doc:  "votes the holder out when loyalty stays low and unrest stays high, and lets sides lose provinces",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t.Population <= 0 {
			continue
		}

		// How long the town has been in this condition. The counter is the
		// delay mechanism: a bad week does not unseat anyone, which is what
		// TESTING_AND_BALANCE.md section 4 asks for.
		discontented := t.Loyalty < c.Council.VoteThreshold && t.Unrest > c.Council.UnrestRequired
		days := t.DaysBelowLoyalty
		if discontented {
			days++
		} else {
			days = 0
		}
		w.Set(model.KindTown, id, "days_below_loyalty", days,
			shared.ReadString(
				shared.Pair("loyalty", t.Loyalty),
				shared.Pair("unrest", t.Unrest)),
			v.Log.RecentFor(model.KindTown, id, []string{"loyalty", "unrest"}, 3), "")

		if !discontented || days < c.Council.DaysBelowThreshold {
			w.Set(model.KindTown, id, "vote_chance", 0, "conditions not met", nil, "")
			continue
		}

		// --- the council ---
		// A council is the town's own notables, plus officers of the holding
		// side who have a stake in it. Its mood is the town's mood, filtered
		// through whether they would defend the status quo.
		//
		// Each councilor's inclination is their own unrest minus their own
		// loyalty to the incumbent. A town full of people who hate the ruler
		// produces a council that votes against them; a town where the people
		// are unhappy but the council is loyal does not, which is why loyalty
		// and unrest are tracked separately.
		quorum := shared.Clamp01(t.Unrest*c.Council.CouncilorUnrestWeight) +
			shared.Clamp01(t.Loyalty)*c.Council.CouncilorLoyaltyWeight
		quorum = shared.Clamp(quorum*c.Council.QuorumShare, 0, 1)

		// The chance the vote passes rises with how angry the town is and how
		// long this has been going on, but stays bounded so an outcome is never
		// guaranteed. A random roll decides a vote that has already been earned
		// by the state, which is not the anti-pattern CAUSE_EFFECT section 7
		// bans: that is about rolls that ignore the state, not rolls that
		// resolve a state the player can see.
		daysFactor := shared.Clamp01(days / (c.Council.DaysBelowThreshold * 2))
		voteChance := (c.Council.VoteChanceBase +
			c.Council.VoteChanceUnrestWeight*shared.Clamp01(t.Unrest)) * (0.5 + daysFactor)
		voteChance = shared.Clamp01(voteChance)

		w.Set(model.KindTown, id, "quorum", quorum,
			shared.ReadString(
				shared.Pair("unrest", t.Unrest),
				shared.Pair("loyalty", t.Loyalty),
				shared.PairF("days", days)),
			v.Log.RecentFor(model.KindTown, id, []string{"loyalty", "unrest", "days_below_loyalty"}, 4), "")
		w.Set(model.KindTown, id, "vote_chance", voteChance,
			shared.ReadString(
				shared.Pair("unrest", t.Unrest),
				shared.PairF("days", days)),
			v.Log.RecentFor(model.KindTown, id, []string{"unrest", "days_below_loyalty"}, 3), "")

		if quorum < c.Council.QuorumRequired {
			continue
		}
		if !v.Rng.Chance(voteChance) {
			continue
		}

		// --- a successor ---
		// The town does not go unowned. It picks a new holder from the
		// candidates who could plausibly take it: nearby rulers of any side,
		// preferring someone who is not already the disgruntled incumbent and
		// who has some standing of their own.
		out := t.Holder
		successor := pickSuccessor(v, id, t.Holder)
		if successor < 0 {
			// No candidate exists, which happens in a corner of the map with no
			// neighbours. A town cannot be left unowned, so the vote fails
			// rather than the town being abandoned.
			continue
		}

		read := shared.ReadString(
			shared.Pair("loyalty", t.Loyalty),
			shared.Pair("unrest", t.Unrest),
			shared.PairF("days_below", days),
			shared.Pair("quorum", quorum),
			shared.PairI("out", out),
			shared.PairI("in", successor),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"loyalty", "unrest", "days_below_loyalty", "tax_rate", "food_stock", "recent_deaths", "infected"}, 6)

		// The old holder's loyalty to their own leader is not changed by being
		// thrown out of a town, but they are humiliated, and that is staged as
		// influence loss, which the influence system turns into a real number.
		if out >= 0 {
			w.Add(model.KindLeader, out, "influence", -c.Council.InflectionLossOnHumiliation,
				"voted out of a town", nil, "voted out")
		}
		// The new holder gets influence for being chosen: governing is
		// prestigious, which is what makes a vote a prize worth scheming for.
		w.Add(model.KindLeader, successor, "influence", c.Council.InfluenceGainOnPromotion,
			"granted a town", nil, "granted a town")

		w.Set(model.KindTown, id, "holder", float64(successor), read, causes, "voted out")
		w.Set(model.KindTown, id, "holder_side", float64(v.State.Leaders[successor].SideID), read, causes, "new holder's side")
		// A town that changes hands starts over: the new holder's people are
		// not yet loyal to him, and the old conditions get a fresh chance to
		// show. This is why a succession does not instantly fix a broken town
		// and also does not instantly destroy a good one.
		w.Set(model.KindTown, id, "loyalty", c.Council.LoyaltyAfterSuccession, read, causes, "new holder's honeymoon")
		w.Set(model.KindTown, id, "days_below_loyalty", 0, read, causes, "")
	}

	// --- side stability ---
	// A side whose provinces are all in open revolt starts losing them
	// outright, and to other sides. This is how a collapse cascades: a famine
	// in one town unseats its ruler, that ruler's neighbours grow unstable,
	// and a side can lose ground without anyone declaring war.
	for _, sid := range v.State.SideIDs() {
		unsteady := 0.0
		settled := 0.0
		towns := 0.0
		for _, tid := range v.State.TownIDs() {
			t := v.State.Towns[tid]
			if t.HolderSide != sid {
				continue
			}
			towns++
			if t.Unrest > c.Council.InstabilityThreshold {
				unsteady++
			}
			settled += shared.Clamp01(t.Loyalty)
		}
		if towns == 0 {
			continue
		}
		unrestShare := shared.SafeDiv(unsteady, towns)
		stability := shared.Clamp01(shared.SafeDiv(settled, towns) - c.Council.InstabilityUnrestWeight*unrestShare)
		w.Set(model.KindSide, sid, "side_stability", stability,
			shared.ReadString(
				shared.PairF("towns", towns),
				shared.PairF("unsteady", unsteady),
				shared.Pair("stability", stability)),
			v.Log.RecentFor(model.KindSide, sid, []string{"side_stability"}, 2), "")

		// Provinces secede at a per-town rate that rises sharply with unrest.
		// A seceding town joins a neighbour that is doing better, which is the
		// honest mechanism: people do not join a worse-off neighbour out of
		// loyalty, they join one with food.
		if unrestShare > 0 {
			rate := c.Council.InstabilityDailyChance * unrestShare * unrestShare * 10
			for _, tid := range v.State.TownIDs() {
				t := v.State.Towns[tid]
				if t.HolderSide != sid || t.Unrest <= c.Council.InstabilityThreshold {
					continue
				}
				if !v.Rng.Chance(rate) {
					continue
				}
				// Only a town whose holder has already lost the town, or which
				// nobody holds firmly, changes hands this way. A town that just
				// voted is not immediately seceded to a neighbour, because the
				// council's choice is a legitimate outcome.
				holder := v.State.Leaders[t.Holder]
				if holder != nil && holder.LoyaltyToLeader > c.Council.SecessionLoyaltyCutoff {
					continue
				}
				newSide := betterNeighbourSide(v, tid, sid)
				if newSide < 0 {
					continue
				}
				read := shared.ReadString(
					shared.Pair("unrest", t.Unrest),
					shared.Pair("loyalty", t.Loyalty),
					shared.PairI("from_side", sid),
					shared.PairI("to_side", newSide))
				causes := v.Log.RecentFor(model.KindTown, tid,
					[]string{"unrest", "loyalty", "holder_side"}, 4)
				w.Set(model.KindTown, tid, "holder_side", float64(newSide), read, causes, "province seceded")
				w.Set(model.KindTown, tid, "holder", float64(-1), read, causes, "no holder until the new side appoints one")
				// The new side takes on the town, which is what makes a mass
				// secession a real strategic event.
				w.Add(model.KindSide, newSide, "side_towns", 1, read, causes, "gained a province")
				if t.Holder >= 0 {
					w.AddRelation(t.Holder, v.State.Sides[newSide].LeaderID,
						-c.Relation.DefectionRelation, read, causes, "province seceded")
				}
			}
		}
	}
}

// pickSuccessor chooses a new holder from nearby candidates, scored by
// standing and by how little the incumbent is trusted.
func pickSuccessor(v *sim.View, townID, current int) int {
	c := v.Cfg
	best := -1
	bestScore := -1e18
	for _, rid := range v.State.LeaderIDsSorted() {
		if rid == current {
			continue
		}
		r := v.State.Leaders[rid]
		if !r.IsAlive || r.CapturedBy >= 0 {
			continue
		}
		// Must be reachable: a town does not fall to a ruler on the far side of
		// the map. This is what makes distance matter for power as well as for
		// marching.
		home := v.State.Towns[r.TownID]
		if home == nil {
			continue
		}
		d := v.State.DistanceBetweenTowns(townID, r.TownID)
		if d > c.Council.SuccessorRangeLeagues {
			continue
		}
		score := r.Influence + r.Renown*0.5 - d*c.Council.SuccessorDistanceWeight
		// A ruler who is already a mercenary or an officer has no claim; they
		// are candidates to be appointed, not to hold by right.
		if r.IsMercenary {
			score -= c.Council.MercenaryPenalty
		}
		// Someone the town already dislikes is a poor choice, so any standing
		// with the incumbent counts against them.
		if current >= 0 {
			score += v.State.Relation(current, rid) * c.Council.SuccessorRelationWeight
		}
		if score > bestScore {
			bestScore, best = score, rid
		}
	}
	return best
}

// betterNeighbourSide returns the side of a neighbouring town that is doing
// better than the one currently holding this town, or -1 if none is.
func betterNeighbourSide(v *sim.View, townID, currentSide int) int {
	c := v.Cfg
	best := -1
	bestScore := 0.0
	for _, oid := range v.State.TownIDs() {
		if oid == townID {
			continue
		}
		o := v.State.Towns[oid]
		if o.HolderSide == currentSide || o.HolderSide < 0 {
			continue
		}
		d := v.State.DistanceBetweenTowns(townID, oid)
		if d > c.Council.SecessionRangeLeagues {
			continue
		}
		// Better off means fed and calm, which is exactly the comparison a
		// displaced person would make.
		score := shared.Clamp01(o.FoodDays/c.World.FullFoodDays) - shared.Clamp01(o.Unrest)
		score -= d / c.Council.SecessionRangeLeagues
		if score > bestScore {
			bestScore, best = score, o.HolderSide
		}
	}
	return best
}
