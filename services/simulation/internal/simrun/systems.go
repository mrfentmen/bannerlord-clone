// Package simrun assembles the systems, runs ticks, and produces logs.
//
// The system order below is fixed and documented here, per SPEC.md section 4
// and CONSTITUTION.md section 2.1. It is reported at run time by OrderReport so
// the order in the logs always matches the order in the code, and the golden
// log comparison would catch a change to it.
//
// The order is chosen for legibility of the cause log, not because results
// depend on it. Every system reads committed state and writes into a staging
// buffer applied at the end of the tick, so no system sees another's output in
// the same tick. TestSystemOrderIsIrrelevant proves that by running every
// permutation of this list and comparing the committed results. The order is
// therefore documentation of how the simulation reads, not a hidden dependency.
package simrun

import (
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/attrition"
	"mbclone/simulation/internal/systems/campaign"
	"mbclone/simulation/internal/systems/council"
	"mbclone/simulation/internal/systems/currency"
	"mbclone/simulation/internal/systems/demography"
	"mbclone/simulation/internal/systems/disease"
	"mbclone/simulation/internal/systems/factionai"
	"mbclone/simulation/internal/systems/food"
	"mbclone/simulation/internal/systems/influence"
	"mbclone/simulation/internal/systems/labor"
	"mbclone/simulation/internal/systems/logistics"
	"mbclone/simulation/internal/systems/loyalty"
	"mbclone/simulation/internal/systems/march"
	"mbclone/simulation/internal/systems/market"
	"mbclone/simulation/internal/systems/migration"
	"mbclone/simulation/internal/systems/player"
	"mbclone/simulation/internal/systems/relation"
	"mbclone/simulation/internal/systems/rulerai"
	"mbclone/simulation/internal/systems/security"
	"mbclone/simulation/internal/systems/siege"
	"mbclone/simulation/internal/systems/starvation"
	"mbclone/simulation/internal/systems/supply"
	"mbclone/simulation/internal/systems/unrest"
	"mbclone/simulation/internal/systems/upkeep"
)

// Systems returns every system in the documented order.
func Systems() []sim.System {
	return []sim.System{
		// --- player and scripted orders, applied first so a player's decision
		// is visible to every system that reads state this tick ---
		player.System(),

		// --- production: people into workers into food ---
		labor.System(),
		food.System(),

		// --- consumption and death ---
		starvation.System(),
		disease.System(),

		// --- prices and money ---
		market.System(),
		currency.System(),

		// --- movement of people ---
		migration.System(),

		// --- roads, raiders, and trade ---
		security.System(),
		logistics.System(),

		// --- armies ---
		march.System(),
		supply.System(),
		attrition.System(),
		upkeep.System(),
		siege.System(),

		// --- politics ---
		unrest.System(),
		loyalty.System(),
		council.System(),
		influence.System(),
		relation.System(),
		rulerai.System(),
		factionai.System(),

		// --- turning intentions into movement ---
		campaign.System(),

		// --- last, so it aggregates the deaths and movement every other
		// system staged this tick ---
		demography.System(),
	}
}

// OrderReport renders the documented system order with each system's one-line
// description, for the run metadata and for CHANGELOG.md.
func OrderReport() string {
	systems := Systems()
	var sb strings.Builder
	sb.WriteString("SYSTEM ORDER (fixed, documented; results do not depend on it)\n")
	for i, s := range systems {
		fmt.Fprintf(&sb, "%2d. %-12s %s\n", i+1, s.Name, s.Doc)
	}
	sb.WriteString("\nWhy results do not depend on the order: every system reads the\n")
	sb.WriteString("committed state at the start of the tick and stages its writes.\n")
	sb.WriteString("No system observes another's output in the same tick, so no\n")
	sb.WriteString("permutation of this list can change a result. The list is the\n")
	sb.WriteString("order the simulation reads in, not a dependency graph.\n")
	return sb.String()
}

// SystemNames returns the order as names, for the decoupling test.
func SystemNames() []string {
	systems := Systems()
	out := make([]string, len(systems))
	for i, s := range systems {
		out[i] = s.Name
	}
	sort.Strings(out)
	return out
}

// ValidateConfig checks the config for values a run would misbehave on, and is
// called before a run so a bad constant is reported once rather than producing
// a thousand nonsense rows.
func ValidateConfig(cfg *config.Config) error {
	problems := []string{}
	if cfg.Food.BaseYieldPerWorker <= cfg.Food.PersonDaysPerPersonDay*cfg.Labor.HealthyWorkerShare*0.9 {
		problems = append(problems, "food.base_yield_per_worker is below what the workforce eats: every town starves on day one")
	}
	if cfg.Upkeep.DesertionMoraleThreshold <= 0 {
		problems = append(problems, "upkeep.desertion_morale_threshold must be positive")
	}
	if cfg.Council.DaysBelowThreshold < 2 {
		problems = append(problems, "council.days_below_threshold below 2 makes votes effectively instant")
	}
	if cfg.World.MinTowns > cfg.World.MaxTowns {
		problems = append(problems, "world.min_towns exceeds world.max_towns")
	}
	if cfg.Cause.MinChainLinks > cfg.Cause.MaxChainLinks {
		problems = append(problems, "cause.min_chain_links exceeds cause.max_chain_links")
	}
	if len(problems) > 0 {
		return fmt.Errorf("config: %d problem(s):\n  %s", len(problems), strings.Join(problems, "\n  "))
	}
	return nil
}
