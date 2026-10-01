package battle

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/rng"
)

// stageMorale computes every unit's morale change, and decides who breaks, who
// routs, who rallies, and who surrenders.
//
// This is COMBAT.md section 6 and SPEC.md section 5.2, and it is the stage that
// decides most battles. Six terms move a unit's morale, in the order they
// matter:
//
//  1. Casualties seen. battle.morale_casualty_hit per second per unit of
//     weighted casualties inside battle.morale_neighbourhood, falling off to
//     battle.morale_casualty_falloff at the edge of it. A friend killed nearby
//     frightens; an enemy killed nearby heartens, by the same constant, because
//     a man on either side reads the same sight and reacts to it in opposite
//     directions. A formation breaks because of what it can see, not because of
//     an arithmetic total, so a man killed two hundred metres behind the line
//     frightens nobody here.
//  2. Local balance. The friendly-to-enemy weight ratio inside the
//     neighbourhood, against battle.morale_ratio_neutral, scaled by
//     battle.morale_ratio_weight. A flank that has been turned feels it locally
//     long before the battle's totals say anything about it. This term is why a
//     flank folds.
//  3. Panic. battle.morale_panic_spread per second per routed unit nearby.
//     SPEC.md section 5.2: one man running takes his neighbours with him, which
//     is the whole reason a rout spreads rather than staying where it started.
//  4. Suppression. battle.morale_suppression_hit per second at full
//     suppression. Incoming fire lowers a unit's effectiveness and its morale
//     together, and suppression is what turns a fire into a broken line.
//  5. Command. battle.morale_leader_bonus per second, scaled by the strongest
//     commander in reach and by that commander's influence. RULERS.md section 4
//     made mechanical.
//  6. Recovery, and the cost of being unable to answer.
//     battle.morale_recovery per second for a unit that is neither suppressed
//     nor opposed; battle.morale_unarmed_hit per second for a shooter with no
//     ammunition, because men notice when they cannot fight back.
//
// The thresholds come from the same numbers:
//
//	morale >= morale_break_threshold   fighting
//	morale <  morale_break_threshold   broken: holds ground, strikes at reduced
//	                                   effect, and can rally
//	morale <  morale_rout_threshold    routed: runs, spreads panic, takes extra
//	                                   exposure, and rallies only with a leader
//
// A broken unit is deliberately not a routed one. A shaken line that can be
// pushed back and steadied is a different battle from one that disintegrates,
// and collapsing the two states would throw away the decision a commander
// actually makes in the middle of a fight.
//
// Every casualty the stage reads is read from the spatial hash, which holds dead
// units for the rest of the battle at the position where they fell. They are the
// reason a rout spreads down a line and not merely off its front.
func (b *Battle) stageMorale() {
	c := b.c
	r := b.rngFor("morale")
	span := c.MoraleNeighbourhood
	span2 := span * span
	dt := c.TickSeconds

	for i := range b.units {
		u := b.units[i]
		s := &b.snap[i]
		d := &b.deltas[i]
		if !u.alive() {
			continue
		}

		var friendly, enemy, friendDead, enemyDead, routed float64
		// The neighbourhood query runs against the COARSE hash, not the melee
		// one, and that is the single most important performance decision in the
		// tick. battle.morale_neighbourhood is ninety metres and
		// battle.grid_cell_size is twelve, so walking this query on the melee
		// hash costs a fifteen-by-fifteen block of cell lookups — two hundred
		// and twenty-five of them — for every unit, every tick. On the coarse
		// hash, whose cells are tens of metres across, the same ninety-metre
		// neighbourhood is a three-by-three block: nine lookups.
		//
		// The number of units examined is much the same either way, because a
		// wide cell in a crowded block holds about as many units as several
		// narrow ones. What changes by a factor of twenty-five is the cost of
		// finding them, and a CPU profile of the 100 v 100 battle put 78% of the
		// run in cell lookup rather than in the neighbour arithmetic. A battle
		// that cannot be simulated is a battle that is not simulated, so the
		// query takes the shape its radius actually wants.
		b.fireHash.forEachCell(s.X, s.Y, span, func(id int) {
			cand := b.byID[id]
			d2 := dist2(cand.X-s.X, cand.Y-s.Y)
			if d2 > span2 {
				return
			}
			// How much of this neighbour's state reaches the unit: full at the
			// centre, battle.morale_casualty_falloff at the edge of the
			// neighbourhood.
			reach := 1 - c.MoraleCasualtyFalloff
			if d2 > 0 {
				t := math.Sqrt(d2) / span
				if t < 1 {
					reach = 1 - t*(1-c.MoraleCasualtyFalloff)
				}
			}
			cs := &b.snap[id]
			if cand.Side == u.Side {
				if !cand.alive() {
					friendDead += cand.Troops * reach
					return
				}
				if cs.Status == StatusRouted {
					routed += cand.Troops * reach
					return
				}
				friendly += cand.Troops * cand.hpFrac() * reach
				return
			}
			if !cand.alive() {
				enemyDead += cand.Troops * reach
				return
			}
			enemy += cand.Troops * cand.hpFrac() * reach
		})

		// 1. casualties seen, on both sides.
		d.Morale += c.MoraleCasualtyHit * (enemyDead - friendDead) * dt

		// 2. local balance.
		//
		// Only when there IS enemy weight in the neighbourhood. The constant is a
		// FRIENDLY-TO-ENEMY ratio, and a ratio with no enemy in it is not a
		// neutral reading, it is a division that happens to land on one:
		// friendly/(friendly+0) is exactly 1.0, so a column that has not yet
		// closed to firing range computed itself as overwhelmingly advantaged
		// and took the full morale_ratio_weight at the top of the scale every
		// tick. Measured on the 500 v 500 battle, that pinned every unit of both
		// sides at morale 1.000 for the first 220 ticks — the entire approach —
		// and left the whole of a battle's morale dynamic with nowhere to fall
		// when contact finally came.
		//
		// A man who has not seen the enemy is not reassured, he is uninformed,
		// and battle.morale_recovery is the term that governs him: it already
		// requires enemy == 0, so the two agree about what an unopposed unit is
		// doing, and with this term guarded a pre-contact army holds near its
		// starting morale instead of being wound to the cap.
		if enemy > 0 {
			total := friendly + enemy
			if total > 0 {
				d.Morale += c.MoraleRatioWeight * (friendly/total - c.MoraleRatioNeutral) * dt
			}
		}

		// 3. panic.
		//
		// Measured as the SHARE of the unit's own side inside the neighbourhood
		// that is running, not as a raw count of running neighbours.
		//
		// A raw count is not merely larger than intended at scale, it is
		// unstable, and the instability is the whole problem. One routed
		// neighbour costs morale_panic_spread * tick_seconds of morale; a unit
		// in a five hundred strong formation can see roughly two hundred and
		// fifty of its own side inside morale_neighbourhood, so a handful of
		// men breaking hands every unit in the army a cost of several points of
		// morale in a single tick. The feedback gain is then far above one and
		// the term diverges: measured on the 500 v 500 battle the mean panic
		// term went -0.10, -0.11, -0.84, -48.5 over four consecutive ticks, and
		// the whole army was running before a single blow was struck.
		//
		// COMBAT.md section 13 and SPEC.md section 5.1 require this engine to
		// carry three hundred and a thousand units, so a term whose strength
		// depends on how many men happen to fit in the neighbourhood cannot be
		// the one the model is allowed to have. As a share it is bounded by
		// battle.morale_panic_spread * tick_seconds whatever the size of the
		// battle, and the constant's documented range of 0-20 reads as exactly
		// that: the morale a unit loses per tick when everything it can see of
		// its own side is running.
		//
		// The intent is preserved, and sharpened. SPEC.md section 5.2 is "one
		// man running takes his neighbours with him", and a share says precisely
		// that: one man running among many unsettles his neighbours a little, and
		// one man running among few unsettles them a lot. A raw count cannot
		// distinguish those cases at all — it charges the same enormous penalty
		// for the first man to run as for the two hundred and fiftieth, which is
		// why a single break at the front line used to empty the field.
		ownTotal := friendly + friendDead + routed
		if routed > 0 && ownTotal > 0 {
			d.Morale -= c.MoralePanicSpread * (routed / ownTotal) * dt
		}

		// 4. suppression.
		d.Morale -= c.MoraleSuppressionHit * clamp01(s.Suppression/c.SuppressionCap) * dt

		// 5. command.
		if lead := b.leaderSteadying(u.Side, s.X, s.Y); lead > 0 {
			d.Morale += c.MoraleLeaderBonus * lead * dt
		}

		// 6. the cost of being unable to answer, and recovery.
		if u.Role == RoleRanged && s.Ammo < 1 {
			d.Morale -= c.MoraleUnarmedHit * dt
		}
		if s.Suppression < c.SuppressionCap*c.MoraleRecoverySuppressionBand &&
			enemy == 0 && s.Status == StatusFighting {
			d.Morale += c.MoraleRecovery * dt
		}

		b.resolveCondition(i, u, s, d, r)
	}
}

// recoverySuppressionBand is gone. It is now
// battle.morale_recovery_suppression_band in the balance file. The reasoning it
// carried is kept, because it is the answer to why a threshold inside a rule
// still belongs in the balance file.
//
// It is a threshold inside a rule rather than a tunable rate: at what point a
// man under fire has got his head down is a matter of what "under fire" means,
// not a rate a designer tunes. It was still a number that decided whether a
// shaken line could recover, and CONSTITUTION.md section 1.2 has no exception
// for numbers that are easy to reason about. Below this band a unit with no
// enemy in sight creeps back toward steady.

// resolveCondition turns a unit's morale into a status, and decides whether it
// rallies or surrenders.
//
// It runs inside the morale stage because every one of those decisions reads the
// morale this stage has just computed. Splitting them across a second stage would
// mean one of them had to re-derive the other's number from the delta buffer,
// which is the sort of duplication that produces two answers.
func (b *Battle) resolveCondition(i int, u *Unit, s *snapshot, d *delta, r *rng.Rng) {
	c := b.c
	// The morale this unit will hold after this tick's deltas, computed with the
	// same expression and the same bounds the commit will use, so the stage
	// decides on the value the unit will actually have.
	projected := clamp(s.Morale+d.Morale, c.MoraleFloor, 1)

	switch {
	case projected < c.MoraleRoutThreshold:
		if s.Status != StatusRouted {
			if d.stageStatus(StatusRouted) {
				b.addEvent(Event{
					Tick:  b.tickNo,
					Side:  u.Side,
					Kind:  EventRouted,
					Unit:  u.ID,
					Value: projected,
					Read:  readMorale(s, d, projected),
					Note: fmt.Sprintf("unit %d (%s, %.0f troops, %s) broke and ran at (%.1f, %.1f)",
						u.ID, u.Role, u.Troops, u.Side, s.X, s.Y),
				})
			}
			return
		}
		// Already running. A leader may still turn it; without one, the bare
		// chance is deliberately tiny, because nobody reassembles a routed line
		// on their own.
		if b.canRally(u, s) && r.Chance(c.RallyRoutedChance*b.rallyBonus(u, s)) {
			b.stageRally(i, u, d, projected)
		}

	case projected < c.MoraleBreakThreshold:
		if s.Status == StatusFighting {
			if d.stageStatus(StatusBroken) {
				b.addEvent(Event{
					Tick:  b.tickNo,
					Side:  u.Side,
					Kind:  EventBroken,
					Unit:  u.ID,
					Value: projected,
					Read:  readMorale(s, d, projected),
					Note: fmt.Sprintf("unit %d (%s, %.0f troops, %s) broke at (%.1f, %.1f)",
						u.ID, u.Role, u.Troops, u.Side, s.X, s.Y),
				})
			}
			return
		}
		// Already shaken. A rally is a decision by an officer, not a passive
		// regeneration, so it is a chance rather than a rate. The gain is enough
		// to clear the break threshold from a hair below it and not enough to
		// rescue a man who has been comprehensively beaten.
		if r.Chance(c.RallyChance) {
			b.stageRally(i, u, d, projected)
		}

	default:
		// Above both thresholds. A unit that is still marked broken or routed has
		// the ground back but has not yet been picked up, which is the
		// difference between a line that recovers and a line that does not.
		if s.Status == StatusRouted {
			if b.canRally(u, s) && r.Chance(c.RallyRoutedChance*b.rallyBonus(u, s)) {
				b.stageRally(i, u, d, projected)
			}
			return
		}
		if s.Status == StatusBroken && r.Chance(c.RallyChance) {
			b.stageRally(i, u, d, projected)
		}
	}

	// Surrender. COMBAT.md section 6: routing troops run, and may surrender.
	// A man still being chased does not surrender, so the enemy must be out of
	// surrender_range, and it is a chance rather than a switch, because it is an
	// officer deciding to stop rather than a condition switching on.
	if s.Status == StatusRouted && !b.enemyWithin(s.X, s.Y, u.Side, c.SurrenderRange) {
		if r.Chance(c.SurrenderChance) {
			d.supersedeStatus(StatusSurrendered)
			b.addEvent(Event{
				Tick:  b.tickNo,
				Side:  u.Side,
				Kind:  EventSurrendered,
				Unit:  u.ID,
				Value: c.SurrenderMoraleReport,
				Read:  readMorale(s, d, projected),
				Note: fmt.Sprintf("unit %d (%s, %.0f troops, %s) surrendered at (%.1f, %.1f)",
					u.ID, u.Role, u.Troops, u.Side, s.X, s.Y),
			})
		}
	}
}

// stageRally stages a rally: a lump of morale and a return to fighting.
//
// The gain is battle.rally_morale_gain, scaled up by the leader's steadying when
// a commander is in reach, because somebody shouting turns a panic and nobody
// does not. A unit rallying with no leader gets the bare gain.
//
// The status is claimed BEFORE the gain is added and before the event is
// written, because a rally that loses the tick's status race must have no effect
// at all. A broken unit is offered a rally every tick it spends broken, and the
// intent stage claims StatusBroken for it every one of those ticks, so an
// unclaimed rally would add morale and a report line for a rally that never
// happened.
func (b *Battle) stageRally(i int, u *Unit, d *delta, projected float64) {
	c := b.c
	s := &b.snap[i]
	if !d.stageStatus(StatusFighting) {
		return
	}
	gain := c.RallyMoraleGain * b.rallyBonus(u, s)
	b.addEvent(Event{
		Tick:  b.tickNo,
		Side:  u.Side,
		Kind:  EventRallied,
		Unit:  u.ID,
		Value: projected + gain,
		Read:  readMorale(s, d, projected+gain),
		Note: fmt.Sprintf("unit %d (%s, %.0f troops, %s) rallied at (%.1f, %.1f)",
			u.ID, u.Role, u.Troops, u.Side, s.X, s.Y),
	})
	d.Morale += gain
}

// canRally reports whether a commander is close enough to have any chance of
// turning a routed unit at all.
func (b *Battle) canRally(u *Unit, s *snapshot) bool {
	return b.leaderSteadying(u.Side, s.X, s.Y) > 0
}

// rallyBonus is the multiplier a leader applies to a rally: one for no leader,
// up to battle.rally_leader_multiplier for a fully steadying commander in reach.
func (b *Battle) rallyBonus(u *Unit, s *snapshot) float64 {
	lead := b.leaderSteadying(u.Side, s.X, s.Y)
	if lead <= 0 {
		return 1
	}
	return 1 + (b.c.RallyLeaderMultiplier-1)*lead
}

// leaderSteadying is how strongly the nearest commander steadies troops at a
// point, on a 0-1 scale. battle.morale_leader_influence_reference influence is
// full steadying, and a leader inside battle.morale_leader_radius counts in full.
//
// The strongest leader in range is the one that counts, not the sum of all of
// them. Four lieutenants shouting does not steady a wing the way one commander
// with a staff does, and a sum would let a side manufacture morale by generating
// more officers, which is not something a side gets to choose at the moment
// contact is made.
func (b *Battle) leaderSteadying(side Side, x, y float64) float64 {
	if len(b.leaders) == 0 {
		return 0
	}
	c := b.c
	r2 := c.MoraleLeaderRadius * c.MoraleLeaderRadius
	best := 0.0
	for i := range b.leaders {
		l := &b.leaders[i]
		if l.Side != side {
			continue
		}
		if dist2(l.X-x, l.Y-y) > r2 {
			continue
		}
		if v := clamp01(l.Influence / positiveOrOne(c.MoraleLeaderInfluenceReference)); v > best {
			best = v
		}
	}
	return best
}

// readMorale renders the read record for a morale event: what the unit's morale
// was, what this tick moved it by, and where it ends up.
//
// CONSTITUTION.md section 2.2 requires a change to record what state produced it,
// and this is that record for a battle event. The battle layer does not write to
// the campaign's shared cause log, because a cause row names a model entity and
// there is no entity kind for a soldier; the campaign layer bridges these events
// into battle_log when it writes the aftermath back.
func readMorale(s *snapshot, d *delta, projected float64) string {
	return fmt.Sprintf("morale=%.4f delta=%+.4f -> %.4f", s.Morale, d.Morale, projected)
}
