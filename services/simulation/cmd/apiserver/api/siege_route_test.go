package api_test

// The HTTP boundary of laying a siege.
//
// The behaviour of a siege is tested in the campaign package, beside the world it acts
// on. What belongs here is the boundary the client's `startSiege` order crosses: that
// the route is mounted at all, that it reads the payload the client sends, that it
// answers with the id the assault and lift routes take, and that every refusal crosses
// as a refusal carrying a reason rather than as an unhandled failure.
//
// The route existed because of a specific failure: the provider method was implemented,
// was covered by tests that passed against the fixture, and had no server route to
// call, so every siege the player laid answered "that path is not part of the campaign
// API". A 404 from this route is therefore the failure these tests exist to catch, and
// it is checked by name rather than left to the general contract test in the client.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mbclone/simulation/cmd/apiserver/wire"
)

// playerPartyID reads the player's party id off the snapshot, in the form the client
// sends it: the campaign writes `party-7`, and the client's order names a force by
// exactly the reference the snapshot handed out.
func playerPartyID(t *testing.T, serve http.Handler) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/snapshot", nil)
	rec := httptest.NewRecorder()
	serve.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/snapshot answered %d: %s", rec.Code, rec.Body.String())
	}
	var snap struct {
		Party struct {
			ID string `json:"id"`
		} `json:"party"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
		t.Fatalf("the snapshot did not decode: %v", err)
	}
	if snap.Party.ID == "" {
		t.Fatalf("the snapshot carries no party id: %s", rec.Body.String())
	}
	return snap.Party.ID
}

// TestTownSiegeRouteIsMounted: the client's order, refused for want of a besieging
// force. A 404 would mean the route is missing, which is the bug this route was added
// for; a 400 means it is mounted and answering.
func TestTownSiegeRouteIsMounted(t *testing.T) {
	serve := newServer(t)
	status, body := post(t, serve, "/v1/towns/town-1/siege", map[string]any{"attackerPartyIds": []string{}})
	if status == http.StatusNotFound {
		t.Fatalf("POST /v1/towns/{id}/siege is not mounted: %v", body)
	}
	if status == http.StatusOK {
		t.Fatalf("a siege was laid with nobody named to lay it: %v", body)
	}
	if body["error"] == nil {
		t.Fatalf("the route refused without an error body: %v", body)
	}
	if reason, _ := body["reason"].(string); reason == "" {
		t.Errorf("the route refused without a reason a player can read: %v", body)
	}
}

// TestTownSiegeRouteNamesTheTownInThePath: the town the path does not name is a bad
// request, not a siege of whatever town happens to be first. This route takes the
// town by simulation id — bare or prefixed — because that is the form the snapshot
// writes and the form the client's order sends.
func TestTownSiegeRouteNamesTheTownInThePath(t *testing.T) {
	serve := newServer(t)
	for _, ref := range []string{"town-nope", "town-", "3.5", "longmont"} {
		t.Run(ref, func(t *testing.T) {
			status, body := post(t, serve, "/v1/towns/"+ref+"/siege", map[string]any{
				"attackerPartyIds": []string{"party-1"},
			})
			if status == http.StatusOK {
				t.Fatalf("a siege was laid on the unnameable town %q: %v", ref, body)
			}
			if status == http.StatusNotFound {
				t.Fatalf("the route for town %q is not mounted: %v", ref, body)
			}
			if reason, _ := body["reason"].(string); reason == "" {
				t.Errorf("town %q was refused without a reason: %v", ref, body)
			}
		})
	}
}

// TestTownSiegeRouteReadsTheClientPayload: the exact body the client's provider sends,
// with its optional army id, and a party named as the campaign names parties elsewhere
// on the wire. The route has to get past decoding for the refusal below to be about
// the world rather than about the request.
func TestTownSiegeRouteReadsTheClientPayload(t *testing.T) {
	serve := newServer(t)
	attacker := playerPartyID(t, serve)
	// A town no world has, so this cannot accidentally succeed and prove nothing.
	status, body := post(t, serve, "/v1/towns/town-999999/siege", map[string]any{
		"attackerPartyIds": []string{attacker},
		"armyId":           "army-3",
	})
	if status == http.StatusOK {
		t.Fatalf("a siege was laid on a town that does not exist: %v", body)
	}
	if reason, _ := body["reason"].(string); reason == "" {
		t.Errorf("the route refused without a reason a player can read: %v", body)
	}
}

// TestTownSiegeRouteRejectsAnUnknownField: the boundary refuses a body it does not
// understand rather than ignoring the parts it does. A client that sent "attackerId"
// instead of "attackerPartyIds" would otherwise be told a force was named.
func TestTownSiegeRouteRejectsAnUnknownField(t *testing.T) {
	serve := newServer(t)
	status, body := post(t, serve, "/v1/towns/town-1/siege", map[string]any{
		"attackerId": "party-1",
	})
	if status == http.StatusOK {
		t.Fatalf("a body the route cannot read was accepted: %v", body)
	}
}

// TestTownSiegeResultShape pins the field the client reads. The client's startSiege
// returns `{ siegeId }` and spends it on POST /v1/sieges/{id}/assault and /lift, so a
// reply that dropped the field would leave those two routes with an empty id.
func TestTownSiegeResultShape(t *testing.T) {
	raw := `{"siegeId":"siege-4"}`
	var got wire.TownSiegeResult
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatalf("a well-formed laid-siege reply did not decode: %v", err)
	}
	if got.SiegeID != "siege-4" {
		t.Errorf("siegeId = %q, want %q", got.SiegeID, "siege-4")
	}
}
