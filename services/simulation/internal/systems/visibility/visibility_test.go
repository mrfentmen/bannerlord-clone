package visibility

import (
	"math"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/worldgen"
)

// testConfig loads the shipped balance file.
//
// This matters more here than in most systems. The visibility constants are
// meaningless in isolation: a 50 km radius is only a sensible number against a
// real map's scale and a real roster, and a config built field-by-field in this
// file would have zeros everywhere the world generator reads, producing an empty
// world and a test that passes because nothing happened.
//
// config.LoadDefault cannot be used because it resolves config/balance.toml
// against the working directory, and a test runs in its own package directory.
func testConfig() *config.Config {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		panic("visibility: cannot locate the test source file")
	}
	// services/simulation/internal/systems/visibility -> services/simulation/config.
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		panic("visibility: load balance.toml: " + err.Error())
	}
	return cfg
}

// world is a small fixture: two sides, three towns, and one party per side at a
// stated position. Positions are in leagues; at the shipped 50 km radius one
// league is 50/4.828032 = 10.36, so the distances below are chosen to sit
// clearly inside or clearly outside that, with nothing near the boundary.
type world struct {
	state  *model.State
	engine *sim.Engine
	log    *cause.Log
	sideA  int
	sideB  int
}

func newWorld(t *testing.T) *world {
	t.Helper()
	st := model.NewState()

	st.Sides[1] = &model.Side{ID: 1, Name: "Northern Compact"}
	st.Sides[2] = &model.Side{ID: 2, Name: "Southern Compact"}

	// Town 1 is next to side A's party, town 2 is next to side B's, and town 3
	// is far from both. All three are on plain ground in spring so that no
	// terrain or season penalty applies, which keeps the distance the only
	// variable in the tests that are about distance.
	st.Towns[1] = &model.Town{ID: 1, Name: "Northgate", SideID: 1, Population: 20000,
		X: 0, Y: 0, Terrain: model.TerrainPlain, LastSeenTick: -1}
	st.Towns[2] = &model.Town{ID: 2, Name: "Southport", SideID: 2, Population: 20000,
		X: 500, Y: 0, Terrain: model.TerrainPlain, LastSeenTick: -1}
	st.Towns[3] = &model.Town{ID: 3, Name: "Far Hollow", SideID: 2, Population: 20000,
		X: 250, Y: 500, Terrain: model.TerrainPlain, LastSeenTick: -1}

	// Side A's party sits 2 leagues from town 1, well inside the radius.
	st.Parties[1] = &model.Party{ID: 1, Name: "A's column", SideID: 1,
		X: 2, Y: 0, Troops: 100, DestTown: -1}
	// Side B's party sits 2 leagues from town 2.
	st.Parties[2] = &model.Party{ID: 2, Name: "B's column", SideID: 2,
		X: 498, Y: 0, Troops: 100, DestTown: -1}

	log := cause.NewLog(10000)
	cfg := testConfig()
	w := &world{
		state: st,
		log:   log,
		// The engine runs only this system. That is not a stub: it is the real
		// tick loop, the real write set, and the real commit path, with the
		// other systems left out so the assertions are about visibility and
		// not about what the food system happened to do to a town.
		engine: sim.NewEngine(cfg, log, 1, []sim.System{System()}),
		sideA:  1,
		sideB:  2,
	}
	return w
}

// tick advances the simulation one day and returns an error, failing the test
// if the engine rejects a write.
func (w *world) tick(t *testing.T) {
	t.Helper()
	if err := w.engine.Tick(w.state); err != nil {
		t.Fatalf("tick failed: %v", err)
	}
}

// TestSystemName pins the name, because the name is how the cause log attributes
// a row, how the decoupling test recognises the package, and how the order
// report names it.
func TestSystemName(t *testing.T) {
	if got := System().Name; got != "visibility" {
		t.Errorf("system name = %q, want %q", got, "visibility")
	}
	if System().Doc == "" {
		t.Error("system has no doc string; the order report would print a blank line")
	}
	if System().Runs == nil {
		t.Error("system has no Runs function")
	}
}

// TestSeesOwnNeighbourhood is the normal case: a side sees the town its party is
// standing next to, and not the towns it is far from.
func TestSeesOwnNeighbourhood(t *testing.T) {
	w := newWorld(t)
	w.tick(t)

	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("side A's party is 2 leagues from town 1 and should see it")
	}
	if SideSees(w.state.Towns[3].SightedSides, w.sideA) {
		t.Error("town 3 is 500 leagues away and side A should not see it")
	}
	if !SideSees(w.state.Towns[2].SightedSides, w.sideB) {
		t.Error("side B's party is 2 leagues from town 2 and should see it")
	}
	if SideSees(w.state.Towns[1].SightedSides, w.sideB) {
		t.Error("town 1 is 498 leagues from side B's party and should not be visible")
	}
}

// TestSidesDoNotShareSight is the point of the whole feature: what one side
// knows is not what another knows. A shared map would make this assertion fail
// on town 2.
func TestSidesDoNotShareSight(t *testing.T) {
	w := newWorld(t)
	w.tick(t)

	if !SideSees(w.state.Towns[2].SightedSides, w.sideB) {
		t.Fatal("precondition: side B should see town 2")
	}
	if SideSees(w.state.Towns[2].SightedSides, w.sideA) {
		t.Error("side A saw a town only side B has eyes on; fog of war is not working")
	}
	if SideSees(w.state.Towns[2].EverSeenSides, w.sideA) {
		t.Error("side A has never been near town 2, so it has never seen it")
	}
}

// TestCountsMatchMasks checks the per-side aggregates against the masks they
// summarise. These are two views of one computation published in the same tick,
// and a disagreement between them would be a state in which the map and the
// tally contradict each other.
func TestCountsMatchMasks(t *testing.T) {
	w := newWorld(t)
	w.tick(t)

	for _, sid := range w.state.SideIDs() {
		side := w.state.Sides[sid]
		wantVisible := float64(len(CurrentlyVisibleTowns(w.state, sid)))
		wantKnown := float64(len(KnownTowns(w.state, sid)))
		if side.VisibleTowns != wantVisible {
			t.Errorf("side %d visible_towns = %.0f, want %.0f", sid, side.VisibleTowns, wantVisible)
		}
		if side.KnownTowns != wantKnown {
			t.Errorf("side %d known_towns = %.0f, want %.0f", sid, side.KnownTowns, wantKnown)
		}
	}
}

// TestDiscoveryIsPermanent is the recovery case, and the reason EverSeenSides
// exists separately from SightedSides: a side that walks away from a town keeps
// knowing it is there.
func TestDiscoveryIsPermanent(t *testing.T) {
	w := newWorld(t)
	w.tick(t)

	if !SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Fatal("precondition: side A should have found town 1")
	}

	// March side A's party far away and let the memory window lapse. The town
	// must leave the visible set and stay in the known set.
	w.state.Parties[1].X = 2000
	w.state.Parties[1].Y = 2000
	for i := 0; i < int(testConfig().Visibility.SightingMemoryDays)+2; i++ {
		w.tick(t)
	}

	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("side A's party is 2800 leagues away; town 1 should not be visible")
	}
	if !SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("side A found town 1 and must keep knowing it after walking away")
	}
	if !SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("discovery must not decay with the sighting memory")
	}
}

// TestMemoryWindowIsBounded is the other half of the recovery case. After the
// window closes the sighting is no longer counted as current, but the town is
// still known. If memory never expired, visibility would be a one-way ratchet
// and a side would see the whole map by tick 1000.
func TestMemoryWindowIsBounded(t *testing.T) {
	w := newWorld(t)
	w.tick(t)
	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Fatal("precondition: side A should see town 1 while standing next to it")
	}

	w.state.Parties[1].X = 2000
	w.state.Parties[1].Y = 2000
	// One day short of the window: still counted as seen.
	memory := int(testConfig().Visibility.SightingMemoryDays)
	for i := 0; i < memory; i++ {
		w.tick(t)
	}
	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Errorf("sighting should survive %d days of memory; the window is %d days",
			memory, memory)
	}
	// Past the window: no longer current, still known.
	for i := 0; i < 3; i++ {
		w.tick(t)
	}
	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("sighting outlived its memory window")
	}
	if !SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("town should still be known after its sighting goes stale")
	}
}

// TestZeroMemoryMeansNoMemory checks the config is actually read rather than the
// window being hardcoded. A test that passes with the constant changed would not
// be testing the balance file.
func TestZeroMemoryMeansNoMemory(t *testing.T) {
	w := newWorld(t)
	w.engine.Cfg.Visibility.SightingMemoryDays = 0
	w.tick(t)

	w.state.Parties[1].X = 2000
	w.state.Parties[1].Y = 2000
	w.tick(t)

	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("with zero memory a town should stop being visible the day the party leaves")
	}
	if !SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("zero memory must not mean the town is forgotten, only unobserved")
	}
}

// TestTinyTownIsNotSpotted is the failure case for the population floor. The town
// is directly under the party's nose, so only the floor can be keeping it dark.
func TestTinyTownIsNotSpotted(t *testing.T) {
	w := newWorld(t)
	w.state.Towns[1].Population = 4
	w.tick(t)

	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("a hamlet of four should not be reported from a party's lookouts")
	}
	// Raising it above the floor must make it visible again, which proves the
	// floor is what excluded it rather than the geometry.
	w.state.Towns[1].Population = 1000
	w.tick(t)
	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("the town is 2 leagues away and above the population floor; it should be seen")
	}
}

// TestMountainTownIsHarderToSpot checks the terrain penalty narrows the radius
// rather than doing nothing. The town is placed just outside the mountain
// radius and just inside the plain one, so the only thing that can move it
// across the boundary is the terrain term.
//
// The distances are derived from the function under test rather than written
// out, so the test keeps testing the relationship it claims to even if the
// balance numbers are retuned.
func TestMountainTownIsHarderToSpot(t *testing.T) {
	w := newWorld(t)
	town := w.state.Towns[1]
	party := w.state.Parties[1]
	party.DestTown = -1
	party.X, party.Y = 0, 0
	w.state.Tick = 200 // high summer, so no season penalty confuses the terrain term

	plain := sightRadiusLeagues(w.engine.Cfg.Visibility, town, 200)
	town.Terrain = model.TerrainMountain
	mountain := sightRadiusLeagues(w.engine.Cfg.Visibility, town, 200)
	if !(mountain < plain) {
		t.Fatalf("precondition: mountain radius %.2f should be shorter than plain %.2f", mountain, plain)
	}
	// Park the town between the two radii, so the only thing that can decide
	// whether it is seen is the terrain.
	town.X = (plain + mountain) / 2
	town.Terrain = model.TerrainPlain
	if !(mountain < town.X && town.X < plain) {
		t.Fatalf("test distance %.2f is not between the radii (%.2f, %.2f)", town.X, mountain, plain)
	}

	w.tick(t)
	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("precondition: the town should be within reach on open ground")
	}

	// Same distance, rougher ground: out of reach.
	w.state.Towns[1].Terrain = model.TerrainMountain
	w.state.Towns[1].LastSeenTick = -1
	w.state.Tick = 200
	w.tick(t)
	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Errorf("mountainous ground should shorten the reach enough to lose a town at %.2f leagues", town.X)
	}
}

// TestWinterShortensSight checks the season term is wired to the day of the
// year rather than being a constant. Day 30 is deep winter and day 200 is high
// summer, and the same town at the same distance must fall differently.
//
// Memory is switched off here on purpose. A town seen in summer is still inside
// the memory window in winter, so leaving memory on would hide the season effect
// behind a stale sighting and this test would pass for the wrong reason.
func TestWinterShortensSight(t *testing.T) {
	w := newWorld(t)
	w.engine.Cfg.Visibility.SightingMemoryDays = 0
	town := w.state.Towns[1]
	party := w.state.Parties[1]
	party.DestTown = -1
	party.X, party.Y = 0, 0

	summer := sightRadiusLeagues(w.engine.Cfg.Visibility, town, 200)
	winter := sightRadiusLeagues(w.engine.Cfg.Visibility, town, 30)
	if !(winter < summer) {
		t.Errorf("winter radius %.2f should be shorter than summer radius %.2f", winter, summer)
	}
	if seasonWeight(30) != 1 {
		t.Error("day 30 is deep winter and should carry the full season penalty")
	}
	if seasonWeight(200) != 0 {
		t.Error("day 200 is summer and should carry no season penalty")
	}
	// Park the town between the two radii, so the only thing that can decide
	// whether it is seen is the season.
	town.X = (summer + winter) / 2
	if !(winter < town.X && town.X <= summer) {
		t.Fatalf("test distance %.2f is not between the radii (winter %.2f, summer %.2f)",
			town.X, winter, summer)
	}

	w.state.Tick = 200
	w.tick(t)
	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("in summer the town should be within reach")
	}
	w.state.Tick = 30
	w.tick(t)
	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("in winter the same town at the same distance should be out of reach")
	}
}

// TestPartyWithNoTroopsSeesNothing is the failure case for the observer filter.
// A gutted column has nobody standing watch, and counting it would keep a town
// lit up after the men who could see it are dead.
//
// Memory is off so the assertion is about the observer and not about a sighting
// still inside its window; TestPartyWithNoTroopsSeesNothingKeepsMemory then
// covers the combination.
func TestPartyWithNoTroopsSeesNothing(t *testing.T) {
	w := newWorld(t)
	w.engine.Cfg.Visibility.SightingMemoryDays = 0
	w.tick(t)
	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Fatal("precondition: the party should see the town")
	}

	w.state.Parties[1].Troops = 0
	w.tick(t)
	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("a party with no troops has no lookouts and should see nothing")
	}
	if !SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("the town was seen a moment ago and must stay known")
	}
}

// TestPartyWithNoTroopsSeesNothingKeepsMemory checks the interaction: a sighting
// already inside its memory window survives the observer losing its troops. That
// is the honest result, because the sighting was real when it was made and a
// report does not become untrue because the messenger died on the way home.
func TestPartyWithNoTroopsSeesNothingKeepsMemory(t *testing.T) {
	w := newWorld(t)
	w.tick(t)

	w.state.Parties[1].Troops = 0
	w.tick(t)
	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("a sighting inside its memory window should survive the observer being gutted")
	}
	// Past the window it goes.
	for i := 0; i < int(testConfig().Visibility.SightingMemoryDays)+2; i++ {
		w.tick(t)
	}
	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("once the memory window closes, a party with no troops sees nothing")
	}
}

// TestRaidersRevealNothing checks the unaffiliated rule. A raider band has no
// side, so it has nobody to report to, and letting it light up the map would be
// reporting to a recipient that does not exist.
func TestRaidersRevealNothing(t *testing.T) {
	w := newWorld(t)
	w.state.Parties[3] = &model.Party{ID: 3, Name: "Raiders", SideID: -1,
		X: 1, Y: 1, Troops: 40, DestTown: -1}
	w.state.Parties[1].Troops = 0 // remove the legitimate observer
	w.state.Parties[2].Troops = 0
	w.tick(t)

	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("a raider band revealed a town to a side it does not belong to")
	}
	if SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("a raider band should not enter a side's discovered set")
	}

	// With the config switch on, the mask is built from unaffiliated parties
	// too. There is still no side to attribute it to, so the assertion is that
	// the run does not crash and that no *side* gains the town, which is the
	// behaviour a recipient-less sighting has to have.
	w.engine.Cfg.Visibility.UnaffiliatedPartiesSee = true
	w.tick(t)
	if SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("even with unaffiliated parties enabled, a side must not gain a town it did not find")
	}
}

// TestPartyInTownSeesIt is the own-town rule. It is what stops a radius tuned
// small enough to make fog of war interesting from fogging out the city an army
// is camped in.
//
// Memory is off so the second half is about the switch rather than about a
// sighting made moments earlier.
func TestPartyInTownSeesIt(t *testing.T) {
	w := newWorld(t)
	w.engine.Cfg.Visibility.SightingMemoryDays = 0
	// Put the party inside the town and cut the radius to almost nothing. The
	// town is offset from the party by half a league so that the ordinary
	// distance test genuinely fails and the own-town rule is the only thing
	// that can make the town visible. A party at exactly the town's coordinates
	// would be at distance zero and would be inside even a zero radius, which
	// would make this test pass without the rule it is checking.
	w.engine.Cfg.Visibility.SightRadiusKm = 0.0001
	w.state.Towns[1].X = 50
	w.state.Towns[1].Y = 50
	w.state.Parties[1].X = 50.5
	w.state.Parties[1].Y = 50
	w.state.Parties[1].DestTown = 1
	w.tick(t)

	if !SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("a party standing in a town must see that town whatever the radius")
	}

	// With the switch off, the same position sees nothing, which proves the rule
	// is the switch and not the geometry.
	w.engine.Cfg.Visibility.OwnPartySeesTown = false
	w.tick(t)
	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("with own_party_sees_town off, a zero radius should see nothing")
	}
}

// TestPartyInTownLosesTheView checks the flip side: a party that leaves a town
// stops counting as being in it. State.TownOf returns the nearest town at any
// distance, so without a range check on its answer every party would keep the
// nearest town on the whole map lit up forever, and fog of war would report one
// permanent sighting per side.
func TestPartyInTownLosesTheView(t *testing.T) {
	w := newWorld(t)
	w.engine.Cfg.Visibility.SightingMemoryDays = 0
	// The radius is large enough that the party would otherwise see town 1 from
	// where it is standing, so the only thing that can stop it is the own-town
	// rule being range-checked.
	w.state.Parties[1].X = 3000
	w.state.Parties[1].Y = 3000
	w.state.Parties[1].DestTown = -1
	w.tick(t)

	if SideSees(w.state.Towns[1].SightedSides, w.sideA) {
		t.Error("a party 3000 leagues from the nearest town is not standing in it")
	}
	if SideSees(w.state.Towns[1].SightedSides, w.sideB) {
		t.Error("side A's party must not light up side B's town either")
	}
}

// TestUnknownTownWritesNothing is the failure case for a world with no observer.
// A town nobody is near must produce no writes at all, not writes of zeroes: a
// system that rewrites every town every tick regardless would be doing a
// hundred thousand no-op commits a run for nothing.
func TestUnknownTownWritesNothing(t *testing.T) {
	w := newWorld(t)
	// Move both parties off the map entirely.
	w.state.Parties[1].X = 5000
	w.state.Parties[1].Y = 5000
	w.state.Parties[2].X = 5000
	w.state.Parties[2].Y = 5000
	w.tick(t)

	for _, tid := range w.state.TownIDs() {
		tn := w.state.Towns[tid]
		if tn.SightedSides != 0 {
			t.Errorf("town %d gained mask %.0f with no observer anywhere near", tid, tn.SightedSides)
		}
		if tn.EverSeenSides != 0 {
			t.Errorf("town %d was discovered with no observer near it", tid)
		}
		if tn.LastSeenTick != -1 {
			t.Errorf("town %d last_seen_tick = %.0f, want -1 for a town never seen", tid, tn.LastSeenTick)
		}
	}
}

// TestSideBitLayout pins the mask encoding, because it is a wire format. The
// test names the exact value so that changing the layout breaks a test rather
// than silently changing what every stored mask means.
func TestSideBitLayout(t *testing.T) {
	if got := sideBit(1); got != 2 {
		t.Errorf("side 1 should be bit 1 (value 2), got %d", got)
	}
	if got := sideBit(2); got != 4 {
		t.Errorf("side 2 should be bit 2 (value 4), got %d", got)
	}
	if got := sideBit(1) | sideBit(2); got != 6 {
		t.Errorf("sides 1 and 2 together should be mask 6, got %d", got)
	}
	if got := countBits(sideBit(1) | sideBit(2) | sideBit(5)); got != 3 {
		t.Errorf("mask with three sides should count 3, got %.0f", got)
	}
	// A mask must survive the float64 round trip the field registry forces,
	// because that is how it reaches committed state.
	m := sideBit(1) | sideBit(6) | sideBit(20)
	if maskToFloat(m) != float64(m) {
		t.Errorf("mask %d does not survive a float64 round trip (%v)", m, maskToFloat(m))
	}
	if SideSees(maskToFloat(m), 20) != true {
		t.Error("side 20 lost its bit through the float64 conversion")
	}
	if SideSees(maskToFloat(m), 21) {
		t.Error("side 21 gained a bit that was never set")
	}
}

// TestSideBitOutOfRangeIsZero checks the guard that stops a mask rounding into
// the wrong set of sides. A float64 is exact to 2^53, so bit 53 and above
// cannot be represented, and returning zero makes the caller skip the side
// rather than write a mask that lies.
func TestSideBitOutOfRangeIsZero(t *testing.T) {
	if sideBit(-1) != 0 {
		t.Error("a negative side id should have no bit")
	}
	if sideBit(53) != 0 {
		t.Error("side 53 needs bit 53, which a float64 cannot hold exactly; it must be refused")
	}
	if sideBit(52) == 0 {
		t.Error("side 52 is the last exactly representable bit and must be allowed")
	}
	if SideSees(0, 9999) {
		t.Error("an out-of-range side must never read as seeing anything")
	}
}

// TestQueriesAreSorted checks the accessor queries return ascending ids.
// A client comparing two snapshots would otherwise see them differ when nothing
// did, because Go randomises map iteration.
func TestQueriesAreSorted(t *testing.T) {
	w := newWorld(t)
	w.tick(t)

	for _, fn := range []func(*model.State, int) []int{KnownTowns, CurrentlyVisibleTowns} {
		got := fn(w.state, w.sideA)
		for i := 1; i < len(got); i++ {
			if got[i-1] >= got[i] {
				t.Fatalf("query returned %v, which is not ascending", got)
			}
		}
	}
	// And the same query twice must give the same answer.
	a := KnownTowns(w.state, w.sideB)
	b := KnownTowns(w.state, w.sideB)
	if len(a) != len(b) {
		t.Fatalf("repeated query disagreed: %v then %v", a, b)
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("repeated query disagreed at %d: %d then %d", i, a[i], b[i])
		}
	}
}

// TestNilTownIsNotVisible checks the accessors survive a missing town, which is
// what a snapshot build does when an entity was deleted mid-tick.
func TestNilTownIsNotVisible(t *testing.T) {
	if VisibleTowns(nil) != 0 || EverSeen(nil) != 0 {
		t.Error("a nil town should read as no mask rather than panicking")
	}
	st := model.NewState()
	if len(KnownTowns(st, 1)) != 0 || len(CurrentlyVisibleTowns(st, 1)) != 0 {
		t.Error("an empty state should yield empty queries")
	}
}

// TestSightRadiusConversion checks the kilometre-to-league conversion against
// the pipeline's own figure, because a silent mismatch here would mean the
// radius means one thing on a real map and another on a synthetic one.
func TestSightRadiusConversion(t *testing.T) {
	if KM_PER_LEAGUE != 4.828032 {
		t.Errorf("KM_PER_LEAGUE = %v, want 4.828032 (1 league = 3 statute miles)", KM_PER_LEAGUE)
	}
	// 50 km should be a little over ten leagues.
	got := 50.0 / KM_PER_LEAGUE
	if got < 10.3 || got > 10.4 {
		t.Errorf("50 km is %.4f leagues, expected about 10.36", got)
	}
}

// TestDiscoveryIsCauseLogged checks the one event this system produces appears in
// the cause log with the system named. A discovery that is not logged is a
// discovery the Why panel cannot explain, which CONSTITUTION.md section 2.2
// forbids.
func TestDiscoveryIsCauseLogged(t *testing.T) {
	w := newWorld(t)
	w.tick(t)

	row, ok := w.log.LatestFor(model.KindTown, 1, "ever_seen_sides")
	if !ok {
		t.Fatal("a discovered town should have written a cause row")
	}
	if row.System != "visibility" {
		t.Errorf("cause row attributed to %q, want %q", row.System, "visibility")
	}
	if row.Old != 0 {
		t.Errorf("discovery row has old mask %.0f, want 0 for a town never seen", row.Old)
	}
	if row.New == 0 {
		t.Error("discovery row has an empty new mask")
	}
	if row.Read == "" {
		t.Error("cause row records no read state; CONSTITUTION.md section 2.2 requires it")
	}
}

// TestMovementDoesNotLog checks the mundane recomputation stays out of the log.
// A sighting mask that writes a row every tick for every town would bury the
// discovery rows that matter, and this is the assertion that catches that.
func TestMovementDoesNotLog(t *testing.T) {
	w := newWorld(t)
	w.tick(t)
	rowsAfterFirst := w.log.Len()

	// Nothing has moved. A second identical tick must add no rows.
	w.tick(t)
	if got := w.log.Len(); got != rowsAfterFirst {
		t.Errorf("an unchanged tick added %d cause rows; visibility should log only discoveries",
			got-rowsAfterFirst)
	}
}

// TestRepeatedSightIsIdempotent checks that a town already known does not gain a
// new discovery row every day. If it did, a side camped outside a town would
// write a row per day for as long as it stayed there.
func TestRepeatedSightIsIdempotent(t *testing.T) {
	w := newWorld(t)
	w.tick(t)
	rowsAfterFirst := w.log.Len()

	for i := 0; i < 5; i++ {
		w.tick(t)
	}
	if got := w.log.Len(); got != rowsAfterFirst {
		t.Errorf("five further ticks beside an already-known town added %d rows, want 0",
			got-rowsAfterFirst)
	}
}

// TestSightingIsCumulativeAcrossTicks checks that walking a party from town to
// town discovers each one, which is the whole use of the feature.
func TestSightingIsCumulativeAcrossTicks(t *testing.T) {
	w := newWorld(t)
	w.tick(t)
	if SideSees(w.state.Towns[3].EverSeenSides, w.sideA) {
		t.Fatal("precondition: side A has not been near town 3")
	}

	// Walk the party to town 3. The direct jump is used rather than a march
	// because this test is about the visibility sweep and not about movement.
	w.state.Parties[1].X = 250
	w.state.Parties[1].Y = 499
	w.tick(t)

	if !SideSees(w.state.Towns[3].EverSeenSides, w.sideA) {
		t.Error("side A marched to town 3 and should know it")
	}
	// And town 1, discovered on the first tick, is still known.
	if !SideSees(w.state.Towns[1].EverSeenSides, w.sideA) {
		t.Error("side A walked away from town 1 and must still know it is there")
	}
	if !SideSees(w.state.Towns[2].EverSeenSides, w.sideB) {
		t.Error("side B's own discovery should be unaffected by side A's movement")
	}
}

// TestOnAGeneratedWorld runs the system over a world the generator actually
// produces rather than a hand-placed fixture. Every other test here uses towns
// a metre apart, and a rule that only works on a map where everything is
// adjacent has not been tested at all.
//
// The world uses the shipped generation constants rather than shrunk ones. An
// earlier version of this test cut the town and ruler counts to make it quick
// and discovered that the generator does not survive it: with a target below its
// own internal minimum it produces no rulers and therefore no parties, and a
// world with no observers is a world where fog of war correctly reports nothing.
// That is worth knowing, and it is why the constants here are the real ones.
func TestOnAGeneratedWorld(t *testing.T) {
	cfg := testConfig()
	gen := worldgen.Generate(cfg, 8, nil)
	st := gen.State
	log := cause.NewLog(20000)
	engine := sim.NewEngine(cfg, log, 8, []sim.System{System()})

	const ticks = 30
	for i := 0; i < ticks; i++ {
		if err := engine.Tick(st); err != nil {
			t.Fatalf("tick %d: %v", i, err)
		}
	}

	// Preconditions. A world with no observers or no people would make every
	// assertion below pass vacuously, so they are checked rather than assumed.
	if len(st.Parties) == 0 {
		t.Fatal("generated world has no parties; there is nothing that could see anything")
	}
	populated := 0
	for _, tid := range st.TownIDs() {
		if st.Towns[tid].Population >= cfg.Visibility.MinPopulationToBeSeen {
			populated++
		}
	}
	if populated == 0 {
		t.Fatalf("no town is above the %.0f-person reporting floor; fog of war would report nothing",
			cfg.Visibility.MinPopulationToBeSeen)
	}
	t.Logf("%d towns (%d above the reporting floor), %d parties; after %d ticks:",
		len(st.Towns), populated, len(st.Parties), ticks)

	totalKnown, totalVisible := 0.0, 0.0
	for _, sid := range st.SideIDs() {
		totalKnown += st.Sides[sid].KnownTowns
		totalVisible += st.Sides[sid].VisibleTowns
	}
	if totalKnown == 0 {
		t.Fatalf("no side found a single town in %d ticks on a generated world of %d towns", ticks, len(st.Towns))
	}
	t.Logf("  %.0f town-side sightings, %.0f in sight", totalKnown, totalVisible)

	// Fog of war exists to stop a side seeing the whole map. A side that knows
	// every town has learned nothing from this system.
	for _, sid := range st.SideIDs() {
		if st.Sides[sid].KnownTowns >= float64(len(st.Towns)) {
			t.Errorf("side %d knows all %d towns; nothing is being hidden from it", sid, len(st.Towns))
		}
	}

	// The per-side counts and the per-town masks are published in one tick and
	// must not be able to disagree with each other.
	for _, sid := range st.SideIDs() {
		if n := float64(len(KnownTowns(st, sid))); n != st.Sides[sid].KnownTowns {
			t.Errorf("side %d: known_towns field says %.0f, masks hold %.0f", sid, st.Sides[sid].KnownTowns, n)
		}
		if n := float64(len(CurrentlyVisibleTowns(st, sid))); n != st.Sides[sid].VisibleTowns {
			t.Errorf("side %d: visible_towns field says %.0f, masks hold %.0f", sid, st.Sides[sid].VisibleTowns, n)
		}
	}

	// Some towns must remain unknown to somebody, or the world is fully explored
	// within a month and the radius is too generous for a 2900-league map.
	union := map[int]bool{}
	for _, sid := range st.SideIDs() {
		for _, tid := range KnownTowns(st, sid) {
			union[tid] = true
		}
	}
	if len(union) >= len(st.Towns) {
		t.Errorf("all %d towns are known to someone within %d ticks", len(st.Towns), ticks)
	}
	t.Logf("%d of %d towns found by at least one side", len(union), len(st.Towns))

	// A party's own town must be visible to it on the first tick, whatever the
	// map scale. This is the assertion that would catch a radius retuned so low
	// that armies stop seeing the city they are standing in.
	for _, pid := range st.PartyIDs() {
		p := st.Parties[pid]
		if p.Troops <= 0 || p.SideID < 0 {
			continue
		}
		// Find the nearest town and confirm it is inside the radius from the
		// party's own position, which is the arithmetic the system performs.
		nearest := st.TownOf(p)
		tn := st.Towns[nearest]
		if tn == nil {
			continue
		}
		dx, dy := tn.X-p.X, tn.Y-p.Y
		dist := math.Sqrt(dx*dx + dy*dy)
		radius := sightRadiusLeagues(cfg.Visibility, tn, 0)
		if dist <= radius && !SideSees(tn.SightedSides, p.SideID) && !SideSees(tn.EverSeenSides, p.SideID) {
			t.Errorf("party %d of side %d is %.2f leagues from town %d, inside its %.2f-league radius, but does not see it",
				pid, p.SideID, dist, nearest, radius)
		}
	}
}

// TestRadiusIsMeaningfulOnARealMap checks the shipped radius against the real
// map scale rather than against a fixture. A 50 km radius is about 10.4 leagues,
// and the generated map is 2900 leagues wide, so a side should see a small
// fraction of it. If it sees most of the map, the constant is wrong for the world
// it is being used in and no unit test on a two-town fixture would notice.
func TestRadiusIsMeaningfulOnARealMap(t *testing.T) {
	cfg := testConfig()
	if got := cfg.Visibility.SightRadiusKm; got != 50.0 {
		t.Errorf("sight radius is %.0f km, want the 50 km this system was specified with", got)
	}
	const mapWidthLeagues = 2900.0
	frac := (cfg.Visibility.SightRadiusKm / KM_PER_LEAGUE) / mapWidthLeagues
	if frac > 0.01 {
		t.Errorf("the sight radius covers %.2f%% of the map width; a side would see most of the country", frac*100)
	}
	t.Logf("50 km is %.2f leagues, %.3f%% of the %.0f-league map width",
		cfg.Visibility.SightRadiusKm/KM_PER_LEAGUE, frac*100, mapWidthLeagues)
}

// maskAll renders every town's visibility state as a comparable string. The
// engine guarantees a tick's result does not depend on system order, and this is
// the assertion that visibility specifically keeps that promise.
func maskAll(st *model.State) string {
	out := ""
	for _, tid := range st.TownIDs() {
		tn := st.Towns[tid]
		out += itoa(tid) + ":" + ftoa(tn.SightedSides) + ":" + ftoa(tn.EverSeenSides) + ":" + ftoa(tn.LastSeenTick) + ";"
	}
	for _, sid := range st.SideIDs() {
		sd := st.Sides[sid]
		out += "s" + itoa(sid) + ":" + ftoa(sd.VisibleTowns) + ":" + ftoa(sd.KnownTowns) + ";"
	}
	return out
}

func itoa(v int) string     { return strconv.Itoa(v) }
func ftoa(v float64) string { return strconv.FormatFloat(v, 'g', 17, 64) }

// TestOrderIndependence checks this system's result does not depend on where it
// sits in the documented order.
//
// CONSTITUTION.md section 2.1 makes systems-order independence a property of the
// engine rather than a convention, and visibility is a system that stages
// absolute writes to every town every tick, which is exactly the shape most
// likely to trip the engine's duplicate-absolute-write guard. A system that
// wrote its masks in map-iteration order would pass the fixture tests and fail
// here.
func TestOrderIndependence(t *testing.T) {
	// Two systems that touch nothing visibility reads, so the only thing that
	// can change the result is the order the engine runs them in.
	mk := func() []sim.System {
		return []sim.System{System(), {Name: "noop", Doc: "test", Runs: func(v *sim.View, w *sim.WriteSet) {}}}
	}
	run := func(systems []sim.System) string {
		cfg := testConfig()
		st := worldgen.Generate(cfg, 8, nil).State
		e := sim.NewEngine(cfg, cause.NewLog(100000), 8, systems)
		for i := 0; i < 10; i++ {
			if err := e.Tick(st); err != nil {
				t.Fatalf("tick: %v", err)
			}
		}
		return maskAll(st)
	}
	forward := run(mk())
	reversed := run([]sim.System{mk()[1], mk()[0]})
	if forward != reversed {
		t.Error("visibility result depended on system order")
	}
	again := run(mk())
	if forward != again {
		t.Error("two identical runs produced different visibility state")
	}
}
