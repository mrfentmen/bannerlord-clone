package main

import (
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

func TestAPISnapshotUsesShippedSettlementFeed(t *testing.T) {
	settlements, err := loadSettlements("")
	if err != nil {
		t.Fatalf("load shipped settlement feed: %v", err)
	}
	if len(settlements) != 487 {
		t.Fatalf("loaded %d real settlements, want 487", len(settlements))
	}

	cfg, err := config.Load(filepath.Join("..", "..", "config", "balance.toml"))
	if err != nil {
		t.Fatalf("load balance config: %v", err)
	}
	camp, err := campaign.New(cfg, campaign.Options{Seed: 1, Settlements: settlements})
	if err != nil {
		t.Fatalf("build campaign: %v", err)
	}

	server := httptest.NewServer(api.New(camp, api.Options{}))
	defer server.Close()
	response, err := http.Get(server.URL + "/v1/snapshot")
	if err != nil {
		t.Fatalf("get live snapshot: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("snapshot returned HTTP %d", response.StatusCode)
	}

	var snapshot wire.SimSnapshot
	if err := json.NewDecoder(response.Body).Decode(&snapshot); err != nil {
		t.Fatalf("decode live snapshot: %v", err)
	}
	if len(snapshot.Towns) != 487 {
		t.Fatalf("snapshot has %d towns, want 487 real settlements", len(snapshot.Towns))
	}
	for _, town := range snapshot.Towns {
		if town.Name == "Columbus" {
			return
		}
	}
	t.Fatal("snapshot is missing Columbus from the shipped Ohio settlement feed")
}

func TestLoadSettlementsAllowsExplicitSyntheticMap(t *testing.T) {
	settlements, err := loadSettlements("-")
	if err != nil {
		t.Fatalf("select synthetic map: %v", err)
	}
	if len(settlements) != 0 {
		t.Fatalf("synthetic map unexpectedly loaded %d real settlements", len(settlements))
	}
}

func TestLoadSettlementsRejectsMissingExplicitFeed(t *testing.T) {
	if _, err := loadSettlements(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Fatal("missing explicit feed should fail instead of silently using a synthetic map")
	}
}
