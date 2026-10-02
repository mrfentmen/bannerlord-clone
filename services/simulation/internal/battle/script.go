package battle

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"

	"mbclone/simulation/internal/config"
)

// THE ORDER SCRIPT.
//
// An order log is what a battle produced. An order SCRIPT is what a person wrote
// before it happened. This file is the second thing, and it exists because the
// first one cannot be hand-authored: an order log is hundreds of rows of exact
// float64s under a digest, which is superb evidence and useless as a thing to type.
//
// The relationship between them is one-way and it is the whole point:
//
//	script  ->  log  ->  battle  ->  log (encoded)  ->  battle again
//
// A script expands into the same Order struct the recorder writes, so a
// hand-written battle and a recorded battle go through the identical apply path
// (battle.runCommanders) and produce a log that Replay accepts. That is why a
// scripted battle is a real replay test and not a simulation of one: the script
// does not get its own movement code, it gets the recorder's rows.
//
// # WHY A SCRIPT IS NOT THE ONLY WAY IN
//
// A script is an authoring convenience with a determinism cost: it has to be
// re-read and re-expanded to fight the battle, so a caller who holds a Recording
// should use Replay, which is one re-run and no parsing. The script earns its
// place for the three cases Replay cannot serve:
//
//   - a golden fixture, which has to be readable and reviewable in a diff;
//   - a hand-written tactical scenario ("unit 3 holds while the line advances"),
//     which by definition was never recorded;
//   - a bug report, where the reporter can paste a script rather than a
//     hundred-kilobyte log and have it reproduce.
//
// # WHAT A SCRIPT IS REFUSED FOR
//
// Every one of these returns an error rather than a battle, because a script that
// was quietly repaired would fight a battle nobody asked for and report the
// result as if it had:
//
//   - a version it does not know, rather than a guess at the layout;
//   - a step count that disagrees with the header, which is a truncated file;
//   - steps out of tick order, because the order of decisions is part of the
//     battle (the same rule Replayer enforces on a log);
//   - two steps for the same unit on the same tick, because the command channel
//     has one slot per unit and the second would silently overwrite the first;
//   - a step naming a unit the roster does not have;
//   - an order, intent, or formation name that is not one this build has.
//
// # THE UNIT IDS ARE POSITIONAL, AND A SCRIPT SAYS SO OUT LOUD
//
// Unit ids are assigned densely, side A in slice order then side B in slice
// order. A script's "unit": 3 therefore means the fourth unit of side A in a
// 10 v 10 and the fourth unit of the whole battle in a 4 v 8. Replay refuses a
// log whose roster does not fingerprint to the one its rows were written for
// (battle.rosterFingerprint), which is the check that catches a script paired
// with the wrong force. A script run twice with the same seed and roster is
// therefore safe by construction, and a script edited to change the roster under
// its own rows is refused rather than replayed onto different men.

// ScriptVersion is the format version of an encoded script. It is separate from
// OrderLogVersion because a script and a log are different documents: a log's
// layout is the engine's to change when its order struct changes, and a script's
// layout is a person's to rely on.
const ScriptVersion = 1

// ScriptKind is the value of a script's "kind" field. A script file and an order
// log file are both JSONL and both open with a header, so this is what tells a
// reader which one it is holding.
const ScriptKind = "battle_script"

// scriptFile is a script's header, as it sits on disk.
//
// It carries no steps. The steps are the lines after it, one object each, exactly
// as an order log's rows are. A header holding the whole step list would make
// every scripted battle one enormous line, and a diff of two such scripts would
// put the one step that changed somewhere in the middle of a wall of text.
type scriptFile struct {
	Kind    string       `json:"kind"`
	Version int          `json:"version"`
	Name    string       `json:"name"`
	Seed    uint64       `json:"seed"`
	A       scriptRoster `json:"a"`
	B       scriptRoster `json:"b"`
	// Steps is how many step lines follow. OrderLog does the same with its Rows
	// field, and for the same reason: a truncated write must read as a broken file
	// rather than as a short battle.
	Steps int `json:"steps"`
}

// scriptRoster is one side's force as a script describes it.
//
// The fields are the roster's, spelled the way a person types them (units,
// skill_bias), rather than Go's names. The roster IS how a force is described
// everywhere else in this package, so a script restating it under a second set of
// field names would be a second answer to "how big is this army" waiting to
// disagree with the first; Roster() below is the one place the two are translated.
type scriptRoster struct {
	// Units is how many units the side fields. Each stands for TroopsPerUnit bodies.
	Units int `json:"units"`
	// TroopsPerUnit is bodies per unit; zero means the balance file's
	// battle.roster_troops_per_unit.
	TroopsPerUnit float64 `json:"troops_per_unit,omitempty"`
	// SkillBias and MoraleBias shift the generated force on a 0-1 scale, so a
	// script can send a better or worse army than average without touching the
	// balance file.
	SkillBias  float64 `json:"skill_bias,omitempty"`
	MoraleBias float64 `json:"morale_bias,omitempty"`
	// NoRanged and AllRanged force a side to be all melee or all shooters.
	NoRanged  bool `json:"no_ranged,omitempty"`
	AllRanged bool `json:"all_ranged,omitempty"`
	// Label names this side in the battle report.
	Label string `json:"label,omitempty"`
	// Terrain names the ground. It belongs to the battle rather than the side, so
	// the two sides must agree; see scriptTerrain.
	Terrain string `json:"terrain,omitempty"`
}

// Roster returns the battle.Roster this side describes.
//
// It is a translation rather than an embedding on purpose: the script's field
// names are the file format's, and Roster is the engine's. Sharing one struct
// between the two would mean every field added to Roster became a script format
// change, which is a version bump this format would not otherwise need.
func (r scriptRoster) Roster() Roster {
	return Roster{
		Units:         r.Units,
		TroopsPerUnit: r.TroopsPerUnit,
		SkillBias:     r.SkillBias,
		MoraleBias:    r.MoraleBias,
		NoRanged:      r.NoRanged,
		AllRanged:     r.AllRanged,
	}
}

// scriptWithRoster builds a scriptRoster from a Roster, for a caller assembling a
// Script in Go rather than decoding one from a file.
//
// It is the inverse of Roster() and exists so that a script built in code and the
// same script decoded from disk carry identical fields, which is what makes
// TestScriptSurvivesEncodeAndDecode mean anything.
func scriptWithRoster(r Roster, label, terrain string) scriptRoster {
	return scriptRoster{
		Units:         r.Units,
		TroopsPerUnit: r.TroopsPerUnit,
		SkillBias:     r.SkillBias,
		MoraleBias:    r.MoraleBias,
		NoRanged:      r.NoRanged,
		AllRanged:     r.AllRanged,
		Label:         label,
		Terrain:       terrain,
	}
}

// scriptStep is one authored order.
//
// The optional fields are pointers rather than bare values so that the short form
// a person wants to type ("order":"hold") and the long form a generator wants to
// emit ("order":"hold","intent":"hold","dx":0,"dy":0) encode identically. Without
// that, a round trip through the encoder would turn an authored hold into a
// movement order of no metres, which the engine reads as silence about the unit's
// intent and a log records as a different kind of row.
type scriptStep struct {
	Tick      int      `json:"tick"`
	Unit      int      `json:"unit"`
	Order     string   `json:"order"`
	Intent    *string  `json:"intent,omitempty"`
	DX        *float64 `json:"dx,omitempty"`
	DY        *float64 `json:"dy,omitempty"`
	Formation *string  `json:"formation,omitempty"`
	Facing    *float64 `json:"facing,omitempty"`
	Note      string   `json:"note,omitempty"`
}

// Script is a decoded order script: everything needed to fight a battle, and
// nothing that depends on having fought one.
type Script struct {
	// Name identifies the script in test output and in a diff. It never reaches the
	// engine.
	Name string
	// Seed is the battle seed, which the script carries rather than takes as an
	// argument for the reason the order log header carries it: a script beside the
	// wrong seed is the easiest way to run a battle nobody asked for.
	Seed uint64
	// A and B are the two forces.
	A, B scriptRoster
	// Steps are the authored orders, decoded and defaulted.
	Steps []Order
}

// EncodeScript writes a script as JSONL: one header object carrying the seed and
// both rosters, then one object per step.
//
// Steps are written SORTED by tick, because a script's steps are a set of
// instructions about ticks rather than a sequence, and a person who added a step
// for tick 5 at the bottom of the file meant the same battle as one who added it
// at the top. Sorting on write makes those two files identical, so the determinism
// claim about scripts is the same claim as the one about logs: two encodings of the
// same battle are byte-identical.
//
// Within one tick the sort is stable on decode order, so a script ordering two
// units on the same tick keeps authoring order, which is the order the engine
// applies them in and therefore the order that matters.
func EncodeScript(s *Script) ([]byte, error) {
	if s == nil {
		return nil, newError(ErrUnitInvalid,
			"EncodeScript was handed no script; there is nothing to write, and an empty file "+
				"would decode as a battle nobody ordered against a roster nobody named")
	}
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)
	hb, err := json.Marshal(scriptFile{
		Kind:    ScriptKind,
		Version: ScriptVersion,
		Name:    s.Name,
		Seed:    s.Seed,
		A:       s.A,
		B:       s.B,
		Steps:   len(s.Steps),
	})
	if err != nil {
		return nil, fmt.Errorf("battle: encoding the script header failed: %w", err)
	}
	if _, err := w.Write(hb); err != nil {
		return nil, fmt.Errorf("battle: writing the script header failed: %w", err)
	}
	if err := w.WriteByte('\n'); err != nil {
		return nil, fmt.Errorf("battle: writing the script header failed: %w", err)
	}
	for _, st := range sortedSteps(s.Steps) {
		if _, err := w.WriteString(formatScriptStep(st)); err != nil {
			return nil, fmt.Errorf("battle: writing the order for tick %d failed: %w", st.Tick, err)
		}
		if err := w.WriteByte('\n'); err != nil {
			return nil, fmt.Errorf("battle: writing the order for tick %d failed: %w", st.Tick, err)
		}
	}
	if err := w.Flush(); err != nil {
		return nil, fmt.Errorf("battle: flushing the script failed: %w", err)
	}
	return buf.Bytes(), nil
}

// sortedSteps returns a copy of steps ordered by tick, stably.
//
// Stably, because the engine applies a tick's orders in channel order and the steps
// are the only place that order is decided; an unstable sort would let the two
// units ordered on one tick swap places between two runs of the same script, which
// is the exact class of bug this file exists to rule out.
func sortedSteps(steps []Order) []Order {
	out := make([]Order, len(steps))
	copy(out, steps)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Tick < out[j].Tick })
	return out
}

// formatScriptStep renders one step as a JSON object with a fixed key order.
//
// The float handling is formatOrderRow's, deliberately, including the reasoning:
// dx and dy are metres this unit is told to walk THIS tick, and a shorter spelling
// would be a different float64 and therefore a different battle. A script is read
// by people, so the fields are named rather than positional and the numbers are not
// abbreviated.
func formatScriptStep(o Order) string {
	var sb strings.Builder
	sb.Grow(160)
	sb.WriteString(`{"tick":`)
	sb.WriteString(fmt.Sprint(o.Tick))
	sb.WriteString(`,"unit":`)
	sb.WriteString(fmt.Sprint(o.Unit))
	sb.WriteString(`,"order":`)
	writeJSONString(&sb, o.Kind.String())
	sb.WriteString(`,"intent":`)
	writeJSONString(&sb, o.Intent.String())
	sb.WriteString(`,"dx":`)
	sb.WriteString(formatFloat(o.DX))
	sb.WriteString(`,"dy":`)
	sb.WriteString(formatFloat(o.DY))
	sb.WriteString(`,"formation":`)
	writeJSONString(&sb, formationNameForScript(o.Formation))
	sb.WriteString(`,"facing":`)
	sb.WriteString(formatFloat(o.Facing))
	sb.WriteString(`,"note":`)
	writeJSONString(&sb, o.Source)
	sb.WriteString(`}`)
	return sb.String()
}

// formationNameForScript names a shape, including the absence of one.
//
// FormationNone has to survive a round trip as an absence rather than as a shape
// called "none", so this returns the empty string for it and the decoder reads an
// empty name back as FormationNone. A zero Formation would mean FormationLine, and
// writing that would silently put every unit nobody ordered into a line, which is a
// shape doing something to a man who was never put in it.
func formationNameForScript(f Formation) string {
	if f == FormationNone || !f.Valid() {
		return ""
	}
	return f.String()
}

// DecodeScript reads a script written by EncodeScript.
//
// Like DecodeOrderLog it returns an error rather than a partial script for anything
// it can detect. A script that decoded with some steps missing would fight a battle
// with orders the author wrote and this reader dropped, and would report a result as
// though it were the one that was asked for.
func DecodeScript(data []byte) (*Script, error) {
	r := bufio.NewReader(bytes.NewReader(data))
	line, err := readLine(r)
	if err != nil {
		return nil, fmt.Errorf("battle: the order script is empty: %w", err)
	}
	var hdr scriptFile
	if err := json.Unmarshal(line, &hdr); err != nil {
		return nil, fmt.Errorf("battle: the order script header does not parse: %w", err)
	}
	if hdr.Kind != ScriptKind {
		return nil, fmt.Errorf("battle: this is a %q file, not an order script", hdr.Kind)
	}
	if hdr.Version != ScriptVersion {
		return nil, fmt.Errorf("battle: the order script is format version %d and this build reads "+
			"version %d; refusing to guess at a layout it was not written for", hdr.Version, ScriptVersion)
	}
	if err := hdr.A.validate("a"); err != nil {
		return nil, err
	}
	if err := hdr.B.validate("b"); err != nil {
		return nil, err
	}
	s := &Script{
		Name:  hdr.Name,
		Seed:  hdr.Seed,
		A:     hdr.A,
		B:     hdr.B,
		Steps: make([]Order, 0, hdr.Steps),
	}
	// The roster sizes are in the header, so a step naming a unit this script's own
	// roster does not have is caught here rather than three quarters of the way
	// through a battle.
	units := hdr.A.Units + hdr.B.Units
	lastTick := -1
	for i := 0; ; i++ {
		line, err := readLine(r)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("battle: reading step %d of script %q failed: %w", i, hdr.Name, err)
		}
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		var st scriptStep
		if err := json.Unmarshal(line, &st); err != nil {
			return nil, fmt.Errorf("battle: step %d of script %q does not parse: %w", i, hdr.Name, err)
		}
		o, err := st.toOrder()
		if err != nil {
			return nil, fmt.Errorf("battle: step %d of script %q: %w", i, hdr.Name, err)
		}
		if o.Tick < lastTick {
			return nil, fmt.Errorf("battle: step %d of script %q is for tick %d but the step before it "+
				"is for tick %d; a script's steps must be in non-decreasing tick order, because the "+
				"order of decisions is part of the battle", i, hdr.Name, o.Tick, lastTick)
		}
		if o.Unit < 0 || o.Unit >= units {
			return nil, fmt.Errorf("battle: step %d of script %q is for unit %d, and this script builds "+
				"%d units (%d for side A and %d for side B); unit ids are positional, so this order "+
				"would be applied to a different man than the author meant",
				i, hdr.Name, o.Unit, units, hdr.A.Units, hdr.B.Units)
		}
		// The side is DERIVED from the unit id rather than authored. Side is redundant
		// with Unit in a log row, and letting a script say "unit 3 is on side B" would
		// create a second source of truth for something the roster already decides.
		if o.Unit < hdr.A.Units {
			o.Side = SideA
		} else {
			o.Side = SideB
		}
		lastTick = o.Tick
		s.Steps = append(s.Steps, o)
	}
	if len(s.Steps) != hdr.Steps {
		return nil, fmt.Errorf("battle: the script header says %d steps and the file has %d; the file "+
			"is incomplete", hdr.Steps, len(s.Steps))
	}
	if err := checkNoDuplicateUnitTicks(s.Steps, hdr.Name); err != nil {
		return nil, err
	}
	return s, nil
}

// validate refuses a roster that cannot produce a battle.
func (r scriptRoster) validate(which string) error {
	if r.Units < 1 {
		return fmt.Errorf("battle: the order script gives side %s %d units; a battle needs two forces "+
			"and each needs at least one unit", which, r.Units)
	}
	if r.NoRanged && r.AllRanged {
		return fmt.Errorf("battle: the order script asks side %s for both no shooters and only "+
			"shooters; a side is one or the other", which)
	}
	return nil
}

// checkNoDuplicateUnitTicks refuses two orders for one unit on one tick.
func checkNoDuplicateUnitTicks(steps []Order, name string) error {
	seen := make(map[[2]int]bool, len(steps))
	for _, o := range steps {
		key := [2]int{o.Tick, o.Unit}
		if seen[key] {
			return fmt.Errorf("battle: script %q orders unit %d twice on tick %d; the command channel "+
				"has one slot per unit, so the second order would silently replace the first and the "+
				"battle fought would not be the battle written", name, o.Unit, o.Tick)
		}
		seen[key] = true
	}
	return nil
}

// toOrder turns one authored step into the Order the engine logs.
//
// The defaults are the engine's, not the decoder's invention: a move with no dx is a
// move of no metres, an order of "hold" writes zero movement with IntentHold, and a
// formation order with no shape is refused rather than being taken as a line. See
// OrderFormation for why a shape is its own order kind.
func (st scriptStep) toOrder() (Order, error) {
	if st.Tick < 0 {
		return Order{}, fmt.Errorf("tick %d is negative", st.Tick)
	}
	kind, err := parseScriptOrderKind(st.Order)
	if err != nil {
		return Order{}, err
	}
	o := Order{Tick: st.Tick, Unit: st.Unit, Kind: kind, Intent: IntentAdvance}
	if kind == OrderHold {
		o.Intent = IntentHold
	}
	if st.DX != nil {
		o.DX = *st.DX
	}
	if st.DY != nil {
		o.DY = *st.DY
	}
	if st.Intent != nil {
		i, err := parseScriptIntent(*st.Intent)
		if err != nil {
			return Order{}, fmt.Errorf("intent %q: %w", *st.Intent, err)
		}
		o.Intent = i
	}
	if st.Formation != nil && *st.Formation != "" {
		f, err := ParseFormation(*st.Formation)
		if err != nil {
			return Order{}, fmt.Errorf("formation %q: %w", *st.Formation, err)
		}
		o.Formation = f
	}
	if kind == OrderFormation && o.Formation == FormationNone {
		return Order{}, fmt.Errorf("a formation order with no shape is an instruction to stand in no " +
			"shape in particular, which is not an order; write a formation name, or write " +
			"\"order\":\"hold\" to tell the unit to stand still")
	}
	if kind != OrderFormation && o.Formation != FormationNone {
		return Order{}, fmt.Errorf("a %s order cannot carry the shape %q; a formation is its own order "+
			"kind because a man standing in his slot is in the shape without being told to walk",
			kind.String(), o.Formation.String())
	}
	if st.Facing != nil {
		o.Facing = *st.Facing
	}
	if !isFinite(o.DX) || !isFinite(o.DY) || !isFinite(o.Facing) {
		return Order{}, fmt.Errorf("dx, dy, and facing must be finite; a step of %v metres is a typo, and "+
			"a NaN that reaches the log becomes a row no reader can make sense of", o.DX)
	}
	o.Source = st.Note
	return o, nil
}

// parseScriptOrderKind reads an order kind, and refuses an unknown one by name.
func parseScriptOrderKind(s string) (OrderKind, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "move":
		return OrderMove, nil
	case "hold":
		return OrderHold, nil
	case "formation":
		return OrderFormation, nil
	case "":
		return 0, fmt.Errorf("no order kind; every step needs one of \"move\", \"hold\", or \"formation\"")
	default:
		return 0, fmt.Errorf("%q is not an order kind; the kinds are \"move\", \"hold\", and "+
			"\"formation\"", s)
	}
}

// parseScriptIntent reads an intent, and refuses an unknown one by name.
//
// The order log's lenient reader maps an unknown intent to a sentinel instead,
// because a log is machine-written and a bad row should fail the digest rather than
// the parse. A script is hand-written, so the error names the good values: an author
// who typed "advnce" wants to be told, not to have their battle fought with a unit
// nobody ordered.
func parseScriptIntent(s string) (Intent, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "advance":
		return IntentAdvance, nil
	case "engage":
		return IntentEngage, nil
	case "withdraw":
		return IntentWithdraw, nil
	case "rout":
		return IntentRout, nil
	case "hold":
		return IntentHold, nil
	default:
		return 0, fmt.Errorf("not one of \"advance\", \"engage\", \"withdraw\", \"rout\", or \"hold\"")
	}
}

// Setup builds the battle's forces from the script's seed and rosters.
//
// This is the step that makes a script self-contained: the seed rebuilds both forces
// through GenerateForce, the same generator Run's own tests use, so a script plus a
// balance file describes a battle and nothing else is needed. A script carrying
// literal unit stats would be a different document that happened to share a key
// order, and it would need its own format version the moment a unit gained a field.
func (s *Script) Setup(cfg *config.Config) (Setup, error) {
	if cfg == nil {
		return Setup{}, newError(ErrNilConfig,
			"an order script needs a balance config to build its forces from; this package holds no "+
				"constants of its own, because CONSTITUTION.md section 1.2 makes the balance file the "+
				"only source of them")
	}
	// The rosters are validated here as well as in DecodeScript. A caller who builds
	// a Script in Go never goes through the decoder, and a script that says a side is
	// both all melee and all shooters has to be refused wherever it came from: the
	// decoder's check is not a property of the format, it is a property of the battle.
	if err := s.A.validate("a"); err != nil {
		return Setup{}, err
	}
	if err := s.B.validate("b"); err != nil {
		return Setup{}, err
	}
	a, err := GenerateForce(cfg, s.Seed, SideA, s.A.Roster())
	if err != nil {
		return Setup{}, err
	}
	b, err := GenerateForce(cfg, s.Seed, SideB, s.B.Roster())
	if err != nil {
		return Setup{}, err
	}
	terrain, err := scriptTerrain(s)
	if err != nil {
		return Setup{}, err
	}
	// The influence asked of GenerateLeaders is the balance file's own reference
	// value, so a leader generated from a script steadies his men exactly as hard as
	// the engine says a reference-strength leader does. It is read from the config
	// rather than written as 260 here because CONSTITUTION.md section 1.2 makes the
	// balance file the only source of a constant, and a 260 written into this function
	// would silently disagree with battle.morale_leader_influence_reference the day
	// somebody tunes it.
	influence := cfg.Battle.MoraleLeaderInfluenceReference
	setup := Setup{
		A:       a,
		B:       b,
		Leaders: GenerateLeaders(cfg, s.Seed, SideA, LeaderCount(cfg, s.A.Units), influence),
		Terrain: terrain,
		Label:   s.label(),
	}
	setup.Leaders = append(setup.Leaders,
		GenerateLeaders(cfg, s.Seed, SideB, LeaderCount(cfg, s.B.Units), influence)...)
	return setup, nil
}

// scriptTerrain reads the terrain a script asks for.
//
// Terrain belongs to the battle and not to a side, so a script naming it in only one
// of its two rosters is refused rather than having one side's answer win by default.
// Only TerrainOpen is modelled (battle.go), so every other name is an error naming the
// one that exists rather than a silent downgrade to open ground, which would be a
// battle fought on different ground than the one asked for.
func scriptTerrain(s *Script) (Terrain, error) {
	a := strings.ToLower(strings.TrimSpace(s.A.Terrain))
	b := strings.ToLower(strings.TrimSpace(s.B.Terrain))
	// Each side's name is checked against the engine's own list BEFORE the two are
	// compared, because "forest is not ground this engine models" is the useful
	// answer and "the two sides disagree" is not: a script that asks for forest on
	// both sides is wrong for exactly one reason, and naming it tells the author
	// what to write instead.
	for _, side := range []struct {
		which string
		name  string
	}{{"A", a}, {"B", b}} {
		if !isModelledTerrain(side.name) {
			return 0, newError(ErrTerrainUnsupported,
				fmt.Sprintf("side %s asks for %q ground, and the only terrain this engine models is "+
					"\"open\"; the others COMBAT.md section 8 describes are not implemented yet",
					side.which, side.name))
		}
	}
	if a != "" && b != "" && a != b {
		return 0, newError(ErrTerrainUnsupported,
			fmt.Sprintf("the order script %q asks for %q ground for side A and %q for side B; terrain is a "+
				"property of the battle, so both sides have to be on the same ground",
				s.Name, s.A.Terrain, s.B.Terrain))
	}
	name := a
	if name == "" {
		name = b
	}
	return TerrainOpen, nil
}

// isModelledTerrain reports whether this engine has ground by that name.
//
// Empty counts as modelled, because omitting the field is how a script says "the
// default", and the default is open ground.
func isModelledTerrain(name string) bool {
	switch name {
	case "", "open", "open-field", "level":
		return true
	default:
		return false
	}
}

// label is the battle's label, from either side's label or the script's name.
//
// A side's label is a convenience for the two-sided case where the sides are worth
// distinguishing in the report ("the Company against the Host"), and falling back to
// the script's name means a battle reported from a script always says which script it
// came from.
func (s *Script) label() string {
	if s.A.Label != "" && s.B.Label != "" {
		return s.A.Label + " against " + s.B.Label
	}
	if s.Name != "" {
		return s.Name
	}
	return s.A.Label
}

// NewScript builds an order script in Go rather than decoding one from a file.
//
// It exists because a caller cannot otherwise write one: Script's roster fields
// are scriptRoster, which is unexported because it is a file format's spelling of
// a Roster rather than the engine's. Without this, a script could only ever come
// out of a decoder, so every caller who wanted a battle of their own choosing had
// to build a script string first and hand it back to itself.
//
// name is the script's name, which is where the battle's label comes from when
// neither side carries one (see label). It is free text and never parsed.
func NewScript(name string, seed uint64, a, b Roster) *Script {
	return &Script{
		Name: name,
		Seed: seed,
		A:    scriptWithRoster(a, "", ""),
		B:    scriptWithRoster(b, "", ""),
	}
}

// Roster returns the battle.Roster each side of the script describes.
//
// The engine's spelling of what DecodeScript read, for a caller that decoded a
// script and then needs to hand the same rosters to something that takes
// Roster. It is the inverse of the translation in NewScript.
func (s *Script) Rosters() (a, b Roster) { return s.A.Roster(), s.B.Roster() }

// RunScript fights the battle a script describes and records it.
//
// It goes through Record, not through RunCommanded with a bespoke commander, and that
// is the property worth stating: the script's steps are handed to a scriptCommander,
// which writes them into the same View.Commands channel any commander writes into, and
// the Recorder wraps THAT. So a scripted battle is recorded on exactly the terms a
// played battle is, and the Recording it returns replays through battle.Replay like
// any other. A script with its own movement path would prove nothing about replay;
// this one proves it every time it runs.
//
// The returned Recording carries the Setup, so a caller holding it needs nothing else
// to verify it with battle.Verify.
func RunScript(cfg *config.Config, s *Script, bound int) (*Result, *Recording, error) {
	if s == nil {
		return nil, nil, newError(ErrUnitInvalid,
			"RunScript was handed no script; there is no battle to fight, and an empty Result would "+
				"describe a fight nobody had")
	}
	setup, err := s.Setup(cfg)
	if err != nil {
		return nil, nil, err
	}
	if len(s.Steps) == 0 {
		// An empty script is a real thing: a battle nobody ordered, fought under the
		// engine's own rules, whose honest record is an empty log. It is the mode
		// TestReplayFromEmptyLogIsTheWholeProofOfRederivedAI proves, so it is served
		// rather than refused.
		return Record(cfg, s.Seed, setup, nil, bound, ScriptKind)
	}
	cmd, err := newScriptCommander(s)
	if err != nil {
		return nil, nil, err
	}
	return Record(cfg, s.Seed, setup, cmd, bound, ScriptKind)
}

// scriptCommander is the Commander a script's steps are played through.
//
// It holds the steps sorted by tick and a cursor, and writes into the command channel
// on the tick each step names. That is deliberately all it does: it is a Replayer
// with a script as its source rather than a log, and the whole reason a scripted
// battle is a valid replay test is that this type adds no behaviour of its own to the
// path.
//
// It reads nothing from the View except the tick, and it draws nothing. A commander
// that read the field would produce orders that depend on the state it is being run
// against, which is a second AI wearing a script's clothes.
type scriptCommander struct {
	steps  []Order
	cursor int
	// issued counts steps actually written to the channel, which is how a script whose
	// battle ended early says so.
	issued int
}

func newScriptCommander(s *Script) (*scriptCommander, error) {
	if err := checkNoDuplicateUnitTicks(s.Steps, s.Name); err != nil {
		return nil, err
	}
	return &scriptCommander{steps: sortedSteps(s.Steps)}, nil
}

// Command implements Commander.
func (c *scriptCommander) Command(v *View) error {
	for c.cursor < len(c.steps) {
		o := c.steps[c.cursor]
		if o.Tick > v.Tick {
			return nil
		}
		if o.Tick < v.Tick {
			return fmt.Errorf("the order for tick %d was never issued: the battle is on tick %d. A "+
				"script's steps must be in non-decreasing tick order, and this one is not", o.Tick, v.Tick)
		}
		if o.Unit >= len(v.Units) {
			return fmt.Errorf("unit %d does not exist in a battle of %d units; the script and the "+
				"roster are describing different battles", o.Unit, len(v.Units))
		}
		if v.Units[o.Unit].ID != o.Unit {
			return fmt.Errorf("the order is for unit %d but the unit in that slot is %d; ids must line "+
				"up with the roster", o.Unit, v.Units[o.Unit].ID)
		}
		v.Commands[o.Unit] = UnitCommand{
			// The same mapping Replayer uses: a formation row carries a shape and no
			// movement. See OrderFormation.
			Set:          o.Kind != OrderFormation,
			DX:           o.DX,
			DY:           o.DY,
			Intent:       o.Intent,
			Formation:    o.Formation,
			Facing:       o.Facing,
			FormationSet: o.Formation.Valid(),
		}
		c.cursor++
		c.issued++
	}
	return nil
}

// Issued is how many of the script's steps reached the field.
//
// It is not returned by RunScript because a script whose battle ended before its last
// step is not an error: the engine's own ending rules are the authority on when a
// battle stops, and a script that ordered something for tick 900 of a fight that
// ended at 400 has written orders for a fight that did not happen. Nothing is dropped
// silently either: the log holds what was actually ordered, and a caller who cares
// compares len(rec.Log.Rows()) with the script's step count.
func (c *scriptCommander) Issued() int { return c.issued }

// Unissued is how many of the script's steps the battle never reached.
func (c *scriptCommander) Unissued() int { return len(c.steps) - c.cursor }
