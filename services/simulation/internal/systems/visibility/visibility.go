// Package visibility implements fog of war: which towns each side can see, and
// which it merely remembers having seen (gap 6.5 in docs/missing-vs-bannerlord.md).
//
// # Why this exists
//
// The gap analysis lists fog of war as "almost certainly deliberate: the world
// data loads the whole country from Census data, so there is nothing to reveal."
// That reasoning is right about the terrain and wrong about the towns. The map
// is fully populated and fully real, but a party standing in Nebraska has no way
// to know that a town in Georgia exists, what its garrison is, or whether it is
// under siege. Without this system the simulation hands every side the whole map
// for free, which is the same as saying surprise is impossible: a raid on a town
// nobody had heard of could never happen, because the attacker would have known
// about it before leaving.
//
// So the rule here is deliberately simple and stated in one sentence: a side
// sees a town when one of that side's parties is close enough to have spotted
// it. Everything else on the map is real and unobserved, and a side's knowledge
// of it is therefore earned by walking there.
//
// # What it publishes
//
// Two masks per town, and two counts per side.
//
// Town.SightedSides is who can see the town now, widened by the sighting
// memory: a side whose last sighting is still inside the window keeps its bit,
// because a rider who saw a town last week still knows it is there and the map
// should not empty itself under them. Town.EverSeenSides is every side that has
// ever had a bit, never cleared, which is what separates a town nobody has
// found from one that is merely out of sight. Town.LastSeenTick is when any
// side last had it in view, so a client can grey out what is going stale.
//
// Side.VisibleTowns counts the first mask and Side.KnownTowns the second. They
// are kept apart because they answer different questions and collapse to
// different numbers: a side that has walked its whole territory knows a great
// deal and sees very little, and reporting one figure for both would make an
// exploring realm look like a declining one.
//
// # Masks, and why they are floats
//
// The field registry stores every quantity as a float64, so a set of sides is a
// bitmask in a float64. That is exact for any mask using 53 or fewer bits, which
// is checked at the point of use rather than assumed, and the accessors below
// convert through uint64 so no arithmetic is ever done with the float operators.
//
// # What it deliberately does not do
//
// It does not model a separate scout entity, a spy network, or a report delay.
// Those are real Bannerlord features and all of them are downstream of the same
// question this package answers: does this side know this town exists yet. A
// scout system would narrow the set of parties that count; it would not change
// the shape of the answer. Leaving it out keeps the first version honest about
// what it is rather than implying a fidelity it does not have.
//
// # Coupling
//
// This is a system in the ordinary sense: it reads committed state and stages
// writes, and it imports no other system. It does read terrain, which the
// security system also reads, but it carries its own copy of that table rather
// than importing security, because importing another system is exactly the
// coupling CONSTITUTION.md section 2.1 forbids and the decoupling test enforces.
// The duplication is commented at the function that does it.
package visibility

import (
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// KM_PER_LEAGUE converts the map's unit to the unit the world data is projected
// in. One league is three statute miles, which is 4.828032 km.
//
// The value is not chosen here: services/world-data/src/worlddata/sim_feed.py
// projects real longitude and latitude onto this map with the same constant, so
// a town placed by the pipeline and a town placed by the generator are the same
// distance from each other in leagues. Using a different figure would mean the
// sight radius meant one thing on a real map and another on a synthetic one,
// which is the sort of drift that stays invisible until two runs are compared.
const KM_PER_LEAGUE = 4.828032

// maxSided is the highest side id a mask can carry. A float64 holds integers
// exactly up to 2^53, so bits 0 through 52 are safe and bit 53 would round. A
// side id at or above that would produce a mask that silently reports the wrong
// set of sides, so sideBit returns zero for it and the caller skips the side
// rather than writing a wrong answer.
const maxSided = 53

// System returns the fog-of-war system.
func System() sim.System {
	return sim.System{
		Name: "visibility",
		Doc:  "fog of war: each side sees the towns its parties are close enough to spot",
		Runs: run,
	}
}

// townSight is what one town looks like from every side at once, before any of
// it is staged. It is a value rather than a write because the computation is a
// sweep over all towns and all sides, and building the whole answer first means
// the writes come out in one deterministic order instead of interleaved with
// the reads that produced them.
type townSight struct {
	townID int
	// sighted is the mask of sides that can see the town now, widened by the
	// sighting memory window. It is a uint64 internally because that is what
	// the bit arithmetic needs; it is converted to float64 only when staged.
	sighted uint64
	// discovered is how many sides in sighted did not have the town before. It
	// is what separates "another army walked past" from "this side has just
	// learned a town exists", which are the same computation and not the same
	// event.
	discovered float64
	// nearest is the closest approach any observer made, in leagues, and
	// observers is how many parties could see it. Both go into the read record
	// so the cause log says why a town was spotted, not merely that it was.
	nearest   float64
	observers int
	// observed reports whether any party had the town in view this tick, as
	// opposed to the town being carried by the sighting memory. It is what
	// decides whether last_seen_tick moves.
	observed bool
	// radius is the sight radius that produced this result, carried so the read
	// record states the radius actually used rather than the configured one,
	// which differ on rough ground, in winter, and for a large town.
	radius float64
}

// villageSight is the townSight for a village: which sides can see it now.
type villageSight struct {
	villageID int
	sighted   uint64
	discovered float64
	nearest   float64
	observers int
	observed  bool
	radius    float64
}

// run recomputes every town's visibility and publishes it.
func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg.Visibility

	// --- observers, grouped by the side they report to ---
	//
	// One pass over the parties builds the list of eyes, so the town sweep
	// below costs O(towns * observers on that side) instead of re-walking every
	// party for every town, and the unaffiliated-party rule sits in one place
	// rather than inside the inner loop.
	observers := observersBySide(v, c)

	// --- the sweep ---
	//
	// Every town above the population floor is swept every tick, including the
	// ones nothing can see. That is deliberate and it is the difference between
	// fog that can be switched off and fog that cannot: a town whose only
	// observer marched away last week still holds the mask it was given, so
	// skipping it here would leave that mask in place for the rest of the run.
	// Skipping unobserved towns is only safe if something else clears them, and
	// the honest place for that is here.
	//
	// The sweep order is by town id, so the writes are staged in a fixed
	// sequence whatever order the underlying maps iterate in. That is not
	// tidiness: the engine rejects two different absolute writes to one field in
	// a tick as order-dependent, and a staging order that varied with map
	// iteration would eventually trip that guard.
	today := float64(v.Tick)
	sights := make([]townSight, 0, len(v.State.Towns))
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil {
			continue
		}
		if s, ok := sightTown(v, c, t, observers, today); ok {
			sights = append(sights, s)
		} else {
			// Either the town is too small to be worth reporting, or nothing
			// can see it and it has never been seen. Both cases publish a zero
			// mask, which is the state that stops the previous tick's sighting
			// lingering.
			sights = append(sights, townSight{
				townID:   tid,
				nearest:  math.Inf(1),
				radius:   sightRadiusLeagues(c, t, v.Day),
				observed: false,
			})
		}
	}

	// --- publish ---
	//
	// The town masks and the side counts are staged from one pass because they
	// are two views of a single computation. A town that gains a sighting bit
	// is the same event as a side's visible-town count rising, and splitting
	// them across two ticks would produce a state in which the town says a side
	// can see it and that side's own tally disagrees.
	visibleBySide := map[int]float64{}
	knownBySide := map[int]float64{}
	for _, s := range sights {
		t := v.State.Towns[s.townID]
		if t == nil {
			continue
		}
		read := shared.ReadString(
			shared.PairI("town", s.townID),
			shared.PairF("nearest_leagues", nearestOrZero(s.nearest)),
			shared.PairI("observers", s.observers),
			shared.PairF("sight_radius_leagues", s.radius),
		)
		causes := v.Log.RecentFor(model.KindTown, s.townID,
			[]string{"population", "garrison"}, 3)

		w.Set(model.KindTown, s.townID, "sighted_sides", maskToFloat(s.sighted),
			read, causes, "sides that can see this town")

		// The cumulative mask is the one real event this system produces: a side
		// learning that a town exists. It only moves when a bit is genuinely new,
		// and it is the write a player would ask the Why panel about.
		if s.discovered > 0 {
			ever := maskOf(t.EverSeenSides) | s.sighted
			w.Set(model.KindTown, s.townID, "ever_seen_sides", maskToFloat(ever),
				read, causes, "newly sighted by one or more sides")
		}

		// last_seen_tick moves only when somebody actually looked. Stamping it
		// every tick would refresh the sighting memory window forever and a town
		// would stay "currently seen" by whichever side first walked past it,
		// which is a fog of war that can never be switched off.
		if s.observers > 0 {
			w.Set(model.KindTown, s.townID, "last_seen_tick", today,
				read, causes, "last observed")
		}

		for _, sid := range v.State.SideIDs() {
			bit := sideBit(sid)
			if bit == 0 {
				continue
			}
			if s.sighted&bit != 0 {
				visibleBySide[sid]++
			}
			if maskOf(t.EverSeenSides)&bit != 0 || s.sighted&bit != 0 {
				knownBySide[sid]++
			}
		}
	}

	for _, sid := range v.State.SideIDs() {
		if v.State.Sides[sid] == nil {
			continue
		}
		read := shared.ReadString(
			shared.PairI("side", sid),
			shared.PairF("visible_towns", visibleBySide[sid]),
			shared.PairF("known_towns", knownBySide[sid]),
		)
		causes := v.Log.RecentFor(model.KindSide, sid, []string{"side_towns", "side_strength"}, 2)
		w.Set(model.KindSide, sid, "side_visible_towns", visibleBySide[sid],
			read, causes, "towns in sight")
		w.Set(model.KindSide, sid, "side_known_towns", knownBySide[sid],
			read, causes, "towns ever found")
	}

	// --- villages ---
	//
	// Villages are fogged exactly like towns: a side sees a village when one
	// of its parties is within sight radius. The sweep mirrors the town one
	// above, with the village's own population floor and radius.
	villageSights := make([]villageSight, 0, len(v.State.Villages))
	for _, vid := range v.State.VillageIDs() {
		vl := v.State.Villages[vid]
		if vl == nil {
			continue
		}
		if s, ok := sightVillage(v, c, vl, observers, today); ok {
			villageSights = append(villageSights, s)
		}
	}

	for _, s := range villageSights {
		vl := v.State.Villages[s.villageID]
		if vl == nil {
			continue
		}
		read := shared.ReadString(
			shared.PairI("village", s.villageID),
			shared.PairF("nearest_leagues", nearestOrZero(s.nearest)),
			shared.PairI("observers", s.observers),
			shared.PairF("sight_radius_leagues", s.radius),
		)
		causes := v.Log.RecentFor(model.KindVillage, s.villageID,
			[]string{"village_population"}, 2)

		w.Set(model.KindVillage, s.villageID, "village_sighted_sides", maskToFloat(s.sighted),
			read, causes, "sides that can see this village")

		if s.discovered > 0 {
			ever := maskOf(vl.EverSeenSides) | s.sighted
			w.Set(model.KindVillage, s.villageID, "village_ever_seen_sides", maskToFloat(ever),
				read, causes, "newly sighted by one or more sides")
		}

		if s.observers > 0 {
			w.Set(model.KindVillage, s.villageID, "village_last_seen_tick", today,
				read, causes, "last observed")
		}
	}
}

// observer is one party's ability to see, resolved once so the inner loop is
// arithmetic rather than repeated map lookups.
type observer struct {
	x, y float64
	// ownTown is the town this party is standing in, or -1. A party inside a
	// town sees it regardless of radius, which is the difference between a city
	// you are standing in and a city you are looking at from a hill. The flag
	// exists because a radius tuned small enough to make fog of war interesting
	// would otherwise fog out the town an army is camped in.
	ownTown int
}

// observersBySide groups every party that can see anything by the side it
// reports to.
//
// Unaffiliated parties (raider bands, SideID -1) are dropped unless the config
// says otherwise. They have no side to report to, so including them would mean
// inventing a recipient, and a bandit band illuminating the map on behalf of
// nobody is not a feature.
func observersBySide(v *sim.View, c config.Visibility) map[int][]observer {
	out := map[int][]observer{}
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil {
			continue
		}
		if p.SideID < 0 && !c.UnaffiliatedPartiesSee {
			continue
		}
		// A party with no troops has nobody standing watch. Counting it would
		// let a gutted column keep a town lit up long after the men who could
		// see it are dead, which is invisible in a log and obvious on screen.
		if p.Troops <= 0 {
			continue
		}
		o := observer{x: p.X, y: p.Y, ownTown: -1}
		if c.OwnPartySeesTown {
			// The destination is checked first because it is the town the party
			// is actually walking toward and costs one map lookup.
			if t := v.State.Towns[p.DestTown]; t != nil && near(p.X, p.Y, t.X, t.Y) {
				o.ownTown = t.ID
			} else if t := v.State.TownOf(p); t >= 0 {
				// TownOf returns the nearest town at any distance, not the town
				// a party is standing in, so its answer still has to be range
				// checked. Taking it as-is would give every party the nearest
				// town on the map as a free permanent sighting, and fog of war
				// would report one town per side forever.
				if tn := v.State.Towns[t]; tn != nil && near(p.X, p.Y, tn.X, tn.Y) {
					o.ownTown = t
				}
			}
		}
		out[p.SideID] = append(out[p.SideID], o)
	}
	return out
}

// sightTown works out one town's mask from every observer on the map.
func sightTown(v *sim.View, c config.Visibility, t *model.Town,
	observers map[int][]observer, today float64) (townSight, bool) {

	// A town nobody would bother reporting is not reported. An abandoned place
	// is real and it is on the map, but a rider does not ride past a hamlet of
	// four people to write down that it still has four people in it.
	if t.Population < c.MinPopulationToBeSeen {
		return townSight{}, false
	}

	s := townSight{
		townID:  t.ID,
		nearest: math.Inf(1),
		radius:  sightRadiusLeagues(c, t, v.Day),
	}
	ever := maskOf(t.EverSeenSides)

	for _, sid := range v.State.SideIDs() {
		bit := sideBit(sid)
		if bit == 0 {
			continue
		}
		for _, o := range observers[sid] {
			dx := t.X - o.x
			dy := t.Y - o.y
			d := math.Sqrt(dx*dx + dy*dy)
			// Standing in a town counts as seeing it even if the radius has
			// been tuned small enough that the town centre falls outside it.
			if d > s.radius && o.ownTown != t.ID {
				continue
			}
			s.sighted |= bit
			s.observers++
			if d < s.nearest {
				s.nearest = d
			}
		}
	}

	// The sighting memory: a side that saw the town recently keeps its bit after
	// the observer has gone, so marching away from a town does not un-know it.
	// The window is measured from the town's own last sighting rather than from
	// a per-side sighting time. That is a deliberate simplification and it runs
	// in the safe direction: a side keeps a town for a while after any observer
	// has gone rather than after its own observer has gone, so it can
	// over-remember slightly and never under-remember. Recording a sighting time
	// per side per town would multiply the state by the side count for a
	// distinction no player can act on.
	if c.SightingMemoryDays > 0 && t.LastSeenTick >= 0 && today-t.LastSeenTick <= c.SightingMemoryDays {
		s.sighted |= ever
	}

	if s.observers == 0 && s.sighted == 0 {
		return townSight{}, false
	}
	s.observed = s.observers > 0
	s.discovered = countBits(s.sighted &^ ever)
	return s, true
}

// sightRadiusLeagues is how far one party can see, for one town, on one day.
//
// Three things move it off the base radius, and each is a real reason a rider
// would see less far rather than a fudge factor:
//
//   - ground. A town behind mountains is harder to make out than one on the
//     same flat plain, so the town's own terrain costs reach. The table is a
//     local copy of security's roughness rather than an import; see
//     terrainRoughness for why.
//   - season. Winter costs the most and the shoulder seasons cost a little, on
//     the same day boundaries the march system uses, so a column that cannot
//     see far in January is the column that marches slowly in January.
//   - size. A city is visible from further off than a hamlet, because a city has
//     towers, a market, and smoke. Population is the proxy the world data
//     already carries, normalised against a fixed large-city figure rather than
//     the largest town in this particular world, so a run on a small map does
//     not silently change what "big" means.
func sightRadiusLeagues(c config.Visibility, t *model.Town, day int) float64 {
	radius := c.SightRadiusKm / KM_PER_LEAGUE
	radius *= 1 - c.TerrainSightPenalty*terrainRoughness(t.Terrain)
	radius *= 1 - c.SeasonSightPenalty*seasonWeight(day)

	if c.SettlementSizeSightBonus > 0 && t.Population > 0 {
		const largeCityPopulation = 50000.0
		share := shared.Clamp01(t.Population / largeCityPopulation)
		radius *= 1 + c.SettlementSizeSightBonus*share
	}
	return shared.Clamp(radius, 0, math.Inf(1))
}

// sightVillage is sightTown for a village: which sides can see it.
//
// Villages use the base sight radius with only the season penalty. They carry
// no terrain field (unlike towns), and they are too small for the settlement-
// size bonus to matter — a hamlet has no towers or market smoke to spot from
// further off.
func sightVillage(v *sim.View, c config.Visibility, vl *model.Village,
	observers map[int][]observer, today float64) (villageSight, bool) {

	if vl.Population < c.MinPopulationToBeSeen {
		return villageSight{}, false
	}

	radius := c.SightRadiusKm / KM_PER_LEAGUE
	radius *= 1 - c.SeasonSightPenalty*seasonWeight(v.Day)
	radius = shared.Clamp(radius, 0, math.Inf(1))

	s := villageSight{
		villageID: vl.ID,
		nearest:   math.Inf(1),
		radius:    radius,
	}
	ever := maskOf(vl.EverSeenSides)

	for _, sid := range v.State.SideIDs() {
		bit := sideBit(sid)
		if bit == 0 {
			continue
		}
		for _, o := range observers[sid] {
			dx := vl.X - o.x
			dy := vl.Y - o.y
			d := math.Sqrt(dx*dx + dy*dy)
			if d > s.radius {
				continue
			}
			s.sighted |= bit
			s.observers++
			if d < s.nearest {
				s.nearest = d
			}
		}
	}

	if c.SightingMemoryDays > 0 && vl.LastSeenTick >= 0 && today-vl.LastSeenTick <= c.SightingMemoryDays {
		s.sighted |= ever
	}

	if s.observers == 0 && s.sighted == 0 {
		return villageSight{}, false
	}
	s.observed = s.observers > 0
	s.discovered = countBits(s.sighted &^ ever)
	return s, true
}

// seasonWeight is how much of the season penalty applies on a given day of the
// year, from 0 in the mild seasons to 1 at midwinter. The boundaries match the
// march system's: winter is days 0-59 and 330-364, autumn is 240-329, and
// spring and summer are unpenalised.
//
// Sharing the boundaries rather than the code is the point. If the two systems
// disagreed about when winter is, a column would be slowed by one rule and
// allowed to see under another, and the disagreement would be invisible.
func seasonWeight(day int) float64 {
	d := ((day % 365) + 365) % 365
	switch {
	case d < 60 || d >= 330:
		return 1
	case d >= 240:
		return 0.5
	default:
		return 0
	}
}

// terrainRoughness returns how much a terrain type hides what lies beyond it,
// from 0 for plain to 1 for mountains.
//
// This duplicates security.terrainRoughness, which that system exports for the
// march, logistics, and attrition packages to read. The duplication is the
// decoupling rule working as intended: importing security from here would make
// one system reach into another, which CONSTITUTION.md section 2.1 forbids and
// the decoupling test fails on. The values agree today; if one is retuned the
// other should be, and CHANGELOG.md records the change either way.
//
// A system's own copy is acceptable here because this table is a statement about
// what terrain conceals, not about how it slows or endangers a traveller. March
// asks how slow the ground is, security asks how dangerous it is, and this one
// asks how much it hides. The three answers share a shape without being the
// same fact, and coupling them would make changing one of them a change to all
// three.
func terrainRoughness(terrain int) float64 {
	switch terrain {
	case model.TerrainPlain:
		return 0
	case model.TerrainForest:
		return 0.3
	case model.TerrainHills:
		return 0.35
	case model.TerrainMountain:
		return 0.8
	case model.TerrainSwamp:
		return 0.6
	case model.TerrainCoast:
		return 0.15
	default:
		return 0.2
	}
}

// sideBit returns the mask bit for a side id.
//
// The bit index is the side id itself rather than id-1, so side 1 is bit 1 and
// bit 0 goes unused. That costs one bit and buys the thing that matters most
// here: a mask printed in a cause-log row reads as the side ids holding it, with
// no off-by-one for a reader to unpick. A mask of 6 is sides 1 and 2.
//
// A side id at or above maxSided returns zero. The caller skips those sides
// rather than producing a mask that rounds into the wrong set.
func sideBit(sideID int) uint64 {
	if sideID < 0 || sideID >= maxSided {
		return 0
	}
	return uint64(1) << uint(sideID)
}

// maskOf converts a stored mask to the integer the bit arithmetic uses.
//
// The conversion is exact for every mask with 53 or fewer bits, which is every
// mask sideBit can produce, so nothing is lost in either direction.
func maskOf(v float64) uint64 { return uint64(v) }

// maskToFloat converts back for staging into a field.
func maskToFloat(m uint64) float64 { return float64(m) }

// countBits returns how many sides a mask holds.
func countBits(m uint64) float64 {
	n := 0.0
	for i := 0; i < maxSided; i++ {
		if m&(uint64(1)<<uint(i)) != 0 {
			n++
		}
	}
	return n
}

// nearestOrZero renders an infinite "nobody came near this" distance as a
// number a reader can use. An infinity in a cause-log read column is worse than
// a zero, because it looks like a measurement rather than the absence of one.
func nearestOrZero(d float64) float64 {
	if math.IsInf(d, 0) || math.IsNaN(d) {
		return 0
	}
	return d
}

// near reports whether two points are within a league of each other on both
// axes, which is the tolerance for "standing in this town". It compares squared
// distances so the observer pass costs no square root.
func near(ax, ay, bx, by float64) bool {
	const eps = 1.0
	dx := ax - bx
	dy := ay - by
	return dx*dx+dy*dy <= eps*eps
}

// SightRadiusKm returns the base sight radius in kilometres, for a report that
// has to state it in the unit the design was written in.
func SightRadiusKm(c config.Visibility) float64 { return c.SightRadiusKm }

// SideSees reports whether a mask holds a side's bit.
//
// It is the only supported way to read a mask. The bit layout is an
// implementation detail of this package, and a caller that indexed the bits
// itself would break the day the layout changed.
func SideSees(mask float64, sideID int) bool {
	bit := sideBit(sideID)
	return bit != 0 && maskOf(mask)&bit != 0
}

// VisibleTowns returns the mask of sides that can currently see a town. The
// apiserver reads it to answer "can this side see this town" without
// re-deriving the rule, which is the whole reason the system publishes it.
func VisibleTowns(t *model.Town) float64 {
	if t == nil {
		return 0
	}
	return t.SightedSides
}

// EverSeen returns the mask of sides that have ever seen a town.
func EverSeen(t *model.Town) float64 {
	if t == nil {
		return 0
	}
	return t.EverSeenSides
}

// KnownTowns lists the town ids a side has ever seen, in ascending order.
//
// This is the query the snapshot needs: a client asking for a side's map wants
// the set of towns that side knows about, not a raw mask. Building the set here
// keeps the bit layout in one file.
func KnownTowns(s *model.State, sideID int) []int {
	out := make([]int, 0, len(s.Towns))
	for _, tid := range s.TownIDs() {
		t := s.Towns[tid]
		if t == nil {
			continue
		}
		if SideSees(t.EverSeenSides, sideID) {
			out = append(out, tid)
		}
	}
	return out
}

// CurrentlyVisibleTowns lists the town ids a side can see right now.
func CurrentlyVisibleTowns(s *model.State, sideID int) []int {
	out := make([]int, 0, len(s.Towns))
	for _, tid := range s.TownIDs() {
		t := s.Towns[tid]
		if t == nil {
			continue
		}
		if SideSees(t.SightedSides, sideID) {
			out = append(out, tid)
		}
	}
	return out
}
