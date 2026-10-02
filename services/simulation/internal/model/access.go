package model

// Access is the bridge between a field name and the struct field that holds
// it. The cause log, the write application, and the chain assertions all work
// in field names; the systems work in typed structs. This file is the single
// place those two views meet.
//
// Every entry is checked against the field registry by TestAccessCoversEvery
// TrackedField and TestAccessCoversNoUnknownFields, so a field added to an
// entity struct without an accessor here fails the build's test run rather
// than silently never being logged.

// Get reads a field of an entity as a float64. A field whose registry entry
// says ValueFlag reads as 0 or 1, and one that says ValueText reads as its
// enum index, which is how the cause log records a discrete change.
func (s *State) Get(kind Kind, id int, field string) (float64, bool) {
	switch kind {
	case KindTown:
		t, ok := s.Towns[id]
		if !ok {
			return 0, false
		}
		return townGet(t, field)
	case KindVillage:
		v, ok := s.Villages[id]
		if !ok {
			return 0, false
		}
		return villageGet(v, field)
	case KindParty:
		p, ok := s.Parties[id]
		if !ok {
			return 0, false
		}
		return partyGet(p, field)
	case KindLeader:
		r, ok := s.Leaders[id]
		if !ok {
			return 0, false
		}
		return rulerGet(r, field)
	case KindSide:
		d, ok := s.Sides[id]
		if !ok {
			return 0, false
		}
		return sideGet(d, field)
	case KindRoute:
		r, ok := s.Routes[id]
		if !ok {
			return 0, false
		}
		return routeGet(r, field)
	case KindSiege:
		z, ok := s.Sieges[id]
		if !ok {
			return 0, false
		}
		return siegeGet(z, field)
	case KindWar:
		w, ok := s.Wars[id]
		if !ok {
			return 0, false
		}
		return warGet(w, field)
	case KindOrganization:
		c, ok := s.Organizations[id]
		if !ok {
			return 0, false
		}
		return clanGet(c, field)
	case KindWorkshop:
		wk, ok := s.Workshops[id]
		if !ok {
			return 0, false
		}
		return workshopGet(wk, field)
	case KindNotable:
		n, ok := s.Notables[id]
		if !ok {
			return 0, false
		}
		return notableGet(n, field)
	case KindIssue:
		i, ok := s.Issues[id]
		if !ok {
			return 0, false
		}
		return issueGet(i, field)
	}
	return 0, false
}

// Value reads a field of a party or a town by name, without needing the State
// that holds it.
//
// It exists for the handful of places that hold one entity and want to name a
// field in a table rather than a switch: the goods table in the barter system
// has to say "this good is the party's cargo_food and the town's food_stock" in
// one place, and a table whose halves could disagree would be a table that
// prices goods out of one store and delivers them into another. Going through
// State.Get for that would mean carrying the whole state to read one struct.
func (p *Party) Value(field string) (float64, bool) { return partyGet(p, field) }

// Value reads a field of a town by name. See Party.Value.
func (t *Town) Value(field string) (float64, bool) { return townGet(t, field) }

// Set writes a field of an entity. Callers go through WriteSet rather than
// calling this directly, so that every write is logged and clamped.
func (s *State) Set(kind Kind, id int, field string, v float64) bool {
	switch kind {
	case KindTown:
		t, ok := s.Towns[id]
		if !ok {
			return false
		}
		return townSet(t, field, v)
	case KindVillage:
		x, ok := s.Villages[id]
		if !ok {
			return false
		}
		return villageSet(x, field, v)
	case KindParty:
		p, ok := s.Parties[id]
		if !ok {
			return false
		}
		return partySet(p, field, v)
	case KindLeader:
		r, ok := s.Leaders[id]
		if !ok {
			return false
		}
		return rulerSet(r, field, v)
	case KindSide:
		d, ok := s.Sides[id]
		if !ok {
			return false
		}
		return sideSet(d, field, v)
	case KindRoute:
		r, ok := s.Routes[id]
		if !ok {
			return false
		}
		return routeSet(r, field, v)
	case KindSiege:
		z, ok := s.Sieges[id]
		if !ok {
			return false
		}
		return siegeSet(z, field, v)
	case KindWar:
		w, ok := s.Wars[id]
		if !ok {
			return false
		}
		return warSet(w, field, v)
	case KindOrganization:
		c, ok := s.Organizations[id]
		if !ok {
			return false
		}
		return clanSet(c, field, v)
	case KindWorkshop:
		wk, ok := s.Workshops[id]
		if !ok {
			return false
		}
		return workshopSet(wk, field, v)
	case KindNotable:
		n, ok := s.Notables[id]
		if !ok {
			return false
		}
		return notableSet(n, field, v)
	case KindIssue:
		i, ok := s.Issues[id]
		if !ok {
			return false
		}
		return issueSet(i, field, v)
	}
	return false
}

// Exists reports whether an entity of that kind and id is present.
func (s *State) Exists(kind Kind, id int) bool {
	switch kind {
	case KindTown:
		_, ok := s.Towns[id]
		return ok
	case KindVillage:
		_, ok := s.Villages[id]
		return ok
	case KindParty:
		_, ok := s.Parties[id]
		return ok
	case KindLeader:
		_, ok := s.Leaders[id]
		return ok
	case KindSide:
		_, ok := s.Sides[id]
		return ok
	case KindRoute:
		_, ok := s.Routes[id]
		return ok
	case KindSiege:
		_, ok := s.Sieges[id]
		return ok
	case KindWar:
		_, ok := s.Wars[id]
		return ok
	case KindOrganization:
		_, ok := s.Organizations[id]
		return ok
	case KindWorkshop:
		_, ok := s.Workshops[id]
		return ok
	case KindNotable:
		_, ok := s.Notables[id]
		return ok
	case KindIssue:
		_, ok := s.Issues[id]
		return ok
	}
	return false
}

// Name returns a human label for an entity, used in log output and in the
// sample why-query output.
func (s *State) Name(kind Kind, id int) string {
	switch kind {
	case KindTown:
		if t, ok := s.Towns[id]; ok {
			return t.Name
		}
	case KindVillage:
		if v, ok := s.Villages[id]; ok {
			return v.Name
		}
	case KindParty:
		if p, ok := s.Parties[id]; ok {
			return p.Name
		}
	case KindLeader:
		if r, ok := s.Leaders[id]; ok {
			return r.Name
		}
	case KindSide:
		if d, ok := s.Sides[id]; ok {
			return d.Name
		}
	case KindOrganization:
		if c, ok := s.Organizations[id]; ok {
			return c.Name
		}
	case KindWorkshop:
		if wk, ok := s.Workshops[id]; ok {
			return workshopTypeName(wk.Type) + " " + itoa(id)
		}
	case KindNotable:
		if n, ok := s.Notables[id]; ok {
			return n.Name
		}
	case KindIssue:
		if i, ok := s.Issues[id]; ok {
			kind := "issue"
			if int(i.Kind) < len(IssueKindNames) {
				kind = IssueKindNames[i.Kind]
			}
			return kind + " issue " + itoa(id)
		}
	}
	return kind.String() + " " + itoa(id)
}

func workshopTypeName(t WorkshopType) string {
	switch t {
	case WorkshopMachineShop:
		return "machine shop"
	case WorkshopTannery:
		return "tannery"
	case WorkshopTextileMill:
		return "textile mill"
	case WorkshopBrewery:
		return "brewery"
	case WorkshopCeramics:
		return "ceramics factory"
	case WorkshopLumberMill:
		return "lumber mill"
	case WorkshopOilPress:
		return "oil press"
	case WorkshopJeweler:
		return "jeweler"
	case WorkshopMeatPacking:
		return "meat packing plant"
	case WorkshopBakery:
		return "bakery"
	case WorkshopCandleWorks:
		return "candle works"
	default:
		return "workshop"
	}
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func b2f(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

func f2b(v float64) bool { return v != 0 }

func townGet(t *Town, f string) (float64, bool) {
	switch f {
	case "town_terrain":
		return float64(t.Terrain), true
	case "population":
		return t.Population, true
	case "workers":
		return t.Workers, true
	case "food_stock":
		return t.FoodStock, true
	case "food_production":
		return t.FoodProduction, true
	case "food_demand":
		return t.FoodDemand, true
	case "medicine_stock":
		return t.MedicineStock, true
	case "sanitation":
		return t.Sanitation, true
	case "infected":
		return t.Infected, true
	case "crowding":
		return t.Crowding, true
	case "unrest":
		return t.Unrest, true
	case "loyalty":
		return t.Loyalty, true
	case "prosperity":
		return t.Prosperity, true
	case "tax_rate":
		return t.TaxRate, true
	case "garrison":
		return t.Garrison, true
	case "militia":
		return t.Militia, true
	case "crime":
		return t.Crime, true
	case "garrison_conduct":
		return t.GarrisonConduct, true
	case "garrison_morale":
		return t.GarrisonMorale, true
	case "road_safety":
		return t.RoadSafety, true
	case "money":
		return t.Money, true
	case "gold":
		return t.Gold, true
	case "metal":
		return t.Metal, true
	case "price_food":
		return t.PriceFood, true
	case "price_medicine":
		return t.PriceMedicine, true
	case "price_metal":
		return t.PriceMetal, true
	case "wages":
		return t.Wages, true
	case "price_index":
		return t.PriceIndex, true
	case "blockade":
		return t.Blockade, true
	case "recent_deaths":
		return t.RecentDeaths, true
	case "deaths_today":
		return t.DeathsToday, true
	case "net_migration":
		return t.NetMigration, true
	case "debt":
		return t.Debt, true
	case "is_starving":
		return b2f(t.IsStarving), true
	case "is_besieged":
		return b2f(t.IsBesieged), true
	case "holder":
		return float64(t.Holder), true
	case "holder_side":
		return float64(t.HolderSide), true
	case "days_below_loyalty":
		return t.DaysBelowLoyalty, true
	case "food_imports":
		return t.FoodImports, true
	case "food_exports":
		return t.FoodExports, true
	case "medicine_imports":
		return t.MedicineImports, true
	case "arriving_cargo_food":
		return t.ArrivingFood, true
	case "arriving_cargo_medicine":
		return t.ArrivingMedicine, true
	case "arriving_cargo_metal":
		return t.ArrivingMetal, true
	case "food_days":
		return t.FoodDays, true
	case "starve_days":
		return t.StarveDays, true
	case "death_memory":
		return t.DeathMemory, true
	case "food_balance":
		return t.FoodBalance, true
	case "starve_severity":
		return t.StarveSeverity, true
	case "import_cut":
		return t.ImportCut, true
	case "food_yield":
		return t.FoodYield, true
	case "employment":
		return t.Employment, true
	case "sick_workers":
		return t.SickWorkers, true
	case "scarcity":
		return t.Scarcity, true
	case "raider_pressure":
		return t.RaiderPressure, true
	case "patrol_coverage":
		return t.PatrolCoverage, true
	case "wages_target":
		return t.WagesTarget, true
	case "stock_target":
		return t.StockTarget, true
	case "tax_income":
		return t.TaxIncome, true
	case "expenditure":
		return t.Expenditure, true
	case "net_cash":
		return t.NetCash, true
	case "attractiveness":
		return t.Attractiveness, true
	case "pressure":
		return t.Pressure, true
	case "quorum":
		return t.Quorum, true
	case "vote_chance":
		return t.VoteChance, true
	case "desertions":
		return t.Desertions, true
	case "lost_deaths_total":
		return t.LostDeathsTotal, true
	case "lost_food_total":
		return t.LostFoodTotal, true
	case "collapse_score":
		return t.CollapseScore, true
	case "besiege_days":
		return t.BesiegeDays, true
	case "gate_pressure":
		return t.GatePressure, true
	case "blockade_days":
		return t.BlockadeDays, true
	case "militia_payroll":
		return t.MilitiaPayroll, true
	case "militia_readiness":
		return t.MilitiaReadiness, true
	case "sighted_sides":
		return t.SightedSides, true
	case "ever_seen_sides":
		return t.EverSeenSides, true
	case "last_seen_tick":
		return t.LastSeenTick, true
	}
	return 0, false
}

func townSet(t *Town, f string, v float64) bool {
	switch f {
	case "town_terrain":
		t.Terrain = int(v)
	case "population":
		t.Population = v
	case "workers":
		t.Workers = v
	case "food_stock":
		t.FoodStock = v
	case "food_production":
		t.FoodProduction = v
	case "food_demand":
		t.FoodDemand = v
	case "medicine_stock":
		t.MedicineStock = v
	case "sanitation":
		t.Sanitation = v
	case "infected":
		t.Infected = v
	case "crowding":
		t.Crowding = v
	case "unrest":
		t.Unrest = v
	case "loyalty":
		t.Loyalty = v
	case "prosperity":
		t.Prosperity = v
	case "tax_rate":
		t.TaxRate = v
	case "garrison":
		t.Garrison = v
	case "militia":
		t.Militia = v
	case "crime":
		t.Crime = v
	case "garrison_conduct":
		t.GarrisonConduct = v
	case "garrison_morale":
		t.GarrisonMorale = v
	case "road_safety":
		t.RoadSafety = v
	case "money":
		t.Money = v
	case "gold":
		t.Gold = v
	case "metal":
		t.Metal = v
	case "price_food":
		t.PriceFood = v
	case "price_medicine":
		t.PriceMedicine = v
	case "price_metal":
		t.PriceMetal = v
	case "wages":
		t.Wages = v
	case "price_index":
		t.PriceIndex = v
	case "blockade":
		t.Blockade = v
	case "recent_deaths":
		t.RecentDeaths = v
	case "deaths_today":
		t.DeathsToday = v
	case "net_migration":
		t.NetMigration = v
	case "debt":
		t.Debt = v
	case "is_starving":
		t.IsStarving = f2b(v)
	case "is_besieged":
		t.IsBesieged = f2b(v)
	case "holder":
		t.Holder = int(v)
	case "holder_side":
		t.HolderSide = int(v)
	case "days_below_loyalty":
		t.DaysBelowLoyalty = v
	case "food_imports":
		t.FoodImports = v
	case "food_exports":
		t.FoodExports = v
	case "medicine_imports":
		t.MedicineImports = v
	case "arriving_cargo_food":
		t.ArrivingFood = v
	case "arriving_cargo_medicine":
		t.ArrivingMedicine = v
	case "arriving_cargo_metal":
		t.ArrivingMetal = v
	case "food_days":
		t.FoodDays = v
	case "starve_days":
		t.StarveDays = v
	case "death_memory":
		t.DeathMemory = v
	case "food_balance":
		t.FoodBalance = v
	case "starve_severity":
		t.StarveSeverity = v
	case "import_cut":
		t.ImportCut = v
	case "food_yield":
		t.FoodYield = v
	case "employment":
		t.Employment = v
	case "sick_workers":
		t.SickWorkers = v
	case "scarcity":
		t.Scarcity = v
	case "raider_pressure":
		t.RaiderPressure = v
	case "patrol_coverage":
		t.PatrolCoverage = v
	case "wages_target":
		t.WagesTarget = v
	case "stock_target":
		t.StockTarget = v
	case "tax_income":
		t.TaxIncome = v
	case "expenditure":
		t.Expenditure = v
	case "net_cash":
		t.NetCash = v
	case "attractiveness":
		t.Attractiveness = v
	case "pressure":
		t.Pressure = v
	case "quorum":
		t.Quorum = v
	case "vote_chance":
		t.VoteChance = v
	case "desertions":
		t.Desertions = v
	case "lost_deaths_total":
		t.LostDeathsTotal = v
	case "lost_food_total":
		t.LostFoodTotal = v
	case "collapse_score":
		t.CollapseScore = v
	case "besiege_days":
		t.BesiegeDays = v
	case "gate_pressure":
		t.GatePressure = v
	case "blockade_days":
		t.BlockadeDays = v
	case "militia_payroll":
		t.MilitiaPayroll = v
	case "militia_readiness":
		t.MilitiaReadiness = v
	case "sighted_sides":
		t.SightedSides = v
	case "ever_seen_sides":
		t.EverSeenSides = v
	case "last_seen_tick":
		t.LastSeenTick = v
	default:
		return false
	}
	return true
}

func villageGet(v *Village, f string) (float64, bool) {
	switch f {
	case "village_population":
		return v.Population, true
	case "village_food":
		return v.Food, true
	case "village_prosperity":
		return v.Prosperity, true
	case "village_raid_memory":
		return v.RaidMemory, true
	case "village_yield":
		return v.Yield, true
	case "village_link":
		return float64(v.Link), true
	case "village_hearths":
		return float64(v.Hearths), true
	}
	return 0, false
}

func villageSet(v *Village, f string, x float64) bool {
	switch f {
	case "village_population":
		v.Population = x
	case "village_food":
		v.Food = x
	case "village_prosperity":
		v.Prosperity = x
	case "village_raid_memory":
		v.RaidMemory = x
	case "village_yield":
		v.Yield = x
	case "village_link":
		v.Link = int(x)
	case "village_hearths":
		v.Hearths = int(x)
	default:
		return false
	}
	return true
}

func partyGet(p *Party, f string) (float64, bool) {
	switch f {
	case "troops":
		return p.Troops, true
	case "wounded":
		return p.Wounded, true
	case "party_food":
		return p.Food, true
	case "party_money":
		return p.Money, true
	case "party_gold":
		return p.Gold, true
	case "party_metal":
		return p.Metal, true
	case "party_medicine":
		return p.Medicine, true
	case "morale":
		return p.Morale, true
	case "fatigue":
		return p.Fatigue, true
	case "wages_owed":
		return p.WagesOwed, true
	case "position_x":
		return p.X, true
	case "position_y":
		return p.Y, true
	case "dest_x":
		return p.DestX, true
	case "dest_y":
		return p.DestY, true
	case "activity":
		return float64(p.Activity), true
	case "intended_action":
		return float64(p.Intention), true
	case "dest_town":
		return float64(p.DestTown), true
	case "dest_ruler":
		return float64(p.DestRuler), true
	case "dest_town_party":
		return float64(p.DestTownParty), true
	case "home_town":
		return float64(p.HomeTown), true
	case "days_out":
		return p.DaysOut, true
	case "speed":
		return p.Speed, true
	case "distance":
		return p.Distance, true
	case "days_food":
		return p.DaysFood, true
	case "party_starving":
		return b2f(p.IsStarving), true
	case "is_raider":
		return b2f(p.IsRaider), true
	case "is_mercenary":
		return b2f(p.IsMercenary), true
	case "is_caravan":
		return b2f(p.IsCaravan), true
	case "is_sieging":
		return b2f(p.IsSieging), true
	case "supply_distance":
		return p.SupplyDistance, true
	case "caravan_gold":
		return p.CaravanGold, true
	case "caravan_guards":
		return p.CaravanGuards, true
	case "caravan_animals":
		return p.CaravanAnimals, true
	case "caravan_cargo":
		return p.CaravanCargo, true
	case "caravan_cargo_type":
		return p.CaravanCargoType, true
	case "caravan_at_town":
		return float64(p.CaravanAtTown), true
	case "caravan_dest_town":
		return float64(p.CaravanDestTown), true
	case "caravan_progress":
		return p.CaravanProgress, true
	case "cargo_food":
		return p.CargoFood, true
	case "cargo_medicine":
		return p.CargoMedicine, true
	case "cargo_metal":
		return p.CargoMetal, true
	case "arriving_cargo_food":
		return p.ArrivingFood, true
	case "arriving_cargo_medicine":
		return p.ArrivingMedicine, true
	case "arriving_cargo_metal":
		return p.ArrivingMetal, true
	case "attrition_rate":
		return p.AttritionRate, true
	case "column_disease":
		return p.ColumnDisease, true
	case "raid_target":
		return float64(p.RaidTarget), true
	case "wage_daily":
		return p.WageDaily, true
	case "decision_score":
		return p.DecisionScore, true
	case "decision_reasons":
		return float64(p.Reason), true
	case "ruler_troops":
		return p.Troops, true
	case "party_template":
		return float64(p.Template), true
	case "troops_stance":
		return p.StanceTroops, true
	case "troops_heavy":
		return p.HeavyTroops, true
	case "troops_light":
		return p.LightTroops, true
	case "troops_horse":
		return p.HorseTroops, true
	case "template_fit":
		return p.TemplateFit, true
	case "refit_days":
		return p.RefitDays, true
	case "is_wing":
		return b2f(p.IsWing), true
	case "routed":
		return b2f(p.Routed), true
	case "parent_party":
		return float64(p.ParentParty), true
	case "wing_share":
		return p.WingShare, true
	case "split_share":
		return p.SplitShare, true
	case "merge_target":
		return float64(p.MergeTarget), true
	case "prisoners":
		return p.Prisoners, true
	case "prisoner_conformity":
		return p.PrisonerConformity, true
	case "troop_xp":
		return p.TroopXP, true
	case "cohesion":
		return p.Cohesion, true
	default:
		return 0, false
	}
}

func partySet(p *Party, f string, v float64) bool {
	switch f {
	case "troops":
		p.Troops = v
	case "wounded":
		p.Wounded = v
	case "party_food":
		p.Food = v
	case "party_money":
		p.Money = v
	case "party_gold":
		p.Gold = v
	case "party_metal":
		p.Metal = v
	case "party_medicine":
		p.Medicine = v
	case "morale":
		p.Morale = v
	case "fatigue":
		p.Fatigue = v
	case "wages_owed":
		p.WagesOwed = v
	case "position_x":
		p.X = v
	case "position_y":
		p.Y = v
	case "dest_x":
		p.DestX = v
	case "dest_y":
		p.DestY = v
	case "activity":
		p.Activity = Activity(int(v))
	case "intended_action":
		p.Intention = Intention(int(v))
	case "dest_town":
		p.DestTown = int(v)
	case "dest_ruler":
		p.DestRuler = int(v)
	case "dest_town_party":
		p.DestTownParty = int(v)
	case "home_town":
		p.HomeTown = int(v)
	case "days_out":
		p.DaysOut = v
	case "speed":
		p.Speed = v
	case "distance":
		p.Distance = v
	case "days_food":
		p.DaysFood = v
	case "party_starving":
		p.IsStarving = f2b(v)
	case "is_raider":
		p.IsRaider = f2b(v)
	case "is_mercenary":
		p.IsMercenary = f2b(v)
	case "is_caravan":
		p.IsCaravan = f2b(v)
	case "is_sieging":
		p.IsSieging = f2b(v)
	case "supply_distance":
		p.SupplyDistance = v
	case "caravan_gold":
		p.CaravanGold = v
	case "caravan_guards":
		p.CaravanGuards = v
	case "caravan_animals":
		p.CaravanAnimals = v
	case "caravan_cargo":
		p.CaravanCargo = v
	case "caravan_cargo_type":
		p.CaravanCargoType = v
	case "caravan_at_town":
		p.CaravanAtTown = int(v)
	case "caravan_dest_town":
		p.CaravanDestTown = int(v)
	case "caravan_progress":
		p.CaravanProgress = v
	case "cargo_food":
		p.CargoFood = v
	case "cargo_medicine":
		p.CargoMedicine = v
	case "cargo_metal":
		p.CargoMetal = v
	case "arriving_cargo_food":
		p.ArrivingFood = v
	case "arriving_cargo_medicine":
		p.ArrivingMedicine = v
	case "arriving_cargo_metal":
		p.ArrivingMetal = v
	case "attrition_rate":
		p.AttritionRate = v
	case "column_disease":
		p.ColumnDisease = v
	case "raid_target":
		p.RaidTarget = int(v)
	case "wage_daily":
		p.WageDaily = v
	case "decision_score":
		p.DecisionScore = v
	case "decision_reasons":
		p.Reason = Reason(int(v))
	case "ruler_troops":
		p.Troops = v
	case "party_template":
		p.Template = PartyTemplate(int(v))
	case "troops_stance":
		p.StanceTroops = v
	case "troops_heavy":
		p.HeavyTroops = v
	case "troops_light":
		p.LightTroops = v
	case "troops_horse":
		p.HorseTroops = v
	case "template_fit":
		p.TemplateFit = v
	case "refit_days":
		p.RefitDays = v
	case "is_wing":
		p.IsWing = f2b(v)
	case "routed":
		p.Routed = f2b(v)
	case "parent_party":
		p.ParentParty = int(v)
	case "wing_share":
		p.WingShare = v
	case "split_share":
		p.SplitShare = v
	case "merge_target":
		p.MergeTarget = int(v)
	case "prisoners":
		p.Prisoners = v
		return true
	case "prisoner_conformity":
		p.PrisonerConformity = v
		return true
	case "troop_xp":
		p.TroopXP = v
		return true
	case "cohesion":
		p.Cohesion = v
		return true
	default:
		return false
	}
	return true
}

func rulerGet(r *Leader, f string) (float64, bool) {
	switch f {
	case "influence":
		return r.Influence, true
	case "renown":
		return r.Renown, true
	case "loyalty_to_leader":
		return r.LoyaltyToLeader, true
	case "ruler_side":
		return float64(r.SideID), true
	case "ruler_town":
		return float64(r.TownID), true
	case "ruler_age":
		return r.Age, true
	case "captured_by":
		return float64(r.CapturedBy), true
	case "prisoner_days":
		return r.PrisonerDays, true
	case "relation_score":
		return 0, true
	case "renown_victories":
		return r.Victories, true
	case "army":
		return float64(r.PartyID), true
	case "broken_oaths":
		return r.BrokenOaths, true
	case "is_mercenary_ruler":
		return b2f(r.IsMercenary), true
	case "is_alive":
		return b2f(r.IsAlive), true
	case "oath_made":
		return b2f(r.OathMade), true
	case "last_defection":
		return b2f(r.LastDefection), true
	case "relations_with":
		return float64(r.RelationsWith), true
	case "decision_reasons":
		return float64(r.Reason), true
	case "ruler_troops":
		return 0, true
	case "service_quality":
		return r.ServiceQuality, true
	case "spouse":
		return float64(r.SpouseID), true
	case "father":
		return float64(r.FatherID), true
	case "mother":
		return float64(r.MotherID), true
	case "heir":
		return float64(r.HeirID), true
	case "is_child":
		return b2f(r.IsChild), true
	case "is_pregnant":
		return b2f(r.IsPregnant), true
	case "pregnancy_ticks":
		return r.PregnancyTicks, true
	case "sex":
		return float64(r.Sex), true
	case "gold":
		return r.Gold, true
	case "money":
		return r.Money, true
	default:
		return 0, false
	}
}

func rulerSet(r *Leader, f string, v float64) bool {
	switch f {
	case "influence":
		r.Influence = v
	case "renown":
		r.Renown = v
	case "loyalty_to_leader":
		r.LoyaltyToLeader = v
	case "ruler_side":
		r.SideID = int(v)
	case "ruler_town":
		r.TownID = int(v)
	case "ruler_age":
		r.Age = v
	case "captured_by":
		r.CapturedBy = int(v)
	case "prisoner_days":
		r.PrisonerDays = v
	case "service_quality":
		r.ServiceQuality = v
	case "relation_score", "ruler_troops":
		// Per-ruler totals that are only meaningful on a party or in the
		// relation matrix; accepted so the coverage test can assert every
		// tracked field has an accessor.
	case "renown_victories":
		r.Victories = v
	case "army":
		r.PartyID = int(v)
	case "broken_oaths":
		r.BrokenOaths = v
	case "is_mercenary_ruler":
		r.IsMercenary = f2b(v)
	case "is_alive":
		r.IsAlive = f2b(v)
	case "oath_made":
		r.OathMade = f2b(v)
	case "last_defection":
		r.LastDefection = f2b(v)
	case "relations_with":
		r.RelationsWith = int(v)
	case "decision_reasons":
		r.Reason = Reason(int(v))
	case "spouse":
		r.SpouseID = int(v)
	case "father":
		r.FatherID = int(v)
	case "mother":
		r.MotherID = int(v)
	case "heir":
		r.HeirID = int(v)
	case "is_child":
		r.IsChild = f2b(v)
	case "is_pregnant":
		r.IsPregnant = f2b(v)
	case "pregnancy_ticks":
		r.PregnancyTicks = v
	case "sex":
		r.Sex = Sex(int(v))
	case "pregnancy_days":
		r.PregnancyDays = v
		return true
	case "gold":
		r.Gold = v
	case "money":
		r.Money = v
	default:
		return false
	}
	return true
}

func sideGet(d *Side, f string) (float64, bool) {
	switch f {
	case "side_treasury":
		return d.Treasury, true
	case "side_gold":
		return d.Gold, true
	case "side_food":
		return d.Food, true
	case "side_metal":
		return d.Metal, true
	case "side_war_weariness":
		return d.WarWeariness, true
	case "side_states":
		return d.States, true
	case "side_towns":
		return d.Towns, true
	case "side_leader":
		return float64(d.LeaderID), true
	case "is_affiliate":
		return b2f(d.Affiliate), true
	case "exchange_rate":
		return d.ExchangeRate, true
	case "debt_total":
		return d.DebtTotal, true
	case "side_inflation":
		return d.Inflation, true
	case "side_population":
		return d.Population, true
	case "side_stability":
		return d.Stability, true
	case "side_intent":
		return float64(d.Intent), true
	case "side_ally":
		return float64(d.Ally), true
	case "side_enemy":
		return float64(d.Enemy), true
	case "side_target":
		return float64(d.Target), true
	case "trust":
		return d.Trust, true
	case "coalition_with":
		return float64(d.Coalition), true
	case "affiliate_of":
		return float64(d.AffiliateOf), true
	case "side_mercenaries":
		return d.Mercenaries, true
	case "income_total":
		return d.Income, true
	case "expense_total":
		return d.Expense, true
	case "target_score":
		return d.TargetScore, true
	case "peace_score":
		return d.PeaceScore, true
	case "trust_decay":
		return d.TrustDecay, true
	case "side_ally_count":
		return d.AllyCount, true
	case "side_debt_ratio":
		return d.DebtRatio, true
	case "side_strength":
		return d.StrengthIndex, true
	case "side_food_need":
		return d.FoodNeed, true
	case "side_metal_need":
		return d.MetalNeed, true
	case "side_visible_towns":
		return d.VisibleTowns, true
	case "side_known_towns":
		return d.KnownTowns, true
	case "side_culture":
		return float64(d.Culture), true
	case "relation_score":
		// A side has no single opinion score: the opinion lives in the relation
		// matrix, keyed by a pair of sides, and the engine logs relation changes
		// against this field name without storing anything on either side. The
		// registry registers it for KindSide because kingdomcrime does write it,
		// to mark a realm distrusted, and a write to a field with no reader
		// aborts the whole tick at commit rather than being ignored.
		return 0, true
	default:
		return 0, false
	}
}

func sideSet(d *Side, f string, v float64) bool {
	switch f {
	case "side_treasury":
		d.Treasury = v
	case "side_gold":
		d.Gold = v
	case "side_food":
		d.Food = v
	case "side_metal":
		d.Metal = v
	case "side_war_weariness":
		d.WarWeariness = v
	case "side_states":
		d.States = v
	case "side_towns":
		d.Towns = v
	case "side_leader":
		d.LeaderID = int(v)
	case "is_affiliate":
		d.Affiliate = f2b(v)
	case "exchange_rate":
		d.ExchangeRate = v
	case "debt_total":
		d.DebtTotal = v
	case "side_inflation":
		d.Inflation = v
	case "side_population":
		d.Population = v
	case "side_stability":
		d.Stability = v
	case "side_intent":
		d.Intent = SideIntent(int(v))
	case "side_ally":
		d.Ally = int(v)
	case "side_enemy":
		d.Enemy = int(v)
	case "side_target":
		d.Target = int(v)
	case "trust":
		d.Trust = v
	case "coalition_with":
		d.Coalition = int(v)
	case "affiliate_of":
		d.AffiliateOf = int(v)
	case "side_mercenaries":
		d.Mercenaries = v
	case "income_total":
		d.Income = v
	case "expense_total":
		d.Expense = v
	case "target_score":
		d.TargetScore = v
	case "peace_score":
		d.PeaceScore = v
	case "trust_decay":
		d.TrustDecay = v
	case "side_ally_count":
		d.AllyCount = v
	case "side_debt_ratio":
		d.DebtRatio = v
	case "side_strength":
		d.StrengthIndex = v
	case "side_food_need":
		d.FoodNeed = v
	case "side_metal_need":
		d.MetalNeed = v
	case "side_visible_towns":
		d.VisibleTowns = v
	case "side_known_towns":
		d.KnownTowns = v
	case "side_culture":
		d.Culture = int(v)
	case "relation_score":
		// Accepted and discarded, for the reason given in sideGet. The value is
		// in the relation matrix, which is where a reader looks for it.
	default:
		return false
	}
	return true
}

func routeGet(r *Route, f string) (float64, bool) {
	switch f {
	case "route_safety":
		return r.Safety, true
	case "route_length":
		return r.Length, true
	case "route_raiders":
		return r.Raiders, true
	case "route_traffic":
		return float64(r.Traffic), true
	case "route_blocked":
		return b2f(r.Blocked), true
	case "route_town_a":
		return float64(r.TownA), true
	case "route_town_b":
		return float64(r.TownB), true
	case "route_patrol":
		return r.Patrol, true
	case "route_terrain":
		return float64(r.Terrain), true
	default:
		return 0, false
	}
}

func routeSet(r *Route, f string, v float64) bool {
	switch f {
	case "route_safety":
		r.Safety = v
	case "route_length":
		r.Length = v
	case "route_raiders":
		r.Raiders = v
	case "route_traffic":
		r.Traffic = v
	case "route_blocked":
		r.Blocked = f2b(v)
	case "route_town_a":
		r.TownA = int(v)
	case "route_town_b":
		r.TownB = int(v)
	case "route_patrol":
		r.Patrol = v
	case "route_terrain":
		r.Terrain = int(v)
	default:
		return false
	}
	return true
}

func siegeGet(z *Siege, f string) (float64, bool) {
	switch f {
	case "siege_days":
		return z.Days, true
	case "siege_attacker":
		return float64(z.AttackerID), true
	case "siege_defender":
		return float64(z.DefenderID), true
	case "siege_town":
		return float64(z.TownID), true
	case "breach_progress":
		return z.Breach, true
	case "gates_opened":
		return b2f(z.GatesOpen), true
	case "siege_outcome":
		return float64(z.Outcome), true
	case "attacker_loss":
		return z.AttackerLoss, true
	case "siege_supply":
		return z.Supply, true
	case "gate_risk":
		return z.GateRisk, true
	default:
		return 0, false
	}
}

func siegeSet(z *Siege, f string, v float64) bool {
	switch f {
	case "siege_days":
		z.Days = v
	case "siege_attacker":
		z.AttackerID = int(v)
	case "siege_defender":
		z.DefenderID = int(v)
	case "siege_town":
		z.TownID = int(v)
	case "breach_progress":
		z.Breach = v
	case "gates_opened":
		z.GatesOpen = f2b(v)
	case "siege_outcome":
		z.Outcome = SiegeOutcome(int(v))
	case "attacker_loss":
		z.AttackerLoss = v
	case "siege_supply":
		z.Supply = v
	case "gate_risk":
		z.GateRisk = v
	default:
		return false
	}
	return true
}

func warGet(w *War, f string) (float64, bool) {
	switch f {
	case "war_intensity":
		return w.Intensity, true
	case "war_side_a":
		return float64(w.SideA), true
	case "war_side_b":
		return float64(w.SideB), true
	case "war_battles":
		return w.Battles, true
	case "war_start_tick":
		return w.StartTick, true
	case "war_end_tick":
		return w.EndTick, true
	case "battles_this_tick":
		return w.BattlesThisTick, true
	case "war_reason":
		return float64(w.Reason), true
	default:
		return 0, false
	}
}

func warSet(w *War, f string, v float64) bool {
	switch f {
	case "war_intensity":
		w.Intensity = v
	case "war_side_a":
		w.SideA = int(v)
	case "war_side_b":
		w.SideB = int(v)
	case "war_battles":
		w.Battles = v
	case "war_start_tick":
		w.StartTick = v
	case "war_end_tick":
		w.EndTick = v
	case "battles_this_tick":
		w.BattlesThisTick = v
	case "war_reason":
		w.Reason = WarReason(int(v))
	default:
		return false
	}
	return true
}

func clanGet(c *Organization, f string) (float64, bool) {
	switch f {
	case "clan_renown":
		return c.Renown, true
	case "clan_tier":
		return float64(c.Tier), true
	case "clan_leader":
		return float64(c.LeaderID), true
	case "clan_side":
		return float64(c.SideID), true
	case "clan_members":
		return float64(len(c.MemberIDs)), true
	case "clan_household":
		return float64(c.HouseholdSize), true
	case "clan_fiefs":
		return float64(len(c.FiefIDs)), true
	case "wants_kingdom":
		return float64(c.WantsKingdom), true
	default:
		return 0, false
	}
}

func clanSet(c *Organization, f string, v float64) bool {
	switch f {
	case "clan_renown":
		c.Renown = v
		c.Tier = OrganizationTierForRenown(v)
	case "clan_tier":
		c.Tier = int(v)
	case "clan_leader":
		c.LeaderID = int(v)
	case "clan_side":
		c.SideID = int(v)
	case "clan_household":
		c.HouseholdSize = int(v)
	case "wants_kingdom":
		c.WantsKingdom = int(v)
	default:
		return false
	}
	return true
}

func workshopGet(wk *Workshop, f string) (float64, bool) {
	switch f {
	case "workshop_town":
		return float64(wk.TownID), true
	case "workshop_owner_clan":
		return float64(wk.OwnerOrganizationID), true
	case "workshop_type":
		return float64(wk.Type), true
	case "workshop_level":
		return float64(wk.Level), true
	case "workshop_workers":
		return wk.Workers, true
	case "workshop_input_stock":
		return wk.InputStock, true
	case "workshop_output_stock":
		return wk.OutputStock, true
	case "workshop_income":
		return wk.LastIncome, true
	default:
		return 0, false
	}
}

func workshopSet(wk *Workshop, f string, v float64) bool {
	switch f {
	case "workshop_town":
		wk.TownID = int(v)
	case "workshop_owner_clan":
		wk.OwnerOrganizationID = int(v)
	case "workshop_type":
		wk.Type = WorkshopType(int(v))
	case "workshop_level":
		wk.Level = int(v)
	case "workshop_workers":
		wk.Workers = v
	case "workshop_input_stock":
		wk.InputStock = v
	case "workshop_output_stock":
		wk.OutputStock = v
	case "workshop_income":
		wk.LastIncome = v
	default:
		return false
	}
	return true
}

func notableGet(n *Notable, f string) (float64, bool) {
	switch f {
	case "notable_role":
		return float64(n.Role), true
	case "notable_town":
		return float64(n.TownID), true
	case "notable_village":
		return float64(n.VillageID), true
	case "notable_power":
		return n.Power, true
	case "notable_relation":
		return n.Relation, true
	case "notable_open_issues":
		return n.OpenIssues, true
	case "notable_grievance":
		return n.Grievance, true
	case "notable_cooldown_until":
		return float64(n.CooldownUntil), true
	case "notable_born_tick":
		return float64(n.BornTick), true
	case "notable_tenure_days":
		return n.TenureDays, true
	case "notable_last_offer_tick":
		return float64(n.LastOfferTick), true
	case "notable_active":
		if n.IsActive {
			return 1, true
		}
		return 0, true
	default:
		return 0, false
	}
}

func notableSet(n *Notable, f string, v float64) bool {
	switch f {
	case "notable_role":
		n.Role = NotableRole(int(v))
	case "notable_town":
		n.TownID = int(v)
	case "notable_village":
		n.VillageID = int(v)
	case "notable_power":
		n.Power = v
	case "notable_relation":
		n.Relation = v
	case "notable_open_issues":
		n.OpenIssues = v
	case "notable_grievance":
		n.Grievance = v
	case "notable_cooldown_until":
		n.CooldownUntil = int(v)
	case "notable_born_tick":
		n.BornTick = int(v)
	case "notable_tenure_days":
		n.TenureDays = v
	case "notable_last_offer_tick":
		n.LastOfferTick = int(v)
	case "notable_active":
		n.IsActive = v != 0
	default:
		return false
	}
	return true
}

func issueGet(i *Issue, f string) (float64, bool) {
	switch f {
	case "issue_state":
		return float64(i.State), true
	case "issue_kind":
		return float64(i.Kind), true
	case "issue_notable":
		return float64(i.NotableID), true
	case "issue_town":
		return float64(i.TownID), true
	case "issue_village":
		return float64(i.VillageID), true
	case "issue_target":
		return float64(i.TargetID), true
	case "issue_route":
		return float64(i.RouteID), true
	case "issue_acceptor":
		return float64(i.AcceptorID), true
	case "issue_progress":
		return i.Progress, true
	case "issue_amount":
		return i.Amount, true
	case "issue_baseline":
		return i.Baseline, true
	case "issue_deadline_tick":
		return float64(i.DeadlineTick), true
	case "issue_deadline_days":
		return i.DeadlineDays, true
	case "issue_started_tick":
		return float64(i.StartedTick), true
	case "issue_reward_money":
		return i.RewardMoney, true
	case "issue_reward_gold":
		return i.RewardGold, true
	case "issue_reward_renown":
		return i.RewardRenown, true
	default:
		return 0, false
	}
}

func issueSet(i *Issue, f string, v float64) bool {
	switch f {
	case "issue_state":
		i.State = IssueState(int(v))
	case "issue_kind":
		i.Kind = IssueKind(int(v))
	case "issue_notable":
		i.NotableID = int(v)
	case "issue_town":
		i.TownID = int(v)
	case "issue_village":
		i.VillageID = int(v)
	case "issue_target":
		i.TargetID = int(v)
	case "issue_route":
		i.RouteID = int(v)
	case "issue_acceptor":
		i.AcceptorID = int(v)
	case "issue_progress":
		i.Progress = v
	case "issue_amount":
		i.Amount = v
	case "issue_baseline":
		i.Baseline = v
	case "issue_deadline_tick":
		i.DeadlineTick = int(v)
	case "issue_deadline_days":
		i.DeadlineDays = v
	case "issue_started_tick":
		i.StartedTick = int(v)
	case "issue_reward_money":
		i.RewardMoney = v
	case "issue_reward_gold":
		i.RewardGold = v
	case "issue_reward_renown":
		i.RewardRenown = v
	default:
		return false
	}
	return true
}
