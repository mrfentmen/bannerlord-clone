package battle

// formationstate.go is the way out.
//
// Everything this layer decides about a man - which shape he is in, which way it
// looks, where his slot is, whether he is standing on it - was written into the
// command channel and then thrown away with the tick. Nothing outside the package
// could ask a formation any of it: a client that wanted to draw a line had the
// shape names and the facing and nothing else, and a caller that wanted to know
// whether a man had arrived had no answer at all. That is a layer that can be
// tested from inside and not used from outside, which is not the same thing as
// working.
//
// What is published here is what the LAST tick's ordering decided. It is a
// reading of the tick that has already been committed, not an order: nothing in
// this file writes to a unit.

// FormationState is one unit's place in the shape its group was drawn in.
type FormationState struct {
	// Unit is the unit's battle id, the same numbering View.Units uses.
	Unit int
	// Group is the index of the group in the group list the commander was built
	// with, which is the same numbering a follow order names ("follow group 2").
	// It is what makes two states comparable: a client asking which men belong
	// together needs the group, and without it the only answer is a distance.
	Group int
	// Shape is the shape this man is in, and Order is what that shape was doing.
	Shape Formation
	Order FormationOrder
	// Facing is the bearing the shape looks, in radians counter-clockwise from
	// +X, the same number UnitCommand carries.
	Facing float64
	// SlotX and SlotY are where the shape says this man stands, on the field, in
	// metres. This is the number a client draws from and the number a caller
	// compares against the man's own position to ask whether he has arrived.
	SlotX, SlotY float64
	// Pinned says the man was inside the pin radius and was written to with a
	// step of zero rather than walked, so he is standing where the shape put him
	// and the shape is holding him there rather than asking him to move.
	//
	// It is the difference between "is in his slot" and "was told to walk to it",
	// which look identical in a position and are not the same claim.
	Pinned bool
}

// States returns every living member of every group's place in its shape, as the
// last tick's ordering left it.
//
// It hands out a copy rather than the commander's own slice, because the slice is
// rebuilt every tick and a caller that kept it would be holding a buffer that
// changes under it. The copy costs one allocation per call, which is nothing
// beside a tick, and it is what lets a caller hold the answer across ticks to
// compare two of them.
//
// The order is the order the groups were commanded in: the order the caller
// declared them, except that a follower is commanded after the group it follows
// because it reads that group's anchor on the same tick. Inside a group, ascending
// unit id. It is stable across ticks, which is what makes two states comparable
// without sorting them, and a caller that wants them grouped differently has the
// group index to sort on.
//
// A commander that has not been ordered has no states, and neither does a group
// whose men are all broken, routed or dead: a man who is not in the field's
// fight is not in a shape, and publishing a slot for him would be publishing a
// place he is not going to be.
func (c *FormationCommander) States() []FormationState {
	if len(c.states) == 0 {
		return nil
	}
	out := make([]FormationState, len(c.states))
	copy(out, c.states)
	return out
}

// FormationStates returns every unit's formation state on this session, across
// both sides and every group, from the commander the session is currently being
// fought by.
//
// It is the read path from the outside: a caller with a Session can ask which
// shape each unit is in and where that shape says he stands, which is the whole
// of what a battle scene needs to draw a formation and the whole of what a
// caller needs to know whether the order it gave has been obeyed.
//
// It returns nil for a session with no commander, and for one whose commander is
// not a formation commander at all: there are no formations to report, and an
// empty answer is the honest one. A session that was commanded and whose units
// are all dead also returns nothing, and that is not an error either.
//
// The commander is read from the seam the battle is actually calling rather than
// from the recorder, because a session that is not recording has no recorder and
// a session whose player changed his mind mid-battle has one wrapping whichever
// commander is live now. Reading the recorder instead answers nil for the first
// and the previous commander's formations for the second, which is the wrong
// answer in both cases and wrong in the second one only on the ticks where it
// matters.
func (s *Session) FormationStates() []FormationState {
	if s == nil || s.battle == nil || s.battle.hooks == nil {
		return nil
	}
	return collectFormationStates(s.battle.hooks.cmd, nil)
}

// collectFormationStates walks a commander and gathers the states of every
// formation commander inside it.
//
// The walk is a type switch on the package's own commander types, and that is a
// thing to be honest about rather than clever about: it is not extensible from
// outside the package, so a caller who composes formations under a commander of
// their own gets no states for them, and the fix when that happens is an
// interface rather than another case here. It is done this way because the two
// types it needs to see are unexported and there is no other way to reach them
// without changing the seam every commander in the game goes through.
//
// A recorder is unwrapped rather than asked, so a recording session and an
// unrecorded one answer the same question the same way.
func collectFormationStates(cmd Commander, out []FormationState) []FormationState {
	switch c := cmd.(type) {
	case nil:
		return out
	case *FormationCommander:
		return append(out, c.States()...)
	case *multiCommander:
		for _, sub := range c.cmds {
			out = collectFormationStates(sub, out)
		}
		return out
	case *Recorder:
		return collectFormationStates(c.Inner(), out)
	}
	return out
}
