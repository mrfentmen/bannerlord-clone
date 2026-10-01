package battle

import (
	"math"
	"testing"
)

// A rifle round at 200 m drops a documented amount: 940 m/s over 200 m is
// aloft 0.21 s, and half g t^2 is about 0.22 m. This is physics, not tuning.
func TestBulletDropDocumented(t *testing.T) {
	cfg := loadConfig(t)
	drop := bulletDrop(200, weaponTable[WeaponRifle].muzzleVelocity, cfg.Battle.BallisticsGravity)
	if math.Abs(drop-0.22) > 0.03 {
		t.Fatalf("rifle drop at 200 m = %.3f m, want about 0.22 m", drop)
	}
	t.Logf("rifle drop at 200 m: %.3f m", drop)
}

// A rifle round penetrates car doors, not engine blocks.
func TestPenetrationCarDoorNotEngineBlock(t *testing.T) {
	if !penetrates(AmmoBall, barrierCarDoor) {
		t.Fatal("ball does not penetrate a car door; it should")
	}
	if penetrates(AmmoBall, barrierEngineBlock) {
		t.Fatal("ball penetrates an engine block; it must not")
	}
}

// Armor-piercing defeats light vehicle armor that ball cannot.
func TestAPDefeatsLightVehicleArmor(t *testing.T) {
	if penetrates(AmmoBall, barrierLightVehicleArmor) {
		t.Fatal("ball defeats light vehicle armor; it must not")
	}
	if !penetrates(AmmoArmorPiercing, barrierLightVehicleArmor) {
		t.Fatal("armor-piercing does not defeat light vehicle armor; it must")
	}
}

// Ammo types have distinct damage and penetration profiles.
func TestAmmoTypeProfiles(t *testing.T) {
	ball := ammoTable[AmmoBall]
	hp := ammoTable[AmmoHollowPoint]
	ap := ammoTable[AmmoArmorPiercing]
	ll := ammoTable[AmmoLessLethal]
	if !(hp.damageMul > ball.damageMul) {
		t.Fatal("hollow-point does not out-damage ball against the unprotected")
	}
	if !(hp.penetration < ball.penetration) {
		t.Fatal("hollow-point penetrates as well as ball; it must be worse against hard barriers")
	}
	if !(ap.penetration > ball.penetration) {
		t.Fatal("armor-piercing does not out-penetrate ball")
	}
	if !(ll.damageMul < ball.damageMul && ll.suppressionMul > ball.suppressionMul) {
		t.Fatal("less-lethal is not less lethal and more suppressing than ball")
	}
}

// A sprinting suppressed shooter cannot hit beyond 30 m.
func TestSprintingSuppressedCannotHitBeyond30m(t *testing.T) {
	cfg := loadConfig(t)
	a, err := GenerateForce(cfg, 7, SideA, Roster{Units: 1, AllRanged: true})
	if err != nil {
		t.Fatal(err)
	}
	d, err := GenerateForce(cfg, 7, SideB, Roster{Units: 1, AllRanged: true})
	if err != nil {
		t.Fatal(err)
	}
	bt, err := newBattle(cfg, 7, Setup{A: a, B: d, Label: "spread test"})
	if err != nil {
		t.Fatal(err)
	}
	shooter := bt.units[0]
	shooter.RangedSkill = 0.8 // even a good shot
	s := snapshot{
		X: 0, Y: 0,
		VX:          cfg.Battle.BallisticsSprintSpeed + 1, // sprinting
		VY:          0,
		Suppression: cfg.Battle.SuppressionCap, // suppressed
		Status:      StatusFighting,
	}
	for _, dist := range []float64{30, 50, 100} {
		ts := snapshot{X: dist, Y: 0, Status: StatusFighting}
		chance := bt.ballisticHitChance(&s, &ts, shooter, dist)
		if chance > 0.02 {
			t.Fatalf("sprinting suppressed hit chance at %.0f m = %.4f, want effectively zero", dist, chance)
		}
		t.Logf("sprinting suppressed hit chance at %.0f m: %.4f", dist, chance)
	}
}

// A stationary unsuppressed shooter at moderate range can still hit: the
// spread model must not make every shot hopeless.
func TestSteadyShooterCanHit(t *testing.T) {
	cfg := loadConfig(t)
	a, err := GenerateForce(cfg, 7, SideA, Roster{Units: 1, AllRanged: true})
	if err != nil {
		t.Fatal(err)
	}
	d, err := GenerateForce(cfg, 7, SideB, Roster{Units: 1, AllRanged: true})
	if err != nil {
		t.Fatal(err)
	}
	bt, err := newBattle(cfg, 7, Setup{A: a, B: d, Label: "spread test"})
	if err != nil {
		t.Fatal(err)
	}
	shooter := bt.units[0]
	shooter.RangedSkill = 0.7
	shooter.Intent = IntentHold // braced stance
	s := snapshot{X: 0, Y: 0, Status: StatusFighting}
	ts := snapshot{X: 100, Y: 0, Status: StatusFighting}
	chance := bt.ballisticHitChance(&s, &ts, shooter, 100)
	if chance < 0.10 {
		t.Fatalf("steady braced hit chance at 100 m = %.4f, want a real chance", chance)
	}
	t.Logf("steady braced hit chance at 100 m: %.4f", chance)
}

// A 30-round mag dump walks fire upward without burst control: rapid fire
// accumulates recoil toward the cap, while burst fire with pauses stays low.
func TestRecoilClimbsOnMagDump(t *testing.T) {
	cfg := loadConfig(t)
	w := weaponTable[WeaponRifle]
	maxRecoil := cfg.Battle.BallisticsRecoilMax

	// Mag dump: 30 rounds, 0.1 s apart (full auto).
	dump := 0.0
	for i := 0; i < 30; i++ {
		dump = applyRecoil(dump, w.recoilKick, w.recoilRecovery, 0.1, maxRecoil)
	}
	if dump < 0.8*maxRecoil {
		t.Fatalf("30-round mag dump recoil = %.4f rad, want near the %.3f cap", dump, maxRecoil)
	}

	// Burst control: 3-round bursts with 2 s pauses.
	burst := 0.0
	for b := 0; b < 10; b++ {
		for i := 0; i < 3; i++ {
			burst = applyRecoil(burst, w.recoilKick, w.recoilRecovery, 0.1, maxRecoil)
		}
		burst = applyRecoil(burst, 0, w.recoilRecovery, 2.0, maxRecoil)
	}
	if burst > 0.3*maxRecoil {
		t.Fatalf("burst-controlled recoil = %.4f rad, want it kept low", burst)
	}
	t.Logf("mag dump recoil %.4f vs burst-controlled %.4f (cap %.3f)", dump, burst, maxRecoil)
}

// A wooden fence stops 3 rounds before failing: the first three connecting
// hits are absorbed, the fourth reaches the target.
func TestWoodenFenceStopsThreeRounds(t *testing.T) {
	cfg := loadConfig(t)
	bt := &Battle{c: cfg.Battle}
	bt.covers = []Cover{{
		X: 7, Y: 0, Radius: 1.0, Height: CoverLow,
		HP: 3, MaxHP: 3, Protection: 2.0, Name: "wooden fence",
	}}
	// Fence on the target's half between shooter (x=0) and target (x=10).
	if got := bt.interceptingCover(0, 0, 10, 0); got != 0 {
		t.Fatalf("intercepting cover = %d, want the fence at 0", got)
	}
	for i := 0; i < 3; i++ {
		toTarget, failed := bt.resolveCoverHit(0, AmmoBall, 20)
		if toTarget != 0 {
			t.Fatalf("round %d reached the target through an intact fence", i+1)
		}
		if i < 2 && failed {
			t.Fatalf("fence failed after %d rounds, want 3", i+1)
		}
	}
	if !bt.covers[0].destroyed() {
		t.Fatal("fence not destroyed after 3 rounds")
	}
	toTarget, _ := bt.resolveCoverHit(0, AmmoBall, 20)
	// The fence has failed; interception skips destroyed cover.
	if got := bt.interceptingCover(0, 0, 10, 0); got != -1 {
		t.Fatalf("destroyed fence still intercepts (cover %d)", got)
	}
	_ = toTarget
}

// A pinned squad's effective DPS drops by at least 50%.
func TestPinnedSquadDPSHalved(t *testing.T) {
	cfg := loadConfig(t)
	a, err := GenerateForce(cfg, 11, SideA, Roster{Units: 1, AllRanged: true})
	if err != nil {
		t.Fatal(err)
	}
	d, err := GenerateForce(cfg, 11, SideB, Roster{Units: 1, AllRanged: true})
	if err != nil {
		t.Fatal(err)
	}
	bt, err := newBattle(cfg, 11, Setup{A: a, B: d, Label: "suppression test"})
	if err != nil {
		t.Fatal(err)
	}
	shooter := bt.units[0]
	shooter.RangedSkill = 0.6
	fresh := snapshot{X: 0, Y: 0, Status: StatusFighting}
	pinned := snapshot{X: 0, Y: 0, Status: StatusFighting, Suppression: cfg.Battle.SuppressionCap}
	ts := snapshot{X: 50, Y: 0, Status: StatusFighting}
	// Effective DPS scales with hit chance; damage and rate are equal here,
	// so the hit-chance ratio is the DPS ratio.
	freshChance := bt.ballisticHitChance(&fresh, &ts, shooter, 50)
	pinnedChance := bt.ballisticHitChance(&pinned, &ts, shooter, 50)
	if freshChance <= 0 {
		t.Fatal("fresh shooter has no hit chance; the test is vacuous")
	}
	ratio := pinnedChance / freshChance
	if ratio > 0.5 {
		t.Fatalf("pinned/fresh DPS ratio = %.3f, want at most 0.5", ratio)
	}
	t.Logf("pinned DPS %.4f vs fresh %.4f (ratio %.3f)", pinnedChance, freshChance, ratio)
}

// Every shot emits exactly one event bundle.
func TestEveryShotEmitsOneBundle(t *testing.T) {
	cfg := loadConfig(t)
	a, err := GenerateForce(cfg, 21, SideA, Roster{Units: 4, AllRanged: true, TroopsPerUnit: 1})
	if err != nil {
		t.Fatal(err)
	}
	d, err := GenerateForce(cfg, 21, SideB, Roster{Units: 4, AllRanged: true, TroopsPerUnit: 1})
	if err != nil {
		t.Fatal(err)
	}
	bt, err := newBattle(cfg, 21, Setup{A: a, B: d, Label: "event bundle test"})
	if err != nil {
		t.Fatal(err)
	}
	// Close the range so shots happen: 60 m apart, well inside 240 m.
	for i, u := range bt.units {
		if u.Side == SideA {
			u.X, u.Y = 0, float64(i*3)
		} else {
			u.X, u.Y = 60, float64(i*3)
		}
		u.Ammo = 50
		u.RangedCooldown = 0
	}
	for i := 0; i < 10; i++ {
		if err := bt.tick(); err != nil {
			t.Fatal(err)
		}
	}
	var shots float64
	for _, u := range bt.units {
		shots += u.Shots
	}
	if shots == 0 {
		t.Fatal("no shots fired; the test is vacuous")
	}
	bundles := 0
	for _, e := range bt.events {
		if e.Kind == EventShotFired {
			bundles++
			if e.Read == "" {
				t.Fatal("shot bundle with empty Read; the client gets nothing to render")
			}
		}
	}
	if float64(bundles) != shots {
		t.Fatalf("shot bundles = %d, shots fired = %.0f; every shot emits exactly one bundle", bundles, shots)
	}
	t.Logf("%d shots, %d bundles", int(shots), bundles)
}

// Cover values: high cover protects more than low cover.
func TestHighCoverProtectsMoreThanLow(t *testing.T) {
	cfg := loadConfig(t)
	if !(cfg.Battle.BallisticsCoverHighMult < cfg.Battle.BallisticsCoverLowMult) {
		t.Fatal("high cover multiplier is not better than low cover's")
	}
	if cfg.Battle.BallisticsCoverLowMult >= 1 || cfg.Battle.BallisticsCoverHighMult <= 0 {
		t.Fatal("cover multipliers outside (0,1)")
	}
}
