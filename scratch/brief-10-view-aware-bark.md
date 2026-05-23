# Brief 10 — View-aware bark rendering (aerial / hero / street tiers)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

This is a **larger brief** (~600-800 LOC across bake-look, atlas-survey, treeAtlasMaterial, plus a new extraction script). Internally sub-phased into four shippable stages — see "Sub-phasing" below. You can ship sub-phase A in isolation and stop for operator review before continuing.

## Where you are in the Salon arc

You're joining the Salon arc in the Arborist helper. The arc has shipped a deep authoring stack across chassis, bark, and leaves; Briefs 5 (vendor leaves), 2.1 (bark luminance), 2.1a (bark detail), 7 (preview atlas), 8 (canary setter), 9 (wind wiring) are recently shipped or in flight.

**Doctrine you're operating within:**
- **Cousin-swap thesis** — chassis is wood-only; bark and leaves come from species-agnostic libraries
- **Single shader program** — Bloom stability; uniform-driven branches only
- **Single atlas binding** — one master `trees-atlas-color.png` per Look; this brief extends to three tile classes per tier
- **Salon preview ≡ baked output, live** — all three tiers must be authorable in Salon and visible in preview, not only post-bake at LS
- **`project_view_aware_baking`** — kit-wide doctrine: Browse/Hero/Street views need different baked artifacts, not LoD tiers off one bake. READ THIS MEMORY IN FULL before drafting code.

## Operator vision (read before drafting code)

The operator articulated this 2026-05-22, paraphrased:

> *"For overhead shots we don't need bark, for hero shots we see trees straight on so we need as much bark detail as is practical, for street view we use the whole industrial strength texture pack. The posterized image layered with high-pass should give visual parity at medium distance while keeping the file very small. The gradient across all color channels might actually be a great feature for the trees overhead — we don't cull the geometry, we just change to a much simpler shader."*

Three view tiers, three shader complexities, **same mesh at all tiers** (parallax matters at aerial; trunks are visible from oblique angles even from a few hundred meters up). The "we don't cull, we change shader" insight is the architectural pivot — same `InstancedMesh`, uniform-driven tier selection, three fragment-shader paths.

## Mission

Add **per-view bark shader tiering** to `treeAtlasMaterial.js`. Three tiers, gated by a single `uBarkShaderTier` uniform:

| Tier | Value | Atlas tiles consumed | Fragment path | File budget |
|---|---|---|---|---|
| **Aerial** | 0 | Gradient LUT only (no bark color/normal/detail sample) | Gradient sample at per-vertex world-Y normalized → species color. No bark texture work; pure ramp. | ~zero per-species incremental (LUT already in atlas) |
| **Hero** | 1 | Posterized base + high-pass detail + gradient LUT | Current Brief 2.1 + 2.1a path, but sampling from **posterized** color instead of vendor color | ~1-2MB per bark ref (posterized.png + detail.png) |
| **Street** | 2 | Full vendor PBR (color + normal + roughness + optional displacement) | Full PBR sample, gradient steps aside or layers subtly | Full vendor budget (~10-15MB per ref) |

**Posterization is bake-time pre-processing** — a new `arborist/extract-bark-posterized.mjs` script reads each `<bark>/color.jpg`, applies a sharp quantize step to a configurable level count (default 6), writes `<bark>/posterized.png`. Idempotent (`writeIfChanged` + mtime touch). Same precedent as Cinder's Brief 2.1a `extract-bark-detail.mjs`.

**Tier selection** is operator-controlled via a uniform set externally. For v1.5, ship the tier-selection infrastructure with a single default (hero) and a Stage-debug control to switch. The full cartograph SHOT integration (per-SHOT tier authoring + per-Look default tier) is **deferred to a follow-up brief (Brief 11)** — your work is the Arborist-side runtime + bake-time tier machinery, leaving the tier-uniform's *driver* as a frozen interface for Brief 11 to wire.

## Sub-phasing

This brief sub-phases into four shippable stages. Each sub-phase is a separate commit; ship A, pause for operator review; if green, continue.

### Sub-phase A — Aerial tier infrastructure (~150 LOC)

Stand up the tier-selection mechanism + the aerial fragment path. No new tile classes yet; aerial uses existing gradient LUT.

- Add `uBarkShaderTier` uniform to `treeAtlasMaterial.js` (default 1 = hero, current behavior)
- Add the aerial fragment branch: per-vertex world-Y normalized → gradient sample → `barkColor` (no bark texture sample, no detail, no tint)
- Add `aBarkWorldYNorm` per-vertex attribute computed at runtime-merge time via `InstancedTrees.jsx#stampTreeVertexAttrs` — `(worldY - minY) / (maxY - minY)` per chassis bbox. **This is the `project_runtime_merge_vertex_attributes` pattern Sough established in Brief 9a with `aWindTier`** — your work plugs into the same helper. Salon preview path (post-Brief 7) and LS runtime both see the attribute identically.
- Ship: tier=0 renders aerial path; tier=1 renders current hero path; tier=2 errors out / falls back to tier=1 for now
- Acceptance: operator can flip tier uniform at runtime (Stage debug toggle) and see the bark go from full-detail to gradient-only

### Sub-phase B — Posterization + hero tier substrate swap (~200 LOC)

Build the posterization pre-processing + retarget the hero path's bark color sample from vendor color to posterized substrate.

- New `arborist/extract-bark-posterized.mjs` — `sharp.<color>.posterize(levels: 6).toFile()`. Idempotent. ~60 LOC.
- `arborist/bake-look.js` — extend `unifyAtlases` with a `barkPosterized` sub-page. Same skyline-pack pattern as `barkDetail` (Cinder's precedent). Sha1-dedup across species using same bark ref.
- `bake-look.js` orchestrator — walks roster species, collects `manifest.bark.materialRef`, dedupes, builds posterized sub-atlas.
- Emit `trees-atlas.json#/barkPosterizedBySpecies[<species>] = { uvTransform, barkTileUV }` — mirrors Cinder's `barkDetailBySpecies` shape.
- `treeAtlasMaterial.js` hero fragment path — sample from posterized sub-region instead of full vendor color. Detail overlay (Cinder) composites atop unchanged.
- `InstancedTrees.jsx#applyBarkUniforms` — wire posterized tile uniforms per-draw.
- Acceptance: tier=1 hero renders posterized base + detail overlay + gradient REPLACE. Visual: bark reads as 5-7 discrete luminance bands tinted by gradient palette + high-pass realism on top. File-size delta: hero atlas adds ~1-2MB per bark ref vs current ~10MB+ vendor color path.

### Sub-phase C — Street tier full PBR (~150 LOC)

Wire the street tier's full vendor PBR path. This is mostly plumbing — vendor color + normal are already in the master atlas; roughness map (and optional displacement) need new sub-pages.

- `bake-look.js` — extend `unifyAtlases` with `barkRoughness` sub-page (and `barkDisplacement` if vendor packs ship them — surface what's available in the bark library).
- `treeAtlasMaterial.js` street fragment path — sample full color + normal + roughness from atlas tiles using the **UV-recovery pattern** described in "UV-recovery math" below (Cinder's `uBarkTileOffset/Scale` reuse). Gradient layers subtly or steps aside (operator's call — propose stepping aside at street for full PBR fidelity).
- `InstancedTrees.jsx#applyBarkUniforms` — wire street tile uniforms per-draw.
- Acceptance: tier=2 street renders full PBR. Visual: indistinguishable from raw vendor render at close-up.
- **Atlas footprint budget guard.** Street tier grows the master atlas significantly (~10-15MB per bark ref). At LS scale (~5-10 bark refs in roster) this could push past mobile texture limits (4096×4096 max common; 8192×8192 on newer devices). **Surface BEFORE shipping sub-phase C if the atlas grows past 8192 in any dimension** — don't quietly ship a texture mobile can't load. Operator chooses: down-quality (use lower-resolution roughness/displacement), drop optional textures, or accept device-class limit.

### Sub-phase D — Salon preview parity for tiers (~150 LOC)

Per the doctrine — every tier must be visible in Salon preview at authoring time, not only post-bake.

- `SpecimenViewport.jsx` — add a Stage-debug-style tier selector overlay (3-button: Aerial / Hero / Street), drives `uBarkShaderTier` on the shared `treeAtlasMaterial` mount (post-Brief 7).
- Salon preview atlas (Brief 7's pipeline) — needs to bake all three tier's tiles when applicable. May extend Brief 7's `buildPreviewAtlas()` with a `tier` arg.
- Acceptance: operator authors gradient in Salon → toggles tier selector → sees aerial (gradient-only), hero (gradient + posterized + detail), street (full PBR + gradient) all rendered LIVE in workstage preview.

## Critical architectural notes

### UV-recovery math for posterized + roughness sub-region sampling (LOAD-BEARING)

Per [[feedback_atlas_subregion_uv_recovery]] — caught on Cinder's Brief 2.1a as a near-miss: bark primitives have UVs **rewritten into the bark sub-region** of the unified atlas at bake time. They're NOT in `[0,1]` local UV space; they span only the bark sub-region's UV range (e.g., `[0.02, 0.08] × [0.45, 0.77]` for a typical bark tile).

**Naïve sampling will fail.** If your posterized fragment chunk reads `vec2 pUV = vMapUv * uBarkPosterizedTileScale + uBarkPosterizedTileOffset`, the input `vMapUv` spans only the bark sub-region, so `pUV` lands in a tiny corner of the posterized sub-region instead of spanning it — every fragment samples nearly the same pixel. Visually: posterized tile reads as a flat color. Same trap for roughness (sub-phase C).

**The recovery pattern Cinder shipped** (verified working in Brief 2.1a's bark detail composite):

```glsl
// Recover [0,1] local-UV from vMapUv (which lives in bark's atlas sub-region).
// uBarkTileOffset + uBarkTileScale describe bark's sub-region in atlas space —
// already exists in treeAtlasMaterial.js (shipped by Brief 2.1a).
vec2 localUV = (uBarkTileScale.x > 0.0 && uBarkTileScale.y > 0.0)
  ? (vMapUv - uBarkTileOffset) / uBarkTileScale
  : vec2(0.5);
localUV = fract(localUV);

// Now map local-UV into the posterized (or roughness) sub-region.
vec2 posterizedUV = localUV * uBarkPosterizedTileScale + uBarkPosterizedTileOffset;
vec3 posterizedSample = texture2D(map, posterizedUV).rgb;
```

**Reuse `uBarkTileOffset` + `uBarkTileScale` from Brief 2.1a — same uniforms, same atlas-sub-region semantics.** Don't add new uniforms for bark sub-region; only add for posterized + roughness. The recovery is the producer-side of the bake-rewritten UV path; your fragment chunks are the consumer side.

**Apply identically to:**
- Sub-phase B: posterized sampling
- Sub-phase C: roughness sampling (and displacement if shipped)

If you forget the recovery step, you'll ship near-flat samples and only catch it on operator-eye review. Foreground the math; don't bury it.

### Leaf rendering at aerial tier

`uBarkShaderTier` gates the **bark** fragment path. Leaves render through a different fragment branch (gated by `vBark` per-fragment — already shipped). **At aerial tier, leaves render via their CURRENT path unchanged.** Aerial leaf simplification is a sibling concern (future brief; see Out of Scope).

Concretely in the shader: the `uBarkShaderTier` branch fires only when `vBark > 0.5` (the per-vertex bark gate). For leaf fragments, the branch is bypassed — leaves render via Brief 5's vendor-card-preservation path (and Phase F's eventual gradient/annual-cycle path) regardless of tier.

### Aerial tier — gradient color source

The aerial fragment path samples the gradient LUT at `t = aBarkWorldYNorm`, where `aBarkWorldYNorm` is the per-vertex normalized world-Y across the chassis bbox (trunk base = 0, canopy top = 1). This produces:
- **Bottom-to-top color grade** per tree (trunk dark, canopy light, or reverse — operator-authored via gradient direction)
- **Per-tree variation** rides via `gradientHashAmp` (existing Brief 2.1 mechanism) — same offset trick adds cross-tree color drift at aerial distance

If operator wants flat-color aerial (no vertical grade): the gradient can be authored as a single-color "ramp" (one stop or 2 identical stops) → `t` doesn't matter → uniform tint.

If operator wants different aerial behavior (per-instance only, no per-vertex Y grade): surface the choice, propose alternative shape.

### Posterized substrate — quantization level default

Default: **6 levels** (matches typical posterize aesthetic; 4 levels reads too cartoony, 8+ approaches continuous). Configurable via the extract script's `--levels` arg; operator-tunable per bark ref in future (defer authoring UI).

### Single shader program preserved

All three fragment paths live in `treeAtlasMaterial.js`'s SAME `onBeforeCompile` patch. Uniform-driven branch via `uBarkShaderTier` selects which compiled code runs. **No customProgramCacheKey divergence; no sibling material.** Per `feedback_unique_program_cache_key_before_wrappers`.

Verify via the workstage perf gauge `programs` count — must stay at the current shared-program number across all three tiers.

### Single atlas binding preserved

All new sub-pages (posterized, roughness, possibly displacement) pack into the SAME master `trees-atlas-color.png` (or sibling normal/roughness atlas PNGs that already exist). NO new texture binding. The "single binding" doctrine from `feedback_atlas_subregion_uv_recovery` and the Brief 2.1 / 2.1a precedent holds.

### Bloom stability

Aerial tier is simplest (cheapest fragment work). Hero tier is current Brief 2.1+2.1a (verified Bloom-stable). Street tier samples more textures — verify Bloom on at full street tier renders without flicker. If issue, surface before declaring done.

## Files you'll touch

| File | Status | Sub-phase | ~LOC |
|---|---|---|---|
| `src/components/treeAtlasMaterial.js` | edit — 3 new uniforms + 3 fragment paths gated by `uBarkShaderTier` | A, B, C, D | +120 |
| `src/components/InstancedTrees.jsx` | edit — `applyBarkUniforms` wires per-tier uniforms; extend `stampTreeVertexAttrs` to compute `aBarkWorldYNorm` per-vertex (sibling to Sough's `aWindTier` from Brief 9a — same helper, additional output) | A, B, C | +50 |
| `arborist/extract-bark-posterized.mjs` (new) | new — sharp.posterize pre-processing | B | ~60 |
| `arborist/bake-look.js` | edit — `unifyAtlases` extension for posterized + roughness (+ optional displacement) sub-pages | B, C | +100 |
| `arborist/atlas-survey.js` | edit — classify tiles by tier (posterized, roughness, displacement). **Verify the classifier doesn't double-stamp tiles** — a single bark color tile shouldn't get BOTH `atlasKind: 'bark'` AND a posterized-variant kind. Either extend the classification vocabulary (`'bark-color'`, `'bark-posterized'`, `'bark-roughness'`) OR use a sidecar metadata field. Surface the choice. | B, C | +30 |
| `arborist/salon-preview-atlas.js` (Brief 7's helper) | edit — extend to bake per-tier tiles when applicable | D | +50 |
| `src/arborist/SpecimenViewport.jsx` | edit — tier selector overlay | D | +40 |
| `arborist/FEATURES.md` | edit — Salon Bark section, View-aware bark rendering | all | +40 |
| `arborist/ARCHITECTURE.md` | edit — View-aware bark architecture section (mirrors `project_view_aware_baking`) | all | +60 |
| `arborist/BACKLOG.md` | edit — mark Brief 10 [A/B/C/D] checkboxes | per sub-phase | +15 |
| `arborist/NOTES.md` | edit — session-end entries per sub-phase ship | per sub-phase | ~50 each |

Total: ~600-800 LOC across the brief.

## Acceptance criteria (per sub-phase)

### Sub-phase A acceptance
1. `uBarkShaderTier` uniform initialized to 1 (hero); operator can flip via debug control
2. Tier=0 renders aerial: bark color comes from gradient sampled at per-vertex world-Y normalized; no bark texture sampled
3. Tier=1 renders hero: identical to current Brief 2.1+2.1a behavior (regression check)
4. Single shader program preserved (perf gauge `programs` count unchanged)

### Sub-phase B acceptance
5. `extract-bark-posterized.mjs` runs cleanly; produces `posterized.png` for all 5+ bark refs; idempotent (sha1-stable across runs)
6. `bake-look.js` packs posterized tiles into `trees-atlas-color.png`; emits `barkPosterizedBySpecies`
7. Tier=1 hero now reads posterized substrate; visual: bark shows 5-7 distinct luminance bands tinted by gradient palette; detail overlay (Cinder) intact atop
8. Atlas grows by ~1-2MB per bark ref vs current Brief 2.1+2.1a baseline; quantify
9. Single atlas binding preserved (no new texture files; growth happens INSIDE the master PNG)

### Sub-phase C acceptance
10. `bake-look.js` packs roughness (+ optional displacement) tiles
11. Tier=2 street renders full vendor PBR; visually equivalent to a raw render of the vendor texture pack at close-up
12. Atlas grows to full vendor budget for street tier (~10-15MB per bark ref); quantify
13. Bloom stable across all three tiers at runtime

### Sub-phase D acceptance
14. Salon workstage shows tier selector overlay (3 buttons or equivalent)
15. Selecting Aerial/Hero/Street in Salon → preview viewport renders that tier LIVE, no bake/reload
16. Determinism: same composition + same tier selection → byte-identical preview atlas + GLB across runs

## Approach guidance

- **Read `project_view_aware_baking` end-to-end first.** This brief IS that doctrine applied to the bark surface. The memory entry sketches the architecture; you're implementing.
- **Cinder's Brief 2.1a is the structural precedent.** Detail map extraction + sub-atlas page + `applyBarkUniforms` extension + manifest emission. Mirror that pattern for posterized + roughness.
- **Sub-phase A first; STOP and surface for operator review BEFORE B.** The tier-selection mechanism is the load-bearing abstraction; if its shape needs to differ from this brief's sketch, find out before committing 600 LOC to it.
- **Per-vertex `aBarkWorldYNorm`** is baked at runtime-merge time via `InstancedTrees.jsx#stampTreeVertexAttrs`, NOT at publish-glb time. **Read `project_runtime_merge_vertex_attributes` first** — Sough's Brief 9a established the pattern with `aWindTier`; your work extends `stampTreeVertexAttrs` to also compute `aBarkWorldYNorm` per-vertex. Per-chassis bbox normalization. One implementation; both Salon preview (post-Brief 7) and LS runtime see identical values. Mirrors how `aBark` (existing) and `aWindTier` (Sough) are baked. Cheap.
- **Don't add `customProgramCacheKey`** to differentiate tiers. The uniform branch IS the differentiation. Verify the same compiled program serves all three tiers via the perf gauge.
- **Brief 7 must land first.** This brief assumes `SpecimenViewport.jsx` mounts `treeAtlasMaterial.js` directly (Brief 7's deliverable). If Brief 7 isn't shipped when you pick this up, escalate to operator.
- **The "gradient steps aside at street" call**: propose the operator's read here. Two paths: (a) street tier renders pure PBR with no gradient layer (clean PBR fidelity), or (b) street tier composites gradient subtly on top of PBR (consistent palette across tiers). Default to (a); operator can override.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- Posterization quantize-level default (6) reads too cartoony or too photorealistic — surface visual + suggest alternative
- Vendor bark packs ship roughness/displacement OR don't (some refs may only have color+normal) — surface library coverage gap, propose fallback (e.g., constant roughness for refs lacking maps)
- `aBarkWorldYNorm` per-vertex attribute conflicts with existing per-vertex attributes in the chassis GLB
- Tier selection at runtime needs per-instance variation (e.g., trees near the camera at street tier, trees far at hero) — this is a future LoD-style brief but worth flagging
- Atlas growth from sub-phases B+C combined exceeds expected budget at LS scale
- Bloom drift at any tier
- Cartograph SHOT integration (Brief 11 future) has constraints that should inform this brief's tier-uniform shape

Surface in status update AND commit body. Don't quietly extend scope.

## Out of scope

- **Cartograph SHOT integration** — Brief 11 future. The tier uniform is a frozen interface this brief publishes; cartograph wires the driver later. Don't bake cartograph-side wiring into this brief.
- **Per-instance tier selection** (different trees at different tiers within one frame) — v1.6+; LoD-style; this brief ships scene-wide tier selection
- **Distance-based auto-tier-selection** at runtime — defer to Brief 11 or its sibling
- **Aerial leaf rendering** — leaves are leaf-card-driven independently; this brief touches bark only. Aerial leaf simplification is a sibling concern.
- **LoD interaction** (Brief 6 decimation + Configuration D runtime) — orthogonal. Tier changes shader; LoD changes mesh. Compose orthogonally.
- **Per-Look bark library overrides** — operator picks Bark003 vs Bark007 per composition; that's existing Salon authoring. This brief doesn't add per-Look tier defaults (Brief 11 does).
- **Audio per tier** — Audiologist (future helper)
- **Anything in `meteorologist/`** or other helpers

## Memory refs

Read at session start:
- `project_view_aware_baking` (LOAD-BEARING; READ END-TO-END)
- `project_runtime_merge_vertex_attributes` (LOAD-BEARING for sub-phase A — Sough's Brief 9a established this pattern with `aWindTier`; your `aBarkWorldYNorm` plugs into the same `stampTreeVertexAttrs` helper)
- `feedback_salon_preview_is_authoring_surface` (Salon parity doctrine; Sub-phase D)
- `feedback_unique_program_cache_key_before_wrappers` (Bloom-stability)
- `feedback_atlas_subregion_uv_recovery` (UV-region producer-consumer pattern)
- `feedback_geometry_briefs_need_artifact_inspection` (pre-code grep: check if any tier-selection infrastructure exists in nascent form before assuming greenfield — sibling to Sough's catch on Brief 9a)
- `feedback_baby_briefs_need_identity_framing` (you are the baby; identity first)
- `feedback_baby_must_surface_scope_drift` (see above)
- `feedback_spec_compression` (don't auto-compress the three-tier architecture into two; surface translations)

## After you ship (per sub-phase)

Commit body per sub-phase ship:
- Lead with one sentence summarizing what the sub-phase delivered
- Reference Brief 10 [Sub-phase A/B/C/D] (this doc)
- List files touched + LOC delta
- Acceptance-criteria checklist with status per item in that sub-phase
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Pause for operator review after each sub-phase before continuing.

After the full brief lands, the bark architecture is view-aware end-to-end: aerial reads as gradient grade with parallax, hero reads as posterized + detail at small file budget, street reads as full PBR. Cartograph's SHOT system wires the tier per Look in Brief 11.

Welcome to the Phase V territory. This is the foundational view-aware brief; the leaf side mirrors after.
