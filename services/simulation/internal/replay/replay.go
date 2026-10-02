// Package replay proves three things about the simulation and records what it
// takes to re-run one.
//
// # WHAT THIS PACKAGE IS FOR
//
// Three claims about a simulation are worthless unproven:
//
//  1. It is deterministic. The same seed and the same inputs produce the same
//     run, byte for byte. AI.md section 1 requires it; without it every bug
//     report is unfalsifiable and every saved run is a rumour.
//  2. Every tracked state change is explained. CONSTITUTION.md section 2.2 and
//     CAUSE_EFFECT.md section 4 require a cause-log row for every tracked
//     write. A simulation that changes state without recording why is
//     incomplete, not merely improvable.
//  3. A run can be handed to somebody else. A UI that has never seen this
//     simulation must be able to play a battle back and show the same fight.
//
// This package is the evidence for all three, and the recording format for the
// third. It observes the battle through battle.RunCommanded's documented
// Commander seam rather than reaching into the engine, so that what is recorded
// is exactly what an external layer is allowed to see. That is a deliberate
// constraint: an observer that could read private state would prove nothing
// about the seam, and would break the moment the engine reorganised.
//
// # WHAT THE RECORDER CAN AND CANNOT SEE
//
// The battle publishes, per tick, every unit's side, role, status, intent,
// position, condition, morale, suppression, and ammunition. It does NOT publish
// exhaustion, absolute hit points, melee and ranged targets, attack
// cooldowns, or per-unit shot and swing tallies. The cause log built here
// therefore covers exactly the fields the engine publishes, and TrackedFields is
// that list as data rather than as a claim in a comment. A reader comparing it
// against a future change to the published set will find out immediately, which
// is the point of writing it down.
//
// # THE ONE FRAME A REPLAY DOES NOT HAVE
//
// battle.Commander is called once per tick, after the intent stage and before
// the commit, so a frame holds the state a tick STARTED from. The tick that
// ends a battle is followed by no further call, because fight() returns as soon
// as the battle is decided. A recording therefore holds the state at the start
// of every tick and the final Result, and not the committed state after the last
// tick. A UI playing the recording back renders each frame in turn and then
// shows the result, which is a complete playback; it must not claim to be
// showing the final positions, because those were never published.
//
// # WHAT A REPLAY IS AND IS NOT
//
// A replay is the seed, the setup, the config version, and every published
// frame. It is enough to re-simulate the fight exactly, because the engine is
// reproducible from seed plus setup alone, and it is enough for a UI to draw the
// battle. It is not a snapshot-delta format and not compressed: it is the plain
// reading, one JSON object per line, so that a bug is found by reading the file
// rather than by trusting a decoder.
package replay

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/battle"
)

// RecordVersion is the format version written into every header.
//
// A reader that meets a version it does not know refuses the file rather than
// guessing at it. A replay that decodes into plausible-looking nonsense is worse
// than one that is refused, because the nonsense looks like a battle.
const RecordVersion = 1

// TrackedFields is the set of per-unit state this package records a cause-log
// row for, in a fixed order.
//
// It is the published surface of the battle engine's Commander seam, written as
// data so that a test can assert the cause log covers every tracked field rather
// than trusting that it does. Status is a state and is here even though it is
// not numeric; its row carries the old and new status names in Old and New,
// which is why CauseRow keeps them as floats read through these two constants.
var TrackedFields = []string{
	"status",
	"hp_frac",
	"morale",
	"suppression",
	"ammo",
	"intent",
	"x",
	"y",
}

// Field names used for the two enumerated state fields, in the CauseRow numeric
// encoding described on TrackedFields.
const (
	// StatusField is the unit's condition.
	StatusField = "status"
	// HPField is the unit's remaining condition as a fraction.
	HPField = "hp_frac"
	// MoraleField is the unit's steadiness.
	MoraleField = "morale"
	// SuppressionField is how pinned down the unit is.
	SuppressionField = "suppression"
	// AmmoField is rounds remaining.
	AmmoField = "ammo"
	// IntentField is what the unit decided to do.
	IntentField = "intent"
	// XField and YField are the unit's position in metres.
	XField = "x"
	YField = "y"
)

// CauseRow is one tracked state change, in the shape CAUSE_EFFECT.md section 4
// requires: what moved, by how much, which system moved it, what it read to
// decide.
//
// The field names match the campaign cause log's names where the meaning matches,
// so the two can sit in one file, and the differences are deliberate rather than
// accidental. A battle has no campaign entity to name, so the row names a SIDE
// and a UNIT instead of an entity kind and id. Status and Intent are enumerated
// and not numbers, so they are carried as their name in Field's sibling
// StatusOld and StatusNew below rather than being forced into Old and New.
//
// # WHY Old AND New ARE FLOATS FOR A STATUS CHANGE
//
// Encoding a status as its index would make Old and New comparable and readable
// in one column, which is what the campaign log does for every field it holds.
// This package instead records the enumerated change in the string columns and
// leaves Old and New at zero, because an index in an Old column reads as a
// measurement. A reader looking at "old 3, new 5" for a status cannot tell
// without the field registry whether that means destroyed or surrendered. The
// registry maps the index to the name; the row states the name.
type CauseRow struct {
	// ID is the row's position in the log, from one.
	ID int
	// Tick is the tick the frame belongs to, so a row can be placed against the
	// frame that shows the change.
	Tick int
	// Side and Unit identify what changed. Unit is the battle's own dense unit
	// id, assigned by the engine.
	Side battle.Side
	Unit int
	// Field is one of TrackedFields.
	Field string
	// Old and New are the numeric before and after. Zero for an enumerated
	// field, whose change is in StatusOld and StatusNew.
	Old, New float64
	// StatusOld and StatusNew name the before and after for an enumerated
	// field, and are empty for a numeric one.
	StatusOld, StatusNew string
	// Delta is New minus Old for a numeric field, and zero for an enumerated
	// one: a status going from fighting to destroyed has no magnitude, and
	// inventing one would put a number in a report that means nothing.
	Delta float64
	// System names what moved it, using the stage names in battle's tickOrder
	// so that a row points at the code that produced it.
	System string
	// Read is the state the change was made against, in the same
	// "name=value, name=value" form the campaign cause log uses.
	Read string
}

// Format renders a row as one line of CSV-compatible text.
func (r CauseRow) Format() string {
	return fmt.Sprintf("%d,%d,%s,%d,%s,%s,%s,%.6f,%.6f,%.6f,%s,%q",
		r.ID, r.Tick, r.Side, r.Unit, r.Field,
		r.StatusOld, r.StatusNew, r.Old, r.New, r.Delta, r.System, r.Read)
}

// CauseHeader is the cause-log column header, matching CauseRow.Format.
const CauseHeader = "row_id,tick,side,unit,field,status_old,status_new,old,new,delta,system,read"

// Format renders the cause log as one CSV-compatible block, header included.
func (l *CauseLog) Format() string {
	var sb strings.Builder
	sb.WriteString(CauseHeader)
	sb.WriteByte('\n')
	for _, r := range l.Rows {
		sb.WriteString(r.Format())
		sb.WriteByte('\n')
	}
	return sb.String()
}

// CauseLog is every tracked state change a recording observed.
//
// It is separate from the recording itself because it is derived rather than
// recorded: the frames are what the engine published, and the cause log is what
// those frames say changed. Deriving it means the completeness claim is checked
// against the engine's own output rather than against the engine's opinion of
// what it logged, which is the only way "no state change is unlogged" means
// anything.
type CauseLog struct {
	// Rows are the changes, in tick order and then ascending unit id, which is
	// the order the frames are in and therefore a fixed order.
	Rows []CauseRow
	// RowsByField counts rows per field, and RowsByUnit counts them per unit, so
	// a report can say where the changes were without walking the whole log.
	RowsByField map[string]int
	RowsByUnit  map[int]int
	// FieldsObserved is every field that changed at least once.
	FieldsObserved []string
}

// add appends one row and updates the indexes.
func (l *CauseLog) add(r CauseRow) {
	r.ID = len(l.Rows) + 1
	l.Rows = append(l.Rows, r)
	if l.RowsByField == nil {
		l.RowsByField = map[string]int{}
		l.RowsByUnit = map[int]int{}
	}
	l.RowsByField[r.Field]++
	l.RowsByUnit[r.Unit]++
}

// countOf returns how many rows named a field.
func (l *CauseLog) countOf(field string) int { return l.RowsByField[field] }

// total returns the number of rows.
func (l *CauseLog) total() int { return len(l.Rows) }

// describe renders the per-field counts in TrackedFields order, for a test's
// failure message and for a report. Fixed order because a map's order would
// make the summary itself nondeterministic, which would be a poor joke in this
// package.
func (l *CauseLog) describe() string {
	var sb strings.Builder
	for _, f := range TrackedFields {
		fmt.Fprintf(&sb, "%s=%d ", f, l.RowsByField[f])
	}
	return strings.TrimSpace(sb.String())
}

// sortedUnitIDs returns the units a log has rows for, ascending. Used by tests
// and reports; a map's own order would be wrong here.
func (l *CauseLog) sortedUnitIDs() []int {
	out := make([]int, 0, len(l.RowsByUnit))
	for id := range l.RowsByUnit {
		out = append(out, id)
	}
	sort.Ints(out)
	return out
}

// jsonLine is the on-disk shape of one replay line.
//
// The kind field discriminates. It is a string rather than a small integer
// because a replay is a file a person may open, and "header" in a text file is
// worth more to whoever is debugging it than the digit 1.
type jsonLine struct {
	Kind string `json:"kind"`
	// Header and Result are the whole of their line, flattened, because they are
	// one object each and nesting them buys nothing.
	*jsonHeader
	*jsonFrame
	*jsonResult
	*jsonEvent
}

// jsonHeader is the first line of a replay.
type jsonHeader struct {
	Kind string `json:"kind"`
	// Version is RecordVersion.
	Version int `json:"version"`
	// Seed and ConfigVersion identify what produced this recording, so a reader
	// can tell whether it is being played back under the constants it was
	// recorded with.
	Seed          uint64 `json:"seed"`
	ConfigVersion string `json:"config_version"`
	// Label is the battle's name and Terrain what it was fought on.
	Label   string `json:"label"`
	Terrain string `json:"terrain"`
	// TickOrder is the engine's documented stage order, recorded so a replay
	// states the order its numbers were produced under.
	TickOrder []string `json:"tick_order"`
	// TickSeconds and MaxTicks are the two time constants a reader needs to
	// convert ticks to seconds and to know when the engine gave up.
	TickSeconds float64 `json:"tick_seconds"`
	MaxTicks    float64 `json:"max_ticks"`
	// Setup is the whole battle input, so the replay can be re-simulated rather
	// than only played back. It is the single largest line in the file and is
	// written first so that a truncated file is still re-simulable if the header
	// landed.
	Setup jsonSetup `json:"setup"`
	// TrackedFields is the cause-log field registry this recording was made
	// under, so a reader knows what a field name means without having the source.
	TrackedFields []string `json:"tracked_fields"`
}

// jsonSetup is the battle input, as data.
//
// Every field the engine reads is here. A field that is not written would be a
// setup that does not reproduce, and the round-trip test is what would catch it,
// which is why that test exists.
type jsonSetup struct {
	A       []battle.Unit   `json:"a"`
	B       []battle.Unit   `json:"b"`
	Leaders []battle.Leader `json:"leaders"`
}

// jsonFrame is one tick's published state.
type jsonFrame struct {
	Kind string `json:"kind"`
	// Tick is the number of ticks completed before this one.
	Tick int `json:"tick"`
	// Elapsed is the simulated seconds before this tick.
	Elapsed float64 `json:"elapsed"`
	// Strength and Opening are each side's current battle strength and its
	// opening strength, indexed A then B.
	Strength [2]float64 `json:"strength"`
	Opening  [2]float64 `json:"opening"`
	// Units is every unit on the field, ascending by id.
	Units []jsonUnit `json:"units"`
}

// jsonUnit is one unit as published.
//
// Field order in the struct is the field order in the file, because
// encoding/json emits struct fields in declaration order. A fixed order is what
// makes two recordings byte-comparable, which is the whole of the determinism
// proof.
type jsonUnit struct {
	ID          int           `json:"id"`
	Side        battle.Side   `json:"side"`
	Role        battle.Role   `json:"role"`
	Status      battle.Status `json:"status"`
	Intent      battle.Intent `json:"intent"`
	X           float64       `json:"x"`
	Y           float64       `json:"y"`
	HPFrac      float64       `json:"hp_frac"`
	Morale      float64       `json:"morale"`
	Suppression float64       `json:"suppression"`
	Troops      float64       `json:"troops"`
	Speed       float64       `json:"speed"`
	Ammo        float64       `json:"ammo"`
}

// jsonEvent is one notable thing that happened, in the engine's own order.
type jsonEvent struct {
	Kind      string           `json:"kind"`
	Seq       int              `json:"seq"`
	Tick      int              `json:"tick"`
	Side      battle.Side      `json:"side"`
	EventKind battle.EventKind `json:"event"`
	Unit      int              `json:"unit"`
	Value     float64          `json:"value"`
	Read      string           `json:"read"`
	Note      string           `json:"note"`
}

// jsonResult is the last line of a replay.
type jsonResult struct {
	Kind string `json:"kind"`
	// Outcome is the winner as a name and the reason as a name, rather than as
	// the engine's enum indexes: a replay is read by people and by a UI that
	// has never seen this Go package.
	Winner string `json:"winner"`
	Reason string `json:"reason"`
	// Truncated repeats the engine's own flag, so a reader cannot mistake a
	// caller-stopped run for a decided battle.
	Truncated bool `json:"truncated"`
	// Ticks and Elapsed are the run's length.
	Ticks   int     `json:"ticks"`
	Elapsed float64 `json:"elapsed"`
	// EventsDropped is the engine's count of events past its bound. A replay that
	// silently lost events would be lying, so the count travels with it.
	EventsDropped int `json:"events_dropped"`
	// Sides is each side's result, in the fixed order A then B.
	Sides []jsonSideResult `json:"sides"`
	// Stats is the battle's totals.
	Stats jsonStats `json:"stats"`
}

// jsonSideResult is one side's result.
type jsonSideResult struct {
	Side                battle.Side `json:"side"`
	StartUnits          int         `json:"start_units"`
	StartBodies         float64     `json:"start_bodies"`
	Dead                float64     `json:"dead"`
	Wounded             float64     `json:"wounded"`
	Surrendered         int         `json:"surrendered"`
	SurrenderedBodies   float64     `json:"surrendered_bodies"`
	Standing            int         `json:"standing"`
	Broken              int         `json:"broken"`
	Routed              int         `json:"routed"`
	StrengthStart       float64     `json:"strength_start"`
	StrengthEnd         float64     `json:"strength_end"`
	MoraleStart         float64     `json:"morale_start"`
	MoraleEnd           float64     `json:"morale_end"`
	AmmoStart           float64     `json:"ammo_start"`
	AmmoSpent           float64     `json:"ammo_spent"`
	Shots               float64     `json:"shots"`
	Swings              float64     `json:"swings"`
	RangedHits          float64     `json:"ranged_hits"`
	MeleeHits           float64     `json:"melee_hits"`
	SuppressionDealt    float64     `json:"suppression_dealt"`
	SuppressionTaken    float64     `json:"suppression_taken"`
	CasualtiesInflicted float64     `json:"casualties_inflicted"`
	Leaders             int         `json:"leaders"`
}

// jsonStats is the battle's totals.
type jsonStats struct {
	Bodies              [2]float64 `json:"bodies"`
	Dead                [2]float64 `json:"dead"`
	Wounded             [2]float64 `json:"wounded"`
	Surrendered         [2]float64 `json:"surrendered"`
	Shots               [2]float64 `json:"shots"`
	Swings              [2]float64 `json:"swings"`
	MeleeHits           [2]float64 `json:"melee_hits"`
	RangedHits          [2]float64 `json:"ranged_hits"`
	Suppression         [2]float64 `json:"suppression"`
	CasualtiesInflicted [2]float64 `json:"casualties_inflicted"`
	Breaks              int        `json:"breaks"`
	Routs               int        `json:"routs"`
	PeakBroken          int        `json:"peak_broken"`
	PeakRouted          int        `json:"peak_routed"`
	PeakSuppression     float64    `json:"peak_suppression"`
}

// encodeLine renders one replay line as JSON.
//
// json.Marshal cannot fail on these types: every field is a number, a string, a
// bool, or a slice of those. It is checked anyway, because an ignored error here
// would write a truncated line into a file whose entire purpose is to be
// trusted, and CONSTITUTION.md section 1.3 is explicit about which side of that
// line this codebase sits on.
func encodeLine(v any) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("replay: encoding a line failed: %w", err)
	}
	return b, nil
}
