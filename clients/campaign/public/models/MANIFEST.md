# GLB manifest for Rowan — Milo's 3D model staging

Per Pax's lane ruling: Milo's agents are out of clients/campaign scene wiring.
The 26 GLB files below are staged as files only. Wire them however fits the client.

All files are valid glTF 2.0. Target lengths are longest-axis metres for auto-scale.
Orientation note: troop-officer.glb geometry lies flat along Z; apply rotationX = -PI/2 to stand it up.

## Vehicles (9)
- pickup-truck.glb — target 7m
- motorcycle.glb — target 3.2m
- apc.glb — target 9m
- supply-truck.glb — target 10m
- humvee.glb — target 6m (was wired into the party convoy before backout)
- tank.glb — target 10m (regen v2: single-barrel fix verified)
- artillery.glb — target 8m
- patrol-boat.glb — target 12m
- helicopter.glb — target 16m (marginal quality; ambient/background use only)

## Troops (5)
- troop-gunner.glb — target 1.8m (marginal quality; verify in client)
- troop-medic.glb — target 1.8m
- troop-officer.glb — target 1.8m (needs rotationX = -PI/2)
- civilian.glb — target 1.8m (marginal quality; verify in client)
- warlord.glb — target 1.9m

## Structures (8)
- bunker.glb — target 12m
- tent.glb — target 6m
- concrete-barrier.glb — target 4m
- water-tower.glb — target 25m (industrial tower, batch 4)
- flag-pole.glb — target 12m
- farmhouse.glb — target 14m (regen v2: flat-slab fix verified)
- watchtower.glb — target 18m (regen v2: American fire-lookout style)

## NYC batch 5 (4)
- taxi.glb — target 5m (yellow cab, checker stripe, roof light)
- subway-entrance.glb — target 8m (staircase, railings, frame)
- food-cart.glb — target 3m (cart with striped umbrella)
- skyscraper.glb — target 120m (marginal detail; fine at map scale)

## Still generating (not yet staged)
Batches 6/7 in progress: fire-hydrant, traffic-light, street-lamp, police-barricade,
nyc-church, rooftop-water-tower, fire-station, newsstand, sidewalk-shed, warehouse,
parking-garage, apartment-block. Batch 8 queued after: brownstone-v2, bodega-v2,
nyc-tenement, office-tower, city-bus, subway-car. Manifest will be updated as they land.

## Notes
- package.json / package-lock.json: @babylonjs/loaders was added for the wiring; kept in place since your wiring will need it. Revert if you prefer.
- Generated-asset licensing is UNVERIFIED — do not ship these in a public build until cleared.
- Source files, previews, and review notes: ~/workspace/your_files/3d-batch/
