package battle

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mbclone/simulation/internal/config"
)

// THE RECORDED BATTLE ON DISK.
//
// An order log is enough to replay a battle and not enough to know whether the
// battle it replays is the one that happened. Replay needs the Setup, and the
// Setup is not in the log (see Recording). It needs the balance version, which is
// in the log's header. And to answer the only question anybody asks of a
// recorded battle, "was it the same battle", it needs the original result, which
// is nowhere in the log by construction: the log is the input, the result is
// the output, and a record that kept the output would be able to prove anything.
//
// So a battle is recorded as a DIRECTORY holding two files:
//
//	<id>/battle.json    who fought, under what seed, with which rosters, and
//	                    what came out. Readable, diffable, small.
//	<id>/order.log      the order log, byte for byte as battle.OrderLog.Encode
//	                    wrote it. Never re-encoded, never summarised.
//
// Two files rather than one because the order log already has its own format
// version, its own row digest, and its own strict decoder, and re-serialising it
// into a larger document would mean a second encoder to keep in step with the
// first. The log file here IS the log file: ReadBattle copies the bytes out
// unchanged and hands them to battle.DecodeOrderLog, which is the same function
// that verifies a log pasted into a bug report. A second decoder that agreed
// with the first on every file except the ones that mattered would be worse than
// no second decoder at all.
//
// # WHAT A RECORD IS NOT
//
// A record describes a battle whose forces were GENERATED from a seed and a
// roster. It does not describe a battle whose forces a caller wrote out by hand
// as literal units, because there is no honest way to put that back in a file
// without either inventing a schema for every field of battle.Unit (which would
// need a format version the day a unit gained a field) or guessing at somebody
// else's data. SaveBattle refuses rather than storing a record that cannot be
// replayed, and says so. A hand-assembled battle is still recorded and still
// replayable, in memory, through battle.Record and battle.Verify; what it does
// not get is a file.
//
// # WHY THE ROSTER IS IN THE FILE AND NOT JUST THE SEED
//
// The seed rebuilds a force only if you also say what kind of force it was: how
// many units a side, how many bodies to a unit, and how far its skill and morale
// are shifted from the balance file's averages. The roster spec is that answer,
// and scriptRoster is already the on-disk spelling of it, so it is used as-is
// rather than restated under a second set of field names that could disagree
// with the first. The roster the record rebuilds is then CHECKED against the one
// the log was recorded against, by Replay's roster fingerprint, so a record
// edited to field a different army is refused at replay time instead of quietly
// applying the orders to different men.

// BattleRecordKind is the kind field of a recorded battle.
const BattleRecordKind = "battle_record"

// BattleRecordVersion is the format version written into battle.json. It is
// bumped when the record layout changes, and ReadBattle refuses a version it
// does not know for the same reason battle.DecodeOrderLog refuses one: a record
// read with the wrong layout is a record that reports a confidently wrong
// answer.
const BattleRecordVersion = 1

// The two file names inside a record directory. They are constants rather than
// fields a caller can set because a record whose log lives somewhere the record
// does not name is a record that cannot be trusted to name its own inputs.
const (
	recordIndexFile = "battle.json"
	recordLogFile   = "order.log"
)

// recordFile is a recorded battle as it sits on disk.
type recordFile struct {
	Kind          string `json:"kind"`
	Version       int    `json:"version"`
	ID            string `json:"id"`
	Seed          uint64 `json:"seed"`
	ConfigVersion string `json:"config_version"`
	Label         string `json:"label,omitempty"`
	// A and B are the two forces, in the same spelling an order script uses. See
	// scriptRoster for why the fields are named the way a person types them.
	A scriptRoster `json:"a"`
	B scriptRoster `json:"b"`
	// Log describes the order log sitting beside this file. The counts and hashes
	// are repeated from the log's own header so that a reader can see a record and
	// its log disagree without having to parse the log to find out; ReadBattle
	// checks that they do agree.
	Log recordLogRef `json:"order_log"`
	// Original is the result of the battle that was recorded. It is what the
	// replay is compared against, and it is a summary rather than a whole Result
	// because a Result carries every event of a five-hundred-unit battle and the
	// answer to "was it the same battle" is the result hash.
	Original RecordSummary `json:"original"`
}

// recordLogRef is what battle.json says about the order log beside it.
type recordLogRef struct {
	File       string `json:"file"`
	Rows       int    `json:"rows"`
	OrderHash  string `json:"order_hash"`
	RosterHash string `json:"roster_hash"`
	Truncated  bool   `json:"truncated"`
}

// RecordSummary is what a finished battle left behind.
//
// It is the half of a Result a person reads: who won, how long it took, and what
// each side lost. Every field here is also folded into Result.Hash, so a replay
// whose summary differs has a different hash and a summary that agrees is
// consistent with a matching one, though not proof of it (the hash also covers
// every unit's final position and the event list, which this does not).
type RecordSummary struct {
	ResultHash string `json:"result_hash"`
	StateHash  string `json:"state_hash"`
	Label      string `json:"label"`
	Outcome    string `json:"outcome"`
	Reason     string `json:"reason"`
	Ticks      int    `json:"ticks"`
	Elapsed    string `json:"elapsed"`
	Truncated  bool   `json:"truncated"`
	Events     int    `json:"events"`
	// EventsDropped is how many notable things the record did NOT keep, because the
	// event list reached its bound. It is here rather than folded into Events
	// because Result.Hash covers both separately, so a record carrying only the
	// kept count would describe a battle whose hash it cannot produce.
	EventsDropped int           `json:"events_dropped"`
	Sides         [2]RecordSide `json:"sides"`
}

// RecordSide is one side's half of a summary.
type RecordSide struct {
	Side                string  `json:"side"`
	StartUnits          int     `json:"start_units"`
	StartBodies         float64 `json:"start_bodies"`
	Dead                float64 `json:"dead"`
	Wounded             float64 `json:"wounded"`
	Surrendered         int     `json:"surrendered"`
	SurrenderedBodies   float64 `json:"surrendered_bodies"`
	Standing            int     `json:"standing"`
	Broken              int     `json:"broken"`
	Routed              int     `json:"routed"`
	CasualtiesInflicted float64 `json:"casualties_inflicted"`
	Shots               float64 `json:"shots"`
	Swings              float64 `json:"swings"`
	RangedHits          float64 `json:"ranged_hits"`
	MeleeHits           float64 `json:"melee_hits"`
}

// SummariseResult reads a Result down to the numbers a report shows.
//
// It takes a finished Result rather than reading one out of a battle, so it can
// be applied to either side of a comparison and to a result read back from a
// file, which is what makes the comparison in VerifyRecordedBattle symmetric.
func SummariseResult(r *Result) RecordSummary {
	if r == nil {
		return RecordSummary{Outcome: "none", Reason: "no result was given"}
	}
	s := RecordSummary{
		ResultHash:    r.HashString(),
		StateHash:     hashHex(r.StateHash),
		Label:         r.Label,
		Outcome:       r.Outcome.Kind.String(),
		Reason:        r.Outcome.Reason.String(),
		Ticks:         r.Ticks,
		Elapsed:       r.ElapsedS,
		Truncated:     r.Truncated,
		Events:        len(r.Events),
		EventsDropped: r.EventsDropped,
	}
	for i := range r.Sides {
		v := &r.Sides[i]
		s.Sides[i] = RecordSide{
			Side:                v.Side.String(),
			StartUnits:          v.StartUnits,
			StartBodies:         v.StartBodies,
			Dead:                v.Dead,
			Wounded:             v.Wounded,
			Surrendered:         v.Surrendered,
			SurrenderedBodies:   v.SurrenderedBodies,
			Standing:            v.Standing,
			Broken:              v.Broken,
			Routed:              v.Routed,
			CasualtiesInflicted: v.CasualtiesInflicted,
			Shots:               v.Shots,
			Swings:              v.Swings,
			RangedHits:          v.RangedHits,
			MeleeHits:           v.MeleeHits,
		}
	}
	return s
}

// Diff names the first way two summaries disagree, or returns "" when they agree.
//
// It is the debugging half of a replay verdict, and it walks the fields in the
// order a reader cares about: who won, then how many died, then everything else.
// A verdict that said only "the hashes differ" would make the reader re-run the
// battle with a debugger open; this one says which number moved.
func (s RecordSummary) Diff(o RecordSummary) string {
	switch {
	case s.Outcome != o.Outcome:
		return fmt.Sprintf("outcome %s, recorded %s", s.Outcome, o.Outcome)
	case s.Reason != o.Reason:
		return fmt.Sprintf("reason %q, recorded %q", s.Reason, o.Reason)
	case s.Ticks != o.Ticks:
		return fmt.Sprintf("ticks %d, recorded %d", s.Ticks, o.Ticks)
	case s.Elapsed != o.Elapsed:
		return fmt.Sprintf("elapsed %s, recorded %s", s.Elapsed, o.Elapsed)
	case s.Events != o.Events:
		return fmt.Sprintf("%d events, recorded %d", s.Events, o.Events)
	case s.EventsDropped != o.EventsDropped:
		return fmt.Sprintf("%d events dropped, recorded %d", s.EventsDropped, o.EventsDropped)
	case s.Truncated != o.Truncated:
		return fmt.Sprintf("truncated %v, recorded %v", s.Truncated, o.Truncated)
	}
	for i := range s.Sides {
		side := s.Sides[i].Side
		a, b := s.Sides[i], o.Sides[i]
		switch {
		case a.Dead != b.Dead:
			return fmt.Sprintf("side %s dead %.1f, recorded %.1f", side, a.Dead, b.Dead)
		case a.Wounded != b.Wounded:
			return fmt.Sprintf("side %s wounded %.1f, recorded %.1f", side, a.Wounded, b.Wounded)
		case a.Surrendered != b.Surrendered:
			return fmt.Sprintf("side %s surrendered %d units, recorded %d", side, a.Surrendered, b.Surrendered)
		case a.SurrenderedBodies != b.SurrenderedBodies:
			return fmt.Sprintf("side %s surrendered %.1f bodies, recorded %.1f", side, a.SurrenderedBodies, b.SurrenderedBodies)
		case a.CasualtiesInflicted != b.CasualtiesInflicted:
			return fmt.Sprintf("side %s inflicted %.1f, recorded %.1f", side, a.CasualtiesInflicted, b.CasualtiesInflicted)
		case a.StartBodies != b.StartBodies:
			return fmt.Sprintf("side %s started with %.1f bodies, recorded %.1f", side, a.StartBodies, b.StartBodies)
		case a.StartUnits != b.StartUnits:
			return fmt.Sprintf("side %s started with %d units, recorded %d", side, a.StartUnits, b.StartUnits)
		case a.Standing != b.Standing:
			return fmt.Sprintf("side %s standing %d, recorded %d", side, a.Standing, b.Standing)
		case a.Broken != b.Broken:
			return fmt.Sprintf("side %s broken %d, recorded %d", side, a.Broken, b.Broken)
		case a.Routed != b.Routed:
			return fmt.Sprintf("side %s routed %d, recorded %d", side, a.Routed, b.Routed)
		case a.Shots != b.Shots:
			return fmt.Sprintf("side %s fired %.1f rounds, recorded %.1f", side, a.Shots, b.Shots)
		case a.Swings != b.Swings:
			return fmt.Sprintf("side %s swung %.1f times, recorded %.1f", side, a.Swings, b.Swings)
		case a.RangedHits != b.RangedHits:
			return fmt.Sprintf("side %s hit %.1f shots, recorded %.1f", side, a.RangedHits, b.RangedHits)
		case a.MeleeHits != b.MeleeHits:
			return fmt.Sprintf("side %s landed %.1f melee, recorded %.1f", side, a.MeleeHits, b.MeleeHits)
		}
	}
	if s.ResultHash != o.ResultHash {
		// Every number above agrees and the hashes do not. That is not a failure of
		// this function: it means the units finished somewhere else, or the event
		// list differed, and neither is a field here.
		return "every number here agrees; the units or the events differ"
	}
	return ""
}

// Format renders a summary as the two lines of figures a report shows.
func (s RecordSummary) Format() string {
	var b strings.Builder
	fmt.Fprintf(&b, "  %-4s %8s %8s %9s %12s %8s %7s %7s %11s\n",
		"side", "units", "bodies", "dead", "wounded", "surrend", "stand", "rout", "inflicted")
	for _, v := range s.Sides {
		fmt.Fprintf(&b, "  %-4s %8d %8.1f %9.1f %12.1f %8d %7d %7d %11.1f\n",
			v.Side, v.StartUnits, v.StartBodies, v.Dead, v.Wounded,
			v.Surrendered, v.Standing, v.Routed, v.CasualtiesInflicted)
	}
	return b.String()
}

// BattleRecord is a recorded battle read back off disk.
//
// It holds everything the record file names and nothing it does not: the rosters
// as the engine's Roster, the log as a decoded OrderLog, and the original result
// as a summary. Building a Setup from it is a separate, explicit step
// (Setup), because building one reads the balance file and that is a caller's
// decision about which constants to trust, not something a struct can do.
type BattleRecord struct {
	// ID is the battle id, which is also the directory name.
	ID string
	// Seed and ConfigVersion are what the battle ran under, taken from the record
	// rather than from the caller. A record that could be paired with the wrong
	// seed is the easiest way to get a replay that reproduces the wrong battle.
	Seed          uint64
	ConfigVersion string
	// A and B are the two forces as the engine spells them.
	A, B Roster
	// Label is the battle's name, carried because Result.Hash folds it: a record
	// that dropped it would replay to a different hash while every number in the
	// report matched.
	Label string
	// Original is the result the record was written with.
	Original RecordSummary
	// Log is the decoded order log.
	Log *OrderLog
	// LogBytes is the order log exactly as it sat in the file, kept so a caller
	// can hand the original bytes to something else without re-encoding.
	LogBytes []byte
}

// Script rebuilds the order script this battle was fought from.
//
// The record's rosters and seed ARE a script with no steps, which is the whole
// reason a record needs no setup format of its own: the script format already
// describes a battle and its forces, and it describes them the same way. The
// label goes in as the script's name, which is where script.label() reads it
// from when neither side carries one of its own.
func (b *BattleRecord) Script() *Script {
	return &Script{
		Name: b.Label,
		Seed: b.Seed,
		A:    scriptWithRoster(b.A, "", ""),
		B:    scriptWithRoster(b.B, "", ""),
	}
}

// Setup rebuilds the battle's forces from the record's seed and rosters.
//
// It is the record's version of battle.Script.Setup, and it goes through exactly
// the same generator, so a record and the script it came from build the same
// Setup. That is not a convenience: battle.Replay refuses a log whose roster
// fingerprint does not match the setup given to it, so if this built the forces
// any other way the replay would be refused for a reason that has nothing to do
// with determinism.
func (b *BattleRecord) Setup(cfg *config.Config) (Setup, error) {
	return b.Script().Setup(cfg)
}

// SaveBattle writes the record of a finished battle into dir.
//
// It takes the two rosters rather than a Setup, and that is the one thing it
// insists on knowing. A Setup holds literal units and this function cannot
// invert it: there is no way to tell, from a Setup, whether it came from
// GenerateForce or from a caller who wrote every field by hand, and a record
// that guessed would replay onto a force nobody fought. Passing the roster is
// saying "this battle's forces were generated, here is how", which is the only
// claim this file format can make honestly.
//
// The two files are written with plain writes rather than write-to-temp-and-
// rename. That is safe because both readers refuse an incomplete file: the order
// log's header carries a row count and a digest and battle.DecodeOrderLog
// checks both, and battle.json is not JSON at all if it stops halfway. A
// half-written record is refused rather than half-read, which is the property
// that matters.
//
// # AN ID IS A PROMISE THAT IT MEANS ONE BATTLE, AND IT IS NOW ENFORCED
//
// Saving the same battle twice over the same directory is an update, and always
// was: re-recording is idempotent, and the record on disk is unchanged. Saving a
// DIFFERENT battle over an id that already holds a record is refused, and was not
// until this. Both halves are decided by comparing the bytes that are already
// there, so the rule is "this id already describes that battle" rather than a
// guess about which battle anybody meant.
//
// What it was instead was os.MkdirAll on a directory that exists followed by two
// os.WriteFile calls, which is a silent replacement of both files. Two servers
// sharing one record directory reach it with no bug at all, and the concrete case
// is the shipped one: battleapi.Server numbers its battles from a field on the
// struct, so a restarted server deals btl-1 again — and the second battle's save
// destroys the first battle's after-action report.
//
// Nothing detects that from the outside. The replacement record is internally
// consistent and describes exactly the battle it was written from, so
// `simrun replay --battle btl-1` prints MATCHED. The id a client was told, the
// report a player kept, and the numbers in the file all agree with each other and
// all describe the wrong fight. Refusing is the only honest answer, and the
// refusal names both seeds so an operator can tell the two battles apart.
func SaveBattle(dir, id string, a, b Roster, res *Result, rec *Recording) error {
	if err := validBattleID(id); err != nil {
		return err
	}
	if res == nil {
		return fmt.Errorf("battle: SaveBattle needs the result of the battle it is recording; a record with " +
			"no result could not be replayed and compared against anything")
	}
	if rec == nil || rec.Log == nil {
		return fmt.Errorf("battle: SaveBattle needs the recording whose order log it is saving; the log is " +
			"the battle's input and there is no way to re-derive it")
	}
	if rec.Log.Truncated() {
		// A log that refused rows does not describe its battle, and battle.NewReplayer
		// refuses to run one. Saving it would produce a record that is refused on
		// every replay, which is a worse outcome than being told now. The kind is the
		// same one NewReplayer uses for this, so a caller that has to branch on it
		// does not have to learn a second code for the same finding.
		return fmt.Errorf("battle: this battle's order log refused %d rows, so it is not a complete record "+
			"of its battle and saving it would produce a record that can never be replayed; raise the log "+
			"bound and fight it again", rec.Log.Refused())
	}
	logBytes, err := rec.Log.Encode(rec.Seed, rec.ConfigVersion)
	if err != nil {
		return err
	}
	idx := recordFile{
		Kind:          BattleRecordKind,
		Version:       BattleRecordVersion,
		ID:            id,
		Seed:          rec.Seed,
		ConfigVersion: rec.ConfigVersion,
		Label:         res.Label,
		A:             scriptWithRoster(a, "", ""),
		B:             scriptWithRoster(b, "", ""),
		Log: recordLogRef{
			File:       recordLogFile,
			Rows:       rec.Log.Len(),
			OrderHash:  hashHex(rec.Log.Hash()),
			RosterHash: hashHex(rec.Log.RosterHash()),
		},
		Original: SummariseResult(res),
	}
	blob, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return fmt.Errorf("battle: encoding the battle record failed: %w", err)
	}
	blob = append(blob, '\n')

	// What is already there decides this, if anything is.
	//
	// An index file that cannot be read is not a record: it is either nothing or a
	// write that stopped halfway, and in both cases there is no battle here to
	// protect, so the write goes ahead. A readable one is a record, and both its
	// files are compared — the index alone carries the log's row count and order
	// hash, which is enough to tell two order logs apart, and reading the log too
	// means the comparison does not depend on that being true.
	if err := checkNotADifferentBattle(dir, id, blob, logBytes, rec.Seed, res.Label); err != nil {
		return err
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("battle: making the record directory failed: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, recordLogFile), logBytes, 0o644); err != nil {
		return fmt.Errorf("battle: writing the order log failed: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, recordIndexFile), blob, 0o644); err != nil {
		return fmt.Errorf("battle: writing the battle record failed: %w", err)
	}
	return nil
}

// checkNotADifferentBattle refuses to let one battle id hold two battles' records,
// and says nothing when it already holds exactly this one.
//
// It is a separate function because it is the only part of SaveBattle that READS,
// and a save that reads first is worth being able to reason about on its own. The
// seed and label arrive as arguments rather than being decoded back out of blob,
// because this package deliberately keeps no decoded record around to compare
// against, and a refusal that names both battles is worth one unmarshal on the
// failure path.
func checkNotADifferentBattle(dir, id string, blob, logBytes []byte, seed uint64, label string) error {
	prev, err := os.ReadFile(filepath.Join(dir, recordIndexFile))
	if err != nil {
		// Nothing there, or something that is not a readable index. Both cases mean
		// there is no record to destroy, and neither is a reason to refuse a save.
		return nil
	}
	prevLog, err := os.ReadFile(filepath.Join(dir, recordLogFile))
	if err != nil {
		prevLog = nil
	}
	if bytes.Equal(prev, blob) && bytes.Equal(prevLog, logBytes) {
		// The same battle, recorded again. Leaving the files alone is what makes a
		// re-record idempotent, and it is also why calling this twice is safe.
		return nil
	}

	var held recordFile
	if err := json.Unmarshal(prev, &held); err != nil {
		return fmt.Errorf("battle: %s already holds a record that cannot be read back, so the record of "+
			"the battle at seed %d has not been written over it; move the old one aside or choose "+
			"another id", id, seed)
	}
	return fmt.Errorf("battle: %s already holds a different battle — the one already there is seed %d "+
		"labelled %q, this one is seed %d labelled %q — and a record is a promise that an id means "+
		"one battle, so the record already there is kept; move it aside or choose another id",
		id, held.Seed, held.Original.Label, seed, label)
}

// ReadBattle reads a recorded battle back out of dir.
//
// Every way this can be handed something it cannot trust is an error rather than
// a partly-filled BattleRecord, and the reasons are kept apart because they mean
// different things to whoever has to act:
//
//   - a file that is not a battle record, or a version this build does not read;
//   - an id that is not a single safe path component, because a record names its
//     own id and a record whose id is ../../etc/passwd is a file that would be
//     read from, or written to, somewhere it should not be;
//   - a record whose id field disagrees with the directory it was read from;
//   - an order log whose own header disagrees with the record: a different seed,
//     a different balance version, a different row count, or a different digest;
//   - a record whose id field disagrees with the id the caller asked for.
//
// The last group is the interesting one. A record is two files, and the whole
// claim of this format is that the two describe one battle. A record where they
// disagree has been edited, has been half-copied, or has been assembled from two
// battles, and in all three cases replaying it would produce a number that looks
// like a result.
func ReadBattle(dir, id string) (*BattleRecord, error) {
	if err := validBattleID(id); err != nil {
		return nil, err
	}
	blob, err := os.ReadFile(filepath.Join(dir, recordIndexFile))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("battle: there is no recorded battle %q in %s (%s is not there)", id, dir, recordIndexFile)
		}
		return nil, fmt.Errorf("battle: reading the battle record failed: %w", err)
	}
	var idx recordFile
	if err := json.Unmarshal(blob, &idx); err != nil {
		return nil, fmt.Errorf("battle: the battle record does not parse: %w", err)
	}
	if idx.Kind != BattleRecordKind {
		return nil, fmt.Errorf("battle: this is a %q file, not a battle record", idx.Kind)
	}
	if idx.Version != BattleRecordVersion {
		return nil, fmt.Errorf("battle: the battle record is format version %d and this build reads version %d; "+
			"refusing to guess at a layout it was not written for", idx.Version, BattleRecordVersion)
	}
	if idx.ID != id {
		return nil, fmt.Errorf("battle: the record in %s calls itself %q, not %q; this directory is not the "+
			"record you asked for", dir, idx.ID, id)
	}
	if idx.Log.File != recordLogFile {
		return nil, fmt.Errorf("battle: the record says its order log is in %q; this build reads it from %q, "+
			"and a record that points its reader somewhere else is a record that cannot be trusted to name its inputs",
			idx.Log.File, recordLogFile)
	}
	logBytes, err := os.ReadFile(filepath.Join(dir, recordLogFile))
	if err != nil {
		return nil, fmt.Errorf("battle: reading the order log failed: %w", err)
	}
	log, seed, configVersion, err := DecodeOrderLog(logBytes)
	if err != nil {
		return nil, err
	}
	if seed != idx.Seed {
		return nil, fmt.Errorf("battle: the record says seed %d and its order log says %d; these two files "+
			"describe different battles", idx.Seed, seed)
	}
	if configVersion != idx.ConfigVersion {
		return nil, fmt.Errorf("battle: the record says balance version %q and its order log says %q; these "+
			"two files describe different battles", idx.ConfigVersion, configVersion)
	}
	if idx.Log.Rows != log.Len() {
		return nil, fmt.Errorf("battle: the record says the log holds %d orders and the log holds %d; the "+
			"record is describing a battle whose log is not beside it", idx.Log.Rows, log.Len())
	}
	if want, got := idx.Log.OrderHash, hashHex(log.Hash()); want != got {
		return nil, fmt.Errorf("battle: the record says its log hashes to %s and the log hashes to %s", want, got)
	}
	if want, got := idx.Log.RosterHash, hashHex(log.RosterHash()); want != got {
		return nil, fmt.Errorf("battle: the record says its log was recorded against force %s and the log "+
			"says %s", want, got)
	}
	return &BattleRecord{
		ID:            idx.ID,
		Seed:          idx.Seed,
		ConfigVersion: idx.ConfigVersion,
		A:             idx.A.Roster(),
		B:             idx.B.Roster(),
		Label:         idx.Label,
		Original:      idx.Original,
		Log:           log,
		LogBytes:      logBytes,
	}, nil
}

// validBattleID refuses an id that is not one safe path component.
//
// The id becomes a directory name, so an id carrying a separator or a dot-dot
// would let a caller who can name a battle write outside the store they were
// given. This is the check that makes "the id is a directory name" a safe thing
// for the format to rely on.
func validBattleID(id string) error {
	if id == "" {
		return fmt.Errorf("battle: a battle needs an id; the id is the directory its record is written to")
	}
	if id == "." || id == ".." || strings.ContainsAny(id, `/\`) || strings.ContainsRune(id, 0) {
		return fmt.Errorf("battle: a battle id is one directory name, and %q is not one", id)
	}
	return nil
}

// BattleCheck is the verdict of replaying a recorded battle from its files.
type BattleCheck struct {
	// ID is the battle that was replayed.
	ID string
	// Match is whether the replay reproduced the recorded battle: the same result
	// hash AND every published number in the record.
	//
	// Both, not the hash alone. A record is two files and a summary, and a summary
	// can be edited without touching either the log or the hash it quotes, so a
	// hash-only verdict would call a self-contradicting record a match. See
	// VerifyRecordedBattle.
	Match bool
	// Want and Got are the recorded and replayed result hashes, in hex.
	Want, Got string
	// Diff names the first number that moved, or says that the units moved while
	// every published number agreed. It is empty exactly when Match is true.
	Diff string
	// Original and Replay are the two summaries, so the CLI prints the recorded
	// casualties beside the replayed ones rather than only saying "different".
	Original RecordSummary
	Replay   RecordSummary
	// Seed, ConfigVersion, Orders, and Ticks are what the replay was given.
	Seed          uint64
	ConfigVersion string
	Orders        int
	Ticks         int
	// ElapsedSeconds is how long the replayed fight took, so a reader can see the
	// cost of the check they just ran.
	ElapsedSeconds float64
}

// VerifyRecordedBattle replays the battle a record describes and compares the
// result against the one the record carries.
//
// The comparison is by result hash, which covers every unit's final state and
// every published total, and the summary is compared alongside it so a failure
// says which number moved. A mismatch is a finding and not an error: "the replay
// did not match" is the answer to the question. An error means the replay could
// not be run at all, which is a different problem (a corrupt file, a balance file
// whose version has moved on, a roster the log was not recorded against), and
// those come from ReadBattle and from battle.Replay.
func VerifyRecordedBattle(cfg *config.Config, b *BattleRecord) (*BattleCheck, error) {
	if b == nil {
		return nil, fmt.Errorf("battle: there is no recorded battle to replay")
	}
	setup, err := b.Setup(cfg)
	if err != nil {
		return nil, err
	}
	res, err := Replay(cfg, &Recording{
		Seed:          b.Seed,
		ConfigVersion: b.ConfigVersion,
		Setup:         setup,
		Log:           b.Log,
	})
	if err != nil {
		return nil, err
	}
	got := SummariseResult(res)
	check := &BattleCheck{
		ID:             b.ID,
		Want:           b.Original.ResultHash,
		Got:            got.ResultHash,
		Original:       b.Original,
		Replay:         got,
		Seed:           b.Seed,
		ConfigVersion:  cfg.Version,
		Ticks:          got.Ticks,
		ElapsedSeconds: res.Elapsed,
	}
	if b.Log != nil {
		check.Orders = b.Log.Len()
	}
	// Both halves have to agree, and the reason is a file that can be internally
	// inconsistent.
	//
	// Comparing the two result hashes alone is the stronger check and it is not
	// enough. A record whose recorded casualty figure was edited still carries the
	// hash the battle really produced, so the hashes agree and the file says two
	// things about the same battle at once. Diff is what catches that: it walks
	// every published number in the record against the replay's, and a record that
	// contradicts itself cannot walk clean.
	//
	// The other direction matters too. Diff ends by comparing the hashes and says
	// so when every number agrees and they do not, which is the case where the
	// units finished somewhere else. That is a mismatch with no moved number to
	// point at, and a verdict that ignored the hashes would report it as a match.
	check.Diff = got.Diff(b.Original)
	check.Match = check.Want == check.Got && check.Diff == ""
	return check, nil
}

// String renders a check the way a harness prints one.
//
// The hash-only case gets its own line. A verdict reading "MISMATCH: want
// 8dc81d15, got 8dc81d15" is true and unreadable: both battles hashed the same,
// and the disagreement is in the numbers the record prints. A reader who sees two
// identical hashes and the word MISMATCH will conclude the tool is broken, and
// they will be right to.
func (c *BattleCheck) String() string {
	s := fmt.Sprintf("battle %s: replay %s: want %s, got %s (seed %d, %d orders, %d ticks)",
		c.ID, matchWord(c.Match), c.Want, c.Got, c.Seed, c.Orders, c.Ticks)
	if c.Match {
		return s
	}
	if c.Want == c.Got {
		s += fmt.Sprintf("\n  both runs produced result hash %s and the record still disagrees with it; "+
			"the record contradicts itself", c.Want)
	}
	return s + "\n  first difference: " + c.Diff
}

// BattleStore is a directory of recorded battles addressed by battle id.
//
// It is the shape `simrun replay --battle <id>` needs: something that turns an id
// into a directory without letting the id escape the store, and something that
// can list what is in there so a person does not have to remember the ids.
type BattleStore struct {
	root string
}

// OpenBattleStore opens (or will create) a store at root. It does not touch the
// filesystem: an empty directory is a legitimate store to open and one that does
// not exist yet is a store nothing has been written to.
func OpenBattleStore(root string) *BattleStore { return &BattleStore{root: root} }

// Root is the directory the store reads and writes.
func (s *BattleStore) Root() string { return s.root }

// Dir is where a given battle lives inside the store.
func (s *BattleStore) Dir(id string) (string, error) {
	if err := validBattleID(id); err != nil {
		return "", err
	}
	return filepath.Join(s.root, id), nil
}

// IDs lists the battles in the store, sorted.
//
// A directory that is not a battle record is skipped rather than refused, because
// the store is a directory a person can put things in and one stray file should
// not make every other battle unreadable. A directory that IS a battle record but
// will not parse is an error, because that one is a record this build cannot use
// and hiding it would let somebody believe they had replayed everything.
func (s *BattleStore) IDs() ([]string, error) {
	entries, err := os.ReadDir(s.root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("battle: reading the battle store failed: %w", err)
	}
	var ids []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(s.root, e.Name(), recordIndexFile)); err != nil {
			continue
		}
		ids = append(ids, e.Name())
	}
	sort.Strings(ids)
	return ids, nil
}

// Save writes a battle into the store.
func (s *BattleStore) Save(id string, a, b Roster, res *Result, rec *Recording) error {
	dir, err := s.Dir(id)
	if err != nil {
		return err
	}
	return SaveBattle(dir, id, a, b, res, rec)
}

// Load reads a battle out of the store.
func (s *BattleStore) Load(id string) (*BattleRecord, error) {
	dir, err := s.Dir(id)
	if err != nil {
		return nil, err
	}
	return ReadBattle(dir, id)
}

// Verify replays a battle from the store and returns the verdict.
func (s *BattleStore) Verify(cfg *config.Config, id string) (*BattleCheck, error) {
	rec, err := s.Load(id)
	if err != nil {
		return nil, err
	}
	check, err := VerifyRecordedBattle(cfg, rec)
	if err != nil {
		return nil, err
	}
	check.ID = id
	return check, nil
}

// hashHex renders a digest the way every other digest in this package is
// printed: sixteen lowercase hex digits, no prefix, fixed width.
//
// It is resulthash.go's formatHash rather than fmt's %x, so a digest in a
// record file, in a verdict, and in a test message is the same string in all
// three and a reader comparing two of them by eye is not misled by one of them
// being seven digits and another sixteen.
func hashHex(h uint64) string { return formatHash(h) }
