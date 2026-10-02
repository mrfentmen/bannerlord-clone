package battle

import (
	"fmt"
	"strconv"
	"strings"
)

// ErrorKind classifies a battle error. Every failure this package can produce
// is one of these; there is no path that reports failure in prose alone.
//
// The rule this encodes is CONSTITUTION.md section 1.3: errors are handled, not
// swallowed. In particular, a force larger than the configured limit is an
// error naming both the limit and the size, never a force quietly trimmed to
// fit. A truncated force is a fake success, and a battle reported from one
// would be a lie about a fight that never happened.
type ErrorKind int

const (
	// ErrNilConfig means Run was handed no config. There is no default
	// balance file to fall back on: CONSTITUTION.md section 1.2 makes the
	// balance file the only source of constants, and inventing numbers here
	// would defeat it.
	ErrNilConfig ErrorKind = iota
	// ErrInvalidConfig means the balance file loaded but its battle constants
	// cannot produce a coherent battle.
	ErrInvalidConfig
	// ErrNoUnits means the caller supplied no units for one or both sides. A
	// battle needs two forces.
	ErrNoUnits
	// ErrEmptyForce means a side's force slice contained nothing usable.
	ErrEmptyForce
	// ErrForceTooLarge means a side exceeded battle.max_units_per_side.
	ErrForceTooLarge
	// ErrUnitInvalid means a unit's fields are not usable: no troops, no hit
	// points, negative speed, a skill outside 0-1.
	ErrUnitInvalid
	// ErrTerrainUnsupported means the caller asked for terrain this core does
	// not model. It is an error rather than a silently ignored field.
	ErrTerrainUnsupported
	// ErrInternal means a tick produced a value that cannot be real, such as a
	// non-finite hit-point total. It means the engine has a bug, and it is
	// reported as one.
	ErrInternal
)

// String names the kind for error text.
func (k ErrorKind) String() string {
	switch k {
	case ErrNilConfig:
		return "nil config"
	case ErrInvalidConfig:
		return "invalid battle config"
	case ErrNoUnits:
		return "no units"
	case ErrEmptyForce:
		return "empty force"
	case ErrForceTooLarge:
		return "force too large"
	case ErrUnitInvalid:
		return "invalid unit"
	case ErrTerrainUnsupported:
		return "unsupported terrain"
	case ErrInternal:
		return "internal battle error"
	default:
		return "unknown battle error"
	}
}

// Error is a battle failure with enough structure to be acted on rather than
// just printed. A caller that wants to react to "your force was too big"
// matches on Kind and reads Limit and Count; a caller that only wants to print
// it calls Error.
type Error struct {
	// Kind classifies the failure.
	Kind ErrorKind
	// Side is the side at fault, where one applies.
	Side Side
	// Field names the offending unit field or config key, where one applies.
	Field string
	// Count and Limit carry a size against its limit, where one applies.
	Count, Limit float64
	// UnitID names the offending unit, or -1.
	UnitID int
	// Detail is the plain-language explanation shown to whoever has to fix it.
	Detail string
}

func (e *Error) Error() string {
	var sb strings.Builder
	sb.WriteString("battle: ")
	sb.WriteString(e.Kind.String())
	if e.Side == SideA || e.Side == SideB {
		fmt.Fprintf(&sb, " (side %s)", e.Side)
	}
	if e.UnitID >= 0 {
		fmt.Fprintf(&sb, " (unit %d)", e.UnitID)
	}
	if e.Field != "" {
		fmt.Fprintf(&sb, " [%s]", e.Field)
	}
	if e.Kind == ErrForceTooLarge {
		fmt.Fprintf(&sb, ": got %s units, battle.max_units_per_side is %s",
			strconv.Itoa(int(e.Count)), strconv.Itoa(int(e.Limit)))
	}
	if e.Detail != "" {
		sb.WriteString(": ")
		sb.WriteString(e.Detail)
	}
	return sb.String()
}

// newError builds an Error.
func newError(kind ErrorKind, detail string) *Error {
	return &Error{Kind: kind, UnitID: -1, Detail: detail}
}
