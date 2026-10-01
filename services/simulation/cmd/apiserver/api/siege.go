package api

import (
	"net/http"

	"mbclone/simulation/cmd/apiserver/wire"
)

// -- sieges ----------------------------------------------------------------

func (s *Server) postSiege(w http.ResponseWriter, r *http.Request) {
	var req wire.SiegeRequest
	if !s.decode(w, r, &req) {
		return
	}
	out, err := s.camp.StartSiege(r.Context(), req.AttackerPartyID, req.TownID)
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, out)
}

func (s *Server) getSiege(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	out, err := s.camp.GetSiege(r.Context(), id)
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) listSieges(w http.ResponseWriter, r *http.Request) {
	out, err := s.camp.ListSieges(r.Context())
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) postSiegeAssault(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	out, err := s.camp.AssaultSiege(r.Context(), id)
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) postSiegeLift(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	out, err := s.camp.LiftSiege(r.Context(), id)
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}
