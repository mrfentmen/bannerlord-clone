// Package smithing models town machine-shop enterprises (Tier 6).
//
// In modern America, towns with machine shops fabricate weapons (firearms)
// from metal stock. A wealth-driven leader stationed in the town oversees
// the shop, improving efficiency through their expertise and connections
// to buyers.
//
// The loop per tick:
//   - The shop consumes town metal stock (Town.Metal decreases).
//   - Fabricated weapons sell into the local market (Town.Money increases
//     by revenue, decreases by operating costs).
//   - Net profit scales with workshop level, town prosperity (rich
//     markets pay more for quality arms), and overseer skill.
//
// This is distinct from the workshop system's passive smithy production
// (a clan business). The machine shop here is a town enterprise; the
// workshop system's smithy is clan-owned. Both convert metal to money
// through different ownership.
//
// Character-level smithing details (stamina, skill progression, specific
// weapon designs) belong to the campaign client, not the world sim.
//
// Tuning constants are package-level until the config system's current
// round of edits settles, then they should move to balance.toml.
package smithing

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants. See package doc for why these live here.
const (
	// metalPerWeapon is the town metal stock consumed per forged weapon.
	metalPerWeapon = 2.0
	// operatingCostPerWeapon covers labor, charcoal, and forge maintenance.
	operatingCostPerWeapon = 15.0
	// baseWeaponValue is what a forged weapon sells for before multipliers.
	baseWeaponValue = 50.0
	// prosperityBonus scales sale price with town prosperity 0-1.
	prosperityBonus = 0.5
	// overseerBonus scales output when a wealth-ambition leader oversees.
	overseerBonus = 0.25
	// baseForgesPerDay is the forge throughput at workshop level 1.
	baseForgesPerDay = 2.0
)

// System returns the smithing system.
func System() sim.System {
	return sim.System{
		Name: "smithing",
		Doc:  "town forges convert metal to weapons; wealth leaders oversee for bonus",
		Runs: run,
	}
}

// overseer finds a wealth-ambition leader stationed in the town, if any.
func overseer(v *sim.View, townID int) *model.Leader {
	for _, id := range v.State.LeaderIDsSorted() {
		r := v.State.Leaders[id]
		if r != nil && r.IsAlive && r.TownID == townID &&
			r.Ambition == model.AmbitionWealth {
			return r
		}
	}
	return nil
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, id := range v.State.WorkshopIDs() {
		wk := v.State.Workshops[id]
		if wk == nil || wk.Type != model.WorkshopMachineShop {
			continue
		}
		t := v.State.Towns[wk.TownID]
		if t == nil {
			continue
		}
		// Throughput scales with workshop level.
		forges := baseForgesPerDay * float64(wk.Level)
		// Limited by metal stock.
		byMetal := t.Metal / metalPerWeapon
		if byMetal < forges {
			forges = byMetal
		}
		forges = float64(int(forges)) // whole weapons only
		if forges < 1.0 {
			continue
		}
		// Overseer bonus: a wealth-driven leader improves efficiency.
		efficiency := 1.0
		overseerName := ""
		if o := overseer(v, t.ID); o != nil {
			efficiency += overseerBonus
			overseerName = o.Name
		}
		// Sale price scales with prosperity.
		price := baseWeaponValue * (1.0 + t.Prosperity*prosperityBonus)
		revenue := forges * price * efficiency
		cost := forges * operatingCostPerWeapon
		metalUsed := forges * metalPerWeapon
		profit := revenue - cost
		if profit <= 0 {
			continue
		}

		read := shared.ReadString(
			shared.Pair("town_metal", t.Metal),
			shared.Pair("forges", forges),
			shared.Pair("price", price),
			shared.Pair("efficiency", efficiency),
		)
		causes := v.Log.RecentFor(model.KindTown, t.ID, []string{"metal", "prosperity"}, 3)
		note := ""
		if overseerName != "" {
			note = "overseen by " + overseerName
		}

		// Town metal consumed, net profit to town treasury.
		w.Add(model.KindTown, t.ID, "metal", -metalUsed, read, causes, note)
		w.Add(model.KindTown, t.ID, "money", profit, read, causes, note)
	}
}
