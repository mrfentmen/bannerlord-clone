// Package worldai is the autonomous world-AI lane's harness: deterministic
// state fingerprinting, structural health checks, and long-run simulation
// helpers for the emergent campaign simulation.
//
// It implements no game rules. It exists so the world AI can be verified the
// way the mandate requires: identical seeds produce identical AI decisions,
// and long runs (30 days, 1 year, 5 years) are monitored for systemic
// pathologies like runaway wealth, dead factions, orphaned parties, negative
// resources, and deterministic divergence.
//
// The package only reads committed state through the model's public accessors
// and runs ticks through the engine. It never mutates state and never reaches
// into a system's internals, so it cannot change what it measures.
package worldai

import (
	"fmt"
	"hash/fnv"
	"math"
	"sort"
	"strconv"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simrun"
	"mbclone/simulation/internal/worldgen"
)

// kindsInHashOrder is the fixed order entity families are folded into the
// state hash. The order is arbitrary but fixed, which is all a fingerprint
// needs.
var kindsInHashOrder = []model.Kind{
	model.KindTown,
	model.KindVillage,
	model.KindParty,
	model.KindRuler,
	model.KindSide,
	model.KindRoute,
	model.KindSiege,
	model.KindWar,
}

// idsOf returns the sorted identifiers of one entity family.
func idsOf(s *model.State, k model.Kind) []int {
	switch k {
	case model.KindTown:
		return s.TownIDs()
	case model.KindVillage:
		return s.VillageIDs()
	case model.KindParty:
		return s.PartyIDs()
	case model.KindRuler:
		return s.RulerIDsSorted()
	case model.KindSide:
		return s.SideIDs()
	case model.KindRoute:
		return s.RouteIDs()
	case model.KindSiege:
		return s.SiegeIDs()
	case model.KindWar:
		return s.WarIDs()
	}
	return nil
}

// fieldsOfKind lists every registered field name for one entity family,
// sorted, so the hash walks the same sequence on every run.
func fieldsOfKind(k model.Kind) []string {
	prefix := k.String() + "."
	var out []string
	for name, f := range model.AllFields() {
		if f.Kind != k {
			continue
		}
		out = append(out, name[len(prefix):])
	}
	sort.Strings(out)
	return out
}

// StateHash returns a deterministic fingerprint of the whole committed state:
// tick, every entity's every registered field, both relation matrices, and
// the oath table. Two runs from the same seed, config, and system list must
// produce the same hash after the same number of ticks; if they do not, the
// simulation has deterministic divergence, which is a bug by definition.
func StateHash(s *model.State) string {
	h := fnv.New64a()
	fmt.Fprintf(h, "tick=%d year=%s\n", s.Tick,
		strconv.FormatFloat(s.Year, 'g', -1, 64))
	for _, k := range kindsInHashOrder {
		names := fieldsOfKind(k)
		for _, id := range idsOf(s, k) {
			fmt.Fprintf(h, "%s#%d", k.String(), id)
			for _, name := range names {
				v, ok := s.Get(k, id, name)
				if !ok {
					fmt.Fprintf(h, " %s=?", name)
					continue
				}
				fmt.Fprintf(h, " %s=%s", name,
					strconv.FormatFloat(v, 'g', -1, 64))
			}
			fmt.Fprintln(h)
		}
	}
	// Relation matrices, in pair order.
	for _, ps := range s.SortedPairs(s.Relations).Pairs {
		fmt.Fprintf(h, "rel %d-%d=%s\n", ps.A, ps.B,
			strconv.FormatFloat(s.Relations[ps], 'g', -1, 64))
	}
	for _, ps := range s.SortedPairs(s.SideRelations).Pairs {
		fmt.Fprintf(h, "siderel %d-%d=%s\n", ps.A, ps.B,
			strconv.FormatFloat(s.SideRelations[ps], 'g', -1, 64))
	}
	// Oaths, in key order.
	var oathKeys []int
	for k := range s.Oaths {
		oathKeys = append(oathKeys, k)
	}
	sort.Ints(oathKeys)
	for _, k := range oathKeys {
		o := s.Oaths[k]
		fmt.Fprintf(h, "oath %d promisor=%d promisee=%d kind=%d made=%d broken=%v brokentick=%d\n",
			k, o.Promisor, o.Promisee, o.Kind, o.MadeTick, o.Broken, o.BrokenTick)
	}
	// Campaign events, in firing order. Events are append-only history, so
	// order is deterministic by construction.
	for i, e := range s.Events {
		fmt.Fprintf(h, "event %d kind=%d tick=%d sidea=%d sideb=%d actor=%d target=%d magnitude=%s\n",
			i, e.Kind, e.Tick, e.SideA, e.SideB, e.Actor, e.Target,
			strconv.FormatFloat(e.Magnitude, 'g', -1, 64))
	}
	sum := h.Sum64()
	return fmt.Sprintf("%016x", sum)
}

// SmallWorld builds a compact deterministic world for tests: two towns per
// side on a grid, so ticks run fast while every side, war, trade, and raid
// path still has something to work with. It uses the real world generator so
// the world is built the same way production builds one, only smaller.
func SmallWorld(cfg *config.Config, seed uint64) *model.State {
	var settlements []worldgen.Settlement
	side := 0
	// Coordinates start at 200 leagues so raider bands spawning up to 60
	// leagues from a town never go negative: the model's position fields are
	// bounded below by 0, which encodes the real map's all-positive geography.
	for i := 0; i < 12; i++ {
		settlements = append(settlements, worldgen.Settlement{
			Name:       fmt.Sprintf("Test Town %d", i),
			State:      "Testland",
			SideID:     side,
			Population: 40000,
			X:          200 + float64((i%4)*60),
			Y:          200 + float64((i/4)*60),
			IsPort:     i%3 == 0,
			Terrain:    model.TerrainPlain,
		})
		side = (side + 1) % 6
	}
	return worldgen.Generate(cfg, seed, settlements).State
}

// RunDays ticks the full registered system list for the given number of days
// on a fresh small world, returning the final committed state. The onTick hook
// is called after each committed tick and may be nil.
func RunDays(cfg *config.Config, seed uint64, days int, onTick func(v *sim.View)) (*model.State, error) {
	s := SmallWorld(cfg, seed)
	log := cause.NewLog(int(cfg.Audit.LogRowLimit))
	e := sim.NewEngine(cfg, log, seed, simrun.Systems())
	if onTick != nil {
		e.AddHook(onTick)
	}
	for d := 0; d < days; d++ {
		if err := e.Tick(s); err != nil {
			return nil, fmt.Errorf("worldai: tick %d: %w", s.Tick, err)
		}
	}
	return s, nil
}

// Problem is one structural pathology found in a committed state.
type Problem struct {
	// Where describes the entity, e.g. "town#12" or "world".
	Where string
	// What describes the violation in plain language.
	What string
}

// Health checks a committed state for structural pathologies: values outside
// the model's own declared bounds, NaN or infinite quantities, dangling
// references, and impossible ownership.
//
// The bounds check is principled rather than ad hoc: the engine clamps every
// committed write to its field's [Min, Max], so a committed value outside
// those bounds means something bypassed the write path, which is a bug by
// construction. Negative town money is NOT flagged: the money field's minimum
// is negative infinity because towns carry debt as negative money, with a
// separate bankruptcy floor the currency system enforces.
func Health(s *model.State) []Problem {
	var out []Problem
	add := func(where, what string) {
		out = append(out, Problem{Where: where, What: what})
	}
	checkFields := func(where string, k model.Kind, id int) {
		for _, name := range fieldsOfKind(k) {
			v, ok := s.Get(k, id, name)
			if !ok {
				continue
			}
			if math.IsNaN(v) {
				add(where, fmt.Sprintf("field %s is NaN", name))
				continue
			}
			if math.IsInf(v, 0) {
				add(where, fmt.Sprintf("field %s is infinite", name))
				continue
			}
			f := model.MustField(k, name)
			// ValueText fields are enums: their Min/Max are not bounds, the
			// valid range is 0..len(Enum)-1.
			if f.Value == model.ValueText {
				if v != math.Trunc(v) || v < 0 || v >= float64(len(f.Enum)) {
					add(where, fmt.Sprintf("field %s is %v, not a valid enum value", name, v))
				}
				continue
			}
			if v < f.Min {
				add(where, fmt.Sprintf("field %s is %v, below minimum %v", name, v, f.Min))
			}
			if v > f.Max {
				add(where, fmt.Sprintf("field %s is %v, above maximum %v", name, v, f.Max))
			}
		}
	}

	for _, tid := range s.TownIDs() {
		t := s.Towns[tid]
		where := fmt.Sprintf("town#%d", tid)
		checkFields(where, model.KindTown, tid)
		if t.Holder >= 0 && !s.Exists(model.KindRuler, t.Holder) {
			add(where, fmt.Sprintf("holder ruler#%d does not exist", t.Holder))
		}
		if t.HolderSide >= 0 && !s.Exists(model.KindSide, t.HolderSide) {
			add(where, fmt.Sprintf("holder side#%d does not exist", t.HolderSide))
		}
	}
	for _, vid := range s.VillageIDs() {
		vl := s.Villages[vid]
		where := fmt.Sprintf("village#%d", vid)
		checkFields(where, model.KindVillage, vid)
		if !s.Exists(model.KindTown, vl.TownID) {
			add(where, fmt.Sprintf("town#%d does not exist", vl.TownID))
		}
	}
	for _, pid := range s.PartyIDs() {
		p := s.Parties[pid]
		where := fmt.Sprintf("party#%d", pid)
		checkFields(where, model.KindParty, pid)
		if p.HomeTown >= 0 && !s.Exists(model.KindTown, p.HomeTown) {
			add(where, fmt.Sprintf("home town#%d does not exist", p.HomeTown))
		}
		if p.DestTown >= 0 && !s.Exists(model.KindTown, p.DestTown) {
			add(where, fmt.Sprintf("destination town#%d does not exist", p.DestTown))
		}
		// RulerID 0 is the zero value for "no ruler" (caravans spawned by
		// logistics never set it); -1 is the explicit none. Both are valid.
		if p.RulerID > 0 && !s.Exists(model.KindRuler, p.RulerID) {
			add(where, fmt.Sprintf("ruler#%d does not exist", p.RulerID))
		}
		if p.SideID != -1 && !s.Exists(model.KindSide, p.SideID) {
			add(where, fmt.Sprintf("side#%d does not exist", p.SideID))
		}
	}
	for _, rid := range s.RulerIDsSorted() {
		r := s.Rulers[rid]
		where := fmt.Sprintf("ruler#%d", rid)
		checkFields(where, model.KindRuler, rid)
		if r.TownID >= 0 && !s.Exists(model.KindTown, r.TownID) {
			add(where, fmt.Sprintf("town#%d does not exist", r.TownID))
		}
		// NOTE: a ruler's PartyID is deliberately NOT checked here. It is
		// untracked bookkeeping (not in the field registry), every reader
		// nil-checks the map lookup, and party ids are never reused, so a
		// ruler whose army was ground down to nothing simply reads as
		// partyless. Flagging it would be a false positive.
		if !s.Exists(model.KindSide, r.SideID) {
			add(where, fmt.Sprintf("side#%d does not exist", r.SideID))
		}
	}
	for _, sid := range s.SideIDs() {
		where := fmt.Sprintf("side#%d", sid)
		checkFields(where, model.KindSide, sid)
	}
	for _, wid := range s.WarIDs() {
		wr := s.Wars[wid]
		where := fmt.Sprintf("war#%d", wid)
		if !s.Exists(model.KindSide, wr.SideA) {
			add(where, fmt.Sprintf("side A#%d does not exist", wr.SideA))
		}
		if !s.Exists(model.KindSide, wr.SideB) {
			add(where, fmt.Sprintf("side B#%d does not exist", wr.SideB))
		}
		if wr.SideA == wr.SideB {
			add(where, "a side is at war with itself")
		}
	}
	for _, zid := range s.SiegeIDs() {
		z := s.Sieges[zid]
		where := fmt.Sprintf("siege#%d", zid)
		if !s.Exists(model.KindTown, z.TownID) {
			add(where, fmt.Sprintf("town#%d does not exist", z.TownID))
		}
	}
	return out
}

// CountPartiesByActivity tallies live parties by activity, for long-run
// monitoring: a world where every party is idle forever is as broken as one
// where none are.
func CountPartiesByActivity(s *model.State) map[model.Activity]int {
	out := map[model.Activity]int{}
	for _, pid := range s.PartyIDs() {
		p := s.Parties[pid]
		if p.Troops > 0 {
			out[p.Activity]++
		}
	}
	return out
}

// CountIntentions tallies rulers' current intentions, which is the observable
// surface of the AI's decisions.
func CountIntentions(s *model.State) map[model.Intention]int {
	out := map[model.Intention]int{}
	for _, pid := range s.PartyIDs() {
		p := s.Parties[pid]
		out[p.Intention]++
	}
	return out
}
