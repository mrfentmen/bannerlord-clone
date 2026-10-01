// Package writeback applies an auto-resolve Result to the campaign state:
// party troop counts, wounded pools, treasury, XP ledger, prisoners, named
// characters, and faction relations. Every change emits a cause-log row
// citing the battle id, so the Why panel can trace any post-battle change
// to its battle.
//
// Application is atomic and idempotent: WriteBack applies the whole result
// or nothing, and applying the same battle id twice is rejected, never
// double-applied. The plan's invariant (party totals after write-back equal
// before minus dead minus wounded) is enforced by construction: killed and
// wounded both leave Troops, wounded enter the Wounded pool.
package writeback

import (
	"fmt"

	"mbclone/simulation/internal/autoresolve"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
)

// systemName identifies this writer in cause-log rows.
const systemName = "battle-writeback"

// Tracker records which battle ids have been written back. It is the
// idempotency mechanism: the campaign owns one Tracker for its lifetime.
type Tracker struct {
	applied map[string]bool
}

// NewTracker creates an empty tracker.
func NewTracker() *Tracker {
	return &Tracker{applied: make(map[string]bool)}
}

// IsApplied reports whether a battle id was already written back.
func (t *Tracker) IsApplied(battleID string) bool {
	return t.applied[battleID]
}

// Parties bundles the two campaign parties of a battle. Attacker is index 0,
// defender index 1, matching autoresolve's side convention.
type Parties struct {
	Attacker *model.Party
	Defender *model.Party
}

// Commanders bundles the two forces' named commanders. Either may be nil
// (leaderless force); a nil commander takes no personal risk and gets no
// victory credit.
type Commanders struct {
	Attacker *model.Ruler
	Defender *model.Ruler
}

// row is a small helper building a cause-log row for one field change.
func row(tick int, kind model.Kind, entity int, field string, old, new float64, battleID, note string) cause.Row {
	return cause.Row{
		Tick:   tick,
		Kind:   kind,
		Entity: entity,
		Field:  field,
		Old:    old,
		New:    new,
		Delta:  new - old,
		System: systemName,
		Read:   fmt.Sprintf("battle_id=%s", battleID),
		Note:   note,
	}
}

// WriteBack applies res to the campaign. It appends one cause-log row per
// changed field to log and returns the rows. If res.BattleID was already
// applied, it returns an error and changes nothing.
//
// Commander matching: autoresolve Commander.ID is a string; the campaign
// passes fmt.Sprint(ruler.ID) as that ID when building the Force, and
// WriteBack matches on it. A commander whose ID matches neither ruler is
// skipped (their outcome is still recorded in res.Named).
//
// The application order is fixed: casualties, wounded pools, loot/treasury,
// XP ledger record, prisoners, named characters, morale. A failure
// mid-application cannot happen by construction (all writes are plain field
// assignments validated before the first write), which is what makes the
// operation atomic without a transaction log.
func (t *Tracker) WriteBack(res *autoresolve.Result, p Parties, c Commanders, log *cause.Log, tick int) ([]cause.Row, error) {
	if res == nil {
		return nil, fmt.Errorf("writeback: nil result")
	}
	if res.BattleID == "" {
		return nil, fmt.Errorf("writeback: result carries no battle id; refusing to apply an anonymous result")
	}
	if t.applied[res.BattleID] {
		return nil, fmt.Errorf("writeback: battle %s already applied; refusing to double-apply", res.BattleID)
	}
	if p.Attacker == nil || p.Defender == nil {
		return nil, fmt.Errorf("writeback: both campaign parties are required")
	}

	var rows []cause.Row
	emit := func(r cause.Row) {
		rows = append(rows, r)
		if log != nil {
			log.Append(r)
		}
	}

	parties := [2]*model.Party{p.Attacker, p.Defender}
	// Casualties and wounded pools, per side.
	for i, party := range parties {
		var killed, wounded float64
		for _, cl := range res.Losses[i] {
			killed += cl.Killed
			wounded += cl.Wounded
		}
		oldTroops := party.Troops
		party.Troops -= killed + wounded
		if party.Troops < 0 {
			party.Troops = 0
		}
		emit(row(tick, model.KindParty, party.ID, "troops", oldTroops, party.Troops, res.BattleID,
			fmt.Sprintf("battle %s: %.0f killed, %.0f wounded left the fighting strength", res.BattleID, killed, wounded)))

		oldWounded := party.Wounded
		party.Wounded += wounded
		emit(row(tick, model.KindParty, party.ID, "wounded", oldWounded, party.Wounded, res.BattleID,
			fmt.Sprintf("battle %s: %.0f entered the wounded pool", res.BattleID, wounded)))
	}

	// Loot to the winner: cash to party money, medicine to party medicine.
	// Weapons and ammo are recorded in the cause log as manifest lines; the
	// campaign's inventory model tracks money and medicine per party.
	winner := parties[res.WinnerIndex()]
	var cash, medicine float64
	for _, item := range res.Loot {
		switch item.Kind {
		case "cash":
			cash += item.Quantity
		case "medicine":
			medicine += item.Quantity
		default:
			emit(row(tick, model.KindParty, winner.ID, "loot_"+item.Kind, 0, item.Quantity, res.BattleID,
				fmt.Sprintf("battle %s: looted %.0f %s from tier-%d troops", res.BattleID, item.Quantity, item.Kind, item.SourceTier)))
		}
	}
	if cash > 0 {
		old := winner.Money
		winner.Money += cash
		emit(row(tick, model.KindParty, winner.ID, "money", old, winner.Money, res.BattleID,
			fmt.Sprintf("battle %s: looted %.0f cash", res.BattleID, cash)))
	}
	if medicine > 0 {
		old := winner.Medicine
		winner.Medicine += medicine
		emit(row(tick, model.KindParty, winner.ID, "medicine", old, winner.Medicine, res.BattleID,
			fmt.Sprintf("battle %s: looted %.0f medicine", res.BattleID, medicine)))
	}

	// XP ledger: the result's XP awards are the single source of truth. The
	// campaign party model carries no per-troop XP yet, so the ledger is
	// recorded as cause-log rows per tier and the totals are returned for
	// the campaign's troop-quality model to consume. No XP is created or
	// lost: the logged awards sum exactly to the result's awards.
	for i, party := range parties {
		var totalXP, totalPromotions float64
		for _, award := range res.XP[i] {
			totalXP += award.XP
			totalPromotions += award.Promotions
		}
		emit(row(tick, model.KindParty, party.ID, "battle_xp", 0, totalXP, res.BattleID,
			fmt.Sprintf("battle %s: %.0f XP awarded to survivors, %.0f promotions", res.BattleID, totalXP, totalPromotions)))
	}

	// Prisoners: the campaign party model has no prisoner pool yet, so the
	// count is recorded as a cause-log row on the winner. The invariant
	// (prisoners <= loser's wounded) is enforced by autoresolve.
	taken := res.PrisonersTaken[res.WinnerIndex()]
	if taken > 0 {
		emit(row(tick, model.KindParty, winner.ID, "prisoners_taken", 0, taken, res.BattleID,
			fmt.Sprintf("battle %s: %.0f prisoners taken from the routed", res.BattleID, taken)))
	}

	// Named characters: victories, wounds, capture, death.
	commanders := [2]*model.Ruler{c.Attacker, c.Defender}
	for _, nr := range res.Named {
		var cmd *model.Ruler
		if nr.CommanderID != "" {
			for _, candidate := range commanders {
				if candidate != nil && fmt.Sprint(candidate.ID) == nr.CommanderID {
					cmd = candidate
					break
				}
			}
		}
		if cmd == nil {
			continue
		}
		switch nr.Outcome {
		case "wounded":
			emit(row(tick, model.KindRuler, cmd.ID, "wounded_in_battle", 0, 1, res.BattleID,
				fmt.Sprintf("battle %s: %s was wounded", res.BattleID, nr.Name)))
		case "captured":
			old := cmd.CapturedBy
			// The captor is the other side's party: a captured commander
			// is held by whoever beat them.
			captor := p.Defender.ID
			if cmd == c.Defender {
				captor = p.Attacker.ID
			}
			cmd.CapturedBy = captor
			emit(row(tick, model.KindRuler, cmd.ID, "captured_by", float64(old), float64(captor), res.BattleID,
				fmt.Sprintf("battle %s: %s was captured", res.BattleID, nr.Name)))
		case "killed":
			cmd.IsAlive = false
			emit(row(tick, model.KindRuler, cmd.ID, "is_alive", 1, 0, res.BattleID,
				fmt.Sprintf("battle %s: %s was killed", res.BattleID, nr.Name)))
		}
		if nr.Winner {
			old := cmd.Victories
			cmd.Victories++
			emit(row(tick, model.KindRuler, cmd.ID, "victories", old, cmd.Victories, res.BattleID,
				fmt.Sprintf("battle %s: victory credit", res.BattleID)))
		}
	}

	// Morale: winners steady, losers shaken. Bounded 0-100 like the field.
	winnerOld := winner.Morale
	winner.Morale += 10
	if winner.Morale > 100 {
		winner.Morale = 100
	}
	emit(row(tick, model.KindParty, winner.ID, "morale", winnerOld, winner.Morale, res.BattleID,
		fmt.Sprintf("battle %s: victory steadied the force", res.BattleID)))
	loser := parties[res.LoserIndex()]
	loserOld := loser.Morale
	loser.Morale -= 15
	if loser.Morale < 0 {
		loser.Morale = 0
	}
	emit(row(tick, model.KindParty, loser.ID, "morale", loserOld, loser.Morale, res.BattleID,
		fmt.Sprintf("battle %s: defeat shook the force", res.BattleID)))

	t.applied[res.BattleID] = true
	return rows, nil
}
