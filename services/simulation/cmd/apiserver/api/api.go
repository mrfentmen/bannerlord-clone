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
	Logger *log.Logger
	CORSOrigin string
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

// ServeHTTP lets the server be used directly as an http.Handler.
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
	s.mux.HandleFunc("GET /v1/health", s.getHealth)
	s.mux.HandleFunc("/", s.notFound)
}
