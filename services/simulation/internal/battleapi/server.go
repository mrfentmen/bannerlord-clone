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
	"net/http"
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

	mu       sync.Mutex
	sessions map[string]*entry
	nextID   uint64
	// battleCounter feeds DeriveBattleSeed so no two battles share a seed.
	battleCounter uint64
}

type entry struct {
	session           *battle.Session
	campaignSessionID string
	orders            []loggedOrder
	lastErr           error
	created           time.Time
}

type loggedOrder struct {
	Name   battle.OrderName `json:"name"`
	Params map[string]any   `json:"params,omitempty"`
	Tick   int              `json:"tick"`
}

// New builds a Server. campaignSeed is the campaign's seed for battle-seed
// derivation; buildHash is reported by /v1/version (Pax's server injects the
// real one, "dev" until then).
func New(cfg *config.Config, campaignSeed uint64, buildHash string) *Server {
	if buildHash == "" {
		buildHash = "dev"
	}
	return &Server{
		cfg:          cfg,
		campaignSeed: campaignSeed,
		buildHash:    buildHash,
		sessions:     make(map[string]*entry),
	}
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
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, e := range s.sessions {
		ph := e.session.Phase()
		if ph != battle.PhaseFighting && ph != battle.PhaseRout {
			continue
		}
		if err := e.session.Advance(ticksPerWake); err != nil {
			e.lastErr = fmt.Errorf("battle %s: %w", id, err)
		}
	}
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

	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	s.battleCounter++
	id := fmt.Sprintf("btl-%d", s.nextID)
	seed := battle.DeriveBattleSeed(s.campaignSeed, s.battleCounter, req.AttackerPartyID, req.DefenderPartyID)

	attacker := battle.PartyRef{ID: req.AttackerPartyID, Name: req.AttackerPartyName}
	defender := battle.PartyRef{ID: req.DefenderPartyID, Name: req.DefenderPartyName}
	sess, err := battle.NewSession(s.cfg, id, attacker, defender, 0, seed)
	if err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "session", err.Error()})
		return
	}
	aUnits, err := battle.GenerateForce(s.cfg, seed, battle.SideA, battle.Roster{Units: units})
	if err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "roster", err.Error()})
		return
	}
	dUnits, err := battle.GenerateForce(s.cfg, seed^0x9E3779B97F4A7C15, battle.SideB, battle.Roster{Units: units})
	if err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "roster", err.Error()})
		return
	}
	leaders := append(
		battle.GenerateLeaders(s.cfg, seed^0x12345, battle.SideA, 1, 0.7),
		battle.GenerateLeaders(s.cfg, seed^0x67890, battle.SideB, 1, 0.7)...,
	)
	if err := sess.Deploy(aUnits, dUnits, leaders); err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "deploy", err.Error()})
		return
	}
	if err := sess.BeginFighting(); err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "begin", err.Error()})
		return
	}
	s.sessions[id] = &entry{session: sess, campaignSessionID: req.CampaignSessionID, created: time.Now()}
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
	PartyID      string  `json:"party_id"`
	PartyName    string  `json:"party_name"`
	Bodies       float64 `json:"bodies"`
	Dead         float64 `json:"dead"`
	Wounded      float64 `json:"wounded"`
	Surrendered  float64 `json:"surrendered"`
	RoutedShare  float64 `json:"routed_share"`
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
	s.mu.Lock()
	defer s.mu.Unlock()
	writeJSON(w, http.StatusOK, s.stateOf(e))
}

// --- /v1/battle/orders ---

type orderRequest struct {
	BattleID          string `json:"battle_id"`
	CampaignSessionID string `json:"campaign_session_id"`
	Orders            []struct {
		Name   string         `json:"name"`
		Params map[string]any `json:"params"`
	} `json:"orders"`
}

// Orders are validated against the fourteen-order set and logged on the
// session with their tick. Execution through the command seam is the
// formation-orders task; this endpoint is the validated intake for it.
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
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, o := range req.Orders {
		if !battle.ValidOrder(battle.OrderName(o.Name)) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error": map[string]string{
					"code":    "unknown_order",
					"message": fmt.Sprintf("order %q is not one of the fourteen formation orders", o.Name),
				},
				"valid_orders": battle.ValidOrders(),
			})
			return
		}
	}
	for _, o := range req.Orders {
		e.orders = append(e.orders, loggedOrder{
			Name:   battle.OrderName(o.Name),
			Params: o.Params,
			Tick:   e.session.Tick(),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"battle_id": req.BattleID,
		"accepted":  len(req.Orders),
	})
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
	s.mu.Lock()
	defer s.mu.Unlock()
	for e.session.Phase() != battle.PhaseResolved {
		if err := e.session.Advance(1000); err != nil {
			writeAPIError(w, &apiError{http.StatusInternalServerError, "advance", err.Error()})
			return
		}
	}
	writeJSON(w, http.StatusOK, s.stateOf(e))
}

// --- /v1/version ---

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"api":        "v1",
		"build_hash": s.buildHash,
		"sim":        "mbclone/simulation",
	})
}
