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
	"mbclone/simulation/internal/systems/aging"
	"mbclone/simulation/internal/systems/attrition"
	"mbclone/simulation/internal/systems/battle"
	"mbclone/simulation/internal/systems/campaign"
	"mbclone/simulation/internal/systems/clan"
	"mbclone/simulation/internal/systems/council"
	"mbclone/simulation/internal/systems/courtship"
	"mbclone/simulation/internal/systems/caravan"
	"mbclone/simulation/internal/systems/crime"
	"mbclone/simulation/internal/systems/currency"
	"mbclone/simulation/internal/systems/demography"
	"mbclone/simulation/internal/systems/diplomat"
	"mbclone/simulation/internal/systems/disease"
	"mbclone/simulation/internal/systems/factionai"
	"mbclone/simulation/internal/systems/family"
	"mbclone/simulation/internal/systems/food"
	"mbclone/simulation/internal/systems/formation"
	"mbclone/simulation/internal/systems/hideout"
	"mbclone/simulation/internal/systems/influence"
	"mbclone/simulation/internal/systems/issue"
	"mbclone/simulation/internal/systems/kingdom"
	"mbclone/simulation/internal/systems/kingdomcrime"
	"mbclone/simulation/internal/systems/labor"
	"mbclone/simulation/internal/systems/loadout"
	"mbclone/simulation/internal/systems/logistics"
	"mbclone/simulation/internal/systems/loyalty"
	"mbclone/simulation/internal/systems/march"
	"mbclone/simulation/internal/systems/market"
	"mbclone/simulation/internal/systems/migration"
	"mbclone/simulation/internal/systems/naval"
	"mbclone/simulation/internal/systems/player"
	"mbclone/simulation/internal/systems/prisoner"
	"mbclone/simulation/internal/systems/relation"
	"mbclone/simulation/internal/systems/rulerai"
	"mbclone/simulation/internal/systems/security"
	"mbclone/simulation/internal/systems/siege"
	"mbclone/simulation/internal/systems/siegeengine"
	"mbclone/simulation/internal/systems/smithing"
	"mbclone/simulation/internal/systems/sneak"
	"mbclone/simulation/internal/systems/starvation"
	"mbclone/simulation/internal/systems/succession"
	"mbclone/simulation/internal/systems/supply"
	"mbclone/simulation/internal/systems/template"
	"mbclone/simulation/internal/systems/tournament"
	"mbclone/simulation/internal/systems/unrest"
	"mbclone/simulation/internal/systems/upkeep"
	"mbclone/simulation/internal/systems/visibility"
	"mbclone/simulation/internal/systems/workshop"
)

// Systems returns every system in the documented order.
func Systems() []sim.System {
	return []sim.System{
		// --- player and scripted orders, applied first so a player's decision
		// is visible to every system that reads state this tick ---
		player.System(),
		prisoner.System(),
		diplomat.System(),
		tournament.System(),
		family.System(),

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
		sneak.System(),
		march.System(),
		supply.System(),
		attrition.System(),
		upkeep.System(),
		battle.System(),
		hideout.System(),
		siege.System(),
		siegeengine.System(),

		// --- politics ---
		unrest.System(),
		loyalty.System(),
		loadout.System(),
		council.System(),
		clan.System(),
		crime.System(),
		kingdomcrime.System(),
		influence.System(),
		relation.System(),
		courtship.System(),
		rulerai.System(),
		factionai.System(),
		succession.System(),
		kingdom.System(),
		aging.System(),

		// --- turning intentions into movement ---
		campaign.System(),

		// --- production buildings (Tier 3) ---
		workshop.System(),
		smithing.System(),
		naval.System(),
		caravan.System(),

		// --- party composition and formation (Tier 6) ---
		//
		// These publish what a party is made of and how its strength is
		// divided. They run late so that the march, battle, and attrition
		// systems above read the composition committed on the previous tick
		// rather than this tick's, which keeps every reader on one snapshot.
		template.System(),
		formation.System(),

		// --- issues: what the people of a settlement ask of the player ---
		//
		// These run late because an issue is generated from state the systems
		// above have already settled this tick's food, crime, and road safety,
		// and because their effects have to land before demography aggregates
		// the tick's changes.
		issue.System(),

		// --- fog of war: who can see what ---
		//
		// Visibility runs where it does because it reads party positions
		// committed by the movement systems above and publishes masks that are
		// reported, not acted on by the systems below. Nothing here depends on
		// the ordering; the engine guarantees that, and TestSystemOrderIsIrrelevant
		// proves it. Placing it after campaign is the choice that makes the
		// cause log read in the order a player experiences: an army marches,
		// and then the map changes.
		visibility.System(),

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
	if cfg.Issue.ClearHideoutCrimeTarget >= cfg.Issue.ClearHideoutCrimeTrigger {
		problems = append(problems, "issue.clear_hideout_crime_target must be below issue.clear_hideout_crime_trigger: a hideout cannot be paid for twice")
	}
	if cfg.Issue.EscortSafetyTarget <= cfg.Issue.EscortSafetyTrigger {
		problems = append(problems, "issue.escort_safety_target must exceed issue.escort_safety_trigger: an escort must be able to change the road")
	}
	if cfg.Issue.DeliverTolerance > 1 {
		problems = append(problems, "issue.deliver_tolerance above 1 pays for a delivery that was never made")
	}
	if len(problems) > 0 {
		return fmt.Errorf("config: %d problem(s):\n  %s", len(problems), strings.Join(problems, "\n  "))
	}
	return nil
}
