//go:build linux

package replay

import (
	"syscall"
	"time"
)

// CPU time, which is the clock this lane's cost measurement needs and wall time is
// not.
//
// WHY A SECOND CLOCK EXISTS AT ALL
//
// The overhead measurement has failed to settle a five-per-cent question three
// times, and every failure had the same cause: on a box running several agents, the
// run-to-run spread of the IDENTICAL job is tens of per cent of wall time, which is
// larger than the effect being measured. Min-of-N interleaving and a control
// variant got the methodology as right as wall time allows and the answer did not
// move, because the problem is the clock rather than the statistics.
//
// Measured on this box with a pure-CPU spin, no syscalls, no allocation, three runs:
//
//	wall 2.144s  cpu 0.480s
//	wall 1.191s  cpu 0.457s
//	wall 2.374s  cpu 0.456s
//
// A 99% spread in wall time and a 5.2% spread in CPU time, for identical work. The
// wall clock is measuring how busy the machine is; the CPU clock is measuring the
// job. A cost paid per unit per tick shows up in CPU time whether or not the
// scheduler gave the process the whole core, which is exactly the effect that
// wall-clock timing on a shared box cannot see.
//
// WHAT IT DOES AND DOES NOT FIX
//
// It removes scheduler wait from the measurement. It does not remove contention for
// the memory subsystem, cache and memory bandwidth are still shared, so a
// memory-bound variant can still be slowed by a neighbour and still show up in its
// CPU time as time spent running slowly rather than time spent waiting. That is why
// the CPU-time measurement keeps the control variant and still refuses to assert a
// number the control cannot support. The second clock raises the resolution; it does
// not license a conclusion on its own.
//
// The clock is RUSAGE_SELF, which sums user and system time over every thread in the
// process. That is the right total for this question: the cost being measured is
// work the process does, and Go's runtime threads doing that work on the process's
// behalf are part of it. A recording battle that allocates more also triggers more
// GC, and that GC is this process's CPU time, so the cost is attributed to the
// variant that caused it rather than hidden.

// cpuNow is the process's total CPU time consumed so far.
func cpuNow() time.Duration {
	var ru syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &ru); err != nil {
		return 0
	}
	return time.Duration(ru.Utime.Nano() + ru.Stime.Nano())
}

// cpuClockNames is what the measurement calls this clock when it reports a result,
// so that a number read out of the log cannot be mistaken for wall time.
const cpuClockNames = "CPU time (getrusage RUSAGE_SELF, user + system, all threads)"
