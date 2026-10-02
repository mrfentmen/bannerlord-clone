package battle

import (
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/config"
)

// A PLAYER'S STANDING FORMATION ORDERS.
//
// The API accepts fourteen order names and validates them against a closed list
// (see orders.go), and then, until this file existed, did nothing at all with
// them: the order was logged with the tick it arrived on and the battle carried
// on with nobody giving it any. That is the formation-orders task's half of the
// loop, and this file is it.
//
// # WHY THE ORDERS ARE STANDING AND NOT A QUEUE
//
// A player's order does not say everything at once. "Form wedge" names a shape
// and says nothing about what the shape then does; "advance" says what it does
// and names no shape at all. A wire order that had to carry both would make the
// second one impossible to write without guessing, and a guess here is the worst
// kind: an order that arrives as a line because nobody said wedge looks exactly
// like an order that was obeyed.
//
// So an order is an AMENDMENT to a standing order, and the standing orders live
// in one place: Orders. It holds the groups, Apply amends them, and Commander
// hands the engine a FormationCommander built from the result. A player who
// wants a wedge advancing sends change-formation then advance, or advance then
// change-formation, and gets the same battle either way, because the standing
// order is the sum of both.
//
// # WHAT THIS FILE WILL NOT DO
//
// Six of the fourteen names are not here: follow, change-spacing, volley-fire,
// fire-at-will, take-cover, and flank. They are not refused because they are bad
// orders. They are refused because the formation layer has no definition of any of
// them, and the layer's own rule is that accepting a shape or an order it cannot
// carry out is the silent stub this codebase treats as a bug. The tactics layer
// (internal/command) does define them, and an order that belongs there is a
// tactics commander's business. PlanGroupOrder says so by name rather than
// pretending the order set is smaller than it is.
//
// move IS here, and it is the one of the seven that needed no new number to
// define. A shape walks to a point at the file's walking pace, which is the same
// pace an advance uses because it is the same walk, and it stops when its anchor
// is inside its own spacing of where it was told to go. Every constant it needs is
// therefore one the layer already had.
//
// A group with no shape has no movement order either. OrderFormationHold is the
// zero value of FormationOrder, so a standing order that named only "advance"
// would arrive as an advance in FormationNone, and FormationNone is not a shape.
// The error says to send change-formation first, which is the truth and is also
// the only thing that could be meant.

// OrderParams are the parameters a wire order carries, typed.
//
// They are typed rather than a map because this package does not decode JSON.
// The handler that does owns the wire format and its own decoder, and it hands
// over what it read. A map[string]any reaching the tick loop would put a string
// comparison between a player's order and the geometry it produces, and a
// misspelling would then be a shape nobody can stand in.
type OrderParams struct {
	// Formation is the shape name for change-formation, as the manuals and the
	// UI both write it: "wedge", "hollow square", "loose". Empty for every other
	// order, and an error where the order needs it and does not have it.
	Formation string
	// Bearing is the facing in radians counter-clockwise from +X for
	// face-direction. It is read only when HasFacing is true, so a zero bearing
	// can be asked for rather than being indistinguishable from no bearing.
	Bearing   float64
	HasFacing bool
	// X and Y are the point in metres for move. They are read only when HasPoint
	// is true, for the same reason the bearing is: the origin is a place a player
	// can order a formation to, so "no point given" has to be its own value rather
	// than a zero that means the middle of the field.
	X, Y     float64
	HasPoint bool
}

// executableOrders is the part of the fourteen this layer can carry out, and
// what each one does to a standing order.
//
// The map is the whole of it. An order not in here has no definition below, and
// PlanGroupOrder refuses it by name rather than guessing at the nearest thing,
// because the nearest thing to "advance" for a player who meant "follow" is a
// battle that runs away from them.
var executableOrders = map[OrderName]string{
	OrderHoldPosition:    "hold where you are",
	OrderAdvance:         "close on the enemy at a walking pace",
	OrderCharge:          "close at a run",
	OrderFallBack:        "break contact, keeping the shape",
	OrderRetreat:         "break contact, keeping the shape",
	OrderChangeFormation: "form into the named shape",
	OrderFaceDirection:   "face a fixed bearing instead of the enemy",
	OrderTacticMove:      "walk the shape to a point on the field",
}

// unexecutableOrders says what happened to the names this layer does not carry
// out, so the refusal can name the road rather than only the wall.
var unexecutableOrders = map[OrderName]string{
	OrderFollow:        "following is a question about another formation's anchor, and this layer only commands its own groups",
	OrderChangeSpacing: "spacing is a parameter of the shape in the balance file, not something a commander changes mid-battle",
	OrderVolleyFire:    "fire discipline belongs to the aimed-fire stage, which has no seam for it",
	OrderFireAtWill:    "fire discipline belongs to the aimed-fire stage, which has no seam for it",
	OrderTakeCover:     "cover posts are a shape this layer does not implement and ParseFormation refuses by name",
	OrderFlank:         "the tactics layer plans a flanking move; a formation that simply turned towards a wing would arrive at the wrong place",
}

// PlanGroupOrder turns one wire order name and its parameters into the change it
// makes to a standing order, or refuses it.
//
// It is a pure function of its arguments. Nothing is applied here; Apply does
// that, and a caller that wants to know whether an order is one this layer can
// carry before it has a session to apply it to can ask this alone.
func PlanGroupOrder(name OrderName, p OrderParams) (amendment, error) {
	what, ok := executableOrders[name]
	if !ok {
		if why, known := unexecutableOrders[name]; known {
			return amendment{}, newFormationError("PlanGroupOrder", "OrderName",
				"order %q is not one the formation layer carries out: %s", name, why)
		}
		return amendment{}, newFormationError("PlanGroupOrder", "OrderName",
			"order %q is not one of the fourteen; the ones this layer carries out are %s",
			name, strings.Join(executableOrderNames(), ", "))
	}
	switch name {
	case OrderHoldPosition, OrderAdvance, OrderCharge, OrderFallBack, OrderRetreat:
		o, err := wireMovement(name)
		if err != nil {
			return amendment{}, err
		}
		return amendment{order: o, saysOrder: true, describes: string(name) + ": " + what}, nil
	case OrderChangeFormation:
		f, err := ParseFormation(p.Formation)
		if err != nil {
			return amendment{}, newFormationError("PlanGroupOrder", "OrderParams.Formation",
				"change-formation needs the shape to form and %q is not one this layer can draw", p.Formation)
		}
		return amendment{kind: f, saysKind: true, describes: "change-formation: " + f.String()}, nil
	case OrderTacticMove:
		if !p.HasPoint {
			return amendment{}, newFormationError("PlanGroupOrder", "OrderParams.X",
				"move needs a point in metres and none was given; a formation with nowhere to walk to is "+
					"a formation holding, and that is a different order with a name of its own")
		}
		if !isFinite(p.X) || !isFinite(p.Y) {
			return amendment{}, newFormationError("PlanGroupOrder", "OrderParams.X",
				"move was given the point (%g, %g), which is not a place on the field", p.X, p.Y)
		}
		return amendment{order: OrderFormationMove, saysOrder: true,
			at:        &Destination{X: p.X, Y: p.Y},
			describes: fmt.Sprintf("move: (%+.1f, %+.1f) m", p.X, p.Y)}, nil
	case OrderFaceDirection:
		if !p.HasFacing {
			return amendment{}, newFormationError("PlanGroupOrder", "OrderParams.Bearing",
				"face-direction needs a bearing in radians and none was given; a formation with no bearing "+
					"to face is a formation facing the enemy, which is the default and not an order")
		}
		if !isFinite(p.Bearing) {
			return amendment{}, newFormationError("PlanGroupOrder", "OrderParams.Bearing",
				"face-direction was given a bearing of %g radians, which is not a direction", p.Bearing)
		}
		return amendment{facing: Facing{Bearing: p.Bearing, Fixed: true}, saysFacing: true,
			describes: fmt.Sprintf("face-direction: %+.4f rad", p.Bearing)}, nil
	default:
		// Unreachable: the map above is the switch's whole domain and has been
		// checked. Kept because a name added to the map and not to the switch is
		// exactly the mistake a reader would make, and it has to fail here rather
		// than as a standing order that changed nothing.
		return amendment{}, newFormationError("PlanGroupOrder", "OrderName",
			"order %q is listed as executable but has no translation", name)
	}
}

// amendment is what one wire order changes about a standing order: which of the
// three fields it speaks to, and what it says.
//
// It is unexported and its fields are private because a caller has no business
// holding one: an amendment means nothing on its own, and the only honest way to
// spend it is Apply, which checks it against a standing order that exists.
type amendment struct {
	kind   Formation
	order  FormationOrder
	facing Facing
	at     *Destination
	// saysKind, saysOrder, and saysFacing are which fields the order spoke to.
	// An order that does not speak to a field leaves it alone, and that is the
	// whole reason "advance" can be sent without naming a shape.
	saysKind   bool
	saysOrder  bool
	saysFacing bool
	describes  string
}

// wireMovement is the wire name to formation order mapping, kept in one place so
// the two names that mean the same thing are visibly the same thing.
//
// fall-back and retreat are both "break contact, keeping the shape and still
// facing the enemy". They are two words for one order and they are both on the
// wire, so they both arrive here and leave as the same thing.
func wireMovement(name OrderName) (FormationOrder, error) {
	switch name {
	case OrderHoldPosition:
		return OrderFormationHold, nil
	case OrderAdvance:
		return OrderFormationAdvance, nil
	case OrderCharge:
		return OrderFormationCharge, nil
	case OrderFallBack, OrderRetreat:
		return OrderFormationRetreat, nil
	}
	return OrderFormationHold, newFormationError("wireMovement", "OrderName",
		"order %q is not a movement order; the movements are hold-position, advance, charge, fall-back, retreat", name)
}

// executableOrderNames lists the names this layer carries out, in the order the
// canonical list has them, for an error message that has to be readable by
// somebody holding a client's order list.
func executableOrderNames() []string {
	names := make([]string, 0, len(executableOrders))
	for _, o := range validOrders {
		if _, ok := executableOrders[o]; ok {
			names = append(names, string(o))
		}
	}
	return names
}

// Orders is one side's standing formation orders: the groups, and what each of
// them is doing.
//
// It is the state a player changes while a battle runs, and it is deliberately
// not a queue. A queued order is played once and is gone; a standing order is
// still in force next tick, which is what a formation order means. Amending one
// is therefore the whole of the interface: there is no cancel, because dropping
// a group's orders is a standing order of nothing to do, which is
// OrderFormationHold.
//
// One Orders belongs to one side and commands that side's units only. A group
// naming another side's men is refused, by the commander it builds.
//
// It is not safe for concurrent use, and the reason is worth stating rather than
// leaving to a caller to discover. Apply writes the standing orders while the
// engine reads them, once per tick, through the commander they built. A request
// handler amending orders while a pump goroutine advances the same battle is two
// goroutines on one standing order. The API server does not have that race, because
// its pump holds the same mutex its handlers take around the whole of Advance, and
// a caller with a different shape has to serialise the two itself.
type Orders struct {
	cfg    *config.Config
	side   Side
	groups []Group
	// changes counts amendments applied, and it is what Commander compares against
	// builtChanges to decide whether the engine's commander has to be rebuilt.
	// Rebuilding is cheap and only happens when something actually changed, which
	// is what keeps a battle being watched rather than played cheap.
	changes      int
	builtChanges int
	built        *FormationCommander
}

// NewOrders builds a side's standing orders from a first set of groups.
//
// The groups are validated exactly as NewFormationCommander validates them,
// because they are handed straight to it: NewOrders is the cheaper half of the
// same contract and Commander is the expensive half. A caller that has no groups
// yet passes none, and applies change-formation to name the men who will make
// them.
func NewOrders(cfg *config.Config, side Side, groups []Group) (*Orders, error) {
	o := &Orders{cfg: cfg, side: side}
	if err := o.check(); err != nil {
		return nil, err
	}
	if len(groups) == 0 {
		return o, nil
	}
	// The groups are validated by the same call that will command them, so the
	// two cannot disagree about what is allowed to be a formation.
	if _, err := NewFormationCommander(o.cfg, o.side, groups); err != nil {
		return nil, err
	}
	o.groups = append([]Group(nil), groups...)
	o.builtChanges = o.changes
	return o, nil
}

// check is what has to be true before a single order can be applied: a balance
// config to take every spacing and every pace from, and a side that is one of the
// two. It is separate from the commander because a side may have no groups yet,
// and a set of standing orders that has not been given any is not yet an error.
func (o *Orders) check() error {
	if o == nil {
		return newFormationError("Orders", "Orders", "there are no standing orders to apply an order to")
	}
	if o.cfg == nil {
		return newFormationError("Orders", "cfg",
			"these orders have no balance config; every spacing and every pace they use is in it")
	}
	if o.side != SideA && o.side != SideB {
		return newFormationError("Orders", "side", "side %d is neither A nor B", int(o.side))
	}
	return nil
}

// set replaces the group that owns exactly these units, or adds them as a new
// group. It is the one place membership is decided, so Apply and the constructor
// cannot disagree about what a group's units are.
func (o *Orders) set(order GroupOrder, units []int) error {
	if err := o.check(); err != nil {
		return err
	}
	if len(units) == 0 {
		return newFormationError("Orders", "Units",
			"a group of nobody is not a formation; name the units the order is for")
	}
	// Validation is the commander's, and it is the same validation: build the
	// whole set, and if it refuses, refuse here with its error rather than with a
	// second and slightly different one.
	next := o.groupsWith(order, units)
	if _, err := NewFormationCommander(o.cfg, o.side, next); err != nil {
		return err
	}
	o.groups = next
	o.changes++
	o.built = nil
	return nil
}

// groupsWith is o.groups with the group owning exactly units replaced by a group
// of those units and this order, or with the group added when no group owns them.
//
// Exactly. A set of units split across two existing groups is not replaced,
// because the alternative is a player who selects half of the line and quietly
// dissolves the group that held the other half. That case is refused by Apply,
// with the groups named, rather than resolved here.
func (o *Orders) groupsWith(order GroupOrder, units []int) []Group {
	for i, g := range o.groups {
		if sameUnits(g.Units, units) {
			out := append([]Group(nil), o.groups...)
			out[i] = Group{Order: order, Units: append([]int(nil), g.Units...)}
			return out
		}
	}
	out := append([]Group(nil), o.groups...)
	return append(out, Group{Order: order, Units: append([]int(nil), units...)})
}

// Apply puts one wire order into force for the units named.
//
// units names the men the order is for. It may name part of a group or all of
// it, in which case that group is amended, or the exact set of a group, in which
// case it is replaced with a new group of the same men. It may also name a set
// no group owns yet, which creates a group, which is how a player's first order
// makes men out of a roster. An empty units means every group this side has: the
// order is to the whole army, which is the common case and which nobody should
// have to spell out.
//
// An order that names units spread across two groups is refused. The two groups
// have shapes of their own and the player named neither, so there is no honest
// answer to which shape the order applies to.
func (o *Orders) Apply(name OrderName, p OrderParams, units []int) error {
	if o == nil {
		return newFormationError("Apply", "Orders", "there are no standing orders to amend")
	}
	am, err := PlanGroupOrder(name, p)
	if err != nil {
		return err
	}
	if len(units) == 0 {
		if len(o.groups) == 0 {
			return newFormationError("Apply", "Units",
				"%s names no units and this side has no groups yet; order some men into a shape first", am.describes)
		}
		// The whole army. Every group is amended with the same amendment, and a
		// group that has no shape yet still cannot be given a movement order, so
		// the refusal names which groups are shapeless rather than failing on the
		// first one.
		var shapeless []int
		next := make([]Group, len(o.groups))
		for i, g := range o.groups {
			merged := am.applyTo(g.Order)
			if !merged.Kind.Valid() {
				shapeless = append(shapeless, i)
			}
			next[i] = Group{Order: merged, Units: g.Units}
		}
		if len(shapeless) > 0 {
			return newFormationError("Apply", "Group.Order.Kind",
				"%s applies to the whole of side %s, but the shape is missing from %s; a formation with "+
					"no shape is not one, so order change-formation first",
				am.describes, o.side, groupList(shapeless))
		}
		if _, err := NewFormationCommander(o.cfg, o.side, next); err != nil {
			return err
		}
		o.groups, o.changes, o.built = next, o.changes+1, nil
		return nil
	}
	// One group, amended in place, or a new group for men who have none.
	target := -1
	for i, g := range o.groups {
		if sharesUnits(g.Units, units) {
			if target >= 0 {
				return newFormationError("Apply", "Units",
					"units %v span group %d and group %d; name one group or the other, because each has a "+
						"shape of its own and this order names neither", units, target, i)
			}
			target = i
		}
	}
	if target < 0 {
		return o.set(am.applyTo(GroupOrder{}), units)
	}
	merged := am.applyTo(o.groups[target].Order)
	if !merged.Kind.Valid() {
		return newFormationError("Apply", "Group.Order.Kind",
			"%s was ordered to a group of %d men who have no shape; a formation with no shape is not "+
				"one, so order change-formation first", am.describes, len(o.groups[target].Units))
	}
	next := append([]Group(nil), o.groups...)
	next[target] = Group{Order: merged, Units: next[target].Units}
	if _, err := NewFormationCommander(o.cfg, o.side, next); err != nil {
		return err
	}
	o.groups, o.changes, o.built = next, o.changes+1, nil
	return nil
}

// applyTo is one amendment written onto a standing order. The fields the order
// did not speak to are carried over untouched, which is what makes "advance" and
// "form wedge" composable in either order.
func (a amendment) applyTo(g GroupOrder) GroupOrder {
	if a.saysKind {
		g.Kind = a.kind
	}
	if a.saysOrder {
		g.Order = a.order
		// A destination belongs to a move and to nothing else, so an order that
		// walks somewhere else takes the place with it. Leaving it behind would be
		// an order carrying a destination nothing will read, which is the thing
		// the commander refuses at construction.
		if a.order != OrderFormationMove {
			g.At = nil
		}
	}
	if a.saysOrder && a.at != nil {
		at := *a.at
		g.At = &at
	}
	if a.saysFacing {
		g.Facing = a.facing
	}
	return g
}

// Commander builds the engine's commander for the standing orders as they stand.
//
// It is rebuilt only when something has changed since the last call, so a battle
// being watched rather than played builds it once. A caller that wants a
// commander for every tick would be paying for a validation pass per tick for no
// reason; a caller that amends an order gets a new one on the next call, which is
// what Session.Command wants when a player changes their mind.
//
// One cost is worth stating: a rebuilt commander starts every group's facing from
// zero. For a group facing the enemy that is corrected on its first tick, because
// the enemy is there to be faced; for a group with no enemy in front of it the
// first tick after a rebuild holds the zero bearing rather than the bearing it
// had. That is one tick of a formation looking east rather than north, and it is
// the price of not carrying a commander's private state in the standing orders.
func (o *Orders) Commander() (*FormationCommander, error) {
	if o == nil {
		return nil, newFormationError("Commander", "Orders", "there are no standing orders to command")
	}
	if err := o.check(); err != nil {
		return nil, err
	}
	if len(o.groups) == 0 {
		return nil, newFormationError("Commander", "groups",
			"side %s has no groups to order yet; a standing order names the men it applies to, so "+
				"there is nothing for this one to apply to until change-formation names some", o.side)
	}
	if o.built != nil && o.changes == o.builtChanges {
		return o.built, nil
	}
	c, err := NewFormationCommander(o.cfg, o.side, o.groups)
	if err != nil {
		return nil, err
	}
	o.built = c
	o.builtChanges = o.changes
	return c, nil
}

// Attach puts these standing orders in charge of a session.
//
// It is Command with the group building already done, and it is a method here
// because the call is always this pair: a session that is still fighting, and an
// Orders that belongs to one side of it. A caller that wants to attach something
// that is not a formation layer uses Session.Command.
//
// Attaching replaces whatever was commanding. A session has one commander, not
// one per side, so a player who takes charge of his own side takes the other side
// off whoever was running it. That is the seam's shape and not something this
// file can change from here; what this file can do is say it out loud, because
// the alternative is a battle where half the field quietly stops taking orders.
func (o *Orders) Attach(s *Session) error {
	if s == nil {
		return newFormationError("Attach", "Session", "there is no session to command")
	}
	c, err := o.Commander()
	if err != nil {
		return err
	}
	return s.Command(c)
}

// Groups returns a copy of the standing orders, for a caller that wants to show
// a player what is in force. The returned slice and its unit lists belong to the
// caller.
func (o *Orders) Groups() []Group {
	out := make([]Group, len(o.groups))
	for i, g := range o.groups {
		out[i] = Group{Order: g.Order, Units: append([]int(nil), g.Units...)}
	}
	return out
}

// Side is the army these orders command.
func (o *Orders) Side() Side { return o.side }

// sameUnits reports whether two lists hold the same ids, however they were
// written down. A group is a set of men, not a slice of them, and a player who
// selects the same nine men in a different order has selected the same nine.
func sameUnits(a, b []int) bool {
	x, y := sortedUnique(a), sortedUnique(b)
	if len(x) != len(y) {
		return false
	}
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

// sortedUnique is a list of ids in ascending order with the repeats taken out.
// It is a fresh slice: the caller may keep it.
func sortedUnique(ids []int) []int {
	out := append([]int(nil), ids...)
	sort.Ints(out)
	j := 0
	for i := range out {
		if i == 0 || out[i] != out[i-1] {
			out[j] = out[i]
			j++
		}
	}
	return out[:j]
}

// sharesUnits reports whether the two lists have a member in common, which is
// what makes an order that names one man in a group an order to that group.
func sharesUnits(have, want []int) bool {
	if len(have) == 0 || len(want) == 0 {
		return false
	}
	set := make(map[int]bool, len(have))
	for _, id := range have {
		set[id] = true
	}
	for _, id := range want {
		if set[id] {
			return true
		}
	}
	return false
}

// groupList names groups by their position in the standing order, for an error
// that has to say which of them is wrong without the caller holding the slice.
// Two read as "group 1 and group 3" and three as "group 1, group 2, and group 3",
// because an error that has to be counted out loud is an error nobody reads.
func groupList(ids []int) string {
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = fmt.Sprintf("group %d", id)
	}
	switch len(parts) {
	case 0:
		return "no group"
	case 1:
		return parts[0]
	case 2:
		return parts[0] + " and " + parts[1]
	}
	return strings.Join(parts[:len(parts)-1], ", ") + ", and " + parts[len(parts)-1]
}
