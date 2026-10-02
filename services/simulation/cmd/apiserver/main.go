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
	engine := sim.NewEngine(cfg, causeLog, uint64(*seed), simrun.Systems())
	state := gen.State

	srv := &Server{
		cfg:    cfg,
		engine: engine,
		state:  state,
		log:    causeLog,
		// Start paused; the client sets the time scale.
		daysPerSecond: 0,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/snapshot", srv.handleSnapshot)
	mux.HandleFunc("/v1/trade", srv.handleTrade)
	mux.HandleFunc("/v1/recruit", srv.handleRecruit)
	mux.HandleFunc("/v1/time-scale", srv.handleTimeScale)
	mux.HandleFunc("/v1/skip-to-arrival", srv.handleSkipToArrival)
	mux.HandleFunc("/v1/march/plan", srv.handleMarchPlan)
	mux.HandleFunc("/v1/march/commit", srv.handleMarchCommit)
	mux.HandleFunc("/v1/barter/terms", srv.handleBarterTerms)
	mux.HandleFunc("/v1/barter/propose", srv.handleBarterPropose)
	mux.HandleFunc("/v1/barter/commit", srv.handleBarterCommit)
	mux.HandleFunc("/v1/why", srv.handleWhy)
	mux.HandleFunc("/ws", srv.handleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true}`))
	})

	go srv.tickLoop()

	fmt.Fprintf(os.Stderr, "apiserver listening on %s (seed %d)\n", *addr, *seed)
	log.Fatal(http.ListenAndServe(*addr, mux))
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
}
