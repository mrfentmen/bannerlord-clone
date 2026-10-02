package replay

import (
	"fmt"
	"math"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// A PLAYER's order has to survive the log, and that is a different claim from the
// one the script tests make.
//
// Every other replay test in this package drives a battle with a Script or with a
// commander written here, and both of those speak the per-unit channel directly: a
// script row becomes a UnitCommand, and this file's scale tests set Set and Intent
// by hand. That covers the log and the replayer. It does not cover the layer in
// between, which is the one a player actually touches.
//
// The layer in between is: a player calls Orders.Apply with an order NAME and its
// parameters, a FormationCommander turns that into a shape, a shape becomes a set
// of per-unit orders, and only THEN does the recorder see anything to write down.
// Every one of those steps can lose an order without anything failing. An order
// name the commander carries out but never speaks produces an empty log; a shape
// published with no movement produces a row the replayer may or may not honour; a
// destination that is not in the row means a replay marches to a different place.
//
// The result is the worst failure this system can have and it is completely
// silent: the player orders a square, the square is drawn, the battle is recorded,
// and the replay is a battle where the line was never a square. Nothing crashes.
// The hash differs, and nothing is watching the hash unless somebody is replaying.
//
// So this drives a session through the real player API, one order at a time, and
// asks after each one whether the log grew and whether replaying the log reproduces
// the battle the player actually fought.

// playerOrders drives one session through the player-facing order API, recording
// from the first tick, and checks the log and the replay after every order.
func TestAPlayersOrdersSurviveTheLogAndTheReplay(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 606060
	// The orders, in the order a player would give them: shape the line, walk it
	// forward, hold, change shape without moving, face a new bearing, walk to a
	// point, fall back, and follow the other group.
	//
	// change-formation and face-direction are the two that matter most here,
	// because both are orders whose whole content is something OTHER than a
	// movement. A log that records movements cannot record them, and a replay of
	// such a log is a battle in which the player never changed his mind about the
	// shape at all.
	type step struct {
		name   battle.OrderName
		params battle.OrderParams
		// one is the group the order goes to, or -1 for the whole side.
		one   int
		ticks int
	}
	steps := []step{
		{battle.OrderHoldPosition, battle.OrderParams{}, -1, 20},
		{battle.OrderAdvance, battle.OrderParams{}, -1, 60},
		{battle.OrderChangeFormation, battle.OrderParams{Formation: "hollow square"}, -1, 40},
		{battle.OrderFaceDirection, battle.OrderParams{Bearing: -0.6, HasFacing: true}, -1, 20},
		{battle.OrderHoldPosition, battle.OrderParams{}, -1, 20},
		{battle.OrderTacticMove, battle.OrderParams{X: -300, Y: 140, HasPoint: true}, -1, 90},
		{battle.OrderRetreat, battle.OrderParams{}, -1, 30},
		{battle.OrderFollow, battle.OrderParams{FollowGroup: 1, HasFollow: true}, 0, 40},
	}

	s, a, b, leaders := newPlayerSession(t, cfg, seed, 16)
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	ids := idsOf(a)
	groups := battle.SplitIntoGroups(ids, 2)
	orders, err := battle.NewOrders(cfg, battle.SideA, []battle.Group{
		{Order: battle.GroupOrder{Kind: battle.FormationLine, Order: battle.OrderFormationHold}, Units: groups[0]},
		{Order: battle.GroupOrder{Kind: battle.FormationLine, Order: battle.OrderFormationHold}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("standing orders: %v", err)
	}
	// Recording starts BEFORE the first commander, so every order the player gives
	// is inside the log. A log that began after the first order would be a log
	// missing the orders that set the battle up.
	log, err := s.Record(1<<20, "player-orders")
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	commander, err := orders.Commander()
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	if err := s.Command(commander); err != nil {
		t.Fatalf("Command: %v", err)
	}
	setup := playerSetup(t, cfg, seed, 16, sessionLabel)

	var rowsBefore int
	for i, st := range steps {
		// A commander rebuilt on a change, which is what the player's order causes.
		if err := orders.Apply(st.name, st.params, aimAt(groups, st.one)); err != nil {
			t.Fatalf("step %d, applying %s: %v", i, st.name, err)
		}
		changed, err := orders.Commander()
		if err != nil {
			t.Fatalf("step %d, rebuilding the commander after %s: %v", i, st.name, err)
		}
		if err := s.Command(changed); err != nil {
			t.Fatalf("step %d, Command after %s: %v", i, st.name, err)
		}
		for k := 0; k < st.ticks; k++ {
			if err := s.Step(); err != nil {
				t.Fatalf("step %d, Step under %s: %v", i, st.name, err)
			}
		}
		// The log has to have grown. An order the player gave and the log did not
		// record is the whole failure, and it is cheapest to catch here with the
		// row count in hand rather than at the end with a mismatched hash.
		rows := log.Len()
		if rows <= rowsBefore {
			t.Errorf("step %d, %s: the order log did not grow (still %d rows). A player was told his "+
				"order was accepted, the shape changed on the field, and nothing was written down. "+
				"A replay of this log is a battle in which that order was never given",
				i, st.name, rows)
		}
		rowsBefore = rows
	}
	if log.Truncated() {
		t.Fatalf("the log refused rows at a bound of a million; it is not a complete record")
	}
	// A recorded battle is one that finished. A session that is still fighting has
	// no Result to compare against, and comparing against a partial one would make
	// the round trip prove less than it looks like it does.
	for i := 0; i < 400 && s.Phase() != battle.PhaseResolved; i++ {
		if err := s.Advance(50); err != nil {
			t.Fatalf("running the battle to a conclusion: %v", err)
		}
	}
	live := s.Result()
	if live == nil {
		t.Fatalf("the session reached phase %s with no result", s.Phase())
	}
	t.Logf("%d ticks, %s, %d order rows from %d player orders", s.Tick(), live.HashString(), log.Len(), len(steps))

	// The round trip, which is the claim.
	encoded, err := log.Encode(seed, cfg.Version)
	if err != nil {
		t.Fatalf("encoding the log: %v", err)
	}
	if before := log.Hash(); before == 0 {
		t.Error("the log's digest is zero, which is also what a log that never hashed a row looks like")
	}
	// The file round trip, so this test covers the bytes on disk and not only the
	// in-memory log.
	check, err := battle.VerifyEncoded(cfg, encoded, setup, live)
	if err != nil {
		t.Fatalf("replaying the player's battle from its own log: %v", err)
	}
	// And the replay's own Result, so a mismatch can be DIAGNOSED rather than
	// merely reported. ReplayCheck carries two hashes and a sentence; it does not
	// carry the state hash, and the state hash is the number that says whether the
	// BATTLE moved or only something written about it did.
	replayed, err := battle.Replay(cfg, &battle.Recording{
		Seed: seed, ConfigVersion: cfg.Version, Setup: setup, Log: log,
	})
	if err != nil {
		t.Fatalf("replaying for the diagnosis: %v", err)
	}
	if !check.Match {
		// NAME THE CAUSE, because the first version of this test failed here for a
		// reason that had nothing to do with orders, and the message as it stood sent
		// me looking in the order log for an hour.
		//
		// The battle was bit-identical — every unit's final state, both side
		// summaries, the statistics, the tick count and the outcome all agreed. The
		// HASH was not, because Result.Hash folds the battle's LABEL in alongside the
		// balance version, and this test built the replay's setup with a different
		// name from the one the session gave the battle. A replay whose setup is not
		// named exactly like the original verifies as a mismatch on a fight where
		// nothing at all happened differently.
		//
		// Whether a battle's display name belongs in its identity is a question for
		// the hash's owner and not for this test. What the test owes the next reader
		// is the DISTINCTION, because a label mismatch and a lost order produce the
		// same verdict and nothing else in the output tells them apart.
		if live.StateHash == replayed.StateHash {
			t.Errorf("a battle fought through the player's own order API replayed to a different "+
				"HASH and the same STATE: state hash %016x on both sides, so every unit finished "+
				"where it finished before with the same condition. The battle is the same battle. "+
				"Result.Hash folds the battle's LABEL in alongside the balance version, and here "+
				"live is %q while the replay is %q — a replay whose setup is not named exactly like "+
				"the original fails on the name alone. The orders in the log are not the problem: "+
				"%d of them replayed to a bit-identical field. %s",
				live.StateHash, live.Label, replayed.Label, log.Len(), check)
		} else {
			t.Errorf("a battle fought through the player's own order API replayed from its log to a "+
				"different BATTLE: state hash %016x live against %016x replayed. %s",
				live.StateHash, replayed.StateHash, check)
		}
	}

	// And the per-order question, asked of the LOG rather than of the hash, because
	// a hash comparison catches a lost order only by accident: it catches it when
	// the order happened to change the outcome that tick, and misses it when it did
	// not.
	//
	// change-formation and face-direction are the two orders whose content is not a
	// movement, and they fail in the same way if the log drops them: the player
	// changed his mind and the replay does not know he did.
	//
	// WHAT TO LOOK FOR, AFTER GETTING IT WRONG ONCE. My first version of this
	// asserted that the log held an OrderFormation row, because OrderFormation is
	// the kind the log defines for "told which shape he is in, and not told to
	// move". It holds none, and that is not a bug:
	//
	//	rows by kind map[move:34379 hold:343]
	//
	// A formation commander gives every man it touches a movement, even when that
	// movement is zero, so Set is always true and OrderFormation is never the kind
	// that gets written. It does not need to be: the shape and the bearing ride in
	// the `formation` and `facing` fields of every row, which is the cheapest place
	// for them, and the replayer publishes them on the strength of those fields
	// alone. The 34722 rows of this battle replay to a bit-identical field, which
	// is the proof that nothing was lost.
	//
	// So the assertion is about the SHAPE rather than about the KIND, and that is
	// the stronger check anyway: it fails if the shape never reaches the log at all,
	// which is the failure that actually loses an order, and it does not care how
	// the encoder chose to classify the row that carried it.
	seen := map[battle.OrderKind]int{}
	shapes := map[battle.Formation]int{}
	var facings []float64
	var lastTick int
	for i, o := range log.Rows() {
		seen[o.Kind]++
		shapes[o.Formation]++
		facings = append(facings, o.Facing)
		if o.Tick < lastTick {
			t.Errorf("row %d is stamped tick %d and row %d was stamped %d; the log is append-only "+
				"and the ticks do not go backwards", i, o.Tick, i-1, lastTick)
		}
		lastTick = o.Tick
	}
	// All three kinds the log defines have to appear somewhere in a battle this
	// varied, and the two that matter most are the ones that distinguish an order
	// from a silence: a hold is a distinct kind rather than a zero-length move
	// precisely so that a commander saying nothing is not recorded as a command.
	if seen[battle.OrderHold] == 0 {
		t.Errorf("the log holds no hold row after two explicit hold orders, so a commander's silence "+
			"and a commander's order to stand still have been recorded as the same thing. "+
			"Rows by kind: %v", seen)
	}
	if seen[battle.OrderMove] == 0 {
		t.Errorf("the log holds no move row at all, which cannot be right for a battle with an "+
			"advance and a march to a point in it. Rows by kind: %v", seen)
	}
	if shapes[battle.FormationSquare] == 0 {
		t.Errorf("no row in the log carries the shape %v the player changed his line to. That "+
			"order's whole content is in a field that is not a movement, and a log with no square "+
			"in it replays a battle in which the line was never a square. Shapes in the log: %v",
			battle.FormationSquare, shapes)
	}
	if shapes[battle.FormationLine] == 0 {
		t.Errorf("no row in the log carries the shape %v the line started in, so the log does not "+
			"describe the shape the battle began with either. Shapes in the log: %v",
			battle.FormationLine, shapes)
	}

	// The bearing the player gave, and the bearing the log carries. The order was
	// issued at a known point in the step list, and rows written from that tick on
	// are the ones that should carry it. A wrap to -Pi..Pi is not applied here: the
	// commander resolves the bearing into the frame it is in, and what has to
	// survive is that the number is the one the player chose rather than a zero from
	// a commander that had not been told.
	const wanted = -0.6
	var found bool
	for _, f := range facings {
		if math.Abs(wrapToPi(f-wanted)) < 1e-6 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("no row in the log carries the bearing %.2f rad the player gave with a "+
			"face-direction order. The bearing rides in the facing field of every row rather than "+
			"being a row kind of its own, which is the cheapest place for it and the easiest to "+
			"lose; %d rows carry %d distinct bearings", wanted, len(facings), distinct(facings))
	}
	t.Logf("%d rows by kind %v; shapes %v; %d distinct bearings, the player's %.2f present: %v",
		len(facings), seen, shapes, distinct(facings), wanted, found)
}

// distinct counts how many different numbers are in a slice, for a log line that
// wants to say "these were not all the same value".
func distinct(xs []float64) int {
	seen := map[float64]bool{}
	for _, x := range xs {
		seen[x] = true
	}
	return len(seen)
}

// wrapToPi folds an angle difference into -Pi..Pi, so a bearing of 5.68 and one of
// -0.6 are the same bearing rather than two.
func wrapToPi(a float64) float64 {
	for a > math.Pi {
		a -= 2 * math.Pi
	}
	for a < -math.Pi {
		a += 2 * math.Pi
	}
	return a
}

// aimAt is the unit list an order goes to: the whole side, or one group.
func aimAt(groups [][]int, one int) []int {
	if one < 0 {
		return nil
	}
	return groups[one]
}

// newPlayerSession builds a session with a modest force, so the test is about the
// order layer and not about how long a battle takes.
func newPlayerSession(t *testing.T, cfg *config.Config, seed uint64, n int) (*battle.Session, []battle.Unit, []battle.Unit, []battle.Leader) {
	t.Helper()
	sideA, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side A: %v", err)
	}
	sideB, err := battle.GenerateForce(cfg, seed+1, battle.SideB, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side B: %v", err)
	}
	leaders := append(
		battle.GenerateLeaders(cfg, seed+2, battle.SideA, 1, 0.7),
		battle.GenerateLeaders(cfg, seed+3, battle.SideB, 1, 0.7)...)
	// The session names the battle after the two parties, and that name is what
	// ends up in the result the replay is compared against.
	s, err := battle.NewSession(cfg, fmt.Sprintf("player-orders-%d", seed),
		battle.PartyRef{ID: "party-a", Name: "Warlord's Column"},
		battle.PartyRef{ID: "party-b", Name: "Riverside Militia"}, 0xC0FFEE, seed)
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}
	return s, sideA, sideB, leaders
}

// sessionLabel is the name the session gives this battle.
//
// It is a constant rather than a literal at each call site because Result.Hash
// folds the label in, and a replay whose setup is named differently hashes
// differently for a battle that is bit-identical. See the note in
// TestAPlayersOrdersSurviveTheLogAndTheReplay's failure path, which is where that
// cost me an hour.
const sessionLabel = "Warlord's Column vs Riverside Militia"

// playerSetup is the same battle as an input, for the replay to be run against.
//
// The label is a parameter for the reason it is a constant elsewhere: the hash
// covers it, so a setup that does not carry the session's own name describes the
// same fight under a different name and verifies as a mismatch.
func playerSetup(t *testing.T, cfg *config.Config, seed uint64, n int, label string) battle.Setup {
	t.Helper()
	sideA, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side A for the setup: %v", err)
	}
	sideB, err := battle.GenerateForce(cfg, seed+1, battle.SideB, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side B for the setup: %v", err)
	}
	return battle.Setup{
		A: sideA, B: sideB,
		Leaders: append(
			battle.GenerateLeaders(cfg, seed+2, battle.SideA, 1, 0.7),
			battle.GenerateLeaders(cfg, seed+3, battle.SideB, 1, 0.7)...),
		Terrain: battle.TerrainOpen,
		Label:   label,
	}
}

func idsOf(units []battle.Unit) []int {
	out := make([]int, len(units))
	for i, u := range units {
		out[i] = u.ID
	}
	return out
}
