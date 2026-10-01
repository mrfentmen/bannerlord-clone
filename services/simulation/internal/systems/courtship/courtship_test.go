package courtship

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Sides[1] = &model.Side{ID: 1, Name: "Side A"}
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Generous Lord", SideID: 1, IsAlive: true,
		Traits: model.Traits{Generosity: 8.0},
	}
	s.Leaders[2] = &model.Leader{
		ID: 2, Name: "Stingy Lord", SideID: 1, IsAlive: true,
		Traits: model.Traits{Generosity: 2.0},
	}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "courtship" {
		t.Errorf("expected courtship, got %s", System().Name)
	}
}

func TestGenerousRulerGains(t *testing.T) {
	v, w := testView()
	run(v, w)
	found := false
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindLeader && wr.Entity == 1 && wr.Field == "relation_score" {
			found = true
		}
	}
	if !found {
		t.Error("generous ruler should gain relation_score")
	}
}

func TestStingyRulerNoGain(t *testing.T) {
	v, w := testView()
	run(v, w)
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindLeader && wr.Entity == 2 && wr.Field == "relation_score" {
			t.Error("stingy ruler should not gain relation_score")
		}
	}
}

func TestWarBlocks(t *testing.T) {
	v, w := testView()
	s := v.State
	s.Sides[2] = &model.Side{ID: 2, Name: "Side B"}
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, EndTick: -1}
	run(v, w)
	for _, wr := range w.Debug() {
		if wr.Field == "relation_score" {
			t.Error("war should block courtship")
		}
	}
}

func TestDeadRulerNoGain(t *testing.T) {
	v, w := testView()
	v.State.Leaders[1].IsAlive = false
	run(v, w)
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindLeader && wr.Entity == 1 {
			t.Error("dead ruler should not gain")
		}
	}
}
