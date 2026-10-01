// Package formation splits parties into wings and consolidates them again
// (Tier 6.3).
//
// A party can detach a wing, and two parties can be brought back into one.
// Both are decisions rather than bookkeeping:
//
//   - A split divides a command and a larder. The wing leaves with a share of
//     the troops and a share of the food, the parent keeps a floor of strength
//     so it cannot strip itself to nothing, and both sides take a morale hit
//     because men leaving with the wing is not morale-neutral for those who
//     stay.
//   - A merge needs the parties to actually be together. Two columns passing
//     each other do not consolidate, so a merge requires proximity, and by
//     default both parties to be idle, so an army cannot silently absorb a
//     marching column and change where its troops are.
//
// A wing is a party that remembers where it came from. ParentParty is what
// makes consolidation a judgement rather than a proximity test: a wing going
// home is a deliberate act, and the Why panel can say which parent it left and
// how big it was when it did.
//
// Splitting and merging are triggered by player orders, which arrive as shared
// state (split_share and merge_target on the party, written by the player
// system). This system reads them and does the work. That is the same seam the
// rest of the simulation uses: an order is data, and a system acts on it
// without being called.
package formation

import (
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
	"mbclone/simulation/internal/systems/template"
)

// System returns the party-formation system.
func System() sim.System {
	return sim.System{
		Name: "formation",
		Doc:  "detaches wings from parties and consolidates parties back into one",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.Troops <= 0 {
			continue
		}
		if p.SplitShare > 0 {
			split(v, w, pid, p, c)
			continue
		}
		if p.MergeTarget >= 0 {
			merge(v, w, pid, p, c)
		}
		// Cohesion (Tier 5.6): large armies are hard to keep together.
		// Drain scales with troops; recovery when small and well-fed.
		// At zero cohesion, troops desert.
		updateCohesion(v, w, pid, p, c)
	}
}

// updateCohesion drains or recovers party cohesion based on size and supply.
// Large armies (>200 troops) drain cohesion daily; small well-supplied parties
// recover. At zero, desertion begins.
func updateCohesion(v *sim.View, w *sim.WriteSet, pid int, p *model.Party, c *config.Config) {
	// Initialize cohesion for parties that predate the field.
	if p.Cohesion <= 0 && p.Troops > 0 {
		w.Set(model.KindParty, pid, "cohesion", 0.8,
			shared.ReadString(shared.Pair("troops", p.Troops)),
			nil, "cohesion initialized")
		return
	}
	// Drain: 0.01 per day per 100 troops over 200.
	// A 1000-troop army loses 0.08/day; a 200-troop party loses nothing.
	over := p.Troops - 200
	var delta float64
	if over > 0 {
		delta = -0.01 * (over / 100.0)
	} else {
		// Recovery: +0.02/day when small and not starving.
		if !p.IsStarving {
			delta = 0.02
		}
	}
	// Low morale accelerates the drain.
	if p.Morale < 0 {
		delta += p.Morale * 0.05
	}
	if delta == 0 {
		return
	}
	newCohesion := shared.Clamp(p.Cohesion+delta, 0, 1)
	read := shared.ReadString(
		shared.Pair("troops", p.Troops),
		shared.Pair("cohesion", p.Cohesion),
		shared.Pair("morale", p.Morale),
	)
	causes := v.Log.RecentFor(model.KindParty, pid, []string{"troops", "morale"}, 2)
	w.Set(model.KindParty, pid, "cohesion", newCohesion, read, causes,
		"cohesion change")
	// Desertion at zero cohesion: lose 5% of troops per day.
	if newCohesion <= 0 && p.Troops > 0 {
		deserters := p.Troops * 0.05
		w.Add(model.KindParty, pid, "troops", -deserters, read, causes,
			"desertion: zero cohesion")
	}
}

// split detaches a wing from a party.
//
// The order arrives as a share on the party rather than as a call, so this is
// a system reading shared state rather than the player system reaching into
// party creation. The new party is staged through SpawnParty, which is how the
// logistics system creates caravans: the entity does not exist until the writes
// are applied, so nothing may be written to it in the same tick, and every
// value it starts with is set in the struct literal here.
func split(v *sim.View, w *sim.WriteSet, pid int, p *model.Party, c *config.Config) {
	f := c.Formation
	// The parent's remaining strength is what limits the split. Asking for a
	// share that would leave it under the floor yields a smaller wing rather
	// than a forbidden one: the player asked to detach troops, and the floor
	// is enforced by taking less, not by refusing and leaving them in place
	// with no explanation.
	take := p.Troops * shared.Clamp01(p.SplitShare)
	if cap := p.Troops - f.SplitMinParentTroops; take > cap {
		take = cap
	}
	if take > p.Troops*f.SplitMaxShare {
		take = p.Troops * f.SplitMaxShare
	}
	if take < f.SplitMinTroops {
		// Too small to be a wing. The order is cleared so it is not retried
		// forever, and nothing else happens: a detachment of three men is not
		// a detachment.
		read := shared.ReadString(
			shared.Pair("troops", p.Troops),
			shared.Pair("wanted", p.Troops*p.SplitShare),
			shared.Pair("minimum", f.SplitMinTroops),
		)
		w.Set(model.KindParty, pid, "split_share", 0,
			read, nil, "too few troops to detach a wing")
		return
	}

	share := take / p.Troops
	read := shared.ReadString(
		shared.PairF("troops", p.Troops),
		shared.PairF("share", p.SplitShare),
		shared.PairF("wing", take),
		shared.PairF("remaining", p.Troops-take),
		shared.Pair("morale", p.Morale),
	)
	causes := v.Log.RecentFor(model.KindParty, pid,
		[]string{"troops", "morale", "party_food"}, 3)

	// The wing leaves with a share of the party's stores. Giving it the whole
	// larder would be a way to move food without paying to march it, and
	// giving it none would mean every wing starves on the first day, which
	// makes splitting a trap rather than a choice.
	wing := &model.Party{
		Name:      p.Name + " wing",
		SideID:    p.SideID,
		LeaderID:  p.LeaderID,
		X:         p.X,
		Y:         p.Y,
		DestX:     p.DestX,
		DestY:     p.DestY,
		DestTown:  -1,
		HomeTown:  p.HomeTown,
		Troops:    take,
		Wounded:   p.Wounded * share,
		Food:      take * c.March.FoodPerTroop * f.SplitFoodSharePerTroop,
		Money:     p.Money * share,
		Metal:     p.Metal * share,
		Medicine:  p.Medicine * share,
		Morale:    shared.Clamp(f.SplitWingMorale, -1, 1),
		Activity:  model.ActIdle,
		Intention: model.IntentNone,
		Template:  p.Template,
		IsWing:    true,
		// parent_party is written into the literal because the new party has
		// no id until the writes are applied, so it cannot be written to in
		// this tick. This is the whole record of where the wing came from.
		ParentParty:    pid,
		WingShare:      shared.Clamp01(share),
		DestTownParty:  -1,
		SupplyDistance: p.SupplyDistance,
	}
	// The wing's composition follows the parent's template and culture rather
	// than being invented, so a wing that rejoins its parent has not silently
	// changed what it is made of on the way.
	n := template.ClassCounts(v.Cfg, p.Template, cultureOf(v, p), take)
	wing.StanceTroops = n[int(model.ClassStance)]
	wing.HeavyTroops = n[int(model.ClassHeavy)]
	wing.LightTroops = n[int(model.ClassLight)]
	wing.HorseTroops = n[int(model.ClassHorse)]

	w.SpawnParty(wing)
	// The parent's troops and stores fall by the same share. These are
	// additive writes, so the troop change produces a cause row naming what
	// was read and why, which is what makes a detachment explainable rather
	// than a number that moved.
	w.Add(model.KindParty, pid, "troops", -take, read, causes, "wing detached")
	w.Add(model.KindParty, pid, "wounded", -p.Wounded*share, read, causes, "wounded left with the wing")
	w.Add(model.KindParty, pid, "party_food",
		-wing.Food, read, causes, "food went with the wing")
	w.Add(model.KindParty, pid, "party_money", -p.Money*share, read, causes, "funds went with the wing")
	w.Add(model.KindParty, pid, "party_metal", -p.Metal*share, read, causes, "stores went with the wing")
	w.Add(model.KindParty, pid, "party_medicine", -p.Medicine*share, read, causes, "field hospital split")
	w.Add(model.KindParty, pid, "morale", -f.SplitMoraleHit, read, causes, "part of the army left")
	w.Set(model.KindParty, pid, "split_share", 0, read, causes, "")
}

// merge consolidates one party into another.
//
// The absorbing party is the one the order named; the other is deleted and its
// strength added across. Proximity is checked before anything is written, so a
// rejected merge leaves both parties exactly as they were.
func merge(v *sim.View, w *sim.WriteSet, pid int, p *model.Party, c *config.Config) {
	f := c.Formation
	other := v.State.Parties[p.MergeTarget]
	read := shared.ReadString(
		shared.PairI("into", pid),
		shared.PairI("from", p.MergeTarget),
		shared.PairF("into_troops", p.Troops),
	)
	// Clear the order first, so a merge that turns out to be impossible does
	// not leave an order on the party to be retried every tick until something
	// changes. The write happens before the checks deliberately: it is the one
	// write that is correct in every branch.
	w.Set(model.KindParty, pid, "merge_target", -1, read, nil, "")

	if other == nil || other.ID == pid || other.Troops <= 0 {
		return
	}
	// Never merge two enemies' parties. Without this a merge order would be a
	// way to resolve a battle without a battle, since the absorbed party's
	// troops would simply reappear on the winner's side.
	if f.MergeRequiresSameSide && other.SideID != p.SideID {
		return
	}
	// Merging parties that are a hundred leagues apart would be a teleport, so
	// proximity is a hard requirement rather than a preference.
	if distance(p, other) > f.MergeMaxRangeLeagues {
		return
	}
	// An army mid-march is not available to be consolidated. Defaulting this
	// on is what stops a column being absorbed on the road, which would move
	// its troops without either party being told.
	if f.MergeRequiresIdle && !idle(v, p) {
		return
	}
	if f.MergeRequiresIdle && !idle(v, other) {
		return
	}
	// The surviving party must be the larger one. Absorbing a bigger force
	// into a smaller one is not consolidation, it is a relabelling, and
	// refusing it keeps the rule that the name belongs to the army.
	if p.Troops < other.Troops {
		return
	}
	combined := p.Troops + other.Troops
	// The survivor must keep a real share of the combined force. A merge that
	// left one man in charge of five hundred is not the operation described by
	// this order, and letting it through would make merge_target a way to hand
	// a party to someone else.
	if p.Troops < combined*f.MergeMinParentTroops {
		return
	}

	read = shared.ReadString(
		shared.PairI("into", pid),
		shared.PairI("from", other.ID),
		shared.PairF("into_troops", p.Troops),
		shared.PairF("from_troops", other.Troops),
		shared.PairF("distance", distance(p, other)),
		shared.Pair("into_morale", p.Morale),
		shared.Pair("from_morale", other.Morale),
	)
	causes := v.Log.RecentFor(model.KindParty, other.ID,
		[]string{"troops", "party_food", "party_money", "party_metal"}, 3)

	w.Add(model.KindParty, pid, "troops", other.Troops, read, causes, "party consolidated into this one")
	w.Add(model.KindParty, pid, "wounded", other.Wounded, read, causes, "wounded consolidated")
	w.Add(model.KindParty, pid, "party_food", other.Food, read, causes, "larder consolidated")
	w.Add(model.KindParty, pid, "party_money", other.Money, read, causes, "funds consolidated")
	w.Add(model.KindParty, pid, "party_gold", other.Gold, read, causes, "treasury consolidated")
	w.Add(model.KindParty, pid, "party_metal", other.Metal, read, causes, "stores consolidated")
	w.Add(model.KindParty, pid, "party_medicine", other.Medicine, read, causes, "field hospital consolidated")
	// Consolidating is a small shock and a small relief. The absorbed party's
	// morale is added at its own weight and the parent's is left where it is,
	// so the merged column's morale is a real blend rather than whichever
	// column happened to be larger.
	w.Add(model.KindParty, pid, "morale",
		(other.Morale-p.Morale)*shared.SafeDiv(other.Troops, combined)-f.MergeMoraleHit,
		read, causes, "two columns formed into one")
	// A ruler's army pointer moves with their troops. Leaving it on the
	// deleted party would leave a ruler whose army is entity #44 and no #44 on
	// the map, which every system that reads a ruler's party would then have
	// to guard against.
	if other.LeaderID >= 0 && other.LeaderID != p.LeaderID {
		w.Set(model.KindLeader, other.LeaderID, "army", float64(pid),
			read, causes, "army consolidated into another party")
	}
	// Anything that pointed at the absorbed party as its parent must be
	// repointed at the survivor, or the wing's record names a party that no
	// longer exists.
	if other.IsWing && other.ParentParty >= 0 {
		w.Set(model.KindParty, other.ParentParty, "parent_party", float64(pid),
			read, causes, "parent consolidated into another party")
	}
	w.DeleteEntity(model.KindParty, other.ID)
}

// idle reports whether a party is doing nothing that a consolidation would
// interrupt. A party at a town with no intention set is holding the place, and
// that counts as idle: merging into a garrison is the operation this system is
// most often asked for.
func idle(v *sim.View, p *model.Party) bool {
	return p.Activity == model.ActIdle && p.Intention == model.IntentNone
}

// distance returns the straight-line distance between two parties in leagues.
// The march system travels along roads, but this is a proximity test rather
// than a journey, so straight-line is the right measure: two parties on
// adjacent hillsides have not travelled a league to reach each other.
func distance(a, b *model.Party) float64 {
	return math.Hypot(a.X-b.X, a.Y-b.Y)
}

// cultureOf returns a party's culture index, the same lookup the template
// system uses. A system may not import another, so it is restated here and
// deliberately identical: a wing formed under one culture's style and recorded
// under another would be a discrepancy nobody could see.
func cultureOf(v *sim.View, p *model.Party) int {
	if p.SideID < 0 {
		return 0
	}
	s := v.State.Sides[p.SideID]
	if s == nil || s.Culture < 0 || s.Culture >= model.CultureCount {
		return 0
	}
	return s.Culture
}
