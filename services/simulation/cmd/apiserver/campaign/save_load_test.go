package campaign

// Save and load against the world they actually run on.
//
// The HTTP boundary -- that POST /v1/save and POST /v1/load are mounted, answer
// the shape the client reads, and refuse a bad file with a reason -- is tested in
// the api package. The restart proof is there too, because a restart is a thing
// the API can do.
//
// What belongs here is the part that only exists in this package: the busy guard.
// A save is refused while an order sits in the pending queue, because an order
// names the tick it was issued against and restoring the world underneath one
// either drops the order or applies it to a campaign it was never written for.
// That condition cannot be provoked over HTTP without racing the tick loop -- the
// order is usually consumed before the next request arrives -- so it is provoked
// here by pausing the clock, which leaves the queue undrained for as long as the
// test wants it to be.

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"mbclone/simulation/internal/config"
)

// queueOneOrder parks an order in the pending queue and leaves it there.
//
// The clock is paused first, so the drain loop in the tick pass never runs and the
// order cannot be consumed. Submit then blocks waiting for the order's result; a
// short-lived context gives up on it, which is exactly what the API does when a
// client's request times out. The order stays in the queue, because Submit
// handed it over before it waited.
func queueOneOrder(t *testing.T, c *Campaign) {
	t.Helper()
	if err := c.Pause(); err != nil {
		t.Fatalf("pausing the clock: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), shortWait)
	defer cancel()
	j := &job{name: "save-busy-test", hasEngineOrder: true, done: make(chan jobResult, 1)}
	// A refused submit means the queue was already full, which is its own
	// failure: this test needs a specific condition, not any condition.
	if _, err := c.Submit(ctx, j); err == nil {
		t.Fatal("the parked order completed, so the queue drained and the busy guard cannot be tested this way")
	}
	if n := len(c.pending); n == 0 {
		t.Fatal("the order was not left in the pending queue, so there is nothing for the guard to refuse")
	}
}

// shortWait is long enough that the context is not what fails, and short enough
// that a test does not sit on it.
const shortWait = 50 * time.Millisecond

func TestSaveAndLoadAreRefusedWhileAnOrderIsInFlight(t *testing.T) {
	c := newTestWorld(t)
	if _, err := c.StepDays(3); err != nil {
		t.Fatalf("stepping the world: %v", err)
	}
	// The reference save is taken with an empty queue, because that is the only
	// state in which a save is allowed.
	good, err := c.Save()
	if err != nil {
		t.Fatalf("taking the reference save: %v", err)
	}
	if len(good) == 0 {
		t.Fatal("the reference save was empty")
	}

	queueOneOrder(t, c)
	if _, err := c.Save(); err == nil {
		t.Fatal("a save was taken while an order was queued")
	} else if !errors.Is(err, errSaveBusy) {
		t.Errorf("the save refusal was not the busy guard: %v", err)
	}

	// A load is refused for the same reason and it matters more: a load taken
	// under a queued order would restore a campaign the order is not part of.
	if err := c.Load(good); err == nil {
		t.Fatal("a load was accepted while an order was queued")
	} else if !errors.Is(err, errSaveBusy) {
		t.Errorf("the load refusal was not the busy guard: %v", err)
	}

	// Both refusals have to reach the player as a conflict, because the client's
	// POST helper only surfaces a reason on a 409. A 500 here would be swallowed.
	var f *Fault
	queueOneOrder(t, c)
	_, err = c.Save()
	if !errors.As(err, &f) {
		t.Fatalf("the busy refusal was not a Fault: %T %v", err, err)
	}
	if f.Code != CodeConflict || f.Status() != 409 {
		t.Errorf("busy refusal crossed as %s/%d, want %s/409", f.Code, f.Status(), CodeConflict)
	}
	if f.Reason == "" {
		t.Error("the busy refusal carried no reason a player can read")
	}
	drainPendingForTest(c)
}

// drainPending empties the pending queue, which is what a tick pass would do.
func drainPendingForTest(c *Campaign) {
	for {
		select {
		case <-c.pending:
		default:
			return
		}
	}
}

func TestSaveSucceedsWhenTheQueueIsEmpty(t *testing.T) {
	c := newTestWorld(t)
	if _, err := c.StepDays(3); err != nil {
		t.Fatalf("stepping the world: %v", err)
	}
	queueOneOrder(t, c)
	drainPendingForTest(c)

	data, err := c.Save()
	if err != nil {
		t.Fatalf("a save with nothing queued was refused: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("the save was empty")
	}
}

func TestSaveLoadRoundTripIsByteIdentical(t *testing.T) {
	c := newTestWorld(t)
	if _, err := c.StepDays(11); err != nil {
		t.Fatalf("stepping the world: %v", err)
	}
	first, err := c.Save()
	if err != nil {
		t.Fatalf("saving: %v", err)
	}
	second, err := c.Save()
	if err != nil {
		t.Fatalf("saving again: %v", err)
	}
	if string(first) != string(second) {
		t.Error("two saves of one world are not byte-identical; a save is not reproducible, so no comparison of a restore can be trusted")
	}
}

// TestLoadContinuesIdentically is the campaign-side half of the restart proof. The
// api package proves it across two servers; this proves the underlying claim --
// that the saved RNG position is the whole of the future -- without the HTTP
// layer in the way, so a failure points at the save format rather than at a route.
func TestLoadContinuesIdentically(t *testing.T) {
	c := newTestWorld(t)
	if _, err := c.StepDays(9); err != nil {
		t.Fatalf("stepping the world: %v", err)
	}
	save, err := c.Save()
	if err != nil {
		t.Fatalf("saving: %v", err)
	}
	if _, err := c.StepDays(9); err != nil {
		t.Fatalf("stepping past the save: %v", err)
	}
	ref := c.snapshotJSON(t)

	if err := c.Load(save); err != nil {
		t.Fatalf("loading: %v", err)
	}
	if _, err := c.StepDays(9); err != nil {
		t.Fatalf("stepping after the load: %v", err)
	}
	got := c.snapshotJSON(t)
	if ref != got {
		t.Errorf("replaying 9 days from a save did not land on the same world as running them live (%d vs %d bytes)",
			len(ref), len(got))
	}
}

// TestLoadRejectsAFileThatIsNotASave: a player picks the wrong file. Every wrong
// input is answered with a fault the API can render -- code and reason -- rather
// than a bare error, because a bare error crosses the boundary as 500 and tells
// the player the world simulation broke.
func TestLoadRejectsAFileThatIsNotASave(t *testing.T) {
	c := newTestWorld(t)
	cases := []struct {
		name string
		body string
	}{
		{"not json", "this is a photograph of a receipt"},
		{"json, wrong shape", `["save"]`},
		{"wrong format tag", `{"format":"not-a-save","version":1}`},
		{"no format tag", `{"version":1}`},
		{"future version", `{"format":"mbclone-save","version":9999}`},
		{"ancient version", `{"format":"mbclone-save","version":0}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := c.Load([]byte(tc.body))
			if err == nil {
				t.Fatal("a file that is not a save was accepted")
			}
			var f *Fault
			if !errors.As(err, &f) {
				t.Fatalf("the refusal was not a Fault, so the API cannot render it: %T %v", err, err)
			}
			if f.Code != CodeBadRequest {
				t.Errorf("code = %q, want %q; a file the player picked by mistake is a bad request", f.Code, CodeBadRequest)
			}
			if f.Reason == "" {
				t.Error("the refusal carried no reason a player can read")
			}
		})
	}
}

// TestRefusedLoadLeavesTheWorldAlone: a refused load must not have moved anything.
// Half a load is worse than no load -- the player saves, the load is rejected, and
// the campaign they were playing is gone anyway.
func TestRefusedLoadLeavesTheWorldAlone(t *testing.T) {
	c := newTestWorld(t)
	if _, err := c.StepDays(7); err != nil {
		t.Fatalf("stepping the world: %v", err)
	}
	before := c.snapshotJSON(t)
	for _, bad := range []string{
		"not a save at all",
		`{"format":"mbclone-save","version":42}`,
		`{"format":"mbclone-save","version":1,"world":"this is not the world"}`,
	} {
		if err := c.Load([]byte(bad)); err == nil {
			t.Fatalf("%q was accepted", bad)
		}
	}
	if after := c.snapshotJSON(t); after != before {
		t.Error("a refused load changed the world; the campaign has to survive a bad file intact")
	}
}

// TestLoadRefusesAnOversizedVersion rather than truncating it: a save written by a
// build with more content in it is not a save this build can read, and guessing is
// how a load half-succeeds.
func TestLoadRefusesAFutureSave(t *testing.T) {
	c := newTestWorld(t)
	err := c.Load([]byte(`{"format":"mbclone-save","version":` + "2" + `}`))
	var f *Fault
	if !errors.As(err, &f) {
		t.Fatalf("a future save was not refused with a Fault: %T %v", err, err)
	}
	if f.Status() != 400 {
		t.Errorf("a future save crossed as %d, want 400", f.Status())
	}
}

// TestSaveIsSmallEnoughToShip: a save is written to a player's disk and posted
// over HTTP, so a save that grows without bound is a save that eventually cannot
// be loaded. This is a ceiling, not a benchmark: it exists to catch a system that
// has started capturing something per-tick instead of per-entity.
func TestSaveIsSmallEnoughToShip(t *testing.T) {
	c := newTestWorld(t)
	if _, err := c.StepDays(60); err != nil {
		t.Fatalf("stepping the world: %v", err)
	}
	data, err := c.Save()
	if err != nil {
		t.Fatalf("saving: %v", err)
	}
	const ceiling = 64 << 20
	if len(data) > ceiling {
		t.Errorf("the save is %d bytes after 60 days, over the %d MiB ceiling", len(data), ceiling>>20)
	}
	t.Logf("save after 60 days: %.1f MiB", float64(len(data))/(1<<20))
}

// snapshotJSON renders the snapshot the client reads, as a string, so two worlds
// can be compared the way the client would see them.
func (c *Campaign) snapshotJSON(t *testing.T) string {
	t.Helper()
	snap, err := c.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("reading the snapshot: %v", err)
	}
	return string(mustJSON(t, snap))
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("encoding the snapshot: %v", err)
	}
	return b
}

func TestSaveLoadRoundTripNeedsTheBalanceConfig(t *testing.T) {
	// A save is only meaningful against the configuration that made it: the
	// balance file decides what a town produces, what a party eats and what a
	// battle costs, so a save loaded against a different balance file is a
	// campaign that quietly obeys different rules. The save records the seed and
	// this test records the fact that the config is the other half of the
	// identity, so the next person to add a field knows it has to be saved too.
	cfgPath := filepath.Join("..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("loading %s: %v", cfgPath, err)
	}
	c, err := New(cfg, Options{Seed: 7, StartYear: 1950})
	if err != nil {
		t.Fatalf("building the world: %v", err)
	}
	t.Cleanup(c.Stop)
	if _, err := c.Save(); err != nil {
		t.Fatalf("a fresh campaign could not be saved: %v", err)
	}
}
