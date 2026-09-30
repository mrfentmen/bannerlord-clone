// Package shared holds helpers that every system may use.
//
// This package deliberately contains no simulation logic. A helper that encoded
// a rule about the world would be a system hiding in the wrong place, and the
// decoupling test allows every system to import it, which would let any system
// reach any rule indirectly. What lives here is arithmetic and lookup: clamping,
// ratios, and reading fields by name.
package shared

import (
	"fmt"
	"strings"

	"mbclone/simulation/internal/model"
)

// Clamp bounds v to [lo,hi]. Used everywhere instead of an inline comparison,
// so that every bound in the simulation is written the same way.
func Clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// Clamp01 bounds v to [0,1], the range most shared fields use.
func Clamp01(v float64) float64 { return Clamp(v, 0, 1) }

// Share returns part/total, or zero when total is zero. A ratio with a zero
// denominator has no meaningful answer, and returning zero keeps a divided-by-
// zero from turning into a NaN that silently poisons a field forever.
func Share(part, total float64) float64 {
	if total <= 0 {
		return 0
	}
	return part / total
}

// SafeDiv returns a/b, or zero when b is zero.
func SafeDiv(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}

// Decay moves v toward zero by rate, never crossing it.
func Decay(v, rate float64) float64 {
	v -= v * Clamp01(rate)
	if v < 0 {
		return 0
	}
	return v
}

// MoveToward moves v toward target by step, never overshooting. Used by
// systems that need convergence toward an equilibrium rather than a rate
// applied to a difference, such as prices and wages chasing their targets.
func MoveToward(v, target, step float64) float64 {
	if v < target {
		v += step
		if v > target {
			return target
		}
		return v
	}
	v -= step
	if v < target {
		return target
	}
	return v
}

// ReadString renders a set of field values for the cause log's read column.
// The cause log must record what state a system read, per CONSTITUTION.md
// section 2.2, and this is the one place that record is formatted, so it reads
// the same in every row.
func ReadString(pairs ...string) string {
	return strings.Join(pairs, ", ")
}

// Pair formats one name=value pair for ReadString.
func Pair(name string, value float64) string {
	return fmt.Sprintf("%s=%.4f", name, value)
}

// PairF formats one name=value pair with fewer decimals, for values that are
// large counts where four decimals is noise.
func PairF(name string, value float64) string {
	return fmt.Sprintf("%s=%.1f", name, value)
}

// PairB formats one boolean name=yes/no pair.
func PairB(name string, value bool) string {
	if value {
		return name + "=yes"
	}
	return name + "=no"
}

// PairI formats one integer name=value pair.
func PairI(name string, value int) string {
	return fmt.Sprintf("%s=%d", name, value)
}

// Town is a small helper for the common case of naming a town in a read record.
func Town(state *model.State, id int) string { return state.Name(model.KindTown, id) }
