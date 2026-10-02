// The two battle subcommands: record a battle, then replay it from its files.
//
// MASTER_PLAN.md's "Deterministic seed derivation + replay harness" asks for
// `simrun replay --battle <id>` to re-run a recorded battle headlessly and for
// the replay's outcome and casualty counts to match the original. These are the
// two functions that do it, kept out of package main so that both are callable
// from a test: a CLI whose only verification is a person typing at it is a CLI
// that stops working the first time somebody renames a flag.
//
// Both return an exit code rather than calling os.Exit, and both write to an
// io.Writer rather than to stdout directly, for the same reason. `simrun main`
// passes os.Stdout and os.Exit; nothing else in the program passes either.
package simrun

import (
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// DefaultBattleDir is where recorded battles go when no -dir is given. It sits
// under logs/ because that is where a run's other output goes, so a person
// looking for what a simrun produced finds all of it in one place.
const DefaultBattleDir = "logs/battles"

// Exit codes, kept apart because they mean different things to whoever acts on
// them. A CI job that only sees "failed" cannot tell a battle that changed from
// a record that is not there.
const (
	// exitOK is a replay that reproduced the battle.
	exitOK = 0
	// exitMismatch is a replay that ran and disagreed. That is a FINDING, not a
	// crash: the replay path worked and the answer was no.
	exitMismatch = 1
	// exitUsage is a command line that does not make sense.
	exitUsage = 2
	// exitUnrunnable is a record that could not be replayed at all: a corrupt
	// file, a balance file whose version has moved on, a roster the log was not
	// recorded against.
	exitUnrunnable = 3
)

// BattleRecordCmd fights a battle, records its orders, and saves the record.
//
// It is the other half of ReplayCmd and it is here rather than left to a test
// because a replay CLI with no way to produce something to replay is a CLI that
// can only be exercised by the test that wrote its fixture.
//
// The seed is required and the id defaults to it, because the pair (id, seed) is
// what makes two runs of this command comparable: recording the same battle id
// twice under the same seed writes byte-identical files, which is the
// determinism claim about the record format itself rather than about the engine.
func BattleRecordCmd(args []string, out, errOut io.Writer, load func(string) (*config.Config, error)) int {
	fs := flag.NewFlagSet("battle", flag.ContinueOnError)
	fs.SetOutput(errOut)
	seed := fs.Uint64("seed", 0, "battle seed (required)")
	id := fs.String("id", "", "battle id, and the record's directory name (default: battle-<seed>)")
	dir := fs.String("dir", DefaultBattleDir, "battle store directory")
	aUnits := fs.Int("a-units", 20, "units on side A")
	bUnits := fs.Int("b-units", 20, "units on side B")
	aRanged := fs.Bool("a-ranged", false, "side A is all shooters")
	bRanged := fs.Bool("b-ranged", false, "side B is all shooters")
	label := fs.String("label", "", "battle label, carried into the record because the result hash covers it")
	scriptPath := fs.String("script", "", "order script to fight instead of an uncommanded battle")
	bound := fs.Int("order-bound", 0, "order log row limit (0 is unbounded)")
	cfgPath := fs.String("config", "", "balance config path")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	if *seed == 0 {
		fmt.Fprintln(errOut, "battle: -seed is required; a battle with no seed is not a battle anybody can replay")
		return exitUsage
	}
	cfg, err := load(*cfgPath)
	if err != nil {
		fmt.Fprintf(errOut, "battle: %v\n", err)
		return exitUnrunnable
	}

	script := battle.NewScript(*label, *seed,
		battle.Roster{Units: *aUnits, AllRanged: *aRanged},
		battle.Roster{Units: *bUnits, AllRanged: *bRanged})
	if *scriptPath != "" {
		blob, err := os.ReadFile(*scriptPath)
		if err != nil {
			fmt.Fprintf(errOut, "battle: -script %s: %v\n", *scriptPath, err)
			return exitUnrunnable
		}
		decoded, err := battle.DecodeScript(blob)
		if err != nil {
			fmt.Fprintf(errOut, "battle: %v\n", err)
			return exitUnrunnable
		}
		if decoded.Seed != *seed {
			fmt.Fprintf(errOut, "battle: the script %s carries seed %d and -seed is %d; the seed is the "+
				"battle's, so a script may not be fought under a seed that is not its own\n",
				*scriptPath, decoded.Seed, *seed)
			return exitUsage
		}
		script = decoded
	}
	if *id == "" {
		*id = fmt.Sprintf("battle-%d", *seed)
	}
	a, b := script.Rosters()

	res, rec, err := battle.RunScript(cfg, script, *bound)
	if err != nil {
		fmt.Fprintf(errOut, "battle: %v\n", err)
		return exitUnrunnable
	}
	store := battle.OpenBattleStore(*dir)
	if err := store.Save(*id, a, b, res, rec); err != nil {
		fmt.Fprintf(errOut, "battle: %v\n", err)
		return exitUnrunnable
	}
	fmt.Fprintf(out, "recorded battle %s in %s\n", *id, *dir)
	fmt.Fprintf(out, "  seed %d, balance %q, %d orders, %d ticks, %s\n",
		res.Seed, res.ConfigVersion, rec.Log.Len(), res.Ticks,
		res.Outcome.Kind.String()+" ("+res.Outcome.Reason.String()+")")
	fmt.Fprint(out, battle.SummariseResult(res).Format())
	fmt.Fprintf(out, "  result hash %s\n", res.HashString())
	fmt.Fprintf(out, "  replay it with: simrun replay -battle %s -dir %s\n", *id, *dir)
	return exitOK
}

// ReplayCmd re-runs a recorded battle from its files and compares the result
// against the one the record carries.
//
// The exit code is the point of the command. A mismatch is reported with the
// number that moved, not as an error string, because "the replay did not match,
// and side A lost 214.0 dead bodies where it recorded 198.5" is the answer to
// the question and not a failure of it.
func ReplayCmd(args []string, out, errOut io.Writer, load func(string) (*config.Config, error)) int {
	fs := flag.NewFlagSet("replay", flag.ContinueOnError)
	fs.SetOutput(errOut)
	id := fs.String("battle", "", "battle id to replay (required)")
	dir := fs.String("dir", DefaultBattleDir, "battle store directory")
	cfgPath := fs.String("config", "", "balance config path")
	quiet := fs.Bool("quiet", false, "print only the verdict")
	list := fs.Bool("list", false, "list the recorded battles and exit")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	store := battle.OpenBattleStore(*dir)
	if *list {
		ids, err := store.IDs()
		if err != nil {
			fmt.Fprintf(errOut, "replay: %v\n", err)
			return exitUnrunnable
		}
		if len(ids) == 0 {
			fmt.Fprintf(out, "no battles recorded in %s\n", *dir)
			return exitOK
		}
		sort.Strings(ids)
		for _, v := range ids {
			fmt.Fprintln(out, v)
		}
		return exitOK
	}
	if *id == "" {
		fmt.Fprintln(errOut, "replay: -battle is required; pass an id from -list, or record one with simrun battle")
		return exitUsage
	}
	cfg, err := load(*cfgPath)
	if err != nil {
		fmt.Fprintf(errOut, "replay: %v\n", err)
		return exitUnrunnable
	}
	check, err := store.Verify(cfg, *id)
	if err != nil {
		fmt.Fprintf(errOut, "replay: %v\n", err)
		return exitUnrunnable
	}
	if !*quiet {
		fmt.Fprintf(out, "replayed battle %s from %s\n", check.ID, *dir)
		fmt.Fprintf(out, "  seed %d, balance %q, %d orders, %d ticks, %.2fs of replayed fighting\n",
			check.Seed, check.ConfigVersion, check.Orders, check.Ticks, check.ElapsedSeconds)
		fmt.Fprintf(out, "  recorded: %s (%s), hash %s\n",
			check.Original.Outcome, check.Original.Reason, check.Want)
		fmt.Fprint(out, indent(check.Original.Format(), "    "))
		fmt.Fprintf(out, "  replayed: %s (%s), hash %s\n",
			check.Replay.Outcome, check.Replay.Reason, check.Got)
		fmt.Fprint(out, indent(check.Replay.Format(), "    "))
	}
	fmt.Fprintln(out, check)
	if !check.Match {
		return exitMismatch
	}
	return exitOK
}

// indent shifts a block of text so a table nested inside a sentence stays
// readable.
func indent(s, prefix string) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i, l := range lines {
		lines[i] = prefix + l
	}
	return strings.Join(lines, "\n") + "\n"
}
