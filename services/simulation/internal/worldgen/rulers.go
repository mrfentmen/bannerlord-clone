package worldgen

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/systems/shared"
)

// synth builds a deterministic synthetic map for when no imported settlements
// are available.
//
// It is a real map, not a fixture: towns are placed by a jittered lattice
// scaled to the real extent of the country, states are assigned to the six
// sections by their real geography, and populations are drawn from a size
// distribution rather than being uniform. What it is not is real data, and the
// run report says so, because a headless balance run on synthetic geography
// measures the systems rather than the map. When the Phase 0 pipeline lands,
// Generate is called with imported settlements and this path is not used.
func synthesise(cfg *config.Config, r *rng.Rng) []Settlement {
	specs := Sides()
	// The real extent of the contiguous states, in leagues. Roughly the real
	// span, so distances on the map are of a realistic order and a march across
	// a section takes a plausible number of days.
	const width = 2900.0
	const height = 1700.0

	targetTowns := int(r.IntRange(int(cfg.World.MinTowns), int(cfg.World.MaxTowns)+1))

	var out []Settlement
	// States are placed in a jittered lattice; each gets a share of the towns
	// proportional to its side's population rating, which is the only thing
	// that makes the map resemble FACTIONS.md's profiles.
	weights := make([]float64, len(specs))
	total := 0.0
	for i, s := range specs {
		weights[i] = s.Population
		total += s.Population
	}

	remaining := targetTowns
	for si, spec := range specs {
		share := int(math.Round(float64(targetTowns) * weights[si] / total))
		if si == len(specs)-1 {
			share = remaining
		}
		if share < 2 {
			share = 2
		}
		remaining -= share
		if remaining < 0 {
			share += remaining
			remaining = 0
		}

		// A section's states occupy a contiguous band of the map, so a side
		// has a coherent territory with neighbours on some sides and sea on
		// others. That is what gives the strategic layer something to reason
		// about.
		bandX := (float64(si) / float64(len(specs))) * width
		bandW := width / float64(len(specs))

		cols := int(math.Ceil(math.Sqrt(float64(share) * 1.4)))
		rows := int(math.Ceil(float64(share) / math.Max(1.0, float64(cols))))
		placed := 0
		for ry := 0; ry < rows && placed < share; ry++ {
			for cx := 0; cx < cols && placed < share; cx++ {
				// Jittered lattice: each cell's centre plus a seeded offset, so
				// towns do not sit on a visible grid.
				cellW := bandW / float64(cols)
				cellH := height / float64(rows)
				x := bandX + (float64(cx)+0.5)*cellW + r.Range(-cellW*0.35, cellW*0.35)
				y := (float64(ry)+0.5)*cellH + r.Range(-cellH*0.35, cellH*0.35)
				if x < 0 {
					x = 0
				}
				if x > width {
					x = width
				}
				if y < 0 {
					y = 0
				}
				if y > height {
					y = height
				}

				// Size distribution: most places are small, a few are large.
				// A power law is the right shape for settlement sizes and it
				// matters for balance, because a few big cities are what a
				// side's strength is actually made of.
				u := r.Float64()
				pop := cfg.World.SmallTownPopulation +
					(cfg.World.LargeTownPopulation-cfg.World.SmallTownPopulation)*math.Pow(u, cfg.World.SizeExponent)
				pop = float64(int(pop/100.0)) * 100

				state := spec.Regions[r.Intn(len(spec.Regions))]
				terrain := terrainFor(cfg, r, pop, x, y, width, height)
				out = append(out, Settlement{
					Name:       settlementName(r, state, pop),
					State:      state,
					SideID:     si + 1,
					Population: pop,
					X:          x,
					Y:          y,
					IsPort:     isCoastal(x, y, width, height) && r.Chance(cfg.World.PortFraction*cfg.World.CoastalPortBoost),
					Terrain:    terrain,
					// Farmland: rural places feed themselves, dense ones do
					// not. Derived from size and position, so the food map
					// resembles the real one without any of it being invented.
					Farmland: 0,
					IsReal:   false,
				})
				placed++
			}
		}
	}
	// Farmland is assigned after placement so a settlement's hinterland can
	// depend on how crowded its region is.
	assignFarmland(cfg, r, out)
	return out
}

// isCoastal reports whether a position is on the edge of the map, which is
// where the sea is. The map's edges stand in for the coasts, so a port is a
// place a blockade can reach.
func isCoastal(x, y, width, height float64) bool {
	margin := width * 0.06
	return x < margin || x > width-margin || y < margin*height/width || y > height-margin*height/width
}

// terrainFor picks ground type from position and size, so the interior of a
// large, high-population region is not all mountains and the edges are not all
// plains. The mapping is coarse, and the real terrain comes from a DEM when
// the pipeline supplies it.
func terrainFor(cfg *config.Config, r *rng.Rng, pop, x, y, width, height float64) int {
	// A west-to-east gradient standing in for the real one: the far west is
	// wet and mountainous, the middle is plains, the east is wooded and flat.
	rel := x / width
	draw := r.Float64()
	switch {
	case rel < 0.18 && draw < 0.55:
		return model.TerrainForest
	case rel < 0.18:
		return model.TerrainHills
	case rel < 0.30 && draw < 0.30:
		return model.TerrainMountain
	case rel < 0.55:
		if draw < 0.12 {
			return model.TerrainSwamp
		}
		return model.TerrainPlain
	case rel < 0.78:
		if draw < 0.35 {
			return model.TerrainForest
		}
		return model.TerrainHills
	default:
		if draw < 0.2 {
			return model.TerrainHills
		}
		return model.TerrainPlain
	}
}

// assignFarmland gives each settlement a hinterland multiplier, lower where
// population is dense. This is the food geography: an industrial region with
// large towns and little countryside cannot feed itself, which is exactly the
// Pacific and Atlantic problem from FACTIONS.md.
func assignFarmland(cfg *config.Config, r *rng.Rng, s []Settlement) {
	if len(s) == 0 {
		return
	}
	// Local density: how much population sits near each settlement.
	for i := range s {
		near := 0.0
		for j := range s {
			d := math.Hypot(s[i].X-s[j].X, s[i].Y-s[j].Y)
			if d < cfg.World.FarmlandNeighbourLeagues {
				near += s[j].Population
			}
		}
		// Crowding reduces the hinterland each person has to farm.
		pressure := shared.Clamp01(near / (s[i].Population * cfg.World.FarmlandDensityScale))
		farm := cfg.Food.FarmlandMax * (1 - pressure*cfg.World.FarmlandCrowdingPenalty)
		farm = shared.Clamp(farm*r.Range(0.9, 1.1), cfg.Food.FarmlandMin, cfg.Food.FarmlandMax)
		s[i].Farmland = farm
	}
}

// pickHolder chooses which ruler holds a town, preferring a ruler already
// nearby, so a map does not end up with every town owned by the same distant
// warlord.
func pickHolder(st *model.State, r *rng.Rng, t *model.Town) int {
	best, bestScore := -1, 0.0
	for _, rid := range st.RulerIDsSorted() {
		ru := st.Rulers[rid]
		if ru.SideID != t.SideID {
			continue
		}
		// A ruler who already holds a town keeps it, rather than being moved
		// around each tick.
		if ru.TownID >= 0 {
			continue
		}
		home := st.Towns[ru.TownID]
		d := 0.0
		if home != nil {
			d = math.Hypot(home.X-t.X, home.Y-t.Y)
		} else {
			// A landless candidate is scored by influence instead, since they
			// have no base to be near.
			d = cfgDist(ru.Influence)
		}
		score := 1 / (1 + d/cfgDistUnit(r))
		if score > bestScore {
			bestScore, best = score, rid
		}
	}
	if best < 0 {
		// Fall back to any ruler of that side, so no town is ever unowned.
		for _, rid := range st.RulerIDsSorted() {
			if st.Rulers[rid].SideID == t.SideID {
				best = rid
				break
			}
		}
	}
	return best
}

func cfgDist(influence float64) float64 { return 400 / (1 + influence) }

func cfgDistUnit(r *rng.Rng) float64 { return 120 + r.Float64()*200 }

// generateRulers builds the roster: one leader per side, then governors, lords,
// warlords, and mercenary captains, in the tier counts RULERS.md section 2
// describes.
func generateRulers(cfg *config.Config, r *rng.Rng, st *model.State) {
	target := int(r.IntRange(int(cfg.World.MinRulers), int(cfg.World.MaxRulers)+1))
	specs := Sides()
	towns := st.TownIDs()

	// --- side leaders ---
	for i, spec := range specs {
		ru := newRuler(cfg, r, "leader", i+1, spec.Name)
		ru.ID = st.NewID(model.IDRuler)
		ru.Leader = true
		ru.Tier = tierLeader
		ru.Ambition = model.AmbitionWealth
		ru.LoyaltyToLeader = 1
		ru.Influence = cfg.Influence.LeaderInfluence
		ru.Renown = cfg.Influence.LeaderRenown
		// A leader's traits set the character of the whole side, so a
		// mercantile side is led by someone mercantile. This is how a
		// personality propagates through a faction without being hardcoded.
		ru.Traits.Generosity = shared.Clamp01(0.5 + (spec.Money-spec.Food)*0.08)
		ru.Traits.Calculation = shared.Clamp01(0.4 + spec.Gold*0.1)
		ru.Traits.Mercy = shared.Clamp01(0.4 + spec.Population*0.06)
		ru.Traits.Valor = shared.Clamp01(0.35 + (spec.Metal-spec.Gold)*0.08)
		ru.Traits.Honor = shared.Clamp01(0.45 + spec.Money*0.05)
		st.Rulers[ru.ID] = ru
		st.Sides[i+1].LeaderID = ru.ID
		// New presidents start in the capital with a fresh election clock.
		st.Sides[i+1].PresidentInDC = true
		st.Sides[i+1].LastElectionTick = 0
		st.Sides[i+1].PresidentTerms = 1
		// A side's treasury scales with its money and gold ratings, which is
		// what makes a rich side able to buy mercenaries and a poor one unable
		// to (chain 7's premise).
		st.Sides[i+1].Treasury = cfg.World.SideTreasuryBase * spec.Money * spec.Money
		st.Sides[i+1].Gold = cfg.World.SideGoldBase * spec.Gold * spec.Gold
		st.Sides[i+1].Metal = cfg.World.SideMetalBase * spec.Metal
		st.Sides[i+1].Food = cfg.World.SideFoodBase * spec.Food
	}

	// --- everyone else ---
	roleWeights := []float64{cfg.World.GovernorShare, cfg.World.LordShare, cfg.World.WarlordFraction, cfg.World.MercenaryFraction}
	created := 0
	for created < target-len(specs) {
		role := weightedRole(r, roleWeights)
		sideID := r.Intn(len(specs)) + 1
		ru := newRuler(cfg, r, role, sideID, specs[sideID-1].Name)
		ru.ID = st.NewID(model.IDRuler)
		switch role {
		case "governor":
			ru.Tier = tierGovernor
			ru.Ambition = model.AmbitionLand
		case "lord":
			ru.Tier = tierLord
			// Half the lords want land, half want money. The split matters:
			// a side full of land-ambitious rulers is always at war, and one
			// full of wealth-ambitious rulers is always trading.
			if r.Intn(2) == 0 {
				ru.Ambition = model.AmbitionLand
			} else {
				ru.Ambition = model.AmbitionWealth
			}
		case "warlord":
			ru.Tier = tierWarlord
			ru.Ambition = model.AmbitionLand
		case "merc":
			ru.Tier = tierMercenary
			ru.IsMercenary = true
			ru.Ambition = model.AmbitionWealth
			// A mercenary captain has influence but no loyalty and no land,
			// which is what makes them purchasable.
			ru.LoyaltyToLeader = 0
		}
		// Most rulers start loyal to their leader; a minority do not, and those
		// are the ones who defect first. Starting everyone at 1 would mean no
		// side ever loses anyone.
		ru.LoyaltyToLeader = r.Range(cfg.Loyalty.StartLoyaltyMin, cfg.Loyalty.StartLoyaltyMax)
		st.Rulers[ru.ID] = ru
		// A landholding ruler is placed at a town of their own side. Multiple
		// rulers can share a town, which is realistic and gives the council
		// something to be.
		if !ru.IsMercenary && len(towns) > 0 {
			t := towns[r.Intn(len(towns))]
			if st.Towns[t].SideID == sideID {
				ru.TownID = t
			}
		}
		created++
	}

	// A ruler with no town and no mercenary status is made an officer, so the
	// council always has a candidate who is not already aggrieved about
	// ownership.
	for _, rid := range st.RulerIDsSorted() {
		ru := st.Rulers[rid]
		if ru.TownID < 0 && !ru.IsMercenary && !ru.Leader {
			ru.Officer = true
			if len(towns) > 0 {
				// Based in a town of their own side, for a position.
				for i := 0; i < 8 && len(towns) > 0; i++ {
					t := towns[r.Intn(len(towns))]
					if st.Towns[t].SideID == ru.SideID {
						ru.TownID = t
						break
					}
				}
			}
		}
	}

	// Pick a VP for each side: highest influence+renown living ruler who is
	// not the president. The line of succession starts here.
	for _, sid := range st.SideIDs() {
		side := st.Sides[sid]
		var best *model.Ruler
		bestScore := -1.0
		for _, rid := range st.RulerIDsSorted() {
			ru := st.Rulers[rid]
			if ru.SideID != sid || !ru.IsAlive || ru.ID == side.LeaderID {
				continue
			}
			if s := ru.Influence + ru.Renown; s > bestScore {
				bestScore, best = s, ru
			}
		}
		if best != nil {
			side.VicePresidentID = best.ID
		}
	}
}

// weightedRole picks a ruler role by weight.
func weightedRole(r *rng.Rng, weights []float64) string {
	total := 0.0
	for _, w := range weights {
		total += w
	}
	if total <= 0 {
		return "lord"
	}
	roll := r.Float64() * total
	names := []string{"governor", "lord", "warlord", "merc"}
	for i, w := range weights {
		roll -= w
		if roll <= 0 {
			return names[i]
		}
	}
	return "lord"
}

// newRuler builds a ruler with traits drawn from a spread, and a name from
// generated syllables.
func newRuler(cfg *config.Config, r *rng.Rng, role string, sideID int, sideName string) *model.Ruler {
	traits := model.Traits{
		Valor:       trait(r, cfg.World.RulerTraitSpread),
		Mercy:       trait(r, cfg.World.RulerTraitSpread),
		Honor:       trait(r, cfg.World.RulerTraitSpread),
		Generosity:  trait(r, cfg.World.RulerTraitSpread),
		Calculation: trait(r, cfg.World.RulerTraitSpread),
	}
	ru := &model.Ruler{
		Name:          rulerName(r, sideName),
		SideID:        sideID,
		Age:           r.Range(cfg.Ruler.AgeMin, cfg.Ruler.AgeMax),
		Traits:        traits,
		IsAlive:       true,
		CapturedBy:    -1,
		RelationsWith: -1,
		TownID:        -1,
		PartyID:       -1,
	}
	// Influence and renown come from the role and from traits: a capable,
	// ambitious ruler starts with standing, which is how a realm has a power
	// structure rather than fifty equal lords.
	base := cfg.Ruler.BaseInfluence + cfg.Ruler.InfluencePerTier*float64(tierFor(role))
	ru.Influence = base * (0.5 + (traits.Calculation+traits.Valor)/2)
	ru.Renown = base * cfg.Ruler.RenownFromInfluence * (0.4 + traits.Valor)
	ru.Gold = cfg.World.StartGoldPerRuler * r.Range(0.3, 2.2)
	ru.Money = cfg.Ruler.StartMoney * r.Range(0.4, 2.0)
	return ru
}

func tierFor(role string) int {
	switch role {
	case "leader":
		return tierLeader
	case "governor":
		return tierGovernor
	case "warlord":
		return tierWarlord
	case "merc":
		return tierMercenary
	default:
		return tierLord
	}
}

// trait draws a trait value, centred slightly above neutral because a ruler who
// is average on everything is not interesting to generate.
func trait(r *rng.Rng, spread float64) float64 {
	return shared.Clamp01(0.5 + r.Normal(0, spread))
}

// generateParties gives every ruler with land a war party, sized by influence
// and renown (MARCH_AND_WAR.md section 8), and gives a few rulers a caravan.
func generateParties(cfg *config.Config, r *rng.Rng, st *model.State) {
	for _, rid := range st.RulerIDsSorted() {
		ru := st.Rulers[rid]
		if ru.Leader {
			continue
		}
		var x, y float64
		if ru.TownID >= 0 {
			if t := st.Towns[ru.TownID]; t != nil {
				x, y = t.X, t.Y
			}
		}
		// Not every ruler keeps a party: a poor minor lord is a name on a
		// holding rather than a force in the field, and having most of them
		// fielded would make the map much more militarised than it should be.
		keepParty := r.Chance(cfg.Ruler.PartyKeepChance)
		if !keepParty && !ru.IsMercenary {
			continue
		}
		troops := cfg.World.PartyTroopsBase + ru.Influence*cfg.World.PartyTroopsPerInfluence
		troops *= r.Range(0.6, 1.4)
		troops = math.Max(cfg.World.MinPartyTroops, troops)
		// The cap is what stops a high-influence ruler from fielding an army
		// the size of a side.
		maxTroops := cfg.Ruler.MaxPartyTroopsBase + ru.Renown*cfg.Ruler.MaxPartyTroopsPerRenown
		if troops > maxTroops {
			troops = maxTroops
		}
		p := &model.Party{
			Name:           ru.Name + "'s company",
			SideID:         ru.SideID,
			RulerID:        ru.ID,
			X:              x,
			Y:              y,
			DestX:          x,
			DestY:          y,
			Troops:         troops,
			Food:           troops * cfg.March.FoodPerTroop * cfg.World.StartPartyFoodDays,
			Money:          ru.Money * cfg.Ruler.PartyMoneyShare,
			Gold:           ru.Gold * cfg.Ruler.PartyGoldShare,
			Metal:          troops * cfg.World.PartyMetalPerTroop,
			Medicine:       troops * cfg.World.PartyMedicinePerTroop,
			Morale:         r.Range(cfg.Upkeep.MoraleCap*0.6, cfg.Upkeep.MoraleCap),
			Fatigue:        0,
			Activity:       model.ActIdle,
			Intention:      model.IntentNone,
			HomeTown:       ru.TownID,
			DestTown:       ru.TownID,
			DestRuler:      -1,
			DestTownParty:  -1,
			SupplyDistance: 0,
			IsMercenary:    ru.IsMercenary,
		}
		p.ID = st.NewID(model.IDParty)
		st.Parties[p.ID] = p
		ru.PartyID = p.ID

		// A mercenary captain also runs a supply caravan, because that is how
		// they earn between contracts, and it means they are present on the
		// roads even when unemployed.
		if ru.IsMercenary && r.Chance(cfg.Ruler.MercenaryCaravanChance) {
			cp := &model.Party{
				Name:          ru.Name + "'s caravan",
				SideID:        ru.SideID,
				RulerID:       ru.ID,
				Troops:        cfg.Logistic.CaravanGuards,
				IsCaravan:     true,
				Activity:      model.ActTrading,
				Morale:        0.8,
				HomeTown:      ru.TownID,
				DestTown:      -1,
				DestTownParty: -1,
				Food:          cfg.Logistic.CaravanFoodNeed * cfg.Logistic.CaravanFoodDays,
			}
			cp.ID = st.NewID(model.IDParty)
			st.Parties[cp.ID] = cp
		}
	}

	// A few independent raider bands, which are the standing threat on unsafe
	// roads even when nobody is at war.
	raiderCount := int(r.Range(cfg.World.MinRaiderBands, cfg.World.MaxRaiderBands))
	townIDs := st.TownIDs()
	for i := 0; i < raiderCount; i++ {
		t := st.Towns[townIDs[r.Intn(len(townIDs))]]
		p := &model.Party{
			Name:          "Raiders",
			SideID:        -1,
			RulerID:       -1,
			X:             t.X + r.Range(-60, 60),
			Y:             t.Y + r.Range(-60, 60),
			DestX:         t.X,
			DestY:         t.Y,
			Troops:        r.Range(cfg.Security.RaiderBandMin, cfg.Security.RaiderBandMin*3),
			Food:          cfg.Security.RaiderBandMin * cfg.March.FoodPerTroop * 8,
			Morale:        0.6,
			Activity:      model.ActIdle,
			IsRaider:      true,
			HomeTown:      -1,
			DestTown:      t.ID,
			DestTownParty: -1,
		}
		p.ID = st.NewID(model.IDParty)
		st.Parties[p.ID] = p
	}
}

// Tiers from RULERS.md section 2.
const (
	tierLeader    = 0
	tierGovernor  = 1
	tierLord      = 2
	tierWarlord   = 3
	tierMercenary = 4
)

var _ = fmt.Sprintf
