<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: every hero card writes per-pixel depth from a baked depth channel, every town's Grove is re-baked with it, the fill cost is measured on a phone-sized buffer in the depth regime phones actually run, and Jacob's eye says the chopping is gone in the Hero move.
-->

> ### STATE at Grain's dismissal (2026-10-05): BUILT, baked on all 4 towns, eye owed
> Landed `d39cc6f8` (depth on the AO page) · `986a0ac4` (compile before the first shot) · `c7a07a03` (the Grove captures against
> THIS town's roster board). Every placed species carries depth (`claims-hero-cards-write-their-depth` ⑥). Depth-write cost on the
> M1 at phone tier: within noise; ⛔ a REAL phone GPU is unmeasured (and the GPU gauge reads ~2× high, `7bf82e90`).
> ✅ **EYE-GATED (Jacob, 2026-10-05): "chopping and wind look great actually, they did a great job."** Still owed: any wrong-coloured leaves on cards captured 2026-10-04 ·
> **live proof** of `c7a07a03` + `986a0ac4`: one Grove run that switches towns on ONE page, gated by rebake-verify listing every
> placed species on the second town and no "uCaptureMask not found". Not established: LS's doubled tick-1 / second "done" report
> (wrote nothing; needs the page's own logs next time).

# BRIEF — Hero cards write their depth, so crowns meet as volumes and stop chopping

**Boz the Younger drafted this 2026-10-04 from Jacob's ruling (relayed by Gale); Jacob dispatches.**

## Who you are, and the bounds

**Agent: WARM → Grain, after the card-wind brief** (`BRIEF-card-wind-hsb.md`). Grain built the hero and overhead cards and
the Grove's capture format 6; this changes both.
- The hero card shader, the Grove's hero capture, and the atlas packing. ⛔ No pours. **The Grove re-bake writes slabs in every
  town: Jacob's go, and a fresh page per town** (the stale-manifest fix `dcd3a3c4` is not yet proven live). Announce before a
  browser bake so other agents hold saves; `node scripts/bake-in-flight.mjs` before saving anything the dev servers import.
- Commit only your paths. A kit change reaches the Ward at the batched pin move; Jacob confirms push and publish.
- **Three-part fix.** Registers: `arborist/ARCHITECTURE.md` (the card's channels and how it writes depth) · `cartograph/FEATURES.md`.

## The defect, and the ruling (Jacob, 2026-10-04)

**Chopping:** neighbouring hero impostors are flat, camera-facing cards up to ~35 m wide (`acer_saccharum`'s 120 m card is
the extreme). Two neighbours' planes are never parallel, so they intersect, and the intersection lines sweep across the
crowns as the camera moves, and now also as the trees lean differently on the wind sheet. Jacob saw it under a storm on the
Wind card (30 m/s from 284°, gusts 45, shape 0.5), where it's exaggerated, but it is visible at normal wind too.

*"If we can solve the chopping it's solved."* · *"Given the camera move, we'll have to do B."*
- **B (ruled):** the Grove bakes a **depth channel per hero card**, and the card writes **per-pixel depth** from it
  (`gl_FragDepth`), so crowns interleave as volumes instead of slicing as planes.
- A (passed over): one constant screen-parallel depth per card. Cheap and no re-bake, but no interleaving.

**Optional, enabled by the same bake, not required to close this** (Jacob liked both): parallax under camera motion,
shifting pixels by depth; and depth-aware flutter, sampling `windDetail` at each pixel's reconstructed 3D position so the
front and back of a crown move differently (no new sheet API). ⛔ Ask before building either.

## The code today (read by Boz 2026-10-04; confirm)

| what | where |
|---|---|
| hero capture: **two** channels per shot today, albedo + AO | `src/components/captureImpostor.js:662` (`captureHeroBand`; returns `depthLoFrac`/`depthHiFrac`/`cardDepthFrac`, which are the shell's slab, not a per-pixel depth) |
| the capture format the Grove judges dirtiness by | `src/arborist/captureKey.js` (`CAPTURE_FORMAT.hero`), read at `src/arborist/Grove.jsx:368` |
| the hero card material | `src/components/treeAtlasMaterial.js` (`injectHeroImpostorStamp`, ~:2140) · `src/components/HeroImpostorTrees.jsx` |
| KTX2 packing of the impostor pool | `arborist/serve.js` ~:1284–1311 (`pack-impostor-ktx2.mjs`, `encode-ktx2.mjs`) |
| log depth, and that it **already** writes `gl_FragDepth` on perspective cameras | `cartograph/ARCHITECTURE.md` "The fifth axis — depth precision at distance" (three's chunk: `log2(vFragDepth) * logDepthBufFC * 0.5`) · `cartograph/bake-ground.js:30` |
| a mobile **linear**-depth path is referenced | `SLAB-CONTRACT.md` (`polygonOffsetUnits`: "the mobile linear-depth path") · `_handoffs/HANDOFF-mobile-profile.md:39` |

## The must-haves (the ruling, plus Grain's read from inside the card code, 2026-10-04)

1. ✅ **RULED (Jacob, 2026-10-04): depth rides the AO page.** The AO page becomes ONE **uncompressed two-channel** page:
   AO in R, depth in G (today's shader reads only `.r`). Grain measured it on LS's 180 hero pages: the same GPU memory as a
   separate page (128 KB/page either way); download ~4.35 MB against 2.90 MB AO-KTX2 today (+2.2 MB a separate page would
   add); samplers stay 4/16; AO becomes lossless. ⛔ **The loader must upload it as two-channel (RG8), not RGBA**, or memory
   doubles. ⛔ **The phone measurement includes memory:** some phones transcode today's AO to ETC1 at 0.5 B/px, so the
   uncompressed page costs more there.
2. **Encoding, measured in metres** (settled by item 1: uncompressed; Grain measured block codecs losing 1–5 m at p99). KTX2/ETC1S is block-lossy and quantised per block, so depth stored there steps at block
   edges, which is exactly where crowns intersect. It likely wants its own encode (UASTC, or R8 PNG; the master atlas is
   already kept out of KTX2 for a similar reason). Measure the depth error in metres for each candidate before choosing.
3. **The right depth space, on two paths.** Desktop runs `logarithmicDepthBuffer`, where three already writes `gl_FragDepth`
   with `log2(vFragDepth) * logDepthBufFC * 0.5`. The card must write the **log of its offset view depth with that same
   formula**, or cards and meshes/buildings disagree on depth. **Phones run linear depth** (Grain): a second code path.
   Both get eye-checks.
4. **Fill cost, before and after, desktop AND a phone-sized buffer.** Writing `gl_FragDepth` loses early-Z on every card
   pixel. ⚠️ The Hero/Street card cost (15–21 ms) is still "cause not established" (Grain's forensic), and
   `frameCost.js#gpuWindow` may over-read 2.6–2.9× (ROADMAP, unverified), so report ratios. Instrument:
   `scratch/tree-cost/probe.mjs` (it now exits on a shader that fails to link).
5. **Every town's Grove re-baked** with the new channel (a capture-format bump makes every record dirty).

## Can the instrument see it?

Chopping is a view-dependent artifact, so the eye-gate is the real gate: **Jacob in the Hero move**, at normal wind and
under a storm **and at calm** (his storm, 30 m/s gusting 45, is far above any day's weather). ⭐ A mechanical guard worth having: render two overlapping neighbour cards at fixed cameras and assert the
intersection is not a straight line (i.e. per-pixel depth is live). Mutation-test it by forcing a constant depth per card.

**Confirm-then-build:** read the code sites, tell Jacob what you found (especially items 1–3), and stop if the
code contradicts this brief.
