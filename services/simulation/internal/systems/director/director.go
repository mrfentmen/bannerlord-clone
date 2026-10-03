// Package director monitors the simulation's vital signs. Its job is NOT to
// cheat for the player or to fix the world. Its job is to detect when the
// world needs activity and to make that visible.
//
// The director runs every AssessEveryDays ticks. It computes vital signs:
// how many wars are active, how many parties are mobilized, how many towns
// are in revolt or starving, how much trade is moving. It records these as
// EventWorldAssessment, which is a reading, not a happening: the player UI
// and observability tools read the assessment history to show what is going
// on in the world.
//
// If the world has been stagnant (no wars, no mobilization, no trade) for
// StagnationAssessments consecutive assessments, it writes an
// EventStagnationAlert. This is a diagnostic for the developers, not a story
// beat: it says the simulation's systems are not producing activity, which
// usually means something upstream is broken (in October 2026, it was a
// price/unrest spiral bankrupting every town, which starved the armies of
// pay and left the AI with nothing usable to command).
//
// The director creates CONDITIONS for stories by making the world's state
// legible, not by dictating outcomes. It never writes intentions, never
// moves parties, never touches the economy. Those are other systems' jobs.
package director

import (
	"fmt"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// System returns the world director system.
func System() sim.System {
	return sim.System{
		Name: "director",
		Doc:  "monitors world vital signs and reports stagnation, crises, and opportunities",
		Runs: run,
	}
}

// Vitals is the world's vital signs at one assessment.
type Vitals struct {
	ActiveWars       int
	MobilizedParties int
	TotalParties     int
	AvgUnrest        float64
	TownsInRevolt    int
	TownsStarving    int
	TradeCaravans    int
	TotalTowns       int
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	if c.Director.AssessEveryDays <= 0 {
		return
	}
	if v.Tick%int(c.Director.AssessEveryDays) != 0 {
		return
	}

	vitals := assess(v)

	// Record the assessment. The note is human-readable; the magnitude packs
	// the key numbers for tools that read events programmatically.
	note := fmt.Sprintf("wars=%d mobilized=%d/%d caravans=%d revolt=%d/%d starving=%d unrest=%.2f",
		vitals.ActiveWars, vitals.MobilizedParties, vitals.TotalParties,
		vitals.TradeCaravans, vitals.TownsInRevolt, vitals.TotalTowns,
		vitals.TownsStarving, vitals.AvgUnrest)
	w.CreateEntity(func(s *model.State) {
		s.Events = append(s.Events, &model.Event{
			ID:        len(s.Events) + 1,
			Kind:      model.EventWorldAssessment,
			Tick:      v.Tick,
			Year:      v.State.Year,
			Magnitude: float64(vitals.MobilizedParties),
			Note:      note,
		})
	})

	// Stagnation check: has the world been inactive for too long?
	if isStagnant(v, vitals, c.Director.StagnationAssessments) {
		w.CreateEntity(func(s *model.State) {
			s.Events = append(s.Events, &model.Event{
				ID:   len(s.Events) + 1,
				Kind: model.EventStagnationAlert,
				Tick: v.Tick,
				Year: v.State.Year,
				Note: fmt.Sprintf("world stagnant for %.0f assessments: %s",
					c.Director.StagnationAssessments, note),
			})
		})
	}

	// Phony war check: sides are at war but no one is fighting. A war with
	// no mobilized parties is a flag in the faction AI, not a war. This is
	// the specific dysfunction the war duty bonus was added to fix; if it
	// still happens, the developers need to know. Deduplicated: one alert
	// per 30 days, not one per assessment.
	if vitals.ActiveWars > 0 && vitals.MobilizedParties < 3 {
		recent := false
		for i := len(v.State.Events) - 1; i >= 0; i-- {
			ev := v.State.Events[i]
			if ev.Kind == model.EventStagnationAlert && v.Tick-ev.Tick < 30 {
				// Check if it was a phony war alert (not a stagnation alert).
				if len(ev.Note) >= 9 && ev.Note[:9] == "phony war" {
					recent = true
					break
				}
			}
			if v.Tick-ev.Tick >= 30 {
				break
			}
		}
		if !recent {
			w.CreateEntity(func(s *model.State) {
				s.Events = append(s.Events, &model.Event{
					ID:   len(s.Events) + 1,
					Kind: model.EventStagnationAlert,
					Tick: v.Tick,
					Year: v.State.Year,
					Note: fmt.Sprintf("phony war: %d active wars but only %d parties mobilized: %s",
						vitals.ActiveWars, vitals.MobilizedParties, note),
				})
			})
		}
	}
}

// assess computes the world's vital signs from current state.
func assess(v *sim.View) Vitals {
	var vtl Vitals
	vtl.ActiveWars = len(v.State.ActiveWars())
	vtl.TotalTowns = len(v.State.Towns)

	unrestSum := 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		unrestSum += t.Unrest
		if t.Unrest > 0.7 {
			vtl.TownsInRevolt++
		}
		if t.FoodDays < 7 {
			vtl.TownsStarving++
		}
	}
	if vtl.TotalTowns > 0 {
		vtl.AvgUnrest = unrestSum / float64(vtl.TotalTowns)
	}

	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p.Troops <= 0 {
			continue
		}
		vtl.TotalParties++
		if p.Activity != model.ActIdle {
			vtl.MobilizedParties++
		}
		if p.IsCaravan && p.Activity == model.ActTrading {
			vtl.TradeCaravans++
		}
	}
	return vtl
}

// isStagnant reports whether the world has been inactive. A world is stagnant
// if there are no active wars, almost no mobilized parties, and almost no
// trade. The check looks at the current vitals plus the recent assessment
// history, so a single quiet week does not trigger an alert.
func isStagnant(v *sim.View, current Vitals, needAssessments float64) bool {
	if needAssessments <= 1 {
		return isQuiet(current)
	}
	// Count consecutive quiet assessments, including the current one.
	quiet := 0
	if isQuiet(current) {
		quiet = 1
	} else {
		return false
	}
	// Walk backwards through assessment events.
	for i := len(v.State.Events) - 1; i >= 0 && float64(quiet) < needAssessments; i-- {
		ev := v.State.Events[i]
		if ev.Kind != model.EventWorldAssessment {
			continue
		}
		// Parse the note to check if it was quiet. The note format is fixed
		// (see run), so we look for the markers of activity.
		if !wasQuietNote(ev.Note) {
			break
		}
		quiet++
	}
	return float64(quiet) >= needAssessments
}

// isQuiet reports whether one assessment shows an inactive world.
func isQuiet(vtl Vitals) bool {
	return vtl.ActiveWars == 0 && vtl.MobilizedParties < 3 && vtl.TradeCaravans < 2
}

// wasQuietNote parses an assessment note to see if it described a quiet world.
// The note format is "wars=%d mobilized=%d/%d caravans=%d ...".
func wasQuietNote(note string) bool {
	var wars, mobilized, total, caravans int
	_, err := fmt.Sscanf(note, "wars=%d mobilized=%d/%d caravans=%d",
		&wars, &mobilized, &total, &caravans)
	if err != nil {
		return false
	}
	return wars == 0 && mobilized < 3 && caravans < 2
}
