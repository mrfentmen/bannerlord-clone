package battle

import (
	"fmt"

	"mbclone/simulation/internal/config"
)

// THE REPLAY PATH.
//
// This file turns an order log back into a battle. It is the third piece of the
// pattern from sparta (github.com/lacaedemon/sparta, MIT), rebuilt in Go rather
// than copied, per ~/workspace/agents/agents/spacebunny/OSS-REFERENCE.md:
//
//	replay(seed, order log) -> the same battle, bit for bit
//
// # THE SINGLE APPLY PATH, WHICH IS THE WHOLE POINT
//
// There is exactly one place an order becomes movement in this engine:
// battle.runCommanders, which reads View.Commands and writes the deltas that
// battle.commit applies. A recorded order and a replayed order both arrive there
// through the same channel, from the same loop, with the same clampStep bound. If
// live play and replay could take different paths, a matching replay would prove
// nothing, because a matching result from two different code paths is a
// coincidence waiting for a change to the engine. So there is no replay-specific
// movement code anywhere in this package, and a reader looking for one will not
// find one.
//
// # WHY THE ENGINE'S OWN DECISIONS ARE NOT LOGGED
//
// The intent stage picks a movement for every unit every tick, and none of those
// are in an order log. They do not need to be. They are deterministic functions of
// the snapshot and of per-tick named RNG substreams derived from the seed
// (rngFor in melee.go), they read no clock and no global generator, and so they are
// RE-DERIVED on replay from the seed alone.
//
// That is the second branch of the sparta rule: AI orders are either recorded like
// player orders or re-derived, and a re-derived AI must read only serialised sim
// state. Here it reads only the snapshot. The consequence worth stating is that a
// battle whose commander issued no orders at all replays from an EMPTY log, and
// TestReplayFromEmptyLogIsTheWholeProofOfRederivedAI requires exactly that: same
// seed, empty log, identical result hash. It also means the log stays tiny, which
// is the other half of why this is an order log and not a frame recording.
//
// # WHAT REPLAY REFUSES, AND WHY
//
// Replay returns an error rather than a Result in every case it can detect, because
// a replay that silently produces a DIFFERENT battle is the one failure mode a
// determinism feature must never have (CONSTITUTION.md section 1.3). It refuses:
//
//   - a log that refused rows, since that log does not describe its battle;
//   - a log that carries orders for a unit this setup does not have, since the log
//     and the roster are describing different battles;
//   - a log whose rows are not in non-decreasing tick order, since the order of
//     decisions is part of the battle;
//   - a side-level order, because this build's command channel is one slot per unit
//     and cannot express one (see Order.Unit);
//   - a balance config whose version differs from the one the log was recorded
//     under, because orders computed under different constants are not the same
//     orders and a replay under new balance data would be a what-if, not a replay.
//
// Every one of those is a case where continuing would produce a number that looks
// like a result and is not one.

// Recording is everything needed to reproduce a battle: its input and the orders
// issued during it.
//
// The Setup is carried rather than regenerated because a caller may build its
// forces from campaign state (internal/model) instead of from a roster, and
// re-deriving those would mean the engine guessing at somebody else's data. When
// the forces DID come from GenerateForce, the seed alone reproduces them, and
// Recording is then carrying a copy of something already determined; that is
// recorded here as a cost of not guessing rather than hidden.
type Recording struct {
	// Seed is the seed the battle ran under.
	Seed uint64
	// ConfigVersion is the balance file version it ran under, and Replay refuses a
	// config that does not match it.
	ConfigVersion string
	// Setup is the battle input. It is the same value Run was given.
	Setup Setup
	// Log is the append-only order record. It is never nil in a Recording produced
	// by Record.
	Log *OrderLog
}

// Recorder is the Commander that records a battle's orders.
//
// It wraps the caller's commander, passes every order through unchanged, and
// appends a row for each one. Passing through unchanged is not a courtesy, it is
// the property that makes the log trustworthy: a recorder that altered an order
// would record a battle that did not happen, and the replay of it would match the
// recorder rather than the engine.
//
// A nil inner commander is legal and means "watch, do not speak". That is how a
// caller gets a log of a battle driven entirely by the engine's own rules, and it
// is the same battle battle.Run would have fought with no seam in it at all.
type Recorder struct {
	// inner is the caller's commander, or nil.
	inner Commander
	// log is where rows go.
	log *OrderLog
	// source is the free-text label recorded against every row, so a log holding
	// orders from two layers can still be read by a person.
	source string
	// lastTick is the highest tick appended, and is checked on every append so a
	// log can never go backwards in time.
	lastTick int
	// haveTick says whether lastTick means anything yet.
	haveTick bool
	// failed records that the inner commander returned an error, so Command can
	// return it unchanged rather than recording orders from a tick that was never
	// fought.
	failed error
	// spoken counts the orders recorded, which is what a caller sizes a log bound
	// against.
	spoken int
	// refused mirrors the log's refused count for the same reason.
	refused int
}

// NewRecorder wraps a commander so that its orders are recorded, and returns the
// wrapper and the log it writes into.
//
// bound is the log's row limit; pass zero for an unbounded log. A caller whose
// commander issues an order per unit per tick on a long battle should pass a bound
// it expects not to reach, and should check Recording.Refused afterwards, because
// a log that reached its bound is not replayable.
func NewRecorder(inner Commander, bound int, source string) (*Recorder, *OrderLog) {
	log := NewOrderLog(bound)
	return &Recorder{inner: inner, log: log, source: source}, log
}

// Command implements Commander.
//
// It calls the inner commander first, then records what the inner commander wrote,
// then returns. Recording after the call rather than before is what keeps the
// log's row order the same as the order in which the engine applied the orders.
func (r *Recorder) Command(v *View) error {
	if r.failed != nil {
		// A commander that has already failed is not called again. The battle is
		// about to stop on the error that already happened; calling it again would
		// mean a second chance for a nondeterministic commander to produce a second
		// set of orders, which is precisely what a log must never contain.
		return r.failed
	}
	if r.inner != nil {
		if err := r.inner.Command(v); err != nil {
			r.failed = err
			return err
		}
	}
	for i := range v.Commands {
		c := v.Commands[i]
		if !c.Set && !c.FormationSet {
			// Silence, not an order. See UnitCommand.Set.
			continue
		}
		u := v.Units[i]
		kind := OrderMove
		switch {
		case !c.Set:
			// Told which shape he is standing in and not told to move. See
			// OrderFormation: the replay must not turn this into a hold, or
			// every man in a formation stands still for the whole battle in the
			// replay and not in the original.
			kind = OrderFormation
		case c.DX == 0 && c.DY == 0:
			kind = OrderHold
		}
		o := Order{
			Tick:      v.Tick,
			Unit:      u.ID,
			Side:      u.Side,
			Kind:      kind,
			DX:        c.DX,
			DY:        c.DY,
			Intent:    c.Intent,
			Formation: formationOf(c),
			Facing:    c.Facing,
			Source:    r.source,
		}
		if _, ok := r.log.Append(o); !ok {
			r.refused++
			continue
		}
		if !r.haveTick || o.Tick > r.lastTick {
			r.lastTick, r.haveTick = o.Tick, true
		}
		r.spoken++
	}
	return nil
}

// SetInner changes which commander this recorder records, keeping the log, the
// source label, the row count, and the failure latch.
//
// It exists because a recorder that can only ever wrap one commander is a
// recorder for a battle nobody changed their mind during. A session battle is
// commanded by whoever was handed to it last, and a player who re-forms half his
// line at tick 600 hands it a new commander; with the recorder wrapped around the
// first one, every order after that tick went unrecorded and the log replays a
// battle that stopped being fought at tick 600. One recorder with a swappable
// inside keeps one row stream, which is the thing a log has to be.
//
// The failure latch is deliberately NOT cleared. A commander that failed stops the
// battle, so swapping one in afterwards is either a battle that was never
// resumed or a caller trying to paper over an error that has already been
// returned; in neither case should the recorder start writing rows again.
func (r *Recorder) SetInner(inner Commander) {
	if r == nil {
		return
	}
	r.inner = inner
}

// Inner is the commander this recorder is recording. Nil means it is recording a
// battle driven by the engine's own rules, which is a legal thing to record.
func (r *Recorder) Inner() Commander {
	if r == nil {
		return nil
	}
	return r.inner
}

// Log returns the log the recorder writes into.
func (r *Recorder) Log() *OrderLog { return r.log }

// Spoken is how many orders were recorded.
func (r *Recorder) Spoken() int { return r.spoken }

// Refused is how many orders the log would not hold.
func (r *Recorder) Refused() int { return r.refused }

// Replayer is the Commander that plays an order log back into a battle.
//
// It is the mirror of Recorder and it is held to the mirror's rules: it reads
// only the log, it consults only the View for the tick number and the unit ids, and
// it never draws a random number, reads a clock, or consults anything the live
// commander saw. A replayer that looked at the field to decide what to replay
// would be a second AI, and a replay that depends on one is not a replay.
type Replayer struct {
	log *OrderLog
	// cursor is the next row to read. Rows are consumed in order and never
	// revisited, so the whole replay is O(rows), not O(ticks times rows).
	cursor int
	// rows is a flattened copy of the log, taken once so the hot path does no
	// allocation and no searching.
	rows []Order
	// replayed counts rows written back into the channel.
	replayed int
}

// NewReplayer returns a commander that replays log.
func NewReplayer(log *OrderLog) (*Replayer, error) {
	if log == nil {
		return nil, &Error{
			Kind:  ErrUnitInvalid,
			Field: "NewReplayer",
			Detail: "there is no log to replay; a nil log is an empty log and an empty log " +
				"reproduces a battle the engine drove on its own, so use &OrderLog{} if that is what you mean",
		}
	}
	if log.Truncated() {
		return nil, &Error{
			Kind:  ErrUnitInvalid,
			Field: "NewReplayer",
			Detail: fmt.Sprintf("this order log refused %d rows, so it is not a complete record of "+
				"its battle and replaying it would fight a different one", log.Refused()),
		}
	}
	return &Replayer{log: log, rows: log.Rows()}, nil
}

// Command implements Commander.
//
// It writes every row logged for this tick into the channel, in the order the rows
// were appended, and nothing else. Silence on a tick the log does not cover is not
// a missing order: it is a commander that said nothing, which the engine already
// reads as "this unit follows its own rules".
func (p *Replayer) Command(v *View) error {
	for p.cursor < len(p.rows) {
		o := p.rows[p.cursor]
		if o.Tick > v.Tick {
			// A row for a later tick. Nothing to do yet, and returning is correct:
			// the replayer is pulled once per tick in order, never ahead.
			return nil
		}
		if o.Tick < v.Tick {
			return &Error{
				Kind:  ErrUnitInvalid,
				Field: "OrderLog",
				Detail: fmt.Sprintf("order %d is for tick %d but the battle has reached tick %d; "+
					"an order log's rows must be in non-decreasing tick order, and this one is not",
					o.Seq, o.Tick, v.Tick),
			}
		}
		p.cursor++
		if o.Unit < 0 {
			return &Error{
				Kind:  ErrUnitInvalid,
				Field: "Order.Unit",
				Detail: fmt.Sprintf("order %d is a side-level order for tick %d; this build's command "+
					"channel has one slot per unit and cannot express one, so this log was written by "+
					"something that is not this engine", o.Seq, o.Tick),
			}
		}
		if o.Unit >= len(v.Units) {
			return &Error{
				Kind:   ErrUnitInvalid,
				Field:  "Order.Unit",
				Detail: fmt.Sprintf("order %d is for unit %d but this battle has %d units; the log and the roster are describing different battles", o.Seq, o.Unit, len(v.Units)),
			}
		}
		if v.Units[o.Unit].ID != o.Unit {
			return &Error{
				Kind:   ErrUnitInvalid,
				Field:  "Order.Unit",
				Detail: fmt.Sprintf("order %d is for unit %d but the unit at that slot is %d; ids must line up with the roster", o.Seq, o.Unit, v.Units[o.Unit].ID),
			}
		}
		v.Commands[o.Unit] = UnitCommand{
			// A formation row carries a shape and no movement, so the movement
			// channel stays silent for it. See OrderFormation.
			Set:          o.Kind != OrderFormation,
			DX:           o.DX,
			DY:           o.DY,
			Intent:       o.Intent,
			Formation:    o.Formation,
			Facing:       o.Facing,
			FormationSet: o.Formation.Valid(),
		}
		p.replayed++
	}
	return nil
}

// Replayed is how many orders the replayer has written back.
func (p *Replayer) Replayed() int { return p.replayed }

// Unconsumed is how many rows the battle never reached, which is the count of
// orders the original battle was still holding when it ended.
//
// It is reported rather than ignored: a replayer that silently ignored a third of
// its log would still produce a battle, and the caller would have no way to tell
// that the log it saved described more than the battle it re-ran.
func (p *Replayer) Unconsumed() int { return len(p.rows) - p.cursor }

// rosterFingerprint identifies a Setup: the same roster always fingerprints the
// same, and two different rosters do not.
//
// It folds the unit counts first and then each unit's identity in the order
// newBattle assigns ids, which is side A in slice order then side B in slice order.
// That order is the whole point of folding it this way: an order's Unit field is a
// POSITIONAL id, so the fingerprint has to walk the roster in exactly the order
// the ids are handed out or it would be describing a different battle.
//
// It covers the fields that make a unit a unit for the purposes of an order: which
// side it fights for, what it is equipped to do, how many bodies it stands for, and
// how fast and how tough it is. It deliberately does not cover positions, because
// newBattle lays those out from the seed and the seed is checked separately.
func rosterFingerprint(setup Setup) uint64 {
	h := orderLogHashSeed
	h = mixUint64(h, uint64(len(setup.A)))
	h = mixUint64(h, uint64(len(setup.B)))
	fold := func(u *Unit) {
		h = mixUint64(h, uint64(u.Side))
		h = mixUint64(h, uint64(u.Role))
		h = mixUint64(h, floatBits(u.Troops))
		h = mixUint64(h, floatBits(u.MaxHP))
		h = mixUint64(h, floatBits(u.Speed))
		h = mixUint64(h, floatBits(u.MeleeSkill))
		h = mixUint64(h, floatBits(u.RangedSkill))
		h = mixUint64(h, floatBits(u.Morale))
	}
	for i := range setup.A {
		fold(&setup.A[i])
	}
	for i := range setup.B {
		fold(&setup.B[i])
	}
	return h
}

// Record fights a battle with a commander and records the orders it issues.
//
// cmd may be nil, which records a battle driven entirely by the engine's own rules
// and produces an empty log. That is a real mode and not a degenerate one: it is
// how a caller verifies that the engine alone is reproducible, and its log is the
// honest record of a battle in which nothing was ordered.
//
// The Recording it returns carries the setup, so it is self-contained for a caller
// that holds the result. The Setup is NOT encoded to disk by this package; see
// Encoding below.
func Record(cfg *config.Config, seed uint64, setup Setup, cmd Commander, bound int, source string) (*Result, *Recording, error) {
	if cfg == nil {
		return nil, nil, newError(ErrNilConfig,
			"Record needs a balance config; this package holds no constants of its own, "+
				"because CONSTITUTION.md section 1.2 makes the balance file the only source of them")
	}
	rec, log := NewRecorder(cmd, bound, source)
	// Fingerprinted before the first tick, so the log is tied to its roster even if
	// the commander turns out to issue nothing at all.
	log.SetRoster(rosterFingerprint(setup))
	res, err := RunCommanded(cfg, seed, setup, rec)
	if err != nil {
		return nil, nil, err
	}
	return res, &Recording{
		Seed:          seed,
		ConfigVersion: cfg.Version,
		Setup:         setup,
		Log:           log,
	}, nil
}

// Replay re-runs a recorded battle from its seed and order log and returns the
// result.
//
// It takes the same path as the original run in every respect that matters: the
// same Setup, the same seed, the same balance file version, and the same
// runCommanders apply loop. The only difference is that the orders come from a log
// instead of from a live commander.
func Replay(cfg *config.Config, rec *Recording) (*Result, error) {
	res, unconsumed, err := replayRun(cfg, rec)
	if err != nil {
		return nil, err
	}
	if unconsumed > 0 {
		return nil, &Error{
			Kind:  ErrUnitInvalid,
			Field: "Recording.Log",
			Detail: fmt.Sprintf("the battle ended with %d orders in the log unapplied; the log describes "+
				"a longer battle than the one that just ran, so it is not this battle's log", unconsumed),
		}
	}
	return res, nil
}

// replayRun is Replay's body with one difference that matters: it RETURNS how
// many orders the battle never reached instead of deciding what that means.
//
// Both of Replay's callers need the run and only one of them wants the refusal.
// A caller that replays a log to RECOVER a battle wants to be told the log
// belongs to a longer fight. A caller that replays a log to CHECK one wants to
// be told the two disagree, and those are the same fact with two different
// answers, so the judgement cannot live in the shared half.
//
// Before the split the check could not be made at all, because Verify went
// through Replay and inherited the refusal as an error. So a log that made the
// battle END EARLIER was not reported as a mismatch; it was reported as a
// malformed log, which is the opposite of the finding a verifier exists to
// produce, and which a caller cannot tell apart from having handed it the wrong
// file. TestVerifyReportsAMismatchWhenTheLogSaysSomethingElse is the direct
// check, and its own message is the right one: a check that cannot run is not a
// check that passed.
func replayRun(cfg *config.Config, rec *Recording) (*Result, int, error) {
	if cfg == nil {
		return nil, 0, newError(ErrNilConfig,
			"Replay needs a balance config; replaying under a different set of constants than the "+
				"orders were computed under would produce a what-if and call it a replay")
	}
	if rec == nil {
		return nil, 0, &Error{
			Kind:   ErrUnitInvalid,
			Field:  "Replay",
			Detail: "there is no recording to replay",
		}
	}
	if rec.ConfigVersion != "" && rec.ConfigVersion != cfg.Version {
		return nil, 0, &Error{
			Kind:  ErrInvalidConfig,
			Field: "Recording.ConfigVersion",
			Detail: fmt.Sprintf("the recording was made under balance version %q and this config is %q; "+
				"replaying orders under different constants is a what-if, not a replay", rec.ConfigVersion, cfg.Version),
		}
	}
	log := rec.Log
	if log == nil {
		log = NewOrderLog(0)
	}
	// The roster check comes before the log is even handed to the replayer, because
	// unit ids are positional and a wrong roster can produce a log whose ids all
	// resolve to real units. This is the check that catches it.
	if want := log.RosterHash(); want != 0 {
		if got := rosterFingerprint(rec.Setup); got != want {
			return nil, 0, &Error{
				Kind:  ErrUnitInvalid,
				Field: "Recording.Log",
				Detail: fmt.Sprintf("this order log was recorded against force %016x and the setup given "+
					"here fingerprints to %016x; unit ids are positional, so these orders would be applied "+
					"to different men and the result would be a different battle wearing this log's name",
					want, got),
			}
		}
	}
	rp, err := NewReplayer(log)
	if err != nil {
		return nil, 0, err
	}
	res, err := RunCommanded(cfg, rec.Seed, rec.Setup, rp)
	if err != nil {
		return nil, 0, err
	}
	// The count is RETURNED rather than judged here. Replay turns a non-zero one
	// into a refusal; Verify turns it into a mismatch finding, because a log that
	// outlasts the battle it produced is a difference between two battles and not
	// a malformed file. See replayRun.
	return res, rp.Unconsumed(), nil
}

// ReplayCheck is the verdict of one replay attempt.
type ReplayCheck struct {
	// Match is whether the replay reproduced the original exactly, by result hash.
	Match bool
	// Want and Got are the original's and the replay's result hashes, in hex.
	Want, Got string
	// Diff names the first field that differs, or is empty when Match is true.
	// It is the debugging half of the verdict: Match says the runs disagreed,
	// Diff says where.
	Diff string
	// Seed, ConfigVersion, Orders, and Ticks are what the replay was given, so a
	// failing check states its own inputs rather than making the reader go and
	// find them.
	Seed          uint64
	ConfigVersion string
	Orders        int
	Ticks         int
	// Outcome and ReplayOutcome are the original's and the replay's, so a mismatch
	// that flipped the winner is visible without decoding anything.
	Outcome        string
	ReplayOutcome  string
	ReplayHash     string
	OriginalHash   string
	ElapsedSeconds float64
}

// Verify replays a recording and compares its result against the original.
//
// It never returns a nil error for a mismatch: a mismatch is a legitimate finding
// and is reported in the ReplayCheck, because "the replay did not match" is the
// answer to the question and not a failure of the question. An error is reserved
// for the replay not being runnable at all, which is a different problem.
//
// WHICH INCLUDES A LOG THAT OUTLASTS ITS BATTLE. Replay refuses that as a
// malformed log, and refusing is right when the point is to recover the battle. It
// is the wrong answer when the point is to check it, because a log describing a
// longer fight than the one that ran is evidence the two disagree - which is the
// finding, not a refusal to make it. So Verify calls replayRun directly and turns
// an unconsumed tail into a mismatch with the count in the Diff.
//
// That distinction is not a nicety. Before it, a log tampered with by a
// millimetre in one order could not be reported at all whenever the tamper
// happened to end the battle early: the caller got an error about the file rather
// than a verdict about the battle, and could not tell that apart from having
// handed Verify the wrong recording. A verifier that cannot see a class of
// tampering is worse than no verifier, because it is trusted.
//
// The Result argument is the original run's result. Passing nil compares against
// replaying the recording twice, which is a weaker but still meaningful check and is
// used where the caller has not kept the original.
func Verify(cfg *config.Config, rec *Recording, original *Result) (*ReplayCheck, error) {
	got, unconsumed, err := replayRun(cfg, rec)
	if err != nil {
		return nil, err
	}
	// A recording with no log is the same thing Replay already treats it as: a
	// battle nobody ordered. Read the count off the same value Replay used, rather
	// than off rec.Log, so that the two cannot disagree about whether there was a
	// log at all. Reading rec.Log here directly would panic on a nil log that
	// Replay had just accepted.
	orders := 0
	if rec.Log != nil {
		orders = rec.Log.Len()
	}
	check := &ReplayCheck{
		Seed:          rec.Seed,
		ConfigVersion: cfg.Version,
		Orders:        orders,
		Ticks:         got.Ticks,
		Got:           got.HashString(),
		ReplayHash:    got.HashString(),
		ReplayOutcome: got.Outcome.Kind.String() + " (" + got.Outcome.Reason.String() + ")",
	}
	if original == nil {
		// No original to compare against: replay it a second time. Two replays
		// agreeing proves the replay path is deterministic, which is a real
		// property and not a stand-in for the stronger claim.
		again, err := Replay(cfg, rec)
		if err != nil {
			return nil, err
		}
		check.Want = again.HashString()
		check.OriginalHash = check.Want
		check.Outcome = "n/a (no original result given)"
	} else {
		check.Want = original.HashString()
		check.OriginalHash = check.Want
		check.Outcome = original.Outcome.Kind.String() + " (" + original.Outcome.Reason.String() + ")"
	}
	check.Match = check.Want == check.Got
	if !check.Match {
		check.Diff, _ = ResultStateDiff(original, got)
	}
	// An unconsumed tail is a difference even in the one case where the hashes
	// agree, which cannot happen in practice but is cheap to be certain about:
	// two battles that hash the same and left different numbers of orders
	// unapplied would be a contradiction, and saying so is better than reporting
	// a match and hoping.
	if unconsumed > 0 {
		check.Match = false
		check.Diff = fmt.Sprintf("the log holds %d orders and the replayed battle reached %d of "+
			"them, leaving %d unapplied: the log describes a longer battle than this one",
			check.Orders, check.Orders-unconsumed, unconsumed)
		if check.Want == check.Got {
			// Not expected, and if it ever happens the verdict is no longer
			// supported by its evidence. Name the pair so a reader is not left
			// trusting a hash that agrees with a difference.
			check.Diff += fmt.Sprintf(" (both results hash to %s, so the difference is in the "+
				"orders rather than the outcome and the hash does not cover it)", check.Want)
		}
	}
	return check, nil
}

// VerifyEncoded is Verify for a log that has been through a file.
//
// It exists because Record hands back a Recording that holds the Setup as a live
// value, and a caller that has saved the log to disk and come back later has a
// []byte, a seed, and a config version, and nothing else: the Setup is not encoded
// (see Recording). Without this, every caller has to hand-assemble a Recording
// from those pieces, and the assembly is exactly the step where a caller pairs a
// log with the wrong seed.
//
// So VerifyEncoded takes the bytes, decodes them, takes the seed and the balance
// version FROM THE FILE rather than from the caller, and runs the same check Verify
// does. setup is still the caller's to supply: for a force built by GenerateForce
// the seed rebuilds it, and for a force a caller assembled by hand the caller is
// the only one who knows it. Replay's roster fingerprint is what proves the setup
// passed here is the one the log was recorded against, so a caller who rebuilds
// from the wrong seed is refused rather than trusted.
//
// The three failure modes are kept apart on purpose, because they mean different
// things to whoever has to act on them:
//
//   - a corrupt file is an error, from DecodeOrderLog;
//   - a log that cannot be replayed at all (wrong roster, wrong balance version,
//     refused rows) is an error, from Replay;
//   - a replay that ran and disagreed is a ReplayCheck with Match false, which is a
//     finding and not a failure of the call.
func VerifyEncoded(cfg *config.Config, encoded []byte, setup Setup, original *Result) (*ReplayCheck, error) {
	log, seed, configVersion, err := DecodeOrderLog(encoded)
	if err != nil {
		return nil, err
	}
	return Verify(cfg, &Recording{
		Seed:          seed,
		ConfigVersion: configVersion,
		Setup:         setup,
		Log:           log,
	}, original)
}

// String renders a check as the two or three lines a harness prints.
func (c *ReplayCheck) String() string {
	s := fmt.Sprintf("replay %s: want %s, got %s (seed %d, %d orders, %d ticks)",
		matchWord(c.Match), c.Want, c.Got, c.Seed, c.Orders, c.Ticks)
	if c.Match {
		return s
	}
	s += fmt.Sprintf("\n  original outcome: %s\n  replay outcome:   %s\n  first difference: %s",
		c.Outcome, c.ReplayOutcome, c.Diff)
	return s
}

// matchWord is the word a check prints for a verdict, phrased so that a harness
// reading only this line still knows whether to worry.
func matchWord(ok bool) string {
	if ok {
		return "MATCHED"
	}
	return "MISMATCH"
}
