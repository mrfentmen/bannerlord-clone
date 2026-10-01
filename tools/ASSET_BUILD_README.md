# Asset Build Pipeline — tools/process-assets.py

Implements **ASSETS.md steps 4–6 (Convert, Optimise, Unify)**. Steps 1–3
already exist as `tools/fetch-assets.py`, `tools/manifest-check.py`, and
`tools/build-inventory.py`.

No Blender required. Everything is measured from the actual file bytes —
there are no placeholder or mock code paths.

## Subcommands

### `audit <glb> --class <class>`
Gate check against the ASSETS.md section 5 budgets. Reports:

- **scale** — 1 unit = 1 metre (step 4). Per-class plausible height ranges;
  a model outside its range is a violation and the report suggests the
  scale factor that maps it to the class reference height.
- **triangles** — section 5.2 close-tier budgets
  (building 5k, vehicle 15k, weapon 3k, prop 500, troop 12k).
- **textures** — section 5.1 per-slot resolution budgets, resolved from
  embedded or external image references.

Exit 0 on pass, **2 on budget violation** (details printed), 1 on errors.

Classes: `building vehicle weapon prop environment character_body
character_gear character_head`. Gear/heads skip the absolute scale gate
and standalone tri budget — they are worn relative to a body and budgeted
inside the 12k troop total.

### `process <glb> --class <class> --out <dir>`
- If the model fails the scale gate, bakes `reference_height / height`
  into the scene-root node transforms (uniform, handles both `scale` and
  `matrix` nodes). Triangle data is untouched.
- Embeds external textures into the GLB so the output is self-contained.
- Writes `<name>.glb` into `--out` and prints the applied factor.

### `lod <glb> --out <dir>`
Run on the **processed** (metre-scale) GLB. Produces:

- `<name>_mid.glb` — MID tier. Vertex-clustering decimation implemented in
  numpy: vertices are quantised to a 3D grid, cluster centroids become the
  new vertices, degenerate/duplicate triangles are dropped, and the grid
  resolution is binary-searched so the result lands near **35% of the
  source triangle count**. Normals are re-averaged, UVs are
  cluster-averaged, the base texture is embedded. The tool re-loads the
  written file and asserts the tri count matches.
- `<name>_far.png` — FAR tier billboard. Rendered by a small software
  rasterizer: orthographic 3/4 view, z-buffered barycentric
  rasterization, UV-interpolated texture sampling, lambert shading,
  RGBA output with transparent background (256×256).
- `<name>_far.glb` — the billboard as a 2-triangle camera-facing quad,
  sized to the impostor's real-world footprint in metres, UV-mapped to
  the PNG (texture embedded).
- `<name>_far.json` — descriptor: texture name, `size_m` footprint,
  view direction, pixel coverage.

### `--update-manifest --processed-dir <dir> --class <class> --source-id <id> [--manifest <path>]`
Appends one entry per processed `.glb`/`.png` to `assets/manifest.json`
(default) with all ASSETS.md 2.1 fields: `id, path, source_url,
source_site, author, licence, licence_copy, date_retrieved,
attribution_text, class, lod_tiers, modifications, sha256`.
Licence provenance is inherited from the source pack's manifest entry.
Re-running is idempotent (existing ids are skipped).

## Build check

`tools/manifest-check.py` was extended to resolve manifest `path`s
relative to the repo root first (falling back to the historical
`originals/<basename>` lookup), so processed assets under
`assets/processed/` are covered by the same fail-the-build hash check
as originals. New flag: `--root`.

## Demo

`assets/processed/demo/` holds the pipeline output for
`building-type-a.glb` (Kenney city-kit-suburban, CC0-1.0):

- `building-type-a.glb` — close tier, 1174 tris, scale fixed
  0.834 m → 5.000 m (×5.9985 baked into node transforms)
- `building-type-a_mid.glb` — mid tier, 427 tris (36.4% of source)
- `building-type-a_far.png` / `_far.glb` / `_far.json` — billboard,
  9.42 × 6.61 m footprint, 35.8% pixel coverage

Reproduce:

```bash
python3 tools/process-assets.py audit  <glb> --class building   # expect exit 2: SCALE
python3 tools/process-assets.py process <glb> --class building --out assets/processed/demo
python3 tools/process-assets.py lod assets/processed/demo/building-type-a.glb --out assets/processed/demo
python3 tools/process-assets.py audit assets/processed/demo/building-type-a.glb --class building  # PASS
python3 tools/process-assets.py --update-manifest --processed-dir assets/processed/demo \
    --class building --source-id kenney_city_kit_suburban
python3 tools/manifest-check.py   # all entries verified
```

## Tests

`tools/test_process_assets.py` — 10 tests, all against a real Kenney GLB
extracted from the repo's own zip: scale-violation audit, post-process
audit pass, baked node scale, tri-count preservation, MID tri ratio,
billboard PNG/quad/descriptor, manifest field completeness + hash match,
manifest-check verification of new entries, update idempotency.

## Known limitations

- Sparse accessors are rejected (none in the Kenney packs).
- External `.bin` buffers are supported; interleaved (`byteStride`)
  accessors are supported.
- Animated/skinned meshes: transforms are read but skinning is not
  applied (character pipeline, step 5 rigging, is future work).
- The MID decimator merges all primitives into one mesh; per-material
  splits are not preserved (fine for the low-poly packs in use).
