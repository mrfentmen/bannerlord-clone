package api

import (
	"net/http"
	"strings"

	"mbclone/simulation/cmd/apiserver/campaign"
)

// GET /v1/quests — the player's quest board.
//
// A plain read with no body and no order, so it does not go through s.order:
// there is nothing to submit and nothing that can fail in a way the player caused.
func (s *Server) listQuests(w http.ResponseWriter, r *http.Request) {
	list, err := s.camp.Quests(r.Context())
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, list)
}

// POST /v1/quests/{id}/accept — take a quest from the board.
func (s *Server) acceptQuest(w http.ResponseWriter, r *http.Request) {
	id, ok := s.requireQuestID(w, r)
	if !ok {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.AcceptQuest(r.Context(), id)
	})
}

// POST /v1/quests/{id}/complete — hand a finished quest in and collect the reward.
//
// The reward is paid on the tick this returns from, so the request blocks until
// that tick commits. The client's request timeout is the bound, exactly as for a
// trade: the reply cannot report money that has not moved yet.
func (s *Server) completeQuest(w http.ResponseWriter, r *http.Request) {
	id, ok := s.requireQuestID(w, r)
	if !ok {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.CompleteQuest(r.Context(), id)
	})
}

// requireQuestID reads the quest id out of the route and refuses an empty one.
//
// A client that posts to /v1/quests//accept is refused with a bad request naming
// the problem, rather than a 404 about a quest whose id is the empty string. The
// two failures are different: the first is a malformed request the client can fix,
// and the second is a quest that does not exist.
func (s *Server) requireQuestID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "quest id is required",
			Reason:  "The request did not say which quest.",
		})
		return "", false
	}
	return id, true
}
