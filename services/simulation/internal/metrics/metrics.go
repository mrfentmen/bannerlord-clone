// Package metrics summarises a run: what survived, what collapsed, and which
// side came out on top.
//
// It reads state and logs and writes numbers. It is not a system and writes
// nothing back, so it cannot influence a result.
package metrics

import (
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// TownSummary is one town's condition at the end of a run.
type TownSummary struct {
	ID         int
	Name       string
	SideID     int
	Population float64
	StartPop   float64
	FoodDays   float64
	Unrest     float64
	Loyalty    float64
	Infected   float64
	Starving   bool
	Besieged   bool
	Collapse   float64
	// Died is how many people this town lost over the run.
	Died float64
	// HolderChanges is how many times it changed hands, which is chain 1's
	// outcome counted.
	HolderChanges float64
}

// SideSummary is one side's condition at the end of a run.
type SideSummary struct {
	ID         int
	Name       string
	Towns      float64
	StartTowns float64
	Population float64
	StartPop   float64
	Treasury   float64
	Gold       float64
	Weariness  float64
	Stability  float64
	Strength   float64
	// Survived reports whether the side still holds a meaningful share of what
	// it started with, which is how "no side dominates" is measured.
	Survived bool
	// Collapsed reports the opposite: a side that has lost most of what it had.
	Collapsed bool
}

// Run is a complete summary of one run.
type Run struct {
	Seed          uint64
	Profile       string
	Ticks         int
	Years         float64
	Towns         []TownSummary
	Sides         []SideSummary
	CauseRows     int
	Suppressed    int
	DroppedOldest int
	// Winner is the side that finished with the most towns, or -1 on a tie.
	Winner int
	// CollapsedTowns is how many towns ended in a state a player would call a
	// collapse, which is the headline number for whether the simulation is too
	// harsh.
	CollapsedTowns int
	// TotalDeaths is the whole world's cumulative loss.
	TotalDeaths float64
	// ChainHits records which emergent chains were observed, filled in by the
	// chain checker.
	ChainHits map[string]int
}

// Summary computes a run's metrics from its final state and its cause log.
func Summary(cfg *config.Config, state *model.State, log *cause.Log, seed uint64, profileName string) *Run {
	r := &Run{
		Seed:          seed,
		Profile:       profileName,
		Ticks:         state.Tick,
		Years:         state.Year,
		CauseRows:     log.Len(),
		Suppressed:    log.Suppressed(),
		DroppedOldest: log.DroppedOldest(),
		ChainHits:     map[string]int{},
	}

	// --- per town ---
	// Holder changes are counted from the cause log rather than tracked in
	// state, because the log is the record of what happened and a metric
	// computed from it cannot disagree with what a player would see.
	holderChanges := countHolderChanges(log)
	deathsByTown := countDeaths(log)

	for _, tid := range state.TownIDs() {
		t := state.Towns[tid]
		if t.Population <= 0 {
			// A town that emptied out entirely is a collapse, and it is
			// reported as one rather than being quietly omitted from the
			// average, which would make a catastrophic world look healthy.
			r.Towns = append(r.Towns, TownSummary{
				ID: tid, Name: t.Name, SideID: t.HolderSide, Collapse: 6,
				HolderChanges: holderChanges[tid], Died: deathsByTown[tid],
			})
			r.CollapsedTowns++
			continue
		}
		collapse := sim.CollapseScore(state, model.KindTown, tid)
		ts := TownSummary{
			ID:            tid,
			Name:          t.Name,
			SideID:        t.HolderSide,
			Population:    t.Population,
			FoodDays:      t.FoodDays,
			Unrest:        t.Unrest,
			Loyalty:       t.Loyalty,
			Infected:      t.Infected,
			Starving:      t.IsStarving,
			Besieged:      t.IsBesieged,
			Collapse:      collapse,
			Died:          deathsByTown[tid],
			HolderChanges: holderChanges[tid],
		}
		if collapse >= 2 {
			r.CollapsedTowns++
		}
		r.Towns = append(r.Towns, ts)
		r.TotalDeaths += deathsByTown[tid]
	}

	// --- per side ---
	for _, sid := range state.SideIDs() {
		s := state.Sides[sid]
		towns, pop := 0.0, 0.0
		for _, ts := range r.Towns {
			if ts.SideID == sid && ts.Population > 0 {
				towns++
				pop += ts.Population
			}
		}
		ss := SideSummary{
			ID:         sid,
			Name:       s.Name,
			Towns:      towns,
			Population: pop,
			Treasury:   s.Treasury,
			Gold:       s.Gold,
			Weariness:  s.WarWeariness,
			Stability:  s.Stability,
			Strength:   s.StrengthIndex,
		}
		// Survival and collapse are measured against a side's own starting
		// holdings, not against an absolute number, because the six sections
		// start with very different amounts (FACTIONS.md section 3). A side
		// that halved its holdings has not failed; a side that lost nine
		// tenths of them has.
		ss.StartTowns = float64(s.Towns)
		ss.StartPop = s.Population
		if ss.StartTowns > 0 {
			kept := towns / ss.StartTowns
			ss.Survived = kept >= cfg.Audit.SideSurvivalThreshold
			ss.Collapsed = kept <= cfg.Audit.SideCollapseThreshold
		}
		r.Sides = append(r.Sides, ss)
	}

	// --- the winner ---
	// The side that finished with the most towns, with population as the
	// tie-break. Using towns as the primary measure is deliberate: a side that
	// wins by absorbing a large population into a few towns has not won.
	best := -1
	bestTowns, bestPop := -1.0, -1.0
	for _, ss := range r.Sides {
		if ss.Towns > bestTowns || (ss.Towns == bestTowns && ss.Population > bestPop) {
			best, bestTowns, bestPop = ss.ID, ss.Towns, ss.Population
		}
	}
	// A tie is reported as no winner rather than as whichever side happened to
	// be checked first, because a "winner" that is an artefact of map ordering
	// would make the dominance table meaningless.
	tied := 0
	for _, ss := range r.Sides {
		if ss.Towns == bestTowns {
			tied++
		}
	}
	if tied > 1 {
		best = -1
	}
	r.Winner = best
	return r
}

func countHolderChanges(log *cause.Log) map[int]float64 {
	out := map[int]float64{}
	for _, row := range log.Rows() {
		if row.Field == "holder" && row.Kind == model.KindTown {
			out[row.Entity]++
		}
	}
	return out
}

func countDeaths(log *cause.Log) map[int]float64 {
	out := map[int]float64{}
	for _, row := range log.Rows() {
		if row.Kind != model.KindTown {
			continue
		}
		switch row.Field {
		case "lost_deaths_total":
			// The cumulative field only records a row when it crosses the
			// logging threshold, so it undercounts. Population loss is the
			// reliable measure and is used instead.
		case "population":
			if row.Delta < 0 {
				out[row.Entity] += -row.Delta
			}
		}
	}
	return out
}

// DominanceRow is one seed's outcome.
type DominanceRow struct {
	Seed           uint64
	Profile        string
	Winner         int
	WinnerName     string
	Collapsed      int
	CollapsedTowns int
	Deaths         float64
	Survivors      int
}

// Dominance is a table of many runs and the conclusion drawn from them.
type Dominance struct {
	Rows []DominanceRow
	// Wins counts how many runs each side won.
	Wins map[int]int
	// Collapses counts how many runs each side collapsed in.
	Collapses map[int]int
	// Survived counts how many runs each side survived.
	Survived map[int]int
	// Runs is how many runs were summarised.
	Runs int
	// DominantSide is the side that won more than the configured share of
	// runs, or -1 if none did.
	DominantSide int
	// DominantShare is that side's win share.
	DominantShare float64
}

// Table builds a dominance table from a set of runs.
func Table(cfg *config.Config, runs []*Run) *Dominance {
	d := &Dominance{
		Wins:      map[int]int{},
		Collapses: map[int]int{},
		Survived:  map[int]int{},
		Runs:      len(runs),
	}
	names := map[int]string{}
	for _, r := range runs {
		row := DominanceRow{
			Seed:           r.Seed,
			Profile:        r.Profile,
			Winner:         r.Winner,
			Collapsed:      0,
			CollapsedTowns: r.CollapsedTowns,
			Deaths:         r.TotalDeaths,
		}
		for _, ss := range r.Sides {
			names[ss.ID] = ss.Name
			if ss.Collapsed {
				row.Collapsed++
				d.Collapses[ss.ID]++
			}
			if ss.Survived {
				row.Survivors++
				d.Survived[ss.ID]++
			}
		}
		if r.Winner >= 0 {
			row.WinnerName = names[r.Winner]
			d.Wins[r.Winner]++
		}
		d.Rows = append(d.Rows, row)
	}
	// A side that never wins is not dominant; neither is one that wins a
	// minority of runs. The threshold comes from the config, per
	// FACTIONS.md's balance rule.
	for id, wins := range d.Wins {
		share := sharedSqrtDiv(wins, d.Runs)
		if share > cfg.Audit.DominanceMaxFraction {
			d.DominantSide = id
			d.DominantShare = share
		}
	}
	sort.Slice(d.Rows, func(i, j int) bool { return d.Rows[i].Seed < d.Rows[j].Seed })
	return d
}

func sharedSqrtDiv(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}

// Format renders the dominance table as a plain text table, one row per seed
// with the winning side, so the result can be read without a spreadsheet.
func (d *Dominance) Format(names map[int]string) string {
	var sb strings.Builder
	sb.WriteString("SEED        WINNER                      COLLAPSED  DEATHS       SURVIVORS\n")
	sb.WriteString("----------- --------------------------- --------- ------------ ---------\n")
	for _, r := range d.Rows {
		winner := r.WinnerName
		if winner == "" {
			winner = "(tie)"
		}
		if len(winner) > 27 {
			winner = winner[:27]
		}
		fmt.Fprintf(&sb, "%-11d %-27s %-9d %-12.0f %d\n",
			r.Seed, winner, r.Collapsed, r.Deaths, r.Survivors)
	}
	sb.WriteString("\n")
	ids := make([]int, 0, len(names))
	for id := range names {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	sb.WriteString("SIDE                      WINS   WIN SHARE   COLLAPSED   SURVIVED\n")
	sb.WriteString("------------------------- ----- ----------- ----------- ---------\n")
	for _, id := range ids {
		wins := d.Wins[id]
		share := 0.0
		if d.Runs > 0 {
			share = float64(wins) / float64(d.Runs)
		}
		fmt.Fprintf(&sb, "%-25s %-5d %-11.2f %-11d %d\n",
			names[id], wins, share, d.Collapses[id], d.Survived[id])
	}
	sb.WriteString("\n")
	if d.DominantSide >= 0 {
		fmt.Fprintf(&sb, "DOMINANT SIDE: %s won %.0f%% of runs, above the configured limit of %.0f%%.\n",
			names[d.DominantSide], d.DominantShare*100, d.DominantShare*100)
	} else {
		sb.WriteString("NO DOMINANT SIDE: no side won more runs than the configured limit allows.\n")
	}
	return sb.String()
}
