# Brief 7 — Salon Preview Atlas (preview-renders-through-treeAtlasMaterial)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

## Where you are in the Salon arc

You're joining an in-flight project — the **Salon arc** in the Arborist helper. The Salon is the operator's compose-not-synthesize authoring surface for trees: operator picks chassis + bark + leaves from libraries, publishes a per-species composition, runtime renders it across LS placements.

**Recent shipped briefs:**

| Brief | Baby | What |
|---|---|---|
| Brief 0 | Whittle | Vendor stock survey + chassis library (`public/trees/_chassis/`) |
| Brief 1 | Sequoia | Salon workstage stand-up |
| Brief 1.5a-e | Sequoia/Quill/Riven/Fern | Visible-quality, curation, bundle-aware de-leaf, 10-pack leaf library |
| Brief 2 | Holm | Multi-stop gradient bark + LUT bake + atlas integration |
| Brief 2.1a | Cinder | Bark detail-texturing Overlay composite |
| Brief 2.1c | Sorrel | leafAttachmentTags world-space contract |
| Brief 5 | Tendril | Vendor-leaf preservation + cousin-swap pivot |
| Brief 2.1 | Birch | Bark gradient luminance REPLACE semantics (interim chunk-replication in SpecimenViewport — your job is to retire it) |

**Doctrine you're operating within:**
- **Cousin-swap thesis** — chassis is wood-only skeleton; bark and leaves come from species-agnostic libraries the operator picks
- **Single shader program** — Bloom requires every tree-material variant to compile to the same WebGLProgram
- **Single atlas binding** — every tile (bark color, normal, gradient LUT, bark detail, leaf shape) packs into one master `trees-atlas-color.png`
- **Salon preview IS the published artifact, rendered live** — per the doctrine entry in `ARCHITECTURE.md` ("Salon preview ↔ LS runtime material parity"), the Salon workstage authoring surface must render through the SAME material as the LS runtime. No daylight. This brief is the architectural commitment that doctrine demands.

**What's currently broken** that motivates this brief:

Brief 2.1 (Birch) shipped the gradient luminance REPLACE semantics in `treeAtlasMaterial.js`. To make the effect visible in the Salon workstage preview (the authoring surface), Birch replicated the gradient fragment chunk into `SpecimenViewport.jsx`'s raw-GLB-material `onBeforeCompile` patches as a temporary measure. That's drift — two implementations of the same logic that must stay synchronized forever, and the first divergent edit breaks parity.

Your brief retires the drift. After this lands, `SpecimenViewport.jsx` mounts `treeAtlasMaterial.js` directly with workstage-context overrides, and the interim chunk-replication from Brief 2.1 goes away. One implementation, end-to-end.

## Birch's handoff observations (2.1 → 7)

Birch (Brief 2.1, just shipped) left specific pointers for you. Read these before you dive in:

1. **The interim chunks are doctrine-aware and grep-able.** Birch comment-flagged the gradient injection sites in `SpecimenViewport.jsx` with explicit "retired by Brief 7" markers, AND the helper they added (`buildGradientLUT` in SpecimenViewport context). Grep `'retired by Brief 7'` to find the deletion targets fast. Specifically: the `gradientUniformsRef`, the bark-only `!isLeaf` branch, and the vertex/fragment chunks for `vSalonWorldXZ` all need to go.

2. **Chassis GLB UVs are vendor-native — different shape than runtime GLBs.** `bake-look.js`'s existing UV-rewrite path runs on GLBs that have already been through `publish-glb`'s atlas-survey-friendly material naming. Your preview atlas needs to rewrite UVs on chassis GLBs at `public/trees/_chassis/<name>.glb` that **haven't been through that intermediate step**. When you extract the UV-rewrite helper from bake-look, verify it handles BOTH input shapes (vendor-native AND publish-glb-staged) — or add a small adapter for the chassis case. Surface this when you find it.

3. **Recommended manifest shape: build a preview-shaped manifest, reuse `applyBarkUniforms` unchanged.** Salon authors `bark.gradientStops` + `bark.gradientHashAmp` in compositions.json. `applyBarkUniforms` reads `barkBySpecies` + `barkGradientByVariant` from the runtime manifest. Brief 2.1's `patchManifestForSalon` already does that composition→manifest translation. A `buildPreviewManifest(composition)` helper that mirrors `patchManifestForSalon`'s output shape gives you zero-schema-gymnastics reuse of `applyBarkUniforms`. Option (a) from "Approach guidance" below — Birch recommends it; take it.

4. **gradientHashAmp propagation is precedent.** Birch added `gradientHashAmpByRef` in Brief 2.1 as scope drift (the slot ride alongside the LUT tile uvTransform in trees-atlas.json). Your preview manifest does the exact same thing — one slot per composition, hashAmp rides on the gradient slot. No new mechanism needed.

5. **Sha1-determinism in `generate-salon` is verified.** Birch tested same-composition → byte-identical published GLB across two `generate-salon.js --species` runs (sha1 `27488413…30a` matches). Acceptance criterion 8 (determinism) has working precedent — your preview atlas should inherit the same input→output stability.

These notes are Birch's handoff. Don't re-derive them.

## Mission

Build the **Salon-side preview atlas pipeline** so `SpecimenViewport.jsx` can render the in-flight chassis GLB through `treeAtlasMaterial.js` directly. On each composition overlay POST (chassis swap, bark-ref swap, leaf-pack swap, gradient-stop edit, tintBase edit, etc.), the server builds a single-composition atlas + UV-rewritten chassis GLB to a temp dir, which the workstage fetches and renders.

This is bake-look-lite per-composition, scoped narrowly:
- One composition's atlas (NOT per-Look master atlas) — one bark color tile, one bark normal tile, one bark gradient LUT, one bark detail tile, one leaf shape tile
- UV rewrite on the chassis GLB to point bark+leaf primitives into atlas sub-regions
- Server caches: rebuild atlas only when underlying tiles change (chassis swap, bark-ref swap, leaf-pack swap); gradient-stops-only edits should re-bake the LUT tile in-place without re-surveying the full atlas

End state: operator edits gradient stops in Salon → sees the gradient effect live in the preview viewport — no bake-and-reload, no chunk replication, single material.

## Architecture

### The pipeline shape

```
Salon Workstage operator edits composition
       ↓
POST /api/arborist/salon/<species>/compositions
       ↓ (existing persistence path)
overlay updated on disk
       ↓ (NEW)
POST /api/arborist/salon/<species>/<slot>/preview-atlas
       ↓ build single-composition atlas + UV-rewritten chassis GLB
       ↓ writes to arborist/state/.preview-atlas-cache/<species>/<slot>/
       ↓ returns paths to atlas + GLB
SpecimenViewport fetches both
       ↓ mounts
treeAtlasMaterial with workstage uniforms applied
```

### Two rebuild tiers (performance)

**Full rebuild** (slow path, ~hundreds of ms): when chassis, bark-ref, leaf-pack, or per-bark configuration changes. Runs:
1. Read chassis GLB + bark color/normal/detail PNGs + leaf shape PNG
2. Atlas-survey: classify tiles, sha1 (no dedup needed within a single composition — keep for symmetry with bake-look)
3. Bake atlas pages (color + normal) via skyline pack
4. Compile gradient LUT from `composition.bark.gradientStops`
5. Bake detail tile from `<bark>/detail.png`
6. Unify pages into one master PNG (same as `bake-look.js#unifyAtlases`, smaller scale)
7. Rewrite UVs on the chassis GLB to point bark + leaf primitives into the atlas sub-regions
8. Emit JSON manifest (mirrors `trees-atlas.json` shape but single-composition)
9. Write atlas PNG + UV-rewritten GLB to `arborist/state/.preview-atlas-cache/<species>/<slot>/`

**Gradient-tile rebuild** (fast path, ~tens of ms): when ONLY `gradientStops` or `gradientHashAmp` changes. Same atlas dimensions, same sub-region offsets — only the LUT tile bytes change. Re-compile the LUT, splice into the existing atlas PNG via `sharp.composite`, write GLB unchanged. This optimization is what makes gradient authoring feel live.

Detection: server compares the previous overlay snapshot against the current; if only gradient fields differ, fast path. Otherwise full path.

### SpecimenViewport rewire

`SpecimenViewport.jsx` currently:
- Loads chassis GLB via `useGLTF`
- Patches the loaded GLB's materials via `onBeforeCompile` for wind + (interim) Brief 2.1 gradient chunks

After your brief:
- Fetches both the preview atlas PNG and the UV-rewritten chassis GLB from `arborist/state/.preview-atlas-cache/<species>/<slot>/`
- Mounts `treeAtlasMaterial.js` instead of patching raw GLB materials. The treeAtlasMaterial takes the preview-atlas PNG as its `map`, and applies workstage uniforms (composition-derived: bark.tintBase, bark.uvScale, gradient LUT tile coords, detail tile coords, etc.) via a workstage-context version of `applyBarkUniforms`
- Keeps wind chunks via a separate `onBeforeCompile` patch on `treeAtlasMaterial` (workstage-only — wind has no LS counterpart yet per Phase W; chunks stay in `SpecimenViewport.jsx`'s patch path)
- Removes the Brief 2.1 interim gradient-chunk-replication entirely (the gradient now fires through the shared treeAtlasMaterial)

### Wind chunks: kept where they are, marked for Brief 9a retirement

Wind is genuinely workstage-only today — Phase W (production wind in `treeAtlasMaterial.js`) is unshipped. The wind chunks in `SpecimenViewport.jsx`'s `onBeforeCompile` are not drift; they're a workstage-only feature. Keep them.

**However: mark them explicitly for Brief 9a retirement.** Brief 9a promotes wind chunks from SpecimenViewport patches → `treeAtlasMaterial.js` as a uniform-gated branch. Apply the same comment-flag convention Birch used for the gradient interim chunks: add `// retired by Brief 9a` markers at every wind-chunk-related call site (the helper, the onBeforeCompile injection, the uniform setup). Brief 9a's baby will grep for those markers.

Without these markers, Brief 9a's baby has to re-derive the deletion targets. With them, it's a grep-and-delete operation.

### Server endpoint

New endpoint in `arborist/serve.js`:

```
POST /api/arborist/salon/:species/:slot/preview-atlas
  ↓ reads current composition state from arborist/state/<species>/compositions.json
  ↓ builds preview atlas (full or fast path per change detection)
  ↓ returns { atlas: "/preview-atlas/<species>/<slot>/atlas.png",
              glb:   "/preview-atlas/<species>/<slot>/chassis.glb",
              manifest: { ...single-composition trees-atlas.json shape... },
              path:  "full" | "gradient-only" }
```

GET endpoint for the static assets:

```
GET /preview-atlas/:species/:slot/atlas.png
GET /preview-atlas/:species/:slot/chassis.glb
```

Both served from the `arborist/state/.preview-atlas-cache/` directory.

### Per-composition isolation

Each `(species, slot)` pair gets its own preview directory. Multiple workstage tabs editing different compositions don't collide. Cleanup is on server restart for now (LRU eviction is v1.6).

## Files you'll touch

1. **`arborist/serve.js`** — new `POST /salon/:species/:slot/preview-atlas` endpoint + GET handlers for `/preview-atlas/<species>/<slot>/{atlas.png,chassis.glb}`. Reads composition state, dispatches to the new build helper. (+80 LOC)

2. **`arborist/salon-preview-atlas.js`** (new) — the build helper. Exports `buildPreviewAtlas({species, slot, prevSnapshot}) → {atlas, glb, manifest, path}`. Internally splits to full vs gradient-only path. Uses `sharp` + `gltf-transform` from the existing dependency surface. (~400 LOC)

3. **`src/arborist/SpecimenViewport.jsx`** — rewire to fetch + mount treeAtlasMaterial. Remove Brief 2.1's interim chunk-replication for gradient. Keep wind chunks intact (workstage-only, not drift). (~-30 LOC chunk-removal, +50 LOC treeAtlasMaterial mounting + uniform plumbing)

4. **`src/arborist/stores/useArboristStore.js`** — extend the existing composition overlay POST to also fire the preview-atlas rebuild and update the local atlas+glb URLs. (+30 LOC)

5. **`arborist/ARCHITECTURE.md`** — update the "Salon preview ↔ LS runtime material parity" section to mark the architecture shipped; remove the "preview path is the gap" framing. (+20 LOC, -10 LOC)

6. **`arborist/NOTES.md`** — dated session-end entry under your name. (~50 LOC)

7. **`arborist/BACKLOG.md`** — mark Brief 7 shipped, remove the "Brief 2.1 interim drift" caveat. (~10 LOC)

## Acceptance criteria

1. **Salon preview shows Brief 2.1's gradient REPLACE semantics live.** Toggle "Use gradient" in the Salon UI, edit stops, see the trunk's color change in the preview viewport — no Adopt, no republish, no LS reload. The visible behavior matches Brief 2.1's red→blue smoke test: saturated red+blue dominant on a brown bark ref (NOT brownish-red/brownish-blue tinting).
2. **Single material implementation.** `grep -r 'gradient\|barkColor\|uUseBarkGradient' src/arborist/SpecimenViewport.jsx` returns NO matches (or only comments). The gradient chunk lives in `treeAtlasMaterial.js` only. Birch's interim chunk-replication is retired.
3. **Wind chunks preserved.** Wind toggle still works in the Salon viewport (wind chunks intact in `SpecimenViewport.jsx`'s onBeforeCompile patches).
4. **Single shader program.** Workstage perf gauge shows `programs` count unchanged (~11 expected). No new compiled programs introduced.
5. **Single atlas binding.** The preview path uses ONE `treeAtlasMaterial`-bound atlas texture; no auxiliary textures bound separately.
6. **Performance — full rebuild.** Atlas rebuild on chassis/bark-ref/leaf-pack change completes in <1s (per Birch's estimate of "hundreds of ms"). Acceptable for those-tier changes (operator already pauses on those edits).
7. **Performance — gradient-only edit.** Gradient-stop edits trigger fast-path rebuild (LUT-tile-only) in <200ms. Operator's gradient authoring feels live.
8. **Determinism.** Same composition snapshot → byte-identical preview atlas + GLB across two builds. sha1sum both, verify.
9. **Per-composition isolation.** Two compositions edited concurrently (e.g., two browser tabs) produce independent preview directories under `arborist/state/.preview-atlas-cache/<species>/<slot>/`; no collision.
10. **LS Stage path untouched.** `node arborist/bake-look.js --look lafayette-square` runs unchanged; `trees-atlas.json` byte-identical before/after Brief 7; no regression on production rendering.
11. **All other Brief 2.1 effects fire live in preview.** Verify each independently so partial regressions are catchable:
    - 11a. Gradient hash amp (cross-tree variation slider) — slider drives `uBarkGradientHashAmp`; live update
    - 11b. Detail layer (Cinder Brief 2.1a) — Overlay composite visible on top of gradient base; live
    - 11c. Bark tint base (legacy single-tint path) — colorpicker drives `uBarkTintBase`; live
    - 11d. Leaf pack swap — dropdown change updates leaf material's bound texture; live
    - 11e. Leaf tile randomization (Brief 5) — per-card random tile from `tileGrid`; live (re-randomizes on chassis swap, stays on gradient edits)
    - 11f. Leaves on/off toggle (Brief 5) — preview-only, doesn't affect publish
12. **Doctrine commit.** `arborist/ARCHITECTURE.md`'s "Salon preview ↔ LS runtime material parity" section updates from "doctrine + interim gap" to "doctrine + shipped pattern."

## Approach guidance

- **Reuse `bake-look.js` helpers where possible.** `compileGradientLUT`, `gradientSha1`, `bakeGradientAtlas`, `unifyAtlases` are all in `bake-look.js`. Import them into the preview-atlas builder; don't re-implement. The per-composition atlas is structurally a subset of the per-Look master atlas — same tile classes, same packing algorithm, smaller scale.
- **GLB UV rewrite** — already implemented in `bake-look.js` (the path that rewrites runtime GLB UVs to point into the atlas). Extract to a helper if not already factored. Apply the same logic on the per-composition chassis.
- **Change detection for fast-path.** Compare current overlay JSON against `lastBuiltSnapshot.json` (stored in the preview dir). If diff is limited to `bark.gradientStops` + `bark.gradientHashAmp`, fast path. Otherwise full.
- **treeAtlasMaterial workstage-context — go with option (a) per Birch's handoff.** The runtime `applyBarkUniforms(material, barkSettings, gradientSlot)` reads per-variant slots keyed by `(urlToSpecies, urlToVariantId)`. Birch's recommendation (and Boz's): generate a preview-shaped manifest that conforms to the existing `barkBySpecies` + `barkGradientByVariant` shape, with one entry per composition. Reuse `applyBarkUniforms` unchanged. `patchManifestForSalon` (which Birch extended for Brief 2.1) is the precedent — write a sibling `buildPreviewManifest(composition)` helper that mirrors its output. Zero schema gymnastics.
- **Atlas size for preview.** The LS master atlas is sized for ~30 species. Preview atlas is one composition — far smaller. Size the atlas page to whatever fits the single composition's tiles plus generous padding. Don't pre-allocate LS master dimensions.
- **Cleanup of preview cache — use a repo-relative path.** `os.tmpdir()` semantics vary (macOS dev wipes `/tmp` on reboot; production server may not). **Pin to `arborist/state/.preview-atlas-cache/<species>/<slot>/`** for predictability. Gitignored (precedent: `arborist/state/` already gitignored). Server restart cleanup is optional; the cache is regenerable.
- **Atomicity — write-temp-then-rename, BOTH artifacts.** Write atlas PNG to `atlas.png.tmp` and GLB to `chassis.glb.tmp`; once BOTH writes complete, rename both to their final paths. Workstage fetch should not fire until the POST endpoint returns (the endpoint blocks until both files are renamed). This prevents the workstage reading a half-written atlas or stale GLB.
- **Wind chunks on `treeAtlasMaterial`'s `onBeforeCompile` patch (preview-side).** Brief 7's preview path mounts `treeAtlasMaterial` but the wind chunks are still SpecimenViewport-only (per Brief 9's queue). When the preview path adds `onBeforeCompile` patches for wind chunks atop `treeAtlasMaterial`, **chain the patch — call the prior `treeAtlasMaterial.onBeforeCompile` first, then layer the wind patch**, AND extend `customProgramCacheKey` so the wind-patched and non-wind-patched materials don't collide in the program cache. Per `feedback_unique_program_cache_key_before_wrappers`.
- **No client-side image processing.** Server owns the atlas build. Client just fetches finished assets.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- Tile-type categories the per-composition atlas needs but the bake-look master atlas doesn't (or vice versa)
- Performance worse than the brief estimates (sustained >1s on full rebuild, >200ms on gradient-only)
- `treeAtlasMaterial` workstage-context overrides needed that don't fit either `applyBarkUniforms` shape
- Three.js material-mounting subtleties that resist clean swap from raw GLB materials → treeAtlasMaterial
- Race conditions in the overlay POST → preview-atlas rebuild → SpecimenViewport fetch chain
- Bloom interactions discovered along the way

Surface in status update AND commit body. Don't quietly extend scope.

## Out of scope

- **Phase W (production wind) promotion to treeAtlasMaterial** — separate brief; wind chunks stay in `SpecimenViewport.jsx`'s `onBeforeCompile` for now (workstage-only, not drift)
- **LS Stage path changes** — `bake-look.js`, `bake-trees.js`, `InstancedTrees.jsx` runtime untouched. `trees-atlas.json` byte-identical pre/post Brief 7
- **LoD selection at preview time** — preview always renders LoD0
- **Configuration D runtime** (Points + A2C + distance LoD selection) — companion brief after Brief 6 (decimation) lands
- **Brief 6 decimation** — orthogonal; runs at the publish-glb stage, not preview
- **Per-composition annual cycle (Phase F)** — v1.6+
- **Multi-composition preview** (preview the WHOLE species roster at once) — v1.6+
- **LRU eviction of stale `arborist/state/.preview-atlas-cache/` dirs** — v1.6, defer
- **Any work in `meteorologist/` or `cartograph/`**

## Memory refs

Read at session start:
- `feedback_salon_preview_is_authoring_surface` — the doctrine that demands this brief
- `project_preview_equals_ls_literally` — the cartograph-side precedent doctrine you're applying to Arborist
- `project_stage_consumer_parity` — sibling discipline
- `feedback_baby_briefs_need_identity_framing` (you are the baby; identity first)
- `feedback_baby_must_surface_scope_drift` (see above)
- `feedback_atlas_subregion_uv_recovery` — relevant to your UV-rewrite work on the chassis GLB
- `feedback_unique_program_cache_key_before_wrappers` — Bloom-stability constraint
- `project_writeifchanged_touches_mtime` — for the atlas + GLB writes

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 7 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After this lands, the Salon authoring surface is architecturally complete: every effect the LS runtime renders fires live in the Salon preview, with no bake-and-reload required for verification. The operator's authoring loop runs end-to-end inside the Salon, with the bake chain becoming the publish step (slab boundary) rather than the verification step.

Welcome to the Salon arc. You're closing a foundational gap.
