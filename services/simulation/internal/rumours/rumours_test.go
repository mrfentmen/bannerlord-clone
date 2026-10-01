package rumours

import (
	"testing"

	"mbclone/simulation/internal/model"
)

func testState() *model.State {
	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Name: "Cheapville", PriceFood: 1.0, PriceMedicine: 5.0, PriceMetal: 10.0}
	s.Towns[2] = &model.Town{ID: 2, Name: "Dearburg", PriceFood: 5.0, PriceMedicine: 6.0, PriceMetal: 11.0}
	s.Towns[3] = &model.Town{ID: 3, Name: "Midtown", PriceFood: 3.0, PriceMedicine: 5.5, PriceMetal: 10.5}
	return s
}

func TestGenerateFindsMargin(t *testing.T) {
	s := testState()
	r := Generate(s, 1.0, 10)
	if len(r) == 0 {
		t.Fatal("expected rumours, got none")
	}
	// Food has the biggest margin (5-1=4).
	if r[0].Good != "food" {
		t.Errorf("expected food as top rumour, got %s", r[0].Good)
	}
	if r[0].BuyTown != "Cheapville" || r[0].SellTown != "Dearburg" {
		t.Errorf("wrong towns: buy=%s sell=%s", r[0].BuyTown, r[0].SellTown)
	}
	if r[0].Margin != 4.0 {
		t.Errorf("expected margin 4.0, got %f", r[0].Margin)
	}
}

func TestMinMarginFilters(t *testing.T) {
	s := testState()
	r := Generate(s, 10.0, 10)
	if len(r) != 0 {
		t.Errorf("expected no rumours above margin 10, got %d", len(r))
	}
}

func TestMaxRumoursCaps(t *testing.T) {
	s := testState()
	r := Generate(s, 0.5, 1)
	if len(r) != 1 {
		t.Errorf("expected 1 rumour, got %d", len(r))
	}
}

func TestBlockadeSkips(t *testing.T) {
	s := testState()
	s.Towns[1].Blockade = 1.0
	s.Towns[2].Blockade = 1.0
	r := Generate(s, 1.0, 10)
	// Food rumour should be gone (both cheap and dear blockaded).
	for _, rum := range r {
		if rum.Good == "food" {
			t.Error("food rumour should be skipped when towns blockaded")
		}
	}
}

func TestRumourText(t *testing.T) {
	s := testState()
	r := Generate(s, 1.0, 10)
	if r[0].Text == "" {
		t.Error("rumour text should not be empty")
	}
}
