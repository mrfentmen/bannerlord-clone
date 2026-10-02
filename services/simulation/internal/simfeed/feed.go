// Package simfeed loads the world-data settlement feed into the simulation.
//
// The feed is the handoff from the Phase 0 data pipeline to this service: real
// settlements, already shaped as worldgen.Settlement, with the provenance of
// each figure recorded by the pipeline. This package is the only place that
// reads it, so the format is parsed once and every run gets the same reading of
// the same bytes.
//
// CONSTITUTION.md section 1.3 treats anything read from outside the process as
// untrusted: this loader validates every settlement against what the generator
// actually requires and reports every problem it finds, rather than passing a
// bad number through and letting a balance constant be blamed for it later.
package simfeed

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/worldgen"
)

// DefaultPath is the shipped snapshot of the feed, relative to the service
// directory that simrun runs from.
const DefaultPath = "data/sim-feed/settlements.json"

// Feed is one loaded settlement feed.
type Feed struct {
	// Source, Licence, Retrieved, Region and Projection are the provenance
	// block the pipeline writes beside the settlements. They are carried
	// through rather than dropped so a run report can state where its map came
	// from instead of implying the generator made it.
	Source     string
	Licence    string
	Retrieved  string
	Region     string
	Projection string
	// Settlements are the places to build the world from, in feed order.
	Settlements []worldgen.Settlement
}

// file is the on-disk shape. The settlements live under a key rather than at
// the top level because the feed carries its provenance beside them.
type file struct {
	Source      string                `json:"source"`
	Licence     string                `json:"licence"`
	Retrieved   string                `json:"retrieved"`
	Region      string                `json:"region"`
	Projection  string                `json:"projection"`
	Settlements []worldgen.Settlement `json:"settlements"`
}

// Load reads and validates a feed from path.
func Load(path string) (*Feed, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		// The recovery is in the message: without a feed the generator
		// synthesises a map, which still runs but is not the real one.
		return nil, fmt.Errorf("reading settlement feed %s: %w\n"+
			"  the run needs this file; regenerate it with `git show worker/mute/sim-feed:"+
			"services/world-data/exports/sim-feed/settlements.json > %s`", path, err, path)
	}

	var f file
	dec := json.NewDecoder(bytes.NewReader(raw))
	// Go matches JSON keys to struct fields case-insensitively, which is what
	// lets the pipeline emit bare Go field names with no tags on its side.
	//
	// Unknown keys are refused rather than ignored. The contract here is that a
	// settlement IS a worldgen.Settlement, so a feed that starts carrying a field
	// this sim does not know about is a contract change; ignoring it would drop
	// that data on the floor and produce a run whose settlements are quietly not
	// the ones on disk. The cost is that the pipeline cannot add a field ahead of
	// the sim reading it, which is the correct direction for that failure to go.
	dec.DisallowUnknownFields()
	if err := dec.Decode(&f); err != nil {
		return nil, fmt.Errorf("parsing settlement feed %s: %w", path, err)
	}

	if len(f.Settlements) == 0 {
		return nil, fmt.Errorf("settlement feed %s has no settlements under \"settlements\"; "+
			"a run with none of them would silently fall back to a synthesised map", path)
	}

	if err := Validate(f.Settlements); err != nil {
		return nil, fmt.Errorf("settlement feed %s is not usable: %w", path, err)
	}

	return &Feed{
		Source:      f.Source,
		Licence:     f.Licence,
		Retrieved:   f.Retrieved,
		Region:      f.Region,
		Projection:  f.Projection,
		Settlements: f.Settlements,
	}, nil
}

// LoadDefault reads the shipped snapshot, wherever it is run from.
func LoadDefault() (*Feed, error) { return Load(ResolvePath("")) }

// sideCount is how many sides the generator builds. Read from worldgen rather
// than written as 6 here, so the feed's SideID range is checked against the
// same definition the generator assigns towns to.
var sideCount = len(worldgen.Sides())

// maxReported bounds how many problems one error lists. A feed with a systemic
// fault can produce hundreds, and a wall of them buries the shape of the fault
// rather than conveying it.
const maxReported = 10

// Validate checks a feed against what the generator requires of a settlement.
//
// A settlement is rejected rather than repaired. CONSTITUTION.md section 1.1
// says a wrong value is fixed at import and never patched over inside game
// logic; silently clamping an imported population or inventing a missing name
// would put a fabricated number into a balance run with a real-looking
// provenance, which is the specific thing that rule exists to prevent.
func Validate(s []worldgen.Settlement) error {
	var problems []string
	for i, x := range s {
		for _, p := range problemsFor(i, x) {
			problems = append(problems, p)
		}
	}
	if len(problems) == 0 {
		return nil
	}
	if len(problems) > maxReported {
		extra := len(problems) - maxReported
		problems = problems[:maxReported]
		problems = append(problems, fmt.Sprintf("... and %d more", extra))
	}
	return fmt.Errorf("%d of %d settlements are unusable:\n  %s",
		len(problems), len(s), strings.Join(problems, "\n  "))
}

// problemsFor returns the reasons one settlement cannot be used. A name is
// quoted so a settlement with an empty one is visible in the output rather than
// looking like a formatting slip.
func problemsFor(i int, x worldgen.Settlement) []string {
	var p []string
	add := func(f string, a ...any) { p = append(p, fmt.Sprintf("[%d] %s: %s", i, x.Name, fmt.Sprintf(f, a...))) }

	if strings.TrimSpace(x.Name) == "" {
		add("Name is empty")
	}
	if strings.TrimSpace(x.State) == "" {
		add("State is empty")
	}
	// Population drives every other starting field through the config's
	// per-capita constants, so a zero or negative value would build a town with
	// no food demand, no workers and no garrison rather than fail.
	if x.Population <= 0 {
		add("Population is %.0f, which must be above zero", x.Population)
	} else if math.IsNaN(x.Population) || math.IsInf(x.Population, 0) {
		add("Population is not a finite number")
	}
	// A SideID outside the generator's sides would leave a town held by nobody
	// and absent from every side's totals.
	if x.SideID < 1 || x.SideID > sideCount {
		add("SideID is %d, which is outside the %d sides the generator builds", x.SideID, sideCount)
	}
	// Terrain indexes the route_terrain enum; out of range would index the
	// wrong ground type or panic in anything that reads terrain by name.
	if x.Terrain < 0 || x.Terrain > model.TerrainMax {
		add("Terrain is %d, which is outside the %d route_terrain values", x.Terrain, model.TerrainMax+1)
	}
	// Farmland is a multiplier on food yield. Zero is meaningful — the
	// generator treats it as "not supplied" and derives one — so only negative
	// and non-finite values are refused.
	if x.Farmland < 0 || math.IsNaN(x.Farmland) || math.IsInf(x.Farmland, 0) {
		add("Farmland is %g, which must be zero or a positive multiplier", x.Farmland)
	}
	for _, c := range []struct {
		name string
		v    float64
	}{{"X", x.X}, {"Y", x.Y}} {
		if math.IsNaN(c.v) || math.IsInf(c.v, 0) {
			add("%s is %g, which must be a finite position", c.name, c.v)
		}
	}
	return p
}

// CheckDuplicates reports settlements sharing a name and position, which the
// generator would turn into two towns on top of each other. It is separate from
// Validate because a duplicate is a data question rather than a broken file:
// the feed may legitimately contain two real places with the same name in
// different states, so this reports rather than refuses, and the caller
// decides.
func CheckDuplicates(s []worldgen.Settlement) []string {
	type key struct {
		name string
		x, y int64
	}
	counts := map[key]int{}
	for _, x := range s {
		// Rounded to a tenth of a league, which is finer than the feed's own
		// coordinate resolution, so only genuine co-location groups.
		counts[key{strings.ToLower(x.Name), int64(math.Round(x.X * 10)), int64(math.Round(x.Y * 10))}]++
	}
	var out []string
	for k, n := range counts {
		if n > 1 {
			out = append(out, fmt.Sprintf("%q appears %d times at the same position", k.name, n))
		}
	}
	sort.Strings(out)
	return out
}

// Summary describes a loaded feed for a run report: where it came from, and
// what it does and does not cover.
func (f *Feed) Summary(path string) string {
	ports := 0
	real := 0
	for _, s := range f.Settlements {
		if s.IsPort {
			ports++
		}
		if s.IsReal {
			real++
		}
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "settlement feed %s: %d settlements (%d flagged real)", path, len(f.Settlements), real)
	if f.Region != "" {
		fmt.Fprintf(&sb, ", region %q", f.Region)
	}
	if f.Retrieved != "" {
		fmt.Fprintf(&sb, ", retrieved %s", f.Retrieved)
	}
	sb.WriteString("\n")
	if dups := CheckDuplicates(f.Settlements); len(dups) > 0 {
		fmt.Fprintf(&sb, "  warning: %d duplicate name+position groups: %s\n",
			len(dups), strings.Join(dups, "; "))
	}
	// Both of these are properties of the data, not of this loader, and both
	// change what a V1 balance number means, so they are stated where the number
	// is read rather than only in the feed's own documentation.
	if ports == 0 {
		sb.WriteString("  warning: no settlement in this feed is a port, so the blockade mechanic cannot fire in this run\n")
	}
	return sb.String()
}

// Exists reports whether a feed is present at path, so a caller can tell "no
// feed supplied" from "feed supplied but broken" without treating either as an
// error. The distinction matters because a missing feed has a working fallback
// (the synthesised map) and a broken one does not.
func Exists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}

// ResolvePath turns a user-supplied path into the one to read: empty means the
// shipped snapshot.
//
// An explicit path is taken as the caller wrote it, so a typo is reported as a
// typo rather than quietly resolving to something else. The default is the one
// path that has to be found rather than assumed, because simrun is invoked from
// the service directory, from the repository root, and from a test's package
// directory, and a default that only works from one of those makes the run's
// data depend on the caller's working directory. So the default is searched for
// by walking up to the service root.
func ResolvePath(path string) string {
	if path != "" {
		return path
	}
	if Exists(DefaultPath) {
		return DefaultPath
	}
	dir, err := os.Getwd()
	if err != nil {
		return DefaultPath
	}
	for {
		cand := filepath.Join(dir, DefaultPath)
		if Exists(cand) {
			return cand
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return DefaultPath
		}
		dir = parent
	}
}
