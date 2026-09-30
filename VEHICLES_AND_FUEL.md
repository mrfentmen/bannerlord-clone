# VEHICLES_AND_FUEL.md

Vehicles replace Bannerlord's horses, and fuel becomes a fifth resource. This file is an **addendum** to ECONOMY.md and MARCH_AND_WAR.md. When you merge it, add the fuel rows below to those files. Status: proposal, pending the fuel decision in CHANGELOG.md.

---

## 1. FUEL AS A RESOURCE

| Resource | What it is | Main uses | Main sources |
|---|---|---|---|
| **Fuel** | Energy for vehicles and generators | Vehicle travel, battle vehicles, town generators, industry | Refineries, depots, imports, capture, raiding |

- Fuel is stored in town depots and party or convoy tanks.
- It is consumed by distance traveled, idle time, and combat.
- It is a strategic target: refineries, depots, and fuel convoys are prime raid objectives.
- A blockade or raid on fuel supply hits marches, caravans, and industry at once.

## 2. VEHICLE CLASSES

| Class | Role | Era availability (typical) | Notes |
|---|---|---|---|
| Bike and motorcycle | Fast scouting, small parties | All tiers | Low cargo, low protection |
| Light utility vehicle | Scouting, small party transport | All tiers | Cheap, fast, fragile |
| Truck | Cargo and troop transport | All tiers | Big cargo, slow off-road |
| Armored carrier | Protected troop transport | Tier 2 and later | Costly, heavy, uses more fuel |
| Tank and heavy armor | Breakthrough and siege | Tier 1 early types, better in later tiers | Very costly, strong, fuel hungry |
| Horses and pack animals | Poor-region mobility | All tiers | Need food, no fuel |

Aircraft and boats are Later (FEATURES.md section 12).

Vehicles are data entries:

```
vehicles: id, class, name (generic), tier, speed_road, speed_offroad, cargo, crew, passengers,
          armor_zones, fuel_capacity, fuel_per_km, fuel_idle, maintenance_rate, metal_cost, unlock_year
```

## 3. FUEL IN THE SYSTEMS

Fuel plugs into existing systems through shared fields:

- **March system:** consumes fuel per kilometer for vehicle parties. No fuel means the party drops to foot speed, or is stranded if it has no other means.
- **Supply system:** fuel is resupplied at friendly depots, bought in markets, or taken by raiding.
- **Market system:** fuel is a market good with a price. Scarcity raises prices, which raises the cost of everything moved by vehicle.
- **Logistics system:** caravans and convoys carry fuel. A robbed fuel convoy leaves the destination dry.
- **Industry and power:** factories, generators, and hospitals may draw fuel. A dry depot can cause blackouts and shutdowns (INFRASTRUCTURE_AND_MEDIA.md).
- **Battle:** vehicles use fuel on the battlefield. A vehicle out of fuel is a stationary target.

## 4. MAINTENANCE AND BREAKDOWNS

- Vehicles have a **condition** from 0 to 1. Condition falls with distance, rough terrain, combat damage, and neglect.
- Low condition raises breakdown chance. Breakdowns strand vehicles on the road until repaired or abandoned.
- Repair needs metal, parts, and time. Engineering and Gunsmithing skills speed repairs (CHARACTER.md section 3). A mechanic companion reduces breakdown chance.
- A vehicle depot or motor pool (town project) allows faster and cheaper repairs.

## 5. CARGO AND CAPACITY

- Vehicles raise cargo capacity and party speed on roads, but mixed columns move at the speed of the slowest member unless split (MARCH_AND_WAR.md section 1).
- Fuel and food both weigh on cargo. A heavy load lowers speed and raises consumption.
- Party inventory has a vehicle section with cargo and fuel tanks tracked separately.

## 6. ROADS, TERRAIN, AND FUEL

- Road quality matters: highways cost less fuel per kilometer than dirt tracks.
- Mountains, mud, snow, and off-road travel raise fuel use and breakdown chance.
- Bridges and roads damaged by war or neglect force detours and higher costs (INFRASTRUCTURE_AND_MEDIA.md).

## 7. ACQUIRING VEHICLES

- **Buy** from town markets (limited stock, prices vary by tier and industry).
- **Capture** from defeated forces (condition varies).
- **Build** in factories, needing metal and industrial capacity (V2).
- **Salvage** wrecks for parts and metal.
- Some sides lag in vehicle tech (ERA.md section 2), so vehicle supply differs by side and year.

## 8. CAUSE AND EFFECT CHAINS (test cases)

1. **Dry convoy.** Raiders hit a fuel convoy, the destination depot runs low, vehicle parties slow down, patrols thin out, road safety drops, raiders grow.
2. **Refinery loss.** A refinery is captured or damaged, fuel prices spike, trucks stop moving, food deliveries slow, a city starts to starve.
3. **Stranded army.** An army marches too far by vehicle, fuel runs out, the column is stuck, supplies cannot reach it, morale falls, desertion begins.
4. **Neglected fleet.** Vehicle condition falls from lack of parts, breakdowns increase, caravans arrive late, prices climb.
5. **Fuel boom.** A side captures fuel supply, mobility rises, raids grow faster, neighbors struggle to respond.

None of these are scripted. Each emerges from fuel, vehicle condition, roads, and market systems interacting.

## 9. V1 SCOPE

- One or two vehicle types (a light utility vehicle and one armored type).
- Fuel as a fifth resource with depots and convoys.
- Basic breakdowns and repairs.
- Vehicles in battle limited to a few per side.

## 10. FIELDS TO ADD WHEN MERGING

Town fields: `fuel_stock`, `depot_capacity`. Party fields: `fuel`, `vehicle_condition`. Ruler fields: fuel in wealth. Market: `fuel` good. Systems: fuel use in the March and Supply systems, breakdown check in the Logistics system.
