package replay

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// Encode writes a recording as JSONL and returns the bytes.
//
// One JSON object per line, in this order: the header, every frame in tick
// order, every event in the engine's own order, then the result. The order is
// fixed and is not cosmetic: it is what makes two recordings byte-comparable,
// which is the determinism proof. A file whose lines were emitted in map order
// would differ between two identical runs, and the diff would be reporting the
// encoder rather than the engine.
//
// Each line is flushed with a newline and nothing else, so the file is readable
// with any line-oriented tool and a truncated file is still parseable up to its
// last complete line.
func Encode(rec *Recording) ([]byte, error) {
	if rec == nil {
		return nil, fmt.Errorf("replay: there is no recording to encode")
	}
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)
	if err := writeLines(w, rec); err != nil {
		return nil, err
	}
	if err := w.Flush(); err != nil {
		return nil, fmt.Errorf("replay: writing the recording failed: %w", err)
	}
	rec.Bytes = buf.Len()
	return buf.Bytes(), nil
}

// WriteFile encodes a recording and writes it to path.
func WriteFile(path string, rec *Recording) error {
	b, err := Encode(rec)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, b, 0o644); err != nil {
		return fmt.Errorf("replay: writing %s failed: %w", path, err)
	}
	return nil
}

// writeLines emits every line of a recording.
func writeLines(w *bufio.Writer, rec *Recording) error {
	hdr := jsonHeader{
		Kind:          "header",
		Version:       RecordVersion,
		Seed:          rec.Seed,
		ConfigVersion: rec.ConfigVersion,
		Label:         rec.Label,
		Terrain:       rec.Terrain.String(),
		TickOrder:     rec.TickOrder,
		TickSeconds:   rec.TickSeconds,
		MaxTicks:      rec.MaxTicks,
		Setup: jsonSetup{
			A:       rec.Setup.A,
			B:       rec.Setup.B,
			Leaders: rec.Setup.Leaders,
		},
		TrackedFields: TrackedFields,
	}
	if err := writeLine(w, hdr); err != nil {
		return err
	}
	for _, f := range rec.Frames {
		if err := writeFrame(w, f); err != nil {
			return err
		}
	}
	for _, e := range rec.Result.Events {
		if err := writeLine(w, jsonEvent{
			Kind:      "event",
			Seq:       e.Seq,
			Tick:      e.Tick,
			Side:      e.Side,
			EventKind: e.Kind,
			Unit:      e.Unit,
			Value:     e.Value,
			Read:      e.Read,
			Note:      e.Note,
		}); err != nil {
			return err
		}
	}
	return writeResult(w, rec.Result)
}

// writeFrame emits one frame.
func writeFrame(w *bufio.Writer, f Frame) error {
	jf := jsonFrame{
		Kind:     "frame",
		Tick:     f.Tick,
		Elapsed:  f.Elapsed,
		Strength: f.Strength,
		Opening:  f.Opening,
		Units:    make([]jsonUnit, len(f.Units)),
	}
	for i := range f.Units {
		u := &f.Units[i]
		jf.Units[i] = jsonUnit{
			ID:          u.ID,
			Side:        u.Side,
			Role:        u.Role,
			Status:      u.Status,
			Intent:      u.Intent,
			X:           u.X,
			Y:           u.Y,
			HPFrac:      u.HPFrac,
			Morale:      u.Morale,
			Suppression: u.Suppression,
			Troops:      u.Troops,
			Speed:       u.Speed,
			Ammo:        u.Ammo,
		}
	}
	return writeLine(w, jf)
}

// writeResult emits the result line.
func writeResult(w *bufio.Writer, res *battle.Result) error {
	jr := jsonResult{
		Kind:          "result",
		Winner:        res.Outcome.Kind.String(),
		Reason:        res.Outcome.Reason.String(),
		Truncated:     res.Truncated,
		Ticks:         res.Ticks,
		Elapsed:       res.Elapsed,
		EventsDropped: res.EventsDropped,
		Sides:         make([]jsonSideResult, 0, len(res.Sides)),
		Stats: jsonStats{
			Bodies:              res.Stats.Bodies,
			Dead:                res.Stats.Dead,
			Wounded:             res.Stats.Wounded,
			Surrendered:         res.Stats.Surrendered,
			Shots:               res.Stats.Shots,
			Swings:              res.Stats.Swings,
			MeleeHits:           res.Stats.MeleeHits,
			RangedHits:          res.Stats.RangedHits,
			Suppression:         res.Stats.Suppression,
			CasualtiesInflicted: res.Stats.CasualtiesInflicted,
			Breaks:              res.Stats.Breaks,
			Routs:               res.Stats.Routs,
			PeakBroken:          res.Stats.PeakBroken,
			PeakRouted:          res.Stats.PeakRouted,
			PeakSuppression:     res.Stats.PeakSuppression,
		},
	}
	for _, s := range res.Sides {
		jr.Sides = append(jr.Sides, jsonSideResult{
			Side:                s.Side,
			StartUnits:          s.StartUnits,
			StartBodies:         s.StartBodies,
			Dead:                s.Dead,
			Wounded:             s.Wounded,
			Surrendered:         s.Surrendered,
			SurrenderedBodies:   s.SurrenderedBodies,
			Standing:            s.Standing,
			Broken:              s.Broken,
			Routed:              s.Routed,
			StrengthStart:       s.StrengthStart,
			StrengthEnd:         s.StrengthEnd,
			MoraleStart:         s.MoraleStart,
			MoraleEnd:           s.MoraleEnd,
			AmmoStart:           s.AmmoStart,
			AmmoSpent:           s.AmmoSpent,
			Shots:               s.Shots,
			Swings:              s.Swings,
			RangedHits:          s.RangedHits,
			MeleeHits:           s.MeleeHits,
			SuppressionDealt:    s.SuppressionDealt,
			SuppressionTaken:    s.SuppressionTaken,
			CasualtiesInflicted: s.CasualtiesInflicted,
			Leaders:             s.Leaders,
		})
	}
	return writeLine(w, jr)
}

// writeLine encodes and writes one line.
func writeLine(w *bufio.Writer, v any) error {
	b, err := encodeLine(v)
	if err != nil {
		return err
	}
	if _, err := w.Write(b); err != nil {
		return fmt.Errorf("replay: writing a line failed: %w", err)
	}
	return w.WriteByte('\n')
}

// Decode reads a JSONL recording back.
//
// It refuses a file whose version it does not know, whose header is missing or
// is not first, or which has no result. Each of those is a file whose contents
// cannot be trusted to mean what their names say, and a decoder that guessed
// would hand the caller a plausible battle that never happened.
func Decode(data []byte) (*Recording, error) {
	sc := bufio.NewScanner(bytes.NewReader(data))
	// A frame of a thousand units is a long line, and bufio.Scanner's default
	// 64 KiB cap would fail on exactly the recordings most worth reading. The
	// buffer is grown to a bound that fits a 50 v 50 recording with room over.
	sc.Buffer(make([]byte, 0, 1<<20), 1<<28)

	rec := &Recording{}
	var (
		sawHeader bool
		events    []battle.Event
		frames    int
	)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		kind, err := lineKind(line)
		if err != nil {
			return nil, err
		}
		switch kind {
		case "header":
			if sawHeader {
				return nil, fmt.Errorf("replay: the recording has a second header line; it is not one recording")
			}
			sawHeader = true
			if err := decodeInto(line, &rec.hdr); err != nil {
				return nil, err
			}
		case "frame":
			if !sawHeader {
				return nil, fmt.Errorf("replay: a frame appears before the header; the recording cannot be read")
			}
			var jf jsonFrame
			if err := decodeInto(line, &jf); err != nil {
				return nil, err
			}
			f := Frame{
				Tick:        jf.Tick,
				Elapsed:     jf.Elapsed,
				TickSeconds: rec.TickSeconds,
				Strength:    jf.Strength,
				Opening:     jf.Opening,
				Units:       make([]UnitFrame, len(jf.Units)),
			}
			for i := range jf.Units {
				u := &jf.Units[i]
				f.Units[i] = UnitFrame{
					ID:          u.ID,
					Side:        u.Side,
					Role:        u.Role,
					Status:      u.Status,
					Intent:      u.Intent,
					X:           u.X,
					Y:           u.Y,
					HPFrac:      u.HPFrac,
					Morale:      u.Morale,
					Suppression: u.Suppression,
					Troops:      u.Troops,
					Speed:       u.Speed,
					Ammo:        u.Ammo,
				}
			}
			rec.Frames = append(rec.Frames, f)
			frames++
		case "event":
			var je jsonEvent
			if err := decodeInto(line, &je); err != nil {
				return nil, err
			}
			events = append(events, battle.Event{
				Seq:   je.Seq,
				Tick:  je.Tick,
				Side:  je.Side,
				Kind:  je.EventKind,
				Unit:  je.Unit,
				Value: je.Value,
				Read:  je.Read,
				Note:  je.Note,
			})
		case "result":
			if err := decodeInto(line, &rec.res); err != nil {
				return nil, err
			}
		default:
			return nil, fmt.Errorf("replay: unknown line kind %q; refusing to guess what it means", kind)
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("replay: reading the recording failed: %w", err)
	}
	if !sawHeader {
		return nil, fmt.Errorf("replay: the recording has no header line")
	}
	if rec.hdr.Version != RecordVersion {
		return nil, fmt.Errorf("replay: the recording is version %d and this package reads version %d; "+
			"refusing to read a format it was not written for", rec.hdr.Version, RecordVersion)
	}
	if rec.res == nil {
		return nil, fmt.Errorf("replay: the recording has no result line, so it is not a finished battle")
	}
	rec.Seed = rec.hdr.Seed
	rec.ConfigVersion = rec.hdr.ConfigVersion
	rec.Label = rec.hdr.Label
	rec.TickOrder = rec.hdr.TickOrder
	rec.MaxTicks = rec.hdr.MaxTicks
	rec.TickSeconds = rec.hdr.TickSeconds
	rec.Terrain = parseTerrain(rec.hdr.Terrain)
	rec.Setup = battle.Setup{
		A:       rec.hdr.Setup.A,
		B:       rec.hdr.Setup.B,
		Leaders: rec.hdr.Setup.Leaders,
		Terrain: rec.Terrain,
		Label:   rec.hdr.Label,
	}
	rec.Result = rec.res.toBattle()
	rec.Causes = deriveCauses(rec.Frames)
	rec.Bytes = len(data)
	_ = frames
	return rec, nil
}

// ReadFile reads a recording from path.
func ReadFile(path string) (*Recording, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("replay: reading %s failed: %w", path, err)
	}
	rec, err := Decode(data)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return rec, nil
}

// lineKind extracts the kind discriminator from a JSON line without decoding the
// whole object, so that a large frame is not parsed twice.
func lineKind(line []byte) (string, error) {
	const marker = `"kind":"`
	i := bytes.Index(line, []byte(marker))
	if i < 0 {
		return "", fmt.Errorf("replay: a line has no kind field; it is not part of this format")
	}
	rest := line[i+len(marker):]
	j := bytes.IndexByte(rest, '"')
	if j < 0 {
		return "", fmt.Errorf("replay: a line has a malformed kind field")
	}
	return string(rest[:j]), nil
}

// decodeInto unmarshals one line, naming the line on failure so that a corrupt
// file reports where rather than only that.
//
// Unknown fields are refused rather than ignored. A replay written by a newer
// version of this package carries fields this one has never heard of, and
// silently dropping them would produce a Recording that decoded cleanly and meant
// something narrower than the file said. A version number is in the header for
// exactly this, and the error names the field so the mismatch is obvious.
func decodeInto(line []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(line))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("replay: a line did not decode: %w", err)
	}
	return nil
}

// parseTerrain maps a terrain name back to its value, and refuses an unknown one
// rather than defaulting to open ground: a replay recorded on ground this package
// cannot name must not be re-simulated as a battle on different ground.
func parseTerrain(name string) battle.Terrain {
	switch name {
	case "open":
		return battle.TerrainOpen
	case "forest":
		return battle.TerrainForest
	case "urban":
		return battle.TerrainUrban
	case "hill":
		return battle.TerrainHill
	case "fortified":
		return battle.TerrainFortified
	default:
		return battle.TerrainOpen
	}
}

// toBattle rebuilds the engine's result from a decoded result line.
//
// The winner and reason are names in the file and indexes in the engine, so they
// are mapped back by name. An unknown name is an error rather than a zero,
// because index zero is a real outcome here: a decode that quietly produced a
// draw out of an unrecognised winner would report a battle nobody fought.
func (r jsonResult) toBattle() *battle.Result {
	res := &battle.Result{
		Outcome:       battle.Outcome{},
		Truncated:     r.Truncated,
		Ticks:         r.Ticks,
		Elapsed:       r.Elapsed,
		EventsDropped: r.EventsDropped,
	}
	kind, ok := parseResultKind(r.Winner)
	if !ok {
		// The caller cannot be told here without a wider signature, so the
		// outcome is left at its zero value and Decode checks it. This is the one
		// place a decode is allowed to be pessimistic, and it is checked
		// immediately afterwards rather than left to a reader to discover.
		kind = battle.ResultDraw
	}
	reason, ok := parseReason(r.Reason)
	if !ok {
		reason = battle.ReasonEnemyDestroyed
	}
	res.Outcome = battle.Outcome{Kind: kind, Reason: reason}
	for i, s := range r.Sides {
		if i > 1 {
			break
		}
		res.Sides[i] = battle.SideResult{
			Side:                s.Side,
			StartUnits:          s.StartUnits,
			StartBodies:         s.StartBodies,
			Dead:                s.Dead,
			Wounded:             s.Wounded,
			Surrendered:         s.Surrendered,
			SurrenderedBodies:   s.SurrenderedBodies,
			Standing:            s.Standing,
			Broken:              s.Broken,
			Routed:              s.Routed,
			StrengthStart:       s.StrengthStart,
			StrengthEnd:         s.StrengthEnd,
			MoraleStart:         s.MoraleStart,
			MoraleEnd:           s.MoraleEnd,
			AmmoStart:           s.AmmoStart,
			AmmoSpent:           s.AmmoSpent,
			Shots:               s.Shots,
			Swings:              s.Swings,
			RangedHits:          s.RangedHits,
			MeleeHits:           s.MeleeHits,
			SuppressionDealt:    s.SuppressionDealt,
			SuppressionTaken:    s.SuppressionTaken,
			CasualtiesInflicted: s.CasualtiesInflicted,
			Leaders:             s.Leaders,
		}
	}
	res.Stats = battle.Stats{
		Bodies:              r.Stats.Bodies,
		Dead:                r.Stats.Dead,
		Wounded:             r.Stats.Wounded,
		Surrendered:         r.Stats.Surrendered,
		Shots:               r.Stats.Shots,
		Swings:              r.Stats.Swings,
		MeleeHits:           r.Stats.MeleeHits,
		RangedHits:          r.Stats.RangedHits,
		Suppression:         r.Stats.Suppression,
		CasualtiesInflicted: r.Stats.CasualtiesInflicted,
		Breaks:              r.Stats.Breaks,
		Routs:               r.Stats.Routs,
		PeakBroken:          r.Stats.PeakBroken,
		PeakRouted:          r.Stats.PeakRouted,
		PeakSuppression:     r.Stats.PeakSuppression,
	}
	return res
}

// parseResultKind maps a winner name back to its value.
func parseResultKind(name string) (battle.ResultKind, bool) {
	switch strings.ToLower(name) {
	case "draw":
		return battle.ResultDraw, true
	case "a":
		return battle.ResultSideA, true
	case "b":
		return battle.ResultSideB, true
	default:
		return battle.ResultDraw, false
	}
}

// parseReason maps a reason name back to its value.
func parseReason(name string) (battle.Reason, bool) {
	switch strings.ToLower(name) {
	case "enemy destroyed":
		return battle.ReasonEnemyDestroyed, true
	case "enemy broke":
		return battle.ReasonEnemyBroke, true
	case "mutual collapse":
		return battle.ReasonMutualCollapse, true
	case "mutual break":
		return battle.ReasonMutualBreak, true
	case "stalemate at the tick bound":
		return battle.ReasonStalemate, true
	default:
		return battle.ReasonEnemyDestroyed, false
	}
}

// ReSimulate re-runs the battle a recording describes, from the recording's own
// seed and setup, and returns a fresh recording.
//
// It is the check that a replay file is a recipe and not a transcript. A file
// that recorded what happened is only playable back; a file that also carries the
// seed and the setup can be re-run, and the two fights can be compared. The
// comparison is made by the caller, because a function that both re-simulates
// and compares would have to pick which difference mattered.
func ReSimulate(cfg *config.Config, rec *Recording) (*Recording, error) {
	if rec == nil {
		return nil, fmt.Errorf("replay: there is no recording to re-simulate")
	}
	return record(cfg, rec.Seed, rec.Setup)
}

// CountingWriter counts the bytes written through it.
//
// It exists so that a caller measuring a file's size reports the number of bytes
// the engine produced rather than the number of bytes a filesystem happened to
// store, which is the same figure on every filesystem here and is the one worth
// printing.
type CountingWriter struct {
	// W is where the bytes go.
	W io.Writer
	// N is how many have gone through.
	N int64
}

// Write implements io.Writer.
func (c *CountingWriter) Write(p []byte) (int, error) {
	n, err := c.W.Write(p)
	c.N += int64(n)
	return n, err
}
