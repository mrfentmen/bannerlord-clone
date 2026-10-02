package replay

import (
	"fmt"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// Record fights a battle with a recorder attached and returns the whole
// observed run: the engine's result, every published frame, and the cause log
// derived from those frames.
//
// It is the entry point for all three proofs. Run the same setup with the same
// seed twice and diff the two Recordings: if they are byte-identical the engine
// is deterministic. Check Causes against Result: if every unit the result says
// died has rows explaining it, the cause log is complete. Encode the Recording
// and decode it and re-simulate: if the fight comes out the same, the replay is
// honest.
//
// The battle is fought through battle.RunCommanded with a recorder that issues
// no orders, so the fight is the fight the engine would have run on its own. That
// is checked rather than assumed: TestRecordingDoesNotChangeTheBattle runs the
// same setup through battle.Run and compares, because an observer that changed
// the thing it observed would make every other test in this package a test of the
// observer.
func Record(cfg *config.Config, seed uint64, setup battle.Setup) (*Recording, error) {
	if cfg == nil {
		return nil, fmt.Errorf("replay: Record needs a balance config; the engine holds no constants " +
			"of its own, so there is nothing to run a battle under")
	}
	return record(cfg, seed, setup)
}

// DeriveCauses builds the cause log for a set of frames.
//
// It is exported so that a caller reading a replay file off disk can derive the
// same log the recording carried, and so that a test can check that the two
// agree. A file whose cause log cannot be re-derived from its own frames is a
// file carrying a claim nobody can check.
func DeriveCauses(frames []Frame) *CauseLog { return deriveCauses(frames) }

// deriveCauses walks the frames and writes a row for every tracked field that
// changed between one frame and the next.
//
// It is derived from the frames rather than taken from the engine's own event
// list, and that is the whole point. The engine logs what it considers notable:
// a break, a rout, a destruction. This walks every published field of every
// unit and writes a row for each one that moved. Two consequences follow, and
// both are what make the completeness claim worth anything:
//
//   - A state change the engine did not consider notable is still logged here,
//     because it is a change in a tracked field. That is what CONSTITUTION.md
//     section 2.2 asks for and it is not what the engine's event list does.
//   - The count of rows is a function of the frames alone, so a test can
//     recompute it and compare. A test that compared the derived log against the
//     engine's event list would be testing two of the engine's own outputs
//     against each other and would pass even if both were incomplete.
//
// The opening frame is the baseline and produces no rows: nothing has changed
// yet. Every later frame is compared field by field against the one before it.
//
// Rows come out in tick order and then ascending unit id, which is the order the
// frames are in, so the log is as fixed as the recording it came from.
func deriveCauses(frames []Frame) *CauseLog {
	l := &CauseLog{}
	seen := map[string]bool{}
	if len(frames) == 0 {
		l.FieldsObserved = nil
		return l
	}
	prev := frames[0].Units
	for _, f := range frames[1:] {
		// The unit sets are parallel and the same size every tick, because the
		// battle publishes every unit in ascending id order. A length change would
		// mean units left the field, which the engine models as a status rather
		// than a removal, so it is guarded rather than assumed: a mismatch skips
		// the tick rather than comparing the wrong units against each other.
		if len(f.Units) == len(prev) && alignedByID(prev, f.Units) {
			for i := range f.Units {
				emitRows(l, f.Tick, &f.Units[i], &prev[i], seen)
			}
		}
		prev = f.Units
	}
	l.FieldsObserved = observedInOrder(seen)
	return l
}

// alignedByID reports whether two consecutive frames publish their units in the
// same order, matched by id.
//
// The battle publishes ascending unit ids, and the cause log matches units by
// position in that order rather than by a lookup. Position is faster and it is
// the engine's own contract, but a contract that silently changed would attribute
// one unit's change to another, so it is checked once per tick rather than
// trusted.
func alignedByID(a, b []UnitFrame) bool {
	for i := range a {
		if a[i].ID != b[i].ID {
			return false
		}
	}
	return true
}

// emitRows writes the rows for one unit's changes between two frames.
//
// The order the fields are checked in is TrackedFields' order and not a map's, so
// the log reads the same way every run.
func emitRows(l *CauseLog, tick int, cur, old *UnitFrame, seen map[string]bool) {
	for _, field := range TrackedFields {
		switch field {
		case StatusField:
			if cur.Status != old.Status {
				addEnum(l, tick, cur, field,
					statusName(old.Status), statusName(cur.Status), "morale", cur)
				seen[field] = true
			}
		case IntentField:
			if cur.Intent != old.Intent {
				addEnum(l, tick, cur, field,
					intentName(old.Intent), intentName(cur.Intent), "intent", cur)
				seen[field] = true
			}
		case HPField:
			if cur.HPFrac != old.HPFrac {
				addNum(l, tick, cur, field, old.HPFrac, cur.HPFrac, "combat", cur)
				seen[field] = true
			}
		case MoraleField:
			if cur.Morale != old.Morale {
				addNum(l, tick, cur, field, old.Morale, cur.Morale, "morale", cur)
				seen[field] = true
			}
		case SuppressionField:
			if cur.Suppression != old.Suppression {
				addNum(l, tick, cur, field, old.Suppression, cur.Suppression, "aimed fire", cur)
				seen[field] = true
			}
		case AmmoField:
			if cur.Ammo != old.Ammo {
				addNum(l, tick, cur, field, old.Ammo, cur.Ammo, "aimed fire", cur)
				seen[field] = true
			}
		case XField:
			if cur.X != old.X {
				addNum(l, tick, cur, field, old.X, cur.X, "intent", cur)
				seen[field] = true
			}
		case YField:
			if cur.Y != old.Y {
				addNum(l, tick, cur, field, old.Y, cur.Y, "intent", cur)
				seen[field] = true
			}
		}
	}
}

// addNum writes one numeric row.
func addNum(l *CauseLog, tick int, u *UnitFrame, field string, old, new float64, system string, cur *UnitFrame) {
	l.add(CauseRow{
		Tick:   tick,
		Side:   u.Side,
		Unit:   u.ID,
		Field:  field,
		Old:    old,
		New:    new,
		Delta:  new - old,
		System: system,
		Read:   readRecord(cur),
	})
}

// addEnum writes one row for an enumerated field, naming the before and after
// rather than numbering them.
func addEnum(l *CauseLog, tick int, u *UnitFrame, field, oldName, newName, system string, cur *UnitFrame) {
	l.add(CauseRow{
		Tick:      tick,
		Side:      u.Side,
		Unit:      u.ID,
		Field:     field,
		StatusOld: oldName,
		StatusNew: newName,
		System:    system,
		Read:      readRecord(cur),
	})
}

// readRecord is the "what state was this decided against" column.
//
// CONSTITUTION.md section 2.2 requires a cause row to record what the system
// read, not only what it wrote. Every row here carries the same reading, the
// unit's whole published condition at the tick it changed, because a row that
// named only the field it wrote would let a reader know what moved without
// knowing what it moved in the context of, and the context is the part that
// explains it.
func readRecord(u *UnitFrame) string {
	return fmt.Sprintf("status=%s hp_frac=%.6f morale=%.6f suppression=%.6f ammo=%.4f x=%.4f y=%.4f",
		statusName(u.Status), u.HPFrac, u.Morale, u.Suppression, u.Ammo, u.X, u.Y)
}

// observedInOrder returns the fields that changed, in TrackedFields order.
func observedInOrder(seen map[string]bool) []string {
	var out []string
	for _, f := range TrackedFields {
		if seen[f] {
			out = append(out, f)
		}
	}
	return out
}

// statusName names a status for a cause row.
//
// It is a name and not the engine's index for the reason given on CauseRow: a row
// that read "old 3, new 5" for a status would be unreadable without the registry.
func statusName(s battle.Status) string { return s.String() }

// intentName names an intent for a cause row, for the same reason.
func intentName(i battle.Intent) string { return i.String() }
