# HANDOFF — wire up the overhead SNAPSHOT impostor (plan-view / Browse)

> **Dispatch-ready brief. Drafted by Boz 2026-07-09 with Jacob, in a standup that locked the design below.** This supersedes the *selection strategy* of `HANDOFF-density-impostor-swap.md` (role-at-bake) — see §Supersession. It **keeps** the *look/geometry* spec of `HANDOFF-overhead-hula-impostor.md` (still binding).

## Who you are + the call

You are the agent dispatched to wire up the plan-view tree impostor. **Name yourself** (one word, your pick — it joins the trail) and answer to it.

- **Agent: FRESH.** Why: this is a self-contained wiring build against a locked design + precise anchors; a fresh context builds to the brief without inheriting the parked arc's assumptions (the parked arc is *why* this kept dying — see §Traps).
- **Route first (the universal path):** `ORIENTATION.md` → `README.md §⭐ START HERE` → **`arborist/ORIENTATION.md`** (the §"The LsoD" and §"Honest state" paragraphs are the frame for this whole task). Then the canon sections cited below, **to the section**, before you touch code. Do not re-derive the model from grep — it's written down.

## The one-paragraph design (locked with Jacob, 2026-07-09)

In **plan / Browse view** (camera high / zoomed out) the neighborhood shows *every* tree at once — the only context where the instance count is genuinely unmanageable (~7,167 on hipointe-demun). The fix is a **3-slice layered OVERHEAD snapshot impostor** per *unique* Grove asset (~8–19 assets, not 7k): three top-down RTT captures at height bands **canopy / mid / branch**, stacked as parallax planes so **branches still read and the canopy still moves** (shared wind + hula/ruche sway). Both representations — the current `lod1` **mesh** *and* the **snapshot atlas** — are **baked into the slab (the frozen LADDER)**; the runtime **SELECTS** snapshot-vs-mesh **by camera height with a hysteresis band (the runtime SELECTION)**. This is the split ORIENTATION blesses: *"the LOD ladder is a bake product; LOD selection is runtime."*

**Two decisions Jacob made explicitly — do not reopen:**
1. **Baked ladder + runtime selection** (not role-at-bake density swap). Both reps ship in the slab; camera-height picks at runtime. This is scoped as a **Browse-context representation SELECT**, *not* a revival of the retired `GeoTierDriver` per-instance geometry-LOD altitude swap.
2. **The RTT-skinned disc is canonical** (`buildOverheadHulaGeometry` + `captureTreeOverhead`, shared atlas material, optical parity) — **NOT** the procedural branch/umbrella/cloud/leaf canopy that the Salon preview renders (that one violates optical parity; leave it as a Salon-only preview relic).

## The gift — most of this is already built and sitting UNWIRED (verify each anchor first)

The scout's map (2026-07-09) found the doctrine-correct path was finished and parked with **zero callers**. Confirm these exist before building on them:

- `src/components/impostorGeometry.js:143` — **`buildOverheadHulaGeometry`**: the stack of tessellated ruched discs (planar UVs "so the square top-down capture maps straight on"), `aOverhead=1`. **This is your carrier.** Today it uses ONE shared capture across all discs — you must extend it to **per-band** (3 captures, one per height slice) for true multilayer depth.
- `src/components/captureImpostor.js:232` — **`captureTreeOverhead`** (one-shot overhead RTT skin); `:91` `renderTreeToTexture` with the `:102–112` `topDown` branch (camera high above, `up=(0,0,-1)`, looks straight down). **This is your PNG-snapshot capture.** Extend it to clip the source tree to 3 height bands and emit 3 images.
- `src/components/treeAtlasMaterial.js:291–334, 420–445` — the **ruche + hula deformers** on the SHARED atlas material, gated by `aOverhead`, driven by `uRuffleDepth`/`uHulaAmount`; base-anchored via `aTreeHeightNorm`; shares `treeSwayUniforms` (neighborhood-wide wind). `:1487` **`applyOverheadDeformerUniforms`** binds those per-draw — **currently NO caller**; you wire it in.
- `src/components/InstancedTrees.jsx` — the runtime: `ImpostorSpecies` (L419–516) **hardcodes the HERO cross at `:437`** (`buildImpostorGeometry(record,'summer')`) — you reroute the overhead context to `buildOverheadHulaGeometry`. `lodForRole` `:724` returns `'lod1'` for every mesh role. `TierDriver`/`computeTier` `:542–568` already reads `camera.position.y` for the **bark-shader** tier — **piggyback the same altitude read for your SELECTION signal, but keep it a separate concern from geometry-LOD** (do not resurrect `GeoTierDriver`, retired at `:564–568`). Frustum cull was excised (`frustumCulled={false}`, `:358–363`) — good, keep it (see §Traps).
- `arborist/bake-trees.js` — `classifyHeroTiers` (L246–356), `PROM_THRESHOLD:0` (`:164`). A dormant **`bake-impostors.js` + `impostorBySpecies`** atlas block exists — reuse/extend it for the **snapshot-atlas bake** rather than inventing a new artifact.

## The canon that binds (read to the section)

- **`arborist/ORIENTATION.md`** §"The LsoD" + §"Honest state" — the three-axis model (context × LOD × tier) and the ladder-is-bake / selection-is-runtime split. **This is the doctrinal frame.**
- **`arborist/ARCHITECTURE.md §"Tree-render reality at LS" (L60–73)** — all-mesh ship; **the impostor path is PARKED**; `lodForRole` is the seam where `impostor→billboard` attaches; **L73 ⚠️ the GPU "gauge" is NOT a perf signal — gate on real device frame-ms + the operator's eye on the pan.**
- **`HANDOFF-overhead-hula-impostor.md`** — the LOOK spec, **still binding**: cake-layer discs seen from directly above; the **ruche** (`y(θ)=A·sin(k·θ+φ)`, per-instance `φ` from `rotY`), the **hula** (per-disc base-anchored rock), the **shared wind** (`treeSwayUniforms`). Its point (L18): *"from overhead the wind has a compass direction — all trees lean + gust the same way at once — you see the weather move across the neighborhood. That legibility is the point."* Build to this.
- **`BATON-tree-render-next.md`** L8–11 (do-not-re-litigate: optical parity; role-at-bake; **⛔ no runtime camera-distance/altitude *geometry-LOD* swap**) and L24–32 (the cake-layers = "N horizontal canopy slabs → real vertical motion parallax from above"). **Your camera-height select is a Browse-context representation switch, which is the sanctioned "selection"; it is NOT the forbidden per-instance lod0/1/2 altitude swap. Hold that line and say so in a code comment.**
- **`HANDOFF-density-impostor-swap.md`** L18–19 — **THE TRAP** (below). Its *root-cause forensic* (why HiPointe is all-mesh: wrong `--heroLook`, broken canopy-dims join) is reusable; its *role-at-bake selection plan* is **superseded** (§Supersession).

## Build plan (phased — checkpoint after Phase 1)

**Phase 1 — capture + bake the 3-slice snapshot atlas (the ladder).**
1. Extend `renderTreeToTexture`/`captureTreeOverhead` to emit **3 top-down images per unique tree**, clipped to height bands **canopy / mid / branch** (derive band cuts from the asset's canopy base / total height).
2. Extend `buildOverheadHulaGeometry` to a **3-plane (or 3-disc-group) stack**, each group skinned by its own band image, spaced for parallax.
3. Bake these into the per-look slab artifact (`public/baked/<look>/trees/…` + the atlas manifest) via the dormant `bake-impostors.js`/`impostorBySpecies` path. **Unbaked = unshipped** (slab contract).
4. **CHECKPOINT — flag Boz/Jacob for an eye-gate:** render the captured snapshots on a neutral surface and confirm they *read like the tree from above* (optical parity) **before** wiring the runtime. The snapshot IS the deliverable here; the operator's eye gates it (`feedback_shape_proofs_dont_gate_fill_geometry` — the eye gates the look, not a byte-proof).

**Phase 2 — runtime selection by camera height (whole-scene Browse switch).**
5. Add a camera-height SELECTION driver in `InstancedTrees.jsx` (piggyback the `TierDriver` altitude read): `camera.y > HIGH → snapshot`, `< LOW → mesh`, **hysteresis band between** so trees don't pop/thrash at the boundary; a short cross-fade is a plus.
6. Route the snapshot render to `buildOverheadHulaGeometry` (fix the hardcoded hero cross at `ImpostorSpecies:437`); wire `applyOverheadDeformerUniforms` + `treeSwayUniforms` so **wind + hula sway animate** in the impostor.
7. **Whole-scene swap, not per-instance role.** All trees switch together when the camera goes overhead. Gate behind a **per-look enable flag** (default ON for `hipointe-demun`, the pain scene) so LS behavior is unchanged until eye-gated.

**Phase 3 — eye-gate + measure.**
8. Validate in the real app / Preview on `?look=hipointe-demun` in plan view; parity-check on `lafayette-square`. **Measure on device frame-ms + the operator's eye on the pan — NOT the GPU gauge.** Tune thresholds + cross-fade. Then propose flipping LS's flag on.

## Invariants that bind (violating any is how this died before)

- **Optical parity — one shader program.** The snapshot rides the **shared atlas material**; it must read like the mesh tree from above. (The canonical-impostor decision; the procedural Salon canopy is out precisely because it breaks this.)
- **Ladder baked, selection runtime.** Do not invent or drop a *unique asset* at runtime — only its *visibility/representation* changes. No `GeoTierDriver`-style geometry-LOD altitude swap.
- **This is a SWAP, never a cull.** In overhead view all trees stay visible — you swap representation. **Do NOT hero-frustum-cull the overhead scene** (`HANDOFF-density-impostor-swap.md:18` — "not seen by the hero pan → impostor, never cull"). `frustumCulled={false}` stays.
- **no-cull doctrine is NOT violated** (arborist front-end's veto is on trees *disappearing*; representation-swap keeps them all on screen).
- **Grove hands off pristine wholes.** The snapshot is captured off the *pristine* asset (RTT), a bake/prep product — not a runtime improvisation.

## The traps (why the parked arc was "stupid and ridiculous")

- The old **octahedral hero cross** (`buildImpostorGeometry`) is for *horizontal* viewing — wrong hemisphere for plan view. Overhead needs only the **top-down aspect**; that's what makes the single-aspect snapshot cheap and right. Do not reach for the cross.
- `captureImpostor.js` is the RTT path the canon says **"crashed the prod build (dev-only)"** — treat prod-safety as a first-class constraint: the capture must run at **bake time**, and the runtime must consume baked textures, not do live RTT in the shipped app. If any capture must happen at load, guard it hard.
- `lod2` (the cut-trunk "browse" LOD) is **dead** (floating-trunk forensic). Do not revive it for this — the snapshot replaces it.

## Supersession + docs discipline

- This brief **supersedes** `HANDOFF-density-impostor-swap.md`'s *role-at-bake selection* with **baked-ladder + runtime-selection**. It **keeps** `HANDOFF-overhead-hula-impostor.md`'s look/geometry spec. Do not edit those two files — **Boz reconciles the canon on trunk** when this lands (arborist ARCHITECTURE §Tree-render reality + ORIENTATION §LsoD get the fold).
- **Canonical docs are OFF-LIMITS to you.** Keep your running notes/journal in **this HANDOFF file** (append a "Build log" section) or a `scratch/` co-journal. Surface any scope drift or doctrine conflict to Boz/Jacob immediately rather than silently widening (`feedback_baby_must_surface_scope_drift`).

## Commit boundaries

- **Work in a git worktree off `curb-offset-draw`** on a feature branch (e.g. `overhead-snapshot-impostor`) so Jacob's main checkout stays clean.
- Code you own: `src/components/{InstancedTrees.jsx, impostorGeometry.js, captureImpostor.js, treeAtlasMaterial.js}`, `arborist/bake-impostors.js` / `bake-trees.js` (bake side), and the per-look slab artifact wiring. Commit **per phase** with clear messages.
- **Do not** change the LS all-mesh default except behind the per-look flag (LS must look identical when zoomed in).

## Definition of done

Plan-view over `hipointe-demun` renders the 7k trees as the **3-slice overhead snapshot** (branches read, canopy sways with the neighborhood wind, weather legibly moves across), zoom-in restores the `lod1` mesh with a clean hysteresis transition, **both reps are baked into the slab**, device frame-ms in plan view drops materially vs all-mesh, and **Jacob's eye passes** the snapshot look + the transition. LS parity confirmed before its flag flips on.

---

## Build log — Atlas (2026-07-09)

**Agent:** Atlas (fresh). **Worktree:** `.claude/worktrees/overhead-snapshot` on branch `overhead-snapshot-impostor` (off `curb-offset-draw`). **Phase 1 complete → CHECKPOINT (awaiting Jacob's eye-gate before Phase 2).**

### Standup decisions (Jacob, 2026-07-09)
- **Capture/ship path = in-browser capture → POST → baked PNG.** Surfaced that the handoff's stated "bake via `bake-impostors.js`" isn't literally possible — that module is *analytic-only* (its own docstring: no headless GL rasterizer in-repo; `gl`/`canvas`/`puppeteer` deliberately absent). The overhead snapshot is fundamentally an RTT render, so it's captured where a GL context lives (Salon/authoring), then persisted to the slab atlas. No new native deps.
- **Eye-gate surface = existing Salon Browse preview**, repointed from the procedural canopy to the canonical RTT-skinned 3-slice disc stack.

### What landed (commit `f8c971b1`)
- **`captureImpostor.js`** — `renderTreeToTexture` topDown now takes an `opts.band {yLo,yHi}` and slices via the ortho camera's **near/far clip** (no geometry mutation). New **`captureTreeOverheadBands`** emits 3 top-down captures (branch / mid / canopy); band cuts derived from the measured leaf-base (`measureCanopyBaseLocal`, reads the stamped `aBark` attr) + total height; branch band dips ~12%·H below the leaf base to catch the main limbs.
- **`impostorGeometry.js`** — **`buildOverheadBandDisc`**: one ruched + domed + tessellated disc per band, placed at its **real height** (parallax stack), planar [0,1] UV so its band capture maps straight on, carrying `aOverhead/aRuffle/aTreeHeightNorm/aWindTier`. (Left the old `buildOverheadHulaGeometry` untouched.)
- **`treeAtlasMaterial.js`** — extended **`injectOverheadWiggle`** to also carry the knob-driven **ruche + hula** (copied Jacob's tuned *vertical-only ruche* + *drifting base-anchored hula* math verbatim from the shared atlas material's `aOverhead` block), + `uRuffleDepth`/`uHulaAmount` uniforms → so a `map=capture` MeshStandard animates in parity and `applyOverheadDeformerUniforms` drives it.
- **`SpecimenViewport.jsx`** — Salon **Browse** preview repointed to the 3-slice stack: captures once per (chassis × overheadMode) on the live GL context + the materialized preview material; renders 3 band discs (hard alphaTest cutout, depth-correct parallax); procedural canopy kept as an **until-captured fallback**. Two **live sliders (Ruche / Hula)** bottom-right for Jacob to dial; shared wind flows via `treeSwayUniforms` (Wind toggle). Per-variant **golden-angle rotation** so fold-phase/capture differ tree-to-tree (anti-stamping eye-gate → use the **Group** button + Wind on).

### Verification done (code-level — the *visual* gate is Jacob's, per doctrine)
- All 4 modules transform cleanly under real vite (no parse/dark-screen errors); `/arborist` serves 200. esbuild bundle of the JSX passes. **No browser automation in-repo, so I did not screenshot the WebGL canvas — the snapshot look is the operator's eye to gate (`feedback_proxy_render_is_not_the_operator_eye`).**

### ⏸ CHECKPOINT — for Jacob's eye
Dev server is live on my branch: **`http://localhost:5173/arborist`** → open the Salon → pick a chassis → **Browse** preset (top-down). You should see the 3-slice snapshot (branch/mid/canopy) stacked; toggle **Wind** + **Group** to check motion + anti-stamping; dial **Ruche/Hula** bottom-right. Gate: *do the snapshots read like the tree from above, and does the stack move like weather?* Then I proceed to **Phase 2** (runtime camera-height SELECT in `InstancedTrees` + the POST→slab-atlas persistence).

### NOT started (Phase 2+, deliberately)
Runtime selection by camera height in `InstancedTrees.jsx`; the POST→`public/baked/<look>/trees/…` atlas-packing persistence; per-look enable flag. LS untouched.

## Build log — Atlas (2026-07-09, cont.) — LOOK EYE-GATED ✅

Iterated the overhead stamp look live with Jacob to a passing eye-gate ("Look how amazing it looks!!"). All on worktree branch `overhead-snapshot-impostor`.

**The look, as landed (per-band 3-slice stamp, all baked at capture):**
- **Shadow-cast capture** (`captureImpostor.js`): each band is a single 1024² top-down render with an angled directional key + **PCF-soft shadow maps** + low ambient → leaves cast shadows on each other + the branches; darks are dark. (Replaced the flat-albedo × pyramid-high-pass composite, which *washed the darkness out to grey* — that was the "no black" bug. The composite code is left in the file, unused, in case the high-pass is useful later.)
- **Flat unlit stamp discs** (`impostorGeometry.js#buildOverheadBandDisc` + MeshBasic `toneMapped:false`): the disc is just a flat carrier; the shading is baked into the texture. Per-band **brightness ramp** (branch 0.3 → canopy 1.0) so the crown-shadowed lower layers read as dark depth through the top's gaps.
- **Fractal wind** (`treeAtlasMaterial.js#injectOverheadWiggle`): fBm value-noise drives a turbulent **flutter** (advected downwind, never repeats) + irregular **gust**, plus the **hula** (base-anchored, phase-lagged, drifting-axis bend so the 3 bands ripple out of phase). **Wind-only, no floor** → dead still at wind 0. Ruche is OUT (the starfish); hula + flutter are what make the wind read alive.

**Capture is crash-safe**: off the LIVE loaded geometry via a non-mutating shared clone (no 2nd GPU copy), one band **stepped per frame**.

**Doctrine reaffirmed with Jacob:** clicking **Browse** generates the current-state overhead sections in the Salon (single tree = the asset); those get **packed into the Grove + slab**; the Universal Reader places the 7,000 instances. The 7k only exist in the slab.

**Parked (by choice):** darkening the **bark albedo** directly (aBark-gated) — held in reserve; Jacob didn't want it going too dark.

**Env notes (worktree gotchas, for whoever runs this next):** the worktree needs the main checkout's gitignored data symlinked — `public/trees` (chassis, 241 GLBs) and per-species `arborist/state/*/compositions.json` — and **vite must be (re)started with those symlinks already in place** (its publicDir listing is cached at boot; otherwise tree GLBs 404 → SPA-HTML → the chassis-plate rack crashes the WebGL context = black screen). Backends must be launched via detached subshell, not `run_in_background` (the latter exits). Meteorologist (:3335) is down on a pre-existing missing `ajv` dep — the Salon doesn't need it.

**NOT started (next):** POST the 3 baked band PNGs → `public/baked/<look>/trees/…` + manifest (the "pack into the slab" step); runtime camera-height SELECT in `InstancedTrees` for the 7k-tree Browse swap.

## Slab-packing plan (next step) — right-sizing folded in (Jacob, 2026-07-09)

The Salon captures at author quality (1024² albedo ×3 + 512² AO ×3 ≈ 21 MiB/asset uncompressed → ~310 MiB across a ~15-asset roster). The **slab bake must right-size for the plan view**, NOT ship the author-res captures:

1. **Right-size** — plan view = 7k tiny trees, so **512² albedo / 256² AO** (÷4).
2. **AO → single-channel R8** (it's grayscale data), not RGBA.
3. **KTX2 / Basis GPU compression** (ASTC/BC) — GPU-resident, the shippable win (÷~5). → whole roster in the **tens of MiB**.
4. **Pack the 3 bands into ONE atlas** per channel — same bytes, 1 texture bind not 3 (draw-call win).

**The pack step itself** (Jacob's chosen path — in-browser capture → POST → baked PNG/KTX2):
- On Browse capture, the in-browser albedo+AO band textures get **downsized + (optionally) encoded**, POSTed to the arborist backend, written to `public/baked/<look>/trees/overhead/<species>_{branch,mid,canopy}.{albedo,ao}.*` + an `overheadBySpecies` manifest entry (band rects, yLoNorm/yHiNorm, heightM, canopyRadiusM).
- Runtime (`InstancedTrees`) reads `overheadBySpecies`, builds the disc stack, relights via `overheadLightUniforms` fed from the atmosphere, selects impostor-vs-mesh by camera height.

**Relight architecture is LANDED (`f92d2637`)**: bake = albedo + AO (light-independent); runtime = `albedo × (uAmbient + uSun·AO)` via shared `overheadLightUniforms`; Salon "Light" slider previews overcast↔sunny parity. LS feeds those uniforms from the TOD/meteorologist.

### Slab-packing addendum — mip reuse + per-device tier (Jacob, 2026-07-09)

**Hitch onto the atlas mip machinery, NOT the pixel pyramid.** Two different pyramids:
- The **DownsamplePyramid** ("pixel pyramid") is a runtime **scene-space** blur ladder for DoF/Bloom (HDR, alpha-BLIND). Wrong tool for per-texture minification, and its kernel would bleed the transparent gutter into our cutout leaves.
- The tree atlas's **coverage-preserving mip builder** (`treeAtlasMaterial.js#boxDownsampleRGBA` / `buildCoveragePreservingMipmaps`) is the right ride: alpha-weighted, built to stop far/minified foliage greying out to gutter-grey. The overhead stamps are the SAME cutout foliage — in plan view 7k tiny trees = heavy minification — so:
  - **Right-size** (1024²→512²) THROUGH the coverage-preserving box (not a naive resize).
  - **Build the stamp mip chain** with the same coverage-preserving downsample (else far plan-view trees grey out — the old far-leaf bug, re-run on the stamps).

**Per-device stamp res = a TIER** (the "tier ladder ≡ blur pyramid" doctrine, `[[preview-equals-pyramid-tier-ladder]]`): mobile bakes/loads a smaller rung, desktop a larger one — one ladder, pick the rung — applied to bake-texture SIZE instead of blur radius. So the slab carries a stamp-res tier the runtime picks per device, same as the mobile profile does elsewhere.
