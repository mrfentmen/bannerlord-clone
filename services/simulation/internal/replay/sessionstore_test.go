package replay

import (
	"fmt"
	"testing"

	"mbclone/simulation/internal/battle"
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

	s, res, log := foughtSession(t, cfg, seed, 12, oneSeedBothSides)

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
// built the way `internal/battleapi/handleStart` builds one.
//
// This is the failure the next person to wire recording into the server will hit.
func TestASessionBuiltTheWayTheShippedAPIDoesItCannotBeVerified(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 5150
	store := battle.OpenBattleStore(t.TempDir())

	s, res, log := foughtSession(t, cfg, seed, 12, theWayTheAPIDoesIt)

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
		t.Logf("verifying was refused outright rather than mismatched: %v", err)
		return
	}
	if check.Match {
		t.Logf("it MATCHED. The record format's single-seed regeneration reproduced a battle whose " +
			"forces were generated from three different derivations of one seed, which means " +
			"GenerateForce's per-side substreams absorb the difference and this is not the " +
			"obstacle I thought it was.")
		return
	}
	t.Errorf("a session battle built the way internal/battleapi builds one cannot be verified from "+
		"the battle store it was saved to.\n"+
		"  %v\n"+
		"  The store regenerates both sides from the ONE seed it recorded, through Script.Setup, "+
		"using GenerateForce's per-side substreams. handleStart generates side A from seed, side B "+
		"from seed^0x9E3779B97F4A7C15 and the two leader sets from seed^0x12345 and seed^0x67890. "+
		"Three derivations, one recorded seed.\n"+
		"  It fails loudly, which is the mercy: the store prints the tick count that moved. The "+
		"obstacle is that whoever wires Session.Record and BattleStore.Save into the server has to "+
		"change the seed convention or the record format, and nothing says so until they do.",
		check)
}

// TestASessionBattleWithTheWrongLabelFailsToVerify is the label hazard, made real.
//
// The label used is not nonsense. It is the shape a caller would naturally write
// from what the API publishes: the state response's two sides carry `party_name`,
// and a caller assembling a Setup from a session has exactly those two strings.
func TestASessionBattleWithTheWrongLabelFailsToVerify(t *testing.T) {
	cfg := loadConfig(t)
	s, res, log := foughtSession(t, cfg, 5150, 12, oneSeedBothSides)

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

// howSidesAreSeeded is how one session's two forces were generated.
type howSidesAreSeeded int

const (
	// oneSeedBothSides is the record format's convention: one seed for both sides,
	// distinguished by GenerateForce's per-side substreams.
	oneSeedBothSides howSidesAreSeeded = iota
	// theWayTheAPIDoesIt is internal/battleapi/handleStart: three derivations of
	// one seed, one per side and one per leader set.
	theWayTheAPIDoesIt
)

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
func foughtSession(t *testing.T, cfg *config.Config, seed uint64, n int, how howSidesAreSeeded) (*battle.Session, *battle.Result, *battle.OrderLog) {
	t.Helper()
	seedA, seedB := seed, seed
	if how == theWayTheAPIDoesIt {
		seedB = seed ^ 0x9E3779B97F4A7C15
	}
	a, err := battle.GenerateForce(cfg, seedA, battle.SideA, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side A: %v", err)
	}
	b, err := battle.GenerateForce(cfg, seedB, battle.SideB, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side B: %v", err)
	}
	leaders := append(
		battle.GenerateLeaders(cfg, seed^0x12345, battle.SideA, 1, 0.7),
		battle.GenerateLeaders(cfg, seed^0x67890, battle.SideB, 1, 0.7)...)

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
