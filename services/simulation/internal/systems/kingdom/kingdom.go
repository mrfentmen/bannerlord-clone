// Package kingdom handles founding new factions (Tier 1.9).
//
// In modern America, an organization leader at tier 4+ who holds a town
// can break away and found their own independent faction. This is the
// endgame of the organization layer: from wandering operator to
// organization leader to faction founder.
//
// Requirements:
// - Organization tier 4+ (renown 900+)
// - Holds at least one town
// - Not already part of a faction (or leaves current one)
//
// Founding creates a new Side entity, transfers the clan's fiefs to it,
// and makes the clan leader the kingdom's ruler.
package kingdom

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the kingdom-founding system.
func System() sim.System {
	return sim.System{
		Name: "kingdom",
		Doc:  "allows tier-4+ clan leaders holding towns to found kingdoms",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, cid := range v.State.OrganizationIDs() {
		cl := v.State.Organizations[cid]
		if cl == nil {
			continue
		}
		leader := v.State.Leaders[cl.LeaderID]
		if leader == nil || !leader.IsAlive {
			continue
		}

		// Check requirements.
		tier := clanTier(leader.Renown)
		if tier < 4 {
			continue
		}
		if !holdsTown(v, cid) {
			continue
		}
		if cl.WantsKingdom <= 0 {
			// The clan hasn't declared its intent to found a kingdom.
			// This is set by player order or AI ambition.
			continue
		}

		// Found the kingdom!
		foundKingdom(v, w, cl, leader)
	}
}

// clanTier returns the clan tier from renown (Bannerlord thresholds).
func clanTier(renown float64) int {
	switch {
	case renown >= 6150:
		return 6
	case renown >= 2350:
		return 5
	case renown >= 900:
		return 4
	case renown >= 350:
		return 3
	case renown >= 150:
		return 2
	case renown >= 50:
		return 1
	default:
		return 0
	}
}

// holdsTown checks if the clan holds at least one town.
func holdsTown(v *sim.View, clanID int) bool {
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t != nil && t.Holder == clanID {
			return true
		}
	}
	return false
}

func foundKingdom(v *sim.View, w *sim.WriteSet, cl *model.Organization, leader *model.Leader) {
	read := shared.ReadString(
		shared.PairI("clan", cl.ID),
		shared.PairI("leader", leader.ID),
		shared.PairF("renown", leader.Renown),
	)
	causes := v.Log.RecentFor(model.KindOrganization, cl.ID,
		[]string{"clan_renown"}, 2)

	// Create the new Side. The kingdom starts with the clan's fiefs.
	w.CreateEntity(func(s *model.State) {
		newID := s.NewID(model.IDSide)
		s.Sides[newID] = &model.Side{
			ID:        newID,
			Name:      cl.Name + " Kingdom",
			LeaderID:  leader.ID,
			Stability: 50,
		}
		// Transfer clan's towns to the new kingdom.
		for _, tid := range s.TownIDs() {
			t := s.Towns[tid]
			if t != nil && t.Holder == cl.ID {
				t.HolderSide = newID
			}
		}
		// The clan's side changes to the new kingdom.
		cl.SideID = newID
	})

	w.Set(model.KindOrganization, cl.ID, "wants_kingdom", 0,
		read, causes, "kingdom founded")
}
