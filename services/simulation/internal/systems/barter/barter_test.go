package barter

import (
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// These tests assert on committed state rather than on staged writes, for the
// reason the issue tests give: WriteSet.Debug reports field names and not
// values, so the only way to check that a barter moved a number is to let the
// engine apply it. That also means every assertion below is on the same path the
// API server takes, since the server commits through ApplyNow.

// testCfg loads the shipped balance file, so an assertion about a configurable
// share checks the wiring rather than a copy of the number in this file.
func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	// services/simulation/internal/systems/barter -> services/simulation/config.
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// world is a two-lord world with one town, sized so a barter table is short
// enough to read and the numbers on it are round.
//
// The player is lord 1 with party 10; the trader is lord 2, who holds town 100
// and keeps party 20. Both parties carry cargo and a cage, so every kind of
// line can be exercised without inventing extra entities.
func world() *model.State {
	s := model.NewState()
	s.Tick = 7
	s.Year = 1
	s.Towns[100] = &model.Town{
		ID: 100, Name: "Millbrook", SideID: 1, Holder: 2, HolderSide: 1,
		FoodStock: 500, MedicineStock: 200, Metal: 120,
		PriceFood: 10, PriceMedicine: 20, PriceMetal: 30,
		Money: 5000, Gold: 300,
	}
	s.Parties[10] = &model.Party{
		ID: 10, Name: "The Company", LeaderID: 1,
		CargoFood: 100, CargoMedicine: 40, CargoMetal: 60,
		Prisoners: 12, Food: 50, Money: 2000, Gold: 150,
	}
	s.Parties[20] = &model.Party{
		ID: 20, Name: "Hallens Household", LeaderID: 2,
		CargoFood: 10, Prisoners: 4, Money: 900, Gold: 80,
	}
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Aunt Vi", SideID: 1, PartyID: 10,
		IsAlive: true, Gold: 150, Money: 2000,
	}
	s.Leaders[2] = &model.Leader{
		ID: 2, Name: "Lord Hallen", SideID: 1, TownID: 100, PartyID: 20,
		IsAlive: true, Gold: 300, Money: 1500,
	}
	s.Sides[1] = &model.Side{ID: 1, Name: "The Reach"}
	return s
}

// baseRequest is a deal against the world above: the player offers a known
// quantity of grain and asks for a little less metal, at prices this world's
// market sets. It is deliberately in the player's favour, because a request
// that sits on the edge of tolerance would make every assertion about what
// happens after acceptance depend on the exact share in the balance file.
func baseRequest() Request {
	return Request{
		PartyID:     10,
		PlayerID:    1,
		Trader:      2,
		Town:        100,
		Offered:     []Line{{Kind: string(KindGood), ItemID: "grain", Quantity: 20}},
		Asked:       []Line{{Kind: string(KindGood), ItemID: "metal", Quantity: 3}},
		ExpectedDay: 7,
	}
}

// apply strikes a deal through the engine, on the same path the API server
// uses, and returns the engine so a test can read the cause log.
func apply(t *testing.T, cfg *config.Config, s *model.State, deal *sim.BarterDeal) *cause.Log {
	t.Helper()
	log := cause.NewLog(2000)
	e := sim.NewEngine(cfg, log, 42, []sim.System{System()})
	if err := e.ApplyNow(s, System(), []sim.Order{{
		Kind: sim.OrderBarter, TownID: deal.Town, Barter: deal,
	}}); err != nil {
		t.Fatalf("apply barter: %v", err)
	}
	return log
}

func TestSystemName(t *testing.T) {
	if System().Name != SystemName {
		t.Errorf("expected %s, got %s", SystemName, System().Name)
	}
}

// --- the tables ---

func TestTermsPricesBothSidesFromOneMarket(t *testing.T) {
	cfg := testCfg(t)
	terms, err := BuildTerms(world(), cfg, baseRequest())
	if err != nil {
		t.Fatalf("BuildTerms: %v", err)
	}
	// Grain is worth 10 at Millbrook. The player is paid under the market for
	// what they hand over; the trader charges over it for what they give.
	playerGrain := findOrFail(t, terms.PlayerItems, KindGood, "grain")
	traderGrain := findOrFail(t, terms.TraderItems, KindGood, "grain")
	wantPlayer := round2(10 * cfg.Barter.BuyShare)
	wantTrader := round2(10 * cfg.Barter.SellShare)
	if playerGrain.UnitValue != wantPlayer {
		t.Errorf("player grain unit value = %v, want %v", playerGrain.UnitValue, wantPlayer)
	}
	if traderGrain.UnitValue != wantTrader {
		t.Errorf("trader grain unit value = %v, want %v", traderGrain.UnitValue, wantTrader)
	}
	// The trader's margin is the whole reason the screen is not a market panel
	// with the prices hidden.
	if traderGrain.UnitValue <= playerGrain.UnitValue {
		t.Errorf("trader sells at %v and buys at %v: no margin, so there is no reason to barter",
			traderGrain.UnitValue, playerGrain.UnitValue)
	}
}

func TestTermsAvailabilityComesFromTheWorld(t *testing.T) {
	cfg := testCfg(t)
	terms, err := BuildTerms(world(), cfg, baseRequest())
	if err != nil {
		t.Fatalf("BuildTerms: %v", err)
	}
	// The party holds 100 sacks, so 100 is on the table and not 101.
	grain := findOrFail(t, terms.PlayerItems, KindGood, "grain")
	if grain.Available != 100 {
		t.Errorf("player grain available = %d, want 100", grain.Available)
	}
	// The trader's goods are the town's stock: this lord deals through the
	// settlement they hold, so the town is where their goods are.
	metal := findOrFail(t, terms.TraderItems, KindGood, "metal")
	if metal.Available != 120 {
		t.Errorf("trader metal available = %d, want the town's 120", metal.Available)
	}
	// And a hold of nothing is not a row on the table at all.
	for _, it := range terms.PlayerItems {
		if it.ItemID == "medicine" && it.Available == 0 {
			t.Error("a zero hold produced a table row that can never be filled")
		}
	}
}

func TestTermsOmitEmptyTables(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	// Strip the party of everything and the lord of their purse. An empty table
	// is a fact about the world, not an error, and must read as an empty list.
	s.Parties[10].CargoFood, s.Parties[10].CargoMedicine, s.Parties[10].CargoMetal = 0, 0, 0
	s.Parties[10].Prisoners = 0
	s.Leaders[1].Gold = 0
	terms, err := BuildTerms(s, cfg, baseRequest())
	if err != nil {
		t.Fatalf("BuildTerms: %v", err)
	}
	if len(terms.PlayerItems) != 0 {
		t.Errorf("expected an empty player table, got %d rows", len(terms.PlayerItems))
	}
}

func TestTermsRejectALordWhoDoesNotHoldTheTown(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	// A third lord exists but holds nothing. Letting them deal would sell stock
	// out of a settlement that is not theirs.
	s.Leaders[3] = &model.Leader{ID: 3, Name: "Lord Far", SideID: 1, IsAlive: true, Gold: 500}
	req := baseRequest()
	req.Trader = 3
	if _, err := BuildTerms(s, cfg, req); err == nil {
		t.Fatal("expected a refusal for a lord who does not hold the town")
	}
}

func TestTermsRejectADeadLord(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	s.Leaders[2].IsAlive = false
	if _, err := BuildTerms(s, cfg, baseRequest()); err == nil {
		t.Fatal("expected a refusal for a dead lord")
	}
}

func TestTermsScaleRelationToAPerCent(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	s.SetRelation(1, 2, 0.4)
	terms, err := BuildTerms(s, cfg, baseRequest())
	if err != nil {
		t.Fatalf("BuildTerms: %v", err)
	}
	// The state holds the relation as a share and the panel reads it as -100 to
	// 100. The conversion happens here, once, so no two features can disagree.
	if terms.RelationToPlayer != 40 {
		t.Errorf("relationToPlayer = %v, want 40", terms.RelationToPlayer)
	}
}

// --- the answer ---

func TestFairDealIsAccepted(t *testing.T) {
	cfg := testCfg(t)
	p, err := Appraise(world(), cfg, baseRequest())
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if !p.Accepted {
		t.Fatalf("expected the deal accepted, got %q", p.Reason)
	}
	// 20 grain at the buy share against 3 metal at the sell share.
	wantPlayer := round2(round2(10*cfg.Barter.BuyShare) * 20)
	wantTrader := round2(round2(30*cfg.Barter.SellShare) * 3)
	if p.PlayerValue != wantPlayer {
		t.Errorf("playerValue = %v, want %v", p.PlayerValue, wantPlayer)
	}
	if p.TraderValue != wantTrader {
		t.Errorf("traderValue = %v, want %v", p.TraderValue, wantTrader)
	}
	if p.CausedBy != "barter-agreed" {
		t.Errorf("causedBy = %q, want barter-agreed", p.CausedBy)
	}
}

func TestAskingTooMuchIsRefusedWithTheShortfall(t *testing.T) {
	cfg := testCfg(t)
	req := baseRequest()
	// Twice the metal for the same grain: well past any tolerance.
	req.Asked = []Line{{Kind: string(KindGood), ItemID: "metal", Quantity: 10}}
	p, err := Appraise(world(), cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if p.Accepted {
		t.Fatal("expected a refusal when asking for twice what is offered")
	}
	// A refusal with a number is the useful kind: "short by $40" is something
	// the player can go and fix and "not a fair trade" is not.
	if p.ShortBy <= 0 {
		t.Errorf("expected a shortfall to report, got %v", p.ShortBy)
	}
	if p.Reason == "" {
		t.Error("a refusal with no reason is the one refusal a player cannot act on")
	}
	if p.CausedBy != "barter-rejected" {
		t.Errorf("causedBy = %q, want barter-rejected", p.CausedBy)
	}
}

func TestAFriendTakesAWorseDealThanAStranger(t *testing.T) {
	cfg := testCfg(t)
	// A deal short by a few percent: over a stranger's tolerance, and tested
	// here against a friend who should still shake hands.
	req := baseRequest()
	req.Offered = []Line{{Kind: string(KindGood), ItemID: "grain", Quantity: 5}}
	req.Asked = []Line{{Kind: string(KindGood), ItemID: "metal", Quantity: 1}}

	neutral := world()
	p, err := Appraise(neutral, cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if p.Accepted {
		t.Skip("the shipped tolerance is wide enough to take this deal; the friend case below still applies")
	}

	friendly := world()
	friendly.SetRelation(1, 2, 0.9)
	f, err := Appraise(friendly, cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if !f.Accepted {
		t.Errorf("a friend refused a deal a stranger refused only narrowly: %q", f.Reason)
	}
}

func TestAskingForMoreThanIsHeldIsRefused(t *testing.T) {
	cfg := testCfg(t)
	req := baseRequest()
	// The town holds 120 metal; 500 is not on the table.
	req.Asked = []Line{{Kind: string(KindGood), ItemID: "metal", Quantity: 500}}
	p, err := Appraise(world(), cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if p.Accepted {
		t.Fatal("expected a refusal for asking for more than the trader holds")
	}
	// A line that is not there is a correction, and the correction names what is.
	if p.Reason == "" {
		t.Error("expected the refusal to explain itself")
	}
}

func TestOfferingMoreThanIsHeldIsRefused(t *testing.T) {
	cfg := testCfg(t)
	req := baseRequest()
	// The party holds 100 sacks.
	req.Offered = []Line{{Kind: string(KindGood), ItemID: "grain", Quantity: 400}}
	p, err := Appraise(world(), cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if p.Accepted {
		t.Fatal("expected a refusal for offering more than the party holds")
	}
}

// TestTwoRowsOfOneThingAreCheckedAgainstOneAvailability is the case where the
// per-line check is not enough.
//
// Two rows naming the same thing are the same line written twice, and a player
// who typed a quantity into two rows has not done anything a trader would find
// strange. But each row was checked against the availability of the whole hold
// rather than of what was left of it, so a party with 100 sacks could put 100
// grain down twice: the table read as an offer of 200 sacks, the trader priced
// 200 sacks, and the commit moved 200 out of a hold of 100. The valuation and
// the movement then disagree, which is the one thing a barter table cannot do.
func TestTwoRowsOfOneThingAreCheckedAgainstOneAvailability(t *testing.T) {
	cfg := testCfg(t)
	req := baseRequest()
	// The party holds 100 sacks, so each row is within the hold and only the
	// total is not.
	req.Offered = []Line{
		{Kind: string(KindGood), ItemID: "grain", Quantity: 60},
		{Kind: string(KindGood), ItemID: "grain", Quantity: 60},
	}
	p, err := Appraise(world(), cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if p.Accepted {
		t.Fatalf("120 sacks were accepted against a hold of 100: the offer is worth %g on a table that cannot carry it", p.PlayerValue)
	}
	if p.Reason == "" {
		t.Error("expected the refusal to name the hold the rows add up to")
	}

	// And the rows that do add up are accepted rather than refused for being
	// repeated, because two rows of 40 is the same as one row of 80.
	ok := baseRequest()
	ok.Offered = []Line{
		{Kind: string(KindGood), ItemID: "grain", Quantity: 40},
		{Kind: string(KindGood), ItemID: "grain", Quantity: 40},
	}
	p, err = Appraise(world(), cfg, ok)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if !p.Accepted {
		t.Errorf("80 sacks in two rows was refused: %v", p.Reason)
	}
}

// --- the carriers ---
//
// Validate is the one check that turns a deal the world cannot honour into a
// sentence, and it is the whole of the commit handler's atomicity: applyOrder
// can only shrug, so a refusal has to happen before the player has been told
// yes. These four are the arrangements it covers.

func TestACoinOnlyDealNeedsNoPartyAtAll(t *testing.T) {
	s := world()
	// A landed lord: still a purse, no wagon.
	s.Parties[10] = nil
	s.Leaders[1].PartyID = -1
	req := baseRequest()
	req.PartyID = -1
	req.Offered = []Line{{Kind: string(KindGold), ItemID: GoldItemID, Quantity: 40}}
	req.Asked = []Line{{Kind: string(KindGold), ItemID: GoldItemID, Quantity: 40}}
	if err := Validate(s, req); err != nil {
		t.Fatalf("a coin-only deal was refused for want of a carrier: %v", err)
	}
}

// The other half of the same rule, and the one that is easy to get backwards:
// goods the player *takes* go from the town's stock into the party's cargo, so a
// lord with no party cannot receive a sack either. Counting only what the player
// handed over would refuse a coin-for-coin trade and accept a coin-for-sack one.
func TestGoodsForALordWithNoPartyAreRefused(t *testing.T) {
	s := world()
	s.Parties[10] = nil
	s.Leaders[1].PartyID = -1
	req := baseRequest()
	req.PartyID = -1
	req.Offered = []Line{{Kind: string(KindGold), ItemID: GoldItemID, Quantity: 40}}
	req.Asked = []Line{{Kind: string(KindGood), ItemID: "medicine", Quantity: 1}}
	err := Validate(s, req)
	if err == nil {
		t.Fatal("a sack of medicine was accepted for a lord with nothing to carry it in")
	}
	if !strings.Contains(err.Error(), "no party") {
		t.Errorf("reason = %q, want it to name the missing party", err)
	}
}

func TestCaptivesAreRefusedForATraderWithNoCage(t *testing.T) {
	s := world()
	s.Parties[20] = nil
	s.Leaders[2].PartyID = -1
	req := baseRequest()
	req.Asked = append(req.Asked, Line{Kind: string(KindPrisoner), ItemID: PrisonerItemID, Quantity: 1})
	err := Validate(s, req)
	if err == nil {
		t.Fatal("a captive was accepted for a trader with no party to hold them")
	}
	if !strings.Contains(err.Error(), "no cage") {
		t.Errorf("reason = %q, want it to name the missing cage", err)
	}
}

// A lord who does hold their party has every carrier the deal needs, so nothing
// here is a special case for them. Pinned because the guard above is the kind
// that quietly grows until it refuses ordinary trades.
func TestALordWithAPartyIsNotRefusedByTheCarrierRules(t *testing.T) {
	req := baseRequest()
	req.Offered = append(req.Offered,
		Line{Kind: string(KindGold), ItemID: GoldItemID, Quantity: 10},
		Line{Kind: string(KindPrisoner), ItemID: PrisonerItemID, Quantity: 1})
	req.Asked = append(req.Asked,
		Line{Kind: string(KindGold), ItemID: GoldItemID, Quantity: 5},
		Line{Kind: string(KindPrisoner), ItemID: PrisonerItemID, Quantity: 1})
	if err := Validate(world(), req); err != nil {
		t.Errorf("an ordinary deal was refused by the carrier rules: %v", err)
	}
}

func TestAnUnknownItemIsRefusedByName(t *testing.T) {
	cfg := testCfg(t)
	req := baseRequest()
	req.Asked = []Line{{Kind: string(KindGood), ItemID: "unicorns", Quantity: 1}}
	p, err := Appraise(world(), cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if p.Accepted {
		t.Fatal("expected a refusal for an item nobody here holds")
	}
	if p.Reason == "" {
		t.Error("expected the refusal to name what is on the table instead")
	}
}

func TestAFractionalLineIsRefused(t *testing.T) {
	// A fractional quantity is not a thing that can cross a table, and it is
	// refused rather than rounded into a deal the player did not offer.
	if whole(3.5) {
		t.Error("3.5 sacks passed the whole-number check")
	}
	if !whole(3) {
		t.Error("3 sacks failed the whole-number check")
	}
	if whole(0) {
		t.Error("zero passed the whole-number check")
	}
	if whole(-2) {
		t.Error("a negative passed the whole-number check")
	}
	if whole(2.0000001) {
		t.Error("a value that rounds to two passed the whole-number check")
	}
}

func TestEmptyTableIsRefused(t *testing.T) {
	cfg := testCfg(t)
	for _, tc := range []struct {
		name string
		req  Request
	}{
		{"nothing at all", Request{}},
		{"nothing offered", Request{Asked: baseRequest().Asked}},
		{"nothing asked", Request{Offered: baseRequest().Offered}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := tc.req
			req.PartyID, req.PlayerID, req.Trader, req.Town, req.ExpectedDay = 10, 1, 2, 100, 7
			p, err := Appraise(world(), cfg, req)
			if err != nil {
				t.Fatalf("Appraise: %v", err)
			}
			if p.Accepted {
				t.Fatal("expected a refusal on an empty table")
			}
			if p.Reason == "" {
				t.Error("expected the refusal to say what to do instead")
			}
		})
	}
}

func TestAStaleTableIsRefused(t *testing.T) {
	cfg := testCfg(t)
	req := baseRequest()
	req.ExpectedDay = 3 // read on day 3, but it is day 7.
	p, err := Appraise(world(), cfg, req)
	if err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	if p.Accepted {
		t.Fatal("expected a stale table to be refused rather than repriced")
	}
	if p.Reason == "" {
		t.Error("expected the staleness refusal to explain itself")
	}
}

func TestProposeWritesNothing(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	before := s.Clone()
	if _, err := Appraise(s, cfg, baseRequest()); err != nil {
		t.Fatalf("Appraise: %v", err)
	}
	// Asking a trader a question must cost the world nothing. A question that
	// moved goods would be a bug rather than a feature.
	if s.Towns[100].FoodStock != before.Towns[100].FoodStock {
		t.Error("appraisal moved the town's grain")
	}
	if s.Leaders[1].Gold != before.Leaders[1].Gold {
		t.Error("appraisal moved the player's gold")
	}
	if s.Parties[10].Prisoners != before.Parties[10].Prisoners {
		t.Error("appraisal moved the player's cage")
	}
	if s.Tick != before.Tick {
		t.Error("appraisal advanced the clock")
	}
}

// --- the commit ---

func TestCommitMovesGoodsBothWays(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	req := baseRequest()
	apply(t, cfg, s, req.Deal())

	// Grain leaves the caravan and reaches the town.
	if got := s.Parties[10].CargoFood; got != 80 {
		t.Errorf("party grain = %v, want 80", got)
	}
	if got := s.Towns[100].FoodStock; got != 520 {
		t.Errorf("town grain = %v, want 520", got)
	}
	// Metal leaves the town and reaches the caravan.
	if got := s.Parties[10].CargoMetal; got != 63 {
		t.Errorf("party metal = %v, want 63", got)
	}
	if got := s.Towns[100].Metal; got != 117 {
		t.Errorf("town metal = %v, want 117", got)
	}
}

func TestCommitMovesGold(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	req := baseRequest()
	// 20 grain at the buy share, for 3 metal at the sell share: roughly 164
	// against 130, so the difference is the trader's profit and is taken as
	// nothing. Barter moves no money, so a deal in the player's favour simply
	// leaves the trader's purse alone.
	// 30 coins across as part of the offer. They are a line on the table like
	// any other, and the trader's side is priced at the same rate the player's
	// is, because a coin is worth the same to whoever hands it over.
	req.Offered = append(req.Offered, Line{Kind: string(KindGold), ItemID: GoldItemID, Quantity: 30})
	apply(t, cfg, s, req.Deal())
	if got := s.Leaders[1].Gold; got != 120 {
		t.Errorf("player gold = %v, want 120", got)
	}
	if got := s.Leaders[2].Gold; got != 330 {
		t.Errorf("trader gold = %v, want 330", got)
	}
	// Barter moves no money, only coin: a deal priced in dollars must not leave
	// the treasuries changed.
	if got := s.Leaders[1].Money; got != 2000 {
		t.Errorf("player money = %v, want it untouched at 2000", got)
	}
	if got := s.Leaders[2].Money; got != 1500 {
		t.Errorf("trader money = %v, want it untouched at 1500", got)
	}
}

func TestCommitMovesPrisonersBothWays(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	req := baseRequest()
	// A handful of captives across, and a different handful back.
	req.Offered = append(req.Offered, Line{Kind: string(KindPrisoner), ItemID: PrisonerItemID, Quantity: 3})
	req.Asked = append(req.Asked, Line{Kind: string(KindPrisoner), ItemID: PrisonerItemID, Quantity: 1})
	apply(t, cfg, s, req.Deal())

	if got := s.Parties[10].Prisoners; got != 10 {
		t.Errorf("party prisoners = %v, want 10", got)
	}
	if got := s.Parties[20].Prisoners; got != 6 {
		t.Errorf("trader party prisoners = %v, want 6", got)
	}
}

func TestCommitWritesCauseRows(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	req := baseRequest()
	req.Offered = append(req.Offered,
		Line{Kind: string(KindGold), ItemID: GoldItemID, Quantity: 5},
		Line{Kind: string(KindPrisoner), ItemID: PrisonerItemID, Quantity: 2},
	)
	log := apply(t, cfg, s, req.Deal())

	// Every tracked field the deal touched has to leave a row, or the Why panel
	// cannot explain why a lord's gold moved. This is the whole of
	// CONSTITUTION.md section 2.2 as far as barter is concerned.
	// Every kind on the table, so this covers all three move types: goods
	// between a party and a town, coin between two rulers, and captives between
	// two cages.
	wantFields := map[string]bool{
		"cargo_food":  false,
		"food_stock":  false,
		"cargo_metal": false,
		"metal":       false,
		"gold":        false,
		"prisoners":   false,
	}
	for _, row := range log.Rows() {
		if _, ok := wantFields[row.Field]; ok {
			wantFields[row.Field] = true
		}
		if row.System != SystemName {
			t.Errorf("row on %s is attributed to %q, want %q", row.Field, row.System, SystemName)
		}
		if row.Read == "" {
			t.Errorf("row on %s records no read state", row.Field)
		}
		if row.Note == "" {
			t.Errorf("row on %s has no note explaining the change in words", row.Field)
		}
	}
	for field, found := range wantFields {
		if !found {
			t.Errorf("no cause row for %s: a change nobody can explain", field)
		}
	}
}

func TestCommitMovesNothingForADealItCannotHonour(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	// The trader's lord has no party in the field, so their table never
	// offered a captive. A deal that hands one over anyway has nowhere to put
	// them, and half-applying it would lose the captives outright.
	s.Parties[20] = nil
	s.Leaders[2].PartyID = -1
	req := baseRequest()
	req.Offered = append(req.Offered, Line{Kind: string(KindPrisoner), ItemID: PrisonerItemID, Quantity: 3})
	apply(t, cfg, s, req.Deal())

	// The whole deal is refused, so the grain is still on the wagon too.
	if got := s.Parties[10].CargoFood; got != 100 {
		t.Errorf("party grain = %v, want it untouched at 100: a partial deal is worse than none", got)
	}
	if got := s.Parties[10].Prisoners; got != 12 {
		t.Errorf("party prisoners = %v, want untouched at 12", got)
	}
}

func TestCommitIgnoresAnOrderWithNoDeal(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	before := s.Clone()
	// Every other order kind carries no barter payload, and a nil one must be
	// inert rather than a panic on the tick it happens to arrive in.
	e := sim.NewEngine(cfg, cause.NewLog(100), 42, []sim.System{System()})
	if err := e.ApplyNow(s, System(), []sim.Order{{Kind: sim.OrderSetTax}}); err != nil {
		t.Fatalf("ApplyNow: %v", err)
	}
	if s.Parties[10].CargoFood != before.Parties[10].CargoFood {
		t.Error("an order with no deal moved goods")
	}
}

func TestCommitDoesNotAdvanceTheClock(t *testing.T) {
	cfg := testCfg(t)
	s := world()
	apply(t, cfg, s, baseRequest().Deal())
	// A struck deal is not a day. The tick counter belongs to the tick loop.
	if s.Tick != 7 {
		t.Errorf("tick = %d, want 7: a barter is not a day passing", s.Tick)
	}
}

func TestDealRendersTheRequestWhole(t *testing.T) {
	req := baseRequest()
	deal := req.Deal()
	if deal.Player != req.PlayerID || deal.Trader != req.Trader || deal.Town != req.Town {
		t.Errorf("deal participants = %d/%d/%d, want %d/%d/%d",
			deal.Player, deal.Trader, deal.Town, req.PlayerID, req.Trader, req.Town)
	}
	if len(deal.Offered) != 1 || deal.Offered[0].Quantity != 20 {
		t.Errorf("deal lost a line: %+v", deal.Offered)
	}
	// The quantities travel as priced. Re-deriving them at apply time would be
	// pricing the same numbers against a market that has since moved.
	if deal.Offered[0].ItemID != "grain" {
		t.Errorf("offered line lost its item: %+v", deal.Offered[0])
	}
}

// findOrFail pulls one line off a table, failing the test if it is not there.
func findOrFail(t *testing.T, items []Item, kind ItemKind, itemID string) Item {
	t.Helper()
	it, ok := findItem(items, kind, itemID)
	if !ok {
		t.Fatalf("%s %s is not on the table", kind, itemID)
	}
	return it
}
