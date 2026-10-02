package battleverify

import (
	"fmt"
	"io"
	"strings"
	"time"

	"mbclone/simulation/internal/battle"
)

// Report is the standard printout of one battle, and the row it contributes to
// the suite's summary table.
//
// Every field on it is either a number the engine produced, a number the harness
// measured, or a name one of those two is. There is no field that is a summary of
// the others and no field that is a judgement: "winner" names a side and a
// reason, it does not say whether the battle was good.
type Report struct {
	// Scenario and Line name the scenario and say what it is for.
	Scenario string
	Line     string

	// Seed and Scale are what the run was asked for, and BalancePath and
	// ConfigVersion are the constants it ran under. A report without the constants
	// is a report about an unnamed battle.
	Seed          uint64
	Scale         float64
	BalancePath   string
	ConfigVersion string

	// Setup is the battle as it was handed to the engine, and Units, Bodies, and
	// TroopsPerUnit are what went into it.
	Setup         battle.Setup
	Units         [2]int
	Bodies        [2]float64
	TroopsPerUnit [2]float64

	// TickSeconds, MaxTicks, MaxUnitsPerSide, and MaxStep are the balance
	// constants the report's timings and bounds are read against.
	TickSeconds     float64
	MaxTicks        float64
	MaxUnitsPerSide float64
	MaxStep         float64

	// Result is the engine's own outcome.
	Result *battle.Result

	// Wall is the wall time of the run through the probe, and WallPlain the wall
	// time of the same setup and seed without it. Both are reported because the
	// difference between them is the price of the verification, and a harness that
	// does not say what it costs is asking to be trusted for free.
	Wall      time.Duration
	WallPlain time.Duration

	// Hash and PlainHash are the two runs' result hashes.
	Hash      string
	PlainHash string

	// Sides is each side's report row data, indexed A then B.
	Sides [2]SideReport

	// Winner, HowDecided, and Decided carry the answer the brief asks for: who won
	// and what ended it.
	Winner     string
	HowDecided string
	Decided    bool

	// Probe carries what the per-tick observer saw, and is nil for a run made
	// without one.
	Probe *Probe

	// Findings is every rule's result for this run.
	Findings *Findings
}

// SideReport is one side's line of a battle report.
type SideReport struct {
	// StartUnits and StartBodies are what the side brought on.
	StartUnits  int
	StartBodies float64
	// Dead and Wounded are what it lost. Wounded men are out of this battle and
	// not dead, which is why the two are reported separately rather than as one
	// casualty figure: three hundred casualties of whom two hundred come back is
	// a different political fact from three hundred dead.
	Dead, Wounded float64
	// OffFieldBodies is how many of the living are out of the fight because they
	// ran or gave themselves up. They are alive and they are not fighting, which
	// is a third number and not a rounding of either of the others.
	OffFieldBodies float64
	// AliveUnits is how many units were still fighting when the battle ended,
	// broken included, and AliveBodies is how many bodies those units stood for.
	// AliveBodies is the "start = alive + dead" answer. It is a float because a
	// body's share of a destroyed unit is split by battle.dead_share, so the
	// survivors' share of the arithmetic is not always a whole number.
	AliveUnits       int
	AliveBodies      float64
	Broken           int
	Routed           int
	SurrenderedUnits int
	DestroyedUnits   int

	StrengthStart, StrengthEnd float64
	// SetupMorale is the force's own mean starting morale, measured from the units
	// that were handed to the engine. It is reported next to MoraleStart because the
	// engine's MoraleStart field is the CONFIGURED mean from the balance file, not
	// what this force actually started at, and a report that printed only the
	// configured mean would claim a shaken side arrived steady.
	SetupMorale               float64
	MoraleStart, MoraleEnd    float64
	Shots, RangedHits          float64
	Swings, MeleeHits          float64
	AmmoSpent                  float64
	SuppressionDealt           float64
	SuppressionTaken           float64
	Inflicted                  float64
	Leaders                    int
}

// howDecided names the condition that ended a battle, in the words a reader of a
// battle report wants: what happened, not which enum value was set.
func howDecided(r battle.Reason) string {
	switch r {
	case battle.ReasonEnemyDestroyed:
		return "annihilation"
	case battle.ReasonEnemyBroke:
		return "rout"
	case battle.ReasonMutualCollapse:
		return "mutual annihilation"
	case battle.ReasonMutualBreak:
		return "mutual rout"
	case battle.ReasonStalemate:
		return "tick limit"
	default:
		return "unknown"
	}
}

// labelWidth is the width of the key column in the block report, so that a block
// reads as aligned fields rather than as a list.
const labelWidth = 15

// Write prints the standard report for one battle.
//
// It leads with the answer, then the identity of the run, then the numbers that
// explain the answer, then the checks. That order is deliberate: a reader who only
// reads the first two lines should still know who won and what it cost, and a
// reader who wants to disbelieve it should find everything they need in one block
// rather than having to go and find it.
func (r *Report) Write(w io.Writer) {
	row := func(key, format string, args ...any) {
		fmt.Fprintf(w, "%-*s %s\n", labelWidth, key, fmt.Sprintf(format, args...))
	}

	fmt.Fprintf(w, "-------------------------------------------------------------------------------\n")
	fmt.Fprintf(w, "%s\n", r.Scenario)
	if r.Line != "" {
		fmt.Fprintf(w, "%s\n", r.Line)
	}
	fmt.Fprintf(w, "-------------------------------------------------------------------------------\n")

	row("battle", "seed %d | config %s | balance %s", r.Seed, r.ConfigVersion, r.BalancePath)
	row("constants", "%g s per tick, %g max ticks, %g max units a side, %g m max step a tick",
		r.TickSeconds, r.MaxTicks, r.MaxUnitsPerSide, r.MaxStep)
	row("stages", "%s", strings.Join(r.Result.TickOrder, " -> "))
	row("setup", "side A %d units / %.0f bodies (%.0f per unit), side B %d units / %.0f bodies (%.0f per unit)",
		r.Units[0], r.Bodies[0], r.TroopsPerUnit[0],
		r.Units[1], r.Bodies[1], r.TroopsPerUnit[1])
	row("result hash", "%s (battle.Result.Hash, agent2's format)", r.Hash)
	if r.PlainHash != "" {
		if r.PlainHash == r.Hash {
			row("repeat", "the uncommanded run of the same setup and seed produced the same hash")
		} else {
			row("repeat", "UNCOMMANDED RUN DISAGREED: %s", r.PlainHash)
		}
	} else {
		row("repeat", "not run")
	}
	row("wall time", "%s through the probe, %s without it", roundMS(r.Wall), roundMS(r.WallPlain))
	row("ticks", "%d of %g max (%.1f s simulated, %.1f%% of the bound)",
		r.Result.Ticks, r.MaxTicks, r.Result.Elapsed,
		share(float64(r.Result.Ticks), r.MaxTicks))
	row("throughput", "%.0f unit-ticks/s through the probe, %.0f without",
		float64(r.Result.Ticks*totalUnits(r.Units))/wallSeconds(r.Wall),
		float64(r.Result.Ticks*totalUnits(r.Units))/wallSeconds(r.WallPlain))
	winner := r.Winner
	if !r.Decided {
		winner += " (undecided)"
	}
	row("winner", "%s, by %s", winner, r.HowDecided)

	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		i := sideIndex(side)
		sr := r.Sides[i]
		fmt.Fprintf(w, "\nside %s\n", side)
		fmt.Fprintf(w, "  units    %d started | %d alive (%d broken) | %d routed | %d surrendered | %d destroyed\n",
			sr.StartUnits, sr.AliveUnits, sr.Broken, sr.Routed, sr.SurrenderedUnits, sr.DestroyedUnits)
		fmt.Fprintf(w, "  bodies   %.0f started | %.0f alive | %.0f dead | %.0f wounded | %.0f off-field alive\n",
			sr.StartBodies, sr.AliveBodies, sr.Dead, sr.Wounded, sr.OffFieldBodies)
		fmt.Fprintf(w, "           %.0f casualties of %.0f (%.1f%%), %.0f inflicted on the other side\n",
			sr.Dead+sr.Wounded, sr.StartBodies, share(sr.Dead+sr.Wounded, sr.StartBodies), sr.Inflicted)
		fmt.Fprintf(w, "  strength %.0f -> %.0f (%.1f%% of opening), morale %.3f -> %.3f (configured start "+
			"mean %.3f), leaders on field %d\n",
			sr.StrengthStart, sr.StrengthEnd, share(sr.StrengthEnd, sr.StrengthStart),
			sr.SetupMorale, sr.MoraleEnd, sr.MoraleStart, sr.Leaders)
		fmt.Fprintf(w, "  fire     %.0f shots (%.0f hit), %.0f swings (%.0f hit), %.0f rounds spent, "+
			"suppression dealt %.0f standing under %.0f\n",
			sr.Shots, sr.RangedHits, sr.Swings, sr.MeleeHits, sr.AmmoSpent, sr.SuppressionDealt, sr.SuppressionTaken)
	}

	r.writeMorale(w)
	r.writeProbe(w)
	r.writeChecks(w)
}

// writeMorale prints the morale and event line.
func (r *Report) writeMorale(w io.Writer) {
	res := r.Result
	fmt.Fprintf(w, "\nmorale    %d breaks, %d routs, peaks of %d broken and %d routed at once, peak suppression %.2f\n",
		res.Stats.Breaks, res.Stats.Routs, res.Stats.PeakBroken, res.Stats.PeakRouted, res.Stats.PeakSuppression)
	note := ""
	if res.EventsDropped > 0 {
		note = fmt.Sprintf(" (%d further events were dropped at the engine's event bound)", res.EventsDropped)
	}
	fmt.Fprintf(w, "events    %d kept%s\n", len(res.Events), note)
	for _, e := range []struct {
		kind  battle.EventKind
		label string
	}{
		{battle.EventBroken, "first break"},
		{battle.EventRouted, "first rout"},
		{battle.EventSurrendered, "first surrender"},
	} {
		if first, _, ok := res.FirstLast(e.kind); ok {
			fmt.Fprintf(w, "          %-14s tick %d of %d (%.1f%% through): %s\n",
				e.label, first.Tick, res.Ticks, share(float64(first.Tick), float64(res.Ticks)), first.Note)
		}
	}
}

// writeProbe prints what the per-tick observer saw, against the bounds it checked.
func (r *Report) writeProbe(w io.Writer) {
	if r.Probe == nil {
		fmt.Fprintf(w, "\nprobe     none: this run's per-tick invariants were not checkable\n")
		return
	}
	p := r.Probe
	fmt.Fprintf(w, "\nprobe     %d published ticks checked over %d units; furthest seen %.1f m on x and "+
		"%.1f m on y; largest one-tick step %.2f m of the %g m limit\n",
		p.ticks, p.units, p.maxAbsX, p.maxAbsY, p.maxStepSeen, p.stepLimit)
	fmt.Fprintf(w, "          envelope after %d ticks: %.0f m on x, %.0f m on y\n",
		p.ticks, p.bounds.X(p.ticks), p.bounds.Y(p.ticks))
}

// writeChecks prints every rule and what it found.
//
// A skipped rule prints its reason. That is the whole point of printing the
// reason: a rule that did not run is a hole in the evidence, and a hole that
// prints as a pass is worse than no harness at all.
func (r *Report) writeChecks(w io.Writer) {
	if r.Findings == nil {
		fmt.Fprintf(w, "\nchecks    none were run\n")
		return
	}
	pass, fail, skip := r.Findings.Counts()
	fmt.Fprintf(w, "\nchecks    %d rules: %d pass, %d FAIL, %d not checkable\n", len(r.Findings.Checks), pass, fail, skip)
	for _, c := range r.Findings.Checks {
		fmt.Fprintf(w, "  %-8s %-22s %s\n", strings.ToUpper(c.Status.String()), c.Rule, c.Note)
		for _, v := range c.Violations {
			fmt.Fprintf(w, "           %s\n", v)
		}
	}
	if missing := r.Findings.Unchecked(); len(missing) > 0 {
		fmt.Fprintf(w, "  WARNING  rules were never reported at all: %s\n", strings.Join(missing, ", "))
	}
}

// tableHeaders are the summary table's columns.
//
// The columns are the brief's list, in the brief's order: seed, the config's unit
// counts, ticks, wall time, alive counts, casualties, routs, the winner and how
// it was decided, and the hash. Alive, casualties, and routs are one column per
// side pair rather than six columns, because a reader comparing two sides is
// reading them against each other.
var tableHeaders = []string{
	"scenario", "seed", "units A/B", "ticks", "wall", "alive A/B", "casualties A/B",
	"routs A/B", "winner", "decided by", "hash", "checks",
}

// TableRow returns this report's columns for the summary table.
func (r *Report) TableRow() []string {
	pass, fail, skip := r.Findings.Counts()
	status := fmt.Sprintf("%d/%d ok", pass, len(r.Findings.Checks))
	if fail > 0 {
		status = fmt.Sprintf("%d FAIL", fail)
	}
	if skip > 0 {
		status += fmt.Sprintf(", %d n/c", skip)
	}
	return []string{
		r.Scenario,
		fmt.Sprint(r.Seed),
		fmt.Sprintf("%d/%d", r.Units[0], r.Units[1]),
		fmt.Sprintf("%d", r.Result.Ticks),
		roundMS(r.Wall).String(),
		fmt.Sprintf("%.0f/%.0f", r.Sides[0].AliveBodies, r.Sides[1].AliveBodies),
		fmt.Sprintf("%.0f/%.0f", r.Sides[0].Dead+r.Sides[0].Wounded, r.Sides[1].Dead+r.Sides[1].Wounded),
		fmt.Sprintf("%d/%d", r.Sides[0].Routed, r.Sides[1].Routed),
		r.Winner,
		r.HowDecided,
		shortHash(r.Hash),
		status,
	}
}

// WriteSummaryTable prints the suite's summary table.
func WriteSummaryTable(w io.Writer, reports []*Report) {
	rows := make([][]string, 0, len(reports)+1)
	rows = append(rows, tableHeaders)
	for _, r := range reports {
		rows = append(rows, r.TableRow())
	}
	widths := make([]int, len(tableHeaders))
	for _, row := range rows {
		for i, cell := range row {
			if i < len(widths) && len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}
	writeRow := func(cells []string) {
		var sb strings.Builder
		for i, cell := range cells {
			if i > 0 {
				sb.WriteString("  ")
			}
			sb.WriteString(cell)
			if i < len(cells)-1 {
				sb.WriteString(strings.Repeat(" ", widths[i]-len(cell)))
			}
		}
		fmt.Fprintln(w, strings.TrimRight(sb.String(), " "))
	}
	for _, row := range rows {
		writeRow(row)
	}
}

// WriteViolations prints every violation in a suite, so a failure says what was
// wrong rather than only that something was.
func WriteViolations(w io.Writer, runs []*Run) {
	any := false
	for _, run := range runs {
		if run.Findings == nil || !run.Findings.Failed() {
			continue
		}
		any = true
		fmt.Fprintf(w, "\n%s (seed %d):\n", run.Scenario.Name, run.Seed)
		for _, v := range run.Findings.Violations() {
			fmt.Fprintf(w, "  %s\n", v)
		}
	}
	if !any {
		fmt.Fprintf(w, "no violations\n")
	}
}

// roundMS is wall time at millisecond resolution, which is the resolution a
// battle takes long enough to measure at and short enough to read.
func roundMS(d time.Duration) time.Duration {
	if d < 0 {
		return 0
	}
	return d.Round(time.Millisecond)
}

// wallSeconds is a duration in seconds, guarded so a zero wall clock cannot make a
// throughput figure infinite.
func wallSeconds(d time.Duration) float64 {
	s := d.Seconds()
	if s <= 0 {
		return 1e-9
	}
	return s
}

// share is part of total as a percentage, guarding a zero denominator.
func share(part, total float64) float64 {
	if total <= 0 {
		return 0
	}
	return part / total * 100
}

// totalUnits is the number of units in a battle.
func totalUnits(units [2]int) int { return units[0] + units[1] }
