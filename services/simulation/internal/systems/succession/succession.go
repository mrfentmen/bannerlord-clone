// Package succession handles clan leadership transitions (Tier 5).
//
// When a clan leader dies, the eldest living member inherits. If no members
// remain, the clan dissolves and its fiefs become unheld. This is why clans
// matter: a dynasty that fails to produce heirs loses everything.
//
// Succession also handles the side-leader case: if the side leader dies,
// the most prestigious clan leader of that side succeeds.
package succession

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the succession system.
func System() sim.System {
	return sim.System{
		Name: "succession",
		Doc:  "transfers clan and side leadership when a leader dies",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	// --- clan succession ---
	for _, id := range v.State.ClanIDs() {
		cl := v.State.Clans[id]
		if cl == nil {
			continue
		}
		leader := v.State.Rulers[cl.LeaderID]
		if leader != nil && leader.IsAlive {
			continue
		}
		// Leader is dead or missing: find the eldest living member.
		var heir *model.Ruler
		for _, mid := range cl.MemberIDs {
			m := v.State.Rulers[mid]
			if m == nil || !m.IsAlive || m.ID == cl.LeaderID {
				continue
			}
			if heir == nil || m.Age > heir.Age {
				heir = m
			}
		}
		read := shared.ReadString(
			shared.PairI("clan", id),
			shared.PairI("old_leader", cl.LeaderID),
		)
		causes := v.Log.RecentFor(model.KindClan, id,
			[]string{"clan_renown"}, 2)
		if heir != nil {
			w.Set(model.KindClan, id, "clan_leader", float64(heir.ID),
				read, causes, "succession: eldest member inherits")
		} else {
			// No heir: the clan dissolves. Its fiefs revert to unheld.
			// Members (if any dead) are already gone; just remove the clan.
			// We cannot delete via WriteSet, so we mark it dissolved by
			// zeroing its members and leader.
			w.Set(model.KindClan, id, "clan_leader", -1, read, causes,
				"clan dissolved: no heir")
		}
	}
	// --- side succession ---
	for _, sid := range v.State.SideIDs() {
		sd := v.State.Sides[sid]
		if sd == nil {
			continue
		}
		leader := v.State.Rulers[sd.LeaderID]
		if leader != nil && leader.IsAlive {
			continue
		}
		// Find the highest-renown living clan leader of this side.
		var best *model.Ruler
		bestRenown := -1.0
		for _, cid := range v.State.ClanIDs() {
			cl := v.State.Clans[cid]
			if cl == nil || cl.SideID != sid {
				continue
			}
			l := v.State.Rulers[cl.LeaderID]
			if l == nil || !l.IsAlive {
				continue
			}
			if l.Renown > bestRenown {
				best, bestRenown = l, l.Renown
			}
		}
		if best != nil {
			read := shared.ReadString(
				shared.PairI("side", sid),
				shared.PairI("old_leader", sd.LeaderID),
				shared.PairI("new_leader", best.ID),
			)
			causes := v.Log.RecentFor(model.KindSide, sid,
				[]string{"stability"}, 2)
			// Side leader is a direct struct field; stage via a named write.
			w.Set(model.KindSide, sid, "side_leader", float64(best.ID),
				read, causes, "side succession")
		}
	}
}
