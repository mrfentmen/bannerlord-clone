package simrun

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// THE TESTS FOR THE TWO BATTLE COMMANDS.
//
// The commands are tested here rather than only by running the binary, because a
// flag rename is exactly the kind of change no test notices and every person
// notices. Each test calls the exported function with its own writers and its own
// config loader, so nothing here touches the filesystem outside t.TempDir() and
// nothing here depends on what config/balance.toml says today.
//
// The exit codes are the assertion in most of these, because they are what a CI
// job sees. A command that prints the right answer and exits 0 on a mismatch is
// worse than one that prints nothing and exits 1.

// cmdFunc is the shape both commands have, so one helper can drive either.
type cmdFunc func(args []string, out, errOut io.Writer, load func(string) (*config.Config, error)) int

// loadTestConfig is the loader the commands are given here: the shipped balance
// file, and an error rather than an exit when it will not load.
func loadTestConfig(t testing.TB) func(string) (*config.Config, error) {
	t.Helper()
	return func(path string) (*config.Config, error) {
		if path == "" {
			path = filepath.Join("..", "..", "config", "balance.toml")
		}
		return config.Load(path)
	}
}

// run executes a command and hands back its exit code and both streams.
func run(t *testing.T, fn cmdFunc, args ...string) (int, string, string) {
	t.Helper()
	return runWith(t, fn, loadTestConfig(t), args...)
}

func runWith(t *testing.T, fn cmdFunc, load func(string) (*config.Config, error), args ...string) (int, string, string) {
	t.Helper()
	var out, errOut bytes.Buffer
	code := fn(args, &out, &errOut, load)
	return code, out.String(), errOut.String()
}

// mustRecord records a battle and fails the test if it does not.
//
// Six of these tests need a recorded battle before they can test anything else,
// and each of them would otherwise carry the same twelve lines of record-then-
// check-the-exit-code.
func mustRecord(t *testing.T, dir string, args ...string) (int, string) {
	t.Helper()
	full := append([]string{"-dir", dir}, args...)
	code, out, errOut := run(t, BattleRecordCmd, full...)
	if code != exitOK {
		t.Fatalf("recording a battle exited %d\nstdout:\n%s\nstderr:\n%s", code, out, errOut)
	}
	return code, out
}

// TestBattleCmdThenReplayCmdMatches is the whole command, end to end.
//
// It is MASTER_PLAN.md's acceptance criterion for the replay CLI, run through the
// flags a person would type: record a battle, list the store, replay it, get
// MATCHED and exit 0. The intermediate printouts are asserted too, because a
// command that reaches the right verdict while printing nothing a reader can use
// has only half done the job.
func TestBattleCmdThenReplayCmdMatches(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "battles")

	_, out := mustRecord(t, dir, "-seed", "4242", "-a-units", "6", "-b-units", "6",
		"-label", "the CLI acceptance battle")
	for _, want := range []string{
		"recorded battle battle-4242",
		`balance "`,
		"result hash ",
		"replay it with: simrun replay -battle battle-4242",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("the record command did not print %q:\n%s", want, out)
		}
	}

	// -list finds it.
	code, out, errOut := run(t, ReplayCmd, "-list", "-dir", dir)
	if code != exitOK {
		t.Fatalf("listing the store exited %d\nstderr:\n%s", code, errOut)
	}
	if strings.TrimSpace(out) != "battle-4242" {
		t.Errorf("the store listed %q, want the one battle that was recorded", strings.TrimSpace(out))
	}

	// Replaying it matches, and says so with the numbers a reader wants.
	code, out, errOut = run(t, ReplayCmd, "-battle", "battle-4242", "-dir", dir)
	if code != exitOK {
		t.Fatalf("replaying a recorded battle exited %d, want %d\nstdout:\n%s\nstderr:\n%s",
			code, exitOK, out, errOut)
	}
	if !strings.Contains(out, "replay MATCHED") {
		t.Errorf("the replay command did not report a match:\n%s", out)
	}
	// The acceptance criterion names the outcome and the casualty counts, so both
	// have to be on the screen. A verdict line alone does not show them.
	for _, want := range []string{"recorded:", "replayed:", "dead", "wounded", "surrend"} {
		if !strings.Contains(out, want) {
			t.Errorf("the replay command did not print %q, and the acceptance criterion asks for the "+
				"outcome and the casualty counts:\n%s", want, out)
		}
	}
	if errOut != "" {
		t.Errorf("the replay command wrote to stderr on success: %s", errOut)
	}
}

// TestRecordingTheSameBattleTwiceIsTheSameRecord is the determinism claim about
// the command rather than about the engine: the same flags and the same seed write
// the same files.
//
// It is what makes a record usable as a checked-in artifact. A record format that
// wrote a timestamp would replay perfectly and produce a diff on every commit.
func TestRecordingTheSameBattleTwiceIsTheSameRecord(t *testing.T) {
	first := filepath.Join(t.TempDir(), "battles")
	second := filepath.Join(t.TempDir(), "battles")
	mustRecord(t, first, "-seed", "3131", "-a-units", "4", "-b-units", "4", "-label", "twice")
	mustRecord(t, second, "-seed", "3131", "-a-units", "4", "-b-units", "4", "-label", "twice")

	for _, name := range []string{"battle.json", "order.log"} {
		a := readFile(t, filepath.Join(first, "battle-3131", name))
		b := readFile(t, filepath.Join(second, "battle-3131", name))
		if a != b {
			t.Errorf("%s is not byte-identical between two recordings of the same battle:\n%s\n---\n%s", name, a, b)
		}
	}
}

// TestReplayCmdExitsOneAndSaysWhichNumberMoved is the mismatch path.
//
// A record is recorded, one recorded casualty figure in battle.json is moved, and
// the command has to exit 1 and name the number. Exit 1 and not 2 or 3 is the
// point: those two mean the command was used wrongly and the record was
// unrunnable, and a CI job that treated all three as the same failure could not
// tell a balance change from a typo.
func TestReplayCmdExitsOneAndSaysWhichNumberMoved(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "battles")
	mustRecord(t, dir, "-seed", "5150", "-a-units", "6", "-b-units", "6")

	// The control first: this record replays cleanly, so a failure below is about
	// the edit and not about the command.
	if code, out, errOut := run(t, ReplayCmd, "-battle", "battle-5150", "-dir", dir); code != exitOK {
		t.Fatalf("the untampered record exited %d, so the mismatch below would mean nothing\nstdout:\n%s\nstderr:\n%s",
			code, out, errOut)
	}
	bumpRecordedCasualties(t, filepath.Join(dir, "battle-5150", "battle.json"), "B")

	code, out, errOut := run(t, ReplayCmd, "-battle", "battle-5150", "-dir", dir)
	if code != exitMismatch {
		t.Fatalf("a record whose recorded casualties were changed exited %d, want %d (a mismatch)\nstdout:\n%s\nstderr:\n%s",
			code, exitMismatch, out, errOut)
	}
	if !strings.Contains(out, "replay MISMATCH") {
		t.Errorf("the mismatch was not reported as one:\n%s", out)
	}
	if !strings.Contains(out, "side B dead") {
		t.Errorf("the mismatch does not name the number that moved:\n%s", out)
	}
	if errOut != "" {
		t.Errorf("a mismatch wrote to stderr; it is a finding, not a failure of the command: %s", errOut)
	}
}

// TestReplayCmdExitsThreeWhenTheRecordCannotBeRead is the unrunnable path, and
// it is separate from the mismatch path because it means something different: the
// question was not answered, rather than answered no.
func TestReplayCmdExitsThreeWhenTheRecordCannotBeRead(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "battles")

	t.Run("no such battle", func(t *testing.T) {
		code, _, errOut := run(t, ReplayCmd, "-battle", "never-fought", "-dir", dir)
		if code != exitUnrunnable {
			t.Errorf("replaying a battle nobody recorded exited %d, want %d", code, exitUnrunnable)
		}
		if !strings.Contains(errOut, "no recorded battle") {
			t.Errorf("the refusal does not say the battle is not there: %s", errOut)
		}
	})

	t.Run("a balance file that will not load", func(t *testing.T) {
		refuse := func(string) (*config.Config, error) {
			return nil, fmt.Errorf("config: %s", filepath.Join("no", "such", "balance.toml"))
		}
		code, out, errOut := runWith(t, ReplayCmd, refuse, "-battle", "battle-1", "-dir", dir)
		if code != exitUnrunnable {
			t.Errorf("a missing balance file exited %d, want %d", code, exitUnrunnable)
		}
		if !strings.Contains(errOut, filepath.Join("no", "such", "balance.toml")) {
			t.Errorf("the refusal does not carry the config's own message: %s", errOut)
		}
		if out != "" {
			t.Errorf("a command that could not load its config still printed a result:\n%s", out)
		}
	})

	t.Run("a record whose log is corrupt", func(t *testing.T) {
		store := filepath.Join(t.TempDir(), "battles")
		mustRecord(t, store, "-seed", "6161", "-a-units", "4", "-b-units", "4")
		writeFile(t, filepath.Join(store, "battle-6161", "order.log"), "this is not an order log\n")
		code, _, errOut := run(t, ReplayCmd, "-battle", "battle-6161", "-dir", store)
		if code != exitUnrunnable {
			t.Errorf("a corrupt order log exited %d, want %d", code, exitUnrunnable)
		}
		if !strings.Contains(errOut, "order log") {
			t.Errorf("the refusal does not name the file at fault: %s", errOut)
		}
	})

	t.Run("a record whose log is missing", func(t *testing.T) {
		store := filepath.Join(t.TempDir(), "battles")
		mustRecord(t, store, "-seed", "6262", "-a-units", "4", "-b-units", "4")
		if err := os.Remove(filepath.Join(store, "battle-6262", "order.log")); err != nil {
			t.Fatalf("removing the log failed: %v", err)
		}
		code, _, errOut := run(t, ReplayCmd, "-battle", "battle-6262", "-dir", store)
		if code != exitUnrunnable {
			t.Errorf("a record with no order log exited %d, want %d", code, exitUnrunnable)
		}
		if !strings.Contains(errOut, "order log") {
			t.Errorf("the refusal does not name the missing file: %s", errOut)
		}
	})
}

// TestBattleCmdRefusesASeedlessBattle is the usage path.
//
// A battle with no seed is not a battle anybody can replay, so it is refused
// before anything is fought rather than fought and then found to be unreplayable.
func TestBattleCmdRefusesASeedlessBattle(t *testing.T) {
	code, out, errOut := run(t, BattleRecordCmd, "-a-units", "6", "-b-units", "6", "-dir", t.TempDir())
	if code != exitUsage {
		t.Errorf("recording with no seed exited %d, want %d", code, exitUsage)
	}
	if !strings.Contains(errOut, "-seed is required") {
		t.Errorf("the refusal does not name the flag: %s", errOut)
	}
	if out != "" {
		t.Errorf("a refused command still printed a result:\n%s", out)
	}
}

// TestReplayCmdNeedsABattleID is the other usage path, and the one a person hits
// first: they type `simrun replay` and nothing else.
func TestReplayCmdNeedsABattleID(t *testing.T) {
	code, out, errOut := run(t, ReplayCmd, "-dir", t.TempDir())
	if code != exitUsage {
		t.Errorf("replaying with no id exited %d, want %d", code, exitUsage)
	}
	if !strings.Contains(errOut, "-battle is required") {
		t.Errorf("the refusal does not name the flag: %s", errOut)
	}
	if !strings.Contains(errOut, "-list") {
		t.Errorf("the refusal does not say how to find an id: %s", errOut)
	}
	if out != "" {
		t.Errorf("a refused command still printed a result:\n%s", out)
	}
}

// TestReplayCmdListsAnEmptyStoreWithoutFailing is the small thing that would
// otherwise be a bug report: running -list before recording anything.
func TestReplayCmdListsAnEmptyStoreWithoutFailing(t *testing.T) {
	code, out, errOut := run(t, ReplayCmd, "-list", "-dir", filepath.Join(t.TempDir(), "nothing-here"))
	if code != exitOK {
		t.Errorf("listing a store that does not exist exited %d, want %d: %s", code, exitOK, errOut)
	}
	if !strings.Contains(out, "no battles recorded") {
		t.Errorf("an empty store printed nothing a reader can tell from a failure: %q", out)
	}
}

// TestReplayCmdTakesAScript is the scripted half of the record command.
//
// The golden fixtures are scripts, so a record store that could not be filled from
// one could not hold the fixtures, and the replay CLI would be no use to the one
// thing this whole format exists to serve: a battle somebody wrote down.
func TestReplayCmdTakesAScript(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "battles")
	// A checked-in golden fixture, not a script written here, so the test is
	// asking whether the command can record the artifacts the repo actually ships.
	golden := filepath.Join("..", "battle", "testdata", "golden", "one-side-ordered-4v4.script")
	// The seed is read from the fixture rather than assumed, because a fixture
	// whose seed changed would otherwise make this test fail with a message about
	// a mismatch instead of one about a stale expectation.
	goldenSeed := scriptSeed(t, golden)
	id := "battle-" + goldenSeed

	t.Run("a script is fought and recorded", func(t *testing.T) {
		mustRecord(t, dir, "-seed", goldenSeed, "-script", golden)
		code, out, errOut := run(t, ReplayCmd, "-battle", id, "-dir", dir)
		if code != exitOK {
			t.Fatalf("replaying a scripted battle exited %d\nstdout:\n%s\nstderr:\n%s", code, out, errOut)
		}
		if !strings.Contains(out, "replay MATCHED") {
			t.Errorf("a scripted battle did not replay:\n%s", out)
		}
	})

	t.Run("a script is not fought under a seed that is not its own", func(t *testing.T) {
		code, _, errOut := run(t, BattleRecordCmd, "-seed", goldenSeed+"1", "-script", golden, "-dir", dir)
		if code != exitUsage {
			t.Errorf("a script fought under another seed exited %d, want %d", code, exitUsage)
		}
		if !strings.Contains(errOut, "seed") {
			t.Errorf("the refusal does not mention the seed: %s", errOut)
		}
	})

	t.Run("a script that is not there", func(t *testing.T) {
		code, _, errOut := run(t, BattleRecordCmd, "-seed", goldenSeed, "-script",
			filepath.Join(t.TempDir(), "no-such-script"), "-dir", dir)
		if code != exitUnrunnable {
			t.Errorf("a missing script exited %d, want %d", code, exitUnrunnable)
		}
		if !strings.Contains(errOut, "-script") {
			t.Errorf("the refusal does not name the flag: %s", errOut)
		}
	})

	t.Run("a script that does not parse", func(t *testing.T) {
		bad := filepath.Join(t.TempDir(), "bad.battle")
		writeFile(t, bad, "{\"kind\":\"battle_script\",\"version\":1,\"name\":\"x\"}\n")
		code, _, errOut := run(t, BattleRecordCmd, "-seed", "1", "-script", bad, "-dir", dir)
		if code != exitUnrunnable {
			t.Errorf("a malformed script exited %d, want %d", code, exitUnrunnable)
		}
		if !strings.Contains(errOut, "battle:") {
			t.Errorf("the refusal does not carry the decoder's own message: %s", errOut)
		}
	})
}

// TestReplayCmdQuietPrintsOnlyTheVerdict is the flag a CI job would use, and it
// has to print exactly one line so that a log of a nightly replay sweep is a list
// of verdicts rather than a wall of tables.
func TestReplayCmdQuietPrintsOnlyTheVerdict(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "battles")
	mustRecord(t, dir, "-seed", "7373", "-a-units", "4", "-b-units", "4")
	code, out, errOut := run(t, ReplayCmd, "-battle", "battle-7373", "-dir", dir, "-quiet")
	if code != exitOK {
		t.Fatalf("a quiet replay exited %d\nstderr:\n%s", code, errOut)
	}
	if lines := strings.Count(strings.TrimSpace(out), "\n") + 1; lines != 1 {
		t.Errorf("-quiet printed %d lines, want 1:\n%s", lines, out)
	}
	if !strings.Contains(out, "replay MATCHED") {
		t.Errorf("-quiet did not print the verdict: %s", out)
	}
}

// bumpRecordedCasualties moves one recorded casualty figure in a battle.json.
//
// It decodes and re-encodes the whole document rather than replacing text, so the
// edit is a change to the VALUE the file states and not to the way the encoder
// happened to spell it. Numbers are carried through as json.Number so that
// re-encoding does not itself change any figure the test did not mean to touch.
func bumpRecordedCasualties(t *testing.T, path, side string) {
	t.Helper()
	blob := readFile(t, path)
	dec := json.NewDecoder(strings.NewReader(blob))
	dec.UseNumber()
	var doc map[string]any
	if err := dec.Decode(&doc); err != nil {
		t.Fatalf("%s does not parse as JSON: %v", path, err)
	}
	original, ok := doc["original"].(map[string]any)
	if !ok {
		t.Fatalf("%s has no original result, so this test would be editing nothing", path)
	}
	sides, ok := original["sides"].([]any)
	if !ok || len(sides) != 2 {
		t.Fatalf("%s has %v sides, want 2", path, len(sides))
	}
	moved := false
	for _, raw := range sides {
		entry, ok := raw.(map[string]any)
		if !ok || entry["side"] != side {
			continue
		}
		before, ok := entry["dead"].(json.Number)
		if !ok {
			t.Fatalf("%s side %s has no dead figure to move", path, side)
		}
		after, err := strconvParseFloat(before.String())
		if err != nil {
			t.Fatalf("%s side %s has an unreadable dead figure %q: %v", path, side, before, err)
		}
		entry["dead"] = json.Number(fmt.Sprintf("%.17g", after+0.5))
		moved = true
	}
	if !moved {
		t.Fatalf("%s has no side %s, so this test edited nothing", path, side)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatalf("re-encoding %s failed: %v", path, err)
	}
	writeFile(t, path, string(out)+"\n")
}

// scriptSeed reads the seed out of a script file's header line.
//
// The header is JSONL, so this is one json.Unmarshal of the first line rather than
// a parse of the format, and a failure here names the file and says so.
func scriptSeed(t *testing.T, path string) string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("opening %s failed: %v", path, err)
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	if !sc.Scan() {
		t.Fatalf("%s is empty: %v", path, sc.Err())
	}
	var hdr struct {
		Seed uint64 `json:"seed"`
	}
	if err := json.Unmarshal(sc.Bytes(), &hdr); err != nil {
		t.Fatalf("the header of %s does not parse: %v", path, err)
	}
	return strconv.FormatUint(hdr.Seed, 10)
}

// strconvParseFloat is fmt.Sscan through a string, kept local so the test does not
// import strconv for one call and so the failure message names the file.
func strconvParseFloat(s string) (float64, error) {
	var v float64
	if _, err := fmt.Sscan(s, &v); err != nil {
		return 0, err
	}
	return v, nil
}

// readFile and writeFile keep the tests' file handling to two lines each.
func readFile(t *testing.T, path string) string {
	t.Helper()
	blob, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s failed: %v", path, err)
	}
	return string(blob)
}

func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("writing %s failed: %v", path, err)
	}
}
