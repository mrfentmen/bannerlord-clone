package battle

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/rng"
)

// Roster describes a force to be generated rather than written out by hand.
//
// The battle engine has no opinion about what a hundred troops look like; this
// is the place that says, from the balance file, what the average soldier is. A
// caller that already has troops in the shape of model.Party builds Setup.A and
// Setup.B itself and uses none of this.
type Roster struct {
	// Units is how many units to generate. Each represents Roster.TroopsPerUnit
	// bodies, so a five-hundred-troop force is five hundred units of one or
	// fifty units of ten. Nothing here assumes a number.
	Units int
	// TroopsPerUnit is how many bodies each generated unit represents. Zero
	// means battle.roster_troops_per_unit from the balance file.
	TroopsPerUnit float64
	// SkillBias shifts generated skill, on a 0-1 scale where 0 is the
	// configured mean and 1 is a perfect soldier. A commander can therefore send
	// a better or worse force than average without editing the balance file,
	// which is what makes the many-seed balance sweep in
	// TESTING_AND_BALANCE.md section 4 possible.
	SkillBias float64
	// MoraleBias shifts generated morale the same way, in the same 0-1
	// relative scale. A hungry, unpaid army arrives with worse morale, which is
	// MARCH_AND_WAR.md section 5's business and lands here as an input.
	MoraleBias float64
	// NoRanged forces a force of melee troops, and AllRanged a force of
	// shooters. Neither set means the configured battle.roster_ranged_share.
	NoRanged  bool
	AllRanged bool
}

// GenerateForce builds a force from the balance file and a seed.
//
// Every draw comes from a substream derived from the seed and the side, so
// generating side B never shifts what side A looked like, and a caller
// regenerating the same force with the same seed gets the same soldiers.
func GenerateForce(cfg *config.Config, seed uint64, side Side, r Roster) ([]Unit, error) {
	if cfg == nil {
		return nil, newError(ErrNilConfig,
			"GenerateForce needs a balance config; the roster is described entirely by the "+
				"battle section of it")
	}
	c := cfg.Battle
	if r.Units < 1 {
		return nil, &Error{
			Kind:   ErrEmptyForce,
			Side:   side,
			Detail: fmt.Sprintf("a roster of %d units is not a force", r.Units),
		}
	}
	troops := r.TroopsPerUnit
	if troops <= 0 {
		troops = c.RosterTroopsPerUnit
	}
	if err := validateConstants(&c); err != nil {
		return nil, err
	}
	// A generated unit must survive the same validation a supplied one does. The
	// cheapest honest way to guarantee that is to generate it and then run the
	// same check Run runs.
	force := make([]Unit, 0, r.Units)
	gen := rng.New(seed).Derive("roster-" + side.String())
	for i := 0; i < r.Units; i++ {
		role := RoleMelee
		switch {
		case r.AllRanged:
			role = RoleRanged
		case r.NoRanged:
			role = RoleMelee
		default:
			if gen.Float64() < c.RosterRangedShare {
				role = RoleRanged
			}
		}
		meleeSkill := clamp01(c.RosterMeleeSkillMean + c.RosterMeleeSkillSpread*gen.Normal(0, 1) + r.SkillBias)
		rangedSkill := clamp01(c.RosterRangedSkillMean + c.RosterRangedSkillSpread*gen.Normal(0, 1) + r.SkillBias)
		// The generation means are the reference, so the bias is expressed
		// relative to them and a roster of zero bias is the configured average
		// force rather than an arbitrary one.
		meleeSkill = clamp01(meleeSkill)
		rangedSkill = clamp01(rangedSkill)
		morale := clamp01(c.RosterMoraleStart + c.RosterMoraleSpread*gen.Normal(0, 1) + r.MoraleBias*c.RosterMoraleBiasScale)

		maxHP := c.RosterHPBase + c.RosterHPSkillWeight*(meleeSkill-c.RosterMeleeSkillMean)
		if maxHP <= 1 {
			maxHP = c.RosterHPBase
		}
		speed := c.RosterSpeedBase + c.RosterSpeedSkillWeight*(meleeSkill-c.RosterMeleeSkillMean)
		if speed < 0 {
			speed = 0
		}
		u := Unit{
			ID:          i,
			Side:        side,
			Role:        role,
			MaxHP:       maxHP,
			HP:          maxHP,
			Morale:      morale,
			MeleeSkill:  meleeSkill,
			RangedSkill: rangedSkill,
			Speed:       speed,
			Troops:      troops,
			Status:      StatusFighting,
		}
		if role == RoleRanged {
			u.Ammo = c.RosterAmmoPerUnit
			u.AmmoStart = c.RosterAmmoPerUnit
		}
		force = append(force, u)
	}
	if err := validateForce(force, side); err != nil {
		return nil, err
	}
	return force, nil
}

// LeaderCount returns how many commanders a force of n units is given.
//
// It is 1 + n/battle.roster_leaders_per_unit: every force gets a commander,
// and another every roster_leaders_per_unit men. The division used to be a
// literal 250 written in two different packages, which is exactly the shape of
// bug CONSTITUTION.md section 1.2 exists to prevent, because the two copies
// could drift and a report would show a command structure nobody chose.
//
// A non-positive n, a nil config, or a per-unit value below one gives one
// commander rather than none: an uncommanded force is a worse fallback than a
// badly commanded one, and configuration validation refuses a per-unit value
// below one before this is ever reached.
func LeaderCount(cfg *config.Config, n int) int {
	if n < 1 {
		return 1
	}
	if cfg == nil {
		return 1
	}
	per := cfg.Battle.RosterLeadersPerUnit
	if per < 1 {
		return 1
	}
	return 1 + int(float64(n)/per)
}

// GenerateLeaders lays out a side's commanders behind its front line, spread
// along it.
//
// They are spaced rather than stacked because battle.morale_leader_steadying
// takes the STRONGEST leader in range, not the sum: a stack of five officers at
// one point would steady exactly as many men as one, which is correct, but a
// force that generated five would be leaving two thirds of its command sitting
// where it does nothing.
func GenerateLeaders(cfg *config.Config, seed uint64, side Side, count int, influence float64) []Leader {
	if count <= 0 || cfg == nil {
		return nil
	}
	c := cfg.Battle
	gen := rng.New(seed).Derive("leaders-" + side.String())
	out := make([]Leader, 0, count)
	dir := 1.0
	if side == SideB {
		dir = -1
	}
	frontX := c.RosterStartDistance / 2
	for i := 0; i < count; i++ {
		// Behind the front line by battle.roster_leader_depth_fraction of the
		// formation depth, so a leader is among his men and not in front of
		// them. The fraction was a literal 0.34 here.
		x := -dir * (frontX - c.RosterFormationDepth*c.RosterLeaderDepthFraction)
		spread := float64(i) - float64(count-1)/2
		y := spread * c.RosterFrontage * c.RosterLeaderSpread
		// A little jitter so a command is not a perfectly even line of officers.
		// Its half-width was a literal half a frontage here.
		y += (gen.Float64() - 0.5) * c.RosterFrontage * c.RosterLeaderJitterFraction
		out = append(out, Leader{
			Side: side,
			Influence: math.Max(0, influence*(c.RosterLeaderInfluenceFloor+
				c.RosterLeaderInfluenceSpread*gen.Float64())),
			X: x,
			Y: y,
		})
	}
	return out
}
