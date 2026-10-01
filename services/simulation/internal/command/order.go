package command

import (
	"fmt"
	"strings"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/formation"
	"mbclone/simulation/internal/model"
)

// Post is a formation's place in its side's order of battle.
//
// It is not a shape and not an order: it is the job. A formation holds one
// shape (command.front_shape, command.flank_shape, or command.reserve_shape) and
// answers to one set of rules, and the three jobs are what AI.md section 5 means
// by "formation-level goals: advance, hold, flank, fall back". Two formations on
// the same side with the same shape behave differently because they are
// different jobs, which is exactly the difference between a battle line and a
// wing sent round the side.
type Post int

const (
	// PostFront is the fighting line: the formation that closes with the enemy
	// and holds when it is in range.
	PostFront Post = iota
	// PostFlank is a formation held back until the front has fixed the enemy,
	// then committed to walk round one of its sides.
	PostFlank
	// PostReserve is the formation kept out of contact until the side's own
	// strength says the line cannot hold by itself.
	PostReserve
)

// allPosts returns every post in a fixed order. It is the order the rules are
// documented in and the order formations are visited in, so nothing anywhere
// depends on map order or on the order a formation happened to be created.
func allPosts() []Post { return []Post{PostFront, PostFlank, PostReserve} }

func (p Post) String() string {
	switch p {
	case PostFront:
		return "front"
	case PostFlank:
		return "flank"
	case PostReserve:
		return "reserve"
	default:
		return fmt.Sprintf("post(%d)", int(p))
	}
}

// orderField is the cause-log field an order is written to.
//
// It is deliberately not registered in internal/model's field registry. The
// registry describes fields on campaign entities, and a battle formation is not a
// campaign party: the two share an id space and nothing else, and registering a
// battle order as a party field would make the campaign engine's state validation
// expect a value on every party that no campaign party has. The row is still a
// well-formed cause row — CONSTITUTION.md section 2.2 asks for a row naming
// what changed, who changed it, and what was read, and this has all three — and
// the readable order name travels in Read and Note rather than in the numeric
// Old and New columns.
const orderField = "formation_order"

// systemName is what the cause log records as the writer of every order. It is
// the layer, not the package, because a report says "the commander did this" and
// not "internal/command did this".
const systemName = "command"

// OrderIssued is one order the commander gave, and the record of why.
//
// It is the read side of the cause log: every OrderIssued has a cause row
// carrying the same tick, formation, and reason, and Orders() is the ordered list
// of them. A test that compares two runs compares these; a report that explains a
// battle prints them.
type OrderIssued struct {
	// Tick is the battle tick the order was given on.
	Tick int
	// Side is which army the formation belongs to.
	Side battle.Side
	// Formation is the formation's index within its side's order of battle, and
	// ID is the identifier used in the cause log. They differ across sides
	// because the cause log has one id space: side A's formations are 0 upward
	// and side B's continue from command.formations_per_side, so two formations
	// from different armies never share a row.
	Formation, ID int
	// Post is the job the formation holds.
	Post Post
	// Shape is the shape it was ordered to hold.
	Shape formation.Formation
	// Order is what it was told to do, and Previous is what it was told before.
	// Previous is meaningless, and printed as "none", on the first order a
	// formation is given.
	Order, Previous formation.Order
	// Reason names the rule that fired, in the words of the rule: "charge-local-
	// superiority", "withdraw-broken", "flank-weak-wing". It is a closed
	// vocabulary written by this package, not free text, so a report or a test can
	// count how often each rule decided the battle.
	Reason string
	// Read is the state the rule read, in the "key=value, key=value" form the
	// cause log already uses: side and post, our strength and theirs as shares of
	// their own opening strength, the gap in metres, the local comparison, and
	// the two enemy wings.
	Read string
	// CauseID is the id of the cause-log row this order produced, or zero when
	// the commander was built without a log. An order with no row is a defect
	// rather than a mode, which is why the field exists to be checked.
	CauseID int
}

// String renders one order as a single line, in a fixed field order.
//
// The test that proves two runs of the same battle agree compares these strings
// byte for byte, so the format is part of the contract: every field is present on
// every line, in the same order, with the same precision.
func (o OrderIssued) String() string {
	prev := "none"
	if o.Previous.Valid() {
		prev = o.Previous.String()
	}
	return fmt.Sprintf("tick=%d side=%s formation=%d post=%s shape=%s order=%s previous=%s reason=%s read=%q cause=%d",
		o.Tick, o.Side, o.Formation, o.Post, o.Shape, o.Order, prev, o.Reason, o.Read, o.CauseID)
}

// LogSummary renders every order a battle produced as one block of lines.
//
// This is the "identical order logs" comparison: two runs of the same setup with
// the same seed must produce byte-identical summaries, and the only fields that
// may legitimately differ between two runs of the same battle are none of them.
func LogSummary(orders []OrderIssued) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "orders=%d\n", len(orders))
	for _, o := range orders {
		sb.WriteString(o.String())
		sb.WriteByte('\n')
	}
	return sb.String()
}

// OrderCounts is how many orders of each kind a battle produced, in the fixed
// order of AllOrders so a report prints them the same way every time.
//
// It is a slice rather than an array because formation.AllOrders is a function, and
// an array length has to be a constant. It is indexed by position in that fixed
// order and never ranged over, so it cannot make behaviour depend on anything.
type OrderCounts struct {
	// Total is how many orders were issued, one per order a formation was given.
	Total int
	// ByOrder counts them by the order given, in AllOrders order.
	ByOrder []int
}

// Count returns how many orders of the given kind were issued.
func (c OrderCounts) Count(o formation.Order) int {
	for i, known := range formation.AllOrders() {
		if known == o {
			return c.ByOrder[i]
		}
	}
	return 0
}

// String renders the counts as one line, in the fixed order of AllOrders.
func (c OrderCounts) String() string {
	parts := make([]string, 0, len(formation.AllOrders())+1)
	parts = append(parts, fmt.Sprintf("total=%d", c.Total))
	for _, o := range formation.AllOrders() {
		parts = append(parts, fmt.Sprintf("%s=%d", o, c.Count(o)))
	}
	return strings.Join(parts, " ")
}

// summariseCounts counts a list of orders. It walks the fixed order of
// AllOrders rather than a map so the result cannot depend on map order.
func summariseCounts(orders []OrderIssued) OrderCounts {
	c := OrderCounts{ByOrder: make([]int, len(formation.AllOrders()))}
	for _, o := range orders {
		c.Total++
		for i, known := range formation.AllOrders() {
			if known == o.Order {
				c.ByOrder[i]++
				break
			}
		}
	}
	return c
}

// causeKind is the entity family an order row is written under.
//
// A formation is a body of troops under one command, which is what a party is in
// CAUSE_EFFECT.md section 2's entity model, so party is the honest kind for a
// battle formation. The IDs are this layer's own: a battle run gets its own
// cause log, never the campaign's, and the two id spaces never share a row.
const causeKind = model.KindParty

// appendOrder writes the cause row for one order and returns its id.
//
// CONSTITUTION.md section 2.2: a feature that changes tracked state and writes
// nothing to the cause log is incomplete. An order changes what a body of troops
// is doing, so every order produces exactly one row, with no threshold to fall
// under — a threshold here would be a rule about which decisions a player is not
// allowed to have explained.
//
// The row's caused_by is the previous order for the same formation, which makes
// each order explain the one it replaced: the Why panel can walk a formation's
// whole order history, and "why did they charge there" ends at "because
// previously they were advancing and the enemy was 90 metres away".
func (c *Commander) appendOrder(o OrderIssued, prevID int) int {
	if c.log == nil {
		return 0
	}
	var causedBy []int
	if prevID > 0 {
		causedBy = []int{prevID}
	}
	row := cause.Row{
		Tick:     o.Tick,
		Kind:     causeKind,
		Entity:   o.ID,
		Field:    orderField,
		Old:      orderCode(o.Previous, false),
		New:      orderCode(o.Order, true),
		System:   systemName,
		Read:     o.Read,
		CausedBy: causedBy,
		Note: fmt.Sprintf("side %s formation %d (%s, %s) ordered %s: %s",
			o.Side, o.Formation, o.Post, o.Shape, o.Order, o.Reason),
	}
	row.Delta = row.New - row.Old
	c.log.Append(row)
	// Append stamps the id onto the row it stores rather than onto the copy the
	// caller handed in, so the id is read back out of the log's own index rather
	// than guessed from the row count: a log that has dropped old rows has fewer
	// rows than it has ids, and a count would be the wrong number.
	written, ok := c.log.LatestFor(causeKind, o.ID, orderField)
	if !ok {
		return 0
	}
	return written.ID
}

// lastOrderID returns the id of the most recent order row for a formation, or
// zero if it has never been given one. It is what chains one order to the next.
func (c *Commander) lastOrderID(id int) int {
	if c.log == nil {
		return 0
	}
	row, ok := c.log.LatestFor(causeKind, id, orderField)
	if !ok {
		return 0
	}
	return row.ID
}

// orderCode is the numeric value an order is recorded as in the cause row's Old
// and New columns.
//
// The formation package numbers its orders from zero, which would make "hold"
// indistinguishable from "this formation has never been ordered anything". A
// formation that has not been given an order is recorded as -1, so the first
// order a formation receives reads as a change from nothing rather than as a
// change from holding its ground.
func orderCode(o formation.Order, valid bool) float64 {
	if !valid {
		return -1
	}
	return float64(o)
}
