// Package template decides what a party is made of (Tier 6.2).
//
// A party fields four kinds of soldier: stance (disciplined line), heavy
// (armoured core), light (skirmish screen), horse (mounted wing). A template
// is one named composition of those four, and which composition a party fields
// is not a decoration: the march and battle systems read the published class
// counts, so a horse column marches further and hits harder on open ground and
// a stance column holds a wall.
//
// Three things decide the composition, and all three come from shared state:
//
//   - Culture. FACTIONS.md gives every section its own troop style, so a
//     frontier column is mounted and a mountain one is not. The side's culture
//     field is the whole input.
//   - Terrain. A party is on the ground its nearest route runs through, and a
//     horse column crossing mountains is the slowest thing on the map.
//   - Mission. A party besieging a wall wants different troops from one
//     escorting a caravan, read from what it is actually doing.
//
// Changing composition is not free. A refit costs metal per soldier, takes
// days, and costs morale, so a party refits when the advantage is worth more
// than the bill and not otherwise. That is what stops every party on the map
// re-forming itself daily to chase a marginal difference in ground.
package template

import (
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the party-template system.
func System() sim.System {
	return sim.System{
		Name: "template",
		Doc:  "rebalances party composition between stance, heavy, light, and horse templates",
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
		// A party too small to be an army is not re-formed. Without this
		// floor every garrison and every stray band on the map would refit
		// with the ground it happens to be standing on.
		if p.Troops < c.Template.MinTroopsForTemplate {
			publish(v, w, pid, p, c)
			continue
		}
		// A caravan is a merchant's wagon train, not an army. Its guards are
		// escorts and it is not on the map to fight, so it keeps whatever
		// escort it was formed with.
		if p.IsCaravan {
			publish(v, w, pid, p, c)
			continue
		}

		terrain := terrainOf(v, p)
		mission := missionOf(p)
		culture := cultureOf(v, p)

		// The fit of every template on this ground, for this job, to this
		// culture's taste. The best one is what the party wants; whether it
		// can afford to want it is the question below.
		fits := make([]float64, model.TemplateCount)
		for tpl := 0; tpl < model.TemplateCount; tpl++ {
			fits[tpl] = c.Template.TerrainFit[terrain][tpl] * c.Template.MissionFit[mission][tpl]
		}
		best := bestTemplate(fits)
		want := shared.Clamp01(fits[best])

		read := shared.ReadString(
			shared.Pair("template", float64(p.Template)),
			shared.PairI("terrain", terrain),
			shared.PairI("mission", int(mission)),
			shared.PairI("culture", culture),
			shared.PairF("troops", p.Troops),
			shared.Pair("want_fit", want),
			shared.Pair("have_fit", p.TemplateFit),
		)
		causes := v.Log.RecentFor(model.KindParty, pid,
			[]string{"troops", "activity", "intended_action", "party_starving"}, 4)

		// Fit relaxes toward what the ground and the job actually want rather
		// than tracking it instantly, so a party crossing one bad stretch does
		// not tear itself apart over it.
		fit := shared.MoveToward(p.TemplateFit, want, c.Template.FitRelaxPerDay)
		w.Set(model.KindParty, pid, "template_fit", fit, read, causes, "")

		// Already refitting: pay for the days, count them down, and leave the
		// composition alone. A refit in progress is a commitment, which is
		// what gives the metal a cost and the decision a meaning.
		if p.RefitDays > 0 {
			w.Add(model.KindParty, pid, "refit_days", -1, read, causes, "refit under way")
			w.Add(model.KindParty, pid, "party_metal", -c.Template.RefitMetalPerDay,
				read, causes, "refit consumes metal")
			if p.RefitDays-1 > 0 {
				publish(v, w, pid, p, c)
				continue
			}
			w.Set(model.KindParty, pid, "party_template", float64(best),
				read, causes, "refit complete: new template")
			publish(v, w, pid, p, c)
			continue
		}

		// Not worth changing. Either the current template is already good for
		// this ground, or the best alternative is not better by enough to pay
		// for metal, days, and morale.
		if model.PartyTemplate(best) == p.Template ||
			fits[best] < fits[p.Template]+c.Template.FitSwitchThreshold {
			publish(v, w, pid, p, c)
			continue
		}

		cost := c.Template.RefitMetalPerTroop * p.Troops
		if p.Metal < cost {
			// A party that cannot pay for the refit stays as it is. This is
			// why a ruler's metal reserve is a military decision and not only a
			// purchasing one.
			publish(v, w, pid, p, c)
			continue
		}
		w.Add(model.KindParty, pid, "party_metal", -cost, read, causes, "metal spent on refit")
		w.Add(model.KindParty, pid, "morale", -c.Template.RefitMoraleHit*p.Troops,
			read, causes, "men drilled into a new formation")
		w.Set(model.KindParty, pid, "refit_days", c.Template.RefitDays,
			read, causes, "refit begun")
		publish(v, w, pid, p, c)
	}
}

// publish writes the four class counts implied by a party's current template,
// culture, and troop total.
//
// It runs every tick, including the tick before any template exists, because
// the class counts are a view of shared state rather than an event: attrition
// and a battle both change Troops, and neither knows troop classes exist. The
// counts are what the march and battle systems read, so they are republished
// rather than updated in place, which is why a casualty shows up in the mix
// without the systems that caused it naming a class.
func publish(v *sim.View, w *sim.WriteSet, pid int, p *model.Party, c *config.Config) {
	shares := compositionFor(c, p.Template, cultureOf(v, p))
	read := shared.ReadString(
		shared.Pair("template", float64(p.Template)),
		shared.PairI("culture", cultureOf(v, p)),
		shared.PairF("troops", p.Troops),
	)
	causes := v.Log.RecentFor(model.KindParty, pid, []string{"troops", "party_template"}, 2)
	for c_ := 0; c_ < model.ClassCount; c_++ {
		w.Set(model.KindParty, pid, classField(c_), p.Troops*shares[c_], read, causes, "")
	}
}

// compositionFor returns the normalised class shares for a template under a
// culture: the template's base composition bent by that culture's preference.
// Rows need not sum to one in the balance file, so the total is divided out
// here rather than every row in the file being required to add up, which would
// make tuning one row mean editing all four.
func compositionFor(c *config.Config, tpl model.PartyTemplate, culture int) [model.ClassCount]float64 {
	var out [model.ClassCount]float64
	total := 0.0
	for i := 0; i < model.ClassCount; i++ {
		v := c.Template.TemplateShare[tpl][i] * c.Template.CultureShare[culture][i]
		if v < 0 {
			v = 0
		}
		out[i] = v
		total += v
	}
	if total <= 0 {
		// The config validator rejects an all-zero row, so this cannot happen
		// with a loaded balance file. Guarding anyway keeps a NaN out of four
		// troop fields if a future table is ever added without a validator
		// entry, which is a far worse outcome than a party of no troops.
		return [model.ClassCount]float64{}
	}
	for i := range out {
		out[i] /= total
	}
	return out
}

// ClassCounts returns how many troops of each class a party of this size,
// template, and culture would field. It is the same arithmetic the publish
// step uses, exposed so the split system can seed a wing's composition
// without duplicating the table.
func ClassCounts(c *config.Config, tpl model.PartyTemplate, culture int, troops float64) [model.ClassCount]float64 {
	shares := compositionFor(c, tpl, culture)
	var out [model.ClassCount]float64
	for i := range shares {
		out[i] = troops * shares[i]
	}
	return out
}

// ClassField names the party field holding a class's troop count, so the
// publish step and anything that reads the counts agree on the names.
func ClassField(i int) string { return classField(i) }

func classField(i int) string {
	switch i {
	case int(model.ClassStance):
		return "troops_stance"
	case int(model.ClassHeavy):
		return "troops_heavy"
	case int(model.ClassLight):
		return "troops_light"
	default:
		return "troops_horse"
	}
}

// bestTemplate returns the index of the highest-scoring template. Ties go to
// the lower index, and the scan is in index order, so a party on ground where
// two templates suit it equally always picks the same one and a run is
// reproducible.
func bestTemplate(fits []float64) int {
	best, bestV := 0, fits[0]
	for i := 1; i < len(fits); i++ {
		if fits[i] > bestV {
			best, bestV = i, fits[i]
		}
	}
	return best
}

// terrainOf returns the terrain a party is operating on, which is the terrain
// of the road nearest it.
//
// This is the same nearest-route rule the march and attrition systems use, and
// it is repeated here rather than shared because a system may not import
// another (CONSTITUTION.md section 2.1). The three copies are deliberately
// identical: if they disagreed, a party would be marching over ground the
// template system did not think it was on.
func terrainOf(v *sim.View, p *model.Party) int {
	nearest := -1
	bestD := 0.0
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
		if nearest < 0 || d < bestD {
			nearest, bestD = rid, d
		}
	}
	if nearest < 0 {
		return model.TerrainPlain
	}
	return v.State.Routes[nearest].Terrain
}

// missionOf maps what a party is doing onto the coarse mission kinds a
// template table is written in. Activity has nine values but only a handful
// imply a different ideal composition, and nine rows of nearly identical
// numbers would be a table nobody could read.
func missionOf(p *model.Party) config.Mission {
	switch p.Activity {
	case model.ActSieging:
		return config.MissionSiege
	case model.ActTrading:
		return config.MissionEscort
	case model.ActPatrolling:
		return config.MissionScreen
	case model.ActDefending:
		return config.MissionGarrison
	case model.ActIdle:
		// An idle party at a town is holding it. Only a party with nowhere to
		// be and nothing to hold is in the field.
		if p.DestTown >= 0 {
			return config.MissionGarrison
		}
		return config.MissionField
	case model.ActRaiding:
		// Raiding is hit-and-run: fast troops get there, hit, and leave
		// before anything heavier can answer.
		return config.MissionScreen
	default:
		return config.MissionField
	}
}

// cultureOf returns a party's culture index, taken from its side. An
// unaffiliated party such as a raider band has no side and reads culture zero,
// which is the neutral row rather than a random one, so raider bands on a map
// with no culture of their own are at least consistent with each other.
func cultureOf(v *sim.View, p *model.Party) int {
	if p.SideID < 0 {
		return 0
	}
	s := v.State.Sides[p.SideID]
	if s == nil {
		return 0
	}
	if s.Culture < 0 || s.Culture >= model.CultureCount {
		return 0
	}
	return s.Culture
}

// Shape returns the template a party is actually made of, read from the class
// counts this system publishes rather than from the party_template field.
//
// The two can disagree, and when they do the class counts are the truth. A
// party part-way through a refit is counted as its old composition while
// party_template already names the new one, and a savegame loaded mid-refit
// restores counts and template independently. Anything that scores a party by
// what it is made of therefore has to ask this, and asking it here rather than
// in each reader is the point: the fallback for counts that were never
// published, and the mapping from a class back to the template that is mostly
// made of it, are both fiddly enough that two copies would drift.
//
// The mapping is derived from the balance table rather than assumed from the two
// enums happening to be in the same order. The dominant class of a party is
// found first, and then the template whose own composition is most of that
// class; if two templates tie, the lower index wins, which is the same
// tie-break bestTemplate uses and keeps the answer reproducible.
func Shape(v *sim.View, p *model.Party) model.PartyTemplate {
	d := dominantClass(p)
	if d < 0 {
		// No published counts at all: the very first tick of a run, or a party
		// this system has not reached because it is a caravan. The field is the
		// only evidence there is, bounds-checked because a corrupt value must
		// not turn into an index panic in a reader.
		if p.Template < 0 || int(p.Template) >= model.TemplateCount {
			return model.TplStance
		}
		return p.Template
	}
	culture := cultureOf(v, p)
	best, bestV := 0, -1.0
	for t := 0; t < model.TemplateCount; t++ {
		row := compositionFor(v.Cfg, model.PartyTemplate(t), culture)
		if row[d] > bestV {
			best, bestV = t, row[d]
		}
	}
	return model.PartyTemplate(best)
}

// dominantClass returns the class a party fields most of, or -1 when the
// published counts say it fields nothing at all.
func dominantClass(p *model.Party) int {
	best, bestV := -1, 0.0
	for i := 0; i < model.ClassCount; i++ {
		n := classCount(p, i)
		if n > bestV {
			best, bestV = i, n
		}
	}
	return best
}

// SpeedFactor returns how much slower a party's composition makes it than a
// party of the same size in the reference template, for the terrain it is on.
// The march system multiplies its speed by this, which is how a horse column
// and a stance column on the same road travel at different speeds without
// either system knowing what a template is.
func SpeedFactor(v *sim.View, p *model.Party) float64 {
	c := v.Cfg
	terrain := terrainOf(v, p)
	total := p.Troops
	if total <= 0 {
		return 1
	}
	// A weighted mean of the per-class speeds, which is what makes a mixed
	// column travel at something between its fastest and slowest members
	// rather than at either extreme.
	sum, weight := 0.0, 0.0
	for i := 0; i < model.ClassCount; i++ {
		n := classCount(p, i)
		if n <= 0 {
			continue
		}
		sum += n * c.Template.SpeedPerClass[i] * (1 - c.Template.TerrainSpeedPerClass[terrain][i])
		weight += n
	}
	if weight <= 0 {
		return 1
	}
	return sum / weight
}

// CombatFactor returns how much stronger or weaker a party's composition makes
// it, for the battle system to multiply into its strength. It is deliberately
// a separate function from the march's speed factor rather than one shared
// number: the same troops that make a column fast make it fragile, and
// collapsing the two into one figure would mean a party is always strongest
// where it is quickest, which is not how fighting works.
func CombatFactor(v *sim.View, p *model.Party) float64 {
	c := v.Cfg
	total := p.Troops
	if total <= 0 {
		return 1
	}
	sum, weight := 0.0, 0.0
	for i := 0; i < model.ClassCount; i++ {
		n := classCount(p, i)
		if n <= 0 {
			continue
		}
		sum += n * c.Template.CombatPerClass[i]
		weight += n
	}
	if weight <= 0 {
		return 1
	}
	return sum / weight
}

// WoundedRecovery returns the daily share of wounded that returns to duty for a
// party of this composition. A heavy infantryman takes longer to get back on
// his feet than a skirmisher, so a party's fighting strength is its present
// strength rather than its paper strength.
func WoundedRecovery(v *sim.View, p *model.Party) float64 {
	c := v.Cfg
	if p.Troops+p.Wounded <= 0 {
		return 0
	}
	sum, weight := 0.0, 0.0
	for i := 0; i < model.ClassCount; i++ {
		n := classCount(p, i)
		if n <= 0 {
			continue
		}
		sum += n * c.Template.WoundedRecoveryPerClass[i]
		weight += n
	}
	if weight <= 0 {
		return c.Attrition.WoundedRecoveryRate
	}
	return sum / weight
}

// classCount reads a party's troop count for one class from the published
// fields, falling back to the whole army when the class counts have not been
// published yet. The fallback matters on the very first tick of a run and for
// any party the template system has skipped: without it a party would read as
// four classes of zero troops and march at no speed at all.
func classCount(p *model.Party, i int) float64 {
	switch i {
	case int(model.ClassStance):
		return p.StanceTroops
	case int(model.ClassHeavy):
		return p.HeavyTroops
	case int(model.ClassLight):
		return p.LightTroops
	default:
		return p.HorseTroops
	}
}
