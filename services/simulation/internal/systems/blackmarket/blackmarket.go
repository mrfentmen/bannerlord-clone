// Package blackmarket handles illegal trade.
//
// Builds on business (fronts), police (heat), and crafting (goods).
// Sell contraband, buy illegal weapons, fence stolen goods.
package blackmarket

import (
	"mbclone/simulation/internal/systems/business"
	"mbclone/simulation/internal/systems/crafting"
	"mbclone/simulation/internal/systems/police"
)

// Listing is an illegal good for sale.
type Listing struct {
	Item      string
	Price     float64
	SellerID  int
	Illegal   bool
	HeatRisk  float64
}

// Markup returns the black market premium over legal price.
func Markup() float64 {
	return 2.5 // 150% markup for illegal goods
}

// HeatForPurchase returns police heat from buying.
func HeatForPurchase(item string) float64 {
	switch item {
	case "drugs", "stolen_goods":
		return police.CrimeHeat("smuggling")
	case "illegal_weapons":
		return police.CrimeHeat("robbery")
	default:
		return police.CrimeHeat("vandalism")
	}
}

// CanOperate checks if a business can run a black market.
// Needs a warehouse or garage as cover.
func CanOperate(b *business.Business) bool {
	return b.Type == business.BusinessWarehouse ||
		b.Type == business.BusinessGarage
}

// FenceValue returns what stolen goods sell for.
// Typically 30-50% of retail.
func FenceValue(retailPrice float64) float64 {
	return retailPrice * 0.4
}

// CraftIllegal checks if a recipe can make black market goods.
func CraftIllegal(r crafting.Recipe) bool {
	// Gunsmith recipes can make illegal weapons.
	for _, gr := range crafting.GunsmithRecipes {
		if gr.ID == r.ID {
			return true
		}
	}
	return false
}
