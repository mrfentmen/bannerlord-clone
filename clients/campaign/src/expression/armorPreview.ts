/**
 * Task 132: armor preview. A turntable preview of an armor piece — the
 * piece rotates (rotation state in degrees) next to its stat sheet.
 * Pure presentation state; the 3D scene renders from the same descriptor.
 */

export type ArmorSlot = "head" | "body" | "legs";

export interface ArmorPiece {
  id: string;
  name: string;
  slot: ArmorSlot;
  /** Damage reduction. */
  armor: number;
  /** Weight slows the wearer. */
  weight: number;
  value: number;
}

export interface ArmorPreview {
  piece: ArmorPiece;
  /** Turntable rotation, degrees. */
  rotation: number;
}

export function previewArmor(piece: ArmorPiece): ArmorPreview {
  return { piece: { ...piece }, rotation: 0 };
}

/** Rotate the turntable; wraps at 360. */
export function rotatePreview(preview: ArmorPreview, degrees: number): ArmorPreview {
  const rotation = ((preview.rotation + degrees) % 360 + 360) % 360;
  return { ...preview, rotation };
}

/** Stat lines for the sheet. */
export function armorStats(piece: ArmorPiece): string[] {
  return [
    `Armor ${piece.armor}`,
    `Weight ${piece.weight}`,
    `Value ${piece.value}¤`,
    `Slot ${piece.slot}`,
  ];
}
