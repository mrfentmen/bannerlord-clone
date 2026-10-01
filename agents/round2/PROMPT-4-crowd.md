# PROMPT 4 — Lane 4: Crowd Rendering POC

**Paste this whole file as the agent's first message.**
**Folder you own: `labs/crowd-poc/` — and nothing else.**

---

## Your lane

You own the crowd-rendering proof of concept. Phase 3 is **the only phase in this project that already passed**, and your report is the most honest document in the repo. Keep it that way.

Three other agents are running in parallel in other folders. Your work is independent and does not wait on theirs.

## Read first

1. `CONSTITUTION.md` — §7.2 an exit criterion is a measurement, §7.3 nothing is done unless verified, §7.4 **a patch over a broken gate is a failed gate**
2. `agents/README.md`
3. `SPEC.md` §5.1 crowd rendering targets, §10 performance budgets
4. `labs/crowd-poc/REPORT.md` — your own report, read it fully before you touch anything
5. `labs/crowd-poc/MIDRANGE_HARDWARE.md`
6. `CHANGELOG.md` — append only

## The rules

- Write only inside `labs/crowd-poc/`.
- Root design docs are **read-only**. Contradictions go under **Unresolved**.
- `CHANGELOG.md` is **additive only**.
- **Prove it or it is not done.** Paste real output.
- Never delete or skip a failing test or benchmark to make a run pass.
- **No placeholders, stubs, or fake assets in shipped paths.**

---

## Where you actually stand

Your report is honest and it says two things plainly. Keep both.

**Passing, on the machine measured:**

| Target | Required | Median | Worst repeat | Result |
|---|---|---|---|---|
| 300 units at 60 fps | 60.0 | 60.0 | 59.9 | PASS |
| 1000 units at 30 fps | 30.0 | 34.2 | **27.8** | PASS on median, **1.09–1.14×** |

**The two caveats you wrote yourself, and they are the work:**

1. **The measuring machine is a 2015 MacBook Pro with integrated graphics — below the mid-range bar this project set.** Your own words: *"A pass here is a conservative lower bound, not evidence that mid-range hardware is comfortable."*
2. **The 1000-unit margin is 9–14% on the median and occasionally negative.** Your own words: *"the honest claim is 'the target is met on the median, and a bad run can miss it', not 'it holds 34 fps'."*

---

## Task 1 — benchmark on actual mid-range hardware

`MIDRANGE_HARDWARE.md` defines mid-range as a **6-core CPU with a discrete GPU**. **That has never been benchmarked.** `PHASES.md` Phase 3 exit criteria and `RISKS.md` row 2 both require it, and `CONSTITUTION.md` §7.4 says redefining success to something easier is a failed gate.

- Get onto a machine that meets the definition in `MIDRANGE_HARDWARE.md` and re-run the full benchmark.
- Record the exact CPU, GPU, and RAM, as you did before.
- Report the full distribution — median, range across sessions, and worst single repeat — not a single number.

**If you cannot get access to such hardware, that is a legitimate blocked result.** Log it under **Unresolved** with what you tried and what access you need. **Do not** substitute another machine and call it mid-range. Do not restate the existing result as if it were a new measurement.

**One thing that already protects you:** your harness refuses to report any number when the WebGL renderer string says SwiftShader or llvmpipe, because a software rasteriser measures the CPU rather than the renderer. Keep that.

## Task 2 — close the 1000-unit variance

One repeat in roughly sixteen dips to 27.8 fps, below the 30 fps target. You already tuned LOD thresholds with a deliberate margin because the machine was slow; on real mid-range hardware you may be able to tighten that.

- Determine what causes the dip. Is it GC, a shader recompile, a texture upload, or LOD thrash at a boundary?
- If it is fixable, fix it and re-benchmark. If it is inherent, **say so and explain why**, rather than tuning until one run looks clean.
- Report variance honestly even if the median improves. A stable 32 fps with a 30.5 worst case is a better result than a 36 fps median that occasionally fails, and you should say which one you have.

## Task 3 — the asset pipeline gate

`CONSTITUTION.md` §5.2 requires the asset manifest to be checked **as part of the build**: an asset without a manifest entry fails the build rather than shipping. Your lane owns the asset pipeline spike in `RISKS.md` §3.4.

- Check whether that build-time manifest check exists.
- If it does not, implement it and prove it fails on an unmanifested asset.
- `assets/manifest.json` exists — treat it as the source, not something to regenerate casually.

**You have a keyless CC0 asset path available.** `docs/mcp-servers.md` §5 documents `mcp-for-blender`, whose Poly Haven and Poly Pizza tools need no credentials. Poly Haven is **100% CC0 with no attribution obligation**, which is the cheapest possible answer to §5.

**Two blockers, both verified — do not rediscover them:**

1. **A GUI Blender must be running.** The addon refuses to start headless by design. Every tool routes through that bridge, so there is no partial mode.
2. **Blender GUI segfaults on a machine with no GPU or window server** (it died in `GPU_context_create`). If your machine is headless, this path is unavailable to you — log that and move on.

**Only Poly Haven and Poly Pizza are keyless.** Sketchfab, Hyper3D, Tripo, and Hunyuan3D all require credentials, and **you must not add a licence key or API token to reach them.**

## Task 4 — Phase 3 also gates Phase 4

`SPEC.md` §5.1 says the battle layer must mix in a small number of vehicles among many infantry, and `FEATURES.md` §13 warns vehicles are heavy meshes that will affect the crowd budget. Your numbers currently measure **infantry only**.

- Measure what infantry plus a plausible vehicle count costs.
- If vehicles break the budget, **report the real number** so the battle designer knows what to plan around. Do not quietly raise the troop target to hide it.

## Definition of done

- [ ] Benchmarked on hardware meeting the `MIDRANGE_HARDWARE.md` definition, or the blocker logged precisely.
- [ ] Full distribution reported: median, range, worst repeat. Never a single number alone.
- [ ] The 1000-unit variance explained — fixed, or characterised as inherent with a reason.
- [ ] Build-time asset manifest check exists and demonstrably fails on a missing entry.
- [ ] Vehicle-in-mix cost measured, or the blocker logged.
- [ ] `REPORT.md` updated with real output. `CHANGELOG.md` gets an additive **Built** row.

## Report back

1. **Done** — with pasted benchmark output and the full distribution.
2. **Blocked** — with the specific blocker and what access you need.
3. **Contradictions** — anything in the docs that does not match the measurements.
4. **Honest gaps** — stated plainly.

**The instruction that matters most for you:** your existing report is the standard the rest of the repo should meet. It said "this passes on the median and a bad run can miss it" rather than claiming a clean 34 fps. **Do not upgrade any honest caveat in that report to make this round look tidier.** `CONSTITUTION.md` §7.4 is explicit that redefining success is a failed gate.