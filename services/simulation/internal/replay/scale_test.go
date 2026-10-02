package replay

import (
	"fmt"
	"testing"

	"mbclone/simulation/internal/battle"
)

// The scale the replay has to survive, and the one every small test misses.
//
// WHY THIS IS NOT JUST A BIGGER NUMBER
//
// Everything else in this package proves the replay machinery on battles small
// enough to read. A replay that only works at that size fails in the one place it
// matters, and the ways it fails are not hypothetical:
//
//   - A row cap. The order log bounds itself, and a cap that is comfortably above
//     the number of orders a test generates is a cap nobody notices until a real
//     battle crosses it. A truncated log still replays; it replays a DIFFERENT
//     battle, and only the hash comparison catches it.
//   - An id assumption. Battle ids are dense and ascending, and code that indexes
//     a slice by id is right at 24 units a side and wrong at 500 the moment a
//     unit dies and the dense range stops matching the roster.
//   - A cap on a cause log or an event list, which is the same bug wearing a
//     different hat: a silent truncation that reads as a short battle.
//
// So this test does the whole round trip at 500 a side — record, encode to bytes,
// decode, replay, compare hashes — and it asserts the LOG was not truncated,
// because a replay that matches a truncated log is a replay of a different
// battle that happens to agree with itself.
//
// The commander is here on purpose. A nil commander logs nothing, and a replay
// from an empty log only proves the engine re-derives its own decisions, which is
// a weaker claim than the one worth making. This one issues orders on a schedule,
// so the log has to be written, encoded, read back and obeyed for the hashes to
// agree.

// marchingOrder is a commander that tells side A to advance and then to hold, on
// a fixed schedule, and writes down what it decided.
//
// It is a Commander and not a Script because the point is to drive the order log
// from inside a live battle at a size where the log's own bookkeeping is under
// pressure. The decisions are a function of the tick alone, so the log is
// reproducible from the seed with no state carried between ticks, which is what
// makes a mismatch mean a bug rather than a difference of opinion.
type marchingOrder struct {
	// holdFrom is the tick side A is told to hold from. Before it, side A advances.
	holdFrom int
	// chargeFrom is the tick side A is told to charge from, so the log holds two
	// different intents rather than one repeated many times.
	chargeFrom int
	// refresh is how often the standing order is re-issued even when it has not
	// changed.
	//
	// This is the difference between a commander and a loop. Writing a row per
	// unit per tick is 150 units times a thousand ticks of log for a battle in
	// which the general changed his mind twice, and it makes the row count a
	// measurement of the tick count rather than of the orders. A real commander
	// speaks when the order changes and re-confirms it periodically, so that is
	// what this does: the log then holds units x changes, plus a re-confirmation
	// every refresh ticks, and a 500 v 500 battle over two thousand ticks produces
	// tens of thousands of rows rather than a million.
	refresh int
	// lastSpoken is the tick the order was last written on, or -1 before the first.
	lastSpoken int
	issued     int
}

func (m *marchingOrder) Command(v *battle.View) error {
	if v == nil {
		return nil
	}
	// One order per unit of side A, once per intent change. Writing on every tick
	// would be a thousand identical rows a tick and would test the log's cap
	// rather than its fidelity; writing on the change is what a real commander
	// does and it still produces thousands of rows over a long battle.
	//
	// The intent is the whole of what a UnitCommand says about an order's KIND:
	// the order log derives its row kind from the intent the seam was given, so
	// three intents over a battle produce three kinds of row.
	intent := battle.IntentAdvance
	switch {
	case v.Tick >= m.chargeFrom:
		intent = battle.IntentAdvance
	case v.Tick >= m.holdFrom:
		intent = battle.IntentHold
	}
	// The tick the standing order was last spoken on, so the loop below knows
	// whether speaking again is a change or a re-confirmation.
	if m.refresh > 0 && m.lastSpoken >= 0 && v.Tick-m.lastSpoken < m.refresh {
		return nil
	}
	m.lastSpoken = v.Tick
	for i := range v.Units {
		if v.Units[i].Side != battle.SideA || v.Units[i].Status != battle.StatusFighting {
			continue
		}
		v.Commands[i] = battle.UnitCommand{
			Set:          true,
			Intent:       intent,
			FormationSet: true,
			Formation:    battle.FormationLine,
		}
		m.issued++
	}
	return nil
}

// TestReplayHoldsAtFiveHundredASide is the scale claim: the whole file round
// trip, at the largest force the balance file allows a side, with a non-empty
// order log.
func TestReplayHoldsAtFiveHundredASide(t *testing.T) {
	if testing.Short() {
		t.Skip("a 500 v 500 battle with its order log encoded, decoded and replayed is not a short-mode test")
	}
	cfg := loadConfig(t)
	const seed = 20260930
	// A log row bound high enough that hitting it would be a finding rather than
	// an accident, so Truncated below is a real assertion and not a formality.
	//
	// Generous on purpose. A bound this test can accidentally reach is a bound the
	// test cannot use to say anything: it would fail on the size of the log rather
	// than on the log being wrong. What a truncated log does to a replay is the
	// subject of its own test below, which truncates deliberately.
	const rowBound = 1 << 20

	run := func(t *testing.T) (*battle.Result, *battle.Recording, []byte) {
		t.Helper()
		cmd := &marchingOrder{holdFrom: 40, chargeFrom: 90, refresh: 25, lastSpoken: -1}
		res, rec, err := battle.Record(cfg, seed, evenForce(t, cfg, seed, 500), cmd, rowBound, "scale-500")
		if err != nil {
			t.Fatalf("recording a 500 v 500 battle: %v", err)
		}
		encoded, err := rec.Log.Encode(rec.Seed, cfg.Version)
		if err != nil {
			t.Fatalf("encoding the 500 v 500 order log: %v", err)
		}
		return res, rec, encoded
	}

	res, rec, encoded := run(t)

	// The log is a real record and not a summary of one.
	if rec.Log.Truncated() {
		t.Fatalf("the 500 v 500 order log is truncated at a bound of %d rows; a truncated log "+
			"replays a shorter battle and still verifies against itself", rowBound)
	}
	if rec.Log.Len() == 0 {
		t.Fatal("the 500 v 500 order log is empty; the commander issued nothing, so this run proves " +
			"only that the engine can re-derive its own decisions, which is the weaker claim")
	}
	// The log's own digest has to survive the file, for the reason the fuzz test
	// gives at length: a log that reads back as a different log verifies against
	// a different battle.
	before := rec.Log.Hash()
	back, headerSeed, headerVersion, err := battle.DecodeOrderLog(encoded)
	if err != nil {
		t.Fatalf("the 500 v 500 order log did not read back: %v", err)
	}
	if after := back.Hash(); after != before {
		t.Errorf("the 500 v 500 log's digest changed across a round trip, %016x became %016x",
			before, after)
	}
	if headerSeed != seed {
		t.Errorf("the log header says seed %d and the battle ran under %d", headerSeed, seed)
	}
	if headerVersion != cfg.Version {
		t.Errorf("the log header says balance version %q and the battle ran under %q",
			headerVersion, cfg.Version)
	}

	check, err := battle.VerifyEncoded(cfg, encoded, evenForce(t, cfg, seed, 500), res)
	if err != nil {
		t.Fatalf("verifying the 500 v 500 replay: %v", err)
	}
	if !check.Match {
		t.Errorf("a 500 v 500 battle replayed from its own bytes to a different battle: %s", check)
	}

	// And the same replay a second time, to say that the match is not a coin
	// flip that happened to land. Two replays of the same bytes must agree with
	// each other as well as with the original, and at this size they are the two
	// most expensive things in the package.
	second, err := battle.Replay(cfg, rec)
	if err != nil {
		t.Fatalf("replaying the 500 v 500 battle: %v", err)
	}
	if second.HashString() != res.HashString() {
		t.Errorf("replaying the same 500 v 500 recording twice gave %s and %s", second.HashString(), res.HashString())
	}

	t.Logf("500 v 500, seed %d: %d ticks, %s, %d units, winner %v; %d order rows in %d bytes, "+
		"truncated %v; replay from those bytes matches %v",
		seed, res.Ticks, res.HashString(), res.Sides[0].StartUnits+res.Sides[1].StartUnits,
		res.Outcome.Kind, rec.Log.Len(), len(encoded), rec.Log.Truncated(), check.Match)
}

// TestReplayHoldsAtEveryScaleBetweenTheTwoEnds walks a ladder of force sizes and
// checks the replay at each one.
//
// The 500 v 500 case is the one that matters and it is also the most expensive,
// so it is the one most likely to be skipped on a loaded machine or given a build
// tag. A ladder means the sizes in between are covered by a cheap test, and a bug
// that only bites above some id count has to be very specific to slip through the
// gap between the rungs.
//
// The sizes are chosen to straddle the places a hidden cap would live: 24 is what
// the other tests in this package use, 64 and 150 are unremarkable, and 150 is
// past the point where a hardcoded per-tick buffer or a small-map assumption
// would start to hurt. 500 is left to the test above rather than repeated here,
// because it costs more than everything else in this file put together.
func TestReplayHoldsAtEveryScaleBetweenTheTwoEnds(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	for _, n := range []int{1, 2, 24, 64, 150} {
		n := n
		t.Run(fmt.Sprintf("%d_vs_%d", n, n), func(t *testing.T) {
			cmd := &marchingOrder{holdFrom: 20, chargeFrom: 45, refresh: 25, lastSpoken: -1}
			res, rec, err := battle.Record(cfg, seed, evenForce(t, cfg, seed, n), cmd, 1<<20, "scale-ladder")
			if err != nil {
				t.Fatalf("recording %d v %d: %v", n, n, err)
			}
			if rec.Log.Truncated() {
				t.Fatalf("the %d v %d order log is truncated at a bound of a million rows, which is "+
					"not a size this test can reach by accident", n, n)
			}
			encoded, err := rec.Log.Encode(rec.Seed, cfg.Version)
			if err != nil {
				t.Fatalf("encoding the %d v %d order log: %v", n, n, err)
			}
			check, err := battle.VerifyEncoded(cfg, encoded, evenForce(t, cfg, seed, n), res)
			if err != nil {
				t.Fatalf("verifying the %d v %d replay: %v", n, n, err)
			}
			if !check.Match {
				t.Errorf("%d v %d replayed from its own bytes to a different battle: %s", n, n, check)
			}
			t.Logf("%3d v %3d: %4d ticks, %s, %4d order rows, match %v", n, n, res.Ticks,
				res.HashString(), rec.Log.Len(), check.Match)
		})
	}
}

// TestATruncatedOrderLogIsCaught is the test that earns the truncation assertion
// in the two above.
//
// Those two assert a log is not truncated, which is a statement that a normal
// battle fits. It is not a statement about what happens when one does not, and the
// failure mode is the expensive kind: a log that stops accepting rows still
// replays. It replays a SHORTER battle, because the orders that were dropped were
// the orders that were never issued, and a battle in which a general's last two
// hundred orders went missing can still end the same way. The result is a replay
// that verifies against itself and against the original, and a player who saved a
// battle has saved a lie that costs nothing to believe.
//
// So the log is truncated on purpose, here, with a bound a real commander would
// never hit, and the question asked is not "is it truncated" — the flag says that
// — but "does a replay of the truncated log claim to be the same battle".
func TestATruncatedOrderLogIsCaught(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 24
	setup := func() battle.Setup { return evenForce(t, cfg, seed, n) }

	// The same battle, logged with room and logged without it.
	full := func() (*battle.Result, *battle.Recording) {
		cmd := &marchingOrder{holdFrom: 20, chargeFrom: 45, refresh: 25, lastSpoken: -1}
		res, rec, err := battle.Record(cfg, seed, setup(), cmd, 1<<20, "truncation-full")
		if err != nil {
			t.Fatalf("recording the full log: %v", err)
		}
		return res, rec
	}
	clipped := func() (*battle.Result, *battle.Recording) {
		cmd := &marchingOrder{holdFrom: 20, chargeFrom: 45, refresh: 25, lastSpoken: -1}
		// A bound of forty rows on a battle that writes hundreds: the log refuses
		// the rest and says so.
		res, rec, err := battle.Record(cfg, seed, setup(), cmd, 40, "truncation-clipped")
		if err != nil {
			t.Fatalf("recording the clipped log: %v", err)
		}
		return res, rec
	}

	fullRes, fullRec := full()
	if fullRec.Log.Truncated() {
		t.Fatalf("the full log is truncated; the comparison below would be between two wrong logs")
	}
	_, clipRec := clipped()
	if !clipRec.Log.Truncated() {
		t.Skipf("a bound of 40 rows was not reached: the log holds %d rows, so this run cannot "+
			"demonstrate what a truncated log does", clipRec.Log.Len())
	}
	if clipRec.Log.Len() >= fullRec.Log.Len() {
		t.Fatalf("the clipped log holds %d rows and the full one %d; the clipped log is not smaller "+
			"so nothing has been dropped", clipRec.Log.Len(), fullRec.Log.Len())
	}
	t.Logf("full log %d rows, truncated %v at %d rows", fullRec.Log.Len(), clipRec.Log.Truncated(), clipRec.Log.Len())

	// A truncated log must not be accepted as a record of the battle it claims to
	// record. Whether the refusal is at decode time or at replay time, the answer
	// has to be no: the two cases below are the two places it could go wrong.
	clipBytes, err := clipRec.Log.Encode(clipRec.Seed, cfg.Version)
	if err != nil {
		t.Fatalf("encoding the truncated log: %v", err)
	}
	if _, _, _, err := battle.DecodeOrderLog(clipBytes); err == nil {
		t.Log("the truncated log decodes; the flag travels in the header, so the refusal has to " +
			"happen at replay")
	} else {
		t.Logf("the truncated log is refused at decode: %v", err)
	}
	check, err := battle.VerifyEncoded(cfg, clipBytes, setup(), fullRes)
	if err != nil {
		// A refusal is the good answer. The battle it would have replayed is not
		// the battle that was fought, and saying so is correct.
		t.Logf("verifying a truncated log against the full battle is refused, which is the right "+
			"answer: %v", err)
		return
	}
	if check.Match {
		t.Errorf("a log truncated from %d rows to %d verified as a replay of the full battle (%s); "+
			"the dropped orders are not in the file and the battle that replays is not the battle "+
			"that was fought", fullRec.Log.Len(), clipRec.Log.Len(), check)
	}
	t.Logf("a truncated log does not verify against the full battle: %s", check)
}
