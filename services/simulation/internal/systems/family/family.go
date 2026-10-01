// Package family models marriage, pregnancy, children, and heirs (Tier 2.1).
//
// In Bannerlord, leaders marry, have children, and dynasties continue
// through heirs. When a leader dies, their heir inherits their position.
//
// Modern American equivalent: political dynasties and family succession.
// Organizations are often led by families across generations.
//
// Mechanics:
//   - Adult leaders may marry (if unmarried and of age).
//   - Married couples have a chance of pregnancy each day.
//   - Pregnancy lasts ~270 days, then a child is born.
//   - Children age; at 18 they become adult leaders.
//   - When a leader dies, their oldest adult child inherits.
//
// This system handles the background lifecycle. Marriage is automatic
// for unmarried adults (simplified); a full courtship UI would be in
// the client.
package family

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// marriageChancePerDay is the daily probability an unmarried adult marries.
	marriageChancePerDay = 0.001
	// pregnancyChancePerDay is the daily probability a married couple conceives.
	pregnancyChancePerDay = 0.005
	// pregnancyDuration is the gestation period in days.
	pregnancyDuration = 270.0
	// adultAge is the age of majority.
	adultAge = 18.0
	// minMarriageAge is the minimum age for marriage.
	minMarriageAge = 18.0
)

// System returns the family system.
func System() sim.System {
	return sim.System{
		Name: "family",
		Doc:  "marriage, pregnancy, children, and heir succession",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	rng := v.Rng.Derive("family")

	// Marriage: unmarried adults may marry.
	for _, lid := range v.State.LeaderIDsSorted() {
		l := v.State.Leaders[lid]
		if l == nil || !l.IsAlive || l.Age < minMarriageAge {
			continue
		}
		if l.SpouseID >= 0 {
			continue // Already married.
		}
		if !rng.Chance(marriageChancePerDay) {
			continue
		}

		// Find an unmarried adult of appropriate age.
		for _, oid := range v.State.LeaderIDsSorted() {
			if oid == lid {
				continue
			}
			o := v.State.Leaders[oid]
			if o == nil || !o.IsAlive || o.Age < minMarriageAge {
				continue
			}
			if o.SpouseID >= 0 {
				continue
			}
			// Marry them.
			read := shared.ReadString(
				shared.Pair("leader", float64(lid)),
				shared.Pair("spouse", float64(oid)),
			)
			causes := v.Log.RecentFor(model.KindLeader, lid,
				[]string{"age"}, 3)

			w.Set(model.KindLeader, lid, "spouse", float64(oid),
				read, causes, "marriage")
			w.Set(model.KindLeader, oid, "spouse", float64(lid),
				read, causes, "marriage")
			break
		}
	}

	// Pregnancy and birth.
	for _, lid := range v.State.LeaderIDsSorted() {
		l := v.State.Leaders[lid]
		if l == nil || !l.IsAlive || l.SpouseID < 0 {
			continue
		}
		// Only track pregnancy on one partner (the lower ID to avoid double).
		if lid > l.SpouseID {
			continue
		}
		if l.PregnancyDays < 0 {
			// Not pregnant; chance to conceive.
			if rng.Chance(pregnancyChancePerDay) {
				read := shared.ReadString(
					shared.Pair("leader", float64(lid)),
				)
				causes := v.Log.RecentFor(model.KindLeader, lid,
					[]string{"spouse"}, 3)
				w.Set(model.KindLeader, lid, "pregnancy_days", 0,
					read, causes, "conception")
			}
		} else {
			// Pregnant; advance.
			newDays := l.PregnancyDays + 1
			read := shared.ReadString(
				shared.Pair("pregnancy_days", l.PregnancyDays),
			)
			causes := v.Log.RecentFor(model.KindLeader, lid,
				[]string{"pregnancy_days"}, 3)

			if newDays >= pregnancyDuration {
				// Birth! Create a child leader.
				// The child is born as age 0, marked as a child (cannot
				// inherit or hold land until adulthood).
				mother := l
				father := v.State.Leaders[l.SpouseID]
				// Determine parents (mother is the pregnant one).
				var fatherID, motherID int
				if father != nil {
					// Assume the lower ID is the mother for simplicity;
					// in practice, track which one was pregnant.
					motherID = lid
					fatherID = l.SpouseID
				} else {
					motherID = lid
					fatherID = -1
				}
				// Spawn the child via CreateEntity.
				w.CreateEntity(func(s *model.State) {
					childID := s.NewID(model.IDRuler)
					child := &model.Leader{
						ID:            childID,
						Name:          "Child of " + mother.Name,
						Age:           0,
						IsAlive:       true,
						IsChild:       true,
						FatherID:      fatherID,
						MotherID:      motherID,
						SpouseID:      -1,
						HeirID:        -1,
						PregnancyDays: -1,
					}
					s.Leaders[childID] = child
				})
				w.Set(model.KindLeader, lid, "pregnancy_days", -1,
					read, causes, "birth")
			} else {
				w.Set(model.KindLeader, lid, "pregnancy_days", newDays,
					read, causes, "pregnancy progresses")
			}
		}
	}

	// Aging: children grow up.
	for _, lid := range v.State.LeaderIDsSorted() {
		l := v.State.Leaders[lid]
		if l == nil || !l.IsAlive {
			continue
		}
		// Age increases by 1/365 per day.
		read := shared.ReadString(
			shared.Pair("age", l.Age),
		)
		causes := v.Log.RecentFor(model.KindLeader, lid,
			[]string{"age"}, 3)
		w.Add(model.KindLeader, lid, "ruler_age", 1.0/365.0,
			read, causes, "aging")

		// Natural death: chance increases with age.
		// Base mortality: negligible before 50, rising sharply after 70.
		if l.Age > 50 {
			deathChance := 0.0001 * (l.Age - 50) * (l.Age - 50)
			if rng.Chance(deathChance) {
				w.Set(model.KindLeader, lid, "is_alive", 0,
					read, causes, "natural death")
				// Heir succession: if they have an heir designated,
				// the heir inherits. Otherwise, the oldest adult child.
				// (Simplified: just log the death; succession handled by
				// the succession system if it exists.)
			}
		}
	}
}
