package main

// The barter endpoints: POST /v1/barter/propose and POST /v1/barter/commit,
// plus the GET /v1/barter/terms that both of them are priced against.
//
// Three handlers, one rule between them. **The client sets no price and no
// verdict.** Every figure on both tables is the trader's own, sent from here;
// what the panel does with them is two sums and a subtraction a player can check
// in their head. Whether a deal is even worth shaking on is the answer below,
// in the trader's words, and a client that decided a deal was fair would be a
// second merchant.
//
// `propose` writes nothing. It is a question, and a question that moved goods
// would be a bug. `commit` is the only one of the three that changes the world,
// and it changes it through the engine's staged-write path, so every sack, coin
// and captive that moves leaves a cause row naming what it was read against.
//
// The endpoints are the ones clients/campaign/src/data/provider.ts
// HttpSimulationProvider already calls, and the shapes are the BarterTerms,
// BarterProposal and BarterResult of clients/campaign/src/data/types.ts.

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/barter"
)

// barterRequest is the JSON body both POST endpoints take, matching
// BarterProposalRequest on the client.
//
// It is decoded once and shared because the client sends the identical body to
// both: it asks about a table, and then strikes that same table, and the point
// of `expectedDay` is that the two are about one specific set of numbers.
type barterRequest struct {
	PartyID string       `json:"partyId"`
	Trader  string       `json:"traderId"`
	Town    string       `json:"townId"`
	Offered []barterLine `json:"offered"`
	Asked   []barterLine `json:"asked"`
	// ExpectedDay is the day the client's tables were read. A deal against a
	// table that has gone stale is refused rather than silently repriced.
	ExpectedDay int `json:"expectedDay"`
	// resolvedOffered and resolvedAsked are the decoded lines, kept beside the
	// wire struct rather than in a second return value so that resolveBarter is
	// the only thing that has to carry both.
	resolvedOffered []sim.BarterLine
	resolvedAsked   []sim.BarterLine
}

// barterLine is one line of the table as it arrives.
type barterLine struct {
	Kind     string `json:"kind"`
	ItemID   string `json:"itemId"`
	Quantity int    `json:"quantity"`
}

// handleBarterTerms prices both tables at one place and one moment.
//
// GET rather than POST because it changes nothing, and it is the read the panel
// makes before it has a table to fill in.
func (s *Server) handleBarterTerms(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	trader, err := parseRef(r.URL.Query().Get("trader"))
	if err != nil {
		http.Error(w, "bad trader id", http.StatusBadRequest)
		return
	}
	town, err := parseRef(r.URL.Query().Get("town"))
	if err != nil {
		http.Error(w, "bad town id", http.StatusBadRequest)
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	req := barter.Request{
		PlayerID: s.playerLeaderID(),
		PartyID:  s.playerPartyID(),
		Trader:   trader,
		Town:     town,
	}
	terms, err := barter.BuildTerms(s.state, s.cfg, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, renderTerms(terms))
}

// handleBarterPropose is the trader answering a proposed deal. Nothing moves.
func (s *Server) handleBarterPropose(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	body, ok := decodeBarter(w, r)
	if !ok {
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	req, code, ok := s.resolveBarter(body)
	if !ok {
		http.Error(w, "not your party", code)
		return
	}
	proposal, err := barter.Appraise(s.state, s.cfg, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, renderProposal(proposal))
}

// handleBarterCommit strikes a deal.
//
// The order of operations here is the whole of its correctness. The deal is
// appraised first, against live stock, and a refused deal never reaches the
// engine: a trader who agreed yesterday to terms the player then walked away
// from must still refuse them today. An accepted deal is applied through the
// engine immediately rather than queued, so the tables the panel re-reads on the
// way back are the ones that actually held the goods.
func (s *Server) handleBarterCommit(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	body, ok := decodeBarter(w, r)
	if !ok {
		return
	}

	// Write-locked for the appraisal, the apply and the broadcast together.
	// Between the appraisal and the apply the state must not move, or the deal
	// would be checked against one set of stock and applied against another; and
	// the broadcast has to happen inside the same critical section, because the
	// subscriber set it reads is the same lock's.
	s.mu.Lock()
	defer s.mu.Unlock()

	req, code, ok := s.resolveBarter(body)
	if !ok {
		http.Error(w, "not your party", code)
		return
	}

	proposal, err := barter.Appraise(s.state, s.cfg, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if !proposal.Accepted {
		// A refused deal comes back with the tables as they stand, untouched.
		// This world is the authority on whether a deal can be struck, and a
		// client that reaches here with terms it was told were acceptable is
		// refused again rather than accommodated.
		terms, err := barter.BuildTerms(s.state, s.cfg, req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, renderResult(proposal, terms, s.state, req))
		return
	}

	if err := s.engine.ApplyNow(s.state, barter.System(), []sim.Order{{
		Kind:   sim.OrderBarter,
		TownID: req.Town,
		Barter: req.Deal(),
	}}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// The tables that come back are re-read from the world rather than carried
	// from the proposal: the deal moved stock, so any figure the proposal held
	// is now a figure about a moment that has passed. The panel replaces what is
	// on screen with these, which is only safe because they are the truth.
	terms, err := barter.BuildTerms(s.state, s.cfg, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.broadcastBarter(terms)
	writeJSON(w, renderResult(proposal, terms, s.state, req))
}

// decodeBarter reads and validates a request body, writing any error itself.
//
// It touches no simulation state. That split is the point of it: the previous
// version resolved the session's own party and player here, which meant reading
// s.state.Leaders and s.state.Parties before the handler had taken the lock —
// and the handlers call this before they lock, because they did not yet know
// whether the body was worth locking for. Under a running tick loop that is a
// data race on two maps, and the race detector is the only thing that reliably
// finds it, because the wrong answer looks like a plausible one.
//
// Resolution is the part worth noting: the client addresses entities by the
// string ids the snapshot gave them ("town-37", "leader-4"), and those are
// parsed back to integers rather than carried as strings into the simulation,
// which keys everything on integers. A malformed id is a bad request; an id that
// parses but names nothing is a 404 from the handler.
func decodeBarter(w http.ResponseWriter, r *http.Request) (barterRequest, bool) {
	var body barterRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return barterRequest{}, false
	}
	if _, err := parseRef(body.Trader); err != nil {
		http.Error(w, "bad trader id", http.StatusBadRequest)
		return barterRequest{}, false
	}
	if _, err := parseRef(body.Town); err != nil {
		http.Error(w, "bad town id", http.StatusBadRequest)
		return barterRequest{}, false
	}
	if body.PartyID != "" {
		if _, err := parseRef(body.PartyID); err != nil {
			http.Error(w, "bad party id", http.StatusBadRequest)
			return barterRequest{}, false
		}
	}
	offered, err := decodeBarterLines(body.Offered)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return barterRequest{}, false
	}
	asked, err := decodeBarterLines(body.Asked)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return barterRequest{}, false
	}
	body.resolvedOffered, body.resolvedAsked = offered, asked
	return body, true
}

// resolveBarter turns a decoded body into a request against this session's
// world. The caller must hold s.mu, because it reads the state maps.
//
// The player's own party id is checked rather than ignored. A commit naming
// somebody else's party would otherwise be silently reinterpreted as the
// player's own, which is a way to spend another lord's gold.
func (s *Server) resolveBarter(body barterRequest) (barter.Request, int, bool) {
	trader, _ := parseRef(body.Trader)
	town, _ := parseRef(body.Town)
	partyID := s.playerPartyID()
	if body.PartyID != "" {
		wanted, _ := parseRef(body.PartyID)
		if wanted != partyID {
			return barter.Request{}, http.StatusForbidden, false
		}
	}
	return barter.Request{
		PartyID:     partyID,
		PlayerID:    s.playerLeaderID(),
		Trader:      trader,
		Town:        town,
		Offered:     body.resolvedOffered,
		Asked:       body.resolvedAsked,
		ExpectedDay: body.ExpectedDay,
	}, 0, true
}

// decodeBarterLines converts wire lines to simulation lines.
//
// The kind is not checked here. It arrives as a string precisely so that one
// the simulation does not know can be refused by name in the appraisal, which
// is where the trader's own words belong; a decoder that rejected it would give
// the player "bad request" where they should have been told what is on the
// table.
func decodeBarterLines(lines []barterLine) ([]sim.BarterLine, error) {
	out := make([]sim.BarterLine, 0, len(lines))
	for _, l := range lines {
		if l.Quantity < 0 {
			return nil, errQuantity
		}
		out = append(out, sim.BarterLine{
			Kind:     l.Kind,
			ItemID:   l.ItemID,
			Quantity: l.Quantity,
		})
	}
	return out, nil
}

// errQuantity is the one malformed line a decoder refuses: a negative count.
// Everything else about a line is a question for the trader, and a negative
// quantity has no reading at all rather than a bad one.
var errQuantity = errStr("a barter quantity cannot be negative")

type errStr string

func (e errStr) Error() string { return string(e) }

// renderTerms builds the BarterTerms body.
func renderTerms(t barter.Terms) map[string]any {
	return map[string]any{
		"townId":           t.TownID,
		"traderId":         t.TraderID,
		"traderName":       t.TraderName,
		"traderItems":      renderItems(t.TraderItems),
		"playerItems":      renderItems(t.PlayerItems),
		"relationToPlayer": t.RelationToPlayer,
		"day":              t.Day,
	}
}

// renderItems renders one table's lines.
//
// It is always a list and never null, because the client decodes `[]` and
// `null` differently: a null table reads as a table that failed to arrive,
// where an empty one reads as a table with nothing on it, which is a fact about
// the world rather than about the wire.
func renderItems(items []barter.Item) []any {
	out := make([]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"kind":      string(it.Kind),
			"itemId":    it.ItemID,
			"name":      it.Name,
			"available": it.Available,
			"unitValue": it.UnitValue,
		})
	}
	return out
}

// renderProposal builds the BarterProposal body.
func renderProposal(p barter.Proposal) map[string]any {
	out := map[string]any{
		"accepted":    p.Accepted,
		"playerValue": p.PlayerValue,
		"traderValue": p.TraderValue,
		"verdict":     p.Verdict,
		"causedBy":    p.CausedBy,
	}
	// The two optional fields are omitted rather than sent as zero, because the
	// client checks `shortBy > 0` and prints the reason, and a refusal with no
	// reason and a shortfall of nothing is a sentence the trader never said.
	if p.Reason != "" {
		out["reason"] = p.Reason
	}
	if p.ShortBy > 0 {
		out["shortBy"] = p.ShortBy
	}
	return out
}

// renderResult builds the BarterResult body: the proposal, plus the tables as
// the world now holds them and the money on each side.
//
// playerMoney and traderMoney are the ledger figures, and barter moves none:
// they are here so a client can show the purses either way it could not have
// known them, not because the deal changed them.
func renderResult(p barter.Proposal, t barter.Terms, st *model.State, req barter.Request) map[string]any {
	out := renderProposal(p)
	out["day"] = t.Day
	out["playerItems"] = renderItems(t.PlayerItems)
	out["traderItems"] = renderItems(t.TraderItems)
	out["playerMoney"] = moneyOf(st, req.PlayerID)
	out["traderMoney"] = moneyOf(st, req.Trader)
	return out
}

// moneyOf is one ruler's personal treasury, the ledger figure the result
// reports. A lord with no record is reported as broke rather than omitted,
// because a missing money figure and a purse of nothing are different answers.
func moneyOf(st *model.State, leader int) float64 {
	if l := st.Leaders[leader]; l != nil {
		return l.Money
	}
	return 0
}

// playerPartyID is the player's own party id, or -1 for a lord with no party.
func (s *Server) playerPartyID() int {
	pid := s.playerLeaderID()
	if l := s.state.Leaders[pid]; l != nil && l.PartyID >= 0 {
		if _, ok := s.state.Parties[l.PartyID]; ok {
			return l.PartyID
		}
	}
	return -1
}

// parseRef reads one of the client's "town-37" style ids.
//
// The prefix is ignored and only the number is read, because the client has two
// vocabularies for rulers ("leader-4" from this server's snapshot and
// "ruler-4" from the fixture provider) and rejecting one of them would make the
// screen depend on which world it was talking to.
func parseRef(v string) (int, error) {
	i := strings.LastIndex(v, "-")
	if i < 0 {
		return 0, errStr("id " + v + " is not a prefixed reference")
	}
	n, err := strconv.Atoi(v[i+1:])
	if err != nil || n < 0 {
		return 0, errStr("id " + v + " does not end in a number")
	}
	return n, nil
}

// broadcastBarter pushes the moved world to any subscriber.
//
// A struck deal is not a tick, so the tick broadcast has nothing to say about
// it. The panel re-reads the world itself, which is why it does not need this,
// but a second window open on the same server would otherwise keep drawing a
// market that has already changed.
//
// **The caller must already hold s.mu for writing.** The subscriber set is
// snapshotted and the frames are sent non-blocking, so there is nothing here
// that needs the lock and everything here that would deadlock if it took it:
// this function previously took s.mu.RLock() of its own accord, which it cannot
// do while the commit handler holds s.mu.Lock(). Go's RWMutex is not reentrant,
// so that was not a slow path but a hang — every accepted deal would have wedged
// the request goroutine and, because the write lock was still held, every other
// request behind it. It went unnoticed because no subscriber had ever been
// registered: the early return on an empty set happened to be below the lock
// acquisition on the first read of the code, and it is not.
func (s *Server) broadcastBarter(terms barter.Terms) {
	if len(s.wsSubs) == 0 {
		return
	}
	msg := []byte(`{"type":"barter","townId":"` + terms.TownID +
		`","traderId":"` + terms.TraderID + `"}`)
	for ch := range s.wsSubs {
		select {
		case ch <- msg:
		default:
		}
	}
}
