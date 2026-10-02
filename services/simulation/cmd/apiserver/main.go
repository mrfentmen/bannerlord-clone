// Command apiserver runs the campaign simulation and serves the campaign client's
// HTTP contract.
//
// One process, one campaign. The simulation owns a world generated from a seed, a
// cause log, and a clock; the HTTP layer reads that world and submits the player's
// orders back into it through the same tick boundary every other order uses. There
// is no database and no second process: the world lives in this process's memory,
// and a periodic snapshot on disk is an inspection record rather than a save game.
//
// The full contract is in docs/_draft/apiserver-contract.md. The lifecycle is in
// docs/_draft/apiserver-lifecycle.md, and the WebSocket handoff in
// docs/_draft/apiserver-ws-handoff.md.
//
// Usage:
//
//	apiserver [flags]
//
// Flags:
//
//	-addr            listen address (default 127.0.0.1:8080)
//	-config          path to balance.toml (default config/balance.toml)
//	-seed            world seed; the same seed builds the same world
//	-start-year      calendar year the campaign starts at (default 1950)
//	-time-scale      initial days per real second; 0 starts paused (default 0)
//	-tick-ms         clock wakeup period in milliseconds (default 100)
//	-snapshot-every  ticks between periodic snapshots; 0 disables them (default 30)
//	-snapshot-dir    where periodic snapshots are written
//	-cors-origin     Access-Control-Allow-Origin value (default *)
//	-player-ruler    simulation id of the ruler to play; 0 picks one
//	-player-town     simulation id of the town to play in; 0 uses the ruler's
//
// A container platform needs to listen on all interfaces, so a deployed instance
// passes -addr 0.0.0.0:8080.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"mbclone/simulation/cmd/apiserver/api"
	"mbclone/simulation/cmd/apiserver/campaign"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/simrun"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "apiserver:", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		addr          = flag.String("addr", "127.0.0.1:8080", "listen address")
		configPath    = flag.String("config", filepath.Join("config", "balance.toml"), "path to balance.toml")
		seed          = flag.Uint64("seed", 1, "world seed")
		startYear     = flag.Int("start-year", 1950, "calendar year the campaign starts at")
		timeScale     = flag.Float64("time-scale", 0, "initial days per real second; 0 starts paused")
		tickMillis    = flag.Int("tick-ms", 100, "clock wakeup period in milliseconds")
		snapshotEvery = flag.Int("snapshot-every", 30, "ticks between periodic snapshots; 0 disables them")
		snapshotDir   = flag.String("snapshot-dir", "", "where periodic snapshots are written")
		corsOrigin    = flag.String("cors-origin", "*", "Access-Control-Allow-Origin value")
		playerRuler   = flag.Int("player-ruler", 0, "simulation id of the ruler to play; 0 picks one")
		playerTown    = flag.Int("player-town", 0, "simulation id of the town to play in; 0 uses the ruler's")
		showOrder     = flag.Bool("print-system-order", false, "print the system order and exit")
		loadFile      = flag.String("load-file", "", "restore this save file on boot instead of generating a world")
		saveFile      = flag.String("save-file", "", "write a full save here on shutdown")
	)
	flag.Parse()

	logger := log.New(os.Stdout, "apiserver ", log.LstdFlags|log.LUTC)

	if *showOrder {
		// The order report cmd/simrun also prints, exposed here because a server
		// operator should be able to see what is actually running.
		for _, name := range simrun.SystemNames() {
			fmt.Println(name)
		}
		return nil
	}

	cfg, err := loadConfig(*configPath, *snapshotDir)
	if err != nil {
		return err
	}

	opts := campaign.Options{
		Seed:               *seed,
		StartYear:          *startYear,
		DaysPerRealSecond:  *timeScale,
		TickIntervalMillis: *tickMillis,
		SnapshotEvery:      *snapshotEvery,
		SnapshotDir:        *snapshotDir,
		PlayerRulerID:      *playerRuler,
		PlayerTownID:       *playerTown,
	}
	camp, err := campaign.New(cfg, opts)
	if err != nil {
		return err
	}

	logger.Printf("campaign built: seed %d, %d settlements, %d characters, day %d, player %s of %s",
		*seed, camp.TownCount(), camp.RulerCount(), camp.TickNumber(),
		camp.PlayerID(), camp.HomeTownID())

	// -load-file restores a save instead of the generated world. It runs
	// before the clock starts, so the restored world is the first thing the
	// tick loop sees.
	if *loadFile != "" {
		data, err := os.ReadFile(*loadFile)
		if err != nil {
			return fmt.Errorf("reading save file %s: %w", *loadFile, err)
		}
		if err := camp.Load(data); err != nil {
			return fmt.Errorf("loading save file %s: %w", *loadFile, err)
		}
		logger.Printf("restored save %s: day %d", *loadFile, camp.TickNumber())
	}

	// A signal-cancelled context is the whole shutdown story: the clock's goroutine
	// finishes the tick it is in, the campaign writes a final snapshot, and the HTTP
	// server drains.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	camp.Start(ctx)

	server := &http.Server{
		Addr: *addr,
		Handler: api.New(camp, api.Options{
			Logger:     logger,
			CORSOrigin: *corsOrigin,
		}).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		// No write timeout: a snapshot of a large world takes as long as it takes,
		// and cutting a reply in half would leave the client with a parse error
		// rather than a clear failure. The handler-level deadline is the real bound.
	}

	serveErr := make(chan error, 1)
	go func() {
		logger.Printf("listening on %s", *addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			return
		}
		serveErr <- nil
	}()

	select {
	case err := <-serveErr:
		camp.Stop()
		if err != nil {
			return fmt.Errorf("listening on %s: %w", *addr, err)
		}
		return nil
	case <-ctx.Done():
		logger.Printf("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Printf("the http server did not shut down cleanly: %v", err)
	}
	camp.Stop()
	// -save-file writes a full save on shutdown, after the clock has stopped,
	// so the file captures the world exactly as the last tick left it.
	if *saveFile != "" {
		data, err := camp.Save()
		if err != nil {
			logger.Printf("shutdown save failed: %v", err)
		} else if err := os.WriteFile(*saveFile, data, 0o644); err != nil {
			logger.Printf("writing shutdown save %s: %v", *saveFile, err)
		} else {
			logger.Printf("shutdown save written to %s (%d bytes)", *saveFile, len(data))
		}
	}
	logger.Printf("stopped")
	return nil
}

// loadConfig reads the balance file, and points the config loader at the snapshot
// directory so a relative config path works from any working directory.
//
// config.Load reads its path as given, and the default is relative to the process
// directory, which inside a container is not the source directory. So a relative
// path is resolved against the executable's directory and its parent, which is
// where a Docker image puts the balance file.
func loadConfig(path, snapshotDir string) (*config.Config, error) {
	if path == "" {
		path = filepath.Join("config", "balance.toml")
	}
	resolved := resolveConfigPath(path)
	if resolved == "" {
		return nil, fmt.Errorf("no balance config at %q: looked in the working directory, the executable's directory, and its parent", path)
	}
	cfg, err := config.Load(resolved)
	if err != nil {
		return nil, fmt.Errorf("loading %s: %w", resolved, err)
	}
	return cfg, nil
}

// resolveConfigPath finds a balance file, trying the path as given first and then
// the two places a container puts it.
func resolveConfigPath(path string) string {
	if _, err := os.Stat(path); err == nil {
		return path
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	dir := filepath.Dir(exe)
	for _, candidate := range []string{
		filepath.Join(dir, path),
		filepath.Join(dir, "config", filepath.Base(path)),
		filepath.Join(dir, "..", path),
	} {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return ""
}
