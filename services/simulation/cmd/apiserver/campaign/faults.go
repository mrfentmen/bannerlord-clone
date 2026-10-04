package campaign

import "fmt"

// Error codes, which are the machine half of the error envelope. They are stable
// tokens, not prose, so a client can branch on them.
const (
	// CodeBadRequest is a malformed request: unparseable JSON, a missing
	// field, or a field of the wrong type.
	CodeBadRequest = "bad_request"
	// CodeNotFound is a reference to something the world does not have.
	CodeNotFound = "not_found"
	// CodeConflict is a well-formed order against a world that has moved on.
	CodeConflict = "conflict"
	// CodeUnprocessable is a semantically invalid order: an unknown good, an
	// unknown project, a rate above its ceiling.
	CodeUnprocessable = "unprocessable"
	// CodeInternal is a failed tick or a broken invariant on this server.
	CodeInternal = "internal"
)

// HTTPStatus is the status each code is served with. It lives beside the code
// rather than in the API layer so that a code cannot be added without deciding
// what it means over HTTP.
var httpStatus = map[string]int{
	CodeBadRequest:    400,
	CodeNotFound:      404,
	CodeConflict:      409,
	CodeUnprocessable: 422,
	CodeInternal:      500,
}

// Fault is an error the API can turn into an error envelope.
//
// It carries three things, and the third is the one that matters to the player.
// The campaign client's POST helper reads only a top-level "reason" field, and
// only on a 409, so a conflict has to say something a player can read. Message is
// for the console; Reason is for the screen.
type Fault struct {
	Code    string
	Message string
	Reason  string

	// cause is a sentinel this fault also answers to. A caller that wants to know
	// *which* condition produced the fault -- "was this the save-busy guard, or
	// some other conflict?" -- tests errors.Is against the sentinel rather than
	// matching on the message. Rendering the fault never shows it.
	cause error
}

// Error implements error. The message is the developer-facing sentence.
func (f *Fault) Error() string { return f.Code + ": " + f.Message }

// Unwrap lets errors.Is reach the sentinel behind a fault, so a guard can be
// identified without being reimplemented at every call site.
func (f *Fault) Unwrap() error { return f.cause }

// Status returns the HTTP status for this fault.
func (f *Fault) Status() int {
	if s, ok := httpStatus[f.Code]; ok {
		return s
	}
	return 500
}

func badRequestf(format string, args ...any) *Fault {
	msg := fmt.Sprintf(format, args...)
	return &Fault{Code: CodeBadRequest, Message: msg, Reason: msg}
}

func notFoundf(format string, args ...any) *Fault {
	msg := fmt.Sprintf(format, args...)
	return &Fault{
		Code:    CodeNotFound,
		Message: msg,
		Reason:  "There is no such thing here.",
	}
}

func conflictf(reason, format string, args ...any) *Fault {
	return &Fault{
		Code:    CodeConflict,
		Message: fmt.Sprintf(format, args...),
		Reason:  reason,
	}
}

// wrappingConflictf is conflictf with a sentinel underneath it, for a guard whose
// callers need to tell that guard apart from other conflicts.
func wrappingConflictf(cause error, reason, format string, args ...any) *Fault {
	f := conflictf(reason, format, args...)
	f.cause = cause
	return f
}

func unprocessablef(reason, format string, args ...any) *Fault {
	return &Fault{
		Code:    CodeUnprocessable,
		Message: fmt.Sprintf(format, args...),
		Reason:  reason,
	}
}

func internalf(format string, args ...any) *Fault {
	return &Fault{Code: CodeInternal, Message: fmt.Sprintf(format, args...)}
}

// Refusal is a decision the simulation made against a well-formed order, not an
// error. It is not a Fault because it is not a failure: "you have not got the
// money" is an answer. The order routes turn one into a 200 with accepted false
// and the refusal's sentence, which is the shape the client already has.
type Refusal struct {
	// Reason is written for a player, in the product's voice.
	Reason string
}

func (r *Refusal) Error() string { return "refused: " + r.Reason }

func refuse(reason string) *Refusal { return &Refusal{Reason: reason} }
