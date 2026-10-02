package replay

import (
	"fmt"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/battleapi"
	"mbclone/simulation/internal/config"
)

// A session battle can be saved and verified — but only if it was built the way
// the record format builds battles, and `internal/battleapi` does not build them
// that way.
//
// TWO SEPARATE OBSTACLES, BOTH ON THE GAME'S PATH
//
// ONE: the Setup a session fights with is discarded.
//
// `Session.Deploy` builds a `Setup` at session.go:196 and keeps no copy. From the
// exported accessors a caller can rebuild A, B and Leaders exactly — `Deploy`
// freezes the two rosters separately and concatenates A's leaders then B's, and
// `freezeRoster` filters to one side, so `Roster(side)` reproduces the same slice
// in the same order. Terrain is hardcoded to TerrainOpen, the only value `Setup`
// supports, so that is safe. Label is `fmt.Sprintf("%s vs %s", attacker, defender)`
// in Deploy, and that format string is not exported, not a constant, and not on
// any accessor. `BattleRecord.Setup(cfg)` and `Script.Setup(cfg)` both exist and
// both return the Setup their record was fought with. Session is the only one of
// the three whose Setup a caller cannot get.
//
// Label matters because `Result.Hash` folds it in, so a caller who guesses it wrong
// gets a replay whose tick count, outcome, reason, sides and stats all agree and
// whose hash does not. That is proved below rather than argued: two replays of the
// same log, differing only in that string.
//
// TWO: the seed convention does not match, and this one bites harder.
//
// The record format stores ONE seed and regenerates both sides from it, letting
// `GenerateForce` distinguish them with its `Derive("roster-SideA")` and
// `Derive("roster-SideB")` substreams. `Script.Setup` is where that happens, and
// `BattleRecord.Setup` goes through it deliberately, with a comment saying the
// reason is that `Replay` refuses a log whose roster fingerprint does not match.
//
// `internal/battleapi/handleStart` does not do that. It generates:
//
//     side A    GenerateForce(cfg, seed,                  SideA, ...)
//     side B    GenerateForce(cfg, seed^0x9E3779B97F4A7C15, SideB, ...)
//     leaders   GenerateLeaders(cfg, seed^0x12345, SideA, ...) and seed^0x67890
//
// Three derivations from one seed. The record format can express one. So the first
// thing that happens when someone wires `Session.Record` and `BattleStore.Save`
// into the server — which is the obvious next step, and what my "the shipped server
// records nothing" finding demands — is that every saved battle fails to verify.
//
// It fails LOUDLY, which is the one mercy here: the store's `Verify` reports
// MISMATCH and prints "first difference: ticks". A loud failure at the wiring step
// is much cheaper than a silent one, and this test exists so that whoever does the
// wiring knows to look for it rather than discovering it.

// sessionBattleID is the store id the save test writes under.
const sessionBattleID = "session-save"

// TestASessionBattleSavesAndVerifiesThroughTheBattleStore is the good path, proven
// end to end: a real save into a real directory, then a real load and verify.
//
// Both forces come from ONE seed, which is what the record format regenerates
// from. That is the whole difference between this test and the one below it.
func TestASessionBattleSavesAndVerifiesThroughTheBattleStore(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 5150
	store := battle.OpenBattleStore(t.TempDir())

	s, res, log := foughtSession(t, cfg, seed, 12)

	rec := &battle.Recording{
		Seed:          s.Seed(),
		ConfigVersion: cfg.Version,
		Setup:         setupFromSession(s),
		Log:           log,
	}
	roster := battle.Roster{Units: 12}
	if err := store.Save(sessionBattleID, roster, roster, res, rec); err != nil {
		t.Fatalf("saving the session's battle into the store: %v", err)
	}

	check, err := store.Verify(cfg, sessionBattleID)
	if err != nil {
		t.Fatalf("verifying the saved session battle: %v", err)
	}
	if !check.Match {
		t.Errorf("a session battle saved into the battle store and verified back did not match: %v\n"+
			"  The Setup here was rebuilt with setupFromSession, so a mismatch means the rosters or "+
			"the label are being rebuilt wrongly and the helper is the thing at fault, not the store",
			check)
	}
	t.Logf("one seed for both sides: %d ticks, %d order rows, %s", res.Ticks, log.Len(), check)
}

// TestASessionBuiltTheWayTheShippedAPIDoesItCannotBeVerified is the same battle,
// TestASessionBattleBuiltTheWayTheShippedAPIBuildsOneVerifies is the good path
// again, but through the SHIPPED path rather than a description of it.
//
// The previous version of this test asserted that a session battle built the way
// internal/battleapi builds one could not be verified, and it was right: handleStart
// generated side B from seed^0x9E3779B97F4A7C15 and the leader sets from
// seed^0x12345 and seed^0x67890, while the record format stores one seed and
// regenerates both sides from it. Three derivations, one recorded seed, 650 ticks
// against 869.
//
// handleStart now calls battleapi.SessionForces, which derives everything from the
// one seed. So this test builds its forces by CALLING that function rather than by
// reproducing what the function used to do, which is the only arrangement that
// cannot go stale: the old test hand-copied the derivations into this file with a
// comment saying it mirrored handleStart, and the copy is exactly why fixing the
// handler left the test unchanged and passing for the wrong reason.
//
// TestThreeSeedDerivationsDoNotVerify below is the other half and keeps the
// finding from being thrown away with the fixture: the one-seed rule is pinned by
// showing what breaks it, not merely asserted in a comment.
func TestASessionBattleBuiltTheWayTheShippedAPIBuildsOneVerifies(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 5150
	store := battle.OpenBattleStore(t.TempDir())

	s, res, log := foughtSession(t, cfg, seed, 12)

	rec := &battle.Recording{
		Seed:          s.Seed(),
		ConfigVersion: cfg.Version,
		Setup:         setupFromSession(s),
		Log:           log,
	}
	roster := battle.Roster{Units: 12}
	if err := store.Save(sessionBattleID, roster, roster, res, rec); err != nil {
		t.Fatalf("saving the session's battle into the store: %v", err)
	}
	check, err := store.Verify(cfg, sessionBattleID)
	if err != nil {
		t.Fatalf("verifying was refused outright rather than mismatched: %v", err)
	}
	if !check.Match {
		t.Errorf("a session battle built the way internal/battleapi builds one STILL cannot be "+
			"verified from the battle store it was saved to, with the seed convention now fixed.\n"+
			"  %v\n"+
			"  battleapi.SessionForces derives both sides and both leader sets from the one seed, "+
			"which is what Script.Setup regenerates from, so the tick count should agree. If it does "+
			"not, the remaining difference is not the seed: look at Label, which Result.Hash() folds "+
			"in, and at the leaders, whose count and influence now come from the balance file.",
			check)
	}
}

// TestThreeSeedDerivationsDoNotVerify is the finding that fix was made for, kept so
// the rule cannot be quietly undone.
//
// The record format stores ONE seed and regenerates both sides from it through
// battle.Script.Setup, which leans on GenerateForce's own
// Derive("roster-SideA")/Derive("roster-SideB") substreams to separate them.
// handleStart used to add its own separation on top — side B from
// seed^0x9E3779B97F4A7C15, the leader sets from seed^0x12345 and seed^0x67890 — and
// the result was a battle that could be recorded and never replayed.
//
// This asserts the MISMATCH rather than the match, because a rule that is only ever
// tested in the passing direction is a rule nothing is checking. It fails if the
// format ever grows room for the three derivations, at which point this test and
// the fix it justifies both need revisiting — loudly, which is the point.
func TestThreeSeedDerivationsDoNotVerify(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 5150
	store := battle.OpenBattleStore(t.TempDir())

	s, res, log := foughtSessionWithForces(t, cfg, seed, 12, func() ([]battle.Unit, []battle.Unit, []battle.Leader) {
		roster := battle.Roster{Units: 12}
		a, err := battle.GenerateForce(cfg, seed, battle.SideA, roster)
		if err != nil {
			t.Fatalf("side A: %v", err)
		}
		b, err := battle.GenerateForce(cfg, seed^0x9E3779B97F4A7C15, battle.SideB, roster)
		if err != nil {
			t.Fatalf("side B: %v", err)
		}
		return a, b, append(
			battle.GenerateLeaders(cfg, seed^0x12345, battle.SideA, 1, 0.7),
			battle.GenerateLeaders(cfg, seed^0x67890, battle.SideB, 1, 0.7)...)
	})

	rec := &battle.Recording{
		Seed:          s.Seed(),
		ConfigVersion: cfg.Version,
		Setup:         setupFromSession(s),
		Log:           log,
	}
	roster := battle.Roster{Units: 12}
	if err := store.Save(sessionBattleID, roster, roster, res, rec); err != nil {
		t.Fatalf("saving: %v", err)
	}
	check, err := store.Verify(cfg, sessionBattleID)
	if err != nil {
		t.Logf("verifying was REFUSED rather than mismatched, which also means the battle could not "+
			"be verified: %v", err)
		return
	}
	if check.Match {
		t.Errorf("a battle whose two sides came from three different derivations of one seed now " +
			"VERIFIES against a record holding that one seed.\n" +
			"  Either the format grew room for the extra derivations, in which case " +
			"battleapi.SessionForces no longer needs to collapse them onto one seed and its comment " +
			"is wrong, or something else has stopped depending on the derivation, in which case the " +
			"reason SessionForces exists is gone. Either way this test and that function have to be " +
			"revisited together.")
	}
	t.Logf("three seed derivations against one recorded seed: %v. This is the obstacle "+
		"battleapi.SessionForces removes by generating both sides and both leader sets from the "+
		"one seed.", check)
}

// TestASessionBattleWithTheWrongLabelFailsToVerify is the label hazard, made real.
//
// The label used is not nonsense. It is the shape a caller would naturally write
// from what the API publishes: the state response's two sides carry `party_name`,
// and a caller assembling a Setup from a session has exactly those two strings.
func TestASessionBattleWithTheWrongLabelFailsToVerify(t *testing.T) {
	cfg := loadConfig(t)
	s, res, log := foughtSession(t, cfg, 5150, 12)

	right := setupFromSession(s)
	if want := fmt.Sprintf("%s vs %s", s.Attacker().Name, s.Defender().Name); right.Label != want {
		t.Fatalf("setupFromSession built the label %q, which is not Deploy's %q; the good-path "+
			"test would have been proving something else", right.Label, want)
	}
	wrong := setupFromSession(s)
	wrong.Label = s.Attacker().Name + " vs " + s.Defender().Name + " (field battle)"

	gotRight, err := battle.Replay(cfg, &battle.Recording{
		Seed: s.Seed(), ConfigVersion: cfg.Version, Setup: right, Log: log})
	if err != nil {
		t.Fatalf("replaying with Deploy's label failed: %v", err)
	}
	gotWrong, err := battle.Replay(cfg, &battle.Recording{
		Seed: s.Seed(), ConfigVersion: cfg.Version, Setup: wrong, Log: log})
	if err != nil {
		t.Logf("replaying with the wrong label was REFUSED (%v). Refusing is better than mismatching "+
			"and would mean the hazard is smaller than described, but this reports what happened "+
			"rather than what it hoped for", err)
		return
	}

	t.Logf("both replays ran and neither was refused. The only difference between them is a string " +
		"in the Setup's Label field, which no order refers to and no unit can see:")
	t.Logf("  Deploy's label : %q", right.Label)
	t.Logf("  caller's guess : %q", wrong.Label)
	t.Logf("  original       : %d ticks, %v (%v), hash %s",
		res.Ticks, res.Outcome.Kind, res.Outcome.Reason, res.HashString())
	t.Logf("  replay, right  : %d ticks, %v (%v), hash %s",
		gotRight.Ticks, gotRight.Outcome.Kind, gotRight.Outcome.Reason, gotRight.HashString())
	t.Logf("  replay, guess  : %d ticks, %v (%v), hash %s",
		gotWrong.Ticks, gotWrong.Outcome.Kind, gotWrong.Outcome.Reason, gotWrong.HashString())

	if gotWrong.HashString() == gotRight.HashString() {
		t.Logf("the two hashes AGREE, so Result.Hash does not fold the label in and this hazard is " +
			"not live. That contradicts an earlier finding of mine and is said here plainly.")
		return
	}
	t.Logf("the hashes DIFFER while tick count, outcome and reason are identical: every printed " +
		"number agrees and the hash does not. That is the whole hazard.")
}

// setupFromSession rebuilds the Setup a session fought with, from exported
// accessors only. Everything except Label comes from the frozen rosters and is
// exact; Label is Deploy's private format string.
func setupFromSession(s *battle.Session) battle.Setup {
	ra, rb := s.Roster(battle.SideA), s.Roster(battle.SideB)
	return battle.Setup{
		A:       ra.Units,
		B:       rb.Units,
		Leaders: append(append([]battle.Leader{}, ra.Leaders...), rb.Leaders...),
		Terrain: battle.TerrainOpen,
		Label:   fmt.Sprintf("%s vs %s", s.Attacker().Name, s.Defender().Name),
	}
}

// foughtSession runs one recorded session battle to a conclusion and hands back
// what a verifier would be given.
//
// Side A is told to hold, so the log is not empty: an empty log would prove nothing
// about any of this, and these tests are about orders once there are some.
func foughtSession(t *testing.T, cfg *config.Config, seed uint64, n int) (*battle.Session, *battle.Result, *battle.OrderLog) {
	t.Helper()
	return foughtSessionWithForces(t, cfg, seed, n, nil)
}

// foughtSessionWithForces is foughtSession with the force generation injectable, so
// a test can ask what a DIFFERENT derivation does without this file growing a second
// copy of handleStart's body.
//
// The default path is battleapi.SessionForces, WHICH IS THE FUNCTION handleStart
// calls, so the default cannot drift away from the thing it is a test of. This
// function used to hand-copy handleStart's three derivations inline with a comment
// saying it mirrored handleStart, and the copy is exactly why fixing the handler
// left the test unchanged and then passing for the wrong reason: the test agreed
// with a stale description of the handler rather than with the handler. Same failure
// shape as the token grep that reported "never calls Session.Command" against code
// that did, and the reason this is a parameter now.
func foughtSessionWithForces(t *testing.T, cfg *config.Config, seed uint64, n int,
	make func() ([]battle.Unit, []battle.Unit, []battle.Leader)) (*battle.Session, *battle.Result, *battle.OrderLog) {
	t.Helper()
	var a, b []battle.Unit
	var leaders []battle.Leader
	var err error
	if make == nil {
		a, b, leaders, err = battleapi.SessionForces(cfg, seed, n)
	} else {
		a, b, leaders = make()
	}
	if err != nil {
		t.Fatalf("building the forces: %v", err)
	}

	s, err := battle.NewSession(cfg, "session-save",
		battle.PartyRef{ID: "party-a", Name: "Warlord's Column"},
		battle.PartyRef{ID: "party-b", Name: "Riverside Militia"}, 0, seed)
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	log, err := s.Record(1<<20, "session-store")
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	orders, err := battle.NewOrders(cfg, battle.SideA, []battle.Group{{
		Order: battle.GroupOrder{Kind: battle.FormationLine, Order: battle.OrderFormationHold},
		Units: idsOf(a),
	}})
	if err != nil {
		t.Fatalf("standing orders: %v", err)
	}
	cmder, err := orders.Commander()
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	if err := s.Command(cmder); err != nil {
		t.Fatalf("Command: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	for i := 0; i < 400 && s.Phase() != battle.PhaseResolved; i++ {
		if err := s.Advance(50); err != nil {
			t.Fatalf("running to a conclusion: %v", err)
		}
	}
	if s.Phase() != battle.PhaseResolved {
		t.Fatalf("the session did not resolve; phase %s", s.Phase())
	}
	if log.Truncated() {
		t.Fatalf("the log refused rows at a bound of a million; %d rows", log.Len())
	}
	return s, s.Result(), log
}
