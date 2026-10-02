// Package cause implements the cause log required by CAUSE_EFFECT.md
// section 4 and enforced by CONSTITUTION.md section 2.2: a feature that
// changes tracked state without recording why is incomplete, not merely
// improvable.
//
// A Row is one tracked change: what moved, by how much, which system did it,
// what it read to decide, and which prior rows led to it. The last field is
// what makes the Why panel possible.
package cause

import (
	"encoding/json"
	"fmt"
	"strings"

	"mbclone/simulation/internal/model"
)

// Row is one cause-log entry.
type Row struct {
	// ID is the monotonic event identifier that other rows point at.
	ID int
	// Tick is the simulation day the change happened on.
	Tick int
	// Year is the in-game year, carried so a log line reads on its own.
	Year float64
	// Kind and Entity identify what changed.
	Kind   model.Kind
	Entity int
	// Field is the tracked field name.
	Field string
	// Old and New are the values before and after.
	Old float64
	New float64
	// Delta is New minus Old, kept because a relative reading is often what
	// the player wants and recomputing it later would be guesswork.
	Delta float64
	// System is the name of the system that made the change.
	System string
	// Read is a short record of the state the system read to decide, in the
	// form "food_stock=41.2, tax_rate=0.48". CONSTITUTION.md section 2.2
	// requires the log to record what state it read.
	Read string
	// CausedBy lists the event identifiers this change follows from. It is the
	// edge set of the causal graph.
	CausedBy []int
	// Note is optional extra context in plain language.
	Note string
}

// Format renders a row as one CSV-compatible line.
func (r Row) Format() string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "%d,%d,%.2f,%s,%d,%s,%.6f,%.6f,%.6f,%s,%q,",
		r.ID, r.Tick, r.Year, r.Kind, r.Entity, r.Field, r.Old, r.New, r.Delta, r.System, r.Read)
	for i, c := range r.CausedBy {
		if i > 0 {
			sb.WriteByte(' ')
		}
		fmt.Fprintf(&sb, "%d", c)
	}
	return sb.String()
}

// Header is the cause-log column header, matching Row.Format.
const Header = "event_id,tick,year,entity_kind,entity_id,field,old,new,delta,system,read,caused_by"

// Log is an append-only cause log. It also keeps an index from
// (entity, field) to the most recent row that changed it, which is how a
// system finds the prior causes of its own write without having to pass
// identifiers around.
//
// The index is per-entity-and-field rather than per-entity because a chain
// follows one field through time: the reason unrest rose is the last time
// food_stock fell, not the last time anything at all happened to that town.
type Log struct {
	// rows is a ring-free buffer with a logical start offset. Appending never
	// copies: once the retained rows reach the limit, base advances past the
	// oldest, and the backing array is compacted only when it has grown to
	// twice the limit. Compacting on every append would make one overflowing
	// tick quadratic in the number of rows, which is exactly what happened
	// before this was fixed.
	rows []Row
	// base is the logical index of rows[0]: the number of rows that have been
	// dropped from the front.
	base   int
	nextID int
	// lastChange maps an entity and field to the id of the most recent row.
	lastChange map[entityField]int
	// byID allows the why-query to walk backwards through CausedBy.
	byID map[int]int
	// suppressed counts changes below the logging threshold, so the report
	// can state how many small changes were folded away rather than hiding
	// them.
	suppressed int
	// maxRows bounds memory on very long runs. When exceeded the oldest rows
	// are dropped, which truncates the oldest chains; the run report states
	// when this happened.
	maxRows       int
	droppedOldest int
}

// entityField identifies one field of one entity.
type entityField struct {
	Kind   model.Kind
	Entity int
	Field  string
}

// NewLog returns a log holding at most maxRows entries. A maxRows of zero or
// less means unbounded.
func NewLog(maxRows int) *Log {
	return &Log{
		rows:       []Row{},
		nextID:     1,
		lastChange: map[entityField]int{},
		byID:       map[int]int{},
		maxRows:    maxRows,
	}
}

// Append records a row and updates the index.
//
// The byID map holds indices rather than pointers into the row slice. A
// pointer would dangle the moment the slice reallocated, which under a heavy
// run is every few appends, and the why-query would then read whatever had
// been allocated since. Indices stay valid across reallocation.
func (l *Log) Append(r Row) {
	r.ID = l.nextID
	l.nextID++
	l.rows = append(l.rows, r)
	l.byID[r.ID] = len(l.rows) - 1
	l.lastChange[entityField{r.Kind, r.Entity, r.Field}] = r.ID
	if l.maxRows <= 0 {
		return
	}
	if len(l.rows) > l.maxRows {
		// Advance the logical start. The rows themselves stay in the backing
		// array until it is twice full, at which point one copy amortises over
		// maxRows appends.
		//
		// drop is how many rows this append pushes out, which is the distance
		// base still has to travel to put the limit exactly at the end of the
		// retained window. It is one per append once the window is full. It was
		// written as len(rows)-maxRows, which is the total still to be dropped
		// rather than the increment, so base grew by one, two, three, ... and
		// passed len(rows) within a single window, panicking every long run at
		// the first compaction. Length minus base is the retained count, and it
		// is that count, not the whole backlog, that the increment measures.
		drop := len(l.rows) - l.maxRows - l.base
		if drop < 1 {
			drop = 1
		}
		l.base += drop
		l.droppedOldest += drop
		if len(l.rows) > 2*l.maxRows {
			l.compact()
		}
	}
}

// compact rebuilds the buffer so that it holds only the retained rows. It is
// called at most once per maxRows appends, which is what keeps appending
// amortised O(1).
func (l *Log) compact() {
	retained := l.rows[l.base:]
	out := make([]Row, len(retained))
	copy(out, retained)
	l.rows = out
	l.base = 0
	l.byID = make(map[int]int, len(out))
	for i := range out {
		l.byID[out[i].ID] = i
	}
}

// RecentFor returns the ids of the most recent rows that changed the named
// fields of an entity, newest first, skipping the write's own field. A system
// uses this to name what it read without needing to know the internals of
// another system.
func (l *Log) RecentFor(kind model.Kind, entity int, fields []string, limit int) []int {
	var out []int
	for _, f := range fields {
		if id, ok := l.lastChange[entityField{kind, entity, f}]; ok {
			out = append(out, id)
		}
	}
	// Newest first, and bounded, so a town's long history does not make one
	// row carry hundreds of edges. The sort is by tick descending, so the most
	// recent change to each read field is the one cited.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && l.rowTick(out[j]) > l.rowTick(out[j-1]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

// rowTick returns a row's tick by id, or zero if the row has been dropped.
func (l *Log) rowTick(id int) int {
	idx, ok := l.byID[id]
	if !ok || idx < l.base || idx >= len(l.rows) {
		return 0
	}
	return l.rows[idx].Tick
}

// Row returns a row by id.
func (l *Log) Row(id int) (Row, bool) {
	idx, ok := l.byID[id]
	if !ok || idx < l.base || idx >= len(l.rows) {
		return Row{}, false
	}
	return l.rows[idx], true
}

// Rows returns every retained row in order.
func (l *Log) Rows() []Row { return l.rows[l.base:] }

// Len returns the number of retained rows.
func (l *Log) Len() int { return len(l.rows) - l.base }

// LastID is the id of the most recently appended row.
//
// The engine uses it to tell a staged system what its own event was numbered,
// so that the writes the event caused can cite it. It is nextID minus one rather
// than the id of the last retained row, because the newest row is by definition
// retained and the oldest may not be.
func (l *Log) LastID() int { return l.nextID - 1 }

// Suppressed returns how many changes were below the logging threshold.
func (l *Log) Suppressed() int { return l.suppressed }

// NoteSuppressed records that a change was folded away for being too small.
func (l *Log) NoteSuppressed() { l.suppressed++ }

// DroppedOldest returns how many rows were dropped from the front by the
// memory bound.
func (l *Log) DroppedOldest() int { return l.droppedOldest }

// LatestFor returns the most recent row that changed a field of an entity, or
// false if it never has.
func (l *Log) LatestFor(kind model.Kind, entity int, field string) (Row, bool) {
	id, ok := l.lastChange[entityField{kind, entity, field}]
	if !ok {
		return Row{}, false
	}
	return l.Row(id)
}

// ShouldLog reports whether a change is large enough to be worth a row,
// against the absolute and relative thresholds from the balance config.
//
// Both thresholds are checked because a town with 500,000 people and a town of
// 200 need different bars: a fixed absolute threshold either floods the log
// with large-town rounding or drops small-town crises.
func (l *Log) ShouldLog(field model.Field, old, new float64, minAbs, minRel float64) bool {
	minAbs, minRel = field.Thresholds(minAbs, minRel)
	d := new - old
	if d < 0 {
		d = -d
	}
	if d < minAbs {
		return false
	}
	scale := old
	if new > scale {
		scale = new
	}
	if scale > 0 && d/scale < minRel && d < 1 {
		// A large absolute move on a small number is always logged, because
		// that is exactly the case a player needs explained: fifty deaths in
		// a village is a real event even though it is a small fraction.
		return d >= 1 || d/scale >= minRel
	}
	return true
}

// FormatValue renders a field's value for logs, using the registry so a flag
// reads as yes or no and an activity reads as a word.
func FormatValue(kind model.Kind, field string, v float64) string {
	f, ok := model.FieldByName(kind, field)
	if !ok {
		return fmt.Sprintf("%.4f", v)
	}
	return f.Format(v)
}

// MarshalJSON serializes the log's rows for savegames.
func (l *Log) MarshalJSON() ([]byte, error) {
	return json.Marshal(l.Rows())
}

// UnmarshalJSON restores the log's rows from a savegame.
func (l *Log) UnmarshalJSON(data []byte) error {
	var rows []Row
	if err := json.Unmarshal(data, &rows); err != nil {
		return err
	}
	l.rows = rows
	l.base = 0
	// nextID must be greater than any existing ID
	maxID := 0
	for _, r := range rows {
		if r.ID > maxID {
			maxID = r.ID
		}
	}
	l.nextID = maxID + 1
	return nil
}
