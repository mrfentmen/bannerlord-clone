package replay

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/battleapi"
	"mbclone/simulation/internal/simrun"
)

// A battle fought through the shipped HTTP API is on disk and replays.
//
// WHY THIS FILE EXISTS ALONGSIDE apipath_test.go
//
// apipath_test.go proves orders REACH the engine — it fights the same battle twice
// over HTTP, once with orders and once without, and requires the two to differ.
// What it could not prove is the other half: that the battle is RECORDED. The only
// check it had for that was a source check for the text `Session.Record` in
// battleapi/server.go, and the same file says at length why a token grep is the
// wrong instrument — it kept reporting "never calls Session.Record" against code
// that reached the same seam by another name.
//
// So this is the behavioural witness the grep was standing in for. It starts a
// server, fights a whole battle over HTTP with orders in it, and then asks the
// only question that matters: does the record that came out the other end reproduce
// the battle it came from.
//
// The instrument matters more than usual here, because a recording defect is the
// one defect in this lane that CANNOT show up as a replay mismatch. A log with no
// orders in it replays cleanly, because an empty log correctly means nobody
// commanded anything. So "the battle verifies" is true both when the orders were
// recorded and when they were thrown away, and a test that stops at the verdict is
// testing nothing. Hence the assertion on the row count as well: a record of a
// battle nobody ordered anything in is not a record of this battle.

// TestABattleFoughtThroughTheShippedAPIReplaysFromItsOwnRecord is the end of the
// whole lane, in one test.
//
// Before this, the replay machinery was reachable from `simrun battle` and from
// nothing else in the shipped program. A player could fight a battle, be told their
// orders were accepted, and leave behind nothing that could show what happened.
func TestABattleFoughtThroughTheShippedAPIReplaysFromItsOwnRecord(t *testing.T) {
	cfg := loadConfig(t)
	const units = 12

	dir := t.TempDir()
	store := battle.OpenBattleStore(dir)
	srv := httptest.NewServer(
		battleapi.New(cfg, 5150, "replay-test").WithBattleStore(store).Handler())
	defer srv.Close()

	start := startBattle(t, srv.URL, 5150, units)
	if got := sendOrders(t, srv.URL, start.id, []string{
		`{"name":"change-formation","params":{"shape":"wedge"}}`,
		`{"name":"hold-position"}`,
		`{"name":"face-direction","params":{"angle_deg":-34}}`,
		`{"name":"move","params":{"x":-260,"y":140}}`,
		`{"name":"advance"}`,
	}); got != 5 {
		t.Fatalf("the API accepted %d of five orders, so this battle is not the one it means to be", got)
	}
	state := resolve(t, srv.URL, start.id)

	if rows := intOf(state["order_log_rows"]); rows == 0 {
		t.Fatalf("the state response reports order_log_rows 0 for a battle five orders were sent to.\n"+
			"  orders_logged %v, record_saved %v, record_error %q\n"+
			"  An empty order log is not a failure that shows up anywhere else: it replays cleanly, "+
			"because an empty log correctly means nobody commanded anything.",
			state["orders_logged"], state["record_saved"], strOf(state["record_error"]))
	}
	if trunc, _ := state["order_log_truncated"].(bool); trunc {
		t.Fatalf("a 12 v 12 battle filled the order log bound and was truncated, so its record is "+
			"not replayable. The bound is %d rows.", defaultAPIBound)
	}
	if saved, _ := state["record_saved"].(bool); !saved {
		t.Fatalf("the battle resolved and record_saved is false: %q", strOf(state["record_error"]))
	}
	if msg := strOf(state["record_error"]); msg != "" {
		t.Errorf("the record was saved and the state response also carries record_error %q", msg)
	}

	// The files, because "saved" should mean something a person can find.
	ids, err := store.IDs()
	if err != nil {
		t.Fatalf("listing the store: %v", err)
	}
	if len(ids) != 1 || ids[0] != start.id {
		t.Fatalf("the store holds %v, want exactly [%s]", ids, start.id)
	}
	entries, err := os.ReadDir(filepath.Join(dir, start.id))
	if err != nil {
		t.Fatalf("reading the record directory: %v", err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	t.Logf("record written to %s/%s: %v", dir, start.id, names)

	// And the verdict. This is the claim: the seed plus this log is sufficient to
	// reproduce the battle the game actually fought, hash for hash.
	check, err := store.Verify(cfg, start.id)
	if err != nil {
		t.Fatalf("verifying the record the shipped server wrote: %v", err)
	}
	t.Logf("%v", check)
	if !check.Match {
		t.Errorf("a battle fought through the shipped HTTP API, with orders in it, was recorded and "+
			"the record does not replay back to the same battle.\n"+
			"  %v\n"+
			"  This is the defect this lane exists to prevent, and it is the first time it has been "+
			"reachable from the shipped program at all. Check the seed convention (one seed for both "+
			"sides), the roster fingerprint, and the Setup's Label — Result.Hash folds the label in, so "+
			"a record named differently mismatches for a battle that is bit-identical.",
			check)
	}
}

// TestTheServersBattleDirIsTheOneSimrunReads pins a pair of constants that have to
// agree.
//
// A server recording somewhere other than `simrun replay --battle <id>` looks
// would produce records the replay CLI cannot find, and the symptom of that is
// "the replay path is broken" rather than "the two paths differ". Two constants in
// two packages is exactly the arrangement that drifts.
func TestTheServersBattleDirIsTheOneSimrunReads(t *testing.T) {
	if battleapi.DefaultBattleDir != simrun.DefaultBattleDir {
		t.Errorf("battleapi.DefaultBattleDir is %q and simrun.DefaultBattleDir is %q.\n"+
			"  A battle the server records is one `simrun replay --battle <id>` is expected to find, so "+
			"  these have to be the same directory. If they are meant to differ, that is a decision to "+
			"  write down rather than a coincidence to discover.",
			battleapi.DefaultBattleDir, simrun.DefaultBattleDir)
	}
}

// TestABattleTheServerCannotRecordStillResolves is the failure mode of the fix,
// asserted.
//
// Recording is now part of starting a battle, and a recorder that will not attach
// must not cost the player their battle. The bound is set to one row, which is
// enough for a battle nobody orders and nowhere near enough for one somebody does,
// and the battle still has to reach a decision.
//
// Without this, the natural hardening of "recording failed" is to fail the request,
// and a player who ordered a battle hard enough to fill a million rows would get a
// 500 instead of a fight.
func TestABattleTheServerCannotRecordStillResolves(t *testing.T) {
	cfg := loadConfig(t)
	const units = 12

	dir := t.TempDir()
	srv := httptest.NewServer(
		battleapi.New(cfg, 5150, "replay-test").
			WithBattleStore(battle.OpenBattleStore(dir)).
			WithOrderLogBound(1).
			Handler())
	defer srv.Close()

	start := startBattle(t, srv.URL, 5150, units)
	if got := sendOrders(t, srv.URL, start.id, []string{
		`{"name":"change-formation","params":{"shape":"line"}}`,
		`{"name":"advance"}`,
	}); got != 2 {
		t.Fatalf("the API accepted %d of two orders", got)
	}
	state := resolve(t, srv.URL, start.id)

	if state["phase"] != "resolved" {
		t.Fatalf("phase %v, want resolved: a battle whose order log hit its bound did not finish", state["phase"])
	}
	if _, ok := state["outcome"]; !ok {
		t.Errorf("the battle reported no outcome. It was fought; it should say how it went.\n  %v", state)
	}
	saved, _ := state["record_saved"].(bool)
	if saved {
		t.Errorf("record_saved is true for a battle whose order log refused rows. SaveBattle is supposed " +
			"to REFUSE a truncated log rather than write a record that can never be replayed, so this " +
			"is the guard not holding rather than the bound being harmless.")
	}
	if msg := strOf(state["record_error"]); msg == "" {
		t.Errorf("a battle whose log refused rows reports no record_error. A log that reached its bound " +
			"is not replayable and does not say so on its own, which is why it has to say so here")
	} else {
		t.Logf("record_error, as it should be: %s", msg)
	}

	ids, err := battle.OpenBattleStore(dir).IDs()
	if err != nil {
		t.Fatalf("listing the store: %v", err)
	}
	if len(ids) != 0 {
		t.Errorf("the store holds %v, want nothing: a battle with a truncated log must leave no record "+
			"behind rather than one that fails on every replay", ids)
	}
}

// defaultAPIBound is the order log bound the shipped server uses. It is repeated
// here rather than imported because the constant is unexported, and the reason for
// repeating it is that a test asserting "the log was not truncated" against a
// bound it made up would be asserting nothing.
const defaultAPIBound = 1 << 20
