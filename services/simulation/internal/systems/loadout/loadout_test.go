package loadout

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Towns[1] = &model.Town{
		ID: 1, Name: "Rich Town", Prosperity: 0.9, Militia: 100,
	}
	s.Towns[2] = &model.Town{
		ID: 2, Name: "Poor Town", Prosperity: 0.1, Militia: 100,
	}
	s.Towns[3] = &model.Town{
		ID: 3, Name: "No Militia", Prosperity: 0.9, Militia: 0,
	}
	// Set metal via the state accessor.
	s.Set(model.KindTown, 1, "metal", 200.0)
	s.Set(model.KindTown, 2, "metal", 10.0)
	s.Set(model.KindTown, 1, "militia_readiness", 0.5)
	s.Set(model.KindTown, 2, "militia_readiness", 0.5)
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "loadout" {
		t.Errorf("expected loadout, got %s", System().Name)
	}
}

func TestEquipmentQuality(t *testing.T) {
	// Rich + metal = high quality.
	if q := equipmentQuality(0.9, 200); q < 0.8 {
		t.Errorf("expected high quality, got %f", q)
	}
	// Poor + no metal = low quality.
	if q := equipmentQuality(0.1, 0); q > 0.4 {
		t.Errorf("expected low quality, got %f", q)
	}
}

func TestRichTownImproves(t *testing.T) {
	v, w := testView()
	run(v, w)
	found := false
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindTown && wr.Entity == 1 && wr.Field == "militia_readiness" {
			found = true
		}
	}
	if !found {
		t.Error("rich town should see readiness change")
	}
}

func TestNoMilitiaNoChange(t *testing.T) {
	v, w := testView()
	run(v, w)
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindTown && wr.Entity == 3 {
			t.Error("town with no militia should not change")
		}
	}
}
