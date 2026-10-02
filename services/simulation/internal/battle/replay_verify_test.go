package battle

import (
	"math"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// THE CHECK CAN FAIL, AND A FILE IS ENOUGH.
//
// The rest of replay_test.go proves that replays MATCH. This file covers the two
// halves of the feature that a suite of passing matches leaves open:
//
//  1. That the check is capable of reporting a mismatch at all. Every other test in
//     this package passes by finding two runs that agree, which is also what a
//     broken comparison would do: a checker that returned Match true unconditionally
//     would pass all of them. So TestVerifyReportsAMismatchWhenTheLogSaysSomethingElse
//     hands Verify a log that is valid, complete, and describes a battle one
//     unit-step different from the original, and requires the verdict to be MISMATCH
//     with a named difference. A verifier that has never been seen to fail is not
//     known to be able to fail.
//
//  2. That a log which has been through a file can be replayed from the file alone.
//     Record returns a Recording holding the Setup as a live value; a caller that
//     saves the log and comes back tomorrow has a []byte, a seed, and a balance
//     version. TestSeedAndLogAloneReproduceTheBattle keeps nothing else, rebuilds
//     the force from the seed the FILE carries, and requires the same result hash.
//     That is the brief's claim in its strictest form: on battle end, the log plus
//     the seed are sufficient to reproduce the battle.

// tamperNudge is how far the first order's DX is moved, in metres.
//
// It is a nanometre, and the size is the point rather than an accident. An order is
// a step that gets ADDED to a unit's position: commit does u.X += d.DX, and a unit's
// X is hundreds of metres from its start line, where one ULP of float64 is about
// 3e-14 m. A change to DX smaller than that is below the resolution of the number it
// is added to, so the sum comes out bit-identical and the battle is genuinely the
// same battle. Nudging by one ULP of 1.25, or by a picometre, produces a log whose
// digest differs and whose replayed battle is indistinguishable from the original.
//
// That is a limit on what the simulation can REPRESENT, not on whether it is
// deterministic: the same log always produces the same bits. It is also why this
// file checks the two levels separately. The order log's digest reads the exact bit
// pattern of DX and does notice a one ULP edit, which is asserted in tamperFirstOrder
// below. The RESULT hash can only report a difference the engine's own arithmetic
// carried through to a unit's final state, so proving the battle comparison can fail
// needs a nudge the engine can actually feel.
//
// The alternative, and the reason this is worth stating rather than leaving to a
// reader to discover: a test that nudged by one ULP and asserted a mismatch would
// have failed, and the failure would have looked like a broken replay path rather
// than like a question about float resolution.
const tamperNudge = 1e-9

// tamperFirstOrder returns a copy of src with the first row's DX moved by
// tamperNudge metres.
//
// The copy is built through Append rather than by editing encoded bytes, on purpose.
// An edited byte string is caught by the log digest, and that refusal is
// TestDecodeOrderLogRejectsTamperedAndBrokenFiles. What is wanted here is the harder
// case: a log that is entirely self-consistent, whose digest matches its own rows,
// and which describes a battle that is not the one that was fought. Nothing but the
// result comparison can catch that one.
func tamperFirstOrder(t *testing.T, src *OrderLog) *OrderLog {
	t.Helper()
	rows := src.Rows()
	if len(rows) == 0 {
		t.Fatal("the log is empty, so there is no order to tamper with")
	}
	out := NewOrderLog(0)
	// The roster fingerprint is carried over, so nothing refuses this log on
	// identity grounds. It is a legitimate log of a legitimate battle with one
	// number changed.
	out.SetRoster(src.RosterHash())
	for i, row := range rows {
		if i == 0 {
			row.DX += tamperNudge
			if floatBits(row.DX) == floatBits(rows[0].DX) {
				t.Fatalf("row 0's dx did not move when it was nudged by %g: %g", tamperNudge, row.DX)
			}
		}
		if _, ok := out.Append(row); !ok {
			t.Fatalf("the copy refused row %d, which is unbounded and should not happen", i)
		}
	}
	if out.Hash() == src.Hash() {
		t.Fatal("the tampered log's digest equals the original's, so it is not a different log")
	}
	// The log level reads exact bits, so even a change too small for the engine to
	// feel is caught here. This is the property OrderLog.Hash claims for itself and
	// it is asserted here rather than assumed, because the mismatch below depends on
	// a nudge being LARGE ENOUGH and a reader has no other way to tell the two cases
	// apart.
	exact := NewOrderLog(0)
	exact.SetRoster(src.RosterHash())
	for i, row := range rows {
		if i == 0 {
			row.DX = math.Nextafter(row.DX, math.Inf(1))
		}
		exact.Append(row)
	}
	if exact.Hash() == src.Hash() {
		t.Error("the log digest did not change for a one ULP edit to dx; the digest is not reading " +
			"the exact bits of an order, so an edited file could go unnoticed")
	}
	return out
}

// TestVerifyReportsAMismatchWhenTheLogSaysSomethingElse is the test that makes every
// other determinism test in this package mean something.
//
// It runs the same recording twice: once with the log as recorded, which must
// match, and once with a log whose first order is a nanometre different, which must
// not. See tamperNudge for why the nudge is that size and why a smaller one would
// prove nothing about the comparison.
//
// The control half matters as much as the failing half. Without it, a Verify that
// always said MISMATCH would pass the interesting assertion here and fail everything
// else in this package; a Verify that always said MATCHED would pass this test's
// control half and be caught nowhere.
func TestVerifyReportsAMismatchWhenTheLogSaysSomethingElse(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 80808
	setup := replayForce(t, cfg, seed, replayTestUnits)

	original, rec, err := Record(cfg, seed, setup,
		&marchingCommander{side: SideA, step: 1.25, speakEvery: 2}, 0, "tamper-check")
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	if rec.Log.Len() == 0 {
		t.Fatal("the commander issued no orders, so there is nothing to tamper with")
	}

	// The control: the log as recorded reproduces the battle.
	control, err := Verify(cfg, rec, original)
	if err != nil {
		t.Fatalf("verifying the untampered recording: %v", err)
	}
	if !control.Match {
		t.Fatalf("the untampered recording did not reproduce its own battle, so a mismatch below "+
			"would prove nothing\n%s", control)
	}
	t.Logf("control matched: %s", control)

	// The finding: a complete, self-consistent log describing a different battle.
	tampered := &Recording{
		Seed:          rec.Seed,
		ConfigVersion: rec.ConfigVersion,
		Setup:         rec.Setup,
		Log:           tamperFirstOrder(t, rec.Log),
	}
	check, err := Verify(cfg, tampered, original)
	if err != nil {
		t.Fatalf("a %g m change in one order came back as an error rather than as a finding; "+
			"a check that cannot run is not a check that passed: %v", tamperNudge, err)
	}
	if check.Match {
		t.Errorf("a log whose first order moved by %g m still reported a match\n%s", tamperNudge, check)
	}
	if check.Want == check.Got {
		t.Errorf("the verdict is MISMATCH but both hashes read %s, so the verdict and the evidence disagree",
			check.Want)
	}
	if check.Diff == "" {
		t.Error("a mismatch reported no differing field, so a caller would have nothing to go on")
	}
	if check.Orders != tampered.Log.Len() {
		t.Errorf("the check reports %d orders but the log holds %d", check.Orders, tampered.Log.Len())
	}
	t.Logf("a %g m change in one order is reported as a mismatch: %s", tamperNudge, check)

	// The rendered verdict is what a harness reads, so the words in it matter as
	// much as the boolean.
	if s := check.String(); !strings.Contains(s, "MISMATCH") || !strings.Contains(s, check.Diff) {
		t.Errorf("the rendered verdict does not say what happened:\n%s", s)
	}
}

// TestSeedAndLogAloneReproduceTheBattle is the brief's requirement stated as a test:
// on battle end, the log plus the seed are enough to reproduce the battle.
//
// Everything else is deliberately thrown away. The Setup value the recording
// carried never crosses the boundary below; what crosses it is the encoded bytes and
// nothing else, and the force is rebuilt from the seed the FILE carries rather than
// from the caller's memory of it. A test that reused the original Setup would pass
// even if the seed were doing no work at all, because the Setup is what actually
// builds the roster.
func TestSeedAndLogAloneReproduceTheBattle(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 60607
	const n = replayTestUnits

	original, rec, data, err := recordAndEncode(t, cfg, seed, n,
		&marchingCommander{side: SideA, step: 1, speakEvery: 3})
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	t.Logf("recorded %d orders over %d ticks, outcome %s, hash %s",
		rec.Log.Len(), original.Ticks, original.Outcome.Kind, original.HashString())

	// What a caller actually keeps: the bytes. The seed is inside them.
	log, fileSeed, fileConfig, err := DecodeOrderLog(data)
	if err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if fileSeed != seed {
		t.Fatalf("the file carries seed %d, the battle ran under %d", fileSeed, seed)
	}
	if fileConfig != cfg.Version {
		t.Fatalf("the file carries balance version %q, the battle ran under %q", fileConfig, cfg.Version)
	}

	// The force is rebuilt from the file's seed. Nothing about the original Setup
	// is available here, which is the point: if the seed did not carry the roster
	// this could not be built at all, and if it built a DIFFERENT roster then
	// Replay's roster fingerprint would refuse the log rather than quietly fight
	// the wrong battle.
	rebuilt := replayForce(t, cfg, fileSeed, n)
	check, err := VerifyEncoded(cfg, data, rebuilt, original)
	if err != nil {
		t.Fatalf("replaying from the file: %v", err)
	}
	if !check.Match {
		t.Errorf("the seed and the log did not reproduce the battle\n%s", check)
	} else {
		t.Logf("seed %d plus %d logged orders reproduced the battle from a file: %s",
			fileSeed, log.Len(), check)
	}
}

// TestVerifyEncodedRefusesAFileItCannotTrust covers the file path's refusals, which
// are the reason VerifyEncoded exists rather than a caller assembling a Recording by
// hand.
//
// Each case must come back as an ERROR and not as a MISMATCH, because the two mean
// different things: a mismatch is a finding about a battle, and an error is a
// statement that there was no battle to check. Reporting a corrupt file as a
// mismatch would send a caller hunting for a determinism bug in the engine that is
// really a bad file.
func TestVerifyEncodedRefusesAFileItCannotTrust(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 31337
	const n = replayTestUnits

	original, rec, _, err := recordAndEncode(t, cfg, seed, n,
		&marchingCommander{side: SideB, step: 0.75, speakEvery: 2})
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	if rec.Log.Len() == 0 {
		t.Fatal("the commander issued no orders, so this file has nothing in it")
	}

	t.Run("a file that is not a log", func(t *testing.T) {
		_, err := VerifyEncoded(cfg, []byte("this is not an order log"), rec.Setup, original)
		if err == nil {
			t.Error("a file that does not parse was accepted")
		} else {
			t.Logf("refused: %v", err)
		}
	})

	t.Run("a force the log was not recorded against", func(t *testing.T) {
		// A different battle on the same seed: same units per side, different
		// roster, so every unit id in the log still resolves to a real unit. This is
		// the case an id range check cannot catch and the roster fingerprint exists
		// to catch.
		other := replayForce(t, cfg, seed, n+3)
		_, err := VerifyEncoded(cfg, mustEncode(t, rec.Log, seed, cfg.Version), other, original)
		if err == nil {
			t.Error("a log was replayed against a different force and produced a battle")
		} else if !strings.Contains(err.Error(), "fingerprints") {
			t.Errorf("the refusal does not name the roster as the problem: %v", err)
		} else {
			t.Logf("refused: %v", err)
		}
	})

	t.Run("a log recorded under another balance version", func(t *testing.T) {
		// The header carries the version the orders were computed under. Replay
		// refuses a config that does not match it, which is what stops a replay
		// under new balance data from producing a plausible what-if and calling it
		// a replay.
		_, err := VerifyEncoded(cfg, mustEncode(t, rec.Log, seed, "phase1-01-from-the-future"),
			rec.Setup, original)
		if err == nil {
			t.Error("a log from another balance version was replayed under this one")
		} else {
			t.Logf("refused: %v", err)
		}
	})
}

// recordAndEncode records a battle and encodes its log, which is the whole of what
// a caller keeps when it wants a battle it can check later.
func recordAndEncode(t *testing.T, cfg *config.Config, seed uint64, n int, cmd Commander) (*Result, *Recording, []byte, error) {
	t.Helper()
	original, rec, err := Record(cfg, seed, replayForce(t, cfg, seed, n), cmd, 0, "file")
	if err != nil {
		return nil, nil, nil, err
	}
	data, err := rec.Log.Encode(rec.Seed, rec.ConfigVersion)
	if err != nil {
		return nil, nil, nil, err
	}
	return original, rec, data, nil
}

// mustEncode encodes a log with an explicit version, for the case that needs a
// header which disagrees with the config it is replayed under.
func mustEncode(t *testing.T, log *OrderLog, seed uint64, configVersion string) []byte {
	t.Helper()
	data, err := log.Encode(seed, configVersion)
	if err != nil {
		t.Fatalf("encoding the order log: %v", err)
	}
	return data
}
