// Package sim is the engine: the tick loop, the write buffer that makes a tick
// atomic, the system registry, and the why-query.
//
// The central rule from CONSTITUTION.md section 2.1 is that systems never call
// each other. Three mechanisms enforce it here rather than by convention:
//
//  1. A System is a function from a read-only View to a *WriteSet. It has no
//     parameter through which it could reach another system.
//  2. Systems live in their own packages. The decoupling test parses the import
//     graph and fails if any system package imports another.
//  3. A tick stages every change and applies it once, at the end. A system
//     cannot observe another system's output in the same tick, so the order
//     systems run in cannot affect any result. TestSystemOrderIsIrrelevant
//     proves that by running every permutation of the order and comparing.
package sim

import (
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
)

// View is a read-only handle on committed state plus the cause log. Systems
// receive only this and a WriteSet, which is why a system cannot read another
// system's staged output.
type View struct {
	State *model.State
	// Log is the cause log, used by a system to name the prior events behind
	// the state it read. Read access to the log is not a coupling: the log is
	// shared state, which is exactly how the constitution says systems
	// communicate.
	Log *cause.Log
	// Cfg is the balance config, shared read-only by every system.
	Cfg *config.Config
	// Rng is the tick's random stream. Systems derive named substreams from
	// it so an added draw in one system does not shift another's sequence.
	Rng *rng.Rng
	// Tick and Year identify the tick being computed.
	Tick int
	Year float64
	// Day is the day of the year, 0-364, which the food and disease systems
	// use for seasonal effects.
	Day int
	// Intent records what a player profile or scripted policy asked to happen,
	// delivered through the state rather than by calling a system.
	Orders []Order
}

// Order is a queued player or scripted action, applied at a tick boundary per
// SPEC.md section 4. Orders are data, so a scripted "dumb player" and a real
// player use the same path and neither can reach into a system directly.
type Order struct {
	// Kind selects what the order does.
	Kind OrderKind
	// TownID and RulerID scope the order; -1 means unset.
	TownID  int
	RulerID int
	// Amount carries a magnitude, meaning depends on Kind.
	Amount float64
	// Target is a second entity, for a gift or a target town.
	Target int
}

// OrderKind enumerates the queued actions.
type OrderKind int

const (
	// OrderSetTax is a ruler raising or cutting taxes.
	OrderSetTax OrderKind = iota
	// OrderSendAid sends food and medicine to a suffering town.
	OrderSendAid
	// OrderMoveGarrison shifts troops between a town and a field party.
	OrderMoveGarrison
	// OrderGatherArmy forms a war party from a ruler's influence.
	OrderGatherArmy
	// OrderGift transfers gold to another ruler.
	OrderGift
	// OrderHireMercenaries hires a company with gold.
	OrderHireMercenaries
	// OrderExecutePrisoner executes a captured ruler, which is chain 9's
	// trigger and is a policy decision, not a system call.
	OrderExecutePrisoner
	// OrderRansomPrisoner ransoms a captured ruler.
	OrderRansomPrisoner
	// OrderDeclareWar starts a war between two sides.
	OrderDeclareWar
	// OrderSuePeace ends a war.
	OrderSuePeace
	// OrderBuildFortify spends metal on walls, raising siege endurance.
	OrderBuildFortify
	// OrderMarchTo sends the ruler's party to a named town, however far it is.
	// A player may order this; the AI will not, because the AI scores distance.
	OrderMarchTo
	// OrderTradeRun sends a party out as a trade caravan.
	OrderTradeRun
	// OrderBuyMedicine spends money on clinic stock.
	OrderBuyMedicine
	// OrderStartConstruction queues a settlement project in a town.
	// Amount is the building index (see construction package).
	OrderStartConstruction
	// OrderSetStateTax sets the state-level tax rate for every town in the
	// same US state as the order's town. Amount is the rate.
	OrderSetStateTax
)

// WriteSet collects every change a tick's systems want to make. Systems stage
// changes; the engine applies them once the tick's systems have all run.
type WriteSet struct {
	writes []write
	// byField counts writes per field, used by the coverage test to assert
	// every tracked field a system touches goes through here.
	byField map[string]int
	// setIndex maps a field already given an absolute write this tick to its
	// index in writes, so the duplicate-absolute-write check is O(1).
	//
	// This was a linear scan of every write staged so far, which made each
	// tick quadratic in its own write count: with ten thousand writes a tick
	// that is fifty million comparisons, and it dominated the whole simulation
	// before this was added. The check itself is load-bearing, so it was made
	// fast rather than removed.
	setIndex map[writeKey]int
	// errors collects problems such as writing to a field that does not exist
	// on that entity kind. Staging an invalid write is a programming error and
	// fails the tick loudly.
	errors []string
	// creates holds new entities a tick wants to add, and deletes holds ids to
	// remove. Both are structural rather than numeric, so they are applied
	// after all numeric writes.
	creates []func(*model.State)
	deletes []deleteOp
	// relationAdds and sideRelationAdds are relation matrix writes.
	relationAdds     []relationWrite
	sideRelationAdds []relationWrite
	// oathOps create and break standing promises, which is what makes chain 9
	// possible: a pledge exists before it is broken.
	oathOps []oathOp
	// spawns are parties created mid-tick, such as a gathered army.
	spawns []*model.Party
}

type write struct {
	Kind   model.Kind
	Entity int
	Field  string
	Value  float64
	// Read is the plain-language record of the state the system read.
	Read string
	// CausedBy names the prior events behind the change.
	CausedBy []int
	// Note is optional context.
	Note string
	// IsSet marks an absolute write rather than an additive one. The engine
	// rejects two absolute writes to one field in one tick, because which one
	// would win would depend on system order.
	IsSet bool
	// system is the System that staged this write, filled in by the tick loop.
	system string
}

type deleteOp struct {
	Kind model.Kind
	ID   int
}

type relationWrite struct {
	A, B  int
	Value float64
	IsAdd bool
	// system names the system staging the change, filled in by the tick loop.
	system string
	// read is the plain-language record of the state the system read.
	read string
	// causedBy names prior events behind the change.
	causedBy []int
	// note is optional context.
	note string
	// isSide distinguishes a side-to-side relation from a ruler-to-ruler one.
	isSide bool
}

type oathOp struct {
	Oath     model.Oath
	Break    bool
	Existing bool
}

// writeKey identifies a field of an entity for the duplicate-write check.
type writeKey struct {
	Kind   model.Kind
	Entity int
	Field  string
}

// NewWriteSet returns an empty write set.
// sortedOathKeys returns oath IDs in ascending order, for deterministic
// iteration when breaking oaths.
func sortedOathKeys(m map[int]model.Oath) []int {
	out := make([]int, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func NewWriteSet() *WriteSet {
	return &WriteSet{
		byField:  map[string]int{},
		setIndex: map[writeKey]int{},
	}
}

// Err returns any problems found while staging writes.
func (w *WriteSet) Err() error {
	if len(w.errors) == 0 {
		return nil
	}
	return fmt.Errorf("sim: %d invalid write(s):\n  %s",
		len(w.errors), strings.Join(w.errors, "\n  "))
}

// Add stages an additive change of delta to a field.
func (w *WriteSet) Add(kind model.Kind, id int, field string, delta float64, read string, causedBy []int, note string) {
	w.stage(write{Kind: kind, Entity: id, Field: field, Value: delta, Read: read, CausedBy: causedBy, Note: note})
}

// Set stages an absolute value for a field. Two Set calls on the same field in
// one tick are rejected, because resolving them would make the result depend on
// which system ran first.
func (w *WriteSet) Set(kind model.Kind, id int, field string, value float64, read string, causedBy []int, note string) {
	w.stage(write{Kind: kind, Entity: id, Field: field, Value: value, Read: read, CausedBy: causedBy, Note: note, IsSet: true})
}

// MustSet is Set for a system that has already established the value, kept
// separate only for readability at call sites.
func (w *WriteSet) stage(x write) {
	f, ok := model.FieldByName(x.Kind, x.Field)
	if !ok {
		w.errors = append(w.errors, fmt.Sprintf("unknown field %q", x.Field))
		return
	}
	if f.Kind != x.Kind {
		w.errors = append(w.errors, fmt.Sprintf("field %q belongs to %s, not %s", x.Field, f.Kind, x.Kind))
		return
	}
	if x.IsSet {
		k := writeKey{x.Kind, x.Entity, x.Field}
		if prevIdx, dup := w.setIndex[k]; dup {
			prev := w.writes[prevIdx]
			w.errors = append(w.errors, fmt.Sprintf(
				"two absolute writes to %s#%d.%s in one tick (%q and %q): "+
					"the result would depend on system order",
				x.Kind, x.Entity, x.Field, prev.Read, x.Read))
			return
		}
		w.setIndex[k] = len(w.writes)
	}
	w.writes = append(w.writes, x)
	w.byField[x.Field]++
}

// CreateEntity stages creation of a new entity. The function runs after all
// numeric writes are applied, so a system can create an entity and let a later
// system write to it in the same tick.
func (w *WriteSet) CreateEntity(fn func(*model.State)) {
	w.creates = append(w.creates, fn)
}

// DeleteEntity stages removal of an entity.
func (w *WriteSet) DeleteEntity(kind model.Kind, id int) {
	w.deletes = append(w.deletes, deleteOp{kind, id})
}

// SetRelation stages an absolute ruler relation.
func (w *WriteSet) SetRelation(a, b int, value float64, read string, causedBy []int, note string) {
	w.relationAdds = append(w.relationAdds, relationWrite{
		A: a, B: b, Value: value, read: read, causedBy: causedBy, note: note,
	})
}

// AddRelation stages a ruler relation delta. Several systems may add to the
// same pair in one tick; the additions sum, so the result does not depend on
// which system staged first.
func (w *WriteSet) AddRelation(a, b int, delta float64, read string, causedBy []int, note string) {
	w.relationAdds = append(w.relationAdds, relationWrite{
		A: a, B: b, Value: delta, IsAdd: true, read: read, causedBy: causedBy, note: note,
	})
}

// AddSideRelation stages a side relation delta.
func (w *WriteSet) AddSideRelation(a, b int, delta float64, read string, causedBy []int, note string) {
	w.sideRelationAdds = append(w.sideRelationAdds, relationWrite{
		A: a, B: b, Value: delta, IsAdd: true, isSide: true, read: read, causedBy: causedBy, note: note,
	})
}

// SetSideRelation stages an absolute side relation.
func (w *WriteSet) SetSideRelation(a, b int, value float64, read string, causedBy []int, note string) {
	w.sideRelationAdds = append(w.sideRelationAdds, relationWrite{
		A: a, B: b, Value: value, isSide: true, read: read, causedBy: causedBy, note: note,
	})
}

// MakeOath stages a standing promise between two rulers.
func (w *WriteSet) MakeOath(o model.Oath) {
	w.oathOps = append(w.oathOps, oathOp{Oath: o})
}

// BreakOathByPair stages breaking the standing oath between two rulers, which
// the loyalty and relation systems then read. The oath exists in shared state
// before this, so a broken pledge is a real event rather than a flag set at the
// same moment as its consequences.
func (w *WriteSet) BreakOathByPair(promisor, promisee int) {
	w.oathOps = append(w.oathOps, oathOp{
		Break:    true,
		Existing: true,
		Oath:     model.Oath{Promisor: promisor, Promisee: promisee},
	})
}

// SpawnParty stages the creation of a party, such as a gathered army.
func (w *WriteSet) SpawnParty(p *model.Party) {
	w.spawns = append(w.spawns, p)
}

// Count returns the number of staged writes, for tests and reports.
func (w *WriteSet) Count() int { return len(w.writes) }

// FieldCounts returns how many writes were staged per field name.
func (w *WriteSet) FieldCounts() map[string]int { return w.byField }

// System is one rule: given what it reads, stage what it writes.
//
// The signature is the enforcement mechanism. A system cannot call another
// system because it is handed a View and a WriteSet and nothing else; there is
// no registry of systems in scope to call.
type System struct {
	// Name identifies the system in the cause log and in the order table.
	Name string
	// Doc is one line describing what the system does, used by the order report
	// so the documented order is generated from the code rather than written
	// separately and drifting.
	Doc string
	// Runs every tick, staged against the committed state.
	Runs func(v *View, w *WriteSet)
}

// Engine runs ticks over a state.
type Engine struct {
	Cfg     *config.Config
	Log     *cause.Log
	systems []System
	// byName indexes systems for the report and for tests.
	byName map[string]int
	// seed is recorded in run metadata.
	seed uint64
	// rng is the master stream; each tick derives substreams from it.
	rng *rng.Rng
	// logEveryN controls how often the state snapshot log is written.
	logEveryN int
	// orders drains the queued player and scripted orders.
	orders []Order
	// hooks let the runner observe ticks without a system calling it.
	hooks []func(v *View)
}

// NewEngine builds an engine with the given systems in the given order. The
// order is recorded and reported but does not affect results; see the package
// comment.
func NewEngine(cfg *config.Config, log *cause.Log, seed uint64, systems []System) *Engine {
	e := &Engine{
		Cfg:     cfg,
		Log:     log,
		systems: append([]System{}, systems...),
		byName:  map[string]int{},
		seed:    seed,
		rng:     rng.New(seed),
	}
	for i, s := range e.systems {
		if _, dup := e.byName[s.Name]; dup {
			panic("sim: duplicate system name " + s.Name)
		}
		e.byName[s.Name] = i
	}
	return e
}

// applyRelation commits one relation change and logs it. A relation is a
// tracked field, so a change to one produces a cause row like any other: a
// broken oath that changed an opinion must be explainable, which is chain 9's
// requirement.
func (e *Engine) applyRelation(s *model.State, rw relationWrite, isSide bool) {
	cur := s.Relation(rw.A, rw.B)
	if isSide {
		cur = s.SideRelation(rw.A, rw.B)
	}
	v := rw.Value
	if rw.IsAdd {
		v = cur + rw.Value
	}
	if v < -1 {
		v = -1
	}
	if v > 1 {
		v = 1
	}
	if isSide {
		s.SetSideRelation(rw.A, rw.B, v)
	} else {
		s.SetRelation(rw.A, rw.B, v)
	}
	if cur == v {
		return
	}
	// A relation belongs to both parties equally, but the log records it once,
	// against the first of the pair, with the other named in the read record.
	// Recording it twice would make a single change look like two events.
	kind := model.KindRuler
	unit := "opinion of ruler #" + itoa(rw.B)
	if isSide {
		kind = model.KindSide
		unit = "opinion of side #" + itoa(rw.B)
	}
	entity := rw.A
	field := model.MustField(kind, "relation_score")
	if !e.Log.ShouldLog(field, cur, v, e.Cfg.Cause.MinAbsolute, e.Cfg.Cause.MinRelative) {
		e.Log.NoteSuppressed()
		return
	}
	read := rw.read
	if read == "" {
		read = "relation=0.0000"
	}
	e.Log.Append(cause.Row{
		Tick:     s.Tick,
		Year:     s.Year,
		Kind:     kind,
		Entity:   entity,
		Field:    "relation_score",
		Old:      cur,
		New:      v,
		Delta:    v - cur,
		System:   rw.system,
		Read:     read,
		CausedBy: rw.causedBy,
		Note:     strings.TrimSpace(unit + " " + rw.note),
	})
}

func itoa(v int) string { return fmt.Sprintf("%d", v) }

// mergeWrites folds all writes to one field into a single committed change and
// returns them in a fixed (kind, entity, field) order.
//
// Two systems may both add to the same field in one tick, which is the normal
// case: the food and disease systems both add deaths, several systems stage
// unrest pressure. Summing them here, before any commit, means the result does
// not depend on which system staged first. An absolute write is never merged
// with an additive one because the engine has already rejected that case as
// order-dependent, so a mixed set cannot reach here.
func mergeWrites(writes []write) []write {
	type acc struct {
		value float64
		isSet bool
		// read and causedBy are taken from the first contribution, which is the
		// one the stage index recorded, so the committed row cites a concrete
		// decision rather than a merge artefact.
		read     string
		causedBy []int
		note     string
		system   string
	}
	order := make([]writeKey, 0, len(writes))
	sums := make(map[writeKey]*acc, len(writes))
	for _, x := range writes {
		k := writeKey{x.Kind, x.Entity, x.Field}
		a, ok := sums[k]
		if !ok {
			sums[k] = &acc{
				value:    x.Value,
				isSet:    x.IsSet,
				read:     x.Read,
				causedBy: x.CausedBy,
				note:     x.Note,
				system:   x.system,
			}
			order = append(order, k)
			continue
		}
		a.value += x.Value
	}
	sort.Slice(order, func(i, j int) bool {
		a, b := order[i], order[j]
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		if a.Entity != b.Entity {
			return a.Entity < b.Entity
		}
		return a.Field < b.Field
	})
	out := make([]write, 0, len(order))
	for _, k := range order {
		a := sums[k]
		out = append(out, write{
			Kind: k.Kind, Entity: k.Entity, Field: k.Field,
			Value: a.value, IsSet: a.isSet, Read: a.read,
			CausedBy: a.causedBy, Note: a.note, system: a.system,
		})
	}
	return out
}

// Order returns the documented system order.
func (e *Engine) Order() []System { return e.systems }

// SystemNames returns the order as names, for the order report.
func (e *Engine) SystemNames() []string {
	out := make([]string, len(e.systems))
	for i, s := range e.systems {
		out[i] = s.Name
	}
	return out
}

// SetOrders replaces the queue of player or scripted orders.
func (e *Engine) SetOrders(o []Order) { e.orders = append([]Order{}, o...) }

// AddHook registers a callback invoked once per tick after the commit, for
// logging and metrics. Hooks are part of the runner, not a system, so they
// cannot influence simulation results.
func (e *Engine) AddHook(fn func(v *View)) { e.hooks = append(e.hooks, fn) }

// Tick runs one day: systems read committed state, stage writes, and the
// engine applies the writes atomically and logs the changes that crossed the
// thresholds.
func (e *Engine) Tick(s *model.State) error {
	w := NewWriteSet()
	v := &View{
		State:  s,
		Log:    e.Log,
		Cfg:    e.Cfg,
		Tick:   s.Tick,
		Year:   s.Year,
		Day:    s.Tick % 365,
		Rng:    e.rng.Derive(fmt.Sprintf("tick-%d", s.Tick)),
		Orders: e.takeOrders(),
	}
	for i := range e.systems {
		sys := e.systems[i]
		// Each system gets its own named substream so a draw added to one
		// system does not shift the sequence another system sees, which would
		// silently invalidate golden runs.
		sv := *v
		sv.Rng = e.rng.Derive(fmt.Sprintf("tick-%d-%s", s.Tick, sys.Name))
		before := len(w.writes)
		relBefore := len(w.relationAdds)
		sideRelBefore := len(w.sideRelationAdds)
		sys.Runs(&sv, w)
		// Attribute everything this system staged, so every cause-log row names
		// the system responsible for the change.
		for j := before; j < len(w.writes); j++ {
			w.writes[j].system = sys.Name
		}
		for j := relBefore; j < len(w.relationAdds); j++ {
			w.relationAdds[j].system = sys.Name
		}
		for j := sideRelBefore; j < len(w.sideRelationAdds); j++ {
			w.sideRelationAdds[j].system = sys.Name
		}
	}
	if err := w.Err(); err != nil {
		return err
	}
	if err := e.apply(s, w); err != nil {
		return err
	}
	s.Tick++
	// 365-day year, with a leap day every fourth year so long runs do not
	// drift against a calendar.
	yearLen := 365.0
	if int(s.Year)%4 == 3 {
		yearLen = 366
	}
	if float64(s.Tick%int(yearLen)) < 1 {
		s.Year++
	}
	for _, h := range e.hooks {
		h(v)
	}
	return nil
}

func (e *Engine) takeOrders() []Order {
	if len(e.orders) == 0 {
		return nil
	}
	out := e.orders
	e.orders = nil
	return out
}

// apply commits a tick's staged writes: creates, numeric writes in a
// deterministic order, relation and oath operations, then deletes.
//
// Numeric writes are sorted before application so that two additive writes to
// the same field always accumulate in the same sequence, and any clamping
// happens against the same intermediate values every run.
func (e *Engine) apply(s *model.State, w *WriteSet) error {
	for _, fn := range w.creates {
		fn(s)
	}
	for _, p := range w.spawns {
		id := s.NewID(model.IDParty)
		p.ID = id
		s.Parties[id] = p
		s.SetIDCounter(model.IDParty, id)
	}
	// Deterministic accumulation order. Every write to one field is summed into
	// a single committed change, and the commits are then applied in a fixed
	// (kind, entity, field) order, so the floating-point rounding of a sum
	// cannot depend on which system staged its contribution first.
	//
	// This is also what makes a tick's result independent of system order: two
	// additive contributions to the same field are combined before anything is
	// committed, so their order of arrival is irrelevant.
	merged := mergeWrites(w.writes)
	for _, x := range merged {
		if !s.Exists(x.Kind, x.Entity) {
			// An entity deleted earlier in the same tick cannot be written to.
			// Skipping is correct rather than an error: a system may target an
			// entity that another system removed this tick, and that is a
			// legitimate race resolved by fixed order.
			continue
		}
		f, ok := model.FieldByName(x.Kind, x.Field)
		if !ok {
			return fmt.Errorf("sim: unknown field %q", x.Field)
		}
		old, ok := s.Get(x.Kind, x.Entity, x.Field)
		if !ok {
			return fmt.Errorf("sim: %s#%d has no field %q", x.Kind, x.Entity, x.Field)
		}
		next := x.Value
		if !x.IsSet {
			next = old + x.Value
		}
		if next < f.Min {
			next = f.Min
		}
		if next > f.Max {
			next = f.Max
		}
		// Integer-valued fields are whole people and whole troops. A death
		// count of 3.7 people is a bug that would quietly distort every
		// population total downstream.
		if f.Value == model.ValueInt {
			next = float64(int64(next + 0.5))
			if next < f.Min {
				next = f.Min
			}
			if next > f.Max {
				next = f.Max
			}
		}
		if f.Value == model.ValueFlag {
			if next != 0 {
				next = 1
			} else {
				next = 0
			}
		}
		if old == next {
			continue
		}
		s.Set(x.Kind, x.Entity, x.Field, next)
		if f.Tracked && e.Log.ShouldLog(f, old, next, e.Cfg.Cause.MinAbsolute, e.Cfg.Cause.MinRelative) {
			e.Log.Append(cause.Row{
				Tick:     s.Tick,
				Year:     s.Year,
				Kind:     x.Kind,
				Entity:   x.Entity,
				Field:    x.Field,
				Old:      old,
				New:      next,
				Delta:    next - old,
				System:   x.system,
				Read:     x.Read,
				CausedBy: x.CausedBy,
				Note:     x.Note,
			})
		} else if f.Tracked {
			e.Log.NoteSuppressed()
		}
	}
	for _, rw := range w.relationAdds {
		e.applyRelation(s, rw, false)
	}
	for _, rw := range w.sideRelationAdds {
		e.applyRelation(s, rw, true)
	}
	for _, op := range w.oathOps {
		if op.Break {
			// Break the lowest-ID matching oath. Iterating the map directly
			// would pick a random duplicate when several unbroken oaths share
			// a promisor/promisee pair.
			for _, k := range sortedOathKeys(s.Oaths) {
				o := s.Oaths[k]
				if o.Broken {
					continue
				}
				if o.Promisor == op.Oath.Promisor && o.Promisee == op.Oath.Promisee {
					o.Broken = true
					o.BrokenTick = s.Tick
					s.Oaths[k] = o
					break
				}
			}
			continue
		}
		s.Oaths[len(s.Oaths)] = op.Oath
	}
	for _, d := range w.deletes {
		switch d.Kind {
		case model.KindTown:
			delete(s.Towns, d.ID)
		case model.KindVillage:
			delete(s.Villages, d.ID)
		case model.KindParty:
			delete(s.Parties, d.ID)
		case model.KindRuler:
			delete(s.Rulers, d.ID)
		case model.KindRoute:
			delete(s.Routes, d.ID)
		case model.KindSiege:
			delete(s.Sieges, d.ID)
		case model.KindWar:
			delete(s.Wars, d.ID)
		}
	}
	return nil
}

// Debug exposes staged writes for the profiling harness. It is used only by the
// benchmark tool, which needs to discard a tick's writes rather than apply
// them; it is not part of the simulation's own path.
func (w *WriteSet) Debug() []struct {
	Kind   model.Kind
	Entity int
	Field  string
} {
	out := make([]struct {
		Kind   model.Kind
		Entity int
		Field  string
	}, 0, len(w.writes))
	for _, x := range w.writes {
		out = append(out, struct {
			Kind   model.Kind
			Entity int
			Field  string
		}{x.Kind, x.Entity, x.Field})
	}
	return out
}
