package battle

import (
	"fmt"

	"mbclone/simulation/internal/config"
)

// Phase is where a battle session is in its lifecycle.
//
// The phases are the session's promise to the client: a battle is created,
// its rosters are frozen, it fights, and it resolves, in that order and in no
// other. The sim's internal Battle knows nothing of phases; it only knows
// ticks. The session is what turns ticks into a lifecycle a campaign and a
// client can follow.
type Phase int

const (
	// PhaseStaging means the session exists but its rosters are not frozen.
	// Nothing has been simulated.
	PhaseStaging Phase = iota
	// PhaseDeployment means both rosters are frozen and the sim battle is
	// constructed, but no tick has run.
	PhaseDeployment
	// PhaseFighting means ticks are advancing.
	PhaseFighting
	// PhaseRout means a side's routed share crossed the rout threshold while
	// the fight continues. Informational: the sim still decides the ending.
	PhaseRout
	// PhaseResolved means the sim decided an outcome and the result is
	// recorded. Terminal.
	PhaseResolved
)

// String names the phase for reports and the API.
func (p Phase) String() string {
	switch p {
	case PhaseStaging:
		return "staging"
	case PhaseDeployment:
		return "deployment"
	case PhaseFighting:
		return "fighting"
	case PhaseRout:
		return "rout"
	case PhaseResolved:
		return "resolved"
	default:
		return "unknown"
	}
}

// phaseTransitions is the whole lifecycle as data. An illegal jump returns an
// error rather than silently proceeding, because a battle that skipped
// deployment would be a battle fought by rosters nobody froze.
var phaseTransitions = map[Phase][]Phase{
	PhaseStaging:    {PhaseDeployment},
	PhaseDeployment: {PhaseFighting},
	PhaseFighting:   {PhaseRout, PhaseResolved},
	PhaseRout:       {PhaseResolved},
	PhaseResolved:   {},
}

// PartyRef identifies a campaign party without importing the campaign. The
// session never reads campaign state; it only records who the parties were.
type PartyRef struct {
	// ID is the campaign's party id. Attacker and defender ids must differ.
	ID string
	// Name is free text for reports. It is never parsed.
	Name string
}

// FrozenRoster is a campaign party snapshotted at battle start. Troop counts,
// tiers, equipment, and commander identity are frozen here: nothing the
// campaign does after Deploy can reach into a battle already fighting.
type FrozenRoster struct {
	// Party is who this roster was taken from.
	Party PartyRef
	// Units is a deep copy of the force as supplied. Unit is a plain struct,
	// so the copy is total.
	Units []Unit
	// Leaders is a deep copy of the commanders.
	Leaders []Leader
	// Bodies is the roster's total troops, summed at freeze time.
	Bodies float64
}

// Session is the battle aggregate: id, phase, tick, participants, rosters,
// terrain seed, and outcome.
//
// A session is constructed from two campaign parties with no client involved:
// NewSession, then Deploy with the parties' units, then BeginFighting, then
// Advance until PhaseResolved. Every step validates its preconditions and
// every phase change goes through the transition table.
type Session struct {
	id       string
	phase    Phase
	tick     int
	attacker PartyRef
	defender PartyRef
	rosters  [2]FrozenRoster
	// terrainSeed names the ground the battle is fought on. The core only
	// models open terrain today; the seed is carried so the terrain-grid task
	// can generate from it without changing this contract.
	terrainSeed uint64
	// seed is the battle seed. Callers should derive it with DeriveBattleSeed;
	// the session records whatever it was given so a result can be reproduced.
	seed   uint64
	cfg    *config.Config
	battle *Battle
	// outcome and result are set when the sim decides the battle.
	outcome Outcome
	decided bool
	result  *Result
	// paused halts Advance; Step still works while paused.
	paused bool
	// rec is the recorder this session's battle is being recorded through, or nil
	// when it is not being recorded. It is held on the session rather than being
	// left inside the battle because the commander it wraps is replaceable and the
	// recording is not. See Record.
	rec *Recorder
	// ticksSinceCasualty counts consecutive ticks with no kills or wounds.
	// lastCasualtyTotal is the stat total it is measured against.
	ticksSinceCasualty int
	lastCasualtyTotal  float64
}

// NewSession creates a battle session in PhaseStaging.
//
// id names the session for the API and the logs; attacker and defender are the
// two campaign parties. terrainSeed and seed are recorded, not interpreted.
func NewSession(cfg *config.Config, id string, attacker, defender PartyRef, terrainSeed, seed uint64) (*Session, error) {
	if cfg == nil {
		return nil, newError(ErrNilConfig, "NewSession needs a balance config; the session holds it for the sim it will construct")
	}
	if id == "" {
		return nil, &Error{Kind: ErrInternal, Field: "id", Detail: "a battle session needs an id; the API uses it to route every later call"}
	}
	if attacker.ID == "" || defender.ID == "" {
		return nil, &Error{Kind: ErrInternal, Field: "parties", Detail: "both parties need campaign ids; a battle against nobody is a report, not a fight"}
	}
	if attacker.ID == defender.ID {
		return nil, &Error{Kind: ErrInternal, Field: "parties", Detail: fmt.Sprintf("attacker and defender share party id %q; a party cannot fight itself", attacker.ID)}
	}
	return &Session{
		id:          id,
		phase:       PhaseStaging,
		attacker:    attacker,
		defender:    defender,
		terrainSeed: terrainSeed,
		seed:        seed,
		cfg:         cfg,
	}, nil
}

// transition moves the session through the lifecycle table. Anything not in
// the table is an error, never a silent skip.
func (s *Session) transition(to Phase) error {
	for _, next := range phaseTransitions[s.phase] {
		if next == to {
			s.phase = to
			return nil
		}
	}
	return &Error{
		Kind:   ErrInternal,
		Field:  "phase",
		Detail: fmt.Sprintf("illegal phase jump %s -> %s; the lifecycle is staging -> deployment -> fighting -> [rout ->] resolved", s.phase, to),
	}
}

// Deploy freezes both rosters and constructs the sim battle, moving the
// session from staging to deployment.
//
// aUnits must all be SideA and bUnits all SideB; a side fighting for both
// armies is rejected rather than reinterpreted. The slices are deep-copied:
// later mutation by the caller cannot reach the frozen rosters.
func (s *Session) Deploy(aUnits, bUnits []Unit, leaders []Leader) error {
	if s.phase != PhaseStaging {
		return &Error{Kind: ErrInternal, Field: "phase", Detail: fmt.Sprintf("Deploy needs a staging session; this one is %s, and its rosters are already frozen", s.phase)}
	}
	for i, u := range aUnits {
		if u.Side != SideA {
			return &Error{Kind: ErrUnitInvalid, Side: SideA, UnitID: i, Field: "Side", Detail: "attacker roster holds a unit that does not fight for side A"}
		}
	}
	for i, u := range bUnits {
		if u.Side != SideB {
			return &Error{Kind: ErrUnitInvalid, Side: SideB, UnitID: i, Field: "Side", Detail: "defender roster holds a unit that does not fight for side B"}
		}
	}
	s.rosters[SideA.index()] = freezeRoster(s.attacker, aUnits, leaders, SideA)
	s.rosters[SideB.index()] = freezeRoster(s.defender, bUnits, leaders, SideB)

	setup := Setup{
		A:       s.rosters[SideA.index()].Units,
		B:       s.rosters[SideB.index()].Units,
		Leaders: append(append([]Leader{}, s.rosters[SideA.index()].Leaders...), s.rosters[SideB.index()].Leaders...),
		Terrain: TerrainOpen,
		Label:   fmt.Sprintf("%s vs %s", s.attacker.Name, s.defender.Name),
	}
	b, err := newBattle(s.cfg, s.seed, setup)
	if err != nil {
		return err
	}
	s.battle = b
	return s.transition(PhaseDeployment)
}

// freezeRoster copies a force and sums its bodies. Leaders are filtered to the
// side because a roster holds its own commanders.
func freezeRoster(party PartyRef, units []Unit, leaders []Leader, side Side) FrozenRoster {
	cp := make([]Unit, len(units))
	copy(cp, units)
	lc := make([]Leader, 0, len(leaders))
	for _, l := range leaders {
		if l.Side == side {
			lc = append(lc, l)
		}
	}
	var bodies float64
	for _, u := range cp {
		bodies += u.Troops
	}
	return FrozenRoster{Party: party, Units: cp, Leaders: lc, Bodies: bodies}
}

// Command hands the running battle a commander, which is how anything reaches a
// battle from outside it: a formation layer, a tactics AI, a script, a player's
// orders. Without this the session is a battle nobody can give an order to, and
// the only way to command one is RunCommanded, which fights the battle to its
// end in a single call and has no phases, no pause, and no step.
//
// It is the same seam RunCommanded uses, not a second one: the battle publishes
// the field to the commander once a tick and applies what comes back over the
// movements the intent stage staged, which is the order of operations a commander
// has to be able to rely on. A commander given here therefore behaves exactly as
// it would in a RunCommanded battle, and the formation layer is one such
// commander.
//
// When to call it is the caller's choice within two limits. Before Deploy there
// is no battle to command and the call is refused, because the view is sized
// against the forces the battle actually has. After the session is resolved
// there is nothing left to order and the call is refused too, because a
// commander attached to a finished battle would read as though its orders were
// being considered. Between those two points it may be called again to replace
// the commander: a session mid-battle is exactly where a player changes their
// mind, and refusing that would mean the orders of a battle could only ever be
// the ones chosen before it started.
//
// The view is allocated once, here, against the forces this battle has, and
// refilled in place on every tick by the battle. A commanded session allocates
// nothing per tick, which is the same promise RunCommanded makes.
func (s *Session) Command(cmd Commander) error {
	if cmd == nil {
		return &Error{Kind: ErrInternal, Field: "Commander",
			Detail: "Command needs a commander; nil would leave the battle being fought by nobody, which is " +
				"what a session with no commander already is. Pass the commander you want, or do not call this"}
	}
	if s.battle == nil {
		return &Error{Kind: ErrInternal, Field: "phase",
			Detail: fmt.Sprintf("Command needs a deployed session; this one is %s and has no field to publish yet", s.phase)}
	}
	if s.decided || s.phase == PhaseResolved {
		return &Error{Kind: ErrInternal, Field: "phase",
			Detail: fmt.Sprintf("Command needs a session that is still fighting; this one is %s (%s), and its "+
				"orders would be read by nobody", s.phase, s.outcome.Kind)}
	}
	if s.battle.hooks == nil {
		s.battle.hooks = &commandHooks{
			cmd:  s.rec.wrap(cmd),
			view: &View{Units: make([]UnitView, len(s.battle.units)), Commands: make([]UnitCommand, len(s.battle.units))},
		}
		return nil
	}
	// Replacing an existing commander. The view is already the right size and is
	// refilled every tick, so there is nothing to resize.
	//
	// On a recording session the recorder is what the battle calls, and the
	// commander is what the recorder calls. Swapping the commander therefore
	// changes what is recorded rather than stopping the recording, which is the
	// only reading that survives a player changing his mind mid-battle: a
	// recorder wrapped around the first commander records nothing after the first
	// swap, and the log it produces replays a battle that stopped being fought.
	s.battle.hooks.cmd = s.rec.wrap(cmd)
	return nil
}

// Record starts recording this session's orders and returns the log they go into.
//
// The recording belongs to the session rather than to the commander, and that is
// the whole point of it. A session battle is the only kind of battle that is
// watched: it has phases, it can be paused, it takes orders while it runs, and the
// commander behind it is replaceable at any tick. A recorder wrapped around one
// commander records that commander's orders and nothing after it is replaced, so
// the log of a battle whose player re-formed his line at tick 600 is a log of a
// battle that ended at tick 599. Holding the recorder here means every commander
// this session is later given is recorded, in one row stream, in tick order.
//
// bound is the log's row limit and zero means unbounded. A commander that orders
// every unit every tick writes a row per unit per tick, so a long battle fills a
// bounded log quickly; check Recorder.Refused or OrderLog.Truncated afterwards,
// because a log that reached its bound is not replayable and does not say so.
//
// Recording a session that is already recording is refused rather than quietly
// starting a second log: two logs of one battle cannot be merged into a replay,
// and a caller who has lost the first one has a bug rather than a request.
//
// It may be called before a commander exists, in which case the recording starts
// with the first commander the session is given, and a battle nobody commands
// records nothing, which is the honest log of a battle nobody commanded.
func (s *Session) Record(bound int, source string) (*OrderLog, error) {
	if s.battle == nil {
		return nil, &Error{Kind: ErrInternal, Field: "phase",
			Detail: fmt.Sprintf("Record needs a deployed session; this one is %s and has no field to record", s.phase)}
	}
	if s.decided || s.phase == PhaseResolved {
		return nil, &Error{Kind: ErrInternal, Field: "phase",
			Detail: fmt.Sprintf("Record needs a session that is still fighting; this one is %s (%s), and a "+
				"battle that has already been decided cannot be recorded after the fact", s.phase, s.outcome.Kind)}
	}
	if s.rec != nil {
		return nil, &Error{Kind: ErrInternal, Field: "Record",
			Detail: "this session is already recording; two logs of one battle cannot be merged into a replay, " +
				"so a caller who has lost the first has a bug rather than a request to record again"}
	}
	if bound < 0 {
		return nil, &Error{Kind: ErrInternal, Field: "bound",
			Detail: fmt.Sprintf("an order log bound of %d rows cannot be satisfied; zero means unbounded", bound)}
	}
	rec, log := NewRecorder(nil, bound, source)
	s.rec = rec
	// A commander already attached is recorded from this tick on. It was attached
	// before there was a recorder, so those ticks are not in this log, and the log
	// says so by starting here rather than pretending otherwise.
	//
	// The seam may not exist at all yet: recording a deployed session before it is
	// commanded is legal and is the order a caller naturally gets, because a battle
	// is deployed before anybody decides who is fighting it. In that case the
	// recorder is already on the session and Command will put it on the seam.
	if s.battle.hooks != nil {
		s.battle.hooks.cmd = s.rec.wrap(s.battle.hooks.cmd)
	}
	return log, nil
}

// Recorder returns the recorder this session records through, or nil when it is
// not recording. It is how a caller asks whether a log reached its bound, which
// is the one thing about a log that decides whether it is replayable at all.
func (s *Session) Recorder() *Recorder { return s.rec }

// wrap is the recorder's inside, or the commander itself when there is no
// recorder. A nil recorder is not special-cased at every call site because the
// two must not be able to disagree about what the battle calls.
func (r *Recorder) wrap(cmd Commander) Commander {
	if r == nil {
		return cmd
	}
	r.SetInner(cmd)
	return r
}

// Commanded reports whether a commander is attached to this battle, which is what
// a caller reads to tell a battle it is steering from one it is only watching.
func (s *Session) Commanded() bool {
	return s.battle != nil && s.battle.hooks != nil
}

// BeginFighting moves a deployed session into the fighting phase. Ticks only
// advance after this call; a deployed battle that never begins is a battle
// that never happened.
func (s *Session) BeginFighting() error {
	if s.phase != PhaseDeployment {
		return &Error{Kind: ErrInternal, Field: "phase", Detail: fmt.Sprintf("BeginFighting needs a deployed session; this one is %s", s.phase)}
	}
	return s.transition(PhaseFighting)
}

// Advance runs up to maxTicks ticks of the sim, then returns. Call it again
// to continue; a battle that needs more ticks than one call is not an error.
// When the sim decides the battle, the outcome and result are recorded and the
// session moves to resolved.
//
// While fighting, a side whose routed share crosses the configured rout
// threshold moves the session into the rout phase. That is informational: the
// sim still decides the ending by its own rules.
//
// Every tick runs through advanceOne: ending check, stalemate timeout,
// the sim tick, and the per-tick invariants. A paused session refuses
// Advance; use Step to move it one tick at a time.
func (s *Session) Advance(maxTicks int) error {
	if s.phase != PhaseFighting && s.phase != PhaseRout {
		return &Error{Kind: ErrInternal, Field: "phase", Detail: fmt.Sprintf("Advance needs a fighting session; this one is %s", s.phase)}
	}
	if s.paused {
		return &Error{Kind: ErrInternal, Field: "paused", Detail: "the session is paused; Resume it or Step it one tick at a time"}
	}
	if maxTicks < 1 {
		return &Error{Kind: ErrInternal, Field: "maxTicks", Detail: "Advance needs a tick budget of at least one; zero ticks would return a session that claims to have advanced"}
	}
	for i := 0; i < maxTicks; i++ {
		if err := s.advanceOne(); err != nil {
			return err
		}
		if s.phase == PhaseResolved {
			return nil
		}
	}
	return nil
}

// routObserved reports whether either side's routed share has crossed the
// configured rout threshold, using the same measure the ending rules use.
func (s *Session) routObserved() bool {
	b := s.battle
	c := b.c
	if routedBodies(b.units, SideA)/b.strengthStartA >= c.RoutStrengthFraction {
		return true
	}
	return routedBodies(b.units, SideB)/b.strengthStartB >= c.RoutStrengthFraction
}

// RecentEvents returns the last n battle events, oldest first, for the API's
// state endpoint and the stream. It returns a copy; the session's own list is
// never exposed for mutation.
func (s *Session) RecentEvents(n int) []Event {
	if s.battle == nil || n <= 0 {
		return nil
	}
	ev := s.battle.events
	if len(ev) > n {
		ev = ev[len(ev)-n:]
	}
	out := make([]Event, len(ev))
	copy(out, ev)
	return out
}

// EventsDropped counts events that did not fit the battle's bounded event
// list, so a client can tell it missed something.
func (s *Session) EventsDropped() int {
	if s.battle == nil {
		return 0
	}
	return s.battle.eventsDropped
}

// ID, Phase, Tick, Seed, and TerrainSeed expose the session's identity.
func (s *Session) ID() string          { return s.id }
func (s *Session) Phase() Phase        { return s.phase }
func (s *Session) Tick() int           { return s.tick }
func (s *Session) Seed() uint64        { return s.seed }
func (s *Session) TerrainSeed() uint64 { return s.terrainSeed }
func (s *Session) Attacker() PartyRef  { return s.attacker }
func (s *Session) Defender() PartyRef  { return s.defender }

// Roster returns the frozen roster for a side. The returned roster's slices
// are the session's own; callers must not mutate them.
func (s *Session) Roster(side Side) FrozenRoster { return s.rosters[side.index()] }

// Decided reports whether the sim has produced an outcome.
func (s *Session) Decided() bool { return s.decided }

// Outcome returns the decided outcome. It is only meaningful after Decided.
func (s *Session) Outcome() Outcome { return s.outcome }

// Result returns the full battle result. Nil until the session resolves.
func (s *Session) Result() *Result { return s.result }

// SideSummary is one side's running casualty picture for the API's state
// endpoint. Dead, Wounded, and Surrendered come from the sim's own accumulated
// stats; Routed is the current routed share of opening strength.
type SideSummary struct {
	Bodies      float64
	Dead        float64
	Wounded     float64
	Surrendered float64
	RoutedShare float64
}

// Summary returns the per-side casualty picture. Before the fight starts every
// figure but Bodies is zero, which is the honest answer: nothing has happened
// yet.
func (s *Session) Summary() [2]SideSummary {
	var out [2]SideSummary
	for _, side := range sides {
		i := side.index()
		out[i].Bodies = s.rosters[i].Bodies
		if s.battle == nil {
			continue
		}
		st := s.battle.stats
		out[i].Dead = st.Dead[i]
		out[i].Wounded = st.Wounded[i]
		out[i].Surrendered = st.Surrendered[i]
		var start float64
		if side == SideA {
			start = s.battle.strengthStartA
		} else {
			start = s.battle.strengthStartB
		}
		out[i].RoutedShare = routedBodies(s.battle.units, side) / start
	}
	return out
}
