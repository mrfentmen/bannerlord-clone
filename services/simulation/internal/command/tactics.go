package command

import (
	"math"
	"strconv"
	"strings"

	"mbclone/simulation/internal/formation"
)

// THE RULES, AND WHY THEY ARE IN THIS ORDER.
//
// A commander's decision is not a score. It is a sequence of questions, asked in
// the order a commander actually asks them, and the first one with a yes ends the
// sequence. That is a deliberate choice against the utility scoring AI.md
// section 3 describes for the layers above, and it is the right shape for this
// one: the rules below are refusals and permissions, not trades-off. "A formation
// whose men have broken is coming back" is not a consideration that a bigger
// local advantage outweighs; it is the end of the question, because a formation
// that has broken is not a formation any more and sending it in again is how a
// line dies.
//
//	1. Is it broken?                    withdraw
//	2. Has the local fight gone our way?  charge
//	3. Is it sent already?               keep going, or turn in
//	4. Has the front fixed the enemy?     commit the flank
//	5. Is the side's strength failing?    commit the reserve
//	6. Otherwise                         advance, or hold
//
// Every threshold below is a [command] constant. The rules themselves are the
// sentence "and then", which is what a commander is.

// situation is everything the rules read about one formation, measured once per
// tick and then only compared against constants.
//
// It is measured rather than derived from the order already given, so an order is
// always a reading of the field as it stands rather than a function of the last
// decision. That is what lets a flank re-read where the enemy is every tick
// without the commander having to notice that it should.
type situation struct {
	// strength is this formation's own strength: bodies, weighted by condition
	// and by how well the units are currently fighting.
	strength float64
	// meanMorale is the mean morale of the formation's units, which is what a
	// commander reads to know whether the men are still with him.
	meanMorale float64
	// brokenShare is the share of the formation's units that are broken. One
	// shaken man in fifty is a bad afternoon; half of them is not a line.
	brokenShare float64
	// gap is the metres from the formation's anchor to the enemy centre.
	gap float64
	// local is this formation's strength against the enemy inside charge_range,
	// and localEnemy is that enemy's strength. local is meaningless when
	// localEnemy is zero, and every rule that reads it checks that first: there
	// is nothing to charge into.
	local, localEnemy float64
	// sideStrength and enemyStrength are the two armies' shares of their own
	// opening strength, published by the battle engine so both sides are measured
	// the same way.
	sideStrength, enemyStrength float64
	// frontGap is the fighting line's gap, which is the flank trigger's
	// question: the flank goes when the front has fixed the enemy, not when the
	// flank's own formation happens to be near.
	frontGap float64
	// wingLeft and wingRight are the enemy's strength on each of its sides,
	// measured across the line from our anchor to their centre. A commander
	// flanks the wing it cannot spare.
	wingLeft, wingRight float64
}

// String renders the situation in the cause log's "key=value, key=value" form.
//
// It is written into every order row, so it is also the evidence that an order
// was reached from the field as it stood rather than from a hidden state. The
// fields are fixed and always present: a report that showed a rule's inputs only
// when they were interesting would be a report that omitted exactly the cases a
// player is asking about.
func (s situation) String() string {
	var sb strings.Builder
	sb.WriteString(s.readFields())
	return sb.String()
}

func (s situation) readFields() string {
	var sb strings.Builder
	write := func(key string, v string) {
		if sb.Len() > 0 {
			sb.WriteString(", ")
		}
		sb.WriteString(key)
		sb.WriteByte('=')
		sb.WriteString(v)
	}
	write("strength", num(s.strength))
	write("strength_share", num(s.sideStrength))
	write("enemy_share", num(s.enemyStrength))
	write("gap_m", num(s.gap))
	write("front_gap_m", num(s.frontGap))
	write("mean_morale", num(s.meanMorale))
	write("broken_share", num(s.brokenShare))
	write("local_ratio", num(s.localRatio()))
	write("left_wing", num(s.wingLeft))
	write("right_wing", num(s.wingRight))
	return sb.String()
}

// localRatio is this formation's strength against the enemy inside charge_range.
//
// It is zero, not infinity, when there is no enemy in range: a division that has
// nothing to divide by has no ratio, and returning a huge number would make
// every rule that reads it fire exactly when there is nothing to charge into.
func (s situation) localRatio() float64 {
	if s.localEnemy <= 0 {
		return 0
	}
	return s.local / s.localEnemy
}

// broken reports whether the formation should come back, and why.
//
// It is the one rule checked on every tick rather than on the assessment
// cadence, and it is the one rule allowed to interrupt an order that has not yet
// stood its full time. Everything else in this file waits for the next
// assessment; this waits for nothing. A commander who hears that his line has
// broken does not wait for the next staff conference.
func (s situation) broken(c Config) (formation.Order, string, bool) {
	if s.meanMorale <= c.WithdrawMorale {
		return formation.OrderRetreat, "withdraw-morale", true
	}
	if s.brokenShare >= c.WithdrawBrokenShare {
		return formation.OrderRetreat, "withdraw-broken", true
	}
	return formation.OrderHold, "", false
}

// superior reports whether a formation has enough against the enemy in front of
// it to be sent in at the run rather than the walk.
//
// The comparison is local, and it is against the enemy inside charge_range,
// which is the enemy the charge would actually run into. An army that is winning
// the battle on a quiet wing of the field has not thereby become able to charge
// a formation that is being met by three times its number.
func (s situation) superior(c Config) bool {
	return s.localEnemy > 0 && s.gap <= c.ChargeRange && s.localRatio() >= c.ChargeStrengthRatio
}

// choose is the whole rule set for one formation, given where it is in its
// side's order of battle and whether it has been sent already.
//
// sent is the one piece of memory the rules read: a flank that has been
// committed stays committed, and a reserve that has been sent in is not recalled
// because the strength fraction that sent it has since recovered.
func (s situation) choose(p *post, c Config) (formation.Order, string) {
	// 1. Is it broken?
	if o, reason, broken := s.broken(c); broken {
		return o, reason
	}
	// 2. Has the local fight gone our way?
	if s.superior(c) {
		return formation.OrderCharge, "charge-local-superiority"
	}
	switch p.kind {
	case PostFront:
		// 6. The line closes until it is in range, and then it shoots. It does
		//    not press a formation that is holding its own, because a line that
		//    walks into the range the enemy chose is a line that arrives tired.
		if s.gap > c.AdvanceTriggerRange {
			return formation.OrderAdvance, "close-to-range"
		}
		return formation.OrderHold, "in-range"

	case PostFlank:
		if !p.sent {
			// 4. Commit when the front has fixed the enemy and there is still an
			//    army left to send round the side. The side it walks is the weak
			//    wing, because a flank that arrives against their strongest
			//    troops is not a flank.
			if s.frontGap <= c.FlankTriggerRange && s.sideStrength >= c.FlankMinStrengthFraction {
				if s.wingLeft <= s.wingRight {
					return formation.OrderFlankLeft, "flank-weak-wing-left"
				}
				return formation.OrderFlankRight, "flank-weak-wing-right"
			}
			return formation.OrderHold, "flank-held"
		}
		// 3. Sent. Keep walking the arc until the swing has turned in, then
		//    attack whatever is in front of it.
		if !p.plan.Arrived {
			return p.order, "flank-swinging"
		}
		return formation.OrderAdvance, "flank-turned-in"

	case PostReserve:
		if p.sent {
			return formation.OrderAdvance, "reserve-committed"
		}
		// 5. The last thing a commander gives up. Below this share of its own
		//    opening strength, the line is not breaking the enemy, so the second
		//    line goes in rather than watching the first one be beaten.
		if s.sideStrength <= c.ReserveCommitStrengthFraction {
			return formation.OrderAdvance, "reserve-commit"
		}
		return formation.OrderHold, "reserve-held"

	default:
		// Unreachable: Post is a closed set and shapeFor refuses anything else.
		// It returns a defined answer rather than a zero order anyway, because a
		// silent zero here would be a formation standing still for a reason
		// nobody could read.
		return formation.OrderHold, "unknown-post"
	}
}

// mayAssess reports whether this tick is a full re-assessment of the battle.
//
// It is a modulus rather than a counter because the commander holds no tick of its
// own: the battle's tick number is the only clock there is, and deriving the
// cadence from it means a commander cannot drift out of step with the battle it
// is commanding.
func (c Config) mayAssess(tick int) bool {
	return tick%c.DecisionIntervalTicks == 0
}

// sentOrder marks an order as one that commits a formation, which is what the
// committed flank and reserve branches above test.
//
// It is the order itself and not a separate flag because the two must never
// disagree: a flag that said "sent" while the order said "hold" would be a
// commander believing he had sent a formation he had not.
func sentOrder(o formation.Order) bool {
	switch o {
	case formation.OrderFlankLeft, formation.OrderFlankRight, formation.OrderCharge, formation.OrderAdvance:
		return true
	default:
		return false
	}
}

// intentFor maps a formation order onto the battle engine's four intents.
//
// The two vocabularies do not match: a formation is ordered to hold, advance,
// charge, swing round a flank, or come back, and the engine records what a unit is
// doing as advancing, engaging, withdrawing, or running. This is the coarse
// mapping, and it is stated rather than left to be inferred, because the battle
// report reads these numbers: a formation ordered back is recorded as withdrawing
// (it backs off with its weapons up, which is what the engine's withdraw means),
// everything that closes is recorded as advancing, and a formation that is
// holding its ground is recorded as engaging.
//
// The last one is the coarse case. "Engage" means standing and fighting, and a
// reserve standing out of contact is not fighting. It is still the best of the
// four: it is the only stationary one, and the alternative — calling a reserve
// that is waiting for its moment "advancing" — would be a report claiming men
// were closing on the enemy while they stood still.
func intentFor(o formation.Order) battleIntent {
	switch o {
	case formation.OrderRetreat:
		return intentWithdraw
	case formation.OrderHold:
		return intentEngage
	default:
		return intentAdvance
	}
}

// clampInt bounds v to [lo, hi]. It is a guard on arithmetic on counts, not a
// balance knob: a formation of no units, or a reserve that would leave the
// fighting line with none, is a division the rules cannot describe.
func clampInt(v, lo, hi int) int {
	if hi < lo {
		return lo
	}
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// roundHalfUp rounds to the nearest whole number, halves away from zero.
//
// math.Round does the same for the values this is used on, which are counts of
// units, but writing the rule out here keeps "how many units go in the reserve"
// a stated decision rather than a library's rounding convention.
func roundHalfUp(v float64) int {
	if v < 0 {
		return -int(math.Floor(-v + 0.5))
	}
	return int(math.Floor(v + 0.5))
}

// num formats a measurement for the cause log.
//
// Four decimals is the precision that makes the number worth having: enough to
// see two readings differ, short enough that a log row is a line rather than a
// paragraph. It is a formatting choice rather than a balance one, and it is the
// same precision the rest of the cause log writes at.
func num(v float64) string {
	return strconv.FormatFloat(v, 'f', 4, 64)
}