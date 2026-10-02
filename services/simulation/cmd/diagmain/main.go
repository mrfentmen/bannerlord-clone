package main

import (
	"fmt"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/profile"
	"mbclone/simulation/internal/runner"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simrun"
	"mbclone/simulation/internal/worldgen"
)

func main() {
	cfg, _ := config.Load("config/balance.toml")
	gen := worldgen.Generate(cfg, 1, nil)
	log := cause.NewLog(1000)
	eng := sim.NewEngine(cfg, log, 1, simrun.Systems())
	st := gen.State
	for i := 0; i < 12; i++ {
		eng.Tick(st)
		t := st.Towns[1]
		fmt.Printf("tick=%2d town1 pop=%10.1f workers=%10.1f net_migration=%12.1f foodDays=%7.2f unrest=%.4f crowd=%.4f\n",
			i+1, t.Population, t.Workers, t.NetMigration, t.FoodDays, t.Unrest, t.Crowding)
	}
	_ = profile.None
	_ = runner.Options{}
}
