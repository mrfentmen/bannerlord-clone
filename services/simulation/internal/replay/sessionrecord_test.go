package replay

import (
	"encoding/json"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// A session's recorded log is not fingerprinted against the force it was issued for.
//
// WHAT THE FINGERPRINT IS FOR, IN THE CODE'S OWN WORDS
//
// `OrderLog.rosterHash` exists because unit ids are POSITIONAL. `newBattle`
// assigns them densely in slice order, so a battle with eight units a side and a
// battle with four have overlapping id ranges, and an order for unit 3 names a
// real unit in both. An id range check therefore cannot tell one battle's log from
// another's, so the roster is fingerprinted instead. Its own comment names the
// failure it prevents:
//
//   "Without this, replaying one battle's log against a different roster silently
//    produces a different battle that looks like a replay."
//
// `battle.Record` does it. `replay.go:404` is `log.SetRoster(rosterFingerprint(setup))`.
//
// `Session.Record` does not. `session.go:312` builds the log through
// `NewRecorder`, wraps the seam and returns. There is no `SetRoster` anywhere in
// it, and no other caller sets one: `grep -rn SetRoster` over the package finds
// the declaration, the one call in `Record`, and the read in `DecodeOrderLog`.
//
// And `Replay` only checks it when it is set — `replay.go:452` is
// `if want := log.RosterHash(); want != 0 {`. A zero fingerprint is treated as
// "nobody said", not as "this was never fingerprinted". So the guard is not
// failing loudly for session logs. It is absent, and its absence is spelled in a
// way that reads like permission.
//
// WHY THIS LANE FOUND IT AND WHY IT MATTERS HERE
//
// `Session.Record` is the only recording entry point the shipped game can reach.
// `internal/battleapi` runs sessions and nothing else runs them, and it is not
// calling `Record` yet (see apipath_test.go). So the one recording path the game
// will have is the one whose log cannot be tied to the force it was issued
// against.
//
// The cost is not a crash and not a wrong hash. It is that the ONE check that can
// say "these orders are about a different battle" is missing, and the thing that
// remains — the result hash — is the thing that was in question. A replay that
// lands on the wrong force still produces a confident-looking battle with a
// plausible tick count and plausible casualties. Nothing in the pipeline objects.
//
// The fix is one line, in `Session.Record`, and it is agent3's file.

// TestASessionRecordingIsFingerprintedAgainstItsForce is the absence, asserted.
//
// It reads the encoded header rather than calling SetRoster itself, because the
// value in a file is the value a reader will meet.
func TestASessionRecordingIsFingerprintedAgainstItsForce(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 424242

	log, res := recordedSessionBattle(t, cfg, seed, 12)

	encoded, err := log.Encode(res.Seed, cfg.Version)
	if err != nil {
		t.Fatalf("encoding the session's order log: %v", err)
	}
	got := decodeRosterHash(t, encoded)

	// The same recording path, for comparison. Not a control bolted on: it is the
	// only way to say whether the zero is a property of sessions or of this log.
	// This is battle.Record rather than this package's Record, because the frame
	// recording is a different format entirely and its header has no roster field.
	sameSetup := evenForce(t, cfg, seed, 12)
	_, orderRec, err := battle.Record(cfg, seed, sameSetup, nil, 1<<20, "compare")
	if err != nil {
		t.Fatalf("battle.Record on the same 12 v 12: %v", err)
	}
	viaRecordBytes, err := orderRec.Log.Encode(orderRec.Seed, cfg.Version)
	if err != nil {
		t.Fatalf("encoding battle.Record's log: %v", err)
	}
	viaRecordHash := decodeRosterHash(t, viaRecordBytes)

	t.Logf("battle.Record  on the same 12 v 12: roster_hash %016x", viaRecordHash)
	t.Logf("Session.Record on the same 12 v 12: roster_hash %016x", got)

	if got == 0 {
		t.Errorf("a session-recorded order log carries no roster fingerprint: the header says "+
			"roster_hash 0, against %016x from battle.Record on the same battle.\n"+
			"  session.go:312 (Session.Record) builds the log through NewRecorder and returns, and "+
			"never calls SetRoster. replay.go:452 only checks the fingerprint when it is non-zero — "+
			"`if want := log.RosterHash(); want != 0` — so this is not a guard failing loudly, it is "+
			"the guard absent, and a zero is spelled in a way that reads as permission.\n"+
			"  The comment on OrderLog.rosterHash names the failure this prevents: unit ids are "+
			"positional, so \"replaying one battle's log against a different roster silently produces "+
			"a different battle that looks like a replay\". Session.Record is the only recording "+
			"entry point the shipped game can reach, since internal/battleapi runs sessions and "+
			"nothing else does.",
			viaRecordHash)
	}
}

// TestReplayingASessionLogOntoAnotherForceIsNotRefused is the consequence, and
// it is the half that matters.
//
// The first test proves a number is zero. This one proves what the zero buys: a
// log from a 12 v 12 session replayed onto a 13 v 13 force is accepted, produces a
// completely different battle, and reports no problem at any point.
func TestReplayingASessionLogOntoAnotherForceIsNotRefused(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 424242

	log, res := recordedSessionBattle(t, cfg, seed, 12)

	// A different force: one more man a side, so the ids the log's rows name are
	// all still in range. This is the case the fingerprint exists for and the
	// narrowest version of it.
	other := evenForce(t, cfg, seed+1, 13)

	wrong := &battle.Recording{
		Seed:          res.Seed,
		ConfigVersion: cfg.Version,
		Setup:         other,
		Log:           log,
	}
	replayed, err := battle.Replay(cfg, wrong)
	if err == nil {
		t.Errorf("a session's order log was replayed onto a different force — 13 v 13 rather than "+
			"12 v 12 — and accepted.\n"+
			"  the log's rows name unit ids 0 to %d; the 13 v 13 field has %d units, so every id is "+
			"in range and no id check can object. That is the whole reason the roster is "+
			"fingerprinted.\n"+
			"  recorded battle : %d ticks, %v (%v), hash %s\n"+
			"  replayed on 13v13: %d ticks, %v (%v), hash %s\n"+
			"  Nothing refused it and nothing objected. This is precisely what OrderLog.rosterHash's "+
			"own comment says it exists to prevent, and it is what a session-recorded log gets.",
			2*12-1, len(other.A)+len(other.B),
			res.Ticks, res.Outcome.Kind, res.Outcome.Reason, res.HashString(),
			replayed.Ticks, replayed.Outcome.Kind, replayed.Outcome.Reason, replayed.HashString())
	} else {
		t.Logf("replaying a session log onto a different force was refused: %v", err)
	}
}

// decodeRosterHash reads roster_hash out of an encoded log's header.
func decodeRosterHash(t *testing.T, encoded []byte) uint64 {
	t.Helper()
	line := firstLine(t, encoded)
	var hdr struct {
		Kind       string `json:"kind"`
		RosterHash uint64 `json:"roster_hash"`
		Rows       int    `json:"rows"`
	}
	if err := json.Unmarshal(line, &hdr); err != nil {
		t.Fatalf("decoding the log header %q: %v", line, err)
	}
	if hdr.Kind != "order_log" {
		t.Fatalf("the first line of an encoded log is %q, not an order log header", hdr.Kind)
	}
	return hdr.RosterHash
}

// recordedSessionBattle fights one session battle with the recorder attached and
// returns its log and its result.
//
// Side A is told to hold, so the log is not empty: an empty log would prove
// nothing about a fingerprint, and the point of these tests is what happens to
// orders once there are some.
func recordedSessionBattle(t *testing.T, cfg *config.Config, seed uint64, n int) (*battle.OrderLog, *battle.Result) {
	t.Helper()
	s, a, b, leaders := newPlayerSession(t, cfg, seed, n)
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	log, err := s.Record(1<<20, "session-fingerprint")
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
		t.Fatalf("the session did not resolve in 20000 ticks; phase %s", s.Phase())
	}
	if log.Len() == 0 {
		t.Fatalf("the session's log is empty after %d ticks with side A told to hold. A test about "+
			"orders in a log cannot be run against a log with no orders in it", s.Tick())
	}
	if log.Truncated() {
		t.Fatalf("the log refused rows at a bound of a million; %d rows", log.Len())
	}
	t.Logf("%d v %d session, %d ticks, %d order rows recorded", n, n, s.Tick(), log.Len())
	return log, s.Result()
}

// firstLine is the header line of an encoded log.
func firstLine(t *testing.T, encoded []byte) []byte {
	t.Helper()
	for i, c := range encoded {
		if c == '\n' {
			return encoded[:i]
		}
	}
	t.Fatalf("an encoded log of %d bytes has no newline in it, so it has no header line", len(encoded))
	return nil
}
