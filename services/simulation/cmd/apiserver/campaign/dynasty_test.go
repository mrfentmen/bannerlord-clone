package campaign

// Dynasty domain tests: the server side of the client's clan/court/
// economy/party/siege/tavern orders. Tested against a real world.

import (
	"context"
	"testing"

	"mbclone/simulation/internal/model"
)

func TestClanTierForRenown(t *testing.T) {
	cases := []struct {
		renown int
		tier   int
	}{
		{0, 0}, {49, 0}, {50, 1}, {150, 2}, {350, 3},
		{900, 4}, {2350, 5}, {6150, 6}, {99999, 6},
	}
	for _, tc := range cases {
		if got := tierForRenown(tc.renown); got != tc.tier {
			t.Errorf("tierForRenown(%d) = %d, want %d", tc.renown, got, tc.tier)
		}
	}
}

func TestMarryAndHaveChild(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	// Add a second character to marry.
	c.mu.Lock()
	d := c.ensureDynasty()
	d.characters["char-2"] = &DynCharacter{ID: "char-2", Name: "Alex", Age: 28, ClanID: "clan-player", Alive: true, Skills: map[string]int{}}
	c.mu.Unlock()

	if _, err := c.Marry(ctx, "char-player", "char-2"); err != nil {
		t.Fatalf("marry: %v", err)
	}
	// Marrying again must fail.
	if _, err := c.Marry(ctx, "char-player", "char-2"); err == nil {
		t.Fatal("expected already-married error")
	}

	out, err := c.HaveChild(ctx, "char-player", "char-2", "Sam")
	if err != nil {
		t.Fatalf("haveChild: %v", err)
	}
	childID, ok := out.(map[string]any)["childId"].(string)
	if !ok || childID == "" {
		t.Fatalf("haveChild returned no childId: %v", out)
	}
}

func TestKillCharacterAndHeir(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	c.mu.Lock()
	d := c.ensureDynasty()
	d.characters["char-2"] = &DynCharacter{ID: "char-2", Name: "Alex", Age: 28, ClanID: "clan-player", Alive: true, Skills: map[string]int{}}
	c.mu.Unlock()

	if _, err := c.Marry(ctx, "char-player", "char-2"); err != nil {
		t.Fatal(err)
	}
	out, err := c.HaveChild(ctx, "char-player", "char-2", "Sam")
	if err != nil {
		t.Fatal(err)
	}
	childID := out.(map[string]any)["childId"].(string)

	heir, err := c.GetHeir(ctx, "clan-player")
	if err != nil {
		t.Fatal(err)
	}
	if heir == nil {
		t.Fatal("expected an heir")
	}
	if hv, ok := heir.(heirView); !ok || hv.ID != childID {
		t.Fatalf("heir = %v, want child %s", heir, childID)
	}

	if _, err := c.KillCharacter(ctx, childID, "test"); err != nil {
		t.Fatal(err)
	}
	heir, err = c.GetHeir(ctx, "clan-player")
	if err != nil {
		t.Fatal(err)
	}
	if heir != nil {
		t.Fatalf("expected no heir after death, got %v", heir)
	}
}

func TestHeldLordRansomAndRelease(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	c.mu.Lock()
	d := c.ensureDynasty()
	d.heldLords = append(d.heldLords,
		&HeldLord{Name: "Lord A", FactionID: 3, ClanName: "Clan A", CapturedDay: 1},
		&HeldLord{Name: "Lord B", FactionID: 4, ClanName: "Clan B", CapturedDay: 2},
	)
	// Give the player party money for the ransom accounting.
	if p := c.state.Parties[c.party]; p != nil {
		p.Money = 10000
	}
	c.mu.Unlock()

	lords, err := c.GetHeldLords(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(lords.([]heldLordView)) != 2 {
		t.Fatalf("expected 2 held lords, got %v", lords)
	}

	out, err := c.RansomHeldLord(ctx, "Lord A")
	if err != nil {
		t.Fatal(err)
	}
	if out.(map[string]any)["gold"].(int) < 1500 {
		t.Fatalf("ransom gold too low: %v", out)
	}

	out, err = c.ReleaseHeldLord(ctx, "Lord B")
	if err != nil {
		t.Fatal(err)
	}
	if out.(map[string]any)["relationGained"].(int) != 15 {
		t.Fatalf("relationGained = %v", out)
	}

	lords, _ = c.GetHeldLords(ctx)
	if len(lords.([]heldLordView)) != 0 {
		t.Fatalf("expected 0 held lords, got %v", lords)
	}

	if _, err := c.ExecuteHeldLord(ctx, "Nobody"); err == nil {
		t.Fatal("expected not-found for unknown lord")
	}
}

func TestGetClanTier(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	out, err := c.GetClanTier(ctx)
	if err != nil {
		t.Fatal(err)
	}
	m := out.(map[string]any)
	// The world seeds the player ruler with renown; tier must match it.
	c.mu.RLock()
	renown := 0
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		renown = int(r.Renown)
	}
	c.mu.RUnlock()
	wantTier := tierForRenown(renown)
	if m["tier"].(int) != wantTier {
		t.Fatalf("tier = %v, want %d for renown %d", m["tier"], wantTier, renown)
	}
	if m["name"].(string) != tierNames[wantTier] {
		t.Fatalf("tier name = %v", m["name"])
	}
	if m["partyCapacity"].(int) != 25+wantTier*25 {
		t.Fatalf("partyCapacity = %v", m["partyCapacity"])
	}
}

func TestFoundKingdomRequiresTier(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	// Fresh clan: tier 0, no fief — must refuse.
	if _, err := c.FoundKingdom(ctx, "Newland"); err == nil {
		t.Fatal("expected tier refusal")
	}

	// Grant renown (tier 4+), a fief, and influence.
	c.mu.Lock()
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		r.Renown = 1000
		r.Influence = 150
	}
	d := c.ensureDynasty()
	d.clans["clan-player"].FiefIDs = []string{"fief-1"}
	c.mu.Unlock()

	out, err := c.FoundKingdom(ctx, "Newland")
	if err != nil {
		t.Fatalf("foundKingdom: %v", err)
	}
	m := out.(map[string]any)
	if m["kingdomName"].(string) != "Newland" {
		t.Fatalf("kingdomName = %v", m)
	}
	if !m["warWithFormer"].(bool) {
		t.Fatal("expected war with the former faction")
	}
	// A new side must exist in the sim.
	c.mu.RLock()
	found := false
	for _, s := range c.state.Sides {
		if s.Name == "Newland" {
			found = true
		}
	}
	c.mu.RUnlock()
	if !found {
		t.Fatal("new side not registered in the simulation")
	}
}

func TestCourtshipFlow(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	c.mu.Lock()
	d := c.ensureDynasty()
	// A willing target: max charm plus a maxed side relation guarantees interest.
	d.characters["char-player"].Skills["charm"] = 100
	playerSide := 0
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		playerSide = r.SideID
	}
	d.characters["char-2"] = &DynCharacter{ID: "char-2", Name: "Alex", Age: 28, ClanID: "clan-x", SideID: playerSide, Alive: true, Skills: map[string]int{}}
	c.state.SideRelations[model.MakePair(playerSide, playerSide)] = 100
	c.mu.Unlock()

	out, err := c.StartCourtship(ctx, "char-2")
	if err != nil {
		t.Fatalf("startCourtship: %v", err)
	}
	if out.(map[string]any)["line"] == "" {
		t.Fatal("empty courtship line")
	}

	// Deeds until affection is high enough to propose.
	for i := 0; i < 20; i++ {
		res, err := c.CourtAction(ctx, "deed")
		if err != nil {
			t.Fatal(err)
		}
		if res.(map[string]any)["affection"].(float64) >= 70 {
			break
		}
	}
	res, err := c.ProposeMarriage(ctx)
	if err != nil {
		t.Fatalf("propose: %v", err)
	}
	if !res.(map[string]any)["accepted"].(bool) {
		t.Fatalf("expected acceptance after deeds: %v", res)
	}
}

func TestBrokerSell(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	townID := aTown(t, c)
	c.DebugAddTroopPrisoners("bandit-1", "Bandit", 10, 2, 0)
	c.mu.Lock()
	if p := c.state.Parties[c.party]; p != nil {
		p.Money = 1000
	}
	c.mu.Unlock()

	out, err := c.SellPrisonersToBroker(ctx, townID, "bandit-1", 5)
	if err != nil {
		t.Fatalf("broker sell: %v", err)
	}
	m := out.(map[string]any)
	// 5 * tier 2 * 30 = 300 ransom value; broker pays 55-70%.
	if gold := m["gold"].(int); gold < 165 || gold > 210 {
		t.Fatalf("broker gold = %d, want 165..210", gold)
	}
}

func TestTavernDice(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	townID := aTown(t, c)
	c.mu.Lock()
	if p := c.state.Parties[c.party]; p != nil {
		p.Money = 10000
	}
	before := c.state.Parties[c.party].Money
	c.mu.Unlock()

	out, err := c.PlayTavernDice(ctx, townID, 100)
	if err != nil {
		t.Fatalf("dice: %v", err)
	}
	m := out.(map[string]any)
	if m["line"].(string) == "" {
		t.Fatal("empty dice line")
	}
	c.mu.RLock()
	after := c.state.Parties[c.party].Money
	c.mu.RUnlock()
	// Either lost the 100 stake or won the pot back.
	if after != before-100 && after <= before {
		t.Fatalf("money moved unexpectedly: %v -> %v", before, after)
	}
}

func TestPartyTemplates(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	out, err := c.SavePartyTemplate(ctx, "Skirmishers")
	if err != nil {
		t.Fatal(err)
	}
	id := out.(map[string]any)["templateId"].(string)

	list, err := c.GetPartyTemplates(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list.([]map[string]any)) != 1 {
		t.Fatalf("templates = %v", list)
	}

	if _, err := c.RefitPartyToward(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, err := c.RefitPartyToward(ctx, "nope"); err == nil {
		t.Fatal("expected not-found for unknown template")
	}
}

func TestSiegeEngines(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	// A siege to build engines at.
	townID := aTown(t, c)
	c.mu.Lock()
	siegeID := c.state.NewID(model.IDWar) + 1000
	c.state.Sieges[siegeID] = &model.Siege{ID: siegeID, TownID: townID}
	if p := c.state.Parties[c.party]; p != nil {
		p.Money = 100000
	}
	c.mu.Unlock()

	out, err := c.QueueSiegeEngine(ctx, siegeID, "breaching-truck")
	if err != nil {
		t.Fatalf("queue: %v", err)
	}
	if out.(map[string]any)["cost"].(int) != 800 {
		t.Fatalf("cost = %v", out)
	}
	if _, err := c.QueueSiegeEngine(ctx, siegeID, "trebuchet"); err == nil {
		t.Fatal("expected bad request for unknown engine")
	}

	park, err := c.GetSiegeEngines(ctx, siegeID)
	if err != nil {
		t.Fatal(err)
	}
	if len(park.(*EnginePark).Queue) != 1 {
		t.Fatalf("queue = %v", park)
	}

	// Advance the queue manually: 3 build days.
	c.mu.Lock()
	d := c.ensureDynasty()
	for i := 0; i < 3; i++ {
		c.tickSiegeEnginesLocked(d, siegeID)
	}
	c.mu.Unlock()

	if err := func() error {
		_, err := c.MoveSiegeEngine(ctx, siegeID, "breaching-truck", "deployed")
		return err
	}(); err != nil {
		t.Fatalf("deploy: %v", err)
	}
	if _, err := c.MakeFireVariant(ctx, siegeID, "breaching-truck"); err == nil {
		t.Fatal("expected reserve-only error for fire variant on deployed engine")
	}
}

func TestSmithingStamina(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	out, err := c.GetSmithingStamina(ctx)
	if err != nil {
		t.Fatal(err)
	}
	m := out.(map[string]any)
	if m["stamina"].(int) != 100 || m["max"].(int) != 100 {
		t.Fatalf("stamina = %v", m)
	}

	if _, err := c.SpendSmithingStamina(ctx, 30); err != nil {
		t.Fatal(err)
	}
	out, _ = c.GetSmithingStamina(ctx)
	if out.(map[string]any)["stamina"].(int) != 70 {
		t.Fatalf("stamina after spend = %v", out)
	}
	if _, err := c.SpendSmithingStamina(ctx, 1000); err == nil {
		t.Fatal("expected exhaustion error")
	}
}

func TestInfluenceLoop(t *testing.T) {
	c := newTestWorld(t)
	ctx := context.Background()

	c.mu.Lock()
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		r.Influence = 100
		r.Renown = 50
	}
	c.mu.Unlock()

	before, err := c.GetInfluence(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if before.(int) != 100 {
		t.Fatalf("influence = %v", before)
	}

	if _, err := c.SpendInfluence(ctx, "muster-army"); err != nil {
		t.Fatalf("spend: %v", err)
	}
	after, _ := c.GetInfluence(ctx)
	if after.(int) != 70 {
		t.Fatalf("influence after muster = %v, want 70", after)
	}
	if _, err := c.SpendInfluence(ctx, "recruit-vassal"); err != nil {
		// 70 >= 50, should succeed.
		t.Fatalf("recruit-vassal: %v", err)
	}
	if _, err := c.SpendInfluence(ctx, "bogus"); err == nil {
		t.Fatal("expected bad request for unknown action")
	}

	// Awards move the number up.
	if _, err := c.AwardInfluence(ctx, "battle-victory"); err != nil {
		t.Fatal(err)
	}
	final, _ := c.GetInfluence(ctx)
	if final.(int) <= 20 {
		t.Fatalf("influence after award = %v, want > 20", final)
	}
}

func TestPureLogic(t *testing.T) {
	if conceptionChance(16, 25) != 0 {
		t.Error("conception outside fertile age must be 0")
	}
	if conceptionChance(25, 30) <= 0 {
		t.Error("conception in fertile age must be positive")
	}
	if brokerRate(1.0) >= 1.0 || brokerRate(0) <= 0 {
		t.Error("broker rate must be a discount fraction")
	}
	if workshopDayProfit("smithy") <= 0 {
		t.Errorf("smithy should be profitable at base prices, got %v", workshopDayProfit("smithy"))
	}
	if workshopDayProfit("nope") != 0 {
		t.Error("unknown workshop type must profit 0")
	}
	if conformityNeed(1) != 39 {
		t.Errorf("conformityNeed(1) = %v, want 39", conformityNeed(1))
	}
	if maxStamina(10) <= maxStamina(0) {
		t.Error("stamina must grow with crafting")
	}
}
