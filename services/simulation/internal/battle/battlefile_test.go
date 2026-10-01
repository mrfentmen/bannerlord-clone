package battle

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// THE TESTS FOR THE RECORDED BATTLE ON DISK.
//
// A recorded battle exists to answer one question from the outside: was it the
// same battle? So the tests here are four claims and one discipline.
//
//  1. A battle recorded to disk replays from those files to the result hash the
//     record carries. That is MASTER_PLAN.md's acceptance for the replay CLI,
//     end to end through SaveBattle, ReadBattle, and VerifyRecordedBattle.
//  2. Recording the same battle twice writes byte-identical files. The record
//     format makes a determinism claim of its own, separate from the engine's.
//  3. A record that has been edited, truncated, half-copied, or pointed at a
//     log somewhere else is refused, with a message naming what disagrees. A
//     record read on trust when it cannot be trusted is the one failure mode a
//     replay feature must not have.
//  4. The check can FAIL. Every other test here passes by finding two runs that
//     agree, which is also what a verifier that always said MATCHED would do.
//
// The discipline: every mismatch test has the untampered record alongside it in
// the same subtest, so a verifier that could not fail is caught rather than
// credited.

// recordTestUnits is the force the record tests fight. Four a side resolves in a
// few hundred ticks, which is the difference between a test suite that runs and
// one that does not.
const recordTestUnits = 4

// recordTestSeed and recordTestID are the battle every test here fights, so a
// failure names the same battle in every message.
const (
	recordTestSeed = 60607
	recordTestID   = "battle-record-test"
)

// fightAndSave runs one scripted battle and writes its record into a temp store.
//
// It returns the store, the result, and the record, because almost every test
// wants all three and none of them should have to re-fight the battle to get
// them. The script has one order in it rather than none, because a record with an
// empty order log proves less: an empty log replays from the seed alone, so a
// record whose log was silently dropped would still match. One order means the
// log has to be read for the replay to be right.
func fightAndSave(t *testing.T, cfg *config.Config) (*BattleStore, *Result) {
	t.Helper()
	return fightAndSaveAt(t, cfg, OpenBattleStore(t.TempDir()))
}

// fightAndSaveAt is fightAndSave into a store the caller supplies, for the test
// that needs the store to be somewhere it can put strangers next to the battles.
func fightAndSaveAt(t *testing.T, cfg *config.Config, store *BattleStore) (*BattleStore, *Result) {
	t.Helper()
	script := NewScript("record test", recordTestSeed,
		Roster{Units: recordTestUnits}, Roster{Units: recordTestUnits})
	script.Steps = []Order{
		{Tick: 0, Unit: 0, Side: SideA, Kind: OrderHold, Intent: IntentHold, Source: "the record tests hold one man"},
	}
	res, rec, err := RunScript(cfg, script, 0)
	if err != nil {
		t.Fatalf("fighting the test battle failed: %v", err)
	}
	a, b := script.Rosters()
	if err := store.Save(recordTestID, a, b, res, rec); err != nil {
		t.Fatalf("saving the record failed: %v", err)
	}
	return store, res
}

// rewriteIndex reads a record's battle.json, hands it to fn, and writes it back.
//
// Editing the record has to go through the encoder rather than through a string
// replace, or a test of "what happens when the file is edited" would depend on
// the exact spacing the encoder happens to use today.
func rewriteIndex(t *testing.T, dir string, fn func(*recordFile)) {
	t.Helper()
	path := filepath.Join(dir, recordIndexFile)
	blob, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading the record failed: %v", err)
	}
	var idx recordFile
	if err := json.Unmarshal(blob, &idx); err != nil {
		t.Fatalf("the record does not parse: %v", err)
	}
	fn(&idx)
	out, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		t.Fatalf("re-encoding the record failed: %v", err)
	}
	if err := os.WriteFile(path, append(out, '\n'), 0o644); err != nil {
		t.Fatalf("writing the record back failed: %v", err)
	}
}

// TestRecordedBattleReplaysFromItsFiles is claim 1, and it is the acceptance
// criterion MASTER_PLAN.md states for the replay CLI: re-run a recorded battle
// headlessly, and the replay's outcome and casualty counts match the original.
//
// The comparison the CLI makes is by result hash, which covers every unit's final
// state and every published total. The summary is compared alongside it so the
// test also asserts the two things a reader of the command's output would be
// looking at, which is the part of the acceptance criterion a hash alone does not
// display.
func TestRecordedBattleReplaysFromItsFiles(t *testing.T) {
	cfg := loadConfig(t)
	store, res := fightAndSave(t, cfg)

	check, err := store.Verify(cfg, recordTestID)
	if err != nil {
		t.Fatalf("replaying a recorded battle failed: %v", err)
	}
	if !check.Match {
		t.Fatalf("the replay did not match: %s", check)
	}
	if check.Want != res.HashString() {
		t.Errorf("the record carries result hash %s and the battle produced %s; the record was written from "+
			"one run and claims to describe another", check.Want, res.HashString())
	}
	if check.Replay.Outcome != res.Outcome.Kind.String() || check.Replay.Reason != res.Outcome.Reason.String() {
		t.Errorf("the replay ended %s (%s) and the battle ended %s (%s)",
			check.Replay.Outcome, check.Replay.Reason, res.Outcome.Kind, res.Outcome.Reason)
	}
	for i := range check.Original.Sides {
		want, got := res.Sides[i], check.Replay.Sides[i]
		if got.Dead != want.Dead || got.Wounded != want.Wounded {
			t.Errorf("side %s recorded %.2f dead and %.2f wounded and replayed %.2f dead and %.2f wounded",
				got.Side, want.Dead, want.Wounded, got.Dead, got.Wounded)
		}
		if got.Surrendered != want.Surrendered || got.Standing != want.Standing || got.Routed != want.Routed {
			t.Errorf("side %s recorded %d surrendered, %d standing, %d routed and replayed %d, %d, %d",
				got.Side, want.Surrendered, want.Standing, want.Routed,
				got.Surrendered, got.Standing, got.Routed)
		}
	}
	if check.Orders != res.Sides[0].StartUnits {
		// Not the assertion that matters; it is here so a reader can see the log
		// really did carry rows, which is what stops this from being a test of the
		// empty-log case wearing a recorded battle's name.
		t.Logf("the record carries %d orders for a %d v %d battle", check.Orders,
			res.Sides[0].StartUnits, res.Sides[1].StartUnits)
	}
	if check.Orders == 0 {
		t.Fatal("the recorded battle issued no orders, so this test would pass even if the order log were dropped")
	}
	t.Logf("replayed from files: %s", check)
	t.Logf("recorded:\n%s", check.Original.Format())
}

// TestRecordingTheSameBattleTwiceWritesIdenticalFiles is claim 2: the record
// format is deterministic in its own right.
//
// This is not the engine's determinism claim restated. The engine claim is that
// the same seed and the same orders produce the same battle. This one is that
// the same battle produces the same BYTES on disk, which is a separate property
// and the one that makes a record reviewable in a diff and a pair of records
// comparable with cmp. A record format that wrote a timestamp, or ordered a map,
// or formatted a float with the wrong precision, would replay perfectly and fail
// this.
func TestRecordingTheSameBattleTwiceWritesIdenticalFiles(t *testing.T) {
	cfg := loadConfig(t)
	script := NewScript("record test", recordTestSeed,
		Roster{Units: recordTestUnits}, Roster{Units: recordTestUnits})
	script.Steps = []Order{
		{Tick: 0, Unit: 0, Side: SideA, Kind: OrderHold, Intent: IntentHold, Source: "the record tests hold one man"},
	}
	write := func(dir string) map[string]string {
		t.Helper()
		res, rec, err := RunScript(cfg, script, 0)
		if err != nil {
			t.Fatalf("fighting the test battle failed: %v", err)
		}
		a, b := script.Rosters()
		if err := SaveBattle(filepath.Join(dir, recordTestID), recordTestID, a, b, res, rec); err != nil {
			t.Fatalf("saving the record failed: %v", err)
		}
		files := map[string]string{}
		for _, name := range []string{recordIndexFile, recordLogFile} {
			blob, err := os.ReadFile(filepath.Join(dir, recordTestID, name))
			if err != nil {
				t.Fatalf("reading %s failed: %v", name, err)
			}
			files[name] = string(blob)
		}
		return files
	}
	first, second := write(t.TempDir()), write(t.TempDir())
	for name := range first {
		if first[name] != second[name] {
			t.Errorf("%s is not byte-identical between two recordings of the same battle:\nfirst:\n%s\nsecond:\n%s",
				name, first[name], second[name])
		}
	}
	t.Logf("both recordings wrote %d bytes of battle.json and %d bytes of order.log, byte for byte",
		len(first[recordIndexFile]), len(first[recordLogFile]))
}

// TestSaveBattleOverTheSameDirectoryIsAnUpdate is the other half of claim 2's
// usefulness: recording the same battle id twice in one place leaves one record,
// and it is the same record.
//
// Without this the format would be append-only in the sense that a second
// recording of the same id wrote a second directory, and `simrun replay` would
// then be replaying whichever half it found first.
func TestSaveBattleOverTheSameDirectoryIsAnUpdate(t *testing.T) {
	cfg := loadConfig(t)
	dir := t.TempDir()
	script := NewScript("record test", recordTestSeed,
		Roster{Units: recordTestUnits}, Roster{Units: recordTestUnits})
	res, rec, err := RunScript(cfg, script, 0)
	if err != nil {
		t.Fatalf("fighting the test battle failed: %v", err)
	}
	a, b := script.Rosters()
	target := filepath.Join(dir, recordTestID)
	if err := SaveBattle(target, recordTestID, a, b, res, rec); err != nil {
		t.Fatalf("the first save failed: %v", err)
	}
	first, err := os.ReadFile(filepath.Join(target, recordIndexFile))
	if err != nil {
		t.Fatalf("reading the record failed: %v", err)
	}
	if err := SaveBattle(target, recordTestID, a, b, res, rec); err != nil {
		t.Fatalf("saving over an existing record failed: %v", err)
	}
	second, err := os.ReadFile(filepath.Join(target, recordIndexFile))
	if err != nil {
		t.Fatalf("reading the record back failed: %v", err)
	}
	if string(first) != string(second) {
		t.Error("saving the same battle twice over the same directory changed the record")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("reading the directory failed: %v", err)
	}
	if len(entries) != 1 {
		t.Errorf("the store holds %d entries after two saves of one battle, want 1", len(entries))
	}
}

// TestBattleRecordSurvivesTheReload is the round-trip claim on the record's
// fields, which is what makes the record usable rather than merely replayable.
//
// It is checked field by field rather than by re-encoding, because the record is
// only decoded by this build and a decoder that dropped a field the ENCODER wrote
// back would survive a byte-equality test. Roster in particular is the field a
// dropped value would hurt most: a record that came back with 0 units a side would
// build no force, and the replay would fail loudly rather than wrongly, so this is
// a check on the message rather than on the numbers.
func TestBattleRecordSurvivesTheReload(t *testing.T) {
	cfg := loadConfig(t)
	store, res := fightAndSave(t, cfg)
	storeDir, err := store.Dir(recordTestID)
	if err != nil {
		t.Fatalf("resolving the record directory failed: %v", err)
	}

	got, err := store.Load(recordTestID)
	if err != nil {
		t.Fatalf("reading the record failed: %v", err)
	}
	if got.ID != recordTestID {
		t.Errorf("the record came back as %q, want %q", got.ID, recordTestID)
	}
	if got.Seed != recordTestSeed {
		t.Errorf("the record came back with seed %d, want %d", got.Seed, recordTestSeed)
	}
	if got.ConfigVersion != cfg.Version {
		t.Errorf("the record came back under balance %q, want %q", got.ConfigVersion, cfg.Version)
	}
	if got.Label != "record test" {
		t.Errorf("the record came back labelled %q, want %q", got.Label, "record test")
	}
	for name, r := range map[string]Roster{"A": got.A, "B": got.B} {
		if r.Units != recordTestUnits {
			t.Errorf("side %s came back with %d units a side, want %d", name, r.Units, recordTestUnits)
		}
	}
	if got.Original.ResultHash != res.HashString() {
		t.Errorf("the record carries result hash %s and the battle produced %s", got.Original.ResultHash, res.HashString())
	}
	// The log must come back as the same bytes, because the record's whole claim
	// about its log is that it is the log and not a summary of it.
	blob, err := os.ReadFile(filepath.Join(storeDir, recordLogFile))
	if err != nil {
		t.Fatalf("reading the log off disk failed: %v", err)
	}
	if string(blob) != string(got.LogBytes) {
		t.Error("the log read back from the record is not the log on disk")
	}
	// And the setup it rebuilds has to be the setup that was fought, which is the
	// check Replay's roster fingerprint makes before it will run.
	setup, err := got.Setup(cfg)
	if err != nil {
		t.Fatalf("rebuilding the forces from the record failed: %v", err)
	}
	if want := rosterFingerprint(setup); want != got.Log.RosterHash() {
		t.Errorf("the record's roster fingerprints to %016x and the log was recorded against %016x",
			want, got.Log.RosterHash())
	}
}

// TestBattleRecordRefusesAFileItCannotTrust is claim 3.
//
// Every subtest edits one thing and requires an error naming it. The control at
// the end re-reads the record nothing was done to, because a set of refusal tests
// where the reader is simply broken passes every one of them.
func TestBattleRecordRefusesAFileItCannotTrust(t *testing.T) {
	cfg := loadConfig(t)
	store, _ := fightAndSave(t, cfg)
	dir, err := store.Dir(recordTestID)
	if err != nil {
		t.Fatalf("resolving the record directory failed: %v", err)
	}

	// breakIt is handed the copy it is allowed to damage. It is not closed over the
	// shared record on purpose: a case that edited the original would leave the next
	// case fighting a battle two edits old, and every message after it would be
	// about the wrong damage. That is not hypothetical, it is how this test was
	// written the first time.
	cases := []struct {
		name    string
		breakIt func(t *testing.T, dir string)
		want    string
	}{
		{
			name: "record claims a different id",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.ID = "somebody-elses-battle" })
			},
			want: "somebody-elses-battle",
		},
		{
			name: "record claims a different seed",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.Seed = idx.Seed + 1 })
			},
			want: "different battles",
		},
		{
			name: "record claims a different balance version",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.ConfigVersion = idx.ConfigVersion + "-edited" })
			},
			want: "different battles",
		},
		{
			name: "record claims a different row count",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.Log.Rows++ })
			},
			want: "not beside it",
		},
		{
			name: "record claims a different order digest",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.Log.OrderHash = "0000000000000000" })
			},
			want: "hashes to",
		},
		{
			name: "record claims a different roster",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.Log.RosterHash = "1111111111111111" })
			},
			want: "against force",
		},
		{
			name: "record points its reader at a different log",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.Log.File = "../../etc/passwd" })
			},
			want: "cannot be trusted to name its inputs",
		},
		{
			name: "record is a format version this build does not read",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.Version = BattleRecordVersion + 1 })
			},
			want: "refusing to guess",
		},
		{
			name: "record is a different kind of file",
			breakIt: func(t *testing.T, dir string) {
				rewriteIndex(t, dir, func(idx *recordFile) { idx.Kind = "order_log" })
			},
			want: "not a battle record",
		},
		{
			name: "the order log is missing",
			breakIt: func(t *testing.T, dir string) {
				if err := os.Remove(filepath.Join(dir, recordLogFile)); err != nil {
					t.Fatalf("removing the log failed: %v", err)
				}
			},
			want: "reading the order log failed",
		},
		{
			name: "the order log is truncated",
			breakIt: func(t *testing.T, dir string) {
				path := filepath.Join(dir, recordLogFile)
				blob, err := os.ReadFile(path)
				if err != nil {
					t.Fatalf("reading the log failed: %v", err)
				}
				if err := os.WriteFile(path, blob[:len(blob)/2], 0o644); err != nil {
					t.Fatalf("truncating the log failed: %v", err)
				}
			},
			want: "order log",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// A fresh store per case: they each need a record nothing has been done
			// to, or a case would inherit the previous case's damage.
			fresh := OpenBattleStore(t.TempDir())
			freshDir, err := fresh.Dir(recordTestID)
			if err != nil {
				t.Fatalf("resolving the record directory failed: %v", err)
			}
			copyRecord(t, dir, freshDir)
			tc.breakIt(t, freshDir)
			if _, err := fresh.Load(recordTestID); err == nil {
				t.Fatalf("a record that was %s was read as if nothing were wrong with it", tc.name)
			} else if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("the refusal did not say %q: %v", tc.want, err)
			} else {
				t.Logf("refused: %v", err)
			}
		})
	}

	t.Run("the untouched record beside them all", func(t *testing.T) {
		fresh := OpenBattleStore(t.TempDir())
		freshDir, err := fresh.Dir(recordTestID)
		if err != nil {
			t.Fatalf("resolving the record directory failed: %v", err)
		}
		copyRecord(t, dir, freshDir)
		got, err := fresh.Load(recordTestID)
		if err != nil {
			t.Fatalf("the untouched record did not load, so the refusal tests above prove nothing: %v", err)
		}
		if got.ID != recordTestID {
			t.Errorf("the untouched record loaded as %q, want %q", got.ID, recordTestID)
		}
	})
}

// TestBattleStoreRefusesAnIDThatEscapesIt is the check that makes "the id is a
// directory name" safe.
//
// The id becomes a path component, so an id carrying a separator would let a
// caller who can name a battle write outside the store they were handed. Both
// halves are tested: writing and reading, because a format that refused to read
// an escaping id but wrote one would be worse than useless.
func TestBattleStoreRefusesAnIDThatEscapesIt(t *testing.T) {
	cfg := loadConfig(t)
	store, _ := fightAndSave(t, cfg)
	res, rec := fightAgain(cfg)

	for _, id := range []string{"", ".", "..", "../outside", "a/b", `a\b`, "x\x00y"} {
		t.Run(strings.ReplaceAll(id, "\x00", "NUL"), func(t *testing.T) {
			if _, err := store.Dir(id); err == nil {
				t.Errorf("the id %q was accepted as a directory name", id)
			} else {
				t.Logf("refused as a directory: %v", err)
			}
			if err := store.Save(id, Roster{Units: 1}, Roster{Units: 1}, res, rec); err == nil {
				t.Errorf("the id %q was written", id)
			}
			if _, err := store.Load(id); err == nil {
				t.Errorf("the id %q was read", id)
			}
		})
	}
	// And nothing escaped: the store's parent is still empty.
	entries, err := os.ReadDir(store.Root())
	if err != nil {
		t.Fatalf("reading the store failed: %v", err)
	}
	for _, e := range entries {
		if e.Name() != recordTestID {
			t.Errorf("the store holds %q after seven refused ids", e.Name())
		}
	}
}

// TestSaveBattleRefusesABattleItCouldNotReplay is the write-side half of the
// same discipline.
//
// Three refusals, and each is a case where saving would produce a file that looks
// like a record and is not one: no result to compare against, no log to replay
// from, and a log that refused rows and therefore does not describe its battle.
func TestSaveBattleRefusesABattleItCouldNotReplay(t *testing.T) {
	cfg := loadConfig(t)
	script := NewScript("refusals", recordTestSeed,
		Roster{Units: recordTestUnits}, Roster{Units: recordTestUnits})
	res, rec, err := RunScript(cfg, script, 0)
	if err != nil {
		t.Fatalf("fighting the test battle failed: %v", err)
	}
	a, b := script.Rosters()

	t.Run("no result to compare the replay against", func(t *testing.T) {
		err := SaveBattle(t.TempDir(), "x", a, b, nil, rec)
		if err == nil {
			t.Fatal("a record with no result was saved")
		}
		t.Logf("refused: %v", err)
	})

	t.Run("no order log to replay from", func(t *testing.T) {
		for _, rec := range []*Recording{nil, {Seed: 1, ConfigVersion: cfg.Version}} {
			if err := SaveBattle(t.TempDir(), "x", a, b, res, rec); err == nil {
				t.Fatal("a record with no order log was saved")
			}
		}
		t.Logf("refused: %v", SaveBattle(t.TempDir(), "x", a, b, res, nil))
	})

	t.Run("a log that refused rows", func(t *testing.T) {
		bounded := rec
		bounded.Log = NewOrderLog(1)
		if _, ok := bounded.Log.Append(Order{Tick: 0, Unit: 0, Side: SideA, Kind: OrderHold}); !ok {
			t.Fatal("the bounded log refused its only row, so this test would not be testing a refusal")
		}
		if _, ok := bounded.Log.Append(Order{Tick: 1, Unit: 1, Side: SideA, Kind: OrderHold}); ok {
			t.Fatal("the bounded log accepted a second row, so it is not bounded and this test proves nothing")
		}
		err := SaveBattle(t.TempDir(), "x", a, b, res, bounded)
		if err == nil {
			t.Fatal("a record whose log refused rows was saved; it could never be replayed")
		}
		t.Logf("refused: %v", err)
	})
}

// TestTheReplaySaysSoWhenItDoesNotMatch is claim 4: the check can fail.
//
// Two subtests, and the control is inside the first one. A verifier that always
// reported MATCHED would pass every other test in this file, because every other
// test in this file is looking for two runs that agree. So the tampered record is
// checked alongside the untampered one in the SAME subtest, and the tampered one
// has to report MISMATCH.
//
// What is tampered with is the recorded RESULT, not the log. The log's digest is
// checked on read, so editing an order produces a refusal rather than a mismatch,
// and a mismatch is the more interesting finding: the file was internally
// consistent and the battle it describes is not the one that was recorded.
func TestTheReplaySaysSoWhenItDoesNotMatch(t *testing.T) {
	cfg := loadConfig(t)
	store, res := fightAndSave(t, cfg)
	dir, err := store.Dir(recordTestID)
	if err != nil {
		t.Fatalf("resolving the record directory failed: %v", err)
	}

	t.Run("the untampered record beside the tampered one", func(t *testing.T) {
		control := OpenBattleStore(t.TempDir())
		controlDir, err := control.Dir(recordTestID)
		if err != nil {
			t.Fatalf("resolving the record directory failed: %v", err)
		}
		copyRecord(t, dir, controlDir)
		ok, err := control.Verify(cfg, recordTestID)
		if err != nil {
			t.Fatalf("the untampered record did not replay: %v", err)
		}
		if !ok.Match {
			t.Fatalf("the untampered record did not match, so the mismatch below would mean nothing: %s", ok)
		}
		t.Logf("control matched: %s", ok)

		broken := OpenBattleStore(t.TempDir())
		brokenDir, err := broken.Dir(recordTestID)
		if err != nil {
			t.Fatalf("resolving the record directory failed: %v", err)
		}
		copyRecord(t, dir, brokenDir)
		// One recorded casualty figure, moved. Everything else in the record is
		// still true, so the reader is handed a file it cannot detect a problem
		// with and has to take the comparison on trust.
		rewriteIndex(t, brokenDir, func(idx *recordFile) {
			idx.Original.Sides[1].Dead += 0.5
		})
		bad, err := broken.Verify(cfg, recordTestID)
		if err != nil {
			t.Fatalf("replaying a record with a wrong recorded result failed rather than disagreeing: %v", err)
		}
		if bad.Match {
			t.Fatal("a record whose recorded casualties were changed was reported as a match")
		}
		if !strings.Contains(bad.Diff, "side B dead") {
			t.Errorf("the mismatch does not name the number that moved: %q", bad.Diff)
		}
		if !strings.Contains(bad.String(), "MISMATCH") {
			t.Errorf("the verdict does not read as a mismatch: %s", bad)
		}
		t.Logf("a recorded casualty figure moved and it is reported: %s", bad)
	})

	t.Run("a recorded result hash that is not this battle", func(t *testing.T) {
		broken := OpenBattleStore(t.TempDir())
		brokenDir, err := broken.Dir(recordTestID)
		if err != nil {
			t.Fatalf("resolving the record directory failed: %v", err)
		}
		copyRecord(t, dir, brokenDir)
		rewriteIndex(t, brokenDir, func(idx *recordFile) {
			idx.Original.ResultHash = strings.Repeat("0", 16)
			idx.Original.StateHash = strings.Repeat("f", 16)
		})
		bad, err := broken.Verify(cfg, recordTestID)
		if err != nil {
			t.Fatalf("replaying a record with a wrong recorded hash failed rather than disagreeing: %v", err)
		}
		if bad.Match {
			t.Fatal("a record carrying a hash no battle produced was reported as a match")
		}
		// Every published number in the record still agrees, because only the hash
		// was edited. The verdict has to say so rather than naming a casualty
		// figure that did not move, because a reader who went looking for a moved
		// number would find none and conclude the tool was wrong.
		if !strings.Contains(bad.Diff, "every number here agrees") {
			t.Errorf("the mismatch blames a number that did not move: %q", bad.Diff)
		}
		if res.HashString() == strings.Repeat("0", 16) {
			t.Fatal("this battle happened to hash to zero, so the test proves nothing")
		}
		t.Logf("a recorded hash that is not this battle's: %s", bad)
	})
}

// TestVerifyRecordedBattleRefusesABalanceFileThatMovedOn is the record path
// reaching the same refusal battle.Replay already makes.
//
// A record carries the balance version it was written under, and a replay under
// different constants is a what-if and not a replay. It is tested here as well as
// in replay_test.go because the record is a second way in and a refusal that only
// existed on one of them would be a hole.
func TestVerifyRecordedBattleRefusesABalanceFileThatMovedOn(t *testing.T) {
	cfg := loadConfig(t)
	store, res := fightAndSave(t, cfg)
	got, err := store.Load(recordTestID)
	if err != nil {
		t.Fatalf("reading the record failed: %v", err)
	}
	moved := *got
	moved.ConfigVersion = cfg.Version + "-from-the-future"
	if _, err := VerifyRecordedBattle(cfg, &moved); err == nil {
		t.Fatal("a record from a different balance version was replayed under this one")
	} else if !strings.Contains(err.Error(), "what-if") {
		t.Errorf("the refusal does not explain itself: %v", err)
	} else {
		t.Logf("refused: %v", err)
	}
	// The control, because a reader of this test should be able to see that the
	// record it just refused is the same record it accepted a moment ago.
	if _, err := VerifyRecordedBattle(cfg, got); err != nil {
		t.Fatalf("the same record under its own balance version was refused: %v", err)
	}
	if res.ConfigVersion != cfg.Version {
		t.Fatalf("the test's own record is under %q and the config is %q; the refusal above is meaningless",
			res.ConfigVersion, cfg.Version)
	}
}

// TestBattleStoreListsWhatIsInIt is the -list flag's behaviour, including the two
// kinds of thing it has to decide about.
func TestBattleStoreListsWhatIsInIt(t *testing.T) {
	cfg := loadConfig(t)
	store := OpenBattleStore(filepath.Join(t.TempDir(), "battles"))
	if ids, err := store.IDs(); err != nil || len(ids) != 0 {
		t.Errorf("a store that does not exist listed %v (%v); a directory nobody has written to is a store "+
			"with nothing in it, not an error", ids, err)
	}
	if _, res := fightAndSaveAt(t, cfg, store); res == nil {
		t.Fatal("recording into a fresh store produced no battle")
	}
	// Two more ids, plus the things a person might leave in a store directory.
	for _, id := range []string{"aaa-first", "zzz-last"} {
		dir, err := store.Dir(id)
		if err != nil {
			t.Fatalf("resolving %q failed: %v", id, err)
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("making %q failed: %v", id, err)
		}
		if _, err := os.Stat(filepath.Join(dir, recordIndexFile)); err == nil {
			t.Fatalf("%q holds a battle.json, so this test's stranger case is not a stranger", id)
		}
	}
	if err := os.WriteFile(filepath.Join(store.Root(), "a-stray-file.txt"), []byte("notes"), 0o644); err != nil {
		t.Fatalf("writing the stray file failed: %v", err)
	}
	ids, err := store.IDs()
	if err != nil {
		t.Fatalf("listing the store failed: %v", err)
	}
	if len(ids) != 1 || ids[0] != recordTestID {
		t.Errorf("the store listed %v, want exactly [%s]: a directory with no record in it and a loose file "+
			"are not battles and must not be listed as ones", ids, recordTestID)
	}
}

// copyRecord copies a record directory from one place to another.
//
// Used so every case in a refusal table starts from the same good record and a
// case cannot inherit the previous case's damage.
func copyRecord(t *testing.T, from, to string) {
	t.Helper()
	for _, name := range []string{recordIndexFile, recordLogFile} {
		blob, err := os.ReadFile(filepath.Join(from, name))
		if err != nil {
			t.Fatalf("reading %s failed: %v", name, err)
		}
		if err := os.MkdirAll(to, 0o755); err != nil {
			t.Fatalf("making %s failed: %v", to, err)
		}
		if err := os.WriteFile(filepath.Join(to, name), blob, 0o644); err != nil {
			t.Fatalf("writing %s failed: %v", name, err)
		}
	}
}

// fightAgain re-runs the record tests' battle and hands back its recording.
//
// The write-side refusal tests need a valid Result and Recording to damage, and
// they must not be holding the ones fightAndSave wrote, because a test that
// damages the record the control case then reads is testing nothing.
func fightAgain(cfg *config.Config) (*Result, *Recording) {
	script := NewScript("record test", recordTestSeed,
		Roster{Units: recordTestUnits}, Roster{Units: recordTestUnits})
	res, rec, err := RunScript(cfg, script, 0)
	if err != nil {
		panic("battle: the record tests' own battle did not fight: " + err.Error())
	}
	return res, rec
}
