// Package tournament models arena competitions (Tier 5.4).
//
// In Bannerlord, tournaments are the primary early-game XP sink: brackets
// of fighters compete with random gear, spectators bet, winners gain
// renown and prizes.
//
// Modern American equivalent: fighting tournaments, shooting competitions,
// or underground fight clubs. Winners gain reputation and prize money.
//
// Mechanics:
//   - Towns periodically host tournaments (based on prosperity).
//   - Leaders/parties in the town may enter.
//   - Winner determined by combat skill (randomized).
//   - Winner gains renown and prize money.
//   - Spectators (town) gain a small prosperity boost (tourism).
//
// This is a simplified background system; the full bracket UI would be
// in the client.
package tournament

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// tournamentChancePerDay is the daily probability a town hosts a tournament.
	tournamentChancePerDay = 0.02
	// minProsperityForTournament is the prosperity needed to host.
	minProsperityForTournament = 0.5
	// renownPrize is the renown gained by the winner.
	renownPrize = 10.0
	// moneyPrize is the prize money for the winner.
	moneyPrize = 500.0
)

// System returns the tournament system.
func System() sim.System {
	return sim.System{
		Name: "tournament",
		Doc:  "towns host tournaments; winners gain renown and prizes",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	xpPrize := 25.0
	if c != nil {
		xpPrize = c.RulerAI.TournamentWinnerXP
	}
	rng := v.Rng.Derive("tournament")
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || t.Prosperity < minProsperityForTournament {
			continue
		}
		if !rng.Chance(tournamentChancePerDay) {
			continue
		}

		// Find eligible leaders in this town.
		var entrants []int
		for _, lid := range v.State.LeaderIDsSorted() {
			l := v.State.Leaders[lid]
			if l != nil && l.TownID == tid && l.IsAlive {
				entrants = append(entrants, lid)
			}
		}
		if len(entrants) < 2 {
			continue
		}

		// Pick a winner (weighted by combat skill, simplified to random).
		winnerID := entrants[rng.Intn(len(entrants))]
		winner := v.State.Leaders[winnerID]

		read := shared.ReadString(
			shared.Pair("town", float64(tid)),
			shared.Pair("entrants", float64(len(entrants))),
			shared.Pair("winner", float64(winnerID)),
		)
		causes := v.Log.RecentFor(model.KindTown, tid,
			[]string{"prosperity"}, 3)

		// Winner gains renown.
		w.Add(model.KindLeader, winnerID, "renown", renownPrize,
			read, causes, "tournament victory")

		// Winner's party gains combat XP (tournaments are training).
		// Find the winner's party and award XP.
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p != nil && p.LeaderID == winnerID {
				w.Add(model.KindParty, pid, "troop_xp", xpPrize,
					read, causes, "tournament combat experience")
				break
			}
		}

		// Winner gains prize money (from town treasury).
		if t.Money >= moneyPrize {
			w.Add(model.KindTown, tid, "money", -moneyPrize,
				read, causes, "tournament prize")
			// Note: Leader.money not registered, so prize is abstract.
			// The renown is the primary reward.
			_ = winner
		}

		// Town gains a small prosperity boost (tourism, excitement).
		w.Add(model.KindTown, tid, "prosperity", 0.02,
			read, causes, "tournament tourism")
	}
}
