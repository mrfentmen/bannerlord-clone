// Package command is the tactics layer: the part of a battle that decides WHAT a
// formation should do, as opposed to how it moves or what happens to it when it
// gets there.
//
// # WHAT THIS IS
//
// One commander per side. Each tick it reads the field, measures it, applies a
// fixed sequence of rules, and issues orders to its formations: which advance,
// which hold, when a flank is committed, when the reserves go in, and when a
// broken formation is pulled out of the line. AI.md section 5's "formation-level
// goals: advance, hold, flank, fall back", with the goals decided rather than
// described.
//
// # WHAT THIS IS NOT
//
// It is not the formation layer. internal/formation owns what a line, a column,
// a wedge, and loose order are, how fast they walk, and where every man stands
// given an order; this package hands it an order and takes back the metres each
// man is to walk. It does not reimplement any of that, and it does not hold a
// second opinion about it.
//
// It is not the morale layer either. A unit that breaks breaks on the engine's
// numbers, not on a commander's opinion of its men; a commander with a shaken
// formation gets to decide where to put it afterwards, and that is the whole of
// the authority it has over morale.
//
// # IT DOES NOT CALL THE BATTLE ENGINE
//
// internal/battle publishes the field once per tick through battle.View and reads
// movement back from it through battle.UnitCommand. This package imports
// internal/battle for those two types and nothing else, and it never runs a
// battle: a battle is run with battle.RunCommanded and this package as the
// Commander. CONSTITUTION.md section 2.1 is about systems not calling each other;
// the seam between two layers of one battle is shared state plus one interface.
//
// # THE OTHER IMPORTS, AND WHY THEY ARE NOT COUPLING
//
// internal/config is the loader for the whole simulation and not one of the
// systems in CAUSE_EFFECT.md section 3. internal/cause is the log every tracked
// write goes to, and internal/model is the vocabulary that log is written in.
// Reading a constant and writing a cause row is not a system invoking another
// system.
//
// # WHY A CAUSE ROW PER ORDER
//
// CONSTITUTION.md section 2.2: a feature that changes tracked state and writes
// nothing to the cause log is incomplete. An order changes what a body of troops
// is doing, so every order produces exactly one row, with no size threshold under
// which it does not: a threshold here would be a rule about which decisions a
// player is not allowed to have explained. Each row names what was read and what
// was decided, and cites the previous order for the same formation, so the Why
// panel can walk a formation's whole order history.
//
// # DETERMINISM
//
// Same battle, same orders, byte for byte. There is no randomness in this package
// at all — not a seeded stream, not a coin flip for which side to flank: the weak
// wing is chosen by measurement, and a tie is broken by a stated rule that
// always goes the same way. There is no map iteration, no wall clock, and no
// floating-point comparison that depends on the order anything was visited in.
// Everything is walked in ascending unit id and in post order.
package command

import (
	"fmt"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/formation"
)

// Error is every way this package refuses to guess. CONSTITUTION.md section 1.3:
// errors are handled, not swallowed. The fields name the operation and the input
// at fault, so the log says what a developer can act on and a player never sees
// it.
type Error struct {
	// Op is the function or method that refused.
	Op string
	// Field names the input at fault: a balance key, an order, a force.
	Field string
	// Detail says what was wrong with it.
	Detail string
}

func (e *Error) Error() string {
	return fmt.Sprintf("command: %s: %s: %s", e.Op, e.Field, e.Detail)
}

func errorf(op, field, format string, args ...any) *Error {
	return &Error{Op: op, Field: field, Detail: fmt.Sprintf(format, args...)}
}

// Commander commands both armies of one battle.
//
// It implements battle.Commander, so it is handed to battle.RunCommanded and read
// once per tick. It holds the whole command history: every order it has issued,
// in the order it issued them, which is what a report prints and what a
// determinism test compares.
//
// A Commander is not safe for two battles at once. Two battles sharing one
// commander would share its order history and its order of battle, and a battle
// is a thing that is reproduced by running it alone. New returns a fresh one, and
// there is nothing to reset.
type Commander struct {
	cfg  Config
	fcfg formation.Config
	log  *cause.Log

	sides [2]*sideCommander
	// orders is every order issued, in issue order: side A's and side B's
	// alternated by tick, and within a tick in post order.
	orders []OrderIssued
	// ticks is how many ticks this commander has been asked about.
	ticks int
}

// New builds a commander from the balance config and a cause log.
//
// The cause log may be nil, and then orders are still issued and still recorded in
// the commander's own history — but nothing is written to a log, and every
// OrderIssued comes back with a CauseID of zero. That is a mode for a caller who
// wants the orders and has nowhere to log them; it is not a mode in which the
// cause-log guarantee quietly stops applying, and a battle meant to leave a why
// chain behind must pass a log.
func New(cfg *config.Config, log *cause.Log) (*Commander, error) {
	if cfg == nil {
		return nil, errorf("New", "config",
			"the tactics layer needs the balance config; this package holds no constants of its own, "+
				"because CONSTITUTION.md section 1.2 makes the balance file the only source of them")
	}
	c, err := FromCentral(cfg)
	if err != nil {
		return nil, err
	}
	f, err := formation.FromCentral(cfg)
	if err != nil {
		return nil, err
	}
	cmd := &Commander{cfg: c, fcfg: f, log: log}
	// Side A's formations take the cause-log ids from zero and side B's continue
	// from command.formations_per_side, so an order to side A's front and an order
	// to side B's front are two rows about two armies rather than one row about
	// one, and each formation's history is a chain of its own.
	sides := [...]battle.Side{battle.SideA, battle.SideB}
	for i, side := range sides {
		cmd.sides[i] = newSideCommander(side, c, f, cmd, i*c.FormationsPerSide)
	}
	return cmd, nil
}

// Command is the per-tick entry point the battle engine calls.
//
// It commands side A and then side B, always in that order. The order is fixed and
// documented because it is part of the tick: two commanders reading the same
// snapshot in a defined order produce a defined battle, and a battle whose
// commander order varied with map iteration would not be reproducible at all.
//
// Neither commander can see the other's orders within a tick, because orders are
// applied after both have been given. Both are reading the field as it stands, not
// as the other side's commander would like it to stand.
func (c *Commander) Command(v *battle.View) error {
	if v == nil {
		return errorf("Command", "view",
			"the commander was handed no field to read; a battle that cannot be seen cannot be commanded")
	}
	if len(v.Units) == 0 {
		return errorf("Command", "view", "the field has no units on it, so there is nothing to command")
	}
	if v.TickSeconds <= 0 {
		return errorf("Command", "view.tick_seconds",
			"%g seconds is not a length of time a formation can be moved for", v.TickSeconds)
	}
	c.ticks = v.Tick + 1
	for _, s := range c.sides {
		if err := s.tick(v); err != nil {
			return err
		}
	}
	return nil
}

// Orders returns every order this commander has issued, oldest first.
//
// The slice is the commander's own, and a caller that keeps it keeps a reference
// to a slice that will grow: copy it if it is going to outlive the battle.
func (c *Commander) Orders() []OrderIssued { return c.orders }

// Counts is how many orders of each kind the battle produced.
func (c *Commander) Counts() OrderCounts { return summariseCounts(c.orders) }

// Ticks is how many ticks this commander has been asked about, which is the
// battle's tick count: a commander is asked once per tick and never twice.
func (c *Commander) Ticks() int { return c.ticks }

// Config is the tactics config this commander was built from, for a report that
// states the constants a given order sequence came from.
func (c *Commander) Config() Config { return c.cfg }

// Log reports whether this commander has a cause log to write to.
func (c *Commander) Log() bool { return c.log != nil }

// CauseRows returns how many cause rows this commander has written.
//
// It is counted by asking the log rather than remembered here, because the log is
// what a player is shown and this struct is what the code believes: a number that
// says four orders produced five rows is a number that has to be reconcilable
// somewhere a developer can look.
func (c *Commander) CauseRows() int {
	if c.log == nil {
		return 0
	}
	n := 0
	for _, r := range c.log.Rows() {
		if r.System == systemName {
			n++
		}
	}
	return n
}

// battleIntent mirrors battle.Intent so intentFor cannot drift from the engine's
// own values. The three used here are all the engine can record for a commanded
// unit; rout is the engine's to decide from morale, and no order a commander
// gives produces one.
type battleIntent = battle.Intent

const (
	intentAdvance  = battle.IntentAdvance
	intentEngage   = battle.IntentEngage
	intentWithdraw = battle.IntentWithdraw
)
