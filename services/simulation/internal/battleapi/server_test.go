package battleapi

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mbclone/simulation/internal/config"
)

func testConfig(t *testing.T) *config.Config {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for d := dir; ; d = filepath.Dir(d) {
		p := filepath.Join(d, "config", "balance.toml")
		if _, err := os.Stat(p); err == nil {
			cfg, err := config.Load(p)
			if err != nil {
				t.Fatalf("config did not load from %s: %v", p, err)
			}
			return cfg
		}
		if parent := filepath.Dir(d); parent == d {
			t.Fatal("config/balance.toml not found walking up from " + dir)
		}
	}
}

func testServer(t *testing.T) (*Server, *httptest.Server) {
	t.Helper()
	s := New(testConfig(t), 0xC0FFEE, "test-build")
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)
	return s, srv
}

func postJSON(t *testing.T, url string, body string) (int, map[string]any) {
	t.Helper()
	resp, err := http.Post(url, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	return resp.StatusCode, out
}

func startBattle(t *testing.T, srv *httptest.Server, session string) string {
	t.Helper()
	code, out := postJSON(t, srv.URL+"/v1/battle/start", fmt.Sprintf(`{
		"campaign_session_id": %q,
		"attacker_party_id": "party-a", "attacker_party_name": "Attackers",
		"defender_party_id": "party-b", "defender_party_name": "Defenders",
		"options": {"units_per_side": 20}
	}`, session))
	if code != http.StatusCreated {
		t.Fatalf("start: status %d, body %v", code, out)
	}
	id, _ := out["battle_id"].(string)
	if id == "" {
		t.Fatalf("start returned no battle_id: %v", out)
	}
	return id
}

func getState(t *testing.T, srv *httptest.Server, battleID, session string) (int, map[string]any) {
	t.Helper()
	url := fmt.Sprintf("%s/v1/battle/state?battle_id=%s&campaign_session_id=%s", srv.URL, battleID, session)
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("state response is not JSON: %v", err)
	}
	return resp.StatusCode, out
}

// Starting with invalid party ids is a 400 and never a battle.
func TestStartRejectsBadParties(t *testing.T) {
	_, srv := testServer(t)
	for _, body := range []string{
		`{"campaign_session_id":"s","attacker_party_id":"","defender_party_id":"b"}`,
		`{"campaign_session_id":"s","attacker_party_id":"a","defender_party_id":"a"}`,
		`{"attacker_party_id":"a","defender_party_id":"b"}`,
	} {
		code, out := postJSON(t, srv.URL+"/v1/battle/start", body)
		if code != http.StatusBadRequest {
			t.Fatalf("body %s: status %d, want 400 (body %v)", body, code, out)
		}
	}
	// Nothing was created: an unknown id is a 404, not a half-made battle.
	code, _ := getState(t, srv, "btl-999", "s")
	if code != http.StatusNotFound {
		t.Fatalf("unknown battle: status %d, want 404", code)
	}
}

// State reports phase, tick, both rosters, and events; two polls with ticks
// between them show the tick advancing.
func TestStateAdvances(t *testing.T) {
	s, srv := testServer(t)
	id := startBattle(t, srv, "s1")

	code, st1 := getState(t, srv, id, "s1")
	if code != http.StatusOK {
		t.Fatalf("state: status %d (%v)", code, st1)
	}
	if st1["phase"] != "fighting" {
		t.Fatalf("phase = %v, want fighting", st1["phase"])
	}
	sides, _ := st1["sides"].([]any)
	if len(sides) != 2 {
		t.Fatalf("sides = %v, want 2", st1["sides"])
	}
	for _, sd := range sides {
		m := sd.(map[string]any)
		if m["bodies"].(float64) <= 0 {
			t.Fatalf("side %v has no bodies", m["party_id"])
		}
	}
	tick1 := int(st1["tick"].(float64))
	s.pump()
	s.pump()
	_, st2 := getState(t, srv, id, "s1")
	tick2 := int(st2["tick"].(float64))
	if tick2 <= tick1 {
		t.Fatalf("tick did not advance: %d -> %d", tick1, tick2)
	}
	if _, ok := st2["recent_events"]; !ok {
		t.Fatal("state has no recent_events")
	}
}

// A battle id from another campaign session is rejected, never served.
func TestSessionBinding(t *testing.T) {
	_, srv := testServer(t)
	id := startBattle(t, srv, "s1")
	code, out := getState(t, srv, id, "s2")
	if code != http.StatusForbidden {
		t.Fatalf("wrong session: status %d, want 403 (%v)", code, out)
	}
	code, _ = getState(t, srv, id, "s1")
	if code != http.StatusOK {
		t.Fatalf("right session: status %d, want 200", code)
	}
}

// Orders validate against the fourteen-order set. An unknown order is a 400
// carrying the valid list.
func TestOrdersValidation(t *testing.T) {
	_, srv := testServer(t)
	id := startBattle(t, srv, "s1")

	code, out := postJSON(t, srv.URL+"/v1/battle/orders", fmt.Sprintf(
		`{"battle_id":%q,"campaign_session_id":"s1","orders":[{"name":"advance"},{"name":"flank","params":{"side":"left"}}]}`,
		id))
	if code != http.StatusOK {
		t.Fatalf("valid orders: status %d (%v)", code, out)
	}
	if out["accepted"].(float64) != 2 {
		t.Fatalf("accepted = %v, want 2", out["accepted"])
	}

	code, out = postJSON(t, srv.URL+"/v1/battle/orders", fmt.Sprintf(
		`{"battle_id":%q,"campaign_session_id":"s1","orders":[{"name":"teleport"}]}`, id))
	if code != http.StatusBadRequest {
		t.Fatalf("unknown order: status %d, want 400 (%v)", code, out)
	}
	valid, _ := out["valid_orders"].([]any)
	if len(valid) != 14 {
		t.Fatalf("valid_orders has %d entries, want 14 (%v)", len(valid), out)
	}
}

// Resolve fast-forwards a live battle to a decision; resolving again returns
// the same outcome.
func TestResolveIdempotent(t *testing.T) {
	_, srv := testServer(t)
	id := startBattle(t, srv, "s1")
	code, out := postJSON(t, srv.URL+"/v1/battle/resolve",
		fmt.Sprintf(`{"battle_id":%q,"campaign_session_id":"s1"}`, id))
	if code != http.StatusOK {
		t.Fatalf("resolve: status %d (%v)", code, out)
	}
	if out["phase"] != "resolved" {
		t.Fatalf("phase = %v, want resolved", out["phase"])
	}
	oc, _ := out["outcome"].(map[string]any)
	if oc == nil || oc["kind"] == nil {
		t.Fatalf("resolved battle has no outcome: %v", out)
	}
	code2, out2 := postJSON(t, srv.URL+"/v1/battle/resolve",
		fmt.Sprintf(`{"battle_id":%q,"campaign_session_id":"s1"}`, id))
	if code2 != http.StatusOK {
		t.Fatalf("second resolve: status %d", code2)
	}
	oc2 := out2["outcome"].(map[string]any)
	if oc2["kind"] != oc["kind"] || out2["tick"] != out["tick"] {
		t.Fatal("second resolve changed the outcome: not idempotent")
	}
}

func TestVersion(t *testing.T) {
	_, srv := testServer(t)
	resp, err := http.Get(srv.URL + "/v1/version")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out["api"] != "v1" || out["build_hash"] != "test-build" {
		t.Fatalf("version = %v, want api v1 with the injected build hash", out)
	}
}

// --- WebSocket stream ---

// wsClient is a minimal RFC 6455 client: handshake, then unmasked text frames.
type wsClient struct {
	conn net.Conn
	r    *bufio.Reader
}

func dialWS(t *testing.T, srv *httptest.Server, battleID, session string) *wsClient {
	t.Helper()
	addr := strings.TrimPrefix(srv.URL, "http://")
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Fprintf(conn, "GET /v1/battle/stream?battle_id=%s&campaign_session_id=%s HTTP/1.1\r\n"+
		"Host: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"+
		"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
		battleID, session, addr)
	r := bufio.NewReader(conn)
	status, err := r.ReadString('\n')
	if err != nil || !strings.Contains(status, "101") {
		t.Fatalf("handshake: %q, %v", status, err)
	}
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		if line == "\r\n" {
			break
		}
	}
	return &wsClient{conn: conn, r: r}
}

func (c *wsClient) readMessage(t *testing.T) map[string]any {
	t.Helper()
	_ = c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(c.r, hdr); err != nil {
		t.Fatalf("frame header: %v", err)
	}
	n := int(hdr[1] & 0x7F)
	switch n {
	case 126:
		var ext [2]byte
		_, _ = io.ReadFull(c.r, ext[:])
		n = int(ext[0])<<8 | int(ext[1])
	case 127:
		var ext [8]byte
		_, _ = io.ReadFull(c.r, ext[:])
		var v uint64
		for _, b := range ext {
			v = v<<8 | uint64(b)
		}
		n = int(v)
	}
	payload := make([]byte, n)
	if _, err := io.ReadFull(c.r, payload); err != nil {
		t.Fatalf("frame payload: %v", err)
	}
	var msg map[string]any
	if err := json.Unmarshal(payload, &msg); err != nil {
		t.Fatalf("message is not JSON: %v", err)
	}
	return msg
}

func (c *wsClient) close() { _ = c.conn.Close() }

// A mid-battle subscriber gets the full current state first, then snapshots
// at 10 Hz with event deltas keyed by sequence.
func TestStreamFullStateThenDeltas(t *testing.T) {
	s, srv := testServer(t)
	id := startBattle(t, srv, "s1")
	s.pump()
	s.pump()

	c := dialWS(t, srv, id, "s1")
	defer c.close()

	first := c.readMessage(t)
	if first["battle_id"] != id {
		t.Fatalf("first message battle_id = %v, want %s", first["battle_id"], id)
	}
	if _, ok := first["state"]; !ok {
		t.Fatalf("first message has no full state: %v", first)
	}
	tick0 := int(first["tick"].(float64))

	// Advance the sim, then confirm a later snapshot shows a later tick and
	// that event sequences never go backwards.
	for i := 0; i < 20; i++ {
		s.pump()
	}
	var lastSeq = -1.0
	var sawAdvance bool
	for i := 0; i < 15; i++ {
		msg := c.readMessage(t)
		if int(msg["tick"].(float64)) > tick0 {
			sawAdvance = true
		}
		if evs, ok := msg["events"].([]any); ok {
			for _, e := range evs {
				seq := e.(map[string]any)["seq"].(float64)
				if seq <= lastSeq {
					t.Fatalf("event seq went backwards: %v after %v", seq, lastSeq)
				}
				lastSeq = seq
			}
		}
		if msg["type"] == "resolved" {
			break
		}
	}
	if !sawAdvance {
		t.Fatal("stream never showed a tick advance after 20 pump wakes")
	}
}
