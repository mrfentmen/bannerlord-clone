// Package bandit implements the early-game threat ecosystem: spawning bandit
// parties near weak towns, AI that raids/flees/attacks, hidden camps, and bounties.
//
// Bandits reuse Party with IsRaider=true. Camps/bounties live in package Runtime
// (deterministic via RNG + sorted IDs). Writes go through WriteSet for the cause log.
package bandit

import (
	"math"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// BanditType describes a regional bandit flavour.
type BanditType struct {
	Name             string
	PreferredTerrain int
	LootFoodBias     float64
	LootGoldBias     float64
	LootMetalBias    float64
}

// Types across modern-day America regions.
var Types = []BanditType{
	{Name: "Rust Belt Scavengers", PreferredTerrain: model.TerrainPlain, LootFoodBias: 0.4, LootGoldBias: 0.3, LootMetalBias: 0.3},
	{Name: "Desert Raiders", PreferredTerrain: model.TerrainHills, LootFoodBias: 0.5, LootGoldBias: 0.4, LootMetalBias: 0.1},
	{Name: "Swamp Poachers", PreferredTerrain: model.TerrainSwamp, LootFoodBias: 0.6, LootGoldBias: 0.2, LootMetalBias: 0.2},
	{Name: "Urban Gangs", PreferredTerrain: model.TerrainPlain, LootFoodBias: 0.2, LootGoldBias: 0.6, LootMetalBias: 0.2},
	{Name: "Highwaymen", PreferredTerrain: model.TerrainForest, LootFoodBias: 0.3, LootGoldBias: 0.5, LootMetalBias: 0.2},
	{Name: "Dock Thieves", PreferredTerrain: model.TerrainCoast, LootFoodBias: 0.35, LootGoldBias: 0.45, LootMetalBias: 0.2},
}

// Camp is a hidden bandit base.
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
	LastActive int
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

// Runtime holds camps and bounties across ticks.
type Runtime struct {
	Camps      map[int]*Camp
	Bounties   map[int]*Bounty
	nextCamp   int
	nextBounty int
	partyCamp  map[int]int
	idleTicks  map[int]int
}

var rt = &Runtime{
	Camps: make(map[int]*Camp), Bounties: make(map[int]*Bounty),
	partyCamp: make(map[int]int), idleTicks: make(map[int]int),
	nextCamp: 1, nextBounty: 1,
}

// Reset clears runtime state (tests).
func Reset() {
	rt = &Runtime{
		Camps: make(map[int]*Camp), Bounties: make(map[int]*Bounty),
		partyCamp: make(map[int]int), idleTicks: make(map[int]int),
		nextCamp: 1, nextBounty: 1,
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

func spawnBandits(v *sim.View, w *sim.WriteSet) {
	raiderCount := 0
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p != nil && p.IsRaider && p.Troops > 0 {
			raiderCount++
		}
	}
	minBands, maxBands := int(v.Cfg.World.MinRaiderBands), int(v.Cfg.World.MaxRaiderBands)
	if minBands <= 0 {
		minBands = 4
	}
	if maxBands <= 0 {
		maxBands = 20
	}
	if raiderCount >= maxBands {
		return
	}
	rng := v.Rng.Derive("bandit.spawn")
	for _, tid := range v.State.TownIDs() {
		if raiderCount >= maxBands {
			break
		}
		t := v.State.Towns[tid]
		if t == nil {
			continue
		}
		insecure := t.RoadSafety < 0.45 || t.RaiderPressure > 0.3
		if !insecure {
			continue
		}
		chance := (0.45 - t.RoadSafety) * 0.15
		if t.RaiderPressure > 0 {
			chance += t.RaiderPressure * 0.1
		}
		if raiderCount < minBands {
			chance += 0.2
		}
		if chance < 0.02 {
			chance = 0.02
		}
		if rng.Float64() > chance {
			continue
		}
		typeIdx := pickType(rng, t.Terrain)
		_ = Types[typeIdx]
		tickScale := 1.0 + float64(v.Tick)/500.0
		if tickScale > 2.5 {
			tickScale = 2.5
		}
		size := 5.0 + rng.Float64()*25.0*tickScale
		if size > 30*tickScale {
			size = 30 * tickScale
		}
		angle := rng.Float64() * 2 * math.Pi
		dist := 8.0 + rng.Float64()*12.0
		x := t.X + math.Cos(angle)*dist
		y := t.Y + math.Sin(angle)*dist
		camp := findOrCreateCamp(v, x, y, typeIdx)
		_ = size
		_ = camp
		_ = nextPartyID(v)
		w.Add(model.KindTown, tid, "raider_pressure", 0.05,
			shared.ReadString(shared.Pair("road_safety", t.RoadSafety), shared.PairF("raider_pressure", t.RaiderPressure)),
			v.Log.RecentFor(model.KindTown, tid, []string{"road_safety", "raider_pressure"}, 3),
			"bandit party forming nearby")
		raiderCount++
	}
}

func pickType(rng interface{ Float64() float64 }, terrain int) int {
	best, bestScore := 0, -1.0
	for i, bt := range Types {
		score := rng.Float64()
		if bt.PreferredTerrain == terrain {
			score += 0.5
		}
		if score > bestScore {
			bestScore, best = score, i
		}
	}
	return best
}

func findOrCreateCamp(v *sim.View, x, y float64, typeIdx int) *Camp {
	for _, c := range rt.Camps {
		dx, dy := c.X-x, c.Y-y
		if dx*dx+dy*dy < 100 && c.TypeIdx == typeIdx {
			return c
		}
	}
	id := rt.nextCamp
	rt.nextCamp++
	camp := &Camp{ID: id, X: x, Y: y, TypeIdx: typeIdx, SpawnTick: v.Tick, LastActive: v.Tick}
	rt.Camps[id] = camp
	return camp
}

func nextPartyID(v *sim.View) int {
	max := 0
	for _, id := range v.State.PartyIDs() {
		if id > max {
			max = id
		}
	}
	return max + 1
}

func updateBanditAI(v *sim.View, w *sim.WriteSet) {
	rng := v.Rng.Derive("bandit.ai")
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || !p.IsRaider || p.Troops <= 0 {
			continue
		}
		power := partyPower(p)
		target, _, action := chooseAction(v, p, power, rng)
		read := shared.ReadString(shared.PairF("troops", p.Troops), shared.Pair("morale", p.Morale), shared.PairF("power", power))
		switch action {
		case "flee":
			campID, ok := rt.partyCamp[pid]
			destX, destY := p.X, p.Y
			if ok {
				if c := rt.Camps[campID]; c != nil {
					destX, destY = c.X, c.Y
				}
			} else {
				dx, dy := p.X-target.X, p.Y-target.Y
				n := math.Hypot(dx, dy)
				if n > 0.1 {
					destX, destY = p.X+dx/n*15, p.Y+dy/n*15
				}
			}
			w.Set(model.KindParty, pid, "dest_x", destX, read, nil, "flee stronger party")
			w.Set(model.KindParty, pid, "dest_y", destY, read, nil, "flee stronger party")
			rt.idleTicks[pid] = 0
			if camp, ok := rt.Camps[rt.partyCamp[pid]]; ok {
				camp.LastActive = v.Tick
			}
		case "attack":
			w.Set(model.KindParty, pid, "dest_x", target.X, read, nil, "attack weaker party")
			w.Set(model.KindParty, pid, "dest_y", target.Y, read, nil, "attack weaker party")
			rt.idleTicks[pid] = 0
			if camp, ok := rt.Camps[rt.partyCamp[pid]]; ok {
				camp.LastActive = v.Tick
			}
		case "raid":
			tid := nearestWeakTown(v, p.X, p.Y)
			if tid < 0 {
				rt.idleTicks[pid]++
				continue
			}
			t := v.State.Towns[tid]
			w.Set(model.KindParty, pid, "dest_x", t.X, read, nil, "raid town")
			w.Set(model.KindParty, pid, "dest_y", t.Y, read, nil, "raid town")
			dx, dy := p.X-t.X, p.Y-t.Y
			if dx*dx+dy*dy < 36 {
				stealFood := math.Min(t.FoodStock*0.05, p.Troops*0.5)
				stealGold := math.Min(t.Gold*0.03, p.Troops*0.2)
				w.Add(model.KindTown, tid, "food_stock", -stealFood, shared.PairF("steal_food", stealFood), nil, "bandit raid")
				w.Add(model.KindTown, tid, "gold", -stealGold, shared.PairF("steal_gold", stealGold), nil, "bandit raid")
				w.Add(model.KindTown, tid, "prosperity", -0.01, shared.Pair("prosperity", t.Prosperity), nil, "bandit raid")
				w.Add(model.KindTown, tid, "raider_pressure", 0.02, shared.Pair("raider_pressure", t.RaiderPressure), nil, "bandit raid")
				w.Add(model.KindParty, pid, "party_food", stealFood, shared.PairF("loot", stealFood), nil, "raid loot")
				w.Add(model.KindParty, pid, "party_gold", stealGold, shared.PairF("loot", stealGold), nil, "raid loot")
				if campID, ok := rt.partyCamp[pid]; ok {
					if c := rt.Camps[campID]; c != nil {
						c.LootFood += stealFood * 0.5
						c.LootGold += stealGold * 0.5
						c.LastActive = v.Tick
					}
				}
			}
			rt.idleTicks[pid] = 0
		default:
			rt.idleTicks[pid]++
			if campID, ok := rt.partyCamp[pid]; ok {
				if c := rt.Camps[campID]; c != nil {
					w.Set(model.KindParty, pid, "dest_x", c.X, read, nil, "return to camp")
					w.Set(model.KindParty, pid, "dest_y", c.Y, read, nil, "return to camp")
				}
			}
		}
	}
}

func partyPower(p *model.Party) float64 {
	return p.Troops * (0.5 + 0.5*shared.Clamp01(p.Morale))
}

func chooseAction(v *sim.View, self *model.Party, power float64, rng interface{ Float64() float64 }) (target *model.Party, targetPower float64, action string) {
	var nearestStrong, nearestWeak *model.Party
	var strongPow, weakPow float64
	bestStrongDist, bestWeakDist := 1e12, 1e12
	for _, pid := range v.State.PartyIDs() {
		o := v.State.Parties[pid]
		if o == nil || o.ID == self.ID || o.Troops <= 0 || o.IsRaider {
			continue
		}
		dx, dy := self.X-o.X, self.Y-o.Y
		dist := dx*dx + dy*dy
		op := partyPower(o)
		if op > power*2 {
			if dist < bestStrongDist {
				bestStrongDist, nearestStrong, strongPow = dist, o, op
			}
		} else if op < power*0.7 && (o.IsCaravan || o.Troops < self.Troops) {
			if dist < bestWeakDist {
				bestWeakDist, nearestWeak, weakPow = dist, o, op
			}
		}
	}
	if nearestStrong != nil && bestStrongDist < 400 {
		return nearestStrong, strongPow, "flee"
	}
	if nearestWeak != nil && bestWeakDist < 225 {
		return nearestWeak, weakPow, "attack"
	}
	if rng.Float64() < 0.7 {
		return self, 0, "raid"
	}
	return self, 0, "idle"
}

func nearestWeakTown(v *sim.View, x, y float64) int {
	best, bestD := -1, 1e12
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || (t.RoadSafety > 0.6 && t.Garrison > 40) {
			continue
		}
		dx, dy := t.X-x, t.Y-y
		score := (dx*dx + dy*dy) / (1.1 - shared.Clamp01(t.RoadSafety))
		if score < bestD {
			bestD, best = score, tid
		}
	}
	return best
}

func maintainCamps(v *sim.View, w *sim.WriteSet) {
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.IsRaider {
			continue
		}
		for _, camp := range rt.Camps {
			if camp.Discovered {
				continue
			}
			dx, dy := p.X-camp.X, p.Y-camp.Y
			if dx*dx+dy*dy < 25 {
				camp.Discovered = true
			}
		}
	}
	raiderCount := 0
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p != nil && p.IsRaider && p.Troops > 0 {
			raiderCount++
		}
	}
	maxBands := int(v.Cfg.World.MaxRaiderBands)
	if maxBands <= 0 {
		maxBands = 20
	}
	if raiderCount < maxBands/2 && v.Tick%15 == 0 {
		rng := v.Rng.Derive("bandit.camp")
		ids := v.State.TownIDs()
		if len(ids) > 0 {
			tid := ids[int(rng.Float64()*float64(len(ids)))%len(ids)]
			t := v.State.Towns[tid]
			if t != nil && t.RoadSafety < 0.5 {
				angle := rng.Float64() * 2 * math.Pi
				dist := 12.0 + rng.Float64()*10
				findOrCreateCamp(v, t.X+math.Cos(angle)*dist, t.Y+math.Sin(angle)*dist, pickType(rng, t.Terrain))
			}
		}
	}
	_ = w
}

func postBounties(v *sim.View, w *sim.WriteSet) {
	if v.Tick%10 != 0 {
		return
	}
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || !p.IsRaider || p.Troops <= 0 {
			continue
		}
		has := false
		for _, b := range rt.Bounties {
			if b.PartyID == pid && !b.Claimed {
				has = true
				b.LastKnownX, b.LastKnownY = p.X, p.Y
				b.StrengthEst = partyPower(p)
				break
			}
		}
		if has {
			continue
		}
		tid := nearestTown(v, p.X, p.Y)
		if tid < 0 {
			continue
		}
		t := v.State.Towns[tid]
		reward := 50 + partyPower(p)*3 + t.Prosperity*20
		typeName := "Bandits"
		if campID, ok := rt.partyCamp[pid]; ok {
			if c := rt.Camps[campID]; c != nil && c.TypeIdx >= 0 && c.TypeIdx < len(Types) {
				typeName = Types[c.TypeIdx].Name
			}
		}
		id := rt.nextBounty
		rt.nextBounty++
		rt.Bounties[id] = &Bounty{
			ID: id, PartyID: pid, TownID: tid, Reward: reward,
			StrengthEst: partyPower(p), LastKnownX: p.X, LastKnownY: p.Y,
			BanditName: p.Name, BanditType: typeName, PostedTick: v.Tick,
		}
	}
	_ = w
}

func nearestTown(v *sim.View, x, y float64) int {
	best, bestD := -1, 1e12
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil {
			continue
		}
		dx, dy := t.X-x, t.Y-y
		d := dx*dx + dy*dy
		if d < bestD {
			bestD, best = d, tid
		}
	}
	return best
}

func despawnIdle(v *sim.View, w *sim.WriteSet) {
	const idleLimit = 30
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || !p.IsRaider {
			continue
		}
		if rt.idleTicks[pid] >= idleLimit {
			w.Set(model.KindParty, pid, "troops", 0, shared.PairI("idle_ticks", rt.idleTicks[pid]), nil, "no targets for 30 ticks")
			delete(rt.idleTicks, pid)
			if campID, ok := rt.partyCamp[pid]; ok {
				delete(rt.partyCamp, pid)
				if c := rt.Camps[campID]; c != nil {
					np := c.PartyIDs[:0]
					for _, id := range c.PartyIDs {
						if id != pid {
							np = append(np, id)
						}
					}
					c.PartyIDs = np
				}
			}
		}
	}
}

// ListBandits returns active raider parties for GET /v1/bandits.
func ListBandits(state *model.State) []map[string]interface{} {
	var out []map[string]interface{}
	for _, pid := range state.PartyIDs() {
		p := state.Parties[pid]
		if p == nil || !p.IsRaider || p.Troops <= 0 {
			continue
		}
		typeName := "Bandits"
		if campID, ok := rt.partyCamp[pid]; ok {
			if c := rt.Camps[campID]; c != nil && c.TypeIdx >= 0 && c.TypeIdx < len(Types) {
				typeName = Types[c.TypeIdx].Name
			}
		}
		out = append(out, map[string]interface{}{
			"id": p.ID, "name": p.Name, "type": typeName,
			"x": p.X, "y": p.Y, "strength": partyPower(p), "troops": p.Troops,
		})
	}
	return out
}

// ListDiscoveredCamps returns camps the player has discovered.
func ListDiscoveredCamps() []map[string]interface{} {
	var out []map[string]interface{}
	for _, c := range rt.Camps {
		if !c.Discovered {
			continue
		}
		typeName := "Unknown"
		if c.TypeIdx >= 0 && c.TypeIdx < len(Types) {
			typeName = Types[c.TypeIdx].Name
		}
		out = append(out, map[string]interface{}{
			"id": c.ID, "x": c.X, "y": c.Y, "type": typeName,
			"loot_food": c.LootFood, "loot_gold": c.LootGold, "loot_metal": c.LootMetal,
			"parties": len(c.PartyIDs),
		})
	}
	return out
}

// ListBounties returns open bounties.
func ListBounties() []map[string]interface{} {
	var out []map[string]interface{}
	for _, b := range rt.Bounties {
		if b.Claimed {
			continue
		}
		out = append(out, map[string]interface{}{
			"id": b.ID, "party_id": b.PartyID, "town_id": b.TownID,
			"reward": b.Reward, "strength_estimate": b.StrengthEst,
			"last_known_x": b.LastKnownX, "last_known_y": b.LastKnownY,
			"bandit_name": b.BanditName, "bandit_type": b.BanditType,
		})
	}
	return out
}

// ClaimBounty marks a bounty claimed after the party is destroyed. Returns reward or 0.
func ClaimBounty(id int, state *model.State) float64 {
	b, ok := rt.Bounties[id]
	if !ok || b.Claimed {
		return 0
	}
	p := state.Parties[b.PartyID]
	if p != nil && p.Troops > 0 {
		return 0
	}
	b.Claimed = true
	return b.Reward
}

// DiscoverCampNear marks camps within radius of (x,y) as discovered.
func DiscoverCampNear(x, y, radius float64) int {
	n := 0
	r2 := radius * radius
	for _, c := range rt.Camps {
		if c.Discovered {
			continue
		}
		dx, dy := c.X-x, c.Y-y
		if dx*dx+dy*dy <= r2 {
			c.Discovered = true
			n++
		}
	}
	return n
}

// DestroyCamp removes a camp and zeros its parties; returns loot.
func DestroyCamp(campID int, state *model.State, w *sim.WriteSet) (food, gold, metal float64) {
	c, ok := rt.Camps[campID]
	if !ok {
		return 0, 0, 0
	}
	food, gold, metal = c.LootFood, c.LootGold, c.LootMetal
	for _, pid := range c.PartyIDs {
		if w != nil {
			w.Set(model.KindParty, pid, "troops", 0, "camp destroyed", nil, "camp destroyed")
		}
		delete(rt.partyCamp, pid)
	}
	delete(rt.Camps, campID)
	return
}
