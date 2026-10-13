package api_test

// The HTTP surface of save and load, and the proof the campaign survives a
// server restart.
//
// The failure this exists to catch is specific: the campaign is generated from a
// seed on every boot, so a server that restarts without a load hands the player
// a brand new world -- day zero, no crew, no money, no reputation -- and every
// route keeps answering 200 the whole time. Nothing in the suite noticed, because
// every route was individually correct about a world that was being thrown away
// underneath it.
//
// So these tests do not check that save produces bytes and load consumes bytes.
// They check the only thing that matters: a campaign saved at day N, replayed N
// more days, saved again, and reloaded into a *freshly constructed* server --
// which is what a restart is -- lands on byte-identical snapshots, and then
// continues byte-identically for another stretch of days. Continuing identically
// is the stronger claim, and it is the one that catches a save that restores the
// world but not the RNG stream: the world would match at the moment of load and
// drift one tick later.
//
// The boundary itself is checked too: both routes are mounted, garbage into
// /v1/load is refused as a refusal, and a body that is valid JSON but not a save
// is refused with a reason rather than silently half-loaded.

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"mbclone/simulation/cmd/apiserver/api"
	"mbclone/simulation/cmd/apiserver/campaign"
	"mbclone/simulation/internal/config"
)

// saveCampaign builds a server the way main.go does: balance.toml, a fixed
// seed, a fixed start year. The seed is the whole point -- the generated world is
// reproducible, so any difference between two runs after a load is the save's
// fault and not the generator's.
func saveCampaign(t *testing.T) http.Handler {
	t.Helper()
	cfgPath := filepath.Join("..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("loading %s: %v", cfgPath, err)
	}
	camp, err := campaign.New(cfg, campaign.Options{Seed: 7, StartYear: 1950})
	if err != nil {
		t.Fatalf("building the world: %v", err)
	}
	t.Cleanup(camp.Stop)
	return api.New(camp, api.Options{}).Handler()
}

// getSnapshot fetches the whole snapshot as the bytes the client would receive.
// The comparison is on raw bytes rather than on decoded structs on purpose: the
// client's TypeScript reads these bytes, so "the world is identical" has to mean
// the bytes are, not that two Go structs happen to compare equal after a lossy
// decode.
func getSnapshot(t *testing.T, serve http.Handler) []byte {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/snapshot", nil)
	rec := httptest.NewRecorder()
	serve.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/snapshot answered %d: %s", rec.Code, rec.Body.String())
	}
	return rec.Body.Bytes()
}

// postRaw sends bytes verbatim, for the routes that take a save file rather than
// a JSON object the campaign defines.
func postRaw(t *testing.T, serve http.Handler, path string, body []byte) (int, []byte) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	serve.ServeHTTP(rec, req)
	return rec.Code, rec.Body.Bytes()
}

// doSave is POST /v1/save, and the bytes it returns are the save file.
func doSave(t *testing.T, serve http.Handler) []byte {
	t.Helper()
	status, body := postRaw(t, serve, "/v1/save", nil)
	if status != http.StatusOK {
		t.Fatalf("POST /v1/save answered %d: %s", status, body)
	}
	if len(body) == 0 {
		t.Fatal("POST /v1/save answered with no save file")
	}
	var probe struct {
		Format  string `json:"format"`
		Version int    `json:"version"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		t.Fatalf("the save file is not JSON: %v", err)
	}
	if probe.Format != "mbclone-save" {
		t.Fatalf("save format = %q, want %q", probe.Format, "mbclone-save")
	}
	if probe.Version < 1 {
		t.Fatalf("save version = %d, want a versioned document", probe.Version)
	}
	return body
}

// doLoad is POST /v1/load with a save file.
func doLoad(t *testing.T, serve http.Handler, save []byte) {
	t.Helper()
	status, body := postRaw(t, serve, "/v1/load", save)
	if status != http.StatusOK {
		t.Fatalf("POST /v1/load answered %d: %s", status, body)
	}
	var out struct {
		OK  bool `json:"ok"`
		Day int  `json:"day"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("the load reply did not decode: %v: %s", err, body)
	}
	if !out.OK {
		t.Fatalf("the load route did not report success: %s", body)
	}
}

// step advances the world by n days through the route a client would use to skip
// time, and fails if the world halted.
func step(t *testing.T, serve http.Handler, n int) {
	t.Helper()
	status, body := post(t, serve, "/v1/step-days", map[string]any{"days": n})
	if status != http.StatusOK {
		t.Fatalf("POST /v1/step-days(%d) answered %d: %v", n, status, body)
	}
}

// firstSnapshotDiff reports the first differing byte offset between two snapshots,
// so a failure names the field that drifted instead of dumping two large blobs.
func firstSnapshotDiff(a, b []byte) int {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	for i := 0; i < n; i++ {
		if a[i] != b[i] {
			return i
		}
	}
	if len(a) != len(b) {
		return n
	}
	return -1
}

// excerpt returns a short window of text around an offset, for a failure message.
func excerpt(b []byte, at int) string {
	lo := at - 60
	if lo < 0 {
		lo = 0
	}
	hi := at + 60
	if hi > len(b) {
		hi = len(b)
	}
	return string(b[lo:hi])
}

// TestSaveLoadSurvivesAServerRestart is the proof the whole save/load port exists
// for, and it is written as a restart rather than as a reload: the load lands in
// a *different* Server over a *different* Campaign, constructed exactly as main.go
// constructs one on boot. Nothing of the original process survives it -- not the
// campaign, not the engine, not the RNG object, not the encounter store.
//
// The order of the run:
//
//	day  0  create a character, so the save carries a player
//	     +  play 21 days
//	saved     the world as it stands at the moment of the save
//	save      written to a file
//	     +  play 14 more days
//	ref       the world the player would have had if the server never stopped
//	---- restart ----
//	load      into a brand new server
//	back      must equal saved, byte for byte
//	     +  play the same 14 days again
//	cont      must equal ref, byte for byte
//
// "cont" is the assertion that earns this test. A save that restores the world but
// drops the RNG stream passes "back" and fails "cont", because the first diverging
// tick draws a different number. That is the bug a player sees as "my save loaded
// but everything went differently afterwards", and it is invisible to any test that
// stops at the load.
func TestSaveLoadSurvivesAServerRestart(t *testing.T) {
	const (
		preSaveDays  = 21
		postSaveDays = 14
	)

	before := saveCampaign(t)
	// A character makes the save carry the thing the player actually cares about
	// -- who they are, what they own, who is loyal to them. A save that only
	// round-trips an empty player has proved much less.
	status, body := post(t, before, "/v1/character", map[string]any{
		"firstName":         "Dolores",
		"lastName":          "Reyes",
		"gender":            "female",
		"appearanceID":      "default",
		"ethnicityID":       "mexican-american",
		"age":               27,
		"startCity":         "town-1",
		"difficulty":        "normal",
		"backgroundChoices": map[string]string{"familyJob": "mechanic"},
		"startingSkills":    map[string]float64{"leadership": 20},
		"startingCash":      5000,
		"biography":         "Runs a garage off Route 6.",
	})
	if status != http.StatusOK {
		t.Fatalf("POST /v1/character answered %d: %v", status, body)
	}
	if accepted, _ := body["accepted"].(bool); !accepted {
		t.Fatalf("the character route did not accept the sheet: %v", body)
	}

	step(t, before, preSaveDays)
	// Taken before the save, so "back" below compares like with like. A load
	// restores the world *as it was saved*, not as it was before the save.
	saved := getSnapshot(t, before)
	save := doSave(t, before)

	// The world moves on from the save, and this is the world the restarted server
	// is held to.
	step(t, before, postSaveDays)
	ref := getSnapshot(t, before)
	if bytes.Equal(saved, ref) {
		t.Fatalf("%d days of simulation changed nothing, so a comparison after the load could not tell a restore from a no-op", postSaveDays)
	}

	// ---- restart ----
	after := saveCampaign(t)

	// Before the load, the fresh server must look like a fresh server. If it
	// already matched, the assertions below would pass without the load doing
	// anything and the test would be measuring nothing: the generated world is at
	// day 0 and neither snapshot is.
	if fresh := getSnapshot(t, after); bytes.Equal(fresh, saved) {
		t.Fatal("a freshly generated world already equals the saved world, so this test cannot tell whether the load did anything")
	}

	doLoad(t, after, save)

	back := getSnapshot(t, after)
	if at := firstSnapshotDiff(saved, back); at >= 0 {
		t.Fatalf("the world after a restart-and-load differs from the world as saved at byte %d\nwant: ...%s...\ngot:  ...%s...",
			at, excerpt(saved, at), excerpt(back, at))
	}

	step(t, after, postSaveDays)
	cont := getSnapshot(t, after)
	if at := firstSnapshotDiff(ref, cont); at >= 0 {
		t.Fatalf("continuing %d days after the load diverged at byte %d; the save did not carry the RNG stream\nwant: ...%s...\ngot:  ...%s...",
			postSaveDays, at, excerpt(ref, at), excerpt(cont, at))
	}
}

// TestSaveLoadCarriesThePlayer: a save that restores the world but forgets the
// character hands the player back a stranger's campaign. The snapshot is the only
// thing the client reads, so the assertion is made on the snapshot's player
// block rather than on any internal field.
func TestSaveLoadCarriesThePlayer(t *testing.T) {
	serve := saveCampaign(t)
	status, body := post(t, serve, "/v1/character", map[string]any{
		"firstName":         "Idris",
		"lastName":          "Bello",
		"gender":            "male",
		"appearanceID":      "default",
		"ethnicityID":       "nigerian-american",
		"age":               34,
		"startCity":         "town-2",
		"difficulty":        "hard",
		"backgroundChoices": map[string]string{"familyJob": "trucker"},
		"startingSkills":    map[string]float64{"rostracy": 30},
		"startingCash":      750,
		"biography":         "Drives regional freight.",
	})
	if status != http.StatusOK {
		t.Fatalf("POST /v1/character answered %d: %v", status, body)
	}
	step(t, serve, 9)

	save := doSave(t, serve)
	step(t, serve, 9)
	ref := getSnapshot(t, serve)

	restored := saveCampaign(t)
	doLoad(t, restored, save)
	if at := firstSnapshotDiff(ref, getSnapshot(t, restored)); at >= 0 {
		t.Fatalf("the restored snapshot differs from the original at byte %d\nwant: ...%s...\ngot:  ...%s...",
			at, excerpt(ref, at), excerpt(getSnapshot(t, restored), at))
	}
}

// TestSaveIsDeterministic: two saves of the same world are the same bytes. This
// is not a nicety -- a save that embeds a map iteration order or a wall-clock
// reading produces a different file every time, which makes every downstream
// comparison of "did the restore work" useless, including the ones above.
func TestSaveIsDeterministic(t *testing.T) {
	serve := saveCampaign(t)
	step(t, serve, 5)
	first := doSave(t, serve)
	second := doSave(t, serve)
	if !bytes.Equal(first, second) {
		t.Fatalf("two saves of one world differ (%d vs %d bytes); a save is not reproducible, so no comparison of a restore is meaningful",
			len(first), len(second))
	}
}

// TestSaveLoadRoutesAreMounted: the client save UI is already built and is
// waiting on these two paths. A provider method that exists, is implemented, is
// covered by fixture tests, and has no mounted route answers 404 in the running
// game -- that is exactly how POST /v1/encounters/flee shipped broken here once.
func TestSaveLoadRoutesAreMounted(t *testing.T) {
	serve := saveCampaign(t)
	save := doSave(t, serve)
	status, body := postRaw(t, serve, "/v1/load", save)
	if status != http.StatusNotFound {
		return
	}
	t.Fatalf("POST /v1/load is not mounted: %d %s", status, body)
}

// TestLoadRefusesGarbage: /v1/load takes a file, and a file the player picked by
// mistake is a real thing that will be posted at it. Every wrong input has to come
// back as a refusal that says what was wrong -- not a 500, and above all not a 200
// that leaves the campaign half-swapped.
func TestLoadRefusesGarbage(t *testing.T) {
	cases := []struct {
		name string
		body []byte
	}{
		{"not json at all", []byte("this is not a save file, it is a photo of a receipt")},
		{"json but not an object", []byte(`["a","b"]`)},
		{"an object with the wrong format tag", []byte(`{"format":"something-else","version":1}`)},
		{"a save from a future build", []byte(`{"format":"mbclone-save","version":9999}`)},
		{"an object with no format", []byte(`{"version":1}`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			serve := saveCampaign(t)
			before := getSnapshot(t, serve)
			status, body := postRaw(t, serve, "/v1/load", tc.body)
			if status == http.StatusOK {
				t.Fatalf("the load route accepted %s and reported success: %s", tc.name, body)
			}
			if status == http.StatusNotFound {
				t.Fatalf("the load route is not mounted: %d %s", status, body)
			}
			// A player picked the wrong file. That is a bad request, not a broken
			// server: it must not cross as 500, because 500 is what the client's
			// helper reads as "the world could not answer", and it sends the
			// player looking for a server fault instead of at their own file.
			if status >= 500 {
				t.Errorf("%s crossed as %d; a file the player picked by mistake is a bad request, not a server fault: %s",
					tc.name, status, body)
			}
			faultReason(t, body)
			// A refused load must leave the campaign exactly as it was. Half a
			// load is worse than no load: the player saves, the save is
			// rejected, and the world they were playing is gone anyway.
			if at := firstSnapshotDiff(before, getSnapshot(t, serve)); at >= 0 {
				t.Errorf("a refused load changed the world at byte %d: ...%s...", at, excerpt(getSnapshot(t, serve), at))
			}
		})
	}
}

// TestLoadRejectsAnOversizedBody: /v1/load reads the request body into memory, so
// it has to be bounded. The cap in the route is 256 MiB, which is far above any
// real save and far below anything that would take the process down.
func TestLoadRejectsAnOversizedBody(t *testing.T) {
	serve := saveCampaign(t)
	huge := bytes.Repeat([]byte("x"), 300<<20)
	status, body := postRaw(t, serve, "/v1/load", huge)
	if status == http.StatusOK {
		t.Fatalf("the load route accepted a 300 MiB body: %s", body)
	}
}

// TestSaveSucceedsWhenNothingIsQueued is the other half of the busy guard. The
// guard refuses a save taken under a queued order -- an order names the tick it was
// issued against, and restoring the world underneath one either drops it or applies
// it to a campaign it was never written for -- so it is only safe to use if a save
// with nothing in flight still works. The refusal itself is covered in the campaign
// package, where a paused clock can hold an order in the queue on purpose; this
// harness cannot provoke that condition without racing the tick loop.
func TestSaveSucceedsWhenNothingIsQueued(t *testing.T) {
	serve := saveCampaign(t)
	if status, body := postRaw(t, serve, "/v1/save", nil); status != http.StatusOK {
		t.Fatalf("a save with nothing queued was refused: %d %s", status, body)
	}
}

// TestLoadRestoresDayAndTickBookkeeping: the day the player sees must come back
// with the world. A load that restores entities but resets the clock hands back a
// campaign where every dated consequence -- prices, contracts, ageing -- is
// suddenly in the future again.
func TestLoadRestoresDayAndTickBookkeeping(t *testing.T) {
	serve := saveCampaign(t)
	step(t, serve, 30)
	save := doSave(t, serve)

	var atSave struct {
		Day int `json:"day"`
	}
	if err := json.Unmarshal(getSnapshot(t, serve), &atSave); err != nil {
		t.Fatalf("the snapshot did not decode: %v", err)
	}
	if atSave.Day < 30 {
		t.Fatalf("day = %d after 30 steps; the clock is not advancing", atSave.Day)
	}

	restored := saveCampaign(t)
	doLoad(t, restored, save)

	var afterLoad struct {
		Day int `json:"day"`
	}
	if err := json.Unmarshal(getSnapshot(t, restored), &afterLoad); err != nil {
		t.Fatalf("the snapshot did not decode: %v", err)
	}
	if afterLoad.Day != atSave.Day {
		t.Fatalf("day = %d after the load, want %d", afterLoad.Day, atSave.Day)
	}
}

// faultReason pulls the player-facing reason out of an error envelope, failing the
// test if the body is not one.
func faultReason(t *testing.T, body []byte) string {
	t.Helper()
	var out struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("the refusal was not a JSON fault: %s", body)
	}
	if out.Error.Code == "" {
		t.Fatalf("the refusal carried no error code: %s", body)
	}
	return out.Reason
}

// readAll is used where a route's reply has to be consumed by an HTTP client
// rather than by a recorder.
var _ = io.ReadAll
var _ = campaign.CodeBadRequest
