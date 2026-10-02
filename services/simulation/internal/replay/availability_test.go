package replay

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"mbclone/simulation/internal/battleapi"
)

// One player's "skip to the end" takes the whole battle server down.
//
// WHAT IT IS
//
// `handleResolve` fast-forwards a live battle to its conclusion. It does that
// under the server's single mutex:
//
//     s.mu.Lock()
//     defer s.mu.Unlock()
//     for e.session.Phase() != battle.PhaseResolved {
//         if err := e.session.Advance(1000); err != nil { ... }
//     }
//
// Every other route takes the same mutex, so for as long as the resolve runs,
// NOTHING on the server is served: not `handleState` for any battle, not
// `handleOrders`, and not `pump()`, which is what advances every fighting battle
// in the first place. One player resolving a big battle stops the game for
// everybody.
//
// MEASURED, on this box, 2026-10-02
//
//     with nothing else happening: 0.1 ms a state request
//     resolving a 500 v 500:       91.4 s
//     worst state round trip during that resolve: 91.15 s
//     state requests served in those 91.4 s, at one poll per 250 ms: 2 of ~365
//
// **NOT MEASURED, and I did not try:** that `pump()` stops advancing other battles
// during the resolve. It follows by inspection — `pump` takes the same mutex —
// but the probe that produced the numbers above never started the ticker, so both
// battles sat at tick 0 throughout and that row would have read the same either
// way. Stated as what it is: an inspection, not a measurement.
//
// WHY THE TEST IS 250 A SIDE AND NOT 500
//
// The thing being measured is how long a request blocks, so the resolve has to
// outlast the bound by a wide margin. A 250 v 250 resolve is about 26 s here and
// the bound below is 5 s, which is 50 times the idle round trip of 0.1 ms and five
// times under the smallest resolve this test uses. The test's own duration is that
// resolve, so making the battle bigger would only make the suite slower without
// making the test more certain.
//
// It is not a flaky-timing test in the usual way. The quantity is not "how long
// does this take", it is "does a request that should take microseconds instead
// wait for a battle to finish". There is no assertion that could be satisfied by a
// slow machine: the alternative to blocking is not blocking more slowly.
//
// FIXED, and the fix was the second of the two options, done properly.
//
// The server's mutex now guards the MAP and nothing else; each battle has its own
// lock, and every path that touches a session holds it. handleResolve advances ten
// ticks per acquisition and releases in between, so a reader of an unrelated battle
// never contends for that lock at all and a reader of the resolving battle waits for
// one chunk rather than for the battle.
//
// A tick count and not a time budget, because a budget that expires mid-Advance
// cannot release the lock until the Advance returns: ten ticks is about 50 ms at
// 250 v 250 and 480 ms at 500 v 500 against a 5 s allowance, and a rule written in
// seconds only works below the size it was measured at.
//
// The measurement above is the BEFORE. It is kept because the after is a single
// number in the test output and this is the thing that number is an answer to.

// TestResolvingOneBattleDoesNotFreezeTheServer is the availability claim.
func TestResolvingOneBattleDoesNotFreezeTheServer(t *testing.T) {
	cfg := loadConfig(t)
	srv := httptest.NewServer(battleapi.New(cfg, 4242, "availability").Handler())
	defer srv.Close()

	big := startBattle(t, srv.URL, 4242, 250)
	other := startBattle(t, srv.URL, 4242, 8)
	t.Logf("resolving %s (250 v 250) while polling %s (8 v 8)", big.id, other.id)

	// The idle round trip, so the number below is a ratio and not a vibe.
	start := time.Now()
	const idlePolls = 5
	for i := 0; i < idlePolls; i++ {
		getState(t, srv.URL, other.id)
	}
	idle := time.Since(start) / idlePolls

	resolving := make(chan time.Duration, 1)
	go func() {
		from := time.Now()
		resp, err := http.Post(srv.URL+"/v1/battle/resolve", "application/json",
			strings.NewReader(fmt.Sprintf(`{"battle_id":%q,"campaign_session_id":"s1"}`, big.id)))
		if err != nil {
			resolving <- 0
			return
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		resolving <- time.Since(from)
	}()

	// A 250 v 250 resolve runs for about half a minute, so a quarter of a second is
	// comfortably inside it. Without this the test could sample before the resolve
	// took the lock and pass without having measured anything.
	time.Sleep(250 * time.Millisecond)

	at := time.Now()
	getState(t, srv.URL, other.id)
	waited := time.Since(at)

	var took time.Duration
	select {
	case took = <-resolving:
		t.Logf("the resolve itself finished in %.1fs", took.Seconds())
	default:
		t.Logf("the resolve was still running when the poll returned, which is the point")
	}

	t.Logf("an idle state request on an unrelated battle took %.1f ms", float64(idle.Microseconds())/1000)
	t.Logf("the same request during one player's resolve took %.2f s — %.0fx the idle time",
		waited.Seconds(), float64(waited)/float64(idle))

	const budget = 5 * time.Second
	if waited > budget {
		t.Errorf("one player resolving a 250 v 250 battle blocked every other request on the server "+
			"for %.1f s, against a budget of %.0f s and an idle round trip of %.1f ms.\n"+
			"  handleResolve holds the server's one mutex across the whole `for phase != "+
			"PhaseResolved { Advance(1000) }` loop, and handleState, handleOrders and pump all need "+
			"that same mutex. So one player's skip-to-end stops every battle on the server, not just "+
			"the one being resolved.\n"+
			"  At 500 v 500 this was measured at 91.4 s of block, with 2 of about 365 polled "+
			"requests served in that time.\n"+
			"  Not fixed here: internal/battleapi is nobody's declared lane and the fix is a design "+
			"decision. Resolving outside the lock, or giving the simulator its own lock and "+
			"snapshotting state for readers, both change what a concurrent reader sees mid-resolve.",
			waited.Seconds(), budget.Seconds(), float64(idle.Microseconds())/1000)
	}
}

// getState is one GET against the state route.
func getState(t *testing.T, base, id string) map[string]any {
	t.Helper()
	resp, err := http.Get(fmt.Sprintf("%s/v1/battle/state?battle_id=%s&campaign_session_id=s1", base, id))
	if err != nil {
		t.Fatalf("GET state: %v", err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading the state response: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("decoding the state response %q: %v", b, err)
	}
	return out
}
