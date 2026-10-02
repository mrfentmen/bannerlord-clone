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
// figure. An advanced battle also carries its event list, and once `Session.Record`
// is wired in — which is what my "the shipped server records nothing" finding
// demands — it carries the order log as well. My own measurements of that log at
// this size are 15834 rows in 2.3 MB for an ordinary replayed battle and 510265
// rows in 75 MB for a 500 v 500 hold, so a recorded and fought battle is one to
// two orders of magnitude more than 0.76 MB. That is arithmetic from numbers taken
// on this branch, not a measurement of a recorded server battle, because nothing
// records one yet.
//
// The deterministic half of this is not the heap number — heap numbers move with
// the machine — it is that a battle the server has finished with is still being
// served afterwards, and that no code path exists that could have stopped serving
// it. Those two are asserted; the heap is measured and reported.
//
// NOT FIXED HERE. `internal/battleapi` is nobody's declared lane, and how long a
// finished battle should stay readable is a product decision, not a line: a
// player who reconnects mid-after-action wants their battle, and something has to
// decide when that stops.

// TestTheBattleServerForgetsNoBattle is the retention, asserted two ways.
func TestTheBattleServerForgetsNoBattle(t *testing.T) {
	cfg := loadConfig(t)
	srv := httptest.NewServer(battleapi.New(cfg, 4242, "retention").Handler())
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
