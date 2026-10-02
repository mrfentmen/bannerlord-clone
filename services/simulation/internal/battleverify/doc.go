// Package battleverify is the battle simulation's verification harness.
//
// It exists because "the battle ran fine" is not evidence. It runs scripted
// battles headlessly, prints a standard report for each, and asserts a fixed
// set of invariants against every one of them in code, so a claim about the
// simulation is a number somebody can check rather than an adjective somebody
// typed. CONSTITUTION.md section 7.3 is the rule this package exists to serve:
// nothing is logged as done unless it was verified.
//
// What it is not: a system. It writes no shared campaign state, reads no
// campaign system, and produces no cause rows, because it changes nothing in the
// world (CONSTITUTION.md section 2.2's obligation is on tracked writes). It
// imports the battle engine and the balance config and nothing else, so it adds
// no coupling between systems either (section 2.1).
//
// The three pieces:
//
//   - Probe (probe.go) is a read-only Commander attached to the engine's one
//     published per-tick channel. It checks every published tick and writes no
//     orders, so the battle it watches is the battle battle.Run produces.
//   - Verify (invariants.go) is the invariant set: no negative hit points, no
//     unit outside the battlefield, casualties that add up, a winner that is one
//     of the two sides or an explicit draw, and a tick count inside MaxTicks.
//     Each rule reports pass, fail, or "not checkable" with the reason. A rule
//     that cannot be checked says so; it does not report a pass.
//   - Report (report.go) is the standard printout and the summary table row,
//     including the result hash that makes two runs comparable.
//
// On the hash, and on what it is worth: ResultHash is SHA-256 over a canonical
// text rendering of the whole battle.Result, with the field order written down
// in hash.go and a version prefix so a future format can coexist with this one.
// It covers the outcome, not the tick-by-tick path: two battles that reached the
// same result by different rounds would share a hash. For the stronger claim,
// that a seed reproduces a fight tick for tick, internal/replay's byte-compare
// of its recorded frames is the instrument, and this hash is the compact form of
// the weaker one. Reproducibility holds on one build and one platform; it is not
// claimed across platforms, which is the same limit the OSS reference records.
//
// No number in this package is a balance constant. The harness reads every
// threshold it checks from the balance file through the config package, so
// CONSTITUTION.md section 1.2 holds for the harness as well as the engine.
package battleverify
