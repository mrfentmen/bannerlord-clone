package worldgen

import (
	"fmt"
	"testing"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
)

// TestLandlessRulerPartyNotStranded verifies that a landless ruler's party is
// based at a town of its side, not stranded at the map origin (0,0) with no
// home. Stranded parties can never resupply, starve where they stand, and are
// permanently disqualified from acting by the AI's supply check.
func TestLandlessRulerPartyNotStranded(t *testing.T) {
	cfg, err := config.Load("../../config/balance.toml")
	if err != nil {
		t.Fatal(err)
	}
	var settlements []Settlement
	for i := 0; i < 6; i++ {
		settlements = append(settlements, Settlement{
			Name: fmt.Sprintf("Town %d", i), State: "Testland",
			SideID: i % 3, Population: 20000,
			X: 200 + float64(i*50), Y: 200,
			Terrain: model.TerrainPlain,
		})
	}
	// Run across several seeds; landless rulers are common.
	for _, seed := range []uint64{1, 7, 31337} {
		st := Generate(cfg, seed, settlements).State
		stranded := 0
		for _, pid := range st.PartyIDs() {
			p := st.Parties[pid]
			if p.Troops <= 0 || p.IsCaravan || p.IsRaider {
				continue
			}
			if p.X == 0 && p.Y == 0 {
				stranded++
				t.Errorf("seed %d: party#%d (ruler %d) stranded at origin", seed, pid, p.RulerID)
			}
			if p.HomeTown < 0 {
				t.Errorf("seed %d: party#%d (ruler %d) has no home town", seed, pid, p.RulerID)
			}
		}
		if stranded > 0 {
			t.Fatalf("seed %d: %d parties stranded at origin", seed, stranded)
		}
	}
}
