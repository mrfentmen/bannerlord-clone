package battle

import (
	"fmt"
	"strconv"
	"strings"
)

// Result is the outcome of a battle.
//
// It is assembled from the run's own accumulated totals, not recomputed at the
// end by a second and possibly different set of rules, so every number in it is
// a number the simulation actually used.
type Result struct {
	// Seed and ConfigVersion identify what produced this result, so a report
	// can be matched to a run and a saved result can be reproduced.
	Seed          uint64
	ConfigVersion string
	// Label is the battle's name as supplied in Setup.
	Label string
	// TickOrder is the documented stage order, carried here so a report
	// generated from a Result states the order the numbers were produced under.
	TickOrder []string

	// Outcome is who won and why.
	Outcome Outcome

	// StateHash is a digest of every unit's final state, taken while the units are
	// still alive and folded into Result.Hash.
	//
	// It is carried because the aggregate numbers above cannot distinguish two
	// battles that agree on the winner, the tick count, and every casualty total
	// while differing in one unit's position by a single bit. Result.Hash is what
	// a determinism test compares and what a replay check compares; StateHash is
	// the part of that comparison that covers the units themselves, and it is kept
	// as its own field so a caller can tell "the units diverged" from "the report
	// diverged".
	//
	// Per-unit positions are folded in and not carried out. A Result describing
	// five hundred units would be a second copy of the battle's state in every
	// battle report, and the thing that needs those positions is a live debugging
	// session, which has the Battles. See DiffUnitStates.
	StateHash uint64

	// Truncated says the run stopped on a caller-supplied tick budget rather
	// than on a conclusion, which is only ever set by RunTicks. A battle stopped
	// by its own rules has an Outcome that means something; one stopped by a
	// measurement's tick budget has a stalemate Outcome that is an artefact of
	// the budget, and a caller must be able to tell those apart rather than
	// reporting a throughput run as a stalemate.
	Truncated bool

	// Ticks is how many ticks ran, and Elapsed is the simulated time in seconds.
	Ticks    int
	Elapsed  float64
	ElapsedS string

	// Sides holds one entry per side, in the fixed order A then B. A slice
	// rather than a map because a report and a test both iterate it and map
	// order would make either non-reproducible.
	Sides [2]SideResult

	// Stats is the battle's totals.
	Stats Stats

	// Events are the notable things that happened, in the order they happened,
	// and EventsDropped counts how many were not kept because the list reached
	// its bound. A dropped count is reported rather than hidden.
	Events        []Event
	EventsDropped int

	// Start and End hold each side's strength as a share of its own opening
	// strength, which is the number that answers "how did this go".
	Start, End [2]float64

	// Config is the battle section of the balance file this ran under, kept so
	// a caller can report the exact constants a saved result came from.
	Config BattleConfigView
}

// BattleConfigView is the subset of the battle constants a report quotes back.
// It is a value, not a pointer into the caller's config, so a Result keeps
// working after the config it came from has gone.
type BattleConfigView struct {
	MaxUnitsPerSide float64
	TickSeconds     float64
	MaxTicks        float64
	// MaxReportEvents is the event-list bound this run reported against, so a
	// report that says events were dropped names the bound it hit instead of
	// naming a number that is not in the result.
	MaxReportEvents float64
	// GridCellSize and GridMaxCells are the two spatial-index constants, kept
	// for the same reason: a report about a coarse index has to say what cell
	// size was asked for and what budget it was given.
	GridCellSize float64
	GridMaxCells float64
	Version      string
}

// SideResult is one side's outcome.
type SideResult struct {
	// Side is which army this is.
	Side Side
	// StartUnits and StartBodies are what the side began with.
	StartUnits  int
	StartBodies float64
	// Dead, Wounded, and SurrenderedBodies are what it lost. Dead and Wounded
	// are bodies; Surrendered is counted in units as well, because one officer
	// speaks for a squad.
	Dead, Wounded     float64
	Surrendered       int
	SurrenderedBodies float64
	// Standing, Broken, and Routed are the units still on the field in each
	// state at the final tick.
	Standing, Broken, Routed int
	// StrengthStart and StrengthEnd are battle strength: bodies weighted by
	// condition and by how well they are currently fighting. StrengthStart is
	// the baseline every ending is measured against.
	StrengthStart, StrengthEnd float64
	// MoraleStart and MoraleEnd are the mean morale of the side's units.
	MoraleStart, MoraleEnd float64
	// AmmoStart and AmmoSpent are rounds carried and rounds fired.
	AmmoStart, AmmoSpent float64
	// Shots, Swings, RangedHits, and MeleeHits are the attacks made and made
	// good. A side with few hits relative to its shots was suppressed, or
	// shooting at a target out of range, and the report says which.
	Shots, Swings, RangedHits, MeleeHits float64
	// SuppressionDealt and SuppressionTaken are the totals of the fire this
	// side put out and the fire it stood in.
	SuppressionDealt, SuppressionTaken float64
	// CasualtiesInflicted is the bodies this side destroyed on the other.
	CasualtiesInflicted float64
	// Leaders is how many commanders were on the field for it.
	Leaders int
}

// Outcome is who won a battle and why.
type Outcome struct {
	// Kind is the winner, or a draw.
	Kind ResultKind
	// Reason names the condition that ended it.
	Reason Reason
}

// ResultKind is the winner of a battle.
type ResultKind int

const (
	// ResultDraw means neither side won. A battle is a draw when both sides
	// collapse together, when both break together, or when it runs out of ticks
	// with nothing decided.
	ResultDraw ResultKind = iota
	// ResultSideA means the first force won.
	ResultSideA
	// ResultSideB means the second force won.
	ResultSideB
)

// String names the winner.
func (k ResultKind) String() string {
	switch k {
	case ResultDraw:
		return "draw"
	case ResultSideA:
		return "A"
	case ResultSideB:
		return "B"
	default:
		return "unknown"
	}
}

// Reason is the condition that ended a battle.
type Reason int

const (
	// ReasonEnemyDestroyed means one side has nothing left that can fight.
	ReasonEnemyDestroyed Reason = iota
	// ReasonEnemyBroke means the loser yielded: its strength fell to
	// battle.surrender_strength_fraction of its opening strength, or more than
	// battle.rout_strength_fraction of its strength was routed.
	ReasonEnemyBroke
	// ReasonMutualCollapse means neither side has anything left that can fight.
	ReasonMutualCollapse
	// ReasonMutualBreak means both sides yielded.
	ReasonMutualBreak
	// ReasonStalemate means battle.max_ticks was reached with neither side
	// decided. It is a real outcome and is reported as one.
	ReasonStalemate
)

// String names the reason.
func (r Reason) String() string {
	switch r {
	case ReasonEnemyDestroyed:
		return "enemy destroyed"
	case ReasonEnemyBroke:
		return "enemy broke"
	case ReasonMutualCollapse:
		return "mutual collapse"
	case ReasonMutualBreak:
		return "mutual break"
	case ReasonStalemate:
		return "stalemate at the tick bound"
	default:
		return "unknown"
	}
}

// EventKind is a notable thing that happened in a battle.
type EventKind int

const (
	// EventBroken is a unit whose morale fell below the break threshold.
	EventBroken EventKind = iota
	// EventRouted is a unit that broke and ran.
	EventRouted
	// EventRallied is a unit that came back into the fight.
	EventRallied
	// EventSurrendered is a unit that gave itself up.
	EventSurrendered
	// EventDestroyed is a unit removed from the fight, dead or wounded.
	EventDestroyed
	// EventShotFired is one fired shot's event bundle: muzzle flash, tracer,
	// impact effect, and suppression crack, all encoded in the Read field.
	// Every shot emits exactly one bundle, hit or miss, so the client can
	// count shots and play effects from events alone.
	EventShotFired
)

// String names the event kind.
func (k EventKind) String() string {
	switch k {
	case EventBroken:
		return "broken"
	case EventRouted:
		return "routed"
	case EventRallied:
		return "rallied"
	case EventSurrendered:
		return "surrendered"
	case EventDestroyed:
		return "destroyed"
	case EventShotFired:
		return "shot"
	default:
		return "unknown"
	}
}

// Event is one notable thing that happened.
//
// The battle layer keeps its own event list rather than writing to the campaign's
// shared cause log, because a cause row names a model entity and there is no
// entity kind for a soldier; CONSTITUTION.md section 2.2's rule that every
// tracked write produces a row is honoured when the campaign layer bridges these
// events into battle_log and cause_log as it writes the aftermath back. What a
// battle owes the campaign is the event; where the row is filed is the campaign
// layer's decision.
type Event struct {
	// Seq is the event's position in the battle's event list.
	Seq int
	// Tick is when it happened.
	Tick int
	// Side is the side it happened to.
	Side Side
	// Kind is what happened.
	Kind EventKind
	// Unit is the unit it happened to, or -1 for a battle-level event.
	Unit int
	// Value is the number the event is about: the morale a unit broke or rallied
	// at, or the bodies destroyed.
	Value float64
	// Read is the plain-language record of the state that produced it, in the
	// same "name=value, name=value" form the campaign cause log uses.
	Read string
	// Note is context in plain language.
	Note string
}

// Format renders an event as one CSV-compatible line, matching cause.Row's
// shape so the two can sit in the same log without a conversion step.
func (e Event) Format() string {
	return fmt.Sprintf("%d,%d,%s,%s,%d,%d,%.4f,%q,%q",
		e.Seq, e.Tick, e.Side, e.Kind, e.Unit, e.Kind, e.Value, e.Read, e.Note)
}

// result assembles the outcome of a finished battle.
func (b *Battle) result(o Outcome) *Result {
	r := &Result{
		Seed:          b.seed,
		ConfigVersion: b.cfg.Version,
		Label:         b.label,
		TickOrder:     append([]string{}, tickOrder...),
		Outcome:       o,
		StateHash:     b.hashUnitState(orderLogHashSeed),
		Ticks:         b.tickNo,
		Elapsed:       b.elapsed,
		ElapsedS:      formatDuration(b.elapsed),
		Stats:         b.stats,
		Events:        append([]Event{}, b.events...),
		EventsDropped: b.eventsDropped,
		Config: BattleConfigView{
			MaxUnitsPerSide: b.c.MaxUnitsPerSide,
			TickSeconds:     b.c.TickSeconds,
			MaxReportEvents: b.c.MaxReportEvents,
			GridCellSize:    b.c.GridCellSize,
			GridMaxCells:    b.c.GridMaxCells,
			MaxTicks:        b.c.MaxTicks,
			Version:         b.cfg.Version,
		},
	}
	// Start is each side's opening strength, kept on the result so a caller can
	// show the battle's own baseline rather than a body count it has to trust.
	r.Start[0] = b.strengthStartA
	r.Start[1] = b.strengthStartB

	for _, side := range sides {
		sr := b.sideResult(side)
		i := side.index()
		r.Sides[i] = sr
		r.End[i] = sr.StrengthEnd
	}
	return r
}

// sideResult assembles one side's outcome.
func (b *Battle) sideResult(side Side) SideResult {
	c := b.c
	si := side.index()
	sr := SideResult{
		Side:                side,
		StartUnits:          b.startUnits(side),
		StartBodies:         b.stats.Bodies[si],
		Dead:                b.stats.Dead[si],
		Wounded:             b.stats.Wounded[si],
		Surrendered:         int(b.stats.Surrendered[si]),
		StrengthEnd:         strength(b.units, side, c),
		Shots:               b.stats.Shots[si],
		Swings:              b.stats.Swings[si],
		RangedHits:          b.stats.RangedHits[si],
		MeleeHits:           b.stats.MeleeHits[si],
		SuppressionDealt:    b.stats.Suppression[si],
		CasualtiesInflicted: b.stats.CasualtiesInflicted[si],
	}
	if side == SideA {
		sr.StrengthStart = b.strengthStartA
	} else {
		sr.StrengthStart = b.strengthStartB
	}

	moraleSum, ammoStart, ammoLeft, n := 0.0, 0.0, 0.0, 0
	for _, u := range b.units {
		if u.Side != side {
			continue
		}
		moraleSum += u.Morale
		if u.Role == RoleRanged {
			ammoStart += b.rosterAmmoFor(u)
			ammoLeft += u.Ammo
		}
		n++
		switch u.Status {
		case StatusFighting, StatusBroken:
			sr.Standing++
			if u.Status == StatusBroken {
				sr.Broken++
			}
		case StatusRouted:
			sr.Routed++
			sr.SurrenderedBodies += u.Troops
		case StatusSurrendered:
			sr.SurrenderedBodies += u.Troops
		}
	}
	if n > 0 {
		sr.MoraleEnd = moraleSum / float64(n)
	}
	sr.MoraleStart = c.RosterMoraleStart
	sr.AmmoStart = ammoStart
	sr.AmmoSpent = ammoStart - ammoLeft
	sr.SuppressionTaken = b.suppressionTaken(side)
	sr.Leaders = b.leadersFor(side)
	return sr
}

// rosterAmmoFor is how many rounds a ranged unit started with.
//
// A caller that supplies its own units and ammunition gets the figure it gave;
// a caller that used the roster generator gets battle.roster_ammo_per_unit. The
// unit's own remaining ammunition is authoritative, so this only has to be
// right for the opening load, and the fallback is the configured value rather
// than zero: a report claiming a side fired nothing because nobody recorded what
// it carried would be worse than useless.
func (b *Battle) rosterAmmoFor(u *Unit) float64 {
	if u.AmmoStart >= u.Ammo {
		return u.AmmoStart
	}
	return b.c.RosterAmmoPerUnit
}

// startUnits counts how many units a side brought on.
func (b *Battle) startUnits(side Side) int {
	n := 0
	for _, u := range b.units {
		if u.Side == side {
			n++
		}
	}
	return n
}

// suppressionTaken totals the suppression a side is currently under. It is a
// snapshot rather than a running total, because what a report wants is how hard
// the side was being suppressed at the end, not the integral over the fight,
// which would say more about how long the fight was than about the fire.
func (b *Battle) suppressionTaken(side Side) float64 {
	total := 0.0
	for _, u := range b.units {
		if u.Side == side && u.alive() {
			total += u.Suppression
		}
	}
	return total
}

// leadersFor counts the commanders on the field for a side.
func (b *Battle) leadersFor(side Side) int {
	n := 0
	for _, l := range b.leaders {
		if l.Side == side {
			n++
		}
	}
	return n
}

// formatDuration renders a count of simulated seconds as a plain clock reading,
// which is what a battle report quotes. It is a simulation's own clock, not a
// promise about how long the run took on a machine.
func formatDuration(seconds float64) string {
	if seconds < 0 {
		seconds = 0
	}
	total := int(seconds + 0.5)
	h := total / 3600
	m := (total % 3600) / 60
	s := total % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%d:%02d", m, s)
}

// PrisonersTakenBy is how many bodies the given side is holding as prisoners at
// the end of the battle.
//
// It is the loser's SURRENDERED BODIES and nothing else, and the reasoning is
// short. This engine's only surrender rule is a routed unit that has escaped the
// fight giving itself up (battle.surrender_chance, with no enemy within
// battle.surrender_range), so a surrendered unit is a body that walked off the
// field intact and belongs to whoever beat it. Dead bodies are not prisoners and
// routed bodies are not prisoners either: a routed man is alive, on the run, and
// unaccounted for, and counting him would hand the winner troops he does not have.
//
// WHY THIS IS HERE RATHER THAN IN THE CAMPAIGN LAYER, AND WHAT IT DOES NOT DO:
// internal/autoresolve is where a battle fought on paper turns into prisoners, and
// internal/writeback is where prisoners become a cause-log row. Neither of them
// has ever seen a battle that was actually fought, because nothing outside this
// package consumes battle.Result, so a field battle's surrenders currently reach
// no prisoner count at all. That gap is somebody else's to close by reading this,
// and this is here so that when they do there is one answer rather than two.
//
// The invariants it rests on, both of which are checked elsewhere: a surrendered
// unit is counted once and never again (the status tally in commit), and the two
// sides' bodies add up (the verification harness's casualties-add-up rule). A draw
// has no prisoner-taker, so asking about either side of one returns that side's
// own number rather than an error, and the caller can see the draw in Outcome.Kind
// if it cares.
func (r *Result) PrisonersTakenBy(side Side) float64 {
	i := side.index()
	if i < 0 || i >= len(r.Sides) {
		return 0
	}
	return r.Sides[i].SurrenderedBodies
}

// PrisonersTaken is the loser's surrendered bodies, indexed the way the campaign
// layer indexes a result: [0] is what side A is holding, [1] is what side B is.
//
// autoresolve.Result.PrisonersTaken means exactly this and is what
// internal/writeback reads, so a caller holding a battle.Result and a caller
// holding an autoresolve.Result can both say "prisoners taken" and mean one thing.
func (r *Result) PrisonersTaken() [2]float64 {
	return [2]float64{r.PrisonersTakenBy(SideA), r.PrisonersTakenBy(SideB)}
}

// Summary renders a result as a compact block of plain text.
//
// It is the form a headless harness prints and the form a screenshot of a
// battle would want, so it leads with the answer and then gives the numbers that
// explain it.
func (r *Result) Summary() string {
	var sb strings.Builder
	name := r.Label
	if name == "" {
		name = "field battle"
	}
	fmt.Fprintf(&sb, "%s — seed %d, config %s\n", name, r.Seed, r.ConfigVersion)
	fmt.Fprintf(&sb, "winner: %s (%s)\n", r.Outcome.Kind, r.Outcome.Reason)
	fmt.Fprintf(&sb, "ticks: %d over %s of simulated time (%g s per tick)\n",
		r.Ticks, r.ElapsedS, r.Config.TickSeconds)
	fmt.Fprintf(&sb, "stage order: %s\n", strings.Join(r.TickOrder, " -> "))
	for _, sr := range r.Sides {
		fmt.Fprintf(&sb, "\nside %s\n", sr.Side)
		fmt.Fprintf(&sb, "  units     %d (%s squads, %.0f bodies)\n",
			sr.StartUnits, plural(sr.StartUnits, "squad"), sr.StartBodies)
		fmt.Fprintf(&sb, "  dead      %.0f (%.1f%% of bodies)\n",
			sr.Dead, pct(sr.Dead, sr.StartBodies))
		fmt.Fprintf(&sb, "  wounded   %.0f (%.1f%% of bodies)\n",
			sr.Wounded, pct(sr.Wounded, sr.StartBodies))
		fmt.Fprintf(&sb, "  casualties %.0f of %.0f bodies (%.1f%%)\n",
			sr.Dead+sr.Wounded, sr.StartBodies, pct(sr.Dead+sr.Wounded, sr.StartBodies))
		fmt.Fprintf(&sb, "  surrendered %d units, %.0f bodies\n", sr.Surrendered, sr.SurrenderedBodies)
		fmt.Fprintf(&sb, "  on field  %d standing (%d broken), %d routed, %d destroyed\n",
			sr.Standing, sr.Broken, sr.Routed, sr.StartUnits-sr.Standing-sr.Routed)
		fmt.Fprintf(&sb, "  strength  %.0f -> %.0f (%.1f%% of opening)\n",
			sr.StrengthStart, sr.StrengthEnd, pct(sr.StrengthEnd, sr.StrengthStart))
		fmt.Fprintf(&sb, "  morale    %.3f -> %.3f\n", sr.MoraleStart, sr.MoraleEnd)
		fmt.Fprintf(&sb, "  fire      %.0f shots (%.0f hit), %.0f swings (%.0f hit), %.0f rounds spent\n",
			sr.Shots, sr.RangedHits, sr.Swings, sr.MeleeHits, sr.AmmoSpent)
		fmt.Fprintf(&sb, "  suppression dealt %.0f, standing under %.0f\n",
			sr.SuppressionDealt, sr.SuppressionTaken)
		fmt.Fprintf(&sb, "  inflicted %.0f bodies, leaders on field %d\n",
			sr.CasualtiesInflicted, sr.Leaders)
	}
	fmt.Fprintf(&sb, "\nbreaks: %d, routs: %d, peak broken %d, peak routed %d, peak suppression %.2f\n",
		r.Stats.Breaks, r.Stats.Routs, r.Stats.PeakBroken, r.Stats.PeakRouted, r.Stats.PeakSuppression)
	if r.EventsDropped > 0 {
		fmt.Fprintf(&sb, "note: %d further events were not kept; the event list reached its bound of %g\n",
			r.EventsDropped, r.Config.MaxReportEvents)
	}
	return sb.String()
}

// Breaks returns the first and last of a given event kind, which is what a
// harness wants for a timeline: when the first man broke and when the last one
// did. It returns false when the battle had no such event.
func (r *Result) FirstLast(k EventKind) (first, last Event, ok bool) {
	first, ok = Event{}, false
	for _, e := range r.Events {
		if e.Kind != k {
			continue
		}
		if !ok {
			first, ok = e, true
		}
		last = e
	}
	return first, last, ok
}

// Timeline renders the first few events of a kind, newest last, as one line
// each. A harness prints it; a caller embedding it in a report can ignore it.
func (r *Result) Timeline(k EventKind, limit int) string {
	var lines []string
	for _, e := range r.Events {
		if e.Kind == k {
			lines = append(lines, fmt.Sprintf("  tick %5d  %s", e.Tick, e.Note))
			if len(lines) >= limit {
				break
			}
		}
	}
	if len(lines) == 0 {
		return "  (none)"
	}
	return strings.Join(lines, "\n")
}

// pct is a share of total as a percentage, guarding a zero denominator.
func pct(part, total float64) float64 {
	if total <= 0 {
		return 0
	}
	return part / total * 100
}

// plural renders a count with a word, for a report line that reads properly at
// one and at many.
func plural(n int, word string) string {
	if n == 1 {
		return strconv.Itoa(n) + " " + word
	}
	return strconv.Itoa(n) + " " + word + "s"
}
