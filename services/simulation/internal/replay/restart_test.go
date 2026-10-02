package replay

import (
	"net/http/httptest"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/battleapi"
	"mbclone/simulation/internal/config"
)

// A restarted battle server DEALT A BATTLE THAT WAS ALREADY FIGHTED, and then
// OVERWROTE THE RECORD OF IT. Both halves are the same line of code and the second
// one is the reason the first one is a data-loss bug rather than an oddity.
//
// battleapi.Server numbers its battles from a field on the struct: nextID and
// battleCounter both start at 0. battle.DeriveBattleSeed is keyed on that counter,
// so the first battle of a process is btl-1 at a seed derived from counter 1, every
// time. Restart the server and both fields are 0 again. With no commander attached
// a battle is a pure function of the config and its seed, so the new process deals
// the identical fight, tick for tick, under the identical id.
//
// Identical is what made this survivable until commit b5e8817, which made the
// shipped server WRITE a record for every battle it resolves, into
// logs/battles/<id>. Two lifetimes sharing one record directory now both deal
// btl-1, both fight it, and the second one's saveRecord calls battle.SaveBattle on
// a directory that already holds the first one's record. SaveBattle is
// os.MkdirAll plus os.WriteFile: it overwrites. The first battle's battle.json and
// order.log are gone.
//
// What makes it silent is determinism, which is this lane's own headline property.
// The second battle is fought with the same seed, so if the player sends the same
// orders the two records are byte-identical and nothing is observably lost. The
// moment they send different ones — which is the entire reason to fight the same
// border twice — the surviving record is the SECOND fight, under the id the FIRST
// fight's client was told. record_saved is true, record_error is empty,
// `simrun replay -list` shows one battle rather than two, and the replay of btl-1
// MATCHES. Every number the API publishes says the system is working.
//
// This test therefore does the restart with DIFFERENT ORDERS on each side of it, and
// it asserts the two fights are genuinely different before it relies on the
// difference to detect an overwrite. A test that compared a record against itself
// would pass against the bug it exists to catch.
//
// # WHAT THIS DOES NOT DECIDE
//
// The counter is recovered from the records on disk, so the campaign's battle
// sequence survives a restart as long as the record directory does. If an operator
// deletes old records the counter can go backwards, because there is nothing else
// here that remembers how many battles this campaign has fought. CONSTITUTION.md
// 4.1 records where campaign state is stored as unresolved; this is not that
// decision, because it adds no database, no dependency and no hosted service — it
// reads the file store the server already writes, once, at startup. The durability
// of a campaign's battle counter across a pruned record directory remains open and
// is logged under Unresolved in CHANGELOG.md rather than claimed here.

// TestARestartedServerDoesNotDealTheSameBattleTwiceNorOverwriteItsRecord runs one
// campaign across two server lifetimes that share a record directory, which is what
// a restart of the shipped deployment is.
func TestARestartedServerDoesNotDealTheSameBattleTwiceNorOverwriteItsRecord(t *testing.T) {
	cfg := loadConfig(t)
	dir := t.TempDir()

	// The two lifetimes. Same campaign seed, same two parties, same store, and
	// deliberately different orders: the same orders would make the two records
	// byte-identical and the overwrite invisible.
	first := fightOverStore(t, cfg, 909, dir, 12, `{"name":"change-formation","params":{"shape":"wedge"}}`)
	firstCheck := verifyOverStore(t, cfg, dir, first.id)

	second := fightOverStore(t, cfg, 909, dir, 12, `{"name":"change-formation","params":{"shape":"skirmish"}}`)

	t.Logf("lifetime 1: id %q seed %d, %d orders accepted, %s", first.id, first.seed, first.accepted, first.fingerprint())
	t.Logf("lifetime 2: id %q seed %d, %d orders accepted, %s", second.id, second.seed, second.accepted, second.fingerprint())

	// The probe has to be live before the assertions below mean anything. If the two
	// fights came out the same, "the first record still verifies" would pass against
	// an overwrite, and the test would be reporting nothing.
	if first.fingerprint() == second.fingerprint() {
		t.Fatalf("the two lifetimes fought the same battle, so this test cannot tell an overwrite from "+
			"a preserved record.\n  both: %s\n  Give the two servers different orders.", first.fingerprint())
	}

	if second.id == first.id {
		t.Errorf("a restarted server dealt battle id %q again.\n"+
			"  battleapi.Server numbers battles from nextID, a field on the struct, and a new process "+
			"  starts it at 0 — so the first battle of the second lifetime has the first lifetime's id. "+
			"  Worse than a repeated name: logs/battles/%s already holds the first battle's record, and "+
			"  the second save overwrites it.", first.id, first.id)
	}
	if second.seed == first.seed {
		t.Errorf("a restarted server was dealt seed %d again, the same seed the first lifetime's battle "+
			"used.\n  battle.DeriveBattleSeed is keyed on Server.battleCounter, which is 0 in a new "+
			"  process, so the same two parties are handed the same fight. With no commander attached a "+
			"  battle is a pure function of its seed, so this is the same battle and not merely a "+
			"  similar one.", second.seed)
	}

	ids, err := battle.OpenBattleStore(dir).IDs()
	if err != nil {
		t.Fatalf("listing the records the two lifetimes between them wrote: %v", err)
	}
	t.Logf("the store holds %d battles: %v", len(ids), ids)
	if len(ids) != 2 {
		t.Errorf("the two lifetimes wrote %d records where there were two battles: %v.\n"+
			"  One record for two battles means the second save went over the first one's files, "+
			"  which is battle.SaveBattle's os.WriteFile on a directory that already exists.",
			len(ids), ids)
	}

	// The record of the FIRST battle, re-read through the replay machinery after the
	// second lifetime has finished. This is the assertion that matters: it asks
	// whether btl-1 still replays to the battle that was fought under btl-1.
	after := verifyOverStore(t, cfg, dir, first.id)
	if !after.Match || after.Want != firstCheck.Want {
		t.Errorf("the first battle's record no longer holds the first battle.\n"+
			"  before the restart: hash %s, %s\n"+
			"  after the restart:  hash %s (%s), first difference: %s\n"+
			"  %s survived the restart, so the record that survived is the second fight's and the "+
			"  after-action report of the first is gone. Every number the API publishes about this is "+
			"  healthy: record_saved true, record_error empty, and the replay of %s MATCHES the second "+
			"  battle. Determinism is what hid it.",
			firstCheck.Want, verdict(firstCheck), after.Want, verdict(after), after.Diff, first.id, first.id)
	}
}

// TestARecordDirectoryIsNeverOverwrittenByADifferentBattle is the same property at
// the layer underneath, where it can be stated without a server: a battle id that
// already holds a record of one battle may not be given a record of a different one.
//
// SaveBattle's documented behaviour is that saving the SAME battle twice over the
// same directory is an update — TestSaveBattleOverTheSameDirectoryIsAnUpdate, and
// that is right, because it makes re-recording idempotent. What it never said is
// what happens when the two battles are not the same, and the answer was nothing at
// all: MkdirAll succeeds on an existing directory and WriteFile replaces both files.
// Two servers sharing a record directory is enough to reach it without any bug at
// all, so this is not only a restart story.
func TestARecordDirectoryIsNeverOverwrittenByADifferentBattle(t *testing.T) {
	cfg := loadConfig(t)
	dir := t.TempDir()
	id := "btl-1"

	first, firstSaved := recordOverSeed(t, cfg, dir, id, 5150)
	second, secondSaved := recordOverSeed(t, cfg, dir, id, 5151)

	t.Logf("saved %s at seed %d (accepted: %t), then at seed %d (accepted: %t)", id, first, firstSaved, second, secondSaved)

	onDisk, err := battle.OpenBattleStore(dir).Load(id)
	if err != nil {
		t.Fatalf("reading %s back after two saves: %v", id, err)
	}
	if onDisk.Seed != first {
		t.Errorf("%s now describes seed %d; it was saved describing seed %d.\n"+
			"  A record is a promise that a battle id means one battle. A client that was told %s was "+
			"  the first fight, and kept the first fight's report, is now holding a record of the "+
			"  second one — and the replay machinery will call it a MATCH, because the record is "+
			"  internally consistent and describes exactly the battle it was overwritten with.",
			id, onDisk.Seed, first, id)
	}
}

// recordOverSeed fights a whole battle at one seed and saves it into dir under id,
// and reports whether the save was accepted.
func recordOverSeed(t *testing.T, cfg *config.Config, dir, id string, seed uint64) (uint64, bool) {
	t.Helper()
	s, res, log := foughtSession(t, cfg, seed, 12)
	rec := &battle.Recording{
		Seed:          s.Seed(),
		ConfigVersion: cfg.Version,
		Setup:         s.Setup(),
		Log:           log,
	}
	roster := battle.Roster{Units: 12}
	err := battle.OpenBattleStore(dir).Save(id, roster, roster, res, rec)
	return seed, err == nil
}

func verdict(c *battle.BattleCheck) string {
	if c.Match {
		return "MATCHED"
	}
	return "MISMATCHED, first difference: " + c.Diff
}

// fightOverStore is fightOverAPI with the record directory named rather than left to
// a temporary one, which is what makes a pair of these a restart instead of two
// unrelated servers.
func fightOverStore(t *testing.T, cfg *config.Config, campaignSeed uint64, dir string, units int, orders ...string) apiFight {
	t.Helper()
	srv := httptest.NewServer(
		battleapi.New(cfg, campaignSeed, "replay-test").WithBattleStore(battle.OpenBattleStore(dir)).Handler())
	defer srv.Close()

	start := startBattle(t, srv.URL, campaignSeed, units)
	out := apiFight{id: start.id, seed: start.seed}
	if len(orders) > 0 {
		out.accepted = sendOrders(t, srv.URL, start.id, orders)
	}
	out.state = resolve(t, srv.URL, start.id)
	out.ordersLogged = intOf(out.state["orders_logged"])
	return out
}

func verifyOverStore(t *testing.T, cfg *config.Config, dir, id string) *battle.BattleCheck {
	t.Helper()
	check, err := battle.OpenBattleStore(dir).Verify(cfg, id)
	if err != nil {
		t.Fatalf("verifying %s in %s: %v", id, dir, err)
	}
	return check
}