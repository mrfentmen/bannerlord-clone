package battleverify

import (
	"mbclone/simulation/internal/battle"
)

// THE RESULT HASH, AND WHOSE IT IS.
//
// The brief for this harness says the result hash should match the one agent2's
// determinism work publishes, and agent2 has now published it: battle.Result.Hash
// folds every unit's final gameplay state, the outcome, both sides' published
// totals, the event list, the label, and the config version into one uint64, and
// battle.Result.HashString renders it as sixteen lowercase hex digits.
//
// So this harness uses theirs and does not define a second hash. That is the whole
// point of matching: two packages that each reduce a battle to their own digest
// have two definitions of "the same battle", and the moment somebody compares a
// report written by one against a replay written by the other there is no
// authority to appeal to. There is one hash, it lives with the engine that
// produces the results, and this file is where that decision is written down.
//
// What adopting it buys, over anything this harness could have written itself:
//
//   - It covers the final state of every unit, not only the published totals. Two
//     runs can agree on the winner, the tick count, every casualty figure and every
//     event and still differ in one unit's position by a single bit. agent2's
//     StateHash is what catches that, and battle.Result cannot carry it, so no
//     harness outside the engine could have.
//   - It mixes floats as their exact bit patterns rather than as printed text. A
//     hash over rounded values would hide exactly the class of bug a hash is here
//     to catch.
//   - It comes with battle.ResultStateDiff, which names the field that parted when
//     two hashes disagree. A difference you can read beats a difference you can
//     only count.
//
// The limit is the engine's and is stated there: identical on one build on one
// platform, and not claimed across architectures or Go versions. This harness does
// not weaken it, and it does not claim anything stronger.
//
// One gap worth naming rather than papering over: agent2's hash folds the config
// version and the battle label, and therefore the scenario a run came from, but
// not the seed itself. Two different seeds that produced a genuinely identical
// battle would share a hash, which is defensible on its own terms (it is the same
// battle) but is worth knowing when reading a hash off a report: it identifies the
// fight, not the run. The report prints the seed next to it for that reason.
//
// To change the format, change battle.Result and its hash. Not this file.

// ResultHash is the fingerprint of a battle's outcome, as sixteen hex digits.
//
// It is a one-line wrapper rather than a call the callers make directly, so that
// every place in this harness that prints or compares a hash goes through one
// function. When the engine's hash changes shape, this is where the harness's
// naming, column width, and reporting follow.
func ResultHash(res *battle.Result) string {
	if res == nil {
		return "0000000000000000"
	}
	return res.HashString()
}

// hashPrefixLen is how much of a hash a table column shows.
//
// Sixteen hex digits is the whole hash, so nothing is truncated: the column is
// sized to it and the full value is in the block report above the table.
const hashPrefixLen = 16

// shortHash is the form a hash takes in the summary table.
func shortHash(h string) string {
	if len(h) <= hashPrefixLen {
		return h
	}
	return h[:hashPrefixLen]
}
