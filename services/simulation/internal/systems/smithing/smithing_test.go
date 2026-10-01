package smithing

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// testView builds a minimal world: one town with a level-2 smithy,
// one wealth-ambition ruler stationed there.
func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Towns[1] = &model.Town{
		ID:         1,
		Name:       "Test Town",
		Metal:      100.0,
		Money:      1000.0,
		Prosperity: 0.5,
	}
	s.Workshops[1] = &model.Workshop{
		ID:                  1,
		TownID:              1,
		OwnerOrganizationID: -1,
		Type:                model.WorkshopMachineShop,
		Level:               2,
	}
	s.Leaders[1] = &model.Leader{
		ID:       1,
		Name:     "Test Ruler",
		TownID:   1,
		Tier:     2,
		Ambition: model.AmbitionWealth,
		Money:    1000.0,
		IsAlive:  true,
	}
	v := &sim.View{State: s, Log: cause.NewLog(100)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	sys := System()
	if sys.Name != "smithing" {
		t.Errorf("expected name smithing, got %s", sys.Name)
	}
}

func TestForgeProducesProfit(t *testing.T) {
	v, w := testView()
	run(v, w)

	// Expect two staged writes: town metal consumed, town money profit.
	writes := w.Debug()
	if len(writes) != 2 {
		t.Fatalf("expected 2 staged writes, got %d", len(writes))
	}
	seen := map[string]bool{}
	for _, wr := range writes {
		seen[fieldKey(wr.Kind, wr.Entity, wr.Field)] = true
	}
	if !seen[fieldKey(model.KindTown, 1, "metal")] {
		t.Error("expected town metal write")
	}
	if !seen[fieldKey(model.KindTown, 1, "money")] {
		t.Error("expected town money write")
	}
}

func fieldKey(k model.Kind, id int, f string) string {
	return string(rune(int(k))) + "/" + string(rune(id)) + "/" + f
}

func TestNoSmithyNoForging(t *testing.T) {
	v, w := testView()
	v.State.Workshops[1].Type = model.WorkshopTannery
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Errorf("expected no writes without a smithy, got %d", len(w.Debug()))
	}
}

func TestNoMetalNoForging(t *testing.T) {
	v, w := testView()
	v.State.Towns[1].Metal = 0.5
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Errorf("expected no writes without metal, got %d", len(w.Debug()))
	}
}

func TestOverseerBonus(t *testing.T) {
	// With overseer vs without: both should produce, but we verify the
	// overseer path doesn't break. Profit comparison would need write
	// deltas, which Debug() doesn't expose; the key check is it runs.
	v, w := testView()
	run(v, w)
	withOverseer := len(w.Debug())

	v2, w2 := testView()
	v2.State.Leaders[1].Ambition = model.AmbitionLand
	run(v2, w2)
	withoutOverseer := len(w2.Debug())

	if withOverseer != 2 || withoutOverseer != 2 {
		t.Errorf("expected 2 writes in both cases, got %d and %d", withOverseer, withoutOverseer)
	}
}

func TestDeadOverseerIgnored(t *testing.T) {
	v, w := testView()
	v.State.Leaders[1].IsAlive = false
	run(v, w)
	// Forge still runs (town enterprise), just without overseer bonus.
	if len(w.Debug()) != 2 {
		t.Errorf("expected 2 writes without overseer, got %d", len(w.Debug()))
	}
}
