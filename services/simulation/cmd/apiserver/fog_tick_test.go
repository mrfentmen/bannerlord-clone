package main

import (
	"encoding/json"
	"strings"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/visibility"
)

// These tests are about the shape of two payloads that used to be hand-built strings and
// are now typed structs: the `fog` block on the HTTP snapshot, and the tick frame pushed
// to websocket subscribers.
//
// The behaviour under test is mostly the absence of a behaviour. Before the tick frame
// carried fog, the map lagged the party by a tick and nothing anywhere recorded that as a
// gap: the snapshot was correct, the frame was correct, and the player saw a town stay lit
// after the party had walked away from it. A regression here is silent, so these assert
// the specific things the player would notice.

// fogWorld is a two-town world with the player's party a long way from both of them, so
// every town starts unseen and moving the party is the only thing that can change the fog.
//
// Both towns clear `min_population_to_be_seen`, which is not a detail: a town under the
// threshold is skipped by the visibility system entirely, so a fixture that left the
// population at zero would produce an empty fog block from a correctly built server and
// every assertion about visibility would pass for the wrong reason.
func fogWorld() *model.State {
	s := model.NewState()
	s.Tick = 40
	s.Year = 1
	s.Towns[100] = &model.Town{
		ID: 100, Name: "Millbrook", SideID: 1, X: 0, Y: 0, Population: 4000,
	}
	s.Towns[200] = &model.Town{
		ID: 200, Name: "Ravensgate", SideID: 2, X: 200, Y: 200, Population: 9000,
	}
	s.Parties[10] = &model.Party{
		ID: 10, Name: "The Company", SideID: 1, LeaderID: 1,
		X: 100, Y: 100, Troops: 200,
	}
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Aunt Vi", SideID: 1, PartyID: 10, IsAlive: true,
	}
	s.Sides[1] = &model.Side{ID: 1, Name: "The Reach"}
	s.Sides[2] = &model.Side{ID: 2, Name: "The Marches"}
	return s
}

// fogServer is fogWorld with the visibility system running, so a test can tick the world
// and watch the fog move rather than only reading the block as it stands.
func fogServer(t *testing.T, st *model.State) *Server {
	t.Helper()
	cfg := testCfg(t)
	log := cause.NewLog(2000)
	engine := sim.NewEngine(cfg, log, 42, []sim.System{visibility.System()})
	return newServer(cfg, st, log, engine)
}

// frameFrom runs one broadcast and returns the bytes a subscriber would have been handed.
func frameFrom(t *testing.T, s *Server) []byte {
	t.Helper()
	ch := make(chan []byte, 4)
	s.registerWS(ch)
	defer s.unregisterWS(ch)
	s.broadcastTick()
	select {
	case msg := <-ch:
		return msg
	default:
		t.Fatal("broadcastTick sent nothing to a subscriber that was registered")
		return nil
	}
}

func decodeFrame(t *testing.T, msg []byte) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(msg, &out); err != nil {
		t.Fatalf("tick frame is not JSON: %v\n%s", err, msg)
	}
	return out
}

// fogOf pulls the fog block out of a decoded payload, failing rather than returning nil
// so that a missing block reads as "the frame has no fog" instead of a nil deref.
func fogOf(t *testing.T, payload map[string]any) map[string]any {
	t.Helper()
	fog, ok := payload["fog"].(map[string]any)
	if !ok {
		t.Fatalf("no fog block on the wire: %v", payload)
	}
	return fog
}

func TestTheTickFrameCarriesFog(t *testing.T) {
	s := fogServer(t, fogWorld())
	fog := fogOf(t, decodeFrame(t, frameFrom(t, s)))

	if got := fog["sideId"]; got != "side-1" {
		t.Errorf("fog.sideId = %v, want side-1: the frame must state whose visibility it is", got)
	}
	for _, key := range []string{"visibleTowns", "knownTowns", "unseenTowns"} {
		if _, ok := fog[key].([]any); !ok {
			t.Errorf("fog.%s is not a list: %v", key, fog[key])
		}
	}
}

// The regression this whole change exists for. Fog used to move only on a full snapshot
// read, so a town the party had just walked past stayed lit until something else
// happened to fetch a snapshot, and the map was a tick behind the party the whole time.
func TestFogMovesOnTheTickPathNotOnlyOnASnapshot(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)

	if got := fogOf(t, decodeFrame(t, frameFrom(t, s)))["unseenTowns"]; len(got.([]any)) != 2 {
		t.Fatalf("unseenTowns = %v, want both towns unseen before the party moves", got)
	}

	// The party marches to within sight of Millbrook and the world ticks.
	st.Parties[10].X, st.Parties[10].Y = 1.0, 0.0
	if err := s.tick(); err != nil {
		t.Fatalf("tick: %v", err)
	}

	fog := fogOf(t, decodeFrame(t, frameFrom(t, s)))
	visible, _ := fog["visibleTowns"].([]any)
	if len(visible) != 1 || visible[0] != "town-100" {
		t.Errorf("visibleTowns = %v, want [town-100] after the party marched into sight", visible)
	}
	known, _ := fog["knownTowns"].([]any)
	if len(known) != 1 || known[0] != "town-100" {
		t.Errorf("knownTowns = %v, want [town-100]: a town in sight has been found", known)
	}

	// And the snapshot must agree with the frame about the same instant, or the two
	// paths are two fog systems.
	snapFog := snapFogOf(t, s)
	if a, b := fog["visibleTowns"], snapFog["visibleTowns"]; !equalJSON(t, a, b) {
		t.Errorf("snapshot and tick frame disagree about visibleTowns: %v vs %v", a, b)
	}
}

func equalJSON(t *testing.T, a, b any) bool {
	t.Helper()
	ra, err := json.Marshal(a)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	rb, err := json.Marshal(b)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(ra) == string(rb)
}

// The frame's clock is the world's clock. It used to be a count of frames this process
// had pushed, which restarted at zero and drifted, and it was in a different unit from
// every `lastSeenTick` on the wire.
func TestTheFrameStatesTheSimulationsClock(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)

	frame := decodeFrame(t, frameFrom(t, s))
	if got, want := frame["tick"], float64(st.Tick); got != want {
		t.Errorf("frame tick = %v, want the simulation tick %v", got, want)
	}
	if got, want := frame["day"], float64(st.Tick%365); got != want {
		t.Errorf("frame day = %v, want %v: the same clock as snapshot.day", got, want)
	}

	// `day` is required, not decorative: the client refuses a frame without it, so a
	// frame without it is a frame that never reaches the screen.
	if _, ok := frame["day"]; !ok {
		t.Error("the frame carries no day, so the client will discard every one of them")
	}
}

// Every age in the fog block is a subtraction from this number, and nothing else on the
// wire is in its unit: `snapshot.day` is `Tick % 365` and wraps.
func TestTheFogBlockStatesTheTickItsAgesAreCountedIn(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	st.Tick += 17

	fog := fogOf(t, decodeFrame(t, frameFrom(t, s)))
	got, ok := fog["tick"].(float64)
	if !ok {
		t.Fatalf("fog.tick = %v, want a number: without it no remembered town has an age", fog["tick"])
	}
	if int(got) != st.Tick {
		t.Errorf("fog.tick = %v, want %d", got, st.Tick)
	}
}

func TestTheFogBlockAgesEveryKnownTownAndNoOthers(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	st.Parties[10].X, st.Parties[10].Y = 1.0, 0.0
	if err := s.tick(); err != nil {
		t.Fatalf("tick: %v", err)
	}

	// Ravensgate has never been near, so its age is nothing at all. Reporting -1 for it
	// would put a number in front of a town nobody has ever seen, which reads as
	// "seen long ago" rather than "never".
	fog := fogOf(t, decodeFrame(t, frameFrom(t, s)))
	lastSeen, ok := fog["lastSeen"].(map[string]any)
	if !ok {
		t.Fatalf("fog.lastSeen is not an object: %v", fog["lastSeen"])
	}
	if _, present := lastSeen["town-200"]; present {
		t.Error("a town this side has never found carries a last-seen tick")
	}
	seen, present := lastSeen["town-100"]
	if !present {
		t.Fatalf("the town the party is standing in has no age: %v", lastSeen)
	}
	if int(seen.(float64)) > st.Tick {
		t.Errorf("lastSeen = %v, which is later than the block's own tick %d", seen, st.Tick)
	}
}

// A sighting in the future, or one stamped at a negative tick, is not an age. Both would
// otherwise arrive as "seen N days ago" with N negative, and the client has no way to
// tell a clock that has not gone off from a town nobody has seen.
func TestTheFogBlockDropsAnAgeItCannotState(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	st.Towns[100].LastSeenTick = float64(st.Tick) + 5
	st.Towns[100].EverSeenSides = 1 << 0
	st.Towns[200].LastSeenTick = -1
	st.Towns[200].EverSeenSides = 1 << 0

	lastSeen, _ := fogOf(t, decodeFrame(t, frameFrom(t, s)))["lastSeen"].(map[string]any)
	if _, present := lastSeen["town-100"]; present {
		t.Error("a town stamped in the future carries a last-seen tick")
	}
	if _, present := lastSeen["town-200"]; present {
		t.Error("a town stamped never-seen carries a last-seen tick")
	}
}

// "Nobody is looking" and "there is nothing to see" are different claims, and a fog block
// with no vantage point in it has to say the first one on the tick path too — the tick
// frame is not a place where the distinction is allowed to go missing.
func TestTheTickFrameStillStatesNobodyLooking(t *testing.T) {
	st := fogWorld()
	st.Leaders[1].IsAlive = false
	s := fogServer(t, st)

	fog := fogOf(t, decodeFrame(t, frameFrom(t, s)))
	if got, present := fog["sideId"]; !present || got != nil {
		t.Errorf("fog.sideId = %v (present %t), want an explicit null", got, present)
	}
	counts, _ := fog["counts"].(map[string]any)
	for _, key := range []string{"visible", "known", "unseen"} {
		if got, present := counts[key]; !present || got != nil {
			t.Errorf("fog.counts.%s = %v (present %t), want an explicit null", key, got, present)
		}
	}
	// The clock still travels with the block: it is a fact about the world rather than
	// about this side, and a client that gets it cannot compute an age later.
	if _, ok := fog["tick"]; !ok {
		t.Error("fog.tick is missing from a no-vantage-point block")
	}
}

// Two frames from an unmoved world have to be byte-identical. Go randomises map
// iteration, so anything built by ranging a map without sorting produces two different
// encodings of the same reading, and a client that compares frames would see the world
// churning when nothing had happened.
func TestTwoFramesOfAnUnmovedWorldAreIdentical(t *testing.T) {
	s := fogServer(t, fogWorld())
	first := string(frameFrom(t, s))
	for i := 0; i < 8; i++ {
		if got := string(frameFrom(t, s)); got != first {
			t.Fatalf("frame %d differs from the first with nothing changed:\n%s\n%s", i, first, got)
		}
	}
}

func TestNoSubscribersMeansNoFrame(t *testing.T) {
	// Not a crash test for its own sake: the fog block is built per frame, so a server
	// with nobody watching must not pay for it. `broadcastTick` returning on an empty
	// registry is the whole of this test's requirement.
	s := fogServer(t, fogWorld())
	s.broadcastTick()
}

func TestTheSnapshotFogBlockCarriesTheSameFieldsAsTheFrame(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	snapFog := snapFogOf(t, s)
	frameFog := fogOf(t, decodeFrame(t, frameFrom(t, s)))

	// Compared field by field rather than by encoding the whole block, because the point
	// is that neither producer dropped a field the other one has.
	for _, key := range []string{
		"sideId", "sightRadiusKm", "sightRadiusLeagues", "sightingMemoryDays",
		"tick", "visibleTowns", "knownTowns", "unseenTowns", "lastSeen", "counts",
	} {
		if _, inSnapshot := snapFog[key]; !inSnapshot {
			t.Errorf("the snapshot's fog block has no %q", key)
		}
		if _, inFrame := frameFog[key]; !inFrame {
			t.Errorf("the tick frame's fog block has no %q", key)
		}
	}
}

// snapFogOf reads the snapshot's fog block back through JSON, so the assertion is about
// what a client receives rather than about the Go value that was put in the map.
func snapFogOf(t *testing.T, s *Server) map[string]any {
	t.Helper()
	raw, err := json.Marshal(buildSnapshot(s))
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	return fogOf(t, decoded)
}

// The client's validator refuses a fog list that is not an array, so an empty one has to
// marshal as `[]` and not as `null`.
func TestAnEmptyFogListMarshalsAsAList(t *testing.T) {
	fog := buildFog(fogServer(t, fogWorld()), -1, map[int]bool{}, map[int]bool{})
	raw, err := json.Marshal(fog)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, want := range []string{`"visibleTowns":[]`, `"knownTowns":[]`, `"unseenTowns":[]`, `"lastSeen":{}`} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("fog block marshals without %s:\n%s", want, raw)
		}
	}
}
