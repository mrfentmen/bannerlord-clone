package api

import (
	"net/http"
	"strconv"
	"strings"

	"mbclone/simulation/cmd/apiserver/campaign"
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

// postTownSiege lays a siege on the town named in the path.
//
// The client's siege order is town-scoped — it names the town in the path, the way
// POST /v1/town/tax and POST /v1/town/construct do — and it hands over the besieging
// force by reference. This is the route that speaks it. Without it the provider method
// existed, was covered by passing tests against the fixture, and 404ed against a real
// server, which is the whole failure this route is here to stop.
func (s *Server) postTownSiege(w http.ResponseWriter, r *http.Request) {
	townID, ok := refInt(r.PathValue("id"))
	if !ok {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the town id is required",
			Reason:  "No town was named to besiege.",
		})
		return
	}
	var req wire.TownSiegeRequest
	if !s.decode(w, r, &req) {
		return
	}
	if len(req.AttackerPartyIDs) == 0 {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "no attacking party named",
			Reason:  "Someone has to lay the siege.",
		})
		return
	}
	attackerID, ok := refInt(req.AttackerPartyIDs[0])
	if !ok {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "attackerPartyIds[0] is not a party id",
			Reason:  "The besieging force could not be named.",
		})
		return
	}
	s.order(w, r, func() (any, error) {
		siege, err := s.camp.StartSiege(r.Context(), attackerID, townID)
		if err != nil {
			return nil, err
		}
		return wire.TownSiegeResult{SiegeID: siege.ID}, nil
	})
}

// refInt reads a simulation id off the wire in either of the two forms a client sends:
// the bare number the simulation uses internally, and the prefixed reference every
// other route on this server accepts (`town-41`, `party-7`).
func refInt(ref string) (int, bool) {
	if n, err := strconv.Atoi(strings.TrimSpace(ref)); err == nil {
		return n, true
	}
	return parseTrailingInt(ref)
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
