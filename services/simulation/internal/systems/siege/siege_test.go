package siege

import "testing"

func TestPreparingDays(t *testing.T) {
	if preparingDays != 3.0 {
		t.Fatalf("preparing should last 3 days, got %v", preparingDays)
	}
}

func TestAssaultCasualtyMultiplier(t *testing.T) {
	if assaultCasMult != 2.0 {
		t.Fatalf("unbreached assault should cost 2x, got %v", assaultCasMult)
	}
}

func TestSallyChanceInRange(t *testing.T) {
	if sallyBaseChance <= 0 || sallyBaseChance > 1 {
		t.Fatalf("sally chance out of range: %v", sallyBaseChance)
	}
}

func TestPhaseMapping(t *testing.T) {
	days, breach := 0.0, 0.0
	phase := "preparing"
	if days >= preparingDays {
		if breach >= 1 {
			phase = "breached"
		} else {
			phase = "bombarding"
		}
	}
	if phase != "preparing" {
		t.Fatalf("day 0 should be preparing, got %s", phase)
	}
	days = 5
	if days >= preparingDays {
		if breach >= 1 {
			phase = "breached"
		} else {
			phase = "bombarding"
		}
	}
	if phase != "bombarding" {
		t.Fatalf("day 5 unbreached should be bombarding, got %s", phase)
	}
	breach = 1
	if days >= preparingDays {
		if breach >= 1 {
			phase = "breached"
		} else {
			phase = "bombarding"
		}
	}
	if phase != "breached" {
		t.Fatalf("full breach should be breached, got %s", phase)
	}
}
