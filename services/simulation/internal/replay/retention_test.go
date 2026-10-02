package replay

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/battleapi"
)

// The battle server forgets nothing, ever.
//
// WHAT IT IS
//
// `Server.sessions` is a `map[string]*entry`. It is written in exactly one place,
// `handleStart`, and there is no `delete` anywhere in the package:
//
//     s.sessions[id] = &entry{session: sess, campaignSessionID: ..., created: ...}
//
// The entry holds the whole `*battle.Session`, which holds the whole `*battle.Battle`
// — every unit's position, health, morale and suppression, the spatial grid, the
// event list, and the order log once recording is wired in. Nothing removes it: not
// resolution, not the end of the campaign session, not a client asking for the
// battle again. So the process accumulates one full battle per battle ever fought,
// for as long as it is up.
//
// On this box that is not a theoretical worry. Eight agent sessions have been
// pushing a 7935 MB machine to "signal: killed" all night, and a 500 v 500 battle
// is exactly the shape of allocation that tips it.
//
// MEASURED, 2026-10-02
//
//     30 battles of 500 v 500 started, none of them fought:
//     heap 857488 -> 23630728 bytes, 22.8 MB retained, 0.76 MB a battle
//
// 0.76 MB is the cost of a battle nobody has fought, and it is the floor, not the
// figure. An advanced battle also carries its event list, and a RECORDED one
// carries the order log as well — my own measurements of that log at this size are
// 15834 rows in 2.3 MB for an ordinary replayed battle and 510265 rows in 75 MB for
// a 500 v 500 hold, so a recorded and fought battle could plausibly be one to two
// orders of magnitude more than 0.76 MB.
//
// That sentence used to end "That is arithmetic from numbers taken on this branch,
// not a measurement of a recorded server battle, because nothing records one yet."
// Something records one now (handleStart attaches Session.Record and a resolved
// battle is written to the store), so the arithmetic has been replaced by a
// measurement: TestARecordedAndResolvedBattleCostsWhat below fights, orders and
// resolves battles on a real server and measures what the process holds afterwards.
//
// The deterministic half of this is not the heap number — heap numbers move with
// the machine — it is that a battle the server has finished with is still being
// served afterwards, and that no code path exists that could have stopped serving
// it. Those two are asserted; the heap is measured and reported.
//
// NOT FIXED HERE, and the reason is now narrower than it was.
//
// `internal/battleapi` is this lane's, and the mutex problem next door has been
// fixed in it. What is left is not a code problem: it is that nobody has said how
// long a finished battle stays readable. A player who reconnects mid-after-action
// wants theirs, and something has to decide when that stops.
//
// The argument FOR a decision is much stronger now than when this was written, and
// it is not about tidiness. A resolved battle's whole field is redundant with the
// record the server writes for it: the outcome, the casualty summary and the order
// log are all on disk, and none of them needs 1000 live units to answer a state
// request. So the field is not the after-action report, it is the working set that
// produced it, and holding it after the battle is over is keeping the expensive copy
// and discarding the cheap one.
//
// What that does NOT settle is how many finished battles a server keeps readable,
// and that is the product question. The measurement below is here so whoever answers
// it does not have to spend a session deriving the number.

// TestTheBattleServerForgetsNoBattle is the retention, asserted two ways.
func TestTheBattleServerForgetsNoBattle(t *testing.T) {
	cfg := loadConfig(t)
	srv := httptest.NewServer(newServerOverAPI(t, cfg, 4242).Handler())
	defer srv.Close()

	// One battle, fought to a conclusion. A finished battle is the one that costs
	// the most to keep and is the one most likely to be dropped.
	first := startBattle(t, srv.URL, 4242, 12)
	if code, _ := postJSON(t, srv.URL+"/v1/battle/resolve",
		fmt.Sprintf(`{"battle_id":%q,"campaign_session_id":"s1"}`, first.id)); code != 200 {
		t.Fatalf("resolving the first battle: status %d", code)
	}
	afterResolve := getState(t, srv.URL, first.id)
	if afterResolve["outcome"] == nil {
		t.Fatalf("the first battle resolved but its state carries no outcome: %v", afterResolve)
	}
	t.Logf("%s resolved: %v", first.id, afterResolve["outcome"])

	// Thirty more, big, and never resolved. Starting a battle is what allocates
	// the Battle; advancing it is not required to make the server hold it.
	const bigBattles = 30
	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	for i := 0; i < bigBattles; i++ {
		startBattle(t, srv.URL, 4242, 500)
	}
	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	retained := int64(after.HeapAlloc) - int64(before.HeapAlloc)
	t.Logf("%d battles of 500 v 500 started: heap went %d -> %d bytes, so %.1f MB retained, "+
		"%.2f MB a battle, and none of them has been fought",
		bigBattles, before.HeapAlloc, after.HeapAlloc,
		float64(retained)/1e6, float64(retained)/1e6/bigBattles)

	// THE ASSERTION. Thirty large battles later, the finished 12 v 12 battle from
	// the top of this test is still being served. A server that dropped finished
	// battles would 404 here, and that is the behaviour worth having.
	state := getState(t, srv.URL, first.id)
	if state["battle_id"] != first.id {
		t.Errorf("after %d other battles the finished battle %s is no longer served: %v",
			bigBattles, first.id, state)
	} else {
		t.Logf("%d battles later, %s — resolved at the top of this test — is still served, "+
			"outcome %v, %v ticks", bigBattles, first.id, state["outcome"], state["tick"])
	}
}

// TestTheBattleServerNeverDropsASession is the structural half.
//
// The behavioural assertion above proves a battle is still served. It cannot prove
// nothing would have dropped it: a server could keep entries for a bounded time
// and this test, which takes seconds, would see nothing wrong. So the rule is also
// checked at the source, where a lifetime policy would have to appear.
func TestTheBattleServerNeverDropsASession(t *testing.T) {
	path := filepath.Join("..", "battleapi", "server.go")
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, 0)
	if err != nil {
		t.Fatalf("parsing %s: %v", path, err)
	}

	deletes, inserts := 0, 0
	ast.Inspect(file, func(n ast.Node) bool {
		switch node := n.(type) {
		case *ast.CallExpr:
			switch fn := node.Fun.(type) {
			case *ast.Ident:
				if fn.Name == "delete" {
					deletes++
				}
			case *ast.SelectorExpr:
				// maps.Delete and friends, in case this ever grows a helper.
				if fn.Sel.Name == "delete" {
					deletes++
				}
			}
		case *ast.AssignStmt:
			// `s.sessions[id] = x` has an IndexExpr on the left whose X is the
			// selector, not a selector itself. Getting that backwards is how the
			// first version of this check reported "inserts at 0 places" against a
			// file with an insert in it.
			for _, lhs := range node.Lhs {
				idx, ok := lhs.(*ast.IndexExpr)
				if !ok {
					continue
				}
				if sel, ok := idx.X.(*ast.SelectorExpr); ok && sel.Sel.Name == "sessions" {
					inserts++
				}
			}
		}
		return true
	})

	t.Logf("%s inserts into s.sessions at %d place(s) and deletes from it at %d", path, inserts, deletes)
	if inserts > 0 && deletes == 0 {
		t.Errorf("%s inserts into the server's session map at %d place(s) and never deletes from it. "+
			"Every battle the server has ever fought stays in memory for the life of the process, "+
			"with its whole field, its event list and its order log, and nothing decides when a "+
			"finished battle should be let go.\n"+
			"  TestTheBattleServerForgetsNoBattle is the other half: it measures what that costs "+
			"in retained heap, and asserts that a battle which resolved at the start of it is still "+
			"being served at the end.\n"+
			"  Not fixed here: internal/battleapi is nobody's declared lane, and how long a finished "+
			"battle stays readable is a product decision — a player reconnecting to an after-action "+
			"report needs theirs to still be there.",
			path, inserts)
	}
}

// TestARecordedAndResolvedBattleCostsWhat replaces an estimate with a
// measurement, because the estimate's own text said it was one.
//
// The entry above carried this: "That is arithmetic from numbers taken on this
// branch, not a measurement of a recorded server battle, because nothing records one
// yet." Something records one now, so the arithmetic has had its chance and lost.
//
// The number that matters for the open product question — how many finished battles
// a server keeps readable — is the retained heap per RESOLVED and RECORDED battle,
// because that is what a retention policy is trading. The unfought 0.76 MB above is
// the floor and says nothing about it.
//
// It also settled one thing that was not a product question at all. These six
// battles retained 20.63 MB each when the server kept its order log in memory after
// writing the record; they retain 3.53 MB each now that saveRecord releases the log,
// because the file IS the log. That is 83% of a resolved battle's cost, and it was
// not a judgement call — it is the difference between holding the expensive copy and
// the cheap one. The first attempt at it set the server's own reference to nil and
// freed nothing, and measured identically to two decimal places; only the session
// holds the log, through its recorder.
//
// It measures at 100 a side rather than 500 for one reason: this fights and resolves
// real battles, and a 500 v 500 resolve is about 91 s on this box, so the size that
// makes the number most alarming makes the test too slow to run. Six 100 v 100
// resolves is about 4 s. The per-unit figures are reported alongside the totals so
// the two can be compared rather than one standing in for the other.
//
// Nothing is asserted about how much. A heap number is a measurement on a machine,
// not a threshold, and a test that failed at some figure of it would be asserting
// that this box has a particular amount of memory.
func TestARecordedAndResolvedBattleCostsWhat(t *testing.T) {
	cfg := loadConfig(t)
	const units = 100
	const battles = 6

	dir := t.TempDir()
	srv := httptest.NewServer(
		battleapi.New(cfg, 4242, "retention").
			WithBattleStore(battle.OpenBattleStore(dir)).
			Handler())
	defer srv.Close()

	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	var rows int
	var resolved int
	for i := 0; i < battles; i++ {
		b := startBattle(t, srv.URL, 4242, units)
		// Ordered as well as resolved: an uncommanded battle's log has a row per
		// tick at most and the interesting cost is a log with a row per GROUP per
		// tick, which is what a player's standing orders produce.
		sendOrders(t, srv.URL, b.id, []string{
			`{"name":"change-formation","params":{"shape":"wedge"}}`,
			`{"name":"advance"}`,
		})
		if code, _ := postJSON(t, srv.URL+"/v1/battle/resolve",
			fmt.Sprintf(`{"battle_id":%q,"campaign_session_id":"s1"}`, b.id)); code != 200 {
			t.Fatalf("resolving %s: status %d", b.id, code)
		}
		st := getState(t, srv.URL, b.id)
		if st["outcome"] == nil {
			t.Fatalf("%s resolved but carries no outcome: %v", b.id, st)
		}
		rows += intOf(st["order_log_rows"])
		resolved++
	}

	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	retained := int64(after.HeapAlloc) - int64(before.HeapAlloc)
	perBattle := float64(retained) / 1e6 / battles
	unitsTotal := 2 * units * battles

	t.Logf("%d battles of %d v %d, each ORDERED and RESOLVED on a server that records them:",
		battles, units, units)
	t.Logf("  heap %d -> %d bytes, %.1f MB retained, %.2f MB a battle",
		before.HeapAlloc, after.HeapAlloc, float64(retained)/1e6, perBattle)
	t.Logf("  %.2f MB per %d units, or %.3f MB per 1000 unit-slots, against the 0.76 MB a battle",
		perBattle, 2*units, 1000*perBattle/float64(unitsTotal))
	t.Logf("  order log: %d rows across %d battles, %.0f rows a battle, written to disk and RELEASED",
		rows, resolved, float64(rows)/float64(resolved))
	t.Logf("  for comparison, the unfought 500 v 500 floor in the test above is 0.76 MB a battle")
	t.Logf("  and the same six battles measured 20.63 MB each before saveRecord released the log, so")
	t.Logf("  releasing it is worth %.0f%% of what a resolved, recorded battle costs to keep",
		100*(1-perBattle/20.63))
	t.Logf("  every one of the %d is still being served, which is the product question, not a bug:",
		resolved)

	if rows == 0 {
		t.Errorf("the battles were ordered and resolved and not one order row was recorded. The "+
			"retained heap above is then a floor rather than a figure, and the whole point of this "+
			"test is the number a recorded battle costs")
	}
	// The records themselves, so the heap figure above cannot be read as the cost
	// of battles the server fought and then failed to save. A retained heap and a
	// missing record look identical from here.
	ids, err := battle.OpenBattleStore(dir).IDs()
	if err != nil {
		t.Fatalf("listing the battle store at %s: %v", dir, err)
	}
	if len(ids) != battles {
		t.Errorf("the store holds %d records for %d resolved battles: %v\n"+
			"  This test is about what the PROCESS holds, and a battle the server fought and did not "+
			"save is a different figure again.", len(ids), battles, ids)
	}
	t.Logf("records on disk: %d in %s", len(ids), dir)
}
