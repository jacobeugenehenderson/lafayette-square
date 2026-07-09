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
