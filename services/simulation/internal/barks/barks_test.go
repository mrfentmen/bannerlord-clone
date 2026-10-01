package barks

import (
	"math"
	"strconv"
	"testing"
)

func itoa(i int) string { return strconv.Itoa(i) }

const testManifest = "../../../../content/audio/voices/manifest.json"

func loadTestSelector(t *testing.T) *Selector {
	t.Helper()
	s, err := LoadSelector(testManifest)
	if err != nil {
		t.Skipf("manifest not present: %v", err)
	}
	return s
}

func TestTopicsCoverEveryKind(t *testing.T) {
	for _, k := range []Kind{KindContact, KindCasualty, KindKill, KindOrderAck,
		KindRout, KindRally, KindVictory, KindIdle, KindThreat,
		KindBargain, KindGreeting, KindQuestOffer} {
		if len(topics[k]) == 0 {
			t.Errorf("kind %q has no topics", k)
		}
		if _, ok := basePriority[k]; !ok {
			t.Errorf("kind %q has no priority", k)
		}
	}
}

func TestSelectIsDeterministic(t *testing.T) {
	s := loadTestSelector(t)
	e := Event{Kind: KindContact, Class: "infantry", Tick: 100, UnitID: "u1", X: 10}
	a := s.Select(42, e)
	b := s.Select(42, e)
	if a == nil || b == nil {
		t.Fatal("expected a cue")
	}
	if a.LineID != b.LineID || a.Text != b.Text {
		t.Errorf("non-deterministic: %v vs %v", a.LineID, b.LineID)
	}
	c := s.Select(43, e)
	if c == nil {
		t.Fatal("expected a cue for other seed")
	}
	// Different seed may pick a different line; must still be a valid cue.
	if c.File == "" || c.Text == "" {
		t.Errorf("invalid cue: %+v", c)
	}
}

func TestSelectFallsBackForUnknownClass(t *testing.T) {
	s := loadTestSelector(t)
	e := Event{Kind: KindGreeting, Class: "no-such-class", Tick: 1, UnitID: "u9"}
	cue := s.Select(7, e)
	if cue == nil {
		t.Fatal("expected fallback cue, got nil")
	}
	if cue.Text == "" {
		t.Errorf("fallback cue has no text")
	}
}

func TestSelectPrefersTopicMatch(t *testing.T) {
	s := loadTestSelector(t)
	// infantry has combat-tagged lines; a contact bark should land on one.
	e := Event{Kind: KindContact, Class: "infantry", Tick: 5, UnitID: "u2"}
	cue := s.Select(1, e)
	if cue == nil {
		t.Fatal("expected a cue")
	}
	// The selected sidecar should carry a contact or combat tag; check via file.
	found := false
	for _, vl := range s.byClass["infantry"] {
		if vl.sc.ID+"#"+itoa(vl.index) == cue.LineID &&
			(hasTag(vl.tags(), "contact") || hasTag(vl.tags(), "combat")) {
			found = true
		}
	}
	if !found {
		t.Errorf("contact bark did not prefer a contact/combat line: %s", cue.LineID)
	}
}

func TestThrottleKindCooldown(t *testing.T) {
	th := DefaultThrottler()
	e := Event{Kind: KindContact, Tick: 0, UnitID: "u1"}
	if !th.Admit(e, 90, 1.0) {
		t.Fatal("first bark should be admitted")
	}
	e2 := Event{Kind: KindContact, Tick: 10, UnitID: "u2"}
	if th.Admit(e2, 90, 1.0) {
		t.Error("second contact bark within cooldown should be rejected")
	}
	e3 := Event{Kind: KindContact, Tick: 30, UnitID: "u2"}
	if !th.Admit(e3, 90, 1.0) {
		t.Error("contact bark after cooldown should be admitted")
	}
}

func TestThrottleUnitCooldown(t *testing.T) {
	th := DefaultThrottler()
	e := Event{Kind: KindKill, Tick: 0, UnitID: "u1"}
	if !th.Admit(e, 60, 1.0) {
		t.Fatal("first bark should be admitted")
	}
	e2 := Event{Kind: KindKill, Tick: 30, UnitID: "u1"}
	if th.Admit(e2, 60, 1.0) {
		t.Error("same unit barking within its cooldown should be rejected")
	}
}

func TestThrottleGlobalCapAndPreemption(t *testing.T) {
	th := NewThrottler(map[Kind]int64{}, 0, 2, 10)
	// Fill both voices with low-priority barks.
	if !th.Admit(Event{Kind: KindIdle, Tick: 0, UnitID: "a"}, 10, 5.0) {
		t.Fatal("idle bark 1 should be admitted")
	}
	if !th.Admit(Event{Kind: KindIdle, Tick: 0, UnitID: "b"}, 10, 5.0) {
		t.Fatal("idle bark 2 should be admitted")
	}
	// Third low-priority bark: saturated, no preemption.
	if th.Admit(Event{Kind: KindIdle, Tick: 1, UnitID: "c"}, 10, 5.0) {
		t.Error("third idle bark at cap should be rejected")
	}
	// High-priority contact steals a voice.
	if !th.Admit(Event{Kind: KindContact, Tick: 1, UnitID: "d"}, 90, 5.0) {
		t.Error("contact bark should preempt an idle voice")
	}
	// Voices free up after their durations expire.
	if !th.Admit(Event{Kind: KindIdle, Tick: 100, UnitID: "e"}, 10, 1.0) {
		t.Error("bark after voices free up should be admitted")
	}
}

func TestMixVolumeFallsOffWithDistance(t *testing.T) {
	l := Listener{}
	var c Cue
	Mix(&c, 0, 0, 0, l)
	if math.Abs(c.Volume-1) > 1e-9 {
		t.Errorf("volume at listener = %v, want 1", c.Volume)
	}
	Mix(&c, MaxAudibleRange/2, 0, 0, l)
	if math.Abs(c.Volume-0.5) > 1e-9 {
		t.Errorf("volume at half range = %v, want 0.5", c.Volume)
	}
	Mix(&c, MaxAudibleRange, 0, 0, l)
	if c.Volume != 0 {
		t.Errorf("volume at max range = %v, want 0", c.Volume)
	}
	Mix(&c, MaxAudibleRange+10, 0, 0, l)
	if c.Volume != 0 {
		t.Errorf("volume beyond max range = %v, want 0", c.Volume)
	}
}

func TestMixPanLeftRight(t *testing.T) {
	// Facing +Z: something at +X is to the right.
	l := Listener{Facing: 0}
	var c Cue
	Mix(&c, 50, 0, 0, l)
	if math.Abs(c.Pan-1) > 1e-9 {
		t.Errorf("pan right = %v, want 1", c.Pan)
	}
	Mix(&c, -50, 0, 0, l)
	if math.Abs(c.Pan+1) > 1e-9 {
		t.Errorf("pan left = %v, want -1", c.Pan)
	}
	Mix(&c, 0, 0, 50, l)
	if math.Abs(c.Pan) > 1e-9 {
		t.Errorf("pan ahead = %v, want 0", c.Pan)
	}
	// Turn around: the same point is now behind-left... check symmetry.
	l2 := Listener{Facing: math.Pi}
	Mix(&c, 50, 0, 0, l2)
	if math.Abs(c.Pan+1) > 1e-9 {
		t.Errorf("pan after 180 turn = %v, want -1", c.Pan)
	}
}

func TestDirectorEndToEnd(t *testing.T) {
	s := loadTestSelector(t)
	d := &Director{
		Selector: s,
		Throttle: DefaultThrottler(),
		Seed:     99,
		Listeners: func() Listener {
			return Listener{X: 0, Y: 0, Z: 0, Facing: 0}
		},
	}
	e := Event{Kind: KindContact, Class: "infantry", Tick: 0, UnitID: "u1", X: 10}
	cue := d.Direct(e)
	if cue == nil {
		t.Fatal("expected a cue")
	}
	if cue.Volume <= 0 || cue.Volume > 1 {
		t.Errorf("volume out of range: %v", cue.Volume)
	}
	// Same event one tick later: kind cooldown should throttle it.
	cue2 := d.Direct(Event{Kind: KindContact, Class: "infantry", Tick: 1, UnitID: "u2", X: 10})
	if cue2 != nil {
		t.Error("expected throttled event to produce no cue")
	}
	// Far away: silent.
	cue3 := d.Direct(Event{Kind: KindRally, Class: "infantry", Tick: 100, UnitID: "u3", X: 500})
	if cue3 != nil {
		t.Error("expected out-of-range bark to produce no cue")
	}
}

func TestDirectorDeterministic(t *testing.T) {
	s := loadTestSelector(t)
	mk := func() *Director {
		return &Director{Selector: s, Throttle: DefaultThrottler(), Seed: 5,
			Listeners: func() Listener { return Listener{} }}
	}
	d1, d2 := mk(), mk()
	events := []Event{
		{Kind: KindContact, Class: "infantry", Tick: 0, UnitID: "u1", X: 5},
		{Kind: KindCasualty, Class: "medic", Tick: 3, UnitID: "u2", X: -8},
		{Kind: KindRally, Class: "captain", Tick: 9, UnitID: "u3", X: 2},
	}
	for _, e := range events {
		c1, c2 := d1.Direct(e), d2.Direct(e)
		if (c1 == nil) != (c2 == nil) {
			t.Fatalf("non-deterministic admission for %+v", e)
		}
		if c1 != nil && (c1.LineID != c2.LineID || c1.Volume != c2.Volume || c1.Pan != c2.Pan) {
			t.Errorf("non-deterministic cue: %+v vs %+v", c1, c2)
		}
	}
}
