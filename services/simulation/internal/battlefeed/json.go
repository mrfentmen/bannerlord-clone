package battlefeed

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// Encode writes a feed as one indented JSON document and returns the bytes.
//
// One document and not JSONL, because the client reads it whole: the outcome, the
// aftermath and the field are meaningless apart, and a client that has to stitch
// a header to a result before it can draw a casualty count is a client that will
// draw it wrong. The replay package keeps the line-oriented form for the opposite
// reason, where a file is diffed a line at a time.
//
// The bytes are stable: the same battle recorded twice, on any machine, encodes
// to the same bytes. Nothing here iterates a map, and the float fields are
// rounded to the millimetre on the way in, so a payload cannot differ because of
// a hash seed or a last-bit rounding difference.
func Encode(f *Feed) ([]byte, error) {
	if f == nil {
		return nil, fmt.Errorf("battlefeed: there is no feed to encode")
	}
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)
	if err := writeFeed(w, f); err != nil {
		return nil, err
	}
	if err := w.Flush(); err != nil {
		return nil, fmt.Errorf("battlefeed: writing the feed failed: %w", err)
	}
	f.Bytes = buf.Len()
	return buf.Bytes(), nil
}

// WriteFile encodes a feed and writes it to path.
func WriteFile(path string, f *Feed) error {
	b, err := Encode(f)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, b, 0o644); err != nil {
		return fmt.Errorf("battlefeed: writing %s failed: %w\n"+
			"  check the directory exists and is writable", path, err)
	}
	return nil
}

// writeFeed emits the document and the trailing newline that makes it a text
// file rather than a line of one.
func writeFeed(w *bufio.Writer, f *Feed) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	// SetEscapeHTML(false) keeps a label containing "<" or "&" readable. The
	// output is not HTML, and escaping it would mean a client comparing two
	// battles' labels sees a difference that is not there.
	enc.SetEscapeHTML(false)
	if err := enc.Encode(f); err != nil {
		return fmt.Errorf("battlefeed: encoding the feed failed: %w", err)
	}
	return nil
}

// Decode reads a feed from JSON and checks it.
//
// Everything coming back in is treated as untrusted, per CONSTITUTION.md section
// 1.3: the schema is checked before the body, unknown keys are refused rather
// than ignored, and the account is checked so that a document whose totals do not
// add up is rejected instead of rendered. A feed that fails to decode leaves the
// client with an error and a way to recover; a feed that decodes into nonsense
// leaves it drawing nonsense.
func Decode(data []byte) (*Feed, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, fmt.Errorf("battlefeed: the document is empty; nothing was written to read")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	// An unknown key means the document was written by a version this one does
	// not know, or by something that is not a feed at all. Either way half of it
	// would be silently dropped, which is the failure this package exists to
	// avoid.
	dec.DisallowUnknownFields()
	var f Feed
	if err := dec.Decode(&f); err != nil {
		return nil, fmt.Errorf("battlefeed: parsing the document failed: %w", err)
	}
	// Trailing content after the document is a sign of two documents written to
	// one file, which would otherwise be read as the first one and half the rest.
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("battlefeed: the document has content after the feed; " +
			"expected exactly one JSON object")
	}
	if err := Validate(&f); err != nil {
		return nil, err
	}
	return &f, nil
}

// ReadFile reads a feed from path.
func ReadFile(path string) (*Feed, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("battlefeed: reading %s failed: %w\n"+
			"  write one first with `simrun feed -out %s`", path, err, path)
	}
	f, err := Decode(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return f, nil
}

// Validate checks a feed against the contract a client relies on.
//
// It is called by Decode and is exported so a caller that built a Feed in memory
// can check it before promising a client it is renderable.
func Validate(f *Feed) error {
	if f.Schema != Schema {
		return fmt.Errorf("battlefeed: the document says it is %q, not %q; a client cannot read a "+
			"shape it was not written for. Check the file is a battle feed and not something else",
			f.Schema, Schema)
	}
	if f.SchemaVersion != SchemaVersion {
		return fmt.Errorf("battlefeed: the document is schema version %d and this reader is version %d. "+
			"Regenerate the feed with the current simulation, or read it with the client that matches it",
			f.SchemaVersion, SchemaVersion)
	}
	if f.Battle.Seed == 0 && f.Battle.Label == "" {
		return fmt.Errorf("battlefeed: the document names no battle: no seed and no label. " +
			"A feed that cannot be matched to a run is not evidence of anything")
	}
	switch f.Outcome.Winner {
	case "A", "B", "draw":
	default:
		return fmt.Errorf("battlefeed: the winner is %q; it must be \"A\", \"B\" or \"draw\"", f.Outcome.Winner)
	}
	if f.Outcome.Reason == "" {
		return fmt.Errorf("battlefeed: the outcome has no reason; a client cannot say why the battle " +
			"stopped")
	}
	if f.Duration.Ticks < 0 {
		return fmt.Errorf("battlefeed: the duration is %d ticks, which is not a number of ticks", f.Duration.Ticks)
	}
	if err := validateSides(f); err != nil {
		return err
	}
	if err := validateFrames(f); err != nil {
		return err
	}
	if err := validateUnits(f); err != nil {
		return err
	}
	return nil
}

// validateSides checks the two side blocks and the account between them.
func validateSides(f *Feed) error {
	for i, s := range f.Sides {
		if s.Side != "A" && s.Side != "B" {
			return fmt.Errorf("battlefeed: sides[%d] says %q; the two sides are always \"A\" then \"B\"",
				i, s.Side)
		}
		if s.StartBodies < 0 || s.Dead < 0 || s.Wounded < 0 {
			return fmt.Errorf("battlefeed: side %s has a negative count; casualties cannot be negative", s.Side)
		}
		if s.Casualties > s.StartBodies && s.StartBodies > 0 {
			return fmt.Errorf("battlefeed: side %s lost %.0f of %.0f bodies, which is more than it had; "+
				"the casualty account does not close", s.Side, s.Casualties, s.StartBodies)
		}
		if s.Standing+s.Routed+s.Destroyed > s.StartUnits && s.StartUnits > 0 {
			return fmt.Errorf("battlefeed: side %s has %d standing, %d routed and %d destroyed, which is "+
				"more than the %d units it brought on", s.Side, s.Standing, s.Routed, s.Destroyed, s.StartUnits)
		}
		for _, chk := range []struct {
			name string
			v    float64
		}{
			{"casualties_share", s.CasualtiesShare},
			{"strength_share", s.StrengthShare},
			{"morale_start", s.MoraleStart},
			{"morale_end", s.MoraleEnd},
			{"strength_start", s.StrengthStart},
			{"strength_end", s.StrengthEnd},
			{"suppression_taken", s.SuppressionTaken},
		} {
			if chk.v < 0 || chk.v > 1.000001 {
				return fmt.Errorf("battlefeed: side %s has %s of %v; it is a 0-1 fraction",
					s.Side, chk.name, chk.v)
			}
		}
	}
	if f.Sides[0].Side == f.Sides[1].Side {
		return fmt.Errorf("battlefeed: both side blocks say %q; there is only one of each side",
			f.Sides[0].Side)
	}
	return nil
}

// validateFrames checks the frame block and its own accounting.
func validateFrames(f *Feed) error {
	fr := f.Frames
	if fr.Kept != len(fr.Ticks) {
		return fmt.Errorf("battlefeed: the frame block claims %d kept frames and carries %d; "+
			"a client would draw the wrong number of them", fr.Kept, len(fr.Ticks))
	}
	if fr.Dropped < 0 || fr.Total < 0 {
		return fmt.Errorf("battlefeed: the frame accounting is negative: %d of %d ticks",
			fr.Dropped, fr.Total)
	}
	if fr.Kept+fr.Dropped != fr.Total {
		return fmt.Errorf("battlefeed: the frame accounting does not close: %d kept and %d dropped is "+
			"not the %d ticks the battle ran", fr.Kept, fr.Dropped, fr.Total)
	}
	if fr.SampleEvery < 1 && fr.Kept > 0 {
		return fmt.Errorf("battlefeed: the frames are %d ticks apart, which is not a spacing; a client "+
			"interpolating between them would divide by it", fr.SampleEvery)
	}
	unitFrames := 0
	last := -1
	for i, t := range fr.Ticks {
		if t.Tick < 0 {
			return fmt.Errorf("battlefeed: frames[%d] is at tick %d; a tick is not negative", i, t.Tick)
		}
		if t.Tick <= last {
			return fmt.Errorf("battlefeed: frames[%d] is at tick %d, which does not follow tick %d; "+
				"the history must ascend", i, t.Tick, last)
		}
		last = t.Tick
		unitFrames += len(t.Units)
	}
	if unitFrames != fr.UnitFrames {
		return fmt.Errorf("battlefeed: the frame block claims %d unit records and carries %d",
			fr.UnitFrames, unitFrames)
	}
	return nil
}

// validateUnits checks the unit block: ascending unique ids, known sides, and
// positions a renderer can use.
func validateUnits(f *Feed) error {
	if f.UnitsTick >= 0 && len(f.Units) == 0 && f.Duration.Ticks > 0 {
		return fmt.Errorf("battlefeed: the battle ran %d ticks and published a field at tick %d, but the "+
			"unit block is empty; the client would draw an empty field",
			f.Duration.Ticks, f.UnitsTick)
	}
	last := -1
	for i, u := range f.Units {
		if u.ID <= last {
			return fmt.Errorf("battlefeed: units[%d] has id %d, which does not follow %d; unit ids are "+
				"assigned in ascending order and a client keys on them", i, u.ID, last)
		}
		last = u.ID
		if u.Side != "A" && u.Side != "B" {
			return fmt.Errorf("battlefeed: units[%d] (id %d) says it fights for %q; sides are \"A\" and \"B\"",
				i, u.ID, u.Side)
		}
		switch u.Status {
		case "fighting", "broken", "routed", "surrendered", "destroyed":
		default:
			return fmt.Errorf("battlefeed: units[%d] (id %d) is %q, which is not a state a unit can be in",
				i, u.ID, u.Status)
		}
		if u.Role != "melee" && u.Role != "ranged" {
			return fmt.Errorf("battlefeed: units[%d] (id %d) has role %q; it is armed as \"melee\" or \"ranged\"",
				i, u.ID, u.Role)
		}
		if !isFinite(u.X) || !isFinite(u.Y) {
			return fmt.Errorf("battlefeed: units[%d] (id %d) is at (%v, %v); a renderer cannot draw that",
				i, u.ID, u.X, u.Y)
		}
		for _, chk := range []struct {
			name string
			v    float64
		}{
			{"hp_frac", u.HPFrac},
			{"morale", u.Morale},
			{"ammo", u.Ammo},
			{"troops", u.Troops},
			{"suppression", u.Suppression},
			{"speed", u.Speed},
		} {
			if !isFinite(chk.v) {
				return fmt.Errorf("battlefeed: units[%d] (id %d) has %s of %v, which is not a number",
					i, u.ID, chk.name, chk.v)
			}
		}
		if u.HPFrac < 0 || u.HPFrac > 1.000001 {
			return fmt.Errorf("battlefeed: units[%d] (id %d) is at %v condition; it is a 0-1 fraction",
				i, u.ID, u.HPFrac)
		}
	}
	return nil
}
