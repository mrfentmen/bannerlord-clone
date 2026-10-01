// Package upkeep pays troops, and when it cannot, loses them.
//
// Reads money, wages owed, food, and morale, and writes morale, wages owed, and
// the size of every party. It is chain 4 in full: a ruler who cannot pay troops
// sees morale fall, troops desert, the garrison shrinks, the roads stop being
// patrolled, and raiders grow in the gap.
package upkeep

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the military upkeep system.
func System() sim.System {
	return sim.System{
		Name: "upkeep",
		Doc:  "pays troops; unpaid and hungry troops lose morale and desert",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p.Troops <= 0 {
			continue
		}
		// What the troops cost today.
		payroll := p.Troops * c.Currency.WagesPerTroop
		// A mercenary company is paid in money but hired with gold up front,
		// which is what empties a reserve in a long war.
		if p.IsMercenary {
			payroll = p.Troops * c.Currency.MercenaryWage / c.Currency.MercenaryTroopScale
		}
		w.Set(model.KindParty, pid, "wage_daily", payroll,
			shared.PairF("troops", p.Troops), nil, "daily wage bill")

		// Can they be paid?
		paid := p.Money >= payroll
		if paid {
			w.Add(model.KindParty, pid, "party_money", -payroll,
				shared.ReadString(
					shared.PairF("money", p.Money),
					shared.PairF("payroll", payroll)),
				nil, "wages paid")
			// Arrears are cleared by paying them off, so a ruler who catches up
			// recovers their troops rather than losing them permanently.
			if p.WagesOwed > 0 {
				available := p.Money - payroll
				if available > 0 {
					paidDown := p.WagesOwed
					if paidDown > available {
						paidDown = available
					}
					w.Add(model.KindParty, pid, "wages_owed", -paidDown,
						shared.PairF("owed", p.WagesOwed), nil, "arrears paid off")
				}
			}
		} else {
			// Unpaid wages become debt, and the debt grows. This is the step
			// that has to come before desertion, because soldiers do not leave
			// the same day they go unpaid.
			owed := p.WagesOwed + c.Upkeep.WagesOwedPerDayUnpaid*p.Troops
			w.Set(model.KindParty, pid, "wages_owed", owed,
				shared.ReadString(
					shared.PairF("money", p.Money),
					shared.PairF("payroll", payroll)),
				v.Log.RecentFor(model.KindParty, pid, []string{"party_money", "wages_owed"}, 3),
				"could not pay")
		}

		// --- morale ---
		// Morale falls for two reasons, and both are legible to the player: not
		// being paid, and not being fed. They are separate because a ruler can
		// fix one and not the other, which is most of strategy.
		morale := p.Morale
		// Arrears bite only after a grace period, so a short shortfall is
		// absorbed. MARCH_AND_WAR.md section 2's "wages owed" is an accumulating
		// quantity for exactly this reason.
		owedDays := shared.SafeDiv(p.WagesOwed, shared.SafeDiv(payroll, 1))
		if owedDays > c.Upkeep.WagesGraceDays {
			morale -= c.Upkeep.MoralePerOwedDay * (owedDays - c.Upkeep.WagesGraceDays)
		}
		if !paid {
			morale -= c.Upkeep.MoraleWagesWeight
		}
		// Hunger. A party with no food is a party that will break.
		if p.IsStarving {
			morale -= c.Upkeep.MoraleFoodWeight
		}
		// A ruler's own leadership steadies his troops. Generosity pays: a
		// generous commander gets more out of the same pay, which is
		// RULERS.md section 4's trait requirement made mechanical.
		if r := v.State.Leaders[p.LeaderID]; r != nil {
			morale += (r.Traits.Generosity - 0.5) * c.Upkeep.LeadershipMoraleWeight
			// Valor is contagious in the other direction: a commander the
			// troops think will not flinch holds them together.
			morale += (r.Traits.Valor - 0.5) * c.Upkeep.LeadershipMoraleWeight
		}
		// Recovery when conditions are good, so a paid and fed party recovers
		// over days rather than never.
		if paid && !p.IsStarving {
			morale += c.Upkeep.MoraleRecoveryRate
		}
		morale = shared.Clamp(morale, -1, c.Upkeep.MoraleCap)

		// --- desertion ---
		// Only once morale has actually broken. The threshold matters: troops
		// who are merely unhappy grumble, and troops who are demoralised
		// desert, and the difference is what stops armies evaporating the
		// moment a ruler runs short of money.
		desertions := 0.0
		if morale < c.Upkeep.DesertionMoraleThreshold {
			severity := shared.Clamp01((c.Upkeep.DesertionMoraleThreshold - morale) / c.Upkeep.DesertionMoraleThreshold)
			desertions = p.Troops * c.Upkeep.DesertionRate * severity
			cap := p.Troops * c.Upkeep.DesertionMaxShare
			if desertions > cap {
				desertions = cap
			}
		}
		if desertions > 0 {
			w.Add(model.KindParty, pid, "troops", -desertions,
				shared.ReadString(
					shared.Pair("morale", morale),
					shared.PairF("owed_days", owedDays),
					shared.PairB("starving", p.IsStarving)),
				v.Log.RecentFor(model.KindParty, pid, []string{"morale", "wages_owed", "party_food"}, 4),
				"desertion")
			// Desertion is a political problem as well as a military one: the
			// ruler who lost them looks weak.
			if p.LeaderID >= 0 {
				w.Add(model.KindLeader, p.LeaderID, "influence", -c.Upkeep.DesertionInfluenceLoss*desertions,
					shared.PairF("deserters", desertions), nil, "troops deserted")
			}
			// A party that is down to a handful of stragglers is finished.
			if p.Troops-desertions < c.Upkeep.MinTroopsToPersist {
				w.DeleteEntity(model.KindParty, pid)
			}
		}

		// Publish morale. The write happens whether or not anything else
		// changed, because a system that only wrote on change would leave the
		// field stale and another system would read a number from weeks ago.
		w.Set(model.KindParty, pid, "morale", morale,
			shared.ReadString(
				shared.Pair("morale_before", p.Morale),
				shared.PairF("payroll", payroll),
				shared.PairB("paid", paid),
				shared.PairF("owed_days", owedDays),
				shared.PairB("starving", p.IsStarving)),
			v.Log.RecentFor(model.KindParty, pid,
				[]string{"wages_owed", "party_money", "party_food", "morale", "attrition_rate"}, 4),
			"")

		// --- contract loss ---
		// A mercenary company that has not been paid eventually walks. This is
		// chain 7's mechanism: a ruler spending gold on wages in a long war
		// runs out, and the professionals leave first, because they have
		// somewhere else to sell themselves.
		if p.IsMercenary && p.WagesOwed > 0 && v.Rng.Chance(c.Upkeep.ContractChance) {
			w.DeleteEntity(model.KindParty, pid)
		}
	}
}
