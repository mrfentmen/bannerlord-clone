// Package relation tracks how rulers and sides regard one another, and lets
// grudges spread into coalitions.
//
// Reads gifts, battles, raids, broken oaths, shared enemies, and defections,
// and writes relation scores, general trust, and coalition membership. It is
// chain 9's mechanism: an atrocity is not one relationship damaged, it is a
// whole network of them, and once enough of the network has turned, the
// coalition forms on its own.
package relation

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the relation system.
func System() sim.System {
	return sim.System{
		Name: "relation",
		Doc:  "tracks opinion between rulers and sides; broken oaths spread and coalitions form",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg

	// --- ruler relations drift toward neutral ---
	// Grudges fade and friendships cool, so a single bad day does not make
	// enemies forever. Without this, every raid would compound into permanent
	// hatred and no coalition would ever reform after a peace.
	for _, pair := range v.State.SortedPairs(v.State.Relations).Pairs {
		cur := v.State.Relations[pair]
		next := shared.MoveToward(cur, 0, c.Relation.DriftPerDay)
		if next != cur {
			w.SetRelation(pair.A, pair.B, next,
				shared.Pair("relation", cur), nil, "opinion cools")
		}
	}
	for _, pair := range v.State.SortedPairs(v.State.SideRelations).Pairs {
		cur := v.State.SideRelations[pair]
		next := shared.MoveToward(cur, 0, c.Relation.DriftPerDay*c.Relation.SideDriftShare)
		if next != cur {
			w.SetSideRelation(pair.A, pair.B, next,
				shared.Pair("side_relation", cur), nil, "opinion cools")
		}
	}

	// --- a broken oath damages a network, not a pair ---
	// This is chain 9's second link. The ruler who broke the pledge loses the
	// relation with the ruler they betrayed, and each of that ruler's allies
	// loses a share of it too, because word travels through alliances. Nobody
	// decides to spread it; the damage is computed from the existing network.
	for _, o := range v.State.Oaths {
		if !o.Broken {
			continue
		}
		// Only a newly broken oath is spread; an old one is not re-spread every
		// day, which would compound a single betrayal into permanent
		// unanimity against the betrayer.
		if o.BrokenTick != v.Tick {
			continue
		}
		betrayer, victim := o.Promisor, o.Promisee
		if betrayer < 0 || victim < 0 {
			continue
		}
		if !v.State.Exists(model.KindLeader, betrayer) || !v.State.Exists(model.KindLeader, victim) {
			continue
		}
		oathRead := shared.ReadString(
			shared.PairI("promisor", betrayer),
			shared.PairI("promisee", victim),
			shared.PairI("oath_kind", o.Kind),
			shared.PairF("made_tick", float64(o.MadeTick)))
		causes := v.Log.RecentFor(model.KindLeader, betrayer,
			[]string{"oath_made", "broken_oaths", "renown", "influence", "relation_score"}, 4)
		w.AddRelation(betrayer, victim, -c.Relation.BrokenOathRelation, oathRead, causes, "broke a pledge")
		// Allies of the victim are the ones who hear about it. The share
		// decays with the victim's own relation to the betrayer, so a betrayal
		// of a stranger travels less far than one of a close ally.
		for _, other := range v.State.LeaderIDsSorted() {
			if other == betrayer || other == victim {
				continue
			}
			allyRelation := v.State.Relation(victim, other)
			if allyRelation < c.Relation.AllyThreshold {
				continue
			}
			// An ally of the victim also loses relation with the betrayer, and
			// the betrayer gains the loss of the ally's regard, which is what
			// actually makes the betrayal costly.
			spread := c.Relation.BrokenOathSpread * shared.Clamp01(allyRelation)
			allyRead := oathRead + ", " + shared.Pair("ally_relation", allyRelation)
			w.AddRelation(betrayer, other, -c.Relation.BrokenOathRelation*spread, allyRead, causes, "betrayal reached an ally")
		}
		// The betrayal costs the betrayer influence as well as opinion. The
		// influence system reads the counter.
		w.Add(model.KindLeader, betrayer, "broken_oaths", 1,
			"broke an oath", nil, "")
		w.Add(model.KindLeader, betrayer, "influence", -c.Influence.BrokenOathInfluence,
			"broke an oath", nil, "broke a pledge")
		w.Add(model.KindLeader, betrayer, "renown", -c.Influence.RenownPerBrokenOath,
			"broke an oath", nil, "known as a oath-breaker")
	}

	// --- sides inherit their rulers' opinions ---
	// A side's opinion of another is not a separate thing that has to be
	// maintained by hand; it is what its rulers believe, averaged. That is
	// what lets a ruler's private atrocity change the strategic picture, and
	// it is why a side led by someone who has made enemies finds its
	// alliances quietly eroding.
	for _, a := range v.State.SideIDs() {
		for _, b := range v.State.SideIDs() {
			if a >= b {
				continue
			}
			sum, n := 0.0, 0.0
			for _, rid := range v.State.LeaderIDsSorted() {
				r := v.State.Leaders[rid]
				if r.SideID != a {
					continue
				}
				// Only opinion of the other side's leaders and notable rulers
				// counts; a ruler's view of a random farmer on the other side is
				// not a diplomatic position.
				other := v.State.Leaders[r.RelationsWith]
				if other == nil || other.SideID != b {
					continue
				}
				sum += v.State.Relation(rid, other.ID)
				n++
			}
			if n == 0 {
				continue
			}
			inherited := shared.SafeDiv(sum, n)
			cur := v.State.SideRelation(a, b)
			// The side's own opinion drifts toward what its rulers believe,
			// rather than being replaced instantly, so a single ruler's actions
			// move a relationship without a single decision rewriting it.
			next := shared.MoveToward(cur, inherited, c.Relation.SideInheritRate)
			if next != cur {
				w.SetSideRelation(a, b, next,
					shared.ReadString(
						shared.Pair("side_relation", cur),
						shared.Pair("rulers_average", inherited)),
					v.Log.RecentFor(model.KindSide, a, []string{"relation_score", "broken_oaths"}, 3), "")
			}
		}
	}

	// --- coalitions ---
	// A coalition forms when enough of a side's opinion of a common enemy has
	// turned, and the leaders individually agree. Both conditions, because a
	// side that is generally hostile but whose members disagree will not
	// commit, and a side whose members all agree but who are not really hostile
	// has no reason to. This is chain 9's outcome and it is computed, not
	// announced.
	// A side can only join one coalition per tick: track assignments to avoid
	// staging two absolute writes to the same side's coalition_with field.
	coalitionAssigned := make(map[int]bool)
	for _, a := range v.State.SideIDs() {
		for _, b := range v.State.SideIDs() {
			if a >= b {
				continue
			}
			if coalitionAssigned[a] || coalitionAssigned[b] {
				continue
			}
			relation := v.State.SideRelation(a, b)
			// Only a real enemy, not merely a neutral party.
			if relation > c.Relation.CoalitionThreshold {
				continue
			}
			// Individually: how many of a's rulers would join, judged by
			// their own opinion of b's leader.
			willing, total := 0.0, 0.0
			leader := v.State.Sides[b].LeaderID
			for _, rid := range v.State.LeaderIDsSorted() {
				r := v.State.Leaders[rid]
				if r.SideID != a || r.Leader {
					continue
				}
				total++
				if v.State.Relation(rid, leader) <= c.Relation.CoalitionThreshold+c.Relation.CoalitionSpreadTolerance {
					willing++
				}
			}
			if total == 0 {
				continue
			}
			share := shared.SafeDiv(willing, total)
			if share < c.Relation.CoalitionQuorumShare {
				continue
			}
			read := shared.ReadString(
				shared.Pair("relation", relation),
				shared.Pair("willing_share", share),
				shared.PairI("side_a", a),
				shared.PairI("side_b", b))
			causes := v.Log.RecentFor(model.KindSide, a, []string{"relation_score", "trust", "side_ally"}, 3)
			w.Set(model.KindSide, a, "coalition_with", float64(b), read, causes, "coalition formed")
			w.Set(model.KindSide, b, "coalition_with", float64(a), read, causes, "coalition formed")
			coalitionAssigned[a] = true
			coalitionAssigned[b] = true
			// Trust falls across the network: a betrayal makes future
			// coalitions easier, which is the lasting cost of an atrocity.
			w.Add(model.KindSide, a, "trust", -c.Relation.TrustDecayPerBetrayal, read, causes, "")
			w.Add(model.KindSide, b, "trust", -c.Relation.TrustDecayPerBetrayal, read, causes, "")
		}
	}
}
