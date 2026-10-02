package battle

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/config"
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
		//
		// The candidate read itself comes from the flat mirror rather than from
		// b.byID. This is the stage the profile put 50% of the whole 500 v 500 run
		// in, and 30% of the run in the body of this closure, so the cost of
		// touching a candidate was the largest single cost in the engine. See
		// hotfield.go: same values, same order, four sequential streams instead of
		// a pointer chase into a wide struct, and hpFrac's division hoisted out of
		// a loop that ran it half a million times a tick. Every value read here is
		// the value the pointer chase read, so the arithmetic and its order are
		// unchanged and the golden replay hashes still match.
		hf := &b.hot
		mySide := uint8(u.Side)
		b.fireHash.forEachCell(s.X, s.Y, span, func(id int) {
			d2 := dist2(hf.x[id]-s.X, hf.y[id]-s.Y)
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
			if hf.side[id] == mySide {
				if !hf.alive[id] {
					friendDead += hf.troops[id] * reach
					return
				}
				if hf.snapRouted[id] {
					routed += hf.troops[id] * reach
					return
				}
				friendly += hf.troopsHP[id] * reach
				return
			}
			if !hf.alive[id] {
				enemyDead += hf.troops[id] * reach
				return
			}
			enemy += hf.troopsHP[id] * reach
		})

		// 1. casualties seen, on both sides. See casualtySeen for why it is a
		// share of the local weight and not a count of bodies.
		d.Morale += casualtySeen(friendDead, friendly+routed, enemyDead, enemy+enemyDead, &c, dt)

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
		//
		// WHY A ROUTED MAN STILL COUNTS AS OWN PRESENCE HERE, WHICH IS THE
		// WHOLE FIX
		//
		// This term is a question about the ENEMY: is there more of him here than
		// there is of me. It used to be computed over `friendly`, which counted
		// only units still on their feet, so a man who turned his back was
		// deleted from his own side's strength the instant he ran. The term then
		// read his running as enemy superiority, dropped his neighbours' morale,
		// and made them run too. The feedback gain is far above one and the term
		// diverges.
		//
		// Measured on the 500 v 500 battle, with friendly/(friendly+enemy) and
		// the shipped constants, sweeping the routed share r of a side against
		// the morale a unit loses per tick:
		//
		//	    r   ratio term   panic term    total     ticks 0.72 -> 0.28
		//	  0.0     +1.1250       -0.0000   +1.1250      never
		//	  0.1     +0.7159       -0.0400   +0.6759      never
		//	  0.2     +0.3750       -0.0800   +0.2950      never
		//	  0.3     +0.0865       -0.1200   -0.0335     13.15
		//	  0.5     -0.3750       -0.2000   -0.5750      0.77
		//	  0.7     -0.7279       -0.2800   -1.0079      0.44
		//	  0.9     -1.0066       -0.3600   -1.3666      0.32
		//
		// At a 30% routed share the side is net LOSING morale with nothing having
		// been done to it, and past that it loses more morale per tick than the
		// 0.44 it has to spare before the break threshold, so every remaining
		// unit breaks and runs inside one tick. That is the same divergence the
		// panic term above was already rewritten to remove, in the term next door
		// to it, reached by the same route: a term that counts a man's state
		// instead of his presence.
		//
		// A routed unit is still standing on the field. It is still between you
		// and the enemy, it still blocks the ground, and the enemy still has to
		// get past it. So it counts as own presence, and this term goes back to
		// answering only what it is named for. Measured with routed counted, the
		// same table gives +0.0000 for the ratio term at every share, because
		// your own men running no longer moves the ratio at all: the gain of this
		// term with respect to your own routs is now exactly zero.
		//
		// The panic term keeps its share, and it is now the only term that
		// responds to a rout at all. That is the division of labour the model
		// wants: the ratio says the enemy is heavier here, the panic says my own
		// side is running, and neither one is computed from the other's effect.
		// What genuinely moves the ratio is losing men, which is bounded by the
		// men there are to lose, and it is the same event the casualty term
		// above measures from the other side.
		own := friendly + routed
		if enemy > 0 {
			total := own + enemy
			if total > 0 {
				d.Morale += c.MoraleRatioWeight * ratioImbalance(own/total, &c) * dt
			}
		}

		// 3. panic.
		//
		// Measured as the SHARE of the unit's own side inside the neighbourhood
		// that is running, and applied as a PULL TOWARD A FLOOR rather than as a
		// flat subtraction.
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
		//
		// The pull toward battle.morale_panic_floor is the second half of the
		// fix, and it is the half that makes a rout a battle event rather than a
		// switch. Subtracting a constant per tick is unbounded: a man with his
		// whole neighbourhood running lost 0.4 morale a tick, which is 1.6 a
		// second, which took him from steady to running in under two seconds no
		// matter what his officers were doing, and the whole field emptied in
		// the sixteen ticks after first contact with four bodies on the ground
		// between them. Against a floor the pull weakens as a man approaches
		// it, so there is a fixed point, the contagion has a rate a commander
		// can beat, and a man who has not seen his side break is not being
		// panicked by men he cannot see.
		ownTotal := friendly + friendDead + routed
		if routed > 0 && ownTotal > 0 {
			d.Morale += panicPull(s.Morale+d.Morale, routed/ownTotal, &c, dt)
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

// casualtySeen is the morale a tick costs or earns for the dead a unit can see,
// signed: negative for its own side, positive for the enemy's.
//
// The dead are read as a SHARE of the local weight on each side, not as a count
// of bodies. That single choice is the difference between a battle that is
// fought and a battle that is decided by arithmetic, and the reason is that a
// count is unbounded in a way nothing else in the model is.
//
// The spatial hash holds a destroyed unit for the rest of the battle at the
// place it fell, so every body in the neighbourhood is re-read every tick for
// the whole fight. At the shipped battle.morale_casualty_hit of 3.4 a count is
// 0.85 morale a tick, PER BODY, forever. Measured on the 50 v 50 battle with
// the shipped constants, the casualty term alone took side B from morale 0.999
// to 0.601 to 0.311 to nothing in three ticks, with two bodies on the ground
// between the two armies, and the battle ended at 2% of casualties with 37 of
// 50 men running. The same arithmetic at 500 v 500 is 296 routs and one kill,
// which is the result the size knob was being blamed for. Two dead men were
// worth more than a hundred living ones, and no value of any other constant
// could repair that, because the count scales with how many men happen to be
// dead around you and not with how much of the fight is lost.
//
// As a share the term is bounded by construction. The most it can ever cost is
// battle.moraleCasualtyHit * dt, which is every man the unit can see dead. A
// share is also free of the two scale couplings a count drags in: a squad of
// ten dying reads the same as one man of ten dying, which is what
// battle.roster_troops_per_unit asks for and what no value of the constant
// could achieve, and a thousand a side reads the same as fifty, which is what
// COMBAT.md section 13 requires of a model that has to carry both. The two
// terms either side of this one are shares for the same reasons.
//
// The reach weighting is already folded into the weights the stage passes in,
// so the share is of what the unit can actually see rather than of the whole
// neighbourhood, which is what battle.morale_casualty_falloff is for.
func casualtySeen(friendDead, ownTotal, enemyDead, enemyTotal float64, c *config.Battle, dt float64) float64 {
	own := 0.0
	if friendDead > 0 && ownTotal > 0 {
		own = friendDead / ownTotal
	}
	foe := 0.0
	if enemyDead > 0 && enemyTotal > 0 {
		foe = enemyDead / enemyTotal
	}
	return c.MoraleCasualtyHit * (foe - own) * dt
}

// panicPull is the morale one tick of watching your own side run costs, for a
// man at the given morale, when the given share of what he can see of his own
// side is running.
//
// It is a PULL TOWARD battle.morale_panic_floor, not a flat subtraction, and
// that is the second of the two fixes in this stage. A flat subtraction is
// unbounded: a man with his whole neighbourhood running lost 0.4 morale a tick
// at the shipped constant, which is 1.6 a second, which took him from steady
// to running in under two seconds whatever his officers were doing. Measured on
// the 500 v 500 battle, the field emptied of 296 men in the sixteen ticks after
// first contact, decided by that term, with four bodies on the ground between
// the two armies. A contagion needs a fixed point as much as it needs a gain,
// and this is it: the pull weakens as a man approaches the floor, so the
// strongest pull is on a man who is still steady and the weakest is on one who
// is already running, which is both what a crowd does and what stops the
// cascade from being a switch.
//
// The floor sits below battle.morale_rout_threshold, and configuration
// validation refuses a floor at or above it, because a pull toward a floor at
// the threshold approaches it asymptotically and can never take a man past it:
// routed troops would then stop spreading panic the instant the first one ran,
// and SPEC.md section 5.2 would be a sentence in a file.
//
// A man already at or below the floor is charged nothing. That is the
// definition of the floor: he cannot be pulled further down by this term, only
// by casualties, suppression, ammunition, or being outnumbered.
func panicPull(morale, routedShare float64, c *config.Battle, dt float64) float64 {
	if routedShare <= 0 {
		return 0
	}
	gap := morale - c.MoralePanicFloor
	if gap <= 0 {
		return 0
	}
	return -c.MoralePanicSpread * routedShare * gap * dt
}

// ratioImbalance is how far a unit's local friendly-to-enemy weight share sits
// PAST battle.morale_ratio_deadband, signed, with the sign of the imbalance.
//
// A share of zero is parity: as many of my own side's weight in reach as of the
// enemy's. A share of battle.morale_ratio_neutral is the parity this engine
// considers neutral, and a designer may move that. What this function returns
// is the excess beyond the deadband, so a formation one man off parity scores
// exactly nothing and a formation that is surrounded scores the full distance.
//
// WHY THE DEADBAND, MEASURED. Without it the term is not a rule, it is a tax.
// The shipped pair was morale_ratio_neutral 0.5 and morale_ratio_weight 9.0
// with no deadband, so the cost of a local 51/49 split was
// 9.0 * 0.01 * 0.25 = 0.0225 morale a tick, or 0.09 a second, EVERY TICK, for
// the whole of a battle. Nothing in contact pushes back: morale_recovery is
// gated on there being no enemy in reach, and the leader term is worth 0.55 a
// second only for men within morale_leader_radius of an officer, which at one
// commander per roster_leaders_per_unit men is a shrinking share of a large
// army. So the term integrated. Measured on the 500 v 500 reference battle,
// the local ratio term was the reason the whole field was at morale 1.0000
// after 250 ticks of approach and then fell without a single blow being
// struck: the battle was decided at 0.2% of casualties, with 296 routs and 1
// kill, and the routs were arithmetic rather than fear.
//
// A deadband is what makes it a rule with a threshold in it, and the shape of
// the rest of the engine agrees: the break and rout thresholds are thresholds,
// morale_recovery_suppression_band is a band, and COMBAT.md section 6 says
// morale drops from being outnumbered LOCALLY, which is a statement about a
// difference big enough to notice.
func ratioImbalance(share float64, c *config.Battle) float64 {
	dev := share - c.MoraleRatioNeutral
	switch {
	case dev > c.MoraleRatioDeadband:
		return dev - c.MoraleRatioDeadband
	case dev < -c.MoraleRatioDeadband:
		return dev + c.MoraleRatioDeadband
	default:
		return 0
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
