// Command battleserver is the runnable battle-session HTTP server.
//
// It mounts the battleapi mux (the plan's /v1/battle/* routes plus
// /v1/version) on a port and pumps fighting sessions at the package's fixed
// 20 ticks per wall second. This is the process the campaign client points
// at (VITE_SIMULATION_HTTP_URL, default http://127.0.0.1:8080).
//
// Usage:
//
//	battleserver -addr 127.0.0.1:8080 [-config path/to/config] [-seed 1]
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"mbclone/simulation/internal/battleapi"
	"mbclone/simulation/internal/config"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "address to listen on")
	configPath := flag.String("config", "", "battle config file (default: built-in battle config)")
	seed := flag.Uint64("seed", 1, "campaign seed used to derive battle seeds")
	flag.Parse()

	var cfg *config.Config
	var err error
	if *configPath == "" {
		cfg, err = config.LoadDefault()
	} else {
		cfg, err = config.Load(*configPath)
	}
	if err != nil {
		log.Fatalf("load battle config: %v", err)
	}

	srv := battleapi.New(cfg, *seed, buildHash())
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go srv.Run(ctx)

	httpSrv := &http.Server{Addr: *addr, Handler: srv.Handler()}
	go func() {
		<-ctx.Done()
		_ = httpSrv.Shutdown(context.Background())
	}()
	fmt.Fprintf(os.Stderr, "battleserver: listening on http://%s (seed %d)\n", *addr, *seed)
	if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("listen: %v", err)
	}
}

// buildHash is replaced at link time with the real build hash; "dev" until
// then, which /v1/version reports honestly.
var linkHash = "dev"

func buildHash() string { return linkHash }
