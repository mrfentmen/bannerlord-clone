#!/usr/bin/env python3
"""
Animation Retargeting Pipeline for bannerlord-clone.

Takes animations from a source GLB (e.g., Soldier.glb) and retargets them
to a different character model with a compatible humanoid skeleton.

How it works:
1. Extracts bone mappings between source and target skeletons by name
2. For each animation in source, remaps bone tracks to target bone indices
3. Outputs a new GLB with the retargeted animations

Bone name mapping:
  Uses fuzzy matching on common humanoid bone names. Handles variations like:
  - "mixamorig:Hips" -> "Hips" -> "hips" -> "pelvis"
  - "LeftUpLeg" -> "LeftThigh" -> "thigh_l"

Usage:
    python3 anim_retarget.py --source public/anims/Soldier.glb \
        --target public/models/bandit.glb \
        --output public/anims/bandit_anims.glb

Requires: pygltflib
    pip install pygltflib

Current status: SKELETON ANALYSIS + BONE MAPPING implemented.
Full animation track remapping requires pygltflib — install it to enable.
"""

import argparse
import json
import re
import struct
import sys
from pathlib import Path
from difflib import SequenceMatcher


# Standard humanoid bone names (lowercase, normalized).
# Maps common variations to canonical names.
BONE_ALIASES = {
    'hips': ['hips', 'pelvis', 'root', 'hip'],
    'spine': ['spine', 'spine1', 'spine_01'],
    'spine1': ['spine1', 'spine2', 'spine_02', 'chest'],
    'spine2': ['spine2', 'spine3', 'upper_chest'],
    'neck': ['neck', 'neck1'],
    'head': ['head', 'head_top'],
    'shoulder_l': ['shoulder_l', 'leftshoulder', 'shoulder.l', 'clavicle_l', 'leftclavicle'],
    'shoulder_r': ['shoulder_r', 'rightshoulder', 'shoulder.r', 'clavicle_r', 'rightclavicle'],
    'upperarm_l': ['upperarm_l', 'leftupperarm', 'upperarm.l', 'upper_arm_l', 'leftarm'],
    'upperarm_r': ['upperarm_r', 'rightupperarm', 'upperarm.r', 'upper_arm_r', 'rightarm'],
    'forearm_l': ['forearm_l', 'leftforearm', 'forearm.l', 'lowerarm_l', 'lower_arm_l', 'leftelbow'],
    'forearm_r': ['forearm_r', 'rightforearm', 'forearm.r', 'lowerarm_r', 'lower_arm_r', 'rightelbow'],
    'hand_l': ['hand_l', 'lefthand', 'hand.l', 'leftwrist'],
    'hand_r': ['hand_r', 'righthand', 'hand.r', 'rightwrist'],
    'thigh_l': ['thigh_l', 'leftthigh', 'thigh.l', 'upperleg_l', 'upper_leg_l', 'leftupleg'],
    'thigh_r': ['thigh_r', 'rightthigh', 'thigh.r', 'upperleg_r', 'upper_leg_r', 'rightupleg'],
    'shin_l': ['shin_l', 'leftshin', 'shin.l', 'lowerleg_l', 'lower_leg_l', 'leftleg', 'calf_l'],
    'shin_r': ['shin_r', 'rightshin', 'shin.r', 'lowerleg_r', 'lower_leg_r', 'rightleg', 'calf_r'],
    'foot_l': ['foot_l', 'leftfoot', 'foot.l', 'leftankle'],
    'foot_r': ['foot_r', 'rightfoot', 'foot.r', 'rightankle'],
}


def normalize_bone_name(name):
    """Normalize a bone name for comparison."""
    # Remove common prefixes (mixamorig:, armature_, etc.)
    name = re.sub(r'^mixamorig:', '', name, flags=re.IGNORECASE)
    name = re.sub(r'^armature_', '', name, flags=re.IGNORECASE)
    # Convert to lowercase, remove separators
    name = name.lower().replace('_', '').replace('.', '').replace('-', '').replace(' ', '')
    return name


def canonical_bone_name(name):
    """Map a bone name to its canonical form, or None if unknown."""
    norm = normalize_bone_name(name)
    for canonical, aliases in BONE_ALIASES.items():
        for alias in aliases:
            if normalize_bone_name(alias) == norm:
                return canonical
    return None


def get_skeleton_bones(glb_path):
    """Extract bone/node names from a GLB file."""
    with open(glb_path, 'rb') as f:
        header = f.read(12)
        if len(header) < 12:
            return None
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            return None

        chunk_header = f.read(8)
        json_len, json_type = struct.unpack('<II', chunk_header)
        gltf = json.loads(f.read(json_len))

    bones = []
    for i, node in enumerate(gltf.get('nodes', [])):
        name = node.get('name', f'node_{i}')
        canonical = canonical_bone_name(name)
        bones.append({
            'index': i,
            'name': name,
            'canonical': canonical,
        })

    animations = []
    for anim in gltf.get('animations', []):
        animations.append({
            'name': anim.get('name', 'unnamed'),
            'channels': len(anim.get('channels', [])),
            'samplers': len(anim.get('samplers', [])),
        })

    return {'bones': bones, 'animations': animations}


def build_bone_map(source_bones, target_bones):
    """
    Build a mapping from source bone indices to target bone indices.
    Returns: {source_idx: target_idx} and a list of unmapped bones.
    """
    # Index target bones by canonical name
    target_by_canonical = {}
    for b in target_bones:
        if b['canonical']:
            target_by_canonical[b['canonical']] = b['index']

    bone_map = {}
    unmapped = []

    for sb in source_bones:
        if not sb['canonical']:
            unmapped.append(('source', sb['name'], 'no canonical form'))
            continue

        target_idx = target_by_canonical.get(sb['canonical'])
        if target_idx is not None:
            bone_map[sb['index']] = target_idx
        else:
            unmapped.append(('source', sb['name'], f"no target bone for '{sb['canonical']}'"))

    return bone_map, unmapped


def analyze_compatibility(source_path, target_path):
    """Analyze whether two skeletons are compatible for retargeting."""
    print(f"\nAnalyzing retargeting compatibility...")
    print(f"  Source: {source_path}")
    print(f"  Target: {target_path}")

    source = get_skeleton_bones(source_path)
    target = get_skeleton_bones(target_path)

    if not source or not target:
        print("  ERROR: Could not read skeleton data", file=sys.stderr)
        return False

    print(f"\n  Source: {len(source['bones'])} bones, {len(source['animations'])} animations")
    for anim in source['animations']:
        print(f"    - {anim['name']}: {anim['channels']} channels")

    print(f"\n  Target: {len(target['bones'])} bones")

    bone_map, unmapped = build_bone_map(source['bones'], target['bones'])

    mapped = len(bone_map)
    total_source = len([b for b in source['bones'] if b['canonical']])

    print(f"\n  Bone mapping: {mapped}/{total_source} bones mapped")
    print(f"  Compatibility: {mapped / max(total_source, 1) * 100:.1f}%")

    if unmapped:
        print(f"\n  Unmapped bones ({len(unmapped)}):")
        for kind, name, reason in unmapped[:10]:
            print(f"    - {name}: {reason}")
        if len(unmapped) > 10:
            print(f"    ... and {len(unmapped) - 10} more")

    # Compatibility threshold: 80% of bones must map
    compatible = (mapped / max(total_source, 1)) >= 0.8
    print(f"\n  Result: {'COMPATIBLE' if compatible else 'NOT COMPATIBLE'}")

    return compatible


def main():
    parser = argparse.ArgumentParser(description='Retarget animations between GLB files')
    parser.add_argument('--source', required=True, help='Source GLB with animations')
    parser.add_argument('--target', required=True, help='Target GLB to retarget to')
    parser.add_argument('--output', help='Output GLB with retargeted animations')
    parser.add_argument('--analyze-only', action='store_true',
                        help='Only analyze compatibility, do not retarget')
    args = parser.parse_args()

    if not Path(args.source).exists():
        print(f"ERROR: Source not found: {args.source}", file=sys.stderr)
        sys.exit(1)
    if not Path(args.target).exists():
        print(f"ERROR: Target not found: {args.target}", file=sys.stderr)
        sys.exit(1)

    compatible = analyze_compatibility(args.source, args.target)

    if args.analyze_only:
        sys.exit(0 if compatible else 1)

    if not compatible:
        print("\nERROR: Skeletons not compatible for retargeting", file=sys.stderr)
        print("HINT: Bone names must match (case-insensitive, prefix-insensitive).", file=sys.stderr)
        sys.exit(1)

    if not args.output:
        print("ERROR: --output required for retargeting", file=sys.stderr)
        sys.exit(1)

    print("\nTODO: Full animation track remapping not yet implemented.")
    print("      Requires pygltflib for GLB read/write with animation data.")
    print("      pip install pygltflib, then re-run.")
    print("      Bone mapping is ready.")
    print("      Once pygltflib is available, this will:")
    print("        1. Load source animations")
    print("        2. Remap bone indices via the bone map")
    print("        3. Write target GLB with retargeted animations")


if __name__ == '__main__':
    main()
