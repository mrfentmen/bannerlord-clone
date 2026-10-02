package config

// Tests for the shipped balance file, and for the two barter invariants that
// hold constants against each other rather than against a range.
//
// The first test exists because of what a balance file is: every package in the
// module loads this one file, so a validator that rejects it fails *every*
// package's tests at the load step, with a message about a constant that has
// nothing to do with the test that printed it. That happened with the barter
// spread (agents/README.md records the incident), and the whole cost was in
// reading every other package's failure before finding the one line responsible.
// A test that loads the file and says so is the difference between one failure
// and twelve, and it is the difference between "player tests are broken" and
// "the shipped constants disagree with each other".
//
// The rest assert the two spread rules from *both* ends: that the shipped shares
// satisfy them, and that the validator really refuses the arrangements they
// exist to refuse. A validator nothing tests is a comment with a return in it.

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

// shippedBalance is the one balance file the module runs on.
//
// Located through runtime.Caller rather than LoadDefault, because a test runs
// with the working directory set to its own package and LoadDefault resolves
// "config/balance.toml" against that.
func shippedBalance(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	// services/simulation/internal/config -> services/simulation/config.
	return filepath.Join(filepath.Dir(file), "..", "..", "config", "balance.toml")
}

func loadShipped(t *testing.T) *Config {
	t.Helper()
	cfg, err := Load(shippedBalance(t))
	if err != nil {
		t.Fatalf("the shipped balance file does not load: %v", err)
	}
	return cfg
}

// TestShippedBalanceFileLoads is the whole of the hazard, in one assertion.
func TestShippedBalanceFileLoads(t *testing.T) {
	loadShipped(t)
}

// TestShippedBarterSpreadIsWorthACrossing pins the product of the two shares
// against the tolerance rather than trusting that a future edit to either one
// keeps them in step.
//
// The trader's margin is buy under the market and sell over it, so
// buy_share*sell_share is what they keep on a round trip. Two things make it
// mean something, and both are load-time failures if either is broken:
//
//   - At or below one, the trader deals at the market rate in both directions,
//     and crossing a table becomes the same transaction as crossing a counter.
//     The barter screen then says nothing the market panel does not already say.
//   - Below one plus the tolerance, a deal the trader accepts on the strength of
//     their own disposition pays them less than the margin they gave up. The
//     tolerance is meant to be a mood, not a price.
//
// So the shipped file has to clear 1+tolerance, with room to spare, and the
// assertion is on the margin above that line rather than on the two numbers:
// a rebalance that keeps a real spread must not have to know this test exists.
func TestShippedBarterSpreadIsWorthACrossing(t *testing.T) {
	cfg := loadShipped(t)
	spread := cfg.Barter.BuyShare * cfg.Barter.SellShare
	floor := 1 + cfg.Barter.Tolerance
	if spread <= floor {
		t.Fatalf("barter spread %g (buy %g x sell %g) is not above 1+tolerance %g: a lord who deals at the market rate in both directions has no reason to cross a table",
			spread, cfg.Barter.BuyShare, cfg.Barter.SellShare, floor)
	}
	// The margin above that floor is what a friendship can spend, and the widest
	// tolerance a real world can reach is not the one the file bounds itself by:
	// standing is on the -100..100 scale of RULERS.md section 2, so a best
	// friend's tolerance is the base plus min(100 * per_relation, cap). A friend
	// who can be talked out of the trader's margin is not being generous, they
	// are being robbed, and nothing in the simulation can tell those apart.
	perFriend := 100 * cfg.Barter.TolerancePerRelation
	if perFriend > cfg.Barter.ToleranceRelationCap {
		perFriend = cfg.Barter.ToleranceRelationCap
	}
	widest := cfg.Barter.Tolerance + perFriend
	if spread < 1+widest {
		t.Errorf("barter spread %g leaves nothing for a friend's tolerance (%g + %g = %g): the trader hands over their margin at the friendliest relation",
			spread, cfg.Barter.Tolerance, perFriend, widest)
	}
}

// TestValidateRefusesABarterSpreadWithNoMargin asserts the validator from the
// side that matters, by handing it a file that is the shipped file with one
// number changed.
//
// A validator is only load-bearing if it rejects, so each case takes the real
// balance file, rewrites one barter share, and requires Load to refuse it. The
// shares in the cases are the ones a plausible rebalance produces: selling at
// the market rate, and selling barely over it.
func TestValidateRefusesABarterSpreadWithNoMargin(t *testing.T) {
	for _, tc := range []struct {
		name string
		sell float64
		want string
	}{
		// 0.82 x 1.0 = 0.82. Selling at the market rate: no margin at all, and a
		// negative one against anything the trader buys.
		{"selling at the market rate", 1.0, "no margin for the trader"},
		// 0.82 x 1.20 = 0.984. Above parity but under it, once rounded by
		// anything: the case that shipped, where the two shares each looked
		// reasonable and together meant the trader was being a market maker.
		{"a spread under parity", 1.20, "no margin for the trader"},
		// 0.82 x 1.22 = 1.0004. Above parity by four ten-thousandths, and below
		// the tolerance: a trader who shakes hands on a stranger's deal pays for
		// the privilege.
		{"a spread thinner than the tolerance", 1.22, "thinner than barter.tolerance"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Load(withBarterSell(t, tc.sell))
			if err == nil {
				t.Fatalf("balance.toml with sell_share = %g loaded: the trader's spread is %g, which the file's own comment calls worse than none",
					tc.sell, 0.82*tc.sell)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error = %v, want it to explain the spread (%q)", err, tc.want)
			}
		})
	}
}

// TestValidateAcceptsTheShippedSpreadThroughTheSamePath is the other end of the
// same rule: the values in the file must be accepted by the same Load that
// refuses the cases above, and for the same reason they are there. A rule that
// only ever rejects is indistinguishable from a broken file, which is how the
// incident above looked from the other twelve packages.
func TestValidateAcceptsTheShippedSpreadThroughTheSamePath(t *testing.T) {
	shipped := loadShipped(t)
	got, err := Load(withBarterSell(t, shipped.Barter.SellShare))
	if err != nil {
		t.Fatalf("rewriting sell_share with its own value was refused: %v", err)
	}
	if got.Barter.SellShare != shipped.Barter.SellShare {
		t.Errorf("sell_share = %v after a no-op rewrite, want %v", got.Barter.SellShare, shipped.Barter.SellShare)
	}
}

// withBarterSell writes the shipped balance file to a temporary path with
// barter.sell_share replaced, and returns the path.
//
// A copy rather than a hand-written fixture, for one reason: the loader rejects
// a file with any key no system reads, so a fixture would have to carry every
// constant in the module to test one of them, and would then be asserting
// against numbers nobody runs on. The copy has exactly the shipped keys, so the
// only difference between the two loads is the one number under test.
func withBarterSell(t *testing.T, sell float64) string {
	t.Helper()
	raw, err := os.ReadFile(shippedBalance(t))
	if err != nil {
		t.Fatalf("read shipped balance: %v", err)
	}
	out := replaceNumber(string(raw), "sell_share", sell)
	if out == string(raw) {
		t.Fatalf("barter.sell_share was not found in the shipped file, so the rewrite under test did nothing")
	}
	path := filepath.Join(t.TempDir(), "balance.toml")
	if err := os.WriteFile(path, []byte(out), 0o600); err != nil {
		t.Fatalf("write patched balance: %v", err)
	}
	return path
}

// replaceNumber rewrites the value of one key, leaving its trailing comment
// alone.
//
// The comment is left alone deliberately: the shipped file explains each share
// in prose, and a rewrite that took the prose with the number would leave a file
// whose comments argue against its own values.
func replaceNumber(text, key string, v float64) string {
	lines := strings.Split(text, "\n")
	found := false
	for i, line := range lines {
		name, rest, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(name) != key {
			continue
		}
		_, comment, _ := strings.Cut(rest, "#")
		out := key + "= " + strconv.FormatFloat(v, 'f', -1, 64)
		if c := strings.TrimSpace(comment); c != "" {
			out += " # " + c
		}
		lines[i] = out
		found = true
	}
	if !found {
		return text
	}
	return strings.Join(lines, "\n")
}
