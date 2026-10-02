package simfeed

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/worldgen"
)

// These tests run against the SHIPPED feed at data/sim-feed/settlements.json
// rather than a hand-written stub, for the reason internal/config tests the
// shipped balance.toml: the file that ships is the one under test, so a change
// to it cannot make a test quietly stop testing anything. The stub cases below
// exist only to drive the validation paths that a good feed never hits.

const shippedFeed = "../../data/sim-feed/settlements.json"

// write puts text in a temp file and returns its path.
func write(t *testing.T, text string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "settlements.json")
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatalf("writing temp feed: %v", err)
	}
	return path
}

// feedJSON builds a one-settlement feed document with the given overrides, so a
// test can break exactly one field and leave the rest valid.
func feedJSON(t *testing.T, s map[string]any) string {
	t.Helper()
	if s == nil {
		s = map[string]any{}
	}
	for _, k := range []string{"Name", "State", "SideID", "Population", "X", "Y", "IsPort", "Terrain", "Farmland", "IsReal"} {
		if _, ok := s[k]; !ok {
			s[k] = defaultField(k)
		}
	}
	doc := map[string]any{
		"source":      "agent-1-export",
		"licence":     "public domain",
		"retrieved":   "2026-09-30",
		"region":      "test",
		"projection":  "test",
		"settlements": []map[string]any{s},
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("building feed: %v", err)
	}
	return string(raw)
}

func defaultField(k string) any {
	switch k {
	case "Name":
		return "Testville"
	case "State":
		return "Ohio"
	case "SideID":
		return 3
	case "Population":
		return 1000.0
	case "X":
		return 1.0
	case "Y":
		return 2.0
	case "IsPort":
		return false
	case "Terrain":
		return 2
	case "Farmland":
		return 1.0
	case "IsReal":
		return true
	}
	return nil
}

func TestLoadShippedFeed(t *testing.T) {
	f, err := Load(shippedFeed)
	if err != nil {
		t.Fatalf("loading shipped feed: %v", err)
	}
	if len(f.Settlements) == 0 {
		t.Fatal("shipped feed loaded with zero settlements")
	}
	// The feed is a copy of a specific world-data commit. The count is pinned so
	// a refresh that drops settlements fails here rather than quietly producing
	// a smaller map that still looks like a successful import.
	if got, want := len(f.Settlements), 487; got != want {
		t.Errorf("shipped feed has %d settlements, want %d", got, want)
	}
	if f.Source == "" {
		t.Error("shipped feed has no source recorded")
	}
	if f.Region == "" {
		t.Error("shipped feed has no region recorded")
	}
	if f.Retrieved == "" {
		t.Error("shipped feed has no retrieval date recorded")
	}
	if f.Licence == "" {
		t.Error("shipped feed has no licence recorded")
	}
}

func TestShippedFeedFieldsAreInRange(t *testing.T) {
	f, err := Load(shippedFeed)
	if err != nil {
		t.Fatalf("loading shipped feed: %v", err)
	}
	// Validate is what Load already runs, so this asserts the shipped file
	// satisfies it rather than merely that it loads.
	if err := Validate(f.Settlements); err != nil {
		t.Errorf("shipped feed failed its own validation: %v", err)
	}
}

func TestShippedFeedMatchesProvenanceManifest(t *testing.T) {
	// The vendored file and its manifest must describe the same bytes. A
	// refreshed feed that forgets the manifest would otherwise leave a stale
	// licence and commit recorded against data that no longer came from there.
	raw, err := os.ReadFile(shippedFeed)
	if err != nil {
		t.Fatalf("reading shipped feed: %v", err)
	}
	manifest, err := os.ReadFile(filepath.Join(filepath.Dir(shippedFeed), "MANIFEST.md"))
	if err != nil {
		t.Fatalf("reading manifest: %v", err)
	}
	if got := sha256hex(raw); !strings.Contains(string(manifest), got) {
		t.Errorf("manifest does not record the shipped file's sha256 %s; refresh the manifest with the feed", got)
	}
	for _, want := range []string{"2bc0e6b8", "worker/mute/sim-feed", "487"} {
		if !strings.Contains(string(manifest), want) {
			t.Errorf("manifest does not mention %q", want)
		}
	}
}

// sha256hex is the digest the vendored manifest records, so the test can check
// the file against the provenance written beside it.
func sha256hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func TestValidateAcceptsGoodFeed(t *testing.T) {
	if err := Validate([]worldgen.Settlement{{
		Name: "Columbus", State: "Ohio", SideID: 3, Population: 913175,
		X: 8.28, Y: -26.07, Terrain: 2, Farmland: 2.11, IsReal: true,
	}}); err != nil {
		t.Fatalf("valid settlement rejected: %v", err)
	}
}

// A feed with no settlements must fail loudly. Letting it through would produce
// a run whose map was synthesised while the report claimed real data.
func TestLoadRejectsEmptyFeed(t *testing.T) {
	_, err := Load(write(t, `{"source":"x","settlements":[]}`))
	if err == nil {
		t.Fatal("expected an error for a feed with no settlements")
	}
	if !strings.Contains(err.Error(), "no settlements") {
		t.Errorf("error should say the feed is empty, got: %v", err)
	}
}

func TestLoadRejectsMissingFile(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "absent.json"))
	if err == nil {
		t.Fatal("expected an error for a missing feed")
	}
	// The recovery has to be in the message, per CONSTITUTION.md 1.3.
	if !strings.Contains(err.Error(), "regenerate") {
		t.Errorf("error should say how to recover, got: %v", err)
	}
}

func TestLoadRejectsUnknownField(t *testing.T) {
	// A field the sim does not know about means the contract changed. Reading it
	// as "the rest is fine" would drop data and produce a map that is not the one
	// on disk.
	doc := strings.Replace(feedJSON(t, nil), `"Terrain":2`, `"Terrain":2,"Floodplain":true`, 1)
	if doc == feedJSON(t, nil) {
		t.Fatal("test fixture did not change; the field name to inject has moved")
	}
	_, err := Load(write(t, doc))
	if err == nil {
		t.Fatal("expected an error for an unrecognised field")
	}
	if !strings.Contains(err.Error(), "Floodplain") {
		t.Errorf("error should name the unknown field, got: %v", err)
	}
}

func TestLoadRejectsMalformedJSON(t *testing.T) {
	if _, err := Load(write(t, `{"settlements":[`)); err == nil {
		t.Fatal("expected an error for truncated JSON")
	}
}

func TestValidateRejectsBadFields(t *testing.T) {
	cases := []struct {
		name  string
		mut   func(*worldgen.Settlement)
		wants string
	}{
		{"empty name", func(s *worldgen.Settlement) { s.Name = "  " }, "Name is empty"},
		{"empty state", func(s *worldgen.Settlement) { s.State = "" }, "State is empty"},
		{"zero population", func(s *worldgen.Settlement) { s.Population = 0 }, "Population"},
		{"negative population", func(s *worldgen.Settlement) { s.Population = -1 }, "Population"},
		{"side zero", func(s *worldgen.Settlement) { s.SideID = 0 }, "SideID"},
		{"side above count", func(s *worldgen.Settlement) { s.SideID = 99 }, "SideID"},
		{"terrain above enum", func(s *worldgen.Settlement) { s.Terrain = 42 }, "Terrain"},
		{"negative terrain", func(s *worldgen.Settlement) { s.Terrain = -1 }, "Terrain"},
		{"negative farmland", func(s *worldgen.Settlement) { s.Farmland = -0.5 }, "Farmland"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := worldgen.Settlement{
				Name: "Testville", State: "Ohio", SideID: 3, Population: 1000,
				X: 1, Y: 2, Terrain: 2, Farmland: 1, IsReal: true,
			}
			tc.mut(&s)
			err := Validate([]worldgen.Settlement{s})
			if err == nil {
				t.Fatalf("expected %s to be rejected", tc.name)
			}
			if !strings.Contains(err.Error(), tc.wants) {
				t.Errorf("error should mention %q, got: %v", tc.wants, err)
			}
		})
	}
}

// Zero farmland is legitimate: the generator treats it as "not supplied" and
// derives a multiplier. Refusing it would reject a valid feed.
func TestValidateAllowsZeroFarmland(t *testing.T) {
	err := Validate([]worldgen.Settlement{{
		Name: "Testville", State: "Ohio", SideID: 3, Population: 1000,
		X: 1, Y: 2, Terrain: 0, Farmland: 0,
	}})
	if err != nil {
		t.Fatalf("zero Farmland should be accepted: %v", err)
	}
}

// Every terrain in the enum must pass, and one past the end must fail. This is
// what keeps model.TerrainMax honest as the enum grows.
func TestValidateTerrainCoversEnum(t *testing.T) {
	for tr := 0; tr <= 5; tr++ {
		if err := Validate([]worldgen.Settlement{{
			Name: "T", State: "Ohio", SideID: 1, Population: 10, Terrain: tr,
		}}); err != nil {
			t.Errorf("terrain %d should be valid: %v", tr, err)
		}
	}
	if err := Validate([]worldgen.Settlement{{
		Name: "T", State: "Ohio", SideID: 1, Population: 10, Terrain: 6,
	}}); err == nil {
		t.Error("terrain 6 should be rejected")
	}
}

// Every SideID the generator builds must be accepted, and one outside must not.
func TestValidateSideRangeMatchesGenerator(t *testing.T) {
	sides := len(worldgen.Sides())
	if sideCount != sides {
		t.Fatalf("loader thinks there are %d sides, generator builds %d", sideCount, sides)
	}
	for id := 1; id <= sides; id++ {
		if err := Validate([]worldgen.Settlement{{
			Name: "T", State: "Ohio", SideID: id, Population: 10,
		}}); err != nil {
			t.Errorf("SideID %d should be valid: %v", id, err)
		}
	}
	for _, id := range []int{0, -1, sides + 1} {
		if err := Validate([]worldgen.Settlement{{
			Name: "T", State: "Ohio", SideID: id, Population: 10,
		}}); err == nil {
			t.Errorf("SideID %d should be rejected", id)
		}
	}
}

func TestValidateReportsEveryProblem(t *testing.T) {
	err := Validate([]worldgen.Settlement{
		{Name: "A", State: "Ohio", SideID: 3, Population: 0},
		{Name: "B", State: "Ohio", SideID: 0, Population: 100},
	})
	if err == nil {
		t.Fatal("expected an error")
	}
	msg := err.Error()
	for _, want := range []string{"[0]", "[1]", "Population", "SideID"} {
		if !strings.Contains(msg, want) {
			t.Errorf("error should mention %q so every bad row is findable, got: %v", want, msg)
		}
	}
}

func TestCheckDuplicates(t *testing.T) {
	dupes := CheckDuplicates([]worldgen.Settlement{
		{Name: "Springfield", X: 1, Y: 1},
		{Name: "springfield", X: 1, Y: 1},
		{Name: "Other", X: 5, Y: 5},
	})
	if len(dupes) != 1 {
		t.Fatalf("expected one duplicate group, got %v", dupes)
	}
	if !strings.Contains(dupes[0], "springfield") {
		t.Errorf("duplicate report should use the name, got %q", dupes[0])
	}
	if got := CheckDuplicates([]worldgen.Settlement{
		{Name: "A", X: 1, Y: 1}, {Name: "A", X: 9, Y: 9},
	}); len(got) != 0 {
		t.Errorf("same name at different positions is not a duplicate, got %v", got)
	}
}

// The V1 feed has no ports, which means the blockade mechanic cannot fire. The
// summary has to say so where the numbers are read, so a V1 balance result is
// not mistaken for evidence that blockade is balanced.
func TestSummaryWarnsWhenNoPorts(t *testing.T) {
	f, err := Load(shippedFeed)
	if err != nil {
		t.Fatalf("loading shipped feed: %v", err)
	}
	sum := f.Summary(shippedFeed)
	if !strings.Contains(sum, "blockade") {
		t.Errorf("summary should warn that no settlement is a port, got:\n%s", sum)
	}
	if !strings.Contains(sum, "487") {
		t.Errorf("summary should state the settlement count, got:\n%s", sum)
	}
}

func TestSummaryCountsPorts(t *testing.T) {
	f := &Feed{Settlements: []worldgen.Settlement{
		{Name: "A", IsPort: true}, {Name: "B", IsPort: false},
	}}
	if sum := f.Summary("test"); strings.Contains(sum, "no settlement in this feed is a port") {
		t.Errorf("feed with a port should not warn, got:\n%s", sum)
	}
}

func TestResolvePath(t *testing.T) {
	// An explicit path is passed through exactly as written, so a typo stays a
	// typo instead of quietly becoming a different file.
	if got := ResolvePath(shippedFeed); got != shippedFeed {
		t.Errorf("a relative path should be kept as written, got %q", got)
	}
	if got := ResolvePath("/tmp/abs.json"); got != "/tmp/abs.json" {
		t.Errorf("an absolute path should be kept, got %q", got)
	}
	if got := ResolvePath("does/not/exist.json"); got != "does/not/exist.json" {
		t.Errorf("a missing explicit path should still be reported as written, got %q", got)
	}

	// The default is searched for, because the same run has to find it whether
	// it is launched from the service directory, the repository root, or a
	// package test's directory.
	got := ResolvePath("")
	if !Exists(got) {
		t.Fatalf("the default path did not resolve to a readable feed, got %q", got)
	}
	if !strings.HasSuffix(got, filepath.FromSlash(DefaultPath)) {
		t.Errorf("default resolved to %q, which is not the shipped feed", got)
	}
	// The file the default finds has to be the shipped one, not some other
	// settlements.json that happened to be nearer.
	f, err := Load(got)
	if err != nil {
		t.Fatalf("loading the resolved default: %v", err)
	}
	if len(f.Settlements) != 487 {
		t.Errorf("default resolved to a feed of %d settlements, want the shipped 487", len(f.Settlements))
	}
}

func TestExists(t *testing.T) {
	if Exists(t.TempDir()) {
		t.Error("a directory is not a feed")
	}
	if Exists(filepath.Join(t.TempDir(), "absent.json")) {
		t.Error("a missing file does not exist")
	}
	p := write(t, feedJSON(t, nil))
	if !Exists(p) {
		t.Error("a written feed should exist")
	}
}

func TestLoadDefaultReadsShippedFeed(t *testing.T) {
	// Tests run with the service directory as cwd, so the default path is the
	// one a plain `simrun -settlements ""` run would use.
	if _, err := LoadDefault(); err != nil {
		t.Fatalf("default path did not load: %v", err)
	}
}
