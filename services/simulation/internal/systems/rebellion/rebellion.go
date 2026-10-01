// Package rebellion models town uprisings (Tier 2.2).
//
// In Bannerlord, when a fief's loyalty drops below 25, there's a 25%/day
// chance it rebels: the town flips to a rebel clan, the garrison joins the
// rebels, and the former owner loses the fief.
//
// Modern American equivalent: when a town's loyalty to its faction drops
// too low (neglect, high taxes, cultural differences), the locals rise up.
// The town declares independence, forming or joining a rebel organization.
//
// Mechanics:
//   - Towns with loyalty < 0.25 have a 25% chance per day to rebel.
//   - On rebellion: the town's HolderSide becomes -1 (independent), a new
//     rebel Organization is created (or an existing rebel org takes over),
//     and the garrison becomes a rebel party.
//   - Rebel towns are hostile to their former owner.
//   - Low-loyalty militia fights harder (up to +200% strength) - the
//     militia system already handles this via the loyalty modifier.
//
// This runs after the loyalty system so it sees the updated loyalty.
package rebellion

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// rebellionLoyaltyThreshold is the loyalty below which rebellion is possible.
	rebellionLoyaltyThreshold = 0.25
	// rebellionChancePerDay is the daily probability of rebellion.
	rebellionChancePerDay = 0.25
)

// System returns the rebellion system.
func System() sim.System {
	return sim.System{
		Name: "rebellion",
		Doc:  "low-loyalty towns may rebel, forming independent rebel organizations",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	rng := v.Rng.Derive("rebellion")
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || t.HolderSide < 0 {
			continue
		}
		// Only towns with very low loyalty can rebel.
		if t.Loyalty >= rebellionLoyaltyThreshold {
			continue
		}
		// 25% chance per day.
		if !rng.Chance(rebellionChancePerDay) {
			continue
		}

		oldSide := t.HolderSide
		read := shared.ReadString(
			shared.Pair("loyalty", t.Loyalty),
			shared.Pair("holder_side", float64(oldSide)),
			shared.Pair("garrison", t.Garrison),
		)
		causes := v.Log.RecentFor(model.KindTown, tid,
			[]string{"loyalty", "holder_side"}, 3)

		// The town declares independence. HolderSide -> -1 (rebel/independent).
		// A full rebel Organization entity would be created by the organization
		// system; for now we mark the town as rebel-held.
		w.Set(model.KindTown, tid, "holder_side", -1, read, causes,
			"town rebels against its faction")

		// The garrison joins the rebellion (stays to defend).
		// Loyalty resets to neutral (0.5) - the rebels are loyal to themselves.
		w.Set(model.KindTown, tid, "loyalty", 0.5, read, causes,
			"rebel town loyalty resets")

		// Unrest spikes as the rebellion consolidates.
		w.Add(model.KindTown, tid, "unrest", 0.3, read, causes,
			"rebellion unrest")
	}
}
