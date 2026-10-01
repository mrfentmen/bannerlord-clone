// Package barks decides which battle shouts the player hears.
//
// The battle engine produces raw events (a squad made contact, a medic
// took a casualty, an order was acknowledged). This package turns that
// firehose into a playable soundscape:
//
//   - taxonomy: every bark has a Kind, mapped to voice-manifest topics
//   - throttling: per-kind and per-unit cooldowns plus a global cap so
//     500 soldiers never shout at once; higher priority wins ties
//   - selection: deterministic line pick from the voice manifest, with
//     a generic fallback that never fails
//   - positional: volume and stereo pan from the bark's position
//     relative to the listener (the camera)
//
// It is deliberately decoupled from the battle engine: the engine (or
// the battle session API) feeds Events in, cues come out for the client
// to play. Deterministic given (seed, tick, event order).
package barks

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"math"
	"os"
	"sort"
)

// Kind is the bark taxonomy. Each maps to one or more voice-manifest
// context topics, in preference order.
type Kind string

const (
	KindContact    Kind = "contact"     // enemy sighted / engaged
	KindCasualty   Kind = "casualty"    // one of ours went down
	KindKill       Kind = "kill"        // confirmed kill
	KindOrderAck   Kind = "order_ack"   // formation order acknowledged
	KindRout       Kind = "rout"        // unit breaking
	KindRally      Kind = "rally"       // rallying / holding cry
	KindVictory    Kind = "victory"     // battle won
	KindIdle       Kind = "idle"        // ambient chatter between fights
	KindThreat     Kind = "threat"      // intimidation / demand
	KindBargain    Kind = "bargain"     // haggling (camp scenes)
	KindGreeting   Kind = "greeting"    // entering a scene
	KindQuestOffer Kind = "quest_offer" // quest dialogue hook
)

// topics maps each bark kind to voice-manifest context tags, best first.
var topics = map[Kind][]string{
	KindContact:    {"contact", "combat"},
	KindCasualty:   {"casualty", "combat"},
	KindKill:       {"combat"},
	KindOrderAck:   {"order", "combat"},
	KindRout:       {"casualty", "combat"},
	KindRally:      {"rally", "combat"},
	KindVictory:    {"victory"},
	KindIdle:       {"idle", "tavern", "town"},
	KindThreat:     {"threat"},
	KindBargain:    {"bargain"},
	KindGreeting:   {"greeting"},
	KindQuestOffer: {"quest_offer"},
}

// basePriority orders kinds when the soundscape is saturated.
// Higher number = more important. Contact and casualty calls carry
// tactical information; idle chatter is the first thing cut.
var basePriority = map[Kind]int{
	KindContact:    90,
	KindCasualty:   85,
	KindRout:       80,
	KindKill:       60,
	KindOrderAck:   55,
	KindRally:      50,
	KindThreat:     45,
	KindVictory:    40,
	KindQuestOffer: 35,
	KindGreeting:   30,
	KindBargain:    25,
	KindIdle:       10,
}

// Event is one thing that happened on the battlefield and might
// deserve a voice line.
type Event struct {
	Kind      Kind
	Class     string  // unit class, e.g. "infantry" (matches manifest)
	Character string  // notable name, may be ""
	X, Y, Z   float64 // world position of the barking unit
	Tick      int64   // battle tick
	UnitID    string  // barking unit, for per-unit cooldown
}

// Cue is a single voice line the client should play.
type Cue struct {
	LineID      string  `json:"line_id"`
	File        string  `json:"file"`
	Text        string  `json:"text"`
	Volume      float64 `json:"volume"` // 0..1 after distance attenuation
	Pan         float64 `json:"pan"`    // -1 (left) .. 1 (right)
	Priority    int     `json:"priority"`
	Tick        int64   `json:"tick"`
	Kind        Kind    `json:"kind"`
	DurationSec float64 `json:"duration_sec"`
}

// sidecar mirrors the voice sidecar JSON (tools/pipelines/voice/contract.py).
// Batch sidecars carry their tags per transcript line; line sidecars
// carry a single line.
type sidecar struct {
	ID        string  `json:"id"`
	Kind      string  `json:"kind"`
	File      string  `json:"file"`
	Character string  `json:"character"`
	Class     string  `json:"class"`
	DurationS float64 `json:"duration_s"`
	Lines     []struct {
		Text        string   `json:"text"`
		Emotion     string   `json:"emotion"`
		ContextTags []string `json:"context_tags"`
	} `json:"lines"`
}

// voicedLine is one selectable line: a sidecar plus a line index.
type voicedLine struct {
	sc    sidecar
	index int
}

func (v voicedLine) text() string   { return v.sc.Lines[v.index].Text }
func (v voicedLine) tags() []string { return v.sc.Lines[v.index].ContextTags }

// Selector picks voice lines from the manifest deterministically.
type Selector struct {
	byClass map[string][]voicedLine
	all     []voicedLine
}

// LoadSelector reads the voice manifest produced by the voice pipeline.
func LoadSelector(manifestPath string) (*Selector, error) {
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("barks: read manifest: %w", err)
	}
	var doc struct {
		Lines []sidecar `json:"lines"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("barks: parse manifest: %w", err)
	}
	s := &Selector{byClass: map[string][]voicedLine{}}
	for _, sc := range doc.Lines {
		for i := range sc.Lines {
			vl := voicedLine{sc: sc, index: i}
			s.byClass[sc.Class] = append(s.byClass[sc.Class], vl)
			s.all = append(s.all, vl)
		}
	}
	return s, nil
}

func hasTag(tags []string, want string) bool {
	for _, t := range tags {
		if t == want {
			return true
		}
	}
	return false
}

// lineText returns the display text for a sidecar: batch sidecars carry
// their transcript lines; line sidecars carry one.
func lineText(vl voicedLine) string { return vl.text() }

// Select returns the best line for an event, or nil if the manifest is
// empty. Deterministic in (seed, tick, kind, class): the same battle
// state always barks the same line. Unknown classes fall back to the
// whole manifest; selection never fails on a non-empty manifest.
func (s *Selector) Select(seed uint64, e Event) *Cue {
	pool := s.byClass[e.Class]
	if len(pool) == 0 {
		pool = s.all
	}
	if len(pool) == 0 {
		return nil
	}
	want := topics[e.Kind]
	type scored struct {
		vl    voicedLine
		score int
	}
	var ranked []scored
	for _, vl := range pool {
		score := 0
		for i, t := range want {
			if hasTag(vl.tags(), t) {
				score = len(want) - i // earlier topic = better
				break
			}
		}
		ranked = append(ranked, scored{vl, score})
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		return ranked[i].score > ranked[j].score
	})
	best := ranked[0].score
	var cands []voicedLine
	for _, sc := range ranked {
		if sc.score == best {
			cands = append(cands, sc.vl)
		} else {
			break
		}
	}
	h := fnv.New64a()
	fmt.Fprintf(h, "%d/%d/%s/%s", seed, e.Tick, e.Kind, e.Class)
	pick := int(h.Sum64() % uint64(len(cands)))
	vl := cands[pick]
	// Nominal per-line duration: measured file length split across its
	// transcript lines.
	dur := 2.0
	if n := len(vl.sc.Lines); n > 0 && vl.sc.DurationS > 0 {
		dur = vl.sc.DurationS / float64(n)
	}
	return &Cue{
		LineID:      fmt.Sprintf("%s#%d", vl.sc.ID, vl.index),
		File:        vl.sc.File,
		Text:        lineText(vl),
		Priority:    basePriority[e.Kind],
		Tick:        e.Tick,
		Kind:        e.Kind,
		DurationSec: dur,
	}
}

// Throttler keeps the soundscape intelligible: per-kind cooldowns, a
// per-unit cooldown, and a cap on simultaneous barks. Time is battle
// ticks; a bark occupies the soundscape for its line duration.
type Throttler struct {
	kindCooldown map[Kind]int64
	unitCooldown int64
	maxVoices    int
	ticksPerSec  int64

	lastKind map[Kind]int64
	lastUnit map[string]int64
	active   []activeCue
}

type activeCue struct {
	untilTick int64
	priority  int
}

// NewThrottler builds a throttler. Cooldowns are in ticks.
func NewThrottler(kindCooldown map[Kind]int64, unitCooldown int64, maxVoices int, ticksPerSec int64) *Throttler {
	kc := map[Kind]int64{}
	for k, v := range kindCooldown {
		kc[k] = v
	}
	return &Throttler{
		kindCooldown: kc,
		unitCooldown: unitCooldown,
		maxVoices:    maxVoices,
		ticksPerSec:  ticksPerSec,
		lastKind:     map[Kind]int64{},
		lastUnit:     map[string]int64{},
	}
}

// DefaultThrottler is the tuned default: 10 ticks/sec, contact calls at
// most every 3s per kind, a unit barks at most every 8s, 6 voices max.
func DefaultThrottler() *Throttler {
	return NewThrottler(map[Kind]int64{
		KindContact:  30,
		KindCasualty: 30,
		KindRout:     40,
		KindKill:     20,
		KindOrderAck: 15,
		KindRally:    50,
		KindVictory:  100,
		KindIdle:     80,
	}, 80, 6, 10)
}

// Admit decides whether an event may bark at this tick. lineDurSec is
// the selected line's duration; it sets how long a voice stays busy.
func (t *Throttler) Admit(e Event, priority int, lineDurSec float64) bool {
	if last, ok := t.lastKind[e.Kind]; ok && e.Tick-last < t.kindCooldown[e.Kind] {
		return false
	}
	if last, ok := t.lastUnit[e.UnitID]; ok && e.Tick-last < t.unitCooldown {
		return false
	}
	busy := t.active[:0]
	for _, a := range t.active {
		if a.untilTick > e.Tick {
			busy = append(busy, a)
		}
	}
	t.active = busy
	if len(t.active) >= t.maxVoices {
		// Saturated: only a strictly higher-priority bark steals a voice.
		minP := t.active[0].priority
		for _, a := range t.active[1:] {
			if a.priority < minP {
				minP = a.priority
			}
		}
		if priority <= minP {
			return false
		}
		// Evict the lowest-priority voice.
		evict := 0
		for i, a := range t.active {
			if a.priority < t.active[evict].priority {
				evict = i
			}
		}
		t.active = append(t.active[:evict], t.active[evict+1:]...)
	}
	t.lastKind[e.Kind] = e.Tick
	t.lastUnit[e.UnitID] = e.Tick
	busyTicks := int64(math.Ceil(lineDurSec * float64(t.ticksPerSec)))
	if busyTicks < 1 {
		busyTicks = 1
	}
	t.active = append(t.active, activeCue{untilTick: e.Tick + busyTicks, priority: priority})
	return true
}

// Positional mixing ---------------------------------------------------

// Listener is the camera: barks are mixed relative to it.
type Listener struct {
	X, Y, Z float64
	Facing  float64 // radians, 0 = looking down +Z
}

// MaxAudibleRange is the distance in meters beyond which a bark is silent.
const MaxAudibleRange = 120.0

// Mix sets volume (distance attenuation) and pan (stereo position) on
// the cue. Volume falls off linearly to MaxAudibleRange; pan is the
// sine of the angle between the facing direction and the bark.
func Mix(c *Cue, x, y, z float64, l Listener) {
	dx, dy, dz := x-l.X, y-l.Y, z-l.Z
	dist := math.Sqrt(dx*dx + dy*dy + dz*dz)
	if dist >= MaxAudibleRange {
		c.Volume = 0
		c.Pan = 0
		return
	}
	c.Volume = 1 - dist/MaxAudibleRange
	// Pan: project the offset onto the listener's right vector.
	// Facing f means forward = (sin f, 0, cos f); right = (cos f, 0, -sin f).
	rx, rz := math.Cos(l.Facing), -math.Sin(l.Facing)
	right := dx*rx + dz*rz
	if dist > 1e-9 {
		c.Pan = right / dist
	} else {
		c.Pan = 0
	}
	if c.Pan > 1 {
		c.Pan = 1
	} else if c.Pan < -1 {
		c.Pan = -1
	}
}

// Director ties selection, throttling, and mixing together.
type Director struct {
	Selector  *Selector
	Throttle  *Throttler
	Seed      uint64
	Listeners func() Listener
}

// Direct processes one event and returns a playable cue, or nil when
// the event is throttled, out of range, or has no line.
func (d *Director) Direct(e Event) *Cue {
	cue := d.Selector.Select(d.Seed, e)
	if cue == nil {
		return nil
	}
	if !d.Throttle.Admit(e, cue.Priority, cue.DurationSec) {
		return nil
	}
	var l Listener
	if d.Listeners != nil {
		l = d.Listeners()
	}
	Mix(cue, e.X, e.Y, e.Z, l)
	if cue.Volume <= 0 {
		return nil
	}
	return cue
}
