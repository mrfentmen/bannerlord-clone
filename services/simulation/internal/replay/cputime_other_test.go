//go:build !linux

package replay

import "time"

// The cost measurement's second clock is getrusage, which this build does not have.
//
// The test that uses it skips with a message naming the reason rather than silently
// reporting a wall-clock number under a heading that says CPU time. A measurement
// that quietly measures the wrong thing is the failure mode this whole file exists
// to avoid, and it is no cheaper on a portable build than it is on a shared box.

func cpuNow() time.Duration { return 0 }

const cpuClockNames = "unavailable on this platform"
