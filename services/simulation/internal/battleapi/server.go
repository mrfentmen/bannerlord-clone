// Package battleapi is the HTTP surface for battle sessions.
//
// It exposes the plan's /v1/battle/* routes over a battle.Session: start,
// state, orders, stream, resolve, plus /v1/version. Pax's API server mounts
// the mux this package builds; this package owns no main and no port.
//
// A battle id is bound to the campaign session that started it. Every route
// but version takes the campaign session id and rejects a battle id that
// belongs to another session, so one campaign cannot drive another's battles.
//
// Forces are generated from the balance file for now. That is a stand-in:
// when the campaign service serves parties, start takes the parties' rosters
// instead of generating them. The session contract (frozen rosters, derived
// seed) does not change when the stand-in is replaced.
package battleapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// tickHz is the pump rate. Each wake advances fighting sessions by
// ticksPerWake, so the sim runs at tickHz*ticksPerWake ticks per second of
// wall time. The sim itself is fixed-timestep: wall pacing changes when a
// client sees a tick, never what the tick contains.
const (
	tickHz       = 10
	ticksPerWake = 2
)

// Server holds the battle sessions and serves the routes.
type Server struct {
	cfg          *config.Config
	campaignSeed uint64
	buildHash    string

	// store is where a resolved battle's record is written. It is a
	// battle.BattleStore, which is the same directory format `simrun replay
	// --battle <id>` reads, so a battle fought through this server is replayable
	// from the command line with no export step.
	store *battle.BattleStore
	// recordBound is the order log's row limit. See defaultOrderLogBound.
	recordBound int
	// warnedSave says the process has already complained about a record it could
	// not write. See saveRecord.
	warnedSave bool

	mu       sync.Mutex
	sessions map[string]*entry
	nextID   uint64
	// battleCounter feeds DeriveBattleSeed so no two battles share a seed.
	battleCounter uint64
}

// DefaultBattleDir is where this server writes battle records when nothing else
// is configured.
//
// It is deliberately the same string as simrun.DefaultBattleDir, and
// TestTheServersBattleDirIsTheOneSimrunReads exists because two constants that
// have to agree should not be two constants. A server recording somewhere else
// would produce records the replay CLI cannot find, which reads as "the replay
// path is broken" rather than as "the paths differ".
const DefaultBattleDir = "logs/battles"

// defaultOrderLogBound is how many order rows a battle's log may hold.
//
// Bounded, not unbounded, because a commanded session writes a row per group per
// tick: the 500 v 500 reference battle records 510265 rows in 76 MB, and a battle
// nobody ever resolves would keep growing. The bound is a ceiling and a log that
// reaches it says so — OrderLog.Truncated is published as order_log_truncated in
// the state response, and battle.SaveBattle REFUSES to save a truncated log
// rather than writing a record that can never be replayed. So the failure mode of
// hitting this is "that battle was not recorded", which is visible, and not "the
// battle was recorded wrongly", which would not be.
//
// A million rows is roughly two 500 v 500 battles of headroom, or about fifty
// times a 12 v 12 one. WithBattleStore's sibling WithOrderLogBound raises it.
const defaultOrderLogBound = 1 << 20

// resolveChunkTicks is how many ticks handleResolve advances before it lets go of
// the battle's lock.
//
// Ten, and it is a tick count rather than a time budget on purpose. A tick costs
// what the field costs — measured on this box at about 0.0052 s at 250 v 250 and
// 0.0477 s at 500 v 500 — so ten ticks is about 50 ms and 480 ms at the two sizes
// anyone runs, against the 5 s a reader is allowed to wait. A budget that expires
// mid-Advance cannot release the lock until the Advance returns, so a rule written
// in seconds would be a rule that only works below the size it was measured at.
const resolveChunkTicks = 10

type entry struct {
	// mu guards everything below, and it is PER BATTLE rather than per server.
	//
	// It used to be the server's single mutex, held across a whole
	// `for phase != resolved { Advance(1000) }`, which meant one player skipping to
	// the end of a battle stopped every other battle on the server for as long as
	// that battle took to decide — measured at 91.4 s of block on a 500 v 500,
	// during which 2 of about 365 polled state requests were served.
	//
	// What a per-battle lock buys is that a reader of an UNRELATED battle is never
	// waiting on this one at all, and a reader of THIS battle waits for one chunk of
	// ticks rather than for the battle. See resolveChunkTicks.
	//
	// The invariant is the one Go wants anyway: a session is not safe for
	// concurrent use, so every path that touches e.session holds this. s.mu guards
	// the MAP and nothing else.
	mu                 sync.Mutex
	session           *battle.Session
	campaignSessionID string
	orders            []loggedOrder
	lastErr           error
	created           time.Time

	// record is this battle's order log, or nil if recording never started or the
	// record has already been written and released. handleStart attaches the
	// recorder before the first tick, so this is non-nil for every battle this
	// server is still fighting.
	record *battle.OrderLog
	// The order log is by far the largest thing a finished battle holds — see
	// TestARecordedAndResolvedBattleCostsWhat, which measures 20.63 MB retained per
	// resolved and recorded 100 v 100 against a 0.76 MB floor for one that was never
	// fought — and once store.Save has written it to disk the file IS the log. So a
	// successful save releases it and keeps these four numbers, which is everything
	// the API reports about it. See saveRecord.
	recordRows      int
	recordTruncated bool
	recordHash      uint64
	recordRoster    uint64
	// released is set when the log has been handed to the store and dropped. It is
	// not the same as saved: a save that FAILED keeps the log, because then the file
	// does not have it and this is the only copy.
	released bool
	// unitsPerSide is the roster both sides were generated from, kept so the
	// record can name the force it describes. See saveRecord.
	unitsPerSide int
	// saved is set once the record has been written, so a battle that resolves
	// inside pump and is then asked to resolve again saves once rather than
	// twice. handleResolve is idempotent and must stay that way.
	saved bool
	// recordErr is why the record could not be written, if it could not be. It
	// is reported in the state response rather than turned into an error on the
	// request: a battle that was fought and decided must not be reported as
	// failed because a disk was full.
	recordErr string

	// standing is one side's standing formation orders, created by the first
	// order that names that side and amended by every one after it. It is
	// battle.Orders and not the wire's own {name, params} shape because a single
	// wire order is an AMENDMENT and cannot say everything: change-formation names
	// a shape and nothing about what it then does, advance says what it does and
	// names no shape at all. The standing orders are the whole of what a player
	// has in force, and they are per side because battle.Orders commands one side.
	//
	// A nil entry means no order has reached that side yet, and it is built on
	// demand rather than at handleStart: a battle nobody has ordered must stay a
	// battle nobody is commanding, so that an uncommanded battle is the same
	// battle the golden fixtures recorded.
	standing [2]*battle.Orders
}

// sideOf is the index into entry.standing for a side.
func sideIndex(side battle.Side) int {
	if side == battle.SideB {
		return 1
	}
	return 0
}

type loggedOrder struct {
	Name   battle.OrderName `json:"name"`
	Params map[string]any   `json:"params,omitempty"`
	Tick   int              `json:"tick"`
}

// New builds a Server. campaignSeed is the campaign's seed for battle-seed
// derivation; buildHash is reported by /v1/version (Pax's server injects the
// real one, "dev" until then).
//
// Every battle this server fights is RECORDED from its first tick, and a resolved
// one is written to DefaultBattleDir in the format `simrun replay --battle <id>`
// reads. That is not an extra feature; it is the only thing that makes the order
// log worth having. Before this, a battle fought through the shipped API produced
// no log, and an empty log replays cleanly because an empty log correctly means
// nobody commanded anything — so the recording defect could not surface as a
// replay mismatch, only as a game that ignored a player's orders and reported that
// it had not.
//
// Use WithBattleStore to put the records somewhere else, or nil to keep them in
// memory only. See defaultOrderLogBound for the one bound that applies.
func New(cfg *config.Config, campaignSeed uint64, buildHash string) *Server {
	if buildHash == "" {
		buildHash = "dev"
	}
	return &Server{
		cfg:          cfg,
		campaignSeed: campaignSeed,
		buildHash:    buildHash,
		store:        battle.OpenBattleStore(DefaultBattleDir),
		recordBound:  defaultOrderLogBound,
		sessions:     make(map[string]*entry),
	}
}

// WithBattleStore puts battle records in store instead of DefaultBattleDir. A nil
// store keeps the log in memory, where it is still reachable from the state
// response and still costs nothing to hold, but nothing is written and the battle
// is gone when the process is.
//
// It returns the server so a caller can chain it off New.
func (s *Server) WithBattleStore(store *battle.BattleStore) *Server {
	s.store = store
	return s
}

// WithOrderLogBound sets how many order rows a battle's log may hold. Zero is
// unbounded, which a long battle nobody resolves will eventually regret. See
// defaultOrderLogBound.
func (s *Server) WithOrderLogBound(rows int) *Server {
	s.recordBound = rows
	return s
}

// Handler returns the route mux. Mount it under / (it carries the /v1 prefix)
// or merge it into a larger mux; every route is namespaced already.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/battle/start", s.handleStart)
	mux.HandleFunc("GET /v1/battle/state", s.handleState)
	mux.HandleFunc("POST /v1/battle/orders", s.handleOrders)
	mux.HandleFunc("POST /v1/battle/resolve", s.handleResolve)
	mux.HandleFunc("GET /v1/battle/stream", s.handleStream)
	mux.HandleFunc("GET /v1/version", s.handleVersion)
	return mux
}

// Run pumps fighting sessions until ctx ends. One wake every 100ms advances
// each fighting session two ticks: 20 simulated ticks per wall second.
func (s *Server) Run(ctx context.Context) {
	t := time.NewTicker(time.Second / tickHz)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.pump()
		}
	}
}

func (s *Server) pump() {
	// The map is snapshotted under its own lock and RELEASED before any battle is
	// advanced. Holding it for the whole sweep would mean a 500 v 500 Advance(2) —
	// about 95 ms here — delays every lookup on the server, which is a hundredth
	// of the old problem and still not nothing.
	s.mu.Lock()
	type live struct {
		id string
		e  *entry
	}
	var all []live
	for id, e := range s.sessions {
		all = append(all, live{id, e})
	}
	s.mu.Unlock()

	for _, l := range all {
		l.e.mu.Lock()
		ph := l.e.session.Phase()
		if ph == battle.PhaseFighting || ph == battle.PhaseRout {
			if err := l.e.session.Advance(ticksPerWake); err != nil {
				l.e.lastErr = fmt.Errorf("battle %s: %w", l.id, err)
			}
		}
		// Battles that DECIDED on their own, rather than through handleResolve, are
		// saved here. A battle fought at the pump rate resolves without anybody
		// asking for it, and without this its record is never written — which would
		// make recording work only for the one path that already had a bug in it.
		if l.e.session.Phase() == battle.PhaseResolved {
			s.saveRecord(l.id, l.e)
		}
		l.e.mu.Unlock()
	}
}

// saveRecord writes a resolved battle's order log, setup, seed and result into the
// store, once.
//
// It is called with the entry's own lock held, from both pump and handleResolve,
// and it does no locking of its own. Every failure is kept on the entry rather
// than returned, because the caller is a route handler for a battle that has
// already been fought and decided: there is nothing left to refuse.
//
// The record is the session's own Setup and its own seed, which is why gaps (a)
// and (c) in the CHANGELOG entry for this had to be closed first. Before
// Session.Setup existed the only Setup available here was one assembled from the
// frozen rosters, and its Label — which Result.Hash folds in — was a private
// format string to be guessed. A record saved with the wrong label replays to a
// different hash for a bit-identical battle, and every other number in it agrees.
func (s *Server) saveRecord(id string, e *entry) {
	if e.saved || e.record == nil || s.store == nil {
		return
	}
	e.saved = true
	res := e.session.Result()
	if res == nil {
		e.recordErr = "the battle resolved without a result to record"
		return
	}
	roster := battle.Roster{Units: e.unitsPerSide}
	rec := &battle.Recording{
		Seed:          e.session.Seed(),
		ConfigVersion: s.cfg.Version,
		Setup:         e.session.Setup(),
		Log:           e.record,
	}
	if err := s.store.Save(id, roster, roster, res, rec); err != nil {
		e.recordErr = err.Error()
		// Said once, to the process's stderr, and then never again.
		//
		// record_error is in the state response, so a CLIENT can see that a battle
		// was not recorded. An OPERATOR cannot: nobody is polling /v1/battle/state
		// for a field, and the failure modes are the boring ones — a working
		// directory that is not writable, a full disk, a read-only mount. Without
		// this the game runs for days with recording silently off and the first
		// sign of it is a battle somebody wanted to look at again.
		//
		// Once per server rather than once per battle, because a full disk would
		// otherwise print one line per battle fought, which is its own way of
		// filling the disk with the news that the disk is full.
		if !s.warnedSave {
			s.warnedSave = true
			where := fmt.Sprintf("the store is %q", s.store.Root())
			if !filepath.IsAbs(s.store.Root()) {
				// The default is relative, and a relative store that cannot be written
				// is almost always a working directory that is not what whoever
				// started the process assumed. Saying so is the difference between a
				// diagnosis and a shrug.
				where += ", relative to the process's working directory"
			}
			log.Printf("battleapi: battle %s could not be recorded and later ones will not be "+
				"either until this is fixed: %v\n  %s. The battles themselves are unaffected; this "+
				"only means they cannot be replayed later. The first such battle's "+
				"GET /v1/battle/state carries record_error.", id, err, where)
		}
		return
	}
	// The file is the log now. Keeping the in-memory copy as well is what makes a
	// long-running server's heap a function of how many battles it has ever fought,
	// and the log is the part of that which is large — a 100 v 100 battle with a
	// wedge holds 165777 rows. The four numbers below are everything the state
	// response says about the log, and they are what a later reader needs to know it
	// was complete.
	//
	// The release has to come from the SESSION, not from here. Setting e.record to
	// nil was tried first and freed nothing, because the session reaches the same log
	// through its recorder; that version measured 20.63 MB a battle afterwards, to
	// two decimal places, exactly as before. TestARecordedAndResolvedBattleCostsWhat
	// is what caught it.
	e.recordRows = e.record.Len()
	e.recordTruncated = e.record.Truncated()
	e.recordHash = e.record.Hash()
	e.recordRoster = e.record.RosterHash()
	e.session.ReleaseRecord()
	e.record = nil
	e.released = true
}

// lookup returns the entry for a battle id, enforcing the campaign-session
// binding. A battle id from another session is rejected, never served.
func (s *Server) lookup(battleID, campaignSessionID string) (*entry, *apiError) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.sessions[battleID]
	if !ok {
		return nil, &apiError{http.StatusNotFound, "unknown_battle", fmt.Sprintf("no battle %q", battleID)}
	}
	if e.campaignSessionID != campaignSessionID {
		return nil, &apiError{http.StatusForbidden, "wrong_session",
			fmt.Sprintf("battle %q belongs to another campaign session", battleID)}
	}
	return e, nil
}

type apiError struct {
	Status  int
	Code    string
	Message string
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeAPIError(w http.ResponseWriter, e *apiError) {
	writeJSON(w, e.Status, map[string]any{
		"error": map[string]string{"code": e.Code, "message": e.Message},
	})
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeAPIError(w, &apiError{http.StatusBadRequest, "bad_json", "request body is not valid JSON: " + err.Error()})
		return false
	}
	return true
}

// --- /v1/battle/start ---

type startOptions struct {
	// UnitsPerSide is how many units each force generates. Default 50.
	UnitsPerSide int `json:"units_per_side"`
}

type startRequest struct {
	CampaignSessionID string       `json:"campaign_session_id"`
	AttackerPartyID   string       `json:"attacker_party_id"`
	AttackerPartyName string       `json:"attacker_party_name"`
	DefenderPartyID   string       `json:"defender_party_id"`
	DefenderPartyName string       `json:"defender_party_name"`
	Options           startOptions `json:"options"`
}

func (s *Server) handleStart(w http.ResponseWriter, r *http.Request) {
	var req startRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.CampaignSessionID == "" {
		writeAPIError(w, &apiError{http.StatusBadRequest, "missing_session", "campaign_session_id is required"})
		return
	}
	// Invalid party ids never produce a battle: 400, not a session.
	if req.AttackerPartyID == "" || req.DefenderPartyID == "" {
		writeAPIError(w, &apiError{http.StatusBadRequest, "bad_party",
			"attacker_party_id and defender_party_id are both required"})
		return
	}
	if req.AttackerPartyID == req.DefenderPartyID {
		writeAPIError(w, &apiError{http.StatusBadRequest, "bad_party",
			"a party cannot fight itself"})
		return
	}
	units := req.Options.UnitsPerSide
	if units <= 0 {
		units = 50
	}
	if units > 500 {
		writeAPIError(w, &apiError{http.StatusBadRequest, "too_large",
			"units_per_side is capped at 500; use the battle-size config for larger fights"})
		return
	}

	// The map lock is taken for the id and the seed and then released, so the
	// sim work below does not sit inside it. Everything after this point is about
	// ONE battle and belongs to that battle's own lock.
	s.mu.Lock()
	s.nextID++
	s.battleCounter++
	id := fmt.Sprintf("btl-%d", s.nextID)
	seed := battle.DeriveBattleSeed(s.campaignSeed, s.battleCounter, req.AttackerPartyID, req.DefenderPartyID)
	s.mu.Unlock()

	attacker := battle.PartyRef{ID: req.AttackerPartyID, Name: req.AttackerPartyName}
	defender := battle.PartyRef{ID: req.DefenderPartyID, Name: req.DefenderPartyName}
	sess, err := battle.NewSession(s.cfg, id, attacker, defender, 0, seed)
	if err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "session", err.Error()})
		return
	}
	aUnits, dUnits, leaders, err := SessionForces(s.cfg, seed, units)
	if err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "roster", err.Error()})
		return
	}
	if err := sess.Deploy(aUnits, dUnits, leaders); err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "deploy", err.Error()})
		return
	}
	e := &entry{session: sess, campaignSessionID: req.CampaignSessionID, created: time.Now(), unitsPerSide: units}
	// Recording starts BEFORE BeginFighting, so the log covers the whole battle.
	// Calling it after would be legal and would lose exactly the ticks between
	// deployment and the first order, which are the ticks a player's first order
	// most needs to be replayed against.
	//
	// A recorder that will not attach does not stop the battle. This is the one
	// place where failing to record must not fail to fight: the player asked for a
	// battle, and a battle they cannot have because the log was full is worse than
	// a battle whose log is short. The failure is kept on the entry and published
	// as record_error, so it is visible in the state response rather than silent.
	if log, err := sess.Record(s.recordBound, "battle-server "+id); err != nil {
		e.recordErr = "the order log did not start: " + err.Error()
	} else {
		e.record = log
	}
	if err := sess.BeginFighting(); err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "begin", err.Error()})
		return
	}
	// Published last, and only once it can be served: a reader that found the entry
	// mid-construction would find a session with no commander and no recorder.
	s.mu.Lock()
	s.sessions[id] = e
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, map[string]any{
		"battle_id": id,
		"phase":     sess.Phase().String(),
		"tick":      sess.Tick(),
		"seed":      seed,
	})
}

// --- /v1/battle/state ---

type eventDTO struct {
	Seq   int     `json:"seq"`
	Tick  int     `json:"tick"`
	Side  string  `json:"side"`
	Kind  string  `json:"kind"`
	Unit  int     `json:"unit"`
	Value float64 `json:"value"`
	Read  string  `json:"read"`
	Note  string  `json:"note"`
}

type sideDTO struct {
	PartyID     string  `json:"party_id"`
	PartyName   string  `json:"party_name"`
	Bodies      float64 `json:"bodies"`
	Dead        float64 `json:"dead"`
	Wounded     float64 `json:"wounded"`
	Surrendered float64 `json:"surrendered"`
	RoutedShare float64 `json:"routed_share"`
}

func eventDTOs(evs []battle.Event) []eventDTO {
	out := make([]eventDTO, len(evs))
	for i, e := range evs {
		out[i] = eventDTO{
			Seq: e.Seq, Tick: e.Tick, Side: e.Side.String(),
			Kind: e.Kind.String(), Unit: e.Unit, Value: e.Value,
			Read: e.Read, Note: e.Note,
		}
	}
	return out
}

func (s *Server) stateOf(e *entry) map[string]any {
	sess := e.session
	sum := sess.Summary()
	sides := make([]sideDTO, 0, 2)
	for i, side := range []battle.Side{battle.SideA, battle.SideB} {
		r := sess.Roster(side)
		sm := sum[i]
		sides = append(sides, sideDTO{
			PartyID: r.Party.ID, PartyName: r.Party.Name,
			Bodies: sm.Bodies, Dead: sm.Dead, Wounded: sm.Wounded,
			Surrendered: sm.Surrendered, RoutedShare: sm.RoutedShare,
		})
	}
	out := map[string]any{
		"battle_id":      sess.ID(),
		"phase":          sess.Phase().String(),
		"tick":           sess.Tick(),
		"seed":           sess.Seed(),
		"sides":          sides,
		"recent_events":  eventDTOs(sess.RecentEvents(20)),
		"events_dropped": sess.EventsDropped(),
		"orders_logged":  len(e.orders),
	}
	if sess.Decided() {
		o := sess.Outcome()
		out["outcome"] = map[string]string{"kind": o.Kind.String(), "reason": o.Reason.String()}
	}
	// What the record is doing, because "orders_logged" says how many orders were
	// ACCEPTED and nothing about whether the battle they were given to is
	// reproducible. Those are different questions and a client that cannot tell them
	// apart is a client being told a battle was recorded when it may not have been.
	out["order_log_rows"] = e.recordRows
	out["order_log_truncated"] = e.recordTruncated
	out["record_saved"] = e.saved && e.recordErr == ""
	switch {
	case e.recordErr != "":
		out["record_saved"] = false
		out["record_error"] = e.recordErr
	case !e.saved:
		out["record_error"] = "this battle is still fighting; its record is written when it resolves"
	case s.store == nil:
		out["record_error"] = "the battle's order log is in memory only; no battle store is configured"
	case e.released:
		out["record_error"] = ""
		// The log's two digests, so the numbers in this response can be CHECKED
		// against the record on disk rather than taken on trust. OrderHash is in the
		// record's index and RosterHash is what battle.Replay refuses a mismatch
		// against; publishing them here means a reader holding both can compare them
		// without opening the file.
		// %016x is battle's own hashHex format — sixteen lowercase hex digits, no
		// prefix — so a digest here, in the record file and in a verdict are the
		// same string in all three places. battle.formatHash is unexported and
		// exporting it for two call sites would be a wider change than this.
		out["order_log_hash"] = fmt.Sprintf("%016x", e.recordHash)
		out["order_log_roster"] = fmt.Sprintf("%016x", e.recordRoster)
	}
	if e.record != nil {
		// Still being recorded, so these are live. They are also what a battle that
		// is being fought reports, and a client watching a fight should see its log
		// grow rather than sit at zero until the end.
		out["order_log_rows"] = e.record.Len()
		out["order_log_truncated"] = e.record.Truncated()
		out["record_saved"] = false
	}
	if e.lastErr != nil {
		out["sim_error"] = e.lastErr.Error()
	}
	return out
}

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	e, apiErr := s.lookup(q.Get("battle_id"), q.Get("campaign_session_id"))
	if apiErr != nil {
		writeAPIError(w, apiErr)
		return
	}
	e.mu.Lock()
	state := s.stateOf(e)
	e.mu.Unlock()
	writeJSON(w, http.StatusOK, state)
}

// SessionForces generates both sides and their leaders for a battle from ONE seed.
//
// It is exported and it is the only implementation, because the previous shape
// was three seed derivations written inline in handleStart and hand-copied into a
// test in another package, and the copy is what made the defect invisible: fixing
// the handler did nothing to the test that claimed to be testing the handler.
//
// ONE seed is what makes a battle recordable. A recording stores one seed and
// reproduces the force from it, because GenerateForce separates the two sides
// itself through its own Derive("roster-SideA")/Derive("roster-SideB") substreams.
// handleStart used to pass side B `seed^0x9E3779B97F4A7C15` and the two leader
// sets `seed^0x12345` and `seed^0x67890`, so three derivations existed where the
// format has room for one, and a battle fought here could be recorded but never
// replayed: 650 ticks recorded against 869 replayed, first difference at the tick
// count. Nothing in that mismatch said "wrong seed", so a battle nobody had
// written down properly read as a corrupt battle.
//
// The leader count and the influence come from the balance file the way
// battle.Script.Setup reads them, rather than as the literals 1 and 0.7 that were
// here, because CONSTITUTION.md 1.2 makes the balance file the only source of a
// constant and a 0.7 written into this function would quietly disagree with the
// file the day somebody tuned it.
func SessionForces(cfg *config.Config, seed uint64, unitsPerSide int) ([]battle.Unit, []battle.Unit, []battle.Leader, error) {
	roster := battle.Roster{Units: unitsPerSide}
	a, err := battle.GenerateForce(cfg, seed, battle.SideA, roster)
	if err != nil {
		return nil, nil, nil, err
	}
	b, err := battle.GenerateForce(cfg, seed, battle.SideB, roster)
	if err != nil {
		return nil, nil, nil, err
	}
	influence := cfg.Battle.MoraleLeaderInfluenceReference
	leaders := append(
		battle.GenerateLeaders(cfg, seed, battle.SideA, battle.LeaderCount(cfg, unitsPerSide), influence),
		battle.GenerateLeaders(cfg, seed, battle.SideB, battle.LeaderCount(cfg, unitsPerSide), influence)...,
	)
	return a, b, leaders, nil
}

// --- /v1/battle/orders ---

type orderRequest struct {
	BattleID          string `json:"battle_id"`
	CampaignSessionID string `json:"campaign_session_id"`
	Orders            []struct {
		Name   string         `json:"name"`
		Params map[string]any `json:"params"`
		// Side names which army the order is for: "attacker" or "defender",
		// also accepted as "A" and "B". It is optional and defaults to the
		// attacker, because the campaign session that started the battle is
		// driving it and a player orders their own side first. An order for the
		// enemy is legal and is occasionally what a commander wants.
		//
		// This field is the wire-format decision this endpoint did not used to
		// have. An order used to be {name, params} with nothing saying whose it
		// was, and battle.Orders commands exactly one side, so the field is not
		// optional information but the thing that was missing.
		Side string `json:"side"`
		// Units optionally names the field unit ids the order is for. It defaults
		// to every unit on the side, which is the common case: an order to the
		// whole army should not have to spell out a hundred ids. ids are as
		// /v1/battle/state reports them, in unit_ids.
		Units []int `json:"units"`
	} `json:"orders"`
}

// Orders are validated against the fourteen-order set and then PUT INTO FORCE.
// The order is applied to that side's standing orders and the standing orders
// are attached to the session, which is the seam battle.Session.Command is.
// Before this, a validated order was appended to a log and nothing read the log,
// so a player could send the whole palette and watch a battle that ignored it.
//
// The response says what happened per order rather than one accepted count,
// because "accepted: 5" is exactly what the old version returned while none of
// the five reached the engine.
func (s *Server) handleOrders(w http.ResponseWriter, r *http.Request) {
	var req orderRequest
	if !decodeBody(w, r, &req) {
		return
	}
	e, apiErr := s.lookup(req.BattleID, req.CampaignSessionID)
	if apiErr != nil {
		writeAPIError(w, apiErr)
		return
	}
	// The BATTLE's lock, not the server's: sending orders to one battle must not
	// wait behind a resolve of another, and this is the request a player makes
	// mid-fight, so it is the one whose latency they feel.
	e.mu.Lock()
	defer e.mu.Unlock()

	// Everything is validated and applied before anything is attached, and a
	// failure part-way through restores the standing orders it had already
	// amended. A client sending five orders where the third is nonsense must not
	// get two of them applied and a 400: the request either happens or it does
	// not, and the response says which.
	snapshot := snapshotStanding(e)
	applied := make([]appliedOrder, 0, len(req.Orders))
	touched := map[int]bool{}
	for i, o := range req.Orders {
		name := battle.OrderName(o.Name)
		if !battle.ValidOrder(name) {
			restoreStanding(s.cfg, e, snapshot)
			writeOrderError(w, i, "unknown_order",
				fmt.Sprintf("order %q is not one of the fourteen formation orders", o.Name),
				orderNamesAsStrings(battle.ValidOrders()))
			return
		}
		side, err := sideFromWire(o.Side)
		if err != nil {
			restoreStanding(s.cfg, e, snapshot)
			writeOrderError(w, i, "unknown_side", err.Error(), []string{"attacker", "defender"})
			return
		}
		params, err := paramsFromWire(o.Params)
		if err != nil {
			restoreStanding(s.cfg, e, snapshot)
			writeOrderError(w, i, "bad_params", err.Error(), nil)
			return
		}
		units, err := unitsForOrder(e, side, o.Params, o.Units)
		if err != nil {
			restoreStanding(s.cfg, e, snapshot)
			writeOrderError(w, i, "bad_units", err.Error(), nil)
			return
		}

		idx := sideIndex(side)
		if e.standing[idx] == nil {
			// A force generated by this package has no formations: GenerateForce
			// makes units, and a group is something a player's order creates. So the
			// first order to reach a side has to be the one that gives its men a
			// shape, because battle.Orders refuses an order to men who have none
			// rather than forming them into a line nobody asked for. That refusal is
			// the layer's deliberate choice and this handler does not paper over it
			// by inventing a shape; it says which order to send instead, because
			// "group 0 is ordered into none, which is not a shape" is a true answer
			// to a question the client did not know it was asking.
			if name != battle.OrderChangeFormation {
				restoreStanding(s.cfg, e, snapshot)
				writeOrderError(w, i, "needs_a_shape",
					fmt.Sprintf("order %q cannot be the first order to the %s: its men have no "+
						"formation yet, and a movement order to men who have no shape is refused "+
						"rather than guessed at. Send change-formation with a shape first — "+
						"params {\"shape\": \"line\"} — and this order will apply to it.",
						o.Name, side.String()),
					[]string{string(battle.OrderChangeFormation)})
				return
			}
			standing, err := battle.NewOrders(s.cfg, side, nil)
			if err != nil {
				restoreStanding(s.cfg, e, snapshot)
				writeOrderError(w, i, "no_standing_orders", err.Error(), nil)
				return
			}
			e.standing[idx] = standing
		}
		if err := e.standing[idx].Apply(name, params, units); err != nil {
			restoreStanding(s.cfg, e, snapshot)
			// The engine refuses four of the fourteen by name and says which
			// stage each belongs to. Passing that message through is the point:
			// an order the sim cannot carry out is refused here rather than
			// accepted and dropped.
			writeOrderError(w, i, "order_refused", err.Error(), nil)
			return
		}
		touched[idx] = true
		applied = append(applied, appliedOrder{Name: o.Name, Side: side.String(), Tick: e.session.Tick()})
		e.orders = append(e.orders, loggedOrder{
			Name:   name,
			Params: o.Params,
			Tick:   e.session.Tick(),
		})
	}

	// One attach per touched side, after every order is in force, so a batch
	// costs one commander rebuild rather than one per order. A session has ONE
	// commander: attaching the defender's orders replaces the attacker's, which
	// is the seam's shape and is stated in playerorders.go. Both sides commanded
	// at once is not something this endpoint can express, and the response says
	// which sides are actually in charge rather than implying all of them are.
	var inCharge []string
	for idx := range touched {
		side := battle.SideA
		if idx == 1 {
			side = battle.SideB
		}
		if err := e.standing[idx].Attach(e.session); err != nil {
			restoreStanding(s.cfg, e, snapshot)
			writeAPIError(w, &apiError{http.StatusInternalServerError, "attach", err.Error()})
			return
		}
		inCharge = append(inCharge, side.String())
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"battle_id": req.BattleID,
		"accepted":  len(req.Orders),
		"orders":    applied,
		// Empty means nothing was attached, which for an empty request is the
		// truth and not an omission.
		"commanding": inCharge,
	})
}

// appliedOrder is what one order did, as distinct from what it was called.
type appliedOrder struct {
	Name string `json:"name"`
	Side string `json:"side"`
	Tick int    `json:"tick"`
}

// writeOrderError names the order in the request that failed. A client sending
// five orders learns which one and why, rather than a 400 with no address in it.
func writeOrderError(w http.ResponseWriter, index int, code, message string, valid []string) {
	body := map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
		"order_index": index,
	}
	if valid != nil {
		body["valid"] = valid
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(body)
}

// orderNamesAsStrings renders the closed order set for a JSON body. The engine's
// own type is battle.OrderName, which is what the sim validates against, and a
// wire body wants the words a client would type.
func orderNamesAsStrings(names []battle.OrderName) []string {
	out := make([]string, 0, len(names))
	for _, n := range names {
		out = append(out, string(n))
	}
	return out
}

// snapshotStanding captures both sides' standing orders so a batch that fails
// part-way can be rolled back. Groups returns a deep copy, and NewOrders rebuilds
// from one, so this needs nothing from battle.Orders that is not already public.
func snapshotStanding(e *entry) [2][]battle.Group {
	var out [2][]battle.Group
	for i := range e.standing {
		if e.standing[i] == nil {
			continue
		}
		out[i] = e.standing[i].Groups()
	}
	return out
}

// restoreStanding puts the snapshot back. A side that had no standing orders
// before the failed batch has none again, so a refused request leaves the battle
// exactly as it found it.
func restoreStanding(cfg *config.Config, e *entry, snap [2][]battle.Group) {
	for i, side := range []battle.Side{battle.SideA, battle.SideB} {
		if e.standing[i] == nil {
			continue
		}
		if snap[i] == nil {
			e.standing[i] = nil
			continue
		}
		rebuilt, err := battle.NewOrders(cfg, side, snap[i])
		if err == nil {
			e.standing[i] = rebuilt
		}
	}
}

// sideFromWire reads the side an order is for, defaulting to the attacker.
func sideFromWire(s string) (battle.Side, error) {
	switch s {
	case "", "attacker", "A", "a":
		return battle.SideA, nil
	case "defender", "B", "b":
		return battle.SideB, nil
	}
	return battle.SideA, fmt.Errorf("side %q is not one of attacker, defender", s)
}

// paramsFromWire reads the engine's typed parameters out of the wire's map.
//
// This handler owns the wire format, which is what battle.OrderParams' own
// comment says it is for: the sim does not decode JSON and a map[string]any
// reaching the tick loop would put a string comparison between a player's order
// and the geometry it produces. The keys are the ones the campaign client
// already sends — shape, angle_deg, target_formation_id — plus the sim's own
// names, because both spellings are in the wild and neither is wrong.
//
// angle_deg is degrees because that is what the client's drag arrow produces, and
// the engine wants radians counter-clockwise from +X, so the conversion is here
// where the wire format lives rather than being asked of the engine.
func paramsFromWire(m map[string]any) (battle.OrderParams, error) {
	var p battle.OrderParams
	str := func(key string) (string, bool, error) {
		v, ok := m[key]
		if !ok || v == nil {
			return "", false, nil
		}
		s, ok := v.(string)
		if !ok {
			return "", true, fmt.Errorf("%s is %T, which is not a string", key, v)
		}
		return s, true, nil
	}
	num := func(key string) (float64, bool, error) {
		v, ok := m[key]
		if !ok || v == nil {
			return 0, false, nil
		}
		f, ok := v.(float64)
		if !ok {
			return 0, true, fmt.Errorf("%s is %T, which is not a number", key, v)
		}
		return f, true, nil
	}

	// The shape, under either the client's key or the sim's.
	for _, key := range []string{"shape", "formation"} {
		if s, present, err := str(key); err != nil {
			return p, err
		} else if present {
			p.Formation = s
		}
	}

	// The bearing, in degrees under the client's key and radians under the sim's.
	// The two are told apart by the key rather than guessed from the magnitude,
	// because 180 is a plausible number of radians and 0 is a plausible number
	// of degrees and neither is nonsense.
	if deg, present, err := num("angle_deg"); err != nil {
		return p, err
	} else if present {
		p.Bearing, p.HasFacing = deg*math.Pi/180, true
	}
	if rad, present, err := num("bearing"); err != nil {
		return p, err
	} else if present {
		p.Bearing, p.HasFacing = rad, true
	}

	// The point, in metres.
	gotPoint := false
	for _, key := range []string{"x", "target_x"} {
		if v, present, err := num(key); err != nil {
			return p, err
		} else if present {
			p.X, gotPoint = v, true
		}
	}
	for _, key := range []string{"y", "target_y"} {
		if v, present, err := num(key); err != nil {
			return p, err
		} else if present {
			p.Y, gotPoint = v, true
		}
	}
	p.HasPoint = gotPoint

	// The spacing, as a fraction of the balance file's own.
	for _, key := range []string{"spacing", "scale"} {
		if v, present, err := num(key); err != nil {
			return p, err
		} else if present {
			p.Spacing, p.HasSpacing = v, true
		}
	}

	// The group to follow, as the client's formation id or a plain index.
	for _, key := range []string{"target_formation_id", "follow_group"} {
		s, present, err := str(key)
		if err != nil {
			return p, err
		}
		if !present {
			continue
		}
		n, convErr := strconv.Atoi(s)
		if convErr != nil {
			if v, isNum, numErr := num(key); numErr == nil && isNum {
				n, convErr = int(v), nil
			}
		}
		if convErr != nil {
			return p, fmt.Errorf("%s is %q, which is not a formation index", key, s)
		}
		p.FollowGroup, p.HasFollow = n, true
	}
	return p, nil
}

// unitsForOrder resolves which men an order is for.
//
// Three ways to say it, in the order they are preferred: the wire's own units
// list, then the params' formation_id naming a group index, then the whole side.
// The whole side is also what battle.Orders means by an empty list, but the FIRST
// order for a side has no groups yet and an empty list there is a refusal, so
// the default is spelled out as every id on the side rather than left empty.
func unitsForOrder(e *entry, side battle.Side, params map[string]any, units []int) ([]int, error) {
	if len(units) > 0 {
		return units, nil
	}
	all := unitIDsFor(e.session, side)
	if raw, ok := params["formation_id"]; ok && raw != nil {
		s, isStr := raw.(string)
		if !isStr {
			return nil, fmt.Errorf("formation_id is %T, which is not a string", raw)
		}
		idx, err := strconv.Atoi(s)
		if err != nil {
			return nil, fmt.Errorf("formation_id is %q, which is not a formation index", s)
		}
		groups := e.standing[sideIndex(side)]
		if groups == nil {
			return nil, fmt.Errorf("formation_id %d names a formation of a side nobody has ordered "+
				"yet, so there are none to name; send units or omit formation_id for the whole side", idx)
		}
		g := groups.Groups()
		if idx < 0 || idx >= len(g) {
			return nil, fmt.Errorf("formation_id %d is not one of the %d formations this side has", idx, len(g))
		}
		return g[idx].Units, nil
	}
	return all, nil
}

// unitIDsFor is every field unit id on a side.
//
// A session numbers both sides into ONE dense id space, so the field ids are not
// the roster's own: side A keeps 0..len(A)-1 and side B is renumbered to
// len(A)..len(A)+len(B)-1. That is a fact about newBattle, not about this
// package, and getting it wrong would order the wrong men. It is safe to be
// wrong about here in a way it would not otherwise be, because battle.Orders
// refuses an order naming units of the other side BY NAME — so a wrong offset
// produces a loud refusal rather than a battle where the enemy obeys the player's
// order. TestOrdersReachTheSideTheyName pins it rather than trusting the comment.
func unitIDsFor(sess *battle.Session, side battle.Side) []int {
	a := len(sess.Roster(battle.SideA).Units)
	b := len(sess.Roster(battle.SideB).Units)
	var n, base int
	if side == battle.SideA {
		n, base = a, 0
	} else {
		n, base = b, a
	}
	ids := make([]int, 0, n)
	for i := 0; i < n; i++ {
		ids = append(ids, base+i)
	}
	return ids
}

// --- /v1/battle/resolve ---

type resolveRequest struct {
	BattleID          string `json:"battle_id"`
	CampaignSessionID string `json:"campaign_session_id"`
}

// Resolve fast-forwards a live battle through the real sim until it decides.
// On a finished battle it returns the existing outcome: resolving twice is
// the same as resolving once.
func (s *Server) handleResolve(w http.ResponseWriter, r *http.Request) {
	var req resolveRequest
	if !decodeBody(w, r, &req) {
		return
	}
	e, apiErr := s.lookup(req.BattleID, req.CampaignSessionID)
	if apiErr != nil {
		writeAPIError(w, apiErr)
		return
	}
	// The fast-forward is done in CHUNKS, taking the battle's lock for each and
	// releasing it in between, rather than once for the whole battle.
	//
	// That is the entire fix for "one player resolving a battle stops the whole
	// battle server". A reader of an unrelated battle never contends for this
	// lock at all; a reader of THIS battle waits for one chunk. The chunk is ten
	// ticks because the cost of a tick scales with the field — measured here at
	// about 0.0052 s a tick at 250 v 250 and 0.0477 s at 500 v 500 — so ten ticks
	// is roughly 50 ms and 480 ms respectively, against a 5 s budget, and a
	// constant tick count is the only chunk rule that holds at both sizes. A
	// tick-count rule beats a time-budget rule for the obvious reason: a budget
	// that expires mid-Advance still cannot release the lock until the Advance
	// returns.
	//
	// Nothing about the battle changes. Ticks are ticks whoever advances them, so
	// the result is the same as the one loop-across-the-whole-battle produced, and
	// pump may interleave its own two ticks between chunks.
	for {
		e.mu.Lock()
		if e.session.Phase() == battle.PhaseResolved {
			// The same save pump does, so that a battle resolved here and a battle
			// that resolved on its own leave the same thing behind. Guarded by
			// entry.saved, so resolving twice — which this route promises is fine —
			// saves once.
			s.saveRecord(req.BattleID, e)
			state := s.stateOf(e)
			e.mu.Unlock()
			writeJSON(w, http.StatusOK, state)
			return
		}
		err := e.session.Advance(resolveChunkTicks)
		e.mu.Unlock()
		if err != nil {
			writeAPIError(w, &apiError{http.StatusInternalServerError, "advance", err.Error()})
			return
		}
	}
}

// --- /v1/version ---

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"api":        "v1",
		"build_hash": s.buildHash,
		"sim":        "mbclone/simulation",
	})
}
