package api

import (
	"net/http"
	"strconv"

	"mbclone/simulation/internal/systems/bandit"
)

// GET /v1/bandits — list active bandit parties
func (s *Server) listBandits(w http.ResponseWriter, r *http.Request) {
	list := s.camp.ListBandits()
	s.writeJSON(w, http.StatusOK, list)
}

// GET /v1/bandits/camps — list discovered camps
func (s *Server) listBanditCamps(w http.ResponseWriter, r *http.Request) {
	list := bandit.ListDiscoveredCamps()
	s.writeJSON(w, http.StatusOK, list)
}

// GET /v1/bounties — list available bounties
func (s *Server) listBounties(w http.ResponseWriter, r *http.Request) {
	list := bandit.ListBounties()
	s.writeJSON(w, http.StatusOK, list)
}

// POST /v1/bounties/{id}/claim — claim bounty after destroying the party
func (s *Server) claimBounty(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid bounty id", http.StatusBadRequest)
		return
	}
	reward, ok := s.camp.ClaimBounty(id)
	if !ok {
		http.Error(w, "bounty not claimable (already claimed or target still alive)", http.StatusConflict)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"claimed": true,
		"reward":  reward,
	})
}
