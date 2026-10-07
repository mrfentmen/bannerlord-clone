package campaign

import (
	"context"
	"fmt"
	"strings"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// The player's own diplomatic actions.
//
// # What this is, and what it is not
//
// internal/systems/factionai already decides when two sides should go to war and
// when they should stop. That system is the world turning on its own. This file is
// the player pulling a lever, and the two have to be told apart: a player who
// declares a war the AI then ends on its own cooldown has been handed a decision
// that does not mean anything.
//
// So every action here writes the same state the AI writes — a model.War row, the
// side's intent and enemy — through the same WriteSet, and State.AtWar stays the
// single answer to whether two sides are fighting. There is no second notion of
// war kept in the campaign's own memory, because two notions of war are how a
// client ends up drawing a peace on the map that the trade route still refuses.
//
// # Why each action is a job
//
// Every one of them moves money, renown, or a war row. CONSTITUTION.md section
// 2.1 does not let an HTTP handler write state: the only way in is a staged write
// the engine commits alongside everyone else's, so the change lands in the cause
// log where the Why panel can walk it. That is also why declaring a war while the
// clock is paused waits for a tick, exactly as a trade does.
//
// # Why nothing here stages an absolute write it has not checked
//
// The engine refuses two absolute writes to one field in a tick, because resolving
// them would make the result depend on which system ran first. factionai writes
// side_intent and side_enemy without checking HasSet, and a player's declaration
// colliding with an AI declaration on the same side is a real possibility. Every
// absolute write below is guarded by HasSet, so a player's order yields to the
// world's and the tick still commits.

// Diplomacy answers GET /v1/diplomacy.
//
// Every number on the board is read from the simulation: relation from the side
// relation matrix, at-war from State.AtWar, alliance from the sides' own Ally
// fields, and the tribute demand from the same arithmetic PayTribute uses. A
// client that computed any of these itself would be able to disagree with the
// server about what a button costs.
func (c *Campaign) Diplomacy(ctx context.Context) (wire.DiplomacyState, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	player := c.playerSide()
	out := wire.DiplomacyState{
		PlayerSide:              c.diplomacySide(player, player),
		Sides:                   []wire.DiplomacySide{},
		ActiveWars:              c.activeWarsFor(player),
		MaxActiveWars:           int(c.cfg.Diplomacy.MaxActiveWars),
		PeaceRelationGain:       c.cfg.FactionAI.PeaceRelationGain,
		DeclareWarInfluenceCost: c.cfg.FactionAI.InfluenceCostOfWar,
		MinAllianceRelation:     c.cfg.Diplomacy.MinAllianceRelation,
	}
	demand, affordable := c.tributeDemand(player, player)
	if affordable {
		d := demand
		out.PlayerSide.TributeDemand = &d
	}
	out.PlayerSide.TributeAffordable = affordable
	for _, id := range c.state.SideIDs() {
		if id == player {
			continue
		}
		side := c.diplomacySide(player, id)
		// The price is shown whether or not the player can meet it. A board that
		// hides a demand the player cannot afford leaves them with no way to learn
		// what the faction wants or how far off they are; TributeAffordable is what
		// greys the button, not a missing field.
		demand, affordable := c.tributeDemand(player, id)
		d := demand
		side.TributeDemand = &d
		side.TributeAffordable = affordable
		out.Sides = append(out.Sides, side)
	}
	return out, nil
}

// diplomacySide renders one faction as the board shows it.
func (c *Campaign) diplomacySide(player, other int) wire.DiplomacySide {
	side := c.state.Sides[other]
	if side == nil {
		return wire.DiplomacySide{SideID: EntityID(model.KindSide, other)}
	}
	view := wire.DiplomacySide{
		SideID:   EntityID(model.KindSide, side.ID),
		Name:     side.Name,
		Player:   other == player,
		AtWar:    c.state.AtWar(player, side.ID),
		Relation: round3(c.state.SideRelation(player, side.ID)),
		Treasury: round2(side.Treasury),
		Towns:    c.townsHeldBy(side.ID),
		// An alliance is stored one way round — worldgen writes both fields, and so
		// does FormAlliance — but it is read here in both directions, because a
		// board that checked only one would show half the world's alliances as
		// missing and tell a player their own alliance had lapsed.
		Allied:         c.areAllied(player, side.ID),
		PlayerIsAllyOf: side.Ally == player,
	}
	if side.LeaderID >= 0 {
		if r := c.state.Rulers[side.LeaderID]; r != nil {
			view.Leader = r.Name
		}
	}
	return view
}

// DeclareWar starts a war between the player's side and another faction.
func (c *Campaign) DeclareWar(ctx context.Context, req wire.DiplomacyRequest) (any, error) {
	target, err := c.resolveDiplomacyTarget(req)
	if err != nil {
		return nil, err
	}
	c.mu.RLock()
	refusal := c.declareWarRefusal(target)
	c.mu.RUnlock()
	if refusal != nil {
		return nil, refusal
	}

	j := newJob("diplomacy-declare-war",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stageDeclareWar(v, w, target)
		},
		func(c *Campaign, s *model.State, staged any) any {
			return c.finishDeclareWar(s, staged)
		})
	return c.Submit(ctx, j)
}

// declareWarRefusal says why a declaration cannot happen, in a sentence a player
// can read. A nil pointer means it can go ahead.
func (c *Campaign) declareWarRefusal(target int) error {
	player := c.playerSide()
	if player < 0 {
		return internalf("the player's ruler has no side, so there is nobody to declare war for")
	}
	if target == player {
		return unprocessablef("A faction cannot be at war with itself.",
			"target side %d is the player's own side", target)
	}
	if c.state.AtWar(player, target) {
		return conflictf("You are already at war with them.",
			"the player's side %d is already at war with side %d", player, target)
	}
	if c.activeWarsFor(player) >= int(c.cfg.Diplomacy.MaxActiveWars) {
		return unprocessablef(
			fmt.Sprintf("You are already fighting %d war. Finish one before starting another.",
				c.activeWarsFor(player)),
			"the player's side holds %d wars, diplomacy.max_active_wars is %g",
			c.activeWarsFor(player), c.cfg.Diplomacy.MaxActiveWars)
	}
	if other := c.state.Sides[target]; other != nil && other.Vassal {
		return unprocessablef("They answer to someone else, and you would be declaring on both of them.",
			"side %d is a vassal", target)
	}
	if cost := c.cfg.Diplomacy.DeclareWarGoldCost; cost > 0 {
		if p := c.state.Parties[c.party]; p == nil || p.Gold < cost {
			return unprocessablef(
				fmt.Sprintf("A declaration costs %s, and your party does not have it.", trimNum(cost)),
				"declare_war_gold_cost is %g and the party holds %v", cost, p.Gold)
		}
	}
	return nil
}

// diplomacyStaged carries what a tick decided to the finish step.
type diplomacyStaged struct {
	action string
	target int
	warID  int
	// before and after bracket the numbers the reply reports, read either side of
	// the commit so a clamped write reports what happened rather than what was
	// asked for.
	relationBefore  float64
	relationAfter   float64
	warinessBefore  float64
	warinessAfter   float64
	treasuryBefore  float64
	treasuryAfter   float64
	partyGoldBefore float64
	partyGoldAfter  float64
	warsEnded       int
	amountPaid      float64
	demand          float64
	tributeShare    float64
	endedWar        bool
	tradePact       bool
	allied          bool
	causedBy        string
}

// stageDeclareWar creates the war row and stages everything the declaration
// costs and changes.
//
// The war row is created through WriteSet.CreateEntity rather than poked into
// state, because CreateEntity is how a system adds an entity mid-run and the
// engine's delete and id bookkeeping depends on it.
func (c *Campaign) stageDeclareWar(v *sim.View, w *sim.WriteSet, target int) (any, error) {
	player := c.playerSide()
	other := v.State.Sides[target]
	if other == nil {
		return nil, notFoundf("no side %d", target)
	}
	staged := &diplomacyStaged{action: "declare-war", target: target}
	staged.relationBefore = v.State.SideRelation(player, target)

	war := &model.War{
		ID:        v.State.NewID(model.IDWar),
		SideA:     player,
		SideB:     target,
		StartTick: float64(v.Tick),
		// EndTick below zero is what model.State.AtWar reads as an active war. It
		// is a sentinel rather than a flag, and reusing it is what keeps this
		// declaration visible to the trade route, the march route, and the
		// encounter scan without any of them being told a declaration happened.
		EndTick:   -1,
		Reason:    model.WarBorder,
		Intensity: 0.5,
	}
	staged.warID = war.ID
	w.CreateEntity(func(s *model.State) { s.Wars[war.ID] = war })

	read := fmt.Sprintf("the player declared war on %s", other.Name)
	causes := v.Log.RecentFor(model.KindSide, player,
		[]string{"side_intent", "side_enemy"}, 2)

	w.Set(model.KindWar, war.ID, "war_side_a", float64(player), read, causes, "declared war")
	w.Set(model.KindWar, war.ID, "war_side_b", float64(target), read, causes, "declared war")
	w.Set(model.KindWar, war.ID, "war_reason", float64(model.WarBorder), read, causes, "the player declared")
	w.Set(model.KindWar, war.ID, "war_start_tick", float64(v.Tick), read, causes, "declared war")

	// Guarded: the faction AI may already have set this side's intent and enemy
	// on this same tick, and two absolute writes to one field is what the engine
	// refuses. Yielding is the right loser here — the world decided first, and the
	// war itself still exists either way.
	if !w.HasSet(model.KindSide, player, "side_intent") {
		w.Set(model.KindSide, player, "side_intent", float64(model.SideWar), read, causes, "declared war")
	}
	if !w.HasSet(model.KindSide, player, "side_enemy") {
		w.Set(model.KindSide, player, "side_enemy", float64(target), read, causes, "")
	}
	if !w.HasSet(model.KindSide, target, "side_intent") {
		w.Set(model.KindSide, target, "side_intent", float64(model.SideDefend), read, causes, "at war")
	}
	if !w.HasSet(model.KindSide, target, "side_enemy") {
		w.Set(model.KindSide, target, "side_enemy", float64(player), read, causes, "")
	}

	// Relation falls by the same constant the AI uses when it attacks, because
	// one war is one war: a war the player started should leave the same mark on
	// the opinion matrix as one the AI started, or the player's wars would be
	// diplomatically free.
	w.AddSideRelation(player, target, -c.cfg.Relation.BattleRelation,
		read, causes, "declared war")

	// And it costs. Gold is the party's, and influence is the leader's political
	// capital: war that is free in both is a war a player declares on a whim and
	// forgets, which is not a decision.
	if cost := c.cfg.Diplomacy.DeclareWarGoldCost; cost > 0 {
		w.Add(model.KindParty, c.party, "party_gold", -cost, read, causes, "the cost of declaring war")
	}
	w.Add(model.KindRuler, c.playerRuler, "influence", -c.cfg.FactionAI.InfluenceCostOfWar,
		read, causes, "the cost of declaring war")
	return staged, nil
}

// finishDeclareWar reads the committed world back.
func (c *Campaign) finishDeclareWar(s *model.State, staged any) any {
	st, ok := staged.(*diplomacyStaged)
	if !ok {
		return nil
	}
	player := c.playerSide()
	st.relationAfter = s.SideRelation(player, st.target)
	if p := s.Parties[c.party]; p != nil {
		st.partyGoldAfter = p.Gold
	}
	causedBy := ""
	if row, found := c.log.LatestFor(model.KindWar, st.warID, "war_start_tick"); found {
		causedBy = RowID(row.ID)
	}
	return wire.DeclareWarResult{
		Accepted: true,
		WarID:    EntityID(model.KindWar, st.warID),
		SideID:   EntityID(model.KindSide, st.target),
		// Read back, not asserted. If the faction AI ended this war on the same
		// tick, the honest answer is that there is not one any more.
		AtWar:     s.AtWar(player, st.target),
		WarReason: "border",
		// The nominal charge, not a measured delta. internal/systems/currency
		// converts between a party's money and gold every tick, and the influence
		// system rewrites a ruler's influence every tick, so a before-and-after
		// reading across one tick would report other systems' work as this order's
		// cost. declareWarRefusal already refuses a declaration the player cannot
		// afford in full, so the charge here is always the whole one.
		GoldSpent:      round2(c.cfg.Diplomacy.DeclareWarGoldCost),
		InfluenceSpent: round2(c.cfg.FactionAI.InfluenceCostOfWar),
		RelationBefore: round3(st.relationBefore),
		RelationAfter:  round3(st.relationAfter),
		ActiveWars:     c.activeWarsFor(player),
		CausedBy:       causedBy,
	}
}

// MakePeace ends the wars between the player's side and another faction.
func (c *Campaign) MakePeace(ctx context.Context, req wire.DiplomacyRequest) (any, error) {
	target, err := c.resolveDiplomacyTarget(req)
	if err != nil {
		return nil, err
	}
	c.mu.RLock()
	player := c.playerSide()
	active := c.activeWarIDsBetween(player, target)
	c.mu.RUnlock()
	if len(active) == 0 {
		return nil, conflictf("You are not at war with them, so there is no peace to make.",
			"the player's side %d holds no active war with side %d", player, target)
	}

	j := newJob("diplomacy-make-peace",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stageMakePeace(v, w, target)
		},
		func(c *Campaign, s *model.State, staged any) any {
			return c.finishMakePeace(s, staged)
		})
	return c.Submit(ctx, j)
}

// stageMakePeace ends every active war between the two sides.
//
// It ends all of them rather than one because a peace is a state of affairs
// between two factions and not a property of a single war row. Leaving one running
// would leave State.AtWar true after a reply that says the peace was made.
func (c *Campaign) stageMakePeace(v *sim.View, w *sim.WriteSet, target int) (any, error) {
	player := c.playerSide()
	ids := c.activeWarIDsBetween(player, target)
	if len(ids) == 0 {
		return nil, conflictf("You are not at war with them, so there is no peace to make.",
			"the player's side %d holds no active war with side %d", player, target)
	}
	staged := &diplomacyStaged{
		action:         "make-peace",
		target:         target,
		warsEnded:      len(ids),
		relationBefore: v.State.SideRelation(player, target),
	}
	if side := v.State.Sides[player]; side != nil {
		staged.warinessBefore = side.WarWeariness
	}
	if other := v.State.Sides[target]; other != nil {
		staged.treasuryBefore = other.Treasury
	}

	read := fmt.Sprintf("the player sued for peace with side %d", target)
	causes := v.Log.RecentFor(model.KindSide, player, []string{"side_war_weariness"}, 2)

	for _, wid := range ids {
		w.Set(model.KindWar, wid, "war_end_tick", float64(v.Tick), read, causes, "peace")
	}
	// One relation gain for the peace, not one per war: making peace twice with
	// the same faction is one act of diplomacy.
	w.AddSideRelation(player, target, c.cfg.FactionAI.PeaceRelationGain,
		read, causes, "made peace")

	// Relief is relative, not absolute. A side can be concluding other wars on
	// this same tick, and a relative reduction is both the honest statement — a
	// peace relieves exhaustion, it does not set it to a level — and the only form
	// that cannot collide with another system's absolute write.
	w.Add(model.KindSide, player, "side_war_weariness",
		-staged.warinessBefore*(1-c.cfg.FactionAI.PeaceWearinessRelief),
		read, causes, "the war is over and the exhaustion eases")

	// Clear the enemy's marks, but only if nobody else has written them this tick.
	if !w.HasSet(model.KindSide, player, "side_enemy") {
		w.Set(model.KindSide, player, "side_enemy", -1, read, causes, "made peace")
	}
	if !w.HasSet(model.KindSide, player, "side_intent") {
		w.Set(model.KindSide, player, "side_intent", float64(model.SidePeace), read, causes, "made peace")
	}
	if !w.HasSet(model.KindSide, target, "side_enemy") {
		w.Set(model.KindSide, target, "side_enemy", -1, read, causes, "made peace")
	}
	return staged, nil
}

// finishMakePeace reads the committed world back.
func (c *Campaign) finishMakePeace(s *model.State, staged any) any {
	st, ok := staged.(*diplomacyStaged)
	if !ok {
		return nil
	}
	player := c.playerSide()
	st.relationAfter = s.SideRelation(player, st.target)
	if side := s.Sides[player]; side != nil {
		st.warinessAfter = side.WarWeariness
	}
	causedBy := ""
	if row, found := c.log.LatestFor(model.KindSide, player, "side_war_weariness"); found {
		causedBy = RowID(row.ID)
	}
	return wire.MakePeaceResult{
		Accepted:        true,
		SideID:          EntityID(model.KindSide, st.target),
		WarsEnded:       st.warsEnded,
		AtWar:           s.AtWar(player, st.target),
		RelationBefore:  round3(st.relationBefore),
		RelationAfter:   round3(st.relationAfter),
		WearinessBefore: round3(st.warinessBefore),
		WearinessAfter:  round3(st.warinessAfter),
		CausedBy:        causedBy,
	}
}

// PayTribute hands gold to another faction for goodwill, buying off a declared
// war when diplomacy.tribute_ends_war is set.
func (c *Campaign) PayTribute(ctx context.Context, req wire.DiplomacyRequest) (any, error) {
	target, err := c.resolveDiplomacyTarget(req)
	if err != nil {
		return nil, err
	}
	if req.Amount < 0 {
		return nil, unprocessablef("A tribute is a payment, not a demand for one back.",
			"amount must not be negative, got %v", req.Amount)
	}
	c.mu.RLock()
	player := c.playerSide()
	demand := c.tributeAmount(player, target, req.Amount)
	c.mu.RUnlock()
	if p := c.state.Parties[c.party]; p == nil || p.Gold <= 0 {
		return nil, unprocessablef("You have nothing to pay with.",
			"the player's party has %v gold", p.Gold)
	}

	j := newJob("diplomacy-pay-tribute",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stagePayTribute(v, w, target, demand)
		},
		func(c *Campaign, s *model.State, staged any) any {
			return c.finishPayTribute(s, staged)
		})
	return c.Submit(ctx, j)
}

// stagePayTribute moves the money, buys the goodwill, and ends the war if tribute
// is configured to do that.
func (c *Campaign) stagePayTribute(v *sim.View, w *sim.WriteSet, target int, demand float64) (any, error) {
	player := c.playerSide()
	other := v.State.Sides[target]
	if other == nil {
		return nil, notFoundf("no side %d", target)
	}
	staged := &diplomacyStaged{
		action:         "pay-tribute",
		target:         target,
		demand:         demand,
		relationBefore: v.State.SideRelation(player, target),
		treasuryBefore: other.Treasury,
		tributeShare:   c.cfg.Diplomacy.TributeTakesTreasuryShare,
	}
	// What the tribute actually charges is the demand clipped to the purse. It is
	// decided here, inside the tick, rather than measured afterwards: the currency
	// system converts between money and gold on every tick, so a gold delta read
	// across one would report that conversion as this order's cost.
	if p := v.State.Parties[c.party]; p != nil {
		staged.amountPaid = demand
		if p.Gold < staged.amountPaid {
			staged.amountPaid = p.Gold
		}
		if staged.amountPaid < 0 {
			staged.amountPaid = 0
		}
	}
	read := fmt.Sprintf("the player paid tribute to %s", other.Name)
	causes := v.Log.RecentFor(model.KindSide, target, []string{"side_treasury"}, 2)

	// The money moves between treasuries: the player's party purse is spent and
	// the receiving side's reserve grows. It is not taxed and it is not laundered
	// through a town, because a tribute that passed through a town would be a
	// trade route in all but name.
	// The amount staged is what the purse can actually bear. party_gold is clamped
	// at zero by the engine, so staging the full demand against a thinner purse
	// would credit the receiving treasury with money that never left.
	w.Add(model.KindParty, c.party, "party_gold", -staged.amountPaid, read, causes,
		"tribute to "+other.Name)
	w.Add(model.KindSide, target, "side_treasury", staged.amountPaid, read, causes,
		"tribute from the player's side")

	// Tribute buys opinion. The gain is a constant rather than a share of the
	// payment, so a player cannot buy friendship by paying enormously: what
	// changes with the amount is the other faction's reserve, not its opinion of
	// the player.
	w.AddSideRelation(player, target, c.cfg.Diplomacy.TributeRelationGain,
		read, causes, "paid tribute")

	// And it may buy the war out. This is a flag in the balance file rather than a
	// rate, because a partial buyout is a war ended or not, and there is no
	// middle where half a war is over.
	if c.cfg.Diplomacy.TributeEndsWar > 0 {
		if ids := c.activeWarIDsBetween(player, target); len(ids) > 0 {
			for _, wid := range ids {
				w.Set(model.KindWar, wid, "war_end_tick", float64(v.Tick),
					read, causes, "bought out with tribute")
			}
			staged.warsEnded = len(ids)
			staged.endedWar = true
			if side := v.State.Sides[player]; side != nil {
				w.Add(model.KindSide, player, "side_war_weariness",
					-side.WarWeariness*(1-c.cfg.FactionAI.PeaceWearinessRelief),
					read, causes, "the war is over and the exhaustion eases")
			}
			if !w.HasSet(model.KindSide, player, "side_enemy") {
				w.Set(model.KindSide, player, "side_enemy", -1, read, causes, "bought out")
			}
		}
	}
	return staged, nil
}

// finishPayTribute reads the committed world back.
//
// Amount is the movement in the party's purse, not the demand: the engine clamps
// a party's gold at zero, so a player who cannot quite afford the full tribute
// pays part of it, and reporting the demand would credit them with a payment they
// did not make.
func (c *Campaign) finishPayTribute(s *model.State, staged any) any {
	st, ok := staged.(*diplomacyStaged)
	if !ok {
		return nil
	}
	player := c.playerSide()
	st.relationAfter = s.SideRelation(player, st.target)
	if other := s.Sides[st.target]; other != nil {
		st.treasuryAfter = other.Treasury
	}
	causedBy := ""
	if row, found := c.log.LatestFor(model.KindSide, st.target, "side_treasury"); found {
		causedBy = RowID(row.ID)
	}
	return wire.PayTributeResult{
		Accepted:       true,
		SideID:         EntityID(model.KindSide, st.target),
		Amount:         round2(st.amountPaid),
		Demand:         round2(st.demand),
		TreasuryBefore: round2(st.treasuryBefore),
		TreasuryAfter:  round2(st.treasuryAfter),
		EndedWar:       st.endedWar,
		AtWar:          s.AtWar(player, st.target),
		RelationBefore: round3(st.relationBefore),
		RelationAfter:  round3(st.relationAfter),
		TributeShare:   round3(st.tributeShare),
		CausedBy:       causedBy,
	}
}

// FormAlliance ties the player's side to another faction.
func (c *Campaign) FormAlliance(ctx context.Context, req wire.DiplomacyRequest) (any, error) {
	target, err := c.resolveDiplomacyTarget(req)
	if err != nil {
		return nil, err
	}
	c.mu.RLock()
	refusal := c.allianceRefusal(target)
	c.mu.RUnlock()
	if refusal != nil {
		return nil, refusal
	}

	j := newJob("diplomacy-form-alliance",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stageFormAlliance(v, w, target)
		},
		func(c *Campaign, s *model.State, staged any) any {
			return c.finishFormAlliance(s, staged)
		})
	return c.Submit(ctx, j)
}

// allianceRefusal says why an alliance cannot be formed.
//
// The relation floor is the important one. An alliance is a mutual obligation, and
// letting a player form one with a faction that despises them would hand out the
// strongest diplomatic tool in the game for free. Below the floor the answer is a
// gift, and the refusal says so rather than only quoting the number.
func (c *Campaign) allianceRefusal(target int) error {
	player := c.playerSide()
	if target == player {
		return unprocessablef("A faction cannot ally with itself.",
			"target side %d is the player's own side", target)
	}
	if other := c.state.Sides[target]; other != nil && other.Vassal {
		return unprocessablef("They swear to someone else already.",
			"side %d is a vassal", target)
	}
	if c.state.AtWar(player, target) {
		return conflictf("You cannot ally with a faction you are at war with.",
			"the player's side %d is at war with side %d", player, target)
	}
	if already := c.areAllied(player, target); already {
		return conflictf("You are already allies.",
			"sides %d and %d are already allied", player, target)
	}
	rel := c.state.SideRelation(player, target)
	if need := c.cfg.Diplomacy.MinAllianceRelation; rel < need {
		return unprocessablef(
			fmt.Sprintf("They will not swear to you at this remove. You would need %s of goodwill; you have %s.",
				trimNum2(need), trimNum2(rel)),
			"relation is %g, diplomacy.min_alliance_relation is %g", rel, need)
	}
	return nil
}

// stageFormAlliance writes both sides' Ally fields and opens the trade pact.
//
// Both fields are written because worldgen writes both, and a one-way alliance
// would be an alliance that evaporates the moment either side read its own field.
func (c *Campaign) stageFormAlliance(v *sim.View, w *sim.WriteSet, target int) (any, error) {
	player := c.playerSide()
	staged := &diplomacyStaged{
		action:         "form-alliance",
		target:         target,
		relationBefore: v.State.SideRelation(player, target),
		tradePact:      c.cfg.Diplomacy.AllianceTradePact > 0,
		allied:         true,
	}
	read := fmt.Sprintf("the player formed an alliance with side %d", target)
	causes := v.Log.RecentFor(model.KindSide, player, []string{"side_ally"}, 2)

	if !w.HasSet(model.KindSide, player, "side_ally") {
		w.Set(model.KindSide, player, "side_ally", float64(target), read, causes, "allied")
	}
	if !w.HasSet(model.KindSide, target, "side_ally") {
		w.Set(model.KindSide, target, "side_ally", float64(player), read, causes, "allied")
	}
	// relation.allied_relation_bonus is the same constant worldgen applies, so an
	// alliance formed by a player and one formed by the generator are worth the
	// same amount of goodwill.
	w.AddSideRelation(player, target, c.cfg.Relation.AlliedRelationBonus,
		read, causes, "formed an alliance")

	// A trade pact is not a treaty: it is the faction AI's daily relation drift,
	// which applies to any pair already above faction_ai.pact_relation_threshold.
	// So an alliance "opens" a pact by lifting the pair over that line, and the
	// flag says whether forming an alliance should try to do that at all.
	if staged.tradePact {
		if v.State.SideRelation(player, target)+c.cfg.Relation.AlliedRelationBonus >
			c.cfg.FactionAI.PactRelationThreshold {
			staged.tradePact = true
		} else {
			staged.tradePact = false
		}
	}
	return staged, nil
}

// finishFormAlliance reads the committed world back.
func (c *Campaign) finishFormAlliance(s *model.State, staged any) any {
	st, ok := staged.(*diplomacyStaged)
	if !ok {
		return nil
	}
	player := c.playerSide()
	st.relationAfter = s.SideRelation(player, st.target)
	causedBy := ""
	if row, found := c.log.LatestFor(model.KindSide, player, "side_ally"); found {
		causedBy = RowID(row.ID)
	}
	return wire.FormAllianceResult{
		Accepted:         true,
		SideID:           EntityID(model.KindSide, st.target),
		Allied:           c.areAllied(player, st.target),
		TradePact:        st.tradePact,
		RelationBefore:   round3(st.relationBefore),
		RelationAfter:    round3(st.relationAfter),
		RelationRequired: round3(c.cfg.Diplomacy.MinAllianceRelation),
		CausedBy:         causedBy,
	}
}

// -- helpers ---------------------------------------------------------------

// resolveDiplomacyTarget turns the request's side reference into a side id.
//
// It accepts a wire id or a name slug, on the same rule as townByRef: the client
// sends ids on most routes and names on some, and this server must answer both
// without asking the client to change.
func (c *Campaign) resolveDiplomacyTarget(req wire.DiplomacyRequest) (int, error) {
	if err := c.validateOrderDay(req.ExpectedDay); err != nil {
		return -1, err
	}
	ref := strings.TrimSpace(req.SideID)
	if ref == "" {
		return -1, badRequestf("sideId is required: name the faction this order is about")
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	if kind, id, ok := ParseEntityID(ref); ok && kind == model.KindSide {
		if s := c.state.Sides[id]; s != nil {
			return id, nil
		}
		return -1, notFoundf("no side %q", ref)
	}
	slug := Slug(ref)
	for _, id := range c.state.SideIDs() {
		if s := c.state.Sides[id]; s != nil && Slug(s.Name) == slug {
			return id, nil
		}
	}
	return -1, notFoundf("no side %q", ref)
}

// activeWarIDsBetween returns the active wars between two sides, in ascending id
// order. It reads WarIDs rather than ranging the map, because a map iteration
// would make a peace end a nondeterministic subset when a duplicate war exists,
// and State.AtWar has a regression test pinning exactly that hazard.
func (c *Campaign) activeWarIDsBetween(a, b int) []int {
	var out []int
	if a < 0 || b < 0 {
		return out
	}
	for _, id := range c.state.WarIDs() {
		w := c.state.Wars[id]
		if w == nil || w.EndTick >= 0 {
			continue
		}
		if (w.SideA == a && w.SideB == b) || (w.SideA == b && w.SideB == a) {
			out = append(out, id)
		}
	}
	return out
}

// activeWarsFor is how many active wars a side holds, used for the cap and shown
// on the board so a client can grey the button out before the player presses it.
func (c *Campaign) activeWarsFor(side int) int {
	n := 0
	for _, w := range c.state.ActiveWars() {
		if side >= 0 && (w.SideA == side || w.SideB == side) {
			n++
		}
	}
	return n
}

// townsHeldBy counts the settlements a side controls.
//
// HolderSide is the current holder, which is what control means; a town's SideID
// is the generation-time assignment and goes stale the moment it changes hands.
func (c *Campaign) townsHeldBy(side int) int {
	n := 0
	for _, id := range c.state.TownIDs() {
		if t := c.state.Towns[id]; t != nil && t.HolderSide == side {
			n++
		}
	}
	return n
}

// areAllied reports a formal alliance in either direction.
func (c *Campaign) areAllied(a, b int) bool {
	if a < 0 || b < 0 {
		return false
	}
	if x, y := c.state.Sides[a], c.state.Sides[b]; x != nil && y != nil {
		if x.Ally == b || y.Ally == a {
			return true
		}
	}
	return false
}

// tributeDemand is what a faction would demand to buy off a war, and whether the
// player could pay it.
//
// It is computed by the same function PayTribute charges with, so the figure on the
// board is the figure that will be taken. A board that priced a button
// differently from the button's own cost is worse than no price at all.
func (c *Campaign) tributeDemand(player, target int) (float64, bool) {
	demand := c.tributeAmount(player, target, 0)
	p := c.state.Parties[c.party]
	if p == nil {
		return demand, false
	}
	return demand, p.Gold >= demand
}

// tributeAmount prices a tribute.
//
// The demand is the base plus a per-town charge for what the demanding side
// actually holds, scaled by a share of its treasury. That is the whole shape of
// the decision: a faction with four towns asks more than one with one, and a
// faction whose treasury has been emptied by a war is cheap to buy off. Scaling
// by treasury rather than paying a flat rate is what makes tribute a diplomatic
// instrument against a bankrupt enemy instead of a fixed toll.
//
// A named amount overrides the demand, but never exceeds it. A client that asked
// for ten times the demand would be asking for a treaty, not a tribute, and the
// server prices treaties through pay-tribute's war buyout instead.
func (c *Campaign) tributeAmount(player, target int, requested float64) float64 {
	d := c.cfg.Diplomacy
	demand := d.TributeBase + d.TributePerTown*float64(c.townsHeldBy(target))
	if other := c.state.Sides[target]; other != nil {
		demand *= 1 + d.TributeTakesTreasuryShare*(other.Treasury/1000)
	}
	if demand < 0 {
		demand = 0
	}
	if requested > 0 {
		if requested < demand {
			demand = requested
		}
	}
	return demand
}

// trimNum2 renders a small number for a sentence, keeping a fraction rather than
// rounding goodwill to nothing.
//
// A refusal that says "you have 0 of 0.55" reads as though the player had none of
// something, when in fact they have most of it. Relation is a score on -1 to 1
// and rounding it to whole numbers throws away the part of the number a player
// needs to see.
func trimNum2(v float64) string { return fmt.Sprintf("%.2f", v) }
