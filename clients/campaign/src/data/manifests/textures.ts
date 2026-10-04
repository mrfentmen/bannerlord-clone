/**
 * Texture manifest: PBR surfaces and HDRI skies, generated from public/textures/.
 *
 * Hana's lane (brief item 3): Pax applies these in scenes.
 */

export interface PbrSurface {
  id: string;
  albedo?: string;
  ao?: string;
  normal?: string;
  roughness?: string;
  metalness?: string;
  height?: string;
}

export interface HdriSky {
  id: string;
  path: string;
}

export const PBR_SURFACES: PbrSurface[] = [
  { id: "asphalt", albedo: "/public/textures/vendor/pbr/asphalt_albedo.jpg", ao: "/public/textures/vendor/pbr/asphalt_ao.jpg", normal: "/public/textures/vendor/pbr/asphalt_normal.jpg", roughness: "/public/textures/vendor/pbr/asphalt_roughness.jpg" },
  { id: "brick", albedo: "/public/textures/vendor/pbr/brick_albedo.jpg", ao: "/public/textures/vendor/pbr/brick_ao.jpg", normal: "/public/textures/vendor/pbr/brick_normal.jpg", roughness: "/public/textures/vendor/pbr/brick_roughness.jpg" },
  { id: "cobble", albedo: "/public/textures/vendor/pbr/cobble_albedo.jpg", normal: "/public/textures/vendor/pbr/cobble_normal.jpg", roughness: "/public/textures/vendor/pbr/cobble_roughness.jpg" },
  { id: "concrete", albedo: "/public/textures/vendor/pbr/concrete_albedo.jpg", ao: "/public/textures/vendor/pbr/concrete_ao.jpg", normal: "/public/textures/vendor/pbr/concrete_normal.jpg", roughness: "/public/textures/vendor/pbr/concrete_roughness.jpg" },
  { id: "dirt", albedo: "/public/textures/vendor/pbr/dirt_albedo.jpg", ao: "/public/textures/vendor/pbr/dirt_ao.jpg", normal: "/public/textures/vendor/pbr/dirt_normal.jpg", roughness: "/public/textures/vendor/pbr/dirt_roughness.jpg" },
  { id: "grass", albedo: "/public/textures/vendor/pbr/grass_albedo.jpg", ao: "/public/textures/vendor/pbr/grass_ao.jpg", normal: "/public/textures/vendor/pbr/grass_normal.jpg", roughness: "/public/textures/vendor/pbr/grass_roughness.jpg" },
  { id: "metal", albedo: "/public/textures/vendor/pbr/metal_albedo.jpg", ao: "/public/textures/vendor/pbr/metal_ao.jpg", normal: "/public/textures/vendor/pbr/metal_normal.jpg", roughness: "/public/textures/vendor/pbr/metal_roughness.jpg" },
  { id: "rock", albedo: "/public/textures/vendor/pbr/rock_albedo.jpg", ao: "/public/textures/vendor/pbr/rock_ao.jpg", normal: "/public/textures/vendor/pbr/rock_normal.jpg", roughness: "/public/textures/vendor/pbr/rock_roughness.jpg" },
  { id: "sand", albedo: "/public/textures/vendor/pbr/sand_albedo.jpg", ao: "/public/textures/vendor/pbr/sand_ao.jpg", normal: "/public/textures/vendor/pbr/sand_normal.jpg", roughness: "/public/textures/vendor/pbr/sand_roughness.jpg" },
  { id: "wood", albedo: "/public/textures/vendor/pbr/wood_albedo.jpg", ao: "/public/textures/vendor/pbr/wood_ao.jpg", normal: "/public/textures/vendor/pbr/wood_normal.jpg", roughness: "/public/textures/vendor/pbr/wood_roughness.jpg" },
];

export const HDRI_SKIES: HdriSky[] = [
  { id: "approaching_storm_1k", path: "/public/textures/vendor/hdris/approaching_storm_1k.hdr" },
  { id: "autumn_field_puresky_1k", path: "/public/textures/vendor/hdris/autumn_field_puresky_1k.hdr" },
  { id: "bambanani_sunset_1k", path: "/public/textures/vendor/hdris/bambanani_sunset_1k.hdr" },
  { id: "belfast_sunset_puresky_1k", path: "/public/textures/vendor/hdris/belfast_sunset_puresky_1k.hdr" },
  { id: "kiara_1_dawn_1k", path: "/public/textures/vendor/hdris/kiara_1_dawn_1k.hdr" },
  { id: "kloofendal_43d_clear_puresky_1k", path: "/public/textures/vendor/hdris/kloofendal_43d_clear_puresky_1k.hdr" },
  { id: "kloofendal_overcast_puresky_1k", path: "/public/textures/vendor/hdris/kloofendal_overcast_puresky_1k.hdr" },
  { id: "kloppenheim_02_puresky_1k", path: "/public/textures/vendor/hdris/kloppenheim_02_puresky_1k.hdr" },
  { id: "qwantani_dawn_1k", path: "/public/textures/vendor/hdris/qwantani_dawn_1k.hdr" },
  { id: "qwantani_night_puresky_1k", path: "/public/textures/vendor/hdris/qwantani_night_puresky_1k.hdr" },
  { id: "rogland_clear_night_1k", path: "/public/textures/vendor/hdris/rogland_clear_night_1k.hdr" },
  { id: "syferfontein_0d_clear_1k", path: "/public/textures/vendor/hdris/syferfontein_0d_clear_1k.hdr" },
];
