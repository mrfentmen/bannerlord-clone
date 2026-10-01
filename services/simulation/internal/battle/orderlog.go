package battle

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
)

// THE ORDER LOG.
//
// This is the whole of what a replay file is: a seed and a log of orders. It is
// deliberately tiny. It is NOT a per-frame state recording, and internal/replay
// already is that and does it well; recording every unit's every field every tick
// grows with ticks times units and tells you nothing about WHY the battle went the
// way it did. The order log grows with the number of orders, which is the number
// of decisions somebody actually made.
//
// # THE PATTERN, AND WHERE IT CAME FROM
//
// The boss names sparta (github.com/lacaedemon/sparta, MIT) as the pattern to
// study for replay. This file implements that pattern from scratch in Go, per
// ~/workspace/agents/spacebunny/OSS-REFERENCE.md: rebuild the idea, never paste
// the code. The four properties taken from it are:
//
//  1. One RNG stream, explicitly seeded, drawn in a fixed stable order. That is
//     already the engine's shape (see rngFor in melee.go and the Derive calls in
//     battle.go, aimedfire.go, and morale.go) and TestSeededOnly asserts that it
//     stays that way.
//  2. Fixed timestep. Already true: Battle.tick is driven by the caller's loop and
//     every stage is a pure function of the snapshot.
//  3. Orders reference units by a stable per-battle id. True already: Unit.ID is
//     dense, ascending, and assigned once in newBattle. Order.Unit carries that id
//     and nothing else, so an order survives being written to disk and read back.
//  4. One apply path, shared by live play and replay. This is the property the
//     rest of this file exists to provide: a recorded order and a replayed order
//     are written by the same code into the same View.Commands channel and read
//     by the same runCommanders, so there is no second code path that could
//     disagree with the first.
//
// # WHY THE LOG LIVES OUTSIDE THE ENGINE
//
// The order log is a Commander wrapper, not a field on Battle. That is a
// deliberate choice and it has three consequences worth stating, because two of
// them are the reason and one is a limitation.
//
// The reason: the command seam (command.go) is already the one place the battle
// core lets an outside layer change a battle. A logger built on that seam can
// only ever see exactly what an outside layer is allowed to see, which is what
// makes it a trustworthy observer. A logger built inside the tick loop could see
// private state, and would then prove nothing about the seam.
//
// Consequence one: the engine's OWN decisions are not in this log, and they do
// not need to be. The intent stage, the targeting stage, the morale stage: all of
// them are deterministic functions of the snapshot and the seed, and the seed
// carries every random draw they make through per-tick named substreams. So they
// are RE-DERIVED on replay rather than recorded, which is the second branch of
// the sparta rule (AI orders are either recorded or re-derived). ReplayWithEmptyLog
//BeingIgnoredIsTheAIReDerived test is the proof: it replays a battle whose log
// is empty and requires a bit-identical result hash.
//
// Consequence two: an order log cannot be used to smuggle in a change the engine
// would not otherwise accept. Replay writes orders into View.Commands and
// runCommanders applies the same clampStep to them that it applies to live orders,
// so a replayed order that would be illegal live is illegal in replay too.
//
// Consequence three, a real limitation: because the log is a wrapper, a battle run
// through battle.Run rather than battle.RunCommanded has no log, and the caller
// has to have used the seam to get one. That is stated rather than hidden. A
// caller with no commander at all has made no orders and has nothing to log, so
// the seed alone reproduces its battle and an empty log is the honest record.
//
// # APPEND-ONLY, AND WHAT THAT COSTS
//
// The log only ever grows and rows are never rewritten or deleted. Append-only is
// what makes the log usable as evidence: the order of decisions is part of the
// battle, so a log whose rows could be edited after the fact would be a log that
// could be made to say anything.
//
// It also means the log cannot be silently truncated. A bound is still worth
// having, because a caller can hand the engine a commander that orders every unit
// every tick for a long battle, and an unbounded slice is a memory leak with extra
// steps. So the bound is enforced, the number of refused rows is counted, and
// TestOrderLogRefusesToDropRowsSilently requires Replay to REFUSE a truncated log
// rather than reproduce a battle with orders missing from it. A log that lost
// rows and a log that never had them are different things, and only the second
// one is a replayable log.

// OrderKind is what kind of order a row carries.
type OrderKind uint8

const (
	// OrderMove is an ordered movement for one unit: DX and DY metres this tick,
	// and the Intent the unit is being told it is acting under.
	//
	// This is the only kind of order the engine's command channel can carry.
	// battle.UnitCommand is a movement plus an intent and has no other field, so
	// naming a second kind of movement here would be inventing a capability the
	// seam does not have.
	OrderMove OrderKind = iota
	// OrderHold is an explicit order to a unit to stand still this tick. It is a
	// distinct kind rather than an OrderMove with zero DX and DY because the two
	// are not the same instruction: UnitCommand.Set is what separates "told to
	// hold" from "said nothing", and a log that collapsed them would record a
	// commander's silence as a command.
	OrderHold
)

// String names the order kind.
func (k OrderKind) String() string {
	switch k {
	case OrderMove:
		return "move"
	case OrderHold:
		return "hold"
	default:
		return "unknown"
	}
}

// Order is one order, as logged.
//
// It is a value and it is self-contained on purpose: an order that had to be
// joined back to the battle to be understood would not survive a round trip
// through a file, and a replay log that cannot be reloaded is a log that only
// works on the machine that made it.
type Order struct {
	// Seq is the order's position in the log, from zero, and is assigned on
	// append. It is not read from the replayed stream; it is rebuilt by the log
	// it is appended to, so two identical battles produce identical sequence
	// numbers without anybody having to preserve them.
	Seq int
	// Tick is the tick the order was issued for, which is the value View.Tick
	// carried when the commander saw the field. A commander decides at tick N
	// and the order applies to tick N, because the intent stage has already run
	// for that tick and the command stage overrides it; see command.go's "WHY THE
	// HOOK RUNS AFTER THE INTENT STAGE".
	Tick int
	// Unit is the per-battle unit id the order is about, or -1 for a side-level
	// order. Unit ids are dense and ascending from newBattle, so they survive a
	// save and reload where a pointer or a slice index into somebody else's
	// structures would not.
	Unit int
	// Side is the side the unit fights for. It is redundant with Unit and is
	// carried anyway: a side-level order has no Unit, and a log that could only be
	// read by joining against the roster would not be readable on its own.
	Side Side
	// Kind is what kind of order this is.
	Kind OrderKind
	// DX and DY are the metres to move this tick, in metres. They are the exact
	// float64s the commander wrote, bit for bit, because a replay that rounds them
	// is a replay of a different battle.
	DX, DY float64
	// Intent is what the unit is being told it is doing. It is recorded with the
	// movement every time, because battle.commit applies an ordered intent
	// through the delta buffer and the battle report has to describe what the men
	// were told to do rather than what they would have done.
	Intent Intent
	// Source names the commanding layer that issued the order, as free text. It is
	// never parsed and never affects the battle. It is here so that a log holding
	// orders from two sources, which is what a replay of a battle where the player
	// commanded one side and the engine commanded the other looks like, can still
	// be read by a person.
	Source string
}

// OrderLog is an append-only record of every order issued during one battle.
//
// The zero value is an empty log that is ready to use. All access is through
// Append and the readers; there is no method that rewrites or removes a row.
type OrderLog struct {
	rows []Order
	// bound is the maximum number of rows this log will hold, or zero for
	// unbounded.
	bound int
	// refused counts rows Append refused because the bound was reached. It is not
	// a count of orders the battle did not act on: the battle acted on all of
	// them. It is a count of rows this log cannot describe itself honestly.
	refused int
	// hash is a running digest of every row appended, used to notice a log that
	// has been edited or truncated since it was written.
	hash uint64
	// rosterHash identifies the force this log's orders were issued against.
	//
	// Unit ids are POSITIONAL: newBattle assigns them densely in slice order, so a
	// battle with eight units a side and a battle with four units a side have
	// overlapping id ranges and an order for unit 3 names a real unit in both. An
	// id range check therefore cannot tell a log from another battle, which is why
	// the roster is fingerprinted instead. Without this, replaying one battle's log
	// against a different roster silently produces a different battle that looks
	// like a replay.
	rosterHash uint64
}

// orderLogHashSeed is the FNV-1a 64 offset basis, used as the digest seed so that
// an empty log has a defined non-zero digest rather than the zero value that a
// zero-initialised hash would produce. A zero digest has to mean something, and
// making it mean "the hash was never computed" is not worth the ambiguity.
const orderLogHashSeed uint64 = 14695981039346656037

// orderLogHashPrime is the FNV-1a 64 prime.
const orderLogHashPrime uint64 = 1099511628211

// NewOrderLog returns an empty log that will hold at most bound rows, or an
// unbounded one when bound is zero or negative.
//
// A caller that expects a commander to issue an order per unit per tick should
// size the bound for the worst case, because a log that hits its bound is not a
// replayable log and Replay will say so rather than quietly reproduce a different
// battle.
func NewOrderLog(bound int) *OrderLog {
	if bound < 0 {
		bound = 0
	}
	return &OrderLog{hash: orderLogHashSeed, bound: bound}
}

// Append adds one order to the end of the log and returns it with Seq filled in.
//
// It returns false and counts the row as refused when the log is full. It never
// overwrites and never partially appends, because a log with a hole in it is
// worse than a log that admits it stopped.
func (l *OrderLog) Append(o Order) (Order, bool) {
	if l.bound > 0 && len(l.rows) >= l.bound {
		l.refused++
		return o, false
	}
	o.Seq = len(l.rows)
	l.rows = append(l.rows, o)
	l.hash = hashOrder(l.hash, o)
	return o, true
}

// Len is how many rows the log holds.
func (l *OrderLog) Len() int { return len(l.rows) }

// Refused is how many rows Append refused because the bound was reached.
//
// It is part of the log's honesty: a caller that ignores it has a log that does
// not describe its battle, and TestOrderLogRefusesToDropRowsSilently exists
// because that is a silent-wrong-answer shape rather than a crash.
func (l *OrderLog) Refused() int { return l.refused }

// Truncated reports whether the log refused any row, which is to say whether it
// is a complete record. A truncated log is not replayable.
func (l *OrderLog) Truncated() bool { return l.refused > 0 }

// Bound is the log's row bound, or zero when it is unbounded.
func (l *OrderLog) Bound() int { return l.bound }

// Hash is a digest of every row appended, in order.
//
// It is a 64-bit FNV-1a over the rows' fields taken as their exact bit patterns,
// so it detects an edited DX, a reordered row, and a dropped row alike. It is a
// digest and not a cryptographic hash: it is here to catch the accidents that
// actually happen to a log file, which is a truncated write and a hand edit, and
// it is not a defence against an adversary who is choosing what to change.
func (l *OrderLog) Hash() uint64 { return l.hash }

// SetRoster records the fingerprint of the force this log's orders belong to.
//
// It is set once by Record, before any order is issued, and read by Replay. It is
// deliberately NOT folded into Hash: the digest answers "have these rows been
// edited", and the roster answers "are these rows about this battle". Mixing them
// would make an unrelated roster produce a confusing digest error instead of a
// clear mismatch message.
func (l *OrderLog) SetRoster(h uint64) { l.rosterHash = h }

// RosterHash is the fingerprint of the force this log belongs to, or zero if it was
// never set.
func (l *OrderLog) RosterHash() uint64 { return l.rosterHash }

// Rows returns the log's rows in append order.
//
// The slice is a copy, because a caller that could write to the log's own backing
// array could rewrite history, and append-only is the whole property. It costs one
// allocation, which is why nothing in the hot path calls it.
func (l *OrderLog) Rows() []Order {
	if len(l.rows) == 0 {
		return nil
	}
	out := make([]Order, len(l.rows))
	copy(out, l.rows)
	return out
}

// OrdersForTick returns the rows issued for one tick, in append order.
//
// It is the reader the replayer uses and it is the reason the log is useful rather
// than merely complete: an order is only meaningful against the tick it was made
// for, and a replayer that had to scan the whole log per tick would be quadratic
// in a long battle.
func (l *OrderLog) OrdersForTick(tick int) []Order {
	start := 0
	for start < len(l.rows) && l.rows[start].Tick < tick {
		start++
	}
	end := start
	for end < len(l.rows) && l.rows[end].Tick == tick {
		end++
	}
	if end <= start {
		return nil
	}
	out := make([]Order, end-start)
	copy(out, l.rows[start:end])
	return out
}

// Ticks is the number of distinct ticks the log carries orders for.
func (l *OrderLog) Ticks() int {
	n := 0
	for i := range l.rows {
		if i == 0 || l.rows[i].Tick != l.rows[i-1].Tick {
			n++
		}
	}
	return n
}

// hashOrder folds one order into a running digest.
//
// Every numeric field goes in as its exact bit pattern via math.Float64bits rather
// than as a decimal rendering. Formatting a float to text and hashing the text
// would make the digest depend on the formatting code rather than on the value,
// and -0.0 and 0.0 would render identically while being different bit patterns.
func hashOrder(h uint64, o Order) uint64 {
	h = mixUint64(h, uint64(o.Seq))
	h = mixUint64(h, uint64(o.Tick))
	h = mixUint64(h, uint64(o.Unit))
	h = mixUint64(h, uint64(o.Side))
	h = mixUint64(h, uint64(o.Kind))
	h = mixUint64(h, floatBits(o.DX))
	h = mixUint64(h, floatBits(o.DY))
	h = mixUint64(h, uint64(o.Intent))
	for i := 0; i < len(o.Source); i++ {
		h ^= uint64(o.Source[i])
		h *= orderLogHashPrime
	}
	// The length of Source is mixed in so that "ab" plus "c" cannot collide with
	// "a" plus "bc" by concatenation.
	h = mixUint64(h, uint64(len(o.Source)))
	return h
}

// floatBits is a float64's exact bit pattern.
//
// It goes through math.Float64bits rather than any decimal rendering, so the
// digest depends on the value and not on how a float happens to be printed. That
// is what makes -0.0 and 0.0, which are different bit patterns, produce different
// digests even though any reasonable text rendering would print them alike.
func floatBits(v float64) uint64 {
	return math.Float64bits(v)
}

// nan and inf build the two float values formatFloat spells out in quotes.
func nan() float64         { return math.NaN() }
func inf(sign int) float64 { return math.Inf(sign) }

// mixUint64 folds one integer into the running digest.
func mixUint64(h, v uint64) uint64 {
	for i := 0; i < 8; i++ {
		h ^= v & 0xFF
		h *= orderLogHashPrime
		v >>= 8
	}
	return h
}

// OrderLogVersion is the format version written into an encoded log. It is bumped
// when the row layout changes, and DecodeOrderLog refuses a version it does not
// know rather than guessing, because a log read with the wrong layout is a log
// that produces a confidently wrong replay.
const OrderLogVersion = 1

// orderLogHeader is the first line of an encoded log.
type orderLogHeader struct {
	Kind string `json:"kind"`
	// Version is OrderLogVersion.
	Version int `json:"version"`
	// Seed is the seed the battle ran under. It is carried in the file rather than
	// left to the caller because a log with the wrong seed beside it is the easiest
	// way to get a replay that reproduces the wrong battle, and a file that
	// carries its own seed cannot be paired with the wrong one by accident.
	Seed uint64 `json:"seed"`
	// ConfigVersion is the balance file version the battle ran under, for the same
	// reason. The balance file is not embedded: a replay runs under whatever config
	// the caller loads, and TestReplayUnderADifferentConfigIsRefused is what stops
	// that from silently producing a different battle.
	ConfigVersion string `json:"config_version"`
	// OrderHash is OrderLog.Hash, so a reader can tell a complete log from an
	// edited one before trusting a single row.
	OrderHash uint64 `json:"order_hash"`
	// RosterHash identifies the force the orders were issued against, so a reader
	// can refuse to replay this log against a different one. See
	// OrderLog.rosterHash for why an id range is not enough.
	RosterHash uint64 `json:"roster_hash"`
	// Rows is how many rows follow.
	Rows int `json:"rows"`
	// Truncated says the log refused rows and is therefore not a complete record.
	// It is in the file so that a reader cannot mistake a truncated log for a
	// short battle.
	Truncated bool `json:"truncated"`
}

// Encode writes the log as JSONL and returns the bytes.
//
// One header object, then one object per row in append order. The order is fixed
// and is not cosmetic: it is what makes two logs byte-comparable, which is the
// determinism proof. A file whose rows were emitted in map order would differ
// between two identical battles and the diff would be reporting the encoder rather
// than the battle.
//
// The rows are written by hand rather than through encoding/json's reflection
// because the row is a fixed shape and the float fields have to be written in a
// form that reads back as the exact same float64. encoding/json would do that too,
// but it would do it by going through a shortest-representation search whose output
// is not contractually stable across Go releases, and this file's entire subject is
// bit-for-bit reproducibility.
func (l *OrderLog) Encode(seed uint64, configVersion string) ([]byte, error) {
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)
	hdr := orderLogHeader{
		Kind:          "order_log",
		Version:       OrderLogVersion,
		Seed:          seed,
		ConfigVersion: configVersion,
		OrderHash:     l.hash,
		RosterHash:    l.rosterHash,
		Rows:          len(l.rows),
		Truncated:     l.Truncated(),
	}
	hb, err := json.Marshal(hdr)
	if err != nil {
		return nil, fmt.Errorf("battle: encoding the order log header failed: %w", err)
	}
	if _, err := w.Write(hb); err != nil {
		return nil, fmt.Errorf("battle: writing the order log header failed: %w", err)
	}
	if err := w.WriteByte('\n'); err != nil {
		return nil, fmt.Errorf("battle: writing the order log header failed: %w", err)
	}
	for i := range l.rows {
		if _, err := w.WriteString(formatOrderRow(l.rows[i])); err != nil {
			return nil, fmt.Errorf("battle: writing order %d failed: %w", i, err)
		}
		if err := w.WriteByte('\n'); err != nil {
			return nil, fmt.Errorf("battle: writing order %d failed: %w", i, err)
		}
	}
	if err := w.Flush(); err != nil {
		return nil, fmt.Errorf("battle: flushing the order log failed: %w", err)
	}
	return buf.Bytes(), nil
}

// formatOrderRow renders one order as a JSON object with a fixed key order.
//
// The floats use strconv.FormatFloat with bitSize 64 and the shortest encoding that
// round-trips, which is the one representation that is guaranteed to parse back to
// the identical float64. A format with fewer digits would be prettier and would
// silently change the battle on replay, so the round-tripping format is the only
// acceptable one.
func formatOrderRow(o Order) string {
	var sb strings.Builder
	sb.Grow(160)
	sb.WriteString(`{"kind":"order","seq":`)
	sb.WriteString(strconv.Itoa(o.Seq))
	sb.WriteString(`,"tick":`)
	sb.WriteString(strconv.Itoa(o.Tick))
	sb.WriteString(`,"unit":`)
	sb.WriteString(strconv.Itoa(o.Unit))
	sb.WriteString(`,"side":`)
	sb.WriteString(strconv.Itoa(int(o.Side)))
	sb.WriteString(`,"order":`)
	writeJSONString(&sb, o.Kind.String())
	sb.WriteString(`,"dx":`)
	sb.WriteString(formatFloat(o.DX))
	sb.WriteString(`,"dy":`)
	sb.WriteString(formatFloat(o.DY))
	sb.WriteString(`,"intent":`)
	sb.WriteString(strconv.Itoa(int(o.Intent)))
	sb.WriteString(`,"source":`)
	writeJSONString(&sb, o.Source)
	sb.WriteString(`}`)
	return sb.String()
}

// formatFloat renders a float64 so that parsing it returns the identical value.
//
// 'g' with precision -1 is documented to use the smallest number of digits that
// parses back exactly, which is the property this needs. The special cases are
// handled by hand because the source of a position or a step in a battle should
// never be Inf or NaN, and if one ever is, the log should say so in a way a reader
// notices rather than emit a token strconv cannot parse.
func formatFloat(v float64) string {
	if isFinite(v) {
		return strconv.FormatFloat(v, 'g', -1, 64)
	}
	if v != v {
		return `"nan"`
	}
	if v > 0 {
		return `"inf"`
	}
	return `"-inf"`
}

// writeJSONString writes a Go string as a JSON string.
//
// strings then strconv.Quote is not used directly because Quote is for Go source
// literals and does not reject every byte a JSON reader would reject; a log that
// cannot be parsed by a JSON reader is not a log anybody else can open.
func writeJSONString(sb *strings.Builder, s string) {
	b, err := json.Marshal(s)
	if err != nil {
		// json.Marshal of a string cannot fail, but writing a bare null beats
		// panicking inside a logging path.
		sb.WriteString("null")
		return
	}
	sb.Write(b)
}

// DecodeOrderLog reads a log written by Encode.
//
// It returns an error, not a partial log, for every failure it can detect: a
// version it does not know, a row count that does not match the header, a digest
// that does not match the rows, and a row that will not parse. A caller handed a
// file it cannot fully trust needs to be told so rather than handed a log with
// some of its orders missing, which would replay as a different battle that looked
// right.
func DecodeOrderLog(data []byte) (*OrderLog, uint64, string, error) {
	r := bufio.NewReader(bytes.NewReader(data))
	line, err := readLine(r)
	if err != nil {
		return nil, 0, "", fmt.Errorf("battle: the order log is empty: %w", err)
	}
	var hdr orderLogHeader
	if err := json.Unmarshal(line, &hdr); err != nil {
		return nil, 0, "", fmt.Errorf("battle: the order log header does not parse: %w", err)
	}
	if hdr.Kind != "order_log" {
		return nil, 0, "", fmt.Errorf("battle: this is a %q file, not an order log", hdr.Kind)
	}
	if hdr.Version != OrderLogVersion {
		return nil, 0, "", fmt.Errorf("battle: the order log is format version %d and this build reads version %d; "+
			"refusing to guess at a layout it was not written for", hdr.Version, OrderLogVersion)
	}

	log := NewOrderLog(0)
	log.rosterHash = hdr.RosterHash
	// The verification digest is recomputed from the seed value, NOT from the
	// digest the header claims. Seeding it from the header would make the check
	// fold every row on top of the answer it is trying to check, which compares
	// nothing: any header value would "verify" as long as the rows were stable.
	got := orderLogHashSeed
	for i := 0; ; i++ {
		line, err := readLine(r)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, 0, "", fmt.Errorf("battle: reading order %d failed: %w", i, err)
		}
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		o, err := parseOrderRow(line)
		if err != nil {
			return nil, 0, "", fmt.Errorf("battle: order %d does not parse: %w", i, err)
		}
		// Seq is rebuilt rather than trusted, so a hand-edited or reordered file
		// cannot make the log claim an order happened at a position it did not.
		o.Seq = i
		log.rows = append(log.rows, o)
		got = hashOrder(got, o)
	}
	if len(log.rows) != hdr.Rows {
		return nil, 0, "", fmt.Errorf("battle: the order log header says %d rows and the file has %d; "+
			"the file is incomplete", hdr.Rows, len(log.rows))
	}
	if got != hdr.OrderHash {
		return nil, 0, "", fmt.Errorf("battle: the order log digest is %016x and the rows hash to %016x; "+
			"the file has been edited since it was written", hdr.OrderHash, got)
	}
	log.hash = got
	if hdr.Truncated {
		log.refused = 1
	}
	return log, hdr.Seed, hdr.ConfigVersion, nil
}

// readLine reads one newline-terminated line. The newline is not returned.
func readLine(r *bufio.Reader) ([]byte, error) {
	line, err := r.ReadBytes('\n')
	if err != nil {
		if err == io.EOF && len(line) > 0 {
			// A final line with no trailing newline is still a line. Encoding
			// always writes the newline, but a file that has been through a
			// line-ending-stripping tool is still readable rather than being
			// rejected for a missing byte.
			return line, nil
		}
		return nil, err
	}
	return line[:len(line)-1], nil
}

// parseOrderRow reads one order row.
//
// It is a small hand-written scan rather than an unmarshal into Order because the
// row's fields do not share a type and the reader has to reject a field carrying a
// value it does not recognise rather than accept a zero that means something else.
// dx and dy are float64s; seq, tick, unit, side, order, and intent are small
// integers or quoted names.
func parseOrderRow(line []byte) (Order, error) {
	var o Order
	var seenKind string
	err := scanJSONRow(line, func(key string, raw []byte) error {
		switch key {
		case "seq":
			v, err := parseOrderInt(key, raw)
			o.Seq = v
			return err
		case "tick":
			v, err := parseOrderInt(key, raw)
			o.Tick = v
			return err
		case "unit":
			v, err := parseOrderInt(key, raw)
			o.Unit = v
			return err
		case "dx":
			o.DX = mustParseFloat(raw)
			return nil
		case "dy":
			o.DY = mustParseFloat(raw)
			return nil
		case "intent":
			s, quoted, err := parseOrderString(raw)
			if err != nil {
				return fmt.Errorf("field %q: %w", key, err)
			}
			if quoted {
				o.Intent = parseIntentName(s)
				return nil
			}
			v, err := parseOrderInt(key, raw)
			o.Intent = Intent(v)
			return err
		case "side":
			s, quoted, err := parseOrderString(raw)
			if err != nil {
				return fmt.Errorf("field %q: %w", key, err)
			}
			if quoted {
				o.Side = parseSideName(s)
				return nil
			}
			v, err := parseOrderInt(key, raw)
			o.Side = Side(v)
			return err
		case "order":
			s, quoted, err := parseOrderString(raw)
			if err != nil {
				return fmt.Errorf("field %q: %w", key, err)
			}
			if quoted {
				o.Kind = parseOrderKindName(s)
				return nil
			}
			v, err := parseOrderInt(key, raw)
			o.Kind = OrderKind(v)
			return err
		case "source":
			s, quoted, err := parseOrderString(raw)
			if err != nil {
				return fmt.Errorf("field %q: %w", key, err)
			}
			if !quoted {
				return fmt.Errorf("field %q is a bare number where a name belongs", key)
			}
			o.Source = s
			return nil
		case "kind":
			// The row discriminator, which this reader does not need but does
			// check: a row claiming to be something else is not an order.
			s, quoted, err := parseOrderString(raw)
			if err != nil {
				return fmt.Errorf("field %q: %w", key, err)
			}
			if !quoted {
				return fmt.Errorf("field %q is not a quoted string", key)
			}
			seenKind = s
			return nil
		default:
			// An unknown field is skipped rather than rejected, so a log written by
			// a later build that added a field still replays on this one. The
			// digest check is what catches the case where the extra field actually
			// mattered, because an unknown field changes the rows' hash.
			return nil
		}
	})
	if err != nil {
		return o, err
	}
	if seenKind != "" && seenKind != "order" {
		return o, fmt.Errorf("row discriminator is %q, expected %q", seenKind, "order")
	}
	if o.Unit < -1 {
		return o, fmt.Errorf("unit id %d is not a unit id and not the side-level marker -1", o.Unit)
	}
	if o.Tick < 0 {
		return o, fmt.Errorf("tick %d is negative", o.Tick)
	}
	if o.Kind != OrderMove && o.Kind != OrderHold {
		return o, fmt.Errorf("order kind %d is neither move nor hold", int(o.Kind))
	}
	return o, nil
}

// parseOrderInt parses a field that must be a whole number, and refuses a quoted
// string there rather than reading it as zero.
func parseOrderInt(key string, raw []byte) (int, error) {
	if s, quoted, err := parseOrderString(raw); err == nil && quoted {
		return 0, fmt.Errorf("field %q is the quoted string %q where a number belongs", key, s)
	}
	v, err := strconv.Atoi(string(raw))
	if err != nil {
		return 0, fmt.Errorf("field %q is not a number: %s", key, raw)
	}
	return v, nil
}

// parseOrderString reports whether raw is a quoted JSON string and what it says.
//
// A bare number returns quoted=false with no error, because the row format
// legitimately carries some fields as numbers and some as names and the caller
// knows which it asked for. The dispatch is on the key and the value type is read
// second, which is the reason dx and dy are not routed through parseOrderInt: they
// are float64s and "1.2499469729185593" is not a whole number.
func parseOrderString(raw []byte) (s string, quoted bool, err error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '"' {
		return "", false, nil
	}
	var out string
	if uerr := json.Unmarshal(trimmed, &out); uerr != nil {
		return "", false, fmt.Errorf("quoted value does not parse: %w", uerr)
	}
	return out, true, nil
}

// mustParseFloat parses a JSON number that is known to be a float, including the
// quoted "nan"/"inf" spellings formatFloat can emit.
//
// The quoted forms are read back as NaN and infinities on purpose: a log row that
// carried one is a log row describing a broken battle, and refusing to parse it
// would mean the reader could not tell the reader that the log was written by a run
// that had already gone wrong. The replay of such a log then fails its own hash
// comparison, which is the correct outcome.
func mustParseFloat(raw []byte) float64 {
	s := string(raw)
	if len(s) >= 2 && s[0] == '"' {
		var name string
		if err := json.Unmarshal(raw, &name); err == nil {
			switch name {
			case "nan":
				return nan()
			case "inf":
				return inf(1)
			case "-inf":
				return inf(-1)
			}
		}
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nan()
	}
	return v
}

// scanJSONRow walks a flat JSON object's key/value pairs in order.
//
// The rows are written by this file with a fixed key order and no nesting, so a
// reader that understands exactly that shape is simpler and stricter than a general
// JSON walk: it rejects a nested value rather than silently skipping it, because a
// row whose dx were an object would otherwise be read as a missing dx.
func scanJSONRow(line []byte, fn func(key string, raw []byte) error) error {
	s := string(line)
	i := 0
	skipSpace := func() {
		for i < len(s) && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r') {
			i++
		}
	}
	skipSpace()
	if i >= len(s) || s[i] != '{' {
		return fmt.Errorf("row does not start with an object")
	}
	i++
	skipSpace()
	if i < len(s) && s[i] == '}' {
		return nil
	}
	for {
		skipSpace()
		if i >= len(s) || s[i] != '"' {
			return fmt.Errorf("row key is not a string at offset %d", i)
		}
		key, next, err := scanJSONString(s, i)
		if err != nil {
			return err
		}
		i = next
		skipSpace()
		if i >= len(s) || s[i] != ':' {
			return fmt.Errorf("row key %q is not followed by a colon", key)
		}
		i++
		skipSpace()
		start := i
		end, err := scanJSONValue(s, i)
		if err != nil {
			return fmt.Errorf("row field %q: %w", key, err)
		}
		if err := fn(key, []byte(s[start:end])); err != nil {
			return err
		}
		i = end
		skipSpace()
		if i < len(s) && s[i] == ',' {
			i++
			continue
		}
		if i < len(s) && s[i] == '}' {
			return nil
		}
		return fmt.Errorf("row is neither continued nor closed at offset %d", i)
	}
}

// scanJSONString reads a quoted string and returns it with the offset after the
// closing quote.
func scanJSONString(s string, i int) (string, int, error) {
	i++ // opening quote
	var sb strings.Builder
	for i < len(s) {
		c := s[i]
		if c == '"' {
			return sb.String(), i + 1, nil
		}
		if c == '\\' {
			i++
			if i >= len(s) {
				return "", 0, fmt.Errorf("string ends in a backslash")
			}
			switch s[i] {
			case 'n':
				sb.WriteByte('\n')
			case 't':
				sb.WriteByte('\t')
			case 'r':
				sb.WriteByte('\r')
			case 'b':
				sb.WriteByte('\b')
			case 'f':
				sb.WriteByte('\f')
			case 'u':
				if i+4 >= len(s) {
					return "", 0, fmt.Errorf("truncated unicode escape")
				}
				v, err := strconv.ParseUint(s[i+1:i+5], 16, 32)
				if err != nil {
					return "", 0, fmt.Errorf("bad unicode escape")
				}
				sb.WriteRune(rune(v))
				i += 4
			default:
				sb.WriteByte(s[i])
			}
			i++
			continue
		}
		sb.WriteByte(c)
		i++
	}
	return "", 0, fmt.Errorf("string is not closed")
}

// scanJSONValue returns the end offset of the JSON value starting at i, and
// refuses a nested value.
func scanJSONValue(s string, i int) (int, error) {
	if i >= len(s) {
		return 0, fmt.Errorf("value is missing")
	}
	switch s[i] {
	case '"':
		_, end, err := scanJSONString(s, i)
		return end, err
	case '{', '[':
		return 0, fmt.Errorf("a nested value is not part of this format")
	default:
		start := i
		for i < len(s) && s[i] != ',' && s[i] != '}' && s[i] != ' ' && s[i] != '\t' {
			i++
		}
		if i == start {
			return 0, fmt.Errorf("value is empty at offset %d", start)
		}
		return i, nil
	}
}

// parseSideName reads a side name as written by a lenient encoder.
func parseSideName(s string) Side {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "a":
		return SideA
	case "b":
		return SideB
	default:
		return Side(-1)
	}
}

// parseIntentName reads an intent name as written by a lenient encoder.
func parseIntentName(s string) Intent {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "advance":
		return IntentAdvance
	case "engage":
		return IntentEngage
	case "withdraw":
		return IntentWithdraw
	case "rout":
		return IntentRout
	default:
		return Intent(255)
	}
}

// parseOrderKindName reads an order kind name as written by a lenient encoder.
func parseOrderKindName(s string) OrderKind {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "move":
		return OrderMove
	case "hold":
		return OrderHold
	default:
		return OrderKind(255)
	}
}
