package api

import (
	"net/http"

	"mbclone/simulation/cmd/apiserver/wire"
)

// GET /v1/diplomacy — the diplomacy board: every faction, what it thinks of the
// player, whether the two are at war, allied, or neither, and what a tribute to
// that faction would cost.
func (s *Server) getDiplomacy(w http.ResponseWriter, r *http.Request) {
	state, err := s.camp.Diplomacy(r.Context())
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, state)
}

// POST /v1/diplomacy/war — declare war on another faction.
func (s *Server) postDeclareWar(w http.ResponseWriter, r *http.Request) {
	var req wire.DiplomacyRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.DeclareWar(r.Context(), req)
	})
}

// POST /v1/diplomacy/peace — sue for peace with another faction.
func (s *Server) postMakePeace(w http.ResponseWriter, r *http.Request) {
	var req wire.DiplomacyRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.MakePeace(r.Context(), req)
	})
}

// POST /v1/diplomacy/tribute — pay another faction for goodwill, and to buy out a
// declared war when diplomacy.tribute_ends_war is set.
//
// Amount is optional: an absent or zero amount means the server's own demand,
// which is the figure the board already showed. Letting the client name the price
// would let it name a tribute the server never intended to accept.
func (s *Server) postPayTribute(w http.ResponseWriter, r *http.Request) {
	var req wire.DiplomacyRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.PayTribute(r.Context(), req)
	})
}

// POST /v1/diplomacy/alliance — swear to another faction.
func (s *Server) postFormAlliance(w http.ResponseWriter, r *http.Request) {
	var req wire.DiplomacyRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.FormAlliance(r.Context(), req)
	})
}
