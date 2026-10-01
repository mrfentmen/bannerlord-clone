// Package siegeengine models modern siege equipment (Tier 6).
//
// Modern American siege warfare uses military hardware, not medieval
// engines. The 8 modern equivalents:
//   - Sniper Team: precision anti-personnel (replaces ballista)
//   - Incendiary Sniper Team: anti-personnel with thermite (fire ballista)
//   - Mortar Section: indirect fire, wall damage (catapult)
//   - WP Mortar Section: incendiary indirect fire (fire catapult)
//   - Howitzer Battery: heavy artillery, major wall damage (trebuchet)
//   - MLRS Battery: rocket artillery, incendiary (fire trebuchet)
//   - Armored Assault Vehicle: MRAP for troop protection (siege tower)
//   - Combat Engineers: breaching charges for gates (battering ram)
//
// Mechanics:
//   - Active sieges with sufficient attacker metal (military supplies)
//     get equipment-assisted breach progress.
//   - Equipment mix chosen by breach level: low breach favors
//     wall-breakers (mortars, howitzers, engineers); high breach favors
//     assault support (armor, snipers).
//   - Incendiary variants do bonus damage but risk equipment loss.
//   - Accelerates the existing Siege.Breach field; no new model fields.
package siegeengine

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Modern equipment types.
const (
	EquipSniperTeam = iota
	EquipIncendiarySniper
	EquipMortarSection
	EquipWPMortar
	EquipHowitzerBattery
	EquipMLRSBattery
	EquipArmoredVehicle
	EquipCombatEngineers
)

// Tuning constants.
const (
	// suppliesForEquipment is the attacker supplies needed for equipment.
	suppliesForEquipment = 50.0
	// baseDamage is the breach progress per tick (0-1 scale).
	baseDamage = 0.02
	// howitzerMultiplier for heavy artillery.
	howitzerMultiplier = 2.0
	// mortarMultiplier for medium indirect fire.
	mortarMultiplier = 1.5
)

// System returns the siegeengine system.
func System() sim.System {
	return sim.System{
		Name: "siegeengine",
		Doc:  "modern siege equipment (snipers, mortars, howitzers, MLRS, armor, engineers) accelerates breach",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	rng := v.Rng.Derive("siegeengine")
	for _, sid := range v.State.SiegeIDs() {
		s := v.State.Sieges[sid]
		if s == nil || s.Outcome != model.SiegeOngoing {
			continue
		}
		// Attacker needs supplies for heavy equipment.
		attacker := v.State.Parties[s.AttackerID]
		if attacker == nil {
			continue
		}
		supplies, _ := v.State.Get(model.KindParty, attacker.ID, "party_metal")
		if supplies < suppliesForEquipment {
			continue
		}

		// Choose equipment mix based on breach progress.
		var damage float64
		var equipName string
		breach, _ := v.State.Get(model.KindSiege, sid, "breach_progress")
		if breach < 0.5 {
			// Wall-breakers: howitzers, mortars, engineers.
			roll := rng.Float64()
			switch {
			case roll < 0.3:
				damage = baseDamage * howitzerMultiplier
				equipName = "howitzer battery"
			case roll < 0.6:
				damage = baseDamage * mortarMultiplier
				equipName = "mortar section"
			case roll < 0.8:
				damage = baseDamage * 1.2
				equipName = "combat engineers"
			default:
				// Incendiary: bonus damage, but risky.
				damage = baseDamage * mortarMultiplier * 1.3
				equipName = "WP mortar section"
				// Equipment loss risk: 10% chance.
				if rng.Chance(0.1) {
					damage = 0
					equipName = "WP mortar section (equipment lost)"
				}
			}
		} else {
			// Assault support: armor, snipers.
			roll := rng.Float64()
			switch {
			case roll < 0.4:
				damage = baseDamage * 0.5
				equipName = "armored assault vehicle"
			case roll < 0.7:
				damage = baseDamage * 0.3
				equipName = "sniper team"
			default:
				damage = baseDamage * 0.4
				equipName = "incendiary sniper team"
			}
		}

		if damage <= 0 {
			continue
		}

		// Clamp so breach_progress never exceeds 1.
		if breach+damage > 1 {
			damage = 1 - breach
		}
		if damage <= 0 {
			continue
		}

		read := shared.ReadString(
			shared.Pair("breach_progress", breach),
			shared.Pair("damage", damage),
			shared.Pair("supplies", supplies),
		)
		causes := v.Log.RecentFor(model.KindSiege, sid,
			[]string{"breach_progress"}, 3)
		w.Add(model.KindSiege, sid, "breach_progress", damage,
			read, causes, "siege equipment ("+equipName+") breaches defenses")
	}
}
