// Command simrun inspect is the AI observability tool. It runs the world for
// a number of days and prints what the AIs are doing: party objectives and
// targets, decision scores and reasons, faction intents, war status,
// settlement threats, caravan routes, and rebellion pressure.
//
// This is a development tool, not player UI. It exists so the world-AI
// developer can see whether the simulation is alive: are parties mobilizing,
// are wars being prosecuted, are caravans trading, are rebellions brewing.
// If the report shows a dead world (everything idle, no mobilization), the
// director's stagnation alerts in the event history will say why.
//
// Usage:
//
//	simrun inspect -seed 1 -days 60
package main

import (
	"flag"
	"fmt"
	"os"
	"sort"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simrun"
	"mbclone/simulation/internal/worldgen"
)

func cmdInspect(args []string) {
	fs := flag.NewFlagSet("inspect", flag.ExitOnError)
	seed := fs.Uint64("seed", 1, "master seed")
	days := fs.Int("days", 60, "in-game days to simulate")
	parties := fs.Int("parties", 10, "max parties to show in detail")
	cfgPath := fs.String("config", "", "balance config path")
	_ = fs.Parse(args)

	cfg := loadConfig(*cfgPath)

	// Build a small test world (same as worldai.SmallWorld).
	var settlements []worldgen.Settlement
	side := 0
	for i := 0; i < 12; i++ {
		settlements = append(settlements, worldgen.Settlement{
			Name:       fmt.Sprintf("Test Town %d", i),
			State:      "Testland",
			SideID:     side,
			Population: 40000,
			X:          200 + float64((i%4)*60),
			Y:          200 + float64((i/4)*60),
			IsPort:     i%3 == 0,
			Terrain:    model.TerrainPlain,
		})
		side = (side + 1) % 6
	}
	s := worldgen.Generate(cfg, *seed, settlements).State
	log := cause.NewLog(100000)
	e := sim.NewEngine(cfg, log, *seed, simrun.Systems())
	for d := 0; d < *days; d++ {
		if err := e.Tick(s); err != nil {
			fmt.Fprintf(os.Stderr, "inspect: tick %d: %v\n", d, err)
			os.Exit(1)
		}
	}

	printInspectReport(s, *parties)
}

func printInspectReport(s *model.State, maxParties int) {
	fmt.Printf("=== AI INSPECT: day %d (year %.1f) ===\n\n", s.Tick, s.Year)

	// --- Wars ---
	wars := s.ActiveWars()
	fmt.Printf("WARS: %d active\n", len(wars))
	for _, w := range wars {
		fmt.Printf("  war#%d: side %d vs side %d (day %.0f, battles=%.0f)\n",
			w.ID, w.SideA, w.SideB, w.StartTick, w.Battles)
	}
	fmt.Println()

	// --- Parties ---
	type partyInfo struct {
		id       int
		name     string
		activity string
		intent   string
		target   int
		score    float64
		troops   float64
		morale   float64
	}
	var infos []partyInfo
	mobilized := 0
	for _, pid := range s.PartyIDs() {
		p := s.Parties[pid]
		if p.Troops <= 0 {
			continue
		}
		if p.Activity != model.ActIdle {
			mobilized++
		}
		infos = append(infos, partyInfo{
			id:       pid,
			name:     p.Name,
			activity: activityName(p.Activity),
			intent:   intentionName(p.Intention),
			target:   p.DestTown,
			score:    p.DecisionScore,
			troops:   p.Troops,
			morale:   p.Morale,
		})
	}
	sort.Slice(infos, func(i, j int) bool { return infos[i].score > infos[j].score })
	fmt.Printf("PARTIES: %d total, %d mobilized\n", len(infos), mobilized)
	fmt.Printf("  Top %d by decision score:\n", maxParties)
	for i, pi := range infos {
		if i >= maxParties {
			break
		}
		fmt.Printf("    #%d %-20s act=%-10s intent=%-8s target=%d score=%.2f troops=%.0f morale=%.2f\n",
			pi.id, pi.name, pi.activity, pi.intent, pi.target, pi.score, pi.troops, pi.morale)
	}
	fmt.Println()

	// --- Settlements: threats ---
	type threatInfo struct {
		id      int
		unrest  float64
		loyalty float64
		food    float64
		holder  int
	}
	var threats []threatInfo
	for _, tid := range s.TownIDs() {
		t := s.Towns[tid]
		if t.Unrest > 0.5 || t.Loyalty < 0.3 || t.FoodDays < 14 {
			threats = append(threats, threatInfo{tid, t.Unrest, t.Loyalty, t.FoodDays, t.Holder})
		}
	}
	sort.Slice(threats, func(i, j int) bool { return threats[i].unrest > threats[j].unrest })
	fmt.Printf("SETTLEMENT THREATS: %d towns in trouble\n", len(threats))
	for _, th := range threats {
		fmt.Printf("  town#%d: unrest=%.2f loyalty=%.2f food_days=%.1f holder=%d\n",
			th.id, th.unrest, th.loyalty, th.food, th.holder)
	}
	fmt.Println()

	// --- Caravans ---
	caravans := 0
	for _, pid := range s.PartyIDs() {
		p := s.Parties[pid]
		if p.IsCaravan && p.Troops > 0 {
			caravans++
		}
	}
	fmt.Printf("CARAVANS: %d active\n\n", caravans)

	// --- Recent events ---
	fmt.Printf("RECENT EVENTS (last 10):\n")
	start := len(s.Events) - 10
	if start < 0 {
		start = 0
	}
	for _, ev := range s.Events[start:] {
		fmt.Printf("  day %d [%s]: %s\n", ev.Tick, eventKindName(ev.Kind), ev.Note)
	}
}

func eventKindName(k model.EventKind) string {	switch k {
	case model.EventWarDeclared:
		return "war declared"
	case model.EventWarEnded:
		return "war ended"
	case model.EventSettlementCaptured:
		return "captured"
	case model.EventRulerDied:
		return "ruler died"
	case model.EventRebellion:
		return "rebellion"
	case model.EventRebellionQuelled:
		return "rebellion quelled"
	case model.EventFamineBegan:
		return "famine began"
	case model.EventFamineEnded:
		return "famine ended"
	case model.EventWorldAssessment:
		return "assessment"
	case model.EventStagnationAlert:
		return "STAGNATION"
	default:
		return "unknown"
	}
}

func activityName(a model.Activity) string {
	switch a {
	case model.ActIdle:
		return "idle"
	case model.ActMarching:
		return "marching"
	case model.ActRaiding:
		return "raiding"
	case model.ActSieging:
		return "sieging"
	case model.ActTrading:
		return "trading"
	case model.ActPatrolling:
		return "patrolling"
	case model.ActResupplying:
		return "resupplying"
	case model.ActReturning:
		return "returning"
	case model.ActDefending:
		return "defending"
	default:
		return "unknown"
	}
}

func intentionName(i model.Intention) string {
	switch i {
	case model.IntentNone:
		return "none"
	case model.IntentAttack:
		return "attack"
	case model.IntentRaid:
		return "raid"
	case model.IntentAid:
		return "aid"
	case model.IntentTrade:
		return "trade"
	case model.IntentAlly:
		return "ally"
	case model.IntentWait:
		return "wait"
	case model.IntentDefend:
		return "defend"
	case model.IntentBlockade:
		return "blockade"
	case model.IntentPeace:
		return "peace"
	default:
		return "unknown"
	}
}
