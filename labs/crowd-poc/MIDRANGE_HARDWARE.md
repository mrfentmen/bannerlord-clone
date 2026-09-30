# Mid-range hardware definition

Required by `TESTING_AND_BALANCE.md` section 8: *"Define 'mid-range hardware' once and write it in
CHANGELOG.md ... then test there."* The definition was listed as an open decision in `CHANGELOG.md`.

This file is that definition. It is stated **before** any benchmark was run, so the benchmark could not
be reverse-fitted to a convenient result.

---

## 1. The definition

"Mid-range consumer hardware" for a browser WebGL2 game, as of 2026:

| Component | Class | Concrete reference parts |
|---|---|---|
| **CPU** | 6 physical desktop cores, or 4 modern mobile cores | AMD Ryzen 5 5600 / Intel Core i5-12400 / Apple M1 |
| **GPU** | Discrete GPU with its own VRAM, or Apple-silicon integrated GPU | NVIDIA GTX 1650 / RTX 3050, AMD RX 5500 XT / RX 6600 |
| **RAM** | 16 GB system RAM | — |
| **Storage** | SSD | — |
| **Browser** | Current Chrome, Edge, Firefox or Safari, hardware acceleration on | — |

### Why these parts

- The **GPU** is the binding constraint for crowd rendering. `SPEC.md` section 5.1 targets are decided
  by draw calls and texture memory (`ASSETS.md` section 5.5). A discrete GPU with its own VRAM is the
  line between "consumer" and "needs a dedicated card". GTX 1650 is the cheapest card still sold new
  at volume; RTX 3050 is the common ~$200-250 recommendation.
- The **CPU** class is set by the simulation, not the renderer. The battle scene and the campaign
  simulation both run on the main thread's siblings, so a 2-core part is not a realistic floor for the
  finished game even if the crowd renderer alone would tolerate it.
- **16 GB** rather than 8 GB because `RISKS.md` row 12 (web load size) and row 13 (save data) are
  unresolved, and 8 GB puts browser memory pressure on the asset streaming path.

### A stricter secondary target

`TESTING_AND_BALANCE.md` section 8 asks for one definition. One number for "mid-range" is not enough to
build a performance budget on, because it hides the direction of the error. This project also records a
**low-end floor** as a secondary, non-blocking target:

| Target | Meaning | Blocking? |
|---|---|---|
| Mid-range | Section 1 above | **Yes.** This gates the Phase 3 exit criterion. |
| Low-end floor | 4-core CPU, GTX 1050 / RX 560 / Iris Xe or Vega 8, 8 GB RAM | No. Advisory. Recorded so a later phase knows how much margin exists. |

---

## 2. The machine this PoC was measured on

There is **one** machine available. It is stated in full, unedited, because
`CONSTITUTION.md` section 7.2 requires the hardware to be named for any performance claim.

| Component | This machine | vs mid-range definition |
|---|---|---|
| **Model** | MacBook Pro 13-inch, 2015 (`MacBookPro12,1`) | — |
| **CPU** | Intel Core i5-5257U @ 2.70 GHz, Broadwell, 2 physical cores / 4 threads | **Below.** 2 cores vs 6. Roughly 1/3 the multi-thread throughput and about half the single-thread rate of a Ryzen 5 5600. |
| **GPU** | Intel Iris Graphics 6100 (integrated, Gen8, no dedicated VRAM, 1.5 GB max shared) | **Well below.** No dedicated VRAM at all. A GTX 1650 has roughly 8-10x the raster throughput; an RTX 3050 roughly 12-15x. |
| **RAM** | 8 GB | **Below.** Half the defined 16 GB. |
| **OS** | macOS, Darwin 24.3.0 | — |
| **Browser** | Google Chrome (stable) via Playwright, **new headless, real GPU** | Matches. |

### The GPU is genuinely real, not software

This matters more than anything else on the page, so it is verified rather than assumed.
`tools/probe-gpu.mjs` reads `WEBGL_debug_renderer_info` from the actual benchmark browser and prints:

```
renderer: ANGLE (Intel Inc., Intel(R) Iris(TM) Graphics 6100, OpenGL 4.1)
```

Software rasterisers report themselves differently, and forcing `--use-angle=metal` on this machine
makes Chrome fall back to SwiftShader, which is not a valid measurement. The benchmark harness
therefore asserts the renderer string is **not** SwiftShader and refuses to report numbers otherwise.

### What this means for the result

This machine is **below** the mid-range definition on CPU, GPU and RAM simultaneously. That makes it a
**conservative** test bed, and the asymmetry has to be stated honestly:

- **If a target is hit here, it is hit on mid-range hardware with margin.** A machine slower on every
  axis passed it, so a machine faster on every axis passes it. This direction of inference is sound.
- **If a target is missed here, it is NOT proven to be missed on mid-range hardware.** The GPU-bound
  portion of the cost might disappear entirely on a discrete card. A failure here is a signal to
  investigate, not a verdict.

The report states which of these two cases applies to each measurement. No measurement in this repo is
presented as a mid-range result; they are presented as *lower-bound* results measured on the hardware
named above, which is the stronger claim.

---

## 3. Why not simulate a slower machine

Deliberately slowing the CPU, or rendering at reduced resolution to stand in for a weaker GPU, would
produce a number that is a product of a model rather than a measurement. `CONSTITUTION.md` section 7.4
bans shipping a facade, and a synthetic slow-down is a facade.

Instead the benchmark reports, for every configuration, the measured **CPU frame time** and **GPU frame
time** separately, so the reader can see which half of the frame is the constraint and how much of the
budget is left. That is a real measurement, and it is the number that transfers to other hardware.
