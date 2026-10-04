package api

// Dynasty, courtship, enterprise, and influence routes: the server side of
// the client's unserved.ts table. Each handler is thin: parse, delegate to
// the campaign, return.

import (
	"net/http"
	"strconv"

	"mbclone/simulation/cmd/apiserver/campaign"
)

// townIntID resolves a client town reference ("42", "town-42") to an int.
func townIntID(w http.ResponseWriter, s *Server, r *http.Request) (int, bool) {
	idStr := r.PathValue("id")
	if n, err := strconv.Atoi(idStr); err == nil {
		return n, true
	}
	if n, ok := parseTrailingInt(idStr); ok {
		return n, true
	}
	s.writeFault(w, &campaign.Fault{Code: campaign.CodeBadRequest, Message: "invalid town id", Reason: "Bad town id."})
	return 0, false
}

// siegeIntID resolves a client siege reference to an int.
func siegeIntID(w http.ResponseWriter, s *Server, r *http.Request) (int, bool) {
	idStr := r.PathValue("id")
	if n, err := strconv.Atoi(idStr); err == nil {
		return n, true
	}
	if n, ok := parseTrailingInt(idStr); ok {
		return n, true
	}
	s.writeFault(w, &campaign.Fault{Code: campaign.CodeBadRequest, Message: "invalid siege id", Reason: "Bad siege id."})
	return 0, false
}

func (s *Server) postDynastyMarry(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CharID1 string `json:"charId1"`
		CharID2 string `json:"charId2"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.Marry(r.Context(), body.CharID1, body.CharID2) })
}

func (s *Server) postDynastyChild(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ParentID1 string `json:"parentId1"`
		ParentID2 string `json:"parentId2"`
		ChildName string `json:"childName"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.HaveChild(r.Context(), body.ParentID1, body.ParentID2, body.ChildName)
	})
}

func (s *Server) postDynastyKill(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Cause string `json:"cause"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.KillCharacter(r.Context(), id, body.Cause) })
}

func (s *Server) getDynastyHeir(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.order(w, r, func() (any, error) { return s.camp.GetHeir(r.Context(), id) })
}

func (s *Server) getHeldLords(w http.ResponseWriter, r *http.Request) {
	s.order(w, r, func() (any, error) { return s.camp.GetHeldLords(r.Context()) })
}

func (s *Server) postRansomHeldLord(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	s.order(w, r, func() (any, error) { return s.camp.RansomHeldLord(r.Context(), name) })
}

func (s *Server) postReleaseHeldLord(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	s.order(w, r, func() (any, error) { return s.camp.ReleaseHeldLord(r.Context(), name) })
}

func (s *Server) postExecuteHeldLord(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	s.order(w, r, func() (any, error) { return s.camp.ExecuteHeldLord(r.Context(), name) })
}

func (s *Server) getClanTier(w http.ResponseWriter, r *http.Request) {
	s.order(w, r, func() (any, error) { return s.camp.GetClanTier(r.Context()) })
}

func (s *Server) postFoundKingdom(w http.ResponseWriter, r *http.Request) {
	var body struct {
		KingdomName string `json:"kingdomName"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.FoundKingdom(r.Context(), body.KingdomName) })
}

func (s *Server) getCourtships(w http.ResponseWriter, r *http.Request) {
	s.order(w, r, func() (any, error) { return s.camp.GetCourtships(r.Context()) })
}

func (s *Server) postCourtshipStart(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TargetID string `json:"targetId"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.StartCourtship(r.Context(), body.TargetID) })
}

func (s *Server) postCourtshipAction(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action string `json:"action"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.CourtAction(r.Context(), body.Action) })
}

func (s *Server) postCourtshipPropose(w http.ResponseWriter, r *http.Request) {
	s.order(w, r, func() (any, error) { return s.camp.ProposeMarriage(r.Context()) })
}

func (s *Server) postBrokerSell(w http.ResponseWriter, r *http.Request) {
	townID, ok := townIntID(w, s, r)
	if !ok {
		return
	}
	var body struct {
		TroopID string `json:"troopId"`
		Count   int    `json:"count"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.SellPrisonersToBroker(r.Context(), townID, body.TroopID, body.Count)
	})
}

func (s *Server) postTavernDice(w http.ResponseWriter, r *http.Request) {
	townID, ok := townIntID(w, s, r)
	if !ok {
		return
	}
	var body struct {
		Stake int `json:"stake"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.PlayTavernDice(r.Context(), townID, body.Stake) })
}

func (s *Server) getPartyTemplates(w http.ResponseWriter, r *http.Request) {
	s.order(w, r, func() (any, error) { return s.camp.GetPartyTemplates(r.Context()) })
}

func (s *Server) postPartyTemplate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.SavePartyTemplate(r.Context(), body.Name) })
}

func (s *Server) postPartyRefit(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.order(w, r, func() (any, error) { return s.camp.RefitPartyToward(r.Context(), id) })
}

func (s *Server) getSiegeEngines(w http.ResponseWriter, r *http.Request) {
	siegeID, ok := siegeIntID(w, s, r)
	if !ok {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.GetSiegeEngines(r.Context(), siegeID) })
}

func (s *Server) postSiegeEngineQueue(w http.ResponseWriter, r *http.Request) {
	siegeID, ok := siegeIntID(w, s, r)
	if !ok {
		return
	}
	var body struct {
		TypeID string `json:"typeId"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.QueueSiegeEngine(r.Context(), siegeID, body.TypeID) })
}

func (s *Server) postSiegeEngineMove(w http.ResponseWriter, r *http.Request) {
	siegeID, ok := siegeIntID(w, s, r)
	if !ok {
		return
	}
	var body struct {
		TypeID string `json:"typeId"`
		To     string `json:"to"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.MoveSiegeEngine(r.Context(), siegeID, body.TypeID, body.To) })
}

func (s *Server) postSiegeEngineFire(w http.ResponseWriter, r *http.Request) {
	siegeID, ok := siegeIntID(w, s, r)
	if !ok {
		return
	}
	var body struct {
		TypeID string `json:"typeId"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.MakeFireVariant(r.Context(), siegeID, body.TypeID) })
}

func (s *Server) getSmithingStamina(w http.ResponseWriter, r *http.Request) {
	s.order(w, r, func() (any, error) { return s.camp.GetSmithingStamina(r.Context()) })
}

func (s *Server) getInfluence(w http.ResponseWriter, r *http.Request) {
	s.order(w, r, func() (any, error) { return s.camp.GetInfluence(r.Context()) })
}

func (s *Server) postSpendInfluence(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action string `json:"action"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.SpendInfluence(r.Context(), body.Action) })
}
