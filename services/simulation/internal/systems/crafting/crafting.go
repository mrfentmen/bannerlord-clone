// Package crafting handles the chop shop and gunsmithing.
//
// Players can break down vehicles/weapons for parts, or craft
// new ones from scrap. This is the modern equivalent of Bannerlord's
// smithing system.
package crafting

// Recipe is a crafting recipe.
type Recipe struct {
	ID          string
	Name        string
	InputMetal  float64
	InputParts  float64
	OutputItem  string
	OutputQty   float64
	TimeDays    float64
	SkillNeeded int // Engineering skill required
}

// Recipes available in the chop shop.
var ChopShopRecipes = []Recipe{
	{
		ID:         "strip-car",
		Name:       "Strip Car",
		InputMetal: 0,
		InputParts: 0,
		OutputItem: "scrap_metal",
		OutputQty:  50,
		TimeDays:   1,
	},
	{
		ID:          "build-buggy",
		Name:        "Build Buggy",
		InputMetal:  100,
		InputParts:  20,
		OutputItem:  "buggy",
		OutputQty:   1,
		TimeDays:    3,
		SkillNeeded: 3,
	},
}

// Recipes available at the gunsmith.
var GunsmithRecipes = []Recipe{
	{
		ID:          "craft-rifle",
		Name:        "Craft Rifle",
		InputMetal:  20,
		InputParts:  10,
		OutputItem:  "rifle",
		OutputQty:   1,
		TimeDays:    2,
		SkillNeeded: 2,
	},
	{
		ID:          "craft-ammo",
		Name:        "Craft Ammo",
		InputMetal:  5,
		InputParts:  2,
		OutputItem:  "ammo",
		OutputQty:   50,
		TimeDays:    1,
		SkillNeeded: 1,
	},
}

// CanCraft checks if a party can craft a recipe.
func CanCraft(metal, parts float64, engineeringSkill int, r Recipe) bool {
	return metal >= r.InputMetal &&
		parts >= r.InputParts &&
		engineeringSkill >= r.SkillNeeded
}
