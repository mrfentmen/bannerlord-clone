# Post-processing recipe (ART_AND_AUDIO.md line 28)

Concrete, implementable values for the campaign client's post chain.
All numbers are starting points tuned against the era grade; adjust ±10%
in playtesting, never more, so the art direction stays coherent.

## Era grade: "dust and neon"

Modern America, slightly worn. Warm highlights, cool shadows, restrained
saturation. Target look matches `clients/campaign/public/art/loading/*.webp`.

### Color grade (lift / gamma / gain, per channel RGB)

| Tier | Lift (shadows) | Gamma (mids) | Gain (highlights) | Saturation | Contrast |
|---|---|---|---|---|---|
| low | (0.015, 0.010, 0.005) | (1.00, 0.99, 0.97) | (1.02, 1.00, 0.96) | 0.92 | 1.03 |
| med | (0.020, 0.012, 0.004) | (1.00, 0.985, 0.96) | (1.03, 1.00, 0.95) | 0.88 | 1.05 |
| high | (0.025, 0.015, 0.005) | (1.00, 0.98, 0.95) | (1.04, 1.00, 0.94) | 0.85 | 1.06 |

Notes:
- Shadows pushed toward teal-green (lift B < lift R), highlights toward amber
  (gain R > gain B). That split is the whole "era" look.
- White balance: 5600K daylight baseline, tint +2 toward green in shadows only.

### Film grain

| Tier | Amount (luma stddev) | Size | Animated |
|---|---|---|---|
| low | 0.0 (off) | — | — |
| med | 0.028 | 1.0 px | yes, 24 fps |
| high | 0.045 | 1.0 px | yes, 24 fps |

Monochromatic grain (luma only), no chroma noise. Fade grain to 50% in UI
screens so text stays crisp.

### Vignette

| Tier | Strength | Radius (screen fraction) | Feather |
|---|---|---|---|
| low | 0.0 (off) | — | — |
| med | 0.28 | 0.62 | 0.35 |
| high | 0.35 | 0.58 | 0.40 |

Vignette multiplies luminance only; never crush below lift values above.

### Bloom (high tier only)

- Threshold 0.85, knee 0.15, intensity 0.25, radius 6 px.
- Off on low/med. This is a campaign map game, not a rave.

### What runs per tier

| Effect | low | med | high |
|---|---|---|---|
| color grade LUT | yes | yes | yes |
| vignette | no | yes | yes |
| film grain | no | yes | yes |
| bloom | no | no | yes |
| motion blur | no | no | no (never — strategy UI) |
| depth of field | no | no | cinematic only |

Post-processing must stay optional at low settings (ART_AND_AUDIO.md §10);
the grade LUT is the only effect that runs on low, and it is a single
fullscreen pass.

## Implementation hint (Babylon.js)

Use `BABYLON.ImageProcessingPostProcess` for lift/gamma/gain + vignette
(it exposes `colorGradingTexture`, `vignetteEnabled`, `vignetteWeight`),
a small custom grain shader for med/high, and skip bloom entirely if the
frame budget is tight — the grade carries 90% of the look.
