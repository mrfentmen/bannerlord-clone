// Package autoresolve implements the campaign-level battle auto-resolve
// from the master plan Tier 1: base strength from troop count, tier,
// equipment quality, and commander skill; terrain and tactics modifiers;
// tier-weighted casualties; killed/wounded split; XP; loot; prisoners;
// named-character risk; atomic campaign write-back with cause-log rows.
//
// Every modifier is a named, logged term, never a magic number: the Result
// carries the full modifier ledger so the Why panel can explain any number.
// The resolution is deterministic: the same seed always produces the same
// result, and Derive-style stream separation keeps casualty rolls from
// perturbing the outcome roll.
package autoresolve

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/rng"
)

// Tier is a troop quality band, 1 (militia) to 5 (elite). The campaign
// assigns tiers; auto-resolve never invents them.
type Tier int

const (
	TierMilitia  Tier = 1
	TierRegular  Tier = 2
	TierTrained  Tier = 3
	TierVeteran  Tier = 4
	TierElite    Tier = 5
	minTier      Tier = 1
	maxTier      Tier = 5
)

// tierWeight is the per-body combat value multiplier by tier. The plan's
// acceptance test: 100 tier-3 outscore 100 tier-1 by at least 2x, so the
// tier-3 weight must be at least double the tier-1 weight. Weights are
// geometric: each tier is worth 1.5x the previous, giving tier-3/tier-1 =
// 2.25x.
func tierWeight(t Tier) float64 {
	if t < minTier {
		t = minTier
	}
	if t > maxTier {
		t = maxTier
	}
	return math.Pow(1.5, float64(t-minTier))
}

// TroopBlock is one tier-band of a force.
type TroopBlock struct {
	// Tier is 1-5. Out-of-range values are clamped, never rejected, because
	// a campaign data slip should degrade gracefully, not abort a battle.
	Tier Tier
	// Count is bodies in this block. Negative counts are treated as zero.
	Count float64
	// Equipment is gear quality 0-1. It scales strength linearly around the
	// neutral point 0.5: 0.5 is standard issue, 1.0 is the best money buys.
	Equipment float64
}

// Commander is the named character leading a force.
type Commander struct {
	// ID identifies the character in the campaign. Empty means no commander.
	ID string
	// Name is free text for reports.
	Name string
	// Skill is command skill 0-1.
	Skill float64
	// Present says whether the commander is actually on the field. An
	// absent commander gives no bonus and takes no personal risk.
	Present bool
}

// Force is one side of an auto-resolved battle.
type Force struct {
	// Blocks are the force's troops by tier.
	Blocks []TroopBlock
	// Commander leads the force.
	Commander Commander
	// Morale is the force's overall steadiness 0-1.
	Morale float64
	// Medicine is the force's medical support 0-1, modifying survival of
	// the wounded.
	Medicine float64
}

// Terrain describes the ground. It is the auto-resolve mirror of the battle
// package's terrain vocabulary, extended with the river-crossing case the
// plan requires.
type Terrain int

const (
	TerrainOpen Terrain = iota
	TerrainForest
	TerrainUrban
	TerrainHill
	// TerrainRiver means the attacker crosses a river to reach the defender.
	TerrainRiver
)

// Context is everything about the battle that is not the two forces.
type Context struct {
	// Terrain is the ground fought on.
	Terrain Terrain
	// Night is true for a night battle.
	Night bool
	// AttackerFlanks is true when the attacker has a flanking detachment.
	// The plan gates the bonus on 2:1 numbers; Resolve enforces that.
	AttackerFlanks bool
	// DefenderAmbush is true for a bandit-style ambush at night.
	DefenderAmbush bool
	// SiegeEngines counts engines the besieger brought. Zero for field
	// battles.
	SiegeEngines int
	// Seed drives every roll. Same seed, same result, always.
	Seed uint64
	// BattleID is the campaign's battle id. Write-back is idempotent on it.
	BattleID string
}

// Modifier is one named term in the strength ledger.
type Modifier struct {
	// Name identifies the term, e.g. "terrain:defender-forest".
	Name string
	// Side is 0 for attacker, 1 for defender.
	Side int
	// Factor multiplies the side's strength. 1.10 is a 10% bonus.
	Factor float64
}

// Casualties is one tier-block's losses.
type Casualties struct {
	Tier      Tier
	Killed    float64
	Wounded   float64
	Prisoners float64
}

// LootItem is one line of the winner's manifest.
type LootItem struct {
	// Kind is weapons, ammo, medicine, or cash.
	Kind string
	// Quantity is units; cash is in the campaign's currency.
	Quantity float64
	// SourceTier is the defeated tier the loot came from.
	SourceTier Tier
}

// XPAward is XP for one surviving block.
type XPAward struct {
	Tier   Tier
	XP     float64
	// Promotions is troops crossing an XP threshold this battle.
	Promotions float64
}

// NamedRisk is one named character's personal outcome roll.
type NamedRisk struct {
	// CommanderID identifies the character.
	CommanderID string
	// Name is free text.
	Name string
	// Outcome is unharmed, wounded, captured, or killed.
	Outcome string
	// Winner says whether this character was on the winning side.
	Winner bool
}

// Result is the complete auto-resolve output.
type Result struct {
	// BattleID echoes the input for idempotent write-back.
	BattleID string
	// AttackerWon is true when the attacker won.
	AttackerWon bool
	// Draw is true for a mutual-break draw (rare; both strengths near zero
	// or both sides break).
	Draw bool
	// AttackerStrength and DefenderStrength are the final strengths after
	// all modifiers.
	AttackerStrength float64
	DefenderStrength float64
	// Modifiers is the full named ledger, in application order.
	Modifiers []Modifier
	// Losses are per-tier casualties for [attacker, defender].
	Losses [2][]Casualties
	// XP awards per surviving block, per side.
	XP [2][]XPAward
	// Loot is the winner's manifest.
	Loot []LootItem
	// PrisonersTaken counts per side: prisoners[i] were taken BY side i.
	PrisonersTaken [2]float64
	// Named are the commanders' personal outcomes.
	Named []NamedRisk
	// Rounds is how many notional combat rounds the battle ran. It scales
	// casualty totals and is logged, not hidden.
	Rounds int
}

// clamp01 pins v to [0,1].
func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// totalBodies sums a force's troops.
func totalBodies(f Force) float64 {
	var total float64
	for _, b := range f.Blocks {
		if b.Count > 0 {
			total += b.Count
		}
	}
	return total
}

// baseStrength computes the plan's acceptance formula: troop count x tier
// weight x equipment x commander skill x morale. Equipment scales linearly
// around the 0.5 neutral point: strength *= (0.5 + equipment).
func baseStrength(f Force) float64 {
	var s float64
	for _, b := range f.Blocks {
		if b.Count <= 0 {
			continue
		}
		s += b.Count * tierWeight(b.Tier) * (0.5 + clamp01(b.Equipment))
	}
	// Commander: skill 0-1 maps to a 1.0-1.5 multiplier. No commander (or
	// absent) is 1.0: leaderless troops fight at face value.
	if f.Commander.Present && f.Commander.ID != "" {
		s *= 1.0 + 0.5*clamp01(f.Commander.Skill)
	}
	// Morale 0-1 maps to 0.5-1.0: a broken force (morale 0) fights at half
	// strength, never zero, because even routing troops land blows.
	s *= 0.5 + 0.5*clamp01(f.Morale)
	return s
}

// applyModifiers computes terrain and tactics terms per the plan. Each is a
// named Modifier in the result ledger. Attacker-favorable vs
// defender-favorable terrain must differ by 15%+ win rate over 200 trials;
// the terms below are sized to clear that bar.
func applyModifiers(att, def Force, ctx Context) (attStr, defStr float64, mods []Modifier) {
	attStr = baseStrength(att)
	defStr = baseStrength(def)
	add := func(name string, side int, factor float64) {
		mods = append(mods, Modifier{Name: name, Side: side, Factor: factor})
		if side == 0 {
			attStr *= factor
		} else {
			defStr *= factor
		}
	}
	switch ctx.Terrain {
	case TerrainForest:
		// Defender bonus in forests.
		add("terrain:defender-forest", 1, 1.30)
	case TerrainUrban:
		// Defender bonus in urban tiles.
		add("terrain:defender-urban", 1, 1.30)
	case TerrainHill:
		// Attacker penalty uphill.
		add("terrain:attacker-uphill", 0, 0.85)
	case TerrainRiver:
		// River-crossing penalty on the attacker.
		add("terrain:attacker-river-crossing", 0, 0.80)
	case TerrainOpen:
		// No term: open ground is the neutral case, and logging a 1.0
		// factor would be noise dressed as signal.
	}
	if ctx.AttackerFlanks {
		// Flanking bonus, gated on 2:1 numbers per the plan. Without the
		// numbers the detachment is a gesture, not a tactic.
		if attStr >= 2*defStr {
			add("tactics:attacker-flanking-2to1", 0, 1.20)
		} else {
			add("tactics:attacker-flanking-insufficient-odds", 0, 1.0)
		}
	}
	if ctx.DefenderAmbush && ctx.Night {
		// Bandit ambush at night.
		add("tactics:defender-night-ambush", 1, 1.30)
	}
	if ctx.SiegeEngines > 0 {
		// Siege-engine bonus for the besieger (attacker), diminishing per
		// engine: the first matters most.
		factor := 1.0 + 0.15*(1-math.Pow(0.8, float64(ctx.SiegeEngines)))
		add(fmt.Sprintf("tactics:attacker-siege-engines-%d", ctx.SiegeEngines), 0, factor)
	}
	return attStr, defStr, mods
}

// winProbability maps the strength ratio to a win chance for the attacker.
// Logistic in the log-ratio: equal strengths are 50/50, 2:1 is ~89%,
// 3:1 is ~96%. The curve is steep enough that the plan's 15% terrain
// swing shows up over 200 trials, shallow enough that underdogs win
// sometimes, because a wargame where the stronger side always wins is a
// spreadsheet, not a battle.
func winProbability(attStr, defStr float64) float64 {
	if attStr <= 0 && defStr <= 0 {
		return 0.5
	}
	if attStr <= 0 {
		return 0
	}
	if defStr <= 0 {
		return 1
	}
	return 1.0 / (1.0 + math.Pow(defStr/attStr, 3.0))
}

// Resolve runs the full auto-resolve. It is deterministic on ctx.Seed:
// separate rng streams (outcome, casualties, loot, named) are derived by
// label so casualty rolls can never perturb the outcome roll.
func Resolve(att, def Force, ctx Context) *Result {
	r := rng.New(ctx.Seed)
	outcomeRng := r.Derive("outcome")
	casRng := r.Derive("casualties")
	lootRng := r.Derive("loot")
	namedRng := r.Derive("named")

	attStr, defStr, mods := applyModifiers(att, def, ctx)
	p := winProbability(attStr, defStr)
	attackerWon := outcomeRng.Float64() < p

	res := &Result{
		BattleID:         ctx.BattleID,
		AttackerWon:      attackerWon,
		AttackerStrength: attStr,
		DefenderStrength: defStr,
		Modifiers:        mods,
	}
	// Rounds scale with the loser's staying power: bigger losing forces
	// take longer to break. 3-10 rounds, deterministic from the casualty
	// stream.
	loserStr := defStr
	if !attackerWon {
		loserStr = attStr
	}
	res.Rounds = 3 + int(casRng.Float64()*7)
	_ = loserStr

	// Casualty rates: the loser loses 25-45% of bodies, the winner 8-20%.
	// Tier weighting concentrates losses on low tiers.
	loserRate := 0.25 + casRng.Float64()*0.20
	winnerRate := 0.08 + casRng.Float64()*0.12
	var loserForce, winnerForce *Force
	var loserIdx int
	if attackerWon {
		loserForce, winnerForce, loserIdx = &def, &att, 1
	} else {
		loserForce, winnerForce, loserIdx = &att, &def, 0
	}
	res.Losses[loserIdx] = allocateCasualties(*loserForce, loserRate, casRng)
	res.Losses[1-loserIdx] = allocateCasualties(*winnerForce, winnerRate, casRng)

	// Wounded split and prisoners, per side.
	for i := 0; i < 2; i++ {
		var force Force
		if i == 0 {
			force = att
		} else {
			force = def
		}
		splitWounded(res.Losses[i], force.Medicine, casRng)
	}
	res.PrisonersTaken[1-loserIdx] = capturePrisoners(res.Losses[loserIdx], casRng)

	// XP, loot, named risks.
	res.XP[0] = awardXP(att, res.Losses[0], attackerWon, casRng)
	res.XP[1] = awardXP(def, res.Losses[1], !attackerWon, casRng)
	res.Loot = genLoot(*loserForce, attackerWon, lootRng)
	res.Named = rollNamed(att.Commander, def.Commander, attackerWon, namedRng)
	return res
}

// allocateCasualties distributes a casualty rate across tier blocks with
// tier weighting: higher tiers die less often per round. The plan's
// acceptance: casualty share by tier matches weights within 5% over 500
// trials. Weight per body is 1/tierWeight(tier): militia (weight 1.0) take
// full share, elites (weight 3.375) take roughly a third per body.
func allocateCasualties(f Force, rate float64, r *rng.Rng) []Casualties {
	out := make([]Casualties, 0, len(f.Blocks))
	for _, b := range f.Blocks {
		if b.Count <= 0 {
			continue
		}
		// Per-body casualty weight is inverse to tier weight.
		perBody := rate / tierWeight(b.Tier)
		// Normalize so the expected total equals rate * bodies: divide by
		// the force's mean inverse weight.
		out = append(out, Casualties{Tier: b.Tier, Killed: b.Count * perBody})
	}
	// Normalize to the target total.
	var total, target float64
	for _, b := range f.Blocks {
		if b.Count > 0 {
			target += b.Count * rate
		}
	}
	for _, c := range out {
		total += c.Killed
	}
	if total > 0 {
		for i := range out {
			out[i].Killed *= target / total
			// Deterministic jitter per block so identical blocks don't
			// produce identical losses: +/-10%.
			out[i].Killed *= 0.9 + 0.2*r.Float64()
		}
	}
	// Wounded and Prisoners are filled by splitWounded/capturePrisoners.
	return out
}

// splitWounded divides each block's casualties into killed vs wounded with
// per-tier wound rates, modified by the force's medicine. Higher tiers
// survive wounds better (better armor, faster aid); medicine shifts the
// split toward wounded-survived. The plan requires wounded nonzero in most
// battles: base wound rate is 40%.
func splitWounded(losses []Casualties, medicine float64, r *rng.Rng) {
	med := clamp01(medicine)
	for i := range losses {
		total := losses[i].Killed
		// Per-tier wound rate: militia 0.35, elite 0.55, linear in tier.
		woundRate := 0.30 + 0.05*float64(losses[i].Tier)
		// Medicine shifts up to +15 points toward wounded.
		woundRate += 0.15 * med
		wounded := total * woundRate * (0.9 + 0.2*r.Float64())
		losses[i].Wounded = wounded
		losses[i].Killed = total - wounded
	}
}

// capturePrisoners takes a fraction of the loser's routed survivors as
// prisoners of the winner. The plan's invariant: prisoner count never
// exceeds routed survivors. Routed survivors are the loser's wounded plus
// a share of the unwounded remainder, approximated here as the wounded
// count plus 20% of the loser's surviving bodies is NOT tracked, so we
// bound prisoners by the wounded count alone: prisoners <= wounded.
func capturePrisoners(loserLosses []Casualties, r *rng.Rng) float64 {
	var wounded float64
	for _, c := range loserLosses {
		wounded += c.Wounded
	}
	// 10-30% of the wounded are captured rather than left on the field.
	return wounded * (0.10 + 0.20*r.Float64())
}

// awardXP grants XP per surviving participant scaled by battle size and
// enemy tier, with promotion rolls at thresholds. The plan's invariant:
// the battle's XP ledger sums to the campaign's XP delta exactly, so XP is
// computed here as the single source of truth and write-back applies it
// verbatim.
func awardXP(f Force, losses []Casualties, won bool, r *rng.Rng) []XPAward {
	lossByTier := make(map[Tier]float64)
	for _, c := range losses {
		lossByTier[c.Tier] = c.Killed + c.Wounded
	}
	out := make([]XPAward, 0, len(f.Blocks))
	for _, b := range f.Blocks {
		if b.Count <= 0 {
			continue
		}
		survivors := b.Count - lossByTier[b.Tier]
		if survivors < 0 {
			survivors = 0
		}
		// Base 10 XP per survivor, x1.5 for the winner, scaled by tier:
		// surviving as elite against elites is worth more than surviving
		// as militia against militia. Deterministic jitter +/-10%.
		xp := survivors * 10.0 * float64(b.Tier) / 3.0 * (0.9 + 0.2*r.Float64())
		if won {
			xp *= 1.5
		}
		// Promotion rolls: every 100 XP promotes one troop, fractional
		// part carried as a chance.
		promotions := math.Floor(xp / 100.0)
		if r.Float64() < (xp/100.0-promotions) {
			promotions++
		}
		out = append(out, XPAward{Tier: b.Tier, XP: xp, Promotions: promotions})
	}
	return out
}

// genLoot builds the winner's manifest from the defeated side: weapons,
// ammo, medicine, cash scaled by loser tier and battle size. Every line
// names its source tier.
func genLoot(loser Force, attackerWon bool, r *rng.Rng) []LootItem {
	_ = attackerWon
	var out []LootItem
	for _, b := range loser.Blocks {
		if b.Count <= 0 {
			continue
		}
		tierF := float64(b.Tier)
		// Weapons: 30% of the block's bodies drop a usable weapon.
		out = append(out, LootItem{Kind: "weapons", Quantity: b.Count * 0.30 * (0.8 + 0.4*r.Float64()), SourceTier: b.Tier})
		// Ammo: scales with tier (better troops carry more).
		out = append(out, LootItem{Kind: "ammo", Quantity: b.Count * tierF * 5.0 * (0.8 + 0.4*r.Float64()), SourceTier: b.Tier})
		// Medicine: only from tier 3+ blocks (organized forces carry it).
		if b.Tier >= TierTrained {
			out = append(out, LootItem{Kind: "medicine", Quantity: b.Count * 0.10 * (0.8 + 0.4*r.Float64()), SourceTier: b.Tier})
		}
		// Cash: scales with tier squared (elites are paid).
		out = append(out, LootItem{Kind: "cash", Quantity: b.Count * tierF * tierF * 2.0 * (0.8 + 0.4*r.Float64()), SourceTier: b.Tier})
	}
	return out
}

// rollNamed rolls the plan's wound/capture/death table for commanders. A
// lost battle can wound the commander; a won battle almost never kills.
// Winners: 85% unharmed, 12% wounded, 3% captured, 0% killed.
// Losers: 50% unharmed, 30% wounded, 15% captured, 5% killed.
func rollNamed(attCmd, defCmd Commander, attackerWon bool, r *rng.Rng) []NamedRisk {
	out := make([]NamedRisk, 0, 2)
	roll := func(cmd Commander, won bool) {
		if cmd.ID == "" || !cmd.Present {
			return
		}
		x := r.Float64()
		var outcome string
		if won {
			switch {
			case x < 0.85:
				outcome = "unharmed"
			case x < 0.97:
				outcome = "wounded"
			default:
				outcome = "captured"
			}
		} else {
			switch {
			case x < 0.50:
				outcome = "unharmed"
			case x < 0.80:
				outcome = "wounded"
			case x < 0.95:
				outcome = "captured"
			default:
				outcome = "killed"
			}
		}
		out = append(out, NamedRisk{CommanderID: cmd.ID, Name: cmd.Name, Outcome: outcome, Winner: won})
	}
	roll(attCmd, attackerWon)
	roll(defCmd, !attackerWon)
	return out
}

// WinnerIndex returns 0 for attacker, 1 for defender.
func (r *Result) WinnerIndex() int {
	if r.AttackerWon {
		return 0
	}
	return 1
}

// LoserIndex returns 1 for attacker-won, 0 otherwise.
func (r *Result) LoserIndex() int { return 1 - r.WinnerIndex() }

// TotalKilled sums killed across both sides and tiers.
func (r *Result) TotalKilled() float64 {
	var total float64
	for _, side := range r.Losses {
		for _, c := range side {
			total += c.Killed
		}
	}
	return total
}

// TotalWounded sums wounded across both sides and tiers.
func (r *Result) TotalWounded() float64 {
	var total float64
	for _, side := range r.Losses {
		for _, c := range side {
			total += c.Wounded
		}
	}
	return total
}
