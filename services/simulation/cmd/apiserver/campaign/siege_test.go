package campaign

// Laying a siege: what it takes, and what it says when it cannot be done.
//
// Tested against a real world rather than a stub, because the refusals are the point.
// A siege is refused for reasons a player reads — too few men at the walls, a town
// already under siege — and every one of those refusals used to be a bare error, which
// crosses the HTTP boundary as a 500 whose reason is "the world simulation could not
// answer that". That sentence is true and useless: it does not say whose walls are too
// thin. So the codes and the reasons are pinned here, beside the world that produces
// them.

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// aTown picks a town that exists, so a refusal can only be about the siege.
func aTown(t *testing.T, c *Campaign) int {
	t.Helper()
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, id := range c.state.TownIDs() {
		if tw := c.state.Towns[id]; tw != nil && tw.Population > 0 {
			return id
		}
	}
	t.Skip("this seed's world has no town")
	return 0
}

// withTroops gives a party a force, so a siege can be laid without waiting for one.
func withTroops(t *testing.T, c *Campaign, partyID int, troops float64) {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	p := c.state.Parties[partyID]
	if p == nil {
		t.Fatalf("party %d is not in the world", partyID)
	}
	p.Troops = troops
}

// faultOf pulls the Fault out of an error, so the code and the reason can be asserted
// separately from the message.
func faultOf(t *testing.T, err error) *Fault {
	t.Helper()
	var f *Fault
	if !errors.As(err, &f) {
		t.Fatalf("the refusal is a bare error, so it crosses the boundary as a 500 with no reason: %v", err)
	}
	return f
}

// TestStartSiegeLaysOne: the world changes the way the client's panel then reads it —
// a siege exists, the town is marked besieged and the besieging party is marked as
// sieging, which is what stops either of them marching off to somewhere else.
func TestStartSiegeLaysOne(t *testing.T) {
	c := newTestWorld(t)
	townID := aTown(t, c)
	withTroops(t, c, c.party, c.cfg.Siege.MinTroopsToBesiege+50)

	siege, err := c.StartSiege(context.Background(), c.party, townID)
	if err != nil {
		t.Fatalf("laying a siege with men enough to lay it: %v", err)
	}
	if siege.ID == "" {
		t.Fatal("the siege has no id, so the client could never assault or lift it")
	}
	if siege.TownID != townID {
		t.Errorf("the siege names town %d, not %d", siege.TownID, townID)
	}
	if siege.Outcome != "ongoing" {
		t.Errorf("a siege laid this instant reads %q, not \"ongoing\"", siege.Outcome)
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	if !c.state.Towns[townID].IsBesieged {
		t.Error("the town is not marked besieged, so the world will not treat it as one")
	}
	if !c.state.Parties[c.party].IsSieging {
		t.Error("the besieging party is not marked as sieging, so the march system will walk it away")
	}
}

// TestStartSiegeRefusalsCarryCodesAndReasons: each refusal is a Fault with the code
// that says what kind of refusal it is and a reason a player can read.
func TestStartSiegeRefusalsCarryCodesAndReasons(t *testing.T) {
	c := newTestWorld(t)
	townID := aTown(t, c)

	t.Run("no such party", func(t *testing.T) {
		withTroops(t, c, c.party, c.cfg.Siege.MinTroopsToBesiege+50)
		_, err := c.StartSiege(context.Background(), townID+10_000, townID)
		f := faultOf(t, err)
		if f.Code != CodeNotFound {
			t.Errorf("code = %q, want %q", f.Code, CodeNotFound)
		}
		if f.Reason == "" {
			t.Error("no reason a player can read")
		}
	})

	t.Run("no such town", func(t *testing.T) {
		withTroops(t, c, c.party, c.cfg.Siege.MinTroopsToBesiege+50)
		_, err := c.StartSiege(context.Background(), c.party, townID+10_000)
		f := faultOf(t, err)
		if f.Code != CodeNotFound {
			t.Errorf("code = %q, want %q", f.Code, CodeNotFound)
		}
	})

	t.Run("too few men", func(t *testing.T) {
		withTroops(t, c, c.party, 1)
		_, err := c.StartSiege(context.Background(), c.party, townID)
		f := faultOf(t, err)
		// Unprocessable rather than bad request: the order is well formed and the
		// world says no. It is also not a 409, which the client's trade path treats
		// as "the world moved on" and answers by re-reading the market.
		if f.Code != CodeUnprocessable {
			t.Errorf("code = %q, want %q", f.Code, CodeUnprocessable)
		}
		if f.Reason == "" {
			t.Fatal("no reason a player can read, so the panel can only say the siege failed")
		}
		// The reason names the town and the shortfall, because "too few men" with no
		// number is the sentence that sends the player back to the roster guessing.
		c.mu.RLock()
		name := c.state.Parties[c.party].Name
		c.mu.RUnlock()
		if !strings.Contains(f.Reason, name) {
			t.Errorf("the reason does not name the force that is too small: %q", f.Reason)
		}
	})

	t.Run("already under siege", func(t *testing.T) {
		withTroops(t, c, c.party, c.cfg.Siege.MinTroopsToBesiege+50)
		if _, err := c.StartSiege(context.Background(), c.party, townID); err != nil {
			t.Fatalf("laying the first siege: %v", err)
		}
		_, err := c.StartSiege(context.Background(), c.party, townID)
		f := faultOf(t, err)
		// A conflict, because the world moved on between two orders that were both
		// correct when the player made them.
		if f.Code != CodeConflict {
			t.Errorf("code = %q, want %q", f.Code, CodeConflict)
		}
		if f.Reason == "" {
			t.Error("no reason a player can read")
		}
	})
}
