package battle

import (
	"testing"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
)

// Morale used to do exactly one thing in a fight, which was scale strength by up
// to half again. COMBAT.md section 6 asks for two more: a fight moves morale,
// and an army whose morale has gone stops fighting and runs. Neither existed. The
// word "rout" appeared nowhere in the Go tree, so this file is the first
// implementation of it and every claim in it is new behaviour rather than a
// characterisation of something already there.

// routFixture is the ordinary two-party town with the loser's morale set by the
// test. The winner is party 1 and is strong enough that the fight is decided
// before the +-20% roll, so a test asserting on a rout is not asserting on a
// seed.
func routFixture(t *testing.T, loserMorale float64) (*config.Config, *model.State) {
	t.Helper()
	cfg := testCfg(t)
	s := matchupState(t, cfg, model.TplStance, model.TplHeavy, 100000, 20000)
	s.Parties[1].Morale = 0.5
	s.Parties[2].Morale = loserMorale
	return cfg, s
}

// The rout field has to be registered, readable, and writable, and it has to
// survive a round trip through the engine's own accessor. This is the test that
// should fail first if the field is added in one place and not the others: a
// rout write to an unregistered name aborts the whole tick before anything
// commits, and a field with no setter reads as zero forever, which is worse than
// not having it at all because it looks like an army that never breaks.
func TestRoutFieldIsRegisteredAndRoundTrips(t *testing.T) {
	f, ok := model.FieldByName(model.KindParty, "routed")
	if !ok {
		t.Fatal(`party.routed is not in the field registry: a write to it aborts the tick`)
	}
	if f.Kind != model.KindParty {
		t.Errorf("routed is registered on %v, want party", f.Kind)
	}
	if !f.Tracked {
		t.Error("routed is untracked, so a rout produces no cause row and the Why " +
			"panel cannot explain an army breaking")
	}
	if f.Value != model.ValueFlag {
		t.Errorf("routed is a %v, want a flag", f.Value)
	}
	if f.Min != 0 || f.Max != 1 {
		t.Errorf("routed is ranged [%v, %v], want [0, 1]", f.Min, f.Max)
	}
	s := model.NewState()
	s.Parties[1] = &model.Party{ID: 1}
	if got, ok := s.Get(model.KindParty, 1, "routed"); !ok || got != 0 {
		t.Errorf("a fresh party reads routed = %v (ok %v), want 0", got, ok)
	}
	if !s.Set(model.KindParty, 1, "routed", 1) {
		t.Fatal("party.routed has no setter")
	}
	if got, _ := s.Get(model.KindParty, 1, "routed"); got != 1 {
		t.Errorf("after setting it, routed reads %v, want 1", got)
	}
	if !s.Parties[1].Routed {
		t.Error("the setter did not reach the struct field: the value is committed " +
			"and then read back as zero")
	}
}

// The mechanic. An army that was already on the edge breaks when it loses, the
// break is visible in committed state, and the men who ran are gone from the
// roster rather than merely marked as having run.
func TestAnArmyOnTheEdgeBreaksWhenItLoses(t *testing.T) {
	cfg, s := routFixture(t, -0.3)
	// The fixture has to be on the edge rather than over it, or the army would
	// not have fought at all and this would be testing nothing.
	threshold := cfg.Battle.RoutMoraleThreshold
	if s.Parties[2].Morale <= threshold {
		t.Fatalf("the fixture's loser starts at morale %v, at or below the "+
			"threshold %v, so it would never have fought", s.Parties[2].Morale, threshold)
	}
	// The casualty-only model: what the roster would say if the men who ran had
	// stayed and been beaten instead. Same seed, morale high enough not to rout.
	_, casualtyOnly := routFixture(t, 0.5)
	resolveWith(t, cfg, casualtyOnly, 13)

	loser := s.Parties[2]
	before := loser.Troops
	resolveWith(t, cfg, s, 13)
	after := s.Parties[2].Troops

	if !s.Parties[2].Routed {
		t.Fatalf("an army that lost at morale %v with a %v defeat hit did not break: "+
			"the flag is not being set", -0.3, cfg.Battle.LoserMoraleHit)
	}
	// The flag has to be visible through the field registry, not only on the
	// struct, because nothing else in the simulation can see a struct field it
	// does not know the name of.
	if got, _ := s.Get(model.KindParty, 2, "routed"); got != 1 {
		t.Errorf("party#2.routed reads %v through the registry, want 1", got)
	}
	loss := before - after
	casualtyOnlyLoss := 20000 - casualtyOnly.Parties[2].Troops
	if loss <= casualtyOnlyLoss {
		t.Errorf("the routed army lost %v men; the casualty-only model lost %v. "+
			"A rout that costs nobody anything has made strength a lie",
			loss, casualtyOnlyLoss)
	}
	// And the flight is a real number of men, not a share that rounded away.
	fled := float64(int64(cfg.Battle.RoutFleeShare * before))
	if loss < fled {
		t.Errorf("the routed army lost %v men, fewer than the %v a %v flee share "+
			"implies", loss, fled, cfg.Battle.RoutFleeShare)
	}
}

// The complement, on the same seed: the same army at high morale does not break,
// and the two fights are otherwise identical.
func TestAnArmyAtHighMoraleDoesNotBreak(t *testing.T) {
	cfg, s := routFixture(t, 0.5)
	resolveWith(t, cfg, s, 13)
	if s.Parties[2].Routed {
		t.Error("an army that lost at morale 0.5 broke: a rout cannot be the price " +
			"of every defeat")
	}
	if got, _ := s.Get(model.KindParty, 2, "routed"); got != 0 {
		t.Errorf("party#2.routed reads %v, want 0", got)
	}
	// Morale moved, which is the other half of the mechanic: the battle system
	// read morale for years and wrote none.
	if want := 0.5 - cfg.Battle.LoserMoraleHit; !nearly(s.Parties[2].Morale, want) {
		t.Errorf("the defeated army's morale is %v, want the %v a %v defeat should "+
			"have cost it", s.Parties[2].Morale, want, cfg.Battle.LoserMoraleHit)
	}
	// And the winner steadied.
	if s.Parties[1].Morale <= 0.5 {
		t.Errorf("the victor's morale is %v, no higher than the %v it started at",
			s.Parties[1].Morale, 0.5)
	}
	if want := 0.5 + cfg.Battle.VictorMoraleGain; !nearly(s.Parties[1].Morale, want) {
		t.Errorf("the victor's morale is %v, want the %v a %v victory is worth",
			s.Parties[1].Morale, want, cfg.Battle.VictorMoraleGain)
	}
}

// The four fates. The existing blunt-capture rule divides the loser's casualties
// into exactly three things and its test checks that they sum to the casualties
// that fell, because a man counted twice comes back later as a recovered wound.
// Rout adds a fourth, and this is the test that the four still add up: the men
// who ran are not in the casualty pool at all, and the pool never describes more
// casualties than there were men present to take them.
func TestTheMenWhoRanAreNotInTheCasualtyPool(t *testing.T) {
	cfg := testCfg(t)
	// A blunt victor, so all four fates can be present in one fight: captives,
	// wounded, killed, and run.
	s := matchupState(t, cfg, model.TplStance, model.TplStance, 100000, 20000)
	s.Parties[1].Morale = 0.5
	s.Parties[2].Morale = -0.3
	resolveWith(t, cfg, s, 13)

	loser := s.Parties[2]
	started := 20000.0
	// Wounded and captured are the two fates that are counted rather than
	// removed, so between them they are bounded by the casualties that fell.
	casualties := started - loser.Troops - float64(int64(cfg.Battle.RoutFleeShare*started))
	if casualties < 0 {
		t.Fatalf("the routed army lost %v men, more than its %v share that ran",
			started-loser.Troops, cfg.Battle.RoutFleeShare*started)
	}
	share := cfg.Battle.BluntCaptureShare
	if loser.Prisoners > casualties*share+1 {
		t.Errorf("the victor took %v prisoners, more than the %v a %v share of %v "+
			"casualties allows", loser.Prisoners, share, share, casualties)
	}
	// Wounded plus prisoners cannot exceed the casualties, or men are in two
	// places at once.
	if loser.Wounded+loser.Prisoners > casualties+1 {
		t.Errorf("the routed army has %v wounded and %v prisoners against %v "+
			"casualties: the fates overlap", loser.Wounded, loser.Prisoners, casualties)
	}
}

// A broken army is not a candidate. It does not fight, and above all it does not
// win a fight it declined to have: an army that has run and then takes the town
// it ran from would be the worst version of this feature.
func TestABrokenArmyDoesNotFight(t *testing.T) {
	cfg, s := routFixture(t, -0.5)
	// At or below the threshold before the fight, so the army is already broken.
	if s.Parties[2].Morale > cfg.Battle.RoutMoraleThreshold {
		t.Fatal("the fixture is not a broken army")
	}
	resolveWith(t, cfg, s, 13)
	if s.Parties[2].Routed != true {
		t.Error("an army standing below the threshold was not flagged as broken")
	}
	if s.Parties[2].Troops != 20000 {
		t.Errorf("the broken army lost men to a fight it was not in: %v left of %v",
			s.Parties[2].Troops, 20000)
	}
	if s.Parties[1].Prisoners != 0 {
		t.Errorf("the victor took %v prisoners out of a fight that did not happen",
			s.Parties[1].Prisoners)
	}
	// The flag is derived, not latched: an army that is fed and rested back above
	// the threshold is a candidate again, and nothing has to clear anything.
	s.Parties[2].Morale = 0.4
	resolveWith(t, cfg, s, 19)
	if s.Parties[2].Routed {
		t.Error("an army above the threshold is still flagged as broken: the flag " +
			"is latched rather than derived from morale")
	}
	if s.Parties[2].Troops >= 20000 {
		t.Errorf("the recovered army fought nothing: %v troops left of %v, so it "+
			"was still excluded", s.Parties[2].Troops, 20000)
	}
}

// Panic. COMBAT.md section 6: routing troops spread panic. A rout in one corner
// of a town takes morale from the armies of the same side standing beside it, in
// the same tick, which is what makes a rout matter beyond one roster.
func TestRoutSpreadsPanicToFriendlyNeighbours(t *testing.T) {
	cfg := testCfg(t)
	// A town with the fight, plus a third army of the loser's side standing in
	// it, and a fourth of the loser's side in another town.
	s := matchupState(t, cfg, model.TplStance, model.TplHeavy, 100000, 20000)
	s.Towns[2] = &model.Town{ID: 2, Name: "Elsewhere", SideID: 2}
	s.Sides[3] = &model.Side{ID: 3, Name: "C", Culture: 0}
	s.SetSideRelation(1, 3, -50)
	s.SetSideRelation(2, 3, 0)
	s.Parties[1].Morale = 0.5
	s.Parties[2].Morale = -0.3
	addParty := func(id, side, town int, troops float64, tpl model.PartyTemplate) {
		s.Parties[id] = &model.Party{ID: id, SideID: side, LeaderID: id,
			DestTown: town, Troops: troops, Template: tpl, Morale: 0.5, Cohesion: 0.5}
		s.Leaders[id] = &model.Leader{ID: id, SideID: side, PartyID: id}
		publishShape(s, id, tpl)
	}
	// Small enough to be bystanders: findPair picks the pair with the greatest
	// combined strength, so a large neighbour here would be fought instead of
	// watched, and the test would be about the wrong army.
	addParty(3, 2, 1, 5000, model.TplLight) // same side, same town: panics
	addParty(4, 2, 2, 5000, model.TplLight) // same side, other town: does not
	addParty(5, 3, 1, 5000, model.TplLight) // enemy, same town: does not

	log := resolveWith(t, cfg, s, 13)

	neighbour := s.Parties[3].Morale
	if neighbour > 0.5-cfg.Battle.RoutPanicPerRout {
		t.Errorf("the army beside the rout is at morale %v, no lower than the %v "+
			"one rout beside it should cost", neighbour, cfg.Battle.RoutPanicPerRout)
	}
	if got := s.Parties[4].Morale; got != 0.5 {
		t.Errorf("an army of the same side in another town lost morale: %v", got)
	}
	if got := s.Parties[5].Morale; got != 0.5 {
		t.Errorf("an enemy of the routed army lost morale: %v: panic is not "+
			"something that spreads to the other side", got)
	}
	// The panic has to be a cause row citing the rout, or the Why panel stops at
	// "the army lost morale" with nothing underneath it.
	found := false
	for _, r := range log.Rows() {
		if r.Field == "morale" && r.Entity == 3 && r.System == "battle" {
			found = true
			if len(r.CausedBy) == 0 {
				t.Error("the panic row cites nothing: it cannot be walked back to " +
					"the rout that caused it")
			}
		}
	}
	if !found {
		t.Error("no cause row records the panic")
	}
}

// A share of one man is a whole man. A routed army that is so small the flee
// share rounds to zero must still lose somebody, or rout is a flag that costs
// nothing at the size where flags are cheapest.
func TestARoutAlwaysCostsAtLeastOneMan(t *testing.T) {
	if got := fleeMen(3, 0.01); got != 1 {
		t.Errorf("fleeMen(3, 0.01) = %v, want 1: a rout that costs nobody anything "+
			"has made strength a lie", got)
	}
	if got := fleeMen(1000, 0.35); got != 350 {
		t.Errorf("fleeMen(1000, 0.35) = %v, want 350", got)
	}
	// At least one man is always left standing, because casualties alone never
	// take a party to zero and a party erased from the map cannot be shown to
	// have run.
	if got := fleeMen(1, 0.35); got != 0 {
		t.Errorf("fleeMen(1, 0.35) = %v, want 0: a one-man army cannot lose its "+
			"last man to flight", got)
	}
	if got := fleeMen(0, 0.35); got != 0 {
		t.Errorf("fleeMen(0, 0.35) = %v, want 0", got)
	}
	// A share of zero is a world with no flight, and it has to be honoured
	// rather than rounded up to a man by the floor above.
	if got := fleeMen(1000, 0); got != 0 {
		t.Errorf("fleeMen(1000, 0) = %v, want 0: rout_flee_share = 0 is a world "+
			"where routing troops still stand there", got)
	}
}

// The balance file has to say what the tests are about, in particular that a
// rout is not the price of every defeat. With the shipped numbers an ordinary
// defeat has to leave an ordinary army alone.
func TestBalanceFileStatesTheRoutItIsTesting(t *testing.T) {
	cfg := testCfg(t)
	if cfg.Battle.LoserMoraleHit <= cfg.Battle.RoutMoraleThreshold {
		t.Errorf("loser_morale_hit (%v) is at or below the rout threshold (%v), so "+
			"every defeat in the game is a rout",
			cfg.Battle.LoserMoraleHit, cfg.Battle.RoutMoraleThreshold)
	}
	if cfg.Battle.RoutFleeShare <= 0 || cfg.Battle.RoutFleeShare >= 1 {
		t.Errorf("rout_flee_share = %v, want a share strictly between 0 and 1: a "+
			"rout that takes the whole army is an erasure and a rout that takes "+
			"none is a flag", cfg.Battle.RoutFleeShare)
	}
	if cfg.Battle.RoutPanicPerRout <= 0 {
		t.Error("rout_panic_per_rout is 0, so COMBAT.md's \"routing troops spread " +
			"panic\" is not implemented")
	}
	if cfg.Battle.RoutMoraleThreshold >= 0 {
		t.Errorf("rout_morale_threshold = %v, want a negative number: an army at "+
			"zero morale is a content army", cfg.Battle.RoutMoraleThreshold)
	}
}
