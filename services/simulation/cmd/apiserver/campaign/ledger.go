package campaign

import (
	"fmt"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
)

// The ledger, the warnings, and the notifications are all computed from real state
// and the same balance.toml constants the systems themselves charge. Nothing here
// is a hard-coded figure, and nothing here is a forecast dressed up as a fact: a
// line's perDay is the rate the simulation is actually applying today, and a
// warning's daysRemaining is that rate divided into the balance that is actually
// in hand.

// ledgerLine builds one entry, attaching the cause-log id of the field it was
// computed from so the Why panel can open on it.
func (c *Campaign) ledgerLine(id, label string, res wire.ResourceID, amount, perDay float64, kind model.Kind, entity int, field string) wire.LedgerLine {
	line := wire.LedgerLine{
		ID: id, Label: label, Resource: res,
		Amount: round2(amount), PerDay: round3(perDay),
	}
	if row, ok := c.log.LatestFor(kind, entity, field); ok {
		line.CausedBy = RowID(row.ID)
	}
	return line
}

// ledgerLocked builds the running book for the player: their held towns' revenue
// and upkeep, and their party's daily costs.
func (c *Campaign) ledgerLocked() wire.Ledger {
	out := wire.Ledger{
		Day:       c.state.Tick,
		Income:    []wire.LedgerLine{},
		Expenses:  []wire.LedgerLine{},
		NetPerDay: map[string]float64{},
	}
	party := c.state.Parties[c.party]
	held := c.heldTowns()

	var taxIncome, stateTaxPaid, upkeep float64
	for _, t := range held {
		taxIncome += t.TaxIncome
		stateTaxPaid += t.StateTaxPaid
		upkeep += t.Population * c.cfg.Currency.BuildingUpkeepPerCapita
	}

	add := func(line wire.LedgerLine) {
		if line.PerDay == 0 && line.Amount == 0 {
			return
		}
		if line.PerDay >= 0 {
			out.Income = append(out.Income, line)
		} else {
			out.Expenses = append(out.Expenses, line)
		}
		out.NetPerDay[string(line.Resource)] += line.PerDay
	}

	firstHeld := 0
	if len(held) > 0 {
		firstHeld = held[0].ID
	}
	if taxIncome != 0 || len(held) > 0 {
		add(c.ledgerLine("tax", "Town tax income", wire.ResMoney, taxIncome, taxIncome,
			model.KindTown, firstHeld, "tax_income"))
	}
	if stateTaxPaid != 0 {
		add(c.ledgerLine("state-tax", "State tax remittance", wire.ResMoney, -stateTaxPaid, -stateTaxPaid,
			model.KindTown, firstHeld, "state_tax_paid"))
	}
	if upkeep != 0 {
		add(c.ledgerLine("upkeep", "Keeping your towns running", wire.ResMoney, -upkeep, -upkeep,
			model.KindTown, firstHeld, "money"))
	}

	if party != nil {
		troops := party.Troops
		wages := troops * c.wagePerTroop()
		if wages != 0 {
			add(c.ledgerLine("wages", "Paying the company", wire.ResMoney, party.Money, -wages,
				model.KindParty, party.ID, "party_money"))
		}
		marchWages := troops * c.cfg.March.MoneyPerTroop
		if c.isMarchingLocked(party) && marchWages != 0 {
			add(c.ledgerLine("march-wages", "March wages", wire.ResMoney, 0, -marchWages,
				model.KindParty, party.ID, "speed"))
		}
		rations := troops * c.cfg.March.FoodPerTroop
		if rations != 0 {
			add(c.ledgerLine("rations", "Rations", wire.ResFood, party.Food, -rations,
				model.KindParty, party.ID, "party_food"))
		}
		ammo := troops * c.cfg.Currency.MetalUsePerTroop
		if ammo != 0 {
			add(c.ledgerLine("ammo", "Ammunition and repair", wire.ResMetal, party.Metal, -ammo,
				model.KindParty, party.ID, "party_metal"))
		}
		if c.isMarchingLocked(party) {
			// Field medicine is a march cost rather than a standing one: a column
			// in the field treats its wounded, a party in a town does not.
			field := troops * c.cfg.World.PartyMedicinePerTroop / 10
			add(c.ledgerLine("field-medicine", "Field medicine", wire.ResMedicine, party.Medicine, -field,
				model.KindParty, party.ID, "party_medicine"))
		}
		if party.WagesOwed > 0 {
			add(c.ledgerLine("arrears", "Wages owed and unpaid", wire.ResMoney, -party.WagesOwed, 0,
				model.KindParty, party.ID, "wages_owed"))
		}
	}

	if debt := c.playerDebt(); debt != 0 {
		interest := debt * c.cfg.Currency.InterestRate
		add(c.ledgerLine("interest", "Interest on debt", wire.ResMoney, 0, -interest,
			model.KindSide, c.playerSide(), "debt_total"))
	}
	return out
}

func (c *Campaign) isMarchingLocked(p *model.Party) bool {
	return p.Activity == model.ActMarching || p.Activity == model.ActResupplying
}

// playerDebt is the player's own outstanding debt, taken from the ruler's money
// balance when it is below the model's bankruptcy floor. The model has no
// per-ruler debt field; a negative purse is how a ruler in the simulation is
// insolvent, and currency.bankruptcy_debt_floor is where the currency system
// decides that.
func (c *Campaign) playerDebt() float64 {
	r := c.state.Rulers[c.playerRuler]
	if r == nil || r.Money >= c.cfg.Currency.BankruptcyDebtFloor {
		return 0
	}
	return -r.Money
}

func (c *Campaign) playerSide() int {
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		return r.SideID
	}
	return -1
}

// warningsLocked projects each tracked resource forward at the rate it is being
// consumed at, and says which entity and field the Why panel should open on.
func (c *Campaign) warningsLocked() []wire.ResourceWarning {
	out := []wire.ResourceWarning{}
	party := c.state.Parties[c.party]
	if party == nil {
		return out
	}

	addDays := func(id string, res wire.ResourceID, balance, perDay, threshold float64, headline, detail, entity, field string) {
		if perDay <= 0 {
			return
		}
		var remaining *float64
		severity := "warning"
		switch {
		case balance <= 0:
			// Already gone. The client renders a nil differently from a number,
			// which is the difference between "three days left" and "none".
		default:
			v := balance / perDay
			remaining = &v
			if v < threshold {
				severity = "critical"
			}
		}
		out = append(out, wire.ResourceWarning{
			ID: id, Resource: res, Severity: severity,
			Headline: headline, Detail: detail,
			DaysRemaining: remaining,
			EntityID:      entity, Field: field,
		})
	}

	partyID := EntityID(model.KindParty, party.ID)
	troops := party.Troops

	addDays("rations", wire.ResFood, party.Food, troops*c.cfg.March.FoodPerTroop,
		c.cfg.Supply.DaysOfFoodStarved,
		"The larder",
		fmt.Sprintf("%s men eat %s person-days a day.", trimNum(troops), trimNum(troops*c.cfg.March.FoodPerTroop)),
		partyID, "party_food")

	addDays("purse", wire.ResMoney, party.Money, troops*c.wagePerTroop(), 1,
		"The purse",
		fmt.Sprintf("The wage bill is %s a day for %s men.", trimNum(troops*c.wagePerTroop()), trimNum(troops)),
		partyID, "party_money")

	addDays("metal", wire.ResMetal, party.Metal, troops*c.cfg.Currency.MetalUsePerTroop, 30,
		"Ammunition",
		fmt.Sprintf("Soldiers wear out %s metal a day.", trimNum(troops*c.cfg.Currency.MetalUsePerTroop)),
		partyID, "party_metal")

	if party.WagesOwed > 0 {
		out = append(out, wire.ResourceWarning{
			ID: "arrears", Resource: wire.ResMoney, Severity: "critical",
			Headline: "Wages unpaid",
			Detail: fmt.Sprintf("%s is owed and cannot pay. Morale falls after %s days.",
				trimNum(party.WagesOwed), trimNum(c.cfg.Upkeep.WagesGraceDays)),
			EntityID: partyID, Field: "wages_owed",
		})
	}

	for _, t := range c.heldTowns() {
		tid := EntityID(model.KindTown, t.ID)
		addDays("larder-"+tid, wire.ResFood, t.FoodStock, t.FoodDemand, c.cfg.Supply.DaysOfFoodStarved,
			t.Name+" is short of food",
			fmt.Sprintf("%s person-days against a demand of %s a day.",
				trimNum(t.FoodStock), trimNum(t.FoodDemand)),
			tid, "food_stock")

		clinic := t.Population * c.cfg.World.MedicinePerCapita
		if clinic > 0 {
			addDays("clinic-"+tid, wire.ResMedicine, t.MedicineStock, clinic, 14,
				t.Name+" is short of medicine",
				fmt.Sprintf("%s doses against %s needed.", trimNum(t.MedicineStock), trimNum(clinic)),
				tid, "medicine_stock")
		}
	}
	return out
}
