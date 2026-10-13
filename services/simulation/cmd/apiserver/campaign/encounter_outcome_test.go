package campaign

// Leaving an encounter without winning it: running away, and losing.
//
// Tested against a real world rather than a stub, because the bugs worth
// catching here only appear once a party, an encounter, and a clock are
// involved: a retreat that lands the party back inside encounter range, an
// encounter left pending so the poller raises the same fight forever, loot taken
// from a purse that does not hold it.

import (
	"context"
	"errors"
	"math"
	"path/filepath"
	"testing"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
)

// newTestWorld builds a paused campaign. Paused matters: the clock never runs on
// its own, so a test that moves a party cannot be raced by the march system
// moving it back.
func newTestWorld(t *testing.T) *Campaign {
	t.Helper()
	cfgPath := filepath.Join("..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(cfgPath)
	if err != nil {
		t.Fatalf("loading %s: %v", cfgPath, err)
	}
	c, err := New(cfg, Options{Seed: 7, StartYear: 1950})
	if err != nil {
		t.Fatalf("building the world: %v", err)
	}
	t.Cleanup(c.Stop)
	return c
}

// someRival names a party that is not the player's, so there is somebody to run
// from. Every world in this simulation has several: a player holds a town and
// the town has a ruler and neighbours.
func someRival(t *testing.T, c *Campaign) *model.Party {
	t.Helper()
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, id := range c.state.PartyIDs() {
		p := c.state.Parties[id]
		if p == nil || id == c.party {
			continue
		}
		return p
	}
	t.Skip("this seed's world has no party other than the player's")
	return nil
}

// distanceTo is how far two parties are apart, in map units.
func distanceTo(a, b *model.Party) float64 { return math.Hypot(a.X-b.X, a.Y-b.Y) }

func playerParty(t *testing.T, c *Campaign) *model.Party {
	t.Helper()
	c.mu.RLock()
	defer c.mu.RUnlock()
	p := c.state.Parties[c.party]
	if p == nil {
		t.Fatal("the campaign has no player party")
	}
	return p
}

// raiseEncounter starts a pending encounter between the player and a force, and
// returns it.
func raiseEncounter(t *testing.T, c *Campaign, rival *model.Party) *wire.Encounter {
	t.Helper()
	enc, err := c.CreateEncounter(context.Background(), c.party, rival.ID)
	if err != nil {
		t.Fatalf("raising an encounter: %v", err)
	}
	if enc.Status != "pending" {
		t.Fatalf("a new encounter is %q, want pending", enc.Status)
	}
	return enc
}

// TestFleePutsThePlayerOutOfReach is the property that makes flight work at all.
// The auto-trigger raises an encounter inside encounterRange, so a retreat that
// fell short of that would have the same fight handed straight back on the next
// tick, which a player experiences as the game refusing to let them escape.
func TestFleePutsThePlayerOutOfReach(t *testing.T) {
	c := newTestWorld(t)
	rival := someRival(t, c)
	enc := raiseEncounter(t, c, rival)

	out, err := c.FleeFromEncounter(context.Background(), wire.FleeRequest{NpcPartyID: rival.Name})
	if err != nil {
		t.Fatalf("fleeing: %v", err)
	}
	if res := out.(wire.EncounterOutcomeResult); res.Outcome != "fled" {
		t.Fatalf("outcome = %q, want fled", res.Outcome)
	}

	c.mu.RLock()
	after := c.state.Parties[c.party]
	gone := storeFor(c).encounters[enc.ID]
	c.mu.RUnlock()

	if d := distanceTo(after, rival); d <= encounterRange {
		t.Fatalf("after fleeing, the party is %v from %s: inside the %v encounter range, so the same fight comes straight back", d, rival.Name, encounterRange)
	}
	if d := distanceTo(after, rival); math.Abs(d-escapeRange) > 1e-6 {
		t.Errorf("the party stopped %v from %s, want the escape range %v", d, rival.Name, escapeRange)
	}
	if gone.Status != "resolved" {
		t.Fatalf("encounter %s is %q after fleeing: the client polls for pending encounters and would raise it again", gone.ID, gone.Status)
	}
}

// TestFleeIgnoresThePositionTheClientSent guards the decision that the escape
// point is not the client's to choose. A client that may name its own position
// may put its party anywhere on the map, so FleeRequest carries the field only
// for compatibility and the retreat is worked out from the two real positions.
func TestFleeIgnoresThePositionTheClientSent(t *testing.T) {
	c := newTestWorld(t)
	rival := someRival(t, c)

	// Ask for the world origin, the single most valuable place on the map to be.
	_, err := c.FleeFromEncounter(context.Background(), wire.FleeRequest{
		NpcPartyID:  rival.Name,
		NewPosition: &wire.Point{X: 0, Z: 0},
	})
	if err != nil {
		t.Fatalf("fleeing: %v", err)
	}

	c.mu.RLock()
	after := c.state.Parties[c.party]
	c.mu.RUnlock()

	if d := distanceTo(after, rival); math.Abs(d-escapeRange) > 1e-6 {
		t.Fatalf("the party is %v from %s: the client's newPosition was used instead of a computed retreat", d, rival.Name)
	}
	if after.X == 0 && after.Y == 0 {
		t.Fatal("the party was teleported to the origin the client asked for")
	}
}

// TestFleeCostsMoraleAndNothingElse: getting away is not free, and it is not
// robbery either. A party that flees keeps its money and its soldiers, which is
// what makes running worth choosing over a hopeless fight.
func TestFleeCostsMoraleAndNothingElse(t *testing.T) {
	c := newTestWorld(t)
	rival := someRival(t, c)

	before := playerParty(t, c)
	beforeMorale, beforeMoney, beforeTroops := before.Morale, before.Money, before.Troops

	out, err := c.FleeFromEncounter(context.Background(), wire.FleeRequest{NpcPartyID: rival.Name})
	if err != nil {
		t.Fatalf("fleeing: %v", err)
	}
	res := out.(wire.EncounterOutcomeResult)
	if res.LootTaken != 0 {
		t.Errorf("lootTaken = %d, want 0: a party that got away keeps its money", res.LootTaken)
	}
	if res.PrisonersTaken != 0 {
		t.Errorf("prisonersTaken = %d, want 0: a party that got away keeps its soldiers", res.PrisonersTaken)
	}

	c.mu.RLock()
	after := c.state.Parties[c.party]
	c.mu.RUnlock()

	if after.Money != beforeMoney {
		t.Errorf("money went from %v to %v by fleeing", beforeMoney, after.Money)
	}
	if after.Troops != beforeTroops {
		t.Errorf("troops went from %v to %v by fleeing", beforeTroops, after.Troops)
	}
	if after.Morale >= beforeMorale {
		t.Errorf("morale went from %v to %v by fleeing: running away costs something", beforeMorale, after.Morale)
	}
	if after.Morale < 0 {
		t.Errorf("morale = %v, which is below zero", after.Morale)
	}
}

// TestDefeatTakesTheShareResolveEncounterWouldTake keeps the two ways of ending
// a fight from disagreeing about what a defeat costs. ResolveEncounter takes a
// tenth of the loser's purse; a defeat reported by the battle view takes the
// same tenth. The client's figure is a ceiling on top, never the decision.
func TestDefeatTakesTheShareResolveEncounterWouldTake(t *testing.T) {
	c := newTestWorld(t)
	rival := someRival(t, c)

	c.mu.RLock()
	purse := c.state.Parties[c.party].Money
	c.mu.RUnlock()

	// Ask for everything there is, which is the case the clamp exists for.
	out, err := c.ApplyPlayerDefeat(context.Background(), wire.PlayerDefeatRequest{
		NpcPartyID:     rival.Name,
		LootTaken:      1_000_000,
		PrisonersTaken: 1_000_000,
	})
	if err != nil {
		t.Fatalf("applying a defeat: %v", err)
	}
	res := out.(wire.EncounterOutcomeResult)
	if res.Outcome != "defeated" {
		t.Fatalf("outcome = %q, want defeated", res.Outcome)
	}

	want := purse * defeatLootShare
	if res.LootTaken < 0 {
		t.Fatalf("lootTaken = %d, want zero or more", res.LootTaken)
	}
	if float64(res.LootTaken) > want+1 {
		t.Errorf("lootTaken = %d, want at most the tenth of a %v purse (%v) no matter what the client asked for", res.LootTaken, purse, want)
	}

	c.mu.RLock()
	after := c.state.Parties[c.party]
	c.mu.RUnlock()
	if after.Money < 0 {
		t.Errorf("the player's purse is %v: more was taken than there was", after.Money)
	}
}

// TestDefeatMovesLootAndPrisonersToTheWinner checks the money is moved rather
// than deleted. Loot that vanishes would put the economy out of balance by the
// size of every defeat the player suffers.
func TestDefeatMovesLootAndPrisonersToTheWinner(t *testing.T) {
	c := newTestWorld(t)
	rival := someRival(t, c)

	c.mu.RLock()
	purse := c.state.Parties[c.party].Money
	victorMoney := rival.Money
	victorTroops := rival.Troops
	c.mu.RUnlock()

	out, err := c.ApplyPlayerDefeat(context.Background(), wire.PlayerDefeatRequest{
		NpcPartyID:     rival.Name,
		LootTaken:      1_000_000,
		PrisonersTaken: 1_000_000,
	})
	if err != nil {
		t.Fatalf("applying a defeat: %v", err)
	}
	res := out.(wire.EncounterOutcomeResult)

	c.mu.RLock()
	afterPurse := c.state.Parties[c.party].Money
	c.mu.RUnlock()

	// A prisoner is not a corpse: the soldiers captured join the victor's ranks.
	if res.PrisonersTaken > 0 && rival.Troops < victorTroops+float64(res.PrisonersTaken)-1e-6 {
		t.Errorf("the victor has %v troops after taking %d prisoners, want at least %v",
			rival.Troops, res.PrisonersTaken, victorTroops+float64(res.PrisonersTaken))
	}
	if res.LootTaken > 0 && rival.Money < victorMoney+float64(res.LootTaken)-1e-6 {
		t.Errorf("the victor's money is %v after taking %d, want at least %v: the loot was deleted rather than moved",
			rival.Money, res.LootTaken, victorMoney+float64(res.LootTaken))
	}
	if res.LootTaken > 0 && afterPurse > purse {
		t.Errorf("the loser's purse went from %v to %v while %d was taken", purse, afterPurse, res.LootTaken)
	}
}

// TestOutcomeClosesThePendingEncounter is the bug these routes exist to fix. The
// client polls GET /v1/encounters and keeps everything whose status is
// "pending", so an outcome that left the encounter pending would have the poller
// raise the same fight again, for as long as the player kept running.
func TestOutcomeClosesThePendingEncounter(t *testing.T) {
	cases := []struct {
		name string
		run  func(*Campaign, *model.Party) (wire.EncounterOutcomeResult, error)
		want string
	}{
		{"fleeing", func(c *Campaign, r *model.Party) (wire.EncounterOutcomeResult, error) {
			out, err := c.FleeFromEncounter(context.Background(), wire.FleeRequest{NpcPartyID: r.Name})
			if err != nil {
				return wire.EncounterOutcomeResult{}, err
			}
			return out.(wire.EncounterOutcomeResult), nil
		}, "fled"},
		{"being defeated", func(c *Campaign, r *model.Party) (wire.EncounterOutcomeResult, error) {
			out, err := c.ApplyPlayerDefeat(context.Background(), wire.PlayerDefeatRequest{NpcPartyID: r.Name})
			if err != nil {
				return wire.EncounterOutcomeResult{}, err
			}
			return out.(wire.EncounterOutcomeResult), nil
		}, "defeated"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := newTestWorld(t)
			rival := someRival(t, c)
			enc := raiseEncounter(t, c, rival)

			res, err := tc.run(c, rival)
			if err != nil {
				t.Fatalf("%s: %v", tc.name, err)
			}
			if res.Outcome != tc.want {
				t.Fatalf("outcome = %q, want %q", res.Outcome, tc.want)
			}
			if len(res.EncounterIDs) == 0 {
				t.Fatal("the reply closed no encounter")
			}
			if res.EncounterIDs[0] != enc.ID {
				t.Fatalf("closed %v, want the pending encounter %s", res.EncounterIDs[0], enc.ID)
			}
			if got := storeFor(c).encounters[enc.ID].Status; got != "resolved" {
				t.Fatalf("encounter %s is %q: the poller would raise it again", enc.ID, got)
			}
		})
	}
}

// TestOutcomeClosesOnlyEncountersWithThatForce: leaving one fight must not
// quietly cancel an unrelated one the player is also in.
func TestOutcomeClosesOnlyEncountersWithThatForce(t *testing.T) {
	c := newTestWorld(t)
	rival := someRival(t, c)
	other := someRivalBut(t, c, rival)

	againstRival := raiseEncounter(t, c, rival)
	againstOther := raiseEncounter(t, c, other)

	if _, err := c.FleeFromEncounter(context.Background(), wire.FleeRequest{NpcPartyID: rival.Name}); err != nil {
		t.Fatalf("fleeing: %v", err)
	}

	if got := storeFor(c).encounters[againstRival.ID].Status; got != "resolved" {
		t.Errorf("the encounter with %s is %q, want resolved", rival.Name, got)
	}
	if got := storeFor(c).encounters[againstOther.ID].Status; got != "pending" {
		t.Errorf("the encounter with %s was closed by running from %s", other.Name, rival.Name)
	}
}

// someRivalBut finds a second party that is neither the player nor an exclusion.
func someRivalBut(t *testing.T, c *Campaign, exclude *model.Party) *model.Party {
	t.Helper()
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, id := range c.state.PartyIDs() {
		p := c.state.Parties[id]
		if p == nil || id == c.party || p.ID == exclude.ID {
			continue
		}
		return p
	}
	t.Skip("this seed's world has only one party besides the player's")
	return nil
}

// TestOutcomeRefusesWithAReadableReason: a refusal a player can reach has to say
// something a player can read, which is the rule the whole fault path rests on.
// These are not crashes and not silent successes that pretend the party escaped.
func TestOutcomeRefusesWithAReadableReason(t *testing.T) {
	c := newTestWorld(t)
	calls := map[string]func(ref string) (any, error){
		"flee": func(ref string) (any, error) {
			return c.FleeFromEncounter(context.Background(), wire.FleeRequest{NpcPartyID: ref})
		},
		"defeat": func(ref string) (any, error) {
			return c.ApplyPlayerDefeat(context.Background(), wire.PlayerDefeatRequest{NpcPartyID: ref})
		},
	}
	cases := []struct {
		name string
		ref  string
	}{
		{"no force named", ""},
		{"only whitespace", "   "},
		{"a party that is not there", "nobody-by-that-name"},
		{"the player's own party", c.PartyID()},
	}
	for _, tc := range cases {
		for name, call := range calls {
			t.Run(name+"/"+tc.name, func(t *testing.T) {
				_, err := call(tc.ref)
				if err == nil {
					t.Fatalf("was accepted: %q", tc.ref)
				}
				var f *Fault
				if !errors.As(err, &f) {
					t.Fatalf("refused with %T, want a Fault: %v", err, err)
				}
				if f.Reason == "" {
					t.Errorf("the refusal has no reason a player can read: %v", f)
				}
			})
		}
	}
}

// TestDefeatRefusesNegativeAmounts: a negative ask is not a request for nothing.
// It is a request for money.
func TestDefeatRefusesNegativeAmounts(t *testing.T) {
	c := newTestWorld(t)
	rival := someRival(t, c)
	for _, req := range []wire.PlayerDefeatRequest{
		{NpcPartyID: rival.Name, LootTaken: -1},
		{NpcPartyID: rival.Name, PrisonersTaken: -1},
	} {
		if _, err := c.ApplyPlayerDefeat(context.Background(), req); err == nil {
			t.Fatalf("accepted %+v: a negative amount is not a request for nothing", req)
		}
	}
}

// TestSimResolvesEncounters is the property that wires Milo's tactical sim
// into the campaign: resolving an encounter runs the real battle sim, not
// the abstract power comparison. The fight must name a winner, report
// non-negative losses on both sides, and be deterministic on the encounter
// id: two worlds with the same seed resolve the same fight identically.
func TestSimResolvesEncounters(t *testing.T) {
	resolve := func() *wire.Encounter {
		c := newTestWorld(t)
		defer c.Stop()
		rival := someRival(t, c)
		enc := raiseEncounter(t, c, rival)
		res, err := c.ResolveEncounter(context.Background(), enc.ID)
		if err != nil {
			t.Fatalf("resolving: %v", err)
		}
		return res
	}
	a := resolve()
	b := resolve()
	for _, res := range []*wire.Encounter{a, b} {
		if res.Status != "resolved" {
			t.Fatalf("encounter is %q, want resolved", res.Status)
		}
		if res.Resolution == nil {
			t.Fatal("resolved encounter has no resolution")
		}
		r := res.Resolution
		if r.AttackerLosses < 0 || r.DefenderLosses < 0 {
			t.Fatalf("negative losses: %+v", r)
		}
		if r.WinnerPartyID == 0 {
			t.Fatal("no winner named")
		}
	}
	if a.Resolution.WinnerPartyID != b.Resolution.WinnerPartyID ||
		a.Resolution.AttackerLosses != b.Resolution.AttackerLosses ||
		a.Resolution.DefenderLosses != b.Resolution.DefenderLosses {
		t.Fatalf("non-deterministic resolution:\n%+v\n%+v", a.Resolution, b.Resolution)
	}
}
