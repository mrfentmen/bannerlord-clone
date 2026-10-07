package wire

// The quest shapes, transcribed from `Quest`, `QuestObjective` and the accept /
// abandon / complete results in `clients/campaign/src/data/types.ts`.
//
// A quest is the one thing this server invented rather than derived, so the
// discipline that matters here is the opposite of the rest of the package's: a
// field that looks like a constant must not be one. Targets come from the
// [quest] balance section and rewards are computed from them, so a quest's price
// cannot drift away from the job it describes.

// Quest status values. The client's Quest.status is
// "active" | "completed" | "failed", and this server adds one state it does not
// put in that field: an offer that has not been taken.
const (
	// QuestOffered is a quest in the journal that has not been accepted. It has
	// no day and no progress, and its id is its template's, because there is
	// exactly one offer per template at a time.
	QuestOffered = "offered"
	// QuestActive is an accepted quest with progress against it.
	QuestActive = "active"
	// QuestCompleted is a quest whose objectives were met and whose reward was
	// paid.
	QuestCompleted = "completed"
	// QuestFailed is a quest that ran out of time or was abandoned.
	QuestFailed = "failed"
)

// The objective kinds, spelled as the client's union. The client knows four and
// this server writes six; the two it did not have are trade_gold and
// visit_towns, and the union was widened to match.
const (
	// ObjectiveDeliverGoods asks for a quantity of one good landed in one
	// town's market.
	ObjectiveDeliverGoods = "deliver_goods"
	// ObjectiveKillBandits asks for raider parties broken.
	ObjectiveKillBandits = "kill_bandits"
	// ObjectiveRecruitTroops asks for soldiers taken into the party.
	ObjectiveRecruitTroops = "recruit_troops"
	// ObjectiveWinBattles asks for battles won. The fixture provider offers it
	// and this server's five starter templates do not, because the encounter
	// system reports a win rather than the server learning of it.
	ObjectiveWinBattles = "win_battles"
	// ObjectiveTradeGold asks for money moved through the market, counted from
	// the player's own completed trades rather than from their balance, so
	// spending what they were given cannot pass for earning it.
	ObjectiveTradeGold = "trade_gold"
	// ObjectiveVisitTowns asks for distinct towns stood in.
	ObjectiveVisitTowns = "visit_towns"
)

// QuestObjective is one thing a quest asks for.
//
// Progress is the server's count against Target, and it is clamped to Target: a
// player who kills nine bandits for a quest asking six has met the objective,
// and the journal should not invite them to keep going for no further reward.
type QuestObjective struct {
	Kind     string `json:"kind"`
	Target   int    `json:"target"`
	Progress int    `json:"progress"`
	// GoodID is set for deliver_goods: which good.
	GoodID string `json:"goodId,omitempty"`
	// TownID is set for deliver_goods: the settlement's id, in the shared slug
	// form, so the client can match it against its own settlement list.
	TownID string `json:"townId,omitempty"`
	// TownName is the settlement's real name. The client's town list is
	// OSM-derived and this server's names are generated, so the name is what
	// tells a player where to go.
	TownName string `json:"townName,omitempty"`
	// Text is the objective as a sentence, composed from the real numbers so a
	// journal row reads "Land 40 grain in Ridgefield" rather than
	// "deliver_goods: 40".
	Text string `json:"text"`
	// Done is Progress >= Target. Carried on the wire so the client does not
	// have to compare two numbers to draw a tick.
	Done bool `json:"done"`
}

// Quest is one entry in the journal: an offer, a job in hand, or a finished
// job.
//
// GiverID and GiverName are both carried because a notable is a ruler in the
// simulation and the client's character ids are the client's own. GiverID is
// the ruler's wire id, which the client can hand back to
// POST /v1/notables/talk; GiverName is what the journal prints.
type Quest struct {
	ID           string           `json:"id"`
	TemplateID   string           `json:"templateId"`
	Title        string           `json:"title"`
	Description  string           `json:"description"`
	GiverID      string           `json:"giverId"`
	GiverName    string           `json:"giverName"`
	Objectives   []QuestObjective `json:"objectives"`
	RewardMoney  float64          `json:"rewardMoney"`
	RewardRenown float64          `json:"rewardRenown"`
	// Reward is the reward as a sentence, for a journal row that prints one
	// line rather than two numbers.
	Reward string `json:"reward"`
	// DeadlineDay is the tick by which the quest fails, or nil for no deadline.
	// A Go pointer because the client types it `number | null` and a missing
	// field would not be the null it expects.
	DeadlineDay *int `json:"deadlineDay"`
	// DaysLeft is the deadline as a count rather than an absolute day, so the
	// journal does not have to hold the current day to draw "12d left".
	DaysLeft *int `json:"daysLeft"`
	// AcceptedDay is 0 for an offer, which has not been accepted.
	AcceptedDay int    `json:"acceptedDay"`
	Status      string `json:"status"`
}

// QuestListResult answers GET /v1/quests.
//
// Available and Active are separate because the client asks two different
// questions: what could I take on, and what am I already carrying. One list
// would force it to filter, and a filter that forgets an offer looks like the
// world having nothing for you.
type QuestListResult struct {
	Available []Quest `json:"available"`
	Active    []Quest `json:"active"`
	// Settled is completed and failed quests, most recent first, so the journal
	// has history rather than an empty tab.
	Settled []Quest `json:"settled"`
	// MaxActive is how many may run at once, so the client can grey out an
	// accept button itself instead of finding out by being refused.
	MaxActive int `json:"maxActive"`
}

// AcceptQuestRequest is POST /v1/quests.
//
// The client names a template and a giver; this server's own route
// POST /v1/quests/{id}/accept names the template in the path and takes an empty
// body. Both are the same order, because a caller that has the template id in
// the path should not have to repeat it in a body it has no other use for.
type AcceptQuestRequest struct {
	GiverID   string `json:"giverId,omitempty"`
	GiverName string `json:"giverName,omitempty"`
	// TemplateID is ignored when the id is in the path.
	TemplateID string `json:"templateId"`
}

// AcceptQuestResult answers both accept routes. QuestID is the accepted quest's
// own id, which for an offer is not the template id it was offered under.
type AcceptQuestResult struct {
	QuestID string `json:"questId"`
	Quest   Quest  `json:"quest"`
	// Summary is the sentence the client's toast shows.
	Summary string `json:"summary"`
}

// CompleteQuestResult answers POST /v1/quests/{id}/complete.
type CompleteQuestResult struct {
	Quest Quest `json:"quest"`
	// PaidMoney and PaidRenown are what the reward actually transferred, read
	// after the commit rather than predicted, because the engine clamps and a
	// prediction near the limit would be wrong.
	PaidMoney  float64 `json:"paidMoney"`
	PaidRenown float64 `json:"paidRenown"`
	// Accepted is false when the objectives were not met. It is a 200 with
	// accepted false rather than a 409, because "you have not done it yet" is
	// an answer and not a failure, which is what the order routes already do.
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
	Summary  string `json:"summary"`
}

// AbandonQuestResult answers POST /v1/quests/{id}/abandon.
type AbandonQuestResult struct {
	Quest   Quest  `json:"quest"`
	Summary string `json:"summary"`
}
