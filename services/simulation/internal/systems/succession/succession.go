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
	for _, id := range v.State.OrganizationIDs() {
		cl := v.State.Organizations[id]
		if cl == nil {
			continue
		}
		leader := v.State.Leaders[cl.LeaderID]
		if leader != nil && leader.IsAlive {
			continue
		}
		// Leader is dead or missing: find the eldest living member.
		var heir *model.Leader
		for _, mid := range cl.MemberIDs {
			m := v.State.Leaders[mid]
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
		causes := v.Log.RecentFor(model.KindOrganization, id,
			[]string{"clan_renown"}, 2)
		if heir != nil {
			w.Set(model.KindOrganization, id, "clan_leader", float64(heir.ID),
				read, causes, "succession: eldest member inherits")
			continue
		}
		// No heir: the clan dissolves. Every fief it still holds reverts to
		// unheld, its workshops are disowned, and the clan entity itself is
		// removed, so a dynasty that fails to produce heirs stops existing
		// instead of lingering as a clan with no leader that keeps collecting
		// its members' income and taxing them for fiefs nobody governs.
		releaseFiefs(v, w, cl, causes)
		disownWorkshops(v, w, id, read, causes)
		// The leader write is the cause-log record of the dissolution: an
		// entity removal stages no row of its own, and a dynasty dying out is
		// exactly the kind of event the log exists to show. The delete below
		// is applied after it, so the row survives the clan.
		w.Set(model.KindOrganization, id, "clan_leader", -1, read, causes,
			"clan dissolved: no heir")
		w.DeleteEntity(model.KindOrganization, id)
	}
	// --- side succession ---
	for _, sid := range v.State.SideIDs() {
		sd := v.State.Sides[sid]
		if sd == nil {
			continue
		}
		leader := v.State.Leaders[sd.LeaderID]
		if leader != nil && leader.IsAlive {
			continue
		}
		// Find the highest-renown living clan leader of this side.
		var best *model.Leader
		bestRenown := -1.0
		for _, cid := range v.State.OrganizationIDs() {
			cl := v.State.Organizations[cid]
			if cl == nil || cl.SideID != sid {
				continue
			}
			l := v.State.Leaders[cl.LeaderID]
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

// releaseFiefs unholds every town the dissolving clan still holds.
//
// A fief is only released if its current holder is this clan. The clan list is
// bookkeeping that can lag a town that has already changed hands this tick, and
// a town that was conquered or voted away is no longer this clan's to give up;
// unholding it would undo that. Writing holder and holder_side to -1 is how a
// town becomes unowned everywhere else too (the council's secession and the
// security system's rebellion), and it is the value every other system tests
// for independence.
func releaseFiefs(v *sim.View, w *sim.WriteSet, cl *model.Organization, causes []int) {
	held := make(map[int]bool, len(cl.MemberIDs)+1)
	for _, mid := range cl.MemberIDs {
		held[mid] = true
	}
	held[cl.LeaderID] = true

	for _, fid := range cl.FiefIDs {
		t := v.State.Towns[fid]
		if t == nil || t.Holder < 0 || !held[t.Holder] {
			continue
		}
		fiefRead := shared.ReadString(
			shared.PairI("fiefs", len(cl.FiefIDs)),
			shared.PairI("fief", fid),
			shared.PairI("old_holder", t.Holder),
			shared.PairI("old_holder_side", t.HolderSide),
		)
		w.Set(model.KindTown, fid, "holder", -1, fiefRead, causes,
			"clan dissolved: fief unheld")
		w.Set(model.KindTown, fid, "holder_side", -1, fiefRead, causes,
			"clan dissolved: fief unheld")
	}
}

// disownWorkshops sets the clan's workshops to unowned so they do not keep
// drawing on the renown of a clan that no longer exists.
func disownWorkshops(v *sim.View, w *sim.WriteSet, clanID int, read string, causes []int) {
	for _, wid := range v.State.WorkshopIDs() {
		wk := v.State.Workshops[wid]
		if wk == nil || wk.OwnerOrganizationID != clanID {
			continue
		}
		w.Set(model.KindWorkshop, wid, "workshop_owner_clan", -1, read, causes,
			"clan dissolved: workshop unowned")
	}
}
