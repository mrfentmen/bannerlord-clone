// Package events is the campaign event framework: the data-driven layer that
// turns state transitions into recorded, consequential world events.
//
// The problem it solves: wars are declared, towns change hands, rulers die,
// and rebellions brew, but none of that existed as a fact anyone could react
// to. The cause log records field changes; it does not say "a war began".
// This system watches for the transitions, evaluates each event definition's
// trigger and conditions, applies its consequences through the write set, and
// records the event as append-only history on the state.
//
// A definition is data: kind, trigger, conditions, consequence, description.
// Adding a new event means adding a definition, never touching the engine.
//
// Detection is state-based with deduplication against the recorded events, so
// it is robust to cause-log compaction: a war that began is visible in the
// war table whether or not its log row survived. The one exception is
// settlement capture, where only the log row shows the holder changed; those
// rows are read from the previous tick, which the system sees exactly once.
//
// The system reads committed state and the shared log, and stages writes like
// any other system. It never calls another system, and no system calls it.
// Consequences are confined to the relation network, personal renown and
// influence, side stability, and spawning rebel parties: the fields other
// systems own (unrest, loyalty, prices, food) are left to their owners.
package events

import (
	"fmt"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the campaign event framework system.
func System() sim.System {
	return sim.System{
		Name: "events",
		Doc:  "detects war, capture, death, rebellion, and famine transitions; applies consequences; records them as history",
		Runs: run,
	}
}

// candidate is one detected transition waiting for its definition's
// conditions and consequences.
type candidate struct {
	kind      model.EventKind
	sideA     int
	sideB     int
	actor     int
	target    int
	magnitude float64
	// tick is when the happening occurred (the trigger tick), not when it
	// was observed. The recorded event carries this tick, so the dedup key
	// built from a detection matches the key built from the recorded event.
	tick int
	note string
	read string
}

// eventKey deduplicates detections against recorded history. Two detections
// with the same key are the same happening, seen twice.
type eventKey struct {
	kind   model.EventKind
	sideA  int
	sideB  int
	actor  int
	target int
	tick   int
}

func keyOf(kind model.EventKind, sideA, sideB, actor, target, tick int) eventKey {
	return eventKey{kind: kind, sideA: sideA, sideB: sideB, actor: actor, target: target, tick: tick}
}

// definition is one event kind's data: how to detect it, when it counts, what
// it changes, and how it reads in the log.
type definition struct {
	kind model.EventKind
	// detect returns candidates from committed state. It must be
	// deterministic: same state, same candidates, same order.
	detect func(v *sim.View, fired map[eventKey]bool) []candidate
	// cond is the extra state predicate beyond detection. Nil means the
	// detection stands on its own.
	cond func(v *sim.View, c candidate) bool
	// apply stages the consequences. The event record itself is staged by the
	// framework after apply returns.
	apply func(v *sim.View, w *sim.WriteSet, c candidate)
}

func run(v *sim.View, w *sim.WriteSet) {
	// The fired set is rebuilt every tick from the append-only record, so a
	// detection that already produced an event never fires twice, even across
	// log compaction or a re-run of the same tick's detection.
	fired := make(map[eventKey]bool, len(v.State.Events))
	for _, e := range v.State.Events {
		tk := e.Tick
		if e.Kind == model.EventRulerDied {
			// A ruler dies once: the happening's identity is the ruler, not
			// the tick the death was observed on. Without this, a second
			// observation of the same corpse would look like a new death.
			tk = 0
		}
		fired[keyOf(e.Kind, e.SideA, e.SideB, e.Actor, e.Target, tk)] = true
	}
	for _, d := range definitions() {
		for _, c := range d.detect(v, fired) {
			if d.cond != nil && !d.cond(v, c) {
				continue
			}
			d.apply(v, w, c)
			record(v, w, d.kind, c)
		}
	}
}

// record stages the event as append-only history. The id is the record's own
// position, assigned at commit time when the final length is known, which
// keeps ids dense and deterministic.
func record(v *sim.View, w *sim.WriteSet, kind model.EventKind, c candidate) {
	ev := &model.Event{
		Kind:      kind,
		Tick:      c.tick,
		Year:      v.Year,
		SideA:     c.sideA,
		SideB:     c.sideB,
		Actor:     c.actor,
		Target:    c.target,
		Magnitude: c.magnitude,
		Note:      c.note,
	}
	w.CreateEntity(func(s *model.State) {
		ev.ID = len(s.Events)
		s.Events = append(s.Events, ev)
	})
}

func definitions() []definition {
	return []definition{
		warDeclaredDef(),
		warEndedDef(),
		settlementCapturedDef(),
		rulerDiedDef(),
		rebellionDef(),
		rebellionQuelledDef(),
		famineBeganDef(),
		famineEndedDef(),
	}
}

// --- war declared ---
// A war the faction AI started is now a fact the world reacts to: the two
// sides' opinion of each other drops, which is what makes a declared war
// politically expensive beyond the influence the declarer already paid.

func warDeclaredDef() definition {
	return definition{
		kind: model.EventWarDeclared,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			var out []candidate
			for _, wid := range v.State.WarIDs() {
				wr := v.State.Wars[wid]
				if wr.EndTick >= 0 {
					continue
				}
				k := keyOf(model.EventWarDeclared, wr.SideA, wr.SideB, 0, 0, int(wr.StartTick))
				if fired[k] {
					continue
				}
				fired[k] = true
				out = append(out, candidate{
					sideA: wr.SideA,
					sideB: wr.SideB,
					tick:  int(wr.StartTick),
					note:  fmt.Sprintf("war declared between side#%d and side#%d", wr.SideA, wr.SideB),
					read:  shared.ReadString(shared.PairI("war", wid), shared.PairF("start_tick", wr.StartTick)),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {
			ec := v.Cfg.Events
			w.AddSideRelation(c.sideA, c.sideB, -ec.WarDeclareRelationHit,
				c.read, nil, "war declared")
		},
	}
}

// --- war ended ---
// A concluded war is recorded so the director and the player can see that the
// guns went quiet. The faction AI already handled the peace terms; this
// system's job is the record, which is what unblocks trade, aid, and the
// director's post-war logic.

func warEndedDef() definition {
	return definition{
		kind: model.EventWarEnded,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			var out []candidate
			for _, wid := range v.State.WarIDs() {
				wr := v.State.Wars[wid]
				if wr.EndTick < 0 {
					continue
				}
				k := keyOf(model.EventWarEnded, wr.SideA, wr.SideB, 0, 0, int(wr.EndTick))
				if fired[k] {
					continue
				}
				fired[k] = true
				out = append(out, candidate{
					sideA:     wr.SideA,
					sideB:     wr.SideB,
					tick:      int(wr.EndTick),
					magnitude: wr.Battles,
					note:      fmt.Sprintf("war ended between side#%d and side#%d after %.0f battles", wr.SideA, wr.SideB, wr.Battles),
					read:      shared.ReadString(shared.PairI("war", wid), shared.PairF("battles", wr.Battles)),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {},
	}
}

// --- settlement captured ---
// Detected from the previous tick's cause-log rows: a town's holder changed
// to a ruler of another side. Same-side holder changes are internal politics,
// not conquest, and produce no event.

func settlementCapturedDef() definition {
	return definition{
		kind: model.EventSettlementCaptured,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			var out []candidate
			if v.Tick == 0 {
				return nil
			}
			for _, row := range v.Log.Rows() {
				if row.Tick != v.Tick-1 {
					continue
				}
				if row.Kind != model.KindTown || row.Field != "holder" {
					continue
				}
				oldHolder := v.State.Rulers[int(row.Old)]
				newHolder := v.State.Rulers[int(row.New)]
				if oldHolder == nil || newHolder == nil {
					continue
				}
				if oldHolder.SideID == newHolder.SideID {
					continue
				}
				k := keyOf(model.EventSettlementCaptured, newHolder.SideID, oldHolder.SideID,
					int(row.New), row.Entity, row.Tick)
				if fired[k] {
					continue
				}
				fired[k] = true
				t := v.State.Towns[row.Entity]
				name := fmt.Sprintf("town#%d", row.Entity)
				if t != nil {
					name = t.Name
				}
				out = append(out, candidate{
					sideA:  newHolder.SideID,
					sideB:  oldHolder.SideID,
					actor:  int(row.New),
					target: row.Entity,
					tick:   row.Tick,
					note:   fmt.Sprintf("%s captured %s from side#%d", newHolder.Name, name, oldHolder.SideID),
					read:   shared.ReadString(shared.PairI("town", row.Entity), shared.PairI("old_holder", int(row.Old)), shared.PairI("new_holder", int(row.New))),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {
			ec := v.Cfg.Events
			// The deposed holder's grudge, and the word spreading through
			// their allies: conquest makes enemies the way betrayal does,
			// only louder. This mirrors the relation system's chain-9
			// spread without touching that system. The deposed holder is
			// recovered from the same log row the detection read, so the
			// consequence names the same pair the trigger saw.
			deposed := -1
			for _, row := range v.Log.Rows() {
				if row.Tick == v.Tick-1 && row.Kind == model.KindTown &&
					row.Field == "holder" && row.Entity == c.target && int(row.New) == c.actor {
					deposed = int(row.Old)
				}
			}
			if deposed < 0 {
				return
			}
			w.AddRelation(c.actor, deposed, -ec.CaptureRelationHit, c.read, nil, "lost a town to conquest")
			victim := v.State.Rulers[deposed]
			if victim != nil {
				for _, other := range v.State.RulerIDsSorted() {
					if other == c.actor || other == deposed {
						continue
					}
					if v.State.Relation(deposed, other) > 0.3 {
						w.AddRelation(c.actor, other,
							-ec.CaptureRelationHit*0.5*shared.Clamp01(v.State.Relation(deposed, other)),
							c.read, nil, "conquest reached an ally")
					}
				}
			}
			w.Add(model.KindRuler, c.actor, "renown", ec.CaptureRenown, c.read, nil, "captured a town")
		},
	}
}

// --- ruler died ---
// A dead ruler stays in state with the alive flag cleared, so detection is a
// single state scan. The side loses stability: losing a lord is a political
// fact, not just a smaller roster.

func rulerDiedDef() definition {
	return definition{
		kind: model.EventRulerDied,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			var out []candidate
			for _, rid := range v.State.RulerIDsSorted() {
				r := v.State.Rulers[rid]
				if r.IsAlive {
					continue
				}
				k := keyOf(model.EventRulerDied, r.SideID, 0, rid, 0, 0)
				if fired[k] {
					continue
				}
				fired[k] = true
				out = append(out, candidate{
					sideA: r.SideID,
					actor: rid,
					tick:  v.Tick,
					note:  fmt.Sprintf("ruler %s (side#%d) died", r.Name, r.SideID),
					read:  shared.ReadString(shared.PairI("ruler", rid)),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {
			ec := v.Cfg.Events
			if s := v.State.Sides[c.sideA]; s != nil {
				w.Add(model.KindSide, c.sideA, "side_stability", -ec.RulerDeathStabilityHit,
					c.read, nil, "a ruler died")
			}
		},
	}
}

// --- rebellion ---
// A town past the unrest and loyalty lines, sitting there long enough, breaks
// into open revolt. The consequence is real: part of the militia deserts and a
// hostile rebel band takes the field. The rebellion is also recorded, which is
// what lets the quelled detection below close the loop.

func rebellionDef() definition {
	return definition{
		kind: model.EventRebellion,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			ec := v.Cfg.Events
			var out []candidate
			for _, tid := range v.State.TownIDs() {
				t := v.State.Towns[tid]
				if t.Unrest < ec.RebellionUnrest {
					continue
				}
				if t.Loyalty > ec.RebellionLoyalty {
					continue
				}
				if t.DaysBelowLoyalty < ec.RebellionDays {
					continue
				}
				if openRebellion(v.State, tid) {
					continue
				}
				if !cooledDown(v.State, tid, v.Tick, ec.RebellionCooldownDays) {
					continue
				}
				k := keyOf(model.EventRebellion, t.HolderSide, 0, 0, tid, v.Tick)
				if fired[k] {
					continue
				}
				fired[k] = true
				troops := t.Militia * ec.RebellionMilitiaShare
				if troops < ec.RebellionMinTroops {
					troops = ec.RebellionMinTroops
				}
				out = append(out, candidate{
					sideA:     t.HolderSide,
					target:    tid,
					tick:      v.Tick,
					magnitude: troops,
					note:      fmt.Sprintf("rebellion in %s: %.0f rebels take the field", t.Name, troops),
					read: shared.ReadString(
						shared.PairI("town", tid),
						shared.Pair("unrest", t.Unrest),
						shared.Pair("loyalty", t.Loyalty),
						shared.PairF("days_below", t.DaysBelowLoyalty)),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {
			t := v.State.Towns[c.target]
			if t == nil {
				return
			}
			troops := c.magnitude
			if troops > t.Militia {
				troops = t.Militia
			}
			// The rebels are the town's own militia deserting: the garrison
			// shrinks by exactly what takes the field, so the rebellion is a
			// transfer of force, not a conjuring of it.
			if troops > 0 {
				w.Add(model.KindTown, c.target, "militia", -troops, c.read, nil, "militia deserted to the rebellion")
			}
			rebels := &model.Party{
				Name:       "Rebels of " + t.Name,
				SideID:     -1,
				RulerID:    -1,
				X:          t.X,
				Y:          t.Y,
				DestX:      t.X,
				DestY:      t.Y,
				Troops:     troops,
				Food:       troops * 4,
				Morale:     0.7,
				Activity:   model.ActRaiding,
				RaidTarget: -1,
				IsRaider:   true,
				HomeTown:   c.target,
				DestTown:   c.target,
			}
			w.SpawnParty(rebels)
		},
	}
}

// --- rebellion quelled ---
// An open rebellion ends when the town is calm and loyal again. The record
// closes the loop so the town can, after the cooldown, rebel again.

func rebellionQuelledDef() definition {
	return definition{
		kind: model.EventRebellionQuelled,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			ec := v.Cfg.Events
			var out []candidate
			for _, tid := range v.State.TownIDs() {
				t := v.State.Towns[tid]
				if !openRebellion(v.State, tid) {
					continue
				}
				if t.Loyalty <= ec.RebellionLoyalty+0.2 || t.Unrest >= ec.RebellionUnrest-0.2 {
					continue
				}
				k := keyOf(model.EventRebellionQuelled, t.HolderSide, 0, 0, tid, v.Tick)
				if fired[k] {
					continue
				}
				fired[k] = true
				out = append(out, candidate{
					sideA:  t.HolderSide,
					target: tid,
					tick:   v.Tick,
					note:   fmt.Sprintf("rebellion in %s quelled", t.Name),
					read:   shared.ReadString(shared.PairI("town", tid)),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {
			if s := v.State.Sides[c.sideA]; s != nil {
				w.Add(model.KindSide, c.sideA, "side_stability", 0.02, c.read, nil, "a rebellion was quelled")
			}
		},
	}
}

// --- famine began / ended ---
// Starvation is a flag the food system owns; this framework records its edges
// so the director can react to a famine starting and stopping. The record is
// the consequence that matters: it is what the director reads next tick.

func famineBeganDef() definition {
	return definition{
		kind: model.EventFamineBegan,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			var out []candidate
			for _, tid := range v.State.TownIDs() {
				t := v.State.Towns[tid]
				if !t.IsStarving {
					continue
				}
				if openFamine(v.State, tid) {
					continue
				}
				k := keyOf(model.EventFamineBegan, t.HolderSide, 0, 0, tid, v.Tick)
				if fired[k] {
					continue
				}
				fired[k] = true
				out = append(out, candidate{
					sideA:  t.HolderSide,
					target: tid,
					tick:   v.Tick,
					note:   fmt.Sprintf("famine began in %s", t.Name),
					read:   shared.ReadString(shared.PairI("town", tid)),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {},
	}
}

func famineEndedDef() definition {
	return definition{
		kind: model.EventFamineEnded,
		detect: func(v *sim.View, fired map[eventKey]bool) []candidate {
			var out []candidate
			for _, tid := range v.State.TownIDs() {
				t := v.State.Towns[tid]
				if t.IsStarving {
					continue
				}
				if !openFamine(v.State, tid) {
					continue
				}
				k := keyOf(model.EventFamineEnded, t.HolderSide, 0, 0, tid, v.Tick)
				if fired[k] {
					continue
				}
				fired[k] = true
				out = append(out, candidate{
					sideA:  t.HolderSide,
					target: tid,
					tick:   v.Tick,
					note:   fmt.Sprintf("famine ended in %s", t.Name),
					read:   shared.ReadString(shared.PairI("town", tid)),
				})
			}
			return out
		},
		apply: func(v *sim.View, w *sim.WriteSet, c candidate) {},
	}
}

// openRebellion reports whether a town has a rebellion event with no
// quelling after it.
func openRebellion(s *model.State, townID int) bool {
	rebelled := -1
	for _, e := range s.Events {
		if e.Target != townID {
			continue
		}
		switch e.Kind {
		case model.EventRebellion:
			rebelled = e.Tick
		case model.EventRebellionQuelled:
			if rebelled >= 0 && e.Tick > rebelled {
				rebelled = -1
			}
		}
	}
	return rebelled >= 0
}

// cooledDown reports whether enough time has passed since the town's last
// quelled rebellion for it to rebel again.
func cooledDown(s *model.State, townID int, tick int, days float64) bool {
	lastQuelled := -1
	for _, e := range s.Events {
		if e.Kind == model.EventRebellionQuelled && e.Target == townID && e.Tick > lastQuelled {
			lastQuelled = e.Tick
		}
	}
	if lastQuelled < 0 {
		return true
	}
	return float64(tick-lastQuelled) >= days
}

// openFamine reports whether a town has a famine-began event with no
// famine-ended after it.
func openFamine(s *model.State, townID int) bool {
	began := -1
	for _, e := range s.Events {
		if e.Target != townID {
			continue
		}
		switch e.Kind {
		case model.EventFamineBegan:
			began = e.Tick
		case model.EventFamineEnded:
			if began >= 0 && e.Tick > began {
				began = -1
			}
		}
	}
	return began >= 0
}
