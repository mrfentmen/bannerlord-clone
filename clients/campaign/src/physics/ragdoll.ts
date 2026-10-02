/**
 * Ragdoll physics for fallen soldiers.
 *
 * Uses BABYLON.Ragdoll for body creation (handles GLB skeleton quirks),
 * then overlays Physics6DoFConstraints WITH angular limits. The built-in
 * Ragdoll never wires min/max into its hinge joints, so without this overlay
 * bodies fold into a ball. With limits, they sprawl naturally.
 *
 * Verified recipe (Babylon 8.56.2, Havok 1.3.14):
 * - scene.useRightHandedSystem = true (required for GLB ragdolls)
 * - 18 major bones (fingers/toes excluded — they cause instability)
 * - putBoxInBoneCenter: true (boxOffset is in meters; 0.5 launches finger boxes)
 * - Physics ground 12cm above visual ground (boxes smaller than mesh)
 */
import {
  Scene,
  TransformNode,
  Skeleton,
  Vector3,
  Matrix,
  Axis,
  PhysicsAggregate,
  PhysicsShapeType,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  Ragdoll,
  HavokPlugin,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

/** Major bones for ragdoll. Finger/toe bones excluded for stability. */
const MAJOR_BONES = [
  'Hips','Spine','Spine1','Spine2','Neck','Head',
  'LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand',
  'LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot',
];

/** Quadruped bones (horse). */
const HORSE_BONES = [
  'Body','Torso','Torso2','Torso3','Neck1','Neck2','Neck3','Head',
  'FrontUpperLeg.L','FrontLowerLeg.L','FrontUpperLeg.R','FrontLowerLeg.R',
  'BackUpperLeg.L','BackLowerLeg.L','BackUpperLeg.R','BackLowerLeg.R',
];

/** Bone name prefixes that may vary by model (mixamorig:, etc.) */
function findBone(skeleton: Skeleton, name: string) {
  let idx = skeleton.getBoneIndexByName(name);
  if (idx >= 0) return skeleton.bones[idx];
  for (const b of skeleton.bones) {
    if (b.name.endsWith(':' + name) || b.name.endsWith('_' + name)) return b;
  }
  return null;
}

function boneLength(bone: any, root: TransformNode): number {
  const kids = bone.getChildren();
  if (kids.length) {
    const a = bone.getAbsolutePosition(root);
    const c = kids[0].getAbsolutePosition(root);
    return Math.max(0.1, a.subtract(c).length());
  }
  return 0.25;
}

interface BoxDims { w: number; h: number; d: number; mass: number; }

function boxDims(bone: any, root: TransformNode): BoxDims {
  const n = bone.name.toLowerCase();
  const len = boneLength(bone, root);
  // Horse (quadruped) bones
  if (/torso|body|back/i.test(n) && !/leg/i.test(n)) {
    return { w: 0.6, h: Math.max(0.5, len * 0.9), d: 0.5, mass: 80 };
  }
  if (/neck/i.test(n)) return { w: 0.3, h: Math.max(0.4, len * 0.8), d: 0.3, mass: 20 };
  if (/head/i.test(n) && !/socket/i.test(n)) return { w: 0.35, h: 0.5, d: 0.3, mass: 15 };
  if (/upperleg/i.test(n)) {
    const s = 0.25;
    return { w: s, h: Math.max(s, len * 0.7), d: s, mass: 25 };
  }
  if (/lowerleg/i.test(n)) {
    const s = 0.18;
    return { w: s, h: Math.max(s, len * 0.7), d: s, mass: 15 };
  }
  // Humanoid bones
  if (/spine|hips/i.test(n)) return { w: 0.36, h: Math.max(0.3, len * 0.9), d: 0.28, mass: 14 };
  if (/head/i.test(n)) return { w: 0.26, h: 0.3, d: 0.28, mass: 5 };
  if (/neck/i.test(n)) return { w: 0.16, h: 0.2, d: 0.16, mass: 3 };
  if (/hand/i.test(n)) return { w: 0.14, h: 0.22, d: 0.1, mass: 2 };
  if (/foot/i.test(n)) return { w: 0.14, h: 0.12, d: 0.3, mass: 3 };
  if (/upleg|leg/i.test(n)) {
    const s = 0.2;
    return { w: s, h: Math.max(s, len * 0.7), d: s, mass: 9 };
  }
  const s = Math.min(0.24, Math.max(0.14, len * 0.5));
  return { w: s, h: Math.max(s, len * 0.7), d: s, mass: 5 };
}

type Limit = { axis: PhysicsConstraintAxis; minLimit?: number; maxLimit?: number };
const lim = (axis: PhysicsConstraintAxis, mn: number, mx: number): Limit => ({ axis, minLimit: mn, maxLimit: mx });
const LOCKXYZ: Limit[] = [
  lim(PhysicsConstraintAxis.LINEAR_X, 0, 0),
  lim(PhysicsConstraintAxis.LINEAR_Y, 0, 0),
  lim(PhysicsConstraintAxis.LINEAR_Z, 0, 0),
];

/** Angular joint limits per body part (radians). Prevents ball-folding. */
function limitsFor(boneName: string): Limit[] {
  const n = boneName.toLowerCase();
  const AX = PhysicsConstraintAxis.ANGULAR_X;
  const AY = PhysicsConstraintAxis.ANGULAR_Y;
  const AZ = PhysicsConstraintAxis.ANGULAR_Z;
  if (/knee|elbow/i.test(n)) return [...LOCKXYZ, lim(AX, 0.05, 2.3), lim(AY, 0, 0), lim(AZ, 0, 0)];
  if (/shoulder|hip/i.test(n)) return [...LOCKXYZ, lim(AX, -1.0, 1.0), lim(AY, -0.6, 0.6), lim(AZ, -0.6, 0.6)];
  if (/spine|hips/i.test(n)) return [...LOCKXYZ, lim(AX, -0.4, 0.4), lim(AY, -0.25, 0.25), lim(AZ, -0.25, 0.25)];
  if (/neck|head/i.test(n)) return [...LOCKXYZ, lim(AX, -0.55, 0.55), lim(AY, -0.45, 0.45), lim(AZ, -0.35, 0.35)];
  if (/hand/i.test(n)) return [...LOCKXYZ, lim(AX, -0.4, 0.4), lim(AY, -0.25, 0.25), lim(AZ, -0.25, 0.25)];
  if (/foot/i.test(n)) return [...LOCKXYZ, lim(AX, -0.5, 0.5), lim(AY, -0.2, 0.2), lim(AZ, -0.2, 0.2)];
  return [...LOCKXYZ, lim(AX, -0.8, 0.8), lim(AY, -0.35, 0.35), lim(AZ, -0.35, 0.35)];
}

export interface RagdollHandle {
  /** Trigger the ragdoll with an optional impulse (e.g., from damage direction). */
  trigger(impulse?: Vector3): void;
  /** Clean up physics bodies and constraints. */
  dispose(): void;
  /** True after trigger() has been called. */
  readonly active: boolean;
}

/**
 * Initialize Havok physics for a scene. Call once per scene.
 * Returns the Havok plugin instance.
 */
export async function initPhysics(scene: Scene): Promise<HavokPlugin> {
  const havok = await HavokPhysics();
  const hk = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), hk);
  return hk;
}

/**
 * Create a ragdoll for a skinned mesh.
 *
 * @param scene The Babylon scene (must have physics enabled)
 * @param skeleton The model's skeleton
 * @param modelRoot The TransformNode parenting the model's meshes
 * @returns A handle to trigger/dispose the ragdoll
 */
export function createRagdoll(scene: Scene, skeleton: Skeleton, modelRoot: TransformNode): RagdollHandle {
  modelRoot.computeWorldMatrix(true);
  skeleton.computeAbsoluteMatrices(true);
  skeleton.prepare(true);

  // Detect quadruped (horse) vs humanoid by bone names
  const isHorse = HORSE_BONES.some(n => findBone(skeleton, n));
  const boneList = isHorse ? HORSE_BONES : MAJOR_BONES;
  const majorBones = boneList.map(n => findBone(skeleton, n)).filter(Boolean) as any[];
  if (majorBones.length === 0) {
    throw new Error('createRagdoll: no major bones found in skeleton');
  }

  // Use BABYLON.Ragdoll for body creation (handles skeleton quirks)
  const config = majorBones.map(b => {
    const dims = boxDims(b, modelRoot);
    return {
      bone: b.name,
      width: dims.w, height: dims.h, depth: dims.d,
      putBoxInBoneCenter: true,
      mass: dims.mass,
      rotationAxis: Axis.X,
      min: -1.2, max: 1.2,
    };
  });
  const ragdoll = new Ragdoll(skeleton, modelRoot, config);

  // Overlay 6DoF limited joints (built-in hinges have no limits)
  const dof6: Physics6DoFConstraint[] = [];
  for (const h of ragdoll.getConstraints()) h.isEnabled = false;

  const rootBone = skeleton.getChildren()[0];
  const bIndex = (bone: any) => majorBones.indexOf(bone);
  for (let i = 0; i < majorBones.length; i++) {
    if (majorBones[i] === rootBone) continue;
    let p = majorBones[i].getParent(), pi = -1;
    while (p) { pi = bIndex(p); if (pi >= 0) break; p = p.getParent(); }
    if (pi < 0) continue;

    const aggP = ragdoll.getAggregate(pi);
    const aggC = ragdoll.getAggregate(i);
    const wmatP = aggP.transformNode.computeWorldMatrix(true);
    const invP = Matrix.Invert(wmatP);
    const bonePos = majorBones[i].getAbsolutePosition(modelRoot);
    const pivotA = Vector3.TransformCoordinates(bonePos, invP);
    const pivotB = bonePos.subtract(aggC.transformNode.getAbsolutePosition());

    const c6 = new Physics6DoFConstraint(
      {
        pivotA, pivotB,
        axisA: Axis.X, axisB: Axis.X,
        perpAxisA: Axis.Y, perpAxisB: Axis.Y,
        collision: false,
      },
      limitsFor(majorBones[i].name) as any,
      scene
    );
    aggP.body.addConstraint(aggC.body, c6);
    c6.isEnabled = false;
    dof6.push(c6);
  }

  let active = false;
  const origRagdoll = ragdoll.ragdoll.bind(ragdoll);
  ragdoll.ragdoll = () => {
    origRagdoll();
    for (const c of dof6) c.isEnabled = true;
  };

  return {
    get active() { return active; },
    trigger(impulse?: Vector3) {
      if (active) return;
      active = true;
      ragdoll.ragdoll();
      if (impulse) {
        const agg = ragdoll.getAggregate(-1);
        const rp = agg.transformNode.getAbsolutePosition();
        agg.body.applyImpulse(impulse, rp);
      }
    },
    dispose() {
      for (const c of dof6) c.dispose();
      ragdoll.dispose();
    },
  };
}

/**
 * Create a physics ground with the collision surface raised 12cm above the
 * visual mesh. The ragdoll boxes are smaller than the visible mesh, so this
 * keeps the rendered body from sinking through the floor.
 */
export function createGroundCollider(scene: Scene, width: number, height: number): TransformNode {
  const groundPhys = new TransformNode('groundPhys', scene);
  // Note: caller should position this 0.12 above their visual ground
  new PhysicsAggregate(
    groundPhys,
    PhysicsShapeType.BOX,
    { mass: 0, restitution: 0.15, extents: new Vector3(width, 0.1, height) },
    scene
  );
  return groundPhys;
}
