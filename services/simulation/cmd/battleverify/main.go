// Command battleverify is the battle simulation's one-command verification.
//
//	battleverify
//
// runs the whole scenario suite headlessly, prints the standard report for every
// battle, prints a summary table, and exits non-zero if any invariant failed or
// any scenario did not complete. It is the definition of "the sim works" that the
// brief asks for: one command, one exit code, no adjectives.
//
//	battleverify -only symmetric -seed 7
//	battleverify -scale 4 -seeds 3
//
// runs fewer or more battles than the default. The defaults are the four scenarios
// the brief names, at their documented sizes, on one seed, because the default
// output of the default command should be the thing somebody reads when they ask
// whether the battle engine works.
//
// The exit code is the contract:
//
//	0  every scenario completed and every invariant held
//	1  a rule failed, or a scenario did not complete
//	2  the command was used wrongly, or the balance file did not load
//
// A run that cannot check something says so and still exits 0 if nothing failed,
// which is deliberate: a rule that cannot run is reported as "not checkable" with
// its reason, so the reader can see the gap. It is not silently counted as a pass,
// and it is not turned into a failure either, because a rule that cannot run says
// nothing about whether the engine is correct.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mbclone/simulation/internal/battleverify"
	"mbclone/simulation/internal/config"
)

func main() {
	os.Exit(run())
}

func run() int {
	fs := flag.NewFlagSet("battleverify", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	balance := fs.String("balance", "", "path to balance.toml (default: config/balance.toml walked up from this directory)")
	seed := fs.Uint64("seed", 20260930, "master seed")
	seeds := fs.Int("seeds", 1, "how many seeds to run each scenario on")
	scale := fs.Float64("scale", 1, "multiplies every scenario's unit count")
	only := fs.String("only", "", "comma separated scenario names to run (default: all)")
	quiet := fs.Bool("quiet", false, "print the summary table only, not each battle's report")
	asJSON := fs.Bool("json", false, "print the summary as JSON instead of a table")
	fs.Usage = usage
	if err := fs.Parse(os.Args[1:]); err != nil {
		return 2
	}
	if fs.NArg() > 0 {
		fmt.Fprintf(os.Stderr, "battleverify: unexpected argument %q; every option is a flag\n", fs.Arg(0))
		usage()
		return 2
	}
	if *seeds < 1 {
		fmt.Fprintf(os.Stderr, "battleverify: -seeds was %d; there is no such thing as zero seeds\n", *seeds)
		return 2
	}

	balancePath, cfg, err := loadBalance(*balance)
	if err != nil {
		fmt.Fprintf(os.Stderr, "battleverify: %v\n", err)
		return 2
	}

	scenarios, err := pick(*only)
	if err != nil {
		fmt.Fprintf(os.Stderr, "battleverify: %v\n", err)
		return 2
	}

	if !*quiet && !*asJSON {
		fmt.Printf("battle verification harness\n")
		fmt.Printf("balance file:   %s\n", balancePath)
		fmt.Printf("config version: %s\n", cfg.Version)
		fmt.Printf("scenarios:      %d, seeds each: %d, size scale: %g\n", len(scenarios), *seeds, *scale)
		fmt.Printf("invariant rules: %d\n", len(battleverify.RuleNames()))
		fmt.Println()
	}

	var runs []*battleverify.Run
	for _, sc := range scenarios {
		for i := 0; i < *seeds; i++ {
			// The seeds of one scenario differ by a fixed step rather than being
			// left to a base seed per index, so a size or seed sweep is
			// reproducible from the two numbers on the command line.
			s := *seed
			if *seeds > 1 {
				s = *seed + uint64(i)*100003
			}
			run := battleverify.RunScenario(cfg, balancePath, sc, s, *scale)
			runs = append(runs, run)
			if run.Err != nil {
				fmt.Fprintf(os.Stderr, "battleverify: %s (seed %d) did not run: %v\n", sc.Name, s, run.Err)
				continue
			}
			if !*quiet && !*asJSON {
				run.Report.Write(os.Stdout)
				fmt.Println()
			}
		}
	}

	reports := make([]*battleverify.Report, 0, len(runs))
	for _, r := range runs {
		if r.Report != nil {
			reports = append(reports, r.Report)
		}
	}

	if *asJSON {
		if err := writeJSON(runs, os.Stdout); err != nil {
			fmt.Fprintf(os.Stderr, "battleverify: %v\n", err)
			return 2
		}
	} else {
		fmt.Println("summary")
		battleverify.WriteSummaryTable(os.Stdout, reports)
		fmt.Println()
		fmt.Println("violations")
		battleverify.WriteViolations(os.Stdout, runs)
	}

	// The verdict, and the exit code it sets.
	failed, errored, unchecked, total := 0, 0, 0, 0
	for _, r := range runs {
		total++
		switch {
		case r.Err != nil:
			errored++
		case r.Findings == nil:
			errored++
		default:
			_, fail, skip := r.Findings.Counts()
			failed += fail
			unchecked += skip
		}
	}
	fmt.Printf("\n%d runs, %d with failed rules, %d that did not run, %d rule checks not checkable\n",
		total, failed, errored, unchecked)
	if failed == 0 && errored == 0 {
		fmt.Println("VERDICT: pass")
		return 0
	}
	fmt.Println("VERDICT: FAIL")
	return 1
}

// usage prints the command's help.
func usage() {
	fmt.Fprint(os.Stderr, `battleverify - run the battle simulation's verification suite

  battleverify                        every scenario, one seed, full reports
  battleverify -seeds 5               every scenario on five seeds
  battleverify -scale 4               four times the units, to ask about size
  battleverify -only symmetric        one scenario
  battleverify -json                  the summary as JSON, for a build to read

  -balance PATH   balance.toml to verify against (default config/balance.toml)
  -seed N         master seed
  -seeds N        seeds per scenario (default 1)
  -scale F        unit count multiplier (default 1)
  -only LIST      comma separated scenario names
  -quiet          summary table only
  -json           JSON summary instead of a table

exit 0 all scenarios completed and all invariants held
exit 1 a rule failed or a scenario did not complete
exit 2 bad usage, or the balance file did not load
`)
}

// loadBalance finds and loads the balance file.
//
// The path is walked up from the working directory so the command works from the
// module root, from cmd/battleverify, and from a build directory, which are three
// places somebody will run it from and only one of which they will think about.
// The path actually used is printed by the caller, because a verification claim
// against constants nobody can name is not evidence.
func loadBalance(explicit string) (string, *config.Config, error) {
	path := explicit
	if path == "" {
		found, err := findBalance()
		if err != nil {
			return "", nil, err
		}
		path = found
	}
	cfg, err := config.Load(path)
	if err != nil {
		return "", nil, fmt.Errorf("the balance file did not load from %s: %w", path, err)
	}
	return path, cfg, nil
}

// findBalance walks up looking for config/balance.toml.
func findBalance() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("cannot determine the working directory: %w", err)
	}
	for i := 0; i < 8; i++ {
		p := filepath.Join(dir, "config", "balance.toml")
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("could not find config/balance.toml by walking up from here; pass -balance PATH")
}

// pick resolves a comma separated list of scenario names.
func pick(list string) ([]battleverify.Scenario, error) {
	if strings.TrimSpace(list) == "" {
		return battleverify.Suite, nil
	}
	var out []battleverify.Scenario
	for _, name := range strings.Split(list, ",") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		sc, ok := battleverify.ScenarioByName(name)
		if !ok {
			known := make([]string, 0, len(battleverify.Suite))
			for _, s := range battleverify.Suite {
				known = append(known, s.Name)
			}
			return nil, fmt.Errorf("no scenario called %q; the suite has: %s", name, strings.Join(known, ", "))
		}
		out = append(out, sc)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("-only was given but named no scenario")
	}
	return out, nil
}

// jsonSummary is the machine readable form of a run, for a build step to read.
//
// It is deliberately flat and small: one object per run, the numbers the brief
// asks for, and the invariant counts. A build that wants to fail on a broken
// invariant reads failed_rules and not_ok from here rather than parsing a table.
type jsonSummary struct {
	Scenario    string  `json:"scenario"`
	Seed        uint64  `json:"seed"`
	Scale       float64 `json:"scale"`
	UnitsA      int     `json:"units_a"`
	UnitsB      int     `json:"units_b"`
	Ticks       int     `json:"ticks"`
	WallMS      int64   `json:"wall_ms"`
	AliveA      float64 `json:"alive_a"`
	AliveB      float64 `json:"alive_b"`
	CasualtiesA float64 `json:"casualties_a"`
	CasualtiesB float64 `json:"casualties_b"`
	RoutsA      int     `json:"routs_a"`
	RoutsB      int     `json:"routs_b"`
	Winner      string  `json:"winner"`
	DecidedBy   string  `json:"decided_by"`
	Hash        string  `json:"hash"`
	Rules       int     `json:"rules"`
	Passed      int     `json:"passed"`
	Failed      int     `json:"failed_rules"`
	NotChecked  int     `json:"not_checkable"`
	Error       string  `json:"error,omitempty"`
}

// writeJSON prints the summary as JSON.
func writeJSON(runs []*battleverify.Run, out *os.File) error {
	rows := make([]jsonSummary, 0, len(runs))
	for _, r := range runs {
		row := jsonSummary{Scenario: r.Scenario.Name, Seed: r.Seed, Scale: r.Scale}
		if r.Err != nil {
			row.Error = r.Err.Error()
			rows = append(rows, row)
			continue
		}
		rep := r.Report
		pass, fail, skip := r.Findings.Counts()
		row.UnitsA, row.UnitsB = rep.Units[0], rep.Units[1]
		row.Ticks = rep.Result.Ticks
		row.WallMS = rep.Wall.Milliseconds()
		row.AliveA, row.AliveB = rep.Sides[0].AliveBodies, rep.Sides[1].AliveBodies
		row.CasualtiesA = rep.Sides[0].Dead + rep.Sides[0].Wounded
		row.CasualtiesB = rep.Sides[1].Dead + rep.Sides[1].Wounded
		row.RoutsA, row.RoutsB = rep.Sides[0].Routed, rep.Sides[1].Routed
		row.Winner, row.DecidedBy = rep.Winner, rep.HowDecided
		row.Hash = rep.Hash
		row.Rules = len(r.Findings.Checks)
		row.Passed, row.Failed, row.NotChecked = pass, fail, skip
		rows = append(rows, row)
	}
	enc := json.NewEncoder(out)
	enc.SetIndent("", "  ")
	return enc.Encode(rows)
}
