package command

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/formation"
)

// balanceEnv names an environment variable that overrides where these tests read
// the balance file from, and the file actually used is always logged.
const balanceEnv = "BANNERLORD_BALANCE"

var loaded struct {
	path string
	cfg  *config.Config
	err  error
	done bool
}

func loadConfig(t testing.TB) *config.Config {
	t.Helper()
	if loaded.done {
		if loaded.err != nil {
			t.Fatalf("%v", loaded.err)
		}
		return loaded.cfg
	}
	path := os.Getenv(balanceEnv)
	if path == "" {
		var err error
		path, err = findBalanceFile()
		if err != nil {
			loaded.done, loaded.err = true, err
			t.Fatal(err)
		}
	}
	cfg, err := config.Load(path)
	loaded.done, loaded.path, loaded.cfg, loaded.err = true, path, cfg, err
	if err != nil {
		loaded.err = fmt.Errorf("the balance file did not load from %s: %w", path, err)
		t.Fatalf("%v", loaded.err)
	}
	t.Logf("balance file: %s (version %s)", path, cfg.Version)
	return cfg
}

func findBalanceFile() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
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
	return "", fmt.Errorf("could not find config/balance.toml walking up from the test directory; set %s", balanceEnv)
}

// standardForce builds an even, unremarkable force of n units a side: the roster
// as the balance file describes it, with an even command on each side.
func standardForce(t testing.TB, cfg *config.Config, seed uint64, n int) (battle.Setup, error) {
	t.Helper()
	a, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{Units: n})
	if err != nil {
		return battle.Setup{}, err
	}
	b, err := battle.GenerateForce(cfg, seed, battle.SideB, battle.Roster{Units: n})
	if err != nil {
		return battle.Setup{}, err
	}
	return battle.Setup{
		A: a,
		B: b,
		Leaders: append(
			battle.GenerateLeaders(cfg, seed, battle.SideA, 1, 260),
			battle.GenerateLeaders(cfg, seed, battle.SideB, 1, 260)...),
		Terrain: battle.TerrainOpen,
		Label:   fmt.Sprintf("%d vs %d, commanded", n, n),
	}, nil
}

// TestCommandedBattle50v50 is the verification the brief asks for: a real 50
// against 50 battle with the commander holding the reins, asserting that orders
// were issued, that every one of them produced a cause-log row, and that two runs
// of the same seed produce an identical order log.
//
// The three assertions are separate because they are three separate promises, and
// a commander that quietly broke any of them would still look like it worked: a
// battle that issued no orders at all, an order log with no rows behind it, and a
// battle that only reproduces itself once are all failures a single "orders were
// issued" check would wave through.
func TestCommandedBattle50v50(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 50

	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatalf("building the 50v50 force failed: %v", err)
	}

	run := func() (*Commander, *battle.Result, *cause.Log) {
		t.Helper()
		log := cause.NewLog(0)
		cmd, err := New(cfg, log)
		if err != nil {
			t.Fatalf("building the commander failed: %v", err)
		}
		res, err := battle.RunCommanded(cfg, seed, setup, cmd)
		if err != nil {
			t.Fatalf("the commanded battle did not run: %v", err)
		}
		return cmd, res, log
	}

	cmd, res, log := run()

	fmt.Printf("\n============ COMMANDED BATTLE: 50 vs 50, commander enabled ============\n")
	fmt.Printf("seed:        %d\n", seed)
	fmt.Printf("tactics:     %s\n", cmd.Config())
	fmt.Printf("formations:  %d per side, %d cause-log ids per side\n",
		cmd.Config().FormationsPerSide, cmd.Config().FormationsPerSide)
	fmt.Printf("outcome:     %s (%s)\n", res.Outcome.Kind, res.Outcome.Reason)
	fmt.Printf("ticks:       %d over %s of simulated time\n", res.Ticks, res.ElapsedS)
	fmt.Printf("orders:      %s\n", cmd.Counts())
	fmt.Printf("cause rows:  %d of which are orders\n", log.Len())
	for _, s := range res.Sides {
		fmt.Printf("side %s:      dead %.0f, wounded %.0f, standing %d, broken %d, routed %d, strength %.0f bodies\n",
			s.Side, s.Dead, s.Wounded, s.Standing, s.Broken, s.Routed, s.StrengthEnd)
	}
	fmt.Printf("orders issued by side:\n")
	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		fmt.Printf("  side %s: %s\n", side, sideCounts(cmd, side))
	}
	fmt.Printf("first 12 orders:\n")
	for i, o := range cmd.Orders() {
		if i >= 12 {
			fmt.Printf("  ... %d more\n", len(cmd.Orders())-12)
			break
		}
		fmt.Printf("  %s\n", o)
	}
	fmt.Println()

	// 1. Orders were issued.
	orders := cmd.Orders()
	if len(orders) == 0 {
		t.Fatal("the commander issued no orders in a whole battle, so the tactics layer did nothing at all")
	}
	if cmd.Counts().Total != len(orders) {
		t.Errorf("the counts report %d orders and the history holds %d", cmd.Counts().Total, len(orders))
	}

	// Every formation of both armies was given something to do, and every order
	// in the battle is one of the six orders internal/formation implements. An
	// order outside that set would be a commander talking in a language nothing
	// executes.
	wantPerSide := int(cfg.Command.FormationsPerSide)
	got := map[battle.Side]int{}
	for _, o := range orders {
		got[o.Side]++
		if !o.Order.Valid() {
			t.Errorf("order %v is not one internal/formation implements", o.Order)
		}
		if o.Reason == "" {
			t.Errorf("order to side %s formation %d names no rule, so a reader cannot tell why: %s", o.Side, o.Formation, o)
		}
		if o.Read == "" {
			t.Errorf("order to side %s formation %d records no readings, so it cannot be explained: %s", o.Side, o.Formation, o)
		}
	}
	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		if got[side] < wantPerSide {
			t.Errorf("side %s was given %d orders, fewer than the %d formations it fields",
				side, got[side], wantPerSide)
		}
	}

	// 2. Every order produced a cause row, and every cause row is an order.
	if cmd.CauseRows() != len(orders) {
		t.Errorf("the commander issued %d orders and wrote %d cause rows", len(orders), cmd.CauseRows())
	}
	if log.Len() != len(orders) {
		t.Errorf("the log holds %d rows for %d orders, so rows exist that no order produced", log.Len(), len(orders))
	}
	// Each row names its own order: the id on the OrderIssued is the id of the row
	// in the log, and the row is about that formation.
	rows := log.Rows()
	for _, o := range orders {
		if o.CauseID <= 0 || o.CauseID > len(rows) {
			t.Fatalf("order %s claims cause row %d, which the log of %d rows cannot hold", o, o.CauseID, len(rows))
		}
		row := rows[o.CauseID-1]
		if row.Tick != o.Tick || row.Entity != o.ID || row.System != systemName {
			t.Errorf("cause row %d is about %s entity %d field %s at tick %d, not about the order that claims it: %s",
				row.ID, row.Kind, row.Entity, row.Field, row.Tick, o)
		}
		if !strings.Contains(row.Note, o.Order.String()) {
			t.Errorf("cause row %d does not name the order it was written for: %q", row.ID, row.Note)
		}
	}
	// The chain: the first order a formation receives cites nothing, and every
	// later one cites the row before it, which is what makes a formation's order
	// history walkable.
	firstSeen := map[int]bool{}
	for i, row := range rows {
		switch len(row.CausedBy) {
		case 0:
			if firstSeen[row.Entity] {
				t.Errorf("cause row %d for entity %d starts a chain in the middle of one", row.ID, row.Entity)
			}
			firstSeen[row.Entity] = true
		case 1:
			if row.CausedBy[0] <= 0 || row.CausedBy[0] > i+1 {
				t.Errorf("cause row %d cites %v, which is not an earlier row", row.ID, row.CausedBy)
			}
			if !firstSeen[row.Entity] {
				t.Errorf("cause row %d for entity %d cites an earlier order before it has ever had one", row.ID, row.Entity)
			}
		default:
			t.Errorf("cause row %d cites %d rows; an order supersedes exactly one", row.ID, len(row.CausedBy))
		}
	}

	// 3. Two runs of the same seed produce the same orders, in the same order, with
	// the same readings, and the same battle.
	cmd2, res2, _ := run()
	if got, want := LogSummary(cmd2.Orders()), LogSummary(orders); got != want {
		t.Errorf("two runs of seed %d produced different order logs\n--- run 1 ---\n%s--- run 2 ---\n%s", seed, want, got)
	}
	if res2.Ticks != res.Ticks || res2.Outcome != res.Outcome || res2.End != res.End {
		t.Errorf("two runs of seed %d fought different battles: %d ticks vs %d, %v vs %v",
			seed, res.Ticks, res2.Ticks, res.Outcome, res2.Outcome)
	}
	t.Logf("order log identical across two runs: %d orders, %d bytes",
		len(orders), len(LogSummary(orders)))
}

// sideCounts is the order tally for one side, for the report a run prints.
func sideCounts(cmd *Commander, side battle.Side) string {
	var sb strings.Builder
	all := formation.AllOrders()
	fmt.Fprintf(&sb, "total=%d", cmd.Counts().Total)
	for _, o := range all {
		n := 0
		for _, issued := range cmd.Orders() {
			if issued.Side == side && issued.Order == o {
				n++
			}
		}
		fmt.Fprintf(&sb, " %s=%d", o, n)
	}
	return sb.String()
}
