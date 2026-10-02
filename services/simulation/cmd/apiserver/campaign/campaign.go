// Package campaign owns one running simulation: its state, its clock, its cause
// log, and the read models the API serves.
//
// # Lifecycle
//
// One campaign per process, created by New and run by Start:
//
//	campaign.New(cfg, opts)   load-free construction: generate the world, build
//	                          the engine, choose the player, seed the read models
//	campaign.Start(ctx)       one goroutine, the only caller of engine.Tick
//	campaign.Stop()           finishes the current tick, writes a final snapshot
//
// # Why one goroutine
//
// sim.Engine and *cause.Log are both unsynchronised, and model.State is a set of
// maps. Nothing in the simulation is safe to read while a tick is applying
// writes. So this package makes one goroutine the sole writer and hands readers
// a read lock: HTTP handlers never see a half-applied tick, and two ticks never
// interleave.
//
// # How player orders reach the simulation
//
// A system may not call another system, and it cannot reach into state: it is
// handed a *sim.View and a *sim.WriteSet and nothing else
// (CONSTITUTION.md section 2.1). The way in is sim.Order, which is data drained
// at a tick boundary. This package contributes one sim.System, orderSystem, that
// consumes its own queue of jobs alongside the built-in orders, so a player's
// trade is staged into the same WriteSet as the market's own writes and lands in
// the same cause log.
//
// An order therefore applies on a tick, not on the HTTP request. The request
// blocks on a result channel until that tick commits, which is what makes the
// reply's numbers true rather than predicted.
//
// # What this package owns that the model does not
//
// model.Party carries troops as one float64 count and model.Town carries three
// resource stocks. It has no roster of named units, no price history, and no
// notable. The client asks for all three, so this package keeps them: a roster
// the recruitment route writes and the snapshot route reads, a rolling price
// series appended by the tick hook, and a notable's relation and dialogue derived
// from the ruler the simulation already has. None of them feed back into a
// simulation result, so they cannot make a run depend on the server.
package campaign

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"mbclone/simulation/cmd/apiserver/events"
	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/simrun"
	"mbclone/simulation/internal/worldgen"
)

// Options configures a campaign. Every field has a working default, because the
// point of the server is that it runs without a settings file.
type Options struct {
	// Seed is the world seed. The same seed produces the same world, because
	// worldgen and every system derive their randomness from it.
	Seed uint64

	// StartYear is the calendar year the campaign begins at, which is what
	// eraTier is computed against. ERA.md's tiers start in 1950.
	StartYear int

	// DaysPerRealSecond is the initial clock rate. Zero starts paused, which is
	// the right default for a server: nothing should advance until a player
	// says so.
	DaysPerRealSecond float64

	// TickIntervalMillis is how often the clock wakes up to see whether a
	// whole day is due. It bounds how precisely a rate is honoured, and costs
	// one wakeup per interval regardless of rate.
	TickIntervalMillis int

	// MaxTicksPerPass bounds how many days one wakeup may run. A rate of 365
	// days per second against a 100ms interval wants 36 days per wakeup; the
	// cap is what stops one slow pass from trying to catch up forever.
	MaxTicksPerPass int

	// SnapshotEvery is how many ticks between periodic snapshots. Zero turns
	// them off.
	SnapshotEvery int

	// SnapshotDir is where periodic snapshots are written.
	SnapshotDir string

	// MarketHistory is how many days of price history each good keeps.
	MarketHistory int

	// CauseRowsLimit bounds how many cause rows a snapshot carries.
	CauseRowsLimit int

	// NotificationLimit bounds how many notifications a snapshot carries.
	NotificationLimit int

	// RelatedLimit bounds how many unlinked context rows a why-chain returns.
	RelatedLimit int

	// SkipCap bounds skip-to-arrival, in days, so a party that cannot arrive
	// returns an answer instead of hanging the request.
	SkipCap int

	// PlayerRulerID and PlayerTownID choose the player. Zero means pick one.
	PlayerRulerID int
	PlayerTownID  int
}

// withDefaults fills every unset option.
func (o Options) withDefaults() Options {
	if o.TickIntervalMillis <= 0 {
		o.TickIntervalMillis = 100
	}
	if o.MaxTicksPerPass <= 0 {
		o.MaxTicksPerPass = 400
	}
	if o.StartYear == 0 {
		o.StartYear = 1950
	}
	if o.SnapshotEvery < 0 {
		o.SnapshotEvery = 0
	}
	if o.SnapshotEvery == 0 {
		o.SnapshotEvery = 30
	}
	if o.MarketHistory <= 0 {
		o.MarketHistory = 90
	}
	if o.CauseRowsLimit <= 0 {
		o.CauseRowsLimit = 500
	}
	if o.NotificationLimit <= 0 {
		o.NotificationLimit = 50
	}
	if o.RelatedLimit <= 0 {
		o.RelatedLimit = 24
	}
	if o.SkipCap <= 0 {
		o.SkipCap = 400
	}
	return o
}

// Campaign is one running world.
type Campaign struct {
	cfg   *config.Config
	opts  Options
	log   *cause.Log
	eng   *sim.Engine
	state *model.State

	// bus publishes tick frames and events for a WebSocket layer to forward.
	// See docs/_draft/apiserver-ws-handoff.md.
	bus *events.Bus

	// mu guards everything below it, which is all of the campaign's mutable
	// state: the simulation state, the cause log, the clock, the player's
	// character, the roster, the price history, and the notification list.
	// The tick goroutine holds it for writing; HTTP handlers hold it for
	// reading.
	mu sync.RWMutex

	// clock. acc carries the fraction of a day the current rate has earned, so
	// a rate of 0.3 does not round away to nothing.
	scale      float64
	lastScale  float64
	acc        float64
	ticksRun   int
	snapshotAt int

	// identity: the player's ruler, home town, and party. A player in this
	// simulation is a (ruler, town) pair, which is how internal/profile and
	// internal/systems/player already model one.
	playerRuler int
	homeTown    int
	party       int

	// character is the sheet from POST /v1/character, merged into the player
	// view. Empty until it is posted.
	character character

	// roster, history, and notifications are this package's own read models,
	// described in the package comment.
	ro       *roster
	history  map[marketKey]*priceSeries
	notifs   []wire.Notification
	seenRow  map[int]bool
	notifSeq int

	// prisoners is the captured-enemy read model and companions is the tavern
	// roster and hired company. Both are built on first use, so a campaign that
	// never fights and never drinks never pays for them. prisoners.go and
	// companions.go reach them through ensurePrisoners and ensureCompanions.
	prisoners  *prisonerState
	companions *companionState

	// jobs is the pending order queue. The API writes to pending; only the
	// tick goroutine reads it, and only while holding mu.
	pending chan *job
	// current is the batch handed to this tick, read by orderSystem inside
	// engine.Tick. Only the tick goroutine touches it, and only under mu.
	current []*job

	// snapshotPending holds bytes built inside the tick hook, so the write
	// happens after the lock is released rather than under it.
	snapshotPending []byte

	// started and stopped bracket Start and Stop.
	started bool
	done    chan struct{}
	stop    context.CancelFunc
	wg      sync.WaitGroup
	// lastErr is the most recent tick failure. A tick that fails leaves state
	// as it was, so the server stays up and reports rather than dying silently.
	lastErr error
	// skippedDays counts days dropped by MaxTicksPerPass, which is a rate the
	// server could not honour rather than a silent loss.
	skippedDays int
}

// character is the player's character sheet as posted by the client.
type character struct {
	set          bool
	firstName    string
	lastName     string
	gender       string
	appearanceID string
	ethnicityID  string
	age          float64
	startCity    string
	difficulty   string
	backgrounds  map[string]string
	attributes   map[string]float64
	skillFocus   map[string]float64
	bonus        map[string]float64
	skills       map[string]float64
	startingCash float64
	biography    string
}

// New builds a campaign: it generates the world, constructs the engine with the
// simulation's own systems plus this package's order system, and chooses a
// player.
//
// The caller must have validated the config. config.Load already rejects a
// balance file with a missing key or a key no system reads, so a config that
// reaches here is complete.
func New(cfg *config.Config, opts Options) (*Campaign, error) {
	opts = opts.withDefaults()

	if err := simrun.ValidateConfig(cfg); err != nil {
		return nil, fmt.Errorf("apiserver: balance config is not runnable: %w", err)
	}

	gen := worldgen.Generate(cfg, opts.Seed, nil)
	if gen.State == nil || len(gen.State.Towns) == 0 {
		return nil, errors.New("apiserver: world generation produced no settlements")
	}

	c := &Campaign{
		cfg:     cfg,
		opts:    opts,
		log:     cause.NewLog(int(cfg.Audit.LogRowLimit)),
		state:   gen.State,
		bus:     events.NewBus(),
		scale:   opts.DaysPerRealSecond,
		ro:      newRoster(),
		history: map[marketKey]*priceSeries{},
		seenRow: map[int]bool{},
		pending: make(chan *job, 256),
		done:    make(chan struct{}),
	}
	if c.scale > 0 {
		c.lastScale = c.scale
	}

	systems := append(simrun.Systems(), c.orderSystem())
	c.eng = sim.NewEngine(cfg, c.log, opts.Seed, systems)
	c.eng.AddHook(c.afterTick)

	if err := c.choosePlayer(opts); err != nil {
		return nil, err
	}
	c.seedReadModels()

	// A short warm-up. Several systems read a field another system writes, and
	// the first tick of a fresh world has no prior values to read: prices are
	// zero, stock targets unset, demand uncomputed. Serving that as day zero
	// would hand the client a world whose numbers are all still standing at
	// their initial values, so the campaign runs a fortnight before it starts
	// answering. The warm-up is real simulation, not a fudge: the player
	// arrives at a world that has already been going for a fortnight.
	if err := c.warmUp(14); err != nil {
		return nil, fmt.Errorf("apiserver: warm-up failed: %w", err)
	}
	return c, nil
}

// warmUp runs n ticks with no orders, under the write lock, before the clock
// starts.
func (c *Campaign) warmUp(n int) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := 0; i < n; i++ {
		if err := c.eng.Tick(c.state); err != nil {
			return err
		}
	}
	return nil
}

// StepDays advances the world exactly n days, synchronously, and returns the
// new day. It is the deterministic counterpart to the wall-clock-driven pass:
// the same tick path (engine ticks, encounter check, snapshot bookkeeping)
// with no elapsed-time math, so two runs of the same n from the same save land
// on the same world. Used by the save/load proof and by tests.
func (c *Campaign) StepDays(n int) (int, error) {
	if n < 0 {
		return 0, fmt.Errorf("step-days: negative day count %d", n)
	}
	if n > 366 {
		return 0, fmt.Errorf("step-days: max 366 days per call, got %d", n)
	}
	c.mu.Lock()
	if c.lastErr != nil {
		err := c.lastErr
		c.mu.Unlock()
		return 0, fmt.Errorf("step-days: the simulation clock is halted after a failed tick: %w", err)
	}
	for i := 0; i < n; i++ {
		if err := c.eng.Tick(c.state); err != nil {
			c.lastErr = err
			c.mu.Unlock()
			return 0, fmt.Errorf("step-days: tick %d failed: %w", c.state.Tick, err)
		}
		c.ticksRun++
	}
	c.checkEncountersLocked()
	snapshot := c.snapshotPending
	c.snapshotPending = nil
	day := c.state.Tick
	c.mu.Unlock()

	if snapshot != nil {
		c.flushSnapshot(snapshot)
	}
	return day, nil
}

// choosePlayer picks the ruler and town the player holds.
//
// The default is the holder of the most populous town that is not a side leader:
// a player needs a town to administer, because tax, construction, trade, and
// recruitment all act on one. A side leader would be handed six states and no
// town of their own to run.
func (c *Campaign) choosePlayer(opts Options) error {
	if opts.PlayerRulerID != 0 {
		r, ok := c.state.Rulers[opts.PlayerRulerID]
		if !ok {
			return fmt.Errorf("apiserver: no ruler %d", opts.PlayerRulerID)
		}
		c.playerRuler = r.ID
		c.homeTown = r.TownID
		if c.homeTown < 0 {
			c.homeTown = c.state.TownIDs()[0]
		}
		return c.attachParty(r)
	}

	best := -1
	var bestPop float64
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t == nil || t.Population <= 0 || t.Holder < 0 {
			continue
		}
		r := c.state.Rulers[t.Holder]
		if r == nil || r.Leader {
			continue
		}
		if t.Population > bestPop {
			bestPop, best = t.Population, t.Holder
		}
	}
	if best < 0 {
		// No holder who is not a side leader: fall back to any holder at all,
		// then to the first town. A campaign with no player town is still a
		// working simulation, just not one the player can build in.
		for _, id := range c.state.TownIDs() {
			if t := c.state.Towns[id]; t != nil && t.Holder >= 0 {
				best = t.Holder
				break
			}
		}
	}
	if best < 0 {
		best = c.state.TownIDs()[0]
	}
	c.playerRuler = best
	r := c.state.Rulers[best]
	if r == nil {
		return fmt.Errorf("apiserver: chosen holder %d is not a ruler", best)
	}
	c.homeTown = r.TownID
	if c.homeTown < 0 {
		c.homeTown = c.state.TownIDs()[0]
	}
	if opts.PlayerTownID != 0 {
		if _, ok := c.state.Towns[opts.PlayerTownID]; ok {
			c.homeTown = opts.PlayerTownID
		}
	}
	return c.attachParty(r)
}

// attachParty binds the player's party. A ruler the generator gave no party gets
// one here, so the player always has a party to march, trade, and feed. This runs
// before the clock starts, so it mutates state directly rather than staging
// writes: there is no tick to stage into yet, and no reader to race.
func (c *Campaign) attachParty(r *model.Ruler) error {
	if p, ok := c.state.Parties[r.PartyID]; ok && p != nil {
		c.party = p.ID
		return nil
	}
	id := c.state.NewID(model.IDParty)
	c.state.Parties[id] = &model.Party{
		ID:            id,
		Name:          r.Name + "'s company",
		SideID:        r.SideID,
		RulerID:       r.ID,
		X:             c.townPos(c.homeTown),
		Y:             c.townPos(c.homeTown),
		Troops:        c.cfg.World.PartyTroopsBase,
		Food:          c.cfg.World.PartyTroopsBase * c.cfg.March.FoodPerTroop * c.cfg.World.StartPartyFoodDays,
		Money:         r.Money * c.cfg.Ruler.PartyMoneyShare,
		Gold:          r.Gold * c.cfg.Ruler.PartyGoldShare,
		Metal:         c.cfg.World.PartyTroopsBase * c.cfg.World.PartyMetalPerTroop,
		Medicine:      c.cfg.World.PartyTroopsBase * c.cfg.World.PartyMedicinePerTroop,
		Morale:        c.cfg.Upkeep.MoraleCap * 0.8,
		Activity:      model.ActIdle,
		Intention:     model.IntentNone,
		HomeTown:      c.homeTown,
		DestTown:      c.homeTown,
		DestRuler:     -1,
		DestTownParty: -1,
		IsMercenary:   r.IsMercenary,
	}
	r.PartyID = id
	c.state.SetIDCounter(model.IDParty, id)
	c.party = id
	return nil
}

// townPos returns a town's X, or zero when the id names no town. The caller
// passes homeTown, which choosePlayer has already validated.
func (c *Campaign) townPos(id int) float64 {
	if t := c.state.Towns[id]; t != nil {
		return t.X
	}
	return 0
}

// townPosY is townPos for Y.
func (c *Campaign) townPosY(id int) float64 {
	if t := c.state.Towns[id]; t != nil {
		return t.Y
	}
	return 0
}

// Bus returns the event bus a WebSocket layer subscribes to.
func (c *Campaign) Bus() *events.Bus { return c.bus }

// Config returns the balance config, for a status route.
func (c *Campaign) Config() *config.Config { return c.cfg }

// TickInterval returns the clock's wakeup period.
func (c *Campaign) TickInterval() time.Duration {
	return time.Duration(c.opts.TickIntervalMillis) * time.Millisecond
}

// Start launches the single tick goroutine. It returns immediately; the goroutine
// runs until the context is cancelled or Stop is called.
func (c *Campaign) Start(ctx context.Context) {
	c.mu.Lock()
	if c.started {
		c.mu.Unlock()
		return
	}
	c.started = true
	runCtx, cancel := context.WithCancel(ctx)
	c.stop = cancel
	c.mu.Unlock()

	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		defer close(c.done)
		c.loop(runCtx)
	}()
}

// Stop halts the clock and waits for the current tick to finish. It is safe to
// call more than once.
func (c *Campaign) Stop() {
	c.mu.RLock()
	started := c.started
	cancel := c.stop
	c.mu.RUnlock()
	if !started {
		return
	}
	if cancel != nil {
		cancel()
	}
	<-c.done
	c.wg.Wait()
	c.writeSnapshot()
}

// loop is the one goroutine that calls engine.Tick.
//
// It wakes on a fixed interval, converts elapsed real time into whole days at
// the current rate, and runs them. It also drains the pending order queue every
// pass, so an order submitted while the clock is paused still gets its tick.
func (c *Campaign) loop(ctx context.Context) {
	t := time.NewTicker(c.TickInterval())
	defer t.Stop()
	last := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			elapsed := now.Sub(last).Seconds()
			last = now
			c.pass(ctx, elapsed)
		}
	}
}

// pass is one wakeup: drain orders, work out how many days are due, run them,
// and publish.
func (c *Campaign) pass(ctx context.Context, elapsed float64) {
	jobs := c.drainJobs()

	c.mu.Lock()
	if c.lastErr != nil {
		// A previous tick failed. State is as the last good tick left it, and
		// continuing would compound the failure, so the clock stays stopped
		// until someone reads the error. Failing loudly beats advancing a world
		// that is already wrong.
		c.mu.Unlock()
		c.failPending(jobs, internalf("the simulation clock is halted after a failed tick: %v", c.lastErr))
		return
	}

	scale := c.scale
	due := 0
	if scale > 0 && elapsed > 0 {
		c.acc += elapsed * scale
		due = int(c.acc)
		c.acc -= float64(due)
	}
	if due > c.opts.MaxTicksPerPass {
		c.skippedDays += due - c.opts.MaxTicksPerPass
		due = c.opts.MaxTicksPerPass
	}
	// An order needs a tick to land in, even at a zero rate. A player paused at
	// a standstill must still be able to buy something.
	if len(jobs) > 0 && due == 0 {
		due = 1
	}

	if due == 0 {
		c.mu.Unlock()
		return
	}

	// The batch this tick will carry. orderSystem reads it from inside
	// engine.Tick, and only this goroutine ever writes it, under this lock, so
	// the system sees exactly the jobs whose results the caller is waiting for.
	c.current = jobs
	c.eng.SetOrders(c.simOrdersFor(jobs))
	for i := 0; i < due; i++ {
		if err := c.eng.Tick(c.state); err != nil {
			c.lastErr = err
			c.current = nil
			c.mu.Unlock()
			c.failPending(jobs, internalf("tick %d failed: %v", c.state.Tick, err))
			return
		}
		c.ticksRun++
	}
	// After ticks, check for hostile parties in proximity and auto-create
	// encounters. The game generates fights on its own; the player doesn't
	// have to manually trigger every battle via API.
	c.checkEncountersLocked()
	// A tick can run several days when the clock is fast, but a job applies once.
	// orderSystem clears the batch as it drains it, and this is the backstop for
	// the case where a job carried no stage function and was never reached.
	c.current = nil
	c.finishJobs(jobs)
	snapshot := c.snapshotPending
	c.snapshotPending = nil
	c.mu.Unlock()

	if snapshot != nil {
		c.flushSnapshot(snapshot)
	}
	if ctx.Err() != nil {
		return
	}
}

// simOrdersFor turns jobs into the engine's order slice. A job that wants a
// built-in order states which one; a job that only wants this package's system
// to act contributes nothing here, because SetOrders replaces the queue wholesale
// and a zero-valued Order would be a real order with kind OrderSetTax.
func (c *Campaign) simOrdersFor(jobs []*job) []sim.Order {
	out := make([]sim.Order, 0, len(jobs))
	for _, j := range jobs {
		if j.hasEngineOrder {
			out = append(out, j.engineOrder)
		}
	}
	return out
}

// drainJobs takes every queued job without blocking. It runs outside the lock
// because it touches the channel, and because draining is the only thing that
// does not need the state to be quiescent.
func (c *Campaign) drainJobs() []*job {
	var out []*job
	for {
		select {
		case j := <-c.pending:
			out = append(out, j)
		default:
			return out
		}
	}
}

// failPending answers every queued job with the same fault. A job whose tick
// never ran must not leave its caller blocked forever.
func (c *Campaign) failPending(jobs []*job, err error) {
	for _, j := range jobs {
		j.complete(nil, err)
	}
}

// finishJobs runs each job's post-commit step and answers its caller. It runs
// under the write lock, so a job can read state that the tick it just rode on
// changed.
func (c *Campaign) finishJobs(jobs []*job) {
	for _, j := range jobs {
		value, err := j.value, j.err
		if err == nil && j.finish != nil {
			value = j.finish(c, c.state, value)
		}
		j.complete(value, err)
	}
}

// Submit queues a job and waits for the tick that applies it.
//
// The wait is bounded by ctx. A caller that gives up does not leave the job
// running: the tick goroutine may still apply it, but nobody is waiting for the
// answer, which is the same as a dropped connection.
func (c *Campaign) Submit(ctx context.Context, j *job) (any, error) {
	select {
	case c.pending <- j:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	select {
	case res := <-j.done:
		if res.err != nil {
			return nil, res.err
		}
		return res.value, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// SetTimeScale sets the clock rate. A rate of zero pauses. A negative, infinite,
// or NaN rate is refused, because a clock that runs backwards or never advances
// is not a clock.
func (c *Campaign) SetTimeScale(scale float64) error {
	if err := validScale(scale); err != nil {
		return err
	}
	c.mu.Lock()
	c.scale = scale
	if scale > 0 {
		c.lastScale = scale
	}
	c.mu.Unlock()
	c.bus.Publish(events.KindClock, c.TickNumber(), c.DayOfYear(), wire.ClockState(c.Clock()))
	return nil
}

// Pause stops the clock without forgetting the rate it was running at.
func (c *Campaign) Pause() error {
	c.mu.Lock()
	if c.scale != 0 {
		c.lastScale = c.scale
	}
	c.scale = 0
	c.mu.Unlock()
	c.bus.Publish(events.KindClock, c.TickNumber(), c.DayOfYear(), wire.ClockState(c.Clock()))
	return nil
}

// Resume restores the last non-zero rate, or one day per second if there was
// none.
func (c *Campaign) Resume() error {
	c.mu.Lock()
	if c.lastScale <= 0 {
		c.lastScale = 1
	}
	c.scale = c.lastScale
	c.mu.Unlock()
	c.bus.Publish(events.KindClock, c.TickNumber(), c.DayOfYear(), wire.ClockState(c.Clock()))
	return nil
}

// Clock reads the clock.
func (c *Campaign) Clock() wire.ClockState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return wire.ClockState{
		DaysPerRealSecond: c.scale,
		Paused:            c.scale == 0,
		Tick:              c.state.Tick,
		Day:               c.state.Tick % 365,
		Year:              c.state.Year,
		TicksPerSnapshot:  c.opts.SnapshotEvery,
	}
}

// TickNumber reads the current tick.
func (c *Campaign) TickNumber() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state.Tick
}

// DayOfYear reads the day of the year.
func (c *Campaign) DayOfYear() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state.Tick % 365
}

// LastError reports the most recent tick failure, if the clock is halted.
func (c *Campaign) LastError() error {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lastErr
}

// SkippedDays is how many days the clock dropped because a pass hit
// MaxTicksPerPass. A non-zero value means the requested rate is higher than this
// machine can honour, which is worth reporting rather than hiding.
func (c *Campaign) SkippedDays() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.skippedDays
}

// SkipToArrival runs ticks until the player's party stops marching, and reports
// how many days that took.
//
// It runs on this goroutine rather than on a tick of the clock's own, because the
// caller is waiting for a specific answer and a clock that might be paused cannot
// give one. It takes the write lock for the whole run, so no reader sees a
// half-skipped world, and it bounds itself with SkipCap so a party that cannot
// arrive returns rather than hanging.
func (c *Campaign) SkipToArrival(ctx context.Context) (int, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	start := c.state.Tick
	for i := 0; i < c.opts.SkipCap; i++ {
		if !c.partyIsMarching() {
			return c.state.Tick - start, true, nil
		}
		if err := ctx.Err(); err != nil {
			return c.state.Tick - start, false, err
		}
		c.eng.SetOrders(nil)
		if err := c.eng.Tick(c.state); err != nil {
			c.lastErr = err
			return c.state.Tick - start, false, internalf("tick %d failed while skipping: %v", c.state.Tick, err)
		}
		c.ticksRun++
	}
	return c.state.Tick - start, c.partyIsMarching() == false, nil
}

func (c *Campaign) partyIsMarching() bool {
	p := c.state.Parties[c.party]
	if p == nil {
		return false
	}
	return p.Activity == model.ActMarching || p.Activity == model.ActResupplying
}

// writeSnapshot renders and writes the periodic snapshot.
func (c *Campaign) writeSnapshot() {
	c.mu.RLock()
	payload := c.renderSnapshotLocked()
	c.mu.RUnlock()
	c.flushSnapshot(payload)
}

// flushSnapshot writes snapshot bytes to disk. It runs outside the lock on
// purpose: a slow disk must not stall a reader.
func (c *Campaign) flushSnapshot(payload []byte) {
	if payload == nil || c.opts.SnapshotDir == "" || c.opts.SnapshotEvery <= 0 {
		return
	}
	if err := os.MkdirAll(c.opts.SnapshotDir, 0o755); err != nil {
		return
	}
	name := filepath.Join(c.opts.SnapshotDir,
		fmt.Sprintf("snapshot-%06d.json", c.TickNumber()))
	// Written to a temporary file and renamed, so a reader never sees a
	// half-written snapshot and a crash mid-write leaves the previous one intact.
	tmp := name + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, name)
}

// renderSnapshotLocked builds the on-disk snapshot. It runs under a read lock, so
// it must not mutate anything.
//
// The snapshot is for inspection and for the cause-log audit trail. It is not a
// save game: model.State has no serialisation, and inventing one is a larger
// change than this server's remit. See the contract's section 12.
func (c *Campaign) renderSnapshotLocked() []byte {
	type diskSnapshot struct {
		Tick        int               `json:"tick"`
		Year        float64           `json:"year"`
		Seed        uint64            `json:"seed"`
		StartYear   int               `json:"startYear"`
		PlayerRuler string            `json:"playerRuler"`
		HomeTown    string            `json:"homeTown"`
		Party       string            `json:"party"`
		Clock       wire.ClockState   `json:"clock"`
		Roster      wire.TroopStack   `json:"-"`
		Stacks      []wire.TroopStack `json:"roster"`
		Towns       []wire.TownState  `json:"towns"`
		CauseRows   []wire.CauseRow   `json:"causeRows"`
	}
	snap := diskSnapshot{
		Tick:        c.state.Tick,
		Year:        c.state.Year,
		Seed:        c.opts.Seed,
		StartYear:   c.opts.StartYear,
		PlayerRuler: EntityID(model.KindRuler, c.playerRuler),
		HomeTown:    EntityID(model.KindTown, c.homeTown),
		Party:       EntityID(model.KindParty, c.party),
		Clock: wire.ClockState{
			DaysPerRealSecond: c.scale,
			Paused:            c.scale == 0,
			Tick:              c.state.Tick,
			Day:               c.state.Tick % 365,
			Year:              c.state.Year,
			TicksPerSnapshot:  c.opts.SnapshotEvery,
		},
		Stacks:    c.ro.render(c.simTroops(), c.wagePerTroop()),
		Towns:     c.townsLocked(c.state),
		CauseRows: c.causeRowsLocked(0, 0),
	}
	payload, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return nil
	}
	return payload
}

// PlayerID returns the player's ruler id on the wire.
func (c *Campaign) PlayerID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return EntityID(model.KindRuler, c.playerRuler)
}

// PartyID returns the player's party id on the wire.
func (c *Campaign) PartyID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return EntityID(model.KindParty, c.party)
}

// HomeTownID returns the player's home town id on the wire.
func (c *Campaign) HomeTownID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return EntityID(model.KindTown, c.homeTown)
}

// validScale rejects a rate that is not a usable clock setting.
func validScale(scale float64) error {
	if scale != scale {
		return unprocessablef("That is not a speed the clock can run at.",
			"daysPerRealSecond is NaN")
	}
	if scale < 0 {
		return unprocessablef("The clock does not run backwards.",
			"daysPerRealSecond is negative: %s", strconv.FormatFloat(scale, 'g', -1, 64))
	}
	if scale > maxScale {
		return unprocessablef("That is faster than the world can turn.",
			"daysPerRealSecond is above the ceiling of %g: %s", maxScale,
			strconv.FormatFloat(scale, 'g', -1, 64))
	}
	return nil
}

// maxScale bounds the clock. A year a second is more than a player can read and
// more than a tick budget should be asked for.
const maxScale float64 = 366
