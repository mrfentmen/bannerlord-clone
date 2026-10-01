// Package attrition wears an army down on the march and in the field.
//
// Reads fatigue, hunger, supply distance, terrain, sanitation, and medicine, and
// writes casualties, wounded, and the morale that follows them. It is
// MARCH_AND_WAR.md section 2's "long marches cause attrition", and it is the
// reason a well-supplied army can beat a larger neglected one: the two armies
// enter the same battle at different strengths because one of them was
// starving on the way there.
package attrition

import (
	"math"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/security"
	"mbclone/simulation/internal/systems/shared"
	"mbclone/simulation/internal/systems/template"
)

// System returns the attrition system.
func System() sim.System {
	return sim.System{
		Name: "attrition",
		Doc:  "kills and wounds troops through exhaustion and disease in the field",
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
		// Caravans and raiders take losses through the logistics and security
		// systems instead, which own the risk of the road itself.
		if p.IsCaravan {
			continue
		}
		// An army at rest in a friendly town recovers, and a besieger in its own
		// camp is handled by the siege system, which owns the conditions there.
		if p.Activity == model.ActSieging {
			continue
		}

		// --- disease in the column ---
		// A marching column is crowded by definition: men who would not share a
		// room now share a road, and the field sanitation is terrible. This is
		// why armies used to bring disease home, and it is modelled as a real
		// mechanism rather than flavour: infection grows, and the medicine in
		// the pack train is what limits it.
		growth := c.Attrition.DiseaseFromCrowding * (0.4 + 0.6*shared.Clamp01(p.Troops/c.Attrition.CrowdingReferenceTroops))
		// Rough ground means worse water and worse waste.
		route := nearestRouteTo(v, p)
		terrain := 0.0
		if route >= 0 {
			terrain = security.TerrainRoughness(v.State.Routes[route].Terrain)
		}
		growth += c.Attrition.DiseaseFromSanitation * terrain
		// Field medicine suppresses it. The sufficiency measure is the same
		// one used below for the death term, so what limits transmission and
		// what limits deaths are one fact read twice rather than two
		// independent knobs.
		medicineAdequacy := shared.Clamp01(shared.SafeDiv(p.Medicine, p.Troops*c.Attrition.MedicinePerTroop))
		disease := p.ColumnDisease + growth - c.Attrition.DiseaseRecoveryRate*p.ColumnDisease
		if disease < 0 {
			disease = 0
		}
		if disease > 1 {
			disease = 1
		}
		w.Set(model.KindParty, pid, "column_disease", disease,
			shared.ReadString(
				shared.Pair("column_disease", p.ColumnDisease),
				shared.PairF("troops", p.Troops),
				shared.PairF("terrain", terrain),
				shared.PairF("medicine", p.Medicine)),
			v.Log.RecentFor(model.KindParty, pid, []string{"party_medicine", "troops", "fatigue"}, 3), "disease in the column")

		// --- exhaustion ---
		// Hunger and fatigue, plus the distance from any supply. A column far
		// from a friendly town is not merely short of food, it is short of
		// everything, and the combination is what kills.
		exhaustion := 0.0
		if p.Fatigue > c.Attrition.FatigueThreshold {
			exhaustion = c.Attrition.ExhaustionRate * shared.Clamp01((p.Fatigue-c.Attrition.FatigueThreshold)/(1-c.Attrition.FatigueThreshold))
		}
		if p.IsStarving {
			exhaustion += c.Attrition.ExhaustionRate * c.Attrition.StarvationExhaustionWeight
		}
		// Supply distance. An army with no supply line grinds down every day,
		// which is the slow half of chain 6: it is not dying in a battle, it
		// is dying on the road.
		supplyDrag := shared.Clamp01(p.SupplyDistance / c.Attrition.SupplyRangeReference)
		exhaustion += c.Attrition.ExhaustionRate * c.Supply.AttritionSpeedWeight * supplyDrag
		exhaustion *= 1 + terrain*c.Attrition.TerrainAttritionWeight

		// --- casualties ---
		diseaseDeaths := p.Troops * c.Attrition.DiseaseRate * disease *
			(1 - c.Attrition.MedicineEfficacy*medicineAdequacy)
		exhaustionDeaths := p.Troops * exhaustion
		total := diseaseDeaths + exhaustionDeaths
		// A hard daily cap. An army that lost a third of its strength in one
		// night would be a balance failure, not a dramatic moment.
		cap := p.Troops * c.Attrition.CasualtyCap
		if total > cap {
			total = cap
		}
		if total > p.Troops {
			total = p.Troops
		}
		// Most casualties are wounded rather than dead, which is what makes
		// medicine matter: a wounded man is a man who comes back.
		dead := total * c.Attrition.DeadShare
		wounded := total - dead

		read := shared.ReadString(
			shared.Pair("fatigue", p.Fatigue),
			shared.PairB("starving", p.IsStarving),
			shared.PairF("supply_distance", p.SupplyDistance),
			shared.Pair("column_disease", p.ColumnDisease),
			shared.PairF("troops", p.Troops),
			shared.PairF("terrain", terrain),
			shared.PairF("medicine", p.Medicine),
		)
		causes := v.Log.RecentFor(model.KindParty, pid,
			[]string{"fatigue", "party_starving", "supply_distance", "party_food", "party_medicine", "troops"}, 5)

		w.Add(model.KindParty, pid, "troops", -total, read, causes, "attrition")
		w.Add(model.KindParty, pid, "wounded", wounded, read, causes, "wounded")
		// Wounded recover, faster with medicine. An army that runs out of
		// medicine accumulates a permanently reduced fighting strength, which
		// is a quiet and severe cost. How fast depends on what the wounded are
		// (Tier 6.2): a heavy infantryman is off his feet longer than a
		// skirmisher, so a party's fighting strength is its present strength
		// rather than its paper strength.
		recovery := template.WoundedRecovery(v, p)
		recovered := p.Wounded * (recovery +
			c.Attrition.WoundedRecoveryMedicineWeight*medicineAdequacy)
		w.Add(model.KindParty, pid, "wounded", -recovered, read, causes, "wounded recovering")
		w.Add(model.KindParty, pid, "troops", recovered, read, causes, "wounded returned to duty")
		// Field medicine is consumed treating the sick.
		w.Add(model.KindParty, pid, "party_medicine", -diseaseDeaths*c.Attrition.MedicinePerDeath,
			shared.PairF("disease_deaths", diseaseDeaths), nil, "field medicine spent")
		// Casualties hurt morale. This is why a battle that goes badly has
		// effects for weeks afterwards.
		w.Add(model.KindParty, pid, "morale", -total*c.Attrition.CasualtyMoraleHit,
			shared.PairF("casualties", total), nil, "attrition casualties")
		w.Set(model.KindParty, pid, "attrition_rate", shared.SafeDiv(total, p.Troops),
			read, causes, "daily casualty rate")

		// An army that has been ground down to nothing is finished, and leaving
		// it on the map would let a ruined ruler field free forces.
		if p.Troops-total < c.Attrition.MinTroopsToPersist {
			w.DeleteEntity(model.KindParty, pid)
		}
	}
}

// nearestRouteTo returns the route nearest a party's position, which is the
// road it is on. The march system has its own copy because a system may not
// import another; the two are one line each and are deliberately identical, so
// a change to one should be made to both and logged.
func nearestRouteTo(v *sim.View, p *model.Party) int {
	best, bestD := -1, 0.0
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		a, b := v.State.Towns[r.TownA], v.State.Towns[r.TownB]
		if a == nil || b == nil {
			continue
		}
		da := math.Hypot(a.X-p.X, a.Y-p.Y)
		db := math.Hypot(b.X-p.X, b.Y-p.Y)
		d := da
		if db < d {
			d = db
		}
		if best < 0 || d < bestD {
			best, bestD = rid, d
		}
	}
	return best
}
