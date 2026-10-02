// Package bandit implements the early-game threat ecosystem: spawning bandit
// parties near weak towns, AI that raids, flees, or attacks by relative power,
// hidden camps, and bounty postings.
//
// Bandits reuse the Party entity with IsRaider=true. Camps and bounties are
// tracked in package-level state that is deterministic given the RNG stream
// and committed world state. Writes go through the WriteSet so the cause log
// records every change.
package bandit

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// BanditType describes a regional bandit flavour.
type BanditType struct {
	Name             string
	PreferredTerrain int // model.Terrain*
	LootFoodBias     float64
	LootGoldBias     float64
	LootMetalBias    float64
}

// Types available across modern-day America regions.
var Types = []BanditType{
	{Name: "Rust Belt Scavengers", PreferredTerrain: model.TerrainPlain, LootFoodBias: 0.4, LootGoldBias: 0.3, LootMetalBias: 0.3},
	{Name: "Desert Raiders", PreferredTerrain: model.TerrainHills, LootFoodBias: 0.5, LootGoldBias: 0.4, LootMetalBias: 0.1},
	{Name: "Swamp Poachers", PreferredTerrain: model.TerrainSwamp, LootFoodBias: 0.6, LootGoldBias: 0.2, LootMetalBias: 0.2},
	{Name: "Urban Gangs", PreferredTerrain: model.TerrainPlain, LootFoodBias: 0.2, LootGoldBias: 0.6, LootMetalBias: 0.2},
	{Name: "Highwaymen", PreferredTerrain: model.TerrainForest, LootFoodBias: 0.3, LootGoldBias: 0.5, LootMetalBias: 0.2},
	{Name: "Dock Thieves", PreferredTerrain: model.TerrainCoast, LootFoodBias: 0.35, LootGoldBias: 0.45, LootMetalBias: 0.2},
}

// Camp is a hidden bandit base tied to one or more parties.
type Camp struct {
	ID         int
	X, Y       float64
	TypeIdx    int
	PartyIDs   []int
	Discovered bool
	LootFood   float64
	LootGold   float64
	LootMetal  float64
	SpawnTick  int
	LastActive int // last tick a party from this camp had a valid target
}

// Bounty is a town-posted reward for destroying a bandit party.
type Bounty struct {
	ID          int
	PartyID     int
	TownID      int
	Reward      float64
	StrengthEst float64
	LastKnownX  float64
	LastKnownY  float64
	BanditName  string
	BanditType  string
	Claimed     bool
	PostedTick  int
}

// Runtime holds camps and bounties across ticks. It is owned by the system and
// seeded from world state; it is not part of the committed model so that
// existing snapshots stay compatible. Determinism is preserved because every
// decision is driven by the tick RNG and sorted party/town IDs.
type Runtime struct {
	Camps      map[int]*Camp
	Bounties   map[int]*Bounty
	nextCamp   int
	nextBounty int
	// partyCamp links party ID -> camp ID
	partyCamp map[int]int
	// idleTicks counts consecutive ticks without a valid target per party
	idleTicks map[int]int
}

var rt = &Runtime{
	Camps:      make(map[int]*Camp),
	Bounties:   make(map[int]*Bounty),
	partyCamp:  make(map[int]int),
	idleTicks:  make(map[int]int),
	nextCamp:   1,
	nextBounty: 1,
}

// Reset clears runtime state (used by tests).
func Reset() {
	rt = &Runtime{
		Camps:      make(map[int]*Camp),
		Bounties:   make(map[int]*Bounty),
		partyCamp:  make(map[int]int),
		idleTicks:  make(map[int]int),
		nextCamp:   1,
		nextBounty: 1,
	}
}

// System returns the bandit simulation system.
func System() sim.System {
	return sim.System{
		Name: "bandit",
		Doc:  "spawns bandit parties near weak towns, runs raid/flee/attack AI, manages camps and bounties",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	spawnBandits(v, w)
	updateBanditAI(v, w)
	maintainCamps(v, w)
	postBounties(v, w)
	despawnIdle(v, w)
}

// PLACEHOLDER_REMAINDER - will be completed in follow-up if truncated
