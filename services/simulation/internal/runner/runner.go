// Package runner executes complete runs: generate a world, run the tick loop,
// apply a player profile, and collect the logs and metrics.
package runner

import (
	"fmt"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/chains"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/metrics"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/profile"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simrun"
	"mbclone/simulation/internal/worldgen"
)

// Options are a run's inputs. They are the whole input surface: same options
// plus same config must give the same result, byte for byte.
type Options struct {
	// Seed is the master seed. Every random draw in the run derives from it.
	Seed uint64
	// Years is how many in-game years to run.
	Years float64
	// Profile is the scripted player behaviour, or None for no player.
	Profile profile.Kind
	// PlayerRulerID and PlayerTownID are which ruler and town the profile acts
	// through. Zero values select the first suitable ruler found.
	PlayerRulerID int
	PlayerTownID  int
	// Settlements, when non-empty, are the imported real places to use. When
	// empty the generator synthesises a map, and the run records that it did.
	Settlements []worldgen.Settlement
	// Systems overrides the system order, for the order-independence test. Nil
	// uses the documented order.
	Systems []sim.System
}

// Outcome is a completed run.
type Outcome struct {
	Options Options
	State   *model.State
	Log     *cause.Log
	Metrics *metrics.Run
	Chains  map[chains.Chain]chains.Result
	// RealSettlements and SynthSettlements record the world's provenance, so a
	// report can say which it used rather than implying both.
	RealSettlements  int
	SynthSettlements int
	// PlayerRulerID and PlayerTownID are the profile's actual subject, which
	// may have been auto-selected.
	PlayerRulerID int
	PlayerTownID  int
	// Err is a non-fatal note, such as a config value that was clamped.
	Notes []string
}

// Run executes one run to completion.
func Run(cfg *config.Config, opts Options) (*Outcome, error) {
	if err := simrun.ValidateConfig(cfg); err != nil {
		return nil, err
	}
	years := opts.Years
	if years <= 0 {
		years = cfg.World.Years
	}
	ticks := int(years * 365)

	// --- world ---
	gen := worldgen.Generate(cfg, opts.Seed, opts.Settlements)
	log := cause.NewLog(int(cfg.Audit.LogRowLimit))

	// --- the player profile ---
	var p *profile.Player
	if opts.Profile != profile.None && opts.Profile != "" {
		rulerID, townID := pickPlayer(cfg, gen.State, opts)
		if rulerID < 0 {
			// No suitable ruler exists in a world this small. That is a real
			// finding rather than an error: the run still proceeds as a
			// no-player run and says so, because a profile with no character
			// cannot be simulated by inventing one.
			gen.State.Tick = 0
			return finish(cfg, opts, gen, log, nil, ticks, []string{
				fmt.Sprintf("profile %s requested but no suitable ruler was found; run proceeded with no player", opts.Profile),
			})
		}
		p = profile.New(opts.Profile, rulerID, townID, gen.State.Rulers[rulerID].SideID, cfg)
	}

	// --- engine ---
	systems := opts.Systems
	if systems == nil {
		systems = simrun.Systems()
	}
	engine := sim.NewEngine(cfg, log, opts.Seed, systems)
	state := gen.State

	var notes []string
	// Run the ticks. The profile's orders are queued each day and drained by
	// the player system, which is the same path a real player's input takes.
	for i := 0; i < ticks; i++ {
		if p != nil {
			// A cheap view for the profile to read. The profile is not a
			// system: it has no write access, and its orders are staged through
			// the queue.
			view := &sim.View{State: state, Cfg: cfg, Tick: state.Tick, Year: state.Year, Day: state.Tick % 365}
			engine.SetOrders(p.Orders(view))
		}
		if err := engine.Tick(state); err != nil {
			return nil, fmt.Errorf("seed %d tick %d: %w", opts.Seed, i, err)
		}
	}
	// Hold the profile's subject on the outcome so the report can name it.
	playerRuler, playerTown := -1, -1
	if p != nil {
		playerRuler, playerTown = p.RulerID, p.TownID
	}
	return finish(cfg, opts, gen, log, p, ticks, notes, playerRuler, playerTown)
}

// pickPlayer chooses which ruler and town the profile acts through: the given
// ones if they exist, otherwise the first landed, non-leader ruler of a side
// that still holds a town.
func pickPlayer(cfg *config.Config, state *model.State, opts Options) (int, int) {
	if opts.PlayerRulerID > 0 {
		if r := state.Rulers[opts.PlayerRulerID]; r != nil && !r.Leader && r.TownID >= 0 {
			return r.ID, r.TownID
		}
	}
	if opts.PlayerTownID > 0 {
		if t := state.Towns[opts.PlayerTownID]; t != nil {
			for _, rid := range state.RulerIDsSorted() {
				r := state.Rulers[rid]
				if r.SideID == t.HolderSide && r.TownID == t.ID {
					return rid, t.ID
				}
			}
			return -1, t.ID
		}
	}
	for _, rid := range state.RulerIDsSorted() {
		r := state.Rulers[rid]
		if r.Leader || r.TownID < 0 {
			continue
		}
		if t := state.Towns[r.TownID]; t != nil && t.Population > 0 {
			return rid, r.TownID
		}
	}
	return -1, -1
}

func finish(cfg *config.Config, opts Options, gen *worldgen.Result, log *cause.Log, p *profile.Player, ticks int, notes []string, extra ...int) (*Outcome, error) {
	profileName := string(opts.Profile)
	if p != nil {
		profileName = string(p.Kind)
	}
	playerRuler, playerTown := -1, -1
	if len(extra) >= 2 {
		playerRuler, playerTown = extra[0], extra[1]
	} else if p != nil {
		playerRuler, playerTown = p.RulerID, p.TownID
	}
	m := metrics.Summary(cfg, gen.State, log, opts.Seed, profileName)
	chainResults := chains.Check(log, gen.State)
	return &Outcome{
		Options:          opts,
		State:            gen.State,
		Log:              log,
		Metrics:          m,
		Chains:           chainResults,
		RealSettlements:  gen.RealCount,
		SynthSettlements: gen.SynthCount,
		PlayerRulerID:    playerRuler,
		PlayerTownID:     playerTown,
		Notes:            notes,
	}, nil
}
