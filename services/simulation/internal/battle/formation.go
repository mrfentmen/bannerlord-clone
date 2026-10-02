package battle

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"mbclone/simulation/internal/config"
)

// UNIT FORMATIONS ON THE FIELD.
//
// This file is the battle core's half of COMBAT.md section 7: a side can order a
// group of its units into a shape, the units walk to the slots that shape gives
// them, and the shape they are standing in changes what happens to them when
// they are hit.
//
// # WHAT IS HERE AND WHAT IS NOT
//
// Here: the five shapes (line, column, wedge, hollow square, skirmish), the
// slot each unit in them stands on, the orders a side can give those groups
// (hold, advance, charge, retreat), the cohesion that walks a displaced man
// back to his slot, and the per-shape combat effects.
//
// Not here: which order a formation SHOULD be given. That is the tactics layer's
// business, and this file has no opinion about it. Not here either: cover posts
// and the staggered line, which COMBAT.md section 7 also lists. They are named
// nowhere in this file and refused by ParseFormation, because accepting a shape
// and quietly drawing a line instead of it is the silent stub this codebase
// treats as a bug rather than a feature.
//
// # WHY IT IS A COMMANDER AND NOT A STAGE
//
// A formation order becomes movement intents for the member units, and it does
// so through the command seam in command.go: a Commander, called once per tick
// after the intent stage, writing into View.Commands. That is the seam the
// tactics layer already uses, and using it is what keeps formations inside the
// existing intent pipeline rather than beside it. A formation does not get its
// own movement pass, its own tick slot, or its own copy of the unit arrays; it
// speaks the same orders the rest of the command layer speaks, and the engine
// still decides who is allowed to be commanded at all.
//
// The shape a unit is standing in is published through that same seam rather
// than computed inside the melee and aimed-fire stages, because those stages
// read the snapshot and write the delta buffer and must not depend on who else
// is in the battle. The commander writes what shape each unit is in; the combat
// stages read that from shared state and multiply their own numbers by what the
// balance file says the shape is worth. CONSTITUTION.md section 2.1: systems read
// shared state and write shared state, and none of them calls another.
//
// # DETERMINISM
//
// Every slot is a pure function of (shape, unit index, formation parameters,
// scatter seed). No generator is drawn from, no clock is read, and no iteration
// order is left to a map. The scatter that pushes skirmishers off their lattice
// is a hash of the seed and the unit's index, so the same battle replays to the
// same men standing in the same scattered places, and a formation never depends
// on how many random numbers anything else has consumed.
//
// # A NOTE ON THE OTHER FORMATION CODE IN THIS REPO
//
// internal/formation and internal/command already own a formation planner: the
// shapes, the spacing, the orders, and the tactics layer above them. This file
// does not call them, and it does not replace them. It is the field half: the
// part that turns a shape into per-unit slot positions and per-shape combat
// effects inside the tick loop, which nothing did before. The one shape it adds
// that the planner does not have is the hollow square. Where the two overlap
// they are kept deliberately independent, and the duplication is a known cost
// rather than an accident; reconciling them is a decision for the person who owns
// both, not something to do quietly in the middle of a battle sim.

// Formation is a shape a body of troops can hold.
//
// FormationNone is the zero value and it is not a shape: it means this unit is
// in no formation, and a unit in no formation gets no formation effect. It is
// the zero value on purpose. The order log, the command channel, and the
// per-tick state all use a Formation, and a zero that meant "line" would give
// every unit that nobody commanded the bonus a line gets, which is a shape that
// does nothing being a shape that is silently worth something.
type Formation uint8

const (
	// FormationNone is no shape at all: the unit was not ordered into one.
	FormationNone Formation = iota
	// FormationLine is a line abreast, as deep as the men need to be to fit
	// them all. The reference shape: it neither adds nor takes anything away,
	// and it is the shape a body of troops ends up in when nobody has an
	// opinion.
	FormationLine
	// FormationColumn is a narrow column, deep and fast, able to use a road
	// and to arrive in order, and able to shoot almost nothing to the front.
	FormationColumn
	// FormationWedge is a pointed arrow: one man at the point and the ranks
	// widening behind him. The point goes in first, which is how a body of
	// troops breaks a line, and which is also why a wedge is caught from the
	// side.
	FormationWedge
	// FormationSquare is a hollow square: the perimeter of a square, with the
	// middle left empty. A wall rather than a spear, and the only shape here
	// that turns a fast mover away.
	FormationSquare
	// FormationSkirmish is skirmish or loose order: men spread out so one burst
	// cannot hit ten of them, and paying for it in the hand-to-hand.
	FormationSkirmish
)

var formationNames = map[Formation]string{
	FormationLine:     "line",
	FormationColumn:   "column",
	FormationWedge:    "wedge",
	FormationSquare:   "square",
	FormationSkirmish: "skirmish",
}

// AllFormations returns every shape this file implements, in a fixed order, for
// callers that build a menu, validate input, or iterate the possibilities.
func AllFormations() []Formation {
	return []Formation{FormationLine, FormationColumn, FormationWedge, FormationSquare, FormationSkirmish}
}

// String names the shape for reports, order logs, and error messages. It does
// not error, because printing a value must not fail.
func (f Formation) String() string {
	if n, ok := formationNames[f]; ok {
		return n
	}
	if f == FormationNone {
		return "none"
	}
	return fmt.Sprintf("formation(%d)", int(f))
}

// Valid reports whether this is a shape that can be stood in. FormationNone is
// deliberately not one of them: it is the absence of an order, and treating it
// as a shape is how a unit nobody commanded ends up in a line.
func (f Formation) Valid() bool {
	_, ok := formationNames[f]
	return ok
}

// ParseFormation reads a shape name.
//
// Shape names arrive from a UI, a config file, and a network order, so an
// unknown name is an error carrying the accepted list rather than a silent
// fall-back to a line. A misheard "square" that became "line" would look like a
// commander who ignored his order.
//
// The field synonyms are here because both words are the manuals' word for the
// same shape: "loose" and "skirmish", and "hollow" and "square". Underscores are
// accepted in place of hyphens for the same reason the orders accept them.
func ParseFormation(s string) (Formation, error) {
	want := strings.ToLower(strings.TrimSpace(s))
	// The manuals, the UI and the wire all spell these differently: "hollow
	// square", "hollow_square", "hollow-square". Underscores and spaces are the
	// same separator in every language this game is written in, so both fold to a
	// hyphen before anything is compared. Without that, the name the manual prints
	// is refused with a list of the names that would have worked, which is the worst
	// possible answer to somebody typing what they were told to type.
	want = strings.ReplaceAll(want, "_", "-")
	want = strings.ReplaceAll(want, " ", "-")
	switch want {
	case "loose", "skirmish", "skirmish-line", "loose-order":
		return FormationSkirmish, nil
	case "hollow", "hollow-square":
		return FormationSquare, nil
	}
	for _, f := range AllFormations() {
		if formationNames[f] == want {
			return f, nil
		}
	}
	names := make([]string, 0, len(formationNames)+2)
	for _, f := range AllFormations() {
		names = append(names, formationNames[f])
	}
	names = append(names, "loose", "hollow")
	return FormationNone, newFormationError("ParseFormation", "formation",
		"%q is not a formation; the formations are %s, and skirmish and hollow are accepted spellings of loose and square",
		s, strings.Join(names, ", "))
}

// FormationOrder is what a side tells a group to do with the shape it is holding.
type FormationOrder uint8

const (
	// OrderFormationHold keeps the formation where its men already are. The
	// men still walk back to their slots, so "hold" is a shape to be restored
	// rather than a place to be frozen: a line that has been knocked out of
	// shape reforms on the spot instead of staying ragged.
	OrderFormationHold FormationOrder = iota
	// OrderFormationAdvance closes on the enemy at a walking pace and stops at
	// the configured standoff, so an advancing line arrives in order rather
	// than arriving as a queue.
	OrderFormationAdvance
	// OrderFormationCharge closes at a run and stops at contact. The
	// difference from an advance is the pace and what it is worth in damage,
	// not the geometry.
	OrderFormationCharge
	// OrderFormationRetreat breaks contact, keeping the formation together and
	// still facing the enemy, because a body that turns its back has already
	// lost.
	OrderFormationRetreat
	// OrderFormationMove sends the shape to a place rather than to the enemy: it
	// walks towards the point it was given and stops there, still in shape and
	// still facing whatever it faced before. It is the order a player gives when
	// the fight is somewhere else.
	OrderFormationMove
)

var formationOrderNames = map[FormationOrder]string{
	OrderFormationHold:    "hold",
	OrderFormationAdvance: "advance",
	OrderFormationCharge:  "charge",
	OrderFormationRetreat: "retreat",
	OrderFormationMove:    "move",
}

// AllFormationOrders returns every order in a fixed order.
func AllFormationOrders() []FormationOrder {
	return []FormationOrder{OrderFormationHold, OrderFormationAdvance, OrderFormationCharge, OrderFormationRetreat, OrderFormationMove}
}

// String names the order for reports and order logs.
func (o FormationOrder) String() string {
	if n, ok := formationOrderNames[o]; ok {
		return n
	}
	return fmt.Sprintf("order(%d)", int(o))
}

// Valid reports whether this is an order this file implements.
func (o FormationOrder) Valid() bool {
	_, ok := formationOrderNames[o]
	return ok
}

// ParseFormationOrder reads an order name, refusing an unknown one for the same
// reason ParseFormation refuses an unknown shape.
func ParseFormationOrder(s string) (FormationOrder, error) {
	want := strings.ToLower(strings.TrimSpace(s))
	// As ParseFormation: the same separators, folded the same way, so a caller
	// spelling an order with a space or an underscore gets the same answer it would
	// get for the hyphenated name.
	want = strings.ReplaceAll(want, "_", "-")
	want = strings.ReplaceAll(want, " ", "-")
	for _, o := range AllFormationOrders() {
		if formationOrderNames[o] == want {
			return o, nil
		}
	}
	names := make([]string, 0, len(formationOrderNames))
	for _, o := range AllFormationOrders() {
		names = append(names, formationOrderNames[o])
	}
	return OrderFormationHold, newFormationError("ParseFormationOrder", "order",
		"%q is not a formation order; the orders are %s", s, strings.Join(names, ", "))
}

// Facing is which way a formation looks.
//
// The zero value faces the enemy, because that is what a formation almost always
// wants to do and because a struct whose zero value is a choice a commander has
// not made yet is the one that is hard to reason about. A commander that wants
// a fixed bearing sets Fixed.
type Facing struct {
	// Bearing is the direction of the formation's frame in radians
	// counter-clockwise from +X, read only when Fixed is true. +X is east and
	// +Y is north, so a facing of pi/2 looks north.
	Bearing float64
	// Fixed chooses between facing the enemy and facing Bearing.
	Fixed bool
}

// resolve returns the direction the formation should look, given where its own
// centre of mass is and where the enemy is.
//
// A formation with a fixed bearing uses it whatever the enemy does. One without
// squares up to the enemy every tick, which is what keeps a formation's front on
// the fight instead of slowly presenting its flank as the two of them drift.
//
// With no enemy in front of it there is nothing to square up to, and the last
// bearing is kept rather than snapping to +X: a formation whose enemy has just
// been wiped out should not spin round to the east because its enemy stopped
// existing. The caller carries last across the ticks for exactly this.
func (f Facing) resolve(anchorX, anchorY, enemyX, enemyY float64, haveEnemy bool, last float64) float64 {
	if f.Fixed {
		return wrapAngle(f.Bearing)
	}
	if !haveEnemy {
		return last
	}
	return Bearing(anchorX, anchorY, enemyX, enemyY)
}

// Destination is a place on the field, in metres, that a shape can be sent to.
//
// It is a separate type so that "there is no destination" and "the destination is
// the origin" are different values rather than the same zero, which is the same
// reason Facing carries a Fixed flag instead of relying on a bearing of zero.
type Destination struct {
	// X and Y are the point the shape walks to, in metres.
	X, Y float64
}

// GroupOrder is one side's standing order for one group of its units: the shape,
// what to do with it, and which way it looks.
type GroupOrder struct {
	// Kind is the shape to form. A shape that is not Valid is refused by
	// NewFormationCommander rather than quietly drawn as something else.
	Kind Formation
	// Order is what the formation does with that shape.
	Order FormationOrder
	// Facing is which way the shape looks. The zero value faces the enemy.
	Facing Facing
	// At is where OrderFormationMove sends the shape, and it is read only by that
	// order. Nil for every other order, and a destination on an order that does
	// not walk anywhere is refused rather than ignored: an order carrying a place
	// that nothing will walk to is an order nobody read.
	At *Destination
	// Follow is the index, in the group list the commander was built with, of the
	// group whose anchor this one keeps station behind. Nil means this group finds
	// its own place, which is every order in the game except the one that names a
	// group to follow.
	//
	// It is a pointer so that "following nobody" is its own value. An int whose
	// zero meant "no follow" would make the zero GroupOrder follow group 0, which
	// is the shape of bug this layer refuses everywhere else: a parameter read by
	// nobody that looks like one that is read.
	//
	// An index and not a unit id because it is a reference into a list the caller
	// supplied and the caller keeps: Orders.Groups() hands that list back, so a
	// client can say "follow group 1" and mean what it said. It is checked when
	// the commander is built, for range, for pointing at itself, and for a cycle,
	// so a dangling or circular follow is a refusal rather than a shape that
	// quietly stands still.
	Follow *int
}

// Group is a GroupOrder and the units ordered to carry it out.
type Group struct {
	// Order is the standing order.
	Order GroupOrder
	// Units are the battle ids of the units in this group. Run assigns ids
	// densely in roster order, side A first, so a caller that wants a side
	// split into groups can split 0..n/2, n/2..n, and so on.
	//
	// The order of this slice does not matter. Slots are assigned by ascending
	// id, so the same men form the same shape however the caller happened to
	// list them. A unit in two groups is an error rather than a coin toss,
	// because a man with two slots has none.
	Units []int
}

// SplitIntoGroups divides ids into n groups of as nearly equal a size as
// possible, in order, and is what a caller uses to hand a whole side to the
// formation layer without writing out who is in which group.
//
// The remainder goes to the first groups rather than the last, which is a
// cosmetic choice about which formations are a man larger. It matters only that
// the split is a function of the ids and n alone: the same side always splits
// the same way, so a recorded battle finds the same men in the same formation.
func SplitIntoGroups(ids []int, n int) [][]int {
	if n < 1 {
		return nil
	}
	out := make([][]int, n)
	sorted := append([]int(nil), ids...)
	sort.Ints(sorted)
	for i := range sorted {
		// i*n/len is the first group that should take element i: it spreads
		// the remainder across the early groups without an accumulation of
		// sizes, and it cannot divide by zero because the loop is over len.
		g := i * n / len(sorted)
		if g >= n {
			g = n - 1
		}
		out[g] = append(out[g], sorted[i])
	}
	return out
}

// Slot is one unit's place in a formation, in the formation's own frame: Right
// is metres to the right of the anchor and Forward is metres ahead of it, the
// direction the formation looks.
//
// Slots are local because the same shape is reused at any position and any
// facing: a wedge in front of the enemy at the start of the battle and the same
// wedge around their flank a minute later are the same shape, and storing them
// in world coordinates would hide that.
//
// The anchor is the formation's centre of mass and every shape is centred on it,
// so the mean of the slots' Forward is zero and slots run positive in front of
// the anchor and negative behind it. That matters more than it looks: a shape
// whose front rank sat at zero would be permanently out of step with its own
// anchor, and every man in it would spend the battle walking backwards toward
// the slot he had been told to hold.
type Slot struct {
	Right   float64
	Forward float64
}

// place puts a slot on the ground at an anchor with a heading in radians
// counter-clockwise from +X. Forward is the heading and right is the heading
// turned a quarter turn clockwise, which is what "to the right of a man facing
// that way" means on the ground.
func (s Slot) place(anchorX, anchorY, heading float64) (x, y float64) {
	fx, fy := math.Cos(heading), math.Sin(heading)
	rx, ry := fy, -fx
	return anchorX + rx*s.Right + fx*s.Forward, anchorY + ry*s.Right + fy*s.Forward
}

// FormationParams is every number a layout reads. It is the geometry and the
// scatter, and nothing else: what a shape is worth in contact is not a layout
// question and lives in the balance config, read by the engine, because the pure
// functions below must stay pure.
type FormationParams struct {
	// FrontSpacing is the metres between two men abreast in the same rank.
	FrontSpacing float64
	// RankSpacing is the metres of depth between one rank and the next.
	RankSpacing float64
	// LineFrontWidth is how many men stand abreast in one rank of a line.
	LineFrontWidth int
	// ColumnFrontWidth is how many men stand abreast in one rank of a column.
	ColumnFrontWidth int
	// WedgeTipUnits is how many men form the point of a wedge.
	WedgeTipUnits int
	// WedgeRowGrowth is how many men are added to each side of the wedge for
	// every rank back from the point.
	WedgeRowGrowth int
	// LooseSpacing is the metres between neighbours in skirmish order.
	LooseSpacing float64
	// LooseJitterFraction is how far a man may be pushed off his lattice point,
	// as a fraction of LooseSpacing. It is bounded by the balance file below
	// one half: past that, two neighbours can be pushed into each other by the
	// scatter alone.
	LooseJitterFraction float64
	// MinSeparation is the smallest gap the engine's spacing pass will allow
	// between any two men. The formation layer needs it and not only the pass,
	// because a formation that is commanded does not get the pass: the seam
	// writes the commander's movement over whatever separation the intent stage
	// staged, so the shape's own slots are the only thing keeping a commanded
	// formation from standing men inside each other. See settleRadius.
	MinSeparation float64

	// Seed drives that scatter. It is data, not state: the same seed and the
	// same men always produce the same scatter, so a recorded battle replays
	// exactly and no generator state has to travel with the snapshot.
	Seed int64
}

// FormationParamsFrom reads the layout numbers out of a loaded balance config.
//
// The scatter seed is stored in the balance file as a number because that loader
// has one numeric type, and it is read here as the integer it is meant to be.
func FormationParamsFrom(c config.Formation) FormationParams {
	return FormationParams{
		FrontSpacing:        c.FrontSpacing,
		RankSpacing:         c.RankSpacing,
		LineFrontWidth:      int(c.LineFrontWidth),
		ColumnFrontWidth:    int(c.ColumnFrontWidth),
		WedgeTipUnits:       int(c.WedgeTipUnits),
		WedgeRowGrowth:      int(c.WedgeRowGrowth),
		LooseSpacing:        c.LooseSpacing,
		LooseJitterFraction: c.LooseJitterFraction,
		MinSeparation:       c.MinSeparation,
		Seed:                int64(c.LooseSeed),
	}
}

// validate refuses parameters a layout cannot work with, rather than dividing by
// them or looping forever. A zero front spacing would put every man in a rank on
// the same point, and a zero rank spacing would put every rank on the same line,
// and neither is a shape a caller meant to ask for.
func (p FormationParams) validate() error {
	switch {
	case p.FrontSpacing <= 0 || !isFinite(p.FrontSpacing):
		return newFormationError("FormationParams", "FrontSpacing",
			"front spacing is %g m; men abreast need a positive gap or they are one man", p.FrontSpacing)
	case p.RankSpacing <= 0 || !isFinite(p.RankSpacing):
		return newFormationError("FormationParams", "RankSpacing",
			"rank spacing is %g m; one rank behind another needs a positive depth or they are the same rank", p.RankSpacing)
	case p.LineFrontWidth < 1:
		return newFormationError("FormationParams", "LineFrontWidth",
			"line front width is %d; a line of nobody abreast is not a line", p.LineFrontWidth)
	case p.ColumnFrontWidth < 1:
		return newFormationError("FormationParams", "ColumnFrontWidth",
			"column front width is %d; a column of nobody abreast is not a column", p.ColumnFrontWidth)
	case p.WedgeTipUnits < 1:
		return newFormationError("FormationParams", "WedgeTipUnits",
			"wedge tip is %d units; a wedge with no point is a block", p.WedgeTipUnits)
	case p.WedgeRowGrowth < 1:
		return newFormationError("FormationParams", "WedgeRowGrowth",
			"wedge row growth is %d; a wedge that does not widen going back is a column", p.WedgeRowGrowth)
	case p.LooseSpacing <= 0 || !isFinite(p.LooseSpacing):
		return newFormationError("FormationParams", "LooseSpacing",
			"loose spacing is %g m; scattered men need a positive gap or they are not scattered", p.LooseSpacing)
	case p.LooseJitterFraction < 0 || p.LooseJitterFraction >= 0.5:
		return newFormationError("FormationParams", "LooseJitterFraction",
			"loose jitter is %g of the loose spacing; at or above one half two neighbours can be "+
				"pushed into each other by the scatter alone", p.LooseJitterFraction)
	}
	// MinSeparation is deliberately NOT range-checked here, and the reason is
	// that a FormationParams built by hand has always been legal with any field
	// left at its zero. Checking it would refuse every layout test that spells out
	// a shape without spelling out a spacing pass it never runs, and a value of
	// zero here is not dangerous: settleRadius reads it as "this caller has no
	// minimum gap", widens the in-place radius to half the shape's own spacing,
	// and the only thing it can produce is a formation tidied to the spacing it was
	// drawn at. The production path is FormationParamsFrom, and the balance file
	// bounds min_separation to 0.1-20 m in internal/config's own validator.
	return nil
}

// settleRadius is how far a man may be from his slot and still be left standing
// in it by a HOLD: half of what the shape's own neighbour gap has to give up
// before two of its men could stand closer together than the smallest gap the
// balance file allows.
//
// It is derived from two numbers the balance file already holds rather than
// configured, for the reason every other derived number in this file is: "in his
// place" is a rule about what a slot is, and a configured tolerance would be a
// second opinion about it.
//
// # WHY A HOLD NEEDS A DIFFERENT ANSWER FROM EVERY OTHER ORDER
//
// cohesionTolerance is a whole spacing, and that is the right answer for a man
// who is about to be moved again — a fall-back, a move, anything where the shape
// is on its way somewhere — because there the tolerance exists only to stop a man
// who is already there from being told to walk, and a shape that shivers is worse
// than a shape that is a spacing out.
//
// It is the wrong answer for a hold, and measurably so. Two neighbours in a line
// are one spacing apart, and if each may be a whole spacing out from his own slot
// then the tightest pair a settled hold can produce is zero: they meet in the
// middle. A line at 1.5 m front spacing holding its men inside 1.5 m of a 1.5 m
// slot is not a line at 1.5 m; it is a crowd that happens to have a line drawn
// on it.
//
// Nothing used to catch that, because a hold also drifted — see the slot loop in
// orderGroup. The drift carried the men past each other continuously and the
// engine's own movement kept undoing the crowding, so a hold that did not hold was
// quietly tidying itself by walking. The moment the hold was made to hold, the
// crowding it had been hiding became visible: on the thirty-a-side test session,
// two men of a held line settled 0.20 m apart, against a balance file that names
// 1.2 m as the smallest gap the spacing pass will allow.
//
// # WHY THE MINIMUM SEPARATION AND NOT A FRACTION OF THE SPACING
//
// Because the pass that would otherwise catch this does not run. The command seam
// writes the commander's movement over the intent stage's deltas wholesale, so a
// commanded unit keeps no separation nudge at all and the shape's slots are the
// only thing standing between a formation and men inside each other. A fraction
// of the spacing would have been a guess at how much room the spacing has to
// spare, and the answer depends on the balance file: 1.5 m of front spacing with
// a 1.2 m minimum has 0.3 m to give and 1.5 m with a 0.2 m minimum has 1.3 m. Half
// of what is left over is the largest radius that still cannot put two neighbours
// closer than the minimum, which is the invariant worth having and the one the
// config validator already insists the shape can satisfy.
//
// The loose-order case is not a special one, and it is worth saying why, because
// the obvious worry is that a skirmisher would be tidied into a grid. The scatter
// is in the SLOTS, not in the men's positions: skirmishSlots bakes a hash of
// (seed, index) into every lattice point before the shape is ever drawn. Tidying a
// man onto his slot therefore tidies him onto his own scattered point, and the
// loose look is the shape's rather than the men's. The gap used for a skirmisher
// is the lattice spacing less the scatter from both sides, which is the same
// quantity the config validator calls the tightest gap any shape produces.
func settleRadius(kind Formation, p FormationParams) float64 {
	gap := p.FrontSpacing
	if kind == FormationSkirmish {
		gap = p.LooseSpacing * (1 - 2*p.LooseJitterFraction)
	}
	if r := (gap - p.MinSeparation) / 2; r > 0 {
		return r
	}
	// A balance file whose minimum separation is as wide as the tightest gap any
	// shape produces. The config validator allows it, and the honest reading is
	// that a man has to be exactly in his slot to count as in it.
	return 0
}

// cohesionTolerance is how far a man may be from his slot and still count as
// standing in it: the shape's own spacing, once.
//
// It is derived rather than configured because "a man is out of his place when
// he is more than one spacing from it" is a rule about what a slot is, and a
// configured tolerance would be a second number that could disagree with the
// spacing it is expressed in. A skirmisher is given a skirmisher's tolerance,
// which is why a man seven metres from his slot in loose order is in place and
// a man seven metres from his slot on a line is not.
func cohesionTolerance(kind Formation, p FormationParams) float64 {
	if kind == FormationSkirmish {
		return p.LooseSpacing
	}
	return p.FrontSpacing
}

// FormationLayout returns the slots for n units in kind, in assignment order:
// slots[i] belongs to the i-th unit of the group, which is the i-th unit by
// ascending battle id.
//
// The returned slice is centred on its own centre of mass, so the caller may
// treat the group's anchor as the origin of the shape without the shape walking
// off the anchor over a long battle. See Slot and centreOnMass.
//
// It is a pure function of (kind, n, p). Nothing here reads a unit, a seed, a
// clock, or a generator, which is what makes it testable to the metre and
// replayable to the bit.
func FormationLayout(kind Formation, n int, p FormationParams) ([]Slot, error) {
	if !kind.Valid() {
		return nil, newFormationError("FormationLayout", "formation",
			"%v is not a shape, so it has no layout", kind)
	}
	if n < 1 {
		return nil, newFormationError("FormationLayout", "units",
			"a formation of %d units has no layout; there is nobody to place", n)
	}
	if err := p.validate(); err != nil {
		return nil, err
	}
	var slots []Slot
	var err error
	switch kind {
	case FormationLine:
		slots = rankBlock(n, p.LineFrontWidth, p)
	case FormationColumn:
		slots = rankBlock(n, p.ColumnFrontWidth, p)
	case FormationWedge:
		slots = wedgeSlots(n, p)
	case FormationSquare:
		slots, err = squareSlots(n, p)
		if err != nil {
			return nil, err
		}
	case FormationSkirmish:
		slots = skirmishSlots(n, p)
	default:
		// Unreachable, because Valid has already been checked. Kept anyway: a
		// shape added to the enum without a layout here must fail loudly here
		// rather than hand back an empty formation that reads as bad data in
		// the caller's.
		return nil, newFormationError("FormationLayout", "formation",
			"%v has no layout implemented", kind)
	}
	centreOnMass(slots)
	return slots, nil
}

// centreOnMass shifts a shape so its centre of mass sits on the anchor.
//
// Both axes have to be centred, and the second one is not optional. A shape is
// rarely symmetric: a line of two hundred men at sixteen to a rank has a
// part-filled rear rank, and a wedge is wider at the back than the front. If the
// shape's mean offset is not zero then a formation standing exactly on its slots
// has its centre of mass somewhere other than the anchor, the anchor is by
// definition the centre of mass, and the two disagree, so the shape walks
// steadily off its own position over a couple of minutes of fighting. Nothing
// about that looks wrong until you measure where the line started.
func centreOnMass(slots []Slot) {
	if len(slots) == 0 {
		return
	}
	var sumR, sumF float64
	for _, s := range slots {
		sumR += s.Right
		sumF += s.Forward
	}
	n := float64(len(slots))
	for i := range slots {
		slots[i].Right -= sumR / n
		slots[i].Forward -= sumF / n
	}
}

// rankBlock lays out n men rank by rank at a fixed width: the first rank abreast
// at the front, the next behind it, and so on. Line and column are the same
// shape with a different width, which is why they share this code and only the
// balance file's front-width knobs tell them apart.
//
// A rank is centred on the spine. An odd count puts a man on it and an even
// count straddles it, which is correct, because there is no man in the middle of
// an even rank. Whatever men are left over make a short final rank rather than
// being dropped: a formation of any size is a formation, not a formation minus a
// remainder.
func rankBlock(n, width int, p FormationParams) []Slot {
	slots := make([]Slot, n)
	for i := range slots {
		slots[i] = Slot{
			Right:   (float64(i%width) - float64(width-1)/2) * p.FrontSpacing,
			Forward: -float64(i/width) * p.RankSpacing,
		}
	}
	return slots
}

// wedgeSlots lays out a pointed arrow: the point at the front, each rank behind
// it wider by the configured growth on each side.
//
// The first unit in assignment order takes the point, because that is the rank
// that goes in first and a wedge is an argument about who goes in first. One man
// at the tip with two added per side is a 45-degree arrow; one added per side is
// a narrow shape barely worth the name; five is a very broad, slow arrow. That
// is a balance decision the config file makes rather than one this code decides.
//
// A wedge widens as it goes back, so if the men run out partway through a rank
// that rank is short, and it is still centred on the spine: a partial wedge reads
// as one body of troops with a thin rear rather than a triangle with a stub
// hanging off it.
func wedgeSlots(n int, p FormationParams) []Slot {
	slots := make([]Slot, 0, n)
	for rank := 0; len(slots) < n; rank++ {
		// Rank r is the point widened by r growths on each side.
		width := p.WedgeTipUnits + 2*p.WedgeRowGrowth*rank
		if remaining := n - len(slots); width > remaining {
			width = remaining
		}
		for k := 0; k < width; k++ {
			slots = append(slots, Slot{
				Right:   (float64(k) - float64(width-1)/2) * p.FrontSpacing,
				Forward: -float64(rank) * p.RankSpacing,
			})
		}
	}
	return slots
}

// squareSlots lays out a hollow square: the perimeter of a square and nothing
// else. The middle is left empty on purpose, because the empty middle is the
// shape.
//
// A square of side s has 4s-4 men on its perimeter, so the smallest side that
// holds n men is the smallest s with 4s-4 >= n, and the shape is that square
// filled round its edge. The side therefore grows with the square root of the
// count while the perimeter grows with twice it, which is exactly why a square
// gets relatively more hollow as it gets bigger: 36 men is a 10-to-a-side
// square with 36 of its 36 perimeter places filled and 64 places inside them
// empty, and 9 men is a 4-to-a-side square with 9 of 12 filled.
//
// For four men or fewer there is no inside to leave empty and the shape is a
// ring, not a square. That is stated rather than hidden, because a four-man
// "hollow square" that quietly filled itself in would be a shape lying about
// what it is.
//
// The perimeter is filled the way a body of troops fills one: the front rank
// first, from the formation's left to its right, then back down the right side,
// then the rear rank from right to left, then up the left side to the front. The
// first unit in assignment order therefore stands at the front left, which is the
// corner a commander watches.
func squareSlots(n int, p FormationParams) ([]Slot, error) {
	side := squareSide(n)
	half := float64(side-1) / 2
	slots := make([]Slot, 0, n)
	// Front rank, left to right: the whole rank, or as much of it as the men
	// left can fill.
	for k := 0; k < side; k++ {
		slots = append(slots, Slot{
			Right:   (float64(k) - half) * p.FrontSpacing,
			Forward: half * p.RankSpacing,
		})
		if len(slots) == n {
			return slots, nil
		}
	}
	// Down the right side, the man behind the front-right corner first, and
	// including the rear-right corner, which is where the rear rank starts.
	for r := 1; r < side; r++ {
		slots = append(slots, Slot{
			Right:   half * p.FrontSpacing,
			Forward: (half - float64(r)) * p.RankSpacing,
		})
		if len(slots) == n {
			return slots, nil
		}
	}
	// Rear rank, right to left, starting one short of the rear-right corner
	// because the right side already has it.
	for k := side - 2; k >= 0; k-- {
		slots = append(slots, Slot{
			Right:   (float64(k) - half) * p.FrontSpacing,
			Forward: -half * p.RankSpacing,
		})
		if len(slots) == n {
			return slots, nil
		}
	}
	// Up the left side, behind the front-left corner and stopping short of the
	// rear-left one, which the rear rank already has.
	for r := 1; r < side-1; r++ {
		slots = append(slots, Slot{
			Right:   -half * p.FrontSpacing,
			Forward: (half - float64(r)) * p.RankSpacing,
		})
		if len(slots) == n {
			return slots, nil
		}
	}
	// Unreachable for any n: squareSide chose this side because its perimeter
	// holds n, and the four passes above fill exactly that perimeter. It is
	// still an error rather than a short shape, because a change to the
	// perimeter arithmetic that broke this invariant would otherwise hand the
	// caller fewer slots than units and leave the last man of every formation
	// without a place to stand.
	return nil, newFormationError("squareSlots", "units",
		"a square of side %d holds %d men on its perimeter and there are %d to place; the "+
			"perimeter arithmetic and the placement disagree", side, 4*side-4, n)
}

// squareSide is the number of men to a side of the smallest hollow square that
// holds n men: the smallest s with 4s-4 >= n, worked out in integers so the
// answer is exact for every n rather than exact for most.
func squareSide(n int) int {
	if n < 1 {
		return 1
	}
	side := 2
	for 4*side-4 < n {
		side++
	}
	return side
}

// skirmishSlots scatters n men on a lattice and then pushes each of them off his
// lattice point by a deterministic amount.
//
// The lattice is loose spacing apart rather than shoulder to shoulder, because
// the whole purpose of skirmish order is that one burst cannot hit ten men
// standing in a file, and a square lattice with no scatter is a grid with holes
// in it rather than loose order. The scatter is what makes it look loose.
//
// The side of the lattice is the smallest whole number whose square holds n, so
// a group is roughly as deep as it is wide, which is what happens when a
// commander spreads a body of men and lets them find their own places.
func skirmishSlots(n int, p FormationParams) []Slot {
	side := 1
	for side*side < n {
		side++
	}
	half := float64(side-1) / 2
	amp := p.LooseJitterFraction * p.LooseSpacing
	slots := make([]Slot, n)
	for i := range slots {
		jx, jy := scatterOffset(p.Seed, i, amp)
		slots[i] = Slot{
			Right:   (float64(i%side)-half)*p.LooseSpacing + jx,
			Forward: (float64(i/side)-half)*p.LooseSpacing + jy,
		}
	}
	return slots
}

// scatterOffset is how far the man in slot i of a skirmish line is pushed off his
// lattice point, in metres, from the seed and i alone.
//
// It is a hash, not a draw from a generator, and that is the whole point. A
// battle has to be reproducible from a seed alone, and a man who appears to
// teleport between ticks because something else in the simulation consumed a
// random number is a bug that no screenshot shows and every log does. Hashing
// (seed, i) gives that property for free: two men in the same formation are
// pushed by unrelated amounts, and the same man is pushed by the same amount in
// every run on every machine.
//
// The two offsets come from one hash folded twice, and both are bounded by amp.
// The bound is per axis, which is what the balance file's limit below one half of
// the spacing promises: at a jitter of just under one half, two neighbours one
// spacing apart cannot be pushed into each other along either axis.
func scatterOffset(seed int64, i int, amp float64) (float64, float64) {
	// FNV-1a over the eight bytes of the seed, then over the index, then one
	// avalanche step. FNV-1a is a byte-at-a-time hash and the avalanche is
	// multiply-and-shift; between them a lattice point and its neighbour get
	// offsets with no visible relationship, which is the entire requirement.
	const (
		fnvOffset uint64 = 14695981039346656037
		fnvPrime  uint64 = 1099511628211
	)
	h := fnvOffset
	for shift := 0; shift < 64; shift += 8 {
		h ^= uint64(byte(seed >> uint(shift)))
		h *= fnvPrime
	}
	// The index is added rather than folded in one go, and offset by one, so
	// that index zero does not hash to the seed's own value.
	h ^= uint64(i+1) * fnvPrime
	h *= fnvPrime
	h = avalanche(h)
	// 53 bits is the most a float64 holds exactly, and mapping through it keeps
	// the result inside [-amp, amp] without a second comparison.
	const mantissa = float64(uint64(1) << 53)
	a := float64(h>>11) / mantissa
	b := float64(avalanche(h^0x9E3779B97F4A7C15)>>11) / mantissa
	return (2*a - 1) * amp, (2*b - 1) * amp
}

// avalanche is a finalising mix of a 64-bit value: xor-shift down, multiply, xor
// shift up. It exists so that two inputs differing in one bit produce outputs
// with no relationship at all, which is the property a scatter needs and the
// reason the same formation does not come out as parallel stripes every time.
func avalanche(x uint64) uint64 {
	x ^= x >> 33
	x *= 0xff51afd7ed558ccd
	x ^= x >> 33
	x *= 0xc4ceb9fe1a85ec53
	return x ^ (x >> 33)
}

// newFormationError is this file's error constructor. It returns the battle
// package's own error type with ErrUnitInvalid, because a formation order that
// cannot be carried out is a caller error and CONSTITUTION.md section 1.3 wants
// it named rather than ignored.
func newFormationError(op, field, format string, args ...any) error {
	return &Error{
		Kind:   ErrUnitInvalid,
		Field:  field,
		Detail: fmt.Sprintf("formation: %s: %s: %s", op, field, fmt.Sprintf(format, args...)),
	}
}

// wrapAngle folds an angle in radians into (-pi, pi].
func wrapAngle(a float64) float64 {
	if !isFinite(a) {
		return 0
	}
	a = math.Mod(a+math.Pi, 2*math.Pi)
	if a <= 0 {
		a += 2 * math.Pi
	}
	return a - math.Pi
}

// Bearing returns the direction from one point to another in radians
// counter-clockwise from +X. Two points at the same place have no direction, and
// zero is returned for them rather than a NaN: every caller in this file has a
// fallback direction, and a NaN would poison the angle arithmetic downstream.
func Bearing(fromX, fromY, toX, toY float64) float64 {
	return wrapAngle(math.Atan2(toY-fromY, toX-fromX))
}

// formationState is what the formation layer published for one unit this tick:
// the shape it is standing in and the bearing that shape faces.
//
// It is committed state read by the combat stages, exactly like the snapshot, and
// it is reset at the top of every tick so a unit nobody commanded this tick is
// in no shape rather than in whatever shape it was in last tick. That reset is
// the difference between a formation effect and a sticky one: a unit that breaks
// and stops being commanded must lose the wedge's charge bonus with the order,
// not keep it for the rest of the battle.
type formationState struct {
	// Kind is the shape, or FormationNone for no shape.
	Kind Formation
	// Facing is the bearing the shape looks, in radians counter-clockwise from
	// +X. It is what tells a wedge's front from its open side.
	Facing float64
}

// meleeDealtScale is the multiplier on the melee damage a unit deals, from the
// shape it is in and how fast it is moving.
//
// Only the wedge has one, and only at the run: the charge-speed term in the
// damage formula already pays a man for arriving fast, and the wedge's bonus is
// on top of that, for the man who is at the point of it. A wedge that walked
// into a brawl got no bonus, because a wedge's whole argument is about who
// arrives first.
func (b *Battle) meleeDealtScale(i int, speed float64) float64 {
	if b.formations[i].Kind != FormationWedge {
		return 1
	}
	if speed < b.cfg.Formation.ChargeSpeed {
		return 1
	}
	return 1 + b.cfg.Formation.WedgeChargeDamageBonus
}

// meleeTakenScale is the multiplier on the damage a unit takes from a blow
// delivered from one place by an attacker moving at a given speed.
//
// Three shapes have one, and each answers a different question about the same
// man. A wedge is caught from the side, so a blow outside its front arc hurts
// more. A square stops a fast mover, so a blow from one that is running or
// driving hurts less. A man in skirmish order is in reach of several men at
// once, so every blow hurts more.
func (b *Battle) meleeTakenScale(i int, x, y, fromX, fromY, attackerSpeed float64) float64 {
	f := b.formations[i]
	if !f.Kind.Valid() {
		return 1
	}
	fc := b.cfg.Formation
	switch f.Kind {
	case FormationWedge:
		if offFrontArc(f.Facing, x, y, fromX, fromY, fc.WedgeFlankArcDeg) {
			return fc.WedgeFlankTakenScale
		}
	case FormationSquare:
		if attackerSpeed >= fc.SquareFastMoverSpeed {
			return fc.SquareFastMoverTakenScale
		}
	case FormationSkirmish:
		return fc.SkirmishMeleeTakenScale
	}
	return 1
}

// suppressionTakenScale is the multiplier on the suppression a unit takes from
// aimed fire, from the shape it is in.
//
// Only skirmish order has one, and it is the same argument as the aimed fire
// itself: suppression is what breaks a formation, and men spread out do not
// present one target, so a burst that would pin a line pins one man in several.
// It is applied to the suppression and not to the injury because spreading out
// does not stop a bullet that has already found a man, it stops the burst from
// finding ten.
func (b *Battle) suppressionTakenScale(i int) float64 {
	if b.formations[i].Kind != FormationSkirmish {
		return 1
	}
	return b.cfg.Formation.SkirmishSuppressionTakenScale
}

// offFrontArc reports whether a blow arriving at (x, y) from (fromX, fromY)
// comes from outside the arc a formation facing `facing` presents.
//
// The arc is the balance file's wedge_flank_arc_deg, either side of the facing.
// A blow from inside it is a frontal one and the wedge's flank penalty does not
// apply.
//
// A blow delivered from the target's own position has no bearing at all. It is
// treated as frontal, and that is a stated rule rather than an accident of the
// arithmetic: a man who has run inside a wedge is not flanking it, he is inside
// it, and the penalty for a wedge that has been entered is not the penalty for
// one that has been gone around.
func offFrontArc(facing, x, y, fromX, fromY, arcDeg float64) bool {
	dx, dy := fromX-x, fromY-y
	if dx == 0 && dy == 0 {
		return false
	}
	half := arcDeg * math.Pi / 180 / 2
	return math.Abs(wrapAngle(math.Atan2(dy, dx)-facing)) > half
}

// FormationCommander turns a side's group orders into per-unit orders, once per
// tick, through the command seam in command.go.
//
// It is a Commander, so a battle run with one has a formation layer in the tick
// loop without the loop knowing anything about shapes: RunCommanded takes it,
// publishes the field, and applies what comes back. A battle run with plain Run
// has no formation layer at all and every unit is in no shape, which is why the
// per-shape combat effects are exact multiplications by one on that path and a
// battle with no formations is bit for bit the battle there was before this file
// existed.
//
// It is deterministic by construction. It reads the View, which is committed
// state, and writes the View, and the only thing it carries between ticks is
// each group's last facing, which exists so that a formation whose enemy has
// just been wiped out does not spin round to face +X.
type FormationCommander struct {
	// cfg is the balance config. It is held rather than copied because a
	// commander is built once per battle and the config is a pointer to one
	// loaded file.
	cfg *config.Config
	// side is the army this commander orders.
	//
	// Whether a group's list really is this side's men cannot be answered here:
	// the commander is built before the battle it will order exists, so there is
	// no roster to check a unit id against and no way to know which side any id
	// fights for. It is answered on the first tick, in orderGroup, where the field
	// is finally in front of the commander, and a unit that fights for the other
	// army is refused there rather than skipped. See orderGroup.
	side Side
	// groups are the standing orders, in the order the caller gave them.
	groups []*formationGroup
	// sequence is the order the groups are commanded in: every group before the
	// groups that follow it, and among groups that follow nobody, the order the
	// caller declared them. It exists because a follower reads the anchor of the
	// group it follows, so a follower commanded first would be ordered against
	// last tick's anchor. The declaration order is kept wherever the choice does
	// not matter, so a battle with no followers produces exactly the orders it
	// produced before following existed.
	sequence []int
	// ids is a scratch buffer, reused every tick so a commanded tick allocates
	// nothing. One buffer serves every group because each group writes its
	// orders into the View before the next group is read.
	ids []int
}

// formationGroup is one group's standing order and the state the tick keeps for it.
type formationGroup struct {
	order GroupOrder
	// index is where this group sits in the caller's list, which is what a Follow
	// names and what an error message about this group has to say.
	index int
	// units are the group's unit ids, ascending, with duplicates already
	// refused at construction.
	units []int
	// lead is the group this one follows, resolved once at construction from the
	// order's Follow index. Nil for a group that follows nobody.
	lead *formationGroup
	// anchorX and anchorY are where this group's shape was centred this tick, and
	// anchored says whether they mean anything yet. They are read by a group that
	// follows this one, which is why they are kept rather than passed along: a
	// follower is ordered after the group it follows, and the only thing it needs
	// from it is where it ended up.
	//
	// anchored is false for a group with nobody standing: orderGroup returns
	// before it has an anchor, and a follower must be able to tell that from a
	// group whose anchor happens to be the origin.
	anchorX, anchorY float64
	anchored         bool
	// facing is the bearing the group last looked, kept so a group with no
	// enemy in front of it holds its bearing instead of snapping to +X.
	facing float64
	// slots is the layout for the number of men the group had last tick, and
	// slotsCount how many men that was. A layout is a pure function of (shape,
	// count, parameters) and it is the same every tick, so it is computed once
	// and kept until the count changes; see slotsFor why that is worth doing.
	slots      []Slot
	slotsCount int
}

// slotsFor returns the layout for n men in this group's shape, computing it only
// when n differs from the last count it was asked for.
//
// FormationLayout allocates a slice of n slots and walks the shape's arithmetic
// to fill it. That work depends on nothing but the shape, the count, and the
// balance parameters, so doing it again on the next tick produces the same slice
// in a new place, every tick, for every group, for the whole battle. At the unit
// counts COMBAT.md section 13 quotes that is a four-thousand-slot allocation per
// group per tick, four times a second, thrown away immediately: garbage the
// collector is asked to reclaim during the only part of the frame where the
// player is waiting.
//
// The cache is keyed on the count alone, which is the whole key: the shape is
// fixed for the life of the group and the parameters come from a config the
// commander holds for the whole battle. A man who breaks or dies changes the
// count, the count no longer matches, and the layout is rebuilt for the men who
// are left, which is correct rather than an approximation: a wedge of nineteen
// is a different shape from a wedge of twenty and is drawn as one.
//
// The returned slice belongs to the group and is only read by the caller, which
// places it and never writes to it. Nothing outside this file may hold on to it
// across a tick.
func (g *formationGroup) slotsFor(n int, p FormationParams) ([]Slot, error) {
	if n == g.slotsCount && len(g.slots) == n {
		return g.slots, nil
	}
	slots, err := FormationLayout(g.order.Kind, n, p)
	if err != nil {
		return nil, err
	}
	g.slots, g.slotsCount = slots, n
	return slots, nil
}

// NewFormationCommander builds a commander for one side's groups.
//
// It refuses everything it can check without seeing the field: a nil config, a
// side that is neither A nor B, a group with no units, a shape or order this
// file does not implement, a unit id that is negative, a unit in two groups, and
// a non-finite bearing. Each of those is a caller mistake that would otherwise
// show up as a formation that quietly did nothing.
func NewFormationCommander(cfg *config.Config, side Side, groups []Group) (*FormationCommander, error) {
	if cfg == nil {
		return nil, newFormationError("NewFormationCommander", "cfg",
			"a formation commander needs the balance config; every spacing and every pace it uses is in it")
	}
	if side != SideA && side != SideB {
		return nil, newFormationError("NewFormationCommander", "side",
			"side %d is neither A nor B", int(side))
	}
	if len(groups) == 0 {
		return nil, newFormationError("NewFormationCommander", "groups",
			"there are no groups, so there is nothing to order into a formation")
	}
	if err := FormationParamsFrom(cfg.Formation).validate(); err != nil {
		return nil, err
	}
	c := &FormationCommander{cfg: cfg, side: side, groups: make([]*formationGroup, 0, len(groups))}
	claimed := make(map[int]bool, len(groups))
	for i, g := range groups {
		if !g.Order.Kind.Valid() {
			return nil, newFormationError("NewFormationCommander", "Group.Order.Kind",
				"group %d is ordered into %v, which is not a shape", i, g.Order.Kind)
		}
		if !g.Order.Order.Valid() {
			return nil, newFormationError("NewFormationCommander", "Group.Order.Order",
				"group %d is ordered %v, which is not an order", i, g.Order.Order)
		}
		if len(g.Units) == 0 {
			return nil, newFormationError("NewFormationCommander", "Group.Units",
				"group %d has no units, so it is not a formation", i)
		}
		if g.Order.Order == OrderFormationMove && g.Order.At == nil {
			return nil, newFormationError("NewFormationCommander", "Group.Order.At",
				"group %d is ordered to move and has no destination; there is nowhere for it to walk to", i)
		}
		if g.Order.Order != OrderFormationMove && g.Order.At != nil {
			return nil, newFormationError("NewFormationCommander", "Group.Order.At",
				"group %d is ordered %s and carries a destination; only a move reads a place to walk "+
					"to, so this one is an order nobody will read", i, g.Order.Order)
		}
		if g.Order.At != nil && (!isFinite(g.Order.At.X) || !isFinite(g.Order.At.Y)) {
			return nil, newFormationError("NewFormationCommander", "Group.Order.At",
				"group %d is ordered to move to (%g, %g), which is not a place on the field", i,
				g.Order.At.X, g.Order.At.Y)
		}
		if g.Order.Facing.Fixed && !isFinite(g.Order.Facing.Bearing) {
			return nil, newFormationError("NewFormationCommander", "Group.Order.Facing.Bearing",
				"group %d has a fixed facing of %g radians, which is not a direction", i, g.Order.Facing.Bearing)
		}
		units := make([]int, 0, len(g.Units))
		for _, id := range g.Units {
			if id < 0 {
				return nil, newFormationError("NewFormationCommander", "Group.Units",
					"group %d lists unit %d, and unit ids start at zero", i, id)
			}
			if claimed[id] {
				return nil, newFormationError("NewFormationCommander", "Group.Units",
					"unit %d is in two groups; a man with two slots has none", id)
			}
			claimed[id] = true
			units = append(units, id)
		}
		// Ascending, so the layout assigns slots by id and the shape does not
		// depend on the order the caller happened to list its units in.
		sort.Ints(units)
		// The destination and the follow index are copied rather than shared. The
		// caller built this commander before the battle and keeps the slice it built
		// it from, and a commander whose instructions change because somebody edited
		// a struct afterwards is a battle that is fought under different orders from
		// the ones it was given without anybody changing them.
		order := g.Order
		if g.Order.At != nil {
			at := *g.Order.At
			order.At = &at
		}
		if g.Order.Follow != nil {
			follow := *g.Order.Follow
			order.Follow = &follow
		}
		c.groups = append(c.groups, &formationGroup{order: order, units: units, index: i})
	}
	if err := c.resolveFollows(); err != nil {
		return nil, err
	}
	return c, nil
}

// resolveFollows checks every Follow and turns each one into the group it names,
// then works out the order the groups are commanded in.
//
// Three things are checked here and nowhere else, because this is the only place
// the whole list of groups exists: that the index is one this commander was built
// with, that a group is not told to follow itself, and that following does not
// make a circle. A circle has no anchor at all, so every group in it would be
// ordered against a group that was never commanded, and the two of them would take
// turns reading each other's anchor from the tick before.
func (c *FormationCommander) resolveFollows() error {
	for _, g := range c.groups {
		if g.order.Follow == nil {
			continue
		}
		lead := *g.order.Follow
		if lead < 0 || lead >= len(c.groups) {
			return newFormationError("NewFormationCommander", "Group.Order.Follow",
				"group %d is ordered to follow group %d, and this commander was built with %d groups, "+
					"numbered 0 to %d", g.index, lead, len(c.groups), len(c.groups)-1)
		}
		if lead == g.index {
			return newFormationError("NewFormationCommander", "Group.Order.Follow",
				"group %d is ordered to follow itself; a group has nothing to follow if it is the "+
					"only group", g.index)
		}
		if g.order.At != nil {
			return newFormationError("NewFormationCommander", "Group.Order.Follow",
				"group %d is ordered to move to (%g, %g) and to follow group %d; those are two "+
					"destinations, and only one of them would be read", g.index, g.order.At.X, g.order.At.Y, lead)
		}
		g.lead = c.groups[lead]
	}
	// The walk is over groups, not over links: every group is visited once, and a
	// group that has been visited and is met again is in a circle. A group that has
	// been visited and is met again on a path that came from nowhere else is simply
	// two groups following the same leader, which is a column and is allowed.
	done := make([]bool, len(c.groups))
	var visit func(g *formationGroup, chain []int) error
	visit = func(g *formationGroup, chain []int) error {
		if done[g.index] {
			return nil
		}
		for _, at := range chain {
			if at == g.index {
				return newFormationError("NewFormationCommander", "Group.Order.Follow",
					"the follow chain of group %d is a circle: %v; a group in a circle has nothing to "+
						"follow, because the group it would follow is waiting on it", chain[0], chain)
			}
		}
		if g.lead != nil {
			if err := visit(g.lead, append(chain, g.index)); err != nil {
				return err
			}
		}
		done[g.index] = true
		c.sequence = append(c.sequence, g.index)
		return nil
	}
	for _, g := range c.groups {
		if err := visit(g, nil); err != nil {
			return err
		}
	}
	return nil
}

// Command implements Commander.
//
// Groups are ordered in the order the caller declared them, or in the order
// resolveFollows worked out where a group follows another, and within a group by
// ascending unit id, so the orders a battle produces depend on the forces and the
// orders and not on how they were stored.
func (c *FormationCommander) Command(v *View) error {
	if v == nil {
		return newFormationError("Command", "View", "there is no field to order from")
	}
	if len(v.Units) != len(v.Commands) {
		return newFormationError("Command", "View",
			"the field publishes %d units and %d order slots; they are parallel slices and a "+
				"commander that indexed one against the other would be reading the wrong unit",
			len(v.Units), len(v.Commands))
	}
	// The view's unit ids are its own indices, which is what lets a group name
	// its members by id and index straight into the order channel. The engine
	// builds the view that way and the replayer refuses a log that says
	// otherwise, but a commander is handed the view by whoever called it, so it
	// is checked here rather than assumed. It is one pass over a slice the pass
	// below reads anyway.
	for i := range v.Units {
		if v.Units[i].ID != i {
			return newFormationError("Command", "View.Units",
				"unit at index %d calls itself %d; a formation orders units by id and the "+
					"order channel is indexed by position, so the two must be the same number", i, v.Units[i].ID)
		}
	}
	// One pass over the field for the enemy, for every group. Both of this
	// side's formations face the same enemy, and a per-group pass would be the
	// same answer computed twice per tick.
	ex, ey, haveEnemy := enemyCentreOf(v, c.side)
	for _, at := range c.sequence {
		if err := c.orderGroup(v, c.groups[at], ex, ey, haveEnemy); err != nil {
			return err
		}
	}
	return nil
}

// orderGroup gives every living member of one group its slot and its movement
// for this tick.
func (c *FormationCommander) orderGroup(v *View, g *formationGroup, ex, ey float64, haveEnemy bool) error {
	fc := c.cfg.Formation
	p := FormationParamsFrom(fc)

	// The group's living members, in ascending id. A unit left out because of its
	// CONDITION is not ordered: a broken unit is already withdrawing and a routed
	// one is off the attack, and a formation order that dragged either back into
	// a slot would be fighting the morale stage for a man who is losing.
	//
	// The other two reasons a listed unit cannot be ordered are mistakes rather
	// than conditions, and they are refused rather than skipped. A commander is
	// built before the battle exists, so its membership list cannot be checked
	// against the field until the first tick it is ordered from, and that is where
	// it is checked. Skipped instead, an id the field does not have, or one
	// belonging to the other army, leaves the group quietly half ordered or not
	// ordered at all, and the caller is told the order was carried out for the rest
	// of the battle. Half a roster handed to the wrong side's commander is an
	// entirely plausible way to write that, and it reads as a formation that will
	// not form rather than as the mistake it is.
	c.ids = c.ids[:0]
	for _, id := range g.units {
		if id < 0 || id >= len(v.Units) {
			return newFormationError("orderGroup", "Group.Units",
				"unit %d is not on this field, which has %d units; a formation of men who are not "+
					"in this battle is not a formation", id, len(v.Units))
		}
		if v.Units[id].Side != c.side {
			return newFormationError("orderGroup", "Group.Units",
				"unit %d fights for side %s and this commander orders side %s; a side cannot order "+
					"the other army's men into its formations", id, v.Units[id].Side, c.side)
		}
		if v.Units[id].Status != StatusFighting {
			continue
		}
		c.ids = append(c.ids, id)
	}
	if len(c.ids) == 0 {
		// Every man in this group is broken, routed, or dead. The group is left
		// silent, and silence means each of them follows the engine's own rules.
		//
		// anchored goes false rather than being left alone, because it is how a group
		// that follows this one learns that there is nobody here to follow.
		g.anchored = false
		return nil
	}

	// The anchor is the group's centre of mass, bodies-weighted, so a squad of
	// ten pulls the shape harder than a single man does. It is recomputed every
	// tick rather than stored: the anchor is a reading of where the men are now,
	// not a place they were told to be, and a formation that carried a stale
	// anchor would be marching toward where it used to be.
	ax, ay, ok := centreOfMass(v, c.ids)
	if !ok {
		return newFormationError("orderGroup", "units",
			"group %s has %d members standing on the field and not one of them has any bodies left to stand there with", g.order.Kind, len(c.ids))
	}
	g.facing = g.order.Facing.resolve(ax, ay, ex, ey, haveEnemy, g.facing)

	// The anchor is where the shape is centred, and where each man's slot is
	// placed. For a hold it is simply where the men are: a formation is not a
	// place its commander picked, it is the shape of the men he has, and a hold
	// tidies that shape where it stands. Every other order is about WHERE the
	// body of troops ends up rather than only about how it is arranged, and the
	// anchor is what carries it there: an advance and a charge push it toward
	// the enemy, a fall-back pulls it away, and a shape whose anchor does not
	// move is a shape that was drawn correctly and obeyed not at all.
	anchorX, anchorY := ax, ay
	// walking is set when the order is about WHERE the formation ends up rather
	// than only about how it is arranged. A hold tidies a shape where it stands,
	// so a man already in his slot correctly gets no order. The other three are
	// different: the shape has to leave, and the only thing that moves it is the
	// anchor being carried one tick's worth of pace, so a man in his slot has to
	// be told to walk with it. See the in-slot branch below for why the
	// tolerance cannot stand in the way of that.
	walking := false
	// tolerance is how far a man may be from his slot and still count as standing
	// in it: the shape's own spacing, once. It is read by the move order below and
	// by the slot loop after, so it is worked out here rather than in both places.
	tolerance := cohesionTolerance(g.order.Kind, p)
	// inPlace is the distance inside which a man is left where he is rather than
	// walked to his slot. It is the shape's spacing, once, for every order except
	// a hold, and a fraction of it for a hold; the reason is in the slot loop
	// below, where a whole spacing turns out to be too loose to stand still at.
	inPlace := tolerance
	if g.order.Order == OrderFormationHold {
		inPlace = settleRadius(g.order.Kind, p)
	}
	// The layout, before anything that needs it. A follower measures its own depth
	// to know where its front rank goes, and this is the layout it measures.
	slots, err := g.slotsFor(len(c.ids), p)
	if err != nil {
		return err
	}
	// stepPace is how fast a man walks toward his slot, and it is the whole
	// difference between the orders: an advance walks the shape forward, a
	// charge walks it faster, a hold walks nobody anywhere but a man who has
	// been shoved, and a fall-back walks the shape away from the enemy.
	stepPace := fc.HoldSpeed
	// A group that follows another is not standing where it is, whatever else it
	// was told, and that is settled before its own order is read: the order says
	// what the shape does about the enemy, and following says where the shape is.
	// A follower of a hold that holds its place is still walking, because the group
	// it follows is walking away from it.
	following := false
	if g.lead != nil {
		if g.lead.anchored {
			following = true
			anchorX, anchorY = followAnchor(g, p, slots)
			stepPace = fc.AdvanceSpeed
			// The same arrival rule as a move: a follower inside its own spacing of
			// the place behind the group it follows has arrived, and from there it
			// cements itself at the hold's pace like any other shape that has
			// stopped moving.
			if math.Hypot(ax-anchorX, ay-anchorY) > tolerance {
				walking = true
			} else {
				stepPace = fc.HoldSpeed
			}
		}
		// A group with nobody left to follow has no anchor to keep station behind,
		// so this tick it is ordered as if it had never been told to follow: it
		// keeps its own order's anchor and its own pace. That is the least
		// surprising reading of "follow group 2" on a battle where group 2 was
		// destroyed, and it is better than the alternative of freezing the follower
		// where it stood forever, or of refusing to fight the tick because the group
		// it was following is gone.
	}
	// The group's own order is read only when it is not following. A follower has
	// already been told where it stands, and reading the order as well would give
	// it two destinations: the place behind the group it follows and the enemy.
	if !following {
		switch g.order.Order {
		case OrderFormationAdvance, OrderFormationCharge:
			standoff, closing := fc.AdvanceStandoff, fc.AdvanceSpeed
			if g.order.Order == OrderFormationCharge {
				standoff, closing = fc.ChargeStandoff, fc.ChargeSpeed
			}
			if gap := math.Hypot(ex-ax, ey-ay); haveEnemy && isFinite(gap) && gap > standoff && gap > 0 {
				stepPace = closing
				// The shape walks forward by the distance it covers in one tick at
				// its own closing pace. One tick's worth is the whole bound, and it
				// needs no separate constant: the pace and the tick length are
				// already numbers in the balance file, and a formation cannot outrun
				// its own pace however long the battle runs. The per-unit step is
				// clamped to the distance to the slot as well, so this cannot carry a
				// man past his own place even if the two disagree.
				//
				// WHY THE ANCHOR HAS TO MOVE AT ALL. The anchor is the group's centre
				// of mass, which is where the men are, so slots laid out around it
				// are exactly where the men already are: a formation whose anchor is
				// left alone satisfies the in-slot test on the tick after it forms and
				// is given no orders ever again. It only appeared to advance because
				// the enemy's approach kept shoving men out of their slots and every
				// man who was shoved returned to it at the faster pace, which is an
				// advance that depends on being attacked to happen at all. A charge
				// had the same shape of problem one pace higher.
				if push := closing * v.TickSeconds; push > 0 && isFinite(push) {
					anchorX, anchorY = ax+(ex-ax)/gap*push, ay+(ey-ay)/gap*push
					walking = true
				}
			} else {
				// In contact, or nothing to close on: the shape stops closing and
				// stands where it is. It does not stop tidying itself, so a line
				// that arrived as a crowd reforms in place and shoots from there.
				stepPace = fc.HoldSpeed
			}
		case OrderFormationMove:
			// A move is a walk towards a place, and the pace of a walk is the file's
			// walking pace: advance_speed. It is the same number an advance uses, and
			// deliberately so. A formation marching to a hill and a formation closing
			// on the enemy are the same walk by the same men, and two constants for one
			// pace are two numbers that can disagree about how fast men walk.
			stepPace = fc.AdvanceSpeed
			// The destination is checked here rather than only at construction: this is
			// the order that reads it, and an order that reads a nil destination is a
			// formation with nowhere to go.
			if g.order.At == nil {
				return newFormationError("orderGroup", "Group.Order.At",
					"group %s is ordered to move and was given no place to move to", g.order.Kind)
			}
			d := math.Hypot(ax-g.order.At.X, ay-g.order.At.Y)
			switch {
			case !isFinite(d):
				// A distance that is not a number is not a place to walk to. The shape
				// holds rather than marching off the field on it, which is the same
				// answer the advance gives when there is no enemy to close on.
				stepPace = fc.HoldSpeed
			case d > tolerance:
				// The same one tick's worth of pace the advance and the withdrawal use,
				// bounded by the distance that is left, so a formation that is nearly
				// there spends its last tick arriving rather than arriving repeatedly.
				push := math.Min(d, fc.AdvanceSpeed*v.TickSeconds)
				anchorX, anchorY = ax+(g.order.At.X-ax)/d*push, ay+(g.order.At.Y-ay)/d*push
				walking = true
			default:
				// Arrived. The tolerance is the rule for "this man is in his place", and
				// a shape whose anchor is inside its own spacing of where it was told to
				// go is a shape that is there; past it the tolerance is not consulted,
				// for the reason the withdrawal overrides it, because the distance to a
				// slot that is one push beyond them is inside the tolerance every tick.
				//
				// The pace comes down to the hold's, which is the half of this that is
				// easy to leave out. A shape that has stopped walking and then tidies
				// itself at a marching pace is a formation that never quite stands
				// still, and a player who marched a line to a hill and watched a
				// knocked-about squad jog back into place has been told the wrong thing
				// about what arrived.
				stepPace = fc.HoldSpeed
			}
		case OrderFormationRetreat:
			stepPace = fc.RetreatSpeed
			if d := math.Hypot(ax-ex, ay-ey); haveEnemy && isFinite(d) && d > 0 {
				// Pulled away from the enemy by the distance a fall-back covers in one
				// tick, which is the pace the men are walking, so the shape withdraws
				// at the speed it can actually be walked back at.
				//
				// The pull is bounded by retreat_distance as well as by the pace: a
				// long tick, or a fast withdrawal, must not throw a formation bodily
				// across the field, and the bound is what says how far one tick is
				// allowed to carry a shape.
				pull := math.Min(fc.RetreatDistance, fc.RetreatSpeed*v.TickSeconds)
				anchorX, anchorY = ax+(ax-ex)/d*pull, ay+(ay-ey)/d*pull
				walking = true
			}
		}
	}
	// The square is the only shape that cannot keep up with the pace it is given.
	// The pace is a speed; the unit's own speed scales it, which is what makes a
	// fast unit in a slow formation walk faster.
	stepPace *= c.paceScale(g.order.Kind)

	// Published for whoever follows this group, and set before the slots are laid
	// out because a follower's anchor is read from here on the same tick. A group
	// that is being ordered is a group that exists this tick; anchored is how that
	// is said without a second field for it.
	g.anchorX, g.anchorY, g.anchored = anchorX, anchorY, true

	dt := v.TickSeconds
	for i, id := range c.ids {
		u := &v.Units[id]
		cmd := UnitCommand{
			Set:          true,
			Formation:    g.order.Kind,
			Facing:       g.facing,
			FormationSet: true,
			Intent:       orderIntent(g.order.Order),
		}
		sx, sy := slots[i].place(anchorX, anchorY, g.facing)
		dx, dy := sx-u.X, sy-u.Y
		dist := math.Hypot(dx, dy)
		// A man is left to the engine's own rules when he is in his slot, or as
		// close to it as the shape's own spacing allows, because a man in his
		// place who is in contact still has to fight and spread, and the shape
		// is not a reason to stop doing that. The shape is still published: he is
		// in it either way.
		//
		// The one order that overrides this is a fall-back, and it has to. The
		// shape's position is set by its anchor, the anchor is the group's centre
		// of mass, and the centre of mass is where the men currently are. A
		// withdrawal moves the anchor away from the enemy, but the men only ever
		// close on the distance from their current position to a slot that is one
		// pull further back than they were, and that distance is smaller than the
		// cohesion tolerance. So a formed formation satisfies the in-slot test
		// every tick, is given no orders, and stands still: a withdrawal that
		// withdraws nothing. Measuring it in a whole battle shows the retreat
		// ending up nearer the enemy than the advance it was ordered to run from.
		//
		// So for an order that is about where the shape goes, the tolerance is
		// not consulted and a man in his slot is told to walk with the shape.
		// He is still never told to walk PAST his slot: the cap below is what
		// stops a man reversing every tick, and it is the same cap either way.
		//
		// # AND WHY A HOLD ANSWERS WITH SILENCE NO LONGER
		//
		// The silence above was read as "he is in his place, so he is left to the
		// engine's rules". For a man in contact that is right: the engine's rules
		// for a man in contact are to fight and spread, which is what he should
		// be doing. For a man who is not in contact they are to CLOSE ON THE
		// ENEMY, and that is the exact opposite of a hold.
		//
		// Measured on the thirty-a-side test session, a line ordered to hold
		// position and given nothing else:
		//
		//	tick  10: g0 (-448.4, -2.9)  g1 (-441.7, -1.2)
		//	tick 210: g0 (-413.3, -5.0)  d(+35.1, -2.1)
		//	tick 210: g1 (-404.4, -0.5)  d(+37.2, +0.7)
		//
		// Thirty-five metres towards the enemy in two hundred ticks, steady, and
		// never stopping: a hold that walks. The rate is the engine's approach
		// pace fighting the cohesion step and losing slowly, which is the worst
		// of both readings — the shape is not standing, and the man is not
		// fighting either, because the shape never reached the enemy to fight at.
		// Over a battle the drift is most of a hundred metres, and a player who
		// told a line to hold and watched it walk to the enemy has been told
		// nothing at all.
		//
		// So a hold speaks. UnitCommand's own contract says it has to: "a
		// zero-length order on a commander that means 'stand still' must
		// therefore set Set, and a commander that says nothing leaves it clear."
		// A hold is a commander that means stand still, and the zero step is
		// written over the intent stage's advance, which is the whole of what a
		// stand-still order is for.
		if (!isFinite(dist) || dist <= inPlace) && !walking {
			cmd.Set = g.order.Order == OrderFormationHold
		} else {
			// The cohesion step: toward the slot, at the formation's pace, and
			// never past it. Capping at the distance is what stops a man from
			// arriving and reversing every tick, which is a formation that
			// shivers in place instead of holding.
			step := u.Speed * stepPace / c.cfg.Battle.RosterSpeedBase * dt
			if step > dist || !isFinite(step) {
				step = dist
			}
			cmd.DX, cmd.DY = dx/dist*step, dy/dist*step
			if !isFinite(cmd.DX) || !isFinite(cmd.DY) {
				return newFormationError("orderGroup", "slot",
					"unit %d is at (%g, %g) and its slot is at (%g, %g), which is not a movement", id, u.X, u.Y, sx, sy)
			}
		}
		v.Commands[id] = cmd
	}
	return nil
}

// followAnchor is where a group that follows another one stands: immediately
// behind the group it follows, in that group's own frame.
//
// # WHY THE DISTANCE IS DERIVED AND NOT CONFIGURED
//
// It is the depth of the two shapes plus one rank of room, and every part of that
// is already a number the balance file holds: the shapes' own spacings decide how
// deep they are, and the gap is rank_spacing, which is the file's own statement of
// the room a rank of men needs to form up and move. A follow distance of its own
// would be a third number saying the same thing, and it would be free to disagree
// with the two shapes it is supposed to fit behind.
//
// The arithmetic is in the leader's frame, where forward is the way the leader
// looks. The leader's rear rank is at its own minForward, so the follower's front
// rank goes one rank of room behind that, and the follower's anchor is however far
// back of its own front rank its shape reaches.
//
// Two shapes that are mirror images about their own axis, which is all five of
// them are apart from the seeded scatter of a skirmish, land exactly touching. A
// skirmish can overlap its leader slightly, by the amplitude of its own scatter,
// which is a shape that is loose about where its men stand and not a shape that is
// standing in the wrong place.
func followAnchor(g *formationGroup, p FormationParams, follower []Slot) (float64, float64) {
	lead := g.lead
	leadMin, _, _, _, err := FormationExtent(lead.slots)
	if err != nil {
		// A leader with no slots is a leader with no shape to stand behind. The
		// caller has already established that it was commanded this tick and
		// published an anchor, so this cannot be reached from a battle; standing on
		// the leader's anchor is the honest answer if it ever is.
		leadMin = 0
	}
	_, _, _, followerMax, err := FormationExtent(follower)
	if err != nil {
		followerMax = 0
	}
	back := leadMin - p.RankSpacing - followerMax
	// A signed distance along the leader's facing: negative is behind it, which
	// is where a follower goes. It is added rather than subtracted because that is
	// what a forward offset means, and getting that backwards would put every
	// follower in front of the group it is following, where it could see the fight
	// and would not be behind anybody.
	return lead.anchorX + math.Cos(lead.facing)*back, lead.anchorY + math.Sin(lead.facing)*back
}

// paceScale turns a formation pace in metres per second into the multiplier of a
// unit's own speed that produces it.
//
// A formation's pace is a nominal pace, the pace of an average man, and the
// balance file says what an average man is: battle.roster_speed_base. A faster
// unit in the same formation walks faster and a slower one walks slower, which
// is what a formation of mixed troops actually does. Dividing by that reference
// is why there is no configured conversion constant: the reference is already a
// number in the file, and a second one could disagree with it.
//
// It is also the only place a shape's pace is defined. There was a second copy
// of this rule on the Battle, shapePace, which nothing in the engine called: the
// pace of a formation is a thing the commander decides when it writes a movement
// order, and the engine has no pace of its own to scale. Two copies of one rule
// is two answers waiting to disagree, and the one nobody called was the one a
// reader would have trusted.
func (c *FormationCommander) paceScale(kind Formation) float64 {
	scale := 1.0
	if kind == FormationSquare {
		scale = c.cfg.Formation.SquareMoveSpeedScale
	}
	return scale
}

// orderIntent is the intent a formation order tells its units they are acting
// under, so the report says what the men were told to do rather than what they
// would have done uncommanded.
func orderIntent(o FormationOrder) Intent {
	switch o {
	case OrderFormationAdvance, OrderFormationCharge, OrderFormationMove:
		// There is no separate intent for marching to a place. The report says what
		// the men were ordered to do, and a formation walking to a point is
		// advancing under orders; a second intent for it would be a second answer
		// to what a man walking is doing.
		return IntentAdvance
	case OrderFormationRetreat:
		return IntentWithdraw
	default:
		return IntentHold
	}
}

// enemyCentreOf is the bodies-weighted centre of the enemy units that can still
// fight, and whether there are any.
//
// It is the same measure the engine's own intent stage uses for its aim point
// (see enemyStronghold in intent.go), written against the View rather than the
// unit array because a commander sees the View. Routed and surrendered units are
// excluded for the reason they are excluded there: a formation that turned to
// face the men already running away would be facing away from the fight.
func enemyCentreOf(v *View, side Side) (float64, float64, bool) {
	enemy := side.Opposing()
	var sumX, sumY, weight float64
	for i := range v.Units {
		u := &v.Units[i]
		if u.Side != enemy || !u.Status.Actable() {
			continue
		}
		w := u.Troops
		sumX += u.X * w
		sumY += u.Y * w
		weight += w
	}
	if weight <= 0 {
		return 0, 0, false
	}
	return sumX / weight, sumY / weight, true
}

// centreOfMass is the bodies-weighted mean position of a set of unit ids, and
// whether the set had any weight in it at all.
func centreOfMass(v *View, ids []int) (float64, float64, bool) {
	var sumX, sumY, weight float64
	for _, id := range ids {
		if id < 0 || id >= len(v.Units) {
			continue
		}
		u := &v.Units[id]
		w := u.Troops
		sumX += u.X * w
		sumY += u.Y * w
		weight += w
	}
	if weight <= 0 {
		return 0, 0, false
	}
	return sumX / weight, sumY / weight, true
}

// FormationExtent is how far a shape reaches, in metres: to the right and to the
// left of its anchor, and ahead of and behind it.
//
// It is the read side for an overlay that draws where a formation is going, and
// the same numbers the tick uses, so what a player is shown is what the men were
// told to do. A caller that draws a shape it has measured itself is drawing a
// different shape.
func FormationExtent(slots []Slot) (minRight, maxRight, minForward, maxForward float64, err error) {
	if len(slots) == 0 {
		return 0, 0, 0, 0, newFormationError("FormationExtent", "slots",
			"a formation of nobody has no extent")
	}
	minRight, maxRight = slots[0].Right, slots[0].Right
	minForward, maxForward = slots[0].Forward, slots[0].Forward
	for _, s := range slots[1:] {
		minRight = math.Min(minRight, s.Right)
		maxRight = math.Max(maxRight, s.Right)
		minForward = math.Min(minForward, s.Forward)
		maxForward = math.Max(maxForward, s.Forward)
	}
	return minRight, maxRight, minForward, maxForward, nil
}

// MinSlotDistance is the smallest distance between any two slots in a shape.
//
// It is the check that a shape is actually a shape: men standing on a lattice are
// a spacing apart, and if that ever stops being true the cohesion pass would
// fight the shape forever instead of the men arriving in it.
func MinSlotDistance(slots []Slot) (float64, error) {
	if len(slots) < 2 {
		return 0, newFormationError("MinSlotDistance", "slots",
			"need at least two slots to measure a gap between")
	}
	best := math.Inf(1)
	for i := range slots {
		for j := i + 1; j < len(slots); j++ {
			d := math.Hypot(slots[i].Right-slots[j].Right, slots[i].Forward-slots[j].Forward)
			if d < best {
				best = d
			}
		}
	}
	return best, nil
}
