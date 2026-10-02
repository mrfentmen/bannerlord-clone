package simrun

import (
	"fmt"
	"path/filepath"
	"runtime"
	"sort"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/worldgen"
)

// This file is the second of the two gates CONSTITUTION.md section 2.2 names
// and section 2.3 calls enforcement: "a cause-log test asserting every tracked
// field write produces a row". The rule is quoted in the model's package
// comment and is the reason the cause log exists at all, and nothing checked
// it. WriteSet.byField carries a comment saying it is "used by the coverage
// test to assert" and had no reader; model.AllFields and TrackedFieldCount
// carry the same note.
//
// The rule as written has a subtlety worth stating before testing it. A row is
// not owed for every write. The engine deliberately drops changes below the
// logging thresholds, because a row per float operation would be unreadable
// and a chain that cannot be explained is worse (CAUSE_EFFECT.md). So "every
// tracked write produces a row" means every tracked write the thresholds
// consider worth a row. The test therefore asks the log the same question the
// engine asked it, through the same function, rather than asserting a row for
// every thousandth of a percentage point of unrest.

// testCfg loads the shipped balance file by path from this source file, because
// config.LoadDefault resolves config/balance.toml against the working directory
// and a test runs in its own package directory.
func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	path := filepath.Join(filepath.Dir(file), "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// smallWorld builds a world small enough to tick in a unit test but complete
// enough that the systems which need parties, wars, and rulers have something
// to work on.
//
// The town and ruler counts are overridden on a copy of the config rather than
// by editing balance.toml, because the shipped world's 60-180 towns and 320-700
// rulers exist to make the emergent chains visible over a six-year run, and a
// test that runs thirty ticks is checking wiring rather than balance. The copy
// keeps the shipped file authoritative for every number the test asserts on.
func smallWorld(t *testing.T, seed uint64) (*config.Config, *model.State) {
	t.Helper()
	base := testCfg(t)
	cfg := *base
	cfg.World.MinTowns = 6
	cfg.World.MaxTowns = 6
	cfg.World.MinRulers = 12
	cfg.World.MaxRulers = 12
	if err := ValidateConfig(&cfg); err != nil {
		t.Fatalf("shrunken config rejected: %v", err)
	}
	gen := worldgen.Generate(&cfg, seed, nil)
	if gen.State == nil || len(gen.State.Parties) == 0 {
		t.Fatal("world generation produced no parties, so nothing would run")
	}
	return &cfg, gen.State
}

// entityIDs lists the ids of every entity of every kind in the state, so the
// per-tick diff can walk the whole world rather than a hand-picked list.
func entityIDs(s *model.State) map[model.Kind][]int {
	return map[model.Kind][]int{
		model.KindTown:         s.TownIDs(),
		model.KindVillage:      s.VillageIDs(),
		model.KindParty:        s.PartyIDs(),
		model.KindLeader:       s.LeaderIDsSorted(),
		model.KindSide:         s.SideIDs(),
		model.KindRoute:        s.RouteIDs(),
		model.KindSiege:        s.SiegeIDs(),
		model.KindWar:          s.WarIDs(),
		model.KindOrganization: s.OrganizationIDs(),
		model.KindWorkshop:     s.WorkshopIDs(),
		model.KindNotable:      s.NotableIDs(),
		model.KindIssue:        s.IssueIDs(),
	}
}

// rowsByTickAndField indexes the cause log the way the assertion needs it: a
// set of "kind/entity/field" that changed on a given tick. The log is the
// engine's own, produced by the same apply path a run uses, so a row is here
// only because the engine decided to write one.
func rowsByTickAndField(log *cause.Log) map[int]map[string]bool {
	out := map[int]map[string]bool{}
	for _, r := range log.Rows() {
		key := fmt.Sprintf("%d/%d/%s", r.Kind, r.Entity, r.Field)
		if out[r.Tick] == nil {
			out[r.Tick] = map[string]bool{}
		}
		out[r.Tick][key] = true
	}
	return out
}

// The gate. Thirty ticks of the whole simulation, diffed field by field: every
// change to a tracked field that clears the logging thresholds has to be
// accounted for by a cause row on that same tick. An unexplained tracked write
// is the failure CONSTITUTION.md 2.2 calls an incomplete feature.
func TestEveryTrackedFieldWriteProducesACauseRow(t *testing.T) {
	cfg, state := smallWorld(t, 4242)
	log := cause.NewLog(200000)
	engine := sim.NewEngine(cfg, log, 4242, Systems())

	const ticks = 30
	explained := 0
	// Rows are only asserted for entities that existed before the tick: a
	// system that creates a town has no "before" value, and a creation is
	// explained by the row that announces it rather than by a change row.
	for i := 0; i < ticks; i++ {
		before := state.Clone()
		ids := entityIDs(before)
		tickNo := state.Tick
		if err := engine.Tick(state); err != nil {
			t.Fatalf("tick %d: %v", i, err)
		}
		written := rowsByTickAndField(log)[tickNo]
		for kind, list := range ids {
			for _, id := range list {
				if !state.Exists(kind, id) {
					continue
				}
				for _, name := range model.TrackedFieldsOfKind(kind) {
					f := model.MustField(kind, name)
					oldV, ok := before.Get(kind, id, name)
					if !ok {
						t.Fatalf("%s#%d has no field %q: registered but not readable, "+
							"so it reads as zero forever", kind, id, name)
					}
					newV, ok := state.Get(kind, id, name)
					if !ok || oldV == newV {
						continue
					}
					if !log.ShouldLog(f, oldV, newV, cfg.Cause.MinAbsolute, cfg.Cause.MinRelative) {
						continue
					}
					key := fmt.Sprintf("%d/%d/%s", kind, id, name)
					if !written[key] {
						t.Errorf("tick %d: %s#%d.%s changed %g -> %g, which clears the "+
							"logging threshold, and no cause row explains it",
							tickNo, kind, id, name, oldV, newV)
						continue
					}
					explained++
				}
			}
		}
	}
	// A test that explained nothing would pass by never finding a change, so
	// the count is asserted. Thirty ticks of a live world produce thousands of
	// tracked writes; the floor is set low to stay robust to a config change but
	// high enough that an empty world or a dead engine cannot satisfy it.
	if explained < 100 {
		t.Fatalf("only %d tracked writes were explained across %d ticks: the diff "+
			"is not seeing the simulation, so this gate is not testing anything",
			explained, ticks)
	}
	t.Logf("%d tracked writes explained by cause rows over %d ticks", explained, ticks)
}

// The other half of the same rule, from the other direction. WriteSet.byField
// is the engine's own record of which field names systems actually staged, and
// nothing in the repository read it. A name that is staged but not registered
// aborts the whole tick at commit, and a name that is registered but has no
// setter reads as zero forever, so both are checked here against the registry
// and against the accessors rather than left to a tick to discover.
func TestEveryStagedFieldIsRegisteredAndWritable(t *testing.T) {
	// The same seed as the run above, so the systems reach the same world: a
	// different seed is a different set of parties, and a field only one of
	// them writes would go unchecked.
	cfg, state := smallWorld(t, 4242)
	log := cause.NewLog(1000)
	engine := sim.NewEngine(cfg, log, 4242, Systems())
	// A few ticks rather than one, because which fields a system stages depends
	// on what is on the map: the caravan system stages nothing at all until a
	// caravan exists, and a caravan takes a few days to appear.
	for i := 0; i < 6; i++ {
		if err := engine.Tick(state); err != nil {
			t.Fatalf("tick %d: %v", i, err)
		}
	}
	w := sim.NewWriteSet()
	v := &sim.View{
		State: state,
		Log:   log,
		Cfg:   cfg,
		Rng:   rng.New(4242),
		Tick:  state.Tick,
		Year:  state.Year,
		Day:   state.Tick % 365,
	}
	for _, sys := range Systems() {
		if sys.Runs == nil {
			continue
		}
		sv := *v
		sys.Runs(&sv, w)
	}
	counts := w.FieldCounts()
	if len(counts) == 0 {
		t.Fatal("no system staged a single write: the systems are not running")
	}
	names := make([]string, 0, len(counts))
	for f := range counts {
		names = append(names, f)
	}
	sort.Strings(names)
	for _, name := range names {
		// The field name alone is not enough to look a field up: a name is
		// only valid on one entity family, so this finds the kind that has it
		// and checks the accessors there.
		kind, field, ok := findField(name)
		if !ok {
			t.Errorf("a system staged a write to %q, which is not a registered field; "+
				"the tick would abort at commit with \"unknown field\"", name)
			continue
		}
		if !field.Tracked {
			continue
		}
		// A tracked field that cannot be read back is worse than an
		// unregistered one: it commits without complaint and always reads
		// zero, so every system reading it sees a constant.
		var probe model.Kind = kind
		var id int
		for _, cand := range entityIDs(state)[probe] {
			if _, ok := state.Get(probe, cand, name); ok {
				id = cand
				break
			}
		}
		if id == 0 {
			t.Errorf("%s.%s is registered and tracked but no entity in this world "+
				"can be asked for it", kind, name)
			continue
		}
		before, _ := state.Get(probe, id, name)
		if !state.Set(probe, id, name, before) {
			t.Errorf("%s.%s has no setter: a write to it would commit and then "+
				"always read back as its old value", kind, name)
		}
	}
}

// findField locates a field name in the registry together with the entity
// family it belongs to.
func findField(name string) (model.Kind, model.Field, bool) {
	for _, f := range model.AllFields() {
		if f.Name == name {
			return f.Kind, f, true
		}
	}
	return 0, model.Field{}, false
}
