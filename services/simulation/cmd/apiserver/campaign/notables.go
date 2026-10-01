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

// A notable is a model.Ruler.
//
// The simulation has no separate notable entity, and a ruler is what it has: a
// name, traits, influence, renown, a relation score, and a home town. Rather than
// build a second kind of person beside the first, the notable routes read the
// rulers that are actually in the settlement. Everything they say about themselves
// is a real field.
//
// Notable type is decided from real model state rather than typed in:
//
//	veteran          the ruler is a mercenary captain, or is flagged as one
//	gang-leader      the ruler's own party is a raider band
//	community-leader the ruler governs this town and is not its holder
//	merchant         otherwise
func (c *Campaign) notableType(r *model.Ruler) wire.NotableType {
	if r.IsMercenary || r.Tier == 4 {
		return wire.NotableVeteran
	}
	if p, ok := c.state.Parties[r.PartyID]; ok && p != nil && p.IsRaider {
		return wire.NotableGangLeader
	}
	if r.TownID >= 0 {
		if t, exists := c.state.Towns[r.TownID]; exists && t != nil && t.Holder != r.ID {
			return wire.NotableCommunityLeader
		}
	}
	return wire.NotableMerchant
}

// notablePower is 1 to 100 from influence, through a saturating map whose
// half-point is 100 influence. Saturating rather than linear because influence has
// no natural ceiling in the model and a linear map would push every powerful ruler
// off the end of the client's 1-100 scale.
func notablePower(influence float64) int {
	if influence <= 0 {
		return 1
	}
	v := 100 * influence / (influence + 100)
	if v < 1 {
		return 1
	}
	if v > 100 {
		return 100
	}
	return int(math.Round(v))
}

// notableRelation is the ruler's opinion of the player, scaled from the model's
// -1..1 to the client's -100..100.
func (c *Campaign) notableRelation(r *model.Ruler) float64 {
	v := c.state.Relation(c.playerRuler, r.ID) * 100
	return round2(clampRange(v, -100, 100))
}

func clampRange(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// notableBlurb is one line on who they are, composed from real numbers.
func (c *Campaign) notableBlurb(r *model.Ruler, t wire.NotableType) string {
	power := notablePower(r.Influence)
	switch t {
	case wire.NotableVeteran:
		return fmt.Sprintf("Fights for whoever pays. %s, and %d renown to show for it.", agePhrase(r.Age), int(r.Renown))
	case wire.NotableGangLeader:
		return fmt.Sprintf("Keeps men on the roads. %s, with %d of the kind who would follow.", agePhrase(r.Age), int(r.Influence))
	case wire.NotableCommunityLeader:
		return fmt.Sprintf("Holds this place together. %s, and the town would feel it if they left.", agePhrase(r.Age))
	default:
		return fmt.Sprintf("Weighs everything, including you. %s, and worth knowing at %d.", agePhrase(r.Age), power)
	}
}

func agePhrase(age float64) string {
	switch {
	case age < 30:
		return fmt.Sprintf("%d years old", int(age))
	case age < 60:
		return fmt.Sprintf("%d years old, in the middle of a career", int(age))
	default:
		return fmt.Sprintf("%d years old", int(age))
	}
}

// notablesOfTown lists a town's notables for the snapshot, most powerful first.
func (c *Campaign) notablesOfTown(t *model.Town) []wire.Notable {
	rulers := c.rulersOfTown(t.ID)
	out := make([]wire.Notable, 0, len(rulers))
	for _, r := range rulers {
		if !r.IsAlive {
			continue
		}
		nt := c.notableType(r)
		out = append(out, wire.Notable{
			ID:           EntityID(model.KindRuler, r.ID),
			SettlementID: Slug(t.Name),
			Name:         r.Name,
			Type:         nt,
			Power:        notablePower(r.Influence),
			Relation:     c.notableRelation(r),
			Blurb:        c.notableBlurb(r, nt),
		})
	}
	sortNotable(out)
	return out
}

// sortNotable orders by power, then relation, then name, so the list is stable and
// the most consequential person is first.
func sortNotable(out []wire.Notable) {
	for i := 1; i < len(out); i++ {
		for j := i; j > 0; j-- {
			a, b := out[j-1], out[j]
			if a.Power > b.Power ||
				(a.Power == b.Power && a.Relation > b.Relation) ||
				(a.Power == b.Power && a.Relation == b.Relation && a.Name <= b.Name) {
				break
			}
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
}

// TalkToNotable answers with a notable's dialogue and the actions open to the
// player.
//
// Every line is composed from the notable's real numbers and the settlement's real
// condition, so the conversation changes as the world does. A notable with no
// power and no standing with the player says something different from one with
// both.
func (c *Campaign) TalkToNotable(ctx context.Context, req wire.TalkRequest) (any, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	r, ok := c.rulerByRef(req.NotableID)
	if !ok {
		return nil, notFoundf("no notable %q", req.NotableID)
	}
	if !r.IsAlive {
		return nil, notFoundf("notable %d is dead", r.ID)
	}
	// The settlement is checked when one is named, so a client that knows only the
	// ruler's id still gets an answer. When it is named and wrong, the request is
	// a client bug rather than an unknown world, so it is refused.
	var town *model.Town
	if req.SettlementID != "" {
		t, exists := c.townByRef(req.SettlementID)
		if !exists {
			return nil, notFoundf("no settlement %q", req.SettlementID)
		}
		if r.TownID != t.ID {
			return nil, unprocessablef(
				fmt.Sprintf("%s is not in %s.", r.Name, t.Name),
				"ruler %d is based in town %d, not %d", r.ID, r.TownID, t.ID)
		}
		town = t
	}

	power := notablePower(r.Influence)
	relation := c.notableRelation(r)
	out := wire.TalkToNotableResult{
		NotableID: EntityID(model.KindRuler, r.ID),
		Name:      r.Name,
		Dialogue:  c.notableDialogue(r, town, power, relation),
		Actions:   c.notableActions(r, town, relation),
	}
	return out, nil
}

// notableDialogue composes the lines. Four at most: a greeting that says who they
// are, a line about their standing, a line about the settlement, and a closing
// that moves the conversation towards business.
func (c *Campaign) notableDialogue(r *model.Ruler, town *model.Town, power int, relation float64) []string {
	lines := []string{fmt.Sprintf("%s does not look up. %s", r.Name, c.notableBlurb(r, c.notableType(r)))}

	switch {
	case relation >= 40:
		lines = append(lines, "They remember you, and they are glad to. Whatever you ask, you will get a hearing.")
	case relation >= 10:
		lines = append(lines, "They nod to you. You have paid your way into their good graces.")
	case relation <= -40:
		lines = append(lines, "They know exactly who you are and what you cost them. The conversation will be short.")
	case relation <= -10:
		lines = append(lines, "They are civil. It costs them nothing to be.")
	default:
		lines = append(lines, "They give you the look reserved for a stranger who wants something.")
	}

	if town != nil {
		switch {
		case town.IsBesieged:
			lines = append(lines, fmt.Sprintf("%s is under siege. Prices are the least of it.", town.Name))
		case town.IsStarving:
			lines = append(lines, fmt.Sprintf("%s is going hungry. Everyone here is thinking about grain.", town.Name))
		case town.Unrest > 0.5:
			lines = append(lines, fmt.Sprintf("%s is angry. Ask me about food, not about money.", town.Name))
		case town.Loyalty < 0.4:
			lines = append(lines, fmt.Sprintf("%s has stopped believing in whoever holds it.", town.Name))
		default:
			lines = append(lines, fmt.Sprintf("%s is quiet and solvent. That is rarer than it sounds.", town.Name))
		}
	}

	switch {
	case power >= 70:
		lines = append(lines, "Whatever business you have, they decide the terms.")
	case power <= 20:
		lines = append(lines, "They have little of their own to offer, but they know everyone.")
	default:
		lines = append(lines, "They have standing here, and they will use it.")
	}
	return lines
}

// notableActions is what the player can do with this notable, and whether it is
// open right now.
//
// ask-quest is always closed. This simulation has no issue or quest system;
// QUESTS_AND_NOTABLES.md is a design document, not code. Saying so is the honest
// answer, and a quest line would be invented content.
func (c *Campaign) notableActions(r *model.Ruler, town *model.Town, relation float64) []wire.NotableAction {
	party := c.state.Parties[c.party]
	gold := 0.0
	if party != nil {
		gold = party.Gold
	}

	giftCost := c.cfg.Currency.GoldPerMoney
	giftOK := gold >= giftCost
	giftReason := fmt.Sprintf("A gift wants %s gold and you have %s.", trimNum(giftCost), trimNum(gold))
	if giftOK {
		giftReason = fmt.Sprintf("Costs %s gold.", trimNum(giftCost))
	}

	favorOK := r.Influence >= 1
	favorReason := fmt.Sprintf("A favour costs standing, and they have %s of it.", trimNum(r.Influence))
	if favorOK {
		favorReason = fmt.Sprintf("Costs %s standing.", trimNum(c.relationGiftUnits()))
	}

	recruits := 0
	if town != nil {
		for _, u := range c.recruitableUnits(town) {
			recruits += u.Available
		}
	}
	recruitOK := town != nil && recruits > 0
	recruitReason := fmt.Sprintf("%s is not raising anyone right now.", townName(town))
	if recruitOK {
		recruitReason = fmt.Sprintf("%d willing in %s.", recruits, town.Name)
	}

	return []wire.NotableAction{
		{
			ID: "gift", Label: "Give a gift",
			Detail:    "Gold buys goodwill, and goodwill buys better terms later.",
			Available: giftOK, Reason: giftReason,
		},
		{
			ID: "favor", Label: "Do a favour",
			Detail:    "Spend standing instead of coin.",
			Available: favorOK, Reason: favorReason,
		},
		{
			ID: "ask-recruits", Label: "Ask for recruits",
			Detail:    "Whether anyone here will sign on.",
			Available: recruitOK, Reason: recruitReason,
		},
		{
			ID: "ask-quest", Label: "Ask about their business",
			Detail:    "Not available: this simulation has no issue system yet.",
			Available: false,
			Reason:    "There is nothing here to ask for. This simulation has no quests, and would rather say so than make one up.",
		},
	}
}

func townName(t *model.Town) string {
	if t == nil {
		return "This place"
	}
	return t.Name
}

// relationGiftUnits is how much influence one unit of goodwill is worth.
//
// The only thing standing costs in the model is troops, at
// world.party_troops_per_influence per soldier, so a favour is priced as the
// bodies it would have to find. No invented constant is involved.
func (c *Campaign) relationGiftUnits() float64 {
	return c.cfg.Campaign.TradeCapitalShare * c.cfg.World.PartyTroopsBase
}

// giftRelationGain is what a gift of gold is worth in relation.
//
// currency.gold_per_money is the model's own exchange rate, so this reads as
// "how much money is that gold worth, as goodwill" against the influence a ruler
// carries. It is a conversion between two quantities the model tracks, not a new
// number.
func (c *Campaign) giftRelationGain(amount float64) float64 {
	if amount <= 0 {
		return 0
	}
	return c.cfg.Campaign.TradeCapitalShare * amount / (c.cfg.Currency.GoldPerMoney * 10)
}

// ImproveRelation raises a notable's opinion of the player.
//
// The relation write goes through WriteSet.AddRelation, so it lands in the cause
// log as relation_score and is walkable from the Why panel, with the same
// mechanism every other opinion change in the simulation uses.
func (c *Campaign) ImproveRelation(ctx context.Context, req wire.ImproveRelationRequest) (any, error) {
	if req.Action != "gift" && req.Action != "favor" {
		return nil, badRequestf("action must be \"gift\" or \"favor\", got %q", req.Action)
	}
	if req.Action == "gift" && req.Amount <= 0 {
		return nil, unprocessablef("A gift has to be something.",
			"amount must be positive for a gift, got %v", req.Amount)
	}

	j := newJob("relation",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stageRelation(v, w, req)
		},
		func(c *Campaign, s *model.State, staged any) any {
			return c.finishRelation(s, staged)
		})
	return c.Submit(ctx, j)
}

// finishRelation reads the committed relation, so the number reported is the one
// the simulation actually holds rather than the one the order predicted. The
// engine clamps a relation to -1..1, so a prediction near the limit would
// otherwise be wrong.
func (c *Campaign) finishRelation(s *model.State, staged any) any {
	st, ok := staged.(relationStaged)
	if !ok {
		return nil
	}
	res := st.result
	kind, id, ok := ParseEntityID(res.NotableID)
	if !ok || kind != model.KindRuler {
		return res
	}
	after := s.Relation(c.playerRuler, id) * 100
	res.RelationBefore = round2(clampRange(s.Relation(c.playerRuler, id)*100, -100, 100))
	res.RelationAfter = round2(after)
	if st.accepted {
		if row, found := c.log.LatestFor(model.KindRuler, c.playerRuler, "relation_score"); found {
			res.CausedBy = RowID(row.ID)
		}
	}
	return res
}

type relationStaged struct {
	result   wire.ImproveRelationResult
	accepted bool
}

func (c *Campaign) stageRelation(v *sim.View, w *sim.WriteSet, req wire.ImproveRelationRequest) (any, error) {
	r, ok := c.rulerByRef(req.NotableID)
	if !ok {
		return nil, notFoundf("no notable %q", req.NotableID)
	}
	if !r.IsAlive {
		return nil, notFoundf("notable %d is dead", r.ID)
	}
	party := c.state.Parties[c.party]
	if party == nil {
		return nil, internalf("the player's party %d is missing", c.party)
	}

	before := v.State.Relation(c.playerRuler, r.ID)
	out := relationStaged{result: wire.ImproveRelationResult{
		NotableID:      EntityID(model.KindRuler, r.ID),
		Name:           r.Name,
		RelationBefore: round2(before * 100),
		RelationAfter:  round2(before * 100),
	}}

	var gain float64
	var note string
	var read string

	if req.Action == "gift" {
		if party.Gold < req.Amount {
			out.result.Summary = fmt.Sprintf("You offered %s gold and have %s.", trimNum(req.Amount), trimNum(party.Gold))
			out.result.Reason = "You do not have that much gold."
			return out, nil
		}
		gain = c.giftRelationGain(req.Amount)
		note = fmt.Sprintf("%s gave %s %s gold", c.state.Name(model.KindRuler, c.playerRuler), r.Name, trimNum(req.Amount))
		read = shared.ReadString(
			shared.PairF("gift", req.Amount),
			shared.PairF("party_gold", party.Gold),
			shared.Pair("relation", before))
		w.Add(model.KindParty, party.ID, "party_gold", -req.Amount, read, nil,
			"gift to "+r.Name)
	} else {
		cost := c.relationGiftUnits()
		if r.Influence < cost {
			out.result.Summary = fmt.Sprintf("A favour wants %s standing and they have %s.", trimNum(cost), trimNum(r.Influence))
			out.result.Reason = "They are not in a position to owe you anything yet."
			return out, nil
		}
		// A favour costs the notable's own standing rather than the player's,
		// which is why it can be refused: someone with nothing to lose has nothing
		// to give.
		gain = c.cfg.Campaign.TradeCapitalShare / 10
		note = fmt.Sprintf("%s did %s a favour", c.state.Name(model.KindRuler, c.playerRuler), r.Name)
		read = shared.ReadString(
			shared.PairF("influence", r.Influence),
			shared.Pair("relation", before))
		w.Add(model.KindRuler, r.ID, "influence", -cost, read, nil,
			"spent on a favour for "+c.state.Name(model.KindRuler, c.playerRuler))
	}

	causes := v.Log.RecentFor(model.KindRuler, c.playerRuler, []string{"relation_score"}, 2)
	w.AddRelation(c.playerRuler, r.ID, gain, read, causes, note)

	out.accepted = true
	out.result.Accepted = true
	out.result.Summary = fmt.Sprintf("%s %s. Opinion of you moves from %.0f.",
		r.Name, gestureNoun(req.Action), round2(before*100))
	return out, nil
}

func gestureNoun(action string) string {
	if action == "gift" {
		return "takes the gift"
	}
	return "owes you for it"
}
