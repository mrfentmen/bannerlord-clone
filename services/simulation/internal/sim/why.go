package sim

import (
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
)

// WhyNode is one step of an explained chain, as the Why panel would show it.
type WhyNode struct {
	// Row is the cause-log event at this step.
	Row cause.Row
	// EntityName is the readable name of what changed.
	EntityName string
	// FieldText is the field name and unit.
	FieldText string
	// ReadText is the plain-language record of the state that was read.
	ReadText string
	// Depth is how many links from the queried change this step is.
	Depth int
	// Skipped marks a link that was pruned to keep the chain readable, either
	// because it was redundant or because the depth bound was reached.
	Skipped bool
	// SkipReason explains a pruning, so the output is never quietly lossy.
	SkipReason string
}

// WhyResult is a full answer to a "why did this happen" query.
type WhyResult struct {
	// Query describes what was asked.
	Query string
	// Chain is the ordered list of steps from the queried change back to its
	// root cause, shallowest first.
	Chain []WhyNode
	// Depth is the number of linked causes found, excluding the queried change.
	Depth int
	// Truncated is set when MaxChainLinks cut the walk short, so a caller can
	// say so rather than implying the chain ended.
	Truncated bool
	// Orphaned is set when the queried change has no recorded cause at all,
	// which means either the change was too small to log or the cause is
	// genuinely missing. A caller should surface this rather than present a
	// one-link chain as an explanation.
	Orphaned bool
	// RootEntity is the entity the chain starts from.
	RootEntity string
}

// Format renders the chain as the indented list from CAUSE_EFFECT.md section 4.
func (r WhyResult) Format(state *model.State) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "WHY %s\n", r.Query)
	if r.Orphaned {
		fmt.Fprintf(&sb, "  no recorded cause: this change is not linked to any earlier event\n")
	}
	if r.Truncated {
		fmt.Fprintf(&sb, "  (chain truncated at the configured link limit)\n")
	}
	for i := len(r.Chain) - 1; i >= 0; i-- {
		n := r.Chain[i]
		indent := strings.Repeat("  ", n.Depth+1)
		if n.Skipped {
			fmt.Fprintf(&sb, "%s... %s\n", indent, n.SkipReason)
			continue
		}
		f, _ := model.FieldByName(n.Row.Kind, n.Row.Field)
		fmt.Fprintf(&sb, "%s%s %s: %s -> %s (%s)\n",
			indent, n.EntityName, n.FieldText,
			f.Format(n.Row.Old), f.Format(n.Row.New), n.Row.System)
		if n.ReadText != "" {
			fmt.Fprintf(&sb, "%s  because it read: %s\n", indent, n.ReadText)
		}
	}
	fmt.Fprintf(&sb, "  chain depth: %d linked cause(s)\n", r.Depth)
	return sb.String()
}

// Why explains a change to a field of an entity by walking the cause log
// backwards from the most recent change to that field.
//
// The walk follows CausedBy edges, which is what makes the answer real: a step
// appears only if the writing system recorded that the earlier event was among
// what it read. The walk is bounded by MaxChainLinks so a long history cannot
// hang the query, and pruning is reported rather than hidden.
func Why(log *cause.Log, state *model.State, kind model.Kind, id int, field string, maxLinks int) WhyResult {
	res := WhyResult{
		Query:      fmt.Sprintf("%s#%d (%s) %s", kind, id, state.Name(kind, id), field),
		RootEntity: state.Name(kind, id),
	}
	start, ok := log.LatestFor(kind, id, field)
	if !ok {
		res.Orphaned = true
		res.Chain = append(res.Chain, WhyNode{
			Row:        cause.Row{Tick: state.Tick, Kind: kind, Entity: id, Field: field, Note: "no recorded change"},
			EntityName: state.Name(kind, id),
			FieldText:  field,
			Depth:      0,
			Skipped:    true,
			SkipReason: fmt.Sprintf("no logged change to %s in this run", field),
		})
		return res
	}
	visited := map[int]bool{start.ID: true}
	queue := []WhyNode{nodeFor(start, state, 0)}
	frontier := []int{start.ID}
	for depth := 1; len(frontier) > 0 && len(queue) <= maxLinks; depth++ {
		var next []int
		for _, id := range frontier {
			row, ok := log.Row(id)
			if !ok {
				continue
			}
			// Follow every recorded cause, newest first, so the deepest
			// explanation is preferred over a shallow sibling.
			causes := append([]int{}, row.CausedBy...)
			sort.Sort(sort.Reverse(sort.IntSlice(causes)))
			for _, c := range causes {
				if visited[c] {
					continue
				}
				crow, ok := log.Row(c)
				if !ok {
					continue
				}
				visited[c] = true
				n := nodeFor(crow, state, depth)
				queue = append(queue, n)
				next = append(next, c)
				if len(queue) > maxLinks {
					res.Truncated = true
					break
				}
			}
			if len(queue) > maxLinks {
				res.Truncated = true
				break
			}
		}
		frontier = next
	}
	// Order by depth, then by tick, so the rendering is stable and reads as a
	// progression from root cause to present.
	sort.SliceStable(queue, func(i, j int) bool {
		if queue[i].Depth != queue[j].Depth {
			return queue[i].Depth < queue[j].Depth
		}
		return queue[i].Row.Tick < queue[j].Row.Tick
	})
	res.Chain = queue
	res.Depth = len(queue) - 1
	if res.Depth < 0 {
		res.Depth = 0
	}
	return res
}

func nodeFor(r cause.Row, state *model.State, depth int) WhyNode {
	f, _ := model.FieldByName(r.Kind, r.Field)
	unit := f.Unit
	text := r.Field
	if unit != "" {
		text = fmt.Sprintf("%s (%s)", r.Field, unit)
	}
	return WhyNode{
		Row:        r,
		EntityName: state.Name(r.Kind, r.Entity),
		FieldText:  text,
		ReadText:   r.Read,
		Depth:      depth,
	}
}

// WhyForEntity explains the most significant recent collapse of a town by
// picking the field whose current value is furthest from healthy and querying
// that. It is what the runner uses to answer "why did this town collapse"
// without the caller having to know which field to ask about.
func WhyForEntity(log *cause.Log, state *model.State, kind model.Kind, id int, maxLinks int) WhyResult {
	_, field, pretty := collapseScore(state, kind, id)
	if field == "" {
		return WhyResult{
			Query:      fmt.Sprintf("%s#%d (%s) overall", kind, id, state.Name(kind, id)),
			RootEntity: state.Name(kind, id),
			Orphaned:   true,
		}
	}
	res := Why(log, state, kind, id, field, maxLinks)
	res.Query = fmt.Sprintf("%s#%d (%s) overall: worst field %s because of %s",
		kind, id, state.Name(kind, id), field, pretty)
	return res
}

// healthProbe scores how far one field of an entity is from a healthy value.
// worst means the field is bad when high (unrest, infection); otherwise it is
// bad when low (loyalty, prosperity). The weight reflects how much the failure
// matters to a player watching a town: a collapsing larder explains more than a
// drifting price.
type healthProbe struct {
	field  string
	worst  float64
	weight float64
	pretty string
}

// townProbes are the town fields a collapse is judged on. This is a diagnostic
// aid for the report and the why-query, not a simulation system: nothing writes
// these values, they only read them.
var townProbes = []healthProbe{
	{"is_starving", 1, 3.0, "is starving"},
	{"infected", 1, 2.2, "infection"},
	{"unrest", 1, 2.0, "unrest"},
	{"loyalty", 0, 2.0, "collapse in loyalty"},
	{"food_stock", 0, 2.5, "empty larder"},
	{"prosperity", 0, 1.2, "collapse in trade"},
	{"is_besieged", 1, 1.5, "under siege"},
	{"medicine_stock", 0, 1.4, "no medicine"},
	{"money", 0, 0.8, "empty treasury"},
	{"garrison", 0, 0.8, "ungarrisoned"},
	{"road_safety", 0, 0.7, "unsafe roads"},
}

// probe reads a probe's current severity for an entity, skipping probes that do
// not belong to the entity's kind.
func (h healthProbe) read(state *model.State, kind model.Kind, id int) (float64, bool) {
	// The probe must exist on this entity family. A town probe and a party
	// probe are checked against different kinds, and a probe that does not apply
	// is skipped rather than returning a misleading zero.
	if _, ok := model.FieldByName(kind, h.field); !ok {
		return 0, false
	}
	v, ok := state.Get(kind, id, h.field)
	if !ok {
		return 0, false
	}
	s := v
	if h.worst == 0 {
		s = 1 - v
		if s < 0 {
			s = 0
		}
	}
	return s * h.weight, true
}

// collapseScore returns the worst weighted severity across all applicable
// probes, and the field and description responsible.
func collapseScore(state *model.State, kind model.Kind, id int) (float64, string, string) {
	probes := townProbes
	if kind != model.KindTown {
		probes = townProbes[:0]
	}
	best, bestField, bestPretty := 0.0, "", ""
	for _, h := range probes {
		sc, ok := h.read(state, kind, id)
		if !ok {
			continue
		}
		if sc > best {
			best, bestField, bestPretty = sc, h.field, h.pretty
		}
	}
	return best, bestField, bestPretty
}

// CollapseScore returns how far a town is from healthy on a weighted scale,
// where 2.0 is the threshold at which a player would call it a collapse. The
// runner uses it to rank towns and pick a genuinely bad one for the sample
// why-query rather than a merely mediocre one.
func CollapseScore(state *model.State, kind model.Kind, id int) float64 {
	sc, _, _ := collapseScore(state, kind, id)
	return sc
}

// Collapsed reports whether a town is in a state the player would call a
// collapse.
func Collapsed(state *model.State, kind model.Kind, id int) bool {
	return CollapseScore(state, kind, id) >= 2.0
}
