# BRIEF — Phase 2 · E: Preview's gauges measure what ships

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: Preview measures, per selected target (desktop / phone-hi / phone-lo), the spec's list (bootstrap, each slab artifact, secondary assets, transfer size, decode/parse, CPU and GPU residency, draws, triangles, frame cost, transition spikes, startup requirement); the startup sequence is exposed with FIRST TRUTHFUL FRAME and WARD USABLE marked and TIME TO WARD measured; residency is reported per BAKED / VISIBLE / SELECTED / OPENED; every gauge names its instrument and is proven able to fail; Jacob has read the numbers on two towns
-->

**Boz drafted this 2026-10-04 at Jacob's request; Jacob dispatches.** Phase 2, tranche 3: the measurement half of the Preview
upgrade, which tranche 2 did not cover. It runs **alongside B** (camera); the two share `src/preview/PreviewApp.jsx`, so coordinate.
It starts after **D** landed, deliberately: D made Preview's tiers render what each target ships (`fe5f5497`), so the gauges now
point at the right render.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- The kit (Preview and its instruments), and the Ward only to read what it loads. ⛔ No pours or bakes;
  `node scripts/bake-in-flight.mjs` before saving anything the dev servers import. Ports: kit 5173, Ward 5180. No new servers.
- ⛔ **MEASURE, DON'T OPTIMISE.** Spec, *Performance Rule*: *"Measure before optimizing. Do not begin by cutting polygons, reducing
  textures, adding impostors/LOD, partitioning the slab or building streaming."* If a number looks bad, report it with its
  instrument; don't fix it here.
- Commit only your own paths. B is live in `src/preview/` too: `ListAgents` → `SendMessage` before editing a file it holds.
- **Three-part fix** (`CLAUDE.md`); registers: `cartograph/PREVIEW.md` (the instrument) and `OPERATIONS.md` § Preview (the knobs).

## Read first

1. **The spec** (the authority), verbatim at the end of `cartograph/_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md`:
   sections **Preview Measurement**, **Cold Start / Time to Ward**, **Residency / Activation**, **Performance Rule**, and the
   *Done* lines *"Preview sees and measures the actual production runtime"* and *"Time to Ward, residency and steady-state render
   cost are measurable."* Use its words: FIRST TRUTHFUL FRAME, WARD USABLE, TIME TO WARD, BAKED → VISIBLE → SELECTED → OPENED.
2. **What exists, as evidence (not the frame):**
   - `src/preview/GpuMonitor.jsx`: per-frame draws and triangles off `renderer.info`, a rolling frame time from rAF deltas, a spike
     log tagged by gesture (`noteEvent`), per-layer cost by toggle (`measureToggle`, `SAMPLE_WINDOW`).
   - `src/preview/deviceProfiles.js`: the reference phones are named (phone-hi = iPhone 16 Pro Max, phone-lo = Galaxy A54), and
     **the budget numbers are marked INTERIM**.
   - `src/lib/qualityProfile.js`: what each tier runs (`postFxOff`, `includesPass`), from D.
   - `cartograph/PREVIEW.md §3–§4`: the toggle convention (`.visible`, never the mount) and the three caveats. ⭐ *"Trust the all-on
     total, not the sum of the per-layer deltas."* The spec keeps this rule.
   - `_handoffs/HANDOFF-preview-measurement.md`: the June design (virtual devices, device budgets, thermal / memory / transition
     axes). Prior thinking; where it differs from the spec, the spec wins.
   - `scratch/runtime-continuity/MAP.md`: the continuity map (what each surface loads; the Ward fetches its manifest once after D).

## ⛔⛔ Instrument rules this project learned the hard way

- **`renderer.info.render.frame` counts RENDER PASSES, not frames** (about 20 per frame here). Two instruments on one page once read
  88–99 "fps" and 8.5 fps at the same moment (`ROADMAP H-9`). It's a liveness signal, not an FPS meter.
- **Main-thread time and GPU time are different questions.** Measured 2026-10-03 on HPDM: 2-second frames with ~5 ms of script,
  i.e. GPU-bound. `long-animation-frame` entries (with script attribution) separate the two; use them or an equivalent, and say which.
- **A gauge must be shown able to fail.** Each new instrument gets a mutation or a known-bad fixture that moves it (`MEMORY §C`: the
  defect is usually in the instrument).
- **Say whether a number came from disk, the network, or the GPU,** and on which target. A desktop number is never a phone number:
  name the target on every reading.

## The work

1. **Startup, exposed.** The spec's sequence: *HTML → application runtime → scene manifest → minimum ground → minimum buildings →
   FIRST TRUTHFUL FRAME → progressive assets/systems.* Instrument each boundary in Preview, and the same marks in the Ward (read-only,
   so Preview can say how its startup compares with the Player's). Propose a definition of **WARD USABLE** in the spec's terms (what a
   visitor can do, not a percentage) and bring it to Jacob; then measure **TIME TO WARD**. Separate **blocking** startup requirements
   from what can arrive afterwards, as a list.
2. **Per-artifact cost.** For each slab artifact and secondary asset (ground, buildings, trees and their impostor pages, lamps, labels,
   textures, the kit bundle): transfer size (compressed and decompressed), fetch time, decode/parse time, and decoded CPU size. ⛔
   Measure, don't estimate from file size.
3. **Residency.** GPU residency (textures, geometry, render targets) and CPU residency, reported per object class, and split by the
   spec's progression: what is **BAKED** (in the slab), **VISIBLE** (on screen now), **SELECTED**, **OPENED**. Today "exists in the
   Ward" and "is resident now" are treated as the same; this makes the difference visible. ⛔ Don't change what is resident.
4. **Steady state and spikes, per target.** Frame cost (GPU and main thread, separately), draws, triangles, and transition spikes
   (shot changes, a card opening), tagged by gesture. Read against `deviceProfiles.js` budgets, and say plainly that those budgets are
   interim until real-device numbers replace them.
5. **Mobile behaviour, honestly bounded.** Preview on a desktop emulates a phone; it cannot measure a phone's thermals or memory
   ceiling. Say what the emulation can and cannot tell, and propose how a real-device reading gets in (a real phone pointed at the
   staging Ward, reporting back) without building it unasked.

## Out of scope (next, and named so nobody builds it here)

**Technical-Director controls** and **Deployment / Mastering** (the per-surface effect switches Jacob ruled 2026-10-04: every effect
on or off per desktop / phone-hi / phone-lo, as data; the low-rung ladder). They come next, **tied to what these gauges measure**:
*"Tie controls to measured problems rather than manufacturing generic quality knobs."*

## The chain

- **Trusts:** D's `qualityProfile` (what each target runs), the slab and manifest (what ships), `deviceProfiles.js` (targets).
- **Trusted by:** every Technical-Director control and deployment decision that follows; the Promote decision.

## Can the instrument see it?

Every gauge names its instrument and its target, and is mutation-tested. A check that the startup marks fire in order on a real
load (`claims-startup-marks-fire-in-order` or your name). The live read is Preview at :5173 on two towns, one small (LS) and one large
(Huron or Provincetown), on each target. ⛔ No parallel harness.

## Deliverable

The gauges in Preview, their checks, a short numbers table per town and target for Jacob, the proposed WARD USABLE definition, and the
blocking-vs-later startup list. **Read the spec and the evidence, tell Jacob what you found, then build. If the code contradicts this
brief, stop and flag him.**
