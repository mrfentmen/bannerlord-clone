package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"mbclone/simulation/internal/rumours"
	"mbclone/simulation/internal/savegame"
	"mbclone/simulation/internal/sim"
)

// tickLoop advances the simulation according to daysPerSecond.
// Each real second, it runs daysPerSecond ticks (fractional accumulates).
func (s *Server) tickLoop() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	var frac float64
	for range ticker.C {
		s.mu.RLock()
		dps := s.daysPerSecond
		s.mu.RUnlock()
		if dps <= 0 {
			continue
		}
		frac += dps * 0.1
		for frac >= 1 {
			frac--
			if err := s.tick(); err != nil {
				fmt.Printf("tick error: %v\n", err)
				// Pause on error rather than spinning.
				s.mu.Lock()
				s.daysPerSecond = 0
				s.mu.Unlock()
				break
			}
		}
	}
}

func (s *Server) tick() error {
	s.mu.Lock()
	orders := s.pendingOrders
	s.pendingOrders = nil
	s.mu.Unlock()

	s.engine.SetOrders(orders)
	if err := s.engine.Tick(s.state); err != nil {
		return err
	}
	// Outside the write lock, and it takes the read lock itself. `broadcastBarter` has to
	// be the other way round — its comment says why, and it is a deadlock, not a style.
	s.broadcastTick()
	return nil
}

func (s *Server) queueOrder(o sim.Order) {
	s.mu.Lock()
	s.pendingOrders = append(s.pendingOrders, o)
	s.mu.Unlock()
}

// --- HTTP handlers ---

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	// CORS for the dev client.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	json.NewEncoder(w).Encode(v)
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	writeJSON(w, buildSnapshot(s))
}

func (s *Server) handleTrade(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	var req struct {
		TownID int     `json:"townId"`
		Good   string  `json:"good"`
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// TradeRun order: TownID = source town, Target = destination (same for now),
	// Amount = goods amount.
	s.queueOrder(sim.Order{
		Kind:   sim.OrderTradeRun,
		TownID: req.TownID,
		Amount: req.Amount,
	})
	writeJSON(w, map[string]any{"accepted": true})
}

func (s *Server) handleRecruit(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	var req struct {
		TownID int `json:"townId"`
		Amount int `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// The player system finds the leader's party; LeaderID -1 means "the player".
	s.queueOrder(sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   req.TownID,
		LeaderID: s.playerLeaderID(),
		Amount:   float64(req.Amount),
	})
	writeJSON(w, map[string]any{"accepted": true, "recruited": req.Amount})
}

func (s *Server) handleTimeScale(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	var req struct {
		DaysPerRealSecond float64 `json:"daysPerRealSecond"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	s.daysPerSecond = req.DaysPerRealSecond
	s.mu.Unlock()
	writeJSON(w, map[string]any{"accepted": true})
}

func (s *Server) handleSkipToArrival(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	// Run ticks until the player's party is no longer marching, up to 365 days.
	days := 0
	for days < 365 {
		if !s.playerMarching() {
			break
		}
		if err := s.tick(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		days++
	}
	writeJSON(w, map[string]any{"daysAdvanced": days})
}

func (s *Server) handleMarchPlan(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	var req struct {
		DestinationTownID int `json:"destinationTownId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	plan := s.planMarchTo(req.DestinationTownID)
	writeJSON(w, plan)
}

func (s *Server) handleMarchCommit(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, map[string]any{})
		return
	}
	var req struct {
		DestinationTownID int `json:"destinationTownId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s.queueOrder(sim.Order{
		Kind:     sim.OrderMarchTo,
		LeaderID: s.playerLeaderID(),
		Target:   req.DestinationTownID,
	})
	writeJSON(w, map[string]any{"accepted": true})
}

func (s *Server) handleWhy(w http.ResponseWriter, r *http.Request) {
	entity := r.URL.Query().Get("entity")
	field := r.URL.Query().Get("field")
	chain := s.whyChain(entity, field)
	writeJSON(w, chain)
}

func (s *Server) handleSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Path == "" {
		req.Path = "savegame.json"
	}
	s.mu.RLock()
	state := s.state
	log := s.log
	orders := s.pendingOrders
	rngState := s.engine.RngState()
	dps := s.daysPerSecond
	pid := s.player
	s.mu.RUnlock()

	if err := savegame.Save(state, log, orders, &rngState, &dps, &pid, req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"saved": true, "path": req.Path})
}

func (s *Server) handleLoad(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Path == "" {
		req.Path = "savegame.json"
	}
	loaded, loadedLog, loadedOrders, loadedRng, loadedDps, _, err := savegame.Load(req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.mu.Lock()
	s.state = loaded
	if loadedLog != nil {
		s.log = loadedLog
	}
	if loadedOrders != nil {
		s.pendingOrders = loadedOrders
	}
	if loadedRng != nil {
		s.engine.SetRngState(*loadedRng)
	}
	if loadedDps != nil {
		s.daysPerSecond = *loadedDps
	}
	// Note: player ID is not restored; it is fixed at session startup
	// for security (see Server.player comment). The saved value is
	// informational.
	s.mu.Unlock()
	writeJSON(w, map[string]any{"loaded": true, "path": req.Path, "tick": loaded.Tick})
}

func (s *Server) handleRumours(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	state := s.state
	s.mu.RUnlock()

	rumours := rumours.Generate(state, 5.0, 10)
	writeJSON(w, map[string]any{"rumours": rumours})
}
