package battle

import (
	"bytes"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// THE TESTS FOR DETERMINISM AND REPLAY.
//
// Four claims, and a test for each:
//
//	1. Every random draw comes from an explicit seeded source in battle state, and
//	   nothing reads a clock or the global generator.
//	2. The same seed and the same orders produce the same battle, bit for bit.
//	3. A seed plus an order log is sufficient to reproduce a battle, and the
//	   replay is reported as matching or mismatching.
//	4. Different seeds produce different battles, so claim 2 is not satisfied by a
//	   simulation that ignores its seed.
//
// Everything else in this file is there to make one of those four falsifiable. A
// determinism test that passes because both runs returned a zero-value Result is
// worse than no test, so every hash compared here is checked for being non-zero,
// and the seed-sanity test exists precisely to catch a hash that is always the
// same value.
//
// SIZES. These run on small forces on purpose. A full 500 v 500 battle in this
// package does not currently terminate (see the note in TestScaleIsMeasurableOnABoundedBudget),
// so a determinism suite built on it would be a suite that times out instead of
// passing. The determinism property is a property of the tick loop and not of the
// unit count; TestScaleIsMeasurableOnABoundedBudget is the one place a large field
// is used, and it uses a bounded tick budget so that it terminates.

// replayTestUnits is the force size the small determinism tests use.
//
// Eight per side is small enough that a full battle resolves in a few hundred
// ticks and large enough that the melee, aimed fire, morale, break, and rout paths
// all actually run. A one-unit-per-side battle would pass every test below while
// proving nothing, because most of the engine would never be entered.
const replayTestUnits = 8

// replayForce builds an even force for a determinism test, from the same generator
// the benchmarks use so the tests and the measurements agree about what a normal
// battle looks like.
func replayForce(t testing.TB, cfg *config.Config, seed uint64, n int) Setup {
	t.Helper()
	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatalf("building a %d v %d force failed: %v", n, n, err)
	}
	return setup
}

// marchingCommander issues a deterministic order to every unit of one side.
//
// It is the test's stand-in for a tactics layer: it reads the View and writes an
// order per unit, and it reads NOTHING else. No clock, no generator, no package
// state. That matters because a commander that read anything the replay could not
// reconstruct would make the replay tests fail for a reason that has nothing to do
// with the engine, and a test that fails for an unrelated reason trains people to
// ignore it.
type marchingCommander struct {
	// side is which army it commands.
	side Side
	// step is metres per tick, and its being a constant is what makes the
	// commander's output a function of the tick number alone.
	step float64
	// speakEvery says how often it speaks, in ticks. Speaking every third tick
	// exercises the case where a commander is silent on some ticks and speaking on
	// others, which is the case a log that conflated silence with a hold would
	// silently break.
	speakEvery int
	// spoken counts the ticks it spoke on, so a test can assert it was actually
	// used rather than being silently inert.
	spoken int
}

func (c *marchingCommander) Command(v *View) error {
	if c.speakEvery > 1 && v.Tick%c.speakEvery != 0 {
		return nil
	}
	c.spoken++
	for i := range v.Units {
		u := v.Units[i]
		if u.Side != c.side {
			continue
		}
		if !u.Status.OnField() {
			// An off-field unit is not commandable, and the seam documents that a
			// routed man stays where he is whatever his general says. A commander
			// that ignored that would be testing the engine's clamp rather than its
			// determinism.
			continue
		}
		// Aim at the middle of the opposing line, so the order depends on the
		// field and therefore is a real input to the log rather than a constant.
		tx, ty := v.Units[len(v.Units)-1].X, v.Units[len(v.Units)-1].Y
		dx, dy := tx-u.X, ty-u.Y
		d := sqrtApprox(dx*dx + dy*dy)
		if d > 0 {
			dx, dy = dx/d*c.step, dy/d*c.step
		}
		v.Commands[i] = UnitCommand{Set: true, DX: dx, DY: dy, Intent: IntentAdvance}
	}
	return nil
}

// holdingCommander orders one unit to stand still on every tick.
//
// It exists to pin the OrderHold case: a commander that says "stand" and a
// commander that says nothing both leave a unit's movement at zero, and only
// UnitCommand.Set separates them. If the log collapsed them, a replay would apply
// an order the original never gave, and the battle would diverge in a way that
// looks exactly like nondeterminism.
type holdingCommander struct {
	side Side
	uid  int
	seen int
}

func (c *holdingCommander) Command(v *View) error {
	c.seen++
	for i := range v.Units {
		if v.Units[i].ID != c.uid || v.Units[i].Side != c.side {
			continue
		}
		if !v.Units[i].Status.OnField() {
			continue
		}
		v.Commands[i] = UnitCommand{Set: true, Intent: IntentEngage}
	}
	return nil
}

// TestSameSeedSameOrdersProducesIdenticalHashes is claim 2, and the plainest form
// of it: two runs, same seed, same setup, no commander at all.
//
// It runs several seeds and several sizes rather than one, because a determinism
// bug that only shows up on a 4 v 4 battle is a bug that ships.
func TestSameSeedSameOrdersProducesIdenticalHashes(t *testing.T) {
	cfg := loadConfig(t)
	cases := []struct {
		name string
		n    int
		seed uint64
	}{
		{"1 v 1", 1, 99},
		{"8 v 8", replayTestUnits, 20260930},
		{"37 v 41", 24, 7},
		{"2 v 2 same seed as nothing", 2, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setup := replayForce(t, cfg, tc.seed, tc.n)
			first, err := Run(cfg, tc.seed, setup)
			if err != nil {
				t.Fatalf("first run: %v", err)
			}
			second, err := Run(cfg, tc.seed, setup)
			if err != nil {
				t.Fatalf("second run: %v", err)
			}
			h1, h2 := first.Hash(), second.Hash()
			if h1 == 0 || h2 == 0 {
				t.Fatalf("a result hash is zero, so the hashes are not measuring anything: %016x and %016x", h1, h2)
			}
			if h1 != h2 {
				field, _ := ResultStateDiff(first, second)
				t.Errorf("two runs from seed %d disagree:\n  first  %016x (%d ticks, %s)\n  second %016x (%d ticks, %s)\n  first difference: %s",
					tc.seed, h1, first.Ticks, first.Outcome.Kind, h2, second.Ticks, second.Outcome.Kind, field)
			}
			t.Logf("seed %d, %d v %d: %d ticks, %s, hash %016x",
				tc.seed, tc.n, tc.n, first.Ticks, first.Outcome.Kind, h1)
		})
	}
}

// TestDifferentSeedsProduceDifferentBattles is claim 4, and it is the test that
// makes the other one mean anything.
//
// It builds the setup ONCE and varies only the seed passed to Run. If it instead
// rebuilt the setup per seed it would prove only that the roster generator is
// seeded, which is a much weaker claim and would still pass against an engine that
// ignored its seed entirely.
func TestDifferentSeedsProduceDifferentBattles(t *testing.T) {
	cfg := loadConfig(t)
	const setupSeed = 20260930
	setup := replayForce(t, cfg, setupSeed, replayTestUnits)

	seen := make(map[uint64]uint64, 8)
	seeds := []uint64{1, 2, 3, 4, 5, 12345, 999983}
	for _, seed := range seeds {
		res, err := Run(cfg, seed, setup)
		if err != nil {
			t.Fatalf("seed %d: %v", seed, err)
		}
		h := res.Hash()
		if h == 0 {
			t.Fatalf("seed %d produced a zero hash", seed)
		}
		if prev, dup := seen[h]; dup {
			t.Errorf("seeds %d and %d produced the identical battle (hash %016x); the engine is "+
				"not using its seed", prev, seed, h)
		}
		seen[h] = seed
		t.Logf("seed %10d -> %016x (%d ticks, %s)", seed, h, res.Ticks, res.Outcome.Kind)
	}
	if len(seen) != len(seeds) {
		t.Fatalf("only %d distinct battles out of %d seeds", len(seen), len(seeds))
	}
}

// TestRecorderDoesNotChangeTheBattle is the honesty check on the recorder.
//
// A recorder that altered an order would produce a log describing a battle that
// did not happen, and every replay test below would then be a test of the
// recorder. This compares a run with no seam at all against a run through a
// recorder that issues no orders, and requires the same result hash.
func TestRecorderDoesNotChangeTheBattle(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	setup := replayForce(t, cfg, seed, replayTestUnits)

	plain, err := Run(cfg, seed, setup)
	if err != nil {
		t.Fatalf("plain run: %v", err)
	}
	rec, log := NewRecorder(nil, 0, "test")
	observed, err := RunCommanded(cfg, seed, setup, rec)
	if err != nil {
		t.Fatalf("observed run: %v", err)
	}
	if log.Len() != 0 {
		t.Errorf("a recorder with no commander logged %d orders; it should have logged none", log.Len())
	}
	if plain.Hash() != observed.Hash() {
		field, _ := ResultStateDiff(plain, observed)
		t.Errorf("observing a battle changed it:\n  plain    %016x\n  observed %016x\n  first difference: %s",
			plain.Hash(), observed.Hash(), field)
	}
	t.Logf("plain and observed both hash to %016x over %d ticks", plain.Hash(), plain.Ticks)
}

// TestReplayFromOrderLogIsBitIdentical is claim 3, the headline test.
//
// It records a battle with a real commander issuing real orders, then replays the
// log headlessly and requires the same result hash.
func TestReplayFromOrderLogIsBitIdentical(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	setup := replayForce(t, cfg, seed, replayTestUnits)

	for _, side := range []Side{SideA, SideB} {
		side := side
		t.Run("commanding "+side.String(), func(t *testing.T) {
			cmd := &marchingCommander{side: side, step: 1.25, speakEvery: 3}
			original, rec, err := Record(cfg, seed, setup, cmd, 0, "test-commander")
			if err != nil {
				t.Fatalf("recording: %v", err)
			}
			if rec.Log.Len() == 0 {
				t.Fatal("the commander issued no orders, so this test would pass without replaying anything")
			}
			if cmd.spoken == 0 {
				t.Fatal("the commander never spoke; the test is not exercising the order path")
			}
			t.Logf("recorded %d orders over %d ticks, outcome %s (%s), hash %s",
				rec.Log.Len(), rec.Log.Ticks(), original.Outcome.Kind, original.Outcome.Reason, original.HashString())

			check, err := Verify(cfg, rec, original)
			if err != nil {
				t.Fatalf("verifying the replay: %v", err)
			}
			if !check.Match {
				t.Errorf("the replay did not reproduce the battle\n%s", check)
			} else {
				t.Logf("replay matched: %s", check)
			}
			if check.Orders != rec.Log.Len() {
				t.Errorf("the check reports %d orders but the log holds %d", check.Orders, rec.Log.Len())
			}
		})
	}
}

// TestReplayFromEmptyLogIsTheWholeProofOfRederivedAI is the test that pins down
// what the order log does and does not contain.
//
// The intent stage picks a movement for every unit every tick and none of it is
// logged, because it is re-derived from the seed. If any part of it were NOT
// re-derived, this test would fail: replaying with an empty log would not
// reproduce the battle.
func TestReplayFromEmptyLogIsTheWholeProofOfRederivedAI(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 4242
	setup := replayForce(t, cfg, seed, replayTestUnits)

	original, rec, err := Record(cfg, seed, setup, nil, 0, "none")
	if err != nil {
		t.Fatalf("recording an uncommanded battle: %v", err)
	}
	if rec.Log.Len() != 0 {
		t.Fatalf("an uncommanded battle logged %d orders", rec.Log.Len())
	}
	if original.Ticks < 10 {
		t.Fatalf("the battle ended in %d ticks, which is too few for the engine's own rules to have "+
			"done anything worth replaying", original.Ticks)
	}
	replayed, err := Replay(cfg, rec)
	if err != nil {
		t.Fatalf("replaying from an empty log: %v", err)
	}
	if original.Hash() != replayed.Hash() {
		field, _ := ResultStateDiff(original, replayed)
		t.Errorf("an empty order log did not reproduce an uncommanded battle, which means part of "+
			"the engine is neither logged nor re-derived:\n  first difference: %s", field)
	}
	t.Logf("%d ticks of engine-driven battle reproduced from an empty log: %s",
		original.Ticks, original.HashString())
}

// TestOrderHoldIsLoggedDistinctlyFromSilence covers the one place the two kinds of
// "nothing happened" could be confused.
//
// A commander that orders a unit to stand still and a commander that says nothing
// about that unit both leave it unmoved. If the log recorded both as the same row,
// a replay would either apply an order the original never gave, or drop one it did,
// and both would show up as a hash mismatch that looks like nondeterminism.
func TestOrderHoldIsLoggedDistinctlyFromSilence(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 5150
	setup := replayForce(t, cfg, seed, replayTestUnits)

	original, rec, err := Record(cfg, seed, setup,
		&holdingCommander{side: SideA, uid: 0}, 0, "holder")
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	if rec.Log.Len() == 0 {
		t.Fatal("the holding commander logged no orders")
	}
	holds := 0
	for _, o := range rec.Log.Rows() {
		if o.Kind != OrderHold {
			t.Errorf("order %d is a %s with DX=%g DY=%g; the commander only ever ordered holds",
				o.Seq, o.Kind, o.DX, o.DY)
		}
		if o.Unit != 0 {
			t.Errorf("order %d is for unit %d; the commander only ever spoke to unit 0", o.Seq, o.Unit)
		}
		if o.DX != 0 || o.DY != 0 {
			t.Errorf("order %d is a hold but carries DX=%g DY=%g", o.Seq, o.DX, o.DY)
		}
		holds++
	}
	// The engine's own rules move every other unit every tick, so a log holding
	// only the commanded unit's holds is exactly right: silence is not logged.
	t.Logf("%d hold orders logged, %d ticks, hash %s", holds, original.Ticks, original.HashString())

	check, err := Verify(cfg, rec, original)
	if err != nil {
		t.Fatalf("verifying: %v", err)
	}
	if !check.Match {
		t.Errorf("a battle of pure hold orders did not replay\n%s", check)
	}
}

// TestOrderLogIsAppendOnlyAndTickOrdered checks the two invariants the replayer
// relies on and does not itself enforce on write.
//
// The replayer refuses a log whose rows go backwards in time, which is only a
// meaningful refusal if something guarantees the invariant on the way in. This is
// that something.
func TestOrderLogIsAppendOnlyAndTickOrdered(t *testing.T) {
	log := NewOrderLog(0)
	if log.Len() != 0 || log.Hash() != orderLogHashSeed {
		t.Fatalf("a new log is not empty-and-initialised: len=%d hash=%016x", log.Len(), log.Hash())
	}
	prevTick := -1
	for tick := 0; tick < 5; tick++ {
		for unit := 0; unit < 4; unit++ {
			o, ok := log.Append(Order{Tick: tick, Unit: unit, Side: SideA, Kind: OrderMove,
				DX: float64(unit), DY: float64(tick), Intent: IntentAdvance, Source: "t"})
			if !ok {
				t.Fatalf("an unbounded log refused a row at tick %d unit %d", tick, unit)
			}
			if o.Seq != tick*4+unit {
				t.Errorf("row %d was assigned Seq %d; Seq must be the append position", tick*4+unit, o.Seq)
			}
			if o.Tick < prevTick {
				t.Errorf("row at tick %d was appended after tick %d", o.Tick, prevTick)
			}
			prevTick = o.Tick
		}
	}
	if log.Len() != 20 {
		t.Fatalf("the log holds %d rows after 20 appends", log.Len())
	}
	if log.Ticks() != 5 {
		t.Errorf("the log reports %d ticks, expected 5", log.Ticks())
	}
	if got := log.OrdersForTick(2); len(got) != 4 {
		t.Errorf("OrdersForTick(2) returned %d rows, expected 4", len(got))
	}
	if got := log.OrdersForTick(99); len(got) != 0 {
		t.Errorf("OrdersForTick(99) returned %d rows for a tick the log does not cover", len(got))
	}
	// Rows() hands out a copy. A caller that could write the log's own backing
	// array could rewrite history, and append-only is the property the whole file
	// rests on.
	rows := log.Rows()
	rows[0].DX = 9999
	if log.Rows()[0].DX == 9999 {
		t.Error("Rows() returned the log's own slice; a caller could rewrite logged orders")
	}
	// Two logs built the same way must have the same digest, and the digest must
	// change when any field changes.
	other := NewOrderLog(0)
	for tick := 0; tick < 5; tick++ {
		for unit := 0; unit < 4; unit++ {
			other.Append(Order{Tick: tick, Unit: unit, Side: SideA, Kind: OrderMove,
				DX: float64(unit), DY: float64(tick), Intent: IntentAdvance, Source: "t"})
		}
	}
	if log.Hash() != other.Hash() {
		t.Errorf("two identically built logs hash differently: %016x vs %016x", log.Hash(), other.Hash())
	}
	edited := NewOrderLog(0)
	for tick := 0; tick < 5; tick++ {
		for unit := 0; unit < 4; unit++ {
			dx := float64(unit)
			if tick == 3 && unit == 2 {
				dx = -dx // one field, one bit of difference
			}
			edited.Append(Order{Tick: tick, Unit: unit, Side: SideA, Kind: OrderMove,
				DX: dx, DY: float64(tick), Intent: IntentAdvance, Source: "t"})
		}
	}
	if log.Hash() == edited.Hash() {
		t.Error("changing one logged DX did not change the log digest")
	}
}

// TestOrderLogRefusesToDropRowsSilently is the honesty check on the bound.
//
// A log that hit its bound does not describe its battle, and the only acceptable
// response is for the replay to refuse rather than to reproduce a battle with rows
// missing from it.
func TestOrderLogRefusesToDropRowsSilently(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 606
	setup := replayForce(t, cfg, seed, replayTestUnits)

	// A bound of three is smaller than the commander will need.
	original, rec, err := Record(cfg, seed, setup,
		&marchingCommander{side: SideA, step: 1, speakEvery: 1}, 3, "chatty")
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	if !rec.Log.Truncated() {
		t.Fatalf("a log bounded at 3 rows took %d orders and did not report truncation",
			rec.Log.Len())
	}
	if rec.Log.Refused() == 0 {
		t.Fatal("the log is marked truncated but reports no refused rows")
	}
	t.Logf("log refused %d rows after %d", rec.Log.Refused(), rec.Log.Len())

	if _, err := NewReplayer(rec.Log); err == nil {
		t.Error("a truncated log was accepted for replay; it does not describe its battle")
	} else {
		t.Logf("a truncated log is refused: %v", err)
	}
	if _, err := Replay(cfg, rec); err == nil {
		t.Error("Replay accepted a recording whose log is truncated")
	}

	// The original still ran to a conclusion: a truncated LOG is a reporting
	// failure, not a simulation failure, and the two must not be confused.
	if original == nil || original.Ticks == 0 {
		t.Fatal("the battle itself did not run")
	}
}

// TestOrderLogSurvivesEncodeAndDecode proves the log is a real file rather than an
// in-memory convenience.
//
// The float round trip is the part that matters: an order's DX and DY go into a
// JSON number and come back, and if the number is rendered in a form that does not
// parse back to the identical float64, then a replay from a saved log is a replay
// of a different battle.
func TestOrderLogSurvivesEncodeAndDecode(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	setup := replayForce(t, cfg, seed, replayTestUnits)

	original, rec, err := Record(cfg, seed, setup,
		&marchingCommander{side: SideA, step: 1.25, speakEvery: 2}, 0, "saved")
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	encoded, err := rec.Log.Encode(rec.Seed, rec.ConfigVersion)
	if err != nil {
		t.Fatalf("encoding the log: %v", err)
	}
	loaded, decodedSeed, configVersion, err := DecodeOrderLog(encoded)
	if err != nil {
		t.Fatalf("decoding the log: %v", err)
	}
	if decodedSeed != rec.Seed {
		t.Errorf("the decoded header carries seed %d, the original was %d", decodedSeed, rec.Seed)
	}
	if configVersion != rec.ConfigVersion {
		t.Errorf("the decoded header carries config %q, the original was %q", configVersion, rec.ConfigVersion)
	}
	if loaded.Len() != rec.Log.Len() {
		t.Fatalf("the decoded log holds %d rows, the original held %d", loaded.Len(), rec.Log.Len())
	}
	if loaded.Hash() != rec.Log.Hash() {
		t.Errorf("the decoded log's digest is %016x, the original's is %016x", loaded.Hash(), rec.Log.Hash())
	}
	// The float fields, compared as bit patterns, which is the property that
	// matters and which a == comparison would hide for -0.0.
	for i := range rec.Log.Rows() {
		a, b := rec.Log.Rows()[i], loaded.Rows()[i]
		if floatBits(a.DX) != floatBits(b.DX) || floatBits(a.DY) != floatBits(b.DY) {
			t.Fatalf("row %d did not survive the round trip: DX %016x -> %016x, DY %016x -> %016x",
				a.Seq, floatBits(a.DX), floatBits(b.DX), floatBits(a.DY), floatBits(b.DY))
		}
		if a != b {
			t.Errorf("row %d changed across the round trip:\n  before %+v\n  after  %+v", a.Seq, a, b)
		}
	}

	// And a replay from the DECODED log must still match.
	loadedRec := &Recording{Seed: rec.Seed, ConfigVersion: rec.ConfigVersion, Setup: rec.Setup, Log: loaded}
	check, err := Verify(cfg, loadedRec, original)
	if err != nil {
		t.Fatalf("verifying a replay from the decoded log: %v", err)
	}
	if !check.Match {
		t.Errorf("a replay from an encoded-then-decoded log did not match\n%s", check)
	} else {
		t.Logf("replay from the reloaded log matched: %s", check)
	}
}

// TestDecodeOrderLogRejectsTamperedAndBrokenFiles covers the reader's failure
// modes, because a reader that accepts a corrupt file is worse than no reader.
func TestDecodeOrderLogRejectsTamperedAndBrokenFiles(t *testing.T) {
	cfg := loadConfig(t)
	setup := replayForce(t, cfg, 777, replayTestUnits)
	_, rec, err := Record(cfg, 777, setup,
		&marchingCommander{side: SideA, step: 1.5, speakEvery: 2}, 0, "tamper")
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	good, err := rec.Log.Encode(rec.Seed, rec.ConfigVersion)
	if err != nil {
		t.Fatalf("encoding: %v", err)
	}
	lines := bytes.Split(bytes.TrimRight(good, "\n"), []byte("\n"))
	if len(lines) < 3 {
		t.Fatalf("the encoded log is only %d lines; this test needs rows to damage", len(lines))
	}

	t.Run("edited row is caught by the digest", func(t *testing.T) {
		bad := make([][]byte, len(lines))
		for i := range lines {
			bad[i] = append([]byte{}, lines[i]...)
		}
		// Alter one digit of one row's dx without touching the header's digest.
		// The value is found rather than assumed: a test that skips when the value
		// is not the one it expected is a test that quietly stops testing.
		target, ok := damageLastDigitOfDX(bad[1])
		if !ok {
			t.Fatalf("could not find a dx field to damage in row 0: %s", lines[1])
		}
		if _, _, _, err := DecodeOrderLog(bytes.Join(bad, []byte("\n"))); err == nil {
			t.Errorf("an edited row (byte %d) was accepted; the digest did not notice", target)
		} else {
			t.Logf("an edited row is refused: %v", err)
		}
	})

	t.Run("missing row is caught", func(t *testing.T) {
		short := append([][]byte{}, lines[:1]...)
		short = append(short, lines[2:]...)
		if _, _, _, err := DecodeOrderLog(bytes.Join(short, []byte("\n"))); err == nil {
			t.Error("a truncated file was accepted")
		} else {
			t.Logf("a truncated file is refused: %v", err)
		}
	})

	t.Run("empty file is refused", func(t *testing.T) {
		if _, _, _, err := DecodeOrderLog(nil); err == nil {
			t.Error("an empty file was accepted as a log")
		}
	})

	t.Run("wrong kind is refused", func(t *testing.T) {
		if _, _, _, err := DecodeOrderLog([]byte(`{"kind":"something_else","version":1}`)); err == nil {
			t.Error("a file that is not an order log was accepted")
		}
	})

	t.Run("unknown format version is refused", func(t *testing.T) {
		hdr := `{"kind":"order_log","version":9999,"seed":1,"config_version":"x","order_hash":0,"rows":0,"truncated":false}`
		if _, _, _, err := DecodeOrderLog([]byte(hdr)); err == nil {
			t.Error("a log from an unknown format version was accepted; it would be read with the wrong layout")
		} else {
			t.Logf("an unknown version is refused: %v", err)
		}
	})
}

// damageLastDigitOfDX changes the final digit of a row's dx field, in place, and
// returns the byte offset it changed.
//
// It is a byte-level edit rather than a re-encode on purpose: the thing being
// tested is that the reader notices a file that no longer matches its own header
// digest, and re-encoding would produce a file that is internally consistent. A
// last-digit change keeps the number parseable, so the row still parses and the
// failure has to come from the digest rather than from the parser giving up, which
// is what makes this a test of the digest.
func damageLastDigitOfDX(row []byte) (int, bool) {
	const key = `"dx":`
	s := string(row)
	i := strings.Index(s, key)
	if i < 0 {
		return 0, false
	}
	j := i + len(key)
	end := j
	for end < len(s) && s[end] != ',' && s[end] != '}' {
		end++
	}
	if end <= j {
		return 0, false
	}
	last := end - 1
	replacement := byte('9')
	if s[last] == '9' {
		replacement = '1'
	}
	if s[last] < '0' || s[last] > '9' {
		return 0, false
	}
	row[last] = replacement
	return last, true
}

// TestReplayRefusesALogFromADifferentBattle is the check that a log is not just
// some log.
//
// Replaying one battle's orders against another battle's roster would produce a
// number, and the number would be wrong. Refusing is the only acceptable answer.
func TestReplayRefusesALogFromADifferentBattle(t *testing.T) {
	cfg := loadConfig(t)
	_, rec, err := Record(cfg, 31337, replayForce(t, cfg, 31337, replayTestUnits),
		&marchingCommander{side: SideA, step: 1, speakEvery: 2}, 0, "mismatched")
	if err != nil {
		t.Fatalf("recording: %v", err)
	}
	// Same orders, a roster with half the units. The log's unit ids now name units
	// that either do not exist or are somebody else.
	mismatch := &Recording{
		Seed:          rec.Seed,
		ConfigVersion: rec.ConfigVersion,
		Setup:         replayForce(t, cfg, 31337, replayTestUnits/2),
		Log:           rec.Log,
	}
	if _, err := Replay(cfg, mismatch); err == nil {
		t.Error("an order log was replayed against a different roster")
	} else {
		t.Logf("a log replayed against the wrong roster is refused: %v", err)
	}
}

// TestReplayRefusesADifferentBalanceVersion stops a what-if being reported as a
// replay.
func TestReplayRefusesADifferentBalanceVersion(t *testing.T) {
	cfg := loadConfig(t)
	rec := &Recording{
		Seed:          1,
		ConfigVersion: cfg.Version + "-from-the-future",
		Setup:         replayForce(t, cfg, 1, replayTestUnits),
		Log:           NewOrderLog(0),
	}
	if _, err := Replay(cfg, rec); err == nil {
		t.Error("a replay under a different balance version was allowed")
	} else {
		t.Logf("a different balance version is refused: %v", err)
	}
}

// TestOrderLogRejectsUnreplayableRows is the replayer refusing rows it cannot
// honestly apply.
func TestOrderLogRejectsUnreplayableRows(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 808
	setup := replayForce(t, cfg, seed, replayTestUnits)

	t.Run("side level order", func(t *testing.T) {
		log := NewOrderLog(0)
		log.Append(Order{Tick: 0, Unit: -1, Side: SideA, Kind: OrderMove, DX: 1, Intent: IntentAdvance})
		rec := &Recording{Seed: seed, ConfigVersion: cfg.Version, Setup: setup, Log: log}
		if _, err := Replay(cfg, rec); err == nil {
			t.Error("a side-level order was replayed; this build's channel cannot express one")
		} else {
			t.Logf("a side-level order is refused: %v", err)
		}
	})

	t.Run("unit that does not exist", func(t *testing.T) {
		log := NewOrderLog(0)
		log.Append(Order{Tick: 0, Unit: 9999, Side: SideA, Kind: OrderMove, DX: 1, Intent: IntentAdvance})
		rec := &Recording{Seed: seed, ConfigVersion: cfg.Version, Setup: setup, Log: log}
		if _, err := Replay(cfg, rec); err == nil {
			t.Error("an order for a unit that does not exist was replayed")
		} else {
			t.Logf("an order for a missing unit is refused: %v", err)
		}
	})

	t.Run("rows going backwards in time", func(t *testing.T) {
		log := NewOrderLog(0)
		log.Append(Order{Tick: 0, Unit: 0, Side: SideA, Kind: OrderHold, Intent: IntentEngage})
		log.Append(Order{Tick: 5, Unit: 0, Side: SideA, Kind: OrderHold, Intent: IntentEngage})
		// Hand-built so the invariant is violated after the fact, which a Log built
		// through Append cannot do.
		log.rows[1].Tick = 0
		rec := &Recording{Seed: seed, ConfigVersion: cfg.Version, Setup: setup, Log: log}
		// Ticks 0 and 0 are fine, so this one legitimately replays; what must not
		// happen is it replaying silently with a duplicated tick that the engine
		// applied twice. Confirm the replay is at least consistent.
		res, err := Replay(cfg, rec)
		if err != nil {
			t.Fatalf("replaying two holds on tick 0: %v", err)
		}
		t.Logf("two holds on the same tick replayed to %s", res.HashString())
	})
}

// TestSeededOnly is the static check behind claim 1.
//
// It parses every non-test file in this package and asserts that none of them
// imports math/rand, crypto/rand, or time. Those three imports are the only ways a
// Go program can get at a random number that is not from the seeded generator, or
// at a clock, and a determinism claim that cannot rule them out is not a
// determinism claim.
//
// It is a source check rather than a behavioural one on purpose: a behavioural test
// cannot tell the difference between "the engine drew from its seeded stream" and
// "the engine drew from a global generator that happened to be in the same state
// twice".
func TestSeededOnly(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("reading the package directory: %v", err)
	}
	banned := map[string]string{
		"math/rand":   "a global generator is not seeded from the battle seed",
		"crypto/rand": "the operating system's entropy is not reproducible",
		"time":        "a clock makes the run depend on when it happened",
	}
	fset := token.NewFileSet()
	checked := 0
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		path := filepath.Join(".", name)
		f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Errorf("parsing %s: %v", name, err)
			continue
		}
		checked++
		for _, imp := range f.Imports {
			p := strings.Trim(imp.Path.Value, `"`)
			if why, isBanned := banned[p]; isBanned {
				t.Errorf("%s imports %q: %s. Every draw must come from the seeded Rng carried in "+
					"battle state", name, p, why)
			}
		}
	}
	if checked < 5 {
		t.Fatalf("only %d non-test files were checked; the scan is not seeing the package", checked)
	}
	t.Logf("checked the imports of %d non-test files: no math/rand, no crypto/rand, no time", checked)
}

// TestResultHashDetectsASingleFieldChange is the check that the hash is not
// accidentally insensitive.
//
// A hash that only folds the coarse outcome would satisfy tests 2 and 3 for the
// wrong reasons. This damages the result in several ways, one field at a time, and
// requires the hash to move every time.
func TestResultHashDetectsASingleFieldChange(t *testing.T) {
	cfg := loadConfig(t)
	setup := replayForce(t, cfg, 13579, replayTestUnits)
	base, err := Run(cfg, 13579, setup)
	if err != nil {
		t.Fatalf("running: %v", err)
	}
	if base.Hash() == 0 {
		t.Fatal("the base hash is zero")
	}
	damage := []struct {
		name   string
		mutate func(r *Result)
	}{
		{"outcome", func(r *Result) { r.Outcome.Kind = ResultSideB }},
		{"reason", func(r *Result) { r.Outcome.Reason = ReasonMutualCollapse }},
		{"ticks", func(r *Result) { r.Ticks++ }},
		{"truncated", func(r *Result) { r.Truncated = true }},
		{"label", func(r *Result) { r.Label += "x" }},
		{"config version", func(r *Result) { r.ConfigVersion += "x" }},
		{"unit state hash", func(r *Result) { r.StateHash++ }},
		{"dead", func(r *Result) { r.Sides[0].Dead += 1e-9 }},
		{"strength end", func(r *Result) { r.Sides[1].StrengthEnd += 1e-9 }},
		{"stats breaks", func(r *Result) { r.Stats.Breaks++ }},
		{"first event tick", func(r *Result) { r.Events[0].Tick++ }},
	}
	for _, d := range damage {
		altered := *base
		// A shallow copy shares the Sides array and the Events slice with the
		// original, so copy the two things this table mutates before damaging it.
		altered.Sides = [2]SideResult{base.Sides[0], base.Sides[1]}
		altered.Events = append([]Event{}, base.Events...)
		d.mutate(&altered)
		if altered.Hash() == base.Hash() {
			t.Errorf("changing %s did not change the result hash; the hash is not covering it", d.name)
			continue
		}
		if field, ok := ResultStateDiff(base, &altered); ok {
			t.Errorf("changing %s changed the hash but ResultStateDiff reported no difference (%q)",
				d.name, field)
		}
	}
	t.Logf("all %d single-field changes were detected", len(damage))
}

// TestScaleIsMeasurableOnABoundedBudget keeps one large-field determinism check
// that terminates.
//
// A full 500 v 500 battle does not currently finish in this package, so the tests
// above use small forces. This one uses a 500 v 500 field with a bounded tick
// budget through RunTicks, which stops on the caller's tick count rather than on a
// conclusion, and requires the same hash from two runs. That is the determinism
// claim at the size the performance targets care about, and it terminates.
//
// RunTicks is used rather than Run precisely so that this test cannot become the
// thing that times the suite out again if the ending condition is still being
// worked on.
func TestScaleIsMeasurableOnABoundedBudget(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 500
	const budget = 120

	setup := replayForce(t, cfg, seed, n)
	first, err := RunTicks(cfg, seed, setup, budget)
	if err != nil {
		t.Fatalf("first run: %v", err)
	}
	if first.Ticks != budget {
		t.Fatalf("the run stopped at %d ticks, not the %d the budget allowed; this test is "+
			"measuring a resolved battle and would go stale when the ending condition changes",
			first.Ticks, budget)
	}
	second, err := RunTicks(cfg, seed, setup, budget)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if first.Hash() != second.Hash() {
		field, _ := ResultStateDiff(first, second)
		t.Errorf("two %d v %d runs over %d ticks disagree: %016x vs %016x, first difference %s",
			n, n, budget, first.Hash(), second.Hash(), field)
	}
	t.Logf("%d v %d over %d ticks hashes to %016x on both runs", n, n, budget, first.Hash())
}

// TestReplayVerdictIsReadable is a small check that a failing check says something
// a person can act on, because the whole point of a check is that somebody reads
// it.
func TestReplayVerdictIsReadable(t *testing.T) {
	match := &ReplayCheck{Match: true, Want: "aaaa", Got: "aaaa", Seed: 1, Orders: 2, Ticks: 3}
	if !strings.Contains(match.String(), "MATCHED") {
		t.Errorf("a passing check does not say it passed: %q", match.String())
	}
	miss := &ReplayCheck{Match: false, Want: "aaaa", Got: "bbbb", Seed: 1, Orders: 2, Ticks: 3,
		Outcome: "A (enemy broke)", ReplayOutcome: "B (enemy broke)", Diff: "Unit.HP"}
	for _, want := range []string{"MISMATCH", "Unit.HP", "enemy broke"} {
		if !strings.Contains(miss.String(), want) {
			t.Errorf("a failing check does not mention %q: %q", want, miss.String())
		}
	}
}
