package battle

import (
	"math"
	"testing"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/rng"
)

func vehicleTestConfig(t *testing.T) *config.Config {
	t.Helper()
	path, err := findBalanceFile()
	if err != nil {
		t.Skipf("no balance config available: %v", err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("balance file did not load from %s: %v", path, err)
	}
	return cfg
}

func footUnit(side Side, x, y, morale, skill float64) *Unit {
	return &Unit{
		Side:       side,
		Role:       RoleMelee,
		HP:         100,
		MaxHP:      100,
		Morale:     morale,
		MeleeSkill: skill,
		Troops:     1,
		Status:     StatusFighting,
		X:          x,
		Y:          y,
	}
}

// Every class has a data row: sane values, and no two classes share the
// whole row. A class whose stats were hardcoded would show up here as a row
// the balance file cannot change; the test reads the file, not the code.
func TestVehicleClassRows(t *testing.T) {
	cfg := vehicleTestConfig(t)
	classes := []VehicleClass{VehiclePickup, VehicleSUV, VehicleArmoredVan, VehicleBus}
	seen := map[string]bool{}
	for _, c := range classes {
		s := classSpec(cfg, c)
		if s.Speed <= 0 {
			t.Errorf("%s: non-positive speed %v", c, s.Speed)
		}
		if s.Armor < 0 || s.Armor >= 1 {
			t.Errorf("%s: armor %v outside 0-1", c, s.Armor)
		}
		if s.HullHP <= 0 || s.FrontArmorHP < 0 {
			t.Errorf("%s: bad HP row (hull %v front %v)", c, s.HullHP, s.FrontArmorHP)
		}
		if s.Passengers < 1 {
			t.Errorf("%s: no passenger capacity", c)
		}
		if s.RamDamage <= 0 || s.TurnRadius <= 0 || s.Mass <= 0 {
			t.Errorf("%s: bad ram/turn/mass row", c)
		}
		key := [8]float64{s.Speed, s.Armor, s.HullHP, s.Passengers, s.RamDamage, s.TurnRadius, s.Mass, s.Open}
		k := ""
		for _, f := range key {
			k += string(rune(int(f * 1000)))
		}
		if seen[k] {
			t.Errorf("%s: class row identical to another class; every class needs its own data", c)
		}
		seen[k] = true
	}
}

// The plan's acceptance: a pickup crosses open ground 3x faster than
// infantry. Infantry walks at battle.roster_speed_base.
func TestPickupThreeTimesInfantry(t *testing.T) {
	cfg := vehicleTestConfig(t)
	v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	got := v.TopSpeed(TerrainOpen)
	want := 3 * cfg.Battle.RosterSpeedBase
	if math.Abs(got-want)/want > 0.01 {
		t.Fatalf("pickup open-ground speed %.2f, want 3x infantry = %.2f", got, want)
	}
}

// Roads fast, off-road (open) the baseline, forest nearly impassable.
func TestVehicleTerrainPenalties(t *testing.T) {
	cfg := vehicleTestConfig(t)
	v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	open := v.TopSpeed(TerrainOpen)
	v.OnRoad = true
	road := v.TopSpeed(TerrainOpen)
	v.OnRoad = false
	urban := v.TopSpeed(TerrainUrban)
	hill := v.TopSpeed(TerrainHill)
	forest := v.TopSpeed(TerrainForest)
	if !(road > open) {
		t.Errorf("road %.2f not faster than open %.2f", road, open)
	}
	if !(urban < open && hill < open) {
		t.Errorf("urban %.2f / hill %.2f not slower than open %.2f", urban, hill, open)
	}
	if !(urban > hill && hill > forest) {
		t.Errorf("terrain ordering wrong: urban %.2f hill %.2f forest %.2f", urban, hill, forest)
	}
	if forest/open > 0.10 {
		t.Errorf("forest speed %.2f vs open %.2f: forest must be nearly impassable", forest, open)
	}
}

// A bus cannot turn on a dime: heading change per second is capped by
// speed / turn_radius, so the bus turns far slower than the pickup.
func TestTurnRadius(t *testing.T) {
	cfg := vehicleTestConfig(t)
	pickup := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	bus := NewVehicle(cfg, 2, VehicleBus, SideA, 0, 0, 0)
	pickup.Speed = pickup.TopSpeed(TerrainOpen)
	bus.Speed = bus.TopSpeed(TerrainOpen)
	pickup.Steer(1.0, math.Pi, TerrainOpen)
	bus.Steer(1.0, math.Pi, TerrainOpen)
	turnedPickup := math.Abs(pickup.Heading)
	turnedBus := math.Abs(bus.Heading)
	if turnedBus >= turnedPickup {
		t.Fatalf("bus turned %.2f rad, pickup %.2f: the bus must turn slower", turnedBus, turnedPickup)
	}
	if turnedPickup <= 0 {
		t.Fatal("pickup did not turn at all")
	}
}

// Ramming damages the target, and the vehicle's share scales with the
// target's mass: one man is free, a squad is not.
func TestRamScalesWithTargetMass(t *testing.T) {
	cfg := vehicleTestConfig(t)
	v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	v.Speed = v.TopSpeed(TerrainOpen)
	one := footUnit(SideB, 1, 0, 0.8, 0.8)
	squad := footUnit(SideB, 1, 0, 0.8, 0.8)
	squad.Troops = 10
	hpBefore := v.HP
	toTarget, _ := v.Ram(one)
	if toTarget <= 0 {
		t.Fatal("ram dealt no damage to the target")
	}
	if one.HP >= 100 {
		t.Fatal("target HP unchanged by ram")
	}
	dmgOne := hpBefore - v.HP
	v.HP = hpBefore
	v.FrontArmorHP = v.spec.FrontArmorHP
	_, _ = v.Ram(squad)
	dmgSquad := hpBefore - v.HP
	if dmgSquad <= dmgOne {
		t.Fatalf("squad cost the vehicle %.2f, one man %.2f: heavier targets must cost more", dmgSquad, dmgOne)
	}
}

// Ramming a barricade spends the pickup's front armor, and the barricade
// takes the ram damage.
func TestRamBarricadeDamagesFrontArmor(t *testing.T) {
	cfg := vehicleTestConfig(t)
	v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	v.Speed = v.TopSpeed(TerrainOpen)
	b := NewBarricade(cfg, "roadblock", 200)
	armorBefore := v.FrontArmorHP
	toObstacle, toArmor := v.RamObstacle(b)
	if toObstacle <= 0 || b.HP >= 200 {
		t.Fatal("barricade took no damage from the ram")
	}
	if toArmor <= 0 || v.FrontArmorHP >= armorBefore {
		t.Fatal("front armor took no damage ramming the barricade")
	}
}

// Passengers embark and disembark; capacity is enforced; wrecks refuse boarders.
func TestPassengers(t *testing.T) {
	cfg := vehicleTestConfig(t)
	v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	cap := int(v.spec.Passengers)
	var units []*Unit
	for i := 0; i < cap; i++ {
		u := footUnit(SideA, float64(10+i), 0, 0.8, 0.8)
		units = append(units, u)
		if err := v.Embark(u); err != nil {
			t.Fatalf("embark %d failed: %v", i, err)
		}
	}
	if v.PassengerCount() != cap || v.SeatsFree() != 0 {
		t.Fatalf("count %d free %d, want %d and 0", v.PassengerCount(), v.SeatsFree(), cap)
	}
	if err := v.Embark(footUnit(SideA, 99, 0, 0.8, 0.8)); err == nil {
		t.Fatal("embark past capacity succeeded")
	}
	if err := v.Disembark(units[0]); err != nil {
		t.Fatalf("disembark failed: %v", err)
	}
	if v.PassengerCount() != cap-1 {
		t.Fatal("passenger count wrong after disembark")
	}
	if units[0].X != v.X || units[0].Y != v.Y {
		t.Fatal("disembarked unit not placed at the vehicle")
	}
	// A burning wreck takes no passengers.
	v.HP = v.spec.HullHP * 0.1
	v.updateState()
	if v.State != VehicleBurning {
		t.Fatalf("state %s, want burning", v.State)
	}
	if err := v.Embark(footUnit(SideA, 50, 0, 0.8, 0.8)); err == nil {
		t.Fatal("embark on a burning vehicle succeeded")
	}
}

// Open vehicles let passengers fire at reduced accuracy; closed ones do
// not. A drive-by at speed is possible but worse than firing stopped.
func TestPassengerFire(t *testing.T) {
	cfg := vehicleTestConfig(t)
	pickup := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	suv := NewVehicle(cfg, 2, VehicleSUV, SideA, 0, 0, 0)
	if !pickup.CanFireFrom() {
		t.Fatal("open pickup refuses passenger fire")
	}
	if suv.CanFireFrom() {
		t.Fatal("closed SUV allows passenger fire")
	}
	base := 0.8
	stopped := pickup.PassengerAccuracy(base)
	if stopped >= base {
		t.Fatalf("passenger accuracy %.3f not reduced from base %.3f", stopped, base)
	}
	if stopped <= 0 {
		t.Fatal("passenger accuracy is zero even stopped")
	}
	pickup.Speed = pickup.TopSpeed(TerrainOpen)
	moving := pickup.PassengerAccuracy(base)
	if moving <= 0 {
		t.Fatal("drive-by impossible: accuracy hit zero at speed")
	}
	if moving >= stopped {
		t.Fatalf("moving accuracy %.3f not worse than stopped %.3f", moving, stopped)
	}
}

// A vehicle charge at speed forces a morale check: militia break, veterans
// hold. Same seed, same result.
func TestChargeShock(t *testing.T) {
	cfg := vehicleTestConfig(t)
	run := func(seed uint64) (militiaStatus, vetStatus Status) {
		v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
		v.Speed = v.TopSpeed(TerrainOpen)
		militia := footUnit(SideB, 5, 0, 0.35, 0.20)
		vet := footUnit(SideB, 8, 0, 0.85, 0.85)
		r := rng.New(seed)
		v.ChargeShock(cfg, []*Unit{militia, vet}, r)
		return militia.Status, vet.Status
	}
	ms1, vs1 := run(42)
	ms2, vs2 := run(42)
	if ms1 != ms2 || vs1 != vs2 {
		t.Fatal("shock not deterministic on the same seed")
	}
	if ms1 == StatusFighting {
		t.Fatal("militia held against a vehicle charge; they should break")
	}
	if vs1 != StatusFighting {
		t.Fatalf("veteran status %s; veterans should hold", vs1)
	}
	// A parked truck frightens nobody.
	v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	v.Speed = 0
	militia := footUnit(SideB, 5, 0, 0.35, 0.20)
	broken, routed := v.ChargeShock(cfg, []*Unit{militia}, rng.New(7))
	if len(broken)+len(routed) != 0 || militia.Status != StatusFighting {
		t.Fatal("parked vehicle caused a morale check")
	}
}

// Damage states walk intact, damaged, disabled, burning, destroyed. The
// crew bails out on disabled+, carrying the bailout morale hit.
func TestDamageStates(t *testing.T) {
	cfg := vehicleTestConfig(t)
	v := NewVehicle(cfg, 1, VehicleBus, SideA, 0, 0, 0)
	crew := []*Unit{footUnit(SideA, 0, 0, 0.8, 0.8), footUnit(SideA, 0, 0, 0.8, 0.8)}
	for _, u := range crew {
		if err := v.Embark(u); err != nil {
			t.Fatal(err)
		}
	}
	if v.State != VehicleIntact {
		t.Fatalf("fresh vehicle is %s", v.State)
	}
	// Damage() reduces by armor; compute raw hits from the fractions.
	fracOf := func(f float64) float64 { return v.spec.HullHP * f / (1 - v.spec.Armor) }
	v.Damage(fracOf(0.5))
	if v.State != VehicleDamaged {
		t.Fatalf("at half hull: %s, want damaged", v.State)
	}
	if v.PassengerCount() != 2 {
		t.Fatal("crew bailed from a merely damaged vehicle")
	}
	var bailed []*Unit
	bailed = v.Damage(fracOf(0.25))
	if v.State != VehicleDisabled {
		t.Fatalf("at quarter hull: %s, want disabled", v.State)
	}
	if len(bailed) != 2 || v.PassengerCount() != 0 {
		t.Fatalf("disabled vehicle kept %d passengers", v.PassengerCount())
	}
	for _, u := range bailed {
		if u.Morale >= 0.8 {
			t.Fatal("bailed crew took no morale hit")
		}
	}
	if v.Operable() {
		t.Fatal("disabled vehicle still operable")
	}
	v.Damage(fracOf(0.15))
	if v.State != VehicleBurning {
		t.Fatalf("near death: %s, want burning", v.State)
	}
	v.Damage(fracOf(1.0))
	if v.State != VehicleDestroyed {
		t.Fatalf("at zero hull: %s, want destroyed", v.State)
	}
}

// A burning vehicle explodes after exactly 100 ticks, damaging nearby
// agents and leaving distant ones alone. It explodes once.
func TestBurningExplosion(t *testing.T) {
	cfg := vehicleTestConfig(t)
	if cfg.Vehicle.ExplosionDelayTicks != 100 {
		t.Fatalf("explosion delay %.0f, want 100", cfg.Vehicle.ExplosionDelayTicks)
	}
	v := NewVehicle(cfg, 1, VehiclePickup, SideA, 0, 0, 0)
	v.HP = v.spec.HullHP * 0.1
	v.updateState()
	near := footUnit(SideB, 5, 0, 0.9, 0.9)
	far := footUnit(SideB, 100, 0, 0.9, 0.9)
	units := []*Unit{near, far}
	var hit []*Unit
	for i := 0; i < 99; i++ {
		if got := v.Tick(units); got != nil {
			t.Fatalf("exploded on tick %d, want exactly 100", i+1)
		}
	}
	hit = v.Tick(units)
	if v.State != VehicleDestroyed {
		t.Fatalf("after 100 burning ticks: %s, want destroyed", v.State)
	}
	if len(hit) != 1 || hit[0] != near {
		t.Fatalf("blast hit %d units, want exactly the near one", len(hit))
	}
	if near.HP >= 100 {
		t.Fatal("near unit undamaged by the blast")
	}
	if far.HP != 100 {
		t.Fatal("far unit damaged by the blast")
	}
	if again := v.Tick(units); again != nil {
		t.Fatal("vehicle exploded twice")
	}
}
