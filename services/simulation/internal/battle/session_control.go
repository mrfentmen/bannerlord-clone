package battle

import (
	"fmt"
	"math"
)

// TicksPerSecond is the fixed wall-time rate the battle clock runs at when
// played in real time: 20 ticks per second. The sim itself never reads a
// wall clock; ticks advance only through Advance/Step, which is what makes
// 1000 ticks produce identical state on any machine. This constant is the
// contract the client uses to pace its 10 Hz snapshot stream: two ticks per
// snapshot.
const TicksPerSecond = 20

// maxSaneCoordinate is the invariant bound for unit positions: no agent
// should ever be more than 10 km from the origin. Battles are fought on
// fields measured in hundreds of metres; a position beyond this is a NaN
// or a runaway integrator, not a flanking maneuver.
const maxSaneCoordinate = 10000.0

// paused reports whether the session is paused. A paused session refuses
// Advance; Step still works, because stepping is how you inspect a paused
// battle one tick at a time.
func (s *Session) Paused() bool { return s.paused }

// Pause halts tick advancement. It is valid in fighting or rout phase;
// pausing a staging session is an error, because there is nothing to pause.
func (s *Session) Pause() error {
	if s.phase != PhaseFighting && s.phase != PhaseRout {
		return &Error{Kind: ErrInternal, Field: "phase", Detail: fmt.Sprintf("Pause needs a fighting session; this one is %s", s.phase)}
	}
	s.paused = true
	return nil
}

// Resume unpauses the session.
func (s *Session) Resume() error {
	if s.phase != PhaseFighting && s.phase != PhaseRout {
		return &Error{Kind: ErrInternal, Field: "phase", Detail: fmt.Sprintf("Resume needs a fighting session; this one is %s", s.phase)}
	}
	s.paused = false
	return nil
}

// Step advances exactly one tick. It works while paused, which is the point:
// pause, then step through the interesting moment tick by tick.
func (s *Session) Step() error {
	if s.phase != PhaseFighting && s.phase != PhaseRout {
		return &Error{Kind: ErrInternal, Field: "phase", Detail: fmt.Sprintf("Step needs a fighting session; this one is %s", s.phase)}
	}
	return s.advanceOne()
}

// advanceOne runs a single tick with invariants checked. Every path that
// advances the sim goes through here, so no tick can slip past the
// invariants.
func (s *Session) advanceOne() error {
	b := s.battle
	if outcome, decided := b.checkEnding(); decided {
		s.outcome = outcome
		s.decided = true
		s.result = b.result(outcome)
		s.tick = b.tickNo
		return s.transition(PhaseResolved)
	}
	// Stalemate timeout: no kills or wounds for StalemateTicks consecutive
	// ticks auto-resolves as a draw. Two crowds staring at each other is a
	// draw, not a battle, and no battle may run forever doing nothing.
	if s.ticksSinceCasualty >= int(b.c.StalemateTicks) {
		s.outcome = Outcome{Kind: ResultDraw, Reason: ReasonStalemate}
		s.decided = true
		s.result = b.result(s.outcome)
		s.tick = b.tickNo
		return s.transition(PhaseResolved)
	}
	if err := b.tick(); err != nil {
		return err
	}
	s.tick = b.tickNo
	if err := s.checkInvariants(); err != nil {
		return err
	}
	s.trackCasualtyQuiet()
	if s.phase == PhaseFighting && s.routObserved() {
		if err := s.transition(PhaseRout); err != nil {
			return err
		}
	}
	return nil
}

// trackCasualtyQuiet updates the no-casualty counter from the sim's own
// accumulated stats. Any kill or wound resets the clock.
func (s *Session) trackCasualtyQuiet() {
	b := s.battle
	total := b.stats.Dead[0] + b.stats.Dead[1] + b.stats.Wounded[0] + b.stats.Wounded[1]
	if total > s.lastCasualtyTotal {
		s.ticksSinceCasualty = 0
		s.lastCasualtyTotal = total
	} else {
		s.ticksSinceCasualty++
	}
}

// checkInvariants verifies the three per-tick promises, loudly. A violation
// fails the tick with an error naming the broken invariant, because a sim
// that silently loses troops or lets ammo go negative is a sim whose
// results cannot be trusted.
//
//  1. Troop conservation: alive + dead + wounded + routed + surrendered
//     bodies equal the side's opening bodies, within rounding.
//  2. No negative ammo on any unit.
//  3. No unit outside the sane coordinate bound.
func (s *Session) checkInvariants() error {
	b := s.battle
	for _, side := range sides {
		i := side.index()
		var alive, routed, surrendered float64
		for _, u := range b.units {
			if u.Side != side {
				continue
			}
			if u.Ammo < -1e-9 {
				return &Error{Kind: ErrInternal, Field: "ammo",
					Detail: fmt.Sprintf("unit %d has negative ammo %.2f; a gun cannot fire what it does not have", u.ID, u.Ammo)}
			}
			if math.IsNaN(u.X) || math.IsNaN(u.Y) || math.Abs(u.X) > maxSaneCoordinate || math.Abs(u.Y) > maxSaneCoordinate {
				return &Error{Kind: ErrInternal, Field: "position",
					Detail: fmt.Sprintf("unit %d at (%.1f, %.1f) is outside the sane bound; the integrator ran away", u.ID, u.X, u.Y)}
			}
			troops := u.Troops
			switch {
			case u.Status == StatusDestroyed:
				// counted in stats.Dead below
			case u.Status == StatusRouted || u.Status == StatusBroken:
				routed += troops
			case u.Status == StatusSurrendered:
				surrendered += troops
			default:
				alive += troops
			}
		}
		var start float64
		if side == SideA {
			start = b.strengthStartA
		} else {
			start = b.strengthStartB
		}
		accounted := alive + routed + surrendered + b.stats.Dead[i] + b.stats.Wounded[i]
		if math.Abs(accounted-start) > 1e-6*start+1e-9 {
			return &Error{Kind: ErrInternal, Field: "troop-conservation",
				Detail: fmt.Sprintf("side %s accounts %.2f bodies against %.2f started; troops went missing mid-tick", side, accounted, start)}
		}
	}
	return nil
}

// ElapsedSeconds returns the simulated time elapsed: ticks * tick_seconds.
// It is simulated time, not wall time, and is exact, not measured.
func (s *Session) ElapsedSeconds() float64 {
	if s.battle == nil {
		return 0
	}
	return float64(s.tick) * s.battle.c.TickSeconds
}
