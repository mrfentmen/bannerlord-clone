package battle

// agent3: the API accepts fourteen order names, validates them, and used to do
// nothing with any of them. These tests are the other end of that: a player's
// order has to become a standing order, the standing order has to reach the
// field, and an order this layer cannot carry out has to be refused by name
// rather than quietly turned into the nearest thing it does understand.

import (
	"math"
	"strings"
	"testing"
)

// TestEveryWireOrderIsEitherCarriedOutOrRefusedByName walks the closed set of
// fourteen names and holds this file to the only two answers it is allowed.
//
// The danger is not that an order is refused. It is that an order is accepted
// and quietly means something else: a "flank" that turns the formation towards a
// wing and arrives in the wrong place, a "take-cover" that becomes a hold. So
// every name is checked for one of the two answers, and a refusal has to name
// the order and say why, because a client showing a player "unknown order" for a
// word that is on its own list is worse than no answer.
func TestEveryWireOrderIsEitherCarriedOutOrRefusedByName(t *testing.T) {
	carried := map[OrderName]bool{
		OrderHoldPosition: true, OrderAdvance: true, OrderCharge: true,
		OrderFallBack: true, OrderRetreat: true, OrderChangeFormation: true,
		OrderFaceDirection: true,
	}
	seen := map[OrderName]bool{}
	for _, name := range ValidOrders() {
		if seen[name] {
			t.Fatalf("order %q is on the canonical list twice", name)
		}
		seen[name] = true

		// Parameters that satisfy every order that takes one, so the test is about
		// which orders exist rather than about which parameters were supplied.
		p := OrderParams{Formation: "wedge", Bearing: 1.5, HasFacing: true}
		am, err := PlanGroupOrder(name, p)
		switch {
		case carried[name]:
			if err != nil {
				t.Errorf("order %q is one this layer carries out and was refused: %v", name, err)
				continue
			}
			// An amendment that changes nothing is a silent stub: the order would
			// be accepted and the standing order would be exactly as it was.
			if !am.saysKind && !am.saysOrder && !am.saysFacing {
				t.Errorf("order %q is carried out but amends nothing", name)
			}
			t.Logf("carried out: %-18s -> %s", name, am.describes)
		default:
			if err == nil {
				t.Errorf("order %q was accepted with %+v, and it is not one this layer can carry out", name, p)
				continue
			}
			if !strings.Contains(err.Error(), string(name)) {
				t.Errorf("the refusal of %q does not name it: %v", name, err)
			}
			t.Logf("refused:     %-18s -> %v", name, err)
		}
	}
	if len(seen) != len(ValidOrders()) {
		t.Errorf("walked %d of the %d orders", len(seen), len(ValidOrders()))
	}
	if len(carried)+len(unexecutableOrders) != len(ValidOrders()) {
		t.Errorf("%d orders carry out and %d are explained as somebody else's, which is %d of %d",
			len(carried), len(unexecutableOrders), len(carried)+len(unexecutableOrders), len(ValidOrders()))
	}
}

// TestTheSevenOrdersThisLayerDoesNotCarryOutAreAllAccountedFor is the same
// statement about the refused half from the other side: every refusal has a
// reason recorded, so no order can fall through the pair of maps into a
// "not one of the fourteen" that is really a "we forgot this one".
func TestTheSevenOrdersThisLayerDoesNotCarryOutAreAllAccountedFor(t *testing.T) {
	for name := range unexecutableOrders {
		if !ValidOrder(name) {
			t.Errorf("order %q is refused with a reason but is not one of the fourteen", name)
		}
	}
	for name, why := range unexecutableOrders {
		if len(why) < 20 {
			t.Errorf("order %q is refused for %q, which does not tell a caller anything", name, why)
		}
		if _, err := PlanGroupOrder(name, OrderParams{Formation: "line"}); err == nil {
			t.Errorf("order %q has a reason recorded and was still accepted", name)
		}
	}
	// The count, because "the seven" is how the file describes itself.
	if len(unexecutableOrders) != 7 {
		t.Errorf("%d orders are accounted for as somebody else's, and the file says seven",
			len(unexecutableOrders))
	}
	if len(executableOrders) != 7 {
		t.Errorf("%d orders are carried out, and the file says seven", len(executableOrders))
	}
}

// TestPlayerOrdersComposeInEitherOrder is the reason Orders is a standing order
// and not a queue: "form wedge" says what the shape is and nothing about what it
// does, "advance" says what it does and nothing about the shape. A player who
// sends them in one order and a player who sends them in the other are asking for
// the same battle.
func TestPlayerOrdersComposeInEitherOrder(t *testing.T) {
	cfg := loadConfig(t)
	shape := OrderParams{Formation: "wedge"}
	advance := OrderParams{}

	first, err := NewOrders(cfg, SideA, nil)
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	if err := first.Apply(OrderChangeFormation, shape, []int{0, 1, 2, 3, 4}); err != nil {
		t.Fatalf("ordering the wedge: %v", err)
	}
	if err := first.Apply(OrderAdvance, advance, []int{2}); err != nil {
		t.Fatalf("advancing it: %v", err)
	}

	second, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: []int{0, 1, 2, 3, 4}},
	})
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	if err := second.Apply(OrderAdvance, advance, []int{3}); err != nil {
		t.Fatalf("advancing the line: %v", err)
	}
	if err := second.Apply(OrderChangeFormation, shape, []int{0}); err != nil {
		t.Fatalf("forming the wedge: %v", err)
	}

	// Composition works because neither order speaks to the other's field. The
	// one order that cannot be sent first is an order to men who have no shape at
	// all, because there is nothing for it to be an amendment to. That is checked
	// here rather than assumed: if it were ever accepted, the composition above
	// would be an accident rather than a rule.
	loose, err := NewOrders(cfg, SideA, nil)
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	if err := loose.Apply(OrderAdvance, advance, []int{7}); err == nil {
		t.Error("a group of men with no shape was told to advance, which is a formation of nobody marching")
	} else if !strings.Contains(err.Error(), "shape") {
		t.Errorf("the refusal does not say what is missing: %v", err)
	}

	if len(first.Groups()) != len(second.Groups()) {
		t.Fatalf("the two orders produced %d and %d groups", len(first.Groups()), len(second.Groups()))
	}
	a, b := first.Groups()[0].Order, second.Groups()[0].Order
	if a.Kind != b.Kind || a.Order != b.Order {
		t.Errorf("the same two orders in either sequence gave %s/%s and %s/%s",
			a.Kind, a.Order, b.Kind, b.Order)
	}
	if a.Kind != FormationWedge || a.Order != OrderFormationAdvance {
		t.Errorf("the standing order is %s/%s, want a wedge advancing", a.Kind, a.Order)
	}
	if got := first.Groups()[0].Units; len(got) != 5 {
		t.Errorf("the group holds %d men, want the 5 that were named", len(got))
	}
}

// TestAnOrderToTheWholeSideMeansEveryGroup is the empty-units case, and it is
// checked against the group set rather than against one group because the whole
// point is that it reaches all of them.
func TestAnOrderToTheWholeSideMeansEveryGroup(t *testing.T) {
	cfg := loadConfig(t)
	ids := []int{0, 1, 2, 3, 4, 5, 6, 7}
	groups := SplitIntoGroups(ids, 2)
	o, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationColumn, Order: OrderFormationHold}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	// One order for the whole side: both groups hold, at their own shapes.
	if err := o.Apply(OrderHoldPosition, OrderParams{}, nil); err != nil {
		t.Fatalf("ordering the whole side to hold: %v", err)
	}
	if got := o.Groups(); len(got) != 2 {
		t.Fatalf("the standing orders are now %d groups, want 2", len(got))
	}
	// A shape for the whole side reaches both, and neither group's own shape is
	// forgotten about on the way: the order speaks to the shape, so both change.
	if err := o.Apply(OrderChangeFormation, OrderParams{Formation: "square"}, nil); err != nil {
		t.Fatalf("squaring the whole side: %v", err)
	}
	for i, g := range o.Groups() {
		if g.Order.Kind != FormationSquare {
			t.Errorf("group %d is in %s after the whole side was squared", i, g.Order.Kind)
		}
	}
	// And with no groups at all there is nothing for an empty order to mean.
	empty, err := NewOrders(cfg, SideA, nil)
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	if err := empty.Apply(OrderCharge, OrderParams{}, nil); err == nil {
		t.Error("the whole of a side with no groups was told to charge")
	}
}

// TestAnOrderSpanningTwoGroupsIsRefused: each group has a shape of its own and
// the player named neither, so there is no honest answer.
func TestAnOrderSpanningTwoGroupsIsRefused(t *testing.T) {
	cfg := loadConfig(t)
	o, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: []int{0, 1}},
		{Order: GroupOrder{Kind: FormationWedge, Order: OrderFormationHold}, Units: []int{2, 3}},
	})
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	err = o.Apply(OrderCharge, OrderParams{}, []int{1, 2})
	if err == nil {
		t.Fatal("an order naming one man in each of two groups was accepted")
	}
	if !strings.Contains(err.Error(), "group") {
		t.Errorf("the refusal does not say which groups are in the way: %v", err)
	}
	// One man in a group is that group's order, not a new group.
	if err := o.Apply(OrderCharge, OrderParams{}, []int{1}); err != nil {
		t.Fatalf("ordering one man in a group of two: %v", err)
	}
	got := o.Groups()
	if len(got) != 2 {
		t.Fatalf("ordering one man made %d groups, want 2", len(got))
	}
	if got[0].Order.Order != OrderFormationCharge || got[1].Order.Order != OrderFormationHold {
		t.Errorf("the charge reached %s/%s and %s/%s; it should have reached the group it named",
			got[0].Order.Kind, got[0].Order.Order, got[1].Order.Kind, got[1].Order.Order)
	}
	if got[0].Order.Kind != FormationLine || got[1].Order.Kind != FormationWedge {
		t.Errorf("a movement order changed the shapes: %s and %s", got[0].Order.Kind, got[1].Order.Kind)
	}
}

// TestAGroupIsASetOfMenNotASlice: a player who selects the same men in another
// order has selected the same men, and the standing order must not depend on how
// the selection arrived.
func TestAGroupIsASetOfMenNotASlice(t *testing.T) {
	cfg := loadConfig(t)
	o, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: []int{5, 3, 9}},
	})
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	before := len(o.Groups())
	if err := o.Apply(OrderChangeFormation, OrderParams{Formation: "wedge"}, []int{9, 5, 3, 3}); err != nil {
		t.Fatalf("re-forming the same men in another order: %v", err)
	}
	got := o.Groups()
	if len(got) != before {
		t.Fatalf("the same men in another order made %d groups, want %d", len(got), before)
	}
	if got[0].Order.Kind != FormationWedge {
		t.Errorf("group 0 is in %s, want a wedge", got[0].Order.Kind)
	}
	if len(got[0].Units) != 3 {
		t.Errorf("the group holds %d men, want 3: a repeated selection is one man", len(got[0].Units))
	}
}

// TestCommanderIsRebuiltOnlyWhenTheOrdersChange: a battle being watched should
// not pay for a validation pass per tick, and a battle being played should get a
// commander that reflects the last order.
func TestCommanderIsRebuiltOnlyWhenTheOrdersChange(t *testing.T) {
	cfg := loadConfig(t)
	o, err := NewOrders(cfg, SideA, nil)
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	if err := o.Apply(OrderChangeFormation, OrderParams{Formation: "line"}, []int{0, 1}); err != nil {
		t.Fatalf("ordering a line: %v", err)
	}
	first, err := o.Commander()
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	again, err := o.Commander()
	if err != nil {
		t.Fatalf("building the commander again: %v", err)
	}
	if first != again {
		t.Error("the commander was rebuilt for no change; a watched battle pays for this every tick")
	}
	if err := o.Apply(OrderChangeFormation, OrderParams{Formation: "column"}, []int{0, 1}); err != nil {
		t.Fatalf("re-ordering the same men into a column: %v", err)
	}
	changed, err := o.Commander()
	if err != nil {
		t.Fatalf("building the commander after the change: %v", err)
	}
	if changed == first {
		t.Fatal("the commander was not rebuilt after the standing orders changed")
	}
	if changed.groups[0].order.Kind != FormationColumn {
		t.Errorf("the new commander is ordering %s", changed.groups[0].order.Kind)
	}
	// A refused amendment must leave the standing orders exactly as they were,
	// or a client that retries would be applying an order twice.
	if err := o.Apply(OrderChangeFormation, OrderParams{Formation: "hexagon"}, []int{0, 1}); err == nil {
		t.Fatal("a shape that does not exist was accepted")
	}
	after, err := o.Commander()
	if err != nil {
		t.Fatalf("building the commander after a refused order: %v", err)
	}
	if after != changed {
		t.Error("a refused order rebuilt the commander, so a refused order changed the battle")
	}
	if len(o.Groups()) != 1 || o.Groups()[0].Order.Kind != FormationColumn {
		t.Errorf("the standing orders are %+v after a refused change of shape", o.Groups())
	}
}

// TestPlayerOrdersReachTheFieldThroughASession is the end of the loop the API
// has been holding open: an order a client sends is a standing order, a standing
// order is a commander, a commander is a session's business, and the men end up in
// the shape that was asked for.
//
// It is fought as a session rather than through RunCommanded because that is the
// path a running game takes: phases, a tick at a time, and an order arriving while
// the battle is already going.
func TestPlayerOrdersReachTheFieldThroughASession(t *testing.T) {
	cfg := loadConfig(t)
	s, a, b, leaders := newTestSession(t, 54321)

	// A client sending orders before the battle has a field: a line for the front
	// of side A, holding. Attaching them is refused, because there is nothing to
	// command yet, and the orders are still standing when the field appears.
	front := idsOfSlice(a)[:len(idsOfSlice(a))/2]
	o, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: front},
	})
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	err = o.Attach(s)
	if err == nil {
		t.Fatal("standing orders were attached to a session that had not deployed")
	}
	if !strings.Contains(err.Error(), "phase") {
		t.Errorf("the refusal does not say the session has no field: %v", err)
	}
	if s.Commanded() {
		t.Error("attaching to a session that was not deployed put a commander on it")
	}
	if len(o.Groups()) != 1 {
		t.Errorf("a refused attach changed the standing orders: %+v", o.Groups())
	}

	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	if err := o.Attach(s); err != nil {
		t.Fatalf("attaching standing orders: %v", err)
	}
	if !s.Commanded() {
		t.Fatal("the session says it is not commanded after being given standing orders")
	}
	// Let it form, then change its mind the way a player does mid-fight.
	for i := 0; i < 20; i++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	if err := o.Apply(OrderChangeFormation, OrderParams{Formation: "wedge"}, front); err != nil {
		t.Fatalf("changing the front to a wedge mid-battle: %v", err)
	}
	if err := o.Apply(OrderAdvance, OrderParams{}, front); err != nil {
		t.Fatalf("advancing it mid-battle: %v", err)
	}
	if err := o.Attach(s); err != nil {
		t.Fatalf("re-attaching after the change: %v", err)
	}

	// The battle runs to its conclusion on the player's orders.
	for s.Phase() != PhaseResolved {
		if err := s.Advance(200); err != nil {
			t.Fatalf("Advance: %v", err)
		}
		if s.Tick() > int(cfg.Battle.MaxTicks) {
			t.Fatal("the battle ran past the tick bound without resolving")
		}
	}
	res := s.Result()
	if res == nil {
		t.Fatal("a resolved session with no result")
	}
	t.Logf("a battle steered by wire orders resolved %s (%s) at tick %d, %.0f casualties",
		res.Outcome.Kind, res.Outcome.Reason, res.Ticks, casualties(res))

	// The orders really were in force: the last thing the standing orders said
	// is a wedge advancing, and that is what the commander holds.
	c, err := o.Commander()
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	g := c.groups[0]
	if g.order.Kind != FormationWedge || g.order.Order != OrderFormationAdvance {
		t.Errorf("the standing order ended as %s/%s, want a wedge advancing", g.order.Kind, g.order.Order)
	}
	if len(g.units) != len(front) {
		t.Errorf("the group the orders named holds %d men, want %d", len(g.units), len(front))
	}
}

// TestOrdersRefuseWhatTheyCannotCarryOut: the refusals, checked where a caller
// meets them rather than at the planner.
func TestOrdersRefuseWhatTheyCannotCarryOut(t *testing.T) {
	cfg := loadConfig(t)
	cases := []struct {
		name   string
		order  OrderName
		params OrderParams
		units  []int
		field  string
	}{
		{name: "an order this layer does not carry out", order: OrderFlank, params: OrderParams{}, units: []int{0}, field: "OrderName"},
		{name: "an order nobody has ever heard of", order: OrderName("do-a-barrel-roll"), params: OrderParams{}, units: []int{0}, field: "OrderName"},
		{name: "a change of shape with no shape named", order: OrderChangeFormation, params: OrderParams{}, units: []int{0}, field: "OrderParams.Formation"},
		{name: "a change into a shape that does not exist", order: OrderChangeFormation, params: OrderParams{Formation: "hexagon"}, units: []int{0}, field: "OrderParams.Formation"},
		{name: "a face-direction with no bearing", order: OrderFaceDirection, params: OrderParams{}, units: []int{0}, field: "OrderParams.Bearing"},
		{name: "a face-direction with a bearing that is not a direction", order: OrderFaceDirection, params: OrderParams{Bearing: math.NaN(), HasFacing: true}, units: []int{0}, field: "OrderParams.Bearing"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			o, err := NewOrders(cfg, SideA, nil)
			if err != nil {
				t.Fatalf("building standing orders: %v", err)
			}
			// One group exists, so the failures below are about the order and not
			// about there being nothing to order. Every case names its men, because
			// naming no men is the whole side, which is a different order.
			if err := o.Apply(OrderChangeFormation, OrderParams{Formation: "line"}, []int{0, 1}); err != nil {
				t.Fatalf("ordering a line: %v", err)
			}
			err = o.Apply(tc.order, tc.params, tc.units)
			if err == nil {
				t.Fatalf("Apply(%s) was accepted", tc.order)
			}
			if !strings.Contains(err.Error(), tc.field) {
				t.Errorf("the refusal does not name %s: %v", tc.field, err)
			}
			// And it changed nothing.
			if got := o.Groups(); len(got) != 1 || got[0].Order.Kind != FormationLine ||
				got[0].Order.Order != OrderFormationHold {
				t.Errorf("a refused order left the standing orders as %+v", got)
			}
		})
	}
	// Nil is nil: a caller holding no standing orders gets an error rather than a
	// panic, because this is the shape a handler has when its session lookup
	// failed.
	var none *Orders
	if err := none.Apply(OrderCharge, OrderParams{}, []int{0}); err == nil {
		t.Error("Apply on nil standing orders was accepted")
	}
	if _, err := none.Commander(); err == nil {
		t.Error("Commander on nil standing orders returned a commander")
	}
	if err := none.Attach(nil); err == nil {
		t.Error("Attach on nil standing orders was accepted")
	}
	// A config-less set of orders cannot be validated, so it cannot exist.
	if _, err := NewOrders(nil, SideA, nil); err == nil {
		t.Error("standing orders were built with no balance config")
	}
	// And a side that is neither A nor B is refused.
	if _, err := NewOrders(cfg, Side(7), nil); err == nil {
		t.Error("standing orders were built for side 7")
	}
}

// idsOfSlice is every unit id in a roster, ascending, for a caller naming the men
// an order is for. The roster is in id order because Run assigns ids densely in
// roster order, so this is the whole side rather than a sample of it.
func idsOfSlice(units []Unit) []int {
	out := make([]int, len(units))
	for i, u := range units {
		out[i] = u.ID
	}
	return out
}
