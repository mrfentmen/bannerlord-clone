// Package campaign turns ruler intentions into movement.
//
// Reads each party's intended_action and reason, and writes its activity,
// destination, and marching order. It is the seam between AI.md's "AI writes
// intentions" and MARCH_AND_WAR's "a march takes time over real distance":
// the ruler AI decides, this system issues the order, and the march system
// moves the party. Three systems, no calls between them.
//
// The player uses the same path. A player order becomes an intention, and a
// scripted profile's order becomes an intention, so a headless run with a
// "dumb player" exercises exactly the machinery a real player would.
package campaign

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the campaign system.
func System() sim.System {
	return sim.System{
		Name: "campaign",
		Doc:  "turns each party's intention into an activity and a marching order",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p.Troops <= 0 {
			continue
		}
		// A party already committed to something finishes it. Re-deciding
		// mid-campaign would mean abandoning a siege because something more
		// attractive came up, which is not how any of this works.
		switch p.Activity {
		case model.ActMarching, model.ActSieging, model.ActRaiding, model.ActResupplying:
			continue
		}

		// A party that cannot act is sent home to recover. This is what ends
		// chain 6's overlong march: not a rout, but a withdrawal, once morale
		// falls past the point where the ruler's own scoring prefers being at
		// home.
		if p.Morale < c.Campaign.BreakMorale && p.DaysOut > c.Campaign.BreakAfterDaysOut {
			if p.HomeTown >= 0 {
				home := v.State.Towns[p.HomeTown]
				if home != nil {
					w.Set(model.KindParty, pid, "activity", float64(model.ActReturning), "broken", nil, "army breaking, returning home")
					w.Set(model.KindParty, pid, "dest_x", home.X, "broken", nil, "")
					w.Set(model.KindParty, pid, "dest_y", home.Y, "broken", nil, "")
					w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "broken", nil, "")
					continue
				}
			}
		}

		switch p.Intention {
		case model.IntentAttack:
			issueAttack(v, w, pid, p)
		case model.IntentRaid:
			issueRaid(v, w, pid, p)
		case model.IntentAid:
			issueAid(v, w, pid, p)
		case model.IntentTrade:
			issueTrade(v, w, pid, p)
		case model.IntentBlockade:
			issueBlockade(v, w, pid, p)
		case model.IntentDefend:
			issueDefend(v, w, pid, p)
		case model.IntentAlly:
			// Leaving one's own side is handled by the council and relation
			// systems, which own holdings and opinion. This system only
			// records the intention having been acted on, so the reason does
			// not stay in the party forever.
			w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "acted on", nil, "")
		default:
			// Waiting. The party rests where it stands, which the march system
			// reads as activity=idle and turns into fatigue recovery.
			w.Set(model.KindParty, pid, "activity", float64(model.ActIdle), "waiting", nil, "")
		}
	}
}

// issueAttack sends a party at a chosen enemy town.
func issueAttack(v *sim.View, w *sim.WriteSet, pid int, p *model.Party) {
	c := v.Cfg
	target := bestEnemyTown(v, p)
	if target < 0 {
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "no target", nil, "")
		return
	}
	// A ruler does not set out without food for the journey. This is the
	// supply check, enforced at the point the order is issued rather than
	// trusted to the scoring.
	if p.DaysFood < c.Campaign.MinDaysFoodToMarch {
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone),
			shared.Pair("days_food", p.DaysFood), nil, "not enough food to march")
		return
	}
	t := v.State.Towns[target]
	// Besieging a walled town takes metal, so a party with none besieges from
	// a distance instead: it camps outside and waits, which is what turns a
	// siege into a starvation contest.
	activity := model.ActSieging
	if p.Metal < c.Campaign.MinMetalToBesiege {
		activity = model.ActMarching
	}
	w.Set(model.KindParty, pid, "activity", float64(activity), "attacking", nil, "marches to attack")
	w.Set(model.KindParty, pid, "dest_town", float64(target), "attacking", nil, "")
	w.Set(model.KindParty, pid, "dest_x", t.X, "attacking", nil, "")
	w.Set(model.KindParty, pid, "dest_y", t.Y, "attacking", nil, "")
	if activity == model.ActSieging {
		w.Set(model.KindParty, pid, "is_sieging", 1, "attacking", nil, "besieging")
	}
}

// issueRaid sends a party at a neighbouring village.
func issueRaid(v *sim.View, w *sim.WriteSet, pid int, p *model.Party) {
	c := v.Cfg
	best, bestValue := -1, 0.0
	for _, vid := range v.State.VillageIDs() {
		vl := v.State.Villages[vid]
		if vl.SideID == p.SideID {
			continue
		}
		home := v.State.Towns[p.HomeTown]
		if home == nil {
			continue
		}
		if v.State.DistanceBetweenTowns(home.ID, vl.TownID) > c.Campaign.RaidRangeLeagues {
			continue
		}
		value := vl.Food * (1 - vl.RaidMemory/c.Campaign.RaidMemoryDecayDays)
		if value > bestValue {
			best, bestValue = vid, value
		}
	}
	if best < 0 {
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "no raid target", nil, "")
		return
	}
	vl := v.State.Villages[best]
	w.Set(model.KindParty, pid, "activity", float64(model.ActRaiding), "raiding", nil, "rides to raid")
	w.Set(model.KindParty, pid, "raid_target", float64(best), "raiding", nil, "")
	w.Set(model.KindParty, pid, "dest_x", vl.X, "raiding", nil, "")
	w.Set(model.KindParty, pid, "dest_y", vl.Y, "raiding", nil, "")
	w.Set(model.KindParty, pid, "dest_town", float64(vl.TownID), "raiding", nil, "")
}

// issueAid sends a party carrying food and medicine to a suffering neighbour.
func issueAid(v *sim.View, w *sim.WriteSet, pid int, p *model.Party) {
	c := v.Cfg
	best, bestNeed := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide != p.SideID {
			continue
		}
		d := v.State.DistanceBetweenTowns(p.HomeTown, tid)
		if d > c.Campaign.AidRangeLeagues {
			continue
		}
		need := (1 - shared.Clamp01(t.FoodDays/c.Campaign.AidFoodThreshold)) +
			(1 - shared.Clamp01(shared.SafeDiv(t.MedicineStock, t.Population*c.World.MedicinePerCapita*2)))
		if need > bestNeed {
			best, bestNeed = tid, need
		}
	}
	if best < 0 {
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "no one to aid", nil, "")
		return
	}
	// The load is taken from the party's own larder, so aid costs the sender
	// something. Aid that were free would be sent to everyone, every day, and
	// chain 5's recovery would prove nothing.
	load := p.Food * c.Campaign.AidLoadShare
	medicine := p.Medicine * c.Campaign.AidMedicineShare
	w.Add(model.KindParty, pid, "party_food", -load, "sending aid", nil, "cargo loaded for aid")
	w.Add(model.KindParty, pid, "party_medicine", -medicine, "sending aid", nil, "cargo loaded for aid")
	w.Set(model.KindParty, pid, "cargo_food", load, "sending aid", nil, "")
	w.Set(model.KindParty, pid, "cargo_medicine", medicine, "sending aid", nil, "")
	t := v.State.Towns[best]
	w.Set(model.KindParty, pid, "activity", float64(model.ActMarching), "sending aid", nil, "carrying aid")
	w.Set(model.KindParty, pid, "dest_town", float64(best), "sending aid", nil, "")
	w.Set(model.KindParty, pid, "dest_x", t.X, "sending aid", nil, "")
	w.Set(model.KindParty, pid, "dest_y", t.Y, "sending aid", nil, "")
}

// issueTrade sends a caravan between a cheap town and an expensive one.
func issueTrade(v *sim.View, w *sim.WriteSet, pid int, p *model.Party) {
	c := v.Cfg
	best, bestMargin := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide == p.SideID {
			continue
		}
		d := v.State.DistanceBetweenTowns(p.HomeTown, tid)
		if d > c.Campaign.TradeRangeLeagues {
			continue
		}
		margin := (t.PriceFood - c.Market.BasePrice) * shared.Clamp01(t.RoadSafety) * (1 - d/c.Campaign.TradeRangeLeagues)
		if margin > bestMargin {
			best, bestMargin = tid, margin
		}
	}
	if best < 0 {
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "no trade", nil, "")
		return
	}
	t := v.State.Towns[best]
	// A merchant buys where it is cheap, so the party carries gold and picks
	// up goods on arrival. Modelled as arriving money and the destination
	// converting it, which is the same mechanism the logistics system uses for
	// its own caravans.
	w.Set(model.KindParty, pid, "activity", float64(model.ActTrading), "trading", nil, "runs a trade caravan")
	w.Set(model.KindParty, pid, "dest_town", float64(best), "trading", nil, "")
	w.Set(model.KindParty, pid, "dest_x", t.X, "trading", nil, "")
	w.Set(model.KindParty, pid, "dest_y", t.Y, "trading", nil, "")
	w.Set(model.KindParty, pid, "party_money", p.Money*c.Campaign.TradeCapitalShare, "trading", nil, "trade capital")
}

// issueBlockade sends a party to sit off an enemy port and cut its trade.
func issueBlockade(v *sim.View, w *sim.WriteSet, pid int, p *model.Party) {
	c := v.Cfg
	best, bestNeed := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if !t.IsPort || t.HolderSide < 0 || !v.State.AtWar(p.SideID, t.HolderSide) {
			continue
		}
		d := v.State.DistanceBetweenTowns(p.HomeTown, tid)
		if d > c.Campaign.AttackRangeLeagues {
			continue
		}
		need := shared.Clamp01(shared.SafeDiv(t.FoodImports, t.FoodDemand)) * (1 - d/c.Campaign.AttackRangeLeagues)
		if need > bestNeed {
			best, bestNeed = tid, need
		}
	}
	if best < 0 {
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "no port to blockade", nil, "")
		return
	}
	t := v.State.Towns[best]
	w.Set(model.KindParty, pid, "activity", float64(model.ActMarching), "blockading", nil, "blockades a port")
	w.Set(model.KindParty, pid, "dest_town", float64(best), "blockading", nil, "")
	w.Set(model.KindParty, pid, "dest_x", t.X, "blockading", nil, "")
	w.Set(model.KindParty, pid, "dest_y", t.Y, "blockading", nil, "")
}

// issueDefend sends a party home to its own town.
func issueDefend(v *sim.View, w *sim.WriteSet, pid int, p *model.Party) {
	home := v.State.Towns[p.HomeTown]
	if home == nil {
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), "no home", nil, "")
		return
	}
	w.Set(model.KindParty, pid, "activity", float64(model.ActReturning), "defending", nil, "returns to defend")
	w.Set(model.KindParty, pid, "dest_town", float64(p.HomeTown), "defending", nil, "")
	w.Set(model.KindParty, pid, "dest_x", home.X, "defending", nil, "")
	w.Set(model.KindParty, pid, "dest_y", home.Y, "defending", nil, "")
}

// bestEnemyTown returns the enemy town a party should attack: weak, close, and
// worth taking.
func bestEnemyTown(v *sim.View, p *model.Party) int {
	c := v.Cfg
	best, bestScore := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide < 0 || !v.State.AtWar(p.SideID, t.HolderSide) {
			continue
		}
		d := v.State.DistanceBetweenTowns(p.HomeTown, tid)
		if d > c.Campaign.AttackRangeLeagues {
			continue
		}
		// Weakness here is the party's own direct observation, not a blurred
		// estimate: it is close enough to see. The ruler AI's blurred estimate
		// decides which target is chosen; this decides whether the march is
		// worth starting, and it reads the truth.
		weakness := 1 - shared.Clamp01(shared.SafeDiv(t.FoodStock, t.FoodDemand)/c.Campaign.TargetFoodDays)
		weakness += 1 - shared.Clamp01(shared.SafeDiv(t.Garrison, p.Troops*c.Campaign.GarrisonAdvantage))
		weakness += t.Unrest
		// Value: a big town is worth taking, a hamlet is not worth the march.
		value := shared.Clamp01(shared.SafeDiv(t.Population, c.Campaign.TargetMinPopulationScale))
		score := (weakness + value) * (1 - d/c.Campaign.AttackRangeLeagues)
		if score > bestScore {
			best, bestScore = tid, score
		}
	}
	return best
}
