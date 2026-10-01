package battle

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/rng"
)

// Vehicles are modern cavalry: fast, armored, and terrifying to foot troops.
// A vehicle is an agent of its own, not a kind of Unit, because it follows
// different physics (turn radius, terrain penalties), carries passengers,
// and dies in stages (intact, damaged, disabled, burning, destroyed) rather
// than all at once.
//
// This file is the whole vehicle model: movement, ramming, passengers,
// morale shock, and damage states. It does not hook into the battle tick
// loop; that wiring is a separate task. Everything here runs on explicit
// calls so each piece is testable on its own, and every number comes from
// the [vehicle] section of the balance file.
//
// Determinism: nothing here draws from a global rng. Functions that need
// randomness take a *rng.Rng, so the same seed always gives the same battle.

// VehicleClass is which row of the vehicle table a vehicle uses.
type VehicleClass int

const (
	// VehiclePickup is the fast light scout with an open bed.
	VehiclePickup VehicleClass = iota
	// VehicleSUV is a closed, slightly tougher scout.
	VehicleSUV
	// VehicleArmoredVan is the slow heavy ram.
	VehicleArmoredVan
	// VehicleBus is the troop carrier.
	VehicleBus
)

// String names the class for reports and error messages.
func (c VehicleClass) String() string {
	switch c {
	case VehiclePickup:
		return "pickup"
	case VehicleSUV:
		return "suv"
	case VehicleArmoredVan:
		return "armored_van"
	case VehicleBus:
		return "bus"
	default:
		return "unknown"
	}
}

// VehicleState is where a vehicle is on the road from intact to destroyed.
type VehicleState int

const (
	// VehicleIntact means full hull: fighting fit.
	VehicleIntact VehicleState = iota
	// VehicleDamaged means hurt but fully operational.
	VehicleDamaged
	// VehicleDisabled means the crew bails out: it does not move or ram.
	VehicleDisabled
	// VehicleBurning means the crew has bailed and it is counting down to
	// explosion. Nothing reversible happens here.
	VehicleBurning
	// VehicleDestroyed means gone: exploded or shot to scrap. Terminal.
	VehicleDestroyed
)

// String names the state for reports.
func (s VehicleState) String() string {
	switch s {
	case VehicleIntact:
		return "intact"
	case VehicleDamaged:
		return "damaged"
	case VehicleDisabled:
		return "disabled"
	case VehicleBurning:
		return "burning"
	case VehicleDestroyed:
		return "destroyed"
	default:
		return "unknown"
	}
}

// Obstacle is light cover a vehicle can ram: a barricade, a cart, a market
// stall. It has hit points and a mass, and nothing else, because the only
// question the ram model asks is how much it hurts and how much it hurts back.
type Obstacle struct {
	// Name is what the report calls it.
	Name string
	// HP is its remaining hit points.
	HP float64
	// Mass is its mass in kilograms, which sets how much ramming it costs
	// the vehicle's front armor.
	Mass float64
}

// Vehicle is one vehicle agent on the field.
type Vehicle struct {
	// ID identifies the vehicle in reports. Assigned by the caller.
	ID int
	// Side is the army it fights for.
	Side Side
	// Class selects the balance-file row.
	Class VehicleClass
	// spec is the class row, copied at construction so a vehicle never
	// re-reads the config mid-battle.
	spec config.VehicleClassSpec
	// cfg is the shared vehicle knobs.
	cfg config.Vehicle

	// X, Y is the position in metres, Heading the bearing in radians.
	X, Y, Heading float64
	// Speed is the current speed in metres per second.
	Speed float64
	// HP is the remaining hull hit points.
	HP float64
	// FrontArmorHP is the remaining ablative front armor, spent ramming
	// barricades.
	FrontArmorHP float64
	// State is the damage state.
	State VehicleState
	// Passengers are the embarked agents, in embark order.
	Passengers []*Unit
	// OnRoad marks a road bonus: roads are fast, everything else is not.
	OnRoad bool
	// TicksBurning counts how long a burning vehicle has burned.
	TicksBurning int
	// exploded records that the blast already went off, so Tick never
	// explodes twice.
	exploded bool
}

// classSpec returns the balance-file row for a class.
func classSpec(c *config.Config, class VehicleClass) config.VehicleClassSpec {
	switch class {
	case VehiclePickup:
		return c.Vehicle.Pickup
	case VehicleSUV:
		return c.Vehicle.SUV
	case VehicleArmoredVan:
		return c.Vehicle.ArmoredVan
	case VehicleBus:
		return c.Vehicle.Bus
	default:
		return c.Vehicle.Pickup
	}
}

// NewVehicle builds a vehicle of the given class for the given side,
// placed at x, y facing heading. It starts intact at full hull with an
// empty passenger bay.
func NewVehicle(c *config.Config, id int, class VehicleClass, side Side, x, y, heading float64) *Vehicle {
	spec := classSpec(c, class)
	return &Vehicle{
		ID:           id,
		Side:         side,
		Class:        class,
		spec:         spec,
		cfg:          c.Vehicle,
		X:            x,
		Y:            y,
		Heading:      heading,
		HP:           spec.HullHP,
		FrontArmorHP: spec.FrontArmorHP,
		State:        VehicleIntact,
	}
}

// Spec returns the class row, for callers that need the raw numbers.
func (v *Vehicle) Spec() config.VehicleClassSpec { return v.spec }

// HPFrac is the remaining hull as a fraction of full.
func (v *Vehicle) HPFrac() float64 {
	if v.spec.HullHP <= 0 {
		return 0
	}
	return v.HP / v.spec.HullHP
}

// Operable reports whether the vehicle moves and rams. Disabled and worse
// do not.
func (v *Vehicle) Operable() bool {
	return v.State == VehicleIntact || v.State == VehicleDamaged
}

// terrainScale is the speed multiplier for the ground under the wheels.
// Open ground is the baseline the class speed is quoted for; roads are
// faster, forest is nearly impassable.
func (v *Vehicle) terrainScale(t Terrain) float64 {
	if v.OnRoad {
		return v.cfg.RoadSpeedScale
	}
	switch t {
	case TerrainOpen:
		return 1
	case TerrainUrban:
		return v.cfg.UrbanSpeedScale
	case TerrainHill:
		return v.cfg.HillSpeedScale
	case TerrainForest:
		return v.cfg.ForestSpeedScale
	case TerrainFortified:
		return v.cfg.FortifiedSpeedScale
	default:
		return 1
	}
}

// TopSpeed is the fastest the vehicle goes on the given terrain right now.
func (v *Vehicle) TopSpeed(t Terrain) float64 {
	return v.spec.Speed * v.terrainScale(t)
}

// Steer moves the vehicle for dt seconds toward targetHeading on terrain t.
//
// A vehicle is not a man: it cannot turn on the spot. The heading change per
// second is capped by speed / turn_radius, so a bus at pace carves a wide
// arc and a pickup can snap around it. Speed eases toward the terrain top
// speed rather than jumping there, because a two-ton truck does not launch.
func (v *Vehicle) Steer(dt, targetHeading float64, t Terrain) {
	if !v.Operable() || dt <= 0 {
		return
	}
	top := v.TopSpeed(t)
	// Ease toward top speed: half the gap closes per second. The exact shape
	// is arbitrary; that it eases rather than steps is what matters.
	v.Speed += (top - v.Speed) * (1 - math.Exp(-2*dt))
	if v.Speed < 0 {
		v.Speed = 0
	}
	// Turn cap from the radius: angular velocity is speed / radius.
	maxTurn := 0.0
	if v.spec.TurnRadius > 0 && v.Speed > 0 {
		maxTurn = v.Speed / v.spec.TurnRadius * dt
	}
	d := targetHeading - v.Heading
	for d > math.Pi {
		d -= 2 * math.Pi
	}
	for d < -math.Pi {
		d += 2 * math.Pi
	}
	if d > maxTurn {
		d = maxTurn
	} else if d < -maxTurn {
		d = -maxTurn
	}
	v.Heading += d
	v.X += math.Cos(v.Heading) * v.Speed * dt
	v.Y += math.Sin(v.Heading) * v.Speed * dt
}

// Ram resolves the vehicle driving into a foot unit. Contact is the caller's
// check; this resolves what contact means.
//
// The target takes the class ram damage scaled by impact speed: a vehicle at
// full pace hits far harder than one rolling. The vehicle takes damage
// scaled by the target's mass in bodies: running down one man is free, and
// running down a squad is not. Armor softens the vehicle's share.
//
// It returns the damage dealt to the target and to the vehicle.
func (v *Vehicle) Ram(target *Unit) (toTarget, toVehicle float64) {
	if !v.Operable() || target == nil || !target.alive() {
		return 0, 0
	}
	speedFrac := 0.0
	if v.spec.Speed > 0 {
		speedFrac = clamp01(v.Speed / v.spec.Speed)
	}
	toTarget = v.spec.RamDamage * (0.5 + 0.5*speedFrac)
	targetMass := target.Troops * v.cfg.TroopMassKg
	toVehicle = targetMass * v.cfg.RamMassDamageScale * (0.5 + 0.5*speedFrac)
	toVehicle *= 1 - v.spec.Armor
	target.HP -= toTarget
	v.Damage(toVehicle)
	return toTarget, toVehicle
}

// RamObstacle resolves the vehicle driving into light cover. The obstacle
// takes full ram damage at impact speed; the vehicle's front armor takes the
// hit, scaled by the obstacle's mass. Ramming a barricade is how a pickup
// loses its front armor: the armor is ablative and does not come back.
//
// It returns the damage dealt to the obstacle and to the front armor.
func (v *Vehicle) RamObstacle(o *Obstacle) (toObstacle, toArmor float64) {
	if !v.Operable() || o == nil || o.HP <= 0 {
		return 0, 0
	}
	speedFrac := 0.0
	if v.spec.Speed > 0 {
		speedFrac = clamp01(v.Speed / v.spec.Speed)
	}
	toObstacle = v.spec.RamDamage * (0.5 + 0.5*speedFrac)
	o.HP -= toObstacle
	toArmor = o.Mass * v.cfg.RamMassDamageScale * (0.5 + 0.5*speedFrac)
	v.FrontArmorHP -= toArmor
	if v.FrontArmorHP < 0 {
		// Spent armor lets the remainder through to the hull.
		v.Damage(-v.FrontArmorHP)
		v.FrontArmorHP = 0
	}
	return toObstacle, toArmor
}

// NewBarricade builds light cover of the configured barricade mass.
func NewBarricade(c *config.Config, name string, hp float64) *Obstacle {
	return &Obstacle{Name: name, HP: hp, Mass: c.Vehicle.BarricadeMassKg}
}

// Embark puts a unit in the passenger bay. The unit must be on the field and
// there must be a seat. The vehicle keeps the passenger list; the battle
// integration reads it to keep embarked units out of targeting and morale.
func (v *Vehicle) Embark(u *Unit) error {
	if v.State == VehicleDestroyed || v.State == VehicleBurning {
		return fmt.Errorf("cannot embark on a %s vehicle", v.State)
	}
	if u == nil || !u.alive() {
		return fmt.Errorf("cannot embark a unit that is not on the field")
	}
	if len(v.Passengers) >= int(v.spec.Passengers) {
		return fmt.Errorf("vehicle full: %d seats, %d taken", int(v.spec.Passengers), len(v.Passengers))
	}
	for _, p := range v.Passengers {
		if p == u {
			return fmt.Errorf("unit is already embarked")
		}
	}
	v.Passengers = append(v.Passengers, u)
	return nil
}

// Disembark puts a passenger back on the field at the vehicle's position.
func (v *Vehicle) Disembark(u *Unit) error {
	for i, p := range v.Passengers {
		if p == u {
			v.Passengers = append(v.Passengers[:i], v.Passengers[i+1:]...)
			u.X, u.Y = v.X, v.Y
			return nil
		}
	}
	return fmt.Errorf("unit is not a passenger of this vehicle")
}

// PassengerCount is the seats taken.
func (v *Vehicle) PassengerCount() int { return len(v.Passengers) }

// SeatsFree is the seats remaining.
func (v *Vehicle) SeatsFree() int { return int(v.spec.Passengers) - len(v.Passengers) }

// CanFireFrom reports whether passengers may shoot from this vehicle: the
// class must be open and the vehicle must still be operable.
func (v *Vehicle) CanFireFrom() bool {
	return v.spec.Open >= 1 && v.Operable()
}

// PassengerAccuracy is the hit chance of a passenger firing a personal
// weapon from the vehicle, given the shooter's base accuracy. Open vehicles
// halve it, and speed costs more on top: a drive-by is possible because the
// floor never reaches zero, but it is never a good shot.
func (v *Vehicle) PassengerAccuracy(base float64) float64 {
	if !v.CanFireFrom() {
		return 0
	}
	acc := base * v.cfg.PassengerAccuracyScale
	acc *= 1 - v.Speed*v.cfg.DrivebySpeedPenalty
	if acc < 0.01 {
		acc = 0.01
	}
	return acc
}

// Damage applies incoming damage to the hull, reduced by armor, and moves
// the damage state. Crossing into disabled-or-worse bails the crew out: the
// bailed passengers are returned so the caller can place them, each carrying
// the bailout morale hit.
func (v *Vehicle) Damage(amount float64) []*Unit {
	if amount <= 0 || v.State == VehicleDestroyed {
		return nil
	}
	v.HP -= amount * (1 - v.spec.Armor)
	if v.HP < 0 {
		v.HP = 0
	}
	return v.updateState()
}

// updateState recomputes the damage state from the hull fraction and bails
// the crew when the vehicle stops being operable.
func (v *Vehicle) updateState() []*Unit {
	frac := v.HPFrac()
	var next VehicleState
	switch {
	case frac <= 0:
		next = VehicleDestroyed
	case frac <= v.cfg.BurningHPFrac:
		next = VehicleBurning
	case frac <= v.cfg.DisabledHPFrac:
		next = VehicleDisabled
	case frac < 1:
		next = VehicleDamaged
	default:
		next = VehicleIntact
	}
	was := v.State
	v.State = next
	if next >= VehicleDisabled && was < VehicleDisabled {
		return v.bailOut()
	}
	return nil
}

// bailOut empties the passenger bay onto the field at the vehicle's
// position. Bailing is not orderly: every bailed agent takes the configured
// morale hit.
func (v *Vehicle) bailOut() []*Unit {
	bailed := v.Passengers
	v.Passengers = nil
	for _, u := range bailed {
		u.X, u.Y = v.X, v.Y
		u.Morale -= v.cfg.BailoutMoraleHit
		if u.Morale < 0 {
			u.Morale = 0
		}
	}
	return bailed
}

// ChargeShock forces the morale check a vehicle charge inflicts on enemy
// foot troops. Call it when the vehicle makes contact at speed: every enemy
// unit within the shock radius tests its nerve.
//
// The shock is the configured power at the point of impact, falling off with
// distance, resisted by the target's steadiness (half skill, half morale).
// Against the battle's break and rout thresholds, militia break and veterans
// hold: that is the acceptance test, not a tuning accident.
//
// It takes an rng for the small jitter that keeps identical charges from
// producing identical breaks, and returns the units that broke or routed.
func (v *Vehicle) ChargeShock(c *config.Config, foes []*Unit, r *rng.Rng) (broken, routed []*Unit) {
	if v.Speed < v.cfg.ShockMinSpeed {
		return nil, nil
	}
	rad2 := v.cfg.ShockRadius * v.cfg.ShockRadius
	for _, u := range foes {
		if u == nil || !u.alive() || u.Side == v.Side {
			continue
		}
		d2 := dist2(u.X-v.X, u.Y-v.Y)
		if d2 > rad2 {
			continue
		}
		dist := math.Sqrt(d2)
		falloff := 1 - dist/v.cfg.ShockRadius
		steadiness := clamp01(0.5*u.MeleeSkill + 0.5*u.Morale)
		shock := v.cfg.ShockPower * falloff * (1 - steadiness)
		// Jitter of plus or minus ten percent, so the check is a check and
		// not a lookup table.
		shock *= 0.9 + 0.2*r.Float64()
		u.Morale -= shock
		if u.Morale < 0 {
			u.Morale = 0
		}
		switch {
		case u.Morale < c.Battle.MoraleRoutThreshold:
			u.Status = StatusRouted
			routed = append(routed, u)
		case u.Morale < c.Battle.MoraleBreakThreshold:
			u.Status = StatusBroken
			broken = append(broken, u)
		}
	}
	return broken, routed
}

// Tick advances the vehicle's own clock by one tick. The only thing on it is
// the burning countdown: a burning vehicle explodes after the configured
// delay, damaging every unit within the blast radius with linear falloff,
// and is then destroyed. The explosion goes off exactly once.
//
// It returns the units damaged by the blast, if any.
func (v *Vehicle) Tick(units []*Unit) []*Unit {
	if v.State != VehicleBurning || v.exploded {
		return nil
	}
	v.TicksBurning++
	if float64(v.TicksBurning) < v.cfg.ExplosionDelayTicks {
		return nil
	}
	v.exploded = true
	rad2 := v.cfg.ExplosionRadius * v.cfg.ExplosionRadius
	var hit []*Unit
	for _, u := range units {
		if u == nil || !u.alive() {
			continue
		}
		d2 := dist2(u.X-v.X, u.Y-v.Y)
		if d2 > rad2 {
			continue
		}
		dist := math.Sqrt(d2)
		dmg := v.cfg.ExplosionDamage * (1 - dist/v.cfg.ExplosionRadius)
		u.HP -= dmg
		hit = append(hit, u)
	}
	v.HP = 0
	v.State = VehicleDestroyed
	return hit
}
