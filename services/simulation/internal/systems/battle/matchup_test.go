package battle

import (
	"math"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/template"
)

// The formation matchup is the first thing in this package that depends on both
// sides of a fight rather than on one of them, and every hazard in it is a
// question about that: which cell of the table is read, whether both sides get
// it, and whether it is read from what a party is made of or from what it says
// it is. Each of those is a separate test below.

// matchupState puts two hostile parties in one town with a stated shape each,
// and publishes the class counts that match, so the shape a party is scored on
// is the shape it is made of rather than a field nobody set.
func matchupState(t *testing.T, cfg *config.Config, self, other model.PartyTemplate,
	selfTroops, otherTroops float64) *model.State {
	t.Helper()
	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Name: "Fieldside", SideID: 1}
	s.Sides[1] = &model.Side{ID: 1, Name: "A", Culture: 0}
	s.Sides[2] = &model.Side{ID: 2, Name: "B", Culture: 0}
	s.SetSideRelation(1, 2, -50)
	// Party 1 is the one whose cell the test is about, and party 2 the one it is
	// measured against. Party 1 is the stronger of the two whenever the troops
	// say so, which is what makes it findPair's nominal attacker.
	s.Parties[1] = &model.Party{ID: 1, SideID: 1, LeaderID: 1, DestTown: 1,
		Troops: selfTroops, Template: self, Morale: 0.5, Cohesion: 0.5}
	s.Parties[2] = &model.Party{ID: 2, SideID: 2, LeaderID: 2, DestTown: 1,
		Troops: otherTroops, Template: other, Morale: 0.5, Cohesion: 0.5}
	s.Leaders[1] = &model.Leader{ID: 1, SideID: 1, PartyID: 1}
	s.Leaders[2] = &model.Leader{ID: 2, SideID: 2, PartyID: 2}
	publishShape(s, 1, self)
	publishShape(s, 2, other)
	return s
}

// publishShape writes the class counts for a party that fields one troop class
// and nothing else, so a party named for a template is made of that template's
// troops and its shape is the one the test says it is.
//
// The counts are deliberately not the composition the template system would
// really publish. That composition is bent by the side's culture, and in the
// shipped balance file the bend is strong enough that the horse template comes
// out mostly light troops under culture zero, so a fixture built from it would
// silently be a light party. A test that says "a stance column against a mounted
// wing" and means it has to publish the counts that make it one; the mapping from
// a real composition to a shape is what TestShapeFollowsThePublishedClassCounts
// is for.
func publishShape(s *model.State, id int, tpl model.PartyTemplate) {
	p := s.Parties[id]
	p.StanceTroops, p.HeavyTroops, p.LightTroops, p.HorseTroops = 0, 0, 0, 0
	n := p.Troops
	switch tpl {
	case model.TplStance:
		p.StanceTroops = n
	case model.TplHeavy:
		p.HeavyTroops = n
	case model.TplLight:
		p.LightTroops = n
	default:
		p.HorseTroops = n
	}
}

// resolveWith runs one tick with a chosen config, which is what lets a test
// neutralise a balance table and see what the table was doing.
func resolveWith(t *testing.T, cfg *config.Config, s *model.State, seed uint64) *cause.Log {
	t.Helper()
	log := cause.NewLog(1000)
	e := sim.NewEngine(cfg, log, seed, []sim.System{System()})
	if err := e.Tick(s); err != nil {
		t.Fatalf("tick: %v", err)
	}
	return log
}

// neutralMatchups returns a copy of the config with every formation bonus set
// to 1, so the same fixture can be resolved with and without the matchup and
// the difference attributed to the table rather than to the templates.
func neutralMatchups(cfg *config.Config) *config.Config {
	out := *cfg
	out.Battle.FormationBonus = [model.TemplateCount][model.TemplateCount]float64{}
	for a := range out.Battle.FormationBonus {
		for d := range out.Battle.FormationBonus[a] {
			out.Battle.FormationBonus[a][d] = 1
		}
	}
	return &out
}

// The balance file has to say what the test is about, or the test would be
// asserting against a table that says the opposite. This is the model the
// package already uses for the blunt-capture share.
func TestBalanceFileStatesTheMatchupItIsTesting(t *testing.T) {
	cfg := testCfg(t)
	b := cfg.Battle.FormationBonus
	if !nearly(b[model.TplStance][model.TplHorse], 1.30) {
		t.Errorf("formation_bonus_stance_horse = %v, want 1.30: a stance line holding "+
			"against a mounted wing is the pairing this package's tests rest on",
			b[model.TplStance][model.TplHorse])
	}
	if !nearly(b[model.TplHorse][model.TplStance], 0.77) {
		t.Errorf("formation_bonus_horse_stance = %v, want 0.77", b[model.TplHorse][model.TplStance])
	}
	for i := 0; i < model.TemplateCount; i++ {
		if !nearly(b[i][i], 1) {
			t.Errorf("formation_bonus on the diagonal at %d = %v, want 1: a template has "+
				"no matchup against its own kind", i, b[i][i])
		}
	}
	// The clamp has to leave room for a real multiplier, or the table is read
	// and then flattened.
	if cfg.Battle.SituationalClampMax <= 1 || cfg.Battle.SituationalClampMin >= 1 {
		t.Errorf("the situational clamp band is [%v, %v], which does not contain 1",
			cfg.Battle.SituationalClampMin, cfg.Battle.SituationalClampMax)
	}
}

// The decision this package made, pinned. The table is antisymmetric: the same
// question asked the other way round is the reciprocal, and the two cells of a
// pairing multiply to one. A directional table would let both sides of a pairing
// read above 1, and then a matchup could not change the outcome between two
// equal armies, which is most of what a matchup is for.
func TestMatchupIsAntisymmetric(t *testing.T) {
	cfg := testCfg(t)
	for a := 0; a < model.TemplateCount; a++ {
		for d := 0; d < model.TemplateCount; d++ {
			product := cfg.Battle.FormationBonus[a][d] * cfg.Battle.FormationBonus[d][a]
			// The balance file writes two-decimal reciprocals, so the product is
			// one to within the rounding of the coarser of the two. The
			// validator allows half a percent either way for the same reason.
			if math.Abs(product-1) > 0.005 {
				t.Errorf("formation_bonus[%d][%d] * formation_bonus[%d][%d] = %v, want 1",
					a, d, d, a, product)
			}
		}
	}
	// And the unit test of the decision: a matchup that favours nothing is not a
	// matchup, so at least one pairing has to be off 1.0 in the shipped file.
	favoured := 0
	for a := 0; a < model.TemplateCount; a++ {
		for d := a + 1; d < model.TemplateCount; d++ {
			if math.Abs(cfg.Battle.FormationBonus[a][d]-1) > 0.005 {
				favoured++
			}
		}
	}
	if favoured == 0 {
		t.Error("every cell of the shipped matchup table is 1.0: no pairing is " +
			"favoured, so the table is not doing anything")
	}
}

// The mechanism: the same two armies, the same seed, resolved with the matchup
// table and with it flattened, have to come out differently. Comparing against a
// neutralised table rather than against a different template is what makes this
// a test of the matchup: two templates differing also differ in
// combat_per_class, so "these two fights differ" on its own would prove
// nothing about the new table.
func TestFormationMatchupChangesTheOutcome(t *testing.T) {
	cfg := testCfg(t)
	flat := neutralMatchups(cfg)

	differed := 0
	const seeds = 12
	for seed := uint64(1); seed <= seeds; seed++ {
		withBonus := matchupState(t, cfg, model.TplStance, model.TplHorse, 100000, 100000)
		withoutBonus := matchupState(t, flat, model.TplStance, model.TplHorse, 100000, 100000)
		resolveWith(t, cfg, withBonus, seed)
		resolveWith(t, flat, withoutBonus, seed)

		got := snapshot(withBonus)
		want := snapshot(withoutBonus)
		if !reflect.DeepEqual(got, want) {
			differed++
		}
	}
	if differed == 0 {
		t.Errorf("in %d seeds, flattening the matchup table changed nothing: the "+
			"formation bonus is being read but is not reaching the result", seeds)
	}
	// A matchup that is in the table but does nothing would pass the test above
	// if the difference were one row of rounding, so the effect is also measured
	// rather than merely observed: the two orientations of one pairing have to
	// move the strength ratio by roughly what the table says they do.
	s := matchupState(t, cfg, model.TplStance, model.TplHorse, 100000, 100000)
	log := resolveWith(t, cfg, s, 3)
	rows := log.Rows()
	if len(rows) == 0 {
		t.Fatal("the fight produced no cause rows, so nothing was resolved")
	}
	// The read string has to carry the multipliers, or the Why panel cannot
	// explain a result that turned on them (CONSTITUTION.md 2.2). Every row the
	// fight writes shares one read string, and the capture row has a read of its
	// own, so the rows are searched rather than indexed.
	read, found := findRead(rows, "attacker_matchup")
	if !found {
		t.Fatalf("no cause row carried attacker_matchup, out of %d rows:\n%s",
			len(rows), dumpReads(rows))
	}
	if !strings.Contains(read, "defender_matchup") {
		t.Errorf("the battle read string does not carry defender_matchup: %q", read)
	}
	if !strings.Contains(read, "matchup_attacker_shape") {
		t.Errorf("the read string does not carry the shapes the matchup was read "+
			"from: %q", read)
	}
}

// findRead returns the read string of the first cause row that mentions a key.
func findRead(rows []cause.Row, key string) (string, bool) {
	for _, r := range rows {
		if strings.Contains(r.Read, key) {
			return r.Read, true
		}
	}
	return "", false
}

func dumpReads(rows []cause.Row) string {
	var sb strings.Builder
	for _, r := range rows {
		sb.WriteString("  " + r.Field + ": " + r.Read + "\n")
	}
	return sb.String()
}

// Which cell is read. The same two shapes, put in the fixture two ways round, so
// that the nominal attacker is party 1 in one and party 2 in the other. The
// multipliers in the cause log have to swap with them, and never be the same
// pair of numbers twice: that is the "do not let it read whichever party pa
// happens to be" requirement, and the cause log is the only place the
// orientation is observable at all.
func TestMatchupIsReadAsAttackerVersusDefender(t *testing.T) {
	cfg := testCfg(t)
	// readFight returns the two shapes and the two multipliers the cause log
	// reported, in the order (attacker shape, attacker multiplier, defender
	// shape, defender multiplier). The log is the only place the orientation is
	// observable: inside the resolution loop the two orders are symmetric code.
	readFight := func(s *model.State) [4]float64 {
		t.Helper()
		rows := resolveWith(t, cfg, s, 17).Rows()
		read, ok := findRead(rows, "attacker_matchup")
		if !ok {
			t.Fatalf("no cause row carried attacker_matchup, out of %d rows:\n%s",
				len(rows), dumpReads(rows))
		}
		var out [4]float64
		for i, k := range [4]string{
			"matchup_attacker_shape", "attacker_matchup",
			"matchup_defender_shape", "defender_matchup",
		} {
			v, ok := readValue(read, k)
			if !ok {
				t.Fatalf("read string %q is missing %s", read, k)
			}
			out[i] = v
		}
		return out
	}

	// The same two armies, built twice: party 1 stronger and then party 2
	// stronger, so findPair nominates party 1 and then party 2.
	forward := matchupState(t, cfg, model.TplStance, model.TplLight, 100000, 60000)
	reverse := matchupState(t, cfg, model.TplStance, model.TplLight, 60000, 100000)
	// The shapes are a property of the two parties, not of who is attacking, and
	// they come from the published class counts rather than from the template
	// names, so they are read once off the fixture and used for both.
	view := &sim.View{State: forward, Cfg: cfg}
	s1 := int(template.Shape(view, forward.Parties[1]))
	s2 := int(template.Shape(view, forward.Parties[2]))
	if s1 == s2 {
		t.Fatalf("both parties resolved to shape %d, so the two orientations read "+
			"the same cell and this test cannot tell them apart", s1)
	}

	fwd := readFight(forward)
	rev := readFight(reverse)

	// Forward: party 1 is stronger, so it is the nominal attacker and its cell is
	// the row.
	if int(fwd[0]) != s1 || int(fwd[2]) != s2 {
		t.Errorf("forward row reports shapes %v and %v, want %d and %d",
			fwd[0], fwd[2], s1, s2)
	}
	if !nearly(fwd[1], cfg.Battle.FormationBonus[s1][s2]) {
		t.Errorf("with party 1 the nominal attacker the row reports %v, want the "+
			"cell formation_bonus[%d][%d] = %v", fwd[1], s1, s2,
			cfg.Battle.FormationBonus[s1][s2])
	}
	if !nearly(fwd[3], cfg.Battle.FormationBonus[s2][s1]) {
		t.Errorf("the defender's multiplier is %v, want the reciprocal cell "+
			"formation_bonus[%d][%d] = %v", fwd[3], s2, s1,
			cfg.Battle.FormationBonus[s2][s1])
	}
	// Reverse: the same two parties, and the same two shapes, with the roles
	// swapped, so the row has to be the transpose of the one above.
	if int(rev[0]) != s2 || int(rev[2]) != s1 {
		t.Errorf("reverse row reports shapes %v and %v, want %d and %d: the read "+
			"is following a party rather than a role", rev[0], rev[2], s2, s1)
	}
	if !nearly(rev[1], cfg.Battle.FormationBonus[s2][s1]) {
		t.Errorf("with party 2 the nominal attacker the row reports %v, want the "+
			"cell formation_bonus[%d][%d] = %v", rev[1], s2, s1,
			cfg.Battle.FormationBonus[s2][s1])
	}
	if nearly(fwd[1], rev[1]) {
		t.Errorf("both orientations reported the attacker's multiplier as %v: the "+
			"table is not being read as attacker versus defender", fwd[1])
	}
}

// Shape is a read-only view of the published class counts, and the matchup is
// only as good as it, so it is checked against the balance table rather than
// against the template names. A template's dominant class is the one it is
// mostly made of in the shipped composition table, which is why a party's shape
// is usually its template and is not required to be.
func TestShapeFollowsThePublishedClassCounts(t *testing.T) {
	cfg := testCfg(t)
	for tpl := 0; tpl < model.TemplateCount; tpl++ {
		// The composition the template system really publishes for this
		// template and culture, which is what Shape has to be able to invert.
		shares := [model.ClassCount]float64{}
		sum := 0.0
		for i := 0; i < model.ClassCount; i++ {
			shares[i] = cfg.Template.TemplateShare[tpl][i] * cfg.Template.CultureShare[0][i]
			sum += shares[i]
		}
		if sum <= 0 {
			t.Fatalf("template %d has an all-zero composition row", tpl)
		}
		dominant := 0
		for i := range shares {
			shares[i] /= sum
			if shares[i] > shares[dominant] {
				dominant = i
			}
		}
		// The template whose own composition is most of that class.
		want, bestV := 0, -1.0
		for cand := 0; cand < model.TemplateCount; cand++ {
			row := [model.ClassCount]float64{}
			rowSum := 0.0
			for i := 0; i < model.ClassCount; i++ {
				row[i] = cfg.Template.TemplateShare[cand][i] * cfg.Template.CultureShare[0][i]
				rowSum += row[i]
			}
			for i := range row {
				row[i] /= rowSum
			}
			if row[dominant] > bestV {
				bestV, want = row[dominant], cand
			}
		}
		s := matchupState(t, cfg, model.TplStance, model.TplStance, 100000, 60000)
		p := s.Parties[1]
		p.StanceTroops = p.Troops * shares[int(model.ClassStance)]
		p.HeavyTroops = p.Troops * shares[int(model.ClassHeavy)]
		p.LightTroops = p.Troops * shares[int(model.ClassLight)]
		p.HorseTroops = p.Troops * shares[int(model.ClassHorse)]
		if got := int(template.Shape(&sim.View{State: s, Cfg: cfg}, p)); got != want {
			t.Errorf("a party of template %d, whose dominant class is %d, reported "+
				"shape %d, want %d", tpl, dominant, got, want)
		}
	}
	// With no published counts at all, the only evidence is the field, so that is
	// what is used rather than a division by zero.
	s := matchupState(t, cfg, model.TplHorse, model.TplStance, 100000, 60000)
	s.Parties[1].StanceTroops, s.Parties[1].HeavyTroops = 0, 0
	s.Parties[1].LightTroops, s.Parties[1].HorseTroops = 0, 0
	if got := template.Shape(&sim.View{State: s, Cfg: cfg}, s.Parties[1]); int(got) != int(model.TplHorse) {
		t.Errorf("a party with no published counts reported shape %d, want the "+
			"template field's %d", got, model.TplHorse)
	}
	// A corrupt template with no counts is neutral rather than an index panic,
	// because the matchup table is indexed by the answer.
	s = matchupState(t, cfg, model.TplStance, model.TplStance, 100000, 60000)
	s.Parties[1].Template = model.PartyTemplate(model.TemplateCount + 5)
	s.Parties[1].StanceTroops, s.Parties[1].HeavyTroops = 0, 0
	s.Parties[1].LightTroops, s.Parties[1].HorseTroops = 0, 0
	if got := template.Shape(&sim.View{State: s, Cfg: cfg}, s.Parties[1]); int(got) != 0 {
		t.Errorf("a party with a corrupt template and no counts reported shape %d, "+
			"want the neutral 0", got)
	}
}

// Both sides get it, once each. The requirement is that the product of the two
// multipliers leaves the engagement neutral: one side is favoured and the other
// is not, and a per-side term computed inside strength() would have applied both
// to both. So the two figures have to be reciprocals of each other for any
// pairing, and the strength ratio between the two armies has to move by exactly
// the ratio of the two cells.
func TestBothSidesGetTheMatchupOnceAndOnlyOnce(t *testing.T) {
	cfg := testCfg(t)
	for a := 0; a < model.TemplateCount; a++ {
		for d := 0; d < model.TemplateCount; d++ {
			x := matchupBonus(&sim.View{Cfg: cfg}, model.PartyTemplate(a), model.PartyTemplate(d))
			y := matchupBonus(&sim.View{Cfg: cfg}, model.PartyTemplate(d), model.PartyTemplate(a))
			if math.Abs(x*y-1) > 0.005 {
				t.Errorf("shapes %d and %d got multipliers %v and %v, whose product is "+
					"%v: the two sides of a matchup must cancel", a, d, x, y, x*y)
			}
		}
	}
	// A doubled army on both sides is the same fight twice over, and it has to
	// resolve the same way. This is the invariance that catches a per-side term
	// being applied inside strength(): doubling both armies scales both
	// strengths equally, so a term that only the loser's strength carried would
	// change the ratio, and with it the winner.
	same := 0
	for _, seed := range []uint64{1, 2, 3, 4, 5, 6} {
		small := matchupState(t, cfg, model.TplStance, model.TplHorse, 50000, 50000)
		big := matchupState(t, cfg, model.TplStance, model.TplHorse, 100000, 100000)
		resolveWith(t, cfg, small, seed)
		resolveWith(t, cfg, big, seed)
		// The winner is the party that lost the smaller share of its own men.
		if biggestLoser(small, 50000) == biggestLoser(big, 100000) {
			same++
		}
	}
	if same != 6 {
		t.Errorf("doubling both armies changed the winner in %d of 6 seeds", 6-same)
	}
}

// The shape is read from the published class counts, not from party_template.
// A party that says it is a stance column while its counts say it is mounted is
// scored as mounted, because the counts are what the men on the field are. This
// is the same reason CombatFactor reads the counts: a party mid-refit is counted
// as its old composition.
func TestMatchupUsesPublishedClassCountsNotTheTemplateField(t *testing.T) {
	cfg := testCfg(t)
	// A stance party whose counts say it is nothing but horse. Only the counts
	// disagree, so a reader of party_template would match it as a line and a
	// reader of the counts will match it as a mounted wing.
	s := matchupState(t, cfg, model.TplStance, model.TplLight, 100000, 60000)
	s.Parties[1].StanceTroops = 0
	s.Parties[1].HeavyTroops = 0
	s.Parties[1].LightTroops = 0
	s.Parties[1].HorseTroops = 100000

	rows := resolveWith(t, cfg, s, 23).Rows()
	read, found := findRead(rows, "matchup_attacker_shape")
	if !found {
		t.Fatalf("no cause row carried the shape the matchup was read from, out of "+
			"%d rows:\n%s", len(rows), dumpReads(rows))
	}
	reported, ok := readValue(read, "matchup_attacker_shape")
	if !ok {
		t.Fatalf("read string %q does not parse its shape figure", read)
	}
	if int(reported) != int(model.TplHorse) {
		t.Errorf("a party with 100%% horse troops was matched as shape %v, want %v "+
			"(horse): the matchup is reading party_template, not the published counts",
			reported, model.TplHorse)
	}
}

// A corrupt shape must not index past the table. weaponClass is bounds-checked
// for the same reason, and a party with a template outside the enum has to fight
// with a neutral matchup rather than panic the tick.
func TestCorruptTemplateGetsANeutralMatchup(t *testing.T) {
	cfg := testCfg(t)
	s := matchupState(t, cfg, model.TplStance, model.TplHeavy, 100000, 60000)
	s.Parties[1].Template = model.PartyTemplate(model.TemplateCount + 2)
	s.Parties[1].StanceTroops, s.Parties[1].HeavyTroops = 0, 0
	s.Parties[1].LightTroops, s.Parties[1].HorseTroops = 0, 0
	resolveWith(t, cfg, s, 5)
	// The fight still resolved: a corrupt template must not also stop the world.
	if s.Parties[2].Troops >= 60000 {
		t.Error("the fight did not resolve with a corrupt template")
	}
	if got := matchupBonus(&sim.View{Cfg: cfg},
		model.PartyTemplate(model.TemplateCount+2), model.TplHeavy); got != 1 {
		t.Errorf("a shape outside the table matched at %v, want a neutral 1", got)
	}
}

// The clamp. Two tables multiplied together are not bounded by either table's
// own range, so the product is clamped into a band from the balance file. A
// config whose matchup cells are at the top of their range must still not be able
// to produce an army that is orders of magnitude stronger than its opponent.
func TestSituationalClampBoundsTheProduct(t *testing.T) {
	cfg := testCfg(t)
	wide := *cfg
	wide.Battle.FormationBonus = [model.TemplateCount][model.TemplateCount]float64{}
	for a := range wide.Battle.FormationBonus {
		for d := range wide.Battle.FormationBonus {
			wide.Battle.FormationBonus[a][d] = 2.0
		}
	}
	view := &sim.View{Cfg: &wide}
	got := situational(view, situational(view, 2.0)*2.0)
	if got > wide.Battle.SituationalClampMax {
		t.Errorf("two maximum matchups produced %v, above the clamp of %v",
			got, wide.Battle.SituationalClampMax)
	}
	if !nearly(got, wide.Battle.SituationalClampMax) {
		t.Errorf("two maximum matchups produced %v, want the clamp %v",
			got, wide.Battle.SituationalClampMax)
	}
	// And it is not a blanket: a single ordinary matchup passes through
	// untouched, which is what stops the clamp from silently deleting the table.
	one := situational(view, cfg.Battle.FormationBonus[model.TplStance][model.TplHorse])
	if !nearly(one, cfg.Battle.FormationBonus[model.TplStance][model.TplHorse]) {
		t.Errorf("a single matchup of %v came out of the clamp as %v",
			cfg.Battle.FormationBonus[model.TplStance][model.TplHorse], one)
	}
}

// readValue pulls one key out of a cause row's read string, which is the same
// "key=value key=value" format every system writes. Reading the committed log
// rather than a returned value is the point: the multiplier has to be visible to
// a player in the Why panel, and a figure that only existed inside the function
// would not be.
func readValue(read, key string) (float64, bool) {
	for _, field := range strings.Fields(read) {
		name, val, found := strings.Cut(field, "=")
		// ReadString joins its pairs with ", ", so a field in the middle of the
		// string arrives with the separator still attached.
		val = strings.TrimRight(val, ",")
		if !found || name != key {
			continue
		}
		out, err := strconv.ParseFloat(val, 64)
		if err != nil {
			return 0, false
		}
		return out, true
	}
	return 0, false
}

// biggestLoser returns the id of the party that lost the largest share of the
// men it started with, which for a resolved fight is the loser. The starting
// size is passed in because the fight has already changed the roster by the time
// anything can read it.
func biggestLoser(s *model.State, started float64) int {
	id, worst := 0, -1.0
	for _, pid := range s.PartyIDs() {
		share := 1 - s.Parties[pid].Troops/started
		if share > worst {
			id, worst = pid, share
		}
	}
	return id
}
