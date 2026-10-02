"""Rig retargeting: source rig joint names -> shared skeleton joint names.

The transfer is rotation-relative: for each mapped joint,
    q_target_local = q_source_rest^-1 * q_source_anim
so the source's rest-pose orientation never leaks into the target. The shared
skeleton's rest rotations are identity, which is why the relative rotation can
be applied directly. Translations are never transferred except through the
root-motion node (see extract.py); every other joint keeps the shared
skeleton's authored bind translation.

Two source rigs are supported out of the box:
  * "mixamo"      - mixamorig:* rigs (three.js Soldier.glb, Xbot.glb, Mixamo FBX)
  * "quaternius"  - Quaternius CharacterArmature rigs (SWAT, modular packs)
"""

import numpy as np

_M = "mixamorig:"


def _mirror(names):
    out = {}
    for k, v in names.items():
        out[k] = v
    return out


# Each entry: source joint name -> shared skeleton joint name.
MIXAMO_MAP = {
    _M + "Hips": "pelvis",
    _M + "Spine": "spine_01",
    _M + "Spine1": "spine_02",
    _M + "Spine2": "spine_03",
    _M + "Neck": "neck_01",
    _M + "Head": "Head",
    _M + "LeftShoulder": "clavicle_l",
    _M + "LeftArm": "upperarm_l",
    _M + "LeftForeArm": "lowerarm_l",
    _M + "LeftHand": "hand_l",
    _M + "RightShoulder": "clavicle_r",
    _M + "RightArm": "upperarm_r",
    _M + "RightForeArm": "lowerarm_r",
    _M + "RightHand": "hand_r",
    _M + "LeftUpLeg": "thigh_l",
    _M + "LeftLeg": "calf_l",
    _M + "LeftFoot": "foot_l",
    _M + "LeftToeBase": "ball_l",
    _M + "RightUpLeg": "thigh_r",
    _M + "RightLeg": "calf_r",
    _M + "RightFoot": "foot_r",
    _M + "RightToeBase": "ball_r",
}

QUATERNIUS_MAP = {
    "Hips": "pelvis",
    "Abdomen": "spine_01",
    "Torso": "spine_02",
    "Chest": "spine_03",
    "Neck": "neck_01",
    "Head": "Head",
    "Shoulder.L": "clavicle_l",
    "UpperArm.L": "upperarm_l",
    "LowerArm.L": "lowerarm_l",
    "Wrist.L": "hand_l",
    "Shoulder.R": "clavicle_r",
    "UpperArm.R": "upperarm_r",
    "LowerArm.R": "lowerarm_r",
    "Wrist.R": "hand_r",
    "UpperLeg.L": "thigh_l",
    "LowerLeg.L": "calf_l",
    "Foot.L": "foot_l",
    "UpperLeg.R": "thigh_r",
    "LowerLeg.R": "calf_r",
    "Foot.R": "foot_r",
    # Quaternius has no toe joints; ball_l/r stay at rest.
    # "Body" (between Root and Hips) carries no animation in the shipped clips
    # and is intentionally unmapped.
}

RIG_MAPS = {"mixamo": MIXAMO_MAP, "quaternius": QUATERNIUS_MAP}

# Nodes that may carry root motion, in preference order. The first one whose
# world translation actually moves during the clip wins.
ROOT_MOTION_CANDIDATES = ["Hips", "Body", "Root", _M + "Hips"]

_FINGER_KEYS = ("Thumb", "Index", "Middle", "Ring", "Pinky")


def is_culled(rig, name):
    """Joints the shared skeleton intentionally drops.

    Finger joints (each costs bake space and shader time for motion no one
    sees at crowd scale) and armature roots / end markers carry no baked
    animation. Culled joints are reported by validate.py, never silently
    ignored, and anything culled-but-not-listed-here is still rejected.
    """
    if rig == "mixamo":
        base = name.split("mixamorig:")[-1]
        return any(k in base for k in _FINGER_KEYS) or base.endswith("End")
    if rig == "quaternius":
        # PT.L/R are prop sockets (weapon attach points parented to the
        # armature root), not body joints.
        return name in ("Root", "Body", "PT.L", "PT.R") or \
            any(k in name for k in _FINGER_KEYS)
    return False


def quat_conj(q):
    return np.array([-q[0], -q[1], -q[2], q[3]])


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ])


def quat_norm(q):
    n = np.linalg.norm(q)
    return q / n if n > 1e-12 else np.array([0.0, 0.0, 0.0, 1.0])


def relative_rotation(source_rest, source_anim):
    """Rotation of the animated pose relative to the source rest pose."""
    return quat_norm(quat_mul(quat_conj(quat_norm(source_rest)), quat_norm(source_anim)))


def check_coverage(rig, skeleton_joints):
    """Every animated skeleton joint (all but root) must be reachable from the rig map."""
    mapped = set(RIG_MAPS[rig].values())
    missing = [j for j in skeleton_joints if j != "root" and j not in mapped]
    return missing


def detect_rig(gltf):
    """Guess the rig from joint names. Returns 'mixamo', 'quaternius', or None."""
    names = set()
    for s in gltf.skins:
        for j in s.joints:
            names.add(gltf.nodes[j].name)
    if any(n.startswith("mixamorig:") for n in names):
        return "mixamo"
    if "CharacterArmature" in str(names) or any(n in QUATERNIUS_MAP for n in names):
        return "quaternius"
    return None


def detect_rig_safe(path):
    """detect_rig on a file path; None if the file cannot be read."""
    try:
        import gltf as gltf_mod
        return detect_rig(gltf_mod.load(path))
    except Exception:
        return None
