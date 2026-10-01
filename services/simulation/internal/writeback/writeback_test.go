package writeback

import (
	"fmt"
	"math"
	"testing"

	"mbclone/simulation/internal/autoresolve"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
)

func testParties() (Parties, Commanders) {
	att := &model.Party{ID: 1, Name: "attackers", Troops: 100, Wounded: 5, Money: 1000, Medicine: 10, Morale: 70}
	def := &model.Party{ID: 2, Name: "defenders", Troops: 120, Wounded: 0, Money: 500, Medicine: 5, Morale: 60}
	attCmd := &model.Ruler{ID: 11, Name: "Att Boss", IsAlive: true}
	defCmd := &model.Ruler{ID: 22, Name: "Def Boss", IsAlive: true}
	return Parties{Attacker: att, Defender: def}, Commanders{Attacker: attCmd, Defender: defCmd}
}

func testForces() (autoresolve.Force, autoresolve.Force) {
	att := autoresolve.Force{
		Blocks:    []autoresolve.TroopBlock{{Tier: autoresolve.TierTrained, Count: 100, Equipment: 0.5}},
		Commander: autoresolve.Commander{ID: "11", Name: "Att Boss", Skill: 0.7, Present: true},
		Morale:    0.7,
		Medicine:  0.5,
	}
	def := autoresolve.Force{
		Blocks:    []autoresolve.TroopBlock{{Tier: autoresolve.TierRegular, Count: 120, Equipment: 0.5}},
		Commander: autoresolve.Commander{ID: "22", Name: "Def Boss", Skill: 0.5, Present: true},
		Morale:    0.6,
		Medicine:  0.5,
	}
	return att, def
}

// The plan's invariant: party totals after write-back equal before minus
// dead minus wounded.
func TestCasualtyAccounting(t *testing.T) {
	p, c := testParties()
	att, def := testForces()
	res := autoresolve.Resolve(att, def, autoresolve.Context{Terrain: autoresolve.TerrainOpen, Seed: 1, BattleID: "b1"})

	attTroopsBefore := p.Attacker.Troops
	defTroopsBefore := p.Defender.Troops

	tracker := NewTracker()
	rows, err := tracker.WriteBack(res, p, c, cause.NewLog(1000), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("no cause-log rows emitted")
	}

	for i, party := range [2]*model.Party{p.Attacker, p.Defender} {
		var killed, wounded float64
		for _, cl := range res.Losses[i] {
			killed += cl.Killed
			wounded += cl.Wounded
		}
		before := attTroopsBefore
		if i == 1 {
			before = defTroopsBefore
		}
		want := before - killed - wounded
		if want < 0 {
			want = 0
		}
		if math.Abs(party.Troops-want) > 1e-9 {
			t.Fatalf("side %d troops %.2f, want %.2f (before %.0f - killed %.0f - wounded %.0f)",
				i, party.Troops, want, before, killed, wounded)
		}
	}
}

// Applying the same battle id twice is rejected and changes nothing.
func TestIdempotency(t *testing.T) {
	p, c := testParties()
	att, def := testForces()
	res := autoresolve.Resolve(att, def, autoresolve.Context{Terrain: autoresolve.TerrainOpen, Seed: 2, BattleID: "b2"})

	tracker := NewTracker()
	if _, err := tracker.WriteBack(res, p, c, cause.NewLog(1000), 10); err != nil {
		t.Fatal(err)
	}
	troopsAfterFirst := p.Attacker.Troops
	if _, err := tracker.WriteBack(res, p, c, cause.NewLog(1000), 10); err == nil {
		t.Fatal("second write-back of the same battle id succeeded; want rejection")
	}
	if p.Attacker.Troops != troopsAfterFirst {
		t.Fatal("rejected second write-back still mutated the party")
	}
}

// Every cause-log row cites the battle id.
func TestCauseRowsCiteBattle(t *testing.T) {
	p, c := testParties()
	att, def := testForces()
	res := autoresolve.Resolve(att, def, autoresolve.Context{Terrain: autoresolve.TerrainOpen, Seed: 3, BattleID: "b3"})

	tracker := NewTracker()
	rows, err := tracker.WriteBack(res, p, c, cause.NewLog(1000), 10)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.System != "battle-writeback" {
			t.Fatalf("row has wrong system %q", r.System)
		}
		found := false
		for _, needle := range []string{r.Read, r.Note} {
			if len(needle) >= 2 && contains(needle, "b3") {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("row cites no battle id: %+v", r)
		}
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// The XP ledger sums exactly: logged XP equals the result's awards.
func TestXPLedgerSums(t *testing.T) {
	p, c := testParties()
	att, def := testForces()
	res := autoresolve.Resolve(att, def, autoresolve.Context{Terrain: autoresolve.TerrainOpen, Seed: 4, BattleID: "b4"})

	tracker := NewTracker()
	rows, err := tracker.WriteBack(res, p, c, cause.NewLog(1000), 10)
	if err != nil {
		t.Fatal(err)
	}
	for i := range [2]int{0, 1} {
		var want float64
		for _, a := range res.XP[i] {
			want += a.XP
		}
		var got float64
		for _, r := range rows {
			if r.Field == "battle_xp" && r.Entity == []int{p.Attacker.ID, p.Defender.ID}[i] {
				got = r.New
			}
		}
		if got != want {
			t.Fatalf("side %d logged XP %.2f, want %.2f", i, got, want)
		}
	}
}

// A nil result, an empty battle id, and nil parties are all rejected before
// any write.
func TestWriteBackValidation(t *testing.T) {
	p, c := testParties()
	att, def := testForces()
	tracker := NewTracker()
	log := cause.NewLog(100)

	if _, err := tracker.WriteBack(nil, p, c, log, 10); err == nil {
		t.Fatal("nil result accepted")
	}
	res := autoresolve.Resolve(att, def, autoresolve.Context{Terrain: autoresolve.TerrainOpen, Seed: 5, BattleID: ""})
	if _, err := tracker.WriteBack(res, p, c, log, 10); err == nil {
		t.Fatal("empty battle id accepted")
	}
	res2 := autoresolve.Resolve(att, def, autoresolve.Context{Terrain: autoresolve.TerrainOpen, Seed: 6, BattleID: "b6"})
	if _, err := tracker.WriteBack(res2, Parties{}, c, log, 10); err == nil {
		t.Fatal("nil parties accepted")
	}
	// Nothing was applied: the tracker is still clean.
	for _, id := range []string{"", "b6"} {
		if tracker.IsApplied(id) {
			t.Fatalf("battle %q marked applied after rejected write", id)
		}
	}
	fmt.Println("validation ok")
}
