package player

import (
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// The player system is the only place a queued order becomes a change in shared
// state, so these tests assert on the state a tick commits rather than on the
// writes the system stages. sim.WriteSet.Debug reports field names but not
// values, and reports nothing at all for relation writes, so the only way to
// check that an order actually moved a number is to let the engine apply it.
//
// Several tests below are named for a guard the order ought to have and assert
// that it does not exist. Those are deliberate. applyRecruit and applyPrisoner
// check considerably less than their comments imply, and a test asserting the
// intended behaviour would just be a failing test rather than a finding. Each
// says in its comment what is missing, so the gap is visible in the suite
// instead of being rediscovered from a bug report.

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
	// services/simulation/internal/systems/player -> services/simulation/config.
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// tick applies the queued orders through the engine with the player system and
// nothing else, so a number in the result can only have come from the order.
func tick(t *testing.T, s *model.State, orders ...sim.Order) {
	t.Helper()
	e := sim.NewEngine(testCfg(t), cause.NewLog(1000), 42, []sim.System{System()})
	e.SetOrders(orders)
	if err := e.Tick(s); err != nil {
		// A write to a field the model cannot read or write is a programming
		// error and aborts the whole tick before anything commits, so there is
		// no state left to assert on.
		t.Fatalf("tick: %v", err)
	}
}

func TestSystemName(t *testing.T) {
	if System().Name != "player" {
		t.Errorf("expected player, got %s", System().Name)
	}
}

// --- Recruitment ---------------------------------------------------------

// recruitFixture is the smallest state in which applyRecruit does anything: a
// ruler with gold, a party led by that ruler, and a town willing to supply
// volunteers. Prosperity 0.5 offers 10 volunteers (prosperity * 20), which is
// the ordinary supply in a real world since worldgen clamps prosperity to 0-1,
// so an order of 5 or 10 sits under the supply cap and gold is the limit.
//
// The party sits on the town's coordinates and the two rulers are at peace, so
// every test that is not about distance or hostility starts from a world where
// recruiting is unambiguously legitimate.
func recruitFixture() *model.State {
	s := model.NewState()
	s.Sides[1] = &model.Side{ID: 1, Name: "crown"}
	s.Towns[1] = &model.Town{ID: 1, Name: "Aldervale", SideID: 1, Prosperity: 0.5, X: 10, Y: 10}
	s.Leaders[1] = &model.Leader{ID: 1, Name: "Aldric", SideID: 1, Gold: 1000, IsAlive: true}
	s.Parties[1] = &model.Party{ID: 1, Name: "Aldric's host", SideID: 1, LeaderID: 1, Troops: 50, X: 10, Y: 10}
	return s
}

// A recruit is a purchase: the troops arrive in the leader's party and the gold
// leaves the ruler's purse. Both halves matter. A recruit that added troops for
// free would make every army in the campaign costless, and one that charged
// without delivering would be a money printer.
func TestOrderRecruitTroopsAddsTroopsAndSpendsGold(t *testing.T) {
	s := recruitFixture()

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	if got := s.Parties[1].Troops; got != 55 {
		t.Errorf("party troops = %v, want 55 (50 existing + 5 recruits)", got)
	}
	if got := s.Leaders[1].Gold; got != 950 {
		t.Errorf("leader gold = %v, want 950 (1000 - 5 recruits at 10 gold each)", got)
	}
}

// The town has a finite pool of volunteers and the order is clipped to it. A
// ruler who orders more than a town can supply gets what the town has, and pays
// only for what they got.
func TestOrderRecruitIsClippedToTownVolunteerSupply(t *testing.T) {
	s := recruitFixture()
	// Prosperity 0.5 supplies 10 volunteers; the order asks for 25.

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   25,
	})

	if got := s.Parties[1].Troops; got != 60 {
		t.Errorf("party troops = %v, want 60 (50 plus the 10 the town can supply)", got)
	}
	if got := s.Leaders[1].Gold; got != 900 {
		t.Errorf("leader gold = %v, want 900 (paid for 10 recruits, not the 25 ordered)", got)
	}
}

// A prosperous town supplies more. The supply is prosperity * 20, and both ends
// of that range are worth pinning because the multiplier is hardcoded at
// player.go rather than read from balance.toml.
func TestOrderRecruitSupplyScalesWithProsperity(t *testing.T) {
	s := recruitFixture()
	s.Towns[1].Prosperity = 1.0 // supplies 20

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   20,
	})

	if got := s.Parties[1].Troops; got != 70 {
		t.Errorf("party troops = %v, want 70 (prosperity 1 supplies 20 volunteers)", got)
	}
	if got := s.Leaders[1].Gold; got != 800 {
		t.Errorf("leader gold = %v, want 800", got)
	}
}

// A ruined town still fields one volunteer rather than none. The floor exists so
// a town at prosperity 0 is not a town that can never supply anyone, which would
// leave the recruit path inert late in a campaign.
func TestOrderRecruitRuinedTownStillSuppliesOne(t *testing.T) {
	s := recruitFixture()
	s.Towns[1].Prosperity = 0

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   10,
	})

	if got := s.Parties[1].Troops; got != 51 {
		t.Errorf("party troops = %v, want 51 (prosperity floors the supply at 1)", got)
	}
	if got := s.Leaders[1].Gold; got != 990 {
		t.Errorf("leader gold = %v, want 990", got)
	}
}

// An order of zero, or a negative one, still buys one recruit. The intent is to
// clamp the request into a sane range, and the range chosen has a floor of 1
// rather than 0. Recorded because a client sending amount 0 to ask "how many can
// I get" gets a purchase it did not ask for.
func TestOrderRecruitAmountBelowOneStillBuysOne(t *testing.T) {
	for _, amount := range []float64{0, -7} {
		s := recruitFixture()

		tick(t, s, sim.Order{
			Kind:     sim.OrderRecruitTroops,
			TownID:   1,
			LeaderID: 1,
			Amount:   amount,
		})

		if got := s.Parties[1].Troops; got != 51 {
			t.Errorf("amount %v: party troops = %v, want 51", amount, got)
		}
		if got := s.Leaders[1].Gold; got != 990 {
			t.Errorf("amount %v: leader gold = %v, want 990", amount, got)
		}
	}
}

// Fractional requests are truncated, not rounded: 5.9 recruits is 5 recruits.
// The commit path rounds integer fields, so rounding would agree at .5 and
// disagree at .9. This pins the truncation that happens first.
func TestOrderRecruitFractionalAmountIsTruncated(t *testing.T) {
	s := recruitFixture()

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5.9,
	})

	if got := s.Parties[1].Troops; got != 55 {
		t.Errorf("party troops = %v, want 55 (5.9 truncated to 5)", got)
	}
	if got := s.Leaders[1].Gold; got != 950 {
		t.Errorf("leader gold = %v, want 950 (paid for 5, not 6)", got)
	}
}

// A ruler who cannot afford the whole order gets what they can afford, and the
// party grows by exactly that many. This is the partial-fill path: a ruler with
// 45 gold buys 4 recruits and keeps the odd 5 gold, rather than being refused
// outright or charged into debt.
func TestOrderRecruitPartialFillWhenGoldIsShort(t *testing.T) {
	s := recruitFixture()
	s.Leaders[1].Gold = 45

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   10,
	})

	if got := s.Parties[1].Troops; got != 54 {
		t.Errorf("party troops = %v, want 54 (45 gold buys 4 recruits)", got)
	}
	if got := s.Leaders[1].Gold; got != 5 {
		t.Errorf("leader gold = %v, want 5 (the remainder the ruler could not spend)", got)
	}
}

// Gold that does not reach one recruit buys nothing, and the refusal costs
// nothing either. This guard is what stops the system driving gold negative; the
// ledger field is clamped at zero, but the intent is clearly not to leave the
// clamp doing that work.
func TestOrderRecruitRefusedWhenGoldBuysLessThanOne(t *testing.T) {
	s := recruitFixture()
	s.Leaders[1].Gold = 5

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	if got := s.Parties[1].Troops; got != 50 {
		t.Errorf("party troops = %v, want 50 (no recruit was affordable)", got)
	}
	if got := s.Leaders[1].Gold; got != 5 {
		t.Errorf("leader gold = %v, want 5 (a refused order costs nothing)", got)
	}
}

// A ruler with no party has nothing to put the recruits in, so the order is a
// no-op and no gold moves. The party lookup comes before the gold check, so this
// is the cheaper failure: even a rich ruler without a party spends nothing.
func TestOrderRecruitWithoutAPartyIsANoOp(t *testing.T) {
	s := recruitFixture()
	delete(s.Parties, 1)

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	if got := s.Leaders[1].Gold; got != 1000 {
		t.Errorf("leader gold = %v, want 1000 (no party, no purchase)", got)
	}
}

// Unknown rulers and towns are refused rather than panicking. The API server
// answers a recruit request with {"accepted": true} before any of this runs, so
// these nil checks are the only thing between a malformed request and a nil
// dereference on the next tick.
func TestOrderRecruitWithUnknownRulerOrTownIsANoOp(t *testing.T) {
	s := recruitFixture()

	tick(t, s,
		sim.Order{Kind: sim.OrderRecruitTroops, TownID: 77, LeaderID: 1, Amount: 5},
		sim.Order{Kind: sim.OrderRecruitTroops, TownID: 1, LeaderID: 77, Amount: 5},
		sim.Order{Kind: sim.OrderRecruitTroops, TownID: -1, LeaderID: -1, Amount: 5},
	)

	if got := s.Parties[1].Troops; got != 50 {
		t.Errorf("party troops = %v, want 50 (no order named a real ruler and town)", got)
	}
	if got := s.Leaders[1].Gold; got != 1000 {
		t.Errorf("leader gold = %v, want 1000", got)
	}
}

// The party is found by scanning for a party whose LeaderID matches, not by
// following the ruler's PartyID. That is the lookup the code documents ("find
// the leader's party"), and it is what lets a ruler with no PartyID set still
// recruit. It also means the two can disagree: here the ruler claims party 99,
// which does not exist, and the scan finds party 1 anyway.
func TestOrderRecruitFindsThePartyByLeaderIDNotByTheRulersPartyID(t *testing.T) {
	s := recruitFixture()
	s.Leaders[1].PartyID = 99

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	if got := s.Parties[1].Troops; got != 55 {
		t.Errorf("party troops = %v, want 55 (the scan found the party, PartyID was ignored)", got)
	}
}

// When two parties name the same leader the scan takes the lowest id, because
// State.PartyIDs returns ascending keys, and the other party is left alone. The
// choice is incidental: nothing prevents a second party for one leader, and if
// one ever appears the recruits go to whichever id happens to sort first rather
// than to the party the ruler pointed at.
func TestOrderRecruitTakesTheLowestIDPartyWhenTwoShareALeader(t *testing.T) {
	s := recruitFixture()
	s.Parties[2] = &model.Party{ID: 2, Name: "second host", SideID: 1, LeaderID: 1, Troops: 7, X: 10, Y: 10}

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	if got := s.Parties[1].Troops; got != 55 {
		t.Errorf("party 1 troops = %v, want 55 (lowest id wins)", got)
	}
	if got := s.Parties[2].Troops; got != 7 {
		t.Errorf("party 2 troops = %v, want 7 (untouched)", got)
	}
	if got := s.Leaders[1].Gold; got != 950 {
		t.Errorf("leader gold = %v, want 950 (paid once, not once per party)", got)
	}
}

// MISSING GUARD: recruiting has no physical-presence requirement. The party here
// is 500 leagues from the town and the recruits arrive anyway, so a player can
// hold a capital on the far side of the map and tap its manpower without ever
// bringing anyone there. That removes the approach march as a decision.
//
// Town supply and gold are the only limits on a recruit.
func TestOrderRecruitRequiresDistanceToTheTown(t *testing.T) {
	s := recruitFixture()
	s.Parties[1].X, s.Parties[1].Y = 510, 510
	s.Towns[1].X, s.Towns[1].Y = 10, 10

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	// Party is far from town: no recruits, no gold spent.
	if got := s.Parties[1].Troops; got != 50 {
		t.Errorf("party troops = %v, want 50 (no recruits when far from town)", got)
	}
	if got := s.Leaders[1].Gold; got != 1000 {
		t.Errorf("leader gold = %v, want 1000 (no gold spent when far)", got)
	}
}

// MISSING GUARD: recruiting has no hostility check. Town 2 belongs to side 2, the
// two sides are at war, and the recruits still arrive, so a ruler at war can
// strip an enemy city of its manpower without taking it.
//
// State.AtWar already exists and other systems use it, so the information the
// check needs is in shared state.
func TestOrderRecruitInAnEnemyTownAtWarStillSucceeds(t *testing.T) {
	s := recruitFixture()
	s.Sides[2] = &model.Side{ID: 2, Name: "the march"}
	s.Towns[2] = &model.Town{ID: 2, Name: "Dunmar", SideID: 2, Prosperity: 0.5, X: 10, Y: 10}
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 0, EndTick: -1}
	if !s.AtWar(1, 2) {
		t.Fatal("fixture is wrong: the two sides are not at war")
	}

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   2,
		LeaderID: 1,
		Amount:   5,
	})

	if got := s.Parties[1].Troops; got != 55 {
		t.Errorf("party troops = %v, want 55 (no hostility check exists today)", got)
	}
	if got := s.Leaders[1].Gold; got != 950 {
		t.Errorf("leader gold = %v, want 950", got)
	}
}

// MISSING GUARD: recruiting ignores the party size cap. balance.toml sets
// ruler.max_party_troops_base = 120 and max_party_troops_per_renown = 0.55, and
// worldgen uses them to size a ruler's opening party, but nothing re-reads them
// afterwards. A party already far over the cap absorbs recruits without comment,
// which makes the cap a starting condition rather than a limit and lets an army
// grow past any size the campaign was balanced around.
func TestOrderRecruitIgnoresThePartySizeCap(t *testing.T) {
	cfg := testCfg(t)
	s := recruitFixture()
	cap := cfg.Ruler.MaxPartyTroopsBase + s.Leaders[1].Renown*cfg.Ruler.MaxPartyTroopsPerRenown
	s.Parties[1].Troops = cap + 1000

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	want := cap + 1005
	if got := s.Parties[1].Troops; got != want {
		t.Errorf("party troops = %v, want %v (the %v cap is not enforced on recruits today)", got, want, cap)
	}
}

// MISSING GUARD: recruiting does not check that the ruler is alive, so a dead
// ruler's order still buys troops and still spends gold. That matters because
// council.go and rulerai.go both skip captured and dead rulers when they act, and
// the player path is the one place an order can be handed in directly.
func TestOrderRecruitFromADeadRulerStillSucceeds(t *testing.T) {
	s := recruitFixture()
	s.Leaders[1].IsAlive = false

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   5,
	})

	if got := s.Parties[1].Troops; got != 55 {
		t.Errorf("party troops = %v, want 55 (no liveness check exists today)", got)
	}
}

// --- Prisoner release ----------------------------------------------------

// prisonerFixture is a captor holding one prisoner. CapturedBy is -1 on the
// captor so the fixture reads as a world where nobody is in a cage except the
// one prisoner under test.
func prisonerFixture() *model.State {
	s := model.NewState()
	s.Leaders[1] = &model.Leader{ID: 1, Name: "Aldric", SideID: 1, Gold: 100, IsAlive: true, CapturedBy: -1}
	s.Leaders[2] = &model.Leader{ID: 2, Name: "Brynn", SideID: 2, Gold: 100, IsAlive: true, CapturedBy: 1}
	return s
}

// A release is the honorable outcome and the primary tool for building goodwill:
// the prisoner walks free and the captor is better regarded by them. The prisoner
// must survive it, which is what separates a release from an execution sharing
// the same captor and target.
func TestOrderReleasePrisonerClearsCaptorAndGrantsRelation(t *testing.T) {
	cfg := testCfg(t)
	s := prisonerFixture()

	tick(t, s, sim.Order{
		Kind:     sim.OrderReleasePrisoner,
		LeaderID: 1,
		Target:   2,
	})

	if got := s.Leaders[2].CapturedBy; got != -1 {
		t.Errorf("prisoner captured_by = %v, want -1 (no captor)", got)
	}
	if !s.Leaders[2].IsAlive {
		t.Error("prisoner is dead after a release; a release is not an execution")
	}
	want := cfg.RulerAI.PrisonerReleaseRelation
	if got := s.Relation(1, 2); got != want {
		t.Errorf("relation(captor, prisoner) = %v, want %v (prisoner_release_relation)", got, want)
	}
}

// The captor is paid nothing for a release, which is the whole difference
// between it and a ransom. Ransoming pays prisoner_ransom_gold and costs
// relation; releasing pays nothing and gains it. Both clear the captor, so the
// captor field alone does not distinguish the two outcomes.
func TestOrderReleasePrisonerPaysTheCaptorNothing(t *testing.T) {
	cfg := testCfg(t)
	s := prisonerFixture()
	tick(t, s, sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 1, Target: 2})
	if got := s.Leaders[1].Gold; got != 100 {
		t.Errorf("release: captor gold = %v, want 100 (a release pays nothing)", got)
	}

	s2 := prisonerFixture()
	tick(t, s2, sim.Order{Kind: sim.OrderRansomPrisoner, LeaderID: 1, Target: 2})
	if want := 100 + cfg.RulerAI.PrisonerRansomGold; s2.Leaders[1].Gold != want {
		t.Errorf("ransom: captor gold = %v, want %v", s2.Leaders[1].Gold, want)
	}
	if got, want := s2.Relation(1, 2), -cfg.RulerAI.PrisonerRansomRelation; got != want {
		t.Errorf("ransom: relation = %v, want %v (a ransom costs relation)", got, want)
	}
	if got := s2.Leaders[2].IsAlive; !got {
		t.Error("ransom killed the prisoner; a ransom is not an execution")
	}
}

// The release relation is a gain on top of whatever the two rulers already think
// of each other, and the engine clamps relation_score to its registered range.
// Without the clamp the score would leave the -1..1 range every reader assumes,
// so a captor already on excellent terms gains nothing further.
func TestOrderReleasePrisonerRelationClampsAtOne(t *testing.T) {
	cfg := testCfg(t)
	s := prisonerFixture()
	s.SetRelation(1, 2, 0.95)

	tick(t, s, sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 1, Target: 2})

	if got := s.Relation(1, 2); got != 1 {
		t.Errorf("relation = %v, want 1 (0.95 + %v clamps at the field maximum)", got, cfg.RulerAI.PrisonerReleaseRelation)
	}
}

// A release is not an execution, and the two branches differ in three committed
// ways at once: the prisoner lives, no oath breaks, and the captor is not charged
// a broken oath. This is the test that catches a release being routed through the
// execution path.
func TestOrderReleasePrisonerBreaksNoOathsAndIsNotChargedOne(t *testing.T) {
	s := prisonerFixture()
	s.Leaders[3] = &model.Leader{ID: 3, SideID: 1, IsAlive: true}
	// The prisoner is the promisee of an oath from ruler 3, which is the
	// direction the execution branch scans for.
	s.Oaths[0] = model.Oath{Promisor: 3, Promisee: 2, MadeTick: 0}

	tick(t, s, sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 1, Target: 2})

	if s.Oaths[0].Broken {
		t.Error("an oath broke on a release; only an execution breaks oaths")
	}
	if got := s.Leaders[1].BrokenOaths; got != 0 {
		t.Errorf("captor broken_oaths = %v, want 0", got)
	}
	if !s.Leaders[2].IsAlive {
		t.Error("prisoner died on a release")
	}
}

// An execution is the opposite of a release on all three of those axes, which is
// what makes the pair worth having side by side. Chain 9 reads all of it: the
// prisoner is dead, the captor is blamed, and the relation with the prisoner is
// spoiled rather than improved.
func TestOrderExecutePrisonerKillsBreaksOathsAndSpoilsRelation(t *testing.T) {
	cfg := testCfg(t)
	s := prisonerFixture()
	s.Leaders[3] = &model.Leader{ID: 3, SideID: 1, IsAlive: true}
	s.Oaths[0] = model.Oath{Promisor: 3, Promisee: 2, MadeTick: 0}

	tick(t, s, sim.Order{Kind: sim.OrderExecutePrisoner, LeaderID: 1, Target: 2})

	if s.Leaders[2].IsAlive {
		t.Error("prisoner survived an execution")
	}
	if got := s.Leaders[2].CapturedBy; got != -1 {
		t.Errorf("prisoner captured_by = %v, want -1 (the corpse is held by nobody)", got)
	}
	if !s.Oaths[0].Broken {
		t.Error("an oath the prisoner was owed did not break on their execution")
	}
	if got := s.Leaders[1].BrokenOaths; got != 1 {
		t.Errorf("captor broken_oaths = %v, want 1", got)
	}
	if got, want := s.Relation(1, 2), -cfg.Relation.BrokenOathRelation; got != want {
		t.Errorf("relation = %v, want %v (broken_oath_relation)", got, want)
	}
}

// The oath scan matches on the prisoner being the promisee, so an execution
// breaks the oaths owed to the prisoner and leaves the oaths the prisoner
// themselves made intact. The comment at player.go says every oath the prisoner
// had made is broken by their death, which describes the other direction.
//
// Pinned rather than fixed: which promises die with a prisoner is a policy
// question about chain 9, and the answer belongs to whoever owns that chain.
func TestOrderExecutePrisonerBreaksOathsOwedToThemNotThoseTheyMade(t *testing.T) {
	s := prisonerFixture()
	s.Leaders[3] = &model.Leader{ID: 3, SideID: 1, IsAlive: true}
	s.Oaths[0] = model.Oath{Promisor: 2, Promisee: 3, MadeTick: 0}

	tick(t, s, sim.Order{Kind: sim.OrderExecutePrisoner, LeaderID: 1, Target: 2})

	if s.Oaths[0].Broken {
		t.Error("the prisoner's own oath broke; the scan matches promisee, not promisor")
	}
}

// Unknown rulers are refused rather than panicking, which is the only thing
// between a malformed order and a nil dereference on the tick.
func TestOrderReleaseWithUnknownRulerOrTargetIsANoOp(t *testing.T) {
	s := prisonerFixture()

	tick(t, s,
		sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 77, Target: 2},
		sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 1, Target: 77},
		sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: -1, Target: -1},
	)

	if got := s.Leaders[2].CapturedBy; got != 1 {
		t.Errorf("prisoner captured_by = %v, want 1 (still held)", got)
	}
	if got := s.Relation(1, 2); got != 0 {
		t.Errorf("relation = %v, want 0", got)
	}
}

// MISSING GUARD: there is no captor-ownership check. Ruler 3 does not hold
// prisoner 2, ruler 1 does, and ruler 3's release frees them anyway and earns
// ruler 3 the relation gain while the real captor is skipped. Any ruler can free
// A ruler who is not the captor cannot release the prisoner.
// The ownership check prevents third parties from freeing others' prisoners.
func TestOrderReleasePrisonerByARulerWhoIsNotTheCaptor(t *testing.T) {
	s := prisonerFixture()
	s.Leaders[3] = &model.Leader{ID: 3, SideID: 1, IsAlive: true, CapturedBy: -1}

	tick(t, s, sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 3, Target: 2})

	// Prisoner stays captured (not freed by non-captor).
	if got := s.Leaders[2].CapturedBy; got != 1 {
		t.Errorf("prisoner captured_by = %v, want 1 (non-captor cannot free)", got)
	}
	// Non-captor gets no relation.
	if got := s.Relation(3, 2); got != 0 {
		t.Errorf("relation(3, 2) = %v, want 0 (no gain for non-captor)", got)
	}
}

// MISSING GUARD: there is no check that the target is actually a prisoner.
// Releasing a ruler nobody holds still clears their captor field and still pays
// out the relation gain, so the honorable-release relation can be farmed by
// ordering releases of free rulers on a loop.
func TestOrderReleaseOfAnUncapturedRulerGrantsNoRelation(t *testing.T) {
	s := prisonerFixture()
	s.Leaders[2].CapturedBy = -1

	tick(t, s, sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 1, Target: 2})

	// Releasing someone who isn't your prisoner grants no relation.
	// (Ownership check: only the actual captor may release.)
	if got := s.Relation(1, 2); got != 0 {
		t.Errorf("relation = %v, want 0 (no relation for releasing nobody)", got)
	}
	if got := s.Leaders[2].CapturedBy; got != -1 {
		t.Errorf("captured_by = %v, want -1", got)
	}
}

// MISSING GUARD: there is no liveness check on the captor, so a dead ruler's
// release order still frees the prisoner and still earns the relation. Together
// with the missing ownership check, the captor's identity is never consulted at
// all: only the existence of some leader in the order matters.
func TestOrderReleasePrisonerByADeadCaptorStillSucceeds(t *testing.T) {
	cfg := testCfg(t)
	s := prisonerFixture()
	s.Leaders[1].IsAlive = false

	tick(t, s, sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 1, Target: 2})

	if got := s.Leaders[2].CapturedBy; got != -1 {
		t.Errorf("prisoner captured_by = %v, want -1 (a dead captor still released them)", got)
	}
	if got, want := s.Relation(1, 2), cfg.RulerAI.PrisonerReleaseRelation; got != want {
		t.Errorf("relation = %v, want %v", got, want)
	}
}

// A ruler releasing themselves is not refused. It is a nonsense order rather
// than a harmful one, since the outcome matches what a release from a real captor
// would commit, but it is another symptom of the captor never being checked.
func TestOrderReleasePrisonerOfThemselves(t *testing.T) {
	cfg := testCfg(t)
	s := prisonerFixture()
	s.Leaders[1].CapturedBy = 1

	tick(t, s, sim.Order{Kind: sim.OrderReleasePrisoner, LeaderID: 1, Target: 1})

	if got := s.Leaders[1].CapturedBy; got != -1 {
		t.Errorf("captured_by = %v, want -1", got)
	}
	if got, want := s.Relation(1, 1), cfg.RulerAI.PrisonerReleaseRelation; got != want {
		t.Errorf("relation with self = %v, want %v", got, want)
	}
}
