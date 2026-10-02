package simrun

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// These tests are the static half of CONSTITUTION.md section 2.1 and the
// enforcement named in section 2.3: "a static decoupling test that fails if
// systems import or call each other". The rule is documented in four places in
// the source — state.go's package comment, engine.go's, this file's package
// comment, and CONSTITUTION.md itself — and until now nothing checked it, so
// the cheapest way to couple two systems, an import, was unguarded.
//
// The check is on imports rather than on call sites because a call is only
// reachable through an import: the systems are separate packages, so one system
// cannot name another's functions without importing it. A function value
// passed in a struct literal is still an import. That makes the import set the
// complete set of couplings, which is why a static check can be exhaustive here
// at all.
//
// Test files are exempt, and deliberately so. A test assembles systems to drive
// a scenario, and battle_test.go registering the prisoner system is a test
// fixture rather than a production coupling: nothing in the shipped system
// depends on it. The same file cannot become the seam a real coupling hides
// behind, because a test file is not compiled into the simulation.

const systemsImportPath = "mbclone/simulation/internal/systems/"

// readOnlyPublishers are the system packages a system is allowed to import,
// each with the reason the import is not the coupling the constitution bans.
//
// The ban is on one system *deciding* for another: reading a number another
// system has already committed to shared state is what shared state is for, and
// the package comment in template.go makes the same argument for the tables it
// publishes. What is banned is a system running another's decision, reaching
// into another's staged writes, or holding a reference to another system. None
// of these packages can do any of that: they are read-only views of committed
// state and the balance table, with no access to a WriteSet.
//
// The list is short on purpose. Each entry is a hole in the rule, so a new one
// is a decision someone has to make deliberately, and the tripwire test below
// forces that decision to be made about each exported function rather than
// about a package name.
var readOnlyPublishers = map[string]string{
	"shared": "pure math and formatting helpers (Clamp, ReadString, MoveToward); " +
		"no state of any kind",
	"security": "security.TerrainRoughness is a pure terrain-to-multiplier lookup " +
		"that happens to live in a system package; it reads no state and makes no decision. " +
		"It belongs in shared and is the one exception here that should move.",
	"template": "template.CombatFactor, SpeedFactor, WoundedRecovery, and ClassCounts " +
		"are read-only views of the class counts the template system publishes to the party " +
		"every tick. Battle, march, attrition, and formation read the published composition " +
		"rather than re-deriving it, which is the decoupling working rather than failing.",
	"access": "access.TownAccess is a read-only treaty/town-entry check over committed " +
		"diplomacy state (AtWar, SideRelation). It holds no WriteSet, stages nothing, " +
		"and decides nothing for another system; it is the single place that answers " +
		"whether a party may enter a town, consulted by player orders and barter.",
}

// violation is one cross-system import that the rule does not permit.
type violation struct {
	file     string
	importer string
	imported string
	line     int
}

func (v violation) String() string {
	return v.file + ":" + strconv.Itoa(v.line) + ": " + v.importer +
		" imports " + v.imported + " (CONSTITUTION.md 2.1: systems never call each other)"
}

// systemsDir returns the absolute path of internal/systems, resolved from this
// test file rather than from the working directory: a test runs in its own
// package directory, so a relative path would look for
// internal/simrun/internal/systems and find nothing. Finding nothing is the
// dangerous failure here, because a check that inspects zero files passes.
func systemsDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	return filepath.Join(filepath.Dir(file), "..", "systems")
}

// systemPackages returns the subdirectories of internal/systems that hold Go
// source, sorted so a failure message is stable. Directories with no .go file
// are not packages and are skipped, because an empty directory left behind by a
// moved file is not a system that failed to register.
func systemPackages(t *testing.T) []string {
	t.Helper()
	root := systemsDir(t)
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read systems dir: %v", err)
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), "_") {
			continue
		}
		has := false
		sub, err := os.ReadDir(filepath.Join(root, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		for _, f := range sub {
			if !f.IsDir() && strings.HasSuffix(f.Name(), ".go") {
				has = true
				break
			}
		}
		if has {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out
}

// unwiredSystems are packages under internal/systems that hold a complete
// system and are not in the run order, so nothing ever executes them.
//
// This is a tracked gap, not an accepted state: a system that never runs is
// dead code that still has to compile, still shows up in the decoupling walk,
// and still reads as though the feature is in the game. barter is the one
// entry, it belongs to the barter lane rather than to the battle work that
// found it, and wiring it in changes every other system's result because it
// moves gold, so it is recorded here rather than done here. Remove an entry
// when the system joins Systems().
var unwiredSystems = map[string]string{
	"barter": "complete system, not in Systems(); tracked in " +
		"staging/agent4-battlehard.md as a gap found by this test",
}

// importViolations returns the cross-system imports in one Go file that the
// decoupling rule does not permit.
//
// ownPkg is the importing package's directory name. A package importing itself
// is legal in Go and is not a coupling. allowed is consulted only for packages
// that are not the importer's own, so the exception list cannot be used to
// permit a system importing itself under another name.
func importViolations(path, ownPkg string, allowed map[string]bool) ([]violation, error) {
	fset := token.NewFileSet()
	// ImportsOnly parses the import block and stops, which is all the rule
	// needs and which keeps a syntax error inside a function body from being
	// reported as a missing import.
	f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
	if err != nil {
		return nil, err
	}
	var out []violation
	for _, spec := range f.Imports {
		p, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			return nil, err
		}
		if !strings.HasPrefix(p, systemsImportPath) {
			continue
		}
		imported := strings.TrimPrefix(p, systemsImportPath)
		if imported == ownPkg || allowed[imported] {
			continue
		}
		out = append(out, violation{
			file:     path,
			importer: ownPkg,
			imported: imported,
			line:     fset.Position(spec.Pos()).Line,
		})
	}
	return out, nil
}

// The rule itself. Every non-test file in every system package is parsed and
// every import is checked against the one exception list above, so a coupling
// cannot be added by a file this test happens not to know about.
func TestNoSystemImportsAnotherSystem(t *testing.T) {
	dir := systemsDir(t)
	allowed := map[string]bool{}
	for name := range readOnlyPublishers {
		allowed[name] = true
	}
	pkgs := systemPackages(t)
	if len(pkgs) < 20 {
		t.Fatalf("found only %d system packages under %s: the walk is broken, "+
			"and a check that inspects nothing passes", len(pkgs), dir)
	}
	files := 0
	var bad []violation
	for _, pkg := range pkgs {
		entries, err := os.ReadDir(filepath.Join(dir, pkg))
		if err != nil {
			t.Fatalf("read %s: %v", pkg, err)
		}
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasSuffix(name, ".go") ||
				strings.HasSuffix(name, "_test.go") {
				continue
			}
			files++
			v, err := importViolations(filepath.Join(dir, pkg, name), pkg, allowed)
			if err != nil {
				t.Errorf("parse %s/%s: %v", pkg, name, err)
				continue
			}
			bad = append(bad, v...)
		}
	}
	if files < len(pkgs) {
		t.Fatalf("only %d source files across %d system packages: the walk missed files",
			files, len(pkgs))
	}
	for _, v := range bad {
		t.Error(v.String())
	}
}

// A system importing the composition root would be a back door around the
// documented order: simrun builds every system, so a system that imports it can
// reach all of them and register itself twice.
func TestNoSystemImportsTheCompositionRoot(t *testing.T) {
	dir := systemsDir(t)
	for _, pkg := range systemPackages(t) {
		entries, err := os.ReadDir(filepath.Join(dir, pkg))
		if err != nil {
			t.Fatalf("read %s: %v", pkg, err)
		}
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasSuffix(name, ".go") {
				continue
			}
			path := filepath.Join(dir, pkg, name)
			fset := token.NewFileSet()
			f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
			if err != nil {
				t.Errorf("parse %s: %v", path, err)
				continue
			}
			for _, spec := range f.Imports {
				p, err := strconv.Unquote(spec.Path.Value)
				if err != nil {
					continue
				}
				if p == "mbclone/simulation/internal/simrun" {
					t.Errorf("%s imports simrun: a system must not be able to reach "+
						"the composition root that builds it", path)
				}
			}
		}
	}
}

// Each exception is a hole in the rule, so two properties hold it in place.
//
// The first is that an exception imports no system at all, so the exemption
// cannot be transitive: a system cannot reach a third system by way of a
// permitted one, which would make "imports template" a licence to import
// anything template's own imports reach.
//
// The second is that an exception exposes no way to write and no way to run a
// decision. A read-only publisher's exported functions may read state and
// config; none may accept a WriteSet, and none may hand back a sim.System,
// because a system that can be handed another system's entry point is coupled
// to it no matter how innocent the signature looks.
func TestReadOnlyPublishersStayReadOnly(t *testing.T) {
	dir := systemsDir(t)
	for name := range readOnlyPublishers {
		pkgDir := filepath.Join(dir, name)
		entries, err := os.ReadDir(pkgDir)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		sawFile := false
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") {
				continue
			}
			sawFile = true
			path := filepath.Join(pkgDir, e.Name())
			isTest := strings.HasSuffix(e.Name(), "_test.go")
			fset := token.NewFileSet()
			f, err := parser.ParseFile(fset, path, nil, 0)
			if err != nil {
				t.Fatalf("parse %s: %v", path, err)
			}
			for _, imp := range f.Imports {
				p, err := strconv.Unquote(imp.Path.Value)
				if err != nil {
					continue
				}
				if !strings.HasPrefix(p, systemsImportPath) {
					continue
				}
				other := strings.TrimPrefix(p, systemsImportPath)
				if other == name || readOnlyPublishers[other] != "" {
					continue
				}
				t.Errorf("%s imports %s: a read-only exception must import no "+
					"system, or the exemption is a route to every other one", path, other)
			}
			if isTest {
				continue
			}
			for _, d := range f.Decls {
				fn, ok := d.(*ast.FuncDecl)
				if !ok || fn.Recv != nil || !fn.Name.IsExported() {
					continue
				}
				ast.Inspect(fn, func(n ast.Node) bool {
					sel, ok := n.(*ast.SelectorExpr)
					if !ok {
						return true
					}
					switch sel.Sel.Name {
					case "WriteSet":
						t.Errorf("%s exports %s, which takes a sim.WriteSet: a "+
							"read-only publisher must not be able to stage a write",
							name, fn.Name.Name)
					case "System":
						if fn.Name.Name != "System" {
							t.Errorf("%s exports %s returning sim.System: a system "+
								"that can hand back another system is coupled to it",
								name, fn.Name.Name)
						}
					}
					return true
				})
			}
		}
		if !sawFile {
			t.Errorf("read-only exception %s has no Go files; the exception list "+
				"should have been deleted instead", name)
		}
	}
}

// Every system package on disk has to be one the run actually starts, or the
// check above is inspecting code that never executes and a system added to disk
// but not to Systems() would ship unwired and unnoticed.
func TestEverySystemPackageIsInTheRun(t *testing.T) {
	registered := map[string]bool{}
	for _, n := range SystemNames() {
		registered[n] = true
	}
	// A local copy rather than the package-level map: a test that deletes from
	// shared state is order-dependent, and this file is run with -count=2.
	stillUnwired := map[string]string{}
	for k, v := range unwiredSystems {
		stillUnwired[k] = v
	}
	for _, pkg := range systemPackages(t) {
		if registered[pkg] {
			delete(stillUnwired, pkg)
			continue
		}
		if _, helper := readOnlyPublishers[pkg]; helper {
			// shared is a helper library under systems/ so that systems can
			// import it without a cross-system import. It has no System() and is
			// not meant to.
			continue
		}
		if why, known := stillUnwired[pkg]; known {
			t.Logf("system package %s is not in the run order: %s", pkg, why)
			continue
		}
		t.Errorf("system package %s is on disk but no System() in the run order "+
			"has that name: it will never execute, and this decoupling check "+
			"is reading code the simulation never runs", pkg)
	}
	for pkg, why := range stillUnwired {
		if !dirExists(filepath.Join(systemsDir(t), pkg)) {
			t.Errorf("unwiredSystems lists %s, which is no longer a package on disk (%s)",
				pkg, why)
			continue
		}
		if registered[pkg] {
			t.Errorf("unwiredSystems lists %s, which is now wired into the run; "+
				"delete the entry (%s)", pkg, why)
		}
	}
	// And the other direction: a name in the run order with no package behind
	// it, which would mean a system's name was changed in one place only.
	for _, n := range SystemNames() {
		if !dirExists(filepath.Join(systemsDir(t), n)) {
			t.Errorf("the run order names system %q but internal/systems/%s does not exist",
				n, n)
		}
	}
}

func dirExists(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}

// A check that cannot fail is not a check. This test feeds the analysis the one
// input the live tree does not contain, a system importing a system, and
// asserts it is reported. If the analysis were silently matching nothing, the
// test above would pass forever while the rule it claims to enforce was never
// examined.
func TestDecouplingCheckDetectsACrossSystemImport(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "coupled.go")
	src := "package battle\n\n" +
		"import (\n" +
		"\t\"mbclone/simulation/internal/model\"\n" +
		"\t\"mbclone/simulation/internal/systems/attrition\"\n" +
		"\t\"mbclone/simulation/internal/systems/shared\"\n" +
		"\t\"mbclone/simulation/internal/systems/template\"\n" +
		")\n\n" +
		"var _ = attrition.System\n"
	if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	allowed := map[string]bool{}
	for name := range readOnlyPublishers {
		allowed[name] = true
	}
	got, err := importViolations(path, "battle", allowed)
	if err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("analysing a file that imports attrition found %d violations, want 1: %v",
			len(got), got)
	}
	if got[0].imported != "attrition" {
		t.Errorf("reported %q, want attrition", got[0].imported)
	}
	if !strings.Contains(got[0].String(), "CONSTITUTION.md 2.1") {
		t.Errorf("the violation message does not name the rule: %q", got[0].String())
	}

	// The same file without the forbidden import is clean, so the positive case
	// above is not the analyser rejecting every file it is shown.
	clean := strings.Replace(src, "\t\"mbclone/simulation/internal/systems/attrition\"\n", "", 1)
	clean = strings.Replace(clean, "var _ = attrition.System", "var _ = model.Party{}", 1)
	path = filepath.Join(dir, "clean.go")
	if err := os.WriteFile(path, []byte(clean), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	got, err = importViolations(path, "battle", allowed)
	if err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("a file importing only model, shared, and template reported %v", got)
	}
}
