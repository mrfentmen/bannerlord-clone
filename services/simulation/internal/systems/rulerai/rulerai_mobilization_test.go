package rulerai

import (
	"fmt"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/worldgen"
)

// TestWarDutyDrivesAttack verifies that a ruler whose side is at war chooses
// to attack rather than waiting. Before the war duty bonus, no ruler in a
// full simulated year ever chose any intention but waiting, because the
// scoring only rewarded attacking already-weak targets.
func TestWarDutyDrivesAttack(t *testing.T) {
	cfg, err := config.Load("../../../config/balance.toml")
	if err != nil {
		t.Fatal(err)
	}
	var settlements []worldgen.Settlement
	side := 0
	for i := 0; i < 12; i++ {
		settlements = append(settlements, worldgen.Settlement{
			Name: fmt.Sprintf("Test Town %d", i), State: "Testland",
			SideID: side, Population: 40000,
			X: 200 + float64((i%4)*60), Y: 200 + float64((i/4)*60),
			IsPort: i%3 == 0, Terrain: model.TerrainPlain,
		})
		side = (side + 1) % 6
	}
	s := worldgen.Generate(cfg, 31337, settlements).State
	log := cause.NewLog(100000)
	e := sim.NewEngine(cfg, log, 31337, []sim.System{System()})
	for d := 0; d < 30; d++ {
		if err := e.Tick(s); err != nil {
			t.Fatal(err)
		}
	}
	// Ensure at least one war exists for the test.
	if len(s.ActiveWars()) == 0 {
		t.Skip("no wars active at tick 30; cannot test war duty")
	}
	v := &sim.View{State: s, Log: log, Cfg: cfg, Tick: s.Tick, Rng: rng.New(1)}
	attackWins := 0
	atWar := 0
	for _, rid := range s.RulerIDsSorted() {
		r := s.Rulers[rid]
		if !r.IsAlive {
			continue
		}
		inWar := false
		for _, wr := range s.ActiveWars() {
			if wr.SideA == r.SideID || wr.SideB == r.SideID {
				inWar = true
				break
			}
		}
		if !inWar {
			continue
		}
		p := s.Parties[r.PartyID]
		if p == nil || p.Troops <= 0 {
			continue
		}
		atWar++
		choice, _, _ := decide(v, r)
		if choice == model.IntentAttack {
			attackWins++
		}
	}
	if atWar == 0 {
		t.Skip("no rulers at war with armies")
	}
	// Most rulers at war should want to attack. The exact threshold is a
	// balance choice; the regression is that it was ZERO before.
	if attackWins == 0 {
		t.Fatalf("no ruler at war chose to attack (n=%d); war duty is dead", atWar)
	}
	t.Logf("%d/%d rulers at war chose attack", attackWins, atWar)
}

// TestFundPartyTransfers verifies that a ruler's party receives money from
// its home town when its purse runs low. Without this, every army inevitably
// goes broke and the AI dies.
func TestFundPartyTransfers(t *testing.T) {
	cfg, err := config.Load("../../../config/balance.toml")
	if err != nil {
		t.Fatal(err)
	}
	s := model.NewState()
	town := &model.Town{ID: 1, Money: 10000, Population: 1000}
	s.Towns[1] = town
	ruler := &model.Ruler{ID: 1, IsAlive: true, SideID: 1, TownID: 1, PartyID: 1, CapturedBy: -1}
	s.Rulers[1] = ruler
	party := &model.Party{
		ID: 1, SideID: 1, RulerID: 1, Troops: 50,
		Money: 0, HomeTown: 1, Activity: model.ActIdle,
	}
	s.Parties[1] = party

	log := cause.NewLog(1000)
	e := sim.NewEngine(cfg, log, 1, []sim.System{System()})
	if err := e.Tick(s); err != nil {
		t.Fatal(err)
	}
	if s.Parties[1].Money <= 0 {
		t.Fatalf("party was not funded: money=%.2f", s.Parties[1].Money)
	}
	if s.Towns[1].Money >= 10000 {
		t.Fatalf("town did not pay: money=%.2f", s.Towns[1].Money)
	}
	t.Logf("party money=%.2f town money=%.2f", s.Parties[1].Money, s.Towns[1].Money)
}
