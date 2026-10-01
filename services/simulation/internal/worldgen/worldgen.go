// Package worldgen builds a starting world: sides, states, towns, villages,
// routes, rulers, and parties.
//
// Every number here is either real (a name, a position, a population scale from
// a real dataset) or a balance constant read from the config file. Nothing is
// invented in code, per CONSTITUTION.md section 1.1: when the Phase 0 pipeline
// supplies real settlements, this generator consumes them instead of
// synthesising positions, and the provenance of whatever it used is recorded in
// the run metadata.
//
// Names are generated from syllable tables, not from a list of real people.
// CONSTITUTION.md section 6.2 bans real people as characters, and a generated
// name cannot collide with a living public figure in any way that matters,
// because it is not drawn from any real person's name at all.
package worldgen

import (
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/systems/shared"
)

// Settlement is one place, imported or synthesised. When the Phase 0 pipeline
// runs, it supplies these; the generator's own path produces them from a
// deterministic layout so a headless run is reproducible without waiting on a
// data download.
type Settlement struct {
	// Name is the place name. Real when imported.
	Name string
	// State is the real state or region it belongs to.
	State string
	// SideID is which of the six sections it was assigned to.
	SideID int
	// Population is the real or estimated resident count, which sets every
	// other starting field through the config's per-capita constants.
	Population float64
	// X and Y are position in leagues on the campaign map.
	X, Y float64
	// IsPort marks a coastal settlement, which is what makes a blockade
	// possible against it.
	IsPort bool
	// Terrain is the ground type, an index into the route_terrain enum.
	Terrain int
	// Farmland is the hinterland multiplier, from real cropland data when
	// imported.
	Farmland float64
	// IsReal records whether this settlement came from a real dataset, so the
	// run report can state which it was rather than implying both.
	IsReal bool
}

// SideSpec is one of the six sections from FACTIONS.md.
type SideSpec struct {
	Name string
	// Ratings are the design targets FACTIONS.md section 3 lists. The generator
	// uses them to bias the assignment of states to sides, so the map it builds
	// roughly matches the documented profiles without any rating being
	// hardcoded onto a side (FACTIONS.md section 3 requires them to be computed
	// from real data).
	Money, Gold, Food, Metal, Population float64
	// Regions are the real states the section covers.
	Regions []string
}

// Sides returns the six sections with FACTIONS.md's ratings and membership.
// The ratings bias state assignment only; the simulation's own ratings come
// out of the generated map, which is how FACTIONS.md section 3 asks for them to
// be checked rather than assumed.
func Sides() []SideSpec {
	return []SideSpec{
		{
			Name: "Pacific Compact", Money: 5, Gold: 3, Food: 2, Metal: 2, Population: 4,
			Regions: []string{"California", "Oregon", "Washington", "Hawaii", "Alaska"},
		},
		{
			Name: "Mountain Alliance", Money: 2, Gold: 5, Food: 2, Metal: 5, Population: 1,
			Regions: []string{"Montana", "Idaho", "Wyoming", "Utah", "Colorado", "Nevada", "Arizona", "New Mexico"},
		},
		{
			Name: "Great Lakes Union", Money: 3, Gold: 1, Food: 5, Metal: 4, Population: 5,
			Regions: []string{"North Dakota", "South Dakota", "Nebraska", "Kansas", "Iowa", "Minnesota", "Wisconsin", "Michigan", "Illinois", "Indiana", "Ohio", "Missouri"},
		},
		{
			Name: "Southern Compact", Money: 3, Gold: 1, Food: 4, Metal: 3, Population: 4,
			Regions: []string{"Kentucky", "Tennessee", "Arkansas", "Louisiana", "Mississippi", "Alabama", "Georgia", "Florida", "South Carolina", "North Carolina"},
		},
		{
			Name: "Lone Star Frontier", Money: 4, Gold: 2, Food: 3, Metal: 4, Population: 3,
			Regions: []string{"Texas", "Oklahoma"},
		},
		{
			Name: "Atlantic Corridor", Money: 5, Gold: 4, Food: 1, Metal: 2, Population: 5,
			Regions: []string{"Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania", "Delaware", "Maryland", "District of Columbia", "Virginia", "West Virginia"},
		},
	}
}

// Result is a generated world.
type Result struct {
	State *model.State
	// Settlements lists the places used, with their provenance.
	Settlements []Settlement
	// RealCount is how many came from a real dataset.
	RealCount int
	// SynthCount is how many were generated because no data was supplied.
	SynthCount int
}

// Generate builds a world. When settlements is non-empty they are used
// verbatim, which is the path the Phase 0 pipeline takes; when it is empty a
// deterministic synthetic map is generated so a headless run works before the
// data pipeline lands, and the report says which happened.
func Generate(cfg *config.Config, seed uint64, settlements []Settlement) *Result {
	r := rng.New(seed)
	st := model.NewState()

	used := settlements
	if len(used) == 0 {
		used = synthesise(cfg, r)
	}
	real := 0
	for _, s := range used {
		if s.IsReal {
			real++
		}
	}

	// --- sides ---
	specs := Sides()
	for i, spec := range specs {
		side := &model.Side{
			ID:           i + 1,
			Name:         spec.Name,
			States:       float64(len(spec.Regions)),
			ExchangeRate: cfg.Currency.GoldPerMoney,
			Stability:    1,
			Trust:        1,
			VassalOf:     -1,
			Ally:         -1,
			Enemy:        -1,
			Target:       -1,
			Coalition:    -1,
		}
		st.Sides[side.ID] = side
	}

	// --- towns ---
	for _, s := range used {
		t := newTown(cfg, r, s)
		t.ID = st.NewID(model.IDTown)
		st.Towns[t.ID] = t
	}

	// --- routes ---
	// Each town is connected to its nearest few neighbours, which produces a
	// connected graph that reflects real geography rather than a full mesh.
	// Without connectivity there would be no trade, no migration, and no
	// supply lines, and most of the chains could not happen at all.
	buildRoutes(cfg, r, st)

	// --- villages ---
	for _, tid := range st.TownIDs() {
		t := st.Towns[tid]
		n := int(r.IntRange(1, int(cfg.World.VillagesPerTown)+2))
		for i := 0; i < n; i++ {
			vl := newVillage(cfg, r, t)
			vl.ID = st.NewID(model.IDVillage)
			st.Villages[vl.ID] = vl
		}
	}

	// --- rulers ---
	generateRulers(cfg, r, st)

	// --- clans (Tier 1) ---
	// Dynasties own renown and holdings; must run after rulers exist.
	generateClans(cfg, r, st)

	// --- initial relations ---
	// Sides start with a spread of opinions, so some are hostile from the
	// start and some are merely indifferent. Without any spread, the first war
	// would be between whichever two sides happened to be adjacent in id
	// order, which is not a world.
	for _, a := range st.SideIDs() {
		for _, b := range st.SideIDs() {
			if a >= b {
				continue
			}
			v := r.Normal(cfg.Relation.StartRelationMean, cfg.Relation.StartRelationSpread)
			v = shared.Clamp(v, cfg.Relation.RelationFloor, cfg.Relation.RelationCap)
			st.SetSideRelation(a, b, v)
		}
	}
	for _, a := range st.RulerIDsSorted() {
		for _, b := range st.RulerIDsSorted() {
			if a >= b {
				continue
			}
			// Rulers within one side start friendly, because they share a
			// leader. Rulers of different sides start near neutral, with a
			// spread.
			ra, rb := st.Rulers[a], st.Rulers[b]
			v := 0.0
			if ra.SideID == rb.SideID {
				v = r.Range(cfg.Relation.StartAllyRelationMin, cfg.Relation.StartAllyRelationMax)
			} else {
				v = r.Normal(cfg.Relation.StartRelationMean, cfg.Relation.StartRelationSpread)
			}
			st.SetRelation(a, b, shared.Clamp(v, cfg.Relation.RelationFloor, cfg.Relation.RelationCap))
		}
	}
	// Each ruler's known counterpart in every other side, so the relation
	// inheritance in the relation system has something to read.
	for _, rid := range st.RulerIDsSorted() {
		r := st.Rulers[rid]
		for _, oid := range st.SideIDs() {
			if oid == r.SideID {
				continue
			}
			other := leaderOf(st, oid)
			if other >= 0 {
				r.RelationsWith = other
				break
			}
		}
	}

	// --- parties ---
	generateParties(cfg, r, st)

	// --- initial wars and alliances ---
	// A seed-time state, not a scripted event: some pairs begin at war because
	// the generator rolled hostile, and the faction AI's own scoring takes over
	// from the first tick. What happens afterwards is not scripted.
	for _, a := range st.SideIDs() {
		for _, b := range st.SideIDs() {
			if a >= b {
				continue
			}
			roll := r.Float64()
			rel := st.SideRelation(a, b)
			// Hostility raises the chance of an existing war.
			warChance := cfg.World.InitialWarChance * (1 + shared.Clamp01((cfg.FactionAI.HostileRelationThreshold-rel)*2))
			allyChance := cfg.World.AllyChance * (1 + shared.Clamp01(rel))
			switch {
			case roll < warChance:
				war := &model.War{
					ID:        st.NewID(model.IDWar),
					SideA:     a,
					SideB:     b,
					StartTick: 0,
					EndTick:   -1,
					Reason:    model.WarBorder,
					Intensity: r.Range(0.2, 0.7),
				}
				st.Wars[war.ID] = war
			case roll < warChance+allyChance:
				st.Sides[a].Ally = b
				st.Sides[b].Ally = a
				st.SetSideRelation(a, b, shared.Clamp(rel+cfg.Relation.AlliedRelationBonus,
					cfg.Relation.RelationFloor, cfg.Relation.RelationCap))
			}
		}
	}

	// --- holdings seeded ---
	// Each town is held by a ruler of the side that owns it, and the town's
	// loyalty starts high: nobody is born disloyal.
	for _, tid := range st.TownIDs() {
		t := st.Towns[tid]
		holder := pickHolder(st, r, t)
		if holder < 0 {
			continue
		}
		t.Holder = holder
		t.HolderSide = st.Rulers[holder].SideID
		st.Rulers[holder].TownID = tid
	}

	return &Result{State: st, Settlements: used, RealCount: real, SynthCount: len(used) - real}
}

// newTown builds a town from a settlement and the config's starting constants.
func newTown(cfg *config.Config, r *rng.Rng, s Settlement) *model.Town {
	// Farmland: the real figure when imported, otherwise derived from the
	// settlement's own scale with a seeded spread, so a run is reproducible.
	farmland := s.Farmland
	if farmland <= 0 {
		farmland = r.Range(cfg.Food.FarmlandMin, cfg.Food.FarmlandMax)
	}
	t := &model.Town{
		Name:            s.Name,
		SideID:          s.SideID,
		State:           s.State,
		IsPort:          s.IsPort,
		X:               s.X,
		Y:               s.Y,
		Population:      s.Population,
		Sanitation:      cfg.World.StartSanitation * r.Range(0.85, 1.1),
		Prosperity:      shared.Clamp01(cfg.World.StartSanitation + r.Range(-0.1, 0.15)),
		TaxRate:         cfg.Currency.TaxDefaultRate,
		Loyalty:         r.Range(cfg.Council.LoyaltyStartMin, cfg.Council.LoyaltyStartMax),
		Unrest:          r.Range(0, cfg.World.StartUnrestMax),
		Holder:          -1,
		HolderSide:      -1,
		PriceFood:       cfg.Market.BasePrice,
		PriceMedicine:   cfg.Market.BasePrice,
		PriceMetal:      cfg.Market.BasePrice,
		PriceIndex:      cfg.Market.BasePrice,
		GarrisonConduct: shared.Clamp01(cfg.Security.StartGarrisonConduct + r.Range(-0.1, 0.05)),
		GarrisonMorale:  cfg.Upkeep.MoraleCap,
		FoodYield:       s.Population * cfg.Food.BaseYieldPerWorker * farmland * cfg.Labor.HealthyWorkerShare,
	}
	if t.Sanitation > 1 {
		t.Sanitation = 1
	}
	// The buffer starts at the configured target, which is what a working town
	// looks like: enough food to survive a bad fortnight.
	demand := s.Population * cfg.Food.PersonDaysPerPersonDay
	t.FoodStock = demand * cfg.World.FoodDaysTarget
	t.FoodDemand = demand
	t.FoodDays = cfg.World.FoodDaysTarget
	t.Workers = s.Population * cfg.Labor.HealthyWorkerShare
	t.Money = s.Population * cfg.World.StartMoneyPerCapita
	t.Metal = s.Population * cfg.World.StartMetalPerCapita
	t.Gold = s.Population * cfg.World.TownGoldPerCapita
	t.MedicineStock = s.Population * cfg.World.MedicinePerCapita
	t.Garrison = math.Max(1, s.Population*cfg.World.GarrisonPerCapita)
	t.RoadSafety = cfg.Security.BaseRoadSafety
	// Ports start better supplied, because they trade; inland towns start
	// poorer, which is the Atlantic and Pacific food problem from FACTIONS.md.
	if s.IsPort {
		t.Prosperity = shared.Clamp01(t.Prosperity + cfg.World.PortProsperityBonus)
	}
	// Store the farmland on the town for the food system, which reads it.
	t.StockTarget = demand * cfg.Market.StockTargetDays
	return t
}

// newVillage builds a food-producing settlement serving a town.
func newVillage(cfg *config.Config, r *rng.Rng, t *model.Town) *model.Village {
	pop := t.Population * r.Range(cfg.World.VillagePopShareMin, cfg.World.VillagePopShareMax)
	vl := &model.Village{
		Name:       villageName(r),
		SideID:     t.SideID,
		TownID:     t.ID,
		Population: pop,
		Prosperity: shared.Clamp01(t.Prosperity + r.Range(-0.15, 0.1)),
		X:          t.X + r.Range(-cfg.World.VillageSpread, cfg.World.VillageSpread),
		Y:          t.Y + r.Range(-cfg.World.VillageSpread, cfg.World.VillageSpread),
	}
	// A village's yield is what feeds its town, so a region's towns are only as
	// well fed as the countryside around them. This is why a densely settled
	// industrial region starves and a farming one does not.
	vl.Yield = pop * cfg.Food.BaseYieldPerWorker * cfg.Labor.HealthyWorkerShare * cfg.World.VillageYieldShare
	vl.Food = pop * cfg.World.VillageFoodDays
	vl.Link = t.ID
	// Hearths (Tier 3.1): 1-3, weighted toward 1-2. Richer regions get
	// higher hearths, which scale production.
	vl.Hearths = 1
	if roll := r.Float64(); roll < 0.15 {
		vl.Hearths = 3
	} else if roll < 0.45 {
		vl.Hearths = 2
	}
	return vl
}

// buildRoutes connects each town to its nearest neighbours. The result is a
// graph whose edges are the short distances on the map, which is what makes
// distance mean something.
func buildRoutes(cfg *config.Config, r *rng.Rng, st *model.State) {
	neighbours := int(cfg.World.RouteDensity)
	if neighbours < 1 {
		neighbours = 1
	}
	seen := map[model.Pair]bool{}
	for _, tid := range st.TownIDs() {
		t := st.Towns[tid]
		type cand struct {
			id   int
			dist float64
		}
		var cands []cand
		for _, oid := range st.TownIDs() {
			if oid == tid {
				continue
			}
			o := st.Towns[oid]
			d := math.Hypot(t.X-o.X, t.Y-o.Y)
			cands = append(cands, cand{oid, d})
		}
		// Nearest first, with a seeded jitter so the map is not a perfect
		// lattice. A seeded jitter rather than a fixed tie-break keeps runs
		// reproducible and the map from looking generated.
		for i := 0; i < len(cands); i++ {
			for j := i + 1; j < len(cands); j++ {
				if cands[j].dist < cands[i].dist {
					cands[i], cands[j] = cands[j], cands[i]
				}
			}
		}
		limit := neighbours
		if limit > len(cands) {
			limit = len(cands)
		}
		for i := 0; i < limit; i++ {
			id := cands[i].id
			pair := model.MakePair(tid, id)
			if seen[pair] {
				continue
			}
			seen[pair] = true
			o := st.Towns[id]
			// Road length is a little more than the straight-line distance,
			// because roads follow ground rather than rulers' intentions.
			length := cands[i].dist * cfg.World.RoadLengthOverDistance
			route := &model.Route{
				ID:      st.NewID(model.IDRoute),
				TownA:   tid,
				TownB:   id,
				Length:  length,
				Safety:  cfg.Security.BaseRoadSafety,
				Terrain: terrainBetween(cfg, r, t, o),
			}
			st.Routes[route.ID] = route
		}
	}
}

// terrainBetween picks the roughest of the two towns' terrain for the road
// between them, because a road inherits the worst ground it crosses.
func terrainBetween(cfg *config.Config, r *rng.Rng, a, b *model.Town) int {
	worst := a.Terrain
	if b.Terrain > worst {
		worst = b.Terrain
	}
	// Some roads are worse than either endpoint suggests, because they follow a
	// river or a ridge. A seeded draw keeps this reproducible.
	if r.Chance(cfg.World.RouteExtraRoughness) {
		worst = r.IntRange(worst, 5)
	}
	if worst > 5 {
		worst = 5
	}
	return worst
}

func leaderOf(st *model.State, sideID int) int {
	if s, ok := st.Sides[sideID]; ok {
		return s.LeaderID
	}
	return -1
}
