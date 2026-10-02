package replay

import (
	"os"
	"os/exec"
	"strconv"
	"testing"
)

// The environment a determinism re-entry reads.
//
// A test binary re-invoking itself is how this package varies Go's map hash seed,
// which is randomised per process and is therefore invisible to a test that only
// ever compares two recordings made inside one process. These three variables
// carry the one job and the two inputs the child needs, and nothing else: a child
// that could take arbitrary instructions would be a second copy of the test
// suite to keep in step with this one.
const (
	// replayChildEnv names the file the child writes its recording to. Its
	// presence is also what tells a child it is a child, so a child does not
	// recurse.
	replayChildEnv = "MB_REPLAY_CHILD_OUT"
	// replayChildSeedEnv is the seed the child records with.
	replayChildSeedEnv = "MB_REPLAY_CHILD_SEED"
	// replayChildUnitsEnv is how many units a side the child fields.
	replayChildUnitsEnv = "MB_REPLAY_CHILD_UNITS"
)

// childSeed reads the seed the parent asked for, defaulting to the one the
// in-process tests use.
func childSeed() uint64 {
	if v := os.Getenv(replayChildSeedEnv); v != "" {
		n, err := strconv.ParseUint(v, 10, 64)
		if err != nil {
			// A malformed instruction from the parent is the parent's bug, and
			// silently using a different seed would produce a child that recorded
			// the wrong battle and was then compared against the wrong run.
			panic("replay child: the seed in the environment is not a number: " + v)
		}
		return n
	}
	return 31337
}

// childUnits reads how many units a side the parent asked for.
func childUnits() int {
	if v := os.Getenv(replayChildUnitsEnv); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			panic("replay child: the unit count in the environment is not a number: " + v)
		}
		return n
	}
	return 24
}

// childBalancePath returns the balance file path the parent resolved, or the
// empty string to let the child find it itself.
//
// The parent passes its own resolved path rather than making the child walk up
// from its own working directory, because a child that found a DIFFERENT
// balance.toml would record a different battle and the comparison would be
// reporting a config mismatch as nondeterminism.
func childBalancePath() string {
	if balanceOnce.path != "" {
		return balanceOnce.path
	}
	path, err := findBalanceFile()
	if err != nil {
		return ""
	}
	return path
}

// execCommand builds a command for the subprocess test.
//
// It is a function rather than an inline exec.Command so that the re-entry test
// reads as one idea, and so that a test binary running under a wrapper has one
// place to change.
func execCommand(t testing.TB, name string, args ...string) *exec.Cmd {
	t.Helper()
	return exec.Command(name, args...)
}
