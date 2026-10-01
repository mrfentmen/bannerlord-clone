package issue

import (
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/food"
)

// These tests assert on the state a tick commits rather than on the writes the
// system stages. sim.WriteSet.Debug reports field names but not values, and
// reports nothing at all for relation writes, so the only way to check that an
// issue actually moved a number is to let the engine apply it.

// testCfg loads the shipped balance file so an assertion about a configurable
// constant checks the wiring rather than a copy of the number in this file.
// config.LoadDefault cannot be used because it resolves config/balance.toml
// against the working directory, and a test runs in its own package directory.
func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	// services/simulation/internal/systems/issue -> services/simulation/config.
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// tick runs the issue system alone for one day with the given orders, on the
// shipped balance file, so a number in the result can only have come from the
// issue system or the orders.
func tick(t *testing.T, s *model.State, orders ...sim.Order) {
	t.Helper()
	tickWith(t, testCfg(t), s, orders...)
}

// tickWith is tick on a config the caller has adjusted.
//
// It exists because the shipped offer rate is one in a hundred a day, which is
// right for a campaign and useless for a test: a test that wants a request to
// appear has to set the rate to one, and going through testCfg again inside tick
// would quietly undo the setting and leave the test asserting on a slow day. The
// seed is fixed so a run is reproducible.
func tickWith(t *testing.T, cfg *config.Config, s *model.State, orders ...sim.Order) {
	t.Helper()
	e := sim.NewEngine(cfg, cause.NewLog(2000), 42, []sim.System{System()})
	e.SetOrders(orders)
	if err := e.Tick(s); err != nil {
		// A write to a field the model cannot read or write is a programming
		// error and aborts the tick before anything commits, so there is no
		// state left to assert on.
		t.Fatalf("tick: %v", err)
	}
}

// tickN runs the issue system for n days with no orders on the shipped balance
// file, which is how a request is given the chance to be generated and then age
// out on its own.
func tickN(t *testing.T, s *model.State, n int) {
	t.Helper()
	tickNWith(t, testCfg(t), s, n)
}

// tickNWith is tickN on an adjusted config, for the same reason tickWith exists.
func tickNWith(t *testing.T, cfg *config.Config, s *model.State, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		tickWith(t, cfg, s)
	}
}

// world is a small two-town world with a road, a ruler, and a party, which is
// the smallest thing all three issue kinds can be exercised against.
type world struct {
	state   *model.State
	town    int
	other   int
	route   int
	ruler   int
	party   int
	notable int
}

func newWorld(t *testing.T) *world {
	t.Helper()
	s := model.NewState()
	s.Towns[1] = &model.Town{
		ID: 1, Name: "Millbrook", X: 0, Y: 0,
		Population: 2000, FoodStock: 200, FoodDays: 5,
		Prosperity: 0.5, Loyalty: 0.5, Unrest: 0.2, Money: 10000, Gold: 500,
	}
	s.Towns[2] = &model.Town{
		ID: 2, Name: "Ashford", X: 10, Y: 0,
		Population: 1500, FoodStock: 3000, FoodDays: 60,
		Prosperity: 0.5, Loyalty: 0.5, Unrest: 0.2, Money: 10000, Gold: 500,
	}
	s.Routes[1] = &model.Route{ID: 1, TownA: 1, TownB: 2, Length: 10, Safety: 0.9, Traffic: 5}
	s.Leaders[1] = &model.Leader{ID: 1, Name: "Aldric", SideID: 1, PartyID: 1, IsAlive: true, Gold: 100, Renown: 0}
	s.Parties[1] = &model.Party{ID: 1, SideID: 1, LeaderID: 1, X: 0, Y: 0, Troops: 100, Food: 2000}
	return &world{state: s, town: 1, other: 2, route: 1, ruler: 1, party: 1}
}

// seedNotable adds a notable of the given role to a settlement, and returns its
// id. Seeding directly rather than waiting for the roster to fill the seat keeps
// a test about a request's mechanics independent of how many seats a town has
// and how fast they fill.
//
// The identifier counter is advanced to match, because the roster allocates ids
// at commit time from that counter. Without this, the first person the roster
// seats on the next tick is handed the same id as the seeded one and silently
// replaces them, and a test about a headman's request ends up measuring
// whatever job the replacement was given.
func (w *world) seedNotable(id int, role model.NotableRole, townID int) *model.Notable {
	if id >= w.state.IDValue(model.IDNotable) {
		w.state.SetIDCounter(model.IDNotable, id)
	}
	n := &model.Notable{
		ID: id, Name: "Test Notable", Role: role,
		TownID: townID, VillageID: -1,
		Power: 0.5, Relation: 0, IsActive: true, BornTick: 0, LastOfferTick: -1,
	}
	w.state.Notables[id] = n
	return n
}

// seedIssue puts a request into state directly and advances the issue
// identifier counter past it.
//
// The counter matters for the same reason it does in seedNotable: the generator
// allocates ids at commit time, and a request created on the next tick would
// otherwise be handed the seeded one's id and silently replace it. A test that
// seeded a request and then measured it would end up measuring whichever
// request the generator happened to make.
func (w *world) seedIssue(id int, kind model.IssueKind, notableID, townID int, amount, baseline, deadlineDays float64) *model.Issue {
	if id >= w.state.IDValue(model.IDIssue) {
		w.state.SetIDCounter(model.IDIssue, id)
	}
	i := &model.Issue{
		ID: id, Kind: kind, NotableID: notableID,
		TownID: townID, VillageID: -1, TargetID: -1, RouteID: -1,
		State: model.IssueOffered, AcceptorID: -1, StartedTick: -1,
		DeadlineTick: -1, Amount: amount, Baseline: baseline, DeadlineDays: deadlineDays,
	}
	w.state.Issues[id] = i
	return i
}

// theIssue returns the single live issue, failing if there is not exactly one.
// Almost every assertion here is about one request, and returning it rather than
// indexing into the map keeps the tests reading as prose.
func theIssue(t *testing.T, s *model.State) *model.Issue {
	t.Helper()
	live := s.LiveIssues()
	if len(live) != 1 {
		t.Fatalf("want exactly 1 live issue, got %d", len(live))
	}
	return live[0]
}

func TestSystemName(t *testing.T) {
	if System().Name != "issue" {
		t.Errorf("expected issue, got %s", System().Name)
	}
}

// A notable is seated from the settlement's own condition rather than at
// random: a town whose workshops are full gets a foreman, because that is the
// person a factory town has. The test is on the pairing, not on any one town, so
// it asserts the rule holds for the condition it sets up.
func TestRosterFillsSeatsFromSettlementCondition(t *testing.T) {
	w := newWorld(t)
	// Two workshops and a port: the seat should go to a foreman or a merchant,
	// never to a gang boss in a town with no crime problem.
	w.state.Workshops[1] = &model.Workshop{ID: 1, TownID: 1, Type: model.WorkshopBakery, Level: 1}
	w.state.Towns[1].IsPort = true

	tickN(t, w.state, 3)

	if len(w.state.Notables) == 0 {
		t.Fatal("no notable was seated in a town with three seats")
	}
	for _, n := range w.state.Notables {
		if n.Role == model.RoleGangBoss {
			t.Errorf("a town with no crime problem seated a gang boss: %+v", n)
		}
	}
	// A town's seats are not filled with the same job twice, or one settlement
	// would file several requests a day from one larder.
	seen := map[model.NotableRole]bool{}
	for _, n := range w.state.Notables {
		if n.TownID != 1 {
			continue
		}
		if seen[n.Role] {
			t.Errorf("town 1 seated two %ss", model.NotableRoleNames[n.Role])
		}
		seen[n.Role] = true
	}
}

// The core claim of the framework: a request exists because a reading is true,
// and it stops existing when the reading is not. A well-stocked town with a
// merchant and a full offer rate must still produce nothing, which is the
// property that separates this from a scripted quest board.
func TestNoRequestWithoutATrigger(t *testing.T) {
	w := newWorld(t)
	w.seedNotable(1, model.RoleMerchant, 1)
	// Millbrook has five days of food, so nothing is short and the road is
	// safe. A merchant here has nothing true to ask about.
	cfg := testCfg(t)
	w.state.Towns[1].FoodDays = 90
	w.state.Towns[1].FoodStock = 40000
	w.state.Routes[1].Safety = 0.95
	w.state.Towns[1].Crime = 0.0

	// The offer rate is forced to one so the test is about the trigger and not
	// about the dice: with a probability in the way, a false negative would be
	// indistinguishable from a slow day.
	cfg.Issue.OfferChancePerDay = 1.0
	for i := 0; i < 5; i++ {
		tickWith(t, cfg, w.state)
	}
	if live := w.state.LiveIssues(); len(live) != 0 {
		t.Errorf("a town with food, a safe road, and no crime raised %d request(s)", len(live))
	}
}

// A starving town with a headman must produce exactly one request for food, and
// the request must carry the reading that produced it. This is the chain from a
// food shortage to somebody asking for help, which is the whole first rule of
// the design.
func TestStarvingTownProducesADeliveryRequest(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleHeadman, 1)
	// Five days of food against a trigger of twelve.
	w.state.Towns[1].FoodDays = 5
	w.state.Towns[1].FoodStock = 200

	tickWith(t, cfg, w.state)

	i := theIssue(t, w.state)
	if i.Kind != model.IssueDeliverGoods {
		t.Errorf("kind = %v, want deliver goods", model.IssueKindNames[i.Kind])
	}
	if i.State != model.IssueOffered {
		t.Errorf("state = %v, want offered", model.IssueStateNames[i.State])
	}
	if i.NotableID != 1 {
		t.Errorf("notable = %d, want 1", i.NotableID)
	}
	if i.Amount <= 0 {
		t.Errorf("amount = %v, want a positive quantity of food", i.Amount)
	}
	// The request is for more food than is there, and for at least the nominal
	// load, so a player is never handed a fraction of a wagon to fetch.
	if i.Amount <= w.state.Towns[1].FoodStock {
		t.Errorf("amount %v does not exceed the larder %v, so nothing was asked for",
			i.Amount, w.state.Towns[1].FoodStock)
	}
	if i.RewardMoney <= 0 {
		t.Errorf("reward money = %v, want a payment, since the settlement has 10000", i.RewardMoney)
	}
	// The offer is logged, so a reader can see the request appearing rather than
	// only finding it in a list.
	if len(i.Steps) == 0 {
		t.Error("the request carries no step log, so its own history is empty")
	}
	if i.DeadlineTick <= 0 {
		t.Errorf("deadline tick = %d, want a positive tick, since an untaken offer has to expire", i.DeadlineTick)
	}
}

// Accepting is an order, and it is a real change: the request becomes the
// taker's responsibility, the baseline is captured from the world as it stands,
// the party is sent and loaded, and the notice starts running.
func TestOrderAcceptIssueBindsTheTakerAndLoadsTheParty(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Towns[1].FoodStock = 200

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)
	asked := i.Amount

	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: i.ID})

	got := w.state.Issues[i.ID]
	if got.State != model.IssueAccepted {
		t.Fatalf("state = %v, want accepted", model.IssueStateNames[got.State])
	}
	if got.AcceptorID != w.ruler {
		t.Errorf("acceptor = %d, want %d", got.AcceptorID, w.ruler)
	}
	if got.Baseline != w.state.Towns[1].FoodStock {
		t.Errorf("baseline = %v, want the larder as it stood (%v)", got.Baseline, w.state.Towns[1].FoodStock)
	}
	// The notice runs from acceptance, not from the offer, so a request that sat
	// on the board for a month does not arrive already overdue.
	if got.DeadlineTick <= w.state.Tick {
		t.Errorf("deadline %d is not after the current tick %d", got.DeadlineTick, w.state.Tick)
	}
	if got.Progress != 0 {
		t.Errorf("progress = %v, want 0 on the day it is accepted", got.Progress)
	}
	// The goods come out of the taker's own larder, which is what makes taking a
	// delivery a cost rather than a favour. This party's larder is smaller than
	// the request, so it loads what it has and no more: staging a load that is
	// not aboard would make the request completable on paper.
	p := w.state.Parties[w.party]
	load := asked
	if load > 2000 {
		load = 2000
	}
	if asked <= 2000 {
		t.Errorf("the request (%v) is smaller than the larder, so this test is not testing the shortfall", asked)
	}
	if p.CargoFood != load {
		t.Errorf("cargo = %v, want the %v the party could actually carry", p.CargoFood, load)
	}
	if p.Food != 2000-load {
		t.Errorf("party food = %v, want %v after loading", p.Food, 2000-load)
	}
	if p.Activity != model.ActMarching {
		t.Errorf("activity = %v, want marching", p.Activity)
	}
	if p.DestTown != w.town {
		t.Errorf("destination = %d, want the asking town %d", p.DestTown, w.town)
	}
}

// A party cannot take a request it has no troops to carry out. Without this a
// ruler with no army would become answerable for jobs and start paying the
// penalty for them, which is a failure invented rather than one committed.
func TestOrderAcceptIssueNeedsAPartyWithTroops(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)

	w.state.Parties[w.party].Troops = 0
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: i.ID})

	if got := w.state.Issues[i.ID]; got.State != model.IssueOffered {
		t.Errorf("state = %v, want the request to stay on offer", model.IssueStateNames[got.State])
	}
}

// Two rulers cannot both become answerable for one delivery. The second order is
// refused because the request is no longer on offer, which is what keeps a
// single load of grain from being promised to two ledgers.
func TestOrderAcceptIssueIsRefusedOnceTaken(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Leaders[2] = &model.Leader{ID: 2, SideID: 1, PartyID: 2, IsAlive: true}
	w.state.Parties[2] = &model.Party{ID: 2, SideID: 1, LeaderID: 2, X: 0, Y: 0, Troops: 50, Food: 500}

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)

	tickWith(t, cfg, w.state,
		sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: 1, Target: i.ID},
		sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: 2, Target: i.ID},
	)

	if got := w.state.Issues[i.ID]; got.AcceptorID != 1 {
		t.Errorf("acceptor = %d, want 1: the first taker in the queue keeps it", got.AcceptorID)
	}
}

// The heart of the third rule: a claim is a question, not a command. Reporting a
// delivery done without the larder being fuller pays nothing and costs the
// notable's opinion, because the world is asked and the world says no.
func TestOrderCompleteIssueRefusesAnUnmetObjective(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Towns[1].FoodStock = 200

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: i.ID})

	// The larder has not moved. Claim anyway.
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: w.ruler, Target: i.ID})

	got := w.state.Issues[i.ID]
	if got.State != model.IssueFailed {
		t.Fatalf("state = %v, want failed: the goods never arrived", model.IssueStateNames[got.State])
	}
	if w.state.Parties[w.party].Money != 0 {
		t.Errorf("party money = %v, want no payment for work not done", w.state.Parties[w.party].Money)
	}
	if w.state.Leaders[w.ruler].Gold != 100 {
		t.Errorf("ruler gold = %v, want unchanged", w.state.Leaders[w.ruler].Gold)
	}
	if n := w.state.Notables[1]; n.Relation >= 0 {
		t.Errorf("notable relation = %v, want it to have fallen", n.Relation)
	}
}

// The same order, with the world actually changed, pays. This is the pair that
// makes the claim meaningful: identical inputs except the larder, opposite
// outcomes, so the reward is downstream of the delivery and not of the click.
func TestOrderCompleteIssuePaysWhenTheGoodsArrive(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Towns[1].FoodStock = 200

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: i.ID})

	// The party walks into the town. The next tick the load comes off the cart
	// and is staged into the arriving field, which the food system turns into
	// stock on the tick after.
	w.state.Parties[w.party].X = w.state.Towns[1].X
	w.state.Parties[w.party].Y = w.state.Towns[1].Y
	carried := w.state.Parties[w.party].CargoFood
	if carried <= 0 {
		t.Fatal("the party set out with no load, so there is nothing to deliver")
	}
	tickWith(t, cfg, w.state)

	if w.state.Towns[1].ArrivingFood != carried {
		t.Errorf("arriving food = %v, want the load %v that landed at the asking town",
			w.state.Towns[1].ArrivingFood, carried)
	}
	if w.state.Parties[w.party].CargoFood != 0 {
		t.Errorf("cargo = %v, want the load off the cart", w.state.Parties[w.party].CargoFood)
	}

	// The food system converts the arrival into stock, which is the seam the
	// issue system deliberately did not write past. The larder is then filled to
	// the point the request actually asked for, because a partial load is a
	// partial job and the request has a tolerance rather than a yes or no.
	w.state.Towns[1].FoodStock += w.state.Towns[1].ArrivingFood
	w.state.Towns[1].ArrivingFood = 0
	w.state.Towns[1].FoodStock = i.Baseline + i.Amount*cfg.Issue.DeliverTolerance

	tickWith(t, cfg, w.state)
	if got := w.state.Issues[i.ID].Progress; got < 1 {
		t.Fatalf("progress = %v, want 1 once the larder reached the requested level", got)
	}

	moneyBefore := w.state.Parties[w.party].Money
	renownBefore := w.state.Leaders[w.ruler].Renown
	relationBefore := w.state.Notables[1].Relation
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: w.ruler, Target: i.ID})

	got2 := w.state.Issues[i.ID]
	if got2.State != model.IssueSucceeded {
		t.Fatalf("state = %v, want succeeded", model.IssueStateNames[got2.State])
	}
	if w.state.Parties[w.party].Money <= moneyBefore {
		t.Errorf("party money = %v, want more than %v", w.state.Parties[w.party].Money, moneyBefore)
	}
	if w.state.Leaders[w.ruler].Renown <= renownBefore {
		t.Errorf("renown = %v, want more than %v", w.state.Leaders[w.ruler].Renown, renownBefore)
	}
	if w.state.Notables[1].Relation <= relationBefore {
		t.Errorf("notable relation = %v, want more than %v", w.state.Notables[1].Relation, relationBefore)
	}
	// The money came out of the settlement that promised it, so a served request
	// moves the payer's books as well as the taker's.
	if w.state.Towns[1].Money >= 10000 {
		t.Errorf("town money = %v, want less than 10000: the request was paid for", w.state.Towns[1].Money)
	}
	// The load went through the arriving field rather than straight into stock,
	// which is what keeps a delivery from arriving on the tick it was loaded: the
	// larder only moved because the food system consumed the arrival.
	if w.state.Towns[1].FoodStock <= 200 {
		t.Errorf("town food = %v, want more than the 200 it started with", w.state.Towns[1].FoodStock)
	}
}

// A hideout request reads the same crime field the hideout system reads, so the
// offer and the hideout cannot disagree about whether there is one. A gang boss
// in a criminal town produces one; the same boss in a quiet town produces none.
func TestClearHideoutRequestFollowsTownCrime(t *testing.T) {
	cfg := testCfg(t)

	quiet := newWorld(t)
	cfg.Issue.OfferChancePerDay = 1.0
	quiet.seedNotable(1, model.RoleGangBoss, 1)
	quiet.state.Towns[1].Crime = 0.1
	tickWith(t, cfg, quiet.state)
	if live := quiet.state.LiveIssues(); len(live) != 0 {
		t.Errorf("a quiet town raised %d request(s) from a gang boss", len(live))
	}

	busy := newWorld(t)
	cfg2 := testCfg(t)
	cfg2.Issue.OfferChancePerDay = 1.0
	busy.seedNotable(1, model.RoleGangBoss, 1)
	busy.state.Towns[1].Crime = 0.8
	tickWith(t, cfg2, busy.state)
	i := theIssue(t, busy.state)
	if i.Kind != model.IssueClearHideout {
		t.Errorf("kind = %v, want clear hideout", model.IssueKindNames[i.Kind])
	}
	if i.TownID != 1 {
		t.Errorf("town = %d, want the criminal town 1", i.TownID)
	}

	// Serve it: the crime comes down to the target and the taker claims it.
	busy.state.Towns[1].Crime = 0.05
	tickWith(t, cfg2, busy.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: busy.ruler, Target: i.ID})
	tickWith(t, cfg2, busy.state, sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: busy.ruler, Target: i.ID})
	if got := busy.state.Issues[i.ID].State; got != model.IssueSucceeded {
		t.Errorf("state = %v, want succeeded once the crime was cleared", model.IssueStateNames[got])
	}
}

// A criminal town that merely put troops in the field has not had its hideout
// broken, so the claim is refused. The completion test is on the crime level
// rather than on the taker having tried, which is what keeps the request about
// the town and not about the player's effort.
func TestClearHideoutIsNotPaidForMerelyShowingUp(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleGangBoss, 1)
	w.state.Towns[1].Crime = 0.8

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: i.ID})
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: w.ruler, Target: i.ID})

	if got := w.state.Issues[i.ID].State; got != model.IssueFailed {
		t.Errorf("state = %v, want failed: the crime is untouched", model.IssueStateNames[got])
	}
}

// An escort needs two things: a safer road and fewer men on it. The safety
// target alone is not enough, which is the rule that protecting a road means
// attacking the bandits rather than walking about on it.
func TestEscortNeedsTheRoadSaferAndTheRaidersBroken(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleMerchant, 1)
	// Well fed, so a delivery request is not also on the table: this test is
	// about the road, and the kind is chosen at random among the ones that hold.
	w.state.Towns[1].FoodDays = 90
	w.state.Towns[1].FoodStock = 40000
	w.state.Routes[1].Safety = 0.3
	w.state.Routes[1].Raiders = 60

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)
	if i.Kind != model.IssueEscort {
		t.Fatalf("kind = %v, want escort", model.IssueKindNames[i.Kind])
	}
	if i.RouteID != w.route {
		t.Errorf("route = %d, want the unsafe road %d", i.RouteID, w.route)
	}
	if i.TargetID != w.other {
		t.Errorf("target = %d, want the far end of the road %d", i.TargetID, w.other)
	}
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: i.ID})

	// Safe enough, but the bandits are still on it.
	w.state.Routes[1].Safety = 0.95
	w.state.Routes[1].Raiders = 60
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: w.ruler, Target: i.ID})
	if got := w.state.Issues[i.ID].State; got != model.IssueFailed {
		t.Errorf("state = %v, want failed: the raiders were not broken up", model.IssueStateNames[got])
	}
}

// A role will only put their name to the kinds of request its job covers. A gang
// boss is not asked to fetch grain, which is what makes a request carry
// information about who made it.
func TestRolesOnlyOfferTheirOwnKinds(t *testing.T) {
	if canOffer(model.RoleGangBoss, model.IssueDeliverGoods) {
		t.Error("a gang boss would offer to deliver goods")
	}
	if canOffer(model.RoleHeadman, model.IssueClearHideout) {
		t.Error("a headman would offer to clear a hideout")
	}
	if canOffer(model.RoleMilitiaCaptain, model.IssueEscort) {
		t.Error("a militia captain would offer to escort a caravan")
	}
	if !canOffer(model.RoleMerchant, model.IssueEscort) {
		t.Error("a merchant would not offer to escort a caravan, which is the one thing they do")
	}
	if !canOffer(model.RoleMayor, model.IssueClearHideout) {
		t.Error("a mayor would not offer to clear a hideout")
	}
	// A role outside the enum offers nothing rather than indexing past a table.
	if canOffer(model.NotableRole(99), model.IssueDeliverGoods) {
		t.Error("a role outside the enum offered something")
	}
}

// Ignoring has to cost something, or a player can decline every request in the
// world for free. An offer nobody took ages out, and the asker is aggrieved and
// the settlement is a little less loyal, without anybody being paid.
func TestIgnoredOfferAgesOutAndCostsTheAsker(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	// Produce the offer by hand so the test is about the ageing, not the dice.
	i := w.seedIssue(1, model.IssueDeliverGoods, 1, 1, 500, 200, 0)
	// The offer is aged out by the stale-offer window, not by a notice, because
	// nobody was ever given a notice: an untaken offer runs from the day it was
	// made.
	i.DeadlineTick = 3
	loyalty := w.state.Towns[1].Loyalty

	tickNWith(t, cfg, w.state, 6)

	got := w.state.Issues[1]
	if got.State != model.IssueFailed {
		t.Fatalf("state = %v, want an untaken offer to lapse", model.IssueStateNames[got.State])
	}
	if n := w.state.Notables[1]; n.Grievance <= 0 {
		t.Errorf("grievance = %v, want the asker aggrieved that nobody came", n.Grievance)
	}
	// An offer nobody took is nobody's betrayal, so it costs patience and not
	// opinion: charging an absent player for declining would invent an
	// obligation that was never accepted, and a world with no player would end up
	// punishing its own quiet.
	if n := w.state.Notables[1]; n.Relation != 0 {
		t.Errorf("notable relation = %v, want 0: declining a job is not a betrayal", n.Relation)
	}
	// Nor is it the town's disloyalty. The town is short of food either way, and
	// the food system is what decides what that costs; an answer nobody gave is
	// not a second, separate injury to add on top.
	if w.state.Towns[1].Loyalty != loyalty {
		t.Errorf("town loyalty = %v, want it unchanged at %v: no request was ever accepted", w.state.Towns[1].Loyalty, loyalty)
	}
}

// The notice runs. A taker who does nothing is charged, and a taker who finishes
// after the notice has run out is also charged: the settlement is helped, but
// the request is not paid for, because paying for lateness would make the
// deadline a suggestion.
func TestDeadlineEndsAnUnfinishedRequest(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.seedIssue(1, model.IssueDeliverGoods, 1, 1, 500, 200, 6)
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: 1})

	// Run well past the notice, doing nothing.
	for i := 0; i < 60; i++ {
		tickWith(t, cfg, w.state)
		if w.state.Issues[1].State != model.IssueAccepted {
			break
		}
	}
	got := w.state.Issues[1]
	if got.State != model.IssueFailed {
		t.Fatalf("state = %v, want the notice to have run out", model.IssueStateNames[got.State])
	}
	if w.state.Parties[w.party].Money != 0 {
		t.Errorf("party money = %v, want no payment", w.state.Parties[w.party].Money)
	}
	if n := w.state.Notables[1]; n.Relation >= 0 {
		t.Errorf("notable relation = %v, want it to have fallen", n.Relation)
	}
}

// A taker who dies is not a failure. The request lapses without the asker being
// charged, because a dead ruler's failure is not something anybody chose and the
// simulation inventing that betrayal would be worse than losing the job.
func TestTakerDeathIsNotChargedToTheAsker(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.seedIssue(1, model.IssueDeliverGoods, 1, 1, 500, 200, 30)
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: 1})

	w.state.Leaders[w.ruler].IsAlive = false
	tickWith(t, cfg, w.state)

	if got := w.state.Issues[1].State; got == model.IssueAccepted {
		t.Error("a request stayed accepted with a dead taker")
	}
	if n := w.state.Notables[1]; n.Relation != 0 {
		t.Errorf("notable relation = %v, want 0: a dead taker did not fail the job", n.Relation)
	}
}

// A request must be answerable by the person who took it and by nobody else,
// or a scripted profile driving one court would settle the affairs of every
// court on the map.
func TestOrderCompleteIssueIsRefusedFromAnotherRuler(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Leaders[2] = &model.Leader{ID: 2, SideID: 1, PartyID: 2, IsAlive: true}
	w.state.Parties[2] = &model.Party{ID: 2, SideID: 1, LeaderID: 2, X: 0, Y: 0, Troops: 50, Food: 500}
	w.seedIssue(1, model.IssueDeliverGoods, 1, 1, 500, 200, 30)
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: 1})

	// Fill the larder so the objective really is met, then have the wrong ruler
	// claim it.
	w.state.Towns[1].FoodStock = 200 + 500
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: 2, Target: 1})

	if got := w.state.Issues[1].State; got == model.IssueSucceeded {
		t.Error("a request was settled by a ruler who had not taken it")
	}
}

// A promise is a promise up to what the payer has. A settlement that was rich
// when it offered and poor by the time the job is done pays what is left rather
// than creating money, and the taker is not made whole out of thin air.
func TestPaymentIsCappedByWhatThePayerStillHas(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Towns[1].FoodStock = 200

	tickWith(t, cfg, w.state)
	i := theIssue(t, w.state)
	promised := i.RewardMoney
	if promised <= 0 {
		t.Fatalf("reward = %v, want a positive promise from a town with 10000", promised)
	}
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: i.ID})

	// The town is ruined between the offer and the settlement.
	w.state.Towns[1].Money = 100
	w.state.Towns[1].FoodStock = 200 + i.Amount
	tickWith(t, cfg, w.state)
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: w.ruler, Target: i.ID})

	if got := w.state.Issues[i.ID].State; got != model.IssueSucceeded {
		t.Fatalf("state = %v, want succeeded: the goods were delivered", model.IssueStateNames[got])
	}
	if paid := w.state.Parties[w.party].Money; paid > 100 {
		t.Errorf("paid %v from a payer holding 100: the reward created money", paid)
	}
	if w.state.Towns[1].Money < 0 {
		t.Errorf("town money = %v, want not negative", w.state.Towns[1].Money)
	}
	if paid := w.state.Parties[w.party].Money; paid == promised {
		t.Errorf("paid the full promised %v from a payer holding 100", paid)
	}
}

// A town that cannot afford the request promises less rather than a figure it
// cannot honour, so the reward scales the right way round: the poorer the asker,
// the smaller the promise, not the larger.
func TestPoorSettlementPromisesLess(t *testing.T) {
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 1.0
	rich := newWorld(t)
	poor := newWorld(t)
	rich.state.Towns[1].Money = 100000
	poor.state.Towns[1].Money = 500
	for _, w := range []*world{rich, poor} {
		w.seedNotable(1, model.RoleHeadman, 1)
		w.state.Towns[1].FoodDays = 5
	}
	tickWith(t, cfg, rich.state)
	tickWith(t, cfg, poor.state)

	richLive := rich.state.LiveIssues()
	poorLive := poor.state.LiveIssues()
	if len(richLive) != 1 || len(poorLive) != 1 {
		t.Fatalf("want one request each, got %d and %d", len(richLive), len(poorLive))
	}
	richReward := richLive[0].RewardMoney
	poorReward := poorLive[0].RewardMoney
	if poorReward >= richReward {
		t.Errorf("a town holding 500 promised %v against a town holding 100000's %v",
			poorReward, richReward)
	}
}

// The issue is a first-class entity in the committed state, which is what lets a
// request outlive the tick that made it. A request survives days nobody touched
// it, and the identifiers the engine hands out do not collide with each other.
func TestRequestsOutliveTheTickThatMadeThem(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 0.05
	w.seedNotable(1, model.RoleHeadman, 1)
	w.seedNotable(2, model.RoleMilitiaCaptain, 1)
	w.seedNotable(3, model.RoleShopkeeper, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Towns[1].Crime = 0.8
	w.state.Routes[1].Safety = 0.2

	tickNWith(t, cfg, w.state, 40)

	if len(w.state.Issues) == 0 {
		t.Skip("no request was generated in 40 days at this rate; nothing to assert")
	}
	// Every request must be a real, readable entity: the cause log refers to a
	// change by kind and id, so an issue that cannot be named cannot be traced.
	for _, iid := range w.state.IssueIDs() {
		i := w.state.Issues[iid]
		if i.ID != iid {
			t.Errorf("issue stored under %d has id %d", iid, i.ID)
		}
		if name := w.state.Name(model.KindIssue, iid); name == "" {
			t.Errorf("issue %d has no name", iid)
		}
		if n := w.state.NotableOf(i); n == nil {
			t.Errorf("issue %d names notable %d, who is not in the roster", iid, i.NotableID)
		}
		if i.Kind < 0 || int(i.Kind) >= len(model.IssueKindNames) {
			t.Errorf("issue %d has kind %d outside the enum", iid, i.Kind)
		}
	}
}

// Every registered field on the two new entity families has to be readable and
// writable through the model's bridge, or a system that writes it by name fails
// the tick. This is the check that keeps the registry and the accessors in step.
func TestEveryIssueAndNotableFieldIsAccessible(t *testing.T) {
	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Name: "T"}
	n := &model.Notable{ID: 1, Name: "N", TownID: 1, VillageID: -1}
	i := &model.Issue{ID: 1, NotableID: 1, TownID: 1, VillageID: -1}
	s.Notables[1] = n
	s.Issues[1] = i

	for _, name := range model.TrackedFieldsOfKind(model.KindNotable) {
		if _, ok := s.Get(model.KindNotable, 1, name); !ok {
			t.Errorf("tracked field notable.%s is not readable", name)
		}
	}
	for _, name := range model.TrackedFieldsOfKind(model.KindIssue) {
		if _, ok := s.Get(model.KindIssue, 1, name); !ok {
			t.Errorf("tracked field issue.%s is not readable", name)
		}
	}
	// The untracked ones matter too: a delivery is written to arriving_cargo_food
	// and progress to issue_progress, neither of which is a cause row, and both of
	// which have to go through the bridge or the tick fails.
	for _, name := range []string{"issue_progress", "issue_amount", "issue_baseline", "issue_route"} {
		if _, ok := s.Get(model.KindIssue, 1, name); !ok {
			t.Errorf("field issue.%s is not readable", name)
		}
	}
	if !s.Set(model.KindIssue, 1, "issue_progress", 0.5) {
		t.Error("issue.progress is not writable")
	}
	if i.Progress != 0.5 {
		t.Errorf("progress = %v, want 0.5", i.Progress)
	}
	if !s.Set(model.KindNotable, 1, "notable_relation", -0.25) {
		t.Error("notable.relation is not writable")
	}
	if n.Relation != -0.25 {
		t.Errorf("relation = %v, want -0.25", n.Relation)
	}
	if !s.Exists(model.KindIssue, 1) || !s.Exists(model.KindNotable, 1) {
		t.Error("a new issue or notable does not report as existing")
	}
}

// The state a tick reads is committed state, so an issue and its step log have
// to survive a clone intact and independently. A clone that shared the slice
// would let one tick's narrative leak into the next.
func TestCloneCarriesIssuesAndTheirSteps(t *testing.T) {
	w := newWorld(t)
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Issues[1] = &model.Issue{
		ID: 1, Kind: model.IssueDeliverGoods, NotableID: 1,
		TownID: 1, VillageID: -1, State: model.IssueOffered, AcceptorID: -1,
		StartedTick: -1, Amount: 500, Baseline: 200,
		Steps: []model.IssueStep{{Tick: 0, Text: "offered", State: model.IssueOffered}},
	}
	w.state.SetIDCounter(model.IDIssue, 1)
	c := w.state.Clone()
	if len(c.Issues) != 1 || len(c.Issues[1].Steps) != 1 {
		t.Fatal("the clone lost the issue or its steps")
	}
	c.Issues[1].Steps = append(c.Issues[1].Steps, model.IssueStep{Tick: 1, Text: "appended"})
	if len(w.state.Issues[1].Steps) != 1 {
		t.Errorf("the original's step log grew to %d: the clone shares the slice",
			len(w.state.Issues[1].Steps))
	}
	if len(c.Notables) != len(w.state.Notables) {
		t.Errorf("clone has %d notables, original has %d", len(c.Notables), len(w.state.Notables))
	}
}

// The two settlements tally separately, so a village's issues cannot be counted
// against a town's cap with the same number. They are different places with
// different people and the cap is per place.
func TestVillageAndTownIssuesAreCountedSeparately(t *testing.T) {
	s := model.NewState()
	s.Issues[1] = &model.Issue{ID: 1, TownID: 3, VillageID: -1, State: model.IssueOffered, NotableID: 1}
	s.Issues[2] = &model.Issue{ID: 2, TownID: -1, VillageID: 3, State: model.IssueOffered, NotableID: 2}
	s.Issues[3] = &model.Issue{ID: 3, TownID: 3, VillageID: -1, State: model.IssueSucceeded, NotableID: 1}

	tc := countLive(s)
	if got := tc.livePerSettlement[settlementKeyOf(3, -1)]; got != 1 {
		t.Errorf("town 3 has %d live issues, want 1 (the resolved one does not count)", got)
	}
	if got := tc.livePerSettlement[settlementKeyOf(-1, 3)]; got != 1 {
		t.Errorf("village 3 has %d live issues, want 1", got)
	}
	if got := tc.openPerNotable[1]; got != 1 {
		t.Errorf("notable 1 has %d live issues, want 1", got)
	}
	if got := settlementKeyOf(3, -1); got == settlementKeyOf(-1, 3) {
		t.Error("a town and a village with the same id share a tally bucket")
	}
	if got := settlementKeyOf(-1, -1); got >= 0 {
		t.Errorf("a settlement that is neither got bucket %d, want -1", got)
	}
}

// An accepted request is measured every day, so the quest log shows movement
// rather than a number frozen until the job is done. The progress write is not a
// cause row, because a row a day per open request would drown the log, but it is
// still a real state change a player can read.
func TestAcceptedRequestReportsProgressAsItMoves(t *testing.T) {
	w := newWorld(t)
	cfg := testCfg(t)
	cfg.Issue.OfferChancePerDay = 0
	w.seedNotable(1, model.RoleHeadman, 1)
	w.state.Towns[1].FoodDays = 5
	w.state.Issues[1] = &model.Issue{
		ID: 1, Kind: model.IssueDeliverGoods, NotableID: 1,
		TownID: 1, VillageID: -1, State: model.IssueOffered, AcceptorID: -1,
		StartedTick: -1, Amount: 1000, Baseline: 0, DeadlineTick: 200,
	}
	tickWith(t, cfg, w.state, sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: 1})
	if got := w.state.Issues[1].Progress; got != 0 {
		t.Fatalf("progress = %v on acceptance, want 0", got)
	}

	// A third of the shortfall turns up.
	w.state.Towns[1].FoodStock = 300
	tickWith(t, cfg, w.state)
	got := w.state.Issues[1].Progress
	if got <= 0 {
		t.Errorf("progress = %v, want it to have moved off zero", got)
	}
	if got > 1 {
		t.Errorf("progress = %v, want it clamped at 1", got)
	}
}

// The shipped balance file is internally consistent for this system. The same
// three conditions are checked again by simrun.ValidateConfig before a run, but
// a run that started with a hideout target above its trigger would pay for the
// same job twice, and a test that only the run entry point checks would leave
// the mistake invisible until somebody ran a campaign.
//
// simrun cannot be imported here: it imports this package, so a test in this
// package importing it would be a cycle. The conditions are therefore stated
// twice, once as the run-time check and once here, which is why this test names
// them rather than trusting a shared helper to exist.
func TestShippedBalanceFileIsConsistent(t *testing.T) {
	i := testCfg(t).Issue
	if i.ClearHideoutCrimeTarget >= i.ClearHideoutCrimeTrigger {
		t.Errorf("clear_hideout_crime_target %v is not below the trigger %v: the same job would pay twice",
			i.ClearHideoutCrimeTarget, i.ClearHideoutCrimeTrigger)
	}
	if i.EscortSafetyTarget <= i.EscortSafetyTrigger {
		t.Errorf("escort_safety_target %v does not exceed the trigger %v: an escort could not change the road",
			i.EscortSafetyTarget, i.EscortSafetyTrigger)
	}
	if i.DeliverTolerance > 1 {
		t.Errorf("deliver_tolerance %v pays for a delivery that was never made", i.DeliverTolerance)
	}
	// The notice has to be long enough to cross a leg, or every distant request
	// is born overdue and expires before anybody can answer it.
	if i.DeliverDeadlineDays < 1 || i.EscortDeadlineDays < 1 || i.ClearHideoutDeadlineDays < 1 {
		t.Error("a request kind has a notice under one day, so it cannot be answered at all")
	}
	if i.StaleOfferDays < 1 {
		t.Error("stale_offer_days under one would retire every offer the tick it was made")
	}
}

// The chain that matters, end to end, with the real food system rather than a
// hand-set larder: a player takes a request up, the party delivers, the food
// system turns the arrival into stock, and the claim is then honoured.
//
// Every other test in this file isolates one link by writing the world directly.
// This one runs the issue system and the food system together, because the link
// most likely to be wrong is exactly the one that crosses between them: the load
// has to arrive through the arriving field the food system consumes, and not by
// the issue system writing the larder itself. A framework that short-circuited
// that would pass every isolated test and be wrong, and worse, it would make a
// delivery land on the tick it was loaded however far the party walked.
//
// The request is seeded by hand so this is about the seam and not about
// generation, which TestStarvingTownProducesADeliveryRequest covers.
func TestDeliveryCompletesOnlyOnceTheFoodSystemLandsIt(t *testing.T) {
	w := newWorld(t)
	// A small town and a well-stocked party, so one delivery can satisfy one
	// request. Sized the other way round, a single cart honestly cannot feed a
	// large town for twenty days, and the request would be rightly unmet.
	w.state.Towns[1].Population = 200
	w.state.Towns[1].FoodStock = 200
	w.state.Parties[w.party].Food = 100000

	cfg := testCfg(t)
	w.seedNotable(1, model.RoleHeadman, 1)
	// The amount is worked out the way offerDeliver works it out, from the
	// balance file rather than as a literal, so the test keeps agreeing with the
	// generator if either changes.
	asked := cfg.Issue.DeliverDays * 200 * cfg.Food.PersonDaysPerPersonDay
	// The reward is priced by the real function rather than written as a literal,
	// so the amount paid at the end is the amount the generator would have
	// promised for this request. A hand-seeded request with no reward on it would
	// exercise the completion path and quietly skip the payment.
	seeded := w.seedIssue(1, model.IssueDeliverGoods, 1, 1, asked, 200, 30)
	priceReward(&sim.View{State: w.state, Cfg: cfg}, seeded, w.state.Notables[1])
	if seeded.RewardMoney <= 0 {
		t.Fatalf("reward money = %v, want a positive promise from a town holding 10000", seeded.RewardMoney)
	}

	e := sim.NewEngine(cfg, cause.NewLog(4000), 42, []sim.System{System(), food.System()})
	step := func(orders ...sim.Order) {
		t.Helper()
		e.SetOrders(orders)
		if err := e.Tick(w.state); err != nil {
			t.Fatalf("tick: %v", err)
		}
	}

	// The player takes it up and the party loads from its own larder, so the food
	// the settlement needs is food the taker does not eat this month.
	step(sim.Order{Kind: sim.OrderAcceptIssue, LeaderID: w.ruler, Target: 1})
	carried := w.state.Parties[w.party].CargoFood
	if carried <= 0 {
		t.Fatal("accepting the request loaded nothing onto the party")
	}
	i := w.state.Issues[1]
	if carried < i.Amount*cfg.Issue.DeliverTolerance {
		t.Fatalf("the party carries %v, which cannot satisfy a request for %v", carried, i.Amount)
	}
	larderBefore := w.state.Towns[1].FoodStock

	// The party walks into the town. The load comes off the cart and is staged
	// into the arriving field.
	w.state.Parties[w.party].X = w.state.Towns[1].X
	w.state.Parties[w.party].Y = w.state.Towns[1].Y
	step()

	if got := w.state.Towns[1].ArrivingFood; got != carried {
		t.Errorf("arriving food = %v, want the carried %v staged for the food system", got, carried)
	}
	// The load has not reached the larder. The food system is running here, so
	// the larder does move on its own as the town eats; what must not have
	// happened is a jump of the size of the load, because the issue system did
	// not write past the seam the food system owns.
	if jumped := w.state.Towns[1].FoodStock - larderBefore; jumped >= carried {
		t.Errorf("town food rose by %v, at least the whole load %v, in the tick it was staged: "+
			"the arrival must go through the food system rather than straight into the larder", jumped, carried)
	}
	if got := w.state.Issues[1].Progress; got >= 1 {
		t.Errorf("progress = %v, want under 1 while the load is still in transit", got)
	}

	// The next day the food system consumes the arrival. This is the tick the
	// chain turns on, and the issue system cannot see it yet: the food system
	// runs after this one, and no system observes another's output in the same
	// tick, so the larder the objective is measured against is still yesterday's.
	step()
	if got := w.state.Towns[1].FoodStock; got <= larderBefore {
		t.Errorf("town food = %v, want more than %v once the arrival was consumed", got, larderBefore)
	}
	if got := w.state.Towns[1].ArrivingFood; got != 0 {
		t.Errorf("arriving food = %v, want the food system to have consumed it", got)
	}
	if got := w.state.Issues[1].Progress; got != 0 {
		t.Errorf("progress = %v, want 0 on the tick the arrival is consumed: the issue system "+
			"read the larder before the food system changed it", got)
	}

	// The day after, the increase is committed state and the objective is met.
	step()
	if got := w.state.Issues[1].Progress; got < 1 {
		t.Fatalf("progress = %v, want 1 once the food system turned the arrival into stock", got)
	}

	money := w.state.Parties[w.party].Money
	renown := w.state.Leaders[w.ruler].Renown
	relation := w.state.Notables[1].Relation
	step(sim.Order{Kind: sim.OrderCompleteIssue, LeaderID: w.ruler, Target: 1})

	if got := w.state.Issues[1].State; got != model.IssueSucceeded {
		t.Fatalf("state = %v, want succeeded", model.IssueStateNames[got])
	}
	if w.state.Parties[w.party].Money <= money {
		t.Errorf("party money = %v, want more than %v", w.state.Parties[w.party].Money, money)
	}
	if w.state.Leaders[w.ruler].Renown <= renown {
		t.Errorf("renown = %v, want more than %v", w.state.Leaders[w.ruler].Renown, renown)
	}
	if w.state.Notables[1].Relation <= relation {
		t.Errorf("notable relation = %v, want more than %v", w.state.Notables[1].Relation, relation)
	}
	// The request's own log records the delivery, so a quest log is rendered from
	// state rather than reconstructed from the cause log.
	found := false
	for _, st := range w.state.Issues[1].Steps {
		if len(st.Text) > 9 && st.Text[:9] == "delivered" {
			found = true
		}
	}
	if !found {
		t.Errorf("the request log has no delivery entry: %+v", w.state.Issues[1].Steps)
	}
}
