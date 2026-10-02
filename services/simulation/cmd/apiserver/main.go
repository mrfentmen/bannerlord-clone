// Command apiserver runs the simulation as a live HTTP+WebSocket server
// for the campaign client.
//
// Endpoints (matching clients/campaign/src/data/provider.ts HttpSimulationProvider):
//
//	GET  /v1/snapshot        - full world snapshot
//	POST /v1/trade           - execute a trade order
//	POST /v1/recruit         - recruit troops
//	POST /v1/time-scale      - set days per real second (0 = pause)
//	POST /v1/skip-to-arrival - run until the player's march completes
//	POST /v1/march/plan      - plan a march (returns route)
//	POST /v1/march/commit    - commit a march order
//	GET  /v1/barter/terms    - both barter tables, priced by the trader
//	POST /v1/barter/propose  - the trader's answer to a proposed deal
//	POST /v1/barter/commit   - strike a deal, moving goods, gold, prisoners
//	GET  /v1/why             - cause chain for an entity field
//	WS   /ws                 - tick updates
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simrun"
	"mbclone/simulation/internal/worldgen"
)

func main() {
	var (
		addr   = flag.String("addr", "127.0.0.1:8080", "listen address")
		seed   = flag.Int64("seed", 1, "world seed")
		cfgDir = flag.String("config", "config", "config directory")
	)
	flag.Parse()

	cfg, err := config.Load(*cfgDir + "/balance.toml")
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	if err := simrun.ValidateConfig(cfg); err != nil {
		log.Fatalf("config validation: %v", err)
	}

	gen := worldgen.Generate(cfg, uint64(*seed), nil)
	causeLog := cause.NewLog(int(cfg.Audit.LogRowLimit))
	systems := simrun.Systems()
	engine := sim.NewEngine(cfg, causeLog, uint64(*seed), systems)
	srv := newServer(cfg, gen.State, causeLog, engine)

	fmt.Fprintf(os.Stderr, "apiserver listening on %s (seed %d)\n", *addr, *seed)
	log.Fatal(http.ListenAndServe(*addr, srv.routes()))
}

// newServer wires a server around a world.
//
// It is a constructor rather than a struct literal in main so that the tests
// drive the same object the binary does. A test that built its own Server would
// be a test of a server nobody runs, and the first thing it found would be a
// field main never sets.
//
// `player` is the leader the API acts as. main passes the leader it wants the
// session to be; it is a field rather than a lookup because the obvious
// implementation of that lookup — the first living lord in Leaders — reads a
// map, and Go randomises map iteration, so it returns a different lord from one
// call to the next. A player whose identity changed between reading the
// snapshot and pressing a button is not a session.
// The log is passed in rather than built here because the engine owns it: a
// second cause log, or a server holding a log the engine does not write to, is a
// divergence that would be reported as a missing cause row.
func newServer(cfg *config.Config, state *model.State, log *cause.Log, engine *sim.Engine) *Server {
	return &Server{
		cfg:    cfg,
		engine: engine,
		state:  state,
		log:    log,
		// Start paused; the client sets the time scale.
		daysPerSecond: 0,
		player:        pickPlayerLeader(state),
	}
}

// pickPlayerLeader is the leader a fresh session acts as: the lowest-id living
// lord, and -1 when there is none. Lowest id rather than first found because
// "first" over a map is not a fact about the world.
func pickPlayerLeader(state *model.State) int {
	best := -1
	for id, l := range state.Leaders {
		if l == nil || !l.IsAlive {
			continue
		}
		if best < 0 || id < best {
			best = id
		}
	}
	return best
}

// routes builds the mux. Every endpoint the campaign client calls is registered
// here and nowhere else, so the route table can be asserted from a test rather
// than read out of main.
func (s *Server) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/snapshot", s.handleSnapshot)
	mux.HandleFunc("/v1/trade", s.handleTrade)
	mux.HandleFunc("/v1/recruit", s.handleRecruit)
	mux.HandleFunc("/v1/time-scale", s.handleTimeScale)
	mux.HandleFunc("/v1/skip-to-arrival", s.handleSkipToArrival)
	mux.HandleFunc("/v1/march/plan", s.handleMarchPlan)
	mux.HandleFunc("/v1/march/commit", s.handleMarchCommit)
	mux.HandleFunc("/v1/barter/terms", s.handleBarterTerms)
	mux.HandleFunc("/v1/barter/propose", s.handleBarterPropose)
	mux.HandleFunc("/v1/barter/commit", s.handleBarterCommit)
	mux.HandleFunc("/v1/save", s.handleSave)
	mux.HandleFunc("/v1/load", s.handleLoad)
	mux.HandleFunc("/v1/why", s.handleWhy)
	mux.HandleFunc("/ws", s.handleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true}`))
	})
	return mux
}

// Server holds the live simulation state.
type Server struct {
	cfg    *config.Config
	engine *sim.Engine
	state  *model.State
	log    *cause.Log

	mu            sync.RWMutex
	daysPerSecond float64
	// orders queued by HTTP handlers, drained each tick
	pendingOrders []sim.Order
	tickCount     int64
	// wsSubs are tick-update subscribers.
	wsSubs map[chan []byte]struct{}
	// player is the leader this session acts as, resolved once at startup and
	// read without the lock. It never changes: a session that could change
	// identity between two requests could read a snapshot as one lord and spend
	// another's gold.
	player int
}
