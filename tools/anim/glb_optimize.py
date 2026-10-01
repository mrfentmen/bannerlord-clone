#!/usr/bin/env python3
"""
GLB Optimization Pipeline for bannerlord-clone.

Takes source GLB files and produces web-optimized versions:
- Draco mesh compression (if available)
- Texture resizing and format conversion
- Removal of unused nodes/materials
- LOD generation (high/med/low)
- Size reporting

Usage:
    python3 glb_optimize.py --input public/anims/Soldier.glb --output public/anims/opt/Soldier.glb
    python3 glb_optimize.py --input-dir public/anims --output-dir public/anims/opt --lods

Requires: pygltflib, Pillow
    pip install pygltflib Pillow
"""

import argparse
import json
import os
import struct
import sys
from pathlib import Path


def get_glb_info(input_path):
    """Extract basic info from a GLB file without full parsing."""
    with open(input_path, 'rb') as f:
        # GLB header: magic(4) + version(4) + length(4)
        header = f.read(12)
        if len(header) < 12:
            return None
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:  # 'glTF'
            return None
        
        # JSON chunk: chunkLength(4) + chunkType(4) + data
        chunk_header = f.read(8)
        if len(chunk_header) < 8:
            return None
        json_len, json_type = struct.unpack('<II', chunk_header)
        json_data = f.read(json_len)
        
        try:
            gltf = json.loads(json_data)
        except:
            return None
        
        return {
            'meshes': len(gltf.get('meshes', [])),
            'nodes': len(gltf.get('nodes', [])),
            'materials': len(gltf.get('materials', [])),
            'textures': len(gltf.get('textures', [])),
            'images': len(gltf.get('images', [])),
            'animations': len(gltf.get('animations', [])),
            'skins': len(gltf.get('skins', [])),
            'file_size': os.path.getsize(input_path),
        }


def optimize_glb(input_path, output_path, quality='high'):
    """
    Optimize a GLB file.
    
    For now this does:
    - Copies the file (placeholder for Draco compression)
    - Reports size savings opportunities
    
    TODO: Integrate pygltflib for actual optimization when available.
    TODO: Draco compression via gltf-transform or Blender headless.
    """
    info = get_glb_info(input_path)
    if not info:
        print(f"ERROR: {input_path} is not a valid GLB", file=sys.stderr)
        return False
    
    print(f"\nOptimizing: {input_path}")
    print(f"  Meshes: {info['meshes']}, Nodes: {info['nodes']}, "
          f"Materials: {info['materials']}, Textures: {info['textures']}, "
          f"Animations: {info['animations']}, Skins: {info['skins']}")
    print(f"  Original size: {info['file_size'] / 1024:.1f} KB")
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    # For now, copy the file. Real optimization needs pygltflib + Draco.
    # This pipeline structure is ready for those integrations.
    import shutil
    shutil.copy2(input_path, output_path)
    
    new_size = os.path.getsize(output_path)
    print(f"  Output size: {new_size / 1024:.1f} KB")
    print(f"  Output: {output_path}")
    
    # Report optimization opportunities
    if info['textures'] > 4:
        print(f"  NOTE: {info['textures']} textures — consider atlasing")
    if info['materials'] > 8:
        print(f"  NOTE: {info['materials']} materials — consider merging")
    if info['nodes'] > 50:
        print(f"  NOTE: {info['nodes']} nodes — check for unused nodes")
    
    return True


def generate_lods(input_path, output_dir, base_name):
    """
    Generate LOD versions (high/med/low).
    
    TODO: Actual decimation needs Blender headless or meshoptimizer.
    For now, creates placeholder structure.
    """
    print(f"\nGenerating LODs for {base_name}...")
    lods = ['high', 'med', 'low']
    for lod in lods:
        lod_path = os.path.join(output_dir, f"{base_name}_{lod}.glb")
        # Placeholder: copy original for high, would decimate for med/low
        import shutil
        shutil.copy2(input_path, lod_path)
        print(f"  {lod}: {lod_path}")
    print("  NOTE: LOD decimation not yet implemented — all LODs are copies.")
    print("  TODO: Integrate Blender headless decimate modifier or meshoptimizer.")


def main():
    parser = argparse.ArgumentParser(description='Optimize GLB files for web')
    parser.add_argument('--input', help='Input GLB file')
    parser.add_argument('--output', help='Output GLB file')
    parser.add_argument('--input-dir', help='Input directory (batch mode)')
    parser.add_argument('--output-dir', help='Output directory (batch mode)')
    parser.add_argument('--lods', action='store_true', help='Generate LOD versions')
    parser.add_argument('--quality', default='high', choices=['high', 'med', 'low'],
                        help='Target quality')
    args = parser.parse_args()
    
    if args.input and args.output:
        # Single file mode
        success = optimize_glb(args.input, args.output, args.quality)
        if args.lods and success:
            base = Path(args.output).stem
            out_dir = os.path.dirname(args.output)
            generate_lods(args.output, out_dir, base)
        sys.exit(0 if success else 1)
    
    elif args.input_dir and args.output_dir:
        # Batch mode
        input_dir = Path(args.input_dir)
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        glbs = list(input_dir.glob('*.glb'))
        if not glbs:
            print(f"No GLB files found in {input_dir}", file=sys.stderr)
            sys.exit(1)
        
        print(f"Found {len(glbs)} GLB files")
        failed = 0
        for glb in glbs:
            out_path = output_dir / glb.name
            if not optimize_glb(str(glb), str(out_path), args.quality):
                failed += 1
            if args.lods:
                generate_lods(str(out_path), str(output_dir), glb.stem)
        
        print(f"\nDone: {len(glbs) - failed}/{len(glbs)} optimized")
        sys.exit(1 if failed else 0)
    
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
