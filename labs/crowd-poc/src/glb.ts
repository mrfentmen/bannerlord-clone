/**
 * Reader for the GLBs this repo's own pipeline writes.
 *
 * Deliberately narrow: one skinned mesh, one material, no animations, no extensions. The Python
 * writer in tools/pipeline/gltf.py is equally narrow and the two are meant to stay in step. A
 * general-purpose loader would be more code with more silent failure modes, and CONSTITUTION.md
 * section 7.3 does not allow a component to be "close enough".
 */

const COMPONENT: Record<number, { ch: string; size: number; array: (b: ArrayBuffer, off: number, n: number) => number[] }> = {
  5120: { ch: "i8", size: 1, array: (b, o, n) => [...new Int8Array(b, o, n)] },
  5121: { ch: "u8", size: 1, array: (b, o, n) => [...new Uint8Array(b, o, n)] },
  5122: { ch: "i16", size: 2, array: (b, o, n) => [...new Int16Array(b, o, n)] },
  5123: { ch: "u16", size: 2, array: (b, o, n) => [...new Uint16Array(b, o, n)] },
  5125: { ch: "u32", size: 4, array: (b, o, n) => [...new Uint32Array(b, o, n)] },
  5126: { ch: "f32", size: 4, array: (b, o, n) => [...new Float32Array(b, o, n)] },
};
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export interface ProcessedMesh {
  name: string;
  /** Flat xyz. */
  position: Float32Array;
  /** Flat xyz. */
  normal: Float32Array;
  /** 4 joint indices per vertex. */
  joints: Uint16Array;
  /** 4 weights per vertex, normalised to sum to 1. */
  weights: Float32Array;
  indices: Uint32Array;
  jointCount: number;
  triCount: number;
  vertexCount: number;
  /** One of: flat colour, or PNG bytes per map. */
  material: {
    baseColorFactor?: [number, number, number, number];
    maps?: { baseColour?: Uint8Array; normal?: Uint8Array; roughness?: Uint8Array };
  };
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

function splitGlb(buf: ArrayBuffer): { json: any; binary: Uint8Array } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  if (dv.getUint32(4, true) !== 2) throw new Error("GLB version 2 required");
  const total = dv.getUint32(8, true);
  let off = 12;
  let json: any = null;
  let binary = new Uint8Array(0);
  while (off < Math.min(total, buf.byteLength)) {
    const len = dv.getUint32(off, true);
    const kind = dv.getUint32(off + 4, true);
    const chunk = new Uint8Array(buf, off + 8, len);
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (kind === 0x004e4942) binary = chunk;
    off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, binary };
}

function accessor(json: any, idx: number, bytes: Uint8Array): { values: ArrayLike<number>; count: number; ncomp: number; type: string } {
  const a = json.accessors[idx];
  const c = COMPONENT[a.componentType];
  if (!c) throw new Error(`accessor ${idx}: unsupported componentType ${a.componentType}`);
  const ncomp = NCOMP[a.type];
  if (!ncomp) throw new Error(`accessor ${idx}: unsupported type ${a.type}`);
  if (!("bufferView" in a)) throw new Error(`accessor ${idx}: sparse/zero accessors are not supported`);
  const bv = json.bufferViews[a.bufferView];
  if (bv.byteStride) throw new Error(`accessor ${idx}: byteStride is not supported`);
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const count = a.count * ncomp;
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  if (start + count * c.size > ab.byteLength) throw new Error(`accessor ${idx}: reads past the buffer`);
  return { values: c.array(ab, start, count), count: a.count, ncomp, type: a.type };
}

export function loadGlb(url: string): Promise<ProcessedMesh> {
  return fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`failed to fetch ${url}: HTTP ${r.status}`);
    return parseGlb(await r.arrayBuffer());
  });
}

export function parseGlb(buf: ArrayBuffer): ProcessedMesh {
  const { json, binary } = splitGlb(buf);

  const prim = json.meshes[0].primitives[0];
  const pos = accessor(json, prim.attributes.POSITION, binary);
  const nrm = accessor(json, prim.attributes.NORMAL, binary);
  const jnt = accessor(json, prim.attributes.JOINTS_0, binary);
  const wgt = accessor(json, prim.attributes.WEIGHTS_0, binary);
  const idx = accessor(json, prim.indices, binary);

  const mat = json.materials[prim.material ?? 0];
  const pbr = mat.pbrMetallicRoughness ?? {};
  const images = (i: number | undefined) => {
    if (i === undefined) return undefined;
    const bv = json.bufferViews[json.images[json.textures[i].source].bufferView];
    return binary.subarray((bv.byteOffset ?? 0), (bv.byteOffset ?? 0) + bv.byteLength);
  };

  const posArr = pos.values as ArrayLike<number>;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) {
    for (let c = 0; c < 3; c++) {
      const v = posArr[i * 3 + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }

  return {
    name: json.meshes[0].name ?? "mesh",
    position: Float32Array.from(posArr as number[]),
    normal: Float32Array.from(nrm.values as number[]),
    joints: Uint16Array.from(jnt.values as number[]),
    weights: Float32Array.from(wgt.values as number[]),
    indices: Uint32Array.from(idx.values as number[]),
    jointCount: json.skins[0].joints.length,
    triCount: idx.count / 3,
    vertexCount: pos.count,
    material: {
      baseColorFactor: pbr.baseColorFactor,
      maps: {
        baseColour: images(pbr.baseColorTexture?.index),
        normal: images(mat.normalTexture?.index),
        roughness: images(pbr.metallicRoughnessTexture?.index),
      },
    },
    bounds: { min, max },
  };
}

/** The far tier is the impostor atlas, not a mesh, so only these two tiers come from a GLB. */
export type MeshTiers = Record<"close" | "mid", ProcessedMesh>;
export type TroopSources = { body: MeshTiers; weapon: MeshTiers };
