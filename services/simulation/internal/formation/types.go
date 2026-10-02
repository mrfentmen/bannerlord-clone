package formation

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Error is every way this package refuses to guess. CONSTITUTION.md section
// 1.3: errors are handled, not swallowed. The fields name the operation and
// the input at fault so a caller can log something a developer can act on and
// a player never sees.
type Error struct {
	// Op is the function or method that refused.
	Op string
	// Field names the input at fault: a unit's agility, an order name, a
	// balance key.
	Field string
	// Detail says what was wrong with it.
	Detail string
}

func (e *Error) Error() string {
	return fmt.Sprintf("formation: %s: %s: %s", e.Op, e.Field, e.Detail)
}

func errorf(op, field, format string, args ...any) *Error {
	return &Error{Op: op, Field: field, Detail: fmt.Sprintf(format, args...)}
}

// Unit is one man, one vehicle, or one crew. It is deliberately the smallest
// thing this package moves: an ID the caller can trace, a ground position, a
// facing, and how fast he moves and turns relative to the nominal man. Troop
// quality, morale, suppression, and ammo belong to the combat system, which
// reads these positions; keeping them out is what lets this package stay a
// set of pure functions.
type Unit struct {
	// ID identifies the unit within its formation. Slots are assigned by
	// sorting IDs, so the same IDs always produce the same shape regardless of
	// the order they arrive in.
	ID int
	// Pos is the unit's ground position in metres.
	Pos Vec
	// Facing is the direction the unit looks, in radians counter-clockwise
	// from +X. A facing of math.Pi/2 looks north (+Y).
	Facing float64
	// Agility scales this unit's speed and turn rate against the nominal man
	// in the config: 1.0 is a fit soldier on open ground, below 1.0 is a
	// wounded or loaded man, above 1.0 is a vehicle or a fresh horse. It must
	// be positive; zero would freeze a unit in place forever and is refused
	// rather than treated as "stationary on purpose".
	Agility float64
}

// Enemy is the opposing formation reduced to the three numbers a commander
// needs to aim a move: where it is, which way it looks, and how deep it is.
// It is plain data, computed by SummariseEnemy from the other side's units.
type Enemy struct {
	// Centre is the mean position of the enemy's units.
	Centre Vec
	// Facing is the direction the enemy formation looks, in radians
	// counter-clockwise from +X. A formation in a line faces perpendicular to
	// its long axis; in a column, it faces along it.
	Facing float64
	// HalfDepth is half the enemy's extent measured along Facing, in metres.
	// It is what "go around their flank" has to clear: the further you swing,
	// the further behind their front you must stand.
	HalfDepth float64
	// HalfWidth is half the enemy's extent measured across Facing, in metres.
	HalfWidth float64
	// Count is how many enemy units were summarised. A flank against one man
	// and a flank against two hundred are different problems.
	Count int
}

// SummariseEnemy reduces a set of enemy units to the Enemy plain data this
// package aims at. It is a pure function of the units: same line, same answer,
// on every machine. Depth and width are measured along and across the
// enemy's own facing rather than the world axes, because a line that has
// turned to face you at an angle is still a line, and its depth is still its
// depth.
func SummariseEnemy(units []Unit) (Enemy, error) {
	centre, err := centroid(units)
	if err != nil {
		return Enemy{}, err
	}
	facing, err := circularMeanFacing(units)
	if err != nil {
		return Enemy{}, err
	}
	// The formation's own axes: along Facing is "how deep am I", across it is
	// "how wide am I".
	along := Vec{math.Cos(facing), math.Sin(facing)}
	across := Vec{-along.Y, along.X}
	var minAlong, maxAlong, minAcross, maxAcross float64
	for i, u := range units {
		d := u.Pos.Sub(centre)
		a := d.X*along.X + d.Y*along.Y
		w := d.X*across.X + d.Y*across.Y
		if i == 0 {
			minAlong, maxAlong, minAcross, maxAcross = a, a, w, w
			continue
		}
		minAlong = math.Min(minAlong, a)
		maxAlong = math.Max(maxAlong, a)
		minAcross = math.Min(minAcross, w)
		maxAcross = math.Max(maxAcross, w)
	}
	return Enemy{
		Centre:    centre,
		Facing:    wrapAngle(facing),
		HalfDepth: (maxAlong - minAlong) / 2,
		HalfWidth: (maxAcross - minAcross) / 2,
		Count:     len(units),
	}, nil
}

// Order is a commander's instruction to a formation. The set is the one
// COMBAT.md section 7 lists for the player, minus the ones that are about
// shooting rather than about where a body of troops stands (spread, tighten,
// cover, suppress, fire at will), which belong to the combat system.
type Order int

const (
	// OrderHold keeps the formation where it is. Units still walk back to
	// their slots, so "hold" is a shape to be restored rather than a spot to
	// be frozen on: a line that has been knocked out of shape reforms on the
	// spot instead of staying ragged.
	OrderHold Order = iota
	// OrderAdvance closes on the enemy at a walking pace and stops at the
	// configured standoff, so an advancing line arrives in order rather than
	// arriving as a queue.
	OrderAdvance
	// OrderCharge closes at a run and stops at contact. The difference from
	// advance is speed and intent, not geometry, and it is why charge has its
	// own speed and its own standoff.
	OrderCharge
	// OrderFlankLeft swings the formation around the enemy's left from our own
	// point of view, which is the enemy's right: two armies facing each other
	// share no left.
	OrderFlankLeft
	// OrderFlankRight is the mirror of OrderFlankLeft.
	OrderFlankRight
	// OrderRetreat breaks contact, keeping the formation together and still
	// facing the enemy, because a body that turns its back has already lost.
	OrderRetreat
)

// orderNames maps every order to its wire and log spelling. The map is only
// read by lookup and only iterated in String's error path, so it cannot make
// behaviour depend on map order.
var orderNames = map[Order]string{
	OrderHold:       "hold",
	OrderAdvance:    "advance",
	OrderCharge:     "charge",
	OrderFlankLeft:  "flank-left",
	OrderFlankRight: "flank-right",
	OrderRetreat:    "retreat",
}

// AllOrders returns every order in a fixed order, for callers that build UI,
// validate input, or iterate the possibilities.
func AllOrders() []Order {
	return []Order{OrderHold, OrderAdvance, OrderCharge, OrderFlankLeft, OrderFlankRight, OrderRetreat}
}

// String returns the order's name, or a marked unknown value for an order that
// was never defined. It does not error, because printing a value must not
// fail; use Valid or ParseOrder when the value has to be checked.
func (o Order) String() string {
	if n, ok := orderNames[o]; ok {
		return n
	}
	return fmt.Sprintf("order(%d)", int(o))
}

// Valid reports whether the order is one this package implements.
func (o Order) Valid() bool {
	_, ok := orderNames[o]
	return ok
}

// ParseOrder turns a command name into an Order. Order names arrive from the
// network and the UI, so an unknown name is an error with the accepted list
// in it rather than a silent fall-back to "hold" — a misheard order that turns
// into "hold" would look like a unit refusing to obey.
func ParseOrder(s string) (Order, error) {
	want := strings.ToLower(strings.TrimSpace(s))
	for _, o := range AllOrders() {
		if orderNames[o] == want {
			return o, nil
		}
	}
	// Accept the underscore spelling too, because that is how the same words
	// are written in Go identifiers and in some client code.
	alt := strings.ReplaceAll(want, "_", "-")
	for _, o := range AllOrders() {
		if orderNames[o] == alt {
			return o, nil
		}
	}
	return OrderHold, errorf("ParseOrder", "order",
		"%q is not an order; valid orders are %s", s, orderList())
}

func orderList() string {
	names := make([]string, 0, len(orderNames))
	for _, o := range AllOrders() {
		names = append(names, orderNames[o])
	}
	return strings.Join(names, ", ")
}

// flankSign returns which way a flanking order swings. It is -1 for left and
// +1 for right in the signed-angle sense used throughout the package, where
// positive is counter-clockwise. Attacking a line head-on, our left is the
// enemy's right, so a left flank order sweeps clockwise around them.
func (o Order) flankSign() float64 {
	switch o {
	case OrderFlankLeft:
		return -1
	case OrderFlankRight:
		return 1
	default:
		return 0
	}
}

// Formation is a shape a body of troops can hold. COMBAT.md section 7 lists
// line, column, wedge, staggered line, and cover posts; this package
// implements the first three plus loose order, which is the skirmish line and
// the body of troops COMBAT.md section 7's "spread" order produces. Staggered
// line and cover posts are not implemented and are not accepted as names,
// because accepting a shape and quietly drawing a line would be exactly the
// silent stub the package rules forbid.
type Formation int

const (
	// FormationLine is a line abreast, as deep as the troops need to be to fit
	// them all. Best for firepower across a front.
	FormationLine Formation = iota
	// FormationColumn is a narrow column on the road or in file. Best for
	// moving fast and arriving in order, worst for firepower.
	FormationColumn
	// FormationWedge is a pointed arrow: one unit at the point and the ranks
	// widening behind it. The point goes in first, which is how a body of
	// troops breaks a line.
	FormationWedge
	// FormationLoose is loose order: men spread out to make a harder target
	// for aimed fire. Called skirmish order in the field.
	FormationLoose
)

var formationNames = map[Formation]string{
	FormationLine:   "line",
	FormationColumn: "column",
	FormationWedge:  "wedge",
	FormationLoose:  "loose",
}

// AllFormations returns every formation in a fixed order.
func AllFormations() []Formation {
	return []Formation{FormationLine, FormationColumn, FormationWedge, FormationLoose}
}

// String returns the formation's name, or a marked unknown value.
func (f Formation) String() string {
	if n, ok := formationNames[f]; ok {
		return n
	}
	return fmt.Sprintf("formation(%d)", int(f))
}

// Valid reports whether the formation is one this package implements.
func (f Formation) Valid() bool {
	_, ok := formationNames[f]
	return ok
}

// ParseFormation turns a shape name into a Formation. "skirmish" is accepted
// as a synonym for loose order, because that is what the manuals call it and
// both words mean the same shape.
func ParseFormation(s string) (Formation, error) {
	want := strings.ToLower(strings.TrimSpace(s))
	if want == "skirmish" || want == "skirmish-line" {
		return FormationLoose, nil
	}
	for _, f := range AllFormations() {
		if formationNames[f] == want {
			return f, nil
		}
	}
	names := make([]string, 0, len(formationNames)+1)
	for _, f := range AllFormations() {
		names = append(names, formationNames[f])
	}
	names = append(names, "skirmish")
	return FormationLine, errorf("ParseFormation", "formation",
		"%q is not a formation; valid formations are %s", s, strings.Join(names, ", "))
}

// sortIDs returns the indices of units ordered by unit ID, ties broken by
// position in the input so that two units sharing an ID still get a stable
// order rather than one that depends on the sort implementation. Every pass in
// this package that has to visit units in a fixed order uses this.
func sortIDs(units []Unit) []int {
	idx := make([]int, len(units))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool {
		return units[idx[a]].ID < units[idx[b]].ID
	})
	return idx
}

// idsOf returns the unit IDs in the order given by idx.
func idsOf(units []Unit, idx []int) []int {
	ids := make([]int, len(idx))
	for i, j := range idx {
		ids[i] = units[j].ID
	}
	return ids
}

// itoa is a small helper so error messages about IDs do not drag strconv into
// every call site.
func itoa(i int) string { return strconv.Itoa(i) }
