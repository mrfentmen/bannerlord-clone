// Package events is the seam between the simulation server and a WebSocket layer.
//
// The server publishes; it never serves a socket. A WS layer in
// `internal/ws` subscribes to a Bus and forwards whatever it receives. That split is
// deliberate: the simulation knows when things happen, and only the transport layer
// knows how a browser is connected, so neither has to know about the other.
//
// Three properties matter to whoever subscribes.
//
//   - Delivery never blocks the tick loop. The tick loop is the one thing in this
//     process that must not stall, because everything else is waiting on it. A
//     subscriber that stops reading loses tick frames, not the simulation.
//   - A dropped frame is counted, not hidden. The next delivered frame carries
//     Lagged with the number lost, so a subscriber can tell its client that the
//     stream had a gap instead of quietly presenting a stale world as current.
//   - Frames are cumulative, not incremental. A dropped tick frame loses nothing,
//     because the next frame describes the state as it is now. The client's
//     `applyTick` merges sparse deltas over a full snapshot, so a full frame is
//     always correct.
package events

import (
	"sort"
	"sync"
	"sync/atomic"
)

// Kind names what a frame carries. The client's `TickUpdate` is the only kind the
// campaign client understands today; the rest exist so the WS layer can route
// without the simulation having to know about sockets.
type Kind string

const (
	// KindTick is a world-state frame, shaped as the client's TickUpdate.
	KindTick Kind = "tick"
	// KindNotification is a single notable event, for a client that wants to
	// show it without parsing a whole tick.
	KindNotification Kind = "notification"
	// KindBattleInvitation is a call to arms: the player's party has met an
	// enemy and the player is being asked to decide.
	KindBattleInvitation Kind = "battle_invitation"
	// KindOrderResult completes an order a player submitted, carrying the same
	// value the HTTP route returned. It exists so a WS-only client is not
	// forced to make an HTTP round trip to learn the outcome.
	KindOrderResult Kind = "order_result"
	// KindClock is a clock change: the scale moved, or the clock was paused.
	KindClock Kind = "clock"
)

// Event is one published frame.
//
// Payload is the frame body. Its concrete type depends on Kind: a
// TickUpdate-shaped object for KindTick, and the corresponding result object for
// the rest. Keeping it opaque here means this package does not have to know the
// wire shapes, and adding one does not touch this file.
type Event struct {
	// Kind is what the payload is.
	Kind Kind
	// Seq is a monotonically increasing sequence number across the whole bus,
	// so a subscriber can detect a gap itself and so tests can assert ordering.
	Seq uint64
	// Tick is the simulation tick the event was published at. A tick frame's
	// payload repeats it, because the client validates it at the top level.
	Tick int
	// Day is the day of the year, 0-364.
	Day int
	// Payload is the frame body.
	Payload any
	// Lagged is how many frames this subscriber missed before this one, because
	// it was not reading. Zero means the subscriber has seen every frame since
	// it subscribed. A WS layer forwards this so its client can be told the
	// stream had a gap, rather than being shown a stale world as if it were
	// current.
	Lagged uint64
}

// Subscription is one subscriber's view of the bus.
type Subscription struct {
	// C is the channel frames arrive on. It is closed when the subscription is
	// cancelled, so a range over it terminates on its own.
	C <-chan Event

	bus    *Bus
	ch     chan Event
	once   sync.Once
	closed atomic.Bool
	// seq is the order this subscriber joined in, so delivery order is stable.
	seq uint64

	// lagged counts frames this subscriber missed because it was not reading.
	lagged atomic.Uint64
}

// Lagged reports how many frames this subscriber has missed so far. The next
// frame delivered carries the same number in its Lagged field, so a subscriber
// that only reads the channel still learns about the gap.
func (s *Subscription) Lagged() uint64 { return s.lagged.Load() }

// Close unsubscribes. It is safe to call more than once, and safe to call from
// the goroutine that reads C.
func (s *Subscription) Close() {
	s.once.Do(func() {
		s.closed.Store(true)
		s.bus.remove(s)
		close(s.ch)
	})
}

// Bus fans events out to subscribers.
//
// The zero value is not usable; call NewBus. A Bus is safe for concurrent use,
// which it has to be, because the tick loop publishes while the HTTP layer and
// any WS layer subscribe.
type Bus struct {
	mu   sync.Mutex
	subs map[*Subscription]struct{}
	seq  atomic.Uint64
	// subSeq numbers subscriptions in join order, so Publish can deliver in a
	// stable order instead of Go's randomised map order.
	subSeq atomic.Uint64
}

// NewBus returns an empty bus.
func NewBus() *Bus {
	return &Bus{subs: map[*Subscription]struct{}{}}
}

// defaultBuffer is how many frames a subscriber may fall behind by. A tick at the
// fastest speed the client offers (10 days per real second) is a frame every
// hundred milliseconds, so this is several seconds of slack at normal frame
// sizes. Past it, frames are dropped and counted: a subscriber that cannot keep
// up cannot be helped by an unbounded queue, because the queue is only memory.
const defaultBuffer = 64

// Subscribe registers a subscriber and returns its subscription. Closing the
// subscription is the only way to remove it; there is no expiry, because a
// subscriber that has gone away without closing is a bug in the subscriber and
// silently expiring it would hide that.
func (b *Bus) Subscribe() *Subscription {
	sub := &Subscription{bus: b, ch: make(chan Event, defaultBuffer), seq: b.subSeq.Add(1)}
	// C is the channel subscribers read; ch is the same channel used to publish.
	// Without this assignment C is nil, and a read on it blocks forever — which
	// looks exactly like a stream with no events rather than like a bug. Nobody
	// noticed until the first WebSocket layer subscribed.
	sub.C = sub.ch
	b.mu.Lock()
	b.subs[sub] = struct{}{}
	b.mu.Unlock()
	return sub
}

// Subscribers reports how many subscribers are attached, for the status route
// and for tests.
func (b *Bus) Subscribers() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.subs)
}

// Publish delivers an event to every current subscriber and returns how many
// received it.
//
// Delivery is a non-blocking send per subscriber. A subscriber whose buffer is
// full does not receive the frame; its lag counter goes up by one instead. The
// next frame it does receive carries Lagged so it can tell its client. Publish
// never blocks, so a stalled subscriber cannot stall the simulation.
func (b *Bus) Publish(kind Kind, tick, day int, payload any) int {
	ev := Event{
		Kind:    kind,
		Seq:     b.seq.Add(1),
		Tick:    tick,
		Day:     day,
		Payload: payload,
	}

	b.mu.Lock()
	subs := make([]*Subscription, 0, len(b.subs))
	for s := range b.subs {
		subs = append(subs, s)
	}
	b.mu.Unlock()
	// Sorted so that delivery order is the subscription order rather than Go's
	// map iteration order, which is randomised. Two subscribers therefore see
	// frames in the same relative order, which is what makes the fan-out
	// testable at all.
	sort.Slice(subs, func(i, j int) bool { return subs[i].seq < subs[j].seq })

	delivered := 0
	for _, s := range subs {
		if s.closed.Load() {
			continue
		}
		ev.Lagged = s.lagged.Load()
		select {
		case s.ch <- ev:
			delivered++
		default:
			s.lagged.Add(1)
		}
	}
	return delivered
}

func (b *Bus) remove(target *Subscription) {
	b.mu.Lock()
	delete(b.subs, target)
	b.mu.Unlock()
}
