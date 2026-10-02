package command

import (
	"math"
	"strings"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/formation"
)

// SIDE COMMANDER: the state one army's commander keeps.
//
// It holds three things and nothing else: the order of battle (which units are in
// which formation), the order each formation is currently under, and the scratch
// buffers the per-tick work reuses. It keeps no copy of the field: everything it
// decides is measured from the view the battle engine hands it on the tick, which
// is what makes a commander's decision a reading of the battle rather than a
// memory of one.

// post is one formation: which units are in it, what it is called in the order of
// battle, and what it is currently doing.
type post struct {
	// index is the formation's place in its side's order of battle, and id is
	// the identifier it is written under in the cause log.
	index, id int
	// kind is the job: front, flank, or reserve.
	kind Post
	// shape is the formation shape this job holds.
	shape formation.Formation

	// units are the indices into the battle view of the units in this formation.
	// They are fixed at the first tick and never change: a formation that shed a
	// third of its men still has a shape and a place in the line, and a division
	// redrawn from whoever happened to be left standing would be a division whose
	// front was last tick's flank.
	units []int

	// onField and viewIdx are the formation's units as they stand this tick: the
	// ones that can still be ordered, can still walk, and are still on the field,
	// in ascending unit id. Both are reused per tick.
	onField []formation.Unit
	viewIdx []int

	// order is the standing order, issued is true once it has been given, and
	// issuedTick is when. A formation with no order yet has never been told what
	// to do, which is different from being told to hold, and is recorded as such.
	order      formation.Order
	issued     bool
	issuedTick int
	// sent records that this formation has been committed: the flank is walking
	// round the side, or the reserve has been sent into the line. A committed
	// formation stays committed; a commander who sent a wing round the enemy's
	// flank does not recall it because the moment passed.
	sent bool

	// plan is the formation's last resolved plan, kept because a flanking swing
	// is measured from the bearing the formation held when the order was given
	// and not from wherever it has walked to since. Losing it would restart the
	// arc every tick and the formation would circle its enemy instead of turning
	// in.
	plan    formation.Plan
	hasPlan bool
}

// sideCommander commands one army.
type sideCommander struct {
	side battle.Side
	cfg  Config
	fcfg formation.Config
	cmd  *Commander
	// idBase is the cause-log id of this side's first formation. Side A's
	// formations count from zero and side B's continue from
	// command.formations_per_side, so two formations from different armies never
	// share a cause row.
	idBase int

	// posts is the order of battle, in index order.
	posts []post
	// divided records that the order of battle has been laid out. It is done
	// once, on the first tick, while the whole force is still on the field.
	divided bool

	// enemyUnits and enemyBodies are the opposing force's on-field units and the
	// bodies each stands for, rebuilt every tick and reused. One summary of the
	// enemy per side, not one per formation: the enemy is one army, and giving
	// every formation its own private idea of where the enemy is would let two
	// formations on the same side swing at two different armies.
	enemyUnits  []formation.Unit
	enemyBodies []float64

	// sits is the per-formation measurement buffer, reused per tick.
	sits []situation
	// shapeErr is a post whose job could not be resolved to a shape. It is carried
	// rather than defaulted: a formation with no shape would be drawn in whatever
	// the zero value happens to be, which is the silent stub this codebase
	// forbids.
	shapeErr error
}

// newSideCommander builds the commander for one side. It lays out no formations:
// that waits for the first tick, when it can see the force it is dividing.
func newSideCommander(side battle.Side, cfg Config, fcfg formation.Config, cmd *Commander, idBase int) *sideCommander {
	s := &sideCommander{side: side, cfg: cfg, fcfg: fcfg, cmd: cmd, idBase: idBase}
	s.posts = make([]post, cfg.FormationsPerSide)
	s.sits = make([]situation, cfg.FormationsPerSide)
	for i := range s.posts {
		p := &s.posts[i]
		p.index = i
		p.id = idBase + i
		p.kind = postKind(i, cfg.FormationsPerSide)
		shape, err := cfg.shapeFor(p.kind)
		if err != nil {
			// Config.Validate has already resolved all three shapes, so this
			// cannot fire. A post with no shape would be a formation drawn in
			// whatever the zero value happens to be, which is the silent stub this
			// codebase forbids, so the failure is carried and reported rather than
			// drawn.
			s.shapeErr = err
			return s
		}
		p.shape = shape
	}
	return s
}

// postKind is the job of the formation at index i of a side's n formations: the
// first fights, the last is held back, and everything between is a flank.
//
// The rule is positional rather than weighted because it has to be positional:
// every formation needs a job the moment the battle starts, and a rule that
// decided jobs by strength would promote and demote formations mid-battle, which
// is a decision nobody took.
func postKind(i, n int) Post {
	switch {
	case i == 0:
		return PostFront
	case i >= n-1:
		return PostReserve
	default:
		return PostFlank
	}
}

// divide lays out the order of battle, once, on the first tick.
//
// The division is by unit id in ascending order, so it is a property of the
// force rather than of the order the units happen to arrive in. The reserve is
// the last formation and takes command.reserve_share of the force; the rest is
// divided as evenly as possible among the front and the flanks, with the odd unit
// going to the earlier formations so the line is never the short one.
//
// A side with fewer units than formations has as many formations as it has units.
// That is a force of one man a formation rather than a division of twelve, and it
// is said here instead of being discovered when a formation of no units is asked
// to decide what to do with itself.
func (s *sideCommander) divide(v *battle.View) error {
	mine := make([]int, 0, len(v.Units))
	for i := range v.Units {
		if v.Units[i].Side == s.side && commandable(v.Units[i]) {
			mine = append(mine, i)
		}
	}
	m := len(mine)
	if m == 0 {
		return errorf("divide", "force", "side %s has no unit that can be commanded", s.side)
	}
	if n := clampInt(s.cfg.FormationsPerSide, 1, m); n != len(s.posts) {
		s.resize(n)
		s.sits = s.sits[:n]
	}
	n := len(s.posts)
	// The reserve takes its share, but never the whole force and never a share so
	// small it rounds to nothing: a commander with no reserve and a commander with
	// a reserve of one unit are different armies, and command.reserve_share is the
	// number that says which.
	reserve := clampInt(roundHalfUp(s.cfg.ReserveShare*float64(m)), 1, m-(n-1))
	others := m - reserve
	base := others / (n - 1)
	extra := others % (n - 1)
	at := 0
	for i := range s.posts {
		p := &s.posts[i]
		size := reserve
		if p.kind != PostReserve {
			size = base
			if i < extra {
				size++
			}
		}
		p.units = mine[at : at+size : at+size]
		at += size
	}
	if at != m {
		return errorf("divide", "order of battle",
			"the %d formations of side %s were given %d of its %d units, so the division does not cover the force",
			n, s.side, at, m)
	}
	s.divided = true
	return nil
}

// resize shortens the order of battle to n formations, for a side with fewer
// units than command.formations_per_side. The posts dropped are taken from the
// end, so the front keeps its place and the reserve is the one that goes when
// there is nothing to keep back.
func (s *sideCommander) resize(n int) {
	for len(s.posts) > n {
		s.posts = s.posts[:len(s.posts)-1]
	}
}

// commandable reports whether a unit can be given an order at all.
//
// A broken unit can: it is shaken, not gone, and a shaken formation is exactly
// what a commander decides to bring back or to leave forward. A routed, captured,
// or destroyed unit cannot: it is out of the fight and is not part of any
// formation, and an order given to it would be an order nobody could carry out.
func commandable(u battle.UnitView) bool {
	return u.Status == battle.StatusFighting || u.Status == battle.StatusBroken
}

// mobile reports whether a unit can be walked somewhere.
//
// formation.Unit refuses a man who cannot move, because a zero agility would make
// the geometry arithmetic divide by nothing. A unit with no speed is a unit
// standing where it was put — a gun already laid out, an anchored battery — and
// it is left out of the formation's shape and left to the battle engine, rather
// than being dragged into a formation it cannot keep up with.
func mobile(u battle.UnitView) bool { return u.Speed > 0 }

// tick runs one commander's turn for one tick of the battle.
func (s *sideCommander) tick(v *battle.View) error {
	if s.shapeErr != nil {
		return s.shapeErr
	}
	if !s.divided {
		if err := s.divide(v); err != nil {
			return err
		}
	}
	centre, err := s.collectEnemy(v)
	if err != nil {
		return err
	}
	if len(s.enemyUnits) == 0 {
		// The other army has nothing left on the field. There is no enemy to aim
		// at, no strength to compare against, and no formation left worth
		// ordering: the battle engine is about to end this, and the last thing a
		// commander does in the tick before the end is stop giving orders.
		return nil
	}
	enemy, err := formation.SummariseEnemy(s.enemyUnits)
	if err != nil {
		return err
	}
	// Measure everything before deciding anything. A rule that read a number a
	// later rule had already changed would make the order of the rules part of the
	// outcome, and this file's whole claim is that the rules are a fixed sequence
	// of questions.
	s.measure(v, enemy, centre)
	for i := range s.posts {
		if err := s.decide(v, &s.posts[i], s.sits[i]); err != nil {
			return err
		}
	}
	for i := range s.posts {
		if err := s.advance(v, &s.posts[i], enemy); err != nil {
			return err
		}
	}
	return nil
}

// collectEnemy rebuilds this side's view of the opposing force and returns where
// that force is centred.
//
// A routed enemy is left out. A man who has turned his back is no longer
// something a formation is aimed at, and a commander who kept aiming at the
// running would swing his flank towards a battlefield that has already emptied.
//
// Every enemy unit is given the bearing from our own centre to theirs, so the
// enemy's summarised facing has a majority direction to measure their depth and
// width by. A facing is a direction a man looks, and these men are looking at us.
func (s *sideCommander) collectEnemy(v *battle.View) (formation.Vec, error) {
	s.enemyUnits = s.enemyUnits[:0]
	s.enemyBodies = s.enemyBodies[:0]
	own := centroidOf(v, s.side)
	for i := range v.Units {
		u := v.Units[i]
		if u.Side == s.side || !commandable(u) {
			continue
		}
		s.enemyUnits = append(s.enemyUnits, formation.Unit{
			ID:      u.ID,
			Pos:     formation.Vec{X: u.X, Y: u.Y},
			Agility: 1,
		})
		s.enemyBodies = append(s.enemyBodies, u.Troops)
	}
	if len(s.enemyUnits) == 0 {
		return formation.Vec{}, nil
	}
	centre := centroid(s.enemyUnits)
	facing := formation.Bearing(own, centre)
	for i := range s.enemyUnits {
		s.enemyUnits[i].Facing = facing
	}
	return centre, nil
}

// agility is a unit's mobility relative to the nominal man of a formation, which
// is how internal/formation scales a pace: one is a fit soldier at the pace the
// balance file calls an advance, and a faster man walks further in the same time.
//
// It is the unit's own speed divided by the formation's advance pace, so a
// formation of fast men advances at the speed those men actually have and the
// formation package's speeds keep meaning what the balance file says they mean.
func (s *sideCommander) agility(u battle.UnitView) float64 {
	if s.fcfg.AdvanceSpeed <= 0 {
		return 1
	}
	return u.Speed / s.fcfg.AdvanceSpeed
}

// measure fills in one situation per formation, in post order.
//
// It is the only place the field is read for the rules, so it is the place to
// look to answer "what did the commander know when it decided this".
func (s *sideCommander) measure(v *battle.View, enemy formation.Enemy, centre formation.Vec) {
	own := sideIndex(s.side)
	opp := sideIndex(s.side.Opposing())
	for i := range s.posts {
		p := &s.posts[i]
		// A formation with nobody standing in it has no readings: its strength is
		// zero, its morale is zero, and it is nowhere. It is measured as such and
		// given no orders, rather than being measured against an anchor that does
		// not exist.
		sit := situation{
			sideStrength:  ratio(v.Strength[own], v.Opening[own]),
			enemyStrength: ratio(v.Strength[opp], v.Opening[opp]),
		}
		s.gather(v, p, centre)
		if len(p.onField) > 0 {
			anchor := centroid(p.onField)
			sit.gap = formation.Distance(anchor, enemy.Centre)
			// The front's own gap stands in for the front gap it does not need.
			// Reading an infinity here would put "+Inf" in every cause row the
			// line wrote, which is noise in a field a reader is meant to trust.
			sit.frontGap = sit.gap
			sit.strength, sit.meanMorale, sit.brokenShare = s.postStrength(v, p)
			sit.local, sit.localEnemy = s.localStrength(anchor, v, p)
			sit.wingLeft, sit.wingRight = s.wings(anchor, centre)
		}
		s.sits[i] = sit
	}
	// The flank trigger asks about the front, so the front's gap is read once and
	// handed to the other formations. Reading it inside each formation's own pass
	// would be the same number computed several times and, worse, would make one
	// formation's measurements a function of another formation's state.
	if len(s.posts) > 0 && len(s.posts[0].onField) > 0 {
		gap := formation.Distance(centroid(s.posts[0].onField), enemy.Centre)
		for i := range s.sits {
			if s.posts[i].kind != PostFront && len(s.posts[i].onField) > 0 {
				s.sits[i].frontGap = gap
			}
		}
	}
}

// gather fills a formation's on-field units and the matching view indices.
//
// Every man is given the same facing, the bearing from where he stands to the
// enemy's centre of mass. A formation's own facings are read by internal/
// formation to decide how sharply a man turns, and the battle engine keeps no
// facing of its own — it tracks velocity, which is a fact about the last tick
// rather than about where a man is looking. So the facing that goes in is the one
// the battle can honestly supply, and giving every man in the formation the same
// one is also what keeps the enemy's summarised facing from cancelling out
// exactly and failing a tick.
func (s *sideCommander) gather(v *battle.View, p *post, centre formation.Vec) {
	p.onField = p.onField[:0]
	p.viewIdx = p.viewIdx[:0]
	for _, i := range p.units {
		u := v.Units[i]
		if !commandable(u) || !mobile(u) {
			continue
		}
		p.viewIdx = append(p.viewIdx, i)
		p.onField = append(p.onField, formation.Unit{
			ID:      u.ID,
			Pos:     formation.Vec{X: u.X, Y: u.Y},
			Agility: s.agility(u),
			Facing:  formation.Bearing(formation.Vec{X: u.X, Y: u.Y}, centre),
		})
	}
}

// postStrength is a formation's own strength, mean morale, and share of bodies
// broken. Strength is bodies weighted by condition and, for a broken unit, by
// the engine's own discount for a shaken one, so that this layer and the battle
// engine cannot disagree about how much fighting a formation has left.
func (s *sideCommander) postStrength(v *battle.View, p *post) (strength, morale, broken float64) {
	var bodies float64
	for k := range p.onField {
		u := v.Units[p.viewIdx[k]]
		weight := 1.0
		if u.Status == battle.StatusBroken {
			weight = s.cfg.BrokenEffectiveness
			broken += u.Troops
		}
		strength += u.Troops * u.HPFrac * weight
		morale += u.Morale
		bodies += u.Troops
	}
	if len(p.onField) == 0 {
		return 0, 0, 0
	}
	return strength, morale / float64(len(p.onField)), broken / bodies
}

// wings splits the enemy's strength across the line between our anchor and their
// centre.
//
// It is measured across that line because it is the only axis that means anything
// to a commander choosing which side to walk: our left is one turn from the
// bearing to their centre, so a negative projection is behind their right and a
// positive one behind their left. The unit of the sum is bodies, so a wing is
// compared against the other wing and not against a formation's strength.
func (s *sideCommander) wings(anchor, centre formation.Vec) (left, right float64) {
	across := centre.Sub(anchor)
	if across.Dot(across) == 0 {
		// Standing exactly on their centre: there is no line to measure across,
		// and a commander who cannot tell which wing is weaker is owed a stated
		// answer rather than a coin toss, so both wings read equal and the
		// tie-break in the rules sends the flank left.
		return 0, 0
	}
	for k := range s.enemyUnits {
		proj := s.enemyUnits[k].Pos.Sub(centre).Dot(across)
		if proj >= 0 {
			left += s.enemyBodies[k]
		} else {
			right += s.enemyBodies[k]
		}
	}
	return left, right
}

// localStrength is this formation's strength against the enemy inside
// charge_range of its anchor, which is the enemy a charge would actually run
// into.
//
// It is deliberately a radius around the formation and not around its whole
// side: "this formation is outnumbered here" is a question about this formation's
// ground, and answering it with the whole army's arithmetic would let a formation
// charge because a friendly regiment four hundred metres behind it is winning.
func (s *sideCommander) localStrength(anchor formation.Vec, v *battle.View, p *post) (mine, theirs float64) {
	r2 := s.cfg.ChargeRange * s.cfg.ChargeRange
	for k := range p.onField {
		mine += v.Units[p.viewIdx[k]].Troops * v.Units[p.viewIdx[k]].HPFrac
	}
	for k := range s.enemyUnits {
		d := s.enemyUnits[k].Pos.Sub(anchor)
		if d.Dot(d) > r2 {
			continue
		}
		theirs += s.enemyBodies[k]
	}
	return mine, theirs
}

// centroidOf is where a side's whole force is centred, bodies weighted, which is
// what an enemy's facing is measured from.
func centroidOf(v *battle.View, side battle.Side) formation.Vec {
	var x, y, w float64
	for i := range v.Units {
		if v.Units[i].Side != side {
			continue
		}
		x += v.Units[i].X * v.Units[i].Troops
		y += v.Units[i].Y * v.Units[i].Troops
		w += v.Units[i].Troops
	}
	if w <= 0 {
		return formation.Vec{}
	}
	return formation.Vec{X: x / w, Y: y / w}
}

// centroid is the mean position of a set of units, or the origin for an empty set.
// internal/formation computes the same number from the same units; a second
// definition of "where is this formation" is a second opinion that would drift.
func centroid(units []formation.Unit) formation.Vec {
	if len(units) == 0 {
		return formation.Vec{}
	}
	var x, y float64
	for _, u := range units {
		x += u.Pos.X
		y += u.Pos.Y
	}
	n := float64(len(units))
	return formation.Vec{X: x / n, Y: y / n}
}

// sideIndex maps a side onto the battle view's two-element strength arrays.
func sideIndex(s battle.Side) int {
	if s == battle.SideB {
		return 1
	}
	return 0
}

// ratio is a share of an opening strength, and zero when there was no opening to
// share. A zero opening would otherwise divide by zero and produce a NaN that
// every later comparison against is false.
func ratio(now, opening float64) float64 {
	if opening <= 0 {
		return 0
	}
	return now / opening
}

// decide applies the rules to one formation and issues an order if it changed.
//
// Three things decide whether an order may change at all: the assessment cadence,
// the minimum time an order stands, and the withdrawal exception. The cadence is
// why a commander is not thinking six hundred times a minute; the minimum time is
// why a formation sitting on a threshold does not oscillate; and the exception is
// why neither of the other two can cost a commander his line.
func (s *sideCommander) decide(v *battle.View, p *post, sit situation) error {
	if len(p.onField) == 0 {
		// A formation with nothing standing in it is given nothing at all. Its
		// last order stands for the report; whatever is left of it is already
		// walking, or is dead.
		return nil
	}
	if !s.cfg.mayAssess(v.Tick) {
		// Between assessments only the withdrawal rule is live, because it is the
		// one question whose answer may change from one tick to the next.
		// Everything else waits for the next staff conference.
		order, reason, broken := sit.broken(s.cfg)
		if !broken || (p.issued && order == p.order) {
			return nil
		}
		return s.issue(v, p, order, reason, sit)
	}
	order, reason := sit.choose(p, s.cfg)
	if p.issued && order == p.order {
		return nil
	}
	// A change the minimum order time forbids is not an error and produces no
	// row: it did not happen. The formation keeps the order it has, which is the
	// whole reason the constant exists.
	if !s.mayChange(v.Tick, p, order) {
		return nil
	}
	return s.issue(v, p, order, reason, sit)
}

// mayChange reports whether an order may be changed at this tick, given how long
// the standing order has held. A withdrawal interrupts anything.
func (s *sideCommander) mayChange(tick int, p *post, next formation.Order) bool {
	if !p.issued {
		return true
	}
	if next == formation.OrderRetreat {
		return true
	}
	return tick-p.issuedTick >= s.cfg.OrderMinTicks
}

// issue records an order: it becomes the formation's standing order, it joins the
// commander's order list, and it produces a cause row.
//
// Those are one event, not three. An order recorded but not logged is an
// incomplete feature per CONSTITUTION.md section 2.2, and a cause row for an
// order that was never given is a report nobody can act on.
func (s *sideCommander) issue(v *battle.View, p *post, order formation.Order, reason string, sit situation) error {
	if !order.Valid() {
		return errorf("issue", "order", "%v is not an order internal/formation implements", order)
	}
	o := OrderIssued{
		Tick:      v.Tick,
		Side:      s.side,
		Formation: p.index,
		ID:        p.id,
		Post:      p.kind,
		Shape:     p.shape,
		Order:     order,
		Previous:  p.order,
		Reason:    reason,
		Read:      s.readString(p, sit, order, reason),
	}
	o.CauseID = s.cmd.appendOrder(o, s.cmd.lastOrderID(p.id))
	s.cmd.orders = append(s.cmd.orders, o)
	p.order = order
	p.issued = true
	p.issuedTick = v.Tick
	// "Sent" is the order's own claim and not a flag a caller sets, so the two can
	// never disagree: a formation the rules have sent is one whose order commits
	// it.
	if sentOrder(order) {
		p.sent = true
	}
	return nil
}

// readString is the cause log's "what did it read" field for one order: the
// situation first, then the verdict, so a row states both the evidence and the
// decision without the reader having to know which rule fires on which field.
func (s *sideCommander) readString(p *post, sit situation, order formation.Order, reason string) string {
	var sb strings.Builder
	sb.WriteString("side=")
	sb.WriteString(s.side.String())
	sb.WriteString(", post=")
	sb.WriteString(p.kind.String())
	sb.WriteString(", shape=")
	sb.WriteString(p.shape.String())
	sb.WriteString(", ")
	sb.WriteString(sit.readFields())
	sb.WriteString(", order=")
	sb.WriteString(order.String())
	sb.WriteString(", rule=")
	sb.WriteString(reason)
	return sb.String()
}

// advance resolves the standing order into movement and writes it into the
// battle's command channel.
//
// The order is carried straight through to internal/formation, which is where the
// geometry of an advance, a charge, a flanking swing, and a withdrawal lives.
// This function's whole job is to hand that package the field as it stands and
// take back the metres each man is to walk this tick.
func (s *sideCommander) advance(v *battle.View, p *post, enemy formation.Enemy) error {
	if !p.issued || len(p.onField) == 0 {
		return nil
	}
	plan, err := formation.BuildPlan(p.onField, enemy, p.order, p.shape, s.fcfg)
	if err != nil {
		// A plan that cannot be built is a real error and it stops the battle: a
		// commander that cannot resolve its own order has no honest way to keep
		// fighting, and carrying on quietly would be a fight that had stopped
		// being commanded without saying so.
		return err
	}
	// The swing of a flanking order is measured from the bearing the formation
	// held when the order was given. Rebuilding the plan from scratch every tick
	// re-measures it from wherever the formation has walked to, and the formation
	// circles its enemy instead of turning in — the failure the formation package
	// documents in Plan.FlankFrom. The reference is carried forward only while the
	// order is unchanged: a new flank order measures its swing from where the
	// formation stands when it is given.
	if p.hasPlan && p.plan.Order == plan.Order {
		plan.FlankFrom = p.plan.FlankFrom
	}
	next, nextPlan, err := formation.Step(p.onField, plan, enemy, s.fcfg, v.TickSeconds)
	if err != nil {
		return err
	}
	p.plan = nextPlan
	p.hasPlan = true
	intent := intentFor(p.order)
	for k := range next {
		v.Commands[p.viewIdx[k]] = battle.UnitCommand{
			Set:    true,
			DX:     next[k].Pos.X - p.onField[k].Pos.X,
			DY:     next[k].Pos.Y - p.onField[k].Pos.Y,
			Intent: intent,
		}
	}
	return nil
}

// unused math import guard: measurement helpers below use it, and the file must
// compile without a blank import even if a future edit drops the last use.
var _ = math.Inf