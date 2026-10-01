// Package election runs presidential elections and succession for each
// faction, porting real-world democratic mechanics into the modern-America
// setting.
//
// Every faction elects a president on a fixed cycle (Election.TermYears,
// default 4). The incumbent may run for re-election up to Election.MaxTerms.
// If the president dies in office — assassination is always possible, and
// likelier when they leave the capital or when the faction is unstable —
// the VP succeeds immediately, then the line continues by influence. A
// successor serves out the remainder of the term; the election clock does
// not reset.
//
// The system never reads "the game wants a result". Elections are scored
// from influence + renown with a seeded random component, so the same seed
// always produces the same presidents.
package election

import (
	"sort"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// System returns the election system.
func System() sim.System {
	return sim.System{
		Name: "election",
		Doc:  "presidential elections every N years, VP succession on death, assassination risk",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	cfg := v.Cfg.Election
	termTicks := int(cfg.TermYears * 365)

	for _, sideID := range v.State.SideIDs() {
		side := v.State.Sides[sideID]
		president := v.State.Rulers[side.LeaderID]
		presidentAlive := president != nil && president.IsAlive

		// 1. Assassination check on a living president.
		if presidentAlive {
			p := cfg.AssassinationBaseRate
			if !side.PresidentInDC {
				p *= cfg.TravelRiskMultiplier
			}
			// Unstable factions are dangerous for their leaders:
			// risk rises as stability falls (stability is 0-1).
			p += cfg.UnrestRiskScale * (1 - side.Stability)
			if v.Rng.Float64() < p {
				w.Set(model.KindRuler, president.ID, "is_alive", 0, "election",
					[]int{president.ID}, "assassinated")
				presidentAlive = false
			}
		}

		// 2. Succession: president dead -> VP takes office, then by influence.
		// Runs same-tick as an assassination (writes are staged, so the view
		// still shows the old state — hence the local flag, not a re-read).
		if !presidentAlive {
			// Exclude the deceased: staged death isn't visible in the view yet.
			deadID := 0
			if president != nil {
				deadID = president.ID
			}
			if successor := pickSuccessor(v, side, deadID); successor != nil {
				installPresident(v, w, side, successor.ID, true)
			}
			continue
		}

		// 3. Scheduled election every term.
		if v.Tick-side.LastElectionTick >= termTicks {
			holdElection(v, w, side, cfg)
		}
	}
}

// pickSuccessor returns the VP if alive and free, else the highest-influence
// living, uncaptured ruler of the side. excludeID is the deceased (whose
// staged death is not yet visible in the view); the sitting leader is never
// their own successor. Nil if no one qualifies.
func pickSuccessor(v *sim.View, side *model.Side, excludeID int) *model.Ruler {
	if vp := v.State.Rulers[side.VicePresidentID]; vp != nil && vp.ID != excludeID &&
		vp.ID != side.LeaderID && vp.IsAlive && vp.CapturedBy == 0 {
		return vp
	}
	return bestCandidateExcluding(v, side.ID, excludeID, side.LeaderID)
}

// bestCandidateExcluding returns the highest influence+renown eligible ruler
// of a side, skipping every ID in exclude. Ties break by ID for determinism.
func bestCandidateExcluding(v *sim.View, sideID int, exclude ...int) *model.Ruler {
	skip := map[int]bool{}
	for _, id := range exclude {
		skip[id] = true
	}
	var best *model.Ruler
	bestScore := -1.0
	for _, id := range v.State.RulerIDsSorted() {
		r := v.State.Rulers[id]
		if r.SideID != sideID || !r.IsAlive || r.CapturedBy != 0 || skip[r.ID] {
			continue
		}
		if score := r.Influence + r.Renown; score > bestScore {
			bestScore, best = score, r
		}
	}
	return best
}

// installPresident swears in a new president. If viaSuccession, they serve out
// the remainder of the term (the election clock keeps running) and the term
// count resets; otherwise the clock resets and the term count updates.
func installPresident(v *sim.View, w *sim.WriteSet, side *model.Side, rulerID int, viaSuccession bool) {
	old := side.LeaderID

	if oldRuler := v.State.Rulers[old]; oldRuler != nil && old != rulerID {
		w.Set(model.KindRuler, old, "leader", 0, "election", nil, "left office")
	}
	w.Set(model.KindRuler, rulerID, "leader", 1, "election", nil, "took office")
	w.Set(model.KindSide, side.ID, "side_leader", float64(rulerID), "election", nil, "new president")

	if vp := bestCandidateExcluding(v, side.ID, rulerID); vp != nil {
		w.Set(model.KindSide, side.ID, "vice_president", float64(vp.ID), "election", nil, "new VP")
	} else {
		w.Set(model.KindSide, side.ID, "vice_president", 0, "election", nil, "no eligible VP")
	}

	if viaSuccession {
		w.Set(model.KindSide, side.ID, "president_terms", 0, "election", nil, "succession reset")
	} else {
		w.Set(model.KindSide, side.ID, "last_election_tick", float64(v.Tick), "election", nil, "election held")
	}

	// Presidents govern from the capital.
	w.Set(model.KindSide, side.ID, "president_in_dc", 1, "election", nil, "in capital")
}

// holdElection runs a scheduled presidential election.
func holdElection(v *sim.View, w *sim.WriteSet, side *model.Side, cfg config.Election) {
	var candidates []*model.Ruler
	for _, id := range v.State.RulerIDsSorted() {
		r := v.State.Rulers[id]
		if r.SideID != side.ID || !r.IsAlive || r.CapturedBy != 0 {
			continue
		}
		if r.ID == side.LeaderID && float64(side.PresidentTerms) >= cfg.MaxTerms {
			continue // term-limited
		}
		candidates = append(candidates, r)
	}
	if len(candidates) == 0 {
		return
	}

	type scored struct {
		r *model.Ruler
		s float64
	}
	ranked := make([]scored, 0, len(candidates))
	for _, c := range candidates {
		ranked = append(ranked, scored{c, c.Influence + c.Renown + v.Rng.Float64()*100})
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].s == ranked[j].s {
			return ranked[i].r.ID < ranked[j].r.ID
		}
		return ranked[i].s > ranked[j].s
	})

	winner := ranked[0].r
	wasReelected := winner.ID == side.LeaderID
	installPresident(v, w, side, winner.ID, false)
	if wasReelected {
		w.Set(model.KindSide, side.ID, "president_terms", float64(side.PresidentTerms+1),
			"election", nil, "re-elected")
	} else {
		w.Set(model.KindSide, side.ID, "president_terms", 1, "election", nil, "first term")
	}
}
