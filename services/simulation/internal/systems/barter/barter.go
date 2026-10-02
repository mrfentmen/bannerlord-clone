// Package barter is the server half of the barter screen:
// ECONOMY.md section 5 and docs/missing-vs-bannerlord.md row 7.11.
//
// Barter is not trading at a price. It is two tables, one item against another,
// with no money moving at all, and the only question worth asking is whether the
// two sides are worth the same to each other.
//
// Three ideas carry the whole package.
//
// **The valuation belongs here and never to the client.** A lord does not deal
// at the market price in either direction: they buy under it and sell over it,
// and the gap between those two figures is their margin and the whole reason a
// deal that looks fair on paper can still be refused. Every line on a barter
// table is therefore priced by the trader, in the direction that trader deals
// in, and the client is handed both tables already priced. The client adds them
// up, which is arithmetic a player can check, and is told yes or no in words.
//
// **Propose changes nothing.** `Appraise` is a pure read: it prices a table and
// answers, and it writes to no field. A player filling in a table asks the
// trader a question, and a question that moved goods would be a bug rather than
// a feature.
//
// **A deal is about one specific table.** `expectedDay` carries the day the
// terms were read, and `Commit` refuses a table that has gone stale, for the
// same reason a market order does: an answer about yesterday's prices is not an
// answer about today's.
package barter

import (
	"fmt"
	"math"
	"strings"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// SystemName is the name every barter cause row carries. It is also what the
// Why panel filters on to answer "why did this lord's gold change", so it is a
// constant rather than a literal at each call site.
const SystemName = "barter"

// EventName is the name the one cause row per struck deal carries.
//
// A deal has no field of its own, so without a row for the decision itself every
// row it produces is an orphan and the Why panel can only say "the barter system
// did this" — which is a restatement of the question. This is the node a player
// walks back to.
const EventName = "barter-deal"

// DealField is the synthetic field the deal row is indexed under.
//
// It is a name rather than a real tracked field on purpose. Indexing the event
// under `gold` or `food_stock` would make it the most recent change to that
// field in the log's own index, so a Why query for a lord's gold would return a
// row that moved nothing, with an old and a new of zero, in place of the row
// that actually explains the number. The field rows cite this one instead, and
// the walk from a number to the decision goes through CausedBy.
const DealField = "barter_deal"

// ItemKind is one of the three kinds of thing that can go on a barter table.
// It is a string because it goes on the wire as one, and because a kind the
// simulation does not know is then rejected by name rather than by a number
// that happens to fall inside a range.
type ItemKind string

const (
	// KindGood is a quantity of a tradeable good, held as town stock and as
	// party cargo.
	KindGood ItemKind = "good"
	// KindGold is coin, held by a ruler.
	KindGold ItemKind = "gold"
	// KindPrisoner is a captive, held by a party.
	KindPrisoner ItemKind = "prisoner"
)

// GoldItemID is the single item id gold is priced under. It is the client's id
// for coin rather than a good id, and it is used on both sides of the table: a
// coin is worth the same number of dollars to the person handing it over as to
// the person taking it, which is the one thing on a barter table that is true
// for both parties at once.
const GoldItemID = "gold"

// PrisonerItemID is the single item id prisoners are priced under. The
// simulation holds a prisoner count rather than the client's per-stack
// breakdown, so a cage is one line; see quality and daysHeld for what that
// costs.
const PrisonerItemID = "prisoners"

// goldName is the display name for the gold line on both tables.
const goldName = "Gold"

// prisonerName is the display name for a cage of captives.
const prisonerName = "Prisoners"

// goodSpec maps one tradeable good onto the fields that hold it on each side of
// the table.
//
// It is a table rather than a switch because the three halves have to agree: a
// good cannot be priced from the town's price and then moved into the party's
// medicine stock. Getting one name right and the other two wrong is exactly the
// kind of bug a table makes impossible.
type goodSpec struct {
	// ID is the client's GoodId, which is the itemId on the wire.
	ID string
	// Name is what the panel prints.
	Name string
	// PartyField is the party's hold of it, on the party kind.
	PartyField string
	// TownField is the town's hold of it, on the town kind.
	TownField string
	// Price reads the town's market price for it, which is the figure both
	// sides of the table are derived from.
	Price func(*model.Town) float64
	// Gold is the money value of one unit at the town's price index, which is
	// what the trader's buy and sell shares are applied to.
	Gold func(*model.Town) float64
}

// goods are the tradeable goods, in the order the tables print them.
//
// Three goods, because three is what the simulation models: a town holds food,
// medicine and metal, and a party carries the same three as cargo. The client
// names eight (GOODS in data/types.ts) and the other five have no stock anywhere
// in the state, so putting them on a table would be a row that reads as real
// and can never be filled. They belong here when a system gives them somewhere
// to be, and not before.
var goods = []goodSpec{
	{
		ID:         "grain",
		Name:       "Grain",
		PartyField: "cargo_food",
		TownField:  "food_stock",
		Price:      func(t *model.Town) float64 { return t.PriceFood },
		Gold:       func(t *model.Town) float64 { return t.PriceFood },
	},
	{
		ID:         "medicine",
		Name:       "Medicine",
		PartyField: "cargo_medicine",
		TownField:  "medicine_stock",
		Price:      func(t *model.Town) float64 { return t.PriceMedicine },
		Gold:       func(t *model.Town) float64 { return t.PriceMedicine },
	},
	{
		ID:         "metal",
		Name:       "Metal",
		PartyField: "cargo_metal",
		TownField:  "metal",
		Price:      func(t *model.Town) float64 { return t.PriceMetal },
		Gold:       func(t *model.Town) float64 { return t.PriceMetal },
	},
}

// goodByID indexes goods for the request path, which resolves an item id a
// client sent rather than walking the table.
var goodByID = func() map[string]goodSpec {
	m := make(map[string]goodSpec, len(goods))
	for _, g := range goods {
		m[g.ID] = g
	}
	return m
}()

// Item is one line of a barter table.
type Item struct {
	Kind ItemKind
	// ItemID is a GoodId, `gold`, or the prisoner unit id.
	ItemID string
	Name   string
	// Available is how many this side can put on the table right now.
	Available int
	// UnitValue is what the simulation calls one unit worth here, in money.
	UnitValue float64
}

// Terms is both tables, priced, at one place and one moment.
//
// The two tables are priced in opposite directions from one market. The player
// side is priced at what this lord would pay for what the player is handing
// over, because that is what the player would be giving up; the trader side at
// what they would ask, because that is what the player would be walking away
// with. Same market underneath, two margins, and the gap between them is the
// whole reason a deal can be refused.
type Terms struct {
	TownID     string
	TraderID   string
	PartyID    string
	TraderName string
	// TraderItems is what the trader can put on the table.
	TraderItems []Item
	// PlayerItems is what the trader holds of the player's things, and what
	// they call them worth.
	PlayerItems []Item
	// RelationToPlayer is standing with this trader, -100 to 100, per
	// RULERS.md section 2.
	RelationToPlayer float64
	// Day is the absolute campaign day these terms were read.
	//
	// Absolute rather than day-of-year, which is what the snapshot's `day`
	// field carries, because this one is used as a staleness guard and a
	// day-of-year guard is wrong once every 365 ticks: a table read exactly a
	// year ago would test as fresh.
	Day int
}

// Line is one thing the player has put down, or asked for. It is the engine's
// line type rather than a second one, so a deal an order carries and a deal a
// request proposes are the same thing and cannot drift apart.
//
// The kind arrives as the wire's string rather than this package's ItemKind,
// because the order is built by a handler decoding JSON and validated here
// against the three the simulation knows. That check is the only place an
// unknown kind is caught, which is why it is here and not in the decoder.
type Line = sim.BarterLine

// Request is a proposed deal: what the player puts down, what they ask for,
// and the day the tables they were priced against were read.
type Request struct {
	// PartyID is the player's own party, -1 for a lord with none.
	PartyID int
	// PlayerID is the player as the API acts for them.
	PlayerID int
	Trader   int
	Town     int
	Offered  []Line
	Asked    []Line
	// ExpectedDay is the day the player's table was read. A deal against a
	// table that has since gone stale is refused rather than silently repriced,
	// which is the same guard a market order gets. Zero means the client sent
	// no day and is read as making no staleness claim, rather than as an
	// assertion that the table was read on day zero.
	ExpectedDay int
}

// Deal renders the request as the order payload for a commit that has been
// agreed.
//
// It is a separate step from Appraise on purpose: the appraisal that decides
// whether to agree and the payload that carries the agreement are different
// things, and holding one does not mean holding the other. A caller that has
// only appraised has not committed to anything.
func (r Request) Deal() *sim.BarterDeal {
	return &sim.BarterDeal{
		Party:   r.PartyID,
		Player:  r.PlayerID,
		Trader:  r.Trader,
		Town:    r.Town,
		Day:     r.ExpectedDay,
		Offered: r.Offered,
		Asked:   r.Asked,
	}
}

// Proposal is the trader's answer to a proposed deal, before anything moved.
//
// Verdict is the trader's own sentence and Reason is why they said no. Both are
// shown verbatim by the panel: a refusal with a reason is an answer, and
// "short by $40" is a number the player can act on where "not a fair trade" is
// not.
type Proposal struct {
	Accepted bool
	// PlayerValue is the simulation's valuation of the whole of what the
	// player is offering, in money.
	PlayerValue float64
	// TraderValue is the simulation's valuation of the whole of what the
	// player is asking for.
	TraderValue float64
	Verdict     string
	Reason      string
	// ShortBy is what the offer falls short by, in money, when refused for
	// being short.
	ShortBy float64
	// CausedBy names the event this answer is about, for the client's cause
	// chain.
	CausedBy string
}

// System returns the barter system.
//
// It is an order-driven system like the player system, for one reason: a commit
// moves goods, gold and people, and every one of those is a tracked field whose
// change has to reach the cause log through the engine's staged-write path
// (CONSTITUTION.md section 2.2). A handler that wrote the fields itself would
// move the same numbers and leave nothing behind them.
func System() sim.System {
	return sim.System{
		Name: SystemName,
		Doc:  "barter across a table: goods, gold and prisoners for goods, gold and prisoners",
		Runs: run,
	}
}

// run applies every barter order staged this tick.
//
// The order carries the deal rather than a reference to it, because a deal is
// not a fact about the world until it is struck: the quantities were checked
// against a table that has since closed, and re-reading it here would price the
// same numbers against different stock.
func run(v *sim.View, w *sim.WriteSet) {
	for _, o := range v.Orders {
		if o.Kind != sim.OrderBarter {
			continue
		}
		applyOrder(v, w, o)
	}
}

// Apply stages a struck deal.
//
// It is exported because the API server needs to apply a deal at the moment it
// was agreed rather than at the next tick boundary. A player who presses "strike
// the deal" expects the tables to have changed by the time the panel re-reads
// them, and an order queue drained by the next tick would leave the panel
// showing a deal that has not happened yet, with the goods still on the table to
// be traded a second time.
//
// Everything else about a tick still holds. The writes go into a WriteSet, the
// engine's apply commits them with the same clamping and the same threshold
// filtering, and the cause rows are the engine's own rather than hand-appended,
// so a struck deal is indistinguishable from one the player system staged. What
// is skipped is the tick counter and the other systems, neither of which this
// touches.
func Apply(v *sim.View, w *sim.WriteSet, deal *sim.BarterDeal) {
	if deal == nil {
		return
	}
	applyOrder(v, w, sim.Order{Kind: sim.OrderBarter, Barter: deal})
}

// applyOrder stages the goods, gold and captives one barter order moves.
//
// Every quantity was validated against live stock when the order was made, and
// the engine clamps each staged write against the field's own minimum, so a
// table that closed in between costs the player the difference rather than
// producing a negative cage.
func applyOrder(v *sim.View, w *sim.WriteSet, o sim.Order) {
	st := v.State
	deal := o.Barter
	if deal == nil {
		return
	}
	town := st.Towns[deal.Town]
	if town == nil {
		return
	}
	trader := st.Leaders[deal.Trader]
	if trader == nil {
		return
	}
	player := st.Leaders[deal.Player]
	if player == nil {
		return
	}
	// The player's party is optional, and resolving it is not a precondition for
	// the deal. A landed lord holds no party but still spends coin, and the old
	// unconditional check made `st.Parties[-1]` a nil that refused the whole
	// order — so a coin-only bargain was reported struck and moved nothing at all.
	//
	// What a party is required for is a carrier, and that is checked per line
	// below rather than once for the deal.
	party := st.Parties[deal.Party]

	// A deal naming a captive is refused outright if the trader has no cage to
	// put them in, rather than having that one line quietly dropped.
	//
	// The alternative is worse than a failure. A lord with no party in the
	// field holds nobody, so their table never offered a captive and a commit
	// asking for one was already wrong; staging the player's half of that line
	// and not the trader's would hand over captives to nobody while reporting
	// the deal as struck. A whole-deal refusal is the only answer that leaves
	// the world consistent with what the client was told.
	//
	// Validate refuses this in the trader's own words before a commit reaches
	// here, so this is the guard for the tick path, where an order can arrive
	// without anybody having asked.
	if touchesCaptives(deal) && st.Parties[trader.PartyID] == nil {
		return
	}
	// Note: a landed lord with no party can still receive goods (they go to
	// local storage). Validation already refuses deals where the player OFFERS
	// goods without a party to carry them. No whole-deal refusal needed here.

	// What each side holds, read once so the read string on every row names
	// the state the deal was struck against rather than whatever the write
	// above it left behind.
	traderGold := trader.Gold
	playerGold := player.Gold

	// One read string for the whole deal, so every cause row it produces names
	// the same state. Reading gold per line instead would have the second line
	// report the figure the first line had already changed, which is a read
	// that did not happen.
	read := fmt.Sprintf("player_gold=%.2f,trader_gold=%.2f,day=%d",
		playerGold, traderGold, v.Tick)

	// The deal itself, as one row, before any of the numbers it moves.
	//
	// Staged rather than appended because the engine owns the log and hands back
	// the id; the token is what every field row below cites, so a Why query on a
	// lord's gold reaches the bargain that spent it rather than stopping at the
	// arithmetic. The event's own causes are the market rows that set the prices
	// this deal was priced against, which is the house pattern every other system
	// uses: the reading behind a decision is itself the product of earlier
	// events.
	token := w.RecordEvent(
		EventName,
		model.KindLeader, trader.ID, DealField,
		describeDeal(deal, read),
		fmt.Sprintf("%s struck a bargain with %s: %s for %s.",
			player.Name, trader.Name, describeLines(deal.Offered), describeLines(deal.Asked)),
		v.Log.RecentFor(model.KindTown, deal.Town,
			[]string{"food_stock", "medicine_stock", "metal", "price_food", "price_medicine", "price_metal"}, 4),
	)
	causedBy := []int{int(token)}

	// What goes from the player to the trader: the party's cargo and cage down,
	// the town's stock and the trader's coin up.
	for _, l := range deal.Offered {
		stageLine(w, lineMove{
			kind:        ItemKind(l.Kind),
			itemID:      l.ItemID,
			quantity:    l.Quantity,
			party:       party,
			traderParty: st.Parties[trader.PartyID],
			town:        town,
			trader:      trader,
			player:      player,
			toTrader:    true,
			read:        read,
			causedBy:    causedBy,
		})
	}

	// And what comes back the other way.
	for _, l := range deal.Asked {
		stageLine(w, lineMove{
			kind:        ItemKind(l.Kind),
			itemID:      l.ItemID,
			quantity:    l.Quantity,
			party:       party,
			traderParty: st.Parties[trader.PartyID],
			town:        town,
			trader:      trader,
			player:      player,
			toTrader:    false,
			read:        read,
			causedBy:    causedBy,
		})
	}
}

// describeLines renders one side of a deal as "20 grain and 30 gold", so the
// deal row reads as the sentence a player would have spoken.
func describeLines(lines []Line) string {
	if len(lines) == 0 {
		return "nothing"
	}
	parts := make([]string, 0, len(lines))
	for _, l := range lines {
		name := l.ItemID
		if name == GoldItemID {
			name = "coin"
		}
		parts = append(parts, fmt.Sprintf("%d %s", l.Quantity, name))
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
}

// describeDeal is the read state behind the decision: what crossed, in which
// direction, and the day it happened on.
func describeDeal(deal *sim.BarterDeal, read string) string {
	return fmt.Sprintf("offered=%s,asked=%s,%s",
		describeLines(deal.Offered), describeLines(deal.Asked), read)
}

// touchesCargo reports whether a deal moves anything a party has to carry: goods
// or captives on either side.
//
// It is the per-deal half of Validate's per-line check, and it exists because a
// lord with no party still holds a purse. Requiring a party for every deal threw
// away the coin trade as well.
func touchesCargo(deal *sim.BarterDeal) bool {
	for _, l := range deal.Offered {
		if k := ItemKind(l.Kind); k == KindGood || k == KindPrisoner {
			return true
		}
	}
	for _, l := range deal.Asked {
		if k := ItemKind(l.Kind); k == KindGood || k == KindPrisoner {
			return true
		}
	}
	return false
}

// touchesCaptives reports whether a deal moves any prisoner in either
// direction.
func touchesCaptives(deal *sim.BarterDeal) bool {
	for _, l := range deal.Offered {
		if ItemKind(l.Kind) == KindPrisoner {
			return true
		}
	}
	for _, l := range deal.Asked {
		if ItemKind(l.Kind) == KindPrisoner {
			return true
		}
	}
	return false
}

// Validate reports whether a deal can be honoured whole, before anything is
// priced and long before anything moves.
//
// It exists because the commit path used to discover its own impossibility after
// the player had already been told yes. applyOrder checked the participants and
// returned silently when one was missing, which is the correct behaviour for a
// system woken by a queued order — it has no way to answer anybody — but it is
// the wrong behaviour for a handler that is about to write `accepted: true` and
// re-read the tables. The player pressed a button, the world said yes, and
// nothing crossed the table: a deal that looks struck on screen and never
// happened, which is the one failure mode a barter screen cannot afford.
//
// Two arrangements reach it, and both are ordinary rather than exotic:
//
//   - The player's lord has no party in the field. A landed lord still holds a
//     purse, so their table is not empty, and gold-only deals are legitimate.
//     But `st.Parties[-1]` is nil, so every line that needs a carrier found no
//     party and the whole deal was skipped while being reported as struck.
//   - The trader's lord has no party either, so a captive has nowhere to go.
//
// So the check runs in Appraise, where a failure is a sentence the player reads,
// rather than in applyOrder, where it can only be a shrug. The sentences are in
// the trader's voice and carry no error prefix, because Appraise hands them
// straight to the panel as the reason a deal was refused.
func Validate(st *model.State, req Request) error {
	// Both sides need checking, and the asked side is the one that is easy to
	// forget: goods the player takes go from the town's stock into the party's
	// cargo, so a landed lord cannot receive a sack of medicine either. A deal
	// that only counted what the player handed over would refuse a coin-for-coin
	// trade and accept a coin-for-grain one, which is backwards.
	needsParty := false
	movesCaptives := false
	// A landed lord with no party can still trade: goods they receive go
	// into local storage, and coin needs no transport. But goods or prisoners
	// they OFFER must be carried away, which requires a party in the field.
	// Prisoners in either direction need a cage (party).
	for _, l := range req.Offered {
		switch ItemKind(l.Kind) {
		case KindGood, KindPrisoner:
			needsParty = true
		}
		if ItemKind(l.Kind) == KindPrisoner {
			movesCaptives = true
		}
	}
	for _, l := range req.Asked {
		if ItemKind(l.Kind) == KindPrisoner {
			movesCaptives = true
			needsParty = true // need a cage to receive captives
		}
		// Goods asked for go to local storage; no party needed.
	}
	if needsParty && partyOf(st, req.PlayerID) < 0 {
		return fmt.Errorf("You have no party in the field, so there is nothing here to carry %s. Coin is the only thing you can put on a table alone.",
			plural(len(req.Offered)+len(req.Asked), "that", "those things"))
	}
	if movesCaptives && st.Parties[st.Leaders[req.Trader].PartyID] == nil {
		return fmt.Errorf("%s has no party in the field, so there is no cage for a captive to go into. Nothing changes hands.",
			st.Leaders[req.Trader].Name)
	}
	return nil
}

// plural picks the noun that fits the count, so a refusal that names the number
// of lines on the table agrees with itself.
func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// lineMove is one line of a deal, resolved against the entities it moves
// between.
type lineMove struct {
	kind     ItemKind
	itemID   string
	quantity int
	party    *model.Party
	// traderParty is the trader's own party, which is their cage. It is nil
	// for a lord with no party in the field, and applyOrder has already
	// refused any deal that would need one.
	traderParty *model.Party
	town        *model.Town
	trader      *model.Leader
	player      *model.Leader
	// toTrader is true when the line is going from the player's side to the
	// trader's. Everything about the move is that one direction, so it is a
	// flag on the line rather than a sign threaded through three branches.
	toTrader bool
	read     string
	// causedBy names the deal row this line's changes belong to, so the Why
	// panel can walk from a number back to the bargain that moved it.
	causedBy []int
}

// stageLine stages one line of a deal as a pair of writes: what leaves one side
// and what arrives at the other.
//
// It is one function for both directions rather than two, because a line that is
// written in one direction and not the other is a trade that creates or
// destroys goods, and having one place where a line becomes two writes is what
// makes that impossible to write by accident.
//
// A rejected kind moves nothing. A deal can only be struck on the three kinds
// the tables are built from, but the payload arrives as a wire string and a
// fourth one would otherwise fall through the switch and stage nothing at all —
// which would be a deal the trader agreed to and then quietly failed to honour,
// the worst possible outcome for the table that was accepted.
//
// Prices are not moved here. The market system sets them from stock and demand
// at the next tick, and a handler that repriced the town by hand would be a
// second economy competing with the first.
func stageLine(w *sim.WriteSet, m lineMove) {
	q := float64(m.quantity)
	if m.quantity <= 0 {
		return
	}
	townID := m.town.ID

	// deltas for the two ends, named so the notes read as sentences.
	from, to := -q, q
	fromWho, toWho := "the player", m.trader.Name
	if !m.toTrader {
		from, to = q, -q
		fromWho, toWho = m.trader.Name, "the player"
	}

	switch m.kind {
	case KindGood:
		g, ok := goodByID[m.itemID]
		if !ok {
			return
		}
		if m.party == nil {
			// Landed lord with no party: goods go to local storage (town stock).
			// The town is the trader's town; for the player's receiving, we
			// add to the town stock instead of party cargo.
			if !m.toTrader {
				// Player receiving: add to town stock (lord's local storage).
				w.Add(model.KindTown, townID, g.TownField, float64(m.quantity),
					m.read, m.causedBy,
					fmt.Sprintf("%s's %s %s received at the table", m.player.Name, g.Name, trim(float64(m.quantity))))
			}
			// If player is offering goods with no party, validation should have
			// refused this; skip silently.
			return
		}
		partyID := m.party.ID
		// A good leaves one hold and arrives in the other: the party's cargo
		// against the town's stock. The party is always the player's, and the
		// town is always the trader's, because that is the pair a barter
		// happens between.
		w.Add(model.KindParty, partyID, g.PartyField, from, m.read, m.causedBy,
			fmt.Sprintf("%s of %s %s to %s across the table", g.Name, trim(q), "moved", toWho))
		w.Add(model.KindTown, townID, g.TownField, to, m.read, m.causedBy,
			fmt.Sprintf("%s's %s %s %s by %s at the table", m.town.Name, g.Name, trim(q), fromVerb(m.toTrader), fromWho))

	case KindGold:
		// Gold moves between the two rulers and nowhere else. It is not the
		// town's reserve: a lord bartering with their own purse is not the
		// town bankrolling them.
		w.Add(model.KindLeader, m.player.ID, "gold", from, m.read, m.causedBy,
			fmt.Sprintf("%s's gold %s by %s at the table", m.player.Name, trim(q), fromVerb(m.toTrader)))
		w.Add(model.KindLeader, m.trader.ID, "gold", to, m.read, m.causedBy,
			fmt.Sprintf("%s's gold %s by %s at the table", m.trader.Name, trim(q), toVerb(m.toTrader)))

	case KindPrisoner:
		// A captive moves between cages, and the trader's cage is their own
		// party. applyOrder has already refused any deal that moves captives
		// to a lord with no party in the field, so this is never nil here.
		if m.party == nil || m.traderParty == nil {
			return
		}
		partyID := m.party.ID
		traderParty := m.traderParty
		w.Add(model.KindParty, partyID, "prisoners", from, m.read, m.causedBy,
			fmt.Sprintf("%s prisoners %s by %s", m.party.Name, trim(q), fromVerb(m.toTrader)))
		w.Add(model.KindParty, traderParty.ID, "prisoners", to, m.read, m.causedBy,
			fmt.Sprintf("%s's prisoners %s by %s", traderParty.Name, trim(q), toVerb(m.toTrader)))
	}
}

func fromVerb(toTrader bool) string {
	if toTrader {
		return "handed over"
	}
	return "received"
}

func toVerb(toTrader bool) string {
	if toTrader {
		return "received"
	}
	return "handed over"
}

func trim(v float64) string {
	return fmt.Sprintf("%.0f", v)
}

// priceGood returns what the market calls one unit of a good at this town.
func priceGood(t *model.Town, g goodSpec) float64 {
	p := g.Price(t)
	if p <= 0 {
		return 0
	}
	return p
}

// goldPerMoney is what one coin is worth in money, from the currency system's
// own rate. Every gold line on both tables is priced at it, because that is the
// figure the rest of the economy uses and a second one would disagree with the
// market panel on the same screen.
func goldPerMoney(cfg *config.Config) float64 {
	r := cfg.Currency.GoldPerMoney
	if r <= 0 {
		return 1
	}
	return r
}

// prisonerValue is what one captive is worth on this trader's table.
//
// quality and daysHeld are parameters rather than fields read off the cage
// because the simulation holds a prisoner count, not the client's per-stack
// breakdown: a cage is one number and has no quality or age to read. The
// pricing rule is written out in full anyway, so the day a system starts
// tracking them the arithmetic does not have to be rediscovered.
func prisonerValue(cfg *config.Config, quality, daysHeld float64) float64 {
	b := cfg.Barter
	v := b.PrisonerBase + b.PrisonerQualityWeight*(quality-1)
	aged := daysHeld * b.PrisonerDailyRise
	if aged > b.PrisonerDailyCap {
		aged = b.PrisonerDailyCap
	}
	return round2(v * (1 + aged))
}

// averageQuality is the quality a whole cage is priced at while the simulation
// does not track the breakdown. One is "average", which is what an uncounted
// captive is.
const averageQuality = 1.0

// toleranceFor is how far short of even a deal this trader will shake hands.
//
// A friend takes a worse deal than a stranger, and an enemy takes none at all,
// but both adjustments are bounded: an enemy who refused every deal would be
// unplayable and a friend could be talked out of a town. The bounds are in the
// balance file rather than here, for the same reason as every other constant.
func toleranceFor(cfg *config.Config, relation float64) float64 {
	b := cfg.Barter
	adj := relation * b.TolerancePerRelation
	if adj < b.ToleranceRelationFloor {
		adj = b.ToleranceRelationFloor
	}
	if adj > b.ToleranceRelationCap {
		adj = b.ToleranceRelationCap
	}
	t := b.Tolerance + adj
	if t < 0 {
		t = 0
	}
	return t
}

// round2 rounds to whole cents. Every money figure on a barter table is rounded
// before it is shown or summed, because a table that prints 0.30000000000004
// under a column of dollars is a table nobody believes.
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// whole reports whether a quantity is a positive whole number.
//
// Whole because a barter table is a list of people, sacks and coins rather than
// a continuous quantity, and "three and a bit prisoners" is not a thing that can
// be handed across a table. It is checked before anything is priced, so a
// fractional line is refused rather than quietly rounded into a deal the player
// did not offer.
func whole(q float64) bool {
	return q > 0 && q == math.Trunc(q) && !math.IsInf(q, 0) && !math.IsNaN(q)
}

// clampInt floors a float hold down to a whole number on a table, so a party
// holding 4.7 sacks offers 4 and never a fraction of one.
func clampInt(v float64) int {
	if v <= 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return int(math.Floor(v))
}

// townRef renders a town id in the client's "town-N" form, which is the same
// form the snapshot uses so one settlement has one id on both sides of the wire.
func townRef(id int) string { return fmt.Sprintf("town-%d", id) }

// partyRef renders a party id in the client's "party-N" form.
func partyRef(id int) string { return fmt.Sprintf("party-%d", id) }

// traderRef renders a ruler id in the client's "leader-N" form, matching the
// snapshot's rulers block.
func traderRef(id int) string { return fmt.Sprintf("leader-%d", id) }

// findItem returns the line of a table a request line names, or false when the
// table does not carry it.
//
// Matching on kind as well as id is not decoration: a unit can be both a good
// and a prisoner, and a request that named an id without its kind would find
// whichever came first.
func findItem(items []Item, kind ItemKind, itemID string) (Item, bool) {
	for _, it := range items {
		if it.Kind == kind && it.ItemID == itemID {
			return it, true
		}
	}
	return Item{}, false
}

// describe is a plain-language rendering of a line, used in refusal sentences.
func describe(it Item) string {
	return fmt.Sprintf("%d %s", it.Available, strings.ToLower(it.Name))
}
