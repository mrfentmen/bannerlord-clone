package api

import (
	"fmt"
	"net/http"

	"mbclone/simulation/cmd/apiserver/campaign"
	"mbclone/simulation/cmd/apiserver/wire"
)

// Battle-session lifecycle handlers.
//
// An encounter is the campaign-level event (two forces meet). It can be
// auto-resolved or escalated into a real-time battle session where the
// player issues orders. The battle sim itself lives in the campaign
// package; these handlers are the HTTP boundary.

// -- encounters ------------------------------------------------------------

func (s *Server) postEncounter(w http.ResponseWriter, r *http.Request) {
	var req wire.EncounterRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.CreateEncounter(r.Context(), req.AttackerPartyID, req.DefenderPartyID)
	})
}

func (s *Server) getEncounter(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the encounter id is required",
			Reason:  "No encounter was named.",
		})
		return
	}
	enc, err := s.camp.GetEncounter(r.Context(), id)
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, enc)
}

// listEncounters returns encounters, optionally filtered by party ID.
// The client polls this to discover auto-triggered encounters.
func (s *Server) listEncounters(w http.ResponseWriter, r *http.Request) {
	partyIDStr := r.URL.Query().Get("partyId")
	if partyIDStr == "" {
		// No filter: return empty list for now. Listing all encounters
		// across the whole world is not yet supported.
		s.writeJSON(w, http.StatusOK, []any{})
		return
	}
	var partyID int
	if _, err := fmt.Sscanf(partyIDStr, "%d", &partyID); err != nil {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "partyId must be an integer",
			Reason:  "The party ID was not a number.",
		})
		return
	}
	encs := s.camp.ListEncountersForParty(r.Context(), partyID)
	s.writeJSON(w, http.StatusOK, encs)
}

func (s *Server) postEncounterResolve(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the encounter id is required",
			Reason:  "No encounter was named.",
		})
		return
	}
	var req wire.ResolveRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.ResolveEncounter(r.Context(), id)
	})
}

// postEncounterFlee breaks off an encounter without fighting it.
func (s *Server) postEncounterFlee(w http.ResponseWriter, r *http.Request) {
	var req wire.FleeRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.FleeFromEncounter(r.Context(), req)
	})
}

// postEncounterDefeat records the consequences of losing an encounter.
func (s *Server) postEncounterDefeat(w http.ResponseWriter, r *http.Request) {
	var req wire.PlayerDefeatRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.ApplyPlayerDefeat(r.Context(), req)
	})
}

// -- battles ----------------------------------------------------------------

func (s *Server) postBattle(w http.ResponseWriter, r *http.Request) {
	var req wire.BattleRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.StartBattle(r.Context(), req.EncounterID)
	})
}

func (s *Server) getBattle(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the battle id is required",
			Reason:  "No battle was named.",
		})
		return
	}
	battle, err := s.camp.GetBattle(r.Context(), id)
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, battle)
}

func (s *Server) postBattleOrders(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the battle id is required",
			Reason:  "No battle was named.",
		})
		return
	}
	var req wire.BattleOrders
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.SubmitBattleOrders(r.Context(), id, req)
	})
}

func (s *Server) postBattleEnd(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the battle id is required",
			Reason:  "No battle was named.",
		})
		return
	}
	var req wire.BattleEndRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) {
		return s.camp.EndBattle(r.Context(), id, req.Reason)
	})
}
