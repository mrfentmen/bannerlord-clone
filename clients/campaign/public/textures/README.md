# PBR textures — `vendor/pbr/`

## What is PBR?

PBR = **Physically Based Rendering**. It's how modern games make
surfaces look real instead of flat.

Old way: one image pasted on a model. The asphalt looks the same
whether it's noon or midnight — flat and fake.

PBR way: each surface ships as a **set of maps** that describe the
physical material, and the engine combines them with the scene's
lights every frame:

| Map | File suffix | What it does |
|-----|-------------|--------------|
| Albedo | `_albedo.jpg` | The base color, with no lighting baked in. Pure "what color is this stuff". |
| Normal | `_normal.jpg` | Fakes tiny surface bumps in the lighting — cracks in asphalt, grain in wood — without extra geometry. |
| Roughness | `_roughness.jpg` | Per-pixel shininess. Puddles on asphalt go glossy, dry patches stay dull. This is what sells realism. |
| Ambient occlusion | `_ao.jpg` | Darkens crevices where light can't reach — the gaps between cobblestones, the pores in concrete. |

In Babylon.js these plug straight into `PBRMaterial`
(albedoTexture, bumpTexture, roughness via microSurface, ambientTexture).
One material definition per surface, reused across every mesh that
needs it — cheap and consistent.

## What's here

10 CC0 surfaces from Poly Haven, 1k resolution (good detail-to-size
balance for a web game), 39 files, ~23 MB:

| Prefix | Surface | Poly Haven source | Use for |
|--------|---------|-------------------|---------|
| `asphalt_` | Aerial asphalt | aerial_asphalt_01 | Roads (top-down photo, ideal for the map view) |
| `grass_` | Grass ground | grass_ground | Fields, parks |
| `dirt_` | Brown mud | brown_mud | Dirt roads, terrain |
| `brick_` | Brick wall | brick_wall_001 | Buildings |
| `metal_` | Blue metal plate | blue_metal_plate | Vehicles, containers, props |
| `wood_` | Oak planks | oak_wood_planks | Buildings, props |
| `cobble_` | Cobblestone | cobblestone_01 | Town squares, old streets |
| `rock_` | Rock face | rock_face | Cliffs, terrain |
| `concrete_` | Brushed concrete | brushed_concrete_04 | Sidewalks, urban |
| `sand_` | Coast sand | coast_sand_01 | Beaches, desert |

`cobble` has 3/4 maps (no separate AO shipped by Poly Haven for that
set — the normal map carries the depth).

## License

CC0 1.0 Universal (public domain). No attribution required.
See `LICENSES.md`.
