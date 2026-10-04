// Package quest provides sim-side quest templates for the jobs board.
//
// Quests are generated from templates, not hand-authored. Each template
// defines a quest type with requirements, rewards, and completion criteria.
// The client jobs board calls the API hooks to list available quests and
// accept them.
package quest

// QuestType identifies the kind of quest.
type QuestType string

const (
	// QuestDeliverGoods: transport goods between towns.
	QuestDeliverGoods QuestType = "deliver_goods"
	// QuestClearBandits: eliminate a bandit party.
	QuestClearBandits QuestType = "clear_bandits"
	// QuestEscort: escort a caravan/truck between towns.
	QuestEscort QuestType = "escort"
	// QuestBounty: capture or eliminate a specific target.
	QuestBounty QuestType = "bounty"
	// QuestRecruit: recruit troops for a notable.
	QuestRecruit QuestType = "recruit"
)

// Template defines a quest template.
type Template struct {
	Type        QuestType
	Name        string
	Description string
	// MinRenown is the minimum renown required to accept.
	MinRenown float64
	// RewardMoney is the base money reward.
	RewardMoney float64
	// RewardRenown is the renown gained on completion.
	RewardRenown float64
	// RewardInfluence is the influence gained with the giver.
	RewardInfluence float64
}

// Templates is the list of available quest templates.
var Templates = []Template{
	{
		Type:            QuestDeliverGoods,
		Name:            "Deliver Goods",
		Description:     "Transport goods to a nearby town.",
		MinRenown:       0,
		RewardMoney:     500,
		RewardRenown:    5,
		RewardInfluence: 10,
	},
	{
		Type:            QuestClearBandits,
		Name:            "Clear Bandits",
		Description:     "Eliminate bandits troubling the area.",
		MinRenown:       10,
		RewardMoney:     1000,
		RewardRenown:    15,
		RewardInfluence: 20,
	},
	{
		Type:            QuestEscort,
		Name:            "Escort Convoy",
		Description:     "Escort a truck convoy between cities.",
		MinRenown:       20,
		RewardMoney:     1500,
		RewardRenown:    20,
		RewardInfluence: 25,
	},
	{
		Type:            QuestBounty,
		Name:            "Bounty Hunt",
		Description:     "Track down a wanted criminal.",
		MinRenown:       50,
		RewardMoney:     3000,
		RewardRenown:    40,
		RewardInfluence: 30,
	},
	{
		Type:            QuestRecruit,
		Name:            "Recruit Troops",
		Description:     "Recruit soldiers for a notable's cause.",
		MinRenown:       30,
		RewardMoney:     800,
		RewardRenown:    25,
		RewardInfluence: 35,
	},
}

// TemplateByType returns the template for a quest type.
func TemplateByType(t QuestType) *Template {
	for i := range Templates {
		if Templates[i].Type == t {
			return &Templates[i]
		}
	}
	return nil
}

// AvailableFor returns templates the player can accept based on renown.
func AvailableFor(renown float64) []Template {
	var out []Template
	for _, tmpl := range Templates {
		if renown >= tmpl.MinRenown {
			out = append(out, tmpl)
		}
	}
	return out
}
