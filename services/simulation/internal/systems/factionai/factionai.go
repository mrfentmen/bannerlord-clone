// Package factionai is the strategic layer: sides declare wars, sue for
// peace, form coalitions, blockade ports, and lose provinces.
//
// Reads side resources, war weariness, relations, and the strength of rival
// sides, and writes a side's intent, its war and peace posture, and its
// exhaustion. It is the layer that decides whether two sides are at war at all,
// which is what the ruler AI then acts on.
package factionai

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the faction AI system.
func System() sim.System {
	return sim.System{
		Name: "factionai",
		Doc:  "sides declare war, sue for peace, form coalitions, blockade, and wear down",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg

	// --- recompute each side's strength and needs ---
	// A side's strength is the sum of what it actually holds, so it responds
	// to losing towns rather than being a fixed number per side. This is what
	// makes a cascade of defeats feed back into how hard the winner presses.
	for _, sid := range v.State.SideIDs() {
		side := v.State.Sides[sid]
		troops, towns, pop, food, metal, unrestSum := 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
		for _, tid := range v.State.TownIDs() {
			t := v.State.Towns[tid]
			if t.HolderSide != sid {
				continue
			}
			towns++
			pop += t.Population
			food += t.FoodStock
			metal += t.Metal
			unrestSum += t.Unrest
			troops += t.Garrison + t.Militia
		}
		// A side's own armies count too, not only its garrisons.
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p.SideID != sid {
				continue
			}
			troops += p.Troops
		}
		strength := shared.SafeDiv(troops, 1000) +
			shared.SafeDiv(food, 50000) + shared.SafeDiv(metal, 20000) +
			shared.SafeDiv(pop, 500000)
		// Deserted and starving troops are not strength, so a side whose armies
		// are not being paid looks weaker than its headcount suggests. That is
		// chain 4 reaching the strategic layer.
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p.SideID != sid {
				continue
			}
			strength -= shared.SafeDiv(p.Troops, 1000) * (1 - shared.Clamp01(p.Morale))
		}
		if strength < 0 {
			strength = 0
		}
		// A vassal's strength is discounted, so a vassal is worth having without
		// being an independent power. The discount is applied before the single
		// write below: writing it, discounting, and writing again produced two
		// absolute writes to one field in a tick, which the engine correctly
		// refused as order-dependent.
		if side.Vassal {
			strength *= c.FactionAI.VassalStrengthShare
		}
		read := shared.ReadString(
			shared.PairF("troops", troops),
			shared.PairF("towns", towns),
			shared.PairF("population", pop),
			shared.PairF("food", food),
			shared.PairF("metal", metal),
			shared.PairB("vassal", side.Vassal))
		causes := v.Log.RecentFor(model.KindSide, sid,
			[]string{"side_towns", "side_population", "side_food", "side_metal", "side_treasury"}, 4)
		w.Set(model.KindSide, sid, "side_strength", strength, read, causes, "fielded strength")
		w.Set(model.KindSide, sid, "side_towns", towns, read, causes, "")
		w.Set(model.KindSide, sid, "side_population", pop, read, causes, "")
		// What the side is short of, as a share of what it needs. A side short
		// of food has a reason to go to war, which is chain 8's cause and
		// ECONOMY.md section 9's first example.
		foodNeed := 1 - shared.Clamp01(shared.SafeDiv(food, pop*c.Food.PersonDaysPerPersonDay*c.World.FullFoodDays))
		metalNeed := 1 - shared.Clamp01(shared.SafeDiv(metal, pop*c.World.StartMetalPerCapita*20))
		w.Set(model.KindSide, sid, "side_food_need", foodNeed, read, causes, "")
		w.Set(model.KindSide, sid, "side_metal_need", metalNeed, read, causes, "")
	}

	// --- war weariness ---
	// An active war exhausts a side, faster if it is fighting often. This is
	// how wars end: not by conquest but by exhaustion, per
	// MARCH_AND_WAR.md section 7.
	for _, wid := range v.State.WarIDs() {
		war := v.State.Wars[wid]
		if war.EndTick >= 0 {
			continue
		}
		// Additive, not absolute. A side can be at war with more than one other
		// side at once, and each war wears it down; summing the contributions
		// is what lets that happen without two systems-worth of absolute
		// writes fighting over one field. The clamp is left to the field's own
		// bounds, which the engine applies on commit.
		for _, sid := range []int{war.SideA, war.SideB} {
			side := v.State.Sides[sid]
			if side == nil {
				continue
			}
			added := c.FactionAI.WarWearinessPerDay +
				war.BattlesThisTick*c.FactionAI.WarWearinessFromBattle
			w.Add(model.KindSide, sid, "side_war_weariness", added,
				shared.ReadString(
					shared.Pair("weariness", side.WarWeariness),
					shared.PairI("war", wid),
					shared.PairF("battles", war.BattlesThisTick)),
				v.Log.RecentFor(model.KindSide, sid, []string{"side_war_weariness", "side_treasury", "side_towns"}, 3),
				"the war is grinding on")
		}
		// A war's intensity rises while it runs and falls when the sides are
		// too tired to keep fighting.
		avgWeariness := 0.0
		if a, b := v.State.Sides[war.SideA], v.State.Sides[war.SideB]; a != nil && b != nil {
			avgWeariness = (a.WarWeariness + b.WarWeariness) / 2
		}
		intensity := shared.Clamp01(1-avgWeariness) * (1 + shared.Clamp01(war.BattlesThisTick*c.FactionAI.IntensityPerBattle))
		w.Set(model.KindWar, wid, "war_intensity", intensity,
			shared.Pair("avg_weariness", avgWeariness), nil, "")
		w.Add(model.KindWar, wid, "war_battles", war.BattlesThisTick,
			shared.PairF("battles_this_tick", war.BattlesThisTick), nil, "")
		w.Set(model.KindWar, wid, "battles_this_tick", 0, "reset each tick", nil, "")
	}

	// --- declare war, or make peace ---
	// The strategic decision, taken on a stagger so sides are not all deciding
	// on the same day.
	//
	// ended accumulates the sides that concluded a war this tick, so the peace
	// bookkeeping below is written once per side rather than once per war. A
	// side can be at war with two others at once, and writing its post-war
	// state twice would be the order-dependent case the engine refuses.
	var ended []int
	for _, sid := range v.State.SideIDs() {
		side := v.State.Sides[sid]
		// A vassal does not declare its own wars.
		if side.Vassal {
			continue
		}
		if (v.Tick+sid)%int(c.FactionAI.DecideEveryDays) != 0 {
			continue
		}

		alreadyAtWar := false
		for _, wid := range v.State.WarIDs() {
			war := v.State.Wars[wid]
			if war.EndTick >= 0 {
				continue
			}
			if war.SideA == sid || war.SideB == sid {
				alreadyAtWar = true
				break
			}
		}

		// Peace first, because a side that wants out should not be starting
		// something new.
		peaceScore := c.FactionAI.ExhaustionPeaceWeight*shared.Clamp01(side.WarWeariness/c.FactionAI.OfferPeaceThreshold) +
			c.FactionAI.TreasuryPeaceWeight*shared.Clamp01(side.DebtRatio)
		if alreadyAtWar && peaceScore > c.FactionAI.PeaseDecisionThreshold {
			endWars(v, w, sid, side, "exhaustion", &ended)
			continue
		}

		// Declare war on the most attractive target: a weak neighbour that this
		// side is already hostile toward, and which this side needs something
		// from.
		warScore, target := bestWarTarget(v, side)
		if target >= 0 && warScore > c.FactionAI.DeclareWarThreshold && !alreadyAtWar {
			declareWar(v, w, side, target, warScore)
		}
	}

	// --- post-war state, once per side ---
	// A side that ended a war is at peace and has no enemy. Its exhaustion eases
	// rather than being reset: relief is not amnesia, and a ruler who has just
	// finished one war does not become a fresh man.
	for _, sid := range ended {
		side := v.State.Sides[sid]
		if side == nil {
			continue
		}
		w.Set(model.KindSide, sid, "side_intent", float64(model.SidePeace), "made peace", nil, "")
		w.Set(model.KindSide, sid, "side_enemy", -1, "made peace", nil, "")
		w.Add(model.KindSide, sid, "side_war_weariness",
			-side.WarWeariness*(1-c.FactionAI.PeaceWearinessRelief),
			"made peace", nil, "the war is over and the exhaustion eases")
	}

	// --- trade pacts and coalition drift ---
	// A trade pact slowly improves relations, which is FACTIONS.md's
	// "trade pacts" between sides and it means trade is not only a town-level
	// activity.
	for _, pair := range v.State.SortedPairs(v.State.SideRelations).Pairs {
		if pair.A < 0 || pair.B < 0 {
			continue
		}
		cur := v.State.SideRelations[pair]
		if cur > c.FactionAI.PactRelationThreshold {
			w.AddSideRelation(pair.A, pair.B, c.FactionAI.TradePactBonusPerDay,
				shared.Pair("relation", cur), nil, "trade pact")
		}
	}
}

// bestWarTarget scores every other side for going to war with.
func bestWarTarget(v *sim.View, side *model.Side) (float64, int) {
	c := v.Cfg
	best, bestScore := -1, 0.0
	own := side.StrengthIndex
	if own <= 0 {
		own = 1
	}
	for _, oid := range v.State.SideIDs() {
		if oid == side.ID {
			continue
		}
		other := v.State.Sides[oid]
		// A side does not attack a side far stronger than itself, which is
		// what stops the strongest side simply eating the map.
		if other.StrengthIndex > own*c.FactionAI.OvermatchRatio {
			continue
		}
		// Being already hostile counts for a lot: wars escalate from
		// friction, and a side already raiding another's border has a reason.
		relation := v.State.SideRelation(side.ID, oid)
		hostility := shared.Clamp01((c.FactionAI.HostileRelationThreshold - relation) / c.FactionAI.HostileRelationThreshold)
		// Weakness, and what this side wants.
		weakness := 1 - shared.Clamp01(shared.SafeDiv(other.StrengthIndex, own))
		need := c.FactionAI.FoodNeedWeight*shared.Clamp01(other.FoodNeed) +
			c.FactionAI.MetalNeedWeight*shared.Clamp01(other.MetalNeed)
		score := (c.FactionAI.DeclareWarWeight*hostility +
			c.FactionAI.TargetWeaknessWeight*weakness +
			c.FactionAI.ResourceNeedWeight*need) * v.Rng.Range(0.8, 1.2)
		// A side that is itself tired does not start anything.
		score *= 1 - shared.Clamp01(side.WarWeariness)
		if score > bestScore {
			bestScore, best = score, oid
		}
	}
	return bestScore, best
}

// declareWar starts a war and records it.
func declareWar(v *sim.View, w *sim.WriteSet, side *model.Side, targetID int, score float64) {
	c := v.Cfg
	target := v.State.Sides[targetID]
	if target == nil {
		return
	}
	reason := model.WarOpportunity
	switch {
	case side.FoodNeed > c.FactionAI.FoodNeedWarThreshold:
		reason = model.WarResources
	case v.State.SideRelation(side.ID, targetID) < c.FactionAI.RevengeRelationThreshold:
		reason = model.WarRevenge
	case side.WarWeariness < 0.1:
		reason = model.WarBorder
	}
	war := &model.War{
		ID:        v.State.NewID(model.IDWar),
		SideA:     side.ID,
		SideB:     targetID,
		StartTick: float64(v.Tick),
		EndTick:   -1,
		Reason:    reason,
		Intensity: shared.Clamp01(score / 2),
	}
	w.CreateEntity(func(s *model.State) { s.Wars[war.ID] = war })
	read := shared.ReadString(
		shared.Pair("score", score),
		shared.PairI("target", targetID),
		shared.Pair("own_strength", side.StrengthIndex),
		shared.Pair("target_strength", target.StrengthIndex),
		shared.Pair("food_need", side.FoodNeed))
	causes := v.Log.RecentFor(model.KindSide, side.ID,
		[]string{"side_food_need", "side_metal_need", "side_strength", "side_war_weariness"}, 4)
	w.Set(model.KindWar, war.ID, "war_side_a", float64(side.ID), read, causes, warReasonText(reason))
	w.Set(model.KindWar, war.ID, "war_side_b", float64(targetID), read, causes, warReasonText(reason))
	w.Set(model.KindWar, war.ID, "war_reason", float64(reason), read, causes, warReasonText(reason))
	w.Set(model.KindSide, side.ID, "side_intent", float64(model.SideWar), read, causes, "declared war")
	w.Set(model.KindSide, side.ID, "side_target", float64(targetID), read, causes, "")
	w.Set(model.KindSide, side.ID, "side_enemy", float64(targetID), read, causes, "")
	w.Set(model.KindSide, targetID, "side_intent", float64(model.SideDefend), read, causes, "at war")
	w.Set(model.KindSide, targetID, "side_enemy", float64(side.ID), read, causes, "")
	// Going to war is popular with a ruler who wants land and unpopular with
	// one who wants security, and it costs the leader influence to say so.
	w.Add(model.KindRuler, side.LeaderID, "influence", -c.FactionAI.InfluenceCostOfWar*(1-shared.Clamp01(side.Stability)),
		"declared war", nil, "cost of declaring war")
}

// endWars concludes every war this side is in, for the stated reason.
func endWars(v *sim.View, w *sim.WriteSet, sid int, side *model.Side, reason string, ended *[]int) {
	c := v.Cfg
	for _, wid := range v.State.WarIDs() {
		war := v.State.Wars[wid]
		if war.EndTick >= 0 {
			continue
		}
		if war.SideA != sid && war.SideB != sid {
			continue
		}
		otherID := war.SideA
		if otherID == sid {
			otherID = war.SideB
		}
		other := v.State.Sides[otherID]
		// Exhaustion ends a war between equals. Between unequal sides, a war
		// ends in tribute and vassalage instead, which is how a side is beaten
		// without being destroyed (MARCH_AND_WAR.md section 7).
		// The war's outcome is recorded as a note on the end tick, because the
		// outcome is a judgement about which side won rather than a field a
		// system owns. The run report reads it from the note.
		if other != nil && side.StrengthIndex > other.StrengthIndex*c.FactionAI.VassalStrengthRatio {
			// Tribute: the loser pays, which is a real economic transfer and
			// can bankrupt a side that has already been fighting too long.
			tribute := 0.0
			if other.Treasury > 0 {
				tribute = other.Treasury * c.FactionAI.TributeShare
			}
			if tribute < 0 {
				tribute = 0
			}
			w.Add(model.KindSide, otherID, "side_treasury", -tribute,
				"defeated", nil, "tribute after defeat")
			w.Add(model.KindSide, sid, "side_treasury", tribute,
				"victorious", nil, "tribute from the defeated")
			// A beaten side becomes a vassal, which is how a coalition's work
			// becomes permanent territory rather than a temporary raid.
			if !other.Vassal && c.FactionAI.VassalChancePerPeace > 0 &&
				v.Rng.Chance(c.FactionAI.VassalChancePerPeace) {
				w.Set(model.KindSide, otherID, "is_vassal", 1, "defeated", nil, "became a vassal")
				w.Set(model.KindSide, otherID, "vassal_of", float64(sid), "defeated", nil, "became a vassal")
				w.Add(model.KindSide, otherID, "side_treasury", -other.Treasury*c.FactionAI.VassalTributeRate,
					"vassalage", nil, "tribute to the overlord")
				w.Add(model.KindSide, sid, "side_treasury", other.Treasury*c.FactionAI.VassalTributeRate,
					"vassalage", nil, "tribute from a vassal")
			}
		}
		// Peace improves relations and eases the weariness. The weariness is a
		// relative reduction rather than an absolute value, because a side can
		// be concluding two wars in the same tick and two absolute writes to
		// one field would be exactly the order-dependent case the engine
		// refuses. A relative reduction is also the honest statement: peace
		// relieves exhaustion, it does not set it to a fixed level.
		w.Set(model.KindWar, wid, "war_end_tick", float64(v.Tick),
			shared.PairI("ended_by", sid), nil, reason)
		w.AddSideRelation(war.SideA, war.SideB, c.FactionAI.PeaceRelationGain,
			shared.PairI("war", wid), nil, "made peace")
	}
	*ended = append(*ended, sid)
}

func warReasonText(r model.WarReason) string {
	switch r {
	case model.WarBorder:
		return "border dispute"
	case model.WarRevenge:
		return "revenge"
	case model.WarResources:
		return "seeking food and metal"
	case model.WarDefence:
		return "defence of an ally"
	case model.WarAlliance:
		return "an ally's obligation"
	case model.WarOpportunity:
		return "opportunity"
	default:
		return ""
	}
}
