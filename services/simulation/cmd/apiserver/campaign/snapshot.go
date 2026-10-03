package campaign

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// The client's townClass thresholds, from design/tokens.ts. The server classifies a
// settlement with the client's own published numbers so the marker it draws and the
// class it reports cannot disagree.
const (
	cityPopulation    = 100_000.0
	townPopulation    = 25_000.0
	townClassCity     = "city"
	townClassTown     = "town"
	townClassVillage  = "village"
)

// townClass is the client's class key for a settlement of this population.
func townClass(population float64) string {
	switch {
	case population >= cityPopulation:
		return townClassCity
	case population >= townPopulation:
		return townClassTown
	default:
		return townClassVillage
	}
}

// Snapshot builds the whole world as the client reads it.
func (c *Campaign) Snapshot(ctx context.Context) (wire.SimSnapshot, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.lastErr != nil {
		return wire.SimSnapshot{}, internalf(
			"the simulation clock is halted after a failed tick at day %d: %v", c.state.Tick, c.lastErr)
	}
	return c.snapshotLocked(), nil
}

func (c *Campaign) snapshotLocked() wire.SimSnapshot {
	snap := wire.SimSnapshot{
		SchemaVersion: wire.SnapshotSchemaVersion,
		Day:           c.state.Tick,
		Year:          int(c.state.Year),
		EraTier:       c.eraTier(),

		Party:         c.partyStateLocked(),
		Player:        c.playerStateLocked(),
		Towns:         c.townsLocked(c.state),
		Markets:       c.marketsLocked(),
		Sides:         c.sidesLocked(),
		Rulers:        c.rulersLocked(),
		Ledger:        c.ledgerLocked(),
		Warnings:      c.warningsLocked(),
		Notifications: c.notificationsLocked(),
		CauseLog:      c.causeLogMapLocked(),
	}
	return snap
}

// eraTier is the technology tier from ERA.md section 3 against the campaign's
// calendar, which is what FEATURES.md section 1's table is keyed on.
func (c *Campaign) eraTier() int {
	year := c.opts.StartYear + int(c.state.Year)
	switch {
	case year < 1960:
		return 1
	case year < 1980:
		return 2
	case year < 1990:
		return 3
	default:
		return 4
	}
}

// playerStateLocked renders the top bar. The player's character sheet, when posted,
// supplies the name, appearance, age, and biography; until then the ruler's
// generated name is used, which is why the client's non-empty check always passes.
func (c *Campaign) playerStateLocked() wire.PlayerState {
	r := c.state.Rulers[c.playerRuler]
	party := c.state.Parties[c.party]

	out := wire.PlayerState{
		PartyID:   EntityID(model.KindParty, c.party),
		FactionID: EntityID(model.KindSide, c.playerSide()),
		Skills:    map[string]float64{},
	}
	name := ""
	if r != nil {
		name = r.Name
		out.Influence = round2(r.Influence)
		out.Renown = round2(r.Renown)
	}
	ch := c.character
	if ch.set {
		out.CharacterName = strings.TrimSpace(ch.firstName + " " + ch.lastName)
		out.EthnicityID = ch.ethnicityID
		out.AppearanceID = ch.appearanceID
		out.Age = ch.age
		out.Biography = ch.biography
		for k, v := range ch.skills {
			out.Skills[k] = v
		}
		if out.CharacterName == "" {
			out.CharacterName = name
		}
	} else {
		out.CharacterName = name
		out.Age = rulerAge(r)
		out.Biography = c.defaultBiography(r)
	}
	if party != nil {
		out.Resources = wire.Resources{
			Money:    round2(party.Money),
			Gold:     round2(party.Gold),
			Food:     round2(party.Food),
			Metal:    round2(party.Metal),
			Medicine: round2(party.Medicine),
		}
	}
	if out.CharacterName == "" {
		// The client refuses a snapshot whose characterName is empty, so this
		// must never be blank. A campaign with no player ruler still answers.
		out.CharacterName = "The player"
	}
	return out
}

func rulerAge(r *model.Ruler) float64 {
	if r == nil {
		return 0
	}
	return round2(r.Age)
}

func (c *Campaign) defaultBiography(r *model.Ruler) string {
	if r == nil {
		return ""
	}
	return fmt.Sprintf("%s, %d, of %s. Carries %s of influence and %s of renown.",
		r.Name, int(r.Age), c.state.Name(model.KindSide, r.SideID),
		trimNum(r.Influence), trimNum(r.Renown))
}

// partyStateLocked renders the player's party.
func (c *Campaign) partyStateLocked() wire.PartyState {
	p := c.state.Parties[c.party]
	out := wire.PartyState{
		ID:        EntityID(model.KindParty, c.party),
		FactionID: EntityID(model.KindSide, c.playerSide()),
		Route:     []wire.Point{},
		Troops:    []wire.TroopStack{},
		Roles:     map[string]string{},
		Goods:     []wire.PartyGood{},
	}
	if p == nil {
		out.Name = "The player's party"
		out.LeaderName = out.Name
		out.Position = wire.Point{}
		out.SpeedKmPerDay = 0
		return out
	}

	out.Name = p.Name
	out.LeaderName = c.state.Name(model.KindRuler, p.RulerID)
	if out.LeaderName == "" {
		out.LeaderName = p.Name
	}
	out.Position = wire.Point{X: round2(p.X), Z: round2(p.Y)}
	out.Food = round2(p.Food)
	out.Medicine = round2(p.Medicine)
	out.Metal = round2(p.Metal)
	out.Money = round2(p.Money)
	out.Morale = round3(p.Morale)
	out.Fatigue = round3(p.Fatigue)
	out.WagesOwed = round2(p.WagesOwed)
	out.SpeedKmPerDay = round2(p.Speed * LeagueKM)

	c.ro.followMorale(p.Morale)
	out.Troops = c.ro.render(p.Troops, c.wagePerTroop())
	out.Goods = c.partyGoodsLocked(p)

	if dest := c.state.Towns[p.DestTown]; dest != nil && c.partyIsMarchingLocked(p) {
		out.Destination = &wire.Destination{SettlementID: EntityID(model.KindTown, dest.ID), Name: dest.Name}
		if c.ro.marchStart >= 0 {
			day := c.ro.marchStart % 365
			out.MarchingSinceDay = &day
		}
		out.Route = c.routePoints(p, dest, func() []*model.Route {
			legs, _ := c.routeBetween(p, dest)
			return legs
		}())
	}
	return out
}

func (c *Campaign) partyIsMarchingLocked(p *model.Party) bool {
	return p.Activity == model.ActMarching || p.Activity == model.ActResupplying
}

// townsLocked renders every settlement.
func (c *Campaign) townsLocked(s *model.State) []wire.TownState {
	out := make([]wire.TownState, 0, len(s.Towns))
	for _, id := range s.TownIDs() {
		t := s.Towns[id]
		if t == nil {
			continue
		}
		out = append(out, c.townStateLocked(t))
	}
	return out
}

func (c *Campaign) townStateLocked(t *model.Town) wire.TownState {
	pop := t.Population
	out := wire.TownState{
		ID:                      EntityID(model.KindTown, t.ID),
		SettlementID:            Slug(t.Name),
		Name:                    t.Name,
		Klass:                   townClass(pop),
		HolderName:              c.state.Name(model.KindRuler, t.Holder),
		Population:              &pop,
		Workers:                 round2(t.Workers),
		FoodStock:               round2(t.FoodStock),
		FoodProduction:          round2(t.FoodProduction),
		FoodDemand:              round2(t.FoodDemand),
		MedicineStock:           round2(t.MedicineStock),
		Sanitation:              round3(t.Sanitation),
		Infected:                round3(t.Infected),
		Crowding:                round3(t.Crowding),
		Unrest:                  round3(t.Unrest),
		Loyalty:                 round3(t.Loyalty),
		Security:                round3(t.RoadSafety),
		Rebellious:              t.Loyalty < 0.25,
		UnderSiege:              &t.IsBesieged,
		Prosperity:              round3(t.Prosperity),
		TaxRate:                 round3(t.TaxRate),
		StateTaxRate:            round3(t.StateTaxRate),
		State:                   t.State,
		Buildings:               c.buildingInfos(t),
		ConstructionDaysLeft:    round2(t.ConstructionDaysLeft),
		Garrison:                round2(t.Garrison),
		GarrisonConduct:         round3(t.GarrisonConduct),
		RoadSafety:              round3(t.RoadSafety),
		Money:                   round2(t.Money),
		Gold:                    round2(t.Gold),
		Metal:                   round2(t.Metal),
		UpdatedTick:             c.townUpdatedTick(t),
		Recruitable:             c.recruitableUnits(t),
		Notables:                c.notablesOfTown(t),
	}
	if t.Holder >= 0 {
		id := EntityID(model.KindRuler, t.Holder)
		out.HolderID = &id
	}
	if t.ConstructionBuilding >= 0 {
		id := buildingID(int(t.ConstructionBuilding))
		out.ConstructionBuilding = &id
	}
	return out
}

// townUpdatedTick is the most recent tick this settlement changed, so the UI can
// show staleness honestly rather than implying live data.
func (c *Campaign) townUpdatedTick(t *model.Town) int {
	var newest int
	if row, ok := c.log.LatestFor(model.KindTown, t.ID, "prosperity"); ok && row.Tick > newest {
		newest = row.Tick
	}
	if row, ok := c.log.LatestFor(model.KindTown, t.ID, "loyalty"); ok && row.Tick > newest {
		newest = row.Tick
	}
	if row, ok := c.log.LatestFor(model.KindTown, t.ID, "unrest"); ok && row.Tick > newest {
		newest = row.Tick
	}
	if row, ok := c.log.LatestFor(model.KindTown, t.ID, "food_stock"); ok && row.Tick > newest {
		newest = row.Tick
	}
	return newest
}

// sidesLocked renders every faction, with ratings computed from real totals.
//
// FACTIONS.md section 3 requires that "the real game values are computed from real
// data, not hand-typed", so each rating is the side's own total rescaled against
// the world mean into 1-5. Difficulty then follows from those computed ratings,
// because a side is hard exactly when it is stronger than the rest of the world.
func (c *Campaign) sidesLocked() []wire.SideState {
	ids := c.state.SideIDs()
	totals := make(map[int]wire.SideRatings, len(ids))
	means := map[string]float64{}
	counts := map[string]int{}

	for _, id := range ids {
		s := c.state.Sides[id]
		if s == nil {
			continue
		}
		totals[id] = wire.SideRatings{
			Money:      s.Treasury,
			Gold:       s.Gold,
			Food:       s.Food,
			Metal:      s.Metal,
			Population: s.Population,
		}
		for key, v := range map[string]float64{
			"money": s.Treasury, "gold": s.Gold, "food": s.Food,
			"metal": s.Metal, "population": s.Population,
		} {
			means[key] += v
			counts[key]++
		}
	}
	for key := range means {
		if counts[key] > 0 {
			means[key] /= float64(counts[key])
		}
	}

	out := make([]wire.SideState, 0, len(ids))
	var worldTotal float64
	for _, id := range ids {
		worldTotal += totals[id].Money + totals[id].Gold + totals[id].Food +
			totals[id].Metal + totals[id].Population
	}
	meanTotal := 0.0
	if len(ids) > 0 {
		meanTotal = worldTotal / float64(len(ids))
	}

	for _, id := range ids {
		s := c.state.Sides[id]
		if s == nil {
			continue
		}
		ratings := wire.SideRatings{
			Money:      rescale(totals[id].Money, means["money"]),
			Gold:       rescale(totals[id].Gold, means["gold"]),
			Food:       rescale(totals[id].Food, means["food"]),
			Metal:      rescale(totals[id].Metal, means["metal"]),
			Population: rescale(totals[id].Population, means["population"]),
		}
		st := wire.SideState{
			ID:           EntityID(model.KindSide, id),
			Name:         s.Name,
			Ratings:      ratings,
			Difficulty:   difficultyFor(ratings, meanTotal, totals[id]),
			MemberStates: []string{},
			States:       []wire.StateProfile{},
		}
		st.Pros, st.Cons = sideStrengths(ratings)
		st.BiggestDanger = weakestOf(ratings)
		st.SignatureMechanic = strongestOf(ratings)
		st.MemberStates, st.States = c.stateProfiles(id, means)
		out = append(out, st)
	}
	return out
}

// rescale maps a side's total against the world mean onto the client's 1-5 scale.
// Half the mean is 3, the mean is 3, double the mean is 4, and the ends of the
// scale are reserved for a side that is far out. A world where every side is
// identical would produce nothing but 3s, which is the honest answer for an
// uninteresting world.
func rescale(v, mean float64) float64 {
	if mean <= 0 {
		return 3
	}
	ratio := v / mean
	switch {
	case ratio >= 2:
		return 5
	case ratio <= 0.25:
		return 1
	}
	return clampRange(1+ratio*2, 1, 5)
}

// difficultyFor derives the difficulty string from the computed ratings against
// the world mean total. The strings are the client's union verbatim, space in
// "Easy to Medium" included.
func difficultyFor(r wire.SideRatings, meanTotal float64, totals wire.SideRatings) string {
	total := totals.Money + totals.Gold + totals.Food + totals.Metal + totals.Population
	if meanTotal <= 0 {
		return "Medium"
	}
	switch {
	case total >= meanTotal*2:
		return "Hard"
	case total <= meanTotal*0.5:
		return "Easy to Medium"
	default:
		return "Medium"
	}
}

// sideStrengths names the ratings above and below the world mean, which is what a
// side is actually strong and weak at. No prose is written: every entry names a
// real computed rating.
func sideStrengths(r wire.SideRatings) (pros, cons []string) {
	pros, cons = []string{}, []string{}
	for _, p := range []struct {
		label string
		v     float64
	}{
		{"money", r.Money}, {"gold", r.Gold}, {"food", r.Food},
		{"metal", r.Metal}, {"people", r.Population},
	} {
		switch {
		case p.v >= 4:
			pros = append(pros, p.label)
		case p.v <= 2:
			cons = append(cons, p.label)
		}
	}
	return pros, cons
}

func weakestOf(r wire.SideRatings) string {
	worst, name := 6.0, ""
	for _, p := range []struct {
		label string
		v     float64
	}{
		{"money", r.Money}, {"gold", r.Gold}, {"food", r.Food},
		{"metal", r.Metal}, {"people", r.Population},
	} {
		if p.v < worst {
			worst, name = p.v, p.label
		}
	}
	if name == "" {
		return "nothing stands out yet"
	}
	return name
}

func strongestOf(r wire.SideRatings) string {
	best, name := 0.0, ""
	for _, p := range []struct {
		label string
		v     float64
	}{
		{"money", r.Money}, {"gold", r.Gold}, {"food", r.Food},
		{"metal", r.Metal}, {"people", r.Population},
	} {
		if p.v > best {
			best, name = p.v, p.label
		}
	}
	if name == "" {
		return "nothing stands out yet"
	}
	return name
}

// stateProfiles lists the US states a side holds towns in, with ratings computed
// the same way from the towns in each state.
func (c *Campaign) stateProfiles(sideID int, means map[string]float64) ([]string, []wire.StateProfile) {
	byState := map[string][]*model.Town{}
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t == nil || t.HolderSide != sideID || t.State == "" {
			continue
		}
		byState[t.State] = append(byState[t.State], t)
	}
	codes := make([]string, 0, len(byState))
	for code := range byState {
		codes = append(codes, code)
	}
	sort.Strings(codes)

	profiles := make([]wire.StateProfile, 0, len(codes))
	for _, code := range codes {
		towns := byState[code]
		var money, gold, food, metal, pop float64
		for _, t := range towns {
			money += t.Money
			gold += t.Gold
			food += t.FoodStock
			metal += t.Metal
			pop += t.Population
		}
		p := pop
		sp := wire.StateProfile{
			Code:       code,
			Name:       code,
			Population: &p,
			Money:      rescale(money, means["money"]*float64(len(byState))),
			Gold:       rescale(gold, means["gold"]*float64(len(byState))),
			Food:       rescale(food, means["food"]*float64(len(byState))),
			Metal:      rescale(metal, means["metal"]*float64(len(byState))),
		}
		sp.Summary = fmt.Sprintf("%d %s, %s people, money %d of 5.",
			len(towns), plural(len(towns), "town", "towns"), trimNum(pop), int(sp.Money))
		profiles = append(profiles, sp)
	}
	return codes, profiles
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// rulersLocked renders every character.
func (c *Campaign) rulersLocked() []wire.RulerState {
	out := make([]wire.RulerState, 0, len(c.state.Rulers))
	for _, id := range c.state.RulerIDsSorted() {
		r := c.state.Rulers[id]
		if r == nil {
			continue
		}
		out = append(out, c.rulerStateLocked(r))
	}
	return out
}

func (c *Campaign) rulerStateLocked(r *model.Ruler) wire.RulerState {
	out := wire.RulerState{
		ID:          EntityID(model.KindRuler, r.ID),
		Name:        r.Name,
		FactionID:   EntityID(model.KindSide, r.SideID),
		FactionName: c.state.Name(model.KindSide, r.SideID),
		Tier:        rulerTierName(r),
		Age:         round2(r.Age),
		Traits: wire.RulerTraits{
			Valor:       round3(r.Traits.Valor),
			Mercy:       round3(r.Traits.Mercy),
			Honor:       round3(r.Traits.Honor),
			Generosity:  round3(r.Traits.Generosity),
			Calculation: round3(r.Traits.Calculation),
		},
		Ambitions:        ambitionNames(r.Ambition),
		Holdings:         []wire.Holding{},
		Wealth:           wire.Resources{Money: round2(r.Money), Gold: round2(r.Gold)},
		LoyaltyToLeader:  round3(r.LoyaltyToLeader),
		Influence:        round2(r.Influence),
		Renown:           round2(r.Renown),
		RelationToPlayer: c.notableRelation(r),
		RecentEvents:     c.rulerEvents(r),
	}
	if t := c.state.Towns[r.TownID]; t != nil {
		out.Holdings = append(out.Holdings, wire.Holding{
			SettlementID: EntityID(model.KindTown, t.ID), Name: t.Name,
		})
	}
	if p := c.state.Parties[r.PartyID]; p != nil {
		out.Garrison = round2(p.Troops)
	}
	return out
}

// rulerTierName maps the model's tier onto the client's six names.
//
// The model's tier is 0 leader, 1 governor, 2 lord, 3 warlord, 4 mercenary
// captain. "city-ruler" has no direct tier, so it is given to the ruler who governs
// a town and is not a side leader, which is what the client's name describes. Every
// one of the six is reachable from a real field.
func rulerTierName(r *model.Ruler) string {
	switch {
	case r.Leader:
		return "side-leader"
	case r.IsMercenary || r.Tier == 4:
		return "mercenary-captain"
	case r.Tier == 1:
		return "state-governor"
	case r.Tier == 3:
		return "local-warlord"
	case r.Officer && r.TownID >= 0:
		return "city-ruler"
	default:
		return "lord"
	}
}

// rulerEvents is a ruler's own recent history, taken from the cause-log rows that
// name them. It is real, and it is bounded by whatever the log still holds.
func (c *Campaign) rulerEvents(r *model.Ruler) []wire.RulerEvent {
	out := []wire.RulerEvent{}
	fields := []string{"influence", "renown", "loyalty_to_leader", "captured_by", "is_alive"}
	for _, f := range fields {
		row, ok := c.log.LatestFor(model.KindRuler, r.ID, f)
		if !ok {
			continue
		}
		out = append(out, c.eventFrom(row))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Day > out[j].Day })
	if len(out) > 6 {
		out = out[:6]
	}
	return out
}

// eventFrom renders one cause-log row as an event on a character's timeline.
func (c *Campaign) eventFrom(r cause.Row) wire.RulerEvent {
	field, hasField := model.FieldByName(r.Kind, r.Field)
	before, after := trimNum(r.Old), trimNum(r.New)
	if hasField {
		before, after = field.Format(r.Old), field.Format(r.New)
	}
	text := fmt.Sprintf("%s: %s to %s", fieldLabel(r.Field), before, after)
	if r.Note != "" {
		text += " (" + r.Note + ")"
	}
	return wire.RulerEvent{Day: r.Tick % 365, Text: text, CausedBy: RowID(r.ID)}
}

// causeLogMapLocked builds the cause-log table the client walks.
//
// It is bounded, because the log holds far more rows than a snapshot should carry.
// The bound is the most recent CauseRowsLimit rows plus one more pass that pulls
// in any row a carried row points at, up to twice the limit. That extra pass is
// what keeps a why-chain walkable after the snapshot is in the client's hands:
// without it a chain whose second link fell out of the window would arrive broken.
func (c *Campaign) causeLogMapLocked() map[string]wire.CauseRow {
	rows := c.causeRowsLocked(c.state.Tick, c.opts.CauseRowsLimit)
	out := make(map[string]wire.CauseRow, len(rows))
	for _, r := range rows {
		out[r.ID] = r
	}
	return out
}

// causeRowsLocked renders the newest rows, then closes the chains they reference.
func (c *Campaign) causeRowsLocked(fromTick, limit int) []wire.CauseRow {
	if limit <= 0 {
		return []wire.CauseRow{}
	}
	all := c.log.Rows()
	var window []cause.Row
	for i := len(all) - 1; i >= 0 && len(window) < limit; i-- {
		window = append(window, all[i])
	}
	// Window is newest-first here. Close the referenced chains, oldest-first within
	// the extra pass so a chain reads in order.
	have := make(map[int]bool, len(window))
	for _, r := range window {
		have[r.ID] = true
	}
	extra := map[int]cause.Row{}
	for _, r := range window {
		for _, causeID := range r.CausedBy {
			if have[causeID] {
				continue
			}
			if row, ok := c.log.Row(causeID); ok {
				extra[causeID] = row
			}
		}
	}
	ids := make([]int, 0, len(extra))
	for id := range extra {
		ids = append(ids, id)
	}
	sort.Ints(ids)

	out := make([]wire.CauseRow, 0, len(window)+len(ids))
	for _, r := range window {
		out = append(out, c.causeRowLocked(r))
	}
	for _, id := range ids {
		out = append(out, c.causeRowLocked(extra[id]))
	}
	return out
}

// causeRowLocked renders one log row for the wire.
func (c *Campaign) causeRowLocked(r cause.Row) wire.CauseRow {
	causes := make([]string, 0, len(r.CausedBy))
	for _, id := range r.CausedBy {
		causes = append(causes, RowID(id))
	}
	return wire.CauseRow{
		ID:         RowID(r.ID),
		Tick:       r.Tick,
		Day:        r.Tick % 365,
		EntityID:   EntityID(r.Kind, r.Entity),
		EntityName: c.state.Name(r.Kind, r.Entity),
		Field:      r.Field,
		Old:        r.Old,
		New:        r.New,
		System:     titleCase(r.System),
		CausedBy:   causes,
		Summary:    causeSummary(r),
	}
}

// causeSummary is the plain sentence the Why panel shows. It is composed from the
// row's own read record, so it says what the writing system actually saw.
func causeSummary(r cause.Row) string {
	field, hasField := model.FieldByName(r.Kind, r.Field)
	before, after := trimNum(r.Old), trimNum(r.New)
	unit := ""
	if hasField {
		before, after = field.Format(r.Old), field.Format(r.New)
		unit = field.Unit
	}
	what := fieldLabel(r.Field)
	if unit != "" {
		what += " (" + unit + ")"
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "%s moved from %s to %s", what, before, after)
	if r.Note != "" {
		fmt.Fprintf(&sb, ", %s", r.Note)
	}
	if r.Read != "" {
		fmt.Fprintf(&sb, " (read: %s)", r.Read)
	}
	fmt.Fprintf(&sb, " — written by %s", r.System)
	return sb.String()
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	return strings.ToUpper(string(r[0])) + string(r[1:])
}

// seedReadModels fills the runner's own read models so the first snapshot is a
// world with a history rather than a world with a single price.
func (c *Campaign) seedReadModels() {
	c.observePrices()
	// The warm-up's rows are harvested as notifications, so the player arrives to
	// a world that has already been telling them things.
	c.harvestNotifications()
	c.mu.Lock()
	if c.state.Parties[c.party] != nil {
		c.ro.syncToParty(c.state.Parties[c.party].Troops)
	}
	c.mu.Unlock()
}

// Why answers a why-query for the Why panel.
//
// It is backed by sim.Why, which walks the real CausedBy edges in the cause log, so
// a step appears only if the writing system recorded that the earlier event was
// among what it read. Rows come back result-first, which is the order the panel
// headlines, and the server does not reorder them: the client walks causedBy itself
// and cycle-guards.
func (c *Campaign) Why(ctx context.Context, entityRef, field string) (any, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	kind, id, ok := ParseEntityID(entityRef)
	if !ok {
		t, exists := c.townByRef(entityRef)
		if !exists {
			return nil, notFoundf("no entity %q", entityRef)
		}
		kind, id = model.KindTown, t.ID
	}
	if !c.state.Exists(kind, id) {
		return nil, notFoundf("no %s %d", kind, id)
	}
	if _, known := model.FieldByName(kind, field); !known {
		return nil, unprocessablef(
			fmt.Sprintf("%s has no field called %q.", kind, field),
			"field %q is not a registered %s field", field, kind)
	}

	res := sim.Why(c.log, c.state, kind, id, field, int(c.cfg.Cause.MaxChainLinks))
	rows := make([]wire.CauseRow, 0, len(res.Chain))
	for _, node := range res.Chain {
		rows = append(rows, c.causeRowLocked(node.Row))
	}
	chain := wire.WhyChain{
		EntityID:   EntityID(kind, id),
		Field:      field,
		Rows:       rows,
		Related:    c.relatedRows(kind, id, field, rows),
		TotalDepth: len(rows),
		Truncated:  res.Truncated,
	}
	// sim.Why reports that a field has no logged change by returning a single
	// skipped node rather than an error. That is the answer, not a failure, so it
	// is said plainly here: the chain's total depth is zero, because there is
	// nothing in it.
	if res.Orphaned && len(rows) == 1 && rows[0].Old == 0 && rows[0].New == 0 && rows[0].Summary == "" {
		chain.Rows = []wire.CauseRow{{
			ID:         "",
			Tick:       c.state.Tick,
			Day:        c.state.Tick % 365,
			EntityID:   EntityID(kind, id),
			EntityName: c.state.Name(kind, id),
			Field:      field,
			CausedBy:   []string{},
			Summary: fmt.Sprintf("Nothing has been recorded against %s on %s in this run. It has not moved far enough for the simulation to log it.",
				fieldLabel(field), c.state.Name(kind, id)),
		}}
		chain.TotalDepth = 0
	}
	return chain, nil
}

// relatedRows are rows about the same entity that the chain walk did not reach.
// They are context, not links, which is why they go in their own array: the client
// shows them without implying a cause.
func (c *Campaign) relatedRows(kind model.Kind, id int, field string, chain []wire.CauseRow) []wire.CauseRow {
	inChain := make(map[int]bool, len(chain))
	for _, r := range chain {
		if id, ok := ParseRowID(r.ID); ok {
			inChain[id] = true
		}
	}
	// Every tracked field on the entity, so the context is the entity's whole
	// recent story rather than only its history of this one field.
	fields := model.TrackedFieldsOfKind(kind)
	ids := c.log.RecentFor(kind, id, fields, c.opts.RelatedLimit*2)
	out := make([]wire.CauseRow, 0, c.opts.RelatedLimit)
	for _, rowID := range ids {
		if inChain[rowID] {
			continue
		}
		row, ok := c.log.Row(rowID)
		if !ok || row.Field == field {
			continue
		}
		out = append(out, c.causeRowLocked(row))
		if len(out) >= c.opts.RelatedLimit {
			break
		}
	}
	return out
}

// ambitionNames is a ruler's ambition in words, from the model's Ambition enum.
// The client renders ambitions as a list of strings, and the enum has no String
// method of its own, so the wording lives here beside the thing it describes.
func ambitionNames(a model.Ambition) []string {
	switch a {
	case model.AmbitionLand:
		return []string{"land"}
	case model.AmbitionWealth:
		return []string{"wealth"}
	case model.AmbitionRevenge:
		return []string{"revenge"}
	case model.AmbitionSecurity:
		return []string{"security"}
	default:
		return []string{}
	}
}

// RestoreSnapshot restores the campaign state from a snapshot. This is used
// when the client loads a save: the snapshot (stored in the client's IndexedDB)
// becomes the live simulation state.
func (c *Campaign) RestoreSnapshot(ctx context.Context, snap wire.SimSnapshot) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Validate schema version
	if snap.SchemaVersion != wire.SnapshotSchemaVersion {
		return nil, unprocessablef("Snapshot schema version is not supported.",
			"schema version %d, expected %d", snap.SchemaVersion, wire.SnapshotSchemaVersion)
	}

	// Restore time
	c.state.Tick = snap.Day
	c.state.Year = float64(snap.Year)

	// Restore player party
	if p := c.state.Parties[c.party]; p != nil {
		p.X = snap.Party.Position.X
		p.Y = snap.Party.Position.Z
		p.Money = snap.Party.Money
		p.Morale = snap.Party.Morale
		p.Fatigue = snap.Party.Fatigue
		p.Food = snap.Party.Food
		p.Medicine = snap.Party.Medicine
		p.Metal = snap.Party.Metal
		p.WagesOwed = snap.Party.WagesOwed
		// Troops: sum the stacks
		var totalTroops float64
		for _, s := range snap.Party.Troops {
			totalTroops += float64(s.Count)
		}
		p.Troops = totalTroops
	}

	// Note: full town/market/ruler restoration is not yet implemented.
	// The snapshot contains them, but the model's internal town state
	// (garrisons, loyalty, etc.) requires deeper integration.

	return wire.Accepted{Accepted: true}, nil
}
