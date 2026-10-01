// Command simrun is the headless runner: it simulates the world with no
// graphics and writes logs, metrics, and chain results.
//
// Test-and-tune cycle, per TESTING_AND_BALANCE.md section 1:
//
//	simrun run     -seed 1 -years 4 -profile none
//	simrun sweep   -seeds 40 -years 4 -profile none
//	simrun why     -seed 1 -log logs/run-seed-1.cause.csv
//	simrun order
//	simrun chains  -seed 1
//
// A run builds its map from the shipped settlement feed by default; pass
// -settlements PATH for another feed, or -settlements - for the synthesised map.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/chains"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/metrics"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/profile"
	"mbclone/simulation/internal/runner"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simfeed"
	"mbclone/simulation/internal/simrun"
	"mbclone/simulation/internal/worldgen"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]
	switch cmd {
	case "run":
		cmdRun(args)
	case "sweep":
		cmdSweep(args)
	case "why":
		cmdWhy(args)
	case "chains":
		cmdChains(args)
	case "order":
		fmt.Print(simrun.OrderReport())
	case "balance":
		cmdBalance(args)
	case "battle":
		os.Exit(simrun.BattleRecordCmd(args, os.Stdout, os.Stderr, loadConfigFor))
	case "replay":
		os.Exit(simrun.ReplayCmd(args, os.Stdout, os.Stderr, loadConfigFor))
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `simrun — headless simulation runner

  run      -seed N -years Y -profile P -out DIR   one run with logs
  sweep    -seeds N -years Y -profile P           many seeds, dominance table
  why      -log FILE                               explain a collapsed town
  chains   -seed N                                 chain check for one run
  order                                          print the documented system order
  balance  -log FILE                               field distribution of a run
  battle   -seed N [-a-units N] [-b-units N]      fight a battle and record it
  replay   -battle ID                             re-run a recorded battle and diff it

  -settlements PATH   settlement feed for run/sweep/chains
                      (default `+simfeed.DefaultPath+`; "-" for the synthesised map)

  battles are recorded under `+simrun.DefaultBattleDir+` unless -dir says otherwise:

  battle   -seed 7 -a-units 40 -b-units 40        records battle-7
  replay   -battle battle-7                       replays it and reports MATCHED or MISMATCH
  replay   -list                                  what is recorded

  replay exits 0 on a match, 1 on a mismatch, 2 on a bad command line, and 3 when
  the record could not be replayed at all.

  profiles: `+profileList()+`
`)
}

func profileList() string {
	var names []string
	for _, k := range profile.All() {
		names = append(names, string(k))
	}
	return strings.Join(names, ", ")
}

func loadConfig(path string) *config.Config {
	cfg, err := loadConfigFor(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
	return cfg
}

// loadConfigFor is loadConfig as an error rather than an exit, for the two
// commands that live in internal/simrun and are called from a test.
//
// The exit stays in loadConfig because the campaign commands want it and have
// always had it. The battle commands report a config that will not load the same
// way they report a record that will not replay, because a person who mistyped
// -config needs to be told which of the two they did.
func loadConfigFor(path string) (*config.Config, error) {
	if path == "" {
		path = filepath.Join("config", "balance.toml")
	}
	cfg, err := config.Load(path)
	if err != nil {
		return nil, fmt.Errorf("config %s: %w", path, err)
	}
	return cfg, nil
}

// loadFeed reads the settlement feed a run should build its map from, and the
// notes describing what was loaded.
//
// The feed is on by default: the shipped snapshot is the real data this service
// exists to simulate, so a run that quietly used the synthesised map instead
// would report numbers for a map nobody is looking at. "-" is the way to ask for
// the synthesised one deliberately, because the synthesised path is what the
// tests and the order-independence checks need, and it must stay reachable.
//
// A feed that is present but broken stops the run. The fallback in
// worldgen.Generate is for a service with no data at all, not for one whose
// data failed to parse, and CONSTITUTION.md section 1.3 is explicit that a
// failure is shown with a way to recover rather than swallowed.
func loadFeed(path string) ([]worldgen.Settlement, []string) {
	if path == "-" {
		return nil, []string{"settlement feed: skipped (-), map synthesised"}
	}
	resolved := simfeed.ResolvePath(path)
	if !simfeed.Exists(resolved) {
		// Only a default that finds nothing falls back, and it says so. An
		// explicit path that does not exist is an error.
		if path != "" {
			fmt.Fprintf(os.Stderr, "settlements: no such feed: %s\n", path)
			os.Exit(1)
		}
		return nil, []string{"settlement feed: none found at " + resolved + ", map synthesised"}
	}
	feed, err := simfeed.Load(resolved)
	if err != nil {
		fmt.Fprintf(os.Stderr, "settlements: %v\n", err)
		os.Exit(1)
	}
	return feed.Settlements, []string{feed.Summary(resolved)}
}

func cmdRun(args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	seed := fs.Uint64("seed", 1, "master seed")
	years := fs.Float64("years", 0, "in-game years (0 uses the config default)")
	prof := fs.String("profile", string(profile.None), "scripted player profile")
	out := fs.String("out", "logs", "output directory")
	cfgPath := fs.String("config", "", "balance config path")
	stateEvery := fs.Int("state-every", 30, "days between state log samples (0 disables)")
	feedPath := fs.String("settlements", "", "settlement feed JSON (default "+simfeed.DefaultPath+"; \"-\" forces the synthesised map)")
	_ = fs.Parse(args)

	cfg := loadConfig(*cfgPath)
	kind := profile.Kind(*prof)
	if !profile.Valid(kind) {
		fmt.Fprintf(os.Stderr, "unknown profile %q; valid: %s\n", *prof, profileList())
		os.Exit(2)
	}
	settlements, notes := loadFeed(*feedPath)
	opts := runner.Options{Seed: *seed, Years: *years, Profile: kind, Settlements: settlements}
	outcome, err := runner.Run(cfg, opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "run: %v\n", err)
		os.Exit(1)
	}
	outcome.Notes = append(notes, outcome.Notes...)
	if err := writeRun(cfg, outcome, *out, *stateEvery); err != nil {
		fmt.Fprintf(os.Stderr, "write: %v\n", err)
		os.Exit(1)
	}
	printRunSummary(outcome)
}

func cmdSweep(args []string) {
	fs := flag.NewFlagSet("sweep", flag.ExitOnError)
	seeds := fs.Int("seeds", 20, "number of seeds, starting at 1")
	startSeed := fs.Uint64("start-seed", 1, "first seed")
	years := fs.Float64("years", 0, "in-game years (0 uses the config default)")
	prof := fs.String("profile", string(profile.None), "scripted player profile")
	cfgPath := fs.String("config", "", "balance config path")
	out := fs.String("out", "", "write the table to this file as well as stdout")
	chainsOut := fs.String("chains-out", "", "write the chain frequency table here")
	feedPath := fs.String("settlements", "", "settlement feed JSON (default "+simfeed.DefaultPath+"; \"-\" forces the synthesised map)")
	_ = fs.Parse(args)

	cfg := loadConfig(*cfgPath)
	kind := profile.Kind(*prof)
	if !profile.Valid(kind) {
		fmt.Fprintf(os.Stderr, "unknown profile %q\n", *prof)
		os.Exit(2)
	}
	yearsVal := *years
	if yearsVal <= 0 {
		yearsVal = cfg.World.Years
	}

	// One feed read for the whole sweep, so every seed in the table is measured
	// on the same map and a difference between seeds is a difference in the seed.
	settlements, feedNotes := loadFeed(*feedPath)

	var runs []*runner.Outcome
	names := map[int]string{}
	// Chain frequency is counted across every seed, which is the measurement
	// TESTING_AND_BALANCE.md section 2 asks for: a chain must appear in a set
	// fraction of runs, not just one.
	hits := map[chains.Chain]int{}
	emerged := map[chains.Chain]map[int]int{}

	for i := 0; i < *seeds; i++ {
		seed := *startSeed + uint64(i)
		opts := runner.Options{Seed: seed, Years: yearsVal, Profile: kind, Settlements: settlements}
		outcome, err := runner.Run(cfg, opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "seed %d: %v\n", seed, err)
			os.Exit(1)
		}
		outcome.Notes = append(feedNotes, outcome.Notes...)
		runs = append(runs, outcome)
		for _, ss := range outcome.Metrics.Sides {
			names[ss.ID] = ss.Name
		}
		for c, res := range outcome.Chains {
			if res.Emerged {
				hits[c]++
				if emerged[c] == nil {
					emerged[c] = map[int]int{}
				}
				emerged[c][res.Entity]++
			}
		}
	}

	table := metrics.Table(cfg, func() []*metrics.Run {
		var out []*metrics.Run
		for _, r := range runs {
			out = append(out, r.Metrics)
		}
		return out
	}())
	text := table.Format(names)
	fmt.Println(text)

	// Chain frequency table.
	var sb strings.Builder
	sb.WriteString("\nCHAIN FREQUENCY ACROSS SEEDS\n")
	sb.WriteString("chain                                     runs     share    min required\n")
	sb.WriteString("---------------------------------------- ------- -------- -------------\n")
	minFrac := cfg.Audit.ChainMinFraction
	for _, c := range chains.All() {
		share := 0.0
		if *seeds > 0 {
			share = float64(hits[c]) / float64(*seeds)
		}
		mark := "ok"
		if share < minFrac {
			mark = "BELOW MINIMUM"
		}
		fmt.Fprintf(&sb, "%-40s %-8d %-9.2f %.2f %s\n", chains.Name(c), hits[c], share, minFrac, mark)
	}
	sb.WriteString("\n")
	for _, c := range chains.All() {
		if hits[c] == 0 {
			continue
		}
		sb.WriteString(chains.Name(c) + " emerged at: ")
		type ent struct {
			id int
			n  int
		}
		var list []ent
		for id, n := range emerged[c] {
			list = append(list, ent{id, n})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].n > list[j].n })
		var parts []string
		for _, e := range list {
			parts = append(parts, fmt.Sprintf("%s#%d(%d)", kindOf(c), e.id, e.n))
		}
		sb.WriteString("  " + strings.Join(parts, ", ") + "\n")
	}
	fmt.Print(sb.String())

	if *out != "" {
		if err := os.WriteFile(*out, []byte(text+sb.String()), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write %s: %v\n", *out, err)
			os.Exit(1)
		}
	}
	if *chainsOut != "" {
		if err := os.WriteFile(*chainsOut, []byte(sb.String()), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write %s: %v\n", *chainsOut, err)
			os.Exit(1)
		}
	}
}

func kindOf(c chains.Chain) string {
	switch c {
	case chains.GoldDrain, chains.BrokenOath:
		return "ruler"
	default:
		return "town"
	}
}

func cmdChains(args []string) {
	fs := flag.NewFlagSet("chains", flag.ExitOnError)
	seed := fs.Uint64("seed", 1, "master seed")
	years := fs.Float64("years", 0, "in-game years")
	prof := fs.String("profile", string(profile.None), "scripted player profile")
	cfgPath := fs.String("config", "", "balance config path")
	feedPath := fs.String("settlements", "", "settlement feed JSON (default "+simfeed.DefaultPath+"; \"-\" forces the synthesised map)")
	_ = fs.Parse(args)
	cfg := loadConfig(*cfgPath)
	settlements, notes := loadFeed(*feedPath)
	outcome, err := runner.Run(cfg, runner.Options{
		Seed: *seed, Years: *years, Profile: profile.Kind(*prof), Settlements: settlements,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "chains: %v\n", err)
		os.Exit(1)
	}
	outcome.Notes = append(notes, outcome.Notes...)
	fmt.Print(chains.Report(outcome.Chains, chains.All()))
	fmt.Println()
	// For each chain that emerged, print the log rows that demonstrate it, so
	// the claim is checkable rather than asserted.
	for _, c := range chains.All() {
		res := outcome.Chains[c]
		if !res.Emerged || len(res.Excerpts) == 0 {
			continue
		}
		rows := chains.ExcerptsFor(outcome.Log, c, 14)
		if len(rows) == 0 {
			continue
		}
		fmt.Printf("--- %s: unscripted excerpt from the cause log ---\n", chains.Name(c))
		for _, row := range rows {
			f, _ := model.FieldByName(row.Kind, row.Field)
			fmt.Printf("  day %-5d %-12s %-18s %-16s %s -> %s  [%s]\n",
				row.Tick, outcome.State.Name(row.Kind, row.Entity), row.Field,
				"", f.Format(row.Old), f.Format(row.New), row.System)
			if row.Read != "" {
				fmt.Printf("           read: %s\n", row.Read)
			}
		}
		fmt.Println()
	}
}

func cmdWhy(args []string) {
	fs := flag.NewFlagSet("why", flag.ExitOnError)
	logPath := fs.String("log", "", "cause log CSV to read")
	cfgPath := fs.String("config", "", "balance config path")
	statePath := fs.String("state", "", "final state JSON to pick the worst town from")
	entity := fs.Int("entity", 0, "entity id, 0 picks the worst town automatically")
	_ = fs.Parse(args)
	if *logPath == "" {
		fmt.Fprintln(os.Stderr, "why: -log is required")
		os.Exit(2)
	}
	cfg := loadConfig(*cfgPath)
	log, err := readCauseLog(*logPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "why: %v\n", err)
		os.Exit(1)
	}
	// The why-query walks the cause log. It needs a state to resolve names and
	// to score which town is worst; the run's own final state is used when
	// supplied, and otherwise a minimal state is built from the log alone.
	state := &model.State{
		Year: lastYear(log), Tick: lastTick(log),
		Towns: map[int]*model.Town{}, Villages: map[int]*model.Village{},
		Parties: map[int]*model.Party{}, Rulers: map[int]*model.Ruler{},
		Sides: map[int]*model.Side{}, Routes: map[int]*model.Route{},
		Sieges: map[int]*model.Siege{}, Wars: map[int]*model.War{},
		Relations: map[model.Pair]float64{}, SideRelations: map[model.Pair]float64{},
		Oaths: map[int]model.Oath{},
	}
	if *statePath != "" {
		if err := readStateJSON(*statePath, state); err != nil {
			fmt.Fprintf(os.Stderr, "why: reading state: %v\n", err)
			os.Exit(1)
		}
	}
	target := *entity
	if target == 0 {
		target = worstFromLog(state, log)
	}
	maxLinks := int(cfg.Cause.MaxChainLinks)
	res := sim.WhyForEntity(log, state, model.KindTown, target, maxLinks)
	fmt.Print(res.Format(state))
	fmt.Printf("\nminimum depth for a full chain: %d\n", int(cfg.Cause.MinChainLinks))
	if res.Depth >= int(cfg.Cause.MinChainLinks) {
		fmt.Printf("PASS: %d linked causes, at or above the required %d\n", res.Depth, int(cfg.Cause.MinChainLinks))
	} else {
		fmt.Printf("FAIL: %d linked causes, below the required %d\n", res.Depth, int(cfg.Cause.MinChainLinks))
	}
}

func cmdBalance(args []string) {
	fs := flag.NewFlagSet("balance", flag.ExitOnError)
	logPath := fs.String("log", "", "cause log CSV")
	_ = fs.Parse(args)
	if *logPath == "" {
		fmt.Fprintln(os.Stderr, "balance: -log is required")
		os.Exit(2)
	}
	log, err := readCauseLog(*logPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "balance: %v\n", err)
		os.Exit(1)
	}
	// Which fields move most, and which systems do the moving. A run where one
	// field accounts for most of the log is a run where the cause log is not
	// telling the player anything useful.
	byField := map[string]int{}
	bySystem := map[string]int{}
	for _, row := range log.Rows() {
		byField[row.Field]++
		bySystem[row.System]++
	}
	type kv struct {
		k string
		n int
	}
	var fields, systems []kv
	for k, v := range byField {
		fields = append(fields, kv{k, v})
	}
	for k, v := range bySystem {
		systems = append(systems, kv{k, v})
	}
	sort.Slice(fields, func(i, j int) bool { return fields[i].n > fields[j].n })
	sort.Slice(systems, func(i, j int) bool { return systems[i].n > systems[j].n })
	fmt.Printf("rows: %d, below threshold: %d, dropped oldest: %d\n\n",
		log.Len(), log.Suppressed(), log.DroppedOldest())
	fmt.Println("MOST-CHANGED FIELDS")
	for i, f := range fields {
		if i >= 15 {
			break
		}
		fmt.Printf("  %-22s %8d  %5.1f%%\n", f.k, f.n, 100*float64(f.n)/float64(log.Len()))
	}
	fmt.Println("\nMOST-ACTIVE SYSTEMS")
	for i, s := range systems {
		if i >= 15 {
			break
		}
		fmt.Printf("  %-22s %8d  %5.1f%%\n", s.k, s.n, 100*float64(s.n)/float64(log.Len()))
	}
}

func printRunSummary(o *runner.Outcome) {
	m := o.Metrics
	fmt.Printf("seed %d, profile %s, %d ticks (%.2f years)\n", m.Seed, m.Profile, m.Ticks, m.Years)
	fmt.Printf("cause rows: %d (below threshold %d, dropped %d)\n", m.CauseRows, m.Suppressed, m.DroppedOldest)
	fmt.Printf("settlements: %d real, %d synthesised\n", o.RealSettlements, o.SynthSettlements)
	if o.PlayerRulerID >= 0 {
		fmt.Printf("player: ruler #%d %s, town #%d %s\n", o.PlayerRulerID,
			o.State.Name(model.KindRuler, o.PlayerRulerID), o.PlayerTownID,
			o.State.Name(model.KindTown, o.PlayerTownID))
	}
	for _, n := range o.Notes {
		fmt.Printf("note: %s\n", n)
	}
	fmt.Printf("collapsed towns: %d of %d; total deaths: %.0f\n", m.CollapsedTowns, len(m.Towns), m.TotalDeaths)
	fmt.Println()
	fmt.Print(chains.Report(o.Chains, chains.All()))
	fmt.Println()
	fmt.Println("SIDES")
	fmt.Printf("%-24s %-8s %-10s %-12s %-10s %s\n", "side", "towns", "population", "treasury", "weariness", "outcome")
	for _, s := range m.Sides {
		outcome := "held"
		if s.Collapsed {
			outcome = "COLLAPSED"
		} else if s.Survived {
			outcome = "survived"
		}
		fmt.Printf("%-24s %-8.0f %-10.0f %-12.0f %-10.2f %s\n",
			s.Name, s.Towns, s.Population, s.Treasury, s.Weariness, outcome)
	}
}

// writeRun writes the cause log, the state samples, and the metrics for a run.
func writeRun(cfg *config.Config, o *runner.Outcome, dir string, stateEvery int) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	base := fmt.Sprintf("seed-%d-%s", o.Options.Seed, sanitize(o.Metrics.Profile))

	// Cause log.
	f, err := os.Create(filepath.Join(dir, base+".cause.csv"))
	if err != nil {
		return err
	}
	bw := bufio.NewWriterSize(f, 1<<20)
	fmt.Fprintln(bw, cause.Header)
	for _, row := range o.Log.Rows() {
		fmt.Fprintln(bw, row.Format())
	}
	if err := bw.Flush(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}

	// Final state samples and a summary.
	if err := writeStateCSV(o.State, filepath.Join(dir, base+".state.csv")); err != nil {
		return err
	}
	if err := writeSummary(cfg, o, filepath.Join(dir, base+".summary.txt")); err != nil {
		return err
	}
	return nil
}

func sanitize(s string) string {
	r := strings.NewReplacer("/", "_", " ", "_", "..", "_")
	return r.Replace(s)
}
