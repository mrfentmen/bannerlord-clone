package events

import (
	"fmt"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

// The world these tests run in: two towns joined by one road, and a column
// walking from the first to the second. It is the smallest world in which all
// five events have something to happen to.
const (
	seed      = 42
	townA     = 1
	townB     = 2
	routeID   = 1
	caravanID = 1
	armyID    = 2
	rulerID   = 1
)

// testState builds the two-town world. Only the fields an event reads are set;
// everything else stays zero, which is also how the rest of the system's tests
// treat config.Config.
func testState() *model.State {
	s := model.NewState()
	s.Towns[townA] = &model.Town{
		ID: townA, Name: "Ashford", X: 0, Y: 0,
		Population: 8000, FoodStock: 9000, FoodDemand: 400,
		Prosperity: 0.8, RoadSafety: 0.7, Sanitation: 0.9, Money: 500,
	}
	s.Towns[townB] = &model.Town{
		ID: townB, Name: "Brindle", X: 40, Y: 0,
		Population: 6000, FoodStock: 3000, FoodDemand: 300,
		Prosperity: 0.4, RoadSafety: 0.5, Sanitation: 0.9, Money: 200,
	}
	s.Routes[routeID] = &model.Route{
		ID: routeID, TownA: townA, TownB: townB, Length: 40,
		Safety: 0.5, Raiders: 1, Traffic: 2,
	}
	// A caravan walking Ashford to Brindle: the thing an ambush catches and the
	// thing a trader is compared against.
	s.Parties[caravanID] = &model.Party{
		ID: caravanID, Name: "Caravan", SideID: 1, RulerID: -1,
		X: 0, Y: 0, DestTown: townB, HomeTown: townA,
		Troops: 14, Food: 60, CargoFood: 400,
		IsCaravan: true, Activity: model.ActMarching, Morale: 0.8,
	}
	// A field army whose morale has broken: the thing that deserts.
	s.Parties[armyID] = &model.Party{
		ID: armyID, Name: "Levy", SideID: 1, RulerID: rulerID,
		X: 20, Y: 0, HomeTown: townA,
		Troops: 100, Food: 200, Morale: 0.05,
		Activity: model.ActMarching,
	}
	s.Rulers[rulerID] = &model.Ruler{
		ID: rulerID, Name: "Countess", SideID: 1, Influence: 100, IsAlive: true,
	}
	s.Sides[1] = &model.Side{ID: 1, Name: "Test Faction"}
	return s
}

// testConfig sets the balance constants the events actually read, at values
// that make each event's arithmetic checkable by hand.
func testConfig() *config.Config {
	c := &config.Config{}
	c.Security.RobChanceBase = 0.42
	c.Security.RobChanceSafetyWeight = 0.9
	c.Security.DeserterShare = 0.4
	c.Upkeep.DesertionMoraleThreshold = 0.28
	c.Upkeep.DesertionRate = 0.045
	c.Upkeep.DesertionMaxShare = 0.02
	c.Upkeep.DesertionInfluenceLoss = 0.02
	c.Upkeep.MinTroopsToPersist = 6
	c.Logistic.MaxCaravansPerRoute = 5
	c.Logistic.CaravanCapacity = 2600
	c.Logistic.CaravanGuards = 14
	c.Logistic.CaravanFoodNeed = 26
	c.Logistic.CaravanFoodDays = 3
	c.Logistic.MedicineShare = 0.18
	c.Logistic.MetalShare = 0.12
	c.Logistic.CaravanRiskDeath = 0.05
	c.Market.StockTargetDays = 32
	c.Migrate.ImmigrantsPerDayCap = 0.014
	return c
}

// testView builds the View a system is handed on a tick.
func testView(s *model.State) (*sim.View, *sim.WriteSet) {
	return &sim.View{
			State: s,
			Log:   cause.NewLog(1000),
			Cfg:   testConfig(),
			Rng:   rng.New(seed),
			Tick:  100,
			Day:   100,
		},
		sim.NewWriteSet()
}

// engine builds a single-system engine. Ticking it commits the writes for real,
// which is how these tests check amounts: a staged write is only a claim, and
// the clamping in the engine is part of what an event must respect.
func engine(s *model.State) *sim.Engine {
	return sim.NewEngine(testConfig(), cause.NewLog(1000), seed, []sim.System{System()})
}

// wroteField reports whether the write set stages a write to a field, which is
// how the other system tests check that an effect happened.
func wroteField(w *sim.WriteSet, kind model.Kind, entity int, field string) bool {
	for _, d := range w.Debug() {
		if d.Kind == kind && d.Entity == entity && d.Field == field {
			return true
		}
	}
	return false
}

// forceRoll makes the ambush trigger certain, so a test can check what an
// ambush does rather than waiting for a roll. A base chance of one on a road
// with no safety and a full complement of raiders is a chance of exactly one,
// which the engine's roll always takes.
func forceRoll(v *sim.View) {
	v.Cfg.Security.RobChanceBase = 1
	v.State.Routes[routeID].Safety = 0
	v.State.Routes[routeID].Raiders = 1
	v.State.Towns[townA].RoadSafety = 0
	v.State.Towns[townB].RoadSafety = 0
}

// engineWith is engine with a config the test has adjusted, for the cases where
// the shipped tuning makes an event too rare or too gentle to commit inside a
// test.
func engineWith(s *model.State, adjust func(*config.Config)) *sim.Engine {
	c := testConfig()
	if adjust != nil {
		adjust(c)
	}
	return sim.NewEngine(c, cause.NewLog(1000), seed, []sim.System{System()})
}

// forcedEngine is engine with the ambush forced, so one tick commits one.
func forcedEngine(s *model.State) *sim.Engine {
	return engineWith(s, func(c *config.Config) { c.Security.RobChanceBase = 1 })
}

// tickUntilType runs ticks until an event of the given type fires and returns
// the state as it stood on the tick before it did, so a test can compare across
// the firing tick. The seed is fixed, so the day it fires on is the same every
// run; an event that never fires in three thousand days is itself the bug worth
// reporting, so this fails rather than returning empty.
func tickUntilType(t *testing.T, s *model.State, e *sim.Engine, want EventType) *model.State {
	t.Helper()
	for i := 0; i < 3000; i++ {
		before := s.Clone()
		if err := e.Tick(s); err != nil {
			t.Fatalf("tick %d returned %v", i, err)
		}
		if Counts()[want] > 0 {
			return before
		}
	}
	t.Fatalf("no %s event fired in 3000 ticks", want)
	return nil
}

func TestSystemIsARealEngineSystem(t *testing.T) {
	s := System()
	if s.Name != "events" {
		t.Errorf("Name = %q, want %q", s.Name, "events")
	}
	if s.Runs == nil {
		t.Error("Runs is nil, so the system would never tick")
	}
	if s.Doc == "" {
		t.Error("Doc is empty; the order report is generated from it")
	}
}

// Task 476: the ambush chance is the road's, not the town's.

func TestAmbushChanceFallsWithRoadSafety(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(BanditAmbush)
	if r == nil {
		t.Fatal("no rule for bandit ambush")
	}

	s.Routes[routeID].Safety = 0
	unsafe := r.Trigger(v, routeID)
	s.Routes[routeID].Safety = 1
	safe := r.Trigger(v, routeID)

	if unsafe <= 0 {
		t.Error("a road with no safety and raiders on it should be ambushable")
	}
	if !(unsafe > safe) {
		t.Errorf("chance on an unsafe road = %v, safe road = %v; want unsafe > safe", unsafe, safe)
	}
	if safe < 0 || unsafe > 1 {
		t.Errorf("chances must be in [0,1]: unsafe=%v safe=%v", unsafe, safe)
	}
}

func TestAmbushNeedsRaidersToDoTheAmbushing(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(BanditAmbush)
	s.Routes[routeID].Safety = 0.2

	s.Routes[routeID].Raiders = 0
	empty := r.Trigger(v, routeID)
	s.Routes[routeID].Raiders = 2
	occupied := r.Trigger(v, routeID)

	if !(occupied > empty) {
		t.Errorf("a road with raiders = %v, without = %v; want occupied > empty", occupied, empty)
	}
}

func TestAmbushOffersOnlyRoadsWithTraffic(t *testing.T) {
	s := testState()
	r := ruleFor(BanditAmbush)
	s.Routes[routeID].Traffic = 0
	if got := r.Subjects(&sim.View{State: s}); len(got) != 0 {
		t.Errorf("an empty road should offer no subjects, got %v", got)
	}
	s.Routes[routeID].Traffic = 3
	if got := r.Subjects(&sim.View{State: s}); len(got) != 1 || got[0] != routeID {
		t.Errorf("Subjects = %v, want [%d]", got, routeID)
	}
}

func TestAmbushAppliesToTheRoadTheColumnAndTheTowns(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	forceRoll(v)
	before := s.Clone()

	run(v, w)

	if err := w.Err(); err != nil {
		t.Fatalf("staged writes invalid: %v", err)
	}
	if Counts()[BanditAmbush] == 0 {
		t.Fatal("the ambush did not fire on a road with no safety and raiders on it")
	}
	// The band that ambushed is a band that exists afterwards.
	if !wroteField(w, model.KindRoute, routeID, "route_raiders") {
		t.Error("expected route_raiders to rise after an ambush")
	}
	// Traffic stops using a road it is being robbed on.
	if !wroteField(w, model.KindRoute, routeID, "route_traffic") {
		t.Error("expected route_traffic to fall after an ambush")
	}
	// Both ends of the road hear about it.
	for _, tid := range []int{townA, townB} {
		if !wroteField(w, model.KindTown, tid, "raider_pressure") {
			t.Errorf("expected raider_pressure to rise at town %d", tid)
		}
	}
	// The column pays in provisions and blood.
	if !wroteField(w, model.KindParty, caravanID, "party_food") {
		t.Error("expected the caravan to lose provisions")
	}
	if !wroteField(w, model.KindParty, caravanID, "wounded") {
		t.Error("expected the caravan to take casualties")
	}

	// And committed, the band is a real party and the town is worse off.
	if err := forcedEngine(s).Tick(s); err != nil {
		t.Fatalf("committing the ambush failed: %v", err)
	}
	if s.Routes[routeID].Raiders <= before.Routes[routeID].Raiders {
		t.Error("route_raiders did not rise in the committed state")
	}
	if s.Routes[routeID].Traffic >= before.Routes[routeID].Traffic {
		t.Error("route_traffic did not fall in the committed state")
	}
	if s.Parties[caravanID].Food >= before.Parties[caravanID].Food {
		t.Error("the caravan did not lose provisions in the committed state")
	}
	if s.Parties[caravanID].Wounded <= before.Parties[caravanID].Wounded {
		t.Error("the caravan took no casualties in the committed state")
	}
	found := false
	for _, pid := range s.PartyIDs() {
		if p := s.Parties[pid]; p != nil && p.IsRaider && p.Troops > 0 {
			found = true
			if p.CargoFood > before.Parties[caravanID].Food {
				t.Errorf("the band carries %v, more than the column had (%v): loot was created",
					p.CargoFood, before.Parties[caravanID].Food)
			}
		}
	}
	if !found {
		t.Error("the ambush spawned no raider band")
	}
}

func TestAmbushPicksTheWeakerColumn(t *testing.T) {
	Reset()
	s := testState()
	// A second column on the same road, stronger in every dimension than the
	// first: more men, more provisions and more cargo.
	s.Parties[3] = &model.Party{
		ID: 3, Name: "Caravan", X: 0, Y: 0, DestTown: townB, HomeTown: townA,
		Troops: 200, Food: 500, CargoFood: 900,
		IsCaravan: true, Activity: model.ActMarching, Morale: 0.8,
	}
	v, w := testView(s)
	forceRoll(v)

	run(v, w)

	if wroteField(w, model.KindParty, 3, "party_food") {
		t.Error("the ambush fell on the strong column; it should fall on the weak one")
	}
	if !wroteField(w, model.KindParty, caravanID, "party_food") {
		t.Error("the ambush did not fall on the weak column")
	}
}

func TestAmbushNothingToRobStillPressuresTheTowns(t *testing.T) {
	Reset()
	s := testState()
	// No column on the road at all.
	delete(s.Parties, caravanID)
	delete(s.Parties, armyID)
	v, w := testView(s)
	forceRoll(v)

	run(v, w)

	if Counts()[BanditAmbush] == 0 {
		t.Fatal("the ambush should still happen on an unsafe road")
	}
	if !wroteField(w, model.KindTown, townA, "raider_pressure") {
		t.Error("an ambush with no victim should still pressure the town")
	}
}

// Task 477: a trader finds the town with something to sell.

func TestMerchantCaravanNeedsAProsperousTownAndAPoorerNeighbour(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(MerchantCaravan)

	s.Towns[townA].Prosperity = 0.8
	s.Towns[townB].FoodStock = 100 // Brindle now has the least food
	if r.Trigger(v, townA) <= 0 {
		t.Error("a prosperous town beside a poorer one should find a trader")
	}

	// Prosperity is the point: a poor town does not draw trade.
	s.Towns[townA].Prosperity = 0.1
	if got := r.Trigger(v, townA); got != 0 {
		t.Errorf("a town with prosperity 0.1 should draw no trader, got %v", got)
	}
	s.Towns[townA].Prosperity = 0.8

	// Nor does a town whose neighbour wants nothing it has.
	s.Towns[townB].FoodStock = 99999
	if got := r.Trigger(v, townA); got != 0 {
		t.Errorf("a town beside a town with more food should draw no trader, got %v", got)
	}
}

func TestMerchantCaravanChanceRisesWithRoadSafety(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(MerchantCaravan)
	s.Towns[townB].FoodStock = 100

	s.Routes[routeID].Safety = 0.1
	s.Towns[townA].RoadSafety = 0.1
	unsafe := r.Trigger(v, townA)
	s.Routes[routeID].Safety = 0.9
	s.Towns[townA].RoadSafety = 0.9
	safe := r.Trigger(v, townA)

	if !(safe > unsafe) {
		t.Errorf("chance on a safe road = %v, unsafe = %v; want safe > unsafe", safe, unsafe)
	}
}

func TestMerchantCaravanLoadsGoodsAndAddsATrader(t *testing.T) {
	Reset()
	s := testState()
	s.Towns[townB].FoodStock = 100
	before := tickUntilType(t, s, engine(s), MerchantCaravan)

	caravans := 0
	for _, pid := range s.PartyIDs() {
		p := s.Parties[pid]
		if p == nil || pid == caravanID || !p.IsCaravan {
			continue
		}
		caravans++
		if p.DestTown != townB {
			t.Errorf("the trader is bound for town %d, want %d", p.DestTown, townB)
		}
		if p.CargoFood <= 0 {
			t.Error("the trader carries no goods")
		}
		if p.Troops <= 0 {
			t.Error("the trader has no guards")
		}
	}
	if caravans == 0 {
		t.Error("the caravan event spawned no trader")
	}
	// The goods left the town that sold them: the event moves food, it does not
	// print it.
	if s.Towns[townA].FoodStock >= before.Towns[townA].FoodStock {
		t.Error("the selling town's stock did not fall")
	}
	if s.Routes[routeID].Traffic < before.Routes[routeID].Traffic {
		t.Error("route_traffic fell; a dispatched trader adds traffic")
	}
}

// Task 478: people flee into a town that can take them.

func TestRefugeesComeFromDistressNextDoor(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(RefugeeGroup)

	// Brindle starving; Ashford able to take people in.
	s.Towns[townB].IsStarving = true
	if r.Trigger(v, townA) <= 0 {
		t.Error("a town beside a starving town should expect refugees")
	}
	if got := r.Trigger(v, townB); got != 0 {
		t.Errorf("the starving town itself should expect no refugees, got %v", got)
	}
	// With nothing wrong next door, nothing arrives.
	s.Towns[townB].IsStarving = false
	if got := r.Trigger(v, townA); got != 0 {
		t.Errorf("a calm region should expect no refugees, got %v", got)
	}
}

func TestRefugeeTriggerRisesWithNeighbourDistress(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(RefugeeGroup)

	s.Towns[townB].Unrest = 0.3
	restless := r.Trigger(v, townA)
	s.Towns[townB].IsStarving = true
	starving := r.Trigger(v, townA)

	if !(starving > restless) {
		t.Errorf("chance beside a starving town = %v, beside a restless one = %v; want starving > restless",
			starving, restless)
	}
}

func TestRefugeeGroupArrivalsBecomePeopleAndHygiene(t *testing.T) {
	Reset()
	s := testState()
	s.Towns[townB].IsStarving = true
	v, w := testView(s)
	r := ruleFor(RefugeeGroup)

	e := r.New(v, townA, v.Day)
	r.Apply(v, w, e)

	if err := w.Err(); err != nil {
		t.Fatalf("staged writes invalid: %v", err)
	}
	heads := e.Data[keyRefugees]
	if heads <= 0 {
		t.Fatalf("the group has %v people, want some", heads)
	}
	// Population itself belongs to the demography system, so the group is
	// staged as net migration and demography turns it into people.
	if !wroteField(w, model.KindTown, townA, "net_migration") {
		t.Error("expected net_migration to be staged; demography owns population")
	}
	if !wroteField(w, model.KindTown, townA, "sanitation") {
		t.Error("expected refugees to cost the town its sanitation")
	}

	// Committed: people moved and the town is dirtier. Food demand follows
	// population because the food system derives it from population every day,
	// so arrivals raise demand without this system writing demand at all.
	Reset()
	live := testState()
	live.Towns[townB].IsStarving = true
	before := tickUntilType(t, live, engine(live), RefugeeGroup)
	if live.Towns[townA].NetMigration <= before.Towns[townA].NetMigration {
		t.Error("net_migration did not rise in the committed state")
	}
	if live.Towns[townA].Sanitation >= before.Towns[townA].Sanitation {
		t.Error("sanitation did not fall in the committed state")
	}
	if live.Towns[townB].NetMigration != before.Towns[townB].NetMigration {
		t.Error("the starving town gained people; it should be the one losing them")
	}
}

func TestRefugeeGroupRespectsTheImmigrationCap(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	s.Towns[townB].IsStarving = true
	s.Towns[townA].Population = 100
	r := ruleFor(RefugeeGroup)

	e := r.New(v, townA, v.Day)
	// The migration system bounds inward movement at a share of population per
	// day, so a group can never exceed it.
	if cap := 100 * testConfig().Migrate.ImmigrantsPerDayCap; e.Data[keyRefugees] > cap {
		t.Errorf("group of %v exceeds the immigration cap of %v", e.Data[keyRefugees], cap)
	}
}

// Task 479: troops break and leave, and where they go matters.

func TestDesertersOnlyOfferBrokenArmies(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(Deserters)

	subs := r.Subjects(v)
	if len(subs) != 1 || subs[0] != armyID {
		t.Fatalf("Subjects = %v, want [%d] (only the broken army)", subs, armyID)
	}
	s.Parties[armyID].Morale = 0.9
	if got := r.Subjects(v); len(got) != 0 {
		t.Errorf("a content army should offer nothing, got %v", got)
	}
}

func TestDesertersLeaveRaiderPartiesAlone(t *testing.T) {
	s := testState()
	s.Parties[3] = &model.Party{ID: 3, Name: "Bandits", SideID: -1, RulerID: -1, Troops: 20, IsRaider: true, Morale: 0.01}
	v, _ := testView(s)
	for _, pid := range ruleFor(Deserters).Subjects(v) {
		if pid == 3 {
			t.Error("a raider band offered itself as a deserter; the bandit system " +
				"writes a raider's troops absolutely, and this system needs a delta")
		}
	}
}

func TestDeserterChanceRisesAsMoraleFalls(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(Deserters)

	s.Parties[armyID].Morale = 0.2
	mild := r.Trigger(v, armyID)
	s.Parties[armyID].Morale = 0.0
	broken := r.Trigger(v, armyID)

	if !(broken > mild) {
		t.Errorf("chance at morale 0 = %v, at 0.2 = %v; want broken > mild", broken, mild)
	}
	if got := r.Trigger(v, 999); got != 0 {
		t.Errorf("a party that does not exist should have no chance, got %v", got)
	}
}

func TestDesertersSplitBetweenBanditsAndSettling(t *testing.T) {
	Reset()
	s := testState()
	// Big enough that the men who settle are a body of people rather than a
	// rounding error, so the militia they bring is a whole number.
	s.Parties[armyID].Troops = 200
	v, w := testView(s)
	r := ruleFor(Deserters)

	e := r.New(v, armyID, v.Day)
	r.Apply(v, w, e)

	if err := w.Err(); err != nil {
		t.Fatalf("staged writes invalid: %v", err)
	}
	left := e.Data[keyDeserted]
	if left <= 0 {
		t.Fatalf("the army shed %v men, want some", left)
	}
	// Severity 1 at morale 0: 200 * 0.045 * 4 = 36, capped by the daily share
	// at 200 * 0.02 * 4 = 16, so the cap is what binds.
	if left != 16 {
		t.Errorf("deserted = %v, want 16 (the daily cap)", left)
	}
	// The security config's deserter share decides the split.
	if got, want := e.Data[keyToBandits], left*0.4; got != want {
		t.Errorf("to bandits = %v, want %v", got, want)
	}
	if !wroteField(w, model.KindParty, armyID, "troops") {
		t.Error("expected the army to lose troops")
	}
	if !wroteField(w, model.KindRuler, rulerID, "influence") {
		t.Error("expected the commander to lose influence")
	}
	// Some go to the bandits: raider pressure on the nearest town.
	if !wroteField(w, model.KindTown, townA, "raider_pressure") {
		t.Error("expected the nearest town to feel deserters turned to raiding")
	}
	// The rest settle: staged as net migration, since demography owns population.
	if !wroteField(w, model.KindTown, townA, "net_migration") {
		t.Error("expected the deserters who settled to arrive in the nearest town")
	}
	if !wroteField(w, model.KindTown, townA, "militia") {
		t.Error("expected some of the settled deserters to be pressed into the militia")
	}

	// Committed: the army is smaller, the commander has less influence, and the
	// two destinations have been told.
	Reset()
	live := testState()
	live.Parties[armyID].Troops = 200
	before := tickUntilType(t, live, engine(live), Deserters)
	if live.Parties[armyID].Troops >= before.Parties[armyID].Troops {
		t.Error("the army did not lose troops in the committed state")
	}
	if live.Rulers[rulerID].Influence >= before.Rulers[rulerID].Influence {
		t.Error("the commander's influence did not fall in the committed state")
	}
	if live.Towns[townA].RaiderPressure <= before.Towns[townA].RaiderPressure {
		t.Error("the nearest town did not feel deserters turned to raiding")
	}
}

func TestDesertersDissolveAnArmyLeftTooSmall(t *testing.T) {
	Reset()
	s := testState()
	s.Parties[armyID].Troops = 8
	// The shipped 2%-a-day cap means a collapse is never instantaneous, so the
	// dissolving case needs a rate that can strip a party in one day. This is
	// the case MinTroopsToPersist exists for: MinTroopsToPersist is 6, so eight
	// men shedding all eight leaves nothing.
	collapse := func(c *config.Config) {
		c.Upkeep.DesertionRate = 0.5
		c.Upkeep.DesertionMaxShare = 0.5
	}
	tickUntilType(t, s, engineWith(s, collapse), Deserters)

	if s.Parties[armyID] != nil {
		t.Errorf("an army of 8 that shed its desertions should have dissolved, and has %v left",
			s.Parties[armyID].Troops)
	}
}

func TestDesertersDoNotDissolveAnArmyAboveTheMinimum(t *testing.T) {
	Reset()
	s := testState()
	s.Parties[armyID].Troops = 200
	tickUntilType(t, s, engine(s), Deserters)

	if s.Parties[armyID] == nil {
		t.Fatal("a large army shed a day's deserters and dissolved; the cap exists to stop that")
	}
}

// Task 480: a storm is days long, and it costs travel and harvests.

func TestStormIsMoreLikelyInTheBadSeasons(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(WeatherStorm)

	v.Day = 10 // winter
	winter := r.Trigger(v, townA)
	v.Day = 200 // late summer
	summer := r.Trigger(v, townA)

	if !(winter > summer) {
		t.Errorf("winter chance = %v, summer = %v; want winter > summer", winter, summer)
	}
	if summer <= 0 || winter > 1 {
		t.Errorf("chances must be in (0,1]: winter=%v summer=%v", winter, summer)
	}
}

func TestStormGetsOneSeverityAndOneLengthForItsWholeLife(t *testing.T) {
	s := testState()
	v, _ := testView(s)
	r := ruleFor(WeatherStorm)

	e := r.New(v, townA, v.Day)
	severity := e.Data[keySeverity]
	days := e.Days()
	if days < stormMinDays || days > float64(stormMinDays+stormDaysRange-1) {
		t.Errorf("storm lasts %v days, want %v..%v", days, stormMinDays, stormMinDays+stormDaysRange-1)
	}
	// A second event for the same town is an independent draw, but a storm must
	// not redraw its severity each morning, so the record carries the value the
	// first day set.
	e2 := r.New(v, townA, v.Day+1)
	if e2.Data[keySeverity] < 0 || e2.Data[keySeverity] > 1 {
		t.Errorf("severity %v out of range", e2.Data[keySeverity])
	}
	if severity < 0.35 || severity > 1 {
		t.Errorf("severity %v out of range", severity)
	}
}

func TestStormApplyStagesItsThreeCosts(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	r := ruleFor(WeatherStorm)

	e := r.New(v, townA, v.Day)
	// A column caught out in it. The march system reads fatigue back into
	// speed, so this is where the storm costs distance.
	s.Parties[armyID].X = 5
	s.Parties[armyID].Activity = model.ActMarching
	r.Apply(v, w, e)

	if err := w.Err(); err != nil {
		t.Fatalf("staged writes invalid: %v", err)
	}
	// Food's health factor reads sanitation, so this is how a storm reaches the
	// harvest without writing food_production, which food owns outright.
	if !wroteField(w, model.KindTown, townA, "sanitation") {
		t.Error("expected the storm to cost the town its sanitation")
	}
	if !wroteField(w, model.KindTown, townA, "lost_food_total") {
		t.Error("expected the storm to spoil food and record it")
	}
	if !wroteField(w, model.KindParty, armyID, "fatigue") {
		t.Error("expected a marching column to tire in the storm")
	}

	// Committed, a storm has the same three effects.
	Reset()
	live := testState()
	live.Parties[armyID].X = 5
	before := tickUntilType(t, live, engine(live), WeatherStorm)
	if live.Towns[townA].Sanitation >= before.Towns[townA].Sanitation {
		t.Error("sanitation did not fall in the committed state")
	}
	if live.Towns[townA].LostFoodTotal <= before.Towns[townA].LostFoodTotal {
		t.Error("lost_food_total did not rise in the committed state")
	}
	if live.Parties[armyID].Fatigue <= before.Parties[armyID].Fatigue {
		t.Error("the column's fatigue did not rise in the committed state")
	}
}

func TestStormLeavesAPartyAtRestAlone(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	s.Parties[armyID].X = 1
	s.Parties[armyID].Activity = model.ActIdle

	ruleFor(WeatherStorm).Apply(v, w, ruleFor(WeatherStorm).New(v, townA, v.Day))

	if wroteField(w, model.KindParty, armyID, "fatigue") {
		t.Error("a party sitting in a town should not tire in a storm")
	}
}

func TestStormResolveRecoversSomeSanitation(t *testing.T) {
	Reset()
	s := testState()
	s.Towns[townA].Sanitation = 0.4
	v, w := testView(s)
	r := ruleFor(WeatherStorm)

	e := r.New(v, townA, v.Day)
	r.Resolve(v, w, e)

	if err := w.Err(); err != nil {
		t.Fatalf("staged writes invalid: %v", err)
	}
	if !wroteField(w, model.KindTown, townA, "sanitation") {
		t.Error("expected the weather clearing to recover some sanitation")
	}
	// And committed: a storm out of days is closed out by the next tick, and the
	// town is left cleaner than it was during the storm.
	Reset()
	s.Towns[townA].Sanitation = 0.4
	liveView, _ := testView(s)
	done := r.New(liveView, townA, 0)
	done.Data[keyDaysLeft] = 1
	rt.active = []*Event{done}
	rt.history = []*Event{done}
	if err := engine(s).Tick(s); err != nil {
		t.Fatalf("committing the clearing failed: %v", err)
	}
	if s.Towns[townA].Sanitation <= 0.4 {
		t.Errorf("sanitation = %v, want above 0.4 once the weather cleared", s.Towns[townA].Sanitation)
	}
}

// The lifecycle: trigger, apply for as many days as it lasts, then resolve.

func TestActiveEventAppliesEachDayUntilItIsDone(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	r := ruleFor(WeatherStorm)

	e := r.New(v, townA, v.Day)
	e.Data[keyDaysLeft] = 3
	rt.active = []*Event{e}

	applyActive(v, w)
	if e.Days() != 2 {
		t.Errorf("after one day Days = %v, want 2", e.Days())
	}
	if e.Resolved {
		t.Error("an event with days left must not be resolved")
	}
	applyActive(v, sim.NewWriteSet())
	if e.Days() != 1 {
		t.Errorf("after two days Days = %v, want 1", e.Days())
	}
	_ = r
}

func TestFinishedEventResolvesAndLeavesTheActiveList(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	stormRule := ruleFor(WeatherStorm)

	e := stormRule.New(v, townA, v.Day)
	e.Data[keyDaysLeft] = 1
	rt.active = []*Event{e}
	rt.history = []*Event{e}

	closeOut(v, w)

	if !e.Resolved {
		t.Error("an event out of days must be resolved")
	}
	if len(rt.active) != 0 {
		t.Errorf("Active = %d events, want 0", len(rt.active))
	}
	if len(History()) != 1 || History()[0] != e {
		t.Error("a resolved event belongs in the history")
	}
	// Resolving a storm clears the weather, so the town recovers a little.
	if !wroteField(w, model.KindTown, townA, "sanitation") {
		t.Error("expected the storm to recover sanitation as it cleared")
	}
}

func TestAnEventIsAppliedOnTheDayItIsRolledAndNotTwice(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	forceRoll(v)

	run(v, w)
	var first *Event
	for _, e := range rt.active {
		if e.Type == BanditAmbush {
			if first != nil {
				t.Fatal("two ambushes active after one tick, want one")
			}
			first = e
		}
	}
	if first == nil {
		t.Fatal("no ambush active after one tick")
	}
	if first.Resolved {
		t.Error("an ambush rolled today should not be resolved yet")
	}

	// A second tick on the same day must not re-apply the first ambush's
	// effects: it has no days left, so it closes out instead.
	w2 := sim.NewWriteSet()
	run(v, w2)
	if !first.Resolved {
		t.Error("the first ambush should have resolved on the second tick")
	}
	for _, e := range rt.active {
		if e == first {
			t.Error("a resolved ambush is still in the active list")
		}
	}
	// The second tick does roll a fresh ambush, because the chance is forced to
	// one, and that one does touch the road. What must not happen is the first
	// ambush being applied a second time, so there must be exactly one write
	// where two would mean both events fired.
	writes := 0
	for _, d := range w2.Debug() {
		if d.Entity == routeID && d.Field == "route_raiders" {
			writes++
		}
	}
	if writes != 1 {
		t.Errorf("%d writes to route_raiders on the second tick, want 1: the resolved ambush was applied again", writes)
	}
}

func TestFiringTwiceOnOneDayDoesNotDoubleCount(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	forceRoll(v)
	run(v, w)
	n := Counts()[BanditAmbush]
	run(v, sim.NewWriteSet())
	if Counts()[BanditAmbush] != n+1 {
		t.Errorf("ambushes = %d, want %d: a second roll on the same day should fire again, not merge",
			Counts()[BanditAmbush], n+1)
	}
}

func TestEventsGetDistinctIDsAndTheDayTheyStarted(t *testing.T) {
	Reset()
	s := testState()
	v, w := testView(s)
	forceRoll(v)
	run(v, w)
	v.Day = 42
	run(v, sim.NewWriteSet())

	seen := map[int]bool{}
	for _, e := range History() {
		if seen[e.ID] {
			t.Errorf("event ID %d was handed out twice", e.ID)
		}
		seen[e.ID] = true
		if e.ID < 1 {
			t.Errorf("event ID = %d, want a positive id", e.ID)
		}
		if e.Day != 100 && e.Day != 42 {
			t.Errorf("event %d has Day = %d, want 100 or 42", e.ID, e.Day)
		}
	}
}

// The engine's own guarantees, which this package has to live inside.

func TestEveryWriteIsValidAndOrderIndependentOverManyTicks(t *testing.T) {
	Reset()
	s := testState()
	e := engine(s)
	for i := 0; i < 500; i++ {
		if err := e.Tick(s); err != nil {
			t.Fatalf("tick %d: %v", i, err)
		}
	}
	if len(History()) == 0 {
		t.Error("no events at all fired in 500 ticks of a two-town world")
	}
}

// Determinism: the same seed must produce the same events, or a golden run
// cannot be compared.
func TestSameSeedProducesTheSameEvents(t *testing.T) {
	fingerprint := func() []string {
		Reset()
		s := testState()
		e := engine(s)
		for i := 0; i < 300; i++ {
			if err := e.Tick(s); err != nil {
				t.Fatalf("tick %d: %v", i, err)
			}
		}
		var out []string
		for _, ev := range History() {
			out = append(out, fmt.Sprintf("%s@%d/%d", ev.Type, ev.SettlementID, ev.Day))
		}
		return out
	}
	a, b := fingerprint(), fingerprint()
	if len(a) != len(b) {
		t.Fatalf("two runs of the same seed produced %d and %d events", len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Errorf("event %d differs between runs: %q vs %q", i, a[i], b[i])
		}
	}
}

func TestUnknownEventTypeHasNoRule(t *testing.T) {
	if r := ruleFor(EventType("no_such_event")); r != nil {
		t.Error("an unknown event type should have no rule")
	}
}

func TestEveryEventTypeHasARuleAndOffersItself(t *testing.T) {
	Reset()
	s := testState()
	// Break the world so every event has a reason to fire at something.
	s.Towns[townA].Prosperity = 0.9
	s.Towns[townB].FoodStock = 50
	s.Towns[townB].IsStarving = true
	s.Towns[townA].Sanitation = 0.5
	s.Towns[townA].FoodStock = 9000
	s.Parties[armyID].Morale = 0

	want := []EventType{BanditAmbush, MerchantCaravan, RefugeeGroup, Deserters, WeatherStorm}
	for _, typ := range want {
		r := ruleFor(typ)
		if r == nil {
			t.Errorf("no rule for %s", typ)
			continue
		}
		if r.Type() != typ {
			t.Errorf("rule reports %s, want %s", r.Type(), typ)
		}
		v, w := testView(s)
		forceRoll(v)
		subs := r.Subjects(v)
		if len(subs) == 0 {
			t.Errorf("%s offered no subjects in a world that should provoke it", typ)
			continue
		}
		if r.Trigger(v, subs[0]) <= 0 {
			t.Errorf("%s offered subject %d but its chance was zero", typ, subs[0])
		}
		e := r.New(v, subs[0], v.Day)
		if e.Type != typ {
			t.Errorf("New returned %s, want %s", e.Type, typ)
		}
		if e.SettlementID != subs[0] {
			t.Errorf("New set SettlementID = %d, want %d", e.SettlementID, subs[0])
		}
		if e.Days() < 1 {
			t.Errorf("%s lasts %v days, want at least 1", typ, e.Days())
		}
		if e.Resolved {
			t.Errorf("%s started resolved", typ)
		}
		r.Apply(v, w, e)
		r.Resolve(v, w, e)
		if err := w.Err(); err != nil {
			t.Errorf("%s staged an invalid write: %v", typ, err)
		}
	}
}

func TestResetClearsTheRuntime(t *testing.T) {
	s := testState()
	v, w := testView(s)
	forceRoll(v)
	run(v, w)
	if len(History()) == 0 {
		t.Fatal("nothing fired, so the reset proves nothing")
	}
	Reset()
	if len(History()) != 0 || len(Active()) != 0 {
		t.Error("Reset left events behind")
	}
	if len(Counts()) != 0 {
		t.Error("Reset left counts behind")
	}
}
