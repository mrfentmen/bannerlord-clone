// Package sneak models infiltration of hostile towns (Tier 6).
//
// In Bannerlord, when a town's gates are barred to you (hostile faction),
// you can sneak in disguised as a civilian. This system models AI parties
// doing the same: small parties whose destination is a hostile town have
// a chance to slip past the guards instead of being turned away.
//
// Mechanics:
//   - A party with DestTown set to a town whose HolderSide is hostile to
//     the party's side may attempt to sneak.
//   - Success chance scales inversely with party size (smaller = stealthier)
//     and with the town's garrison (more guards = harder).
//   - On success, the party enters the town (no state change needed; the
//     march system handles arrival). On failure, the party is turned away:
//     its destination is cleared and it takes a morale hit.
//   - Uses the tick's RNG via a named substream for determinism.
//
// This runs before the march system so a failed sneak can redirect the
// party before it arrives.
package sneak

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// baseSneakChance is the success rate for a minimal party vs no garrison.
	baseSneakChance = 0.8
	// sizePenalty is how much each troop reduces sneak chance.
	sizePenalty = 0.005
	// garrisonPenalty is how much each garrison troop reduces sneak chance.
	garrisonPenalty = 0.002
	// minSneakChance floors the probability.
	minSneakChance = 0.05
	// maxSneakSize is the party size above which sneaking is impossible.
	maxSneakSize = 100.0
)

// System returns the sneak system.
func System() sim.System {
	return sim.System{
		Name: "sneak",
		Doc:  "small parties may infiltrate hostile towns instead of being turned away",
		Runs: run,
	}
}

// sneakChance computes the success probability.
func sneakChance(partySize, garrison float64) float64 {
	c := baseSneakChance - partySize*sizePenalty - garrison*garrisonPenalty
	return shared.Clamp(c, minSneakChance, 1.0)
}

func run(v *sim.View, w *sim.WriteSet) {
	rng := v.Rng.Derive("sneak")
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.DestTown < 0 {
			continue
		}
		t := v.State.Towns[p.DestTown]
		if t == nil {
			continue
		}
		// Only for hostile towns: holder side is at war with party side.
		if t.HolderSide < 0 || !v.State.AtWar(p.SideID, t.HolderSide) {
			continue
		}
		// Too big to sneak.
		if p.Troops > maxSneakSize {
			continue
		}
		// Already in the town (not traveling).
		if p.X == t.X && p.Y == t.Y {
			continue
		}
		// Only attempt sneak when close to the town (within ~1 tick of
		// travel). This prevents repeated morale farming on long journeys;
		// the sneak is a single infiltration attempt at the gates.
		dx := p.X - t.X
		dy := p.Y - t.Y
		distSq := dx*dx + dy*dy
		// 50 units is roughly one tick's march distance.
		if distSq > 50*50 {
			continue
		}

		chance := sneakChance(p.Troops, t.Garrison)
		read := shared.ReadString(
			shared.Pair("party_troops", p.Troops),
			shared.Pair("garrison", t.Garrison),
			shared.Pair("chance", chance),
		)
		causes := v.Log.RecentFor(model.KindTown, t.ID, []string{"garrison"}, 3)

		if rng.Chance(chance) {
			// Success: the party slips in. Log it; arrival proceeds normally.
			w.Add(model.KindParty, pid, "morale", 0.05, read, causes,
				"sneaked into hostile town")
		} else {
			// Failure: turned away at the gates. Clear destination, morale hit.
			w.Add(model.KindParty, pid, "morale", -0.1, read, causes,
				"caught sneaking, turned away")
			// Clearing DestTown redirects the party; the march system will
			// see no destination and hold position.
			w.Set(model.KindParty, pid, "dest_town", -1, read, causes,
				"turned away from hostile town")
		}
	}
}
