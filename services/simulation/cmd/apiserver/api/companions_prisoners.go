package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"mbclone/simulation/cmd/apiserver/campaign"
)

func (s *Server) getTavernCompanions(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	townID, err := strconv.Atoi(idStr)
	if err != nil {
		if n, ok := parseTrailingInt(idStr); ok {
			townID = n
		} else {
			s.writeFault(w, &campaign.Fault{Code: campaign.CodeBadRequest, Message: "invalid town id", Reason: "Bad town id."})
			return
		}
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.TavernCompanions(ctx, townID) })
}

func (s *Server) postHireCompanion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.HireCompanion(ctx, id) })
}

func (s *Server) listCompanions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.ListHiredCompanions(ctx) })
}

func (s *Server) postCompanionRole(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Role string `json:"role"`
	}
	if !s.decode(w, r, &body) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) {
		return s.camp.AssignCompanionRole(ctx, id, campaign.CompanionRole(body.Role))
	})
}

func (s *Server) listPrisoners(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.ListPrisoners(ctx) })
}

func (s *Server) postPrisonerRansom(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.RansomPrisoner(ctx, id) })
}

func (s *Server) postPrisonerRecruit(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.RecruitPrisoner(ctx, id) })
}

func (s *Server) postPrisonerRelease(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.ReleasePrisoner(ctx, id) })
}

func (s *Server) postPrisonerExecute(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.ExecutePrisoner(ctx, id) })
}

func parseTrailingInt(s string) (int, bool) {
	i := len(s) - 1
	for i >= 0 && s[i] >= '0' && s[i] <= '9' {
		i--
	}
	if i == len(s)-1 {
		return 0, false
	}
	n, err := strconv.Atoi(s[i+1:])
	if err != nil {
		return 0, false
	}
	return n, true
}

var _ = json.Marshal
