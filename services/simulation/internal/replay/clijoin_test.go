package replay

import (
	"bytes"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/battleapi"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/simrun"
)

// The record a battle leaves when it is fought in the game is the record
// `simrun replay --battle <id>` reads, with no export step between them.
//
// WHY THIS FILE IS JUST ONE TEST AND NOT A NOTE
//
// Every other proof in this lane stops at `battle.BattleStore.Verify`, which is the
// same code `simrun.ReplayCmd` calls. So they all leave one thing unproven: that the
// record the SHIPPED SERVER writes is in a place the CLI looks, under the name it
// expects, carrying the balance version it expects. Those are three independent ways
// for the two halves to be compatible inside `battle` and incompatible in practice,
// and none of them is visible from inside `battle`.
//
// The join is a directory. `battleapi.DefaultBattleDir` and `simrun.DefaultBattleDir`
// are two constants that have to be the same string — pinned by
// TestTheServersBattleDirIsTheOneSimrunReads — and this is the test that says the
// pinning was the right idea rather than tidiness.
//
// What the loop is FOR, stated plainly: a player finishes a battle, somebody wants to
// see what happened and why the units ended where they did, and the answer is one
// command. That has never been true on this branch until now, because nothing the
// game fought left a record.

// TestTheGameAndTheReplayCLIShareOneRecord runs the CLI over a record the shipped
// server wrote.
func TestTheGameAndTheReplayCLIShareOneRecord(t *testing.T) {
	cfg := loadConfig(t)
	dir := t.TempDir()

	srv := httptest.NewServer(newServerOverAPI(t, cfg, 5150).WithBattleStore(battle.OpenBattleStore(dir)).Handler())
	defer srv.Close()

	b := startBattle(t, srv.URL, 5150, 12)
	if got := sendOrders(t, srv.URL, b.id, []string{
		`{"name":"change-formation","params":{"shape":"wedge"}}`,
		`{"name":"face-direction","params":{"angle_deg":-41}}`,
		`{"name":"advance"}`,
	}); got != 3 {
		t.Fatalf("the API accepted %d of three orders, so this battle is not the one it means to be", got)
	}
	resolve(t, srv.URL, b.id)

	// The id is the one the server dealt, and the record is named after it. That is
	// the whole naming contract between the game and the CLI: a player is told a
	// battle id and types it.
	var out, errOut bytes.Buffer
	code := simrun.ReplayCmd(
		[]string{"-battle", b.id, "-dir", dir},
		&out, &errOut,
		func(string) (*config.Config, error) { return cfg, nil })

	t.Logf("simrun replay -battle %s -dir %s -> exit %d", b.id, dir, code)
	t.Logf("stdout: %s", strings.TrimSpace(out.String()))
	if e := strings.TrimSpace(errOut.String()); e != "" {
		t.Logf("stderr: %s", e)
	}
	if code != 0 {
		t.Errorf("the CLI could not replay a battle the shipped server fought and recorded: exit %d.\n"+
			"  stdout: %s\n  stderr: %s\n"+
			"  This is the join every other test in this lane stops short of. The record is in the "+
			"  server's store and battle.BattleStore.Verify reads it, so a non-zero here is about the "+
			"  two halves disagreeing outside battle: the directory, the battle id, or the balance "+
			"  version recorded against it.",
			code, strings.TrimSpace(out.String()), strings.TrimSpace(errOut.String()))
	}
	if !strings.Contains(out.String(), "MATCH") {
		t.Errorf("the CLI exited 0 without reporting a match.\n  stdout: %s\n"+
			"  Exit 0 is documented as \"the replay reproduced the recorded battle\", so a zero here "+
			"  with no verdict in the output is the CLI agreeing with itself rather than with the battle.",
			strings.TrimSpace(out.String()))
	}
}

// TestTheReplayCLIFindsABattleUnderItsOwnDefaultDirectory is the other half of the
// join, and it is the half a person actually uses.
//
// The test above passes -dir, because a test must not write into the source tree. A
// player will not: they will run `simrun replay -list` and expect to see the battles
// the game has fought. That only works if the server's default and the CLI's default
// are one directory, so this runs the server with NO store configured at all — the
// shipped default — from a temporary working directory, and lists what the CLI sees.
func TestTheReplayCLIFindsABattleUnderItsOwnDefaultDirectory(t *testing.T) {
	if testing.Short() {
		t.Skip("this changes the process's working directory, which is not something a short " +
			"test should do to whatever else is running in this binary")
	}
	cfg := loadConfig(t)

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("reading the working directory: %v", err)
	}
	// A temporary working directory, so the shipped default resolves inside it. t.
	// Chdir restores it even if the test fails, and nothing here touches the source
	// tree — which is the entire reason the earlier version of this lane's tests were
	// leaving logs/battles directories behind in internal/replay/.
	t.Chdir(t.TempDir())

	// No WithBattleStore: the shipped default, logs/battles, relative to here.
	srv := httptest.NewServer(battleapi.New(cfg, 5150, "cli-default-dir").Handler())
	defer srv.Close()
	b := startBattle(t, srv.URL, 5150, 12)
	resolve(t, srv.URL, b.id)

	var listOut, listErr bytes.Buffer
	code := simrun.ReplayCmd([]string{"-list"}, &listOut, &listErr,
		func(string) (*config.Config, error) { return cfg, nil })
	t.Logf("simrun replay -list -> exit %d, stdout %q", code, strings.TrimSpace(listOut.String()))
	if code != 0 {
		t.Errorf("-list exited %d: %s", code, strings.TrimSpace(listErr.String()))
	}
	if !strings.Contains(listOut.String(), b.id) {
		t.Errorf("`simrun replay -list` does not show the battle the server just fought.\n"+
			"  the server wrote it to its own default, %q, and the CLI lists %q.\n"+
			"  Two constants in two packages that have to be the same directory. "+
			"battleapi.DefaultBattleDir is %q and simrun.DefaultBattleDir is %q, and "+
			"TestTheServersBattleDirIsTheOneSimrunReads says they are equal — so if this fails, one "+
			"  of them is not being used where it looks like it is.",
			battleapi.DefaultBattleDir, strings.TrimSpace(listOut.String()),
			battleapi.DefaultBattleDir, simrun.DefaultBattleDir)
	}

	var out, errOut bytes.Buffer
	code = simrun.ReplayCmd([]string{"-battle", b.id}, &out, &errOut,
		func(string) (*config.Config, error) { return cfg, nil })
	t.Logf("simrun replay -battle %s (no -dir) -> exit %d, stdout %q",
		b.id, code, strings.TrimSpace(out.String()))
	if code != 0 {
		t.Errorf("the CLI could not replay it without being told where to look: exit %d, %s",
			code, strings.TrimSpace(errOut.String()))
	}

	if err := os.Chdir(wd); err != nil {
		t.Fatalf("restoring the working directory to %s: %v", wd, err)
	}
}