package campaign

import (
	"context"
	"fmt"
	"strings"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/construction"
)

// Building ids are the client's stable strings from types.ts: "walls",
// "barracks", and so on.
//
// They resolve to a project index by trimming the "building_" prefix off
// construction.List()'s Field, so the mapping is read out of the simulation's own
// registry rather than maintained here in parallel with it. Adding a project to
// the simulation therefore adds it to this route with no change to this file.
//
// The Bannerlord name and the modern display name are also accepted, because a
// client that read them off BuildingInfo would send either.

const buildingFieldPrefix = "building_"

// buildingIndex resolves a wire building id to a project index.
func buildingIndex(id string) (int, bool) {
	want := strings.ToLower(strings.TrimSpace(id))
	if want == "" {
		return 0, false
	}
	for i, def := range construction.List() {
		switch want {
		case strings.TrimPrefix(def.Field, buildingFieldPrefix),
			strings.ToLower(def.Name),
			strings.ToLower(def.Bannerlord):
			return i, true
		}
	}
	return 0, false
}

// buildingID is the inverse: a project index to the client's stable id.
func buildingID(index int) string {
	defs := construction.List()
	if index < 0 || index >= len(defs) {
		return ""
	}
	return strings.TrimPrefix(defs[index].Field, buildingFieldPrefix)
}

// buildingLevel reads a town's current tier for a project. The construction
// package keeps its own accessor for this; the town struct is read here so the
// snapshot can render all ten without reaching into unexported helpers.
func buildingLevel(t *model.Town, index int) int {
	switch index {
	case construction.Walls:
		return int(t.BuildingWalls)
	case construction.Barracks:
		return int(t.BuildingBarracks)
	case construction.Training:
		return int(t.BuildingTraining)
	case construction.Community:
		return int(t.BuildingCommunity)
	case construction.Commercial:
		return int(t.BuildingCommercial)
	case construction.Warehouse:
		return int(t.BuildingWarehouse)
	case construction.Farms:
		return int(t.BuildingFarms)
	case construction.Watch:
		return int(t.BuildingWatch)
	case construction.Infra:
		return int(t.BuildingInfra)
	case construction.Civic:
		return int(t.BuildingCivic)
	}
	return 0
}

// buildingInfos renders all ten projects for a town, with the price and duration
// of the next tier straight from the construction system's cost table.
func (c *Campaign) buildingInfos(t *model.Town) []wire.BuildingInfo {
	defs := construction.List()
	maxLevel := int(c.cfg.Construction.MaxLevel)
	out := make([]wire.BuildingInfo, 0, len(defs))
	for i, def := range defs {
		level := buildingLevel(t, i)
		info := wire.BuildingInfo{
			ID:         buildingID(i),
			Name:       def.Name,
			Bannerlord: def.Bannerlord,
			Level:      level,
			MaxLevel:   maxLevel,
			Blurb:      def.Blurb,
		}
		if level < maxLevel {
			cost := construction.Costs(c.cfg, i)[level]
			days := cost * c.cfg.Construction.DaysPerCost
			if days < 1 {
				days = 1
			}
			info.NextCost = round2(cost)
			info.NextDays = round2(days)
		}
		out = append(out, info)
	}
	return out
}

// Construct starts a settlement project.
//
// It calls the exported construction.StartConstruction, which is the same
// validation and the same charge the holder AI goes through: money on hand, one
// project at a time, a tier below the maximum, and the tier's cost taken up front
// with construction.days_per_cost days queued. Nothing about construction is
// reimplemented here.
//
// The conditions are read first, purely so a refusal can say which one it was.
// StartConstruction still does the deciding; this only reads the same fields to
// write a better sentence.
func (c *Campaign) Construct(ctx context.Context, req wire.ConstructRequest) (any, error) {
	index, ok := buildingIndex(req.BuildingID)
	if !ok {
		return nil, unprocessablef(
			fmt.Sprintf("There is no such project. This world builds %s.", joinNames(buildingIDs())),
			"buildingId %q is not one of the simulation's ten projects: %v", req.BuildingID, buildingIDs())
	}

	j := newJob("construct",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stageConstruct(v, w, req, index)
		}, nil)
	return c.Submit(ctx, j)
}

type constructStaged struct {
	result   wire.ConstructionResult
	accepted bool
	town     int
	index    int
}

func (c *Campaign) stageConstruct(v *sim.View, w *sim.WriteSet, req wire.ConstructRequest, index int) (any, error) {
	town := c.townRef(req.TownID)
	if town == nil {
		return nil, notFoundf("no town %q", req.TownID)
	}
	defs := construction.List()
	def := defs[index]
	level := buildingLevel(town, index)
	maxLevel := int(v.Cfg.Construction.MaxLevel)
	out := constructStaged{town: town.ID, index: index}

	if refusal := c.constructRefusal(town, index, level, maxLevel); refusal != nil {
		out.result = wire.ConstructionResult{OK: false, Message: refusal.Reason}
		return out, nil
	}

	if !construction.StartConstruction(v, w, v.Cfg, town.ID, town, index, "the player's order") {
		// StartConstruction refused despite the checks above agreeing. That is a
		// disagreement between this file and the construction system, which is a
		// bug rather than a world answer, so it is reported as one instead of
		// being dressed up as a refusal the player did something wrong about.
		return nil, internalf("construction.StartConstruction refused %s in %s after the pre-checks passed", def.Name, town.Name)
	}
	out.accepted = true
	cost := construction.Costs(v.Cfg, index)[level]
	days := cost * v.Cfg.Construction.DaysPerCost
	if days < 1 {
		days = 1
	}
	out.result = wire.ConstructionResult{
		OK: true,
		Message: fmt.Sprintf("%s starts on %s: tier %d for %s, %s days.",
			def.Name, town.Name, level+1, trimNum(cost), trimNum(days)),
	}
	return out, nil
}

func (c *Campaign) constructRefusal(town *model.Town, index, level, maxLevel int) *Refusal {
	defs := construction.List()
	if index < 0 || index >= len(defs) {
		return refuse("There is no such project.")
	}
	def := defs[index]
	if town.ConstructionBuilding >= 0 {
		other := buildingID(int(town.ConstructionBuilding))
		if other != "" {
			return refuse(fmt.Sprintf("%s is already building something else. One project at a time.",
				town.Name))
		}
	}
	if level >= maxLevel {
		return refuse(fmt.Sprintf("%s is already at %s' highest tier.", town.Name, def.Name))
	}
	cost := construction.Costs(c.cfg, index)[level]
	if town.Money < cost {
		return refuse(fmt.Sprintf("%s for %s, and %s has %s.",
			trimNum(cost), def.Name, town.Name, trimNum(town.Money)))
	}
	if town.IsBesieged {
		return refuse(town.Name + " is under siege. Nobody is building.")
	}
	return nil
}

func buildingIDs() []string {
	defs := construction.List()
	out := make([]string, 0, len(defs))
	for i := range defs {
		out = append(out, buildingID(i))
	}
	return out
}
