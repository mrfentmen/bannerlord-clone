package campaign

// Dynasty, courtship, enterprise, and influence: the server side of the
// client's clan/court/economy/party/siege/tavern orders.
//
// The client's unserved.ts table marks these paths "the server side is not
// written" — this file writes it. The domain lives in campaign-scoped state
// (like prisonerState), keyed by the client's string IDs, because the
// simulation's model layer tracks rulers and sides, not characters and
// workshops. The logic mirrors the client's TypeScript modules
// (clan/tiers.ts, court/foundKingdom.ts, afteraction/prisoners.ts,
// clan/pregnancy.ts, clan/courtship.ts, afteraction/conformity.ts,
// economy/brokers.ts, economy/workshopChains.ts, troop/branches.ts,
// siege/engines.ts, tavern/games.ts, party/templates.ts,
// campaign/smithingStamina.ts, court/influence.ts) so both providers agree
// on the rules.
//
// Daily simulation (conceptions, births, workshop production, stamina
// refill) runs lazily: every dynasty order first advances the dynasty clock
// to the current tick. Deterministic — all draws come from the dynasty
// stream derived from the campaign seed.

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
)

// ---------------------------------------------------------------------------
// Clan tiers (mirrors clan/tiers.ts)
// ---------------------------------------------------------------------------

var tierRenown = []int{0, 50, 150, 350, 900, 2350, 6150}

var tierNames = []string{"Drifters", "Rabble", "Crew", "Outfit", "Syndicate", "Cartel", "Empire"}

// tierFiefLimits: -1 means uncapped (Empire).
var tierFiefLimits = []int{1, 2, 3, 4, 6, 8, -1}

var tierCompanionSlots = []int{1, 2, 3, 4, 5, 6, 8}

func tierForRenown(renown int) int {
	tier := 0
	for t, th := range tierRenown {
		if renown >= th {
			tier = t
		}
	}
	return tier
}

func clampTier(t int) int {
	if t < 0 {
		return 0
	}
	if t > 6 {
		return 6
	}
	return t
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// DynCharacter is a person of the dynasty layer.
type DynCharacter struct {
	ID        string
	Name      string
	Age       int
	ClanID    string
	SideID    int
	Alive     bool
	SpouseID  string
	ParentIDs []string
	Traits    []string
	Skills    map[string]int
	IsPlayer  bool
}

// DynClan is a clan of the dynasty layer.
type DynClan struct {
	ID        string
	Name      string
	Renown    int
	Tier      int
	MemberIDs []string
	FiefIDs   []string
}

// Pregnancy mirrors clan/pregnancy.ts.
type Pregnancy struct {
	MotherID string
	FatherID string
	StartDay int
	DueDay   int
}

// Courtship mirrors clan/courtship.ts.
type Courtship struct {
	SuitorID   string
	TargetID   string
	Stage      string // courting | betrothed | rejected
	Affection  float64
	StartedDay int
	Rejections int
}

// HeldLord is an enemy lord held prisoner by the player clan.
type HeldLord struct {
	Name        string
	FactionID   int
	ClanName    string
	CapturedDay int
}

// Workshop runs a production recipe.
type Workshop struct {
	ID         string
	TownID     int
	Type       string
	Name       string
	LastProfit float64
	AgeDays    int
}

// TemplateEntry is one line of a party template.
type TemplateEntry struct {
	Tier   int    `json:"tier"`
	Branch string `json:"branch,omitempty"`
	Count  int    `json:"count"`
}

// PartyTemplate mirrors party/templates.ts.
type PartyTemplate struct {
	ID       string
	Name     string
	Entries  []TemplateEntry
	SavedDay int
}

// EngineQueueItem is one engine under construction.
type EngineQueueItem struct {
	TypeID   string `json:"typeId"`
	DaysLeft int    `json:"daysLeft"`
}

// EnginePark mirrors siege/engines.ts.
type EnginePark struct {
	Queue        []EngineQueueItem `json:"queue"`
	Reserve      []string          `json:"reserve"`
	Deployed     []string          `json:"deployed"`
	FireVariants []string          `json:"fireVariants"`
}

// TroopPrisoner is a stack of captive troops with conformity.
type TroopPrisoner struct {
	TroopID    string
	Name       string
	Count      int
	Tier       int
	Conformity float64
}

// dynastyState is the campaign-scoped dynasty domain.
type dynastyState struct {
	rng *rng.Rng
	seq int

	characters  map[string]*DynCharacter
	clans       map[string]*DynClan
	pregnancies []*Pregnancy
	courtships  []*Courtship
	heldLords   []*HeldLord
	workshops   map[string]*Workshop
	templates   map[string]*PartyTemplate
	tplOrder    []string
	engines     map[int]*EnginePark // by siege ID
	troopPrison map[string]*TroopPrisoner

	smithingStamina float64
	lastTick        int
}

func newDynastyState(seed uint64) *dynastyState {
	return &dynastyState{
		rng:             rng.New(seed).Derive("dynasty"),
		characters:      map[string]*DynCharacter{},
		clans:           map[string]*DynClan{},
		workshops:       map[string]*Workshop{},
		templates:       map[string]*PartyTemplate{},
		engines:         map[int]*EnginePark{},
		troopPrison:     map[string]*TroopPrisoner{},
		smithingStamina: 100,
	}
}

func (c *Campaign) ensureDynasty() *dynastyState {
	if c.dynasty == nil {
		c.dynasty = newDynastyState(c.opts.Seed)
	}
	d := c.dynasty
	if _, ok := d.clans["clan-player"]; !ok {
		d.clans["clan-player"] = &DynClan{ID: "clan-player", Name: "Player Clan"}
	}
	if _, ok := d.characters["char-player"]; !ok {
		d.characters["char-player"] = &DynCharacter{
			ID: "char-player", Name: "Player", Age: 30, ClanID: "clan-player",
			Alive: true, Skills: map[string]int{}, IsPlayer: true,
		}
		d.clans["clan-player"].MemberIDs = append(d.clans["clan-player"].MemberIDs, "char-player")
	}
	return d
}

// tickDynastyLocked advances daily dynasty simulation to the current tick.
func (c *Campaign) tickDynastyLocked() {
	d := c.ensureDynasty()
	for d.lastTick < c.state.Tick {
		d.lastTick++
		c.dynastyDayLocked(d, d.lastTick)
	}
}

func (c *Campaign) dynastyDayLocked(d *dynastyState, day int) {
	// Conceptions.
	for _, ch := range d.characters {
		if !ch.Alive || ch.SpouseID == "" || ch.ID > ch.SpouseID {
			continue
		}
		sp, ok := d.characters[ch.SpouseID]
		if !ok || !sp.Alive {
			continue
		}
		if hasPregnancy(d, ch.ID) || hasPregnancy(d, sp.ID) {
			continue
		}
		younger, older := ch, sp
		if sp.Age < ch.Age {
			younger, older = sp, ch
		}
		if d.rng.Float64() < conceptionChance(younger.Age, older.Age) {
			d.pregnancies = append(d.pregnancies, &Pregnancy{
				MotherID: younger.ID, FatherID: older.ID,
				StartDay: day, DueDay: day + 252,
			})
		}
	}
	// Births.
	kept := d.pregnancies[:0]
	for _, p := range d.pregnancies {
		if day < p.DueDay {
			kept = append(kept, p)
			continue
		}
		m, ok1 := d.characters[p.MotherID]
		f, ok2 := d.characters[p.FatherID]
		if ok1 && ok2 && m.Alive && f.Alive {
			c.haveChildLocked(d, p.MotherID, p.FatherID, day)
			if d.rng.Float64() < maternalDeathChance(m.Age) {
				m.Alive = false
			}
		}
	}
	d.pregnancies = kept
	// Workshops produce.
	for _, w := range d.workshops {
		w.AgeDays++
		profit := workshopDayProfit(w.Type)
		w.LastProfit = profit
		if m := c.playerPartyMoney(); m != nil {
			*m += profit
		}
	}
	// Smithing stamina refills each dawn.
	d.smithingStamina = maxStamina(c.playerCrafting())
}

func hasPregnancy(d *dynastyState, motherID string) bool {
	for _, p := range d.pregnancies {
		if p.MotherID == motherID {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Pure logic (mirrors the TS modules)
// ---------------------------------------------------------------------------

func conceptionChance(motherAge, fatherAge int) float64 {
	if motherAge < 18 || motherAge > 45 || fatherAge < 18 || fatherAge > 60 {
		return 0
	}
	factor := 1.0
	if motherAge > 35 {
		factor = math.Max(0.3, 1-float64(motherAge-35)*0.1)
	}
	return 0.02 * factor
}

func maternalDeathChance(motherAge int) float64 {
	return math.Min(0.25, 0.02+math.Max(0, float64(motherAge-25))*0.008)
}

func conformityNeed(tier int) float64 {
	t := math.Max(1, float64(tier))
	return (t+6)*(t+6) - 10
}

func brokerRate(prosperity01 float64) float64 {
	p := math.Max(0, math.Min(1, prosperity01))
	return 0.55 + p*0.15
}

type recipeIO struct {
	good string
	qty  float64
}

type recipeDef struct {
	inputs  []recipeIO
	outputs []recipeIO
	wages   float64
	runs    int
}

var workshopRecipes = map[string]recipeDef{
	"smithy": {
		inputs:  []recipeIO{{"metal", 2}, {"fuel", 1}},
		outputs: []recipeIO{{"arms", 1}},
		wages:   25, runs: 3,
	},
	"brewery": {
		inputs:  []recipeIO{{"grain", 3}},
		outputs: []recipeIO{{"beer", 2}},
		wages:   15, runs: 4,
	},
	"weavery": {
		inputs:  []recipeIO{{"textiles", 2}},
		outputs: []recipeIO{{"cloth", 3}},
		wages:   15, runs: 4,
	},
	"tannery": {
		inputs:  []recipeIO{{"lumber", 2}, {"fuel", 1}},
		outputs: []recipeIO{{"leather", 2}},
		wages:   18, runs: 3,
	},
	"press": {
		inputs:  []recipeIO{{"metal", 3}},
		outputs: []recipeIO{{"tools", 2}},
		wages:   20, runs: 3,
	},
}

var basePrices = map[string]float64{
	"grain": 12, "metal": 55, "fuel": 30, "arms": 210,
	"textiles": 26, "tools": 48, "lumber": 19,
	"beer": 18, "cloth": 32, "leather": 45,
}

func workshopDayProfit(workshopType string) float64 {
	recipe, ok := workshopRecipes[workshopType]
	if !ok {
		return 0
	}
	var inCost, outVal float64
	for _, in := range recipe.inputs {
		inCost += basePrices[in.good] * in.qty * float64(recipe.runs)
	}
	for _, out := range recipe.outputs {
		outVal += basePrices[out.good] * out.qty * float64(recipe.runs)
	}
	return math.Round(outVal - inCost - recipe.wages)
}

type engineType struct {
	id                 string
	name               string
	buildDays          int
	cost               float64
	siegeDamage        float64
	counterBatteryRisk float64
}

var engineTypes = []engineType{
	{id: "breaching-truck", name: "Breaching Truck", buildDays: 3, cost: 800, siegeDamage: 0.25, counterBatteryRisk: 0.10},
	{id: "artillery", name: "Artillery Piece", buildDays: 5, cost: 1500, siegeDamage: 0.35, counterBatteryRisk: 0.15},
	{id: "assault-ladder", name: "Assault Ladder", buildDays: 1, cost: 200, siegeDamage: 0.08, counterBatteryRisk: 0.05},
	{id: "shield-wall", name: "Shield Wall", buildDays: 2, cost: 400, siegeDamage: 0.0, counterBatteryRisk: 0.03},
}

func findEngineType(id string) *engineType {
	for i := range engineTypes {
		if engineTypes[i].id == id {
			return &engineTypes[i]
		}
	}
	return nil
}

func maxStamina(crafting int) float64 { return 100 + math.Max(0, float64(crafting))*2 }

var influenceGains = map[string][2]float64{
	"battle-victory": {4, 10},
	"tournament-win": {8, 12},
	"quest-complete": {5, 9},
	"release-lord":   {10, 15},
	"policy-vote":    {2, 4},
	"siege-victory":  {12, 20},
}

var influenceCosts = map[string]float64{
	"muster-army": 30, "call-vote": 20, "bribe-lord": 25,
	"recruit-vassal": 50, "force-policy": 40,
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Player accessors (caller holds c.mu)
// ---------------------------------------------------------------------------

func (c *Campaign) playerPartyMoney() *float64 {
	p := c.state.Parties[c.party]
	if p == nil {
		return nil
	}
	return &p.Money
}

func (c *Campaign) playerRulerInfluence() *float64 {
	r := c.state.Rulers[c.playerRuler]
	if r == nil {
		return nil
	}
	return &r.Influence
}

func (c *Campaign) playerCrafting() int {
	if c.character.skills == nil {
		return 0
	}
	return int(c.character.skills["crafting"])
}

func (c *Campaign) playerRenown() int {
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		return int(r.Renown)
	}
	return 0
}

// ---------------------------------------------------------------------------
// Campaign methods: dynasty (marry / child / kill / heir)
// ---------------------------------------------------------------------------

// Marry creates a marriage between two living unmarried characters.
func (c *Campaign) Marry(ctx context.Context, charID1, charID2 string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	c1, ok1 := d.characters[charID1]
	c2, ok2 := d.characters[charID2]
	if !ok1 || !ok2 {
		return nil, notFoundf("character not found")
	}
	if !c1.Alive || !c2.Alive {
		return nil, conflictf("Cannot marry the dead.", "character dead")
	}
	if c1.SpouseID != "" || c2.SpouseID != "" {
		return nil, conflictf("One or both characters are already married.", "already married")
	}
	if c1.ID == c2.ID {
		return nil, conflictf("Cannot marry oneself.", "self marriage")
	}
	c1.SpouseID = c2.ID
	c2.SpouseID = c1.ID
	return map[string]any{}, nil
}

// haveChildLocked records a birth. Caller holds c.mu.
func (c *Campaign) haveChildLocked(d *dynastyState, parentID1, parentID2 string, day int) string {
	d.seq++
	childID := fmt.Sprintf("char-%d-%d", day, d.seq)
	sex := "male"
	if d.rng.Float64() < 0.5 {
		sex = "female"
	}
	_ = sex
	p1 := d.characters[parentID1]
	name := fmt.Sprintf("Child of %s", p1.Name)
	d.characters[childID] = &DynCharacter{
		ID: childID, Name: name, Age: 0, ClanID: p1.ClanID,
		Alive: true, ParentIDs: []string{parentID1, parentID2},
		Skills: map[string]int{},
	}
	if clan := d.clans[p1.ClanID]; clan != nil {
		clan.MemberIDs = append(clan.MemberIDs, childID)
	}
	return childID
}

// HaveChild records the birth of a child to two parents.
func (c *Campaign) HaveChild(ctx context.Context, parentID1, parentID2, childName string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	p1, ok1 := d.characters[parentID1]
	p2, ok2 := d.characters[parentID2]
	if !ok1 || !ok2 {
		return nil, notFoundf("parent not found")
	}
	if !p1.Alive || !p2.Alive {
		return nil, conflictf("Cannot have a child with a dead parent.", "parent dead")
	}
	childID := c.haveChildLocked(d, parentID1, parentID2, c.state.Tick)
	if strings.TrimSpace(childName) != "" {
		d.characters[childID].Name = strings.TrimSpace(childName)
	}
	return map[string]any{"childId": childID}, nil
}

// KillCharacter kills a character, handling succession.
func (c *Campaign) KillCharacter(ctx context.Context, charID, cause string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	ch, ok := d.characters[charID]
	if !ok {
		return nil, notFoundf("character %s not found", charID)
	}
	if !ch.Alive {
		return nil, conflictf("They are already dead.", "already dead")
	}
	ch.Alive = false
	_ = cause
	return map[string]any{}, nil
}

type heirView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Age  int    `json:"age"`
}

// GetHeir returns the current heir for a clan (oldest living child of a member).
func (c *Campaign) GetHeir(ctx context.Context, clanID string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	clan, ok := d.clans[clanID]
	if !ok {
		return nil, notFoundf("clan %s not found", clanID)
	}
	// Heir: oldest living character whose parent is a clan member.
	members := map[string]bool{}
	for _, m := range clan.MemberIDs {
		members[m] = true
	}
	var best *DynCharacter
	for _, ch := range d.characters {
		if !ch.Alive {
			continue
		}
		isChild := false
		for _, p := range ch.ParentIDs {
			if members[p] {
				isChild = true
				break
			}
		}
		if !isChild {
			continue
		}
		if best == nil || ch.Age > best.Age {
			best = ch
		}
	}
	if best == nil {
		return nil, nil
	}
	return heirView{ID: best.ID, Name: best.Name, Age: best.Age}, nil
}

// ---------------------------------------------------------------------------
// Campaign methods: held lords (capture / ransom / release / execute)
// ---------------------------------------------------------------------------

type heldLordView struct {
	Name        string `json:"name"`
	FactionID   string `json:"factionId"`
	ClanName    string `json:"clanName"`
	CapturedDay int    `json:"capturedDay"`
}

// GetHeldLords lists enemy lords held prisoner by the player clan.
func (c *Campaign) GetHeldLords(ctx context.Context) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	out := make([]heldLordView, 0, len(d.heldLords))
	for _, l := range d.heldLords {
		out = append(out, heldLordView{
			Name: l.Name, FactionID: fmt.Sprintf("%d", l.FactionID),
			ClanName: l.ClanName, CapturedDay: l.CapturedDay,
		})
	}
	return out, nil
}

func (c *Campaign) findHeldLord(d *dynastyState, name string) int {
	for i, l := range d.heldLords {
		if l.Name == name {
			return i
		}
	}
	return -1
}

// RansomHeldLord ransoms a held lord back to their faction.
func (c *Campaign) RansomHeldLord(ctx context.Context, name string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	i := c.findHeldLord(d, name)
	if i < 0 {
		return nil, notFoundf("held lord %s not found", name)
	}
	gold := 1500 + int(d.rng.Float64()*1500)
	d.heldLords = append(d.heldLords[:i], d.heldLords[i+1:]...)
	if m := c.playerPartyMoney(); m != nil {
		*m += float64(gold)
	}
	return map[string]any{"gold": gold}, nil
}

// ReleaseHeldLord frees a held lord: +15 faction relation, +honor.
func (c *Campaign) ReleaseHeldLord(ctx context.Context, name string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	i := c.findHeldLord(d, name)
	if i < 0 {
		return nil, notFoundf("held lord %s not found", name)
	}
	lord := d.heldLords[i]
	d.heldLords = append(d.heldLords[:i], d.heldLords[i+1:]...)
	// Relation: warm the side-to-side relation with the lord's faction.
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		c.state.SideRelations[model.MakePair(r.SideID, lord.FactionID)] =
			c.state.SideRelation(r.SideID, lord.FactionID) + 15
	}
	c.awardInfluenceLocked("release-lord")
	return map[string]any{"relationGained": 15}, nil
}

// ExecuteHeldLord executes a held lord: dread up, honor down, relations down.
func (c *Campaign) ExecuteHeldLord(ctx context.Context, name string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	i := c.findHeldLord(d, name)
	if i < 0 {
		return nil, notFoundf("held lord %s not found", name)
	}
	lord := d.heldLords[i]
	d.heldLords = append(d.heldLords[:i], d.heldLords[i+1:]...)
	// Troop morale suffers.
	if p := c.state.Parties[c.party]; p != nil {
		p.Morale = math.Max(0, p.Morale-5)
	}
	return map[string]any{"line": fmt.Sprintf("%s was executed. The realm will remember this.", lord.Name)}, nil
}

// ---------------------------------------------------------------------------
// Campaign methods: clan tier & kingdom
// ---------------------------------------------------------------------------

// GetClanTier returns the player clan's tier info.
func (c *Campaign) GetClanTier(ctx context.Context) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	clan := d.clans["clan-player"]
	renown := c.playerRenown()
	tier := clampTier(tierForRenown(renown))
	clan.Tier = tier
	fiefLimit := tierFiefLimits[tier]
	renownToNext := 0
	if tier < 6 {
		renownToNext = tierRenown[tier+1] - renown
		if renownToNext < 0 {
			renownToNext = 0
		}
	}
	return map[string]any{
		"tier": tier, "name": tierNames[tier], "renown": renown,
		"renownToNext": renownToNext, "fiefLimit": fiefLimit,
		"fiefsHeld":      len(clan.FiefIDs),
		"companionSlots": tierCompanionSlots[tier],
		"partyCapacity":  25 + tier*25,
	}, nil
}

// FoundKingdom founds a player kingdom. Requires tier 4+, a fief, 100 influence.
func (c *Campaign) FoundKingdom(ctx context.Context, kingdomName string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	clan := d.clans["clan-player"]
	kingdomName = strings.TrimSpace(kingdomName)
	if kingdomName == "" {
		return nil, badRequestf("kingdom name is required")
	}
	renown := c.playerRenown()
	tier := clampTier(tierForRenown(renown))
	if tier < 4 {
		return nil, unprocessablef("Founding a kingdom requires clan tier 4 (have %d).", "tier")
	}
	if len(clan.FiefIDs) == 0 {
		return nil, unprocessablef("A kingdom needs a capital — hold a fief first.", "no fief")
	}
	inf := c.playerRulerInfluence()
	if inf == nil || *inf < 100 {
		return nil, unprocessablef("Founding a kingdom costs 100 influence.", "influence")
	}
	*inf -= 100
	capital := clan.FiefIDs[0]
	// Register the new side in the simulation.
	ruler := c.state.Rulers[c.playerRuler]
	formerSide := 0
	if ruler != nil {
		formerSide = ruler.SideID
	}
	newSideID := c.state.NewID(model.IDSide)
	c.state.Sides[newSideID] = &model.Side{
		ID: newSideID, Name: kingdomName, LeaderID: c.playerRuler,
	}
	if ruler != nil {
		ruler.SideID = newSideID
	}
	if p := c.state.Parties[c.party]; p != nil {
		p.SideID = newSideID
	}
	// Keeping old-faction land means war with the former faction.
	warWithFormer := formerSide != 0
	if warWithFormer {
		warID := c.state.NewID(model.IDWar)
		c.state.Wars[warID] = &model.War{
			ID: warID, SideA: newSideID, SideB: formerSide,
			StartTick: float64(c.state.Tick), EndTick: -1,
			Reason: model.WarRevenge, Intensity: 0.6,
		}
	}
	line := fmt.Sprintf("The %s rises. %s is its capital.", kingdomName, capital)
	if warWithFormer {
		line += " The old kingdom wants its land back — it means war."
	}
	return map[string]any{
		"kingdomName":   kingdomName,
		"capital":       capital,
		"warWithFormer": warWithFormer,
		"line":          line,
	}, nil
}

// ---------------------------------------------------------------------------
// Campaign methods: courtship
// ---------------------------------------------------------------------------

type courtshipView struct {
	TargetName string  `json:"targetName"`
	Affection  float64 `json:"affection"`
	Stage      string  `json:"stage"`
}

// GetCourtships lists active courtships.
func (c *Campaign) GetCourtships(ctx context.Context) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	out := make([]courtshipView, 0, len(d.courtships))
	for _, cs := range d.courtships {
		name := cs.TargetID
		if ch, ok := d.characters[cs.TargetID]; ok {
			name = ch.Name
		} else if r := c.state.Rulers[atoi(cs.TargetID)]; r != nil {
			name = r.Name
		}
		out = append(out, courtshipView{TargetName: name, Affection: math.Round(cs.Affection), Stage: cs.Stage})
	}
	return out, nil
}

func atoi(s string) int {
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			break
		}
		n = n*10 + int(ch-'0')
	}
	return n
}

// courtTarget resolves a courtship target: a dynasty character or a ruler.
func (c *Campaign) courtTargetLocked(d *dynastyState, targetID string) (name string, age int, sideID int, married bool, ok bool) {
	if ch, found := d.characters[targetID]; found {
		return ch.Name, ch.Age, ch.SideID, ch.SpouseID != "", true
	}
	// Rulers can be courted.
	for _, r := range c.state.Rulers {
		if fmt.Sprintf("ruler-%d", r.ID) == targetID {
			return r.Name, int(r.Age), r.SideID, false, true
		}
	}
	return "", 0, 0, false, false
}

// StartCourtship begins courting an unmarried character or ruler.
func (c *Campaign) StartCourtship(ctx context.Context, targetID string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	player := d.characters["char-player"]
	if player.SpouseID != "" {
		return nil, conflictf("You are already married.", "already married")
	}
	name, _, sideID, married, ok := c.courtTargetLocked(d, targetID)
	if !ok {
		return nil, notFoundf("courtship target %s not found", targetID)
	}
	if married {
		return nil, conflictf(fmt.Sprintf("%s is already married.", name), "target married")
	}
	for _, cs := range d.courtships {
		if cs.TargetID == targetID && cs.Stage == "courting" {
			return nil, conflictf(fmt.Sprintf("You are already courting %s.", name), "already courting")
		}
	}
	charm := player.Skills["charm"]
	approachRoll := math.Min(100, d.rng.Float64()*100*0.7+float64(charm)*0.3)
	relation := 0.0
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		relation = c.state.SideRelation(r.SideID, sideID)
	}
	score := relation*0.4 + approachRoll*0.6
	if score < 50 {
		return nil, unprocessablef(fmt.Sprintf("%s is not interested.", name), "rejected")
	}
	d.courtships = append(d.courtships, &Courtship{
		SuitorID: player.ID, TargetID: targetID, Stage: "courting",
		Affection: math.Round(score * 0.5), StartedDay: c.state.Tick,
	})
	return map[string]any{"line": fmt.Sprintf("%s accepts your courtship.", name)}, nil
}

// CourtAction performs a courting action toward the active target.
func (c *Campaign) CourtAction(ctx context.Context, action string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	var cs *Courtship
	for _, x := range d.courtships {
		if x.Stage == "courting" {
			cs = x
			break
		}
	}
	if cs == nil {
		return nil, unprocessablef("You are not courting anyone.", "no courtship")
	}
	gain := 0.0
	switch action {
	case "gift":
		gain = 4 + d.rng.Float64()*6
	case "visit":
		gain = 2 + d.rng.Float64()*4
	case "deed":
		gain = 6 + d.rng.Float64()*8
	case "poem":
		gain = 1 + d.rng.Float64()*7
		if d.rng.Float64() < 0.25 {
			gain = -gain
		}
	default:
		return nil, badRequestf("unknown court action %q", action)
	}
	cs.Affection = math.Max(0, math.Min(100, cs.Affection+math.Round(gain)))
	name, _, _, _, _ := c.courtTargetLocked(d, cs.TargetID)
	verb := map[string]string{"gift": "send a gift", "visit": "pay a visit", "deed": "perform a deed of valor", "poem": "recite a poem"}[action]
	return map[string]any{
		"affection": math.Round(cs.Affection),
		"line":      fmt.Sprintf("You %s for %s. Affection: %d.", verb, name, int(math.Round(cs.Affection))),
	}, nil
}

// ProposeMarriage proposes to the current courtship target.
func (c *Campaign) ProposeMarriage(ctx context.Context) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	var cs *Courtship
	for _, x := range d.courtships {
		if x.Stage == "courting" {
			cs = x
			break
		}
	}
	if cs == nil {
		return nil, unprocessablef("You are not courting anyone.", "no courtship")
	}
	name, _, _, _, _ := c.courtTargetLocked(d, cs.TargetID)
	bar := 70 + cs.Rejections*10
	if int(math.Round(cs.Affection)) >= bar {
		cs.Stage = "betrothed"
		// Marry when the target is a dynasty character.
		if ch, ok := d.characters[cs.TargetID]; ok {
			player := d.characters[cs.SuitorID]
			player.SpouseID = ch.ID
			ch.SpouseID = player.ID
		}
		return map[string]any{
			"accepted": true,
			"line":     fmt.Sprintf("%s says yes! You are betrothed.", name),
		}, nil
	}
	cs.Stage = "rejected"
	cs.Rejections++
	return map[string]any{
		"accepted": false,
		"line":     fmt.Sprintf("%s refuses the proposal. The courtship is over — for now.", name),
	}, nil
}

// ---------------------------------------------------------------------------
// Campaign methods: ransom brokers & troop prisoners
// ---------------------------------------------------------------------------

// DebugAddTroopPrisoners is a test hook: add captive troops.
func (c *Campaign) DebugAddTroopPrisoners(troopID, name string, count, tier int, conformity float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	d := c.ensureDynasty()
	if p, ok := d.troopPrison[troopID]; ok {
		p.Count += count
		if conformity > p.Conformity {
			p.Conformity = conformity
		}
		return
	}
	d.troopPrison[troopID] = &TroopPrisoner{TroopID: troopID, Name: name, Count: count, Tier: tier, Conformity: conformity}
}

// SellPrisonersToBroker sells troop prisoners to a town's broker at a discount.
func (c *Campaign) SellPrisonersToBroker(ctx context.Context, townID int, troopID string, count int) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	town := c.state.Towns[townID]
	if town == nil {
		return nil, notFoundf("town %d not found", townID)
	}
	p, ok := d.troopPrison[troopID]
	if !ok {
		return nil, notFoundf("no such prisoners held")
	}
	if count <= 0 || count > p.Count {
		return nil, unprocessablef(fmt.Sprintf("Cannot sell %d (have %d).", count, p.Count), "count")
	}
	ransomValue := float64(count * p.Tier * 30)
	gold := int(math.Floor(ransomValue * brokerRate(town.Prosperity)))
	p.Count -= count
	if p.Count == 0 {
		delete(d.troopPrison, troopID)
	}
	if m := c.playerPartyMoney(); m != nil {
		*m += float64(gold)
	}
	line := fmt.Sprintf("The broker in %s takes the %d %s for %d gold. No questions asked.", town.Name, count, p.Name, gold)
	return map[string]any{"gold": gold, "line": line}, nil
}

// ---------------------------------------------------------------------------
// Campaign methods: tavern dice
// ---------------------------------------------------------------------------

// PlayTavernDice stakes gold against the town's regulars: best of 3 rounds.
func (c *Campaign) PlayTavernDice(ctx context.Context, townID int, stake int) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	town := c.state.Towns[townID]
	if town == nil {
		return nil, notFoundf("town %d not found", townID)
	}
	if stake <= 0 {
		return nil, badRequestf("stake must be positive")
	}
	m := c.playerPartyMoney()
	if m == nil || *m < float64(stake) {
		return nil, unprocessablef("You don't have that much gold to stake.", "stake")
	}
	*m -= float64(stake)
	oppStake := int(npcStakeGo(town.Prosperity, d.rng))
	pot := stake + 2*oppStake
	// Best of 3 rounds, 2d6 each.
	playerTotal, oppTotal := 0, 0
	for r := 0; r < 3; r++ {
		playerTotal += 1 + d.rng.Intn(6) + 1 + d.rng.Intn(6)
		oppTotal += 1 + d.rng.Intn(6) + 1 + d.rng.Intn(6)
	}
	won := playerTotal > oppTotal
	payout := 0
	line := ""
	if won {
		payout = pot
		*m += float64(payout)
		line = fmt.Sprintf("You take the pot: %d gold.", payout)
	} else {
		line = "The regulars take the pot. Better luck next time."
	}
	return map[string]any{"won": won, "payout": payout, "line": line}, nil
}

func npcStakeGo(prosperity01 float64, r *rng.Rng) float64 {
	return math.Round((20 + prosperity01*80) * (0.5 + r.Float64()))
}

// ---------------------------------------------------------------------------
// Campaign methods: party templates
// ---------------------------------------------------------------------------

// SavePartyTemplate saves the current party composition as a template.
func (c *Campaign) SavePartyTemplate(ctx context.Context, name string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, badRequestf("template name is required")
	}
	d.seq++
	id := fmt.Sprintf("tpl-%d", d.seq)
	// The sim tracks troops abstractly; the template records the shape the
	// client reports. Without client detail, snapshot a single line.
	tpl := &PartyTemplate{ID: id, Name: name, SavedDay: c.state.Tick}
	d.templates[id] = tpl
	d.tplOrder = append(d.tplOrder, id)
	return map[string]any{"templateId": id, "summary": fmt.Sprintf("%s: saved.", name)}, nil
}

// GetPartyTemplates lists saved templates.
func (c *Campaign) GetPartyTemplates(ctx context.Context) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	out := make([]map[string]any, 0, len(d.tplOrder))
	for _, id := range d.tplOrder {
		t := d.templates[id]
		out = append(out, map[string]any{"id": t.ID, "name": t.Name, "summary": fmt.Sprintf("%s: %d lines.", t.Name, len(t.Entries))})
	}
	return out, nil
}

// RefitPartyToward compares the party against a template.
func (c *Campaign) RefitPartyToward(ctx context.Context, templateID string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	tpl, ok := d.templates[templateID]
	if !ok {
		return nil, notFoundf("template %s not found", templateID)
	}
	// The sim's troops are abstract (a single Troops float); report the
	// template's own lines as the refit plan.
	orders := make([]map[string]any, 0, len(tpl.Entries))
	for _, e := range tpl.Entries {
		orders = append(orders, map[string]any{
			"action": "recruit", "tier": e.Tier, "branch": e.Branch, "count": e.Count,
		})
	}
	return map[string]any{"orders": orders}, nil
}

// ---------------------------------------------------------------------------
// Campaign methods: siege engines
// ---------------------------------------------------------------------------

func (c *Campaign) engineParkLocked(d *dynastyState, siegeID int) *EnginePark {
	p, ok := d.engines[siegeID]
	if !ok {
		p = &EnginePark{}
		d.engines[siegeID] = p
	}
	return p
}

// QueueSiegeEngine queues an engine for construction at a siege.
func (c *Campaign) QueueSiegeEngine(ctx context.Context, siegeID int, typeID string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	if _, ok := c.state.Sieges[siegeID]; !ok {
		return nil, notFoundf("siege %d not found", siegeID)
	}
	et := findEngineType(typeID)
	if et == nil {
		return nil, badRequestf("unknown engine %q", typeID)
	}
	m := c.playerPartyMoney()
	if m == nil || *m < et.cost {
		return nil, unprocessablef(fmt.Sprintf("A %s costs %d gold.", et.name, int(et.cost)), "cost")
	}
	*m -= et.cost
	park := c.engineParkLocked(d, siegeID)
	park.Queue = append(park.Queue, EngineQueueItem{TypeID: typeID, DaysLeft: et.buildDays})
	return map[string]any{"cost": int(et.cost)}, nil
}

// MoveSiegeEngine moves an engine between reserve and deployed.
func (c *Campaign) MoveSiegeEngine(ctx context.Context, siegeID int, typeID, to string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	if _, ok := c.state.Sieges[siegeID]; !ok {
		return nil, notFoundf("siege %d not found", siegeID)
	}
	if to != "reserve" && to != "deployed" {
		return nil, badRequestf("destination must be reserve or deployed")
	}
	park := c.engineParkLocked(d, siegeID)
	var from *[]string
	var dst *[]string
	if to == "deployed" {
		from, dst = &park.Reserve, &park.Deployed
	} else {
		from, dst = &park.Deployed, &park.Reserve
	}
	i := -1
	for j, id := range *from {
		if id == typeID {
			i = j
			break
		}
	}
	if i < 0 {
		return nil, unprocessablef(fmt.Sprintf("No %s in %s.", typeID, map[string]string{"deployed": "reserve", "reserve": "deployed"}[to]), "missing")
	}
	*from = append((*from)[:i], (*from)[i+1:]...)
	*dst = append(*dst, typeID)
	return map[string]any{}, nil
}

// MakeFireVariant marks a reserve engine as a fire variant.
func (c *Campaign) MakeFireVariant(ctx context.Context, siegeID int, typeID string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	if _, ok := c.state.Sieges[siegeID]; !ok {
		return nil, notFoundf("siege %d not found", siegeID)
	}
	park := c.engineParkLocked(d, siegeID)
	found := false
	for _, id := range park.Reserve {
		if id == typeID {
			found = true
			break
		}
	}
	if !found {
		return nil, unprocessablef("Engine must be in reserve to convert.", "reserve")
	}
	for _, id := range park.FireVariants {
		if id == typeID {
			return map[string]any{}, nil
		}
	}
	park.FireVariants = append(park.FireVariants, typeID)
	return map[string]any{}, nil
}

// GetSiegeEngines returns the engine park for a siege.
func (c *Campaign) GetSiegeEngines(ctx context.Context, siegeID int) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	if _, ok := c.state.Sieges[siegeID]; !ok {
		return nil, notFoundf("siege %d not found", siegeID)
	}
	park := c.engineParkLocked(d, siegeID)
	if park.Queue == nil {
		park.Queue = []EngineQueueItem{}
	}
	if park.Reserve == nil {
		park.Reserve = []string{}
	}
	if park.Deployed == nil {
		park.Deployed = []string{}
	}
	if park.FireVariants == nil {
		park.FireVariants = []string{}
	}
	return park, nil
}

// tickSiegeEnginesLocked advances engine construction for a siege by one day.
// Called from the siege tick path when one exists; also runs lazily here.
func (c *Campaign) tickSiegeEnginesLocked(d *dynastyState, siegeID int) (completed, destroyed []string) {
	park := c.engineParkLocked(d, siegeID)
	kept := park.Queue[:0]
	for _, q := range park.Queue {
		q.DaysLeft--
		if q.DaysLeft <= 0 {
			park.Reserve = append(park.Reserve, q.TypeID)
			completed = append(completed, q.TypeID)
		} else {
			kept = append(kept, q)
		}
	}
	park.Queue = kept
	// Counter-battery.
	survivors := park.Deployed[:0]
	for _, id := range park.Deployed {
		et := findEngineType(id)
		risk := 0.1
		if et != nil {
			risk = et.counterBatteryRisk
		}
		if d.rng.Float64() < risk {
			destroyed = append(destroyed, id)
			nf := park.FireVariants[:0]
			for _, f := range park.FireVariants {
				if f != id {
					nf = append(nf, f)
				}
			}
			park.FireVariants = nf
		} else {
			survivors = append(survivors, id)
		}
	}
	park.Deployed = survivors
	return completed, destroyed
}

// ---------------------------------------------------------------------------
// Campaign methods: smithing stamina & influence
// ---------------------------------------------------------------------------

// GetSmithingStamina returns remaining/max smithing stamina.
func (c *Campaign) GetSmithingStamina(ctx context.Context) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	max := maxStamina(c.playerCrafting())
	return map[string]any{"stamina": int(d.smithingStamina), "max": int(max)}, nil
}

// SpendSmithingStamina spends stamina for a smithing action. Test/game hook.
func (c *Campaign) SpendSmithingStamina(ctx context.Context, cost float64) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	d := c.ensureDynasty()
	if d.smithingStamina < cost {
		return nil, unprocessablef("The smith is exhausted. Rest until dawn.", "exhausted")
	}
	d.smithingStamina -= cost
	return map[string]any{"stamina": int(d.smithingStamina)}, nil
}

// awardInfluenceLocked awards influence for a deed. Caller holds c.mu.
func (c *Campaign) awardInfluenceLocked(source string) {
	g, ok := influenceGains[source]
	if !ok {
		return
	}
	d := c.ensureDynasty()
	renown := float64(c.playerRenown())
	base := g[0] + d.rng.Float64()*(g[1]-g[0])
	mult := 1 + math.Min(100, math.Max(0, renown))/200
	if inf := c.playerRulerInfluence(); inf != nil {
		*inf += math.Round(base * mult)
	}
}

// SpendInfluence spends influence on a realm action.
func (c *Campaign) SpendInfluence(ctx context.Context, action string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tickDynastyLocked()
	cost, ok := influenceCosts[action]
	if !ok {
		return nil, badRequestf("unknown influence action %q", action)
	}
	inf := c.playerRulerInfluence()
	if inf == nil || *inf < cost {
		have := 0.0
		if inf != nil {
			have = *inf
		}
		return nil, unprocessablef(fmt.Sprintf("Needs %d influence (have %d).", int(cost), int(have)), "influence")
	}
	*inf -= cost
	lines := map[string]string{
		"muster-army":    "The banners answer. An army musters under your command.",
		"call-vote":      "The council convenes at your word.",
		"bribe-lord":     "Gold and promises change a lord's mind.",
		"recruit-vassal": "A lord kneels and swears to your cause.",
		"force-policy":   "The policy passes — none dare gainsay the vote.",
	}
	return map[string]any{"line": lines[action]}, nil
}

// GetInfluence returns the player ruler's influence.
func (c *Campaign) GetInfluence(ctx context.Context) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	inf := c.playerRulerInfluence()
	if inf == nil {
		return 0, nil
	}
	return int(*inf), nil
}

// AwardInfluence is a hook for battle/quest/siege victories.
func (c *Campaign) AwardInfluence(ctx context.Context, source string) (any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.awardInfluenceLocked(source)
	return map[string]any{}, nil
}

// sortedKeys returns sorted map keys for deterministic iteration.
func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
