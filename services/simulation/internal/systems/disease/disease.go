// Package disease spreads infection and kills, and it is the reason medicine
// exists as a resource.
//
// Reads infected, crowding, sanitation, medicine_stock, and population, and
// writes infected, population, workers, medicine_stock, sanitation, and anger.
// Chain 2 is this system plus the labor and food systems: refugees raise
// crowding, crowding raises transmission, sick workers stop working, farms go
// unharvested, and famine follows.
package disease

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the disease system.
func System() sim.System {
	return sim.System{
		Name: "disease",
		Doc:  "spreads infection by crowding and bad sanitation, kills, and consumes medicine",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t.Population <= 0 {
			continue
		}

		// Transmission. The base rate is calibrated at crowding and sanitation
		// of 0.5 with no medicine; crowding and filth multiply it. A town
		// without either problem loses an outbreak quickly, which is what makes
		// a well-run town safe and lets recovery happen.
		crowdingTerm := 1 + c.Disease.CrowdingWeight*(shared.Clamp01(t.Crowding/c.Migrate.CrowdingBase)-1)
		sanitationTerm := 1 + c.Disease.SanitationWeight*(shared.Clamp01(t.Sanitation)-0.5)*2
		if crowdingTerm < 0 {
			crowdingTerm = 0
		}
		if sanitationTerm < 0 {
			sanitationTerm = 0
		}
		// Medicine is spent to treat the sick, and spending it reduces both
		// transmission and deaths. This is the mechanism chain 3 attacks: rob
		// the medicine caravan and the clinic runs dry.
		dosesNeeded := t.Population * t.Infected * c.Disease.DosesPerInfected
		treatable := shared.Clamp01(shared.SafeDiv(t.MedicineStock, dosesNeeded))
		medicineTerm := 1 - c.Disease.MedicineEfficacy*treatable
		if medicineTerm < 0 {
			medicineTerm = 0
		}

		newInfections := t.Population * c.Disease.BaseContactRate * shared.Clamp01(t.Infected+0.001) * crowdingTerm * sanitationTerm * medicineTerm
		if newInfections < 0 {
			newInfections = 0
		}

		// Recovery and death of the already-infected.
		recovered := t.Population * t.Infected * c.Disease.RecoveryRate
		// Untreated patients die; treated patients mostly do not. A town that
		// has medicine loses people slowly, a town without it loses them fast.
		fatality := c.Disease.CaseFatality * (1 - 0.8*treatable)
		// Delivered medicine is the single most important thing that can
		// happen to an infected town, and chain 3 exists to make it
		// unreliable. The logistics system stages arrivals; this system is the
		// only one that turns them into clinic stock.
		arrivingMed := t.ArrivingMedicine
		if arrivingMed > 0 {
			w.Add(model.KindTown, id, "medicine_stock", arrivingMed,
				"caravan delivered medicine", nil, "clinic supplies delivered")
			w.Set(model.KindTown, id, "arriving_cargo_medicine", 0, "consumed", nil, "")
		}
		arrivingMetal := t.ArrivingMetal
		if arrivingMetal > 0 {
			w.Add(model.KindTown, id, "metal", arrivingMetal,
				"caravan delivered metal", nil, "industrial supplies delivered")
			w.Set(model.KindTown, id, "arriving_cargo_metal", 0, "consumed", nil, "")
		}

		deaths := t.Population * t.Infected * fatality
		// An outbreak is worse when the sick cannot be isolated, which crowding
		// stands in for: packed housing means no isolation at all.
		deaths *= 1 + 0.4*shared.Clamp01(t.Crowding/c.Migrate.CrowdingCap)
		if deaths > t.Population*t.Infected+t.Population*0.01 {
			deaths = t.Population * t.Infected
		}
		if deaths < 0 {
			deaths = 0
		}

		// New infected share: inflow of new infections minus those who recover
		// or die, over population.
		infected := (t.Population*t.Infected + newInfections - recovered - deaths) / t.Population
		if infected < c.Disease.ImmunityFloor {
			infected = 0
		}
		infected = shared.Clamp01(infected)

		// Medicine is consumed by the treatment actually given, and clinic
		// stock spoils slowly whether or not anyone is ill.
		medicineUsed := dosesNeeded * treatable
		spoiled := t.MedicineStock * c.Disease.MedicineDecayRate

		read := shared.ReadString(
			shared.Pair("infected", t.Infected),
			shared.Pair("crowding", t.Crowding),
			shared.Pair("sanitation", t.Sanitation),
			shared.PairF("medicine_stock", t.MedicineStock),
			shared.PairF("new_infections", newInfections),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"infected", "crowding", "sanitation", "medicine_stock", "medicine_imports", "population"}, 6)

		w.Set(model.KindTown, id, "infected", infected, read, causes, "infection rate")
		w.Add(model.KindTown, id, "population", -deaths, read, causes, "disease")
		w.Add(model.KindTown, id, "deaths_today", deaths, read, causes, "disease deaths today")
		w.Add(model.KindTown, id, "lost_deaths_total", deaths, read, causes, "")
		w.Add(model.KindTown, id, "medicine_stock", -(medicineUsed + spoiled), read, causes, "medicine used and spoiled")

		// Crowding relaxes on its own once arrivals stop, which is what lets an
		// outbreak burn out without anyone acting.
		crowding := t.Crowding - c.Disease.CrowdingDecay*t.Crowding
		if crowding < 0 {
			crowding = 0
		}
		w.Set(model.KindTown, id, "crowding", crowding, read, causes, "crowding relaxes")

		// A packed town is a dirty town, and a dirty town spreads disease
		// further. This is the feedback that makes an outbreak self-sustaining
		// once it starts in a crowded place.
		w.Add(model.KindTown, id, "sanitation", -c.Disease.SanitationLossPerCrowding*shared.Clamp01(t.Crowding/c.Migrate.CrowdingCap), read, causes, "crowding")

		// Anger and disloyalty from seeing people die. Nobody forgives a
		// government that let an outbreak run.
		w.Add(model.KindTown, id, "pressure",
			c.Disease.UnrestPerDeath*deaths+c.Disease.UnrestPerInfected*infected, read, causes, "outbreak")
		w.Add(model.KindTown, id, "loyalty", -c.Disease.LoyaltyLossPerDeath*deaths, read, causes, "outbreak")
	}
}
