// Package api serves the campaign client's HTTP contract.
//
// It is a thin layer on purpose. The simulation lives in
// `mbclone/simulation/cmd/apiserver/campaign` and every number this package sends
// came from there or from the balance config; nothing here computes a price, a
// wage, a distance, or a date. What this package owns is the boundary: routing,
// JSON decoding, the error envelope, CORS, and turning a campaign Fault into a
// status code.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"mbclone/simulation/cmd/apiserver/campaign"
	"mbclone/simulation/cmd/apiserver/wire"
)

// Server serves the campaign client over HTTP.
type Server struct {
	camp           *campaign.Campaign
	log            *log.Logger
	mux            *http.ServeMux
	corsOrigin     string
	requestTimeout time.Duration
}

// Options configures the server.
type Options struct {
	// Logger receives request failures. Defaults to the standard logger.
	Logger *log.Logger
	// CORSOrigin is the value sent in Access-Control-Allow-Origin.
	//
	// The campaign client sends no cookies, no Authorization header, and no
	// session id, so the server is single-tenant per process and infers the
	// campaign from process state. That makes a wildcard origin safe for the
	// loopback development setup the client defaults to. Behind the same-origin
	// Worker front door, where VITE_SIMULATION_HTTP_URL is a path such as /api,
	// the browser sends no Origin at all and none of this applies.
	CORSOrigin string
	// RequestTimeout bounds how long a handler may wait for a tick to apply an
	// order. A caller that gives up does not cancel the order; it stops waiting
	// for it.
	RequestTimeout time.Duration
}

// New builds the server and its routes.
func New(camp *campaign.Campaign, opts Options) *Server {
	if opts.Logger == nil {
		opts.Logger = log.Default()
	}
	if opts.CORSOrigin == "" {
		opts.CORSOrigin = "*"
	}
	if opts.RequestTimeout <= 0 {
		opts.RequestTimeout = 30 * time.Second
	}
	s := &Server{
		camp:           camp,
		log:            opts.Logger,
		mux:            http.NewServeMux(),
		corsOrigin:     opts.CORSOrigin,
		requestTimeout: opts.RequestTimeout,
	}
	s.routes()
	return s
}

// Handler returns the HTTP handler, with CORS and logging wrapped around it.
func (s *Server) Handler() http.Handler {
	return s.withCORS(s.withLogging(s.mux))
}

// ServeHTTP lets the server be used directly as an http.Handler, which is what the
// tests do.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.Handler().ServeHTTP(w, r)
}

// routes registers every path. Go 1.22's pattern matching gives the method as part
// of the pattern, so a wrong verb on a real path answers 405 from the mux with an
// empty body; that is replaced below with a proper envelope, because the client's
// error handling wants JSON.
func (s *Server) routes() {
	s.mux.HandleFunc("GET /v1/snapshot", s.getSnapshot)
	s.mux.HandleFunc("GET /v1/why", s.getWhy)

	s.mux.HandleFunc("POST /v1/trade", s.postTrade)
	s.mux.HandleFunc("POST /v1/recruit", s.postRecruit)
	s.mux.HandleFunc("POST /v1/notables/talk", s.postTalk)
	s.mux.HandleFunc("GET /v1/notables/talk", s.getTalk)
	s.mux.HandleFunc("POST /v1/notables/relation", s.postRelation)

	s.mux.HandleFunc("POST /v1/time-scale", s.postTimeScale)
	s.mux.HandleFunc("POST /v1/pause", s.postPause)
	s.mux.HandleFunc("POST /v1/resume", s.postResume)
	s.mux.HandleFunc("GET /v1/time", s.getTime)
	s.mux.HandleFunc("POST /v1/skip-to-arrival", s.postSkip)

	s.mux.HandleFunc("POST /v1/ethnicity", s.postEthnicity)
	s.mux.HandleFunc("POST /v1/character", s.postCharacter)
	s.mux.HandleFunc("GET /v1/character", s.getCharacter)

	s.mux.HandleFunc("POST /v1/troops/battle-xp", s.postBattleXp)
	s.mux.HandleFunc("POST /v1/troops/upgrade", s.postUpgrade)

	s.mux.HandleFunc("POST /v1/town/tax", s.postTownTax)
	s.mux.HandleFunc("POST /v1/state/tax", s.postStateTax)
	s.mux.HandleFunc("POST /v1/town/construct", s.postConstruct)

	s.mux.HandleFunc("POST /v1/march/plan", s.postMarchPlan)
	s.mux.HandleFunc("POST /v1/march/commit", s.postMarchCommit)

	// A liveness route, because a container platform needs one and because a
	// clock halted after a failed tick should be visible without reading logs.
	s.mux.HandleFunc("GET /v1/health", s.getHealth)

	// Anything else, so an unknown path gets an envelope rather than Go's bare
	// 404 text.
	s.mux.HandleFunc("/", s.notFound)
}

// -- envelope ---------------------------------------------------------------

// ErrorBody is the error envelope every non-2xx response carries.
//
// `error` is the machine half and the one the contract requires. `reason` sits
// beside it because the campaign client's POST helper reads only a top-level
// "reason", and only on a 409: anything else it finds is discarded and the player
// sees a generic sentence. So a conflict has to say something a player can read,
// and putting it beside the envelope is the only place both can live.
type ErrorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	// Reason is the player-facing sentence, written to be shown on screen.
	Reason string `json:"reason,omitempty"`
}

// writeJSON sends a value with a status.
func (s *Server) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body == nil {
		// The client's POST helper parses every reply, so an empty body is a
		// failure on its side even when there is nothing to say.
		_, _ = w.Write([]byte("{}"))
		return
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		s.log.Printf("apiserver: writing the reply failed: %v", err)
	}
}

// writeFault turns any error from the campaign into an envelope.
//
// A campaign Fault carries its own code and status. Anything else is a bug on this
// server rather than an answer about the world, so it becomes an internal fault:
// the client is told the simulation could not answer, and the real cause goes to
// the log rather than to the player.
func (s *Server) writeFault(w http.ResponseWriter, err error) {
	var fault *campaign.Fault
	if !errors.As(err, &fault) {
		s.log.Printf("apiserver: unhandled failure: %v", err)
		fault = &campaign.Fault{
			Code:    campaign.CodeInternal,
			Message: err.Error(),
			Reason:  "The world simulation could not answer that.",
		}
	}
	var body ErrorBody
	body.Error.Code = fault.Code
	body.Error.Message = fault.Message
	body.Reason = fault.Reason
	s.log.Printf("apiserver: %s: %s (%s)", fault.Code, fault.Message, fault.Reason)
	s.writeJSON(w, fault.Status(), body)
}

// notFound answers an unknown path.
func (s *Server) notFound(w http.ResponseWriter, r *http.Request) {
	s.writeFault(w, &campaign.Fault{
		Code:    campaign.CodeNotFound,
		Message: "no route " + r.Method + " " + r.URL.Path,
		Reason:  "There is nothing at that address.",
	})
}

// -- request decoding -------------------------------------------------------

// decode reads a JSON body.
//
// An empty body is refused rather than treated as zero values, because every route
// here needs something and a silent default would produce an order nobody asked
// for. The limit is small: these are all orders.
func (s *Server) decode(w http.ResponseWriter, r *http.Request, into any) bool {
	defer func() { _ = r.Body.Close() }()
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "body is not valid JSON for this route: " + err.Error(),
			Reason:  "That order did not read properly.",
		})
		return false
	}
	return true
}

// order runs an action and answers it, mapping a fault onto the envelope.
func (s *Server) order(w http.ResponseWriter, r *http.Request, run func() (any, error)) {
	value, err := run()
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, value)
}

// -- middleware -------------------------------------------------------------

// withCORS answers preflights and adds the CORS headers.
//
// Preflight is real, not hypothetical: the client's POSTs set
// content-type: application/json, which is not a CORS-safelisted value, so every
// POST from a cross-origin page triggers an OPTIONS first.
func (s *Server) withCORS(next http.Handler) http.Handler {
	origin := s.corsOrigin
	if origin == "" {
		origin = "*"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type, Accept")
		h.Set("Access-Control-Max-Age", "600")
		h.Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// statusRecorder remembers the status for the log line.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// withLogging records every request with its status and duration. A failure is
// logged here as well as in writeFault, which is deliberate: writeFault's message
// is for the player and this one is for whoever is on call.
func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if rec.status >= 400 {
			s.log.Printf("apiserver: %s %s -> %d in %s",
				r.Method, r.URL.RequestURI(), rec.status, time.Since(start).Round(time.Millisecond))
		}
	})
}

// -- health -----------------------------------------------------------------

// HealthBody is the liveness and clock report.
type HealthBody struct {
	Status string `json:"status"`
	// Clock is the campaign's clock, so a halted simulation is visible here.
	Clock wire.ClockState `json:"clock"`
	// SkippedDays is how many days the clock dropped because the requested rate
	// was higher than this machine could honour. A non-zero value is a rate the
	// server could not honour, not a silent loss.
	SkippedDays int `json:"skippedDays"`
	// Error is the last tick failure, if the clock is halted.
	Error string `json:"error,omitempty"`
	// Systems is the documented system order, which the order report in
	// cmd/simrun also prints.
	Systems []string `json:"systems"`
	// EventSubscribers is how many WebSocket subscriptions the event bus has.
	EventSubscribers int `json:"eventSubscribers"`
}

func (s *Server) getHealth(w http.ResponseWriter, r *http.Request) {
	body := HealthBody{
		Status:           "ok",
		Clock:            s.camp.Clock(),
		SkippedDays:      s.camp.SkippedDays(),
		EventSubscribers: s.camp.Bus().Subscribers(),
	}
	if err := s.camp.LastError(); err != nil {
		body.Status = "halted"
		body.Error = err.Error()
	}
	body.Systems = s.camp.SystemNames()
	s.writeJSON(w, http.StatusOK, body)
}

// queryField reads one query parameter, trimmed.
func queryField(r *http.Request, name string) string {
	return strings.TrimSpace(r.URL.Query().Get(name))
}

// deadline bounds how long an order route may wait for a tick to apply its order.
//
// The caller must defer the returned cancel. Without the ceiling a paused clock
// with a queued order would hold a connection open indefinitely, which is worse
// than answering. A client that gives up stops waiting; it does not cancel the
// order, which by then may already be staged.
func (s *Server) deadline(r *http.Request) (context.Context, context.CancelFunc) {
	if s.requestTimeout <= 0 {
		return context.WithCancel(r.Context())
	}
	return context.WithTimeout(r.Context(), s.requestTimeout)
}
