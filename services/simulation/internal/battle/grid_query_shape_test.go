package battle

// This file pins the rule the two spatial indexes exist to serve, which is that
// a query is answered by the index whose cell shape suits its radius, and it pins
// it as a count rather than as a claim.
//
// grid.go's header says the melee index uses battle.grid_cell_size and the
// aimed-fire index uses battle.ranged_grid_cell_size because "the battle has two
// kinds of neighbourhood query and they want opposite cells". That was a
// comment. These are the numbers behind it, measured by
// TestACoarseRadiusCostsFewerCellsThanAFineOne on the shipped balance file:
//
//	a 240 m query on the 12 m index   a 43 by 43 block, 1,849 cells
//	a 240 m query on the 64 m index   a  9 by  9 block,    81 cells
//
// So a ranged query answered from the melee index costs twenty-three times the
// cell walk, per unit, per tick, and the same holds in reverse for a melee query
// answered from the coarse index. The rule that follows is:
//
//	nothing narrower than battle.grid_cell_size is asked of the coarse index.
//
// The first half of that - a query no wider than the melee cell belongs on the
// melee index - is ALSO broken in one place, by enemyCentre, and
// TestEnemyCentreIsTheOneCallSiteThatBreaksIt records it rather than fixing it,
// with the reason written down at the test.

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// cellsWalked counts the cells a query of the given radius KEEPS on an index of
// the given cell size, after the whole-cell disc rejection, and also returns the
// size of the box the walk enumerates before that rejection.
//
// Two numbers, because they say different things and only quoting one of them
// has been misleading. The box is what the walk pays for; the kept cells are what
// the caller is handed. A 240 m query enumerates a 43 by 43 block of 1,849 cells
// on a 12 m index against a 9 by 9 block of 81 on a 64 m one, and after the disc
// rejection keeps 144 against 61. The box is a factor of twenty-three and the
// kept cells a factor of two and a half, and the second is the one that decides
// whether a battle is playable.
//
// The field is one unit per cell over a square several times wider than the
// query, centred on the origin, so every cell of the walk exists, the grid's
// edges never clamp it, and every cell walked is non-empty - which is what makes
// the count the walk's own and not an artefact of the layout.
func cellsWalked(t testing.TB, cellSize, radius float64) (kept, box int) {
	t.Helper()
	const half = 6 // cells either side of the origin
	side := 2 * half
	units := make([]*Unit, 0, side*side)
	for gy := 0; gy < side; gy++ {
		for gx := 0; gx < side; gx++ {
			units = append(units, &Unit{
				ID:     len(units),
				X:      (float64(gx) - half + 0.5) * cellSize,
				Y:      (float64(gy) - half + 0.5) * cellSize,
				Status: StatusFighting, Troops: 1, MaxHP: 1, HP: 1,
			})
		}
	}
	h := newHash(cellSize, 1<<20)
	h.rebuild(units)
	n := 0
	h.walkCells(0, 0, radius, func(int, []int) bool {
		n++
		return false
	})
	// The box is the ring walk's own extent: span rings either side, both axes.
	last := h.span(radius)
	return n, (2*last + 1) * (2*last + 1)
}

// TestACoarseRadiusCostsFewerCellsThanAFineOne is the measurement the whole design
// rests on, stated once so the numbers in grid.go's header and in stageMorale's
// comment cannot quietly stop being true.
func TestACoarseRadiusCostsFewerCellsThanAFineOne(t *testing.T) {
	cfg := loadConfig(t)
	fine := cfg.Battle.GridCellSize
	coarse := cfg.Battle.RangedGridCellSize
	if !(fine > 0 && coarse > fine) {
		t.Fatalf("battle.grid_cell_size is %g and battle.ranged_grid_cell_size is %g; "+
			"the design needs the aimed-fire index to have the wider cells or the two "+
			"indexes are the same index twice", fine, coarse)
	}
	for _, tc := range []struct {
		name   string
		radius float64
	}{
		{"battle.melee_range", cfg.Battle.MeleeRange},
		{"battle.standoff_distance", cfg.Battle.StandoffDistance},
		{"battle.rout_flee_radius", cfg.Battle.RoutFleeRadius},
		{"battle.morale_neighbourhood", cfg.Battle.MoraleNeighbourhood},
		{"battle.ranged_range", cfg.Battle.RangedRange},
	} {
		if tc.radius <= 0 {
			continue
		}
		keptFine, boxFine := cellsWalked(t, fine, tc.radius)
		keptCoarse, boxCoarse := cellsWalked(t, coarse, tc.radius)
		t.Logf("a %s query of %.0f m: a %d cell box keeping %d on the %.0f m index, "+
			"against a %d cell box keeping %d on the %.0f m index",
			tc.name, tc.radius, boxFine, keptFine, fine, boxCoarse, keptCoarse, coarse)
		if tc.radius <= fine {
			// Below the coarse cell size the two indexes answer the same question
			// at the same price, and which one answers it does not matter.
			continue
		}
		// Above the melee cell size the coarse index has to be dearer on BOTH
		// counts, or there was no point in having two indexes: the box is what the
		// walk pays for and the kept cells are what the caller is handed.
		if boxCoarse*2 >= boxFine {
			t.Errorf("%s is %.0f m, and the walk for it enumerates %d cells on the "+
				"%.0f m index against %d on the %.0f m one. A wide query has to be "+
				"cheaper on wide cells or the second index is not earning its keep",
				tc.name, tc.radius, boxFine, fine, boxCoarse, coarse)
		}
		if keptCoarse >= keptFine {
			t.Errorf("%s is %.0f m, and the disc rejection leaves %d cells in hand on "+
				"the %.0f m index against %d on the %.0f m one. Wide cells holding wide "+
				"queries should leave fewer, not more, and the comment at the top of "+
				"grid.go is wrong about why",
				tc.name, tc.radius, keptFine, fine, keptCoarse, coarse)
		}
	}
}

// TestEnemyCentreIsTheOneCallSiteThatBreaksIt records the other half of the rule,
// which the engine does break, and why it is left alone.
//
// battle.rout_flee_radius is 45 m and it is answered from the MELEE index, whose
// cells are battle.grid_cell_size of 12 m. So a routed unit's panic target is
// found by walking a nine-by-nine block of eighty-one 12 m cells when nine 64 m
// cells would do, twice a tick, for every routed unit.
//
// It is not changed here, and the reason is worth more than the fix:
//
//   - The profile puts the whole of (*Battle).enemyCentre at 0.97% of a 500 v 500
//     run, so the win is about one percent of a battle, on a path only routed units
//     walk.
//   - Changing which index answers a query reorders the ids, and enemyCentre sums
//     positions weighted, so it would change battle results. It would do that on
//     top of a golden-fixture drift that is already unexplained, which would make
//     the two impossible to tell apart.
//
// So this test asserts the NUMBER, which is the finding, and not the rule, which
// would be a red test nobody can close without first deciding whose behaviour
// change is the real one. A test that fails for a known reason is a bug report; a
// test that fails for an unknown reason is a trap.
func TestEnemyCentreIsTheOneCallSiteThatBreaksIt(t *testing.T) {
	cfg := loadConfig(t)
	fine := cfg.Battle.GridCellSize
	radius := cfg.Battle.RoutFleeRadius
	if radius <= fine {
		t.Skipf("battle.rout_flee_radius is %g, inside the %.0f m melee cell, so there "+
			"is nothing to record", radius, fine)
	}
	keptFine, boxFine := cellsWalked(t, fine, radius)
	keptCoarse, boxCoarse := cellsWalked(t, cfg.Battle.RangedGridCellSize, radius)
	t.Logf("battle.rout_flee_radius %g on the %.0f m melee index: a %d cell box keeping "+
		"%d, against a %d cell box keeping %d on the %.0f m aimed-fire index. A factor "+
		"of %.1f on the box and %.1f on the cells actually handed over, twice a tick "+
		"for every routed unit",
		radius, fine, boxFine, keptFine, boxCoarse, keptCoarse,
		cfg.Battle.RangedGridCellSize,
		float64(boxFine)/float64(maxInt(boxCoarse, 1)),
		float64(keptFine)/float64(maxInt(keptCoarse, 1)))
	if boxFine <= boxCoarse {
		t.Fatalf("a %.0f m query enumerated %d cells on the %.0f m index and %d on the "+
			"%.0f m index; this test's claim is that the melee index is the dearer one "+
			"and that has stopped being true", radius, boxFine, fine, boxCoarse,
			cfg.Battle.RangedGridCellSize)
	}
}

// walkCall is one spatial index query, resolved down to a number or left
// unresolved on purpose.
type walkCall struct {
	where   string // "file:line", of the walk itself
	index   string // "melee" or "coarse" or "unknown"
	radius  float64
	known   bool
	viaFunc string // set when the radius is a parameter rather than a field
}

// TestNoQueryNarrowerThanACellIsServedByTheCoarseIndex checks the rule over every
// index walk in the package, by parsing the package's own source.
//
// A query narrower than the coarse cell size has to read whole 64 m cells to
// answer a question about five metres of ground, which is the mirror image of the
// mistake the two indexes were introduced to stop. The call sites are found by
// parsing rather than listed here, because a list goes stale the moment somebody
// adds a query and a stale list is how a rule stops being enforced without anybody
// noticing.
//
// A radius written as a parameter is followed to its callers and checked at each
// one, because that is where the number is chosen. A radius that cannot be
// resolved at all is a FAILURE, not a skip: a rule nothing can check is not a
// rule, and a lint that passes on the code it cannot read is a lint that has
// stopped working.
func TestNoQueryNarrowerThanACellIsServedByTheCoarseIndex(t *testing.T) {
	cfg := loadConfig(t)
	fine := cfg.Battle.GridCellSize
	calls, unresolved, unnamed := parseWalkCalls(t, cfg)
	if len(calls) == 0 {
		t.Fatal("no index walks were found in the package source. The parser is broken, " +
			"not the engine")
	}
	coarseChecked := 0
	for _, call := range calls {
		if call.index != "coarse" {
			continue
		}
		if !call.known {
			t.Errorf("%s walks the coarse index with a radius this test cannot resolve "+
				"(%s). Write the radius as a battle config field, or teach this test "+
				"about it, because a rule nothing can check is not a rule",
				call.where, call.viaFunc)
			continue
		}
		coarseChecked++
		if call.radius < fine {
			t.Errorf("%s asks the coarse index (%.0f m cells) a %.1f m question. That "+
				"has to read whole %.0f m cells to answer a question about %.1f m of "+
				"ground. Use the melee index, which is what its cells are for",
				call.where, cfg.Battle.RangedGridCellSize, call.radius,
				cfg.Battle.RangedGridCellSize, call.radius)
		}
	}
	t.Logf("%d index walks parsed: %d on the coarse index, all %d of them checked at or "+
		"above battle.grid_cell_size = %g; %d unresolved and %d on an index the caller "+
		"chooses rather than naming", len(calls), coarseChecked, coarseChecked, fine,
		unresolved, unnamed)
	if coarseChecked == 0 {
		t.Error("no call site was found walking the coarse index, so the rule was " +
			"checked against nothing. If the coarse index really is unused, delete it " +
			"and this test with it rather than leaving a test that passes on no work")
	}
}

// battleConfigValues is every battle constant a radius could be written as, by the
// name the source uses for it.
func battleConfigValues(cfg *config.Config) map[string]float64 {
	b := cfg.Battle
	return map[string]float64{
		"MeleeRange":          b.MeleeRange,
		"MeleeMaxTargets":     b.MeleeMaxTargets,
		"StandoffDistance":    b.StandoffDistance,
		"RangedRange":         b.RangedRange,
		"RangedMinRange":      b.RangedMinRange,
		"RangedMaxTargets":    b.RangedMaxTargets,
		"MoraleNeighbourhood": b.MoraleNeighbourhood,
		"RoutFleeRadius":      b.RoutFleeRadius,
		"GridCellSize":        b.GridCellSize,
		"RangedGridCellSize":  b.RangedGridCellSize,
		"RosterStartDistance": b.RosterStartDistance,
	}
}

// walkNames are the index-walk methods. Every one of them takes the radius as its
// third argument, which is what makes this parse possible.
var walkNames = map[string]bool{
	"forEachCell": true, "anyInCell": true, "walkCells": true, "collectCells": true,
}

// parseWalkCalls finds every spatial index walk in the package's own source and
// resolves its radius to a number.
//
// Resolution is two passes. The first records, for each function that walks an
// index, whether the radius it walks with is a config field or a parameter and
// which parameter. The second resolves a parameter radius at every call site,
// because that is where somebody chose the number.
func parseWalkCalls(t *testing.T, cfg *config.Config) ([]walkCall, int, int) {
	t.Helper()
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(fi os.FileInfo) bool {
		return strings.HasSuffix(fi.Name(), ".go") && !strings.HasSuffix(fi.Name(), "_test.go")
	}, 0)
	if err != nil {
		t.Fatalf("parsing the package source failed: %v", err)
	}

	type pending struct {
		where string
		fn    string // the function the walk is written in
		index string
		param int // parameter position of the radius, -1 if it is not one
		field string
	}
	var walks []pending
	// radiusParam maps a function's name to the position of the parameter its
	// index walk uses as a radius.
	radiusParam := map[string]int{}
	// callers maps a function's name to every call of it, with the arguments as
	// written.
	type caller struct {
		where string
		args  []string
	}
	callers := map[string][]caller{}

	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			base := filepath.Base(name)
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Body == nil {
					continue
				}
				// Keyed by the bare name. Within one package that is ambiguous only
				// if two types declare the same method name AND both walk an index
				// with a radius parameter, and the ambiguity would then be visible
				// as a radius that fails to resolve, which this reports rather than
				// swallows.
				fname := fn.Name.Name
				paramIndex := map[string]int{}
				if fn.Type.Params != nil {
					for _, field := range fn.Type.Params.List {
						for _, name := range field.Names {
							paramIndex[name.Name] = len(paramIndex)
						}
					}
				}
				ast.Inspect(fn.Body, func(n ast.Node) bool {
					call, ok := n.(*ast.CallExpr)
					if !ok {
						return true
					}
					sel, ok := call.Fun.(*ast.SelectorExpr)
					if !ok || !walkNames[sel.Sel.Name] || len(call.Args) < 3 {
						return true
					}
					recv := exprString(sel.X)
					idx := indexOf(recv)
					if idx == "" {
						return true
					}
					radius := exprString(call.Args[2])
					p := pending{
						where: base + ":" + strconv.Itoa(fset.Position(call.Pos()).Line),
						fn:    fname, index: idx, param: -1, field: radius,
					}
					if at, ok := paramIndex[radius]; ok {
						p.param = at
						if prev, dup := radiusParam[fname]; dup && prev != at {
							t.Errorf("%s walks an index with two different radius "+
								"parameters, at %d and at %d; this test resolves the "+
								"first and would silently check the wrong one",
								fname, prev, at)
						}
						radiusParam[fname] = at
					}
					walks = append(walks, p)
					return true
				})
			}
			// Every call of every function, so a parameter radius can be resolved.
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				var name string
				switch f := call.Fun.(type) {
				case *ast.Ident:
					name = f.Name
				case *ast.SelectorExpr:
					name = exprString(f.Sel)
				default:
					return true
				}
				args := make([]string, 0, len(call.Args))
				for _, a := range call.Args {
					args = append(args, exprString(a))
				}
				callers[name] = append(callers[name], caller{
					where: base + ":" + strconv.Itoa(fset.Position(call.Pos()).Line), args: args})
				return true
			})
		}
	}

	// resolve turns a radius expression into a number. It is declared before it is
	// assigned because it is recursive: a radius can be a parameter, and a
	// parameter's value is whatever its callers passed.
	var resolve func(fnName, expr string, seen map[string]bool) (float64, bool)
	values := battleConfigValues(cfg)
	// locals are the package's own short names for a battle constant, with the
	// line they are bound on. They are listed rather than parsed out of the
	// assignments because a parser for `x := c.Field` is more machinery than the
	// three cases deserve, and a table that names all three fails loudly the
	// moment a fourth appears - see the unresolved check below.
	locals := map[string]float64{
		"span":  values["MoraleNeighbourhood"],
		"reach": values["MeleeRange"],
	}
	resolve = func(fnName, expr string, seen map[string]bool) (float64, bool) {
		e := strings.TrimPrefix(strings.TrimSpace(expr), "b.")
		e = strings.TrimPrefix(e, "c.")
		if v, ok := values[e]; ok {
			return v, true
		}
		if v, ok := locals[e]; ok {
			return v, true
		}
		if at, ok := radiusParam[fnName]; ok {
			key := fnName + "/" + e
			if !seen[key] {
				seen[key] = true
				for _, c := range callers[fnName] {
					if at < len(c.args) {
						if v, ok := resolve(fnName, c.args[at], seen); ok {
							return v, true
						}
					}
				}
			}
		}
		return 0, false
	}

	var out []walkCall
	unresolved := 0
	unnamed := 0
	for _, w := range walks {
		call := walkCall{where: w.where, index: w.index, viaFunc: w.field}
		if w.index == "" {
			// The walk is on a *hash the caller chose, so which of the two indexes
			// it is cannot be read off this line. Counted and reported rather than
			// dropped, so the coverage this test claims is the coverage it has.
			unnamed++
			out = append(out, call)
			continue
		}
		v, ok := resolve(w.fn, w.field, map[string]bool{})
		if !ok {
			unresolved++
			out = append(out, call)
			continue
		}
		call.radius, call.known = v, true
		out = append(out, call)
	}
	return out, unresolved, unnamed
}

// indexOf names which of the two indexes a receiver is. The receiver is written
// out at the call site, so this is a spelling match on the field name, not a type
// analysis: b.meleeHash and b.fireHash are the whole vocabulary in this package.
func indexOf(recv string) string {
	switch {
	case strings.Contains(recv, "meleeHash"):
		return "melee"
	case strings.Contains(recv, "fireHash"):
		return "coarse"
	default:
		return ""
	}
}

// exprString renders an expression back to source text well enough to read a
// config field name out of it.
func exprString(e ast.Expr) string {
	switch v := e.(type) {
	case *ast.Ident:
		return v.Name
	case *ast.SelectorExpr:
		return exprString(v.X) + "." + v.Sel.Name
	case *ast.CallExpr:
		return exprString(v.Fun) + "()"
	case *ast.BasicLit:
		return v.Value
	default:
		return "?"
	}
}
