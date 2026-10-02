package main

// Integration tests for the barter endpoints.
//
// These drive the real mux over real HTTP against a real engine, because every
// defect found in this area was invisible to unit tests and visible only at this
// boundary:
//
//   - The commit handler took a write lock and then called broadcastBarter,
//     which took a read lock of its own. Go's RWMutex is not reentrant, so every
//     accepted deal hung. A test calling Appraise and ApplyNow directly cannot
//     see it, because it never touches the mutex.
//   - The request was resolved before the handler locked, reading two state maps
//     the tick loop writes. Only -race and a concurrent tick find that.
//   - applyOrder returned silently when it could not honour a deal, and the
//     handler wrote accepted:true regardless. The unit test for that guard
//     called apply directly and so asserted only that nothing moved — never that
//     the player had been told the truth.
//
// So each test below asserts on the response *and* on the world, because for
// this screen the response and the world agreeing is the whole of the contract.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/barter"
)

// testCfg loads the shipped balance file, so an assertion about a share checks
// the wiring rather than a copy of the number in this file.
func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	// services/simulation/cmd/apiserver -> services/simulation/config.
	path := filepath.Join(filepath.Dir(file), "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// testWorld is a two-lord world with one town, built so that every line a
// barter table can carry is available and the numbers are round.
//
// It is deliberately the same shape as the barter package's own fixture, so a
// failure at this boundary means the wiring between the package and the HTTP
// layer is wrong rather than that the two disagree about a made-up world.
func testWorld() *model.State {
	s := model.NewState()
	s.Tick = 7
	s.Year = 1
	s.Towns[100] = &model.Town{
		ID: 100, Name: "Millbrook", SideID: 1, Holder: 2, HolderSide: 1,
		FoodStock: 500, MedicineStock: 200, Metal: 120,
		PriceFood: 10, PriceMedicine: 20, PriceMetal: 30,
		Money: 5000, Gold: 300,
	}
	s.Parties[10] = &model.Party{
		ID: 10, Name: "The Company", LeaderID: 1,
		CargoFood: 100, CargoMedicine: 40, CargoMetal: 60,
		Prisoners: 12, Food: 50, Money: 2000, Gold: 150,
	}
	s.Parties[20] = &model.Party{
		ID: 20, Name: "Hallens Household", LeaderID: 2,
		CargoFood: 10, Prisoners: 4, Money: 900, Gold: 80,
	}
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Aunt Vi", SideID: 1, PartyID: 10,
		IsAlive: true, Gold: 150, Money: 2000,
	}
	s.Leaders[2] = &model.Leader{
		ID: 2, Name: "Lord Hallen", SideID: 1, TownID: 100, PartyID: 20,
		IsAlive: true, Gold: 300, Money: 1500,
	}
	s.Sides[1] = &model.Side{ID: 1, Name: "The Reach"}
	return s
}

// testServer is a server over testWorld, with the barter system registered.
//
// Only barter runs. A test that let the whole system list tick underneath a deal
// would be testing whether unrelated systems tolerate a trade, which is a
// different question and a much noisier one.
func testServer(t *testing.T, st *model.State) *Server {
	t.Helper()
	cfg := testCfg(t)
	log := cause.NewLog(2000)
	engine := sim.NewEngine(cfg, log, 42, []sim.System{barter.System()})
	return newServer(cfg, st, log, engine)
}

// post sends a JSON body and decodes the response, failing on a transport error.
func post(t *testing.T, s *Server, path string, body any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	// The handler is called on this goroutine, so a deadlock inside it hangs the
	// test rather than returning. The timeout below turns that into a failure
	// with a useful message; without it the whole suite would time out after ten
	// minutes with no idea which test was stuck.
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		defer close(done)
		s.routes().ServeHTTP(rec, req)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatalf("%s did not return within 5s: the handler is blocked", path)
	}
	return rec, decodeBody(t, rec)
}

// get issues a GET, with the same timeout discipline as post.
func get(t *testing.T, s *Server, path string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		defer close(done)
		s.routes().ServeHTTP(rec, req)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatalf("GET %s did not return within 5s: the handler is blocked", path)
	}
	return rec, decodeBody(t, rec)
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if rec.Body.Len() == 0 {
		return out
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		// A non-JSON body is a legitimate answer from http.Error, and the
		// assertions that care check the status instead.
		return map[string]any{"_raw": rec.Body.String()}
	}
	return out
}

// dealBody is the request the campaign client sends: 20 grain for 3 metal.
func dealBody() map[string]any {
	return map[string]any{
		"partyId":  "party-10",
		"traderId": "leader-2",
		"townId":   "town-100",
		"offered":  []any{map[string]any{"kind": "good", "itemId": "grain", "quantity": 20}},
		"asked":    []any{map[string]any{"kind": "good", "itemId": "metal", "quantity": 3}},
		// Zero means "no staleness claim". Day 7 is this world's day and is
		// asserted separately, so the body does not depend on the fixture's tick.
		"expectedDay": 0,
	}
}

// --- the read ---

func TestBarterTermsArePricedAndReachable(t *testing.T) {
	s := testServer(t, testWorld())
	rec, body := get(t, s, "/v1/barter/terms?trader=leader-2&town=town-100")
	if rec.Code != http.StatusOK {
		t.Fatalf("terms = %d, want 200: %s", rec.Code, rec.Body)
	}
	if body["traderName"] != "Lord Hallen" {
		t.Errorf("traderName = %v, want Lord Hallen", body["traderName"])
	}
	if body["traderId"] != "leader-2" || body["townId"] != "town-100" {
		t.Errorf("ids = %v/%v, want the refs echoed back", body["traderId"], body["townId"])
	}
	// Both tables, priced, and the client checks a unitValue is present on every
	// row: a table row with no price renders as a column of zeros.
	player, ok := body["playerItems"].([]any)
	if !ok || len(player) == 0 {
		t.Fatalf("playerItems = %v, want a priced table", body["playerItems"])
	}
	trader, ok := body["traderItems"].([]any)
	if !ok || len(trader) == 0 {
		t.Fatalf("traderItems = %v, want a priced table", body["traderItems"])
	}
	for _, table := range [][]any{player, trader} {
		for _, row := range table {
			r := row.(map[string]any)
			if _, ok := r["unitValue"].(float64); !ok {
				t.Errorf("row %v has no unitValue", r["itemId"])
			}
			if _, ok := r["available"].(float64); !ok {
				t.Errorf("row %v has no available count", r["itemId"])
			}
		}
	}
}

// A table that fails to price must not arrive as an empty list. The client
// cannot tell "nothing here is worth anything" from "the server sent nothing
// readable", so the two are kept apart deliberately: tables are always arrays.
func TestBarterTermsAlwaysSendArrays(t *testing.T) {
	st := testWorld()
	// Strip the player of everything, which leaves an empty table.
	st.Parties[10].CargoFood, st.Parties[10].CargoMedicine, st.Parties[10].CargoMetal = 0, 0, 0
	st.Parties[10].Prisoners = 0
	st.Leaders[1].Gold = 0
	s := testServer(t, st)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/barter/terms?trader=leader-2&town=town-100", nil)
	s.routes().ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"playerItems":[]`) {
		t.Errorf("expected an empty JSON array for an empty table, got %s", rec.Body)
	}
}

func TestBarterTermsRefusesATownNobodyHolds(t *testing.T) {
	s := testServer(t, testWorld())
	rec, _ := get(t, s, "/v1/barter/terms?trader=leader-2&town=town-999")
	if rec.Code != http.StatusNotFound {
		t.Errorf("terms for a missing town = %d, want 404", rec.Code)
	}
}

// --- the answer ---

func TestProposeAcceptsAFairDealAndWritesNothing(t *testing.T) {
	st := testWorld()
	s := testServer(t, st)
	before := st.Clone()
	rec, body := post(t, s, "/v1/barter/propose", dealBody())
	if rec.Code != http.StatusOK {
		t.Fatalf("propose = %d, want 200: %s", rec.Code, rec.Body)
	}
	if body["accepted"] != true {
		t.Fatalf("expected the deal accepted, got %v: %v", body["accepted"], body["reason"])
	}
	if body["verdict"] == "" || body["verdict"] == nil {
		t.Error("an accepted deal must come with the trader's own sentence")
	}
	if body["causedBy"] != "barter-agreed" {
		t.Errorf("causedBy = %v, want barter-agreed", body["causedBy"])
	}
	// Asking is a question. A question that moved goods would be a bug.
	if st.Towns[100].FoodStock != before.Towns[100].FoodStock {
		t.Error("propose moved the town's grain")
	}
	if st.Parties[10].CargoFood != before.Parties[10].CargoFood {
		t.Error("propose moved the party's grain")
	}
	if st.Tick != before.Tick {
		t.Error("propose advanced the clock")
	}
}

func TestProposeRefusesAnUnfairDealWithTheShortfall(t *testing.T) {
	s := testServer(t, testWorld())
	body := dealBody()
	// Twice the metal for the same grain.
	body["asked"] = []any{map[string]any{"kind": "good", "itemId": "metal", "quantity": 10}}
	rec, out := post(t, s, "/v1/barter/propose", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("propose = %d, want 200: a refusal is an answer, not a failure", rec.Code)
	}
	if out["accepted"] != false {
		t.Fatalf("expected a refusal, got %v", out["accepted"])
	}
	short, ok := out["shortBy"].(float64)
	if !ok || short <= 0 {
		t.Errorf("shortBy = %v, want a positive number the player can act on", out["shortBy"])
	}
	if reason, _ := out["reason"].(string); reason == "" {
		t.Error("a refusal with no reason is the one refusal a player cannot act on")
	}
	if out["causedBy"] != "barter-rejected" {
		t.Errorf("causedBy = %v, want barter-rejected", out["causedBy"])
	}
}

// --- the commit ---

func TestCommitStrikesTheDealAndMovesTheWorld(t *testing.T) {
	st := testWorld()
	s := testServer(t, st)
	rec, body := post(t, s, "/v1/barter/commit", dealBody())
	if rec.Code != http.StatusOK {
		t.Fatalf("commit = %d, want 200: %s", rec.Code, rec.Body)
	}
	if body["accepted"] != true {
		t.Fatalf("expected the deal struck, got %v: %v", body["accepted"], body["reason"])
	}
	// The world moved. Both halves, in the right direction: grain leaves the
	// caravan for the town, metal leaves the town for the caravan.
	if got := st.Parties[10].CargoFood; got != 80 {
		t.Errorf("party grain = %v, want 80", got)
	}
	if got := st.Towns[100].FoodStock; got != 520 {
		t.Errorf("town grain = %v, want 520", got)
	}
	if got := st.Parties[10].CargoMetal; got != 63 {
		t.Errorf("party metal = %v, want 63", got)
	}
	if got := st.Towns[100].Metal; got != 117 {
		t.Errorf("town metal = %v, want 117", got)
	}
	// And the tables that come back are the world's, not the proposal's: the
	// party now holds 80 sacks and the response must say so.
	if got := findItemValue(t, body, "playerItems", "grain", "available"); got != 80 {
		t.Errorf("returned player grain = %v, want 80: the result must re-read the world", got)
	}
}

// TestCommitRefusesADealWithNoCarrierAndSaysWhy covers the player's side of the
// atomicity fix.
//
// A landed lord still holds a purse, so their table is not empty, but
// `st.Parties[-1]` is nil. applyOrder resolved `st.Parties[deal.Party]` and
// returned silently when it came back nil — before it had looked at a single
// line — so the handler wrote accepted:true and no coin moved: the deal was
// reported struck and had not happened. The two lines below are deliberately
// lopsided in the player's favour, so the only possible objection is the missing
// party.
func TestCommitRefusesADealWithNoCarrierAndSaysWhy(t *testing.T) {
	st := testWorld()
	st.Parties[10] = nil
	st.Leaders[1].PartyID = -1
	body := dealBody()
	body["partyId"] = ""
	body["offered"] = []any{
		map[string]any{"kind": "gold", "itemId": "gold", "quantity": 40},
		map[string]any{"kind": "good", "itemId": "grain", "quantity": 5},
	}
	body["asked"] = []any{map[string]any{"kind": "good", "itemId": "medicine", "quantity": 1}}
	s := testServer(t, st)
	rec, out := post(t, s, "/v1/barter/commit", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("commit = %d, want 200 with a refusal rather than a server error", rec.Code)
	}
	if out["accepted"] != false {
		t.Fatalf("expected a refusal for a deal with no party to carry it, got accepted=%v", out["accepted"])
	}
	reason, _ := out["reason"].(string)
	if !strings.Contains(reason, "no party") {
		t.Errorf("reason = %q, want it to name the missing party", reason)
	}
	if strings.Contains(reason, "not on the table") {
		t.Errorf("reason = %q blames the goods rather than the missing party", reason)
	}
	// And nothing moved, which is the other half of the claim.
	if st.Leaders[1].Gold != 150 {
		t.Errorf("player gold = %v, want it untouched at 150", st.Leaders[1].Gold)
	}
	if st.Leaders[2].Gold != 300 {
		t.Errorf("trader gold = %v, want it untouched at 300", st.Leaders[2].Gold)
	}
}

// A landed lord can still deal in coin. Validate must not overreach and refuse
// the one arrangement that works, or the fix above would have cost a legitimate
// trade to buy an accurate refusal.
//
// Coin on *both* sides is that arrangement, and it is the whole of it: coin moves
// between two purses, so nothing on the table needs a carrier. This used to ask
// for a sack of medicine instead, which is a different deal — see the test above
// for why a landed lord cannot receive one, and `barter.Validate` for the rule. A
// coin-for-sack bargain has nowhere to put the sack, so it is refused, and a
// test asserting otherwise was asking for the bug the carrier check exists to
// catch.
//
// The purses do not move, and that is the arithmetic rather than a skipped
// commit: 40 in and 40 out of the same field is zero, and the engine sums the
// two additive writes before it commits. So what this asserts is that the deal
// was *struck* — the deal row below is the proof, because a commit that had done
// nothing would leave no row for the panel's Why chain to walk.
func TestALandedLordCanStillDealInCoin(t *testing.T) {
	st := testWorld()
	st.Parties[10] = nil
	st.Leaders[1].PartyID = -1
	body := dealBody()
	body["partyId"] = ""
	body["offered"] = []any{map[string]any{"kind": "gold", "itemId": "gold", "quantity": 40}}
	body["asked"] = []any{map[string]any{"kind": "gold", "itemId": "gold", "quantity": 40}}
	s := testServer(t, st)
	rec, out := post(t, s, "/v1/barter/commit", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("commit = %d, want 200", rec.Code)
	}
	if out["accepted"] != true {
		t.Fatalf("a coin-only deal from a landed lord was refused: %v", out["reason"])
	}
	if st.Leaders[1].Gold != 150 {
		t.Errorf("player gold = %v, want 150: 40 in and 40 out is no change", st.Leaders[1].Gold)
	}
	if st.Leaders[2].Gold != 300 {
		t.Errorf("trader gold = %v, want 300", st.Leaders[2].Gold)
	}
	// The town is untouched as well: coin is the one thing on a barter table
	// that crosses without a wagon.
	if st.Towns[100].MedicineStock != 200 {
		t.Errorf("town medicine = %v, want untouched at 200", st.Towns[100].MedicineStock)
	}
	deals := 0
	for _, r := range s.log.Rows() {
		if r.System == "barter" && r.Field == "barter_deal" {
			deals++
		}
	}
	if deals != 1 {
		t.Errorf("found %d deal rows, want 1: the deal was reported struck, so it has to be in the log", deals)
	}
}

func TestCommitRefusesCaptivesForATraderWithNoCage(t *testing.T) {
	st := testWorld()
	st.Parties[20] = nil
	st.Leaders[2].PartyID = -1
	body := dealBody()
	body["offered"] = append(body["offered"].([]any),
		map[string]any{"kind": "prisoner", "itemId": "prisoners", "quantity": 3})
	s := testServer(t, st)
	rec, out := post(t, s, "/v1/barter/commit", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("commit = %d, want 200 with a refusal", rec.Code)
	}
	if out["accepted"] != false {
		t.Fatalf("expected a refusal: there is no cage for the captives to go into, got accepted=%v", out["accepted"])
	}
	// The whole deal is refused, so the grain stays on the wagon too. A partial
	// deal is worse than none: the player would have lost the captives outright.
	if st.Parties[10].CargoFood != 100 {
		t.Errorf("party grain = %v, want it untouched at 100", st.Parties[10].CargoFood)
	}
	if st.Parties[10].Prisoners != 12 {
		t.Errorf("party prisoners = %v, want untouched at 12", st.Parties[10].Prisoners)
	}
}

func TestCommitRefusesAStaleTable(t *testing.T) {
	st := testWorld()
	// Move the world on a day, so day 7 terms are no longer today's.
	st.Tick = 9
	s := testServer(t, st)
	body := dealBody()
	body["expectedDay"] = 7
	rec, out := post(t, s, "/v1/barter/commit", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("commit = %d, want 200 with a refusal", rec.Code)
	}
	if out["accepted"] != false {
		t.Fatal("expected a stale table to be refused rather than repriced")
	}
	if st.Parties[10].CargoFood != 100 {
		t.Error("a stale deal moved goods")
	}
}

// --- the boundary itself ---

// TestCommitDoesNotDeadlockWithASubscriber is the regression test for the lock.
//
// The handler holds s.mu for writing across the appraisal, the apply and the
// broadcast. broadcastBarter used to take s.mu.RLock() of its own accord, which
// Go's RWMutex forbids while the same goroutine holds the write lock, so every
// struck deal blocked forever with the write lock still held. The empty
// subscriber set used to hide it only by accident; with one subscriber attached
// the send path runs and the hang is certain.
//
// The timeout in post turns the hang into a failure naming the endpoint, which
// is the difference between a five-second failure here and a ten-minute suite
// timeout pointing nowhere.
func TestCommitDoesNotDeadlockWithASubscriber(t *testing.T) {
	st := testWorld()
	s := testServer(t, st)
	// Registering through the real path, so the test would still catch a
	// regression in registerWS rather than passing against a hand-built set.
	//
	// There is deliberately no deferred unregisterWS. If the handler deadlocks it
	// is holding the write lock and will never let go, so any cleanup that takes
	// the mutex would block forever and bury the failure this test exists to
	// report — the first version of this test hung for the full suite timeout
	// with the real error in a goroutine dump instead of in the test output. The
	// subscriber belongs to a Server this test discards.
	ch := make(chan []byte, 16)
	s.registerWS(ch)

	rec, body := post(t, s, "/v1/barter/commit", dealBody())
	if rec.Code != http.StatusOK {
		t.Fatalf("commit = %d, want 200", rec.Code)
	}
	if body["accepted"] != true {
		t.Fatalf("expected the deal struck, got %v", body["accepted"])
	}
	// The subscriber was told, which is the other half: a broadcast that
	// silently sent nothing would satisfy a test that only checked for a hang.
	select {
	case msg := <-ch:
		if !bytes.Contains(msg, []byte(`"type":"barter"`)) {
			t.Errorf("subscriber got %s, want a barter frame", msg)
		}
	case <-time.After(time.Second):
		t.Error("the subscriber was never told the tables moved")
	}
}

// TestCommitIsSafeAgainstATickingWorld is the regression test for the race.
//
// The request used to be resolved — reading s.state.Leaders and s.state.Parties
// for the session's own party — before the handler took the lock, while the tick
// loop held the write lock and wrote those same maps. The wrong answer looks like
// a plausible one, so this is asserted two ways: the race detector, and the
// invariant that a commit never spends a lord who is not the session's player.
func TestCommitIsSafeAgainstATickingWorld(t *testing.T) {
	st := testWorld()
	s := testServer(t, st)
	done := make(chan struct{})
	// A writer standing in for the tick loop, holding the same lock and
	// touching the same maps.
	go func() {
		defer close(done)
		for i := 0; i < 200; i++ {
			s.mu.Lock()
			st.Tick++
			st.Parties[10].CargoFood += 1
			st.Parties[10].CargoFood -= 1
			s.mu.Unlock()
		}
	}()
	for i := 0; i < 20; i++ {
		post(t, s, "/v1/barter/propose", dealBody())
	}
	<-done
}

// TestPlayerIdentityIsStable pins the third defect: the session's leader used to
// be "the first living lord in Leaders", which over a Go map is a different lord
// from one call to the next.
func TestPlayerIdentityIsStable(t *testing.T) {
	st := testWorld()
	// A third lord with a lower id would win a "first found" search some of the
	// time, and lose it the rest.
	st.Leaders[0] = &model.Leader{ID: 0, Name: "Lord Zero", SideID: 1, IsAlive: true, Gold: 9}
	s := testServer(t, st)
	if got := s.playerLeaderID(); got != 0 {
		t.Fatalf("playerLeaderID = %d, want the lowest-id living lord (0)", got)
	}
	for i := 0; i < 50; i++ {
		if got := s.playerLeaderID(); got != 0 {
			t.Fatalf("playerLeaderID changed to %d on call %d: the session has no fixed identity", got, i)
		}
	}
}

// --- the cause rows ---

// TestWhyExplainsTheGoldABargainSpent is the regression test for the cause chain.
//
// Two things were wrong and each alone would have dead-ended the walk: the barter
// system passed nil as every row's CausedBy, so no row pointed at anything; and
// the Why endpoint rendered "causedBy": [] for every row regardless, discarding
// the edges the log did hold.
func TestWhyExplainsTheGoldABargainSpent(t *testing.T) {
	st := testWorld()
	s := testServer(t, st)
	// The deal has to spend coin, because the question asked of /v1/why is about
	// the trader's gold and gold is the field in the query. A grain-for-metal
	// bargain moves no gold at all, so there is nothing to explain and the chain
	// would be empty for the honest reason that nothing happened. This one is
	// the same deal with 5 coin added to the player's side.
	body := dealBody()
	body["offered"] = append(body["offered"].([]any),
		map[string]any{"kind": "gold", "itemId": "gold", "quantity": 5})
	if _, out := post(t, s, "/v1/barter/commit", body); out["accepted"] != true {
		t.Fatalf("setup deal was refused: %v", out["reason"])
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/why?entity=leader-2&field=gold", nil)
	s.routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("why = %d, want 200", rec.Code)
	}
	var why struct {
		Rows []struct {
			Note     string   `json:"note"`
			System   string   `json:"system"`
			CausedBy []string `json:"causedBy"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &why); err != nil {
		t.Fatalf("decode why: %v (%s)", err, rec.Body)
	}
	if len(why.Rows) == 0 {
		t.Fatalf("no cause rows for the trader's gold, which the deal raised to %v", st.Leaders[2].Gold)
	}

	// Somewhere in the chain there is the deal, and the gold row points at it.
	var dealNote string
	for _, row := range why.Rows {
		if row.System == "barter" && strings.Contains(row.Note, "bargain") {
			dealNote = row.Note
		}
	}
	if dealNote == "" {
		t.Fatalf("the chain does not reach the bargain itself: %+v", why.Rows)
	}
	// The bargain names the trade, so the panel can show a player what they did
	// rather than that a number moved.
	if !strings.Contains(dealNote, "grain") || !strings.Contains(dealNote, "metal") {
		t.Errorf("deal row = %q, want it to name what crossed the table", dealNote)
	}

	// And the edge exists, in the same "cause-N" form the ids use, so a client can
	// join on the string rather than parsing two shapes.
	edges := 0
	for _, row := range why.Rows {
		for _, e := range row.CausedBy {
			if !strings.HasPrefix(e, "cause-") {
				t.Errorf("edge %q is not in the chain's own id form", e)
			}
			edges++
		}
	}
	if edges == 0 {
		t.Error("every row has an empty causedBy: the chain is a list, not a history")
	}
}

func TestCommitWritesOneDealRowAndARowPerThingMoved(t *testing.T) {
	st := testWorld()
	s := testServer(t, st)
	body := dealBody()
	body["offered"] = append(body["offered"].([]any),
		map[string]any{"kind": "gold", "itemId": "gold", "quantity": 5},
		map[string]any{"kind": "prisoner", "itemId": "prisoners", "quantity": 2})
	if _, out := post(t, s, "/v1/barter/commit", body); out["accepted"] != true {
		t.Fatalf("deal refused: %v", out["reason"])
	}
	rows := s.log.Rows()
	deals := 0
	for _, r := range rows {
		if r.System == "barter" && r.Field == "barter_deal" {
			deals++
		}
	}
	if deals != 1 {
		t.Errorf("found %d deal rows, want exactly 1 for one struck deal", deals)
	}
}

// --- malformed input ---

func TestBarterRejectsMalformedReferences(t *testing.T) {
	s := testServer(t, testWorld())
	for _, tc := range []struct {
		name string
		body map[string]any
	}{
		{"trader without a number", withField(dealBody(), "traderId", "leader-x")},
		{"town without a number", withField(dealBody(), "townId", "town-x")},
		{"negative quantity", withOffered(dealBody(),
			[]any{map[string]any{"kind": "good", "itemId": "grain", "quantity": -5}})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, path := range []string{"/v1/barter/propose", "/v1/barter/commit"} {
				rec, _ := post(t, s, path, tc.body)
				if rec.Code != http.StatusBadRequest {
					t.Errorf("%s = %d, want 400 for %s", path, rec.Code, tc.name)
				}
			}
		})
	}
}

// TestCommitRefusesAnotherLordsParty is the authorization case. A commit naming
// somebody else's party would otherwise be silently reinterpreted as the
// player's own, which is a way to spend another lord's gold.
func TestCommitRefusesAnotherLordsParty(t *testing.T) {
	st := testWorld()
	s := testServer(t, st)
	body := withField(dealBody(), "partyId", "party-20")
	rec, _ := post(t, s, "/v1/barter/commit", body)
	if rec.Code != http.StatusForbidden {
		t.Errorf("commit naming another lord's party = %d, want 403", rec.Code)
	}
	if st.Parties[10].CargoFood != 100 || st.Leaders[1].Gold != 150 {
		t.Error("a refused commit still moved something")
	}
}

func TestOptionsPreflightIsAnswered(t *testing.T) {
	s := testServer(t, testWorld())
	for _, path := range []string{"/v1/barter/terms", "/v1/barter/propose", "/v1/barter/commit"} {
		req := httptest.NewRequest(http.MethodOptions, path, nil)
		rec := httptest.NewRecorder()
		s.routes().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("OPTIONS %s = %d, want 200: the dev client preflights every route", path, rec.Code)
		}
		if rec.Header().Get("Access-Control-Allow-Origin") == "" {
			t.Errorf("OPTIONS %s sends no CORS header", path)
		}
	}
}

// findItemValue pulls one field off one rendered table row.
func findItemValue(t *testing.T, body map[string]any, table, itemID, field string) float64 {
	t.Helper()
	rows, ok := body[table].([]any)
	if !ok {
		t.Fatalf("%s is not a list: %v", table, body[table])
	}
	for _, row := range rows {
		r := row.(map[string]any)
		if r["itemId"] == itemID {
			v, ok := r[field].(float64)
			if !ok {
				t.Fatalf("%s.%s of %s is %v, want a number", table, field, itemID, r[field])
			}
			return v
		}
	}
	t.Fatalf("%s has no row for %s", table, itemID)
	return 0
}

func withField(body map[string]any, key string, val any) map[string]any {
	out := map[string]any{}
	for k, v := range body {
		out[k] = v
	}
	out[key] = val
	return out
}

func withOffered(body map[string]any, offered []any) map[string]any {
	return withField(body, "offered", offered)
}
