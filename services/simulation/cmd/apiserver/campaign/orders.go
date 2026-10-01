package campaign

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// job is one queued player order.
//
// An order runs in two steps, and the split is the whole reason orders exist
// here rather than mutating state from an HTTP handler.
//
//   - stage runs inside the tick, with a *sim.View and a *sim.WriteSet. It can
//     read committed state and stage writes, and nothing else. This is what
//     CONSTITUTION.md section 2.1 requires of a system, so this package's
//     orders are staged exactly the way every other system's writes are.
//   - finish runs after the engine has committed the tick, still under the write
//     lock. It can read state the tick just changed, which is what lets a trade
//     reply with the price after the trade rather than a prediction of it.
//
// Splitting them is also what keeps a handler from lying: nothing is reported
// before the engine has applied it.
type job struct {
	// name identifies the order in a log line.
	name string

	// hasEngineOrder is true when this job also wants one of the built-in
	// orders applied by internal/systems/player, such as a march. A job that
	// only wants this package's orderSystem to act leaves it false: SetOrders
	// replaces the queue wholesale, so contributing a zero-valued Order would
	// be a real order of kind OrderSetTax.
	hasEngineOrder bool
	engineOrder    sim.Order

	// stage does the work inside the tick.
	stage func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error)

	// finish reads committed state and builds the reply.
	finish func(c *Campaign, s *model.State, staged any) any

	// done carries the reply to whoever submitted the job.
	done chan jobResult

	// value and err are the job's own bookkeeping between stage and finish.
	value any
	err   error
}

type jobResult struct {
	value any
	err   error
}

// complete answers the submitter exactly once. It is called on the tick
// goroutine, whether the job's tick succeeded or not, so a caller is never left
// waiting on a tick that will not come.
func (j *job) complete(value any, err error) {
	if j == nil || j.done == nil {
		return
	}
	select {
	case j.done <- jobResult{value: value, err: err}:
	default:
		// The submitter has already given up on its context. Nothing to do,
		// and nothing to log: an abandoned request is not a server fault.
	}
}

// newJob builds a job with its reply channel made.
func newJob(name string, stage func(*Campaign, *sim.View, *sim.WriteSet) (any, error), finish func(*Campaign, *model.State, any) any) *job {
	return &job{name: name, stage: stage, finish: finish, done: make(chan jobResult, 1)}
}

// orderSystem is the sim.System that applies this package's jobs.
//
// It is appended to simrun.Systems(), so it runs in the same tick as every other
// system, sees the same committed state they see, and stages into the same
// WriteSet. It is handed a *sim.View and a *sim.WriteSet and nothing else, so it
// cannot reach another system: the decoupling guarantee is structural, not a
// convention this file has to keep.
//
// Existing systems are untouched, so every existing test keeps its meaning.
func (c *Campaign) orderSystem() sim.System {
	return sim.System{
		Name: "player_api",
		Doc:  "applies queued orders submitted over the API",
		Runs: func(v *sim.View, w *sim.WriteSet) {
			if len(c.current) == 0 {
				return
			}
			// Taken before running, so a job that submits another job cannot
			// make this loop run the new one in the same tick. It would then be
			// applied by a later tick, which is the same guarantee the built-in
			// order queue gives.
			jobs := c.current
			c.current = nil
			for _, j := range jobs {
				if j == nil || j.stage == nil {
					continue
				}
				value, err := j.stage(c, v, w)
				if err != nil {
					j.err = err
					continue
				}
				j.value = value
			}
		},
	}
}
