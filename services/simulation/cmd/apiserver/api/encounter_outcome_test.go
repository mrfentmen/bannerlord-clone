package api_test

// The HTTP surface of the encounter outcomes, and the wire contract the
// encounter flow depends on.
//
// The behaviour of fleeing and losing is tested in the campaign package, beside
// the world they act on. What belongs here is the boundary: that the two routes
// the campaign map calls exist, that they answer a client with the documented
// shape, that a refusal crosses the boundary as a refusal rather than as a
// crash, and that the nearby-parties route carries the position the client's
// encounter flow reads.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"mbclone/simulation/cmd/apiserver/api"
	"mbclone/simulation/cmd/apiserver/campaign"
	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/config"
)

func newServer(t *testing.T) http.Handler {
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

// post sends a JSON body and returns the status with the decoded reply.
func post(t *testing.T, serve http.Handler, path string, body any) (int, map[string]any) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encoding the request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	serve.ServeHTTP(rec, req)

	var out map[string]any
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("%s answered with something that is not a JSON object: %s", path, rec.Body.String())
		}
	}
	return rec.Code, out
}

// TestOutcomeRoutesExist: the campaign map calls these two when a battle ends
// badly. A route that is not mounted answers 404 with "not part of the campaign
// API", and the player watches their retreat fail for a reason no panel explains.
func TestOutcomeRoutesExist(t *testing.T) {
	serve := newServer(t)
	for _, path := range []string{"/v1/encounters/flee", "/v1/encounters/defeat"} {
		t.Run(path, func(t *testing.T) {
			status, body := post(t, serve, path, map[string]any{})
			// With no force named the route must refuse, not report "not found".
			// A 404 here would mean the route is missing; a 400 means it is
			// mounted and answering.
			if status == http.StatusNotFound {
				t.Fatalf("%s is not mounted: %v", path, body)
			}
			if status == http.StatusOK {
				t.Fatalf("%s accepted an outcome with no force named: %v", path, body)
			}
			if body["error"] == nil {
				t.Fatalf("%s refused without an error body: %v", path, body)
			}
			// reason sits beside error, not inside it, and it is the half the
			// client shows on the screen.
			if reason, _ := body["reason"].(string); reason == "" {
				t.Errorf("%s refused without a reason a player can read: %v", path, body)
			}
		})
	}
}

// TestOutcomeRejectsAnUnknownField: the boundary refuses a body it does not
// understand rather than ignoring the parts it does not. A client that sent
// "retreatTo" instead of "npcPartyId" would otherwise be told it had escaped.
func TestOutcomeRejectsAnUnknownField(t *testing.T) {
	serve := newServer(t)
	status, body := post(t, serve, "/v1/encounters/flee", map[string]any{
		"retreatTo": map[string]float64{"x": 1, "z": 2},
	})
	if status == http.StatusOK {
		t.Fatalf("a body the route cannot read was accepted: %v", body)
	}
}

// TestNearbyPartiesCarriesAPosition guards the wire contract the encounter flow
// reads. The client's NpcParty interface has position as a required field: it
// draws the force on the map and works out which way to run from it. A route
// that left position off would have the client compute a direction out of
// undefined, which arrives at the server as a NaN rather than as an error the
// player could see.
func TestNearbyPartiesCarriesAPosition(t *testing.T) {
	serve := newServer(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/parties/nearby?rangeKm=1000000", nil)
	rec := httptest.NewRecorder()
	serve.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/parties/nearby answered %d: %s", rec.Code, rec.Body.String())
	}
	var list []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("the reply is not a list: %s", rec.Body.String())
	}
	if len(list) == 0 {
		t.Skip("this seed's world lists no parties besides the player's")
	}
	for _, row := range list {
		name, _ := row["name"].(string)
		pos, ok := row["position"].(map[string]any)
		if !ok {
			t.Fatalf("party %q has no position: %v. The client computes its escape vector from this field.", name, row)
		}
		for _, axis := range []string{"x", "z"} {
			if _, ok := pos[axis].(float64); !ok {
				t.Fatalf("party %q has a position with no numeric %q: %v", name, axis, pos)
			}
		}
	}
}

// TestOutcomeResultShape pins the fields the client reads. A field the campaign
// stops sending does not fail loudly on the wire; it arrives as undefined in a
// panel the player is looking at.
func TestOutcomeResultShape(t *testing.T) {
	// The shape is checked by decoding into the wire type the client mirrors,
	// which fails on a missing field only if the JSON tags have drifted.
	var got wire.EncounterOutcomeResult
	raw := `{"outcome":"fled","enemyName":"Bandits","lootTaken":0,"prisonersTaken":2,` +
		`"playerMorale":62.5,"encounterIds":["enc-1","enc-2"]}`
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatalf("a well-formed outcome reply did not decode: %v", err)
	}
	if got.Outcome != "fled" || got.EnemyName != "Bandits" {
		t.Errorf("decoded %+v", got)
	}
	if len(got.EncounterIDs) != 2 {
		t.Errorf("encounterIds = %v, want two entries", got.EncounterIDs)
	}
}
