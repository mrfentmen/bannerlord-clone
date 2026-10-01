// Package model defines the simulation's entities, its tracked fields, and the
// state a tick reads from and writes to.
//
// Two ideas carry the whole design.
//
// First, every mutable quantity the player could ever ask about has a Field
// with a stable name. Fields are how systems communicate: one system writes
// town.unrest, another reads it. Nothing is passed between systems by
// function call, because there are no cross-system calls to pass anything
// through (CONSTITUTION.md section 2.1).
//
// Second, state is split into a committed State and a per-tick WriteSet.
// Systems read the committed State and stage every change into the WriteSet.
// The engine applies the WriteSet at the end of the tick. That is what makes a
// system's result independent of when it runs relative to the others: a system
// never sees another system's output from the same tick, so reordering the
// systems cannot change any result.
package model

import "fmt"

// Kind is the entity family a field belongs to. A field is only valid on one
// kind, so a system cannot accidentally write town.unrest onto a party.
type Kind int

const (
	KindTown Kind = iota
	KindVillage
	KindParty
	KindRuler
	KindSide
	KindRoute
	KindSiege
	KindWar
	KindClan
	KindWorkshop
)

// String names the kind for error messages and log output.
func (k Kind) String() string {
	switch k {
	case KindTown:
		return "town"
	case KindVillage:
		return "village"
	case KindParty:
		return "party"
	case KindRuler:
		return "ruler"
	case KindSide:
		return "side"
	case KindRoute:
		return "route"
	case KindSiege:
		return "siege"
	case KindWar:
		return "war"
	case KindClan:
		return "clan"
	case KindWorkshop:
		return "workshop"
	default:
		return "unknown"
	}
}

// ValueKind is how a field's value is rendered in the cause log. It exists so
// the Why panel can show "Lord Reyes" instead of "entity 4121" and so numeric
// formatting is decided in one place instead of at each call site.
type ValueKind int

const (
	// ValueFloat is a continuous quantity such as unrest or food_stock.
	ValueFloat ValueKind = iota
	// ValueInt is a whole-number quantity such as population or garrison.
	ValueInt
	// ValueFlag is a boolean, stored as 0 or 1.
	ValueFlag
	// ValueRulerRef is an integer that names a ruler.
	ValueRulerRef
	// ValueSideRef is an integer that names a side.
	ValueSideRef
	// ValueText is a short label, such as a party's current activity.
	ValueText
)

// Field describes one tracked quantity.
type Field struct {
	// Name is the stable identifier used in code, in the cause log, and in
	// chain assertions. It never changes once chains have been written against
	// it, because renaming it would silently break every stored why-chain.
	Name string
	// Kind is the entity family this field belongs to.
	Kind Kind
	// Value describes how the value is stored and rendered.
	Value ValueKind
	// Unit is a short human label: "person-days", "troops", "share", "money".
	Unit string
	// Tracked reports whether changes to this field are written to the cause
	// log. Untracked fields are internal bookkeeping the player never sees and
	// that no chain depends on, so logging them would drown the log.
	Tracked bool
	// Min and Max clamp the field. A clamp is a modelling decision: it stops
	// one bad tick from producing a negative population or an unrest above 1.
	Min, Max float64
	// Enum names the permitted values when Value is ValueText.
	Enum []string
	// LogMin is this field's own logging threshold, in the field's own units.
	// Zero means "use the config's global thresholds".
	//
	// A per-field threshold exists because fields are measured on wildly
	// different scales. Food stock moves in person-days and a change of one is
	// worth a log row; an opinion score runs from minus one to plus one, and a
	// change of one ten-thousandth is arithmetic noise. A single global
	// threshold either drowns the log in large-field rounding or drops
	// small-field crises, and worse, it lets a very large entity set (a whole
	// relation matrix) generate tens of thousands of rows a day.
	//
	// It is last in the struct so the registry's positional literals stay in
	// the order every field was written in.
	LogMin float64
}

// Thresholds returns the absolute and relative logging thresholds to use for
// this field, taking the config's global values and overriding the absolute
// one where the field declares its own scale.
func (f Field) Thresholds(minAbs, minRel float64) (float64, float64) {
	if f.LogMin > 0 {
		return f.LogMin, minRel
	}
	return minAbs, minRel
}

// Format renders a value for the cause log.
func (f Field) Format(v float64) string {
	switch f.Value {
	case ValueFlag:
		if v != 0 {
			return "yes"
		}
		return "no"
	case ValueInt:
		return fmt.Sprintf("%d", int64(v))
	case ValueRulerRef, ValueSideRef:
		if v < 0 {
			return "none"
		}
		return fmt.Sprintf("#%d", int64(v))
	case ValueText:
		idx := int(v)
		if idx < 0 || idx >= len(f.Enum) {
			return "unknown"
		}
		return f.Enum[idx]
	default:
		return fmt.Sprintf("%.4f", v)
	}
}

// The tracked field registry. Field names are the vocabulary the whole cause
// web is written in, so this table is the closest thing the project has to a
// shared glossary. CAUSE_EFFECT.md section 2 fixes the town fields; sections 8
// and 9 add the resources, ruler, army, siege, and war fields.
// fields is keyed by kind and name together, because the same short name can
// legitimately exist on two entity families: a town starves and an army
// starves, and both facts matter, but they are different facts about different
// objects. A single flat namespace would force one of them to be renamed to
// something less honest, so the pair is the key and every lookup supplies both.
var fields = map[FieldKey]Field{}

// FieldKey identifies a field: an entity family plus a name.
type FieldKey struct {
	Kind Kind
	Name string
}

func register(f Field) {
	k := FieldKey{Kind: f.Kind, Name: f.Name}
	if _, dup := fields[k]; dup {
		panic("model: duplicate field " + f.Kind.String() + "." + f.Name)
	}
	fields[k] = f
}

// FieldByName returns the registry entry for a field of a given entity family.
func FieldByName(kind Kind, name string) (Field, bool) {
	f, ok := fields[FieldKey{kind, name}]
	return f, ok
}

// MustField returns a registry entry or panics. Used at init time and in tests,
// where a bad name is a programming error rather than user input.
func MustField(kind Kind, name string) Field {
	f, ok := fields[FieldKey{kind, name}]
	if !ok {
		panic("model: unknown field " + kind.String() + "." + name)
	}
	return f
}

// AllFields returns every registered field keyed by "kind.name", for the
// decoupling and coverage tests that sweep the whole table.
func AllFields() map[string]Field {
	out := make(map[string]Field, len(fields))
	for k, v := range fields {
		out[k.Kind.String()+"."+k.Name] = v
	}
	return out
}

// TrackedFieldsOfKind lists tracked fields for one entity family, sorted by
// name, so iteration order is deterministic across runs.
func TrackedFieldsOfKind(k Kind) []string {
	var out []string
	for key, f := range fields {
		if key.Kind == k && f.Tracked {
			out = append(out, key.Name)
		}
	}
	sortStrings(out)
	return out
}

// TrackedFieldCount returns how many tracked fields exist across all families,
// for the coverage test's denominator.
func TrackedFieldCount() int {
	n := 0
	for _, f := range fields {
		if f.Tracked {
			n++
		}
	}
	return n
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

// --- town fields, from CAUSE_EFFECT.md section 2 plus section 8 resources ---

func init() {
	const (
		zero, one = 0.0, 1.0
		inf       = 1e12
	)
	register(Field{"population", KindTown, ValueInt, "people", true, 0, inf, nil, 0})
	register(Field{"workers", KindTown, ValueInt, "workers", true, 0, inf, nil, 0})
	register(Field{"food_stock", KindTown, ValueFloat, "person-days", true, 0, inf, nil, 0})
	register(Field{"food_production", KindTown, ValueFloat, "person-days/day", true, 0, inf, nil, 0})
	register(Field{"food_demand", KindTown, ValueFloat, "person-days/day", true, 0, inf, nil, 0})
	register(Field{"medicine_stock", KindTown, ValueFloat, "doses", true, 0, inf, nil, 0})
	register(Field{"sanitation", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"infected", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"crowding", KindTown, ValueFloat, "index", true, zero, 4, nil, 0})
	register(Field{"unrest", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"loyalty", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"prosperity", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"tax_rate", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"garrison", KindTown, ValueInt, "troops", true, 0, inf, nil, 0})
	register(Field{"garrison_conduct", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"garrison_morale", KindTown, ValueFloat, "share", true, -1, one, nil, 0})
	register(Field{"militia", KindTown, ValueInt, "troops", true, 0, inf, nil, 0})
	register(Field{"crime", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"road_safety", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"money", KindTown, ValueFloat, "money", true, -inf, inf, nil, 0})
	register(Field{"gold", KindTown, ValueFloat, "gold", true, zero, inf, nil, 0})
	register(Field{"metal", KindTown, ValueFloat, "metal", true, zero, inf, nil, 0})
	register(Field{"price_food", KindTown, ValueFloat, "x base", true, 0, inf, nil, 0})
	register(Field{"price_medicine", KindTown, ValueFloat, "x base", true, 0, inf, nil, 0})
	register(Field{"price_metal", KindTown, ValueFloat, "x base", true, 0, inf, nil, 0})
	register(Field{"wages", KindTown, ValueFloat, "money/day", true, 0, inf, nil, 0})
	register(Field{"price_index", KindTown, ValueFloat, "x base", true, 0, inf, nil, 0})
	register(Field{"blockade", KindTown, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"recent_deaths", KindTown, ValueInt, "people", true, 0, inf, nil, 0})
	// deaths_today is the per-tick accumulator the death systems add to. It is
	// untracked because it is summed into recent_deaths within the same tick;
	// logging the accumulator and the published total would double every death
	// in the log and make the chain read as two separate events.
	register(Field{"deaths_today", KindTown, ValueInt, "people", false, 0, inf, nil, 0})
	// net_migration is the migration system's arrivals-minus-departures for a
	// tick. The migration system is its only writer; demography reads it. It is
	// untracked because demography publishes the same movement as a population
	// change, and logging both would make one flight look like two events.
	register(Field{"net_migration", KindTown, ValueInt, "people", false, -inf, inf, nil, 0})
	register(Field{"debt", KindTown, ValueFloat, "money", true, -inf, inf, nil, 0})
	register(Field{"is_starving", KindTown, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"is_besieged", KindTown, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"holder", KindTown, ValueRulerRef, "ruler", true, -1, inf, nil, 0})
	register(Field{"holder_side", KindTown, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"days_below_loyalty", KindTown, ValueInt, "days", true, 0, inf, nil, 0})
	register(Field{"food_imports", KindTown, ValueFloat, "person-days/day", true, 0, inf, nil, 0})
	register(Field{"food_exports", KindTown, ValueFloat, "person-days/day", true, 0, inf, nil, 0})
	register(Field{"medicine_imports", KindTown, ValueFloat, "doses/day", true, 0, inf, nil, 0})
	// arriving_cargo_* are staged by the logistics system and consumed by the
	// food and disease systems. They are the seam between a caravan arriving
	// and a town being fed or treated, and they are untracked because the
	// consuming system writes the same delivery into food_stock or
	// medicine_stock, which is the row a player needs to see.
	register(Field{"arriving_cargo_food", KindTown, ValueFloat, "person-days", false, 0, inf, nil, 0})
	register(Field{"arriving_cargo_medicine", KindTown, ValueFloat, "doses", false, 0, inf, nil, 0})
	register(Field{"arriving_cargo_metal", KindTown, ValueFloat, "metal", false, 0, inf, nil, 0})
	// Untracked bookkeeping: internal counters no chain depends on.
	register(Field{"food_days", KindTown, ValueFloat, "days", false, 0, inf, nil, 0})
	register(Field{"starve_days", KindTown, ValueInt, "days", false, 0, inf, nil, 0})
	register(Field{"death_memory", KindTown, ValueInt, "days", false, 0, inf, nil, 0})
	register(Field{"food_balance", KindTown, ValueFloat, "person-days/day", false, -inf, inf, nil, 0})
	register(Field{"starve_severity", KindTown, ValueFloat, "index", false, zero, inf, nil, 0})
	register(Field{"import_cut", KindTown, ValueFloat, "share", false, zero, one, nil, 0})
	register(Field{"food_yield", KindTown, ValueFloat, "person-days/day", false, 0, inf, nil, 0})
	register(Field{"employment", KindTown, ValueFloat, "share", false, zero, one, nil, 0})
	register(Field{"sick_workers", KindTown, ValueFloat, "count", false, 0, inf, nil, 0})
	register(Field{"scarcity", KindTown, ValueFloat, "ratio", false, zero, inf, nil, 0})
	register(Field{"raider_pressure", KindTown, ValueFloat, "index", false, zero, inf, nil, 0})
	register(Field{"patrol_coverage", KindTown, ValueFloat, "index", false, zero, inf, nil, 0})
	register(Field{"wages_target", KindTown, ValueFloat, "money/day", false, 0, inf, nil, 0})
	register(Field{"stock_target", KindTown, ValueFloat, "person-days", false, 0, inf, nil, 0})
	register(Field{"tax_income", KindTown, ValueFloat, "money/day", false, 0, inf, nil, 0})
	register(Field{"expenditure", KindTown, ValueFloat, "money/day", false, -inf, inf, nil, 0})
	register(Field{"net_cash", KindTown, ValueFloat, "money/day", false, -inf, inf, nil, 0})
	register(Field{"attractiveness", KindTown, ValueFloat, "index", false, -inf, inf, nil, 0})
	register(Field{"pressure", KindTown, ValueFloat, "index", false, zero, inf, nil, 0})
	register(Field{"quorum", KindTown, ValueFloat, "share", false, zero, one, nil, 0})
	register(Field{"vote_chance", KindTown, ValueFloat, "share", false, zero, one, nil, 0})
	register(Field{"desertions", KindTown, ValueFloat, "count", false, 0, inf, nil, 0})
	register(Field{"lost_deaths_total", KindTown, ValueInt, "people", false, 0, inf, nil, 0})
	register(Field{"lost_food_total", KindTown, ValueFloat, "person-days", false, 0, inf, nil, 0})
	register(Field{"collapse_score", KindTown, ValueFloat, "index", false, zero, inf, nil, 0})
	register(Field{"besiege_days", KindTown, ValueInt, "days", false, 0, inf, nil, 0})
	register(Field{"gate_pressure", KindTown, ValueFloat, "index", false, zero, inf, nil, 0})
	register(Field{"blockade_days", KindTown, ValueInt, "days", false, 0, inf, nil, 0})
	register(Field{"militia_payroll", KindTown, ValueFloat, "money/day", false, 0, inf, nil, 0})
	register(Field{"militia_readiness", KindTown, ValueFloat, "share", false, zero, one, nil, 0})
	// --- village fields ---
	register(Field{"village_population", KindVillage, ValueInt, "people", true, 0, inf, nil, 0})
	register(Field{"village_food", KindVillage, ValueFloat, "person-days", true, 0, inf, nil, 0})
	register(Field{"village_prosperity", KindVillage, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"village_raid_memory", KindVillage, ValueInt, "days", false, 0, inf, nil, 0})
	register(Field{"village_yield", KindVillage, ValueFloat, "person-days/day", false, 0, inf, nil, 0})
	register(Field{"village_link", KindVillage, ValueInt, "town", false, -1, inf, nil, 0})
	register(Field{"village_hearths", KindVillage, ValueInt, "tier", true, 1, 5, nil, 0})
	// --- party fields: parties, armies, and caravans share this shape ---
	register(Field{"troops", KindParty, ValueInt, "troops", true, 0, inf, nil, 0})
	register(Field{"party_food", KindParty, ValueFloat, "person-days", true, 0, inf, nil, 0})
	register(Field{"party_money", KindParty, ValueFloat, "money", true, -inf, inf, nil, 0})
	register(Field{"party_gold", KindParty, ValueFloat, "gold", true, zero, inf, nil, 0})
	register(Field{"party_metal", KindParty, ValueFloat, "metal", true, zero, inf, nil, 0})
	register(Field{"party_medicine", KindParty, ValueFloat, "doses", true, 0, inf, nil, 0})
	register(Field{"morale", KindParty, ValueFloat, "share", true, -1, one, nil, 0})
	register(Field{"fatigue", KindParty, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"wages_owed", KindParty, ValueFloat, "money", true, 0, inf, nil, 0})
	register(Field{"position_x", KindParty, ValueFloat, "leagues", true, 0, inf, nil, 0})
	register(Field{"position_y", KindParty, ValueFloat, "leagues", true, 0, inf, nil, 0})
	register(Field{"activity", KindParty, ValueText, "activity", true, 0, 0, []string{
		"idle", "marching", "raiding", "sieging", "trading", "patrolling",
		"resupplying", "returning", "defending",
	}, 0})
	register(Field{"dest_town", KindParty, ValueInt, "town", true, -1, inf, nil, 0})
	register(Field{"dest_ruler", KindParty, ValueInt, "ruler", true, -1, inf, nil, 0})
	register(Field{"home_town", KindParty, ValueInt, "town", false, -1, inf, nil, 0})
	register(Field{"days_out", KindParty, ValueInt, "days", false, 0, inf, nil, 0})
	register(Field{"speed", KindParty, ValueFloat, "leagues/day", false, 0, inf, nil, 0})
	register(Field{"distance", KindParty, ValueFloat, "leagues", false, 0, inf, nil, 0})
	register(Field{"days_food", KindParty, ValueFloat, "days", false, 0, inf, nil, 0})
	register(Field{"party_starving", KindParty, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"supply_distance", KindParty, ValueFloat, "leagues", false, inf, inf, nil, 0})
	register(Field{"is_raider", KindParty, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"is_mercenary", KindParty, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"is_caravan", KindParty, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"cargo_food", KindParty, ValueFloat, "person-days", true, 0, inf, nil, 0})
	register(Field{"cargo_medicine", KindParty, ValueFloat, "doses", true, 0, inf, nil, 0})
	register(Field{"cargo_metal", KindParty, ValueFloat, "metal", true, 0, inf, nil, 0})
	register(Field{"dest_town_party", KindParty, ValueInt, "town", false, -1, inf, nil, 0})
	register(Field{"arriving_cargo_food", KindParty, ValueFloat, "person-days", false, 0, inf, nil, 0})
	register(Field{"arriving_cargo_medicine", KindParty, ValueFloat, "doses", false, 0, inf, nil, 0})
	register(Field{"arriving_cargo_metal", KindParty, ValueFloat, "metal", false, 0, inf, nil, 0})
	register(Field{"attrition_rate", KindParty, ValueFloat, "share/day", false, zero, one, nil, 0})
	register(Field{"column_disease", KindParty, ValueFloat, "share", false, zero, one, nil, 0})
	register(Field{"intended_action", KindParty, ValueText, "intention", true, 0, 0, []string{
		"none", "attack", "raid", "aid", "trade", "ally", "wait", "defend", "blockade", "peace",
	}, 0})
	register(Field{"decision_score", KindParty, ValueFloat, "score", true, -inf, inf, nil, 0})
	register(Field{"dest_x", KindParty, ValueFloat, "leagues", false, 0, inf, nil, 0})
	register(Field{"dest_y", KindParty, ValueFloat, "leagues", false, 0, inf, nil, 0})
	register(Field{"wounded", KindParty, ValueInt, "troops", true, 0, inf, nil, 0})
	// decision_reasons is the party's copy of its ruler's reason for the current
	// order, so the Why panel can explain a marching column without looking up
	// the ruler.
	register(Field{"decision_reasons", KindParty, ValueText, "reason", true, 0, 0, []string{
		"none", "weak target", "own holdings threatened", "food shortage",
		"greed", "revenge", "ambition", "duty", "mercy", "trade profit",
		"safe distance", "exhausted", "broke", "ally obligation", "grievance",
	}, 0})
	register(Field{"is_sieging", KindParty, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"raid_target", KindParty, ValueInt, "village", false, -1, inf, nil, 0})
	register(Field{"wage_daily", KindParty, ValueFloat, "money/day", false, 0, inf, nil, 0})
	// --- ruler fields ---
	register(Field{"influence", KindRuler, ValueFloat, "influence", true, 0, inf, nil, 0})
	register(Field{"renown", KindRuler, ValueFloat, "renown", true, 0, inf, nil, 0})
	register(Field{"loyalty_to_leader", KindRuler, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"ruler_side", KindRuler, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"ruler_town", KindRuler, ValueInt, "town", true, -1, inf, nil, 0})
	register(Field{"ruler_age", KindRuler, ValueInt, "years", true, 0, 120, nil, 0})
	register(Field{"captured_by", KindRuler, ValueInt, "ruler", true, -1, inf, nil, 0})
	register(Field{"prisoner_days", KindRuler, ValueInt, "days", false, 0, inf, nil, 0})
	// Opinion is measured from -1 to 1, so its logging threshold is far coarser
	// than the global one: a hundredth of an opinion is the smallest change a
	// player would notice or a why-query needs.
	register(Field{"relation_score", KindRuler, ValueFloat, "score", true, -1, 1, nil, 0.02})
	register(Field{"relation_score", KindSide, ValueFloat, "score", true, -1, 1, nil, 0.02})
	register(Field{"renown_victories", KindRuler, ValueInt, "victories", false, 0, inf, nil, 0})
	register(Field{"army", KindRuler, ValueInt, "party", true, -1, inf, nil, 0})
	register(Field{"broken_oaths", KindRuler, ValueInt, "count", true, 0, inf, nil, 0})
	register(Field{"is_mercenary_ruler", KindRuler, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"is_alive", KindRuler, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"oath_made", KindRuler, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"last_defection", KindRuler, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"relations_with", KindRuler, ValueInt, "ruler", false, -1, inf, nil, 0})
	register(Field{"decision_reasons", KindRuler, ValueText, "reason", true, 0, 0, []string{
		"none", "weak target", "own holdings threatened", "food shortage",
		"greed", "revenge", "ambition", "duty", "mercy", "trade profit",
		"safe distance", "exhausted", "broke", "ally obligation", "grievance",
	}, 0})
	register(Field{"ruler_troops", KindRuler, ValueInt, "troops", false, 0, inf, nil, 0})
	register(Field{"service_quality", KindRuler, ValueFloat, "index", false, zero, one, nil, 0})
	// --- side fields ---
	register(Field{"side_treasury", KindSide, ValueFloat, "money", true, -inf, inf, nil, 0})
	register(Field{"side_gold", KindSide, ValueFloat, "gold", true, zero, inf, nil, 0})
	register(Field{"side_food", KindSide, ValueFloat, "person-days", true, 0, inf, nil, 0})
	register(Field{"side_metal", KindSide, ValueFloat, "metal", true, 0, inf, nil, 0})
	register(Field{"side_war_weariness", KindSide, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"side_states", KindSide, ValueInt, "states", true, 0, inf, nil, 0})
	register(Field{"side_towns", KindSide, ValueInt, "towns", true, 0, inf, nil, 0})
	register(Field{"side_leader", KindSide, ValueInt, "ruler", true, -1, inf, nil, 0})
	register(Field{"is_vassal", KindSide, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"exchange_rate", KindSide, ValueFloat, "gold per money", true, 0.01, inf, nil, 0})
	register(Field{"debt_total", KindSide, ValueFloat, "money", true, -inf, inf, nil, 0})
	register(Field{"side_inflation", KindSide, ValueFloat, "index", true, 0, inf, nil, 0})
	register(Field{"side_population", KindSide, ValueInt, "people", true, 0, inf, nil, 0})
	register(Field{"side_stability", KindSide, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"side_intent", KindSide, ValueText, "intention", true, 0, 0, []string{
		"peace", "war", "raid", "trade", "ally", "defend", "tribute",
	}, 0})
	register(Field{"side_ally", KindSide, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"side_enemy", KindSide, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"side_target", KindSide, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"trust", KindSide, ValueFloat, "share", true, 0, one, nil, 0})
	register(Field{"coalition_with", KindSide, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"vassal_of", KindSide, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"income_total", KindSide, ValueFloat, "money/day", false, -inf, inf, nil, 0})
	register(Field{"expense_total", KindSide, ValueFloat, "money/day", false, -inf, inf, nil, 0})
	register(Field{"target_score", KindSide, ValueFloat, "score", false, -inf, inf, nil, 0})
	register(Field{"peace_score", KindSide, ValueFloat, "score", false, -inf, inf, nil, 0})
	register(Field{"trust_decay", KindSide, ValueFloat, "index", false, zero, one, nil, 0})
	register(Field{"side_mercenaries", KindSide, ValueInt, "troops", true, 0, inf, nil, 0})
	// side_strength is the fielded strength the faction system recomputes each
	// tick: garrisons plus armies, discounted by morale. It is what war
	// targeting and overmatch are measured against, so it is a real quantity
	// rather than a figure of speech.
	register(Field{"side_strength", KindSide, ValueFloat, "index", false, 0, inf, nil, 0})
	// side_food_need and side_metal_need are the computed deficits that
	// motivate a war (ECONOMY.md section 9).
	register(Field{"side_food_need", KindSide, ValueFloat, "share", false, 0, 1, nil, 0})
	register(Field{"side_metal_need", KindSide, ValueFloat, "share", false, 0, 1, nil, 0})
	register(Field{"side_ally_count", KindSide, ValueInt, "sides", false, 0, inf, nil, 0})
	register(Field{"side_debt_ratio", KindSide, ValueFloat, "share", false, 0, inf, nil, 0})
	// --- route fields ---
	register(Field{"route_safety", KindRoute, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"route_length", KindRoute, ValueFloat, "leagues", true, 0, inf, nil, 0})
	register(Field{"route_raiders", KindRoute, ValueFloat, "index", true, zero, inf, nil, 0})
	register(Field{"route_traffic", KindRoute, ValueInt, "caravans", true, 0, inf, nil, 0})
	register(Field{"route_blocked", KindRoute, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"route_town_a", KindRoute, ValueInt, "town", false, -1, inf, nil, 0})
	register(Field{"route_town_b", KindRoute, ValueInt, "town", false, -1, inf, nil, 0})
	register(Field{"route_patrol", KindRoute, ValueFloat, "troops", false, 0, inf, nil, 0})
	register(Field{"route_terrain", KindRoute, ValueText, "terrain", false, 0, 0, []string{
		"plain", "forest", "hills", "mountain", "swamp", "coast",
	}, 0})

	// --- siege fields ---
	register(Field{"siege_days", KindSiege, ValueInt, "days", true, 0, inf, nil, 0})
	register(Field{"siege_attacker", KindSiege, ValueInt, "party", true, -1, inf, nil, 0})
	register(Field{"siege_defender", KindSiege, ValueInt, "ruler", true, -1, inf, nil, 0})
	register(Field{"siege_town", KindSiege, ValueInt, "town", true, -1, inf, nil, 0})
	register(Field{"breach_progress", KindSiege, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"gates_opened", KindSiege, ValueFlag, "boolean", true, zero, one, nil, 0})
	register(Field{"siege_outcome", KindSiege, ValueText, "outcome", true, 0, 0, []string{
		"ongoing", "breached", "gates opened", "lifted", "starved out",
	}, 0})
	register(Field{"attacker_loss", KindSiege, ValueFloat, "troops", true, 0, inf, nil, 0})
	register(Field{"siege_supply", KindSiege, ValueFloat, "days", false, 0, inf, nil, 0})
	register(Field{"gate_risk", KindSiege, ValueFloat, "share", false, zero, one, nil, 0})
	// --- war fields ---
	register(Field{"war_intensity", KindWar, ValueFloat, "share", true, zero, one, nil, 0})
	register(Field{"war_side_a", KindWar, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"war_side_b", KindWar, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"war_battles", KindWar, ValueInt, "battles", true, 0, inf, nil, 0})
	register(Field{"war_start_tick", KindWar, ValueInt, "tick", true, 0, inf, nil, 0})
	register(Field{"war_end_tick", KindWar, ValueInt, "tick", true, -1, inf, nil, 0})
	register(Field{"battles_this_tick", KindWar, ValueInt, "battles", false, 0, inf, nil, 0})
	register(Field{"war_reason", KindWar, ValueText, "reason", true, 0, 0, []string{
		"border", "revenge", "resources", "defence", "alliance", "opportunity",
	}, 0})
	// --- clan fields (Tier 1) ---
	register(Field{"clan_renown", KindClan, ValueFloat, "renown", true, 0, inf, nil, 0})
	register(Field{"clan_tier", KindClan, ValueInt, "tier", true, 0, 6, nil, 0})
	register(Field{"clan_leader", KindClan, ValueRulerRef, "ruler", true, -1, inf, nil, 0})
	register(Field{"clan_side", KindClan, ValueSideRef, "side", true, -1, inf, nil, 0})
	register(Field{"clan_members", KindClan, ValueInt, "members", true, 0, inf, nil, 0})
	register(Field{"clan_household", KindClan, ValueInt, "people", true, 0, inf, nil, 0})
	register(Field{"clan_fiefs", KindClan, ValueInt, "fiefs", true, 0, inf, nil, 0})
	register(Field{"wants_kingdom", KindClan, ValueFlag, "boolean", true, zero, one, nil, 0})
	// --- workshop fields (Tier 3) ---
	register(Field{"workshop_town", KindWorkshop, ValueInt, "town", true, -1, inf, nil, 0})
	register(Field{"workshop_owner_clan", KindWorkshop, ValueInt, "clan", true, -1, inf, nil, 0})
	register(Field{"workshop_type", KindWorkshop, ValueInt, "type", true, 0, 4, nil, 0})
	register(Field{"workshop_level", KindWorkshop, ValueInt, "level", true, 1, 3, nil, 0})
	register(Field{"workshop_workers", KindWorkshop, ValueInt, "workers", true, 0, inf, nil, 0})
	register(Field{"workshop_input_stock", KindWorkshop, ValueFloat, "goods", true, 0, inf, nil, 0})
	register(Field{"workshop_output_stock", KindWorkshop, ValueFloat, "goods", true, 0, inf, nil, 0})
	register(Field{"workshop_income", KindWorkshop, ValueFloat, "money", false, 0, inf, nil, 0})
}
