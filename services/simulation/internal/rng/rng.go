// Package rng provides deterministic pseudo-random number generation.
//
// The whole simulation is reproducible from a single integer seed
// (AI.md section 1: "Deterministic with a seed"). Every stochastic decision
// in every system draws from an Rng, never from math/rand global state or the
// clock, so a given seed plus a given set of inputs always produces the same
// run.
//
// Rng is not safe for concurrent use. Systems run sequentially in tick order,
// so each system that needs randomness is given its own Rng by the engine.
package rng

import "math"

// Rng is a splitmix64 generator. Chosen because it is tiny, has no global
// state, and passes BigCrush; a 64-bit state keeps a multi-year run cheap.
type Rng struct {
	state uint64
}

// New returns an Rng seeded with seed. A zero seed is remapped to a fixed
// non-zero constant so that seed 0 is still a usable, distinct stream rather
// than a degenerate all-zero state.
func New(seed uint64) *Rng {
	if seed == 0 {
		seed = 0x9E3779B97F4A7C15
	}
	return &Rng{state: seed}
}

// Derive returns a new independent stream identified by a text label. Systems
// use this so that adding a new random draw in one system does not shift the
// number sequence seen by every other system, which would break golden-run
// comparison (TESTING_AND_BALANCE.md section 9).
func (r *Rng) Derive(label string) *Rng {
	h := r.state
	for i := 0; i < len(label); i++ {
		h ^= uint64(label[i])
		h *= 0x100000001B3
	}
	return &Rng{state: h}
}

// Uint64 returns the next value in the stream.
func (r *Rng) Uint64() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

// Intn returns a value in [0,n). It panics if n <= 0, because a caller that
// asks for a range of zero is a bug and should fail loudly rather than
// silently return 0 (CONSTITUTION.md section 1.3: errors are handled, not
// swallowed).
func (r *Rng) Intn(n int) int {
	if n <= 0 {
		panic("rng: Intn requires n > 0")
	}
	return int(r.Uint64() % uint64(n))
}

// Float64 returns a value in [0,1).
func (r *Rng) Float64() float64 {
	// Use the top 53 bits so the mantissa is filled exactly.
	return float64(r.Uint64()>>11) / float64(uint64(1)<<53)
}

// Range returns a value in [lo,hi]. If hi <= lo it returns lo.
func (r *Rng) Range(lo, hi float64) float64 {
	if hi <= lo {
		return lo
	}
	return lo + r.Float64()*(hi-lo)
}

// IntRange returns an integer in [lo,hi] inclusive.
func (r *Rng) IntRange(lo, hi int) int {
	if hi <= lo {
		return lo
	}
	return lo + r.Intn(hi-lo+1)
}

// Normal returns a value from a standard normal distribution using the
// Box-Muller transform. Used for noisy estimation of rival state (AI.md
// section 6), never for deciding an outcome directly.
func (r *Rng) Normal(mean, stddev float64) float64 {
	u1 := r.Float64()
	// Guard against log(0).
	if u1 < 1e-12 {
		u1 = 1e-12
	}
	u2 := r.Float64()
	z := math.Sqrt(-2*math.Log(u1)) * math.Cos(2*math.Pi*u2)
	return mean + z*stddev
}

// Chance reports whether a draw succeeds with probability p, where p is
// clamped into [0,1] so a config typo cannot produce a probability outside the
// valid domain and silently invert an outcome.
func (r *Rng) Chance(p float64) bool {
	if p <= 0 {
		return false
	}
	if p >= 1 {
		return true
	}
	return r.Float64() < p
}

// State returns the generator's internal state. It exists for save/load:
// capturing the state lets a saved game resume the exact random stream.
// Systems must never use this to fork streams; use Derive for that.
func (r *Rng) State() uint64 { return r.state }

// SetState restores a state previously captured with State.
func (r *Rng) SetState(s uint64) { r.state = s }
