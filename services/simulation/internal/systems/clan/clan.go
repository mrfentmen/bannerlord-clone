// Package clan manages dynasties: clan membership, renown accumulation,
// tier advancement, and fief-limit enforcement (Tier 1.1–1.3).
//
// Clans are the keystone system: they unblock heirs, marriage, succession,
// and kingdom policy voting (Tier 5), and they give overextension its missing
// enforcement (DESIGN.md section 2 step 7, RISKS.md section 5).
//
// A clan belongs to one side. Rulers belong to one clan. Clan renown is the
// sum of member renown gains; tier is derived from renown thresholds.
// A clan holding more fiefs than its tier allows is overextended: its
// members' loyalty decays and its income is taxed.
package clan

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the clan system.
func System() sim.System {
	return sim.System{
		Name: "clan",
		Doc:  "manages dynasties: renown, tiers, and fief-limit enforcement",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.ClanIDs() {
		cl := v.State.Clans[id]
		if cl == nil {
			continue
		}
		// Recompute tier from renown. Tier only moves up via renown gains
		// staged by other systems; this system enforces the consequences.
		tier := model.ClanTierForRenown(cl.Renown)
		if tier != cl.Tier {
			read := shared.ReadString(
				shared.Pair("renown", cl.Renown),
				shared.PairI("old_tier", cl.Tier),
				shared.PairI("new_tier", tier),
			)
			causes := v.Log.RecentFor(model.KindClan, id, []string{"clan_renown"}, 3)
			w.Set(model.KindClan, id, "clan_tier", float64(tier), read, causes,
				"clan tier advanced")
		}
		// Fief-limit enforcement: overextended clans bleed loyalty and income.
		if cl.IsOverextended() {
			limit := cl.FiefLimit()
			over := len(cl.FiefIDs) - limit
			for _, mid := range cl.MemberIDs {
				m := v.State.Rulers[mid]
				if m == nil || !m.IsAlive {
					continue
				}
				read := shared.ReadString(
					shared.PairI("fiefs", len(cl.FiefIDs)),
					shared.PairI("limit", limit),
					shared.PairI("over", over),
				)
				causes := v.Log.RecentFor(model.KindClan, id, []string{"clan_fiefs"}, 2)
				penalty := c.Clan.OverextensionLoyaltyPenalty * float64(over)
				w.Add(model.KindRuler, mid, "loyalty_to_leader", -penalty,
					read, causes, "overextended clan")
			}
		}
	}
}
