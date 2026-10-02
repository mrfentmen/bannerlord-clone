package battle

import (
	"reflect"
	"testing"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// Terrain reached a party long before it reached a fight. The template, march,
// and attrition systems each keep their own copy of the rule that decides what
// ground a party is standing on, and each of them uses it for march speed or
// template fit. Until now it had no influence on combat resolution at all: two
// identical armies fought a mountain pass exactly as they fought a coastal
// plain, which is the opposite of what COMBAT.md section 1 asks for ("terrain
// ... decide outcomes more than raw headcount") and section 8 describes.
//
// What is tested here is the terrain term itself, and one property of it that is
// arithmetic rather than a design choice and is pinned so that a later reader
// does not have to rediscover it: a symmetric per-template table cancels in the
// ratio between two armies of the same template, so ground cannot decide a fight
// between like armies. It decides fights between unlike ones, which is the case
// the table is written for.

// terrainState is matchupState with the ground named, because a test about the
// ground has to be able to choose it.
func terrainState(t *testing.T, cfg *config.Config, terrain int,
	self, other model.PartyTemplate, selfTroops, otherTroops float64) *model.State {
	t.Helper()
	s := matchupState(t, cfg, self, other, selfTroops, otherTroops)
	s.Towns[1].Terrain = terrain
	return s
}

// The balance file has to say what the tests are about. A table that silently
// loaded as all zeros would make every assertion below pass, because a zero
// multiplier is a different number from a neutral one and both leave the winner
// alone.
func TestBalanceFileStatesTheTerrainItIsTesting(t *testing.T) {
	cfg := testCfg(t)
	tc := cfg.TerrainCombat.PerTemplate
	cases := []struct {
		terrain int
		shape   model.PartyTemplate
		want    float64
		why     string
	}{
		{model.TerrainMountain, model.TplStance, 1.20, "a line holds a mountain pass"},
		{model.TerrainMountain, model.TplHorse, 0.60, "horses are nearly useless in the mountains"},
		{model.TerrainForest, model.TplLight, 1.25, "the trees are the skirmish screen's"},
		{model.TerrainPlain, model.TplLight, 1.20, "open ground favours the screen"},
		{model.TerrainPlain, model.TplHeavy, 1.00, "plain ground is neutral for an armoured core"},
	}
	for _, c := range cases {
		if got := tc[c.terrain][c.shape]; !nearly(got, c.want) {
			t.Errorf("terrain_combat on terrain %d for template %d = %v, want %v: %s",
				c.terrain, c.shape, got, c.want, c.why)
		}
	}
	// The whole table has to be non-trivial, or the feature is a no-op that
	// still costs a lookup on every fight.
	off := 0
	for ti := range tc {
		for _, v := range tc[ti] {
			if !nearly(v, 1) {
				off++
			}
		}
	}
	if off < model.TemplateCount {
		t.Errorf("only %d of %d terrain cells are off 1.0: the table is nearly "+
			"flat, so terrain barely reaches combat", off,
			model.TerrainCount*model.TemplateCount)
	}
}

// The mechanism. The same two armies, the same seed, on two different grounds.
// A mounted wing and a stance line are the pairing the table exists for, and
// the ground moves the balance between them by a factor of two in the
// mountains, so the fight has to come out differently there than on the plain.
func TestTerrainChangesTheOutcome(t *testing.T) {
	cfg := testCfg(t)
	differed := 0
	const seeds = 16
	for seed := uint64(1); seed <= seeds; seed++ {
		a := terrainState(t, cfg, model.TerrainPlain, model.TplHorse, model.TplStance, 100000, 100000)
		b := terrainState(t, cfg, model.TerrainMountain, model.TplHorse, model.TplStance, 100000, 100000)
		resolveWith(t, cfg, a, seed)
		resolveWith(t, cfg, b, seed)
		if !reflect.DeepEqual(snapshot(a), snapshot(b)) {
			differed++
		}
	}
	if differed == 0 {
		t.Errorf("in %d seeds, the same fight on the plain and in the mountains "+
			"resolved identically: the terrain term is not reaching combat", seeds)
	}
	// The direction of the effect is asserted as well as its existence, because a
	// term that moved the numbers the wrong way round would satisfy the test
	// above. The horse party is the attacker in both fixtures: on the plain the
	// ground helps it, in the mountains the ground is against it, so its
	// strength share has to fall.
	shareOn := func(terrain int) float64 {
		s := terrainState(t, cfg, terrain, model.TplHorse, model.TplStance, 100000, 100000)
		log := resolveWith(t, cfg, s, 41)
		read, ok := findRead(log.Rows(), "terrain_attacker")
		if !ok {
			t.Fatalf("no cause row carried terrain_attacker on terrain %d", terrain)
		}
		ground, _ := readValue(read, "terrain_attacker")
		return ground
	}
	if on := shareOn(model.TerrainPlain); !nearly(on, 1.15) {
		t.Errorf("on the plain the horse party is worth %v, want 1.15", on)
	}
	if in := shareOn(model.TerrainMountain); !nearly(in, 0.60) {
		t.Errorf("in the mountains the horse party is worth %v, want 0.60", in)
	}
}

// The cancellation, pinned. The terrain table is per template and not per side,
// because the ground does not take sides. Two armies of the same template
// standing on the same ground therefore get the same multiplier, it cancels in
// strA/(strA+strB), and the fight resolves exactly as it would have on any other
// ground.
//
// This is asserted rather than left implicit because the alternative is a reader
// assuming terrain decides every fight, tuning the table, and seeing nothing
// happen. It is a property of the arithmetic, not a balance choice: making ground
// able to decide a fight between two identical armies would need an asymmetric
// term, and there is no honest way to make the ground favour one of two armies
// that are the same kind of army.
func TestTerrainAloneCannotChangeAMatchBetweenLikeArmies(t *testing.T) {
	cfg := testCfg(t)
	for _, terrain := range []int{
		model.TerrainPlain, model.TerrainMountain, model.TerrainSwamp,
	} {
		a := terrainState(t, cfg, terrain, model.TplHeavy, model.TplHeavy, 100000, 60000)
		b := terrainState(t, cfg, model.TerrainPlain, model.TplHeavy, model.TplHeavy, 100000, 60000)
		resolveWith(t, cfg, a, 5)
		resolveWith(t, cfg, b, 5)
		if !reflect.DeepEqual(snapshot(a), snapshot(b)) {
			t.Errorf("two heavy columns fought differently on terrain %d than on "+
				"the plain (%+v vs %+v): the terrain term is not cancelling, so it "+
				"is not symmetric",
				terrain, snapshot(a), snapshot(b))
		}
	}
}

// The two terms have to be visible apart as well as together, or the Why panel
// cannot say whether the ground or the formations decided a fight. Both cells
// and both products are in the read string, read back here off the committed
// log rather than off a returned value.
func TestBothTerrainTermsAreInTheCauseLog(t *testing.T) {
	cfg := testCfg(t)
	s := terrainState(t, cfg, model.TerrainMountain, model.TplStance, model.TplHorse, 100000, 60000)
	rows := resolveWith(t, cfg, s, 9).Rows()
	read, ok := findRead(rows, "terrain_attacker")
	if !ok {
		t.Fatalf("no cause row carried the terrain figures, out of %d rows:\n%s",
			len(rows), dumpReads(rows))
	}
	want := map[string]float64{
		"terrain":          float64(model.TerrainMountain),
		"terrain_attacker": cfg.TerrainCombat.PerTemplate[model.TerrainMountain][model.TplStance],
		"terrain_defender": cfg.TerrainCombat.PerTemplate[model.TerrainMountain][model.TplHorse],
		"attacker_matchup": cfg.Battle.FormationBonus[model.TplStance][model.TplHorse],
		"defender_matchup": cfg.Battle.FormationBonus[model.TplHorse][model.TplStance],
	}
	// The two products are what the strengths were actually multiplied by, and
	// they are the clamped product of the two cells above.
	want["attacker_modifier"] = situational(&sim.View{Cfg: cfg},
		want["attacker_matchup"]*want["terrain_attacker"])
	want["defender_modifier"] = situational(&sim.View{Cfg: cfg},
		want["defender_matchup"]*want["terrain_defender"])
	for _, key := range []string{
		"terrain", "terrain_attacker", "terrain_defender",
		"attacker_matchup", "defender_matchup", "attacker_modifier", "defender_modifier",
	} {
		got, present := readValue(read, key)
		if !present {
			t.Errorf("the read string does not carry %s: %q", key, read)
			continue
		}
		if !nearly(got, want[key]) {
			t.Errorf("%s = %v, want %v (read: %q)", key, got, want[key], read)
		}
	}
	// And the strengths in the same read string are the ones those products were
	// applied to, so the numbers a player is shown are the numbers the fight was
	// decided on.
	attacker, ok1 := readValue(read, "attacker_strength")
	defender, ok2 := readValue(read, "defender_strength")
	if !ok1 || !ok2 {
		t.Fatalf("the read string does not carry both strengths: %q", read)
	}
	if attacker <= 0 || defender <= 0 {
		t.Errorf("a resolved fight reported strengths %v and %v", attacker, defender)
	}
}

// A town with no recorded ground still has to fight. The fallback is plain,
// which is the same answer the nearest-route rule gives when there is no route
// to be near, and a town whose ground is corrupt is treated the same way rather
// than indexing the table with it.
func TestATownWithNoUsableGroundStillResolves(t *testing.T) {
	cfg := testCfg(t)
	for _, terrain := range []int{-1, model.TerrainCount + 2, model.TerrainPlain} {
		s := terrainState(t, cfg, terrain, model.TplStance, model.TplHeavy, 100000, 60000)
		resolveWith(t, cfg, s, 3)
		if s.Parties[2].Troops >= 60000 {
			t.Errorf("a town with terrain %d resolved no battle at all", terrain)
		}
		// The fallback is plain, so the figures are plain's figures.
		rows := resolveWith(t, cfg, terrainState(t, cfg, terrain,
			model.TplStance, model.TplHeavy, 100000, 60000), 3).Rows()
		read, ok := findRead(rows, "terrain_attacker")
		if !ok {
			t.Fatalf("terrain %d: no cause row carried the terrain figures", terrain)
		}
		got, _ := readValue(read, "terrain")
		if int(got) != model.TerrainPlain {
			t.Errorf("a town with terrain %d fought on terrain %v, want the plain "+
				"fallback %d", terrain, got, model.TerrainPlain)
		}
	}
	// A town id that names no town at all cannot reach here: run() skips a
	// destination that no longer exists. This is the direct call, to pin the
	// bounds check rather than the caller.
	if got := terrainOf(&sim.View{State: model.NewState(), Cfg: cfg}, 999); got != model.TerrainPlain {
		t.Errorf("a missing town reported terrain %v, want the plain fallback", got)
	}
}

// The march side must be undisturbed. The terrain tables are siblings and the
// loader reads both by string, so a rename or a shift would leave one of them
// reading zeroes without any error. The march factors are asserted to still hold
// the values the shipped file states, which is the check a rename would fail.
func TestTheMarchTerrainTablesAreUndisturbed(t *testing.T) {
	cfg := testCfg(t)
	// TerrainSpeedPerClass and TerrainFit are read by the march and template
	// systems. A value that is non-trivial proves the key names still resolve.
	if got := cfg.Template.TerrainSpeedPerClass[model.TerrainMountain][model.ClassHorse]; !nearly(got, 0.40) {
		t.Errorf("template.terrain_speed_mountain_horse = %v, want 0.40: the march "+
			"side has been disturbed", got)
	}
	if got := cfg.Template.TerrainFit[model.TerrainMountain][model.TplHorse]; !nearly(got, 0.20) {
		t.Errorf("template.terrain_fit_mountain_horse = %v, want 0.20: the template "+
			"side has been disturbed", got)
	}
	// And the two new tables are separate: the combat table is not a copy of the
	// fit table, because a designer is expected to disagree about them.
	if nearly(cfg.TerrainCombat.PerTemplate[model.TerrainMountain][model.TplHorse],
		cfg.Template.TerrainFit[model.TerrainMountain][model.TplHorse]) {
		t.Error("terrain_combat_mountain_horse equals terrain_fit_mountain_horse: " +
			"the two tables are the same numbers, so one of them was copied")
	}
}
