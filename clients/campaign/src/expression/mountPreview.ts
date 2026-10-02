/**
 * Task 134: mount preview. Every mount type viewable in a cycling viewer
 * with its stats — speed and carrying capacity.
 */

export interface MountType {
  id: string;
  name: string;
  /** Map speed multiplier. */
  speed: number;
  /** Extra carrying capacity. */
  capacity: number;
  blurb: string;
}

export const MOUNT_TYPES: MountType[] = [
  { id: "horse", name: "Horse", speed: 1.4, capacity: 20, blurb: "The classic campaign mount." },
  { id: "motorcycle", name: "Motorcycle", speed: 2.2, capacity: 5, blurb: "Fast, loud, thirsty." },
  { id: "atv", name: "ATV", speed: 1.8, capacity: 12, blurb: "Goes anywhere a horse sulks at." },
  { id: "pickup", name: "Pickup truck", speed: 2.0, capacity: 40, blurb: "Hauls the whole war chest." },
];

export interface MountViewer {
  index: number;
}

export function createMountViewer(): MountViewer {
  return { index: 0 };
}

export function currentMount(viewer: MountViewer): MountType {
  return MOUNT_TYPES[viewer.index]!;
}

export function nextMount(viewer: MountViewer): MountViewer {
  return { index: (viewer.index + 1) % MOUNT_TYPES.length };
}

export function prevMount(viewer: MountViewer): MountViewer {
  return { index: (viewer.index - 1 + MOUNT_TYPES.length) % MOUNT_TYPES.length };
}
