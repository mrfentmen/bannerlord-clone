package replay

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/battleapi"
	"mbclone/simulation/internal/config"
)

// A player's orders, through the transport the game actually uses.
//
// WHY THIS FILE IS HERE AND NOT IN internal/battleapi
//
// internal/battleapi is not any agent's declared lane, and internal/battle is
// agent1's and agent3's. So this lives in internal/replay, which is mine, and it
// reaches across both: it drives the exported HTTP API with the exported
// requests, and it asks one question of the result.
//
// The question is the join between two things that are each separately proven.
// internal/battle proves that an order name plus parameters, through
// Orders.Apply and Orders.Commander and Session.Command, becomes per-unit orders
// the engine obeys — playerorders_test.go in that package drives all three calls
// and checks the shape moves and the log grows. internal/battleapi proves that
// the intake validates an order name against the fourteen and counts it. Neither
// proves that the two are CONNECTED, and the join is where this class of defect
// lives: two halves, each with a test, and nothing in either test that would fail
// if the wire stopped short of the engine.
//
// It is a replay defect as much as a gameplay one. The order log is a Commander
// wrapper on the command seam, and the seam is never crossed if no order is ever
// handed to the session: the recorder then has nothing to record, and a played
// battle is a battle whose log is empty while the player was told their orders
// were accepted. An empty log replays cleanly, because an empty log means "nobody
// ordered anything" and the engine agrees. So this failure does not show up as a
// mismatch either. It shows up as a game that does not do what it says it does.
//
// THE TWO SERVER INSTANCES, AND WHY TWO
//
// Both servers are built from the same campaign seed and start one battle each,
// so both are at battle counter 1 and are dealt the SAME seed. That is what makes
// the comparison mean anything: the only thing that differs between them is
// whether orders were sent. If a battle that was ordered and a battle that was
// not come out the same, the orders did nothing.

// TestOrdersSentThroughTheGameAPIReachTheBattle is the join, proved or disproved.
func TestOrdersSentThroughTheGameAPIReachTheBattle(t *testing.T) {
	cfg := loadConfig(t)
	// Twelve a side. This is not a battle whose outcome anyone should care about;
	// it is two runs of one compared with two runs of the other, and the cheapest
	// battle that has formations and a melee to be affected by an order is enough.
	const units = 12

	quiet := fightOverAPI(t, cfg, 5150, units, nil)
	// The wire spells the fourteen with hyphens, which is what ValidOrders returns
	// and what a client is told to send; the spaced form is a 400.
	loud := fightOverAPI(t, cfg, 5150, units, []string{
		`{"name":"hold-position"}`,
		`{"name":"change-formation","params":{"formation":"wedge"}}`,
		`{"name":"face-direction","params":{"bearing":-0.6}}`,
		`{"name":"move","params":{"x":-260,"y":140}}`,
		`{"name":"advance"}`,
	})

	// The two runs must be the same battle, or the comparison below proves
	// nothing. Same campaign seed, same parties, same size, one battle each: both
	// servers are at counter 1, so the seed is shared. Asserting it rather than
	// assuming it is what stops a future change to the derivation from turning
	// this test into a tautology.
	if quiet.seed != loud.seed {
		t.Fatalf("the two runs were not the same battle, so this test cannot compare them: seed %d "+
			"against %d. The two servers are built from the same campaign seed and start one battle each, "+
			"so the seeds should be equal and this is the derivation changing",
			quiet.seed, loud.seed)
	}

	if quiet.accepted != 0 {
		t.Fatalf("the run that was sent no orders reported accepting %d of them", quiet.accepted)
	}
	if loud.accepted != 5 {
		t.Fatalf("the run that was sent five orders had %d accepted by the API", loud.accepted)
	}
	t.Logf("both runs: seed %d, battle id %q, %d units a side", quiet.seed, quiet.id, units)
	t.Logf("orders accepted by POST /v1/battle/orders: %d of %d sent; the server reports "+
		"%d of them logged", loud.accepted, 5, loud.ordersLogged)

	if same := quiet.fingerprint(); same == loud.fingerprint() {
		t.Errorf("the API accepted %d orders and reported them logged, and the battle it fought is "+
			"the same battle as the one fought with no orders at all.\n"+
			"  both: seed %d, %s\n"+
			"  POST /v1/battle/orders returned accepted=%d and GET /v1/battle/state reports "+
			"orders_logged=%d, so the client was told its orders were taken.\n"+
			"  The orders never reached the engine. handleOrders validates each name against the "+
			"fourteen and appends it to the entry's own slice; it never builds an Orders and never "+
			"calls Session.Command, so no commander is ever attached and nothing writes View.Commands.\n"+
			"  The wire cannot carry the fix on its own either: an order is {name, params} with no "+
			"side and no group, and Session.Command needs a commander built for one side's formations "+
			"(battle.NewOrders(cfg, side, groups)), so choosing which formation a player's order is "+
			"for is a wire-format decision that has not been made.\n"+
			"  Note also that this cannot surface as a replay mismatch. With no order crossing the "+
			"seam the order log is empty, and an empty log replays cleanly because an empty log "+
			"correctly means nobody commanded anything.",
			loud.accepted, quiet.seed, quiet.fingerprint(), loud.accepted, loud.ordersLogged)
	}
}

// TestTheBattleAPIDoesNotDealTheSameBattleTwice is the other half of the same
// walk-through, and it is a restart story.
//
// battle.DeriveBattleSeed is an HMAC over the campaign seed, a battle counter and
// the two party ids, which is a good design: given a campaign and a counter it is
// unforgeable and reproducible. The counter, though, is a field on the Server and
// the Server is a process. Start the server again and the counter is 0 again, the
// first battle is btl-1 again, and the same two parties are dealt the identical
// seed — and because the shipped server gives the session no commander, a battle
// is a pure function of the config and the seed, so it is the identical battle.
// Same tick count, same casualties, same result hash, the second time the player
// fights that border.
//
// It is a one-line fix and it is NOT MINE to make, because the fix is a storage
// decision and CONSTITUTION.md 4.1 records storage as unresolved: persisting the
// counter needs somewhere to persist it, and deriving it from a clock breaks the
// property that a campaign's battles are a function of its seed. CONSTITUTION.md
// 2.3 says a gap of that kind goes in CHANGELOG under Unresolved with the reason,
// which is where it went.
func TestTheBattleAPIDoesNotDealTheSameBattleTwice(t *testing.T) {
	cfg := loadConfig(t)
	a := startBattleOverAPI(t, cfg, 909, 12)
	b := startBattleOverAPI(t, cfg, 909, 12)

	if a.seed == b.seed {
		t.Errorf("two servers built from campaign seed 909, each starting its first battle for the "+
			"same two parties, were dealt the same battle seed %d and the same battle id %q.\n"+
			"  battle.DeriveBattleSeed(campaignSeed, battleCounter, attacker, defender) is keyed on a "+
			"counter that is a field on Server, so a restart returns it to 0 and the first battle of "+
			"the new process is the first battle of the old one.\n"+
			"  With no commander attached to the session, a battle is a pure function of the config and "+
			"the seed, so this is not a shared roster or a shared id space: it is the same fight, "+
			"tick for tick.\n"+
			"  The fix is one line and it is a storage decision, so it belongs to whoever owns "+
			"CONSTITUTION.md 4.1. Logged in CHANGELOG.md under Unresolved.",
			a.seed, a.id)
		return
	}
	t.Logf("campaign seed 909: first battle on one server got seed %d, on another %d", a.seed, b.seed)
}

// TestTheShippedBattleAPIReachesTheCommandSeam is the source check for the two
// calls the API has to make and does not.
//
// Neither is observable through the HTTP surface: there is no route that returns
// a commander's orders and no route that returns an order log, which is part of
// why the defect above went unnoticed. So this reads the file, the way
// TestSeededOnly reads the imports of a package rather than trying to tell from
// the outside whether a draw came from the seeded stream.
//
// It parses rather than greps, so a mention in a comment cannot satisfy it.
func TestTheShippedBattleAPIReachesTheCommandSeam(t *testing.T) {
	path := filepath.Join("..", "battleapi", "server.go")
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, 0)
	if err != nil {
		t.Fatalf("parsing %s: %v", path, err)
	}

	called := map[string]bool{}
	ast.Inspect(file, func(n ast.Node) bool {
		sel, ok := n.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		switch sel.Sel.Name {
		case "Command":
			// Session.Command. A call on anything else with the same name is not
			// this, so the receiver is checked rather than trusted.
			if id, ok := sel.X.(*ast.Ident); ok && (id.Name == "sess" || id.Name == "e") {
				called["Command"] = true
			}
		case "Record":
			if id, ok := sel.X.(*ast.Ident); ok && (id.Name == "sess" || id.Name == "e") {
				called["Record"] = true
			}
		}
		return true
	})

	if !called["Command"] {
		t.Errorf("%s never calls Session.Command. That is the call that hands a commander to the "+
			"battle, and without it no order from a client reaches the command seam, so View.Commands "+
			"is never written and every order the API accepts is inert. orders_logged in the state "+
			"response goes up anyway, so the client cannot tell", path)
	}
	if !called["Record"] {
		t.Errorf("%s never calls Session.Record. Every battle the shipped server fights is therefore "+
			"unrecorded: no order log, no Recording, nothing for battle.BattleStore.Save, and nothing "+
			"for battle.VerifyEncoded to check afterwards. The replay machinery is reachable from "+
			"`simrun battle` and from nothing else in the shipped program", path)
	}
}

// apiFight is one battle fought over HTTP, and what came back.
type apiFight struct {
	id           string
	seed         uint64
	accepted     int
	ordersLogged int
	state        map[string]any
}

// fingerprint is everything the API publishes about how the fight went: the tick
// count, the outcome, and both sides' bodies, dead, wounded, surrendered and
// routed share. Two fights agreeing on all of it are the same fight.
func (f apiFight) fingerprint() string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "%d ticks, phase %v", f.tick(), f.state["phase"])
	if o, ok := f.state["outcome"].(map[string]any); ok {
		fmt.Fprintf(&sb, ", outcome %v (%v)", o["kind"], o["reason"])
	}
	if sides, ok := f.state["sides"].([]any); ok {
		for _, s := range sides {
			d, ok := s.(map[string]any)
			if !ok {
				continue
			}
			fmt.Fprintf(&sb, "\n    %v: %v bodies, %v dead, %v wounded, %v surrendered, %v routed",
				d["party_name"], d["bodies"], d["dead"], d["wounded"], d["surrendered"], d["routed_share"])
		}
	}
	return sb.String()
}

func (f apiFight) tick() int {
	t, _ := f.state["tick"].(float64)
	return int(t)
}

// fightOverAPI runs one whole battle over HTTP on a server of its own, optionally
// sending orders to it part way through, and returns what the API published.
func fightOverAPI(t *testing.T, cfg *config.Config, campaignSeed uint64, units int, orders []string) apiFight {
	t.Helper()
	srv := httptest.NewServer(battleapi.New(cfg, campaignSeed, "replay-test").Handler())
	defer srv.Close()

	start := startBattle(t, srv.URL, campaignSeed, units)
	out := apiFight{id: start.id, seed: start.seed}
	if len(orders) > 0 {
		out.accepted = sendOrders(t, srv.URL, start.id, orders)
	}
	out.state = resolve(t, srv.URL, start.id)
	out.ordersLogged = intOf(out.state["orders_logged"])
	return out
}

// startBattleOverAPI starts one battle on a server of its own and returns its id
// and seed without fighting it.
func startBattleOverAPI(t *testing.T, cfg *config.Config, campaignSeed uint64, units int) apiFight {
	t.Helper()
	srv := httptest.NewServer(battleapi.New(cfg, campaignSeed, "replay-test").Handler())
	defer srv.Close()
	start := startBattle(t, srv.URL, campaignSeed, units)
	return apiFight{id: start.id, seed: start.seed}
}

type apiStart struct {
	id   string
	seed uint64
}

func startBattle(t *testing.T, base string, campaignSeed uint64, units int) apiStart {
	t.Helper()
	body := fmt.Sprintf(`{"campaign_session_id":"s1","attacker_party_id":"p-north","attacker_party_name":`+
		`"the Northcoast Levies","defender_party_id":"p-hills","defender_party_name":"the Hillside Watch",`+
		`"options":{"units_per_side":%d}}`, units)
	code, out := postJSON(t, base+"/v1/battle/start", body)
	if code != http.StatusCreated {
		t.Fatalf("starting a battle: status %d (%v)", code, out)
	}
	return apiStart{id: strOf(out["battle_id"]), seed: uint64Of(out["seed"])}
}

func sendOrders(t *testing.T, base, id string, orders []string) int {
	t.Helper()
	body := fmt.Sprintf(`{"battle_id":%q,"campaign_session_id":"s1","orders":[%s]}`,
		id, strings.Join(orders, ","))
	code, out := postJSON(t, base+"/v1/battle/orders", body)
	if code != http.StatusOK {
		t.Fatalf("sending orders: status %d (%v)", code, out)
	}
	return intOf(out["accepted"])
}

func resolve(t *testing.T, base, id string) map[string]any {
	t.Helper()
	code, out := postJSON(t, base+"/v1/battle/resolve",
		fmt.Sprintf(`{"battle_id":%q,"campaign_session_id":"s1"}`, id))
	if code != http.StatusOK {
		t.Fatalf("resolving the battle: status %d (%v)", code, out)
	}
	return out
}

// postJSON posts and decodes, reporting the raw body on a non-2xx so that a
// failure says what the server said.
func postJSON(t *testing.T, url, body string) (int, map[string]any) {
	t.Helper()
	resp, err := http.Post(url, "application/json", bytes.NewBufferString(body))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading the response from %s: %v", url, err)
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("decoding the response from %s: %v\n%s", url, err, raw)
		}
	}
	return resp.StatusCode, out
}

func strOf(v any) string {
	s, _ := v.(string)
	return s
}

func intOf(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return 0
}

func uint64Of(v any) uint64 {
	switch n := v.(type) {
	case float64:
		return uint64(n)
	case uint64:
		return n
	}
	return 0
}
