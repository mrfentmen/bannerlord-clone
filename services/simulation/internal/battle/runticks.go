package battle

import "mbclone/simulation/internal/config"

// RunTicks fights a battle for at most maxTicks ticks and reports what happened.
//
// It is Run with a caller-supplied tick bound instead of battle.max_ticks, and
// it exists for one reason: measuring the tick loop's THROUGHPUT needs a run
// that stops on a tick count the caller chose, not one that stops when the
// battle happens to be decided. Internal/scale needs "two thousand ticks of a
// two thousand-a-side field, whatever the outcome" and cannot get it from a
// function that only returns at a conclusion.
//
// Everything else is Run's behaviour, unchanged: the same Setup validation, the
// same snapshot-then-stage-then-commit tick, the same Result assembled from the
// run's own totals. It returns early, with the battle's real Outcome, if the
// battle is decided first; Result.Truncated says whether that is what happened,
// so a caller can tell a battle that ended from one that ran out of budget and
// never pretend the two are the same measurement.
//
// A bound of zero or less is an error rather than an empty battle: returning a
// Result describing a fight that never had a tick is the fake-success shape
// CONSTITUTION.md section 1.3 forbids, and errors.go already has the kind for it.
func RunTicks(cfg *config.Config, seed uint64, setup Setup, maxTicks int) (*Result, error) {
	if maxTicks <= 0 {
		return nil, newError(ErrInvalidConfig,
			"RunTicks needs a tick budget of at least one; a run of zero ticks would return "+
				"a Result describing a battle nobody fought")
	}
	b, err := newBattle(cfg, seed, setup)
	if err != nil {
		return nil, err
	}
	for i := 0; i < maxTicks; i++ {
		if outcome, decided := b.checkEnding(); decided {
			res := b.result(outcome)
			res.Truncated = false
			return res, nil
		}
		if err := b.tick(); err != nil {
			return nil, err
		}
	}
	// The budget ran out with the battle undecided. The Outcome is the stalemate
	// one, which is the same condition battle.max_ticks reports, and Truncated is
	// what distinguishes "this caller stopped it here" from "the engine stopped
	// it here".
	res := b.result(Outcome{Kind: ResultDraw, Reason: ReasonStalemate})
	res.Truncated = true
	return res, nil
}
