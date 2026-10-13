/**
 * Siege equipment, modernized (tasks 681-700).
 *
 * The 1000-task list was written for medieval siege gear -- ladders, battering
 * rams, catapults, trebuchets. The game is set in modern America, so the siege
 * train is modern: breaching trucks instead of rams, artillery strikes instead
 * of catapults, concrete barriers instead of palisades. Every entry reuses a
 * GLB already staged in the model manifest; nothing here invents a file.
 *
 * The `task` field is the original medieval task number, so the 1000-task list
 * can be checked off against the modern equivalent. `medieval` names the thing
 * this replaces, so a reader of the old spec can find its way here.
 */

export type SiegeRole =
  | 'breach-vehicle'   // drives into the gate: the battering ram, modernized
  | 'fire-support'     // artillery/mortar strike: the catapult, modernized
  | 'barrier'          // what the defenders hide behind: palisades, modernized
  | 'shelter'          // tents: siege camp, modernized
  | 'logistics'        // carts: the baggage train, modernized
  | 'gate';            // what gets breached

export interface SiegeEntry {
  /** Original task number (681-700). */
  task: number;
  /** The medieval thing this replaces. */
  medieval: string;
  /** What it is now. */
  id: string;
  /** Model manifest name. */
  file: string;
  role: SiegeRole;
  /** Why this GLB is the right stand-in. */
  note: string;
}

/**
 * The modern siege train. Files are manifest names under public/models/;
 * each was verified present on disk when this catalogue was written.
 */
export const SIEGE_CATALOGUE: readonly SiegeEntry[] = [
  { task: 681, medieval: 'siege ladder', id: 'siege-ram-truck', file: 'pickup-truck.glb', role: 'breach-vehicle', note: 'Ladders scale walls; the truck rams gates. Same job -- get the assault team inside.' },
  { task: 682, medieval: 'battering ram', id: 'siege-breach-humvee', file: 'humvee.glb', role: 'breach-vehicle', note: 'The ram, with an engine. Drives the gate.' },
  { task: 683, medieval: 'siege tower', id: 'siege-box-truck', file: 'vendor/fable51-worlds/union-square-sf/public/assets/models/vehicles/box_truck.glb', role: 'breach-vehicle', note: 'Tall box truck: the tower\'s modern shape -- height and cover in one vehicle.' },
  { task: 684, medieval: 'catapult', id: 'siege-artillery', file: 'supply-truck.glb', role: 'fire-support', note: 'The truck carries the mortar; the strike itself is the ExplosionEffect (task 665).' },
  { task: 685, medieval: 'trebuchet', id: 'siege-artillery-2', file: 'vendor/fable51-worlds/union-square-sf/public/assets/models/vehicles/box_truck.glb', role: 'fire-support', note: 'Second fire-support vehicle; heavy thrower, same as the trebuchet was.' },
  { task: 686, medieval: 'ballista', id: 'siege-sniper-truck', file: 'pickup-truck.glb', role: 'fire-support', note: 'Precision fire instead of a giant crossbow: a marksman\'s truck.' },
  { task: 687, medieval: 'mantlet (mobile shield)', id: 'siege-barrier', file: 'concrete-barrier.glb', role: 'barrier', note: 'The mantlet, in concrete. Dragged into place, hides the crew.' },
  { task: 688, medieval: 'siege tent', id: 'siege-tent', file: 'tent.glb', role: 'shelter', note: 'Siege camp shelter, as staged.' },
  { task: 689, medieval: 'supply cart', id: 'siege-supply', file: 'supply-truck.glb', role: 'logistics', note: 'The baggage train, motorized.' },
  { task: 690, medieval: 'ammo cart', id: 'siege-ammo', file: 'vendor/fable51-worlds/union-square-sf/public/assets/models/vehicles/box_truck.glb', role: 'logistics', note: 'Ammo rides in the box truck.' },
  { task: 691, medieval: 'medical tent', id: 'siege-medical', file: 'tent.glb', role: 'shelter', note: 'Same tent GLB, parked as the aid station.' },
  { task: 692, medieval: 'command tent', id: 'siege-command', file: 'vendor/sakura-rally/assets/models/props/tent.glb', role: 'shelter', note: 'The rally tent reads as a command post.' },
  { task: 693, medieval: 'palisade wall', id: 'siege-wall', file: 'concrete-barrier.glb', role: 'barrier', note: 'Palisades are wood; these are concrete. Same wall.' },
  { task: 694, medieval: 'wooden gate', id: 'siege-gate', file: 'concrete-barrier.glb', role: 'gate', note: 'The gate the ram truck drives. Barriers stand in until a gate GLB is staged.' },
  { task: 695, medieval: 'stone wall section', id: 'siege-stone-wall', file: 'concrete-barrier.glb', role: 'barrier', note: 'Stone is stone; concrete is close enough at battle distance.' },
  { task: 696, medieval: 'wall tower', id: 'siege-tower-sandbags', file: 'sandbags.glb', role: 'barrier', note: 'Sandbag fighting position: the tower\'s job without the height.' },
  { task: 697, medieval: 'drawbridge', id: 'siege-drawbridge', file: 'concrete-barrier.glb', role: 'gate', note: 'No drawbridge GLB staged; barriers mark the crossing point.' },
  { task: 698, medieval: 'portcullis', id: 'siege-portcullis', file: 'concrete-barrier.glb', role: 'gate', note: 'No portcullis GLB staged; barriers mark the gate line.' },
  { task: 699, medieval: 'murder holes (visual)', id: 'siege-murder-holes', file: 'sandbags.glb', role: 'barrier', note: 'Firing positions above the gate, in sandbags.' },
  { task: 700, medieval: 'boiling oil pot', id: 'siege-oil-pot', file: 'concrete-barrier.glb', role: 'barrier', note: 'No oil-pot equivalent; the gate defenses are barriers. Honest gap, not a fake model.' },
];

/** A siege entry by original task number, or null. */
export function siegeEntry(task: number): SiegeEntry | null {
  return SIEGE_CATALOGUE.find((e) => e.task === task) ?? null;
}

/** Every siege entry with a role. */
export function siegeByRole(role: SiegeRole): SiegeEntry[] {
  return SIEGE_CATALOGUE.filter((e) => e.role === role);
}
