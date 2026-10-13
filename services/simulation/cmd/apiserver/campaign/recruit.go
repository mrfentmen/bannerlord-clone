package campaign

import (
	"context"
	"fmt"
	"math"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// The two units a town can raise, and where each comes from.
//
// model.Town has no unit types. It has a militia, which the Watch building
// raises, and a garrison, which has a cap that the Barracks building raises. Those
// are the two real pools of bodies a settlement can hand a player, so they are the
// two units on offer. Naming them anything else would be inventing a roster the
// simulation does not have.
const (
	unitMilitia  = "militia"
	unitGarrison = "garrison"
)

// recruitUnit describes one unit type a town offers.
type recruitUnit struct {
	ID    string
	Name  string
	Blurb string
	// Available is how many the town can part with right now.
	Available float64
	// Quality is 0 to 5, derived from the town's real military readiness.
	Quality float64
}

// recruitableUnits lists what a town can raise, from real state only.
//
// quality is derived rather than typed in, so investing in the Training Grounds
// visibly changes what the town can give you. The mix is half the settlement's
// own drill and half the training it has paid for:
//
//	militia  = garrison morale x 0.5 + training level x 0.5
//	garrison = garrison conduct x 0.5 + training level x 0.5
//
// Garrison morale is what internal/systems/construction's training_morale_per_level
// raises; garrison conduct is what the security system maintains. Both are
// tracked, cause-logged fields.
func (c *Campaign) recruitableUnits(t *model.Town) []wire.RecruitableUnit {
	wage := c.cfg.Currency.WagesPerTroop
	training := trainingLevel(t)

	militiaQuality := clamp01(t.GarrisonMorale)*0.5 + training*0.5
	garrisonQuality := clamp01(t.GarrisonConduct)*0.5 + training*0.5

	out := []wire.RecruitableUnit{
		{
			UnitID:    unitMilitia,
			Name:      t.Name + " Militia",
			Quality:   round2(militiaQuality),
			Wage:      round3(wage),
			HireCost:  0,
			Available: int(math.Max(0, math.Round(t.Militia))),
			Blurb:     "Raised from the town itself. The Watch building pays for the watch; these are the men it finds.",
		},
		{
			UnitID:    unitGarrison,
			Name:      t.Name + " Garrison",
			Quality:   round2(garrisonQuality),
			Wage:      round3(wage),
			HireCost:  0,
			Available: int(math.Max(0, math.Round(t.Garrison-t.GarrisonCap))),
			Blurb:     "The garrison above its cap, which the Barracks building cannot hold. Trained, and expensive to keep.",
		},
	}
	return out
}

// recruitPool is the quantity a unit id can currently supply, and the town field
// it comes from. A zero quantity means the pool is empty and the unit is not
// offered.
func (c *Campaign) recruitPool(t *model.Town, unitID string) (float64, string, bool) {
	switch unitID {
	case unitMilitia:
		return math.Max(0, t.Militia), "militia", true
	case unitGarrison:
		return math.Max(0, t.Garrison-t.GarrisonCap), "garrison", true
	}
	return 0, "", false
}

// trainingLevel is the town's Training Grounds tier as a 0-1 share of the
// maximum, from the construction system's own building field.
func trainingLevel(t *model.Town) float64 {
	return clamp01(t.BuildingTraining / 3)
}

// Recruit hires troops in a town.
//
// The consequence is a wage bill, and the wage bill is real: the hire adds to the
// party's troops, and internal/systems/upkeep then computes
// payroll = troops * currency.wages_per_troop every tick and charges it. Hire too
// many and wages_owed accrues, morale falls past the grace days, and men desert.
// That chain is the simulation's, not this server's.
//
// There is no hiring bonus, and totalCost is zero. balance.toml has no levy fee,
// and inventing one would be inventing a cost the player then has to pay. The
// contract says so in its section 6.
func (c *Campaign) Recruit(ctx context.Context, req wire.RecruitRequest) (any, error) {
	c.mu.RLock()
	dayErr := c.validateOrderDay(req.ExpectedDay)
	c.mu.RUnlock()
	if dayErr != nil {
		return nil, dayErr
	}
	if req.Quantity <= 0 {
		return nil, unprocessablef("Nobody signs on for no pay at all.",
			"quantity must be positive, got %v", req.Quantity)
	}

	j := newJob("recruit",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stageRecruit(v, w, req)
		},
		func(c *Campaign, s *model.State, staged any) any {
			return c.finishRecruit(s, staged)
		})
	return c.Submit(ctx, j)
}

type recruitStaged struct {
	result   wire.RecruitResult
	accepted bool
	party    int
	unitID   string
	name     string
	quality  float64
	quantity float64
	wage     float64
}

func (c *Campaign) stageRecruit(v *sim.View, w *sim.WriteSet, req wire.RecruitRequest) (any, error) {
	party := c.partyForOrder(req.PartyID)
	if party == nil {
		return nil, notFoundf("no party %q", req.PartyID)
	}
	town := c.townRef(req.TownID)
	if town == nil {
		return nil, notFoundf("no town %q", req.TownID)
	}
	units := c.recruitableUnits(town)
	var unit *wire.RecruitableUnit
	for i := range units {
		if units[i].UnitID == req.UnitID {
			unit = &units[i]
			break
		}
	}
	if unit == nil {
		return nil, unprocessablef(
			fmt.Sprintf("%s is not raising that. It can offer %s.", town.Name, unitList(units)),
			"unitId %q is not a unit %q offers; it offers %v", req.UnitID, town.Name, unitIDs(units))
	}
	if party.Troops <= 0 {
		return nil, unprocessablef("There is nobody to give the orders to.",
			"party %d has no troops", party.ID)
	}

	out := recruitStaged{
		party:    party.ID,
		unitID:   unit.UnitID,
		name:     unit.Name,
		quality:  unit.Quality,
		quantity: req.Quantity,
		wage:     c.cfg.Currency.WagesPerTroop,
		result: wire.RecruitResult{
			UnitName:   unit.Name,
			Quantity:   req.Quantity,
			TotalCost:  0,
			WagePerDay: round3(c.cfg.Currency.WagesPerTroop * req.Quantity),
		},
	}

	if refusal := recruitRefusal(town, party, unit, req.Quantity); refusal != nil {
		out.result.Reason = refusal.Reason
		return out, nil
	}

	pool, poolField, known := c.recruitPool(town, unit.UnitID)
	if !known {
		out.result.Reason = fmt.Sprintf("%s is not raising anything here.", town.Name)
		return out, nil
	}
	qty := req.Quantity

	read := shared.ReadString(
		shared.PairF("quantity", qty),
		shared.PairF("wage_per_troop", c.cfg.Currency.WagesPerTroop),
		shared.PairF("party_troops", party.Troops),
		shared.PairF("pool", pool))
	causes := v.Log.RecentFor(model.KindTown, town.ID, []string{poolField, "money"}, 2)
	causes = append(causes, v.Log.RecentFor(model.KindParty, party.ID, []string{"troops", "wages_owed"}, 2)...)

	// The town's pool leaves the town and the party gains the men. Both are
	// staged writes, so both land in the cause log and both are walkable.
	w.Add(model.KindTown, town.ID, poolField, -qty, read, causes,
		unit.Name+" taken into "+party.Name)
	w.Add(model.KindParty, party.ID, "troops", qty, read, causes,
		"hired "+trimNum(qty)+" from "+town.Name)

	out.accepted = true
	out.result.Accepted = true
	return out, nil
}

// recruitRefusal decides whether the hire cannot happen, and says why in the
// product's voice. A nil pointer means it can.
func recruitRefusal(town *model.Town, party *model.Party, unit *wire.RecruitableUnit, qty float64) *Refusal {
	if town.IsBesieged {
		return refuse(town.Name + " is under siege. No one is enlisting.")
	}
	if party.Troops <= 0 {
		return refuse("There is nobody to give the orders to.")
	}
	if qty > float64(unit.Available) {
		return refuse(fmt.Sprintf("%s has %d willing, not %s.",
			unit.Name, unit.Available, trimNum(qty)))
	}
	return nil
}

// finishRecruit reads committed state and builds the reply.
//
// The roster is updated here rather than inside the tick, because the roster is
// this server's own read model: it must not be able to influence a simulation
// result, and it is reconciled against the simulation's troop count on every read
// anyway.
func (c *Campaign) finishRecruit(s *model.State, staged any) any {
	st, ok := staged.(recruitStaged)
	if !ok {
		return nil
	}
	res := st.result
	p := s.Parties[st.party]
	if p == nil {
		return res
	}
	if st.accepted {
		c.ro.grow(st.unitID, st.name, st.quality, int(st.quantity))
		if row, found := c.log.LatestFor(model.KindParty, st.party, "troops"); found {
			res.CausedBy = RowID(row.ID)
		}
	}
	c.ro.followMorale(p.Morale)
	res.NewCount = float64(c.ro.countOf(st.unitID))
	// The wage bill the hire has added, measured on the party's real count
	// rather than on the requested quantity, so a party whose troops moved for
	// another reason in the same tick still reports the truth.
	res.WagePerDay = round3(c.wagePerTroop() * p.Troops)
	return res
}

// wagePerTroop is what the upkeep system charges per soldier per day. Every wage
// the server reports is this number, so what the player is shown and what the
// simulation takes are the same figure by construction.
func (c *Campaign) wagePerTroop() float64 { return c.cfg.Currency.WagesPerTroop }

// unitList and unitIDs render a town's offer for a sentence.
func unitList(units []wire.RecruitableUnit) string {
	out := make([]string, 0, len(units))
	for _, u := range units {
		out = append(out, u.Name)
	}
	return joinNames(out)
}

func unitIDs(units []wire.RecruitableUnit) []string {
	out := make([]string, 0, len(units))
	for _, u := range units {
		out = append(out, u.UnitID)
	}
	return out
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
