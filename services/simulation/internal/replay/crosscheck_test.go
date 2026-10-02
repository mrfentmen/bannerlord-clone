package replay

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/battle"
)

// The same three golden fixtures, checked through a different road.
//
// WHY A SECOND CHECKER FOR THE SAME FIXTURES
//
// The fixtures under internal/battle/testdata/golden are the crew's shared
// reference: three battles with recorded hashes, and the note in
// REPLAY_FORMATS.md section 5.7 that any simulation change that moves one of them
// fails loudly. They are checked by internal/battle's own loader, which runs the
// script and compares the hash.
//
// That is one code path checking itself. This file is a second, independent one,
// and the two together are what a cross-check is for:
//
//   - It goes through the FILE. The battle package's loader decodes a .script and
//     fights it; this one encodes the script, DECODES it back, fights the decoded
//     copy, then takes the order log the fight produced, puts THAT through bytes,
//     reads the bytes back, and replays from them. Every step in the chain is one
//     the other checker does not take, so a disagreement between the two is a bug
//     in a step rather than a shared misunderstanding.
//   - It runs from a different package, so it cannot inherit a fixup, a cached
//     value, or a helper that quietly repairs a fixture. A checker that shares
//     code with the thing it checks shares its bugs.
//
// THE COUPLING, STATED PLAINLY
//
// This test reads another package's testdata. Reading is fine and writing is not:
// nothing here re-records a fixture, because REPLAY_FORMATS.md section 5.7 makes
// re-recording a human decision that names the old and new hashes in the commit
// message, and that is not a thing a test should do on its own.
//
// The consequence is that this test FAILS when the engine legitimately changes,
// because the fixture's recorded hash no longer matches what the engine produces.
// That is the intended behaviour of a cross-check and it is worth the nuisance: it
// means a hash moves in two packages' test output rather than one, and whoever
// reads it is holding the same two numbers either way. The failure message says so
// and names the procedure.
//
// If agent1's or agent3's work moves a hash and the fixture has not been
// re-recorded yet, this test is the second report of the same fact and not a
// second opinion.

// goldenDir is the crew's fixture directory, reached from this package's own
// working directory. It is a relative path because go test runs in the package
// directory, and a path built from runtime.Caller would survive being run from
// anywhere else at the cost of being harder to read.
const goldenDir = "../battle/testdata/golden"

// TestTheGoldenFixturesVerifyThroughTheFile checks each checked-in fixture by
// taking the long way round to its hash.
func TestTheGoldenFixturesVerifyThroughTheFile(t *testing.T) {
	cfg := loadConfig(t)
	entries, err := os.ReadDir(goldenDir)
	if err != nil {
		t.Fatalf("reading the golden fixture directory: %v", err)
	}
	var seen int
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".script") {
			continue
		}
		seen++
		e := e
		t.Run(strings.TrimSuffix(e.Name(), ".script"), func(t *testing.T) {
			// 1. The script as it sits on disk.
			raw, err := os.ReadFile(filepath.Join(goldenDir, e.Name()))
			if err != nil {
				t.Fatalf("reading the fixture: %v", err)
			}
			script, err := battle.DecodeScript(raw)
			if err != nil {
				t.Fatalf("the fixture does not decode: %v", err)
			}
			// 2. Through its own encoder and back, so the fight below is of a script
			//    that has been round-tripped rather than of the bytes on disk.
			reencoded, err := battle.EncodeScript(script)
			if err != nil {
				t.Fatalf("the fixture would not encode: %v", err)
			}
			decoded, err := battle.DecodeScript(reencoded)
			if err != nil {
				t.Fatalf("the fixture did not survive its own round trip: %v\n%s", err, reencoded)
			}

			// 3. Fight the round-tripped script.
			res, rec, err := battle.RunScript(cfg, decoded, 0)
			if err != nil {
				t.Fatalf("fighting the fixture: %v", err)
			}

			// 4. The hash the fixture's own .hash file records, read from the file
			//    rather than taken from the run being judged. Copying the
			//    expectation out of the fresh run is the bug internal/battle's loader
			//    documents at length: the diagnostic then compares the engine with
			//    itself and cannot say whether a battle changed.
			want := readGoldenHash(t, e.Name())

			// 5. The order log this fight produced, through bytes.
			var check *battle.ReplayCheck
			if rec.Log != nil {
				encoded, err := rec.Log.Encode(rec.Seed, cfg.Version)
				if err != nil {
					t.Fatalf("the fixture's order log would not encode: %v", err)
				}
				// The digest has to be stable across the file, or the bytes are not
				// the log that was recorded.
				before := rec.Log.Hash()
				back, _, _, err := battle.DecodeOrderLog(encoded)
				if err != nil {
					t.Fatalf("the fixture's order log did not read back: %v", err)
				}
				if after := back.Hash(); after != before {
					t.Errorf("the order log's digest changed across a round trip, %016x became %016x",
						before, after)
				}
				setup, err := decoded.Setup(cfg)
				if err != nil {
					t.Fatalf("the fixture would not build a setup: %v", err)
				}
				check, err = battle.VerifyEncoded(cfg, encoded, setup, res)
				if err != nil {
					t.Fatalf("verifying the fixture's replay: %v", err)
				}
			} else {
				check, err = battle.Verify(cfg, rec, res)
				if err != nil {
					t.Fatalf("verifying the fixture's replay: %v", err)
				}
			}
			if !check.Match {
				t.Errorf("%s replayed from its own bytes to a different battle: %s", e.Name(), check)
			}

			// 6. And the live hash against the recorded one. This is the cross-check
			//    proper, and it is the assertion most likely to fire, because the
			//    engine changing is exactly what moves a fixture.
			if got := res.HashString(); got != want {
				t.Errorf("%s now hashes to %s and its fixture records %s. If the engine change was "+
					"intended, REPLAY_FORMATS.md section 5.7 applies: re-record the fixture and say so "+
					"in the commit message with both hashes in it. If it was not, this is a determinism "+
					"or ordering bug and the hash is the symptom, not the finding",
					e.Name(), got, want)
			}
			t.Logf("%-28s %d ticks, %-4v, %4d order rows in %d bytes, live hash %s, fixture records %s, "+
				"replay from bytes matches %v",
				e.Name(), res.Ticks, res.Outcome.Kind, logLen(rec), logBytes(rec),
				res.HashString(), want, check.Match)
		})
	}
	if seen == 0 {
		t.Fatalf("no .script fixtures were found in %s; the cross-check would otherwise pass "+
			"having checked nothing, which is the worst possible way to pass", goldenDir)
	}
	t.Logf("%d golden fixtures cross-checked from this package", seen)
}

// readGoldenHash reads the hash out of a fixture's .hash file.
//
// The file is a human-readable line — hash, then a summary — so the hash is the
// FIRST field and everything after it is a convenience for whoever reads the
// fixture in a diff. Taking only the first field is what makes this file's
// contents a checkable value rather than prose.
func readGoldenHash(t testing.TB, scriptName string) string {
	t.Helper()
	name := strings.TrimSuffix(scriptName, ".script") + ".hash"
	raw, err := os.ReadFile(filepath.Join(goldenDir, name))
	if err != nil {
		t.Fatalf("reading the fixture's expectation %s: %v", name, err)
	}
	fields := strings.Fields(string(raw))
	if len(fields) == 0 {
		t.Fatalf("%s is empty; a fixture with no recorded hash cannot be checked", name)
	}
	return fields[0]
}

func logLen(rec *battle.Recording) int {
	if rec == nil || rec.Log == nil {
		return 0
	}
	return rec.Log.Len()
}

func logBytes(rec *battle.Recording) int {
	if rec == nil || rec.Log == nil {
		return 0
	}
	encoded, err := rec.Log.Encode(rec.Seed, "")
	if err != nil {
		return -1
	}
	return len(encoded)
}
