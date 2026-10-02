package battle

import "mbclone/simulation/internal/config"

// THE COMMAND SEAM.
//
// This file is the one place the battle core lets something outside it hold the
// reins, and it is deliberately tiny: a read-only view of the field, a writable
// per-unit movement channel, and one call per tick. It exists because the
// tactics layer (internal/command) has to read the field every tick and answer
// with orders, and because there was no way for it to do that without a fight
// being forked into a second loop.
//
// WHY IT IS HERE AND NOT IN THE TICK LOOP (CONSTITUTION.md section 2.1)
// Systems do not call each other; they read shared state and write shared
// state. This is that seam in the shape the loop can accept: the loop publishes
// the tick's committed state as a View, and the command layer writes movement
// into a channel the loop reads back. Neither package imports the other's
// internals, neither mutates the other's structures, and the loop's own rules
// stay in the loop.
//
// WHAT THE COMMANDER MAY AND MAY NOT DO
// It may say where each unit goes this tick. It may not touch hit points,
// morale, status, targets, ammunition, or the battle's ending rules: a commander
// who could set a unit's morale would be deciding the fight, not commanding it.
// A Commander that returns an error stops the battle with that error rather than
// finishing a fight it could no longer command, which is CONSTITUTION.md section
// 1.3 applied to a layer rather than to a request handler.
//
// WHY THE HOOK RUNS AFTER THE INTENT STAGE
// The intent stage decides what every unit would do on its own. The command
// layer then speaks over it. Running the hook after that stage is what makes a
// commander's order an override rather than an addition: if the hook ran before
// it, the intent stage would add its own movement on top of the ordered
// movement and every unit would walk further than it was told, which is a bug
// nobody would find by reading either side's code. The stage order in tickOrder
// is therefore the documented order of authority: intent decides, command
// overrides, and everything after sees one committed set of movements.

// UnitView is one unit as a commander sees it: everything needed to decide what
// that unit should do this tick, and nothing that would let a commander change
// it.
//
// The fields are a copy of committed state at the top of the tick. A commander
// that wanted to infer anything else about a unit is reading a state the tick
// has already left behind.
type UnitView struct {
	// ID is the unit's battle id, dense and ascending, stable for the battle.
	// It is the key into View.Commands.
	ID int
	// Side is which army the unit fights for.
	Side Side
	// Role is what it is equipped to do.
	Role Role
	// Status is its condition: fighting, broken, routed, surrendered, or
	// destroyed. Only a fighting or broken unit can be commanded anywhere: a
	// routed man is off the attack and stays there whatever his general says.
	Status Status
	// X and Y are its position in metres, at the top of the tick.
	X, Y float64
	// HPFrac is its remaining condition on a 0-1 scale.
	HPFrac float64
	// Morale is its steadiness on a 0-1 scale, and Suppression is how pinned
	// down it is. Both drive a commander's willingness to keep a formation in
	// contact.
	Morale, Suppression float64
	// Troops is how many bodies the unit stands for, and Speed is its base
	// speed in metres per second. Speed matters to a formation layer because a
	// formation's pace is a nominal pace: a fast unit in a slow formation walks
	// faster, and only the speed here says by how much.
	Troops float64
	Speed  float64
	// Ammo is rounds left for a shooter, and Intent is what the unit's own
	// rules decided this tick. A commander sees both because they are facts
	// about the field, not because they may be written.
	Ammo   float64
	Intent Intent
}

// UnitCommand is one unit's ordered movement for this tick.
//
// Zero value means "no order", which is why Set exists: a unit that did not
// move and a unit with no order both leave DX and DY at zero, and only Set says
// which happened. A zero-length order on a commander that means "stand still"
// must therefore set Set, and a commander that says nothing leaves it clear.
type UnitCommand struct {
	// Set marks this channel as spoken to. The hook only writes back to units
	// whose Set is true.
	Set bool
	// DX and DY are the metres to move this tick, which may be zero.
	DX, DY float64
	// Intent is what the unit is being told it is doing, recorded so the battle
	// report describes what the men were actually ordered to do rather than
	// what they would have done uncommanded. The command layer sets it with the
	// movement, every time.
	Intent Intent
}

// View is the whole field at one tick, as a commander sees it.
//
// Units and Commands are parallel and indexed alike: Commands[i] is the order
// for Units[i]. The slices are reused between ticks, so a commander that holds
// on to them is holding a buffer that is about to change underneath it. Read
// what you need during the call.
type View struct {
	// Tick is the number of ticks completed before this one, so the first
	// decision a commander makes is at tick 0.
	Tick int
	// Elapsed is the simulated seconds before this tick, and TickSeconds is how
	// long this tick is. A formation's movement needs both: pace times time is
	// distance.
	Elapsed     float64
	TickSeconds float64
	// Units is every unit on the field, ascending by id, both sides together.
	Units []UnitView
	// Strength is each side's current battle strength and Opening is what it
	// started with, indexed A then B, both measured the same way.
	//
	// They are published rather than left for a commander to recompute, because
	// the engine already computes them for its own ending rules and a second,
	// slightly different definition of "strength" would let two parts of the same
	// battle disagree about which side is winning. One measure, published.
	Strength [2]float64
	Opening  [2]float64
	// Commands is the write channel. See UnitCommand.
	Commands []UnitCommand
}

// Commander is what the tactics layer implements. Command is called once per
// tick, before the tick's movement is committed, and writes its orders into
// v.Commands.
//
// It must be deterministic given the View and its own previous calls: the battle
// is reproducible from a seed, and a commander that drew from a clock or an
// unseeded generator would break that for every run it took part in.
type Commander interface {
	Command(v *View) error
}

// commandHooks is the battle's optional seam: the commander and the buffers it
// writes through. It is nil on a battle nobody is commanding, which is the
// default and the cheap path.
type commandHooks struct {
	cmd  Commander
	view *View
}

// RunCommanded fights a battle with a commander holding the reins each tick.
//
// It is Run plus a Commander, and deliberately not a flag on Setup: Setup is the
// data a battle is reproducible from, and a Commander is behaviour. A battle run
// with Run has no seam in it at all and behaves exactly as it did before this
// file existed, which is the property that lets both paths be the same code.
func RunCommanded(cfg *config.Config, seed uint64, setup Setup, cmd Commander) (*Result, error) {
	if cmd == nil {
		return nil, &Error{
			Kind:  ErrUnitInvalid,
			Field: "RunCommanded",
			Detail: "no commander was supplied, so nothing is being commanded. Use Run for an uncommanded battle, " +
				"which is a real mode rather than a bug to route around",
		}
	}
	b, err := newBattle(cfg, seed, setup)
	if err != nil {
		return nil, err
	}
	// The view is allocated once, against the forces this battle actually has,
	// and refilled in place every tick. Nothing in the loop allocates per tick
	// because of the seam.
	v := &View{
		Units:    make([]UnitView, len(b.units)),
		Commands: make([]UnitCommand, len(b.units)),
	}
	b.hooks = &commandHooks{cmd: cmd, view: v}
	return b.fight()
}

// runCommanders is the per-tick call into the seam. It publishes the field,
// takes the orders back, and writes them over the movements the intent stage
// staged.
//
// Every part of it is allocation-free after the first tick, and it is the only
// place outside the stages that touches b.deltas, which is the price of an order
// being an override rather than a suggestion.
func (b *Battle) runCommanders() error {
	if b.hooks == nil {
		return nil
	}
	v := b.hooks.view
	v.Tick = b.tickNo
	v.Elapsed = b.elapsed
	v.TickSeconds = b.c.TickSeconds
	v.Strength = [2]float64{
		strength(b.units, SideA, b.c),
		strength(b.units, SideB, b.c),
	}
	v.Opening = [2]float64{b.strengthStartA, b.strengthStartB}
	for i, u := range b.units {
		v.Units[i] = UnitView{
			ID:          u.ID,
			Side:        u.Side,
			Role:        u.Role,
			Status:      u.Status,
			X:           u.X,
			Y:           u.Y,
			HPFrac:      u.hpFrac(),
			Morale:      u.Morale,
			Suppression: u.Suppression,
			Troops:      u.Troops,
			Speed:       u.Speed,
			Ammo:        u.Ammo,
			Intent:      u.Intent,
		}
		// The channel is cleared before the commander is handed the field, so an
		// order given last tick cannot be mistaken for one given this tick. A
		// commander that forgets to speak to a unit leaves it to its own rules,
		// which is the honest reading of silence.
		v.Commands[i] = UnitCommand{}
	}
	if err := b.hooks.cmd.Command(v); err != nil {
		return &Error{
			Kind:  ErrInternal,
			Field: "Commander.Command",
			Detail: "the commander could not read the field or would not write its orders, so this tick " +
				"was not fought: " + err.Error(),
		}
	}
	for i := range v.Commands {
		c := v.Commands[i]
		if !c.Set {
			continue
		}
		d := &b.deltas[i]
		d.DX, d.DY = c.DX, c.DY
		d.intent, d.intentSet = c.Intent, true
		// The bound the engine's own movement is held to applies to an ordered
		// movement too. A commander that ordered a man across the field would
		// otherwise produce a tick that teleports him, and the tick would stop
		// meaning what it is for.
		b.clampStep(d)
	}
	return nil
}
