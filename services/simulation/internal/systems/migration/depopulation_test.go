package migration

// The depopulation balance test: a town at maximum unrest must decline
// severely without being emptied.
//
// Unrest of 1.0 is the cap the unrest system allows, so a town at 1.0 is the
// worst case the game can produce: every departure pressure term in migration
// is saturated. The property under test is that such a town loses most of its
// people and keeps a survivable minimum, rather than falling to zero.
//
// The test runs migration and demography together through the real engine
// against the shipped balance file, because the bug lived in the seam between
// them: migration stages movement and demography applies it. Running either
// system alone would not have shown it, and running them against invented
// constants in this file would not show it either.

import (
	"path/filepath"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"

	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/demography"
)

// unrestCap is the unrest level the unrest system clamps to. A town held at
// this level is the most miserable the model can express.
const unrestCap = 1.0

// balanceConfig loads the shipped balance file, so this test measures the
// balance the game actually ships rather than constants invented here.
func balanceConfig(t *testing.T) *config.Config {
	t.Helper()
	path := filepath.Join("..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("loading %s: %v", path, err)
	}
	return cfg
}

// depopWorld builds a region of one furious town and several calm neighbours.
//
// The neighbours matter: flight is a transfer, so the bug this test hunts
// needs somewhere for the departing people to go. With a single town nobody
// has anywhere to move, which is a different scenario with a different answer.
func depopWorld(pop float64) *model.State {
	state := &model.State{
		Towns:  map[int]*model.Town{},
		Rulers: map[int]*model.Ruler{},
		Sides:  map[int]*model.Side{},
		Year:   1950,
	}
	state.Sides[1] = &model.Side{ID: 1, Name: "Test Realm"}
	// Town 1 is the one under test. It is fed, clean and uninfected, so the
	// only pressure on it is anger: whatever population does here is the
	// unrest's doing alone.
	state.Towns[1] = &model.Town{
		ID: 1, Name: "Angryburg", SideID: 1, State: "NY", Holder: 1,
		Population: pop, FoundedPopulation: pop, Prosperity: 0.5,
		FoodStock: 1e9, FoodDays: 30,
		Unrest: unrestCap, Money: 1000, Loyalty: 0.5,
	}
	// Calm neighbours within the distance people will travel, so the furious
	// town has destinations and the movement is a real transfer between towns.
	for i := 0; i < 4; i++ {
		id := 2 + i
		state.Towns[id] = &model.Town{
			ID: id, Name: "Refugeeville", SideID: 1, State: "NY", Holder: 1,
			Population: pop, FoundedPopulation: pop, Prosperity: 0.5,
			FoodStock: 1e9, FoodDays: 30,
			Unrest:  0,
			Money:   1000,
			Loyalty: 0.5,
			X:       float64(20 * (i + 1)), Y: 0,
		}
	}
	return state
}

// runDays advances the world n days with migration and demography in their
// documented order, holding town 1 at maximum unrest throughout.
func runDays(t *testing.T, cfg *config.Config, state *model.State, n int) {
	t.Helper()
	eng := sim.NewEngine(cfg, cause.NewLog(10000), 42,
		[]sim.System{System(), demography.System()})
	for day := 0; day < n; day++ {
		// The unrest system is not running here, so unrest is held by hand at
		// the cap. This is the scenario under test, not a claim about how the
		// game reaches it.
		state.Towns[1].Unrest = unrestCap
		if err := eng.Tick(state); err != nil {
			t.Fatalf("tick %d: %v", day, err)
		}
	}
}

// TestUnrestAtCapDeclinesButDoesNotEmpty is the reproduction. A town held at
// maximum unrest for a year must still be a town.
func TestUnrestAtCapDeclinesButDoesNotEmpty(t *testing.T) {
	cfg := balanceConfig(t)
	const start = 20000.0
	state := depopWorld(start)

	runDays(t, cfg, state, 365)

	got := state.Towns[1].Population
	if got <= 0 {
		t.Fatalf("a town at unrest %.1f emptied completely over a year: population %g, started %g",
			unrestCap, got, start)
	}

	// A survivable minimum, expressed as a share of the population the town
	// started with. 0.10 is the smallest share the world generator treats as a
	// village in its own right (world.village_pop_share_min), so a town that
	// keeps a tenth of its people is still a settlement rather than a ruin.
	floor := start * 0.10
	if got < floor {
		t.Errorf("a town at unrest %.1f fell below its survivable minimum over a year: population %g, floor %g (%.1f%% of %g)",
			unrestCap, got, floor, 100*got/start, start)
	}

	// Severe decline, though. If unrest did nothing to the population this
	// test would pass for the wrong reason, and the model would have stopped
	// meaning that anger empties a town.
	if got >= start*0.9 {
		t.Errorf("unrest %.1f barely dented a town: population %g after a year, started %g",
			unrestCap, got, start)
	}
	t.Logf("town at unrest %.1f: %g -> %g over a year (%.1f%% of founding population)",
		unrestCap, start, got, 100*got/start)
}

// TestMigrationMovesPeopleRatherThanDestroyingThem pins the other half of the
// model. Migration is a transfer: a person who leaves one town arrives in
// another. If departures are subtracted without arriving anywhere, the region
// loses people who never existed anywhere else, which is indistinguishable
// from depopulation in the population totals.
func TestMigrationMovesPeopleRatherThanDestroyingThem(t *testing.T) {
	cfg := balanceConfig(t)

	// Every town furious at once, which is when the region's people are most
	// likely to want to leave at the same time and the destinations have least
	// room for them.
	state := depopWorld(20000)
	for _, town := range state.Towns {
		town.Unrest = unrestCap
	}
	total := func() float64 {
		sum := 0.0
		for _, town := range state.Towns {
			sum += town.Population
		}
		return sum
	}
	before := total()

	runDays(t, cfg, state, 120)

	// Births are the only thing that adds people in this run, and the growth
	// rate is far below one percent a year, so allowing generous headroom the
	// region's people can only have been conserved. A migration system that
	// destroyed its own departures would show up here as a collapse.
	after := total()
	if after < before*0.90 {
		t.Errorf("migration destroyed people: region total %g -> %g over 120 days (%.1f%% kept)",
			before, after, 100*after/before)
	}
	t.Logf("region total %g -> %g over 120 days", before, after)
}

// TestNetMigrationIsAPerTickFlowNotABalance checks the accumulator directly.
// net_migration is the movement for one day. If it is left set, demography
// re-applies the same movement every day afterwards, and a town that once lost
// people keeps losing them at that rate forever.
//
// The guarantee asserted here is the model's own: a day's outflow cannot exceed
// one day's share of the people the town had available to lose. Under the
// balance bug the figure grew every day — a town shedding 1.6% of its people
// reported -319, then -638, then -952, then -1256 — until it reached zero
// population in a fortnight.
func TestNetMigrationIsAPerTickFlowNotABalance(t *testing.T) {
	cfg := balanceConfig(t)
	state := depopWorld(20000)
	town := state.Towns[1]

	eng := sim.NewEngine(cfg, cause.NewLog(10000), 42,
		[]sim.System{System(), demography.System()})

	prevFlow := 0.0
	for day := 0; day < 60; day++ {
		town.Unrest = unrestCap
		popBefore := town.Population
		floor := cfg.Migrate.MinSettlementShare * popBefore
		// The most that could possibly leave today, before any destination is
		// considered.
		ceiling := cfg.Migrate.MaxFleeShare * (popBefore - floor)

		if err := eng.Tick(state); err != nil {
			t.Fatalf("tick %d: %v", day, err)
		}

		flow := town.NetMigration
		if flow < -ceiling {
			t.Errorf("day %d: net_migration %g exceeds one day's share of the people available (%g); "+
				"the field is carrying a balance forward, not reporting one day's movement",
				day, flow, -ceiling)
		}
		// The town is losing people and the outflow should be shrinking with
		// them, never accelerating.
		if day > 0 && flow < prevFlow && popBefore < 20000 {
			t.Errorf("day %d: outflow grew from %g to %g while the town was shrinking; "+
				"flight is not diminishing as the town empties", day, prevFlow, flow)
		}
		prevFlow = flow
	}
	t.Logf("after 60 days of maximum unrest: population %g, that day's movement %g",
		town.Population, town.NetMigration)
}

// TestATownWithNowhereToFleeToKeepsItsPeople covers the other conservation
// hole. A source decides how many people will leave before it knows where they
// are going, so if it then finds nowhere to send them and subtracts them
// anyway, those people are subtracted from the world. An isolated town is that
// case, and it is the one flight is built for: a region where every town is as
// unpleasant as the one you are in.
func TestATownWithNowhereToFleeToKeepsItsPeople(t *testing.T) {
	cfg := balanceConfig(t)
	pop := 20000.0
	state := &model.State{
		Towns: map[int]*model.Town{
			// Far from everything, past MaxMoveLeagues, so no destination
			// exists at any weight.
			1: {
				ID: 1, Name: "Isolated", SideID: 1, State: "NY", Holder: 1,
				Population: pop, FoundedPopulation: pop, Prosperity: 0.5,
				FoodStock: 1e9, FoodDays: 30, Unrest: unrestCap,
				Money: 1000, Loyalty: 0.5, X: 5000, Y: 5000,
			},
		},
		Rulers: map[int]*model.Ruler{},
		Sides:  map[int]*model.Side{1: {ID: 1, Name: "Test Realm"}},
		Year:   1950,
	}

	runDays(t, cfg, state, 60)

	// Births are the only thing adding people here, so the town must have grown
	// or held. Any material loss is migration destroying people it never
	// delivered.
	if got := state.Towns[1].Population; got < pop {
		t.Errorf("a town with nowhere to flee to lost people: %g -> %g over 60 days", pop, got)
	}
}
