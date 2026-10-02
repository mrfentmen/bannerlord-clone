package campaign

import (
	"fmt"
	"strings"

	"mbclone/simulation/cmd/apiserver/events"
	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// Notifications are generated from cause-log rows as they appear, not authored.
//
// The simulation already decided which changes mattered enough to log: a field is
// logged only when it crossed the logging threshold for its own scale, and only
// when the system that wrote it recorded why. So a row is the right place to hang
// a message from, and the row's own read record is the evidence the message cites.
//
// A row becomes a notification when it is one of the things a player would want
// interrupting them for. The thresholds below are the simulation's, not invented:
// tax_harsh_unrest is the level the currency system says collection fails at,
// supply.days_of_food_starved is what the supply system calls going hungry, and
// loyalty has no constant, so a quarter is the level the client's own rebellious
// flag is defined at.

// notificationRules maps a cause-log row to a priority, or reports that the row is
// not worth a notification.
func (c *Campaign) notificationPriority(r cause.Row) (string, bool) {
	switch {
	case r.Field == "is_starving" && r.New != 0:
		return "critical", true
	case r.Field == "is_besieged" && r.New != 0:
		return "critical", true
	case r.Field == "war_start_tick":
		return "critical", true
	case r.Field == "loyalty" && r.New < 0.25 && r.Old >= 0.25:
		return "important", true
	case r.Field == "unrest" && r.New > c.cfg.Currency.TaxHarshUnrest && r.Old <= c.cfg.Currency.TaxHarshUnrest:
		return "important", true
	case r.Field == "wages_owed" && r.New > 0 && r.Old <= 0:
		return "important", true
	case r.Field == "construction_days_left" && r.New <= 0 && r.Old > 0:
		return "important", true
	case r.Field == "construction_building" && r.New < 0 && r.Old >= 0:
		return "important", true
	}
	return "", false
}

// notificationFrom builds a notification out of a cause-log row. The text is
// composed from the row's read record, its system, and the field's own formatted
// before and after values, so the sentence is the simulation's and the client
// never writes one.
func (c *Campaign) notificationFrom(r cause.Row, priority string) wire.Notification {
	entity := c.state.Name(r.Kind, r.Entity)
	field, hasField := model.FieldByName(r.Kind, r.Field)

	before, after := fmt.Sprintf("%.4g", r.Old), fmt.Sprintf("%.4g", r.New)
	unit := ""
	if hasField {
		before, after = field.Format(r.Old), field.Format(r.New)
		unit = field.Unit
	}
	subject := subjectFor(r.Kind)
	what := fieldLabel(r.Field)
	if unit != "" {
		what += " (" + unit + ")"
	}

	text := fmt.Sprintf("%s %s: %s is now %s.", subject, what, before, after)
	if r.Note != "" {
		text += " " + sentence(r.Note)
	}
	if entity != "" {
		text = entity + ": " + strings.ToLower(text[:1]) + text[1:]
	}

	ent := EntityID(r.Kind, r.Entity)
	fieldName := r.Field
	day := r.Tick % 365

	return wire.Notification{
		ID:       RowID(r.ID),
		Day:      day,
		Priority: priority,
		Text:     text,
		EntityID: &ent,
		Field:    &fieldName,
		CausedBy: RowID(r.ID),
	}
}

// subjectFor is what the notification calls the entity kind, in the product's
// voice.
func subjectFor(k model.Kind) string {
	switch k {
	case model.KindTown:
		return "A settlement"
	case model.KindParty:
		return "A party"
	case model.KindRuler:
		return "A character"
	case model.KindSide:
		return "A faction"
	case model.KindWar:
		return "A war"
	case model.KindSiege:
		return "A siege"
	default:
		return "The world"
	}
}

// fieldLabel turns a field name into words for a sentence.
func fieldLabel(field string) string {
	words := strings.ReplaceAll(field, "_", " ")
	if words == "" {
		return "changed"
	}
	return words
}

// sentence puts a capital on a note and a full stop on it, so a lowercase note from
// the simulation reads as a sentence in the notification list.
func sentence(note string) string {
	note = strings.TrimSpace(note)
	if note == "" {
		return ""
	}
	if r := []rune(note); len(r) > 0 {
		note = strings.ToUpper(string(r[0])) + note[1:]
	}
	if !strings.HasSuffix(note, ".") && !strings.HasSuffix(note, "!") && !strings.HasSuffix(note, "?") {
		note += "."
	}
	return note
}

// harvestNotifications turns cause-log rows that arrived since the last harvest
// into notifications.
//
// It runs in the engine's post-tick hook, which is the runner's observation point
// rather than a system: nothing it returns can reach a WriteSet, so it cannot
// influence a simulation result.
func (c *Campaign) harvestNotifications() []wire.Notification {
	if c.seenRow == nil {
		c.seenRow = map[int]bool{}
	}
	var fresh []wire.Notification
	for _, r := range c.log.Rows() {
		if c.seenRow[r.ID] {
			continue
		}
		c.seenRow[r.ID] = true
		priority, worth := c.notificationPriority(r)
		if !worth {
			continue
		}
		fresh = append(fresh, c.notificationFrom(r, priority))
	}
	if len(fresh) == 0 {
		return nil
	}
	c.notifs = append(c.notifs, fresh...)
	// Bounded, keeping the newest: a notification the player will never scroll
	// back to is not worth holding in memory.
	if len(c.notifs) > c.opts.NotificationLimit*4 {
		c.notifs = c.notifs[len(c.notifs)-c.opts.NotificationLimit*4:]
	}
	return fresh
}

// notificationsLocked returns the newest notifications for a snapshot.
func (c *Campaign) notificationsLocked() []wire.Notification {
	out := make([]wire.Notification, 0, len(c.notifs))
	for _, n := range c.notifs {
		out = append(out, n)
	}
	if len(out) > c.opts.NotificationLimit {
		out = out[len(out)-c.opts.NotificationLimit:]
	}
	return out
}

// afterTick is the engine's post-commit hook. It is the runner observing the
// simulation, not a system influencing it.
//
// It does the three things that are bookkeeping rather than simulation: record
// prices into the history ring, harvest new cause rows into notifications, and ask
// for a periodic snapshot when one is due.
func (c *Campaign) afterTick(v *sim.View) {
	c.observePrices()

	fresh := c.harvestNotifications()
	for _, n := range fresh {
		c.bus.Publish(events.KindNotification, c.state.Tick, c.state.Tick%365, n)
	}

	if c.opts.SnapshotEvery > 0 && c.state.Tick%c.opts.SnapshotEvery == 0 {
		c.snapshotPending = c.renderSnapshotLocked()
	}

	c.publishTick()
	if !c.partyIsMarching() && c.ro.marchStart >= 0 {
		c.ro.marchStart = -1
	}
}

// observePrices records today's price for every tradable good in every town, so the
// client has a real series to draw rather than a single number.
func (c *Campaign) observePrices() {
	day := c.state.Tick % 365
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t == nil || t.Population <= 0 {
			continue
		}
		for _, g := range tradeGoods {
			price, ok := c.state.Get(model.KindTown, id, g.priceField)
			if !ok {
				continue
			}
			key := marketKey{town: id, good: g.ID}
			ps := c.history[key]
			if ps == nil {
				ps = &priceSeries{limit: c.opts.MarketHistory}
				c.history[key] = ps
			}
			ps.observe(day, price, c.opts.MarketHistory)
		}
	}
}

// publishTick sends a world-state frame to any WebSocket layer.
//
// The frame is cumulative rather than incremental, which is what makes a dropped
// frame harmless: the next one describes the state as it now is. The event bus
// never blocks this, so a slow subscriber cannot slow the simulation down.
func (c *Campaign) publishTick() {
	if c.bus.Subscribers() == 0 {
		return
	}
	frame := wire.TickUpdate{
		Tick: c.state.Tick,
		Day:  c.state.Tick % 365,
	}
	party := c.partyForOrder("")
	if party != nil {
		frame.Party = map[string]any{
			"food":      round2(party.Food),
			"medicine":  round2(party.Medicine),
			"metal":     round2(party.Metal),
			"money":     round2(party.Money),
			"morale":    round3(party.Morale),
			"fatigue":   round3(party.Fatigue),
			"wagesOwed": round2(party.WagesOwed),
			"troops":    c.ro.render(party.Troops, c.wagePerTroop()),
		}
	}
	frame.Ledger = ptrLedger(c.ledgerLocked())
	frame.Warnings = c.warningsLocked()
	c.bus.Publish(events.KindTick, c.state.Tick, c.state.Tick%365, frame)
}

func ptrLedger(l wire.Ledger) *wire.Ledger { return &l }
