package battle

import (
	"fmt"
	"strconv"
	"strings"
)

// THE RESULT HASH.
//
// A battle result is a wall of numbers, and comparing two of them by eye is how a
// determinism bug survives. This file reduces a finished battle to one uint64, so
// that "did these two runs agree" is a single equality rather than forty float
// comparisons a human has to eyeball.
//
// # WHAT IS IN THE HASH, AND WHY
//
// The hash covers two things, and the split is deliberate:
//
//  1. The final state of every unit, taken while the units are still alive. This
//     is the part that catches a divergence nobody would think to look at: two
//     runs that agree on the winner, the tick count, every casualty total, and
//     every event can still differ in one unit's position by a single bit, and
//     that difference is a bug that will get worse as the code changes.
//
//  2. The Result's own published numbers, including the outcome. Those are what a
//     report is built from, so a hash that did not cover them could not detect a
//     battle whose outcome was right and whose report was wrong.
//
// The unit state is folded first and the published numbers second, so a divergence
// in either is a divergence in the hash.
//
// # WHY IT IS A HASH AND NOT A COMPARISON
//
// Comparing the fields directly would say which field diverged, which is more
// useful, and it is available: ResultStateDiff takes two results and reports the
// first field that differs. The hash exists because the check that matters in a
// test and in a replay harness is a single comparison performed thousands of times,
// and because a hash is what can be stored alongside a saved run and compared
// against a replay months later without keeping the whole result.
//
// # FLOATING POINT, AND THE LIMIT OF THIS CLAIM
//
// Every float goes into the digest as its exact bit pattern, so two runs that
// differ in the last bit of one unit's position produce different hashes. That is
// the point.
//
// It also means the claim is exactly: identical on the same build on the same
// platform. It is NOT a claim of bit-exact reproducibility across architectures,
// across Go versions, or between an amd64 server and an arm64 client. That limit
// is not ours, it is floating point's: x87 80-bit extended intermediates, fused
// multiply-add contraction, and a different math.Sqrt in a different libm all
// produce different last bits from identical arithmetic. The sparta project
// documents the same limit for itself (~/workspace/agents/spacebunny/OSS-REFERENCE.md
// section 1, "Known limit: reproducible on the same build/platform"), and the right
// response is to state the limit rather than to weaken the hash until it survives
// it, which would mean hashing rounded values and hiding exactly the class of bug
// this is here to catch.

// hashUnitState folds every unit's final gameplay state into a running digest.
//
// The iteration is b.units in its existing order, which is ascending unit id, and
// it must stay that order: a digest over a set of units is only reproducible if
// the set is enumerated the same way every time. Map iteration is the classic way
// to lose this, and Result.Sides is a fixed array for the same reason.
func (b *Battle) hashUnitState(h uint64) uint64 {
	// The unit count is mixed in so that a battle with fewer units cannot hash to
	// the same value as a longer one that happens to share a prefix.
	h = mixUint64(h, uint64(len(b.units)))
	for _, u := range b.units {
		h = mixUint64(h, uint64(u.ID))
		h = mixUint64(h, uint64(u.Side))
		h = mixUint64(h, uint64(u.Role))
		h = mixUint64(h, uint64(u.Status))
		h = mixUint64(h, uint64(u.Intent))
		h = mixUint64(h, uint64(u.MeleeTarget))
		h = mixUint64(h, uint64(u.RangedTarget))
		h = mixUint64(h, floatBits(u.HP))
		h = mixUint64(h, floatBits(u.Morale))
		h = mixUint64(h, floatBits(u.Suppression))
		h = mixUint64(h, floatBits(u.Exhaustion))
		h = mixUint64(h, floatBits(u.X))
		h = mixUint64(h, floatBits(u.Y))
		h = mixUint64(h, floatBits(u.VX))
		h = mixUint64(h, floatBits(u.VY))
		h = mixUint64(h, floatBits(u.Ammo))
		h = mixUint64(h, floatBits(u.Troops))
		h = mixUint64(h, floatBits(u.MeleeSkill))
		h = mixUint64(h, floatBits(u.RangedSkill))
		h = mixUint64(h, floatBits(u.Speed))
		h = mixUint64(h, floatBits(u.MaxHP))
		h = mixUint64(h, floatBits(u.MeleeCooldown))
		h = mixUint64(h, floatBits(u.RangedCooldown))
		h = mixUint64(h, uint64(u.Shots))
		h = mixUint64(h, uint64(u.Swings))
	}
	return h
}

// hashOutcome folds who won and why.
func (o Outcome) hashInto(h uint64) uint64 {
	h = mixUint64(h, uint64(o.Kind))
	h = mixUint64(h, uint64(o.Reason))
	return h
}

// Hash is a digest of everything a finished battle produced.
//
// Equal hashes mean the two runs agreed on every unit's final state, on the
// outcome, and on every published total. Unequal hashes mean they did not, and
// nothing more: the hash does not say where they parted. ResultStateDiff does.
//
// A zero Result has a defined non-zero hash rather than the zero value, so that a
// caller who hashes a nil or empty result by accident gets a value that is
// distinguishable from a real battle's.
func (r *Result) Hash() uint64 {
	if r == nil {
		return mixUint64(orderLogHashSeed, 0xDEAD)
	}
	h := orderLogHashSeed
	h = mixUint64(h, uint64(r.StateHash))
	h = r.Outcome.hashInto(h)
	h = mixUint64(h, uint64(r.Ticks))
	h = mixUint64(h, floatBits(r.Elapsed))
	if r.Truncated {
		h = mixUint64(h, 1)
	}
	h = mixUint64(h, uint64(r.EventsDropped))
	// The label and config version are folded in as lengths plus bytes, because a
	// battle under a different balance file is not the same battle even when every
	// number in it matches.
	h = mixUint64(h, uint64(len(r.ConfigVersion)))
	for i := 0; i < len(r.ConfigVersion); i++ {
		h ^= uint64(r.ConfigVersion[i])
		h *= orderLogHashPrime
	}
	h = mixUint64(h, uint64(len(r.Label)))
	for i := 0; i < len(r.Label); i++ {
		h ^= uint64(r.Label[i])
		h *= orderLogHashPrime
	}
	h = r.Stats.hashInto(h)
	for i := range r.Sides {
		h = r.Sides[i].hashInto(h)
	}
	// The event list is part of the result a report is written from, so it is
	// covered. Its length is folded first for the same reason the unit count is.
	h = mixUint64(h, uint64(len(r.Events)))
	for i := range r.Events {
		e := &r.Events[i]
		h = mixUint64(h, uint64(e.Seq))
		h = mixUint64(h, uint64(e.Tick))
		h = mixUint64(h, uint64(e.Side))
		h = mixUint64(h, uint64(e.Kind))
		h = mixUint64(h, uint64(e.Unit))
		h = mixUint64(h, floatBits(e.Value))
	}
	return h
}

// hashInto folds one side's published result.
func (s SideResult) hashInto(h uint64) uint64 {
	h = mixUint64(h, uint64(s.Side))
	h = mixUint64(h, uint64(s.StartUnits))
	h = mixUint64(h, uint64(s.Surrendered))
	h = mixUint64(h, uint64(s.Standing))
	h = mixUint64(h, uint64(s.Broken))
	h = mixUint64(h, uint64(s.Routed))
	h = mixUint64(h, uint64(s.Leaders))
	h = mixUint64(h, floatBits(s.StartBodies))
	h = mixUint64(h, floatBits(s.Dead))
	h = mixUint64(h, floatBits(s.Wounded))
	h = mixUint64(h, floatBits(s.SurrenderedBodies))
	h = mixUint64(h, floatBits(s.StrengthStart))
	h = mixUint64(h, floatBits(s.StrengthEnd))
	h = mixUint64(h, floatBits(s.MoraleStart))
	h = mixUint64(h, floatBits(s.MoraleEnd))
	h = mixUint64(h, floatBits(s.AmmoStart))
	h = mixUint64(h, floatBits(s.AmmoSpent))
	h = mixUint64(h, floatBits(s.Shots))
	h = mixUint64(h, floatBits(s.Swings))
	h = mixUint64(h, floatBits(s.RangedHits))
	h = mixUint64(h, floatBits(s.MeleeHits))
	h = mixUint64(h, floatBits(s.SuppressionDealt))
	h = mixUint64(h, floatBits(s.SuppressionTaken))
	h = mixUint64(h, floatBits(s.CasualtiesInflicted))
	return h
}

// hashInto folds the battle's running totals.
func (s Stats) hashInto(h uint64) uint64 {
	for _, v := range s.Bodies {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.Dead {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.Wounded {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.Surrendered {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.Shots {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.Swings {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.MeleeHits {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.RangedHits {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.Suppression {
		h = mixUint64(h, floatBits(v))
	}
	for _, v := range s.CasualtiesInflicted {
		h = mixUint64(h, floatBits(v))
	}
	h = mixUint64(h, uint64(s.Breaks))
	h = mixUint64(h, uint64(s.Routs))
	h = mixUint64(h, uint64(s.PeakBroken))
	h = mixUint64(h, uint64(s.PeakRouted))
	h = mixUint64(h, floatBits(s.PeakSuppression))
	return h
}

// HashString is Hash as sixteen lowercase hex digits, which is the form a report
// or a log line carries.
func (r *Result) HashString() string {
	return formatHash(r.Hash())
}

// formatHash renders a digest as fixed-width hex.
func formatHash(h uint64) string {
	var sb strings.Builder
	sb.Grow(16)
	const digits = "0123456789abcdef"
	for i := 15; i >= 0; i-- {
		sb.WriteByte(digits[(h>>(uint(i)*4))&0xF])
	}
	return sb.String()
}

// ResultStateDiff reports the first difference between two results, by name.
//
// A hash says whether two runs agreed. This says where they did not, which is
// what makes a determinism failure debuggable rather than merely detectable. It
// returns ok=true and an empty difference when the two hashes are equal.
//
// It compares the hash first, because that is one integer comparison, and only
// walks the fields when the hashes disagree. The walk is over the published
// Result, which does not include per-unit positions: those are folded into
// StateHash by the engine and are covered by the comparison, but they cannot be
// named individually from a Result alone. A caller holding two live Battles can
// name them with DiffUnitStates.
func ResultStateDiff(a, b *Result) (field string, ok bool) {
	if a.Hash() == b.Hash() {
		return "", true
	}
	if a == nil || b == nil {
		return "result is nil", false
	}
	if a.StateHash != b.StateHash {
		return "unit final states (StateHash " + formatHash(a.StateHash) +
			" vs " + formatHash(b.StateHash) + ")", false
	}
	type num struct {
		name string
		a, b float64
	}
	nums := []num{
		{"Outcome.Kind", float64(a.Outcome.Kind), float64(b.Outcome.Kind)},
		{"Outcome.Reason", float64(a.Outcome.Reason), float64(b.Outcome.Reason)},
		{"Ticks", float64(a.Ticks), float64(b.Ticks)},
		{"Elapsed", a.Elapsed, b.Elapsed},
		{"EventsDropped", float64(a.EventsDropped), float64(b.EventsDropped)},
		{"ConfigVersion", float64(len(a.ConfigVersion)), float64(len(b.ConfigVersion))},
	}
	for _, n := range nums {
		if n.a != n.b {
			return n.name, false
		}
	}
	if a.ConfigVersion != b.ConfigVersion {
		return "ConfigVersion", false
	}
	for i := range a.Sides {
		if a.Sides[i].Side != b.Sides[i].Side {
			return "Sides.Side", false
		}
		sa, sb := a.Sides[i], b.Sides[i]
		for _, n := range []num{
			{"Dead", sa.Dead, sb.Dead},
			{"Wounded", sa.Wounded, sb.Wounded},
			{"StrengthEnd", sa.StrengthEnd, sb.StrengthEnd},
			{"MoraleEnd", sa.MoraleEnd, sb.MoraleEnd},
			{"AmmoSpent", sa.AmmoSpent, sb.AmmoSpent},
			{"Shots", sa.Shots, sb.Shots},
			{"RangedHits", sa.RangedHits, sb.RangedHits},
			{"CasualtiesInflicted", sa.CasualtiesInflicted, sb.CasualtiesInflicted},
		} {
			if n.a != n.b {
				return n.name + " (side " + sa.Side.String() + ")", false
			}
		}
	}
	// The hashes disagree but nothing above does, which means the difference is in
	// a field this walk does not read. Saying so is more useful than naming a
	// field that is not actually the one that differs.
	return "a field not named by this walk (hashes " + a.HashString() +
		" vs " + b.HashString() + ")", false
}

// DiffUnitStates reports the first unit whose final state differs between two
// battles, by unit id and field name.
//
// It takes live Battles rather than Results because per-unit state is not part of
// a Result; the engine folds it into StateHash and drops it. A caller that wants
// the field name has to be holding the Battles, and the ones who are are exactly
// the ones debugging a replay mismatch.
func DiffUnitStates(a, b *Battle) (unitID int, field string, ok bool) {
	if a == nil || b == nil {
		return -1, "battle is nil", false
	}
	if len(a.units) != len(b.units) {
		return -1, fmt.Sprintf("unit count %d vs %d", len(a.units), len(b.units)), false
	}
	for i := range a.units {
		x, y := a.units[i], b.units[i]
		if x.ID != y.ID {
			return i, "ID", false
		}
		for _, f := range []struct {
			name string
			x, y float64
		}{
			{"X", x.X, y.X},
			{"Y", x.Y, y.Y},
			{"HP", x.HP, y.HP},
			{"Morale", x.Morale, y.Morale},
			{"Suppression", x.Suppression, y.Suppression},
			{"Exhaustion", x.Exhaustion, y.Exhaustion},
			{"Ammo", x.Ammo, y.Ammo},
			{"Status", float64(x.Status), float64(y.Status)},
			{"Intent", float64(x.Intent), float64(y.Intent)},
			{"Shots", float64(x.Shots), float64(y.Shots)},
			{"Swings", float64(x.Swings), float64(y.Swings)},
		} {
			if f.x != f.y {
				return x.ID, f.name, false
			}
		}
	}
	return -1, "", true
}

// formatHashString is a helper for a caller that already has a uint64.
func formatHashString(h uint64) string { return formatHash(h) }

// itoaHash is used only by tests and diagnostics that want the digest as a decimal
// alongside the hex form.
func itoaHash(h uint64) string { return strconv.FormatUint(h, 10) }
