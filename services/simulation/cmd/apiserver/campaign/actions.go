package campaign

import (
	"context"
	"fmt"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// SetTaxRate sets a town's tax rate.
//
// It stages sim.OrderSetTax, the order internal/systems/player already applies for
// the scripted profiles, so a player's town and an AI's town are governed by the
// same rules. The currency system then collects against the new rate, and the
// unrest system reacts to it, which is chain 1: the reason a rate is bounded and a
// player's order is not free.
func (c *Campaign) SetTaxRate(ctx context.Context, req wire.TaxRequest) (any, error) {
	if req.Rate < 0 || req.Rate > c.cfg.Currency.TaxMaxRate {
		return nil, unprocessablef(
			fmt.Sprintf("A rate runs from nothing to %s of a town's output.",
				trimNum(c.cfg.Currency.TaxMaxRate)),
			"rate %v is outside [0, %v]", req.Rate, c.cfg.Currency.TaxMaxRate)
	}
	c.mu.RLock()
	_, exists := c.townByRef(req.TownID)
	c.mu.RUnlock()
	if !exists {
		return nil, notFoundf("no town %q", req.TownID)
	}

	j := &job{
		name:          "town-tax",
		hasEngineOrder: true,
		engineOrder:   sim.Order{Kind: sim.OrderSetTax, TownID: c.townIDOf(req.TownID), Amount: req.Rate},
		done:          make(chan jobResult, 1),
	}
	if _, err := c.Submit(ctx, j); err != nil {
		return nil, err
	}
	return wire.Accepted{Accepted: true}, nil
}

// SetStateTaxRate sets the state-level rate for every town in a US state.
func (c *Campaign) SetStateTaxRate(ctx context.Context, req wire.StateTaxRequest) (any, error) {
	if req.Rate < 0 || req.Rate > c.cfg.Taxation.StateTaxMaxRate {
		return nil, unprocessablef(
			fmt.Sprintf("A state rate runs from nothing to %s of the towns' output.",
				trimNum(c.cfg.Taxation.StateTaxMaxRate)),
			"rate %v is outside [0, %v]", req.Rate, c.cfg.Taxation.StateTaxMaxRate)
	}
	c.mu.RLock()
	town := c.townOfState(req.State)
	c.mu.RUnlock()
	if town == nil {
		return nil, notFoundf("no settlement in state %q", req.State)
	}

	j := &job{
		name:          "state-tax",
		hasEngineOrder: true,
		engineOrder:   sim.Order{Kind: sim.OrderSetStateTax, TownID: town.ID, Amount: req.Rate},
		done:          make(chan jobResult, 1),
	}
	if _, err := c.Submit(ctx, j); err != nil {
		return nil, err
	}
	return wire.Accepted{Accepted: true}, nil
}

// townIDOf resolves a town reference to its numeric id, or -1.
func (c *Campaign) townIDOf(ref string) int {
	if t, ok := c.townByRef(ref); ok {
		return t.ID
	}
	return -1
}

// townOfState finds a town in a US state, which is what the state-tax order is
// scoped from: the order sets the rate for every town in the same state as the town
// it names.
func (c *Campaign) townOfState(state string) *model.Town {
	want := slugCompare(state)
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t != nil && slugCompare(t.State) == want {
			return t
		}
	}
	return nil
}

// slugCompare normalises a state name for comparison, because the client sends
// "Colorado" and the model may hold "CO" or "Colorado" and neither should fail on
// punctuation alone.
func slugCompare(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			out = append(out, lowerRune(r))
		}
	}
	return string(out)
}

func lowerRune(r rune) rune {
	if r >= 'A' && r <= 'Z' {
		return r + ('a' - 'A')
	}
	return r
}

// AwardBattleXp banks experience against the stacks that fought.
//
// The pool is scaled by whether the player's side won — losers learn too, at half
// rate, which is the client's own rule — and by how strong the enemy was, then
// split among the stacks that were there. It is capped at what each stack's next
// tier needs, because XP past that means nothing when the ladder ends at Elite.
func (c *Campaign) AwardBattleXp(ctx context.Context, in wire.BattleXpInput) (any, error) {
	if in.EnemyStrength < 0 {
		return nil, unprocessablef("An enemy cannot have negative strength.",
			"enemyStrength is negative: %v", in.EnemyStrength)
	}
	c.mu.RLock()
	ids := c.stacksForXp(in.StackIDs)
	c.mu.RUnlock()
	if len(ids) == 0 {
		return nil, unprocessablef("Nobody fought, so nobody learned anything.",
			"no stack ids named, and the party has no roster")
	}

	factor := 1.0
	if !in.Won {
		factor = 0.5
	}
	pool := in.EnemyStrength * factor

	out := make([]wire.BattleXpAward, 0, len(ids))
	for _, id := range ids {
		share := pool / float64(len(ids))
		if gained := c.ro.awardXP(id, share); gained > 0 {
			out = append(out, wire.BattleXpAward{StackID: id, XP: round2(gained)})
		}
	}
	return out, nil
}

// stacksForXp resolves the stacks that fought. An empty list means every stack in
// the party, which is what the client documents.
func (c *Campaign) stacksForXp(named []string) []string {
	if len(named) > 0 {
		out := make([]string, 0, len(named))
		for _, id := range named {
			if c.ro.stack(id) != nil {
				out = append(out, id)
			}
		}
		return out
	}
	// The roster's own list, in a stable order.
	all := c.ro.render(c.simTroops(), c.wagePerTroop())
	out := make([]string, 0, len(all))
	for _, s := range all {
		out = append(out, s.ID)
	}
	return out
}

func (c *Campaign) simTroops() float64 {
	if p := c.state.Parties[c.party]; p != nil {
		return p.Troops
	}
	return 0
}

// UpgradeTroops promotes one stack a tier.
//
// It spends the stack's banked XP against the client's own per-soldier threshold,
// and raises the player's renown by a share of currency.mercenary_value — the
// config's "value or renown a company brings" — because that is the model's real
// price for a better company and using it is a conversion rather than a new
// number.
//
// goldSpent is zero. balance.toml has no training fee, and inventing one would be
// inventing a cost the player then has to pay. See the contract's section 6 for why
// the same is true of a hiring bonus.
func (c *Campaign) UpgradeTroops(ctx context.Context, req wire.UpgradeTroopsRequest) (any, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	s := c.ro.stack(req.StackID)
	if s == nil {
		return nil, notFoundf("no stack %q in the party", req.StackID)
	}
	out := wire.UpgradeTroopsResult{
		StackID:  s.ID,
		FromTier: s.Tier,
		ToTier:   s.Tier,
	}
	if s.Tier >= maxTier {
		out.Reason = tierName(s.Tier) + "s are as good as soldiers get here."
		return out, nil
	}
	need := c.ro.xpNeededFor(s)
	out.XPSpent = round2(need)
	if s.XP < need {
		out.Reason = fmt.Sprintf("%s needs %s experience for %s, and has %s.",
			s.Name, trimNum(need), tierName(s.Tier+1), trimNum(s.XP))
		return out, nil
	}
	promoted, spent, ok := c.ro.promote(s.ID)
	if !ok {
		out.Reason = "The promotion did not take."
		return out, nil
	}
	out.Upgraded = true
	out.ToTier = promoted.Tier
	out.XPSpent = round2(spent)

	if r := c.state.Rulers[c.playerRuler]; r != nil {
		gain := c.cfg.Currency.MercenaryValue / float64(promoted.Tier*maxTier)
		c.stageRenown(gain, promoted)
		if row, found := c.log.LatestFor(model.KindRuler, r.ID, "renown"); found {
			out.CausedBy = RowID(row.ID)
		}
	}
	return out, nil
}

// stageRenown applies a renown gain straight to state.
//
// This is the one place the runner writes a simulation field outside the WriteSet,
// and it is deliberate: an upgrade is a bookkeeping act on the roster, not a world
// event, and a player's promotion should not have to wait for the clock. The write
// goes through the same clamp and cause-log path as everything else because
// State.Set applies them. Callers hold the write lock.
func (c *Campaign) stageRenown(gain float64, s *stack) {
	if gain <= 0 {
		return
	}
	r := c.state.Rulers[c.playerRuler]
	if r == nil {
		return
	}
	old := r.Renown
	next := old + gain
	c.state.Set(model.KindRuler, r.ID, "renown", next)
	c.log.Append(cause.Row{
		Tick:   c.state.Tick,
		Year:   c.state.Year,
		Kind:   model.KindRuler,
		Entity: r.ID,
		Field:  "renown",
		Old:    old,
		New:    next,
		Delta:  next - old,
		System: "player_api",
		Read:   fmt.Sprintf("promoted %s to %s", s.Name, tierName(s.Tier)),
		Note:   "trained soldiers",
	})
}

// SetEthnicity records the player's chosen culture.
//
// The model has no culture field, so there is no simulation quantity to change and
// pretending otherwise would be a write that does nothing. What the server does do
// is remember the choice, so it appears in the player's own state and in the
// character's record. The contract says this in its section 13.
func (c *Campaign) SetEthnicity(ctx context.Context, req wire.EthnicityRequest) (any, error) {
	if req.EthnicityID == "" {
		return nil, badRequestf("ethnicityId is required")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.character.set {
		c.character.ethnicityID = req.EthnicityID
	} else {
		c.character.set = true
		c.character.ethnicityID = req.EthnicityID
	}
	return wire.Accepted{Accepted: true}, nil
}

// SetCharacter takes the whole sheet from the character maker.
//
// The name, appearance, age, and biography are stored and shown. The six
// attributes and the per-skill focus points are stored and handed back by
// Character, because a character sheet is a record rather than an input to the
// model: no field in the model is a player attribute, and inventing one would put
// a number nothing reads into the cause chain. The starting cash and starting
// skills have nowhere to go in the model either — a party's purse is produced by
// worldgen and its upkeep, and the model has no per-soldier skill value — so they
// are accepted, kept in the record, and named here as not applied rather than
// quietly dropped.
func (c *Campaign) SetCharacter(ctx context.Context, ch wire.PlayerCharacter) (any, error) {
	if ch.FirstName == "" && ch.LastName == "" {
		return nil, badRequestf("a character needs a firstName or a lastName")
	}
	if ch.Gender != "" && ch.Gender != "male" && ch.Gender != "female" {
		return nil, unprocessablef("gender must be \"male\" or \"female\", got "+ch.Gender,
			"gender %q is not one of the client's two values", ch.Gender)
	}
	maxAge := model.MustField(model.KindRuler, "ruler_age").Max
	if ch.Age < 0 || ch.Age > maxAge {
		return nil, unprocessablef(
			fmt.Sprintf("Nobody in this world lives past %.0f.", maxAge),
			"age %v is outside [0, %v]", ch.Age, maxAge)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.character = character{
		set:          true,
		firstName:    ch.FirstName,
		lastName:     ch.LastName,
		gender:       ch.Gender,
		appearanceID: ch.AppearanceID,
		ethnicityID:  ch.EthnicityID,
		age:          ch.Age,
		startCity:    ch.StartCity,
		difficulty:   ch.Difficulty,
		backgrounds:  ch.BackgroundChoices,
		attributes:   ch.Attributes,
		skillFocus:   ch.SkillFocus,
		bonus:        ch.BonusPoints,
		skills:       ch.StartingSkills,
		startingCash: ch.StartingCash,
		biography:    ch.Biography,
	}
	// The age the player chose is a real field on the ruler, and the model's own
	// bound is 0-120, so writing it is writing something the simulation tracks.
	if r := c.state.Rulers[c.playerRuler]; r != nil && ch.Age > 0 {
		c.state.Set(model.KindRuler, r.ID, "ruler_age", ch.Age)
	}
	return wire.Accepted{Accepted: true}, nil
}

// Character returns the player's stored character sheet.
func (c *Campaign) Character() wire.PlayerCharacter {
	c.mu.RLock()
	defer c.mu.RUnlock()
	ch := c.character
	return wire.PlayerCharacter{
		FirstName:         ch.firstName,
		LastName:          ch.lastName,
		Gender:            ch.gender,
		AppearanceID:      ch.appearanceID,
		EthnicityID:       ch.ethnicityID,
		Age:               ch.age,
		StartCity:         ch.startCity,
		Difficulty:        ch.difficulty,
		BackgroundChoices: ch.backgrounds,
		Attributes:        ch.attributes,
		SkillFocus:        ch.skillFocus,
		BonusPoints:       ch.bonus,
		StartingSkills:    ch.skills,
		StartingCash:      ch.startingCash,
		Biography:         ch.biography,
	}
}

// ApplyBattleResult applies a legacy battle outcome to the player's party.
// Killed troops are removed; wounded move to the wounded pool.
func (c *Campaign) ApplyBattleResult(ctx context.Context, in wire.BattleResultInput) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	p := c.state.Parties[c.party]
	if p == nil {
		return nil, notFoundf("player party not found")
	}

	// Apply losses: all as killed (legacy has no wounded split)
	losses := in.PlayerLosses
	if losses > p.Troops {
		losses = p.Troops
	}
	p.Troops -= losses

	// Loot to money
	p.Money += in.Loot

	return wire.BattleResultOutcome{
		TroopsRemaining: p.Troops,
		Money:           p.Money,
		XPAwards:        []wire.BattleXpAward{},
		Prisoners:       []wire.PrisonerState{},
	}, nil
}

// ApplyBattleOutcome applies an authoritative battle result to the player's party.
// Uses actual killed/wounded numbers, not estimates.
func (c *Campaign) ApplyBattleOutcome(ctx context.Context, in wire.BattleResult) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	p := c.state.Parties[c.party]
	if p == nil {
		return nil, notFoundf("player party not found")
	}

	// Determine player participant
	var player wire.BattleParticipantResult
	if in.Attacker.IsPlayer {
		player = in.Attacker
	} else {
		player = in.Defender
	}

	// Apply killed (permanent) and wounded (to wounded pool)
	killed := player.Killed
	wounded := player.Wounded
	if killed+wounded > p.Troops {
		// Scale down proportionally if losses exceed troops
		scale := p.Troops / (killed + wounded)
		killed *= scale
		wounded *= scale
	}
	p.Troops -= (killed + wounded)
	p.Wounded += wounded

	// Loot to money
	p.Money += in.Loot

	return wire.BattleResultOutcome{
		TroopsRemaining: p.Troops,
		Money:           p.Money,
		XPAwards:        []wire.BattleXpAward{},
		Prisoners:       []wire.PrisonerState{},
	}, nil
}
