package api

import (
	"fmt"
	"net/http"

	"mbclone/simulation/cmd/apiserver/campaign"
	"mbclone/simulation/cmd/apiserver/wire"
)

// The handlers. Each one is a thin translation: decode, call the campaign, answer.
// Every route returns JSON on every path, including the ones the client discards,
// because the client's POST helper parses every reply.

// -- snapshot and why -------------------------------------------------------

func (s *Server) getSnapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := s.camp.Snapshot(r.Context())
	if err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, snap)
}

func (s *Server) postSnapshotRestore(w http.ResponseWriter, r *http.Request) {
	var snap wire.SimSnapshot
	if !s.decode(w, r, &snap) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.RestoreSnapshot(r.Context(), snap) })
}

func (s *Server) getWhy(w http.ResponseWriter, r *http.Request) {
	entity := queryField(r, "entity")
	if entity == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the entity query parameter is required",
			Reason:  "The question did not say what it was about.",
		})
		return
	}
	field := queryField(r, "field")
	if field == "" {
		s.writeFault(w, &campaign.Fault{
			Code:    campaign.CodeBadRequest,
			Message: "the field query parameter is required",
			Reason:  "The question did not say what it was about.",
		})
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.Why(r.Context(), entity, field) })
}

// -- trade and recruit ------------------------------------------------------

func (s *Server) postTrade(w http.ResponseWriter, r *http.Request) {
	var req wire.TradeRequest
	if !s.decode(w, r, &req) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.Trade(ctx, req) })
}

func (s *Server) postRecruit(w http.ResponseWriter, r *http.Request) {
	var req wire.RecruitRequest
	if !s.decode(w, r, &req) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.Recruit(ctx, req) })
}

// -- notables ---------------------------------------------------------------

func (s *Server) postTalk(w http.ResponseWriter, r *http.Request) {
	s.talk(w, r)
}

// getTalk answers the same body as postTalk.
//
// AGENT_SPEC.md task 5 specifies GET for this route and the campaign client POSTs
// it. Both are served, so either reading of the spec works and the client is
// satisfied.
func (s *Server) getTalk(w http.ResponseWriter, r *http.Request) {
	s.talk(w, r)
}

func (s *Server) talk(w http.ResponseWriter, r *http.Request) {
	var req wire.TalkRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.TalkToNotable(r.Context(), req) })
}

func (s *Server) postRelation(w http.ResponseWriter, r *http.Request) {
	var req wire.ImproveRelationRequest
	if !s.decode(w, r, &req) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.ImproveRelation(ctx, req) })
}

// -- the clock --------------------------------------------------------------

func (s *Server) postTimeScale(w http.ResponseWriter, r *http.Request) {
	var req wire.TimeScaleRequest
	if !s.decode(w, r, &req) {
		return
	}
	if err := s.camp.SetTimeScale(req.DaysPerRealSecond); err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, wire.ClockState(s.camp.Clock()))
}

func (s *Server) postPause(w http.ResponseWriter, r *http.Request) {
	if err := s.camp.Pause(); err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, wire.ClockState(s.camp.Clock()))
}

func (s *Server) postResume(w http.ResponseWriter, r *http.Request) {
	if err := s.camp.Resume(); err != nil {
		s.writeFault(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, wire.ClockState(s.camp.Clock()))
}

func (s *Server) getTime(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, http.StatusOK, wire.ClockState(s.camp.Clock()))
}

func (s *Server) postSkip(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) {
		days, arrived, err := s.camp.SkipToArrival(ctx)
		if err != nil {
			return nil, err
		}
		return wire.SkipToArrivalResult{DaysAdvanced: days, Arrived: arrived}, nil
	})
}

// -- the character ----------------------------------------------------------

func (s *Server) postEthnicity(w http.ResponseWriter, r *http.Request) {
	var req wire.EthnicityRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.SetEthnicity(r.Context(), req) })
}

func (s *Server) postCharacter(w http.ResponseWriter, r *http.Request) {
	var ch wire.PlayerCharacter
	if !s.decode(w, r, &ch) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.SetCharacter(r.Context(), ch) })
}

func (s *Server) getCharacter(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, http.StatusOK, s.camp.Character())
}

// -- troops -----------------------------------------------------------------

func (s *Server) postBattleXp(w http.ResponseWriter, r *http.Request) {
	var in wire.BattleXpInput
	if !s.decode(w, r, &in) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.AwardBattleXp(r.Context(), in) })
}

func (s *Server) postBattleResult(w http.ResponseWriter, r *http.Request) {
	var in wire.BattleResultInput
	if !s.decode(w, r, &in) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.ApplyBattleResult(r.Context(), in) })
}

func (s *Server) postBattleOutcome(w http.ResponseWriter, r *http.Request) {
	var in wire.BattleResult
	if !s.decode(w, r, &in) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.ApplyBattleOutcome(r.Context(), in) })
}

func (s *Server) getNearbyParties(w http.ResponseWriter, r *http.Request) {
	rangeKm := 50.0
	if v := r.URL.Query().Get("rangeKm"); v != "" {
		var parsed float64
		if _, err := fmt.Sscanf(v, "%f", &parsed); err == nil && parsed > 0 {
			rangeKm = parsed
		}
	}
	s.order(w, r, func() (any, error) { return s.camp.NearbyParties(r.Context(), rangeKm) })
}

func (s *Server) postDefeatParty(w http.ResponseWriter, r *http.Request) {
	partyID := r.PathValue("id")
	s.order(w, r, func() (any, error) { return s.camp.DefeatParty(r.Context(), partyID) })
}

func (s *Server) postUpgrade(w http.ResponseWriter, r *http.Request) {
	var req wire.UpgradeTroopsRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.UpgradeTroops(r.Context(), req) })
}

// -- towns ------------------------------------------------------------------

func (s *Server) postTownTax(w http.ResponseWriter, r *http.Request) {
	var req wire.TaxRequest
	if !s.decode(w, r, &req) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.SetTaxRate(ctx, req) })
}

func (s *Server) postStateTax(w http.ResponseWriter, r *http.Request) {
	var req wire.StateTaxRequest
	if !s.decode(w, r, &req) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.SetStateTaxRate(ctx, req) })
}

func (s *Server) postConstruct(w http.ResponseWriter, r *http.Request) {
	var req wire.ConstructRequest
	if !s.decode(w, r, &req) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.Construct(ctx, req) })
}

// -- march ------------------------------------------------------------------

func (s *Server) postMarchPlan(w http.ResponseWriter, r *http.Request) {
	var req wire.MarchRequest
	if !s.decode(w, r, &req) {
		return
	}
	s.order(w, r, func() (any, error) { return s.camp.PlanMarch(r.Context(), req) })
}

func (s *Server) postMarchCommit(w http.ResponseWriter, r *http.Request) {
	var req wire.MarchRequest
	if !s.decode(w, r, &req) {
		return
	}
	ctx, cancel := s.deadline(r)
	defer cancel()
	s.order(w, r, func() (any, error) { return s.camp.CommitMarch(ctx, req) })
}

