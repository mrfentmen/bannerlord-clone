// Package issue is the quest framework: the notable roster, the issues those
// people put their names to, and what serving or abandoning one is worth.
//
// The governing rule is the first line of QUESTS_AND_NOTABLES.md, and it is
// enforced by the shape of this package rather than by discipline. An issue is
// never written because a plot wanted it to exist. It is written because a
// trigger read out of another system's field is currently true: a larder with
// twelve days of food in it, a town whose crime has reached the level the
// hideout system treats as an active network, a road the security system rates
// unsafe. Take the hunger away and the offer has nothing to stand on, so it
// stops being generated; it does not sit in the log waiting for a player who
// never came.
//
// The four rules the whole package exists to serve:
//
//  1. Generation reads, it never asserts. Every issue carries the readings that
//     produced it in its read record, so the Why panel can answer "why is this
//     person asking me for grain" from the same rows that answer "why did the
//     town's food run low".
//  2. Acceptance and completion are orders, not calls. A player takes an issue
//     with OrderAcceptIssue and reports it finished with OrderCompleteIssue, and
//     both arrive as data through the same queue every other player action
//     uses. A scripted profile therefore exercises the identical path, and
//     there is no code in which one kind of taker is privileged.
//  3. A claim is checked. OrderCompleteIssue does not complete anything. The
//     system re-reads the world and asks whether the objective was actually
//     met, so a player cannot bank a reward for a delivery that never happened
//     and cannot avoid the consequences of one that did.
//  4. Success and failure are state changes. A served issue moves the notable's
//     opinion, the settlement's loyalty, and its finances. A lapsed one moves
//     them the other way, which is what gives ignoring a cost rather than
//     merely no benefit.
//
// Progress is measured against a baseline captured at acceptance rather than
// against the state at the moment of generation, because a request only means
// something relative to the situation it was made in. A larder that stood at
// three hundred and must now reach seven hundred is a request about four
// hundred; a larder that refilled itself while the party walked there has not
// been helped by anybody.
package issue

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the issue system.
func System() sim.System {
	return sim.System{
		Name: "issue",
		Doc:  "notables ask for help with what their settlement's state actually is, and pay or penalise what is done about it",
		Runs: run,
	}
}

// run is the tick, in the order the phases have to happen.
//
// The order within the tick is not a dependency between systems and does not
// change any result: every phase reads the state as it was when the tick began,
// because staged writes are not committed until the engine applies them. It is
// the order in which one tick's reasoning reads best.
//
//	orders      a player accepts or reports an issue, so an acceptance is
//	            already in hand for the measuring phase rather than a day late
//	roster      seats are filled and people retire, so a settlement that has
//	            just gained a workshop has a foreman before generation looks for
//	            somebody to ask
//	generate    new issues are written from the triggers
//	measure     accepted issues are measured against the world, and every issue
//	            that is over is closed out
func run(v *sim.View, w *sim.WriteSet) {
	// A completion order is only a claim if the order that carried it named the
	// ruler who actually took the request up. The set of claims that survived
	// that check is handed to the measuring phase rather than re-derived from
	// the queue, because re-deriving it would credit a claim that was refused.
	claimed := orders(v, w)
	roster(v, w)
	generate(v, w)
	measureAndClose(v, w, claimed)
}

// settlementStride separates village ids from town ids in the tally key. It is
// larger than any plausible settlement id, so a village 3 and a town 3 land in
// different buckets and the tally needs no second key type to tell a town's
// issue count from a village's.
const settlementStride = 1 << 20

// settlementKeyOf is the tally bucket for a settlement, given which of the two
// families it belongs to, or -1 when it is neither.
func settlementKeyOf(townID, villageID int) int {
	if townID >= 0 {
		return townID
	}
	if villageID >= 0 {
		return villageID + settlementStride
	}
	return -1
}

// tally walks the issue list once and counts what the caps need counted.
//
// Three phases need these two counts and each rebuilding them would walk the
// whole issue list again, on a list that grows with the world. The counts are
// derived from the issue list rather than kept on the notable, so a resolved or
// deleted request cannot leave a tally that only ever grows.
type tally struct {
	// openPerNotable counts every live issue a person has, offered or accepted
	// alike, because the cap in the design document is on outstanding requests
	// rather than on unanswered ones.
	openPerNotable map[int]int
	// livePerSettlement counts live issues per settlement key, which is what
	// bounds generation: a settlement already at its cap is not offered more.
	livePerSettlement map[int]int
}

func countLive(s *model.State) tally {
	t := tally{
		openPerNotable:    map[int]int{},
		livePerSettlement: map[int]int{},
	}
	for _, i := range s.LiveIssues() {
		t.openPerNotable[i.NotableID]++
		if key := settlementKeyOf(i.TownID, i.VillageID); key >= 0 {
			t.livePerSettlement[key]++
		}
	}
	return t
}

// describe renders an issue for a read record: its kind and its number. It is
// the one place that description is written, so a request reads the same in a
// cause row, in a log line, and in a report.
func describe(i *model.Issue) string {
	return kindName(i.Kind) + " #" + itoa(i.ID)
}

// kindName names an issue kind, falling back to something printable for a value
// outside the enum rather than indexing past the end of the table.
func kindName(k model.IssueKind) string {
	if int(k) < 0 || int(k) >= len(model.IssueKindNames) {
		return "issue"
	}
	return model.IssueKindNames[k]
}

// record offers a cause row's read text for a new request: the asker, what is
// at stake, the reading the trigger tested, and the threshold it was tested
// against.
//
// The reading and the threshold are both in there deliberately. A row saying
// only that somebody asked for grain answers nothing; a row saying the larder
// stood at nine days against a threshold of twelve answers the question the
// player actually has.
func record(kind model.IssueKind, notableID int, amount, reading, threshold float64) string {
	return shared.ReadString(
		shared.PairI("kind", int(kind)),
		shared.PairI("notable", notableID),
		shared.PairF("at_stake", amount),
		shared.PairF("reading", reading),
		shared.PairF("threshold", threshold),
	)
}

// whole renders a count for a step's text. The steps are prose a player reads
// in a quest log, so they are rounded to whole units rather than carrying four
// decimals of a ratio.
func whole(v float64) string {
	return itoa(int(v + 0.5))
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
