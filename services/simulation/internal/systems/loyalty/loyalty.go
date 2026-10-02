// Package loyalty tracks how attached a town's people are to whoever holds it,
// and stages the pressure that can unseat them.
//
// Reads unrest, tax rate, the conditions a raid or a broken pledge leaves
// behind, and outside offers, and writes loyalty. Loyalty is what the council
// vote system reads, so it is the last link of chain 1 before a ruler loses a
// town, and it is also the field that recovers when things go well, which is
// what makes chain 5 possible.
package loyalty

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the loyalty system.
func System() sim.System {
	return sim.System{
		Name: "loyalty",
		Doc:  "tracks attachment to the current holder from anger, taxes, raids, broken oaths, and outside offers",
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

		// Anger erodes loyalty. This is the direct route of chain 1: unrest
		// rises, loyalty falls, and the council votes. The unrest system
		// already knows why unrest is high; this system only needs the number.
		unrestLoss := 0.0
		if t.Unrest > c.Unrest.LoyaltyFloorUnrest {
			unrestLoss = c.Loyalty.UnrestWeight * (t.Unrest - c.Unrest.LoyaltyFloorUnrest)
		}

		// Taxes above the comfort level erode loyalty directly, not only
		// through unrest. People resent being taxed badly even when they are not
		// yet angry enough to be afraid.
		taxLoss := c.Loyalty.TaxWeight * shared.Clamp01(t.TaxRate-c.Unrest.TaxComfortRate)

		// Raids. A town that has been raided remembers it, and blames whoever
		// could not protect it. RaidMemory on the linked villages is how a
		// raider's work is felt here without the raid system calling anything.
		raidLoss := 0.0
		raided := false
		for _, vid := range v.State.VillageIDs() {
			vl := v.State.Villages[vid]
			if vl.TownID == id && vl.RaidMemory > 0 {
				raided = true
				raidLoss += c.Loyalty.RaidHit * shared.Clamp01(vl.RaidMemory/60)
			}
		}

		// A broken promise between this town's holder and someone else is
		// noticed locally too: word travels, and a ruler who breaks his word
		// is harder to trust anywhere. This is chain 9's local half; the
		// international half is the relation system.
		brokenOathLoss := 0.0
		holder := v.State.Leaders[t.Holder]
		if holder != nil && holder.BrokenOaths > 0 {
			brokenOathLoss = c.Loyalty.BrokenPromiseHit * shared.Clamp01(float64(holder.BrokenOaths)/3)
		}

		// An outside offer. The pull of being able to leave is constant, and
		// stronger when the current holder is hated. "Hated" means real
		// unrest: gating on the loyalty floor keeps a mildly discontent town
		// (unrest 0.1) from bleeding loyalty every day, which rebelled the
		// whole map within two months (depop 2026-10-02). The service gain
		// (0.0035/day) can never outrun an ungated 0.55*unrest pull.
		outsidePull := c.Loyalty.OutsideOfferBase
		if t.Unrest > c.Unrest.LoyaltyFloorUnrest {
			outsidePull += c.Loyalty.OutsideOfferWeight * (t.Unrest - c.Unrest.LoyaltyFloorUnrest)
		}
		// A neighbouring town that is doing markedly better is a standing
		// temptation.
		for _, other := range v.State.TownIDs() {
			if other == id {
				continue
			}
			o := v.State.Towns[other]
			if o.Population <= 0 {
				continue
			}
			// Only nearby towns tempt: distance is what makes a move costly.
			if v.State.DistanceBetweenTowns(id, other) > c.Loyalty.OfferRangeLeagues {
				continue
			}
			if o.Loyalty > t.Loyalty+c.Loyalty.OfferGap {
				outsidePull += c.Loyalty.OutsideOfferWeight * shared.Clamp01((o.Loyalty-t.Loyalty)/0.4) * c.Loyalty.OfferProximityWeight
			}
		}

		// Competent governance earns loyalty slowly. This is chain 5's
		// direction: deliver medicine and food, unrest falls, and here the
		// loyalty climbs back. Without this term a town could only ever lose.
		service := 0.0
		if holder != nil {
			service = c.Loyalty.ServiceGain * holder.Traits.Generosity
			// A merciful holder is personally trusted.
			service += (holder.Traits.Mercy - 0.5) * c.Loyalty.ServiceGain
			// An honest holder is trusted too, which matters because honour is
			// what stops a ruler taking the dishonest shortcut.
			service += (holder.Traits.Honor - 0.5) * c.Loyalty.ServiceGain
		}
		if t.Unrest < 0.3 {
			service += c.Loyalty.ServiceGain * (1 - shared.Clamp01(t.Unrest/0.3))
		}

		// Total daily change, then recovery toward the ceiling. Recovery only
		// happens when the losses are small: a town in crisis does not drift
		// back to loyalty just because time passed.
		loss := unrestLoss + taxLoss + raidLoss + brokenOathLoss + outsidePull
		delta := service - loss
		// A slow upward drift when nothing is wrong, so a well-run town tends
		// toward contentment rather than sitting at its starting value.
		if delta >= 0 {
			delta += c.Council.LoyaltyDriftPerDay * (1 - t.Loyalty)
		}

		newLoyalty := shared.Clamp(t.Loyalty+delta, 0, c.Loyalty.LoyaltyCap)

		// A defeated town that has been overrun is loyal to nobody, and its
		// loyalty does not matter until it has a holder again.
		read := shared.ReadString(
			shared.Pair("unrest", t.Unrest),
			shared.Pair("tax_rate", t.TaxRate),
			shared.Pair("loyalty", t.Loyalty),
			shared.Pair("holder", float64(t.Holder)),
			shared.PairB("raided", raided),
			shared.Pair("outside_pull", outsidePull),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"unrest", "tax_rate", "loyalty", "holder", "recent_deaths", "food_stock", "village_raid_memory", "broken_oaths"}, 6)

		w.Add(model.KindTown, id, "loyalty", newLoyalty-t.Loyalty, read, causes, "")
	}
}
