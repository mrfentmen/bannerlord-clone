package replay

import (
	"encoding/json"
	"math"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// A recording's time is SIMULATED time, and this file is what holds it to that.
//
// The failure this guards against is not hypothetical and it is not subtle to
// cause by accident: one field changed from Elapsed to time.Since(start).Elapsed()
// and every recording still encodes, still decodes, still verifies against itself,
// and every determinism test in this package still passes — because both runs of
// the comparison made the same mistake. A recording is only worth anything if the
// time in it is a property of the battle rather than of the machine that watched
// it, and nothing in a passing test suite notices the difference on its own.
//
// So the test reads the numbers and checks the arithmetic, rather than checking
// that two runs agree. Frame k's Elapsed must be k tick-lengths, the tick length
// must be the engine's own and not a number this package chose, and the frame
// count must be the result's tick count. A recording built from a wall clock
// fails all three at once.

// TestRecordingTimeIsSimulatedNotWallClock checks the arithmetic of every frame's
// elapsed time against the tick number it carries.
func TestRecordingTimeIsSimulatedNotWallClock(t *testing.T) {
	cfg := loadConfig(t)
	rec := mustRecorded(t, cfg, 31337, 6)

	if rec.TickSeconds <= 0 {
		t.Fatalf("the recording's tick length is %g, which cannot produce a clock", rec.TickSeconds)
	}
	// The engine's own bound, so a frame count that disagrees with the result is
	// caught here rather than in a diff three packages away.
	if len(rec.Frames) != int(rec.Result.Ticks) {
		t.Fatalf("the recording holds %d frames and the engine ran %d ticks", len(rec.Frames), rec.Result.Ticks)
	}
	// The tick length has to be the one in the balance file, read through the
	// engine, because a package that re-derived it could disagree with the engine
	// and every elapsed time in the file would be wrong by that disagreement.
	if rec.TickSeconds != cfg.Battle.TickSeconds {
		t.Errorf("the recording's tick length is %g s and the balance file says %g s; the time in "+
			"every frame is a multiple of this number, so the two cannot both be right",
			rec.TickSeconds, cfg.Battle.TickSeconds)
	}
	for i, f := range rec.Frames {
		if f.Tick != i {
			t.Fatalf("frame %d carries tick %d; the frames are one per tick in tick order and a gap "+
				"here is a recording with a hole in it", i, f.Tick)
		}
		if f.TickSeconds != rec.TickSeconds {
			t.Fatalf("frame %d says the tick is %g s and the recording header says %g s; the header is "+
				"what a player is shown and a disagreement means one of them is a lie", i, f.TickSeconds, rec.TickSeconds)
		}
		want := float64(f.Tick) * rec.TickSeconds
		if math.Abs(f.Elapsed-want) > 1e-9 {
			t.Errorf("frame %d (tick %d) says %g s have elapsed and %g s of simulated time have "+
				"passed at %g s a tick; elapsed time that is not tick x tick-length is measured "+
				"against something other than the battle", i, f.Tick, f.Elapsed, want, rec.TickSeconds)
		}
	}
	// The last frame is the sharp end of it: a real clock and a simulated clock
	// agree at tick 0 and diverge by the end, so the final frame is where a
	// wall-clock recording is most obviously wrong.
	last := rec.Frames[len(rec.Frames)-1]
	if want := float64(last.Tick) * rec.TickSeconds; math.Abs(last.Elapsed-want) > 1e-9 {
		t.Errorf("the last frame is tick %d at %g s, and %g s of simulated time have passed; this is "+
			"the frame a wall clock cannot fake", last.Tick, last.Elapsed, want)
	}
	t.Logf("%d frames, %g s a tick, last frame at %g s of simulated time; the engine reports the "+
		"battle as %s of battle time", len(rec.Frames), rec.TickSeconds, last.Elapsed, rec.Result.ElapsedS)
}

// TestRecordingCarriesNoWallClockField walks the encoded bytes and fails on any
// field whose name admits it could be a duration of real time.
//
// The arithmetic test above is the strong one. This is the cheap one that runs
// first and names the culprit: when a recording does disagree with the tick
// count, the first question is which field to look at, and the answer is in the
// field names. It also covers the fields this package does not itself populate —
// a cause row, a result line, anything an encoder adds later.
func TestRecordingCarriesNoWallClockField(t *testing.T) {
	cfg := loadConfig(t)
	rec := mustRecorded(t, cfg, 31337, 4)
	data, err := Encode(rec)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	// The words a real-time field is named with. "elapsed" and "seconds" are NOT
	// here: this package uses both, and both mean simulated time, which is what
	// the arithmetic test above is for. What is forbidden is a field that is
	// specifically about the observer rather than the battle.
	banned := []string{"wall", "wallclock", "wall_clock", "realtime", "real_time",
		"timestamp", "time_unix", "timeunix", "monotonic", "cpu", "duration_since"}
	lowered := strings.ToLower(string(data))
	for _, b := range banned {
		if strings.Contains(lowered, b) {
			// Name the line, because "the bytes contain wall" is not a finding.
			for i, line := range strings.Split(string(data), "\n") {
				if strings.Contains(strings.ToLower(line), b) {
					t.Errorf("encoded line %d contains %q, which is a name only real time has: %s",
						i+1, b, truncate(line, 160))
					break
				}
			}
		}
	}
	// And the result line, which is a struct with its own field set and is the one
	// place a duration of real time would most plausibly be added, because a
	// result is what a report prints.
	var res map[string]any
	last := lastJSONLine(t, data)
	if err := json.Unmarshal([]byte(last), &res); err != nil {
		t.Fatalf("the last encoded line is not an object: %v\n%s", err, truncate(last, 200))
	}
	for k := range res {
		lk := strings.ToLower(k)
		for _, b := range banned {
			if strings.Contains(lk, b) {
				t.Errorf("the result line carries a field %q that is named after real time rather "+
					"than battle time", k)
			}
		}
	}
	t.Logf("%d bytes of encoded recording, no field named after real time; result fields: %v",
		len(data), keysOf(res))
}

// TestTheSeedInTheHeaderIsTheSeedThatRuns is the provenance half of a replay: the
// seed in the file has to be the seed that produced the battle, and it has to be
// the seed a re-run uses.
//
// Two ways this can be wrong, and neither shows up in a determinism test. The
// header can carry a seed that is not the one the battle ran under, so the file
// is a recipe for a different fight. Or the header can carry the right seed and
// the re-run can use something else — a constant, a fresh draw, the caller's
// seed — so a replay reproduces something other than what the file describes
// while every field in the file reads correctly.
//
// So this checks the seed is written, that the decoded recording carries it, that
// re-simulating with it reproduces the battle exactly, and that CHANGING it
// produces a different battle. The last is the one that matters most: a seed that
// is recorded but ignored passes every other check here.
func TestTheSeedInTheHeaderIsTheSeedThatRuns(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 31337
	rec := mustRecorded(t, cfg, seed, 6)
	data, err := Encode(rec)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	head := firstJSONLine(t, data)
	var hdr map[string]any
	if err := json.Unmarshal([]byte(head), &hdr); err != nil {
		t.Fatalf("the first encoded line is not an object: %v\n%s", err, truncate(head, 200))
	}
	got, ok := hdr["seed"]
	if !ok {
		t.Fatalf("the header carries no seed: %s", truncate(head, 300))
	}
	// JSON numbers decode as float64, and a 64-bit seed does not survive float64.
	// That is a real property of the format and not a test artefact, so the
	// comparison is made on the integer the decoder produced rather than on the
	// decoded float.
	decoded, err := Decode(data)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if decoded.Seed != seed {
		t.Errorf("the header wrote seed %d and the decoded recording reads %d; a seed that does not "+
			"survive its own file is a replay of a different battle", seed, decoded.Seed)
	}
	t.Logf("header seed field %v round-trips to %d", got, decoded.Seed)

	// The seed the file names is the seed that reproduces it.
	again, err := ReSimulate(cfg, decoded)
	if err != nil {
		t.Fatalf("ReSimulate: %v", err)
	}
	if again.Result.Hash() != rec.Result.Hash() {
		t.Errorf("re-simulating from the file's own seed gave hash %s and the recorded battle hashed "+
			"to %s", again.Result.HashString(), rec.Result.HashString())
	}

	// And it is HONORED, which is the half a determinism test cannot see. Change
	// the seed in the decoded recording and the re-run must produce a different
	// battle; a seed that is read and then ignored re-runs the original fight and
	// this comparison passes for the wrong reason.
	tampered := *decoded
	tampered.Seed = seed + 1
	other, err := ReSimulate(cfg, &tampered)
	if err != nil {
		t.Fatalf("ReSimulate with a different seed: %v", err)
	}
	if other.Result.Hash() == rec.Result.Hash() {
		t.Errorf("seed %d and seed %d both replayed to hash %s; the seed in the header is recorded "+
			"and then not used, which is the one failure this test exists to catch",
			seed, seed+1, rec.Result.HashString())
	}
	// Two seeds that both work and both differ is the whole claim: the file is a
	// recipe, and the recipe's seed is the ingredient that chooses the fight.
	t.Logf("seed %d hashes to %s and seed %d hashes to %s", seed, rec.Result.HashString(), seed+1,
		other.Result.HashString())
}

// mustRecorded runs a battle with the recorder attached, or fails the test.
//
// The helper exists so the tests in this file read as claims about a recording
// rather than as four lines of setup each. The unit count is a parameter because
// the sizes are the point of some of these tests and not others: a dozen a side
// is plenty to fill sixty frames, and a smaller one keeps the field-name walk
// quick.
func mustRecorded(t testing.TB, cfg *config.Config, seed uint64, units int) *Recording {
	t.Helper()
	rec, err := Record(cfg, seed, evenForce(t.(*testing.T), cfg, seed, units))
	if err != nil {
		t.Fatalf("Record(%d a side, seed %d): %v", units, seed, err)
	}
	if rec.Result == nil {
		t.Fatalf("Record(%d a side, seed %d) returned no result", units, seed)
	}
	return rec
}

func firstJSONLine(t testing.TB, data []byte) string {
	t.Helper()
	for _, line := range strings.Split(string(data), "\n") {
		if s := strings.TrimSpace(line); s != "" {
			return s
		}
	}
	t.Fatalf("the encoded recording is empty")
	return ""
}

func lastJSONLine(t testing.TB, data []byte) string {
	t.Helper()
	lines := strings.Split(string(data), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if s := strings.TrimSpace(lines[i]); s != "" {
			return s
		}
	}
	t.Fatalf("the encoded recording is empty")
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func keysOf(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sortStrings(out)
	return out
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}
