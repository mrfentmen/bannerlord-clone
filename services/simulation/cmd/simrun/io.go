package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/chains"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/runner"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simrun"
)

// readCauseLog parses a cause log CSV back into a log, so a why-query can run
// against a saved run without re-simulating it. Re-reading the log is the
// honest way to answer "why did this happen" after the fact: the log is the
// record, and a query that needed the live state would not be answering the
// question a player asks at the end of a campaign.
func readCauseLog(path string) (*cause.Log, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := csv.NewReader(bufio.NewReaderSize(f, 1<<20))
	r.FieldsPerRecord = -1
	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}
	if len(records) < 1 {
		return nil, fmt.Errorf("%s is empty", path)
	}
	// The header is present, so find each column by name rather than by
	// position: a column reordering in a future version should not silently
	// produce a wrong answer.
	header := records[0]
	col := map[string]int{}
	for i, h := range header {
		col[strings.TrimSpace(h)] = i
	}
	need := []string{"event_id", "tick", "entity_kind", "entity_id", "field", "old", "new", "system"}
	for _, n := range need {
		if _, ok := col[n]; !ok {
			return nil, fmt.Errorf("%s has no column %q", path, n)
		}
	}
	log := cause.NewLog(0)
	for _, rec := range records[1:] {
		if len(rec) < len(header) {
			continue
		}
		tick, _ := strconv.Atoi(rec[col["tick"]])
		year, _ := strconv.ParseFloat(rec[col["year"]], 64)
		eid, _ := strconv.Atoi(rec[col["entity_id"]])
		oldV, _ := strconv.ParseFloat(rec[col["old"]], 64)
		newV, _ := strconv.ParseFloat(rec[col["new"]], 64)
		delta, _ := strconv.ParseFloat(rec[col["delta"]], 64)
		var causes []int
		if c, ok := col["caused_by"]; ok && c < len(rec) {
			for _, part := range strings.Fields(rec[c]) {
				if id, err := strconv.Atoi(part); err == nil {
					causes = append(causes, id)
				}
			}
		}
		read := ""
		if c, ok := col["read"]; ok && c < len(rec) {
			read = rec[c]
		}
		log.Append(cause.Row{
			Tick:     tick,
			Year:     year,
			Kind:     kindFromName(rec[col["entity_kind"]]),
			Entity:   eid,
			Field:    rec[col["field"]],
			Old:      oldV,
			New:      newV,
			Delta:    delta,
			System:   rec[col["system"]],
			Read:     read,
			CausedBy: causes,
		})
	}
	return log, nil
}

func kindFromName(s string) model.Kind {
	switch strings.TrimSpace(s) {
	case "town":
		return model.KindTown
	case "village":
		return model.KindVillage
	case "party":
		return model.KindParty
	case "ruler":
		return model.KindRuler
	case "side":
		return model.KindSide
	case "route":
		return model.KindRoute
	case "siege":
		return model.KindSiege
	case "war":
		return model.KindWar
	}
	return model.KindTown
}

func lastTick(log *cause.Log) int {
	rows := log.Rows()
	if len(rows) == 0 {
		return 0
	}
	return rows[len(rows)-1].Tick
}

func lastYear(log *cause.Log) float64 {
	rows := log.Rows()
	if len(rows) == 0 {
		return 0
	}
	return rows[len(rows)-1].Year
}

// worstFromLog picks the town most likely to have collapsed, using the log
// alone. It scores by the number of distinct bad things that happened to the
// town, which is a proxy for a collapse that needs no live state.
func worstFromLog(state *model.State, log *cause.Log) int {
	// A town that does not exist in the state is still reported, using its
	// number, so a why-query works against a bare log.
	bad := map[int]map[string]bool{}
	for _, row := range log.Rows() {
		if row.Kind != model.KindTown {
			continue
		}
		if bad[row.Entity] == nil {
			bad[row.Entity] = map[string]bool{}
		}
		switch row.Field {
		case "is_starving", "infected", "unrest", "loyalty", "food_stock",
			"holder", "recent_deaths", "is_besieged", "medicine_stock", "blockade":
			bad[row.Entity][row.Field] = true
		}
	}
	best, bestN := -1, 0
	ids := make([]int, 0, len(bad))
	for id := range bad {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		if n := len(bad[id]); n > bestN {
			best, bestN = id, n
		}
	}
	if best < 0 {
		// Nothing in the log; report the first town in the state if there is
		// one, so the command produces an answer rather than an error.
		if len(state.Towns) > 0 {
			for id := range state.Towns {
				return id
			}
		}
	}
	// Create a placeholder so the query can name it.
	if best >= 0 {
		if _, ok := state.Towns[best]; !ok {
			state.Towns[best] = &model.Town{ID: best, Name: fmt.Sprintf("town #%d", best)}
		}
	}
	return best
}

// stateJSON is the persisted form of a run's final state. Only what a
// why-query and a balance report need is written, and the format is
// documented so a later phase can read it without reverse-engineering the
// runner.
type stateJSON struct {
	Year  float64     `json:"year"`
	Tick  int         `json:"tick"`
	Towns []stateTown `json:"towns"`
	Sides []stateSide `json:"sides"`
}

type stateTown struct {
	ID         int     `json:"id"`
	Name       string  `json:"name"`
	SideID     int     `json:"side_id"`
	Population float64 `json:"population"`
	// FoundedPopulation is the settlement's original scale. It is carried
	// through the round trip because migration reads it to decide how far a
	// town may fall before it stops being a settlement.
	FoundedPopulation float64 `json:"founded_population"`
	FoodStock         float64 `json:"food_stock"`
	FoodDays          float64 `json:"food_days"`
	Unrest            float64 `json:"unrest"`
	Loyalty           float64 `json:"loyalty"`
	Infected          float64 `json:"infected"`
	Prosperity        float64 `json:"prosperity"`
	Money             float64 `json:"money"`
	Gold              float64 `json:"gold"`
	Metal             float64 `json:"metal"`
	Garrison          float64 `json:"garrison"`
	RoadSafety        float64 `json:"road_safety"`
	Starving          bool    `json:"starving"`
	Besieged          bool    `json:"besieged"`
	Blockade          float64 `json:"blockade"`
	Holder            int     `json:"holder"`
}

type stateSide struct {
	ID         int     `json:"id"`
	Name       string  `json:"name"`
	Towns      float64 `json:"towns"`
	Population float64 `json:"population"`
	Treasury   float64 `json:"treasury"`
	Gold       float64 `json:"gold"`
	Weariness  float64 `json:"weariness"`
	Stability  float64 `json:"stability"`
}

// writeStateCSV writes a per-town final state table.
func writeStateCSV(state *model.State, path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(bufio.NewWriterSize(f, 1<<16))
	defer w.Flush()
	_ = w.Write([]string{
		"town_id", "name", "side_id", "population", "food_days", "food_stock",
		"unrest", "loyalty", "infected", "prosperity", "money", "gold", "metal",
		"garrison", "road_safety", "starving", "besieged", "blockade", "holder",
	})
	for _, id := range state.TownIDs() {
		t := state.Towns[id]
		_ = w.Write([]string{
			strconv.Itoa(t.ID), t.Name, strconv.Itoa(t.HolderSide),
			fmt.Sprintf("%.0f", t.Population), fmt.Sprintf("%.2f", t.FoodDays),
			fmt.Sprintf("%.1f", t.FoodStock), fmt.Sprintf("%.4f", t.Unrest),
			fmt.Sprintf("%.4f", t.Loyalty), fmt.Sprintf("%.5f", t.Infected),
			fmt.Sprintf("%.4f", t.Prosperity), fmt.Sprintf("%.0f", t.Money),
			fmt.Sprintf("%.1f", t.Gold), fmt.Sprintf("%.0f", t.Metal),
			fmt.Sprintf("%.0f", t.Garrison), fmt.Sprintf("%.4f", t.RoadSafety),
			strconv.FormatBool(t.IsStarving), strconv.FormatBool(t.IsBesieged),
			fmt.Sprintf("%.3f", t.Blockade), strconv.Itoa(t.Holder),
		})
	}
	return nil
}

// writeSummary writes a human-readable summary of one run, including the
// system order and the config version, so a log on disk is self-describing.
func writeSummary(cfg *config.Config, o *runner.Outcome, path string) error {
	m := o.Metrics
	var sb strings.Builder
	fmt.Fprintf(&sb, "RUN SUMMARY\n")
	fmt.Fprintf(&sb, "seed:            %d\n", m.Seed)
	fmt.Fprintf(&sb, "profile:         %s\n", m.Profile)
	fmt.Fprintf(&sb, "balance config:  %s\n", cfg.Version)
	fmt.Fprintf(&sb, "ticks:           %d (%.3f in-game years)\n", m.Ticks, m.Years)
	fmt.Fprintf(&sb, "cause rows:      %d\n", m.CauseRows)
	fmt.Fprintf(&sb, "below threshold: %d\n", m.Suppressed)
	fmt.Fprintf(&sb, "dropped oldest:  %d\n", m.DroppedOldest)
	fmt.Fprintf(&sb, "settlements:     %d real, %d synthesised\n", o.RealSettlements, o.SynthSettlements)
	fmt.Fprintf(&sb, "collapsed towns: %d of %d\n", m.CollapsedTowns, len(m.Towns))
	fmt.Fprintf(&sb, "total deaths:    %.0f\n", m.TotalDeaths)
	if o.PlayerRulerID >= 0 {
		fmt.Fprintf(&sb, "player:          ruler #%d, town #%d\n", o.PlayerRulerID, o.PlayerTownID)
	}
	for _, n := range o.Notes {
		fmt.Fprintf(&sb, "note:            %s\n", n)
	}
	sb.WriteString("\n")
	sb.WriteString(chains.Report(o.Chains, chains.All()))
	sb.WriteString("\nSIDES\n")
	sb.WriteString(fmt.Sprintf("%-24s %-8s %-12s %-10s %-10s %s\n", "side", "towns", "population", "treasury", "weariness", "outcome"))
	for _, s := range m.Sides {
		outcome := "held"
		if s.Collapsed {
			outcome = "COLLAPSED"
		} else if s.Survived {
			outcome = "survived"
		}
		fmt.Fprintf(&sb, "%-24s %-8.0f %-12.0f %-10.0f %-10.2f %s\n",
			s.Name, s.Towns, s.Population, s.Treasury, s.Weariness, outcome)
	}
	sb.WriteString("\n")
	sb.WriteString(simrun.OrderReport())
	return os.WriteFile(path, []byte(sb.String()), 0o644)
}

// readStateJSON loads a persisted state so the why-query can name entities and
// score which town is worst.
func readStateJSON(path string, into *model.State) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var sj stateJSON
	if err := json.Unmarshal(raw, &sj); err != nil {
		return err
	}
	into.Year = sj.Year
	into.Tick = sj.Tick
	for _, t := range sj.Towns {
		into.Towns[t.ID] = &model.Town{
			ID: t.ID, Name: t.Name, SideID: t.SideID, Population: t.Population,
			// A state file written before founded_population existed, or by a
			// hand-built town, leaves this zero. Falling back to the population
			// the town has now would anchor the migration floor to a number that
			// shrinks as people leave, so it is left at zero, which the reader
			// in migration treats as "no scale known".
			FoundedPopulation: t.FoundedPopulation,
			FoodStock:         t.FoodStock, FoodDays: t.FoodDays, Unrest: t.Unrest,
			Loyalty: t.Loyalty, Infected: t.Infected, Prosperity: t.Prosperity,
			Money: t.Money, Gold: t.Gold, Metal: t.Metal, Garrison: t.Garrison,
			RoadSafety: t.RoadSafety, IsStarving: t.Starving, IsBesieged: t.Besieged,
			Blockade: t.Blockade, Holder: t.Holder, HolderSide: t.SideID,
		}
	}
	for _, s := range sj.Sides {
		into.Sides[s.ID] = &model.Side{
			ID: s.ID, Name: s.Name, Towns: s.Towns, Population: s.Population,
			Treasury: s.Treasury, Gold: s.Gold, WarWeariness: s.Weariness,
			Stability: s.Stability,
		}
	}
	return nil
}

var _ = sim.CollapseScore
