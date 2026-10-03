// Package api serves the campaign client's HTTP contract.
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

type Server struct {
	camp           *campaign.Campaign
	log            *log.Logger
	mux            *http.ServeMux
	corsOrigin     string
	requestTimeout time.Duration
}

type Options struct {
	Logger         *log.Logger
	CORSOrigin     string
	RequestTimeout time.Duration
}

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
		camp: camp, log: opts.Logger, mux: http.NewServeMux(),
		corsOrigin: opts.CORSOrigin, requestTimeout: opts.RequestTimeout,
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.withCORS(s.withLogging(s.mux))
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.Handler().ServeHTTP(w, r)
}

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
	s.mux.HandleFunc("POST /v1/troops/battle-result", s.postBattleResult)
	s.mux.HandleFunc("POST /v1/troops/battle-outcome", s.postBattleOutcome)
	s.mux.HandleFunc("POST /v1/troops/upgrade", s.postUpgrade)
	s.mux.HandleFunc("POST /v1/town/tax", s.postTownTax)
	s.mux.HandleFunc("POST /v1/state/tax", s.postStateTax)
	s.mux.HandleFunc("POST /v1/town/construct", s.postConstruct)
	s.mux.HandleFunc("POST /v1/march/plan", s.postMarchPlan)
	s.mux.HandleFunc("POST /v1/march/commit", s.postMarchCommit)
	s.mux.HandleFunc("POST /v1/encounters", s.postEncounter)
	s.mux.HandleFunc("GET /v1/encounters", s.listEncounters)
	s.mux.HandleFunc("GET /v1/encounters/{id}", s.getEncounter)
	s.mux.HandleFunc("POST /v1/encounters/{id}/resolve", s.postEncounterResolve)
	s.mux.HandleFunc("POST /v1/battles", s.postBattle)
	s.mux.HandleFunc("GET /v1/battles/{id}", s.getBattle)
	s.mux.HandleFunc("POST /v1/battles/{id}/orders", s.postBattleOrders)
	s.mux.HandleFunc("POST /v1/battles/{id}/end", s.postBattleEnd)
	s.mux.HandleFunc("POST /v1/sieges", s.postSiege)
	s.mux.HandleFunc("GET /v1/sieges", s.listSieges)
	s.mux.HandleFunc("GET /v1/sieges/{id}", s.getSiege)
	s.mux.HandleFunc("POST /v1/sieges/{id}/assault", s.postSiegeAssault)
	s.mux.HandleFunc("POST /v1/sieges/{id}/lift", s.postSiegeLift)
	s.mux.HandleFunc("GET /v1/towns/{id}/tavern/companions", s.getTavernCompanions)
	s.mux.HandleFunc("POST /v1/companions/{id}/hire", s.postHireCompanion)
	s.mux.HandleFunc("GET /v1/companions", s.listCompanions)
	s.mux.HandleFunc("POST /v1/companions/{id}/role", s.postCompanionRole)
	s.mux.HandleFunc("GET /v1/prisoners", s.listPrisoners)
	s.mux.HandleFunc("POST /v1/prisoners/{id}/ransom", s.postPrisonerRansom)
	s.mux.HandleFunc("POST /v1/prisoners/{id}/recruit", s.postPrisonerRecruit)
	s.mux.HandleFunc("POST /v1/prisoners/{id}/release", s.postPrisonerRelease)
	s.mux.HandleFunc("POST /v1/prisoners/{id}/execute", s.postPrisonerExecute)
	s.mux.HandleFunc("GET /v1/bandits", s.listBandits)
	s.mux.HandleFunc("GET /v1/bandits/camps", s.listBanditCamps)
	s.mux.HandleFunc("GET /v1/bounties", s.listBounties)
	s.mux.HandleFunc("POST /v1/bounties/{id}/claim", s.claimBounty)
	s.mux.HandleFunc("GET /v1/health", s.getHealth)
	s.mux.HandleFunc("/", s.notFound)
}

type ErrorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	Reason string `json:"reason,omitempty"`
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body == nil {
		_, _ = w.Write([]byte("{}"))
		return
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		s.log.Printf("apiserver: writing the reply failed: %v", err)
	}
}

func (s *Server) writeFault(w http.ResponseWriter, err error) {
	var fault *campaign.Fault
	if !errors.As(err, &fault) {
		s.log.Printf("apiserver: unhandled failure: %v", err)
		fault = &campaign.Fault{
			Code: campaign.CodeInternal, Message: err.Error(),
			Reason: "The world simulation could not answer that.",
		}
	}
	var body ErrorBody
	body.Error.Code = fault.Code
	body.Error.Message = fault.Message
	body.Reason = fault.Reason
	s.log.Printf("apiserver: %s: %s (%s)", fault.Code, fault.Message, fault.Reason)
	s.writeJSON(w, fault.Status(), body)
}

func (s *Server) notFound(w http.ResponseWriter, r *http.Request) {
	s.writeFault(w, &campaign.Fault{
		Code: campaign.CodeNotFound, Message: "not found",
		Reason: "That path is not part of the campaign API.",
	})
}

func (s *Server) decode(w http.ResponseWriter, r *http.Request, into any) bool {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		s.writeFault(w, &campaign.Fault{
			Code: campaign.CodeBadRequest, Message: err.Error(),
			Reason: "The request body could not be read.",
		})
		return false
	}
	return true
}

func (s *Server) order(w http.ResponseWriter, r *http.Request, run func() (any, error)) {
	ctx, cancel := s.deadline(r)
	defer cancel()
	_ = ctx
	out, err := run()
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.corsOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

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

type HealthBody struct {
	Status           string          `json:"status"`
	Clock            wire.ClockState `json:"clock"`
	SkippedDays      int             `json:"skippedDays"`
	Error            string          `json:"error,omitempty"`
	Systems          []string        `json:"systems"`
	EventSubscribers int             `json:"eventSubscribers"`
}

func (s *Server) getHealth(w http.ResponseWriter, r *http.Request) {
	body := HealthBody{
		Status: "ok", Clock: s.camp.Clock(), SkippedDays: s.camp.SkippedDays(),
		EventSubscribers: s.camp.Bus().Subscribers(),
	}
	if err := s.camp.LastError(); err != nil {
		body.Status = "halted"
		body.Error = err.Error()
	}
	body.Systems = s.camp.SystemNames()
	s.writeJSON(w, http.StatusOK, body)
}

func queryField(r *http.Request, name string) string {
	return strings.TrimSpace(r.URL.Query().Get(name))
}

func (s *Server) deadline(r *http.Request) (context.Context, context.CancelFunc) {
	if s.requestTimeout <= 0 {
		return context.WithCancel(r.Context())
	}
	return context.WithTimeout(r.Context(), s.requestTimeout)
}
