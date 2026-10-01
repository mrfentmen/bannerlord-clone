package config

// This file covers the two morale knobs that decide whether a battle is fought
// or decided by arithmetic: the deadband on the local balance term and the floor
// the panic term pulls toward. Both are meaningless in isolation, so the tests
// that matter are the ones that ask whether a COMBINATION of them can produce a
// model that does nothing at all.
//
// The engine side of the same claim is in internal/battle's morale_test.go,
// which checks that the engine reads these values rather than carrying its own.

import (
	"strconv"
	"strings"
	"testing"
)

// TestMoraleShapeKnobsLoad: both knobs come back from the file, and both are
// inside the range their own comments state.
func TestMoraleShapeKnobsLoad(t *testing.T) {
	c, err := Load(shippedBalance)
	if err != nil {
		t.Fatalf("the shipped balance file does not load: %v", err)
	}
	if c.Battle.MoraleRatioDeadband <= 0 {
		t.Errorf("battle.morale_ratio_deadband is %g, so the local balance term has no deadband and "+
			"costs morale for a formation that is one man off parity", c.Battle.MoraleRatioDeadband)
	}
	if c.Battle.MoralePanicFloor >= c.Battle.MoraleRoutThreshold {
		t.Errorf("battle.morale_panic_floor is %g and battle.morale_rout_threshold is %g, so panic "+
			"pulls toward a floor it can never take a man below and a rout could not spread",
			c.Battle.MoralePanicFloor, c.Battle.MoraleRoutThreshold)
	}
	if c.Battle.MoralePanicSpread <= 0 {
		t.Errorf("battle.morale_panic_spread is %g, so SPEC.md section 5.2 contagion is switched off",
			c.Battle.MoralePanicSpread)
	}
	t.Logf("deadband %g, panic spread %g pulling toward floor %g, rout at %g, break at %g",
		c.Battle.MoraleRatioDeadband, c.Battle.MoralePanicSpread, c.Battle.MoralePanicFloor,
		c.Battle.MoraleRoutThreshold, c.Battle.MoraleBreakThreshold)
}

// TestLoadRefusesADeadbandThatSwallowsTheRatio: the deadband is the share of the
// local ratio either side of neutral that costs nothing. A deadband as wide as
// the distance from neutral to the nearest extreme means NO local imbalance can
// cost any morale at all, so a wing that is surrounded three to one stands
// there unharmed. Each half individually loads, so only the pair can catch it.
func TestLoadRefusesADeadbandThatSwallowsTheRatio(t *testing.T) {
	c, err := Load(shippedBalance)
	if err != nil {
		t.Fatalf("the shipped balance file does not load: %v", err)
	}
	reach := c.Battle.MoraleRatioNeutral
	if other := 1 - c.Battle.MoraleRatioNeutral; other < reach {
		reach = other
	}
	for _, bad := range []string{"0.5", "0.6", "0.9", "-0.1"} {
		text := setKey(t, shippedText(t), "battle", "morale_ratio_deadband", bad)
		_, err := Load(writeFile(t, text))
		if err == nil {
			t.Fatalf("battle.morale_ratio_deadband = %s loaded against a neutral of %g, whose nearest "+
				"extreme is %g away; no local imbalance could cost any morale", bad, c.Battle.MoraleRatioNeutral, reach)
		}
		if !strings.Contains(err.Error(), "battle.morale_ratio_deadband") {
			t.Fatalf("the error does not name the key: %v", err)
		}
	}
	// And the shipped value, which is comfortably inside, still loads. A check
	// that refuses everything is not a check.
	text := setKey(t, shippedText(t), "battle", "morale_ratio_deadband", "0.2")
	if _, err := Load(writeFile(t, text)); err != nil {
		t.Fatalf("battle.morale_ratio_deadband = 0.2 was refused, which is inside the range: %v", err)
	}
	t.Logf("deadbands of 0.5 and above refused by name against a nearest extreme of %g; 0.2 accepted", reach)
}

// TestLoadRefusesAPanicFloorAtOrAboveTheRoutThreshold: panic pulls morale toward
// the floor, so a floor at or above the rout threshold approaches it
// asymptotically and can never take a man past it. Routed troops would stop
// spreading panic the instant the first one ran.
func TestLoadRefusesAPanicFloorAtOrAboveTheRoutThreshold(t *testing.T) {
	c, err := Load(shippedBalance)
	if err != nil {
		t.Fatalf("the shipped balance file does not load: %v", err)
	}
	for _, bad := range []string{
		strconv.FormatFloat(c.Battle.MoraleRoutThreshold, 'g', -1, 64),
		"0.2", "0.5", "1.0", "-0.1",
	} {
		text := setKey(t, shippedText(t), "battle", "morale_panic_floor", bad)
		_, err := Load(writeFile(t, text))
		if err == nil {
			t.Fatalf("battle.morale_panic_floor = %s loaded against a rout threshold of %g; a man "+
				"could never be panicked past the edge", bad, c.Battle.MoraleRoutThreshold)
		}
		if !strings.Contains(err.Error(), "battle.morale_panic_floor") {
			t.Fatalf("the error does not name the key: %v", err)
		}
	}
	t.Log("a panic floor at, above, or below zero-outside the threshold all refused by name")
}
