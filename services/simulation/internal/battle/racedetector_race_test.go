//go:build race

package battle

// raceDetectorEnabled is true in a -race build and false otherwise.
//
// It exists because -race makes every wall-clock assertion in this package
// meaningless, and a test that fails for that reason is worse than no test: it
// reports a red suite, it says the engine is too slow when the engine is fine,
// and it trains whoever reads it to ignore the assertion.
//
// The size of the effect is not subtle. Measured 20261002 on this branch, the
// 500 v 500 reference battle took 49.8 s of wall clock in an ordinary build and
// 15m19.501s under -race - nineteen times longer - so the per-unit-per-tick
// figure went from 25.9 us to 479.406 us against a ceiling of 250 us and a
// target of 33 us. The battle itself was BIT IDENTICAL under the detector:
// 1918 ticks, side A 111 dead and 258 wounded, side B 106 dead and 246 wounded,
// winner B by enemy broke, the same as an ordinary build. The race detector
// changed how long the engine took and nothing about what it decided.
//
// -race instruments every memory access, so a hot loop that is mostly pointer
// chasing pays for all of it. That is the point of -race. It is not a slowdown
// anybody should read as a performance regression, and there is no way to
// subtract it: it is not a constant factor.
//
// There is no runtime.RaceEnabled. The build tag is how Go spells it, and the
// alternative - sniffing a gor's stack for runtime.racefuncenter - is a hack
// that would also trip on a function merely NAMED that way.
const raceDetectorEnabled = true
