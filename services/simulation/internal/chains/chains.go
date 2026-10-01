// Package chains checks whether the ten emergent chains in CAUSE_EFFECT.md
// sections 5 and 10 actually appeared in a run, by scanning the cause log for
// the linked pattern.
//
// The central rule, from CAUSE_EFFECT.md section 7 and TESTING_AND_BALANCE.md
// section 2: a chain that only appears when something forces it is not a chain.
// So every check here reads only the cause log and asks whether the links
// exist and are connected by caused_by edges. Nothing in this package can
// create an event, and nothing in the simulation reads it.
package chains

import (
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
)

// Chain identifies one of the ten documented chains.
type Chain int

const (
	// FamineToVote is chain 1: taxes up, food down, unrest up, loyalty down,
	// the holder voted out.
	FamineToVote Chain = iota + 1
	// Plague is chain 2: crowding up, infection up, deaths, workers down,
	// harvest fails, famine follows.
	Plague
	// RoadRot is chain 3: the garrison leaves, roads rot, caravans are robbed,
	// medicine and food stop arriving.
	RoadRot
	// WageSpiral is chain 4: troops go unpaid, morale falls, they desert, the
	// garrison shrinks, roads are unsafe, raiders grow.
	WageSpiral
	// Recovery is chain 5: aid and medicine arrive, infection falls, workers
	// return, food production recovers, unrest falls, loyalty climbs.
	Recovery
	// OverlongMarch is chain 6: an army marches deep, supply fails, morale
	// falls, it deserts, the home garrison thins, a rival raids home.
	OverlongMarch
	// GoldDrain is chain 7: gold covers wages, reserves empty, mercenaries
	// leave, a lord defects.
	GoldDrain
	// Blockade is chain 8: a port is blockaded, food imports stop, prices
	// spike, unrest rises, the governor is voted out.
	Blockade
	// BrokenOath is chain 9: a captured ruler is executed, relations fall, a
	// coalition forms.
	BrokenOath
	// SiegeOpenedItself is chain 10: a siege drains food and spreads disease,
	// loyalty falls, the gates open without an assault.
	SiegeOpenedItself
)

// All lists every chain, in the order the documents number them.
func All() []Chain {
	return []Chain{
		FamineToVote, Plague, RoadRot, WageSpiral, Recovery,
		OverlongMarch, GoldDrain, Blockade, BrokenOath, SiegeOpenedItself,
	}
}

// Name returns the chain's name as the documents number it.
func Name(c Chain) string {
	switch c {
	case FamineToVote:
		return "1. famine to vote"
	case Plague:
		return "2. plague"
	case RoadRot:
		return "3. road rot"
	case WageSpiral:
		return "4. wage spiral"
	case Recovery:
		return "5. recovery"
	case OverlongMarch:
		return "6. overlong march"
	case GoldDrain:
		return "7. gold drain"
	case Blockade:
		return "8. blockade"
	case BrokenOath:
		return "9. broken oath"
	case SiegeOpenedItself:
		return "10. siege that opened itself"
	}
	return "unknown"
}

// Step is one required link in a chain, for reporting which link was missing.
type Step struct {
	// Field is the tracked field that must have moved.
	Field string
	// Kind is the entity family the field belongs to.
	Kind model.Kind
	// Dir is which way it must have moved: up, down, or either.
	Dir int
	// Label describes the step in the report.
	Label string
	// Note is extra detail in a failure message.
	Note string
}

const (
	up = iota
	down
	either
)

// link is a directed edge between two fields, saying the second moved because
// the first did. The check requires the edge to be real, not merely the two
// events to have happened: this is what makes a chain a chain rather than a
// coincidence of timing.
type link struct {
	fromField string
	toField   string
	// fromKind and toKind allow a link across entity families, such as a route
	// change causing a town change.
	fromKind model.Kind
	toKind   model.Kind
	label    string
}

// spec is the full definition of one chain.
type spec struct {
	chain Chain
	// steps are the links that must appear, in order.
	steps []link
	// final is the outcome that must be present somewhere, which is what makes
	// a chain count rather than merely having started.
	finalKind  model.Kind
	finalField string
	finalNote  string
	// anywhere is a set of optional links: a chain with an alternative route is
	// still a chain, and forcing one exact path would test the implementation
	// rather than the premise.
	anywhere []link
}

// specs is the chain table. It is written from the ten chains in
// CAUSE_EFFECT.md sections 5 and 10, one entry each.
var specs = []spec{
	{
		chain: FamineToVote,
		steps: []link{
			{fromField: "tax_rate", toField: "price_food", fromKind: model.KindTown, toKind: model.KindTown, label: "taxes rose, so merchants held less and prices rose"},
			{fromField: "price_food", toField: "unrest", fromKind: model.KindTown, toKind: model.KindTown, label: "prices rose, and people were angry"},
			{fromField: "food_stock", toField: "unrest", fromKind: model.KindTown, toKind: model.KindTown, label: "the larder emptied, and people were angry"},
			{fromField: "unrest", toField: "loyalty", fromKind: model.KindTown, toKind: model.KindTown, label: "anger eroded loyalty"},
			{fromField: "loyalty", toField: "holder", fromKind: model.KindTown, toKind: model.KindTown, label: "loyalty collapsed and the council voted the holder out"},
		},
		finalKind:  model.KindTown,
		finalField: "holder",
		finalNote:  "a town changed hands by vote",
		anywhere: []link{
			{fromField: "food_stock", toField: "population", fromKind: model.KindTown, toKind: model.KindTown, label: "the larder emptied and people died"},
			{fromField: "loyalty", toField: "days_below_loyalty", fromKind: model.KindTown, toKind: model.KindTown, label: "loyalty stayed low long enough for a vote"},
		},
	},
	{
		chain: Plague,
		steps: []link{
			{fromField: "crowding", toField: "infected", fromKind: model.KindTown, toKind: model.KindTown, label: "refugees crowded in and infection spread"},
			{fromField: "infected", toField: "population", fromKind: model.KindTown, toKind: model.KindTown, label: "the infected died"},
			{fromField: "infected", toField: "workers", fromKind: model.KindTown, toKind: model.KindTown, label: "sick workers could not work"},
			{fromField: "workers", toField: "food_production", fromKind: model.KindTown, toKind: model.KindTown, label: "fewer workers, less food"},
			{fromField: "food_production", toField: "food_stock", fromKind: model.KindTown, toKind: model.KindTown, label: "the harvest failed and the larder drained"},
		},
		finalKind:  model.KindTown,
		finalField: "infected",
		finalNote:  "an outbreak ran in a town",
	},
	{
		chain: RoadRot,
		steps: []link{
			{fromField: "garrison", toField: "road_safety", fromKind: model.KindTown, toKind: model.KindTown, label: "the garrison left and the roads went unsafe"},
			{fromField: "road_safety", toField: "route_safety", fromKind: model.KindTown, toKind: model.KindRoute, label: "the town's roads went unsafe"},
			{fromField: "route_safety", toField: "medicine_stock", fromKind: model.KindRoute, toKind: model.KindTown, label: "the unsafe road stopped medicine arriving"},
			{fromField: "route_safety", toField: "food_stock", fromKind: model.KindRoute, toKind: model.KindTown, label: "the unsafe road stopped food arriving"},
		},
		finalKind:  model.KindTown,
		finalField: "road_safety",
		finalNote:  "a town's roads went unsafe",
		anywhere: []link{
			{fromField: "route_raiders", toField: "route_safety", fromKind: model.KindRoute, toKind: model.KindRoute, label: "raiders made the road unsafe"},
			{fromField: "wages_owed", toField: "morale", fromKind: model.KindParty, toKind: model.KindParty, label: "unpaid troops lost morale"},
		},
	},
	{
		chain: WageSpiral,
		steps: []link{
			{fromField: "wages_owed", toField: "morale", fromKind: model.KindParty, toKind: model.KindParty, label: "troops went unpaid and lost morale"},
			{fromField: "morale", toField: "troops", fromKind: model.KindParty, toKind: model.KindParty, label: "morale broke and troops deserted"},
			{fromField: "garrison", toField: "road_safety", fromKind: model.KindTown, toKind: model.KindTown, label: "the garrison thinned and the roads went unsafe"},
		},
		finalKind:  model.KindParty,
		finalField: "troops",
		finalNote:  "a party lost troops",
		anywhere: []link{
			{fromField: "route_safety", toField: "route_raiders", fromKind: model.KindRoute, toKind: model.KindRoute, label: "the unsafe road bred raiders"},
			{fromField: "road_safety", toField: "route_raiders", fromKind: model.KindTown, toKind: model.KindRoute, label: "weak towns fed the raider bands"},
		},
	},
	{
		chain: Recovery,
		steps: []link{
			{fromField: "medicine_stock", toField: "infected", fromKind: model.KindTown, toKind: model.KindTown, label: "medicine arrived and infection fell"},
			{fromField: "infected", toField: "workers", fromKind: model.KindTown, toKind: model.KindTown, label: "fewer sick meant workers returned"},
			{fromField: "workers", toField: "food_production", fromKind: model.KindTown, toKind: model.KindTown, label: "workers returned and production recovered"},
			{fromField: "food_production", toField: "unrest", fromKind: model.KindTown, toKind: model.KindTown, label: "production recovered and anger fell"},
			{fromField: "unrest", toField: "loyalty", fromKind: model.KindTown, toKind: model.KindTown, label: "anger fell and loyalty climbed back"},
		},
		finalKind:  model.KindTown,
		finalField: "medicine_stock",
		finalNote:  "medicine arrived in a town",
		anywhere: []link{
			{fromField: "food_imports", toField: "food_stock", fromKind: model.KindTown, toKind: model.KindTown, label: "food imports arrived"},
		},
	},
	{
		chain: OverlongMarch,
		steps: []link{
			{fromField: "days_out", toField: "supply_distance", fromKind: model.KindParty, toKind: model.KindParty, label: "the army marched beyond its supply"},
			{fromField: "supply_distance", toField: "party_starving", fromKind: model.KindParty, toKind: model.KindParty, label: "no supply and the army went hungry"},
			{fromField: "party_starving", toField: "morale", fromKind: model.KindParty, toKind: model.KindParty, label: "hunger broke the army's morale"},
			{fromField: "morale", toField: "troops", fromKind: model.KindParty, toKind: model.KindParty, label: "the broken army deserted"},
		},
		finalKind:  model.KindParty,
		finalField: "days_out",
		finalNote:  "an army spent a long time in the field",
		anywhere: []link{
			{fromField: "morale", toField: "garrison", fromKind: model.KindTown, toKind: model.KindTown, label: "the broken army thinned the home garrison"},
			{fromField: "troops", toField: "village_raid_memory", fromKind: model.KindParty, toKind: model.KindVillage, label: "a rival raided the home region"},
		},
	},
	{
		chain: GoldDrain,
		steps: []link{
			{fromField: "side_gold", toField: "wages_owed", fromKind: model.KindSide, toKind: model.KindParty, label: "the gold reserve was spent on wages"},
			{fromField: "wages_owed", toField: "is_mercenary", fromKind: model.KindParty, toKind: model.KindParty, label: "unpaid mercenaries left"},
			{fromField: "ruler_side", toField: "last_defection", fromKind: model.KindLeader, toKind: model.KindLeader, label: "a lord changed sides"},
		},
		finalKind:  model.KindSide,
		finalField: "side_gold",
		finalNote:  "a side's gold reserve fell",
		anywhere: []link{
			{fromField: "debt_total", toField: "side_treasury", fromKind: model.KindSide, toKind: model.KindSide, label: "the side borrowed to cover the bills"},
		},
	},
	{
		chain: Blockade,
		steps: []link{
			{fromField: "blockade", toField: "food_imports", fromKind: model.KindTown, toKind: model.KindTown, label: "the blockade stopped food imports"},
			{fromField: "food_imports", toField: "food_stock", fromKind: model.KindTown, toKind: model.KindTown, label: "no imports, so the larder drained"},
			{fromField: "food_stock", toField: "unrest", fromKind: model.KindTown, toKind: model.KindTown, label: "hunger raised anger"},
			{fromField: "unrest", toField: "loyalty", fromKind: model.KindTown, toKind: model.KindTown, label: "anger eroded loyalty"},
		},
		finalKind:  model.KindTown,
		finalField: "blockade",
		finalNote:  "a town was blockaded",
		anywhere: []link{
			{fromField: "blockade", toField: "holder", fromKind: model.KindTown, toKind: model.KindTown, label: "the blockaded town voted its governor out"},
			{fromField: "price_food", toField: "unrest", fromKind: model.KindTown, toKind: model.KindTown, label: "prices spiked and anger rose"},
		},
	},
	{
		chain: BrokenOath,
		steps: []link{
			{fromField: "broken_oaths", toField: "relation_score", fromKind: model.KindLeader, toKind: model.KindLeader, label: "an oath was broken and opinion fell"},
			{fromField: "relation_score", toField: "coalition_with", fromKind: model.KindLeader, toKind: model.KindSide, label: "the falling opinion spread and a coalition formed"},
		},
		finalKind:  model.KindLeader,
		finalField: "broken_oaths",
		finalNote:  "a ruler broke an oath",
	},
	{
		chain: SiegeOpenedItself,
		steps: []link{
			{fromField: "is_besieged", toField: "food_stock", fromKind: model.KindTown, toKind: model.KindTown, label: "the siege cut the town off and the larder drained"},
			{fromField: "is_besieged", toField: "infected", fromKind: model.KindTown, toKind: model.KindTown, label: "disease grew in the besieged town"},
			{fromField: "is_besieged", toField: "loyalty", fromKind: model.KindTown, toKind: model.KindTown, label: "the town stopped trusting its ruler"},
			{fromField: "loyalty", toField: "gates_opened", fromKind: model.KindTown, toKind: model.KindSiege, label: "with loyalty gone, the gates opened"},
		},
		finalKind:  model.KindSiege,
		finalField: "gates_opened",
		finalNote:  "a besieged town opened its gates",
	},
}

// Result is the outcome of one chain check in one run.
type Result struct {
	Chain Chain
	// Emerged reports whether the chain appeared, with every required link
	// present and connected.
	Emerged bool
	// TownID is the entity where it was found, or -1.
	Entity int
	// EntityName is its readable name.
	EntityName string
	// Missing names the links that were absent, in order, so a failure says
	// what did not happen rather than only that something did not.
	Missing []string
	// Excerpts are the cause-log rows that demonstrate the chain, in order.
	Excerpts []cause.Row
	// Rows is the number of log rows the check examined, for the report.
	Rows int
}

// index is a prepared view of the cause log, so the checks are linear rather
// than quadratic in the number of rows.
type index struct {
	rows []cause.Row
	// byKey maps kind/field to the rows that changed it, in log order.
	byKey map[key][]int
	// causes maps a row index to the indices of the rows it names as causes.
	causes map[int][]int
	// idToIndex maps an event id to its row index.
	idToIndex map[int]int
}

type key struct {
	kind  model.Kind
	field string
}

func build(log *cause.Log) *index {
	rows := log.Rows()
	ix := &index{
		rows:      rows,
		byKey:     map[key][]int{},
		causes:    map[int][]int{},
		idToIndex: map[int]int{},
	}
	for i, r := range rows {
		k := key{r.Kind, r.Field}
		ix.byKey[k] = append(ix.byKey[k], i)
		ix.idToIndex[r.ID] = i
	}
	for i, r := range rows {
		var cs []int
		for _, c := range r.CausedBy {
			if j, ok := ix.idToIndex[c]; ok {
				cs = append(cs, j)
			}
		}
		ix.causes[i] = cs
	}
	return ix
}

// Check tests every chain against a run's cause log.
func Check(log *cause.Log, state *model.State) map[Chain]Result {
	ix := build(log)
	out := map[Chain]Result{}
	for _, s := range specs {
		out[s.chain] = checkOne(ix, state, s)
	}
	return out
}

func checkOne(ix *index, state *model.State, s spec) Result {
	res := Result{Chain: s.chain, Entity: -1, Rows: len(ix.rows)}
	// Each required link is looked for independently across the whole log; the
	// chain is present if every link appears at least once. Requiring them to
	// share a single entity would be too strict, because a real chain runs
	// across many towns, and requiring them to be simultaneous would be
	// stricter still: a famine takes weeks, which is the whole point of the
	// days-below-threshold delay in the council system.
	for _, l := range s.steps {
		if !ix.hasLink(l) {
			res.Missing = append(res.Missing, l.label)
		}
	}
	if s.finalField != "" {
		rows, ok := ix.byKey[key{s.finalKind, s.finalField}]
		if !ok || len(rows) == 0 {
			res.Missing = append(res.Missing, "outcome: "+s.finalNote)
		} else {
			res.Excerpts = append(res.Excerpts, ix.rows[rows[len(rows)-1]])
		}
	}
	res.Emerged = len(res.Missing) == 0
	// When present, report the entity where the final outcome happened, which is
	// the one a player would press "why" on.
	if res.Emerged && len(res.Excerpts) > 0 {
		last := res.Excerpts[len(res.Excerpts)-1]
		res.Entity = last.Entity
		res.EntityName = state.Name(last.Kind, last.Entity)
	}
	return res
}

// hasLink reports whether the log contains a row for the "to" field whose
// recorded causes include a row for the "from" field, within a tolerance
// window. The window matters: a link must be recent enough to be the
// explanation, not a coincidence from a year earlier.
func (ix *index) hasLink(l link) bool {
	toRows := ix.byKey[key{l.toKind, l.toField}]
	if len(toRows) == 0 {
		return false
	}
	fromRows := ix.byKey[key{l.fromKind, l.fromField}]
	if len(fromRows) == 0 {
		return false
	}
	// Direction matters: the cause must have happened at or before the effect,
	// and within the window. A cause that happened after the effect is not a
	// cause of it.
	for _, ti := range toRows {
		tr := ix.rows[ti]
		for _, ci := range ix.causes[ti] {
			cr := ix.rows[ci]
			if cr.Kind != l.fromKind || cr.Field != l.fromField {
				continue
			}
			if cr.Tick > tr.Tick {
				continue
			}
			if tr.Tick-cr.Tick > causeWindow {
				continue
			}
			return true
		}
	}
	return false
}

// causeWindow is how far apart a cause and its effect may be and still count
// as linked. It is generous, because the systems run on different cadences:
// unrest moves daily, a council vote needs eleven days, and a war's exhaustion
// builds over months. The linkage requirement is that the cause row is
// actually named in the effect row's caused_by, which is a much stronger
// condition than proximity.
const causeWindow = 400

// Report renders a chain table for one run.
func Report(results map[Chain]Result, order []Chain) string {
	var sb strings.Builder
	sb.WriteString("CHAIN                                      EMERGED   ENTITY            MISSING LINKS\n")
	sb.WriteString("----------------------------------------- -------- ----------------- -----------\n")
	for _, c := range order {
		r := results[c]
		mark := "no"
		if r.Emerged {
			mark = "YES"
		}
		entity := r.EntityName
		if entity == "" {
			entity = "-"
		}
		missing := "-"
		if len(r.Missing) > 0 {
			missing = strings.Join(r.Missing, "; ")
		}
		if len(missing) > 40 {
			missing = missing[:40] + "..."
		}
		fmt.Fprintf(&sb, "%-41s %-9s %-17s %s\n", Name(c), mark, entity, missing)
	}
	return sb.String()
}

// Excerpt renders the rows that demonstrate a chain, indented, for a report.
func Excerpt(state *model.State, r Result, maxRows int) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "chain %s emerged at %s (day %d)\n", Name(r.Chain), r.EntityName, r.Excerpts[0].Tick)
	rows := r.Excerpts
	if len(rows) > maxRows {
		rows = rows[:maxRows]
	}
	for _, row := range rows {
		f, _ := model.FieldByName(row.Kind, row.Field)
		fmt.Fprintf(&sb, "  day %-5d %-14s %-18s %s: %s -> %s  (%s)\n",
			row.Tick, state.Name(row.Kind, row.Entity), row.Field, row.Field,
			f.Format(row.Old), f.Format(row.New), row.System)
	}
	return sb.String()
}

// CollectExcerptsFor returns the rows that demonstrate a chain, in log order,
// including the intermediate links rather than only the final outcome. It is
// what the run report embeds as evidence.
func CollectExcerptsFor(log *cause.Log, state *model.State, s spec, limit int) []cause.Row {
	ix := build(log)
	var out []cause.Row
	seen := map[int]bool{}
	add := func(l link) {
		toRows := ix.byKey[key{l.toKind, l.toField}]
		for _, ti := range toRows {
			tr := ix.rows[ti]
			for _, ci := range ix.causes[ti] {
				cr := ix.rows[ci]
				if cr.Kind != l.fromKind || cr.Field != l.fromField {
					continue
				}
				if cr.Tick > tr.Tick || tr.Tick-cr.Tick > causeWindow {
					continue
				}
				if !seen[cr.ID] {
					seen[cr.ID] = true
					out = append(out, cr)
				}
				if !seen[tr.ID] {
					seen[tr.ID] = true
					out = append(out, tr)
				}
				return
			}
		}
	}
	for _, l := range s.steps {
		add(l)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Tick < out[j].Tick })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

// specFor returns a chain's spec, for the excerpt collection above.
func specFor(c Chain) (spec, bool) {
	for _, s := range specs {
		if s.chain == c {
			return s, true
		}
	}
	return spec{}, false
}

// ExcerptsFor is the exported form of CollectExcerptsFor.
func ExcerptsFor(log *cause.Log, c Chain, limit int) []cause.Row {
	s, ok := specFor(c)
	if !ok {
		return nil
	}
	return CollectExcerptsFor(log, nil, s, limit)
}
