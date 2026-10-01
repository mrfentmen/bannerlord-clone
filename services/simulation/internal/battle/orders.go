package battle

// OrderName is one of the fourteen formation orders a commander can issue.
// The set is closed: the API rejects anything not on this list with a 400
// and the list of valid orders, so a client can never order a formation to do
// something the engine has no definition for.
type OrderName string

const (
	OrderHoldPosition OrderName = "hold-position"
	// OrderTacticMove is the tactical "Move" order. The name avoids the
	// existing OrderMove, which is the command seam's per-unit movement row:
	// a different layer. The wire name stays "move".
	OrderTacticMove      OrderName = "move"
	OrderAdvance         OrderName = "advance"
	OrderCharge          OrderName = "charge"
	OrderFollow          OrderName = "follow"
	OrderFallBack        OrderName = "fall-back"
	OrderFaceDirection   OrderName = "face-direction"
	OrderChangeFormation OrderName = "change-formation"
	OrderChangeSpacing   OrderName = "change-spacing"
	OrderVolleyFire      OrderName = "volley-fire"
	OrderFireAtWill      OrderName = "fire-at-will"
	OrderTakeCover       OrderName = "take-cover"
	OrderFlank           OrderName = "flank"
	OrderRetreat         OrderName = "retreat"
)

// validOrders is the fourteen orders in the plan's canonical order.
var validOrders = []OrderName{
	OrderHoldPosition,
	OrderTacticMove,
	OrderAdvance,
	OrderCharge,
	OrderFollow,
	OrderFallBack,
	OrderFaceDirection,
	OrderChangeFormation,
	OrderChangeSpacing,
	OrderVolleyFire,
	OrderFireAtWill,
	OrderTakeCover,
	OrderFlank,
	OrderRetreat,
}

// ValidOrders returns the fourteen formation order names. The returned slice
// is a copy; callers cannot mutate the set.
func ValidOrders() []OrderName {
	out := make([]OrderName, len(validOrders))
	copy(out, validOrders)
	return out
}

// ValidOrder reports whether name is one of the fourteen orders.
func ValidOrder(name OrderName) bool {
	for _, o := range validOrders {
		if o == name {
			return true
		}
	}
	return false
}
