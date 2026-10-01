// Package rulerai scores what a ruler could do today and records what they
// chose, with the reasons, in shared state.
//
// Reads the ruler's own situation and the visible state of their neighbours,
// with noise standing in for imperfect intelligence, and writes an intention
// and a reason. It never moves anyone: it writes intended_action, and the march
// system reads that next tick. That is what makes an AI decision a piece of
// shared state rather than a function call, per AI.md section 1.
//
// Nothing here is scripted. Greed produces tax rises because a greedy ruler
// scores tax high; a merciful ruler sends aid because mercy tilts the aid
// score; a grudge produces a war because hate raises the attack score. The
// chains follow from the scoring, not from a table of outcomes.
package rulerai

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the ruler AI system.
func System() sim.System {
	return sim.System{
		Name: "rulerai",
		Doc:  "scores what each ruler could do and records their choice and reasons in shared state",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	// Rulers decide on a stagger, not all on the same tick, so a large roster
	// does not produce a synchronised world where everyone acts at once. The
	// stagger is by id, which is deterministic.
	for _, id := range v.State.LeaderIDsSorted() {
		r := v.State.Leaders[id]
		if !r.IsAlive || r.CapturedBy >= 0 {
			continue
		}
		// A ruler who is already marching, besieging, or raiding is committed.
		// Re-deciding mid-campaign would mean a ruler abandoning a siege
		// because something more attractive came up, which no one in history
		// has managed.
		if p := v.State.Parties[r.PartyID]; p != nil && p.Troops > 0 {
			switch p.Activity {
			case model.ActMarching, model.ActSieging, model.ActRaiding, model.ActResupplying:
				continue
			}
		}
		// Deciding every few days rather than daily. A daily decision would
		// make rulers twitchy; the cadence is what makes a campaign feel like
		// a decision rather than a reflex.
		if float64((v.Tick+id)%int(c.RulerAI.DecideEveryDays)) != 0 {
			continue
		}

		choice, reason, score := decide(v, r)
		p := v.State.Parties[r.PartyID]
		if p == nil || p.Troops <= 0 {
			// A ruler with no army still has policy choices: tax rates, gifts,
			// and whether to keep trying. The tax decision is handled by the
			// same scoring, so a landless ruler can still be a problem.
			if choice == model.IntentNone {
				continue
			}
		}
		read := shared.ReadString(
			shared.PairI("ruler", id),
			shared.Pair("influence", r.Influence),
			shared.Pair("renown", r.Renown),
			shared.PairI("side", r.SideID),
			shared.PairI("town", r.TownID),
			shared.Pair("loyalty_to_leader", r.LoyaltyToLeader),
			shared.Pair("decision_score", score),
		)
		causes := v.Log.RecentFor(model.KindLeader, id,
			[]string{"influence", "renown", "loyalty_to_leader", "ruler_town", "service_quality"}, 4)
		if r.TownID >= 0 {
			causes = append(causes, v.Log.RecentFor(model.KindTown, r.TownID,
				[]string{"food_stock", "unrest", "loyalty", "tax_rate", "garrison", "medicine_stock"}, 4)...)
		}

		if p != nil && p.Troops > 0 {
			w.Set(model.KindParty, p.ID, "intended_action", float64(choice), read, causes, reasonText(reason))
			w.Set(model.KindParty, p.ID, "decision_reasons", float64(reason), read, causes, reasonText(reason))
			w.Set(model.KindParty, p.ID, "decision_score", score, read, causes, reasonText(reason))
		}
		w.Set(model.KindLeader, id, "decision_reasons", float64(reason), read, causes, reasonText(reason))

		// Taxes. A ruler's tax policy is a decision like any other, and it is
		// where chain 1 starts: a greedy or ambitious ruler taxes a prosperous
		// town past what it can bear, and the anger that follows is not
		// scripted, it is arithmetic.
		setTax(v, w, r)
	}
}

// decide scores every option and returns the best. The jitter is bounded so it
// can break a tie but never overturn a real difference in state, which is the
// distinction CAUSE_EFFECT.md section 7 draws between a random roll and a
// scripted outcome.
func decide(v *sim.View, r *model.Leader) (model.Intention, model.Reason, float64) {
	c := v.Cfg
	jitter := func(base float64) float64 {
		return base + v.Rng.Range(-c.RulerAI.Randomness, c.RulerAI.Randomness)
	}

	// --- the ruler's own position ---
	home := v.State.Towns[r.TownID]
	homeThreat := 0.0
	homeFood := 1.0
	homeUnrest := 0.0
	if home != nil {
		homeFood = shared.Clamp01(home.FoodDays / c.World.FullFoodDays)
		homeUnrest = home.Unrest
		// A ruler whose own town is in trouble wants to be near it. This is
		// why holding a big realm is hard: attention is the scarce resource.
		homeThreat = shared.Clamp01(homeUnrest) + (1-homeFood)*0.5
	}
	// Morale and supplies of the army. A ruler whose army is starving or
	// demoralised goes home rather than pushing on, which is how chain 6's
	// overlong march actually ends: not in a rout but in a retreat.
	armyUsable := 1.0
	if p := v.State.Parties[r.PartyID]; p != nil && p.Troops > 0 {
		if p.Morale < c.RulerAI.OverextensionMorale {
			armyUsable = 0
		}
		if p.IsStarving {
			armyUsable *= c.RulerAI.StarvingArmyPenalty
		}
		// The supply check from MARCH_AND_WAR.md section 1: a ruler verifies
		// there is food for the march before committing to it.
		if p.DaysFood < c.RulerAI.SupplyCheckFood && p.Activity == model.ActIdle {
			armyUsable *= c.RulerAI.LowSupplyPenalty
		}
	} else {
		armyUsable = 0
	}

	// --- option: wait ---
	// Resting is always available and is often correct, which is what keeps the
	// AI from marching constantly. Its score rises when the ruler has nothing
	// better to do and drops when their own lands are burning.
	waitScore := jitter(c.RulerAI.RestWeight) +
		c.RulerAI.TraitRestWeight*((r.Traits.Calculation+r.Traits.Mercy)/2-0.5) -
		c.RulerAI.DefendWeight*homeThreat*0.5

	// --- option: aid ---
	// Sending food and medicine to a suffering ally. This is what makes chain
	// 5 possible: a merciful ruler's aid is a scoring outcome, not a scripted
	// rescue, and the recovery that follows is the food and disease systems
	// doing their jobs.
	aidScore := 0.0
	aidReason := model.ReasonMercy
	if target, need := neediestNeighbour(v, r); target >= 0 {
		aidScore = jitter(c.RulerAI.AidWeight) * need *
			(0.6 + c.RulerAI.TraitAidWeight*r.Traits.Mercy) *
			(0.5 + c.RulerAI.AmbitionSecurityWeight*b2f(r.Ambition == model.AmbitionSecurity)) *
			distanceFactor(v, r, target)
		aidReason = model.ReasonMercy
		if homeThreat > 0.5 {
			// A ruler with a crisis at home does not aid anyone. This is a
			// real strategic limit, and it is why help is not freely given.
			aidScore *= c.RulerAI.AidBlockedByOwnCrisis
		}
	}

	// --- option: attack ---
	// A weak, nearby, disliked neighbour. Weakness is read through the fog of
	// war: what a ruler knows is an estimate, and the estimate is worse the
	// less intelligence they have, which is FACTIONS.md's intelligence rating
	// made mechanical.
	attackScore := 0.0
	attackReason := model.ReasonAmbition
	if target, weakness, hate := bestTarget(v, r); target >= 0 {
		attackScore = jitter(c.RulerAI.AttackWeight) * weakness *
			(0.5 + c.RulerAI.TraitAttackWeight*r.Traits.Valor) *
			(0.5 + c.RulerAI.HateWeight*(1-shared.Clamp01(hate+1)/2)*2) *
			(0.5 + c.RulerAI.AmbitionLandWeight*b2f(r.Ambition == model.AmbitionLand)) *
			(0.5 + c.RulerAI.AmbitionRevengeWeight*b2f(r.Ambition == model.AmbitionRevenge))
		attackReason = model.ReasonAmbition
		if r.Ambition == model.AmbitionRevenge && hate < 0 {
			attackReason = model.ReasonRevenge
		} else if weakness > c.RulerAI.StarvingTargetWeakness {
			attackReason = model.ReasonWeakTarget
		} else if hate < c.RulerAI.GrievanceHateThreshold {
			attackReason = model.ReasonGrievance
		}
		// A ruler with a usable army only. This is the supply check made real:
		// an army that cannot march cannot attack, whatever its opinion of
		// the target.
		attackScore *= armyUsable
		// And it is not worth leaving home undefended.
		attackScore *= 1 - c.RulerAI.AttackBlockedByHomeThreat*homeThreat
	}

	// --- option: raid ---
	// Raiding is cheaper than a war and meaner. A cruel, brave ruler raids.
	raidScore := 0.0
	raidReason := model.ReasonGreed
	if target, value := richestNeighbourVillage(v, r); target >= 0 {
		raidScore = jitter(c.RulerAI.RaidWeight) * value *
			(0.4 + c.RulerAI.TraitRaidWeight*r.Traits.Valor) *
			(0.3 + c.RulerAI.TraitRaidWeight*(1-r.Traits.Mercy)) *
			(0.5 + c.RulerAI.AmbitionWealthWeight*b2f(r.Ambition == model.AmbitionWealth)) *
			armyUsable
		raidReason = model.ReasonGreed
	}

	// --- option: trade ---
	tradeScore := 0.0
	tradeReason := model.ReasonTradeProfit
	if neighbour, margin := bestTradePartner(v, r); neighbour >= 0 {
		tradeScore = jitter(c.RulerAI.TradeWeight) * margin *
			(0.5 + c.RulerAI.TraitTradeWeight*r.Traits.Calculation) *
			(0.5 + c.RulerAI.AmbitionWealthWeight*b2f(r.Ambition == model.AmbitionWealth)) *
			distanceFactor(v, r, neighbour)
		tradeReason = model.ReasonTradeProfit
	}

	// --- option: defect ---
	// Leaving one's own side. This one is deliberately hard: a ruler needs low
	// loyalty to their leader, a collapsed own situation, and a better offer
	// available. All three, because RULERS.md section 6 says a ruler "with
	// collapsed loyalty and a good offer" may defect, and the exit criteria
	// require that no side collapses every run.
	defectScore := 0.0
	if r.LoyaltyToLeader < c.Loyalty.DefectionThreshold && r.SideID >= 0 {
		side := v.State.Sides[r.SideID]
		if side != nil {
			appeal := c.Loyalty.OutsideOfferBase +
				c.RulerAI.DefectLeaderWeariness*shared.Clamp01(side.WarWeariness) +
				c.RulerAI.DefectLeaderDebt*shared.Clamp01(side.DebtRatio) +
				c.RulerAI.DefectOwnCollapse*homeThreat
			// A ruler will not defect if nobody wants them. Influence is what a
			// rival bids for, and it is why influence is currency
			// (MARCH_AND_WAR.md section 8).
			appeal *= shared.Clamp01(r.Influence / c.Influence.InfluenceDefectThreshold)
			appeal *= 1 + c.RulerAI.TraitRestWeight*(r.Traits.Calculation-0.5)*2
			defectScore = jitter(c.RulerAI.DefectWeight) * appeal *
				(1 - shared.Clamp01(r.LoyaltyToLeader/c.Loyalty.DefectionThreshold))
		}
	}

	// --- option: defend ---
	// Going home and putting the garrison right. A ruler who is losing their
	// own town will choose this over almost anything, which is what makes a
	// frontier defensible when its lord cares about it.
	defendScore := jitter(c.RulerAI.DefendWeight) * homeThreat *
		(0.5 + c.RulerAI.AmbitionSecurityWeight*b2f(r.Ambition == model.AmbitionSecurity)) *
		(0.5 + c.RulerAI.TraitRestWeight*r.Traits.Mercy)

	// --- option: blockade ---
	// Cutting a port's trade instead of taking it. A ruler who wants to
	// starve someone but cannot afford to assault them blockades them, which
	// is chain 8's mechanism and is cheaper and slower.
	blockadeScore := 0.0
	if target, need := bestBlockadeTarget(v, r); target >= 0 {
		blockadeScore = jitter(c.RulerAI.BlockadeWeight) * need *
			(0.4 + c.RulerAI.TraitAttackWeight*r.Traits.Calculation) *
			armyUsable
	}

	// --- option: peace ---
	// Asking for terms. A ruler whose side is exhausted prefers the war to
	// end, which is how a long war actually concludes rather than grinding on
	// until one side is destroyed.
	peaceScore := 0.0
	if side := v.State.Sides[r.SideID]; side != nil && side.WarWeariness > 0 {
		peaceScore = jitter(c.RulerAI.PeaceWeight) * shared.Clamp01(side.WarWeariness)
	}

	// --- pick the best ---
	best := model.IntentNone
	bestScore := waitScore
	bestReason := model.ReasonSafeDistance
	consider := func(score float64, intent model.Intention, reason model.Reason) {
		if score > bestScore {
			bestScore, best, bestReason = score, intent, reason
		}
	}
	consider(attackScore, model.IntentAttack, attackReason)
	consider(raidScore, model.IntentRaid, raidReason)
	consider(aidScore, model.IntentAid, aidReason)
	consider(tradeScore, model.IntentTrade, tradeReason)
	consider(defendScore, model.IntentDefend, model.ReasonDuty)
	consider(blockadeScore, model.IntentBlockade, model.ReasonGreed)
	consider(defectScore, model.IntentAlly, model.ReasonAmbition)
	consider(peaceScore, model.IntentPeace, model.ReasonExhausted)
	return best, bestReason, bestScore
}

// setTax decides a ruler's tax rate from their own character and their town's
// condition. This is chain 1's origin, and it is worth being explicit that
// nothing here is a script for "taxes go up and everything falls apart": a
// ruler raises taxes when they are greedy and their town is comfortable, cuts
// them when their town is angry or when they are generous, and the consequences
// are computed by the unrest, market, and loyalty systems.
func setTax(v *sim.View, w *sim.WriteSet, r *model.Leader) {
	c := v.Cfg
	home := v.State.Towns[r.TownID]
	if home == nil {
		return
	}
	// Only the ruler who actually holds the town sets its taxes. Several rulers
	// may be based in one town, but they do not all get to tax it: a town has
	// one holder, and only that holder's policy applies. Without this check two
	// rulers based in the same town would both claim to set its tax rate, and
	// the engine would correctly refuse to decide which of them won.
	if home.Holder != r.ID {
		return
	}
	// Player orders take precedence over AI tax policy. If the player issued
	// a tax order for this town this tick, the AI must not override it with
	// its own policy - that would be two absolute writes and the engine
	// correctly refuses to choose between them.
	for _, o := range v.Orders {
		if o.Kind == sim.OrderSetTax && o.TownID == home.ID {
			return
		}
	}
	// What the town can bear, read from what is actually happening there.
	bearable := c.Unrest.TaxComfortRate
	// A town that is already angry can bear less; a calm prosperous one more.
	bearable += (home.Prosperity - 0.5) * c.RulerAI.TaxCapacityFromProsperity
	bearable -= home.Unrest * c.RulerAI.TaxCapacityFromUnrest
	if bearable < 0 {
		bearable = 0
	}
	if bearable > c.Currency.TaxMaxRate {
		bearable = c.Currency.TaxMaxRate
	}
	// What the ruler wants.
	want := c.Currency.TaxDefaultRate
	// Greed: a ruler who wants wealth taxes more, and a generous one taxes
	// less. This is the whole personality model of a tax policy.
	want += (r.Traits.Generosity - 0.5) * c.RulerAI.TaxGenerosityWeight
	want += (r.Traits.Calculation - 0.5) * c.RulerAI.TaxCalculationWeight
	// A ruler whose own treasury is short taxes hard, whatever their nature.
	if home.Money < c.RulerAI.TaxNeedReference {
		want += c.RulerAI.TaxNeedPressure
	}
	// A ruler who fears unrest will not push past what the town tolerates.
	if home.Unrest > c.RulerAI.TaxRaiseUnrestTolerance {
		want = shared.MoveToward(want, bearable, c.RulerAI.TaxFearUnrestRate)
	}
	// A generous ruler who is winning will deliberately cut taxes to buy
	// loyalty, which is chain 5's political half.
	if r.Traits.Generosity > 0.6 && home.Loyalty < c.RulerAI.TaxCutLoyaltyThreshold {
		want -= c.RulerAI.TaxCutLoyaltyGain
	}
	want = shared.Clamp(want, 0, c.Currency.TaxMaxRate)
	// Move toward the target rather than snapping: a tax policy is a policy,
	// not a switch, and a rate that jumped would be a number the player could
	// not anticipate.
	next := shared.MoveToward(home.TaxRate, want, c.RulerAI.TaxChangeRate)
	if next == home.TaxRate {
		return
	}
	read := shared.ReadString(
		shared.Pair("tax_rate", home.TaxRate),
		shared.Pair("target", want),
		shared.Pair("bearable", bearable),
		shared.Pair("generosity", r.Traits.Generosity),
		shared.Pair("unrest", home.Unrest),
		shared.Pair("prosperity", home.Prosperity),
		shared.PairF("money", home.Money),
	)
	causes := v.Log.RecentFor(model.KindTown, home.ID,
		[]string{"tax_rate", "unrest", "prosperity", "loyalty", "money"}, 4)
	w.Set(model.KindTown, home.ID, "tax_rate", next, read, causes, "holder's tax policy")
}

// neediestNeighbour returns the nearest friendly town that most needs help, and
// how badly it needs it.
func neediestNeighbour(v *sim.View, r *model.Leader) (int, float64) {
	c := v.Cfg
	best, bestNeed := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide != r.SideID || t.HolderSide < 0 || t.Holder == r.ID {
			continue
		}
		d := v.State.DistanceBetweenTowns(r.TownID, tid)
		if d > c.RulerAI.AidRangeLeagues {
			continue
		}
		// Need is food and medicine scarcity, which is what aid can actually
		// address. A rich unhappy town is not helped by a cart of grain.
		foodNeed := 1 - shared.Clamp01(t.FoodDays/c.RulerAI.AidFoodThreshold)
		medNeed := 1 - shared.Clamp01(shared.SafeDiv(t.MedicineStock, t.Population*c.World.MedicinePerCapita*2))
		need := (foodNeed + medNeed) / 2
		need *= 1 - d/c.RulerAI.AidRangeLeagues
		if need > bestNeed {
			best, bestNeed = tid, need
		}
	}
	return best, bestNeed
}

// bestTarget returns the nearest enemy town worth attacking, how weak it is,
// and how much the ruler dislikes it.
func bestTarget(v *sim.View, r *model.Leader) (int, float64, float64) {
	c := v.Cfg
	best, bestScore, bestHate := -1, 0.0, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		// Only towns of sides this ruler is at war with are targets. A ruler
		// does not simply decide to attack a neutral; the faction system is
		// what starts wars, and this system only decides what to do about one
		// that already exists.
		if t.HolderSide < 0 || !v.State.AtWar(r.SideID, t.HolderSide) {
			continue
		}
		d := v.State.DistanceBetweenTowns(r.TownID, tid)
		if d > c.RulerAI.AttackRangeLeagues {
			continue
		}
		// Weakness, seen through imperfect intelligence: the estimate is
		// blurred by how little this ruler knows, and sharper the more
		// influence and renown they have to spend on it (AI.md section 6).
		// This is why a surprise attack is possible at all, and why a ruler
		// with a large intelligence apparatus can be trusted by the player to
		// know roughly what it is looking at.
		observedFood := t.FoodStock
		observedGarrison := t.Garrison
		blur := c.RulerAI.IntelligenceBlurMax * (1 - shared.Clamp01(
			(r.Influence+r.Renown)/c.RulerAI.IntelligenceScale))
		observedFood += v.Rng.Normal(0, blur*observedFood)
		if observedFood < 0 {
			observedFood = 0
		}
		observedGarrison += v.Rng.Normal(0, blur*observedGarrison)
		if observedGarrison < 0 {
			observedGarrison = 0
		}
		weakness := (1-shared.Clamp01(shared.SafeDiv(observedFood, t.FoodDemand)/c.RulerAI.TargetFoodDays))*0.5 +
			(1-shared.Clamp01(shared.SafeDiv(observedGarrison, t.Population*c.World.GarrisonPerCapita*4)))*0.3 +
			t.Unrest*c.RulerAI.TargetUnrestWeight
		// A very small town is not worth a march; size has to count for
		// something, or the AI would always chase the weakest hamlet on the
		// map and never threaten anything.
		weakness *= shared.Clamp01(shared.SafeDiv(t.Population, c.RulerAI.TargetMinPopulationScale))
		hate := v.State.Relation(r.ID, t.Holder)
		score := weakness * (1 - d/c.RulerAI.AttackRangeLeagues)
		if score > bestScore {
			best, bestScore, bestHate = tid, weakness, hate
		}
	}
	return best, bestScore, bestHate
}

// richestNeighbourVillage returns the nearest village of another side worth
// raiding, and what it is worth.
func richestNeighbourVillage(v *sim.View, r *model.Leader) (int, float64) {
	c := v.Cfg
	best, bestValue := -1, 0.0
	for _, vid := range v.State.VillageIDs() {
		vl := v.State.Villages[vid]
		if vl.SideID == r.SideID {
			continue
		}
		home := v.State.Towns[r.TownID]
		if home == nil {
			continue
		}
		d := v.State.DistanceBetweenTowns(home.ID, vl.TownID)
		if d > c.RulerAI.RaidRangeLeagues {
			continue
		}
		// A village already raided is worth less: the raider has been there
		// and there is nothing left.
		value := shared.Clamp01(shared.SafeDiv(shared.SafeDiv(vl.Food, vl.Population), c.RulerAI.RaidFoodPerCapita)) *
			(1 - vl.RaidMemory/c.RulerAI.RaidMemoryDecayDays)
		value *= 1 - d/c.RulerAI.RaidRangeLeagues
		if value > bestValue {
			best, bestValue = vid, value
		}
	}
	return best, bestValue
}

// bestTradePartner returns the nearest town of another side with the best terms
// on offer, and the margin.
func bestTradePartner(v *sim.View, r *model.Leader) (int, float64) {
	c := v.Cfg
	best, bestMargin := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide == r.SideID || t.HolderSide < 0 {
			continue
		}
		d := v.State.DistanceBetweenTowns(r.TownID, tid)
		if d > c.RulerAI.TradeRangeLeagues {
			continue
		}
		// The margin between what goods are worth here and there, discounted
		// for the risk of the road and the distance.
		margin := (t.PriceFood - c.Market.BasePrice) * c.RulerAI.TradePriceSensitivity
		margin *= shared.Clamp01(t.RoadSafety)
		margin *= 1 - d/c.RulerAI.TradeRangeLeagues
		if margin > bestMargin {
			best, bestMargin = tid, margin
		}
	}
	return best, bestMargin
}

// bestBlockadeTarget returns the nearest port of an enemy side worth starving.
func bestBlockadeTarget(v *sim.View, r *model.Leader) (int, float64) {
	c := v.Cfg
	best, bestNeed := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide < 0 || !v.State.AtWar(r.SideID, t.HolderSide) {
			continue
		}
		// A blockade needs a port and a target that cannot feed itself. A
		// farming region is not blockaded; a port city that imports is.
		if !t.IsPort {
			continue
		}
		need := shared.Clamp01(shared.SafeDiv(t.FoodImports, t.FoodDemand)) * c.RulerAI.BlockadeImportDependency
		if t.FoodDays > c.RulerAI.BlockadeTargetFoodDays {
			need *= 0.2
		}
		d := v.State.DistanceBetweenTowns(r.TownID, tid)
		if d > c.RulerAI.AttackRangeLeagues {
			continue
		}
		need *= 1 - d/c.RulerAI.AttackRangeLeagues
		if need > bestNeed {
			best, bestNeed = tid, need
		}
	}
	return best, bestNeed
}

// distanceFactor discounts a choice by how far away its target is. A ruler
// two hundred leagues from a problem will not solve it, and distance is the
// single most important limit on what any AI in this game can do.
func distanceFactor(v *sim.View, r *model.Leader, targetTown int) float64 {
	d := 0.0
	if r.TownID >= 0 && targetTown >= 0 {
		d = v.State.DistanceBetweenTowns(r.TownID, targetTown)
	}
	return 1 / (1 + d/v.Cfg.RulerAI.DistancePenalty)
}

func b2f(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

func reasonText(r model.Reason) string {
	switch r {
	case model.ReasonWeakTarget:
		return "the target is weak"
	case model.ReasonHoldingsThreatened:
		return "own holdings are threatened"
	case model.ReasonFoodShortage:
		return "food is short"
	case model.ReasonGreed:
		return "greed"
	case model.ReasonRevenge:
		return "revenge"
	case model.ReasonAmbition:
		return "ambition"
	case model.ReasonDuty:
		return "duty"
	case model.ReasonMercy:
		return "mercy"
	case model.ReasonTradeProfit:
		return "trade profit"
	case model.ReasonSafeDistance:
		return "nothing worth doing"
	case model.ReasonExhausted:
		return "exhausted"
	case model.ReasonBroke:
		return "broke"
	case model.ReasonAllyObligation:
		return "an ally's obligation"
	case model.ReasonGrievance:
		return "a grievance"
	default:
		return ""
	}
}
