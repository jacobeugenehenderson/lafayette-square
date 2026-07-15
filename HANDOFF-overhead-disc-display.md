# HANDOFF — overhead browse impostor: capture fixed, player disc-display open

**To:** fresh eyes. **From:** the 2026-07-15 session (Boz + Jacob). **Trunk:** `curb-offset-draw` (solo; push/merge freely; PROD = `origin/main`).
**Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → `arborist/ORIENTATION.md §"The LsoD"` → `HANDOFF-overhead-snapshot-impostor-wireup.md` (the design) → this.
Sibling context: [[project_arborist_operating_model_and_tree_bake_state]] · [[project_hardwires_come_out_when_channels_install]] · `arborist/ARCHITECTURE.md §"Tree-render reality"`.

The overhead browse impostor (3-slice top-down snapshot per unique tree, swapped for the 7k meshes in plan/Browse view) was **built + merged** (`a4458f4a`, `98cd1dad`) but shipped **blank** — every baked PNG was a fully transparent image. This session found and fixed the **root cause** (a shader-compile crash). The captures now bake non-blank for broadleaf species; the remaining work is the player *display* + a band-framing fix + durability.

---

## ✅ LANDED this session (commit `caccbbe7`)

**Root cause — `instanceMatrix` in a non-instanced capture → vertex shader failed to compile → transparent PNG.**

`OverheadBaker` (the Grove-Canvas capture that rides Bake→Slab) renders each tree GLB as a **plain, non-instanced `Mesh`**. The atlas material's ground-conformance chunk — `terrainShader.js#TERRAIN_DISPLACE_INSTANCED_BAKED` — dereferenced `instanceMatrix` **unguarded**. `instanceMatrix` is only declared by three for an `InstancedMesh`, so the vertex shader hit `ERROR: 'instanceMatrix' : undeclared identifier` → `VALIDATE_STATUS false` → invalid program → **nothing rendered** → the RT read back all-zero.

**Fix:**
1. `terrainShader.js` — guard **both** instanced-terrain chunks (`TERRAIN_DISPLACE_INSTANCED` + `_BAKED`) with `#ifdef USE_INSTANCING`. The lift is per-instance (`aGroundRaw × uExag ÷ instanceYScale`), meaningless off an InstancedMesh, so skipping it on the capture is correct — and it now compiles.
2. `OverheadBaker.jsx` — bind each species' `bark/detail/posterized/deformer` config to the shared material before its capture (mirrors `SubmeshInstances#onBeforeRender → applyBarkUniforms`), so bark samples its real atlas rect instead of a collapsed `(0,0)` tile. (Secondary — leaves don't use it, but bark was wrong too.)

**Verified:** broadleaf species bake real pixels (`maple_red/oak_white/…` → 8–33% alpha coverage across all 3 bands, checked on disk). The `instanceMatrix` shader errors are gone from a clean bake.

---

## ⛔ DON'T re-walk these — ruled out by instrumentation

The blank had a long tail of plausible-but-wrong theories. Each was **measured** and killed. Do not re-derive them:

- **Census / species-key mismatch** — the census carries stale-namespace scientific ids (`betula_pendula`, `acer_saccharum`, `magnolia_sp`…) that don't match roster keys, BUT the runtime **substitutes** them to roster variants (`substituted=1271`), so `overheadSp=16` and all render species resolve. Not the cause.
- **`lookName` / URL** — the mesh path uses the same `lookName` and Hero renders fine; the dev server serves the overhead PNG as real PNG bytes (curl-verified). Not it.
- **Wind NaN** — `treeSwayUniforms` init to `uTime:0 / uWindForce:(0,0,0) / uWindIntensity:0` (safe zeros). Not it.
- **Logarithmic depth** — the atlas material is `MeshStandardMaterial + onBeforeCompile`, so three injects logdepth into it *and* the plain `MeshBasicMaterial` equally. Can't be the differentiator.
- **Band clip** — whole-tree capture (no thin near/far clip) was ALSO blank. Not the clip.
- **Readback** — the Salon shows the live `rt.texture` and works; the readback machinery is fine.
- **alphaTest fragment-discard** — the `alphaTest=0` clone "rendered" only because it was a *different* program; the real material never compiled.

**The one true signal was the `VALIDATE_STATUS false` shader error in the console.** When a capture/RTT renders blank with geometry + textures + uniforms all verified present, **check for a shader compile error first** — it's cheaper than the whole tail above.

---

## OPEN — prioritised

### 1. ▶ Player disc-display: discs mount but don't paint (the immediate next task)
On a **freshly-opened** `?look=hipointe-demun` tab in Browse, the player state is healthy: `overheadEnabled:true, overheadMode:true, speciesN:16, assetsN:16, ohBySpeciesN:17`. So `OverheadSpecies` mounts 16 species of disc-stacks with loaded assets — **yet nothing renders on screen.**

Ruled out already: not an LS name-gate (grep clean), not terrain occlusion (HPDM instances at `y≈0`), not the Browse camera (fits `browseBounds`, not hardcoded; Browse forces `exag=0`), relight defaults are `uAmbient/uSun 0.5/0.5` (not black), disc geometry sizes are real (`buildOverheadBandDisc`, manifest `heightM/canopyRadiusM` non-zero).

**Next step:** re-add the `[overhead-disc]` probe (was in `OverheadTrees.jsx#OverheadSpecies`'s matrix `useEffect`, stripped at checkpoint) logging `{discs, refsMounted, instances, pos0, texDecoded, h, r}`. It splits the last unknowns:
- `texDecoded:[false,…]` → textures created but never **decoded** in the player (check the actual request URL/`base`, and the module-level `_texCache` in `OverheadTrees.jsx:72` which has NO cache-bust).
- `refsMounted:0` → instanced meshes not attaching.
- `pos0` null/NaN/`[0,0,0]` → matrices bad.
- all healthy → pure render/blend/order/scale → operator's eye + a material tweak.

### 2. Band-cut framing — conifers/platanus/quercus bake blank bands
The species with `PLAIN-BASIC max=0` in the diagnostics (abies/picea/pseudotsuga/cupressus conifers, plus platanus, quercus_alba, garden_mix, salix, and stray bands like linden's canopy) have geometry that doesn't land in the band clips. `prepareOverheadBands` (`captureImpostor.js:358`) splits the crown `[canopyBase, top]` into thirds — a **broadleaf** profile. A conifer whose foliage runs base-to-tip, or a tree with an odd measured `canopyBaseY`, gets empty bands. Fix the band-cut logic per crown shape.

### 3. Durability — the overhead work is transient
- `bake-look` preserves `impostorBySpecies` (`bake-look.js:1187`) but **not** `overheadBySpecies` — the `serve.js:1431` TODO. Any CLI atlas re-bake silently wipes the overhead entries. Mirror the impostor-preservation loop.
- The overhead artifacts (`public/baked/<look>/trees/overhead/**` + the atlas `overheadBySpecies`) are **untracked / uncommitted** → they won't ship to prod. Commit them once the display works.

### 4. Hero "group trees" — grove roster still holds group-shots
HPDM's fresh census still lists `quercus_alba/betula_pendula/platanus` heavily, and Hero shows forest-cluster/group-shot clumps. The curation Jacob expected (removing group-shot/forest variants — `arborist/split-group-shots.js`, `ROSTER-COVERAGE.md:143` flags `acer_saccharum` as the old 17-trunk forest) **didn't land in the roster.** Separate arborist-side thread.

---

## Gotchas — don't relearn these (dev-workflow, cost us round-trips)

- **`useTreeAtlas` caches per-look in module memory** (`treeAtlasMaterial.js:24`) — it will NOT re-fetch a re-baked atlas within a session. After a Grove re-bake, a soft reload / HMR keeps the STALE atlas (no `overheadBySpecies`). **Fully close the player tab and open a fresh one** to force a re-fetch.
- **The atlas material compiles once**; a `terrainShader.js` HMR does NOT recompile the cached program (`customProgramCacheKey`). A shader-source fix needs a **hard page reload**, not HMR.
- **HMR lands a beat AFTER a bake** if you click Bake→Slab too fast — the bake then runs the *stale* module. Watch for `[vite] hot updated` appearing *after* your bake log; if so, re-bake.
- **The overhead capture is browser-only** (`OverheadBaker` mounts in the Grove Canvas, one band per frame). The CLI `bake-trees` does NOT run it — only the Grove's Bake→Slab button does.
- **Overhead PNG URLs + `trees.json` are NOT cache-busted** (mesh GLBs append `?v=${atlasVersion}` from the manifest `generatedAt`; overhead + census don't). Fixing this is a candidate for #1.
- **Vite serves `index.html` (HTTP 200) for missing files under `/baked/`** → a 404 reads as `Unexpected token '<'`, not a clean 404.
