package battle

import (
	"fmt"
	"math"
	"os"
	"strconv"
	"testing"
	"time"
)

// TestDiagTerms is SCRATCH. It reports, at intervals, the geometry of the field
// and the mean of each morale term across the living units of side A, so the
// question "which term is driving A to rout before contact" is answered by a
// number rather than a theory.
//
// The decomposition duplicates the arithmetic in stageMorale on purpose: this is
// a scratch probe, it is deleted at the end of the investigation, and adding a
// debug hook to the engine to serve a test would be worse than reading the
// engine's own state from the test.
func TestDiagTerms(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	n := 500
	if v := os.Getenv("DIAG_N"); v != "" {
		k, err := strconv.Atoi(v)
		if err != nil {
			t.Fatalf("DIAG_N=%q: %v", v, err)
		}
		n = k
	}
	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatal(err)
	}
	b, err := newBattle(cfg, seed, setup)
	if err != nil {
		t.Fatal(err)
	}
	wall := time.Now()
	c := b.c
	fmt.Printf("\n### n=%d units=%d  melee=%g ranged=[%g,%g] standoff=%g morale_nbhd=%g\n",
		n, len(b.units), c.MeleeRange, c.RangedMinRange, c.RangedRange,
		c.StandoffDistance, c.MoraleNeighbourhood)
	fmt.Printf("    panic_spread=%g casualty_hit=%g ratio_w=%g ratio_neutral=%g recovery=%g supp_hit=%g leader_bonus=%g unarmed=%g\n",
		c.MoralePanicSpread, c.MoraleCasualtyHit, c.MoraleRatioWeight, c.MoraleRatioNeutral,
		c.MoraleRecovery, c.MoraleSuppressionHit, c.MoraleLeaderBonus, c.MoraleUnarmedHit)

	every := 10
	if n <= 10 {
		every = 1
	}
	from := 0
	if v := os.Getenv("DIAG_FROM"); v != "" {
		k, err := strconv.Atoi(v)
		if err != nil {
			t.Fatalf("DIAG_FROM=%q: %v", v, err)
		}
		from, every = k, 1
	}
	for i := 0; i < int(c.MaxTicks); i++ {
		if outcome, decided := b.checkEnding(); decided {
			fmt.Printf("DECIDED tick %d after %s: %v / %v\n",
				b.tickNo, time.Since(wall).Round(time.Millisecond), outcome.Kind, outcome.Reason)
			break
		}
		if b.tickNo >= from && b.tickNo%every == 0 {
			// Rebuild the hashes so this probe reads the same state a stage would.
			b.meleeHash.rebuild(b.units)
			b.fireHash.rebuild(b.units)
			report(b, SideA)
		}
		if err := b.tick(); err != nil {
			t.Fatal(err)
		}
	}
	fmt.Printf("final tickNo=%d wall=%s swings=%v shots=%v dead=%v\n",
		b.tickNo, time.Since(wall).Round(time.Millisecond),
		b.stats.Swings, b.stats.Shots, b.stats.Dead)
	fmt.Printf("--- first 12 morale events, in order, with the read record the engine wrote ---\n")
	shown := 0
	for _, e := range b.events {
		if e.Kind == EventDestroyed {
			continue
		}
		fmt.Printf("  tick %4d %s %-10s %s | %s\n", e.Tick, e.Side, e.Kind, e.Note, e.Read)
		shown++
		if shown >= 12 {
			break
		}
	}
	fmt.Printf("--- first 6 destroyed ---\n")
	shown = 0
	for _, e := range b.events {
		if e.Kind != EventDestroyed {
			continue
		}
		fmt.Printf("  tick %4d %s %s\n", e.Tick, e.Side, e.Note)
		shown++
		if shown >= 6 {
			break
		}
	}
}

// report prints the field geometry and the mean morale term for one side.
func report(b *Battle, side Side) {
	c := b.c
	dt := c.TickSeconds
	span := c.MoraleNeighbourhood
	span2 := span * span

	// Geometry: extents and the closest approach between the two armies.
	var minX, maxX, minY, maxY float64
	var minGap = math.Inf(1)
	first := true
	for _, u := range b.units {
		if u.Side != side || !u.alive() {
			continue
		}
		if first {
			minX, maxX, minY, maxY = u.X, u.X, u.Y, u.Y
			first = false
		}
		minX, maxX = math.Min(minX, u.X), math.Max(maxX, u.X)
		minY, maxY = math.Min(minY, u.Y), math.Max(maxY, u.Y)
		for _, o := range b.units {
			if o.Side == side || !o.alive() {
				continue
			}
			if d := math.Sqrt(dist2(o.X-u.X, o.Y-u.Y)); d < minGap {
				minGap = d
			}
		}
	}
	if minGap == math.Inf(1) {
		minGap = -1
	}

	// Mean of each morale term over the living units of this side.
	var n float64
	var tCasualty, tRatio, tPanic, tSupp, tLeader, tUnarmed, tRecovery float64
	for _, u := range b.units {
		if u.Side != side || !u.alive() {
			continue
		}
		s := &b.snap[u.ID]
		var friendly, enemyW, friendDead, enemyDead, routed float64
		b.fireHash.forEachCell(s.X, s.Y, span, func(id int) {
			cand := b.byID[id]
			d2 := dist2(cand.X-s.X, cand.Y-s.Y)
			if d2 > span2 {
				return
			}
			w := 1 - c.MoraleCasualtyFalloff
			if d2 > 0 {
				if t := math.Sqrt(d2) / span; t < 1 {
					w = 1 - t*(1-c.MoraleCasualtyFalloff)
				}
			}
			if cand.Side == side {
				if !cand.alive() {
					friendDead += cand.Troops * w
					return
				}
				if cand.Status == StatusRouted {
					routed += cand.Troops * w
					return
				}
				friendly += cand.Troops * cand.hpFrac() * w
				return
			}
			if !cand.alive() {
				enemyDead += cand.Troops * w
				return
			}
			enemyW += cand.Troops * cand.hpFrac() * w
		})
		tCasualty += c.MoraleCasualtyHit * (enemyDead - friendDead) * dt
		if enemyW > 0 {
			if tot := friendly + enemyW; tot > 0 {
				tRatio += c.MoraleRatioWeight * (friendly/tot - c.MoraleRatioNeutral) * dt
			}
		}
		if routed > 0 {
			tPanic -= c.MoralePanicSpread * routed * dt
		}
		tSupp -= c.MoraleSuppressionHit * clamp01(s.Suppression/c.SuppressionCap) * dt
		if lead := b.leaderSteadying(side, s.X, s.Y); lead > 0 {
			tLeader += c.MoraleLeaderBonus * lead * dt
		}
		if u.Role == RoleRanged && s.Ammo < 1 {
			tUnarmed -= c.MoraleUnarmedHit * dt
		}
		if s.Suppression < c.SuppressionCap*c.MoraleRecoverySuppressionBand && enemyW == 0 && s.Status == StatusFighting {
			tRecovery += c.MoraleRecovery * dt
		}
		n++
	}
	if n == 0 {
		fmt.Printf("tick %6d side %s: nobody alive\n", b.tickNo, side)
		return
	}
	fmt.Printf("tick %6d %s n=%3.0f x[%7.1f,%7.1f] y[%7.1f,%7.1f] minGap=%7.1f "+
		"morale=%.3f | dM cas=%+.3f rat=%+.3f pan=%+.3f sup=%+.3f ldr=%+.3f una=%+.3f rec=%+.3f\n",
		b.tickNo, side, n, minX, maxX, minY, maxY, minGap, meanMorale(b, side),
		tCasualty/n, tRatio/n, tPanic/n, tSupp/n, tLeader/n, tUnarmed/n, tRecovery/n)
}

func meanMorale(b *Battle, side Side) float64 {
	sum, n := 0.0, 0
	for _, u := range b.units {
		if u.Side == side && u.alive() {
			sum += u.Morale
			n++
		}
	}
	if n == 0 {
		return 0
	}
	return sum / float64(n)
}
