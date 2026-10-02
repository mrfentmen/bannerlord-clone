package barter

import (
	"fmt"
	"strings"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
)

// The two endpoints. `BuildTerms` is the read behind GET /v1/barter/terms and
// the first half of POST /v1/barter/propose; `Appraise` is the answer behind
// POST /v1/barter/propose and the gate in front of POST /v1/barter/commit.
//
// Both are pure reads. Nothing here writes a field, so asking a trader what
// they make of a deal costs the world nothing, which is what lets the panel put
// the "Ask" button on screen at all.

// BuildTerms prices both tables at one place and one moment.
//
// The valuation is the trader's, in the direction that trader deals in, and
// that is the whole of what this function decides. The player side is priced at
// what this lord would pay, because that is what the player is handing over;
// the trader side at what they would ask, because that is what the player walks
// away with. Same market underneath, two margins, and the gap between the two
// is why a deal can be refused.
func BuildTerms(st *model.State, cfg *config.Config, req Request) (Terms, error) {
	player, trader, town := req.PlayerID, req.Trader, req.Town
	if err := checkParticipants(st, player, trader, town); err != nil {
		return Terms{}, err
	}
	t := st.Towns[town]
	l := st.Leaders[trader]
	p := st.Leaders[player]
	party := partyOf(st, player)

	terms := Terms{
		TownID:           townRef(town),
		TraderID:         traderRef(trader),
		PartyID:          partyRef(party),
		TraderName:       l.Name,
		RelationToPlayer: relationToPlayer(st, player, trader),
		Day:              st.Tick,
		TraderItems:      traderTable(st, cfg, l, t),
		PlayerItems:      playerTable(st, cfg, p, party, t),
	}
	return terms, nil
}

// checkParticipants rejects a deal about an entity that is not there.
//
// Each of the four refusals is a distinct error rather than one "bad request",
// because they are four different situations a client can get into and only one
// of them is a malformed request: a town nobody holds has no lord to bargain
// with, and that is a state rather than a fault.
func checkParticipants(st *model.State, player, trader, town int) error {
	t := st.Towns[town]
	if t == nil {
		return fmt.Errorf("barter: no town %d", town)
	}
	tr := st.Leaders[trader]
	if tr == nil {
		return fmt.Errorf("barter: no lord %d", trader)
	}
	// A dead lord cannot deal. This is checked rather than assumed because the
	// panel reads its trader from the snapshot, and a town whose holder died
	// between that read and the click is an ordinary thing for the client to
	// still be holding.
	if !tr.IsAlive {
		return fmt.Errorf("barter: %s is dead and cannot deal", tr.Name)
	}
	pl := st.Leaders[player]
	if pl == nil {
		return fmt.Errorf("barter: no player lord %d", player)
	}
	if tr.ID == pl.ID {
		return fmt.Errorf("barter: %s cannot barter with themselves", tr.Name)
	}
	// The lord who holds the town is the trader, because a lord deals through
	// the settlement they hold. A request naming a different lord is asking
	// that lord to sell goods they do not have, so it is refused rather than
	// served from the wrong inventory.
	if t.Holder != tr.ID {
		return fmt.Errorf("barter: %s does not hold %s", tr.Name, t.Name)
	}
	return nil
}

// partyOf returns the player's own party, or -1 for a lord with none. A lord
// with no party in the field still holds a purse and can still be handed a
// cage, so this is a legitimate state rather than an error.
func partyOf(st *model.State, player int) int {
	if l := st.Leaders[player]; l != nil && l.PartyID >= 0 {
		if p := st.Parties[l.PartyID]; p != nil {
			return p.ID
		}
	}
	return -1
}

// relationToPlayer reads the trader's standing with the player on the -100 to
// 100 scale the panel and RULERS.md section 2 both use.
//
// The state stores the relation as a share, so it is scaled here rather than
// at each use: a number that means 0.4 in one place and 40 in another is a
// number two features will eventually disagree about.
func relationToPlayer(st *model.State, player, trader int) float64 {
	return round2(st.Relation(player, trader) * 100)
}

// playerTable prices what the player could put down.
//
// Gold is the ruler's own, because a lord bartering spends their purse and not
// the town's till, and a cage is the party's. Goods are the party's cargo: what
// a caravan is actually carrying, as opposed to the town's stock, which is the
// other side of this table.
func playerTable(st *model.State, cfg *config.Config, p *model.Leader, party int, t *model.Town) []Item {
	items := make([]Item, 0, len(goods)+2)
	var pt *model.Party
	if party >= 0 {
		pt = st.Parties[party]
	}
	for _, g := range goods {
		held := partyHold(pt, g.PartyField)
		if held <= 0 {
			continue
		}
		items = append(items, Item{
			Kind:      KindGood,
			ItemID:    g.ID,
			Name:      g.Name,
			Available: clampInt(held),
			UnitValue: round2(priceGood(t, g) * cfg.Barter.BuyShare),
		})
	}
	if p.Gold > 0 {
		items = append(items, Item{
			Kind:      KindGold,
			ItemID:    GoldItemID,
			Name:      goldName,
			Available: clampInt(p.Gold),
			UnitValue: goldPerMoney(cfg),
		})
	}
	if pt != nil && pt.Prisoners > 0 {
		items = append(items, Item{
			Kind:      KindPrisoner,
			ItemID:    PrisonerItemID,
			Name:      prisonerName,
			Available: clampInt(pt.Prisoners),
			UnitValue: prisonerValue(cfg, averageQuality, 0),
		})
	}
	return items
}

// traderTable prices what the trader could give.
//
// The trader's goods are the town's market stock, because this lord deals
// through the settlement they hold: what they can put on a table is what the
// town has. Their gold is their own reserve and their prisoners are their own
// party's cage, which is the reason bartering for captives is a real transaction
// rather than a metaphor.
func traderTable(st *model.State, cfg *config.Config, l *model.Leader, t *model.Town) []Item {
	items := make([]Item, 0, len(goods)+2)
	for _, g := range goods {
		stock := townHold(t, g.TownField)
		if stock <= 0 {
			continue
		}
		items = append(items, Item{
			Kind:      KindGood,
			ItemID:    g.ID,
			Name:      g.Name,
			Available: clampInt(stock),
			UnitValue: round2(priceGood(t, g) * cfg.Barter.SellShare),
		})
	}
	if l.Gold > 0 {
		items = append(items, Item{
			Kind:      KindGold,
			ItemID:    GoldItemID,
			Name:      goldName,
			Available: clampInt(l.Gold),
			UnitValue: goldPerMoney(cfg),
		})
	}
	if l.PartyID >= 0 {
		if pt := st.Parties[l.PartyID]; pt != nil && pt.Prisoners > 0 {
			items = append(items, Item{
				Kind:      KindPrisoner,
				ItemID:    PrisonerItemID,
				Name:      prisonerName,
				Available: clampInt(pt.Prisoners),
				UnitValue: prisonerValue(cfg, averageQuality, 0),
			})
		}
	}
	return items
}

// partyHold is what a party is carrying of one good.
func partyHold(p *model.Party, field string) float64 {
	if p == nil {
		return 0
	}
	v, _ := p.Value(field)
	return v
}

// townHold is what a town is holding of one good.
func townHold(t *model.Town, field string) float64 {
	if t == nil {
		return 0
	}
	v, _ := t.Value(field)
	return v
}

// Appraise is the trader's answer to a proposed deal, and it writes nothing.
//
// Four refusals and one acceptance, all in the lord's own words: nothing on the
// table, something asked for that the trader does not have, a line the player
// does not hold, or an offer that falls short of what the player is asking. The
// first three are corrections and the last is an answer, and all four come with
// the numbers that produced them.
func Appraise(st *model.State, cfg *config.Config, req Request) (Proposal, error) {
	terms, err := BuildTerms(st, cfg, req)
	if err != nil {
		return Proposal{}, err
	}
	trader := st.Leaders[req.Trader]
	partyName := "your party"
	if p := st.Parties[partyOf(st, req.PlayerID)]; p != nil && p.Name != "" {
		partyName = p.Name
	}

	// A table that has gone stale is refused before it is priced. The player
	// filled this in against a day that is not today, and answering about
	// today's prices would be agreeing to a deal they did not look at.
	if req.ExpectedDay != 0 && req.ExpectedDay != terms.Day {
		return refused(
			fmt.Sprintf("These terms were read on day %d and it is now day %d. Read the tables again before offering on them.",
				req.ExpectedDay, terms.Day),
			0, 0, 0), nil
	}

	if len(req.Offered) == 0 && len(req.Asked) == 0 {
		return refused(
			fmt.Sprintf("Nothing is on the table. Put something down from %s, or ask %s for something.",
				partyName, trader.Name),
			0, 0, 0), nil
	}
	if len(req.Offered) == 0 {
		return refused(
			fmt.Sprintf("There is nothing on your side of the table. %s is not giving goods away.", trader.Name),
			0, 0, 0), nil
	}
	if len(req.Asked) == 0 {
		return refused(
			"Nothing has been asked for. A deal has to go both ways.",
			0, 0, 0), nil
	}

	playerValue, refusal := valueLines(req.Offered, terms.PlayerItems)
	if refusal != nil {
		return refused(refusal.reason, 0, 0, 0), nil
	}
	traderValue, refusal := valueLines(req.Asked, terms.TraderItems)
	if refusal != nil {
		return refused(refusal.reason, 0, 0, 0), nil
	}

	// The tolerance is this lord's disposition, not the client's judgement, and
	// it is bounded at both ends by the balance file.
	tolerance := toleranceFor(cfg, terms.RelationToPlayer)
	shortBy := round2(max0(traderValue - playerValue))
	if traderValue > round2(playerValue*(1+tolerance)) {
		return refused(
			fmt.Sprintf("%s calls what you are asking %s and what you are offering %s. Put %s more on your side of the table, or ask for less.",
				trader.Name, money(traderValue), money(playerValue), money(shortBy)),
			playerValue, traderValue, shortBy), nil
	}

	return Proposal{
		Accepted:    true,
		PlayerValue: playerValue,
		TraderValue: traderValue,
		Verdict: fmt.Sprintf("%s takes the deal: %s of goods out of %s you put down.",
			trader.Name, money(traderValue), money(playerValue)),
		CausedBy: "barter-agreed",
	}, nil
}

// lineRefusal is one bad line, with the sentence that explains it.
type lineRefusal struct {
	reason string
}

// valueLines prices one side of a table and checks every line against what that
// side actually holds.
//
// The availability check is the reason this runs against live state rather than
// against the numbers the client was shown: a table is a statement about a
// moment, and the moment has moved. A line asking for more than there is is a
// correction the player needs, not an error, so it comes back as a refusal with
// a sentence rather than as a failure.
func valueLines(lines []Line, table []Item) (float64, *lineRefusal) {
	total := 0.0
	for _, l := range lines {
		it, ok := findItem(table, ItemKind(l.Kind), l.ItemID)
		if !ok {
			return 0, &lineRefusal{reason: unknownLineReason(l, table)}
		}
		if !whole(float64(l.Quantity)) {
			return 0, &lineRefusal{reason: fmt.Sprintf(
				"%s is a whole-number trade: %s cannot be offered as %v.",
				it.Name, it.Name, l.Quantity)}
		}
		if l.Quantity > it.Available {
			return 0, &lineRefusal{reason: fmt.Sprintf(
				"Only %s on the table, and the offer was %d.", describe(it), l.Quantity)}
		}
		// Two lines naming the same thing are valued twice, not refused. They
		// are the same line written twice, and a player who typed the quantity
		// into two rows has not done anything a trader would find strange. The
		// availability check above is against the total either way, because
		// each line is checked as it is read.
		total = round2(total + it.UnitValue*float64(l.Quantity))
	}
	return round2(total), nil
}

// unknownLineReason explains a line that is not on the table it was offered
// against, naming what is there so the correction is actionable.
func unknownLineReason(l Line, table []Item) string {
	names := make([]string, 0, len(table))
	for _, it := range table {
		names = append(names, it.Name)
	}
	if len(names) == 0 {
		return fmt.Sprintf("Nothing at all is on the table to trade: %q is not a thing anybody here holds.", l.ItemID)
	}
	return fmt.Sprintf("%q is not on the table. What is there: %s.",
		l.ItemID, strings.Join(names, ", "))
}

// refused builds a declined proposal.
//
// Zero values for the two totals on the refusals that could not be priced: a
// refusal about a line that does not exist has no valuation to report, and
// printing one would invent a number.
func refused(reason string, playerValue, traderValue, shortBy float64) Proposal {
	p := Proposal{
		Accepted:    false,
		PlayerValue: playerValue,
		TraderValue: traderValue,
		ShortBy:     shortBy,
		Reason:      reason,
	}
	if shortBy > 0 {
		p.Verdict = fmt.Sprintf("Short by %s.", money(shortBy))
	} else {
		p.Verdict = "No deal."
	}
	p.CausedBy = "barter-rejected"
	return p
}

// money renders a figure the way the panel reads it, so the client's own copy
// and this one are the same string.
func money(v float64) string {
	return fmt.Sprintf("$%d", int64(v+0.5))
}

// max0 is a zero floor, so a shortfall is never reported as a negative amount.
// The client only prints it when it is positive, but a negative number here
// would be an offer exceeding the ask by exactly that much, which is not short
// of anything.
func max0(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}
